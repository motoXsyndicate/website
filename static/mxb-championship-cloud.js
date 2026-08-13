(function () {
  "use strict";
  const cloudStatus = document.getElementById("cloudStatus");
  let saveTimer = null;
  async function api(path, options = {}) {
    const response = await fetch(`/api/mxb/${path}`,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers || {})},...options});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The MXB championship service could not complete that request.");
    return payload;
  }
  function cloudMessage(message, failed = false) {
    cloudStatus.textContent = message;
    cloudStatus.className = `status${failed ? " warning" : ""}`;
  }
  window.queueMxbCloudSave = function (database, selectedId) {
    clearTimeout(saveTimer);
    if (!selectedId || !database.series[selectedId]) return;
    cloudMessage("Saving championship…");
    saveTimer = setTimeout(async () => {
      try {
        await api("admin/series",{method:"POST",body:JSON.stringify({id:selectedId,data:database.series[selectedId],published:true})});
        cloudMessage("Championship saved to the website.");
      } catch (caught) { cloudMessage(caught.message,true); }
    },500);
  };
  window.mxbSignOut = async function () {
    await api("auth/logout",{method:"POST"}).catch(() => null);
    location.href = "/api/mxb/auth/login";
  };
  window.importPublishedRounds = async function () {
    const selected = currentSeries();
    if (!selected) return cloudMessage("Load or create a championship first.",true);
    try {
      const {rounds} = await api("public/rounds");
      const matches = rounds.filter((round) => norm(round.className) === norm(selected.className));
      matches.forEach((round) => { selected.rounds[round.payload.roundId] = round.payload; });
      saveDb();
      cloudMessage(`Imported ${matches.length} published ${selected.className} round${matches.length === 1 ? "" : "s"}.`);
    } catch (caught) { cloudMessage(caught.message,true); }
  };
  (async () => {
    try {
      const account = await api("me");
      if (!account.user) return location.replace("/api/mxb/auth/login");
      if (!account.isAdmin && !account.isHost) throw new Error("Your Discord account has not been approved as an MXB host.");
      const response = await api("admin/series");
      response.series.forEach((entry) => { db.series[entry.id] = entry.data; });
      const ids = Object.keys(db.series);
      if (ids.length) { currentId = ids[0]; selectSeries(currentId); }
      else { renderSeriesSelect(); render(); }
      cloudMessage(`Signed in as ${account.user.discord_name}. Shared championships are loaded.`);
    } catch (caught) { cloudMessage(caught.message,true); }
  })();
})();
