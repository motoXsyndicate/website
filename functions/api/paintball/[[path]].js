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

async function isHost(env, userId) {
  return !!(await env.PAINTBALL_DB.prepare("SELECT 1 FROM pb_hosts WHERE user_id = ?").bind(userId).first());
}

async function requireOrganizer(request, env) {
  const user = await requireUser(request, env);
  const [admin,host] = await Promise.all([isAdmin(env,user.id),isHost(env,user.id)]);
  if (!admin && !host) throw Object.assign(new Error("Approved host access required."), {status:403});
  return {...user,isAdmin:admin,isHost:host};
}

async function requireEventOwner(request, env, eventId) {
  const organizer = await requireOrganizer(request, env);
  const event = await env.PAINTBALL_DB.prepare("SELECT * FROM pb_events WHERE id=?").bind(eventId).first();
  if (!event) throw Object.assign(new Error("Event not found."), {status:404});
  if (!organizer.isAdmin && event.created_by !== organizer.id) throw Object.assign(new Error("You can only manage events you created."), {status:403});
  return {organizer,event};
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
  if (!user) return json({user:null,profile:null,isAdmin:false,isHost:false});
  const [profile, admin, host, branding] = await Promise.all([
    env.PAINTBALL_DB.prepare("SELECT in_game_name, rules_accepted_at, active FROM pb_profiles WHERE user_id = ?").bind(user.id).first(),
    isAdmin(env,user.id),
    isHost(env,user.id),
    env.PAINTBALL_DB.prepare("SELECT is_premium,organization_name,logo_url,banner_url,accent_color,sponsor_text FROM pb_host_branding WHERE user_id=?").bind(user.id).first()
  ]);
  return json({user,profile:profile || null,isAdmin:admin,isHost:host,isPremium:!!branding?.is_premium,branding:branding || null});
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
    SELECT id,title,starts_at,check_in_opens_at,check_in_closes_at,status FROM pb_events
    WHERE status IN ('check_in_open','check_in_closed','teams_generated','teams_published')
      AND starts_at >= ?
    ORDER BY starts_at LIMIT 1
  `).bind(new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()).first();
  if (!event) return json({event:null,checkedIn:false,assignment:null});
  const checkedIn = !!(await env.PAINTBALL_DB.prepare("SELECT 1 FROM pb_check_ins WHERE event_id=? AND user_id=?").bind(event.id,user.id).first());
  let assignment = null;
  if (event.status === "teams_published") assignment = await env.PAINTBALL_DB.prepare("SELECT team_number,is_reserve FROM pb_assignments WHERE event_id=? AND user_id=?").bind(event.id,user.id).first();
  return json({event,checkedIn,assignment:assignment || null});
}

async function playerEvents(request, env) {
  const user = await requireUser(request, env);
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const result = await env.PAINTBALL_DB.prepare(`
    SELECT e.id,e.title,e.starts_at,e.check_in_opens_at,e.check_in_closes_at,e.status,
      CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS registered,
      CASE WHEN c.user_id IS NULL THEN 0 ELSE 1 END AS confirmed,
      a.team_number,a.is_reserve,
      (SELECT COUNT(*) FROM pb_event_registrations er WHERE er.event_id=e.id) AS registration_count,
      (SELECT COUNT(*) FROM pb_check_ins ci WHERE ci.event_id=e.id) AS confirmation_count
    FROM pb_events e
    LEFT JOIN pb_event_registrations r ON r.event_id=e.id AND r.user_id=?
    LEFT JOIN pb_check_ins c ON c.event_id=e.id AND c.user_id=?
    LEFT JOIN pb_assignments a ON a.event_id=e.id AND a.user_id=?
    WHERE e.status IN ('check_in_open','check_in_closed','teams_generated','teams_published','completed')
      AND e.starts_at >= ?
    ORDER BY e.starts_at
  `).bind(user.id,user.id,user.id,cutoff).all();
  return json({events:result.results});
}

async function registerForEvent(request, env) {
  const user = await requireUser(request, env);
  const data = await body(request);
  const profile = await env.PAINTBALL_DB.prepare("SELECT active FROM pb_profiles WHERE user_id=?").bind(user.id).first();
  if (!profile?.active) return error("Complete your player profile before registering for an event.");
  const event = await env.PAINTBALL_DB.prepare("SELECT * FROM pb_events WHERE id=?").bind(data.eventId).first();
  if (!event || event.status !== "check_in_open") return error("Registration is not open for this event.");
  if (new Date() > new Date(event.check_in_closes_at)) return error("Registration and confirmation have closed for this event.");
  await env.PAINTBALL_DB.prepare("INSERT OR IGNORE INTO pb_event_registrations(event_id,user_id,registered_at) VALUES (?,?,?)").bind(event.id,user.id,new Date().toISOString()).run();
  return json({ok:true});
}

async function eventPlayers(request, env) {
  await requireUser(request, env);
  const eventId = new URL(request.url).searchParams.get("eventId");
  const event = await env.PAINTBALL_DB.prepare("SELECT id FROM pb_events WHERE id=? AND status IN ('check_in_open','check_in_closed','teams_generated','teams_published','completed')").bind(eventId).first();
  if (!event) return error("This pickup night is not available.",404);
  const result = await env.PAINTBALL_DB.prepare(`SELECT p.in_game_name,CASE WHEN c.user_id IS NULL THEN 0 ELSE 1 END AS confirmed FROM pb_event_registrations r JOIN pb_profiles p ON p.user_id=r.user_id LEFT JOIN pb_check_ins c ON c.event_id=r.event_id AND c.user_id=r.user_id WHERE r.event_id=? ORDER BY lower(p.in_game_name)`).bind(eventId).all();
  return json({players:result.results,count:result.results.length,confirmedCount:result.results.filter((player) => player.confirmed).length});
}

async function checkIn(request, env) {
  const user = await requireUser(request, env);
  const data = await body(request);
  const profile = await env.PAINTBALL_DB.prepare("SELECT active FROM pb_profiles WHERE user_id=?").bind(user.id).first();
  if (!profile?.active) return error("Complete your player profile before confirming attendance.");
  const event = await env.PAINTBALL_DB.prepare("SELECT * FROM pb_events WHERE id=?").bind(data.eventId).first();
  const now = new Date();
  if (!event || event.status !== "check_in_open") return error("Confirmation is not open for this event.");
  if (!(await env.PAINTBALL_DB.prepare("SELECT 1 FROM pb_event_registrations WHERE event_id=? AND user_id=?").bind(event.id,user.id).first())) return error("Register for this event before confirming attendance.");
  if (now < new Date(event.check_in_opens_at) || now > new Date(event.check_in_closes_at)) return error("This event is outside its confirmation window.");
  await env.PAINTBALL_DB.prepare("INSERT OR IGNORE INTO pb_check_ins(event_id,user_id,checked_in_at) VALUES (?,?,?)").bind(event.id,user.id,now.toISOString()).run();
  return json({ok:true});
}

async function publicEvent(request, env) {
  const eventId = new URL(request.url).searchParams.get("eventId");
  const eventQuery = `SELECT e.id,e.title,e.starts_at,e.status,u.discord_name AS host_name,CASE WHEN b.is_premium=1 THEN b.organization_name END AS organization_name,CASE WHEN b.is_premium=1 THEN b.logo_url END AS logo_url,CASE WHEN b.is_premium=1 THEN b.banner_url END AS banner_url,CASE WHEN b.is_premium=1 THEN b.accent_color END AS accent_color,CASE WHEN b.is_premium=1 THEN b.sponsor_text END AS sponsor_text FROM pb_events e JOIN pb_users u ON u.id=e.created_by LEFT JOIN pb_host_branding b ON b.user_id=e.created_by WHERE e.status IN ('teams_published','completed') ${eventId ? "AND e.id=?" : "ORDER BY e.starts_at DESC LIMIT 1"}`;
  const event = eventId ? await env.PAINTBALL_DB.prepare(eventQuery).bind(eventId).first() : await env.PAINTBALL_DB.prepare(eventQuery).first();
  if (!event) return json({event:null,assignments:[],matches:[],placements:[]});
  const [assignments,matches,placements] = await Promise.all([
    env.PAINTBALL_DB.prepare(`SELECT a.team_number,a.is_reserve,p.in_game_name FROM pb_assignments a JOIN pb_profiles p ON p.user_id=a.user_id WHERE a.event_id=? ORDER BY a.is_reserve,a.team_number,lower(p.in_game_name)`).bind(event.id).all(),
    env.PAINTBALL_DB.prepare("SELECT id,round_number,match_number,team1_number,team2_number,score1,score2,winner_team_number,status,label FROM pb_bracket_matches WHERE event_id=? ORDER BY round_number,match_number").bind(event.id).all(),
    env.PAINTBALL_DB.prepare("SELECT team_number,place FROM pb_placements WHERE event_id=? ORDER BY place").bind(event.id).all()
  ]);
  return json({event,assignments:assignments.results,matches:matches.results,placements:placements.results});
}

async function adminEvents(request, env) {
  const organizer = await requireOrganizer(request, env);
  if (request.method === "GET") {
    const query = `SELECT e.*,u.discord_name AS host_name,(SELECT COUNT(*) FROM pb_event_registrations r WHERE r.event_id=e.id) AS registration_count,(SELECT COUNT(*) FROM pb_check_ins c WHERE c.event_id=e.id) AS check_in_count FROM pb_events e JOIN pb_users u ON u.id=e.created_by ${organizer.isAdmin ? "" : "WHERE e.created_by=?"} ORDER BY e.starts_at DESC LIMIT 20`;
    const statement = env.PAINTBALL_DB.prepare(query);
    const result = organizer.isAdmin ? await statement.all() : await statement.bind(organizer.id).all();
    return json({events:result.results});
  }
  const data = await body(request);
  if (!data.title || !data.startsAt || !data.opensAt || !data.closesAt) return error("Complete every event field.");
  if (!(new Date(data.opensAt) < new Date(data.closesAt) && new Date(data.closesAt) <= new Date(data.startsAt))) return error("Confirmation must open before it closes, and close before the event starts.");
  await env.PAINTBALL_DB.prepare("INSERT INTO pb_events(id,title,starts_at,check_in_opens_at,check_in_closes_at,status,created_by,created_at) VALUES (?,?,?,?,?,'check_in_open',?,?)").bind(crypto.randomUUID(),String(data.title).slice(0,100),data.startsAt,data.opensAt,data.closesAt,organizer.id,new Date().toISOString()).run();
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
  const {eventId,action,teamSize} = await body(request);
  const {event} = await requireEventOwner(request,env,eventId);
  if (["open","close","publish"].includes(action)) {
    if (action === "open" && !["draft","check_in_closed"].includes(event.status)) return error("This event cannot be posted from its current status.");
    if (action === "close" && event.status !== "check_in_open") return error("Registration and confirmation are not currently open.");
    if (action === "publish" && event.status !== "teams_generated") return error("Generate and review the teams before publishing.");
    const next = {open:"check_in_open",close:"check_in_closed",publish:"teams_published"}[action];
    if (action === "publish" && !(await env.PAINTBALL_DB.prepare("SELECT 1 FROM pb_assignments WHERE event_id=?").bind(eventId).first())) return error("Generate teams before publishing them.");
    await env.PAINTBALL_DB.prepare("UPDATE pb_events SET status=? WHERE id=?").bind(next,eventId).run();
    return json({ok:true});
  }
  if (action !== "generate") return error("Unknown organizer action.");
  if (!["check_in_closed","teams_generated"].includes(event.status)) return error("Close confirmation before generating teams.");
  if (!Number.isInteger(teamSize) || teamSize < 4 || teamSize > 6) return error("Choose a team size between 4 and 6 players.");
  const checked = await env.PAINTBALL_DB.prepare("SELECT user_id FROM pb_check_ins WHERE event_id=?").bind(eventId).all();
  if (checked.results.length < teamSize * 2) return error(`At least ${teamSize * 2} confirmed players are required for ${teamSize}v${teamSize}.`);
  const players = shuffle(checked.results);
  const fullCount = Math.floor(players.length / teamSize) * teamSize;
  const generationRow = await env.PAINTBALL_DB.prepare("SELECT COALESCE(MAX(generation),0)+1 AS generation FROM pb_assignments WHERE event_id=?").bind(eventId).first();
  const generation = generationRow.generation;
  const statements = [
    env.PAINTBALL_DB.prepare("DELETE FROM pb_placements WHERE event_id=?").bind(eventId),
    env.PAINTBALL_DB.prepare("DELETE FROM pb_bracket_matches WHERE event_id=?").bind(eventId),
    env.PAINTBALL_DB.prepare("DELETE FROM pb_assignments WHERE event_id=?").bind(eventId)
  ];
  players.forEach((player,index) => statements.push(env.PAINTBALL_DB.prepare("INSERT INTO pb_assignments(event_id,user_id,team_number,is_reserve,generation,assigned_at) VALUES (?,?,?,?,?,?)").bind(eventId,player.user_id,index < fullCount ? Math.floor(index/teamSize)+1 : null,index >= fullCount ? 1 : 0,generation,new Date().toISOString())));
  statements.push(env.PAINTBALL_DB.prepare("UPDATE pb_events SET status='teams_generated' WHERE id=?").bind(eventId));
  await env.PAINTBALL_DB.batch(statements);
  return json({ok:true,playerCount:players.length,generation,teamSize});
}

async function adminTeams(request, env) {
  const eventId = new URL(request.url).searchParams.get("eventId");
  await requireEventOwner(request,env,eventId);
  const result = await env.PAINTBALL_DB.prepare(`SELECT a.team_number,a.is_reserve,a.generation,p.in_game_name,u.discord_name FROM pb_assignments a JOIN pb_profiles p ON p.user_id=a.user_id JOIN pb_users u ON u.id=a.user_id WHERE a.event_id=? ORDER BY a.is_reserve,a.team_number,p.in_game_name`).bind(eventId).all();
  return json({assignments:result.results});
}

async function adminPlayers(request, env) {
  await requireOrganizer(request, env);
  const result = await env.PAINTBALL_DB.prepare(`SELECT p.in_game_name,p.active,p.created_at,u.discord_name FROM pb_profiles p JOIN pb_users u ON u.id=p.user_id ORDER BY lower(p.in_game_name)`).all();
  return json({players:result.results});
}

function bracketSeedOrder(size) {
  let order = [1, 2];
  for (let current = 4; current <= size; current *= 2) {
    order = order.flatMap((seed) => [seed, current + 1 - seed]);
  }
  return order;
}

async function createBracket(env, eventId) {
  const assignmentRows = await env.PAINTBALL_DB.prepare("SELECT DISTINCT team_number FROM pb_assignments WHERE event_id=? AND is_reserve=0 ORDER BY team_number").bind(eventId).all();
  const teams = assignmentRows.results.map((row) => row.team_number);
  if (teams.length < 2) throw new Error("Generate at least two complete teams before creating a bracket.");
  const matches = [];
  const add = (round,number,label,team1=null,team2=null,placementWinner=null,placementLoser=null) => {
    const match = {id:crypto.randomUUID(),round,number,label,team1,team2,status:team1 && team2 ? "ready" : "pending",nextId:null,nextSlot:null,loserNextId:null,loserNextSlot:null,placementWinner,placementLoser};
    matches.push(match); return match;
  };
  const connect = (source,winnerMatch,winnerSlot,loserMatch=null,loserSlot=null) => {
    source.nextId = winnerMatch?.id || null; source.nextSlot = winnerSlot;
    source.loserNextId = loserMatch?.id || null; source.loserNextSlot = loserSlot;
  };
  let rounds = 1;
  if (teams.length === 2) {
    add(1,1,"Championship",teams[0],teams[1],1,2);
  } else if (teams.length === 4) {
    rounds = 2;
    const semi1 = add(1,1,"Semifinal 1",teams[0],teams[3]);
    const semi2 = add(1,2,"Semifinal 2",teams[1],teams[2]);
    const final = add(2,1,"Championship",null,null,1,2);
    const third = add(2,2,"Third Place",null,null,3,4);
    connect(semi1,final,1,third,1); connect(semi2,final,2,third,2);
  } else if (teams.length === 8) {
    rounds = 3;
    const quarterfinals = [
      add(1,1,"Quarterfinal 1",teams[0],teams[7]), add(1,2,"Quarterfinal 2",teams[3],teams[4]),
      add(1,3,"Quarterfinal 3",teams[1],teams[6]), add(1,4,"Quarterfinal 4",teams[2],teams[5])
    ];
    const championshipSemis = [add(2,1,"Championship Semifinal 1"),add(2,2,"Championship Semifinal 2")];
    const consolationSemis = [add(2,3,"Consolation Semifinal 1"),add(2,4,"Consolation Semifinal 2")];
    quarterfinals.forEach((match,index) => connect(match,championshipSemis[Math.floor(index/2)],index%2+1,consolationSemis[Math.floor(index/2)],index%2+1));
    const final = add(3,1,"Championship",null,null,1,2);
    const third = add(3,2,"Third Place",null,null,3,4);
    const fifth = add(3,3,"Fifth Place",null,null,5,6);
    const seventh = add(3,4,"Seventh Place",null,null,7,8);
    connect(championshipSemis[0],final,1,third,1); connect(championshipSemis[1],final,2,third,2);
    connect(consolationSemis[0],fifth,1,seventh,1); connect(consolationSemis[1],fifth,2,seventh,2);
  } else {
    const rotation = [...teams];
    if (rotation.length % 2) rotation.push(null);
    rounds = rotation.length - 1;
    for (let round = 0; round < rounds; round++) {
      let matchNumber = 1;
      for (let index = 0; index < rotation.length / 2; index++) {
        const team1 = rotation[index];
        const team2 = rotation[rotation.length - 1 - index];
        if (team1 && team2) add(round + 1,matchNumber++,`Round Robin · Round ${round + 1}`,team1,team2);
      }
      rotation.splice(1,0,rotation.pop());
    }
  }
  const now = new Date().toISOString();
  const statements = [
    env.PAINTBALL_DB.prepare("DELETE FROM pb_placements WHERE event_id=?").bind(eventId),
    env.PAINTBALL_DB.prepare("DELETE FROM pb_bracket_matches WHERE event_id=?").bind(eventId)
  ];
  matches.forEach((match) => {
    statements.push(env.PAINTBALL_DB.prepare(`INSERT INTO pb_bracket_matches(id,event_id,round_number,match_number,team1_number,team2_number,status,next_match_id,next_slot,loser_next_match_id,loser_next_slot,label,placement_winner,placement_loser,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(match.id,eventId,match.round,match.number,match.team1,match.team2,match.status,match.nextId,match.nextSlot,match.loserNextId,match.loserNextSlot,match.label,match.placementWinner,match.placementLoser,now));
  });
  await env.PAINTBALL_DB.batch(statements);
  return {teamCount:teams.length,rounds};
}

