(function () {
  "use strict";
  const status = document.getElementById("mxb-cloud-status");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g,(char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  async function api(path, options = {}) {
    const response = await fetch(`/api/mxb/${path}`,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers || {})},...options});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The MXB results service could not complete that request.");
    return payload;
  }
  function setStatus(message, failed = false) {
    if (!status) return;
    status.textContent = message;
    status.style.color = failed ? "#ffb3bf" : "var(--green)";
  }
  function roundPayload() {
    if (!Array.isArray(currentRoundExport) || !currentRoundExport.length) throw new Error("Import or enter both motos and calculate the overall first.");
    const roundName = document.getElementById("eventName").value.trim() || "Round";
    const eventInfo = document.getElementById("eventInfo").value.trim();
    const className = document.getElementById("className").value.trim() || "Class";
    return {type:"mxs-round-v1",roundId:`${className}|${roundName}|${eventInfo}`.toLowerCase(),roundName,eventInfo,className,exportedAt:new Date().toISOString(),riders:currentRoundExport};
  }
  window.publishRoundToWebsite = async function () {
    try {
      const payload = roundPayload();
      setStatus("Publishing round and generating its flyer…");
      await api("admin/rounds",{method:"POST",body:JSON.stringify({payload,published:true})});
      window.pendingRoundFlyerUpload = payload.roundId;
      downloadResultsFlyer();
    } catch (caught) { setStatus(caught.message,true); }
  };
  window.uploadRoundFlyer = async function (blob, roundId) {
    try {
      setStatus("Uploading flyer and finishing the Results page card…");
      const form = new FormData();
      form.append("roundId",roundId);
      form.append("flyer",blob,"results-flyer.png");
      const response = await fetch("/api/mxb/admin/flyer",{method:"POST",credentials:"same-origin",body:form});
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The flyer could not be uploaded.");
      setStatus("Round and flyer published successfully. The image card is now on the public Results page.");
    } catch (caught) { setStatus(`The round was saved, but the flyer upload failed: ${caught.message}`,true); }
  };
  window.mxbSignOut = async function () {
    await api("auth/logout",{method:"POST"}).catch(() => null);
    location.href = "/api/mxb/auth/login";
  };
  async function addHostManager(account) {
    if (!account.isAdmin) return;
    const section = document.createElement("section");
    section.className = "card hiddenPrint";
    section.style.marginTop = "22px";
    section.innerHTML = `<div class="importTitle">MXB Host Permissions</div><div class="small">Approve a Discord user to use the protected results and championship tools. Revoking access blocks future use but keeps published results.</div><div id="mxb-host-list" style="margin-top:12px"></div>`;
    document.querySelector(".wrap").appendChild(section);
    const {users} = await api("admin/hosts");
    const list = section.querySelector("#mxb-host-list");
    list.innerHTML = users.map((user) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #34427e"><div><strong>${escapeHtml(user.discord_name)}</strong><div class="small">${escapeHtml(user.in_game_name || "No rider profile")}${user.is_admin ? " • MXS admin" : ""}</div></div>${user.is_admin ? '<span class="qualified">ADMIN</span>' : `<button class="btn mxb-host-action" data-user="${escapeHtml(user.id)}" data-action="${user.is_host ? "revoke" : "approve"}">${user.is_host ? "Revoke" : "Approve"}</button>`}</div>`).join("");
    list.querySelectorAll(".mxb-host-action").forEach((button) => button.addEventListener("click",async () => {
      button.disabled = true;
      try { await api("admin/hosts",{method:"POST",body:JSON.stringify({userId:button.dataset.user,action:button.dataset.action})}); location.reload(); }
      catch (caught) { setStatus(caught.message,true); button.disabled = false; }
    }));
  }
  (async () => {
    try {
      const account = await api("me");
      if (!account.user) return location.replace("/api/mxb/auth/login");
      if (!account.isAdmin && !account.isHost) throw new Error("Your Discord account has not been approved as an MXB host.");
      setStatus(`Signed in as ${account.user.discord_name}. Completed rounds can be published directly to the website.`);
      await addHostManager(account);
    } catch (caught) { setStatus(caught.message,true); }
  })();
})();
