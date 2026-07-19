(async () => {
  const defaults = window.MXS_LIVE_CONFIG || {};
  const cfg = { ...defaults };
  const $ = (id) => document.getElementById(id);
  const safeText = (value, fallback = "") => String(value || fallback);

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"' && quoted && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }

    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  function extractYouTubeId(value) {
    const input = safeText(value).trim();
    if (!input) return "";

    // Allow a plain 11-character YouTube video ID.
    if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;

    try {
      const url = new URL(input);
      const host = url.hostname.replace(/^www\./, "").toLowerCase();

      if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
      if (host.endsWith("youtube.com")) {
        if (url.pathname === "/watch") return url.searchParams.get("v") || "";
        const parts = url.pathname.split("/").filter(Boolean);
        if (["live", "embed", "shorts"].includes(parts[0])) return parts[1] || "";
      }
    } catch (_) {
      return "";
    }
    return "";
  }

  async function loadSheetSettings() {
    if (!defaults.sheetCsvUrl) return;

    try {
      const response = await fetch(`${defaults.sheetCsvUrl}&cacheBust=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Sheet returned ${response.status}`);

      const rows = parseCsv(await response.text());
      const values = rows.map((row) => safeText(row[1]).trim());

      if (values[0]) cfg.eventTitle = values[0];
      if (values[1]) cfg.startTime = values[1];
      if (values[2]) cfg.registrationUrl = values[2];
      if (values[3]) cfg.youtubeUrl = values[3];
    } catch (error) {
      console.warn("MXS Live could not load Google Sheet settings. Using website defaults.", error);
    }
  }

  await loadSheetSettings();

  const labels = {
    offline: "OFF AIR",
    starting: "STARTING SOON",
    live: "LIVE NOW",
    intermission: "INTERMISSION",
    ended: "BROADCAST ENDED"
  };

  const status = labels[cfg.status] ? cfg.status : "offline";
  const statusPill = $("live-status");
  if (statusPill) {
    statusPill.textContent = labels[status];
    statusPill.dataset.status = status;
  }

  const textMap = {
    "event-title": [cfg.eventTitle, "MotoXsyndicate Live"],
    "broadcast-subtitle": [cfg.subtitle, "Race coverage, event information, and results—all in one place."],
    "event-round": [cfg.round, "Next Broadcast"],
    "event-track": [cfg.track, "TBA"],
    "event-session": [cfg.session, "Race Coverage"],
    "event-class": [cfg.raceClass, "Open Class"],
    "event-format": [cfg.raceFormat, "Two Motos"],
    "event-server": [cfg.server, "MXS Racing"],
    "event-host": [cfg.host, "MotoXsyndicate"],
    "event-date": [cfg.eventDate, "To Be Announced"],
    "event-time": [cfg.eventTime, "To Be Announced"],
    "live-announcement": [cfg.announcement, "Broadcast information coming soon."],
    "schedule-note": [cfg.scheduleNote, "Times shown in Central Time."]
  };

  Object.entries(textMap).forEach(([id, values]) => {
    const el = $(id);
    if (el) el.textContent = safeText(values[0], values[1]);
  });

  const discord = $("discord-link");
  if (discord) discord.href = safeText(cfg.discordUrl, "https://discord.gg/2XXBNqXJwD");

  const setOptionalLink = (id, url) => {
    const link = $(id);
    const cleanUrl = safeText(url).trim();
    if (!link) return;
    if (/^https?:\/\//i.test(cleanUrl)) {
      link.href = cleanUrl;
      link.hidden = false;
    } else {
      link.removeAttribute("href");
      link.hidden = true;
    }
  };

  setOptionalLink("registration-link", cfg.registrationUrl);
  setOptionalLink("results-link", cfg.resultsUrl);

  const ticker = $("broadcast-ticker");
  const tickerText = $("ticker-text");
  if (ticker && tickerText && cfg.ticker) {
    tickerText.textContent = safeText(cfg.ticker);
    ticker.hidden = false;
  }

  const player = $("youtube-player");
  const chat = $("youtube-chat");
  const chatTab = $("chat-tab");
  const placeholder = $("stream-placeholder");
  const youtubeLink = $("youtube-link");
  const suppliedYouTubeUrl = safeText(cfg.youtubeUrl).trim();
  const videoId = extractYouTubeId(suppliedYouTubeUrl) || safeText(cfg.youtubeVideoId).trim();

  if (videoId) {
    player.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&modestbranding=1`;
    player.hidden = false;
    placeholder.hidden = true;
    youtubeLink.href = suppliedYouTubeUrl || `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    youtubeLink.hidden = false;

    const hostname = window.location.hostname || "www.motoxsyndicate.com";
    chat.src = `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&embed_domain=${encodeURIComponent(hostname)}`;
    chatTab.hidden = false;
  } else {
    player.hidden = true;
    placeholder.hidden = false;
    chatTab.hidden = true;

    // A channel or scheduled-stream URL still works as a button, but cannot be embedded.
    if (/^https?:\/\//i.test(suppliedYouTubeUrl)) {
      youtubeLink.href = suppliedYouTubeUrl;
      youtubeLink.hidden = false;
    } else {
      youtubeLink.removeAttribute("href");
      youtubeLink.hidden = true;
    }
  }

  document.querySelectorAll(".broadcast-tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".broadcast-tab").forEach((tab) => tab.classList.remove("active"));
      document.querySelectorAll(".broadcast-panel").forEach((panel) => {
        panel.classList.remove("active");
        panel.hidden = true;
      });
      button.classList.add("active");
      const target = $(button.dataset.panel);
      if (target) {
        target.hidden = false;
        target.classList.add("active");
      }
    });
  });

  const scheduleGrid = $("schedule-grid");
  const schedule = Array.isArray(cfg.schedule) ? cfg.schedule : [];
  if (scheduleGrid) {
    if (schedule.length) {
      scheduleGrid.innerHTML = schedule.map((item, index) => `
        <article class="schedule-card${index === 0 ? " featured" : ""}">
          <span class="schedule-time">${safeText(item.time, "TBA")}</span>
          <h3>${safeText(item.title, "Race Session")}</h3>
          <p>${safeText(item.detail, "Event details coming soon")}</p>
        </article>
      `).join("");
    } else {
      scheduleGrid.innerHTML = '<article class="schedule-card"><span class="schedule-time">TBA</span><h3>Schedule coming soon</h3><p>Check back before race night.</p></article>';
    }
  }

  const nextEvent = cfg.nextEvent || {};
  if ($("next-event-title")) $("next-event-title").textContent = safeText(nextEvent.title, "More MXS racing coming soon");
  if ($("next-event-description")) $("next-event-description").textContent = safeText(nextEvent.description, "The next event will be announced soon.");
  if ($("next-event-date")) $("next-event-date").textContent = safeText(nextEvent.date, "Date TBA");
  if ($("next-event-track")) $("next-event-track").textContent = safeText(nextEvent.track, "Track TBA");

  const sponsorGrid = $("sponsor-grid");
  const sponsors = Array.isArray(cfg.sponsors) ? cfg.sponsors : [];
  if (sponsorGrid) {
    sponsorGrid.innerHTML = sponsors.map((sponsor) => {
      const content = `<strong>${safeText(sponsor.name, "MXS PARTNER")}</strong><span>${safeText(sponsor.label, "Broadcast partner")}</span>`;
      return sponsor.url
        ? `<a class="sponsor-card" href="${sponsor.url}" target="_blank" rel="noopener">${content}</a>`
        : `<div class="sponsor-card sponsor-placeholder">${content}</div>`;
    }).join("");
  }

  const countdownWrap = $("countdown-wrap");
  const countdown = $("countdown");
  const target = cfg.startTime ? new Date(cfg.startTime) : null;
  if (!target || Number.isNaN(target.getTime())) {
    if (countdownWrap) countdownWrap.hidden = true;
    return;
  }

  if (countdownWrap) countdownWrap.hidden = false;
  const tick = () => {
    const diff = target.getTime() - Date.now();
    if (diff <= 0) {
      countdown.textContent = "Broadcast time reached";
      return;
    }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    countdown.textContent = `${days ? `${days}d ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    window.setTimeout(tick, 1000);
  };
  tick();
})();