async function bracketData(env, eventId) {
  const result = await env.PAINTBALL_DB.prepare("SELECT * FROM pb_bracket_matches WHERE event_id=? ORDER BY round_number,match_number").bind(eventId).all();
  return result.results;
}

async function placementData(env, eventId) {
  const result = await env.PAINTBALL_DB.prepare("SELECT team_number,place FROM pb_placements WHERE event_id=? ORDER BY place").bind(eventId).all();
  return result.results;
}

async function refreshRoundRobinPlacements(env, eventId) {
  const result = await env.PAINTBALL_DB.prepare("SELECT team1_number,team2_number,score1,score2,status,label FROM pb_bracket_matches WHERE event_id=? ORDER BY round_number,match_number").bind(eventId).all();
  const matches = result.results;
  if (!matches.length || !matches[0].label.startsWith("Round Robin")) return;
  if (matches.some((match) => match.status !== "completed")) return;
  const standings = new Map();
  const rowFor = (team) => {
    if (!standings.has(team)) standings.set(team,{team,wins:0,losses:0,pointsFor:0,pointsAgainst:0});
    return standings.get(team);
  };
  matches.forEach((match) => {
    const first = rowFor(match.team1_number);
    const second = rowFor(match.team2_number);
    first.pointsFor += match.score1; first.pointsAgainst += match.score2;
    second.pointsFor += match.score2; second.pointsAgainst += match.score1;
    if (match.score1 > match.score2) { first.wins++; second.losses++; }
    else { second.wins++; first.losses++; }
  });
  const ranked = [...standings.values()].sort((a,b) => b.wins-a.wins || (b.pointsFor-b.pointsAgainst)-(a.pointsFor-a.pointsAgainst) || b.pointsFor-a.pointsFor || a.team-b.team);
  const now = new Date().toISOString();
  const statements = [env.PAINTBALL_DB.prepare("DELETE FROM pb_placements WHERE event_id=?").bind(eventId)];
  ranked.forEach((row,index) => statements.push(env.PAINTBALL_DB.prepare("INSERT INTO pb_placements(event_id,team_number,place,created_at) VALUES (?,?,?,?)").bind(eventId,row.team,index+1,now)));
  await env.PAINTBALL_DB.batch(statements);
}

