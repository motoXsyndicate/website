const SESSION_COOKIE = "mxs_mxb_session";
const OAUTH_COOKIE = "mxs_mxb_oauth_state";
const JSON_HEADERS = {"Content-Type":"application/json","Cache-Control":"no-store"};

const json = (data, status = 200) => new Response(JSON.stringify(data), {status,headers:JSON_HEADERS});
const error = (message, status = 400) => json({error:message}, status);

function cookieValue(request, name) {
  const match = (request.headers.get("Cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function randomToken(bytes = 32) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...values)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2,"0")).join("");
}

function routeFor(request) {
  return new URL(request.url).pathname.replace(/^\/api\/mxb\/?/, "").replace(/\/$/, "");
}

function requireBindings(env) {
  if (!env.PAINTBALL_DB || !env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) throw new Error("Cloudflare is not configured yet.");
}

function requireSameOrigin(request) {
  if (["GET","HEAD","OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) throw Object.assign(new Error("Invalid request origin."), {status:403});
}

async function body(request) {
  try { return await request.json(); }
  catch { throw new Error("Invalid request."); }
}

async function currentUser(request, env) {
  const token = cookieValue(request,SESSION_COOKIE);
  if (!token) return null;
  return await env.PAINTBALL_DB.prepare(`SELECT u.id,u.discord_id,u.discord_name,u.avatar_url FROM pb_sessions s JOIN pb_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).bind(await sha256(token),new Date().toISOString()).first() || null;
}

async function requireUser(request, env) {
  const user = await currentUser(request,env);
  if (!user) throw Object.assign(new Error("Sign in with Discord to continue."), {status:401});
  return user;
}

async function isAdmin(env, userId) {
  return !!(await env.PAINTBALL_DB.prepare("SELECT 1 FROM pb_admins WHERE user_id=?").bind(userId).first());
}

async function isHost(env, userId) {
  return !!(await env.PAINTBALL_DB.prepare("SELECT 1 FROM mxb_hosts WHERE user_id=?").bind(userId).first());
}

async function requireAdmin(request, env) {
  const user = await requireUser(request,env);
  if (!await isAdmin(env,user.id)) throw Object.assign(new Error("MXS administrator access required."), {status:403});
  return user;
}

async function requireOrganizer(request, env) {
  const user = await requireUser(request,env);
  const [admin,host] = await Promise.all([isAdmin(env,user.id),isHost(env,user.id)]);
  if (!admin && !host) throw Object.assign(new Error("Approved MXB host access required."), {status:403});
  return {...user,isAdmin:admin,isHost:host};
}

async function discordLogin(request, env) {
  const url = new URL(request.url);
  const state = randomToken(24);
  const callback = `${url.origin}/api/mxb/auth/callback`;
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.search = new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,response_type:"code",redirect_uri:callback,scope:"identify",state}).toString();
  return new Response(null,{status:302,headers:{Location:authorize.toString(),"Set-Cookie":cookie(OAUTH_COOKIE,state,600),"Cache-Control":"no-store"}});
}

async function discordCallback(request, env) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!code || !state || state !== cookieValue(request,OAUTH_COOKIE)) return error("Discord sign-in could not be verified.",401);
  const callback = `${url.origin}/api/mxb/auth/callback`;
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code,redirect_uri:callback})});
  if (!tokenResponse.ok) return error("Discord sign-in failed.",401);
  const tokens = await tokenResponse.json();
  const discordResponse = await fetch("https://discord.com/api/users/@me",{headers:{Authorization:`Bearer ${tokens.access_token}`}});
  if (!discordResponse.ok) return error("Discord profile could not be loaded.",401);
  const discord = await discordResponse.json();
  const now = new Date().toISOString();
  const existing = await env.PAINTBALL_DB.prepare("SELECT id FROM pb_users WHERE discord_id=?").bind(discord.id).first();
  const userId = existing?.id || crypto.randomUUID();
  const discordName = discord.global_name || discord.username;
  const avatarUrl = discord.avatar ? `https://cdn.discordapp.com/avatars/${discord.id}/${discord.avatar}.png` : null;
  await env.PAINTBALL_DB.prepare(`INSERT INTO pb_users(id,discord_id,discord_name,avatar_url,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(discord_id) DO UPDATE SET discord_name=excluded.discord_name,avatar_url=excluded.avatar_url,updated_at=excluded.updated_at`).bind(userId,discord.id,discordName,avatarUrl,now,now).run();
  const sessionToken = randomToken(32);
  const sessionHash = await sha256(sessionToken);
  const expires = new Date(Date.now()+30*86400000).toISOString();
  await env.PAINTBALL_DB.batch([
    env.PAINTBALL_DB.prepare("DELETE FROM pb_sessions WHERE expires_at<=?").bind(now),
    env.PAINTBALL_DB.prepare("INSERT INTO pb_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").bind(sessionHash,userId,expires,now)
  ]);
  const headers = new Headers({Location:`${url.origin}/mxb/admin/`,"Cache-Control":"no-store"});
  headers.append("Set-Cookie",cookie(SESSION_COOKIE,sessionToken,2592000));
  headers.append("Set-Cookie",cookie(OAUTH_COOKIE,"",0));
  return new Response(null,{status:302,headers});
}

async function logout(request, env) {
  const token = cookieValue(request,SESSION_COOKIE);
  if (token) await env.PAINTBALL_DB.prepare("DELETE FROM pb_sessions WHERE token_hash=?").bind(await sha256(token)).run();
  return new Response(JSON.stringify({ok:true}),{headers:{...JSON_HEADERS,"Set-Cookie":cookie(SESSION_COOKIE,"",0)}});
}

async function getMe(request, env) {
  const user = await currentUser(request,env);
  if (!user) return json({user:null,isAdmin:false,isHost:false});
  const [admin,host] = await Promise.all([isAdmin(env,user.id),isHost(env,user.id)]);
  return json({user,isAdmin:admin,isHost:host});
}

function cleanText(value, max) { return String(value || "").trim().slice(0,max); }

function validateRound(data) {
  const payload = data.payload;
  if (!payload || payload.type !== "mxs-round-v1" || !Array.isArray(payload.riders) || payload.riders.length > 500) throw new Error("This is not a valid MXS round result.");
  const serialized = JSON.stringify(payload);
  if (serialized.length > 300000) throw new Error("Round result is too large.");
  const id = cleanText(payload.roundId || data.id,180);
  const roundName = cleanText(payload.roundName,100);
  const className = cleanText(payload.className,50);
  if (!id || !roundName || !className) throw new Error("Round name and class are required.");
  return {id,roundName,className,eventInfo:cleanText(payload.eventInfo,160),serialized,published:data.published === false ? 0 : 1};
}

async function rounds(request, env) {
  const organizer = await requireOrganizer(request,env);
  if (request.method === "GET") {
    const query = organizer.isAdmin ? "SELECT r.*,u.discord_name FROM mxb_rounds r JOIN pb_users u ON u.id=r.created_by ORDER BY r.updated_at DESC" : "SELECT r.*,u.discord_name FROM mxb_rounds r JOIN pb_users u ON u.id=r.created_by WHERE r.created_by=? ORDER BY r.updated_at DESC";
    const result = organizer.isAdmin ? await env.PAINTBALL_DB.prepare(query).all() : await env.PAINTBALL_DB.prepare(query).bind(organizer.id).all();
    return json({rounds:result.results.map((row) => ({...row,payload:JSON.parse(row.payload_json),payload_json:undefined}))});
  }
  const data = await body(request);
  if (data.action === "delete") {
    const existing = await env.PAINTBALL_DB.prepare("SELECT created_by FROM mxb_rounds WHERE id=?").bind(cleanText(data.id,180)).first();
    if (!existing) return error("Round not found.",404);
    if (!organizer.isAdmin && existing.created_by !== organizer.id) return error("You can only remove rounds you published.",403);
    await env.PAINTBALL_DB.prepare("DELETE FROM mxb_rounds WHERE id=?").bind(cleanText(data.id,180)).run();
    return json({ok:true});
  }
  const round = validateRound(data);
  const existing = await env.PAINTBALL_DB.prepare("SELECT created_by FROM mxb_rounds WHERE id=?").bind(round.id).first();
  if (existing && !organizer.isAdmin && existing.created_by !== organizer.id) return error("A different host already owns this round.",403);
  const owner = existing?.created_by || organizer.id;
  const now = new Date().toISOString();
  await env.PAINTBALL_DB.prepare(`INSERT INTO mxb_rounds(id,round_name,event_info,class_name,payload_json,published,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET round_name=excluded.round_name,event_info=excluded.event_info,class_name=excluded.class_name,payload_json=excluded.payload_json,published=excluded.published,updated_at=excluded.updated_at`).bind(round.id,round.roundName,round.eventInfo,round.className,round.serialized,round.published,owner,now,now).run();
  return json({ok:true,id:round.id});
}

async function publicRounds(env) {
  const result = await env.PAINTBALL_DB.prepare("SELECT id,round_name,event_info,class_name,payload_json,updated_at FROM mxb_rounds WHERE published=1 ORDER BY updated_at DESC").all();
  return json({rounds:result.results.map((row) => ({id:row.id,roundName:row.round_name,eventInfo:row.event_info,className:row.class_name,updatedAt:row.updated_at,payload:JSON.parse(row.payload_json)}))});
}

async function series(request, env) {
  const organizer = await requireOrganizer(request,env);
  if (request.method === "GET") {
    const query = organizer.isAdmin ? "SELECT s.*,u.discord_name FROM mxb_series s JOIN pb_users u ON u.id=s.created_by ORDER BY s.updated_at DESC" : "SELECT s.*,u.discord_name FROM mxb_series s JOIN pb_users u ON u.id=s.created_by WHERE s.created_by=? ORDER BY s.updated_at DESC";
    const result = organizer.isAdmin ? await env.PAINTBALL_DB.prepare(query).all() : await env.PAINTBALL_DB.prepare(query).bind(organizer.id).all();
    return json({series:result.results.map((row) => ({...row,data:JSON.parse(row.data_json),data_json:undefined}))});
  }
  const data = await body(request);
  const id = cleanText(data.id,180);
  if (data.action === "delete") {
    const existing = await env.PAINTBALL_DB.prepare("SELECT created_by FROM mxb_series WHERE id=?").bind(id).first();
    if (!existing) return error("Championship not found.",404);
    if (!organizer.isAdmin && existing.created_by !== organizer.id) return error("You can only remove championships you created.",403);
    await env.PAINTBALL_DB.prepare("DELETE FROM mxb_series WHERE id=?").bind(id).run();
    return json({ok:true});
  }
  const seriesData = data.data;
  if (!id || !seriesData || !Array.isArray(seriesData.baseline) || typeof seriesData.rounds !== "object") return error("Invalid championship data.");
  const serialized = JSON.stringify(seriesData);
  if (serialized.length > 900000) return error("Championship data is too large.");
  const name = cleanText(seriesData.name,100);
  const className = cleanText(seriesData.className,50);
  if (!name || !className) return error("Series name and class are required.");
  const existing = await env.PAINTBALL_DB.prepare("SELECT created_by FROM mxb_series WHERE id=?").bind(id).first();
  if (existing && !organizer.isAdmin && existing.created_by !== organizer.id) return error("A different host already owns this championship.",403);
  const owner = existing?.created_by || organizer.id;
  const now = new Date().toISOString();
  await env.PAINTBALL_DB.prepare(`INSERT INTO mxb_series(id,series_name,class_name,data_json,published,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET series_name=excluded.series_name,class_name=excluded.class_name,data_json=excluded.data_json,published=excluded.published,updated_at=excluded.updated_at`).bind(id,name,className,serialized,data.published === false ? 0 : 1,owner,now,now).run();
  return json({ok:true,id});
}

async function publicSeries(env) {
  const result = await env.PAINTBALL_DB.prepare("SELECT id,series_name,class_name,data_json,updated_at FROM mxb_series WHERE published=1 ORDER BY updated_at DESC").all();
  return json({series:result.results.map((row) => ({id:row.id,name:row.series_name,className:row.class_name,updatedAt:row.updated_at,data:JSON.parse(row.data_json)}))});
}

async function hosts(request, env) {
  const admin = await requireAdmin(request,env);
  if (request.method === "GET") {
    const result = await env.PAINTBALL_DB.prepare(`SELECT u.id,u.discord_name,COALESCE(p.in_game_name,'') AS in_game_name,CASE WHEN h.user_id IS NULL THEN 0 ELSE 1 END AS is_host,CASE WHEN a.user_id IS NULL THEN 0 ELSE 1 END AS is_admin FROM pb_users u LEFT JOIN pb_profiles p ON p.user_id=u.id LEFT JOIN mxb_hosts h ON h.user_id=u.id LEFT JOIN pb_admins a ON a.user_id=u.id ORDER BY lower(u.discord_name)`).all();
    return json({users:result.results});
  }
  const data = await body(request);
  if (!data.userId || !["approve","revoke"].includes(data.action)) return error("Choose a valid host action.");
  if (data.action === "approve") await env.PAINTBALL_DB.prepare("INSERT OR REPLACE INTO mxb_hosts(user_id,approved_by,approved_at) VALUES(?,?,?)").bind(data.userId,admin.id,new Date().toISOString()).run();
  else await env.PAINTBALL_DB.prepare("DELETE FROM mxb_hosts WHERE user_id=?").bind(data.userId).run();
  return json({ok:true});
}

export async function onRequest({request,env}) {
  try {
    requireBindings(env);
    requireSameOrigin(request);
    const route = routeFor(request);
    if (route === "auth/login" && request.method === "GET") return await discordLogin(request,env);
    if (route === "auth/callback" && request.method === "GET") return await discordCallback(request,env);
    if (route === "auth/logout" && request.method === "POST") return await logout(request,env);
    if (route === "me" && request.method === "GET") return await getMe(request,env);
    if (route === "admin/rounds" && ["GET","POST"].includes(request.method)) return await rounds(request,env);
    if (route === "admin/series" && ["GET","POST"].includes(request.method)) return await series(request,env);
    if (route === "admin/hosts" && ["GET","POST"].includes(request.method)) return await hosts(request,env);
    return error("Not found.",404);
  } catch (caught) {
    return error(caught.message || "Unexpected server error.",caught.status || 500);
  }
}
