(function () {
  "use strict";

  const page = document.body.dataset.portalPage || "player";
  const statusBox = document.getElementById("portal-status");
  let account = null;

  const $ = (id) => document.getElementById(id);
  const show = (id, visible = true) => $(id)?.classList.toggle("portal-hidden", !visible);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const formatDate = (value) => new Intl.DateTimeFormat("en-US", {weekday:"long",month:"long",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/Chicago",timeZoneName:"short"}).format(new Date(value));

  function setStatus(message, type = "") {
    if (!statusBox) return;
    statusBox.textContent = message;
    statusBox.className = `portal-status${type ? ` ${type}` : ""}`;
    statusBox.classList.toggle("portal-hidden", !message);
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api/paintball/${path}`, {
      credentials: "same-origin",
      headers: {"Content-Type":"application/json", ...(options.headers || {})},
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The player system could not complete that request.");
    return payload;
  }

  function signIn() { window.location.href = "/api/paintball/auth/login"; }
  async function signOut() { await api("auth/logout", {method:"POST"}); window.location.href = "/paintball/register/"; }

  function renderIdentity() {
    const signedIn = !!account?.user;
    show("signed-out", !signedIn);
    show("signed-in", signedIn);
    show("profile-card", signedIn && !account.profile);
    show("player-dashboard", signedIn && !!account.profile && page === "player");
    show("admin-shortcut", signedIn && account.isAdmin && page === "player");
    if (!signedIn) return;
    if ($("account-name")) $("account-name").textContent = account.user.discord_name;
    if ($("profile-discord")) $("profile-discord").value = account.user.discord_name;
    if ($("profile-game")) $("profile-game").value = account.profile?.in_game_name || "";
  }

  async function saveProfile(event) {
    event.preventDefault();
    const inGameName = $("profile-game").value.trim();
    if (!inGameName || !$("rules-agree").checked) return setStatus("Enter your in-game name and accept the rulebook.", "error");
    setStatus("Saving your player registration…");
    try {
      await api("profile", {method:"POST", body:JSON.stringify({inGameName, rulesAccepted:true})});
      account = await api("me");
      renderIdentity();
      await loadPlayerDashboard();
      setStatus("Registration complete. Return here on event night to check in.", "success");
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function loadPlayerDashboard() {
    if (!account?.profile) return;
    try {
      const data = await api("event/current");
      const container = $("current-event");
      if (!data.event) {
        container.innerHTML = '<p class="portal-muted">No pickup night is open yet. Watch Discord for the next announcement.</p>';
        show("assignment-card", false);
        return;
      }
      const event = data.event;
      const open = event.status === "check_in_open";
      container.innerHTML = `<div class="portal-event"><div><span class="portal-pill">${escapeHtml(event.status.replaceAll("_", " "))}</span><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(formatDate(event.starts_at))}</p><p class="portal-muted">Check-in closes ${escapeHtml(formatDate(event.check_in_closes_at))}</p></div><button class="btn primary" id="check-in-button" ${!open || data.checkedIn ? "disabled" : ""}>${data.checkedIn ? "Checked in" : open ? "Check in for this night" : "Check-in closed"}</button></div>`;
      $("check-in-button")?.addEventListener("click", () => checkInForEvent(event.id));
      if (event.status === "teams_published" && data.assignment) {
        show("assignment-card", true);
        $("assignment-text").textContent = data.assignment.is_reserve ? "You are a rotating reserve for this event." : `You are on Team ${data.assignment.team_number}.`;
      } else show("assignment-card", false);
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function checkInForEvent(eventId) {
    setStatus("Checking you in…");
    try {
      await api("check-in", {method:"POST", body:JSON.stringify({eventId})});
      await loadPlayerDashboard();
      setStatus("You’re checked in. Return after teams are published to see your assignment.", "success");
    } catch (error) { setStatus(error.message, "error"); }
  }

  function requireAdmin() {
    if (!account?.user) { show("admin-login", true); show("admin-dashboard", false); return false; }
    if (!account.isAdmin) { show("admin-login", false); show("admin-dashboard", false); setStatus("This organizer page is restricted to an approved MXS administrator.", "error"); return false; }
    show("admin-login", false); show("admin-dashboard", true); return true;
  }

  async function createEvent(event) {
    event.preventDefault();
    try {
      await api("admin/events", {method:"POST", body:JSON.stringify({
        title:$("event-title").value.trim(),
        startsAt:new Date($("event-start").value).toISOString(),
        opensAt:new Date($("event-open").value).toISOString(),
        closesAt:new Date($("event-close").value).toISOString()
      })});
      event.target.reset(); setStatus("Pickup night created.", "success"); await loadAdminEvents();
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function loadAdminEvents() {
    try {
      const {events} = await api("admin/events");
      const body = $("events-body");
      body.innerHTML = events.map((event) => `<tr><td>${escapeHtml(event.title)}<br><span class="portal-muted">${escapeHtml(formatDate(event.starts_at))}</span></td><td>${escapeHtml(event.status.replaceAll("_", " "))}</td><td>${event.check_in_count}</td><td><div class="portal-actions"><button class="btn ghost admin-event-action" data-id="${event.id}" data-action="open">Open</button><button class="btn ghost admin-event-action" data-id="${event.id}" data-action="close">Close</button><button class="btn secondary admin-event-action" data-id="${event.id}" data-action="generate">Generate</button><button class="btn primary admin-event-action" data-id="${event.id}" data-action="publish">Publish</button><button class="btn ghost admin-event-action" data-id="${event.id}" data-action="view">View</button></div></td></tr>`).join("") || '<tr><td colspan="4">No events created.</td></tr>';
      document.querySelectorAll(".admin-event-action").forEach((button) => button.addEventListener("click", () => adminAction(button.dataset.id, button.dataset.action)));
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function loadAdminPlayers() {
    try {
      const {players} = await api("admin/players");
      $("players-body").innerHTML = players.map((player) => `<tr><td>${escapeHtml(player.in_game_name)}</td><td>${escapeHtml(player.discord_name)}</td><td>${escapeHtml(new Date(player.created_at).toLocaleDateString())}</td><td>${player.active ? "Active" : "Inactive"}</td></tr>`).join("") || '<tr><td colspan="4">No registered players yet.</td></tr>';
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function adminAction(eventId, action) {
    if (action === "view") return loadEventTeams(eventId);
    setStatus("Updating the event…");
    try {
      await api("admin/action", {method:"POST", body:JSON.stringify({eventId, action})});
      setStatus(action === "generate" ? "Teams generated. Review them before publishing." : "Event updated.", "success");
      await Promise.all([loadAdminEvents(), loadEventTeams(eventId)]);
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function loadEventTeams(eventId) {
    try {
      const {assignments} = await api(`admin/teams?eventId=${encodeURIComponent(eventId)}`);
      show("team-review", true);
      const grouped = {};
      assignments.forEach((row) => { const key = row.is_reserve ? "Reserves" : `Team ${row.team_number}`; (grouped[key] ||= []).push(row); });
      $("team-review-list").innerHTML = Object.entries(grouped).map(([name, players]) => `<article class="portal-team"><h3>${escapeHtml(name)}</h3><ul>${players.map((player) => `<li>${escapeHtml(player.in_game_name)} <span class="portal-muted">(${escapeHtml(player.discord_name)})</span></li>`).join("")}</ul></article>`).join("") || '<p class="portal-muted">No teams generated yet.</p>';
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function init() {
    try {
      account = await api("me");
      renderIdentity();
      $("discord-login")?.addEventListener("click", signIn);
      $("admin-discord-login")?.addEventListener("click", signIn);
      document.querySelectorAll(".sign-out").forEach((button) => button.addEventListener("click", signOut));
      $("profile-form")?.addEventListener("submit", saveProfile);
      $("event-form")?.addEventListener("submit", createEvent);
      if (page === "player" && account.profile) await loadPlayerDashboard();
      if (page === "admin" && requireAdmin()) await Promise.all([loadAdminEvents(), loadAdminPlayers()]);
    } catch (error) {
      setStatus(error.message.includes("not configured") ? "The Cloudflare player system needs its database and Discord secrets connected before registration opens." : error.message, "error");
      show("setup-message", true);
      show("portal-app", false);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