async function adminBracket(request, env) {
  if (request.method === "GET") {
    const eventId = new URL(request.url).searchParams.get("eventId");
    await requireEventOwner(request,env,eventId);
    return json({matches:await bracketData(env,eventId),placements:await placementData(env,eventId)});
  }
  const data = await body(request);
  await requireEventOwner(request,env,data.eventId);
  if (data.action === "create") {
    const created = await createBracket(env,data.eventId);
    return json({ok:true,...created,matches:await bracketData(env,data.eventId),placements:[]});
  }
  if (data.action !== "result") return error("Unknown bracket action.");
  const match = await env.PAINTBALL_DB.prepare("SELECT * FROM pb_bracket_matches WHERE id=? AND event_id=?").bind(data.matchId,data.eventId).first();
  if (!match) return error("Bracket match not found.",404);
  if (match.status === "completed") return error("This match result is already final.");
  if (!match.team1_number || !match.team2_number) return error("Both teams must be determined before entering a result.");
  const score1 = Number(data.score1);
  const score2 = Number(data.score2);
  if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0 || score1 === score2) return error("Enter two different, non-negative whole-number scores.");
  const winner = score1 > score2 ? match.team1_number : match.team2_number;
  const loser = score1 > score2 ? match.team2_number : match.team1_number;
  const statements = [env.PAINTBALL_DB.prepare("UPDATE pb_bracket_matches SET score1=?,score2=?,winner_team_number=?,status='completed' WHERE id=?").bind(score1,score2,winner,match.id)];
  if (match.next_match_id) {
    const column = match.next_slot === 1 ? "team1_number" : "team2_number";
    statements.push(env.PAINTBALL_DB.prepare(`UPDATE pb_bracket_matches SET ${column}=? WHERE id=?`).bind(winner,match.next_match_id));
  }
  if (match.loser_next_match_id) {
    const column = match.loser_next_slot === 1 ? "team1_number" : "team2_number";
    statements.push(env.PAINTBALL_DB.prepare(`UPDATE pb_bracket_matches SET ${column}=? WHERE id=?`).bind(loser,match.loser_next_match_id));
  }
  if (match.placement_winner) statements.push(env.PAINTBALL_DB.prepare("INSERT OR REPLACE INTO pb_placements(event_id,team_number,place,created_at) VALUES (?,?,?,?)").bind(data.eventId,winner,match.placement_winner,new Date().toISOString()));
  if (match.placement_loser) statements.push(env.PAINTBALL_DB.prepare("INSERT OR REPLACE INTO pb_placements(event_id,team_number,place,created_at) VALUES (?,?,?,?)").bind(data.eventId,loser,match.placement_loser,new Date().toISOString()));
  await env.PAINTBALL_DB.batch(statements);
  const nextMatches = [...new Set([match.next_match_id,match.loser_next_match_id].filter(Boolean))];
  for (const nextId of nextMatches) await env.PAINTBALL_DB.prepare("UPDATE pb_bracket_matches SET status=CASE WHEN team1_number IS NOT NULL AND team2_number IS NOT NULL THEN 'ready' ELSE 'pending' END WHERE id=?").bind(nextId).run();
  await refreshRoundRobinPlacements(env,data.eventId);
  return json({ok:true,winner,loser,matches:await bracketData(env,data.eventId),placements:await placementData(env,data.eventId)});
}

