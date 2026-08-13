(async function () {
  "use strict";
  try {
    const response = await fetch("/api/mxb/me",{credentials:"same-origin",headers:{Accept:"application/json"}});
    if (!response.ok) return;
    const account = await response.json();
    if (account?.user && (account.isAdmin || account.isHost)) document.getElementById("mxb-organizer-link")?.removeAttribute("hidden");
  } catch {}
})();
