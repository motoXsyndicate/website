(function () {
  "use strict";

  const page = document.body.dataset.portalPage || "player";
  const statusBox = document.getElementById("portal-status");
  let account = null;

  const $ = (id) => document.getElementById(id);
  const show = (id, visible = true) => $(id)?.classList.toggle("portal-hidden", !visible);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "your local timezone";
  const formatDate = (value) => new Intl.DateTimeFormat("en-US", {weekday:"long",month:"long",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(value));
  const eventStatus = (status) => ({draft:"Draft",check_in_open:"Registration open",check_in_closed:"Confirmation closed",teams_generated:"Teams ready for review",teams_published:"Teams published",completed:"Completed",cancelled:"Cancelled"}[status] || status.replaceAll("_", " "));

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
    show("admin-shortcut", signedIn && (account.isAdmin || account.isHost) && page === "player");
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
      setStatus("Player profile complete. Browse the posted events and register for any night you want to play.", "success");
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function loadPlayerDashboard() {
    if (!account?.profile) return;
    try {
      const {events} = await api("events");
      const container = $("events-list");
      if (!events.length) {
        container.innerHTML = '<article class="portal-card"><h3>No upcoming events are posted</h3><p class="portal-muted">Your player profile remains registered. Watch Discord for the next announcement, then return here.</p></article>';
        return;
      }
      const selectedEventId = new URLSearchParams(location.search).get("eventId");
      const selectedEvent = selectedEventId ? events.find((event) => event.id === selectedEventId) : null;
      if (selectedEventId && !selectedEvent) {
        container.innerHTML = '<article class="portal-card"><h3>Event not found</h3><p class="portal-muted">This event is no longer available.</p><a class="btn secondary" href="/paintball/register/">Back to Events</a></article>';
        return;
      }
      const visibleEvents = selectedEvent ? [selectedEvent] : events;
      if ($("events-heading")) $("events-heading").textContent = selectedEvent ? selectedEvent.title : "Choose the nights you want to play.";
      if ($("events-intro")) $("events-intro").innerHTML = selectedEvent ? 'Review the event information below. Register now, then return during the listed window to confirm attendance.' : '<strong>Select an event</strong> to view its full information, registered players, registration button, and confirmation status.';
      container.innerHTML = visibleEvents.map((event) => {
        const now = new Date();
        const confirmationOpen = event.status === "check_in_open" && now >= new Date(event.check_in_opens_at) && now <= new Date(event.check_in_closes_at);
        const canRegister = event.status === "check_in_open" && now <= new Date(event.check_in_closes_at);
        const assignment = event.status === "teams_published" && (event.is_reserve || event.team_number) ? (event.is_reserve ? "Rotating reserve" : `Team ${event.team_number}`) : null;
        const registerLabel = event.registered ? "Registered" : canRegister ? "Register for This Event" : "Registration Closed";
        const confirmLabel = event.confirmed ? "Attendance Confirmed" : confirmationOpen ? "Confirm Attendance" : now < new Date(event.check_in_opens_at) ? "Confirmation Opens Later" : "Confirmation Closed";
        if (!selectedEvent) return `<article class="portal-card portal-event-card portal-event-summary"><div><span class="portal-pill">${escapeHtml(eventStatus(event.status))}</span><h3>${escapeHtml(event.title)}</h3><p><strong>${escapeHtml(formatDate(event.starts_at))}</strong></p><p class="portal-muted">Confirmation: ${escapeHtml(formatDate(event.check_in_opens_at))} to ${escapeHtml(formatDate(event.check_in_closes_at))}</p><p class="portal-event-counts">${event.registration_count} registered · ${event.confirmation_count} confirmed</p></div><a class="btn primary" href="/paintball/register/?eventId=${encodeURIComponent(event.id)}">View Event</a></article>`;
        const eventBoardButton = ["teams_published","completed"].includes(event.status) ? `<a class="btn secondary" href="/paintball/event/?eventId=${encodeURIComponent(event.id)}">View Teams &amp; Bracket</a>` : "";
        return `<div class="portal-detail-back"><a href="/paintball/register/">← Back to All Events</a></div><article class="portal-card portal-event-card"><div class="portal-event"><div><span class="portal-pill">${escapeHtml(eventStatus(event.status))}</span><h3>${escapeHtml(event.title)}</h3><div class="portal-event-facts"><p><span>Event starts</span><strong>${escapeHtml(formatDate(event.starts_at))}</strong></p><p><span>Confirmation opens</span><strong>${escapeHtml(formatDate(event.check_in_opens_at))}</strong></p><p><span>Confirmation closes</span><strong>${escapeHtml(formatDate(event.check_in_closes_at))}</strong></p><p><span>Expected format</span><strong>Flexible 4v4 or 5v5</strong></p></div><p class="portal-event-counts">${event.registration_count} registered · ${event.confirmation_count} confirmed</p>${assignment ? `<p class="portal-assignment"><strong>Your assignment:</strong> ${escapeHtml(assignment)}</p>` : ""}</div><div class="portal-event-buttons"><button class="btn primary player-event-action" data-action="register" data-id="${event.id}" ${event.registered || !canRegister ? "disabled" : ""}>${registerLabel}</button><button class="btn secondary player-event-action" data-action="confirm" data-id="${event.id}" ${!event.registered || event.confirmed || !confirmationOpen ? "disabled" : ""}>${confirmLabel}</button><button class="btn ghost player-event-action" data-action="players" data-id="${event.id}">See Registered Players</button>${eventBoardButton}</div></div><div id="event-players-${event.id}" class="portal-attendees portal-hidden"></div></article>`;
      }).join("");
      document.querySelectorAll(".player-event-action").forEach((button) => button.addEventListener("click", () => playerEventAction(button.dataset.id,button.dataset.action)));
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function playerEventAction(eventId, action) {
    if (action === "players") return loadEventPlayers(eventId);
    setStatus(action === "register" ? "Registering you for this event…" : "Confirming your attendance…");
    try {
      await api(action === "register" ? "event/register" : "check-in", {method:"POST",body:JSON.stringify({eventId})});
      await loadPlayerDashboard();
      setStatus(action === "register" ? "You’re registered. Return during the event’s confirmation window to confirm that you will play." : "Attendance confirmed. You are eligible for this event’s team generator.", "success");
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function loadEventPlayers(eventId) {
    const list = $(`event-players-${eventId}`);
    const button = document.querySelector(`.player-event-action[data-action="players"][data-id="${eventId}"]`);
    if (!list.classList.contains("portal-hidden") && list.dataset.loaded === "true") {
      show(`event-players-${eventId}`, false); button.textContent = "See Registered Players"; return;
    }
    show(`event-players-${eventId}`, true);
    list.innerHTML = '<p class="portal-muted">Loading registered players…</p>';
    try {
      const {players,count,confirmedCount} = await api(`event/players?eventId=${encodeURIComponent(eventId)}`);
      list.dataset.loaded = "true";
      button.textContent = "Hide Registered Players";
      list.innerHTML = `<h3>${count} registered · ${confirmedCount} confirmed</h3>${players.length ? `<ul>${players.map((player) => `<li>${escapeHtml(player.in_game_name)} ${player.confirmed ? '<span class="portal-confirmed">Confirmed</span>' : '<span class="portal-muted">Awaiting confirmation</span>'}</li>`).join("")}</ul>` : '<p class="portal-muted">Nobody has registered for this event yet.</p>'}`;
    } catch (error) { list.innerHTML = `<p class="portal-muted">${escapeHtml(error.message)}</p>`; }
  }

  function requireOrganizer() {
    if (!account?.user) { show("admin-login", true); show("admin-dashboard", false); return false; }
    if (!account.isAdmin && !account.isHost) { show("admin-login", false); show("admin-dashboard", false); setStatus("This organizer page is restricted to approved MXS hosts.", "error"); return false; }
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
      event.target.reset(); setStatus("Event created and posted. Players can register immediately.", "success"); await loadAdminEvents();
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function loadAdminEvents() {
    try {
      const {events} = await api("admin/events");
      const body = $("events-body");
      body.innerHTML = events.map((event) => {
        const canOpen = event.status === "draft";
        const canClose = event.status === "check_in_open";
        const canGenerate = ["check_in_closed","teams_generated"].includes(event.status);
        const canPublish = event.status === "teams_generated";
        const canReview = ["teams_generated","teams_published","completed"].includes(event.status);
        return `<tr><td>${escapeHtml(event.title)}<br><span class="portal-muted">Hosted by ${escapeHtml(event.host_name)} · ${escapeHtml(formatDate(event.starts_at))}</span></td><td>${escapeHtml(eventStatus(event.status))}</td><td>${event.registration_count} / ${event.check_in_count}</td><td><div class="portal-actions">${canOpen ? `<button class="btn ghost admin-event-action" data-id="${event.id}" data-action="open">Post Legacy Draft</button>` : ""}<button class="btn ghost admin-event-action" data-id="${event.id}" data-action="close" ${canClose ? "" : "disabled"}>Close Confirmation</button><select class="portal-team-size" data-event-id="${event.id}" aria-label="Players per team" ${canGenerate ? "" : "disabled"}><option value="4">4v4</option><option value="5">5v5</option><option value="6">6v6 override</option></select><button class="btn secondary admin-event-action" data-id="${event.id}" data-action="generate" ${canGenerate ? "" : "disabled"}>Generate Teams</button><button class="btn primary admin-event-action" data-id="${event.id}" data-action="publish" ${canPublish ? "" : "disabled"}>Publish Teams</button><button class="btn ghost admin-event-action" data-id="${event.id}" data-action="view" ${canReview ? "" : "disabled"}>Review Teams</button></div></td></tr>`;
      }).join("") || '<tr><td colspan="4">No events created.</td></tr>';
      document.querySelectorAll(".admin-event-action").forEach((button) => button.addEventListener("click", () => {
        const teamSize = Number(document.querySelector(`.portal-team-size[data-event-id="${button.dataset.id}"]`)?.value || 0);
        adminAction(button.dataset.id, button.dataset.action, teamSize);
      }));
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function loadAdminPlayers() {
    show("registered-player-directory", !!account?.isAdmin);
    if (!account?.isAdmin) return;
    try {
      const {players} = await api("admin/players");
      $("players-body").innerHTML = players.map((player) => `<tr><td>${escapeHtml(player.in_game_name)}</td><td>${escapeHtml(player.discord_name)}</td><td>${escapeHtml(new Date(player.created_at).toLocaleDateString())}</td><td>${player.active ? "Active" : "Inactive"}</td></tr>`).join("") || '<tr><td colspan="4">No registered players yet.</td></tr>';
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function loadHostManager() {
    show("host-manager", !!account?.isAdmin);
    if (!account?.isAdmin) return;
    try {
      const {players} = await api("admin/hosts");
      $("hosts-body").innerHTML = players.map((player) => `<tr><td>${escapeHtml(player.in_game_name)}</td><td>${escapeHtml(player.discord_name)}</td><td>${player.is_admin ? "MXS Admin" : player.is_host ? "Approved Host" : "Player"}${player.is_premium ? " · Premium" : ""}</td><td><div class="portal-actions">${player.is_admin ? "" : `<button class="btn ${player.is_host ? "ghost" : "secondary"} host-action" data-id="${player.id}" data-action="${player.is_host ? "revoke" : "approve"}">${player.is_host ? "Revoke Host" : "Approve Host"}</button>`}${player.is_host || player.is_admin ? `<button class="btn ${player.is_premium ? "ghost" : "secondary"} host-action" data-id="${player.id}" data-action="${player.is_premium ? "standard" : "premium"}">${player.is_premium ? "Remove Premium" : "Grant Premium"}</button>` : ""}</div></td></tr>`).join("");
      document.querySelectorAll(".host-action").forEach((button) => button.addEventListener("click", () => updateHost(button.dataset.id,button.dataset.action)));
    } catch (error) { setStatus(error.message,"error"); }
  }

  async function updateHost(userId, action) {
    try {
      await api("admin/hosts",{method:"POST",body:JSON.stringify({userId,action})});
      await loadHostManager();
      setStatus({approve:"Host approved. They can now create and manage their own events.",revoke:"Host access revoked. Their previous events and results remain saved.",premium:"Premium branding granted.",standard:"Premium branding removed. Their events now use standard MXS branding."}[action],"success");
    } catch (error) { setStatus(error.message,"error"); }
  }

  async function loadBrandingEditor() {
    show("branding-card", !!(account?.isAdmin || account?.isHost));
    try {
      const data = await api("host/branding");
      show("branding-locked", !data.isPremium); show("branding-form", data.isPremium);
      if (!data.isPremium) return;
      $("branding-name").value=data.branding?.organization_name||""; $("branding-logo").value=data.branding?.logo_url||""; $("branding-banner").value=data.branding?.banner_url||""; $("branding-color").value=data.branding?.accent_color||"#53cc83"; $("branding-sponsor").value=data.branding?.sponsor_text||"";
    } catch (error) { setStatus(error.message,"error"); }
  }

  async function saveBranding(event) {
    event.preventDefault();
    try {
      await api("host/branding",{method:"POST",body:JSON.stringify({organizationName:$("branding-name").value,logoUrl:$("branding-logo").value,bannerUrl:$("branding-banner").value,accentColor:$("branding-color").value,sponsorText:$("branding-sponsor").value})});
      setStatus("Premium event branding saved. It will appear on your published event pages.","success");
    } catch (error) { setStatus(error.message,"error"); }
  }

  async function adminAction(eventId, action, teamSize = null) {
    if (action === "view") return loadEventTeams(eventId);
    setStatus("Updating the event…");
    try {
      await api("admin/action", {method:"POST", body:JSON.stringify({eventId, action, teamSize})});
      const successMessage = {open:"The event is posted. Players can register now and confirm during the scheduled confirmation window.",close:"Confirmation is closed. Choose the format and generate teams from confirmed players.",publish:"Teams are published in the Player Portal and on Tonight’s Teams."}[action];
      setStatus(action === "generate" ? `Random ${teamSize}v${teamSize} teams generated. Review them before publishing, or change the format and generate again.` : successMessage || "Event updated.", "success");
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
      if ($("create-bracket")) $("create-bracket").onclick = () => createBracket(eventId);
      await loadBracket(eventId);
    } catch (error) { setStatus(error.message, "error"); }
  }

  function renderBracket(eventId, matches, placements = []) {
    show("bracket-card", matches.length > 0);
    if (!matches.length) return;
    const maxRound = Math.max(...matches.map((match) => match.round_number));
    const roundRobin = matches[0]?.label?.startsWith("Round Robin");
    const rounds = {};
    matches.forEach((match) => (rounds[match.round_number] ||= []).push(match));
    const roundName = (round) => roundRobin ? `Round ${round}` : round === maxRound ? "Placement Finals" : round === maxRound - 1 ? "Semifinals" : round === maxRound - 2 ? "Quarterfinals" : `Round ${round}`;
    $("bracket-board").innerHTML = Object.entries(rounds).map(([round, roundMatches]) => `<section class="portal-round"><h3>${roundName(Number(round))}</h3>${roundMatches.map((match) => {
      const team1 = match.team1_number ? `Team ${match.team1_number}` : "TBD";
      const team2 = match.team2_number ? `Team ${match.team2_number}` : "TBD";
      const completed = match.status === "completed";
      const bye = match.status === "bye";
      return `<article class="portal-match"><strong>${escapeHtml(match.label || `Match ${match.match_number}`)}</strong><div class="portal-match-team ${completed && match.winner_team_number === match.team1_number ? "portal-match-winner" : ""}"><span>${team1}</span><input class="portal-score" id="score1-${match.id}" type="number" min="0" value="${match.score1 ?? ""}" ${completed || bye ? "disabled" : ""}></div><div class="portal-match-team ${completed && match.winner_team_number === match.team2_number ? "portal-match-winner" : ""}"><span>${team2}</span><input class="portal-score" id="score2-${match.id}" type="number" min="0" value="${match.score2 ?? ""}" ${completed || bye ? "disabled" : ""}></div>${bye ? `<p class="portal-muted">${match.winner_team_number ? `Team ${match.winner_team_number} advances with a bye.` : "Bye"}</p>` : completed ? `<p class="portal-muted">Team ${match.winner_team_number} won this match.</p>` : `<div class="portal-actions"><button class="btn secondary bracket-result" data-event="${eventId}" data-match="${match.id}" ${match.status !== "ready" ? "disabled" : ""}>Save Result</button></div>`}</article>`;
    }).join("")}</section>`).join("");
    document.querySelectorAll(".bracket-result").forEach((button) => button.addEventListener("click", () => saveBracketResult(button.dataset.event,button.dataset.match)));
    show("bracket-winner", placements.length > 0);
    if (placements.length) $("bracket-winner").textContent = placements.map((item) => `${item.place}: Team ${item.team_number}`).join(" · ");
  }

  async function loadBracket(eventId) {
    try {
      const {matches,placements} = await api(`admin/bracket?eventId=${encodeURIComponent(eventId)}`);
      renderBracket(eventId,matches,placements);
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function createBracket(eventId) {
    setStatus("Building the tournament bracket…");
    try {
      const {matches,placements} = await api("admin/bracket", {method:"POST",body:JSON.stringify({action:"create",eventId})});
      renderBracket(eventId,matches,placements);
      setStatus(matches[0]?.label?.startsWith("Round Robin") ? "Round-robin schedule created. Odd team counts receive one rotating bye each round." : "Placement bracket created. Winners and losing teams will move into the correct placement matches.", "success");
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function saveBracketResult(eventId, matchId) {
    const score1 = Number($(`score1-${matchId}`).value);
    const score2 = Number($(`score2-${matchId}`).value);
    setStatus("Saving the match result…");
    try {
      const {matches,placements} = await api("admin/bracket", {method:"POST",body:JSON.stringify({action:"result",eventId,matchId,score1,score2})});
      renderBracket(eventId,matches,placements);
      setStatus(matches[0]?.label?.startsWith("Round Robin") ? "Round-robin result saved. Final standings will appear after every match is complete." : "Result saved and the teams advanced to their next placement matches.", "success");
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function init() {
    try {
      if ($("event-timezone")) $("event-timezone").textContent = `Times entered here use your device timezone: ${viewerTimeZone}. Players will see them converted to their own timezone.`;
      account = await api("me");
      renderIdentity();
      $("discord-login")?.addEventListener("click", signIn);
      $("admin-discord-login")?.addEventListener("click", signIn);
      document.querySelectorAll(".sign-out").forEach((button) => button.addEventListener("click", signOut));
      $("profile-form")?.addEventListener("submit", saveProfile);
      $("event-form")?.addEventListener("submit", createEvent);
      $("branding-form")?.addEventListener("submit", saveBranding);
      if (page === "player" && account.profile) await loadPlayerDashboard();
      if (page === "admin" && requireOrganizer()) await Promise.all([loadAdminEvents(), loadAdminPlayers(), loadHostManager(), loadBrandingEditor()]);
    } catch (error) {
      setStatus(error.message.includes("not configured") ? "The Cloudflare player system needs its database and Discord secrets connected before registration opens." : error.message, "error");
      show("setup-message", true);
      show("portal-app", false);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