async function adminHosts(request, env) {
  const admin = await requireAdmin(request, env);
  if (request.method === "GET") {
    const result = await env.PAINTBALL_DB.prepare(`SELECT u.id,u.discord_name,p.in_game_name,CASE WHEN h.user_id IS NULL THEN 0 ELSE 1 END AS is_host,CASE WHEN a.user_id IS NULL THEN 0 ELSE 1 END AS is_admin,COALESCE(b.is_premium,0) AS is_premium FROM pb_users u JOIN pb_profiles p ON p.user_id=u.id LEFT JOIN pb_hosts h ON h.user_id=u.id LEFT JOIN pb_admins a ON a.user_id=u.id LEFT JOIN pb_host_branding b ON b.user_id=u.id ORDER BY lower(p.in_game_name)`).all();
    return json({players:result.results});
  }
  const data = await body(request);
  if (!data.userId || !["approve","revoke","premium","standard"].includes(data.action)) return error("Choose a valid host action.");
  if (data.action === "approve") await env.PAINTBALL_DB.prepare("INSERT OR REPLACE INTO pb_hosts(user_id,approved_by,approved_at) VALUES (?,?,?)").bind(data.userId,admin.id,new Date().toISOString()).run();
  else if (data.action === "revoke") await env.PAINTBALL_DB.prepare("DELETE FROM pb_hosts WHERE user_id=?").bind(data.userId).run();
  else await env.PAINTBALL_DB.prepare(`INSERT INTO pb_host_branding(user_id,is_premium,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET is_premium=excluded.is_premium,updated_at=excluded.updated_at`).bind(data.userId,data.action === "premium" ? 1 : 0,new Date().toISOString()).run();
  return json({ok:true});
}

