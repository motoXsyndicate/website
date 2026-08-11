const SESSION_COOKIE = "mxs_pb_session";
const OAUTH_COOKIE = "mxs_pb_oauth_state";
const JSON_HEADERS = {"Content-Type":"application/json","Cache-Control":"no-store"};

const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers:JSON_HEADERS});
const error = (message, status = 400) => json({error:message}, status);

function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
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
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function routeFor(request) {
  return new URL(request.url).pathname.replace(/^\/api\/paintball\/?/, "").replace(/\/$/, "");
}

function requireBindings(env) {
  if (!env.PAINTBALL_DB || !env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
    throw new Error("Cloudflare is not configured yet.");
  }
}

async function currentUser(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const user = await env.PAINTBALL_DB.prepare(`
    SELECT u.id, u.discord_id, u.discord_name, u.avatar_url
    FROM pb_sessions s JOIN pb_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(tokenHash, new Date().toISOString()).first();
  return user || null;
}

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error("Sign in with Discord to continue."), {status:401});
  return user;
}

async function isAdmin(env, userId) {
  return !!(await env.PAINTBALL_DB.prepare("SELECT 1 FROM pb_admins WHERE user_id = ?").bind(userId).first());
}

async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (!await isAdmin(env, user.id)) throw Object.assign(new Error("Organizer access required."), {status:403});
  return user;
}

async function body(request) {
  try { return await request.json(); }
  catch { throw new Error("Invalid request."); }
}

async function discordLogin(request, env) {
  const url = new URL(request.url);
  const state = randomToken(24);
  const callback = `${url.origin}/api/paintball/auth/callback`;
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.search = new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,response_type:"code",redirect_uri:callback,scope:"identify",state}).toString();
  return new Response(null, {status:302, headers:{Location:authorize.toString(),"Set-Cookie":cookie(OAUTH_COOKIE,state,600),"Cache-Control":"no-store"}});
}

async function discordCallback(request, env) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!code || !state || state !== cookieValue(request, OAUTH_COOKIE)) return error("Discord sign-in could not be verified.", 401);
  const callback = `${url.origin}/api/paintball/auth/callback`;
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code,redirect_uri:callback})
  });
  if (!tokenResponse.ok) return error("Discord sign-in failed.", 401);
  const tokens = await tokenResponse.json();
  const discordResponse = await fetch("https://discord.com/api/users/@me", {headers:{Authorization:`Bearer ${tokens.access_token}`}});
  if (!discordResponse.ok) return error("Discord profile could not be loaded.", 401);
  const discord = await discordResponse.json();
  const now = new Date().toISOString();
  const existing = await env.PAINTBALL_DB.prepare("SELECT id FROM pb_users WHERE discord_id = ?").bind(discord.id).first();
  const userId = existing?.id || crypto.randomUUID();
  const discordName = discord.global_name || discord.username;
  const avatarUrl = discord.avatar ? `https://cdn.discordapp.com/avatars/${discord.id}/${discord.avatar}.png` : null;
  await env.PAINTBALL_DB.prepare(`
    INSERT INTO pb_users (id, discord_id, discord_name, avatar_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET discord_name=excluded.discord_name, avatar_url=excluded.avatar_url, updated_at=excluded.updated_at
  `).bind(userId, discord.id, discordName, avatarUrl, now, now).run();
  const sessionToken = randomToken(32);
  const sessionHash = await sha256(sessionToken);
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  await env.PAINTBALL_DB.batch([
    env.PAINTBALL_DB.prepare("DELETE FROM pb_sessions WHERE expires_at <= ? OR user_id = ?").bind(now, userId),
    env.PAINTBALL_DB.prepare("INSERT INTO pb_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(sessionHash,userId,expires,now)
  ]);
  const headers = new Headers({Location:`${url.origin}/paintball/register/`,"Cache-Control":"no-store"});
  headers.append("Set-Cookie", cookie(SESSION_COOKIE,sessionToken,2592000));
  headers.append("Set-Cookie", cookie(OAUTH_COOKIE,"",0));
  return new Response(null, {status:302, headers});
}

async function logout(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await env.PAINTBALL_DB.prepare("DELETE FROM pb_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return new Response(JSON.stringify({ok:true}), {headers:{...JSON_HEADERS,"Set-Cookie":cookie(SESSION_COOKIE,"",0)}});
}

async function getMe(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({user:null,profile:null,isAdmin:false});
  const [profile, admin] = await Promise.all([
    env.PAINTBALL_DB.prepare("SELECT in_game_name, rules_accepted_at, active FROM pb_profiles WHERE user_id = ?").bind(user.id).first(),
    isAdmin(env,user.id)
  ]);
  return json({user,profile:profile || null,isAdmin:admin});
}

async function saveProfile(request, env) {
  const user = await requireUser(request, env);
  const data = await body(request);
  const name = String(data.inGameName || "").trim();
  if (name.length < 2 || name.length > 40) return error("In-game name must be between 2 and 40 characters.");
  if (data.rulesAccepted !== true) return error("You must accept the rulebook.");
  const now = new Date().toISOString();
  await env.PAINTBALL_DB.prepare(`
    INSERT INTO pb_profiles (user_id,in_game_name,rules_accepted_at,active,created_at,updated_at)
    VALUES (?,?,?,1,?,?)
    ON CONFLICT(user_id) DO UPDATE SET in_game_name=excluded.in_game_name,rules_accepted_at=excluded.rules_accepted_at,active=1,updated_at=excluded.updated_at
  `).bind(user.id,name,now,now,now).run();
  return json({ok:true});
}

async function currentEvent(request, env) {
  const user = await requireUser(request, env);
  const event = await env.PAINTBALL_DB.prepare(`
    SELECT id,title,starts_at,check_in_closes_at,status FROM pb_events
    WHERE status IN ('check_in_open','check_in_closed','teams_generated','teams_published')
    ORDER BY starts_at LIMIT 1
  `).first();
  if (!event) return json({event:null,checkedIn:false,assignment:null});
  const checkedIn = !!(await env.PAINTBALL_DB.prepare("SELECT 1 FROM pb_check_ins WHERE event_id=? AND user_id=?").bind(event.id,user.id).first());
  let assignment = null;
  if (event.status === "teams_published") assignment = await env.PAINTBALL_DB.prepare("SELECT team_number,is_reserve FROM pb_assignments WHERE event_id=? AND user_id=?").bind(event.id,user.id).first();
  return json({event,checkedIn,assignment:assignment || null});
}

async function checkIn(request, env) {
  const user = await requireUser(request, env);
  const data = await body(request);
  const profile = await env.PAINTBALL_DB.prepare("SELECT active FROM pb_profiles WHERE user_id=?").bind(user.id).first();
  if (!profile?.active) return error("Complete your player registration before checking in.");
  const event = await env.PAINTBALL_DB.prepare("SELECT * FROM pb_events WHERE id=?").bind(data.eventId).first();
  const now = new Date();
  if (!event || event.status !== "check_in_open") return error("Check-in is not open for this event.");
  if (now < new Date(event.check_in_opens_at) || now > new Date(event.check_in_closes_at)) return error("This event is outside its check-in window.");
  await env.PAINTBALL_DB.prepare("INSERT OR IGNORE INTO pb_check_ins(event_id,user_id,checked_in_at) VALUES (?,?,?)").bind(event.id,user.id,now.toISOString()).run();
  return json({ok:true});
}

async function adminEvents(request, env) {
  const admin = await requireAdmin(request, env);
  if (request.method === "GET") {
    const result = await env.PAINTBALL_DB.prepare(`SELECT e.*,COUNT(c.user_id) AS check_in_count FROM pb_events e LEFT JOIN pb_check_ins c ON c.event_id=e.id GROUP BY e.id ORDER BY e.starts_at DESC LIMIT 20`).all();
    return json({events:result.results});
  }
  const data = await body(request);
  if (!data.title || !data.startsAt || !data.opensAt || !data.closesAt) return error("Complete every event field.");
  if (!(new Date(data.opensAt) < new Date(data.closesAt) && new Date(data.closesAt) <= new Date(data.startsAt))) return error("Check-in must open before it closes, and close before the event starts.");
  await env.PAINTBALL_DB.prepare("INSERT INTO pb_events(id,title,starts_at,check_in_opens_at,check_in_closes_at,status,created_by,created_at) VALUES (?,?,?,?,?,'draft',?,?)").bind(crypto.randomUUID(),String(data.title).slice(0,100),data.startsAt,data.opensAt,data.closesAt,admin.id,new Date().toISOString()).run();
  return json({ok:true});
}

function shuffle(players) {
  const values = [...players];
  for (let i = values.length - 1; i > 0; i--) {
    const sample = new Uint32Array(1); crypto.getRandomValues(sample);
    const j = sample[0] % (i + 1); [values[i],values[j]] = [values[j],values[i]];
  }
  return values;
}

async function adminAction(request, env) {
  await requireAdmin(request, env);
  const {eventId,action,teamSize} = await body(request);
  const event = await env.PAINTBALL_DB.prepare("SELECT * FROM pb_events WHERE id=?").bind(eventId).first();
  if (!event) return error("Event not found.",404);
  if (["open","close","publish"].includes(action)) {
    const next = {open:"check_in_open",close:"check_in_closed",publish:"teams_published"}[action];
    if (action === "publish" && !(await env.PAINTBALL_DB.prepare("SELECT 1 FROM pb_assignments WHERE event_id=?").bind(eventId).first())) return error("Generate teams before publishing them.");
    await env.PAINTBALL_DB.prepare("UPDATE pb_events SET status=? WHERE id=?").bind(next,eventId).run();
    return json({ok:true});
  }
  if (action !== "generate") return error("Unknown organizer action.");
  if (!["check_in_closed","teams_generated"].includes(event.status)) return error("Close check-in before generating teams.");
  if (!Number.isInteger(teamSize) || teamSize < 4 || teamSize > 6) return error("Choose a team size between 4 and 6 players.");
  const checked = await env.PAINTBALL_DB.prepare("SELECT user_id FROM pb_check_ins WHERE event_id=?").bind(eventId).all();
  if (checked.results.length < teamSize * 2) return error(`At least ${teamSize * 2} checked-in players are required for ${teamSize}v${teamSize}.`);
  const players = shuffle(checked.results);
  const fullCount = Math.floor(players.length / teamSize) * teamSize;
  const generationRow = await env.PAINTBALL_DB.prepare("SELECT COALESCE(MAX(generation),0)+1 AS generation FROM pb_assignments WHERE event_id=?").bind(eventId).first();
  const generation = generationRow.generation;
  const statements = [env.PAINTBALL_DB.prepare("DELETE FROM pb_assignments WHERE event_id=?").bind(eventId)];
  players.forEach((player,index) => statements.push(env.PAINTBALL_DB.prepare("INSERT INTO pb_assignments(event_id,user_id,team_number,is_reserve,generation,assigned_at) VALUES (?,?,?,?,?,?)").bind(eventId,player.user_id,index < fullCount ? Math.floor(index/teamSize)+1 : null,index >= fullCount ? 1 : 0,generation,new Date().toISOString())));
  statements.push(env.PAINTBALL_DB.prepare("UPDATE pb_events SET status='teams_generated' WHERE id=?").bind(eventId));
  await env.PAINTBALL_DB.batch(statements);
  return json({ok:true,playerCount:players.length,generation,teamSize});
}

async function adminTeams(request, env) {
  await requireAdmin(request, env);
  const eventId = new URL(request.url).searchParams.get("eventId");
  const result = await env.PAINTBALL_DB.prepare(`SELECT a.team_number,a.is_reserve,a.generation,p.in_game_name,u.discord_name FROM pb_assignments a JOIN pb_profiles p ON p.user_id=a.user_id JOIN pb_users u ON u.id=a.user_id WHERE a.event_id=? ORDER BY a.is_reserve,a.team_number,p.in_game_name`).bind(eventId).all();
  return json({assignments:result.results});
}

async function adminPlayers(request, env) {
  await requireAdmin(request, env);
  const result = await env.PAINTBALL_DB.prepare(`SELECT p.in_game_name,p.active,p.created_at,u.discord_name FROM pb_profiles p JOIN pb_users u ON u.id=p.user_id ORDER BY lower(p.in_game_name)`).all();
  return json({players:result.results});
}

export async function onRequest(context) {
  const {request,env} = context;
  try {
    requireBindings(env);
    const route = routeFor(request);
    if (route === "auth/login" && request.method === "GET") return discordLogin(request,env);
    if (route === "auth/callback" && request.method === "GET") return discordCallback(request,env);
    if (route === "auth/logout" && request.method === "POST") return logout(request,env);
    if (route === "me" && request.method === "GET") return getMe(request,env);
    if (route === "profile" && request.method === "POST") return saveProfile(request,env);
    if (route === "event/current" && request.method === "GET") return currentEvent(request,env);
    if (route === "check-in" && request.method === "POST") return checkIn(request,env);
    if (route === "admin/events" && ["GET","POST"].includes(request.method)) return adminEvents(request,env);
    if (route === "admin/action" && request.method === "POST") return adminAction(request,env);
    if (route === "admin/teams" && request.method === "GET") return adminTeams(request,env);
    if (route === "admin/players" && request.method === "GET") return adminPlayers(request,env);
    return error("Not found.",404);
  } catch (caught) {
    return error(caught.message || "Unexpected server error.", caught.status || 500);
  }
}
