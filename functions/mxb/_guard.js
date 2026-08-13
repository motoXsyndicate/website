const SESSION_COOKIE = "mxs_mxb_session";
function cookieValue(request, name) {
  const match = (request.headers.get("Cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),(byte) => byte.toString(16).padStart(2,"0")).join("");
}
export async function guardMxbHost({request,env,next}) {
  const token = cookieValue(request,SESSION_COOKIE);
  if (!token) return Response.redirect(`${new URL(request.url).origin}/api/mxb/auth/login`,302);
  const user = await env.PAINTBALL_DB.prepare(`SELECT u.id,CASE WHEN a.user_id IS NULL THEN 0 ELSE 1 END AS is_admin,CASE WHEN h.user_id IS NULL THEN 0 ELSE 1 END AS is_host FROM pb_sessions s JOIN pb_users u ON u.id=s.user_id LEFT JOIN pb_admins a ON a.user_id=u.id LEFT JOIN mxb_hosts h ON h.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`).bind(await sha256(token),new Date().toISOString()).first();
  if (!user) return Response.redirect(`${new URL(request.url).origin}/api/mxb/auth/login`,302);
  if (!user.is_admin && !user.is_host) return new Response("This Discord account is not approved as an MXB host.",{status:403,headers:{"Content-Type":"text/plain;charset=UTF-8","Cache-Control":"no-store"}});
  return next();
}