async function hostBranding(request, env) {
  const organizer = await requireOrganizer(request, env);
  const existing = await env.PAINTBALL_DB.prepare("SELECT is_premium,organization_name,logo_url,banner_url,accent_color,sponsor_text FROM pb_host_branding WHERE user_id=?").bind(organizer.id).first();
  if (request.method === "GET") return json({isPremium:!!existing?.is_premium,branding:existing || null});
  if (!existing?.is_premium) return error("Premium Host access is required for custom branding.",403);
  const data = await body(request);
  const cleanUrl = (value) => { const text=String(value||"").trim(); if (!text) return null; try { const url=new URL(text); return url.protocol === "https:" ? url.toString().slice(0,500) : null; } catch { return null; } };
  const accent = /^#[0-9a-fA-F]{6}$/.test(String(data.accentColor||"")) ? data.accentColor : "#53cc83";
  await env.PAINTBALL_DB.prepare(`UPDATE pb_host_branding SET organization_name=?,logo_url=?,banner_url=?,accent_color=?,sponsor_text=?,updated_at=? WHERE user_id=?`).bind(String(data.organizationName||"").trim().slice(0,80)||null,cleanUrl(data.logoUrl),cleanUrl(data.bannerUrl),accent,String(data.sponsorText||"").trim().slice(0,120)||null,new Date().toISOString(),organizer.id).run();
  return json({ok:true});
}

