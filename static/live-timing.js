(() => {
  "use strict";

  const API_URL = "https://mxs-live-api.motoxsyndicate.workers.dev/";
  const REFRESH_MS = 2000;

  const $ = (id) => document.getElementById(id);

  function safe(value, fallback = "—") {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function formatLap(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) return "—";
    const minutes = Math.floor(value / 60);
    const remaining = value - minutes * 60;
    return `${minutes}:${remaining.toFixed(3).padStart(6, "0")}`;
  }

  function formatTimer(milliseconds) {
    const value = Number(milliseconds);
    if (!Number.isFinite(value) || value < 0) return "—";
    const totalSeconds = Math.floor(value / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function cleanTrackName(value) {
    return safe(value, "Track unavailable")
      .replaceAll("_", " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function setConnection(state, label) {
    const dot = $("timing-connection-dot");
    const text = $("timing-connection-text");
    if (dot) dot.dataset.state = state;
    if (text) text.textContent = label;
  }

  function renderEmpty(message) {
    const body = $("timing-leaderboard-body");
    if (!body) return;
    body.innerHTML = `
      <tr class="timing-empty-row">
        <td colspan="7">${message}</td>
      </tr>`;
  }

  function renderRiders(riders) {
    const body = $("timing-leaderboard-body");
    const mobile = $("timing-mobile-list");
    if (!body || !mobile) return;

    body.replaceChildren();
    mobile.replaceChildren();

    if (!riders.length) {
      renderEmpty("No riders are currently on track.");
      mobile.innerHTML = `<div class="timing-mobile-empty">No riders are currently on track.</div>`;
      return;
    }

    const sorted = [...riders].sort((a, b) => {
      const pa = Number(a.position) || 9999;
      const pb = Number(b.position) || 9999;
      return pa - pb;
    });

    sorted.forEach((rider) => {
      const tr = document.createElement("tr");
      if (Number(rider.position) === 1) tr.classList.add("leader-row");

      const gap = Number(rider.position) === 1
        ? "LEADER"
        : safe(rider.gapText, Number(rider.gap) > 0 ? `+${Number(rider.gap).toFixed(3)}` : "—");

      tr.innerHTML = `
        <td class="timing-pos">${safe(rider.position)}</td>
        <td class="timing-number">#${safe(rider.raceNumber)}</td>
        <td class="timing-rider">
          <strong>${safe(rider.name)}</strong>
          <span>${safe(rider.bikeShortName || rider.bikeName, "")}</span>
        </td>
        <td>${safe(rider.laps, "0")}</td>
        <td>${formatLap(rider.lastLapTime)}</td>
        <td>${formatLap(rider.bestLapTime)}</td>
        <td class="timing-gap">${gap}</td>`;
      body.appendChild(tr);

      const card = document.createElement("article");
      card.className = "timing-rider-card";
      if (Number(rider.position) === 1) card.classList.add("leader-card");
      card.innerHTML = `
        <div class="timing-rider-card-top">
          <div class="timing-mobile-position">${safe(rider.position)}</div>
          <div>
            <strong>#${safe(rider.raceNumber)} ${safe(rider.name)}</strong>
            <span>${safe(rider.bikeShortName || rider.bikeName, "")}</span>
          </div>
          <b>${gap}</b>
        </div>
        <div class="timing-rider-stats">
          <span><small>LAPS</small>${safe(rider.laps, "0")}</span>
          <span><small>LAST</small>${formatLap(rider.lastLapTime)}</span>
          <span><small>BEST</small>${formatLap(rider.bestLapTime)}</span>
        </div>`;
      mobile.appendChild(card);
    });
  }

  function renderTiming(payload) {
    if (!payload?.success || !payload?.data) {
      throw new Error(payload?.message || "Timing data unavailable");
    }

    const data = payload.data;
    const session = data.session || {};
    const riders = Array.isArray(data.riders) ? data.riders : [];

    $("timing-session").textContent = safe(session.sessionType, "WAITING");
    $("timing-state").textContent = safe(session.sessionState, "—");
    $("timing-track").textContent = cleanTrackName(session.trackName || session.eventName);
    $("timing-rider-count").textContent = String(riders.filter((r) => r.isConnected !== false).length);
    $("timing-session-timer").textContent = formatTimer(session.sessionTimer);
    $("timing-updated").textContent = `Updated ${new Date(data.timestamp || Date.now()).toLocaleTimeString()}`;

    const bestRider = riders
      .filter((r) => Number(r.bestLapTime) > 0)
      .sort((a, b) => Number(a.bestLapTime) - Number(b.bestLapTime))[0];

    $("timing-fastest-lap").textContent = bestRider ? formatLap(bestRider.bestLapTime) : "—";
    $("timing-fastest-rider").textContent = bestRider ? safe(bestRider.name) : "No timed laps";

    const shell = $("live-timing-shell");
    if (shell) {
      shell.dataset.session = safe(session.sessionType, "waiting").toLowerCase();
      shell.dataset.state = safe(session.sessionState, "unknown").toLowerCase();
    }

    renderRiders(riders);
    setConnection("online", "LIVE DATA");
  }

  async function refreshTiming() {
    try {
      const response = await fetch(`${API_URL}?t=${Date.now()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) throw new Error(`Timing API returned ${response.status}`);
      renderTiming(await response.json());
    } catch (error) {
      console.error("MXS live timing error:", error);
      setConnection("error", "TIMING OFFLINE");
      $("timing-updated").textContent = "Unable to update";
      renderEmpty("Live timing is temporarily unavailable.");
    }
  }

  refreshTiming();
  setInterval(refreshTiming, REFRESH_MS);
})();