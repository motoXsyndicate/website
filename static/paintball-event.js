(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const formatDate = (value) => new Intl.DateTimeFormat("en-US", {weekday:"long",month:"long",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(value));
  const show = (id, visible = true) => $(id).classList.toggle("portal-hidden", !visible);

  function renderTeams(assignments) {
    const grouped = {};
    assignments.forEach((row) => { const key = row.is_reserve ? "Reserves" : `Team ${row.team_number}`; (grouped[key] ||= []).push(row.in_game_name); });
    $("public-teams").innerHTML = Object.entries(grouped).map(([team,players]) => `<article class="portal-team"><h3>${escapeHtml(team)}</h3><ul>${players.map((player) => `<li>${escapeHtml(player)}</li>`).join("")}</ul></article>`).join("");
  }

  function renderMatches(matches) {
    show("public-bracket-card", matches.length > 0);
    if (!matches.length) return;
    const roundRobin = matches[0].label?.startsWith("Round Robin");
    $("public-format-title").textContent = roundRobin ? "Round-robin schedule" : "Placement bracket";
    const rounds = {};
    matches.forEach((match) => (rounds[match.round_number] ||= []).push(match));
    const maxRound = Math.max(...matches.map((match) => match.round_number));
    const roundName = (round) => roundRobin ? `Round ${round}` : round === maxRound ? "Placement Finals" : round === maxRound - 1 ? "Semifinals" : round === maxRound - 2 ? "Quarterfinals" : `Round ${round}`;
    $("public-bracket").innerHTML = Object.entries(rounds).map(([round,items]) => `<section class="portal-round"><h3>${roundName(Number(round))}</h3>${items.map((match) => { const completed = match.status === "completed"; const first = match.team1_number ? `Team ${match.team1_number}` : "TBD"; const second = match.team2_number ? `Team ${match.team2_number}` : "TBD"; return `<article class="portal-match"><strong>${escapeHtml(match.label || `Match ${match.match_number}`)}</strong><div class="portal-match-team ${completed && match.winner_team_number === match.team1_number ? "portal-match-winner" : ""}"><span>${first}</span><span>${completed ? match.score1 : "—"}</span></div><div class="portal-match-team ${completed && match.winner_team_number === match.team2_number ? "portal-match-winner" : ""}"><span>${second}</span><span>${completed ? match.score2 : "—"}</span></div><p class="portal-muted">${completed ? `Final · Team ${match.winner_team_number} wins` : match.status === "ready" ? "Ready to play" : "Waiting for earlier results"}</p></article>`; }).join("")}</section>`).join("");
  }

  async function loadEvent() {
    try {
      const eventId = new URLSearchParams(location.search).get("eventId");
      const response = await fetch(`/api/paintball/event/public${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`, {headers:{Accept:"application/json"}});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The event board could not be loaded.");
      show("public-status", false);
      show("public-empty", !data.event); show("public-board", !!data.event);
      if (!data.event) return;
      $("public-event-title").textContent = data.event.title;
      $("public-event-time").textContent = `${formatDate(data.event.starts_at)} · Shown in your local timezone`;
      renderTeams(data.assignments); renderMatches(data.matches);
      show("public-placements-card", data.placements.length > 0);
      $("public-placements").innerHTML = data.placements.map((row) => `<article class="portal-team"><span class="public-place">${row.place}${row.place === 1 ? "st" : row.place === 2 ? "nd" : row.place === 3 ? "rd" : "th"}</span><h3>Team ${row.team_number}</h3></article>`).join("");
    } catch (error) {
      show("public-status", true); $("public-status").textContent = error.message; $("public-status").classList.add("error");
    }
  }
  $("refresh-event").addEventListener("click", loadEvent);
  loadEvent();
  setInterval(loadEvent, 30000);
})();
