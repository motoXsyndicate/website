(() => {
  const defaults = window.MXS_LIVE_CONFIG || {};
  let cfg = structuredClone ? structuredClone(defaults) : JSON.parse(JSON.stringify(defaults));
  let countdownTimer = null;
  let currentVideoId = null;
  const $ = (id) => document.getElementById(id);
  const safeText = (value, fallback = "") => String(value ?? "").trim() || fallback;
  const validUrl = (value) => /^https?:\/\//i.test(safeText(value));

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"' && quoted && next === '"') {
        cell += '"'; i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(cell); cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else {
        cell += char;
      }
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function normalizeKey(value) {
    return safeText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function centralDateTimeToIso(dateValue, timeValue) {
    const combined = `${safeText(dateValue)} ${safeText(timeValue)}`.trim();
    if (!combined) return "";
    const parsed = new Date(combined);
    if (Number.isNaN(parsed.getTime())) return "";

    const year = parsed.getFullYear();
    const month = parsed.getMonth() + 1;
    const day = parsed.getDate();
    const hour = parsed.getHours();
    const minute = parsed.getMinutes();
    const second = parsed.getSeconds();
    let utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    });
    for (let i = 0; i < 2; i += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(utcGuess))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]));
      const shownAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
      const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
      utcGuess += desiredAsUtc - shownAsUtc;
    }
    return new Date(utcGuess).toISOString();
  }

  function extractYouTubeId(value) {
    const input = safeText(value);
    if (!input) return "";
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
    } catch (_) {}
    return "";
  }

  function buildConfigFromRows(rows) {
    // Merge new sheet values into the last successful configuration.
    // This prevents temporary, cached, or partially loaded Google Sheet data
    // from resetting fields back to the website defaults.
    const base = cfg || defaults;
    const next = typeof structuredClone === "function" ? structuredClone(base) : JSON.parse(JSON.stringify(base));
    const map = new Map();
    rows.forEach((row) => {
      const key = normalizeKey(row[0]);
      if (key) map.set(key, safeText(row[1]));
    });

    const get = (...keys) => {
      for (const key of keys) {
        const value = map.get(normalizeKey(key));
        if (value) return value;
      }
      return "";
    };
    const assign = (property, ...keys) => {
      const value = get(...keys);
      if (value) next[property] = value;
    };

    assign("eventTitle", "Event Name", "Event Title");
    assign("eventDate", "Race Date", "Event Date");
    assign("eventTime", "Race Time", "Start Time", "Event Time");
    assign("registrationUrl", "Registration URL", "Registration Link");
    assign("youtubeUrl", "YouTube URL", "YouTube Link", "Livestream URL");
    assign("status", "Broadcast Status", "Status");
    assign("round", "Round");
    assign("track", "Track");
    assign("session", "Session");
    assign("raceClass", "Race Class", "Class");
    assign("raceFormat", "Race Format", "Format");
    assign("server", "Server");
    assign("host", "Host");
    assign("subtitle", "Subtitle");
    assign("announcement", "Announcement", "Broadcast Announcement");
    assign("ticker", "Ticker", "Ticker Text");
    assign("scheduleNote", "Schedule Note");
    assign("resultsUrl", "Results URL", "Results Link");
    assign("discordUrl", "Discord URL", "Discord Link");
    assign("countdownLabel", "Countdown Label");

    next.startTime = next.eventDate && next.eventTime
      ? centralDateTimeToIso(next.eventDate, next.eventTime)
      : next.startTime || defaults.startTime || "";

    const schedule = [];
    for (let i = 1; i <= 8; i += 1) {
      const time = get(`Schedule ${i} Time`);
      const title = get(`Schedule ${i} Title`);
      const detail = get(`Schedule ${i} Detail`);
      if (time || title || detail) schedule.push({ time, title, detail });
    }
    if (schedule.length) next.schedule = schedule;

    const nextEvent = { ...(next.nextEvent || defaults.nextEvent || {}) };
    const nextTitle = get("Next Event Title");
    const nextDescription = get("Next Event Description");
    const nextDate = get("Next Event Date");
    const nextTrack = get("Next Event Track");
    if (nextTitle) nextEvent.title = nextTitle;
    if (nextDescription) nextEvent.description = nextDescription;
    if (nextDate) nextEvent.date = nextDate;
    if (nextTrack) nextEvent.track = nextTrack;
    next.nextEvent = nextEvent;

    return next;
  }

  function setText(id, value, fallback = "") {
    const el = $(id);
    if (el) el.textContent = safeText(value, fallback);
  }

  function setOptionalLink(id, url) {
    const link = $(id);
    if (!link) return;
    if (validUrl(url)) {
      link.href = safeText(url);
      link.hidden = false;
    } else {
      link.removeAttribute("href");
      link.hidden = true;
    }
  }

  function renderStatus() {
    const labels = {
      offline: "OFF AIR", offair: "OFF AIR", "off air": "OFF AIR",
      starting: "STARTING SOON", "starting soon": "STARTING SOON",
      live: "LIVE NOW", "live now": "LIVE NOW",
      intermission: "INTERMISSION",
      ended: "BROADCAST ENDED", "broadcast ended": "BROADCAST ENDED"
    };
    const raw = safeText(cfg.status, "offline").toLowerCase();
    const normalized = raw.replace(/[_-]+/g, " ");
    const status = normalized === "off air" ? "offline" : normalized === "starting soon" ? "starting" : normalized === "live now" ? "live" : normalized === "broadcast ended" ? "ended" : normalized;
    const pill = $("live-status");
    if (pill) {
      pill.textContent = labels[normalized] || labels[status] || safeText(cfg.status, "OFF AIR").toUpperCase();
      pill.dataset.status = ["offline", "starting", "live", "intermission", "ended"].includes(status) ? status : "offline";
    }
  }

  function renderText() {
    setText("event-title", cfg.eventTitle, "MotoXsyndicate Live");
    setText("broadcast-subtitle", cfg.subtitle, "Race coverage, event information, and results—all in one place.");
    setText("event-round", cfg.round, "Next Broadcast");
    setText("event-track", cfg.track, "TBA");
    setText("event-session", cfg.session, "Race Coverage");
    setText("event-class", cfg.raceClass, "Open Class");
    setText("event-format", cfg.raceFormat, "Two Motos");
    setText("event-server", cfg.server, "MXS Racing");
    setText("event-host", cfg.host, "MotoXsyndicate");
    setText("event-date", cfg.eventDate, "To Be Announced");
    setText("event-time", cfg.eventTime, "To Be Announced");
    setText("live-announcement", cfg.announcement, "Broadcast information coming soon.");
    setText("schedule-note", cfg.scheduleNote, "Times shown in Central Time.");
    const label = document.querySelector("#countdown-wrap span");
    if (label) label.textContent = safeText(cfg.countdownLabel, "Gate drops in");
  }

  function renderLinks() {
    setOptionalLink("registration-link", cfg.registrationUrl);
    setOptionalLink("results-link", cfg.resultsUrl);
    const discord = $("discord-link");
    if (discord && validUrl(cfg.discordUrl)) discord.href = cfg.discordUrl;
  }

  function renderTicker() {
    const ticker = $("broadcast-ticker");
    const text = $("ticker-text");
    if (!ticker || !text) return;
    if (safeText(cfg.ticker)) {
      text.textContent = cfg.ticker;
      ticker.hidden = false;
    } else {
      ticker.hidden = true;
    }
  }

  function renderYouTube() {
    const player = $("youtube-player");
    const chat = $("youtube-chat");
    const chatTab = $("chat-tab");
    const placeholder = $("stream-placeholder");
    const youtubeLink = $("youtube-link");
    const suppliedUrl = safeText(cfg.youtubeUrl);
    const videoId = extractYouTubeId(suppliedUrl) || safeText(cfg.youtubeVideoId);

    if (videoId) {
      if (videoId !== currentVideoId) {
        player.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&modestbranding=1`;
        const hostname = window.location.hostname || "www.motoxsyndicate.com";
        chat.src = `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&embed_domain=${encodeURIComponent(hostname)}`;
        currentVideoId = videoId;
      }
      player.hidden = false;
      placeholder.hidden = true;
      youtubeLink.href = suppliedUrl || `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
      youtubeLink.hidden = false;
      chatTab.hidden = false;
    } else {
      currentVideoId = null;
      player.hidden = true;
      placeholder.hidden = false;
      chatTab.hidden = true;
      if (validUrl(suppliedUrl)) {
        youtubeLink.href = suppliedUrl;
        youtubeLink.hidden = false;
      } else {
        youtubeLink.removeAttribute("href");
        youtubeLink.hidden = true;
      }
    }
  }

  function renderSchedule() {
    const grid = $("schedule-grid");
    if (!grid) return;
    grid.replaceChildren();
    const schedule = Array.isArray(cfg.schedule) ? cfg.schedule : [];
    const items = schedule.length ? schedule : [{ time: "TBA", title: "Schedule coming soon", detail: "Check back before race night." }];
    items.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = `schedule-card${index === 0 ? " featured" : ""}`;
      const time = document.createElement("span"); time.className = "schedule-time"; time.textContent = safeText(item.time, "TBA");
      const title = document.createElement("h3"); title.textContent = safeText(item.title, "Race Session");
      const detail = document.createElement("p"); detail.textContent = safeText(item.detail, "Event details coming soon");
      card.append(time, title, detail); grid.append(card);
    });
  }

  function renderNextEvent() {
    const next = cfg.nextEvent || {};
    setText("next-event-title", next.title, "More MXS racing coming soon");
    setText("next-event-description", next.description, "The next event will be announced soon.");
    setText("next-event-date", next.date, "Date TBA");
    setText("next-event-track", next.track, "Track TBA");
  }

  function renderSponsors() {
    const grid = $("sponsor-grid");
    if (!grid) return;
    grid.replaceChildren();
    const sponsors = Array.isArray(cfg.sponsors) ? cfg.sponsors : [];
    sponsors.forEach((sponsor) => {
      const card = validUrl(sponsor.url) ? document.createElement("a") : document.createElement("div");
      card.className = `sponsor-card${validUrl(sponsor.url) ? "" : " sponsor-placeholder"}`;
      if (validUrl(sponsor.url)) { card.href = sponsor.url; card.target = "_blank"; card.rel = "noopener"; }
      const name = document.createElement("strong"); name.textContent = safeText(sponsor.name, "MXS PARTNER");
      const label = document.createElement("span"); label.textContent = safeText(sponsor.label, "Broadcast partner");
      card.append(name, label); grid.append(card);
    });
  }

  function renderCountdown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    const wrap = $("countdown-wrap");
    const countdown = $("countdown");
    if (!wrap || !countdown) return;
    const target = cfg.startTime ? new Date(cfg.startTime) : null;
    if (!target || Number.isNaN(target.getTime())) { wrap.hidden = true; return; }
    wrap.hidden = false;
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { countdown.textContent = "Broadcast time reached"; return; }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      countdown.textContent = `${days ? `${days}d ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    };
    tick(); countdownTimer = setInterval(tick, 1000);
  }

  function broadcastIsLive(statusValue = cfg.status) {
    const value = safeText(statusValue, "offline").toLowerCase().replace(/[_-]+/g, " ").trim();
    return value === "live" || value === "live now";
  }

  function publishLiveState() {
    const state = {
      ...cfg,
      broadcastLive: broadcastIsLive(),
      updatedAt: Date.now()
    };
    window.MXS_LIVE_STATE = state;
    window.dispatchEvent(new CustomEvent("mxs:live-config", { detail: state }));
  }

  function render() {
    renderStatus(); renderText(); renderLinks(); renderTicker(); renderYouTube();
    renderSchedule(); renderNextEvent(); renderSponsors(); renderCountdown();
    publishLiveState();
  }

  async function refreshFromSheet() {
    if (!defaults.sheetCsvUrl) { render(); return; }
    try {
      const separator = defaults.sheetCsvUrl.includes("?") ? "&" : "?";
      const response = await fetch(`${defaults.sheetCsvUrl}${separator}cacheBust=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Sheet returned ${response.status}`);
      cfg = buildConfigFromRows(parseCsv(await response.text()));
      render();
      document.documentElement.dataset.sheetStatus = "connected";
    } catch (error) {
      console.warn("MXS Live could not load Google Sheet settings. Keeping the last successful values.", error);
      document.documentElement.dataset.sheetStatus = "error";
    }
  }

  document.querySelectorAll(".broadcast-tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".broadcast-tab").forEach((tab) => tab.classList.remove("active"));
      document.querySelectorAll(".broadcast-panel").forEach((panel) => { panel.classList.remove("active"); panel.hidden = true; });
      button.classList.add("active");
      const target = $(button.dataset.panel);
      if (target) { target.hidden = false; target.classList.add("active"); }
    });
  });

  refreshFromSheet();
  const refreshSeconds = Math.max(5, Number(defaults.sheetRefreshSeconds) || 10);
  setInterval(refreshFromSheet, refreshSeconds * 1000);
})();
