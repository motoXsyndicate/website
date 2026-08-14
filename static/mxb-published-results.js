(function () {
  "use strict";
  const roundContainer = document.getElementById("mxb-published-results");
  const seriesContainer = document.getElementById("mxb-published-series");
  if (!roundContainer && !seriesContainer) return;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g,(char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const normalize = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g,"");
  const motoSort = (value) => { const number=parseInt(value,10); return Number.isFinite(number) && number>0 ? number : 999; };
  const formatDate = (value) => { const date=new Date(value); return Number.isNaN(date.getTime()) ? "Official MXS result" : `Published ${new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric",year:"numeric"}).format(date)}`; };
  function orderedRiders(payload) {
    return (payload.riders || []).map((rider) => ({...rider,points:Number(rider.points)||0})).sort((a,b) => b.points-a.points || motoSort(a.moto2)-motoSort(b.moto2) || motoSort(a.moto1)-motoSort(b.moto1) || String(a.name).localeCompare(String(b.name)));
  }
  function championshipStandings(series) {
    const data=series.data || {};
    const riders=new Map();
    (data.baseline || []).forEach((rider) => {
      const key=normalize(rider.guid) || normalize(rider.name);
      if (key) riders.set(key,{guid:rider.guid || "",number:rider.number || "",name:rider.name || "Unknown Rider",starting:Number(rider.points ?? rider.starting ?? rider.total)||0,roundPoints:0});
    });
    Object.values(data.rounds || {}).forEach((round) => (round.riders || []).forEach((rider) => {
      const key=normalize(rider.guid) || normalize(rider.name);
      if (!key) return;
      const existing=riders.get(key) || {guid:rider.guid || "",number:rider.number || "",name:rider.name || "Unknown Rider",starting:0,roundPoints:0};
      existing.guid=existing.guid || rider.guid || "";
      existing.number=existing.number || rider.number || "";
      existing.name=existing.name || rider.name || "Unknown Rider";
      existing.roundPoints+=Number(rider.points)||0;
      riders.set(key,existing);
    }));
    return [...riders.values()].map((rider) => ({...rider,total:rider.starting+rider.roundPoints})).sort((a,b) => b.total-a.total || b.roundPoints-a.roundPoints || a.name.localeCompare(b.name));
  }
  function renderRound(round) {
    const riders = orderedRiders(round.payload);
    const podium = riders.slice(0,3);
    const flyer = round.flyerUrl ? `<a class="published-flyer" href="${escapeHtml(round.flyerUrl)}" target="_blank" rel="noopener"><img src="${escapeHtml(round.flyerUrl)}" alt="${escapeHtml(round.roundName)} ${escapeHtml(round.className)} results flyer" loading="lazy"></a>` : "";
    return `<article class="published-result-card">${flyer}<div class="published-result-copy"><div class="published-result-head"><div><span>${escapeHtml(round.className)}</span><h2>${escapeHtml(round.roundName)}</h2><p>${escapeHtml(round.eventInfo || formatDate(round.updatedAt))}</p></div><strong>${riders.length} riders</strong></div><div class="published-podium">${podium.map((rider,index) => `<div><span>${index+1}${index===0?"st":index===1?"nd":"rd"}</span><strong>${escapeHtml(rider.name)}</strong><small>${escapeHtml(rider.moto1 || "—")}–${escapeHtml(rider.moto2 || "—")} · ${rider.points} pts</small></div>`).join("")}</div><details><summary>View full results</summary><div class="published-table-wrap"><table class="published-table"><thead><tr><th>Overall</th><th>#</th><th>Rider</th><th>Moto 1</th><th>Moto 2</th><th>Points</th></tr></thead><tbody>${riders.map((rider,index) => `<tr><td>${index+1}</td><td>${rider.number ? `#${escapeHtml(rider.number)}` : "—"}</td><td>${escapeHtml(rider.name)}</td><td>${escapeHtml(rider.moto1 || "—")}</td><td>${escapeHtml(rider.moto2 || "—")}</td><td>${rider.points}</td></tr>`).join("")}</tbody></table></div></details><p class="published-date">${escapeHtml(formatDate(round.updatedAt))}</p></div></article>`;
  }
  function renderSeries(series) {
    const standings=championshipStandings(series);
    const podium=standings.slice(0,3);
    const rounds=Object.keys(series.data?.rounds || {}).length;
    const flyer=series.flyerUrl ? `<a class="published-flyer" href="${escapeHtml(series.flyerUrl)}" target="_blank" rel="noopener"><img src="${escapeHtml(series.flyerUrl)}" alt="${escapeHtml(series.name)} ${escapeHtml(series.className)} championship standings flyer" loading="lazy"></a>` : "";
    return `<article class="published-result-card">${flyer}<div class="published-result-copy"><div class="published-result-head"><div><span>${escapeHtml(series.className)} Championship</span><h2>${escapeHtml(series.name)}</h2><p>${rounds} completed round${rounds===1?"":"s"}</p></div><strong>${standings.length} riders</strong></div><div class="published-podium">${podium.map((rider,index) => `<div><span>${index+1}${index===0?"st":index===1?"nd":"rd"}</span><strong>${escapeHtml(rider.name)}</strong><small>${rider.total} total pts</small></div>`).join("")}</div><details><summary>View overall standings</summary><div class="published-table-wrap"><table class="published-table"><thead><tr><th>Position</th><th>#</th><th>Rider</th><th>Round points</th><th>Total</th></tr></thead><tbody>${standings.map((rider,index) => `<tr><td>${index+1}</td><td>${rider.number ? `#${escapeHtml(rider.number)}` : "—"}</td><td>${escapeHtml(rider.name)}</td><td>${rider.roundPoints}</td><td>${rider.total}</td></tr>`).join("")}</tbody></table></div></details><p class="published-date">${escapeHtml(formatDate(series.updatedAt))}</p></div></article>`;
  }
  async function load(path) {
    const response=await fetch(`/api/mxb/public/${path}`,{headers:{Accept:"application/json"}});
    const data=await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Official results could not be loaded.");
    return data;
  }
  if (seriesContainer) load("series").then((data) => {
    seriesContainer.innerHTML=data.series?.length ? data.series.map(renderSeries).join("") : '<div class="results-empty"><h2>No championship standings posted yet</h2><p>Approved hosts can publish updated overall standings from the Championship Manager.</p></div>';
  }).catch((caught) => { seriesContainer.innerHTML=`<div class="results-empty"><h2>Standings temporarily unavailable</h2><p>${escapeHtml(caught.message)}</p></div>`; });
  if (roundContainer) load("rounds").then((data) => {
    roundContainer.innerHTML=data.rounds?.length ? data.rounds.map(renderRound).join("") : '<div class="results-empty"><h2>No one-time event results posted yet</h2><p>Series rounds stay private; this area is only for standalone events.</p></div>';
  }).catch((caught) => { roundContainer.innerHTML=`<div class="results-empty"><h2>Results temporarily unavailable</h2><p>${escapeHtml(caught.message)}</p></div>`; });
})();
