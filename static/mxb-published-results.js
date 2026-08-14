(function () {
  "use strict";
  const container = document.getElementById("mxb-published-results");
  if (!container) return;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g,(char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const motoSort = (value) => { const number=parseInt(value,10); return Number.isFinite(number) && number>0 ? number : 999; };
  const formatDate = (value) => { const date=new Date(value); return Number.isNaN(date.getTime()) ? "Official MXS result" : `Published ${new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric",year:"numeric"}).format(date)}`; };
  function orderedRiders(payload) {
    return (payload.riders || []).map((rider) => ({...rider,points:Number(rider.points)||0})).sort((a,b) => b.points-a.points || motoSort(a.moto2)-motoSort(b.moto2) || motoSort(a.moto1)-motoSort(b.moto1) || String(a.name).localeCompare(String(b.name)));
  }
  function renderRound(round) {
    const riders = orderedRiders(round.payload);
    const podium = riders.slice(0,3);
    return `<article class="published-result-card"><div class="published-result-head"><div><span>${escapeHtml(round.className)}</span><h2>${escapeHtml(round.roundName)}</h2><p>${escapeHtml(round.eventInfo || formatDate(round.updatedAt))}</p></div><strong>${riders.length} riders</strong></div><div class="published-podium">${podium.map((rider,index) => `<div><span>${index+1}${index===0?"st":index===1?"nd":"rd"}</span><strong>${escapeHtml(rider.name)}</strong><small>${escapeHtml(rider.moto1 || "—")}–${escapeHtml(rider.moto2 || "—")} · ${rider.points} pts</small></div>`).join("")}</div><details><summary>View full results</summary><div class="published-table-wrap"><table class="published-table"><thead><tr><th>Overall</th><th>#</th><th>Rider</th><th>Moto 1</th><th>Moto 2</th><th>Points</th></tr></thead><tbody>${riders.map((rider,index) => `<tr><td>${index+1}</td><td>${rider.number ? `#${escapeHtml(rider.number)}` : "—"}</td><td>${escapeHtml(rider.name)}</td><td>${escapeHtml(rider.moto1 || "—")}</td><td>${escapeHtml(rider.moto2 || "—")}</td><td>${rider.points}</td></tr>`).join("")}</tbody></table></div></details><p class="published-date">${escapeHtml(formatDate(round.updatedAt))}</p></article>`;
  }
  fetch("/api/mxb/public/rounds",{headers:{Accept:"application/json"}}).then(async (response) => {
    const data=await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Official rounds could not be loaded.");
    container.innerHTML=data.rounds?.length ? data.rounds.map(renderRound).join("") : '<div class="results-empty"><h2>No automatic results posted yet</h2><p>Approved hosts can publish completed rounds directly from the MXS Results Tool.</p></div>';
  }).catch((caught) => { container.innerHTML=`<div class="results-empty"><h2>Results temporarily unavailable</h2><p>${escapeHtml(caught.message)}</p></div>`; });
})();
