(function () {
  "use strict";
  const tabs = document.getElementById("series-tabs");
  const board = document.getElementById("series-board");
  const roundList = document.getElementById("round-list");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g,(char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const norm = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g,"");
  async function get(path) {
    const response = await fetch(`/api/mxb/${path}`,{headers:{Accept:"application/json"}});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Results are temporarily unavailable.");
    return data;
  }
  function aggregate(series) {
    const people = [];
    const find = (rider) => people.find((person) => (rider.guid && person.guid === rider.guid) || norm(person.name) === norm(rider.name));
    for (const rider of series.baseline || []) {
      let person = find(rider);
      if (!person) { person = {guid:rider.guid || "",number:rider.number || "",name:rider.name,starting:0,roundPoints:0}; people.push(person); }
      person.starting += Number(rider.points) || 0;
    }
    for (const round of Object.values(series.rounds || {})) for (const rider of round.riders || []) {
      let person = find(rider);
      if (!person) { person = {guid:rider.guid || "",number:rider.number || "",name:rider.name,starting:0,roundPoints:0}; people.push(person); }
      if (!person.guid && rider.guid) person.guid = rider.guid;
      if (rider.number) person.number = rider.number;
      person.roundPoints += Number(rider.points) || 0;
    }
    return people.map((person) => ({...person,total:person.starting+person.roundPoints})).sort((a,b) => b.total-a.total || b.roundPoints-a.roundPoints || a.name.localeCompare(b.name));
  }
  function showSeries(entry) {
    const standings = aggregate(entry.data);
    tabs.querySelectorAll("button").forEach((button) => button.classList.toggle("active",button.dataset.id === entry.id));
    board.innerHTML = `<div class="mxb-board-head"><div><p class="eyebrow">${escapeHtml(entry.className)}</p><h2>${escapeHtml(entry.name)}</h2></div><span class="mxb-muted">${Object.keys(entry.data.rounds || {}).length} rounds • ${standings.length} riders</span></div>${standings.length ? `<table class="mxb-table"><thead><tr><th>Pos</th><th>#</th><th>Rider</th><th>Round points</th><th>Total</th></tr></thead><tbody>${standings.map((rider,index) => `<tr><td>${index+1}</td><td>${rider.number ? `#${escapeHtml(rider.number)}` : "—"}</td><td>${escapeHtml(rider.name)}</td><td>${rider.roundPoints}</td><td>${rider.total}</td></tr>`).join("")}</tbody></table>` : '<div class="mxb-empty">No riders have scored points yet.</div>'}`;
  }
  (async () => {
    try {
      const [{series},{rounds}] = await Promise.all([get("public/series"),get("public/rounds")]);
      if (series.length) {
        tabs.innerHTML = series.map((entry) => `<button data-id="${escapeHtml(entry.id)}">${escapeHtml(entry.name)} — ${escapeHtml(entry.className)}</button>`).join("");
        tabs.querySelectorAll("button").forEach((button) => button.addEventListener("click",() => showSeries(series.find((entry) => entry.id === button.dataset.id))));
        showSeries(series[0]);
      } else board.innerHTML = '<div class="mxb-empty">No championship has been published yet.</div>';
      roundList.innerHTML = rounds.length ? rounds.slice(0,12).map((round) => `<article class="mxb-round"><p class="eyebrow">${escapeHtml(round.className)}</p><h3>${escapeHtml(round.roundName)}</h3><p class="mxb-muted">${escapeHtml(round.eventInfo || "Official MXS round")}</p><p><strong>${round.payload.riders.length} riders scored</strong></p></article>`).join("") : '<div class="mxb-empty">No rounds have been published yet.</div>';
    } catch (caught) {
      board.innerHTML = `<div class="mxb-empty">${escapeHtml(caught.message)}</div>`;
      roundList.innerHTML = "";
    }
  })();
})();
