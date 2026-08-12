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
  const eventStatus = (status) => ({draft:"Draft",check_in_open:"Check-in open",check_in_closed:"Check-in closed",teams_generated:"Teams ready for review",teams_published:"Teams published",completed:"Completed",cancelled:"Cancelled"}[status] || status.replaceAll("_", " "));

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
        container.innerHTML = '<p class="portal-muted">There is no upcoming pickup night available for check-in yet. Watch Discord for the announcement, then return to this page.</p>';
        show("assignment-card", false);
        return;
      }
      const event = data.event;
      const now = new Date();
      const opensAt = new Date(event.check_in_opens_at);
      const closesAt = new Date(event.check_in_closes_at);
      const open = event.status === "check_in_open" && now >= opensAt && now <= closesAt;
      const checkInLabel = data.checkedIn ? "You’re checked in" : open ? "Check in for this night" : now < opensAt ? "Check-in has not opened" : "Check-in closed";
      container.innerHTML = `<div class="portal-event"><div><span class="portal-pill">${escapeHtml(eventStatus(event.status))}</span><h3>${escapeHtml(event.title)}</h3><p><strong>Event starts:</strong> ${escapeHtml(formatDate(event.starts_at))}</p><p class="portal-muted">Check-in window: ${escapeHtml(formatDate(event.check_in_opens_at))} to ${escapeHtml(formatDate(event.check_in_closes_at))}</p></div><div class="portal-event-buttons"><button class="btn primary" id="check-in-button" ${!open || data.checkedIn ? "disabled" : ""}>${checkInLabel}</button><button class="btn secondary" id="event-players-button">See Who’s Checked In</button></div></div><div id="event-players-list" class="portal-attendees portal-hidden"></div>`;
      $("check-in-button")?.addEventListener("click", () => checkInForEvent(event.id));
      $("event-players-button")?.addEventListener("click", () => loadEventPlayers(event.id));
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

  async function loadEventPlayers(eventId) {
    const list = $("event-players-list");
    const button = $("event-players-button");
    if (!list.classList.contains("portal-hidden") && list.dataset.loaded === "true") {
      show("event-players-list", false); button.textContent = "See Who’s Checked In"; return;
    }
    show("event-players-list", true);
    list.innerHTML = '<p class="portal-muted">Loading checked-in players…</p>';
    try {
      const {players,count} = await api(`event/players?eventId=${encodeURIComponent(eventId)}`);
      list.dataset.loaded = "true";
      button.textContent = "Hide Checked-In Players";
      list.innerHTML = `<h3>${count} ${count === 1 ? "player" : "players"} checked in</h3>${players.length ? `<ul>${players.map((player) => `<li>${escapeHtml(player.in_game_name)}</li>`).join("")}</ul>` : '<p class="portal-muted">Nobody has checked in yet.</p>'}`;
    } catch (error) {
      list.innerHTML = `<p class="portal-muted">${escapeHtml(error.message)}</p>`;
    }
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
      body.innerHTML = events.map((event) => {
        const canOpen = ["draft","check_in_closed"].includes(event.status);
        const canClose = event.status === "check_in_open";
        const canGenerate = ["check_in_closed","teams_generated"].includes(event.status);
        const canPublish = event.status === "teams_generated";
        const canReview = ["teams_generated","teams_published","completed"].includes(event.status);
        return `<tr><td>${escapeHtml(event.title)}<br><span class="portal-muted">${escapeHtml(formatDate(event.starts_at))}</span></td><td>${escapeHtml(eventStatus(event.status))}</td><td>${event.check_in_count}</td><td><div class="portal-actions"><button class="btn ghost admin-event-action" data-id="${event.id}" data-action="open" ${canOpen ? "" : "disabled"}>Open Check-in</button><button class="btn ghost admin-event-action" data-id="${event.id}" data-action="close" ${canClose ? "" : "disabled"}>Close Check-in</button><select class="portal-team-size" data-event-id="${event.id}" aria-label="Players per team" ${canGenerate ? "" : "disabled"}><option value="4">4v4</option><option value="5">5v5</option><option value="6">6v6 override</option></select><button class="btn secondary admin-event-action" data-id="${event.id}" data-action="generate" ${canGenerate ? "" : "disabled"}>Generate Teams</button><button class="btn primary admin-event-action" data-id="${event.id}" data-action="publish" ${canPublish ? "" : "disabled"}>Publish Teams</button><button class="btn ghost admin-event-action" data-id="${event.id}" data-action="view" ${canReview ? "" : "disabled"}>Review Teams</button></div></td></tr>`;
      }).join("") || '<tr><td colspan="4">No events created.</td></tr>';
      document.querySelectorAll(".admin-event-action").forEach((button) => button.addEventListener("click", () => {
        const teamSize = Number(document.querySelector(`.portal-team-size[data-event-id="${button.dataset.id}"]`)?.value || 0);
        adminAction(button.dataset.id, button.dataset.action, teamSize);
      }));
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function loadAdminPlayers() {
    try {
      const {players} = await api("admin/players");
      $("players-body").innerHTML = players.map((player) => `<tr><td>${escapeHtml(player.in_game_name)}</td><td>${escapeHtml(player.discord_name)}</td><td>${escapeHtml(new Date(player.created_at).toLocaleDateString())}</td><td>${player.active ? "Active" : "Inactive"}</td></tr>`).join("") || '<tr><td colspan="4">No registered players yet.</td></tr>';
    } catch (error) { setStatus(error.message, "error"); }
  }

  async function adminAction(eventId, action, teamSize = null) {
    if (action === "view") return loadEventTeams(eventId);
    setStatus("Updating the event…");
    try {
      await api("admin/action", {method:"POST", body:JSON.stringify({eventId, action, teamSize})});
      const successMessage = {open:"Check-in is open. Players can now confirm attendance in the Player Portal.",close:"Check-in is closed. Choose the format and generate teams.",publish:"Teams are published in the Player Portal and on Tonight’s Teams."}[action];
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