export async function onRequest(context) {
  const {request,env} = context;
  try {
    requireBindings(env);
    const route = routeFor(request);
    if (route === "auth/login" && request.method === "GET") return await discordLogin(request,env);
    if (route === "auth/callback" && request.method === "GET") return await discordCallback(request,env);
    if (route === "auth/logout" && request.method === "POST") return await logout(request,env);
    if (route === "me" && request.method === "GET") return await getMe(request,env);
    if (route === "profile" && request.method === "POST") return await saveProfile(request,env);
    if (route === "event/current" && request.method === "GET") return await currentEvent(request,env);
    if (route === "events" && request.method === "GET") return await playerEvents(request,env);
    if (route === "event/register" && request.method === "POST") return await registerForEvent(request,env);
    if (route === "event/players" && request.method === "GET") return await eventPlayers(request,env);
    if (route === "check-in" && request.method === "POST") return await checkIn(request,env);
    if (route === "event/public" && request.method === "GET") return await publicEvent(request,env);
    if (route === "admin/events" && ["GET","POST"].includes(request.method)) return await adminEvents(request,env);
    if (route === "admin/action" && request.method === "POST") return await adminAction(request,env);
    if (route === "admin/teams" && request.method === "GET") return await adminTeams(request,env);
    if (route === "admin/players" && request.method === "GET") return await adminPlayers(request,env);
    if (route === "admin/hosts" && ["GET","POST"].includes(request.method)) return await adminHosts(request,env);
    if (route === "host/branding" && ["GET","POST"].includes(request.method)) return await hostBranding(request,env);
    if (route === "admin/bracket" && ["GET","POST"].includes(request.method)) return await adminBracket(request,env);
    return error("Not found.",404);
  } catch (caught) {
    return error(caught.message || "Unexpected server error.", caught.status || 500);
  }
}
