(() => {
  const cfg = window.MXS_LIVE_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const safeText = (value, fallback = "") => String(value || fallback);

  const labels = {
    offline: "OFF AIR",
    starting: "STARTING SOON",
    live: "LIVE NOW",
    intermission: "INTERMISSION",
    ended: "BROADCAST ENDED"
  };

  const status = labels[cfg.status] ? cfg.status : "offline";
  const statusPill = $("live-status");
  statusPill.textContent = labels[status];
  statusPill.dataset.status = status;

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
  discord.href = safeText(cfg.discordUrl, "https://discord.gg/2XXBNqXJwD");

  const setOptionalLink = (id, url) => {
    const link = $(id);
    if (!link) return;
    if (url) {
      link.href = url;
      link.hidden = false;
    } else {
      link.hidden = true;
    }
  };
  setOptionalLink("registration-link", cfg.registrationUrl);
  setOptionalLink("results-link", cfg.resultsUrl);

  const ticker = $("broadcast-ticker");
  const tickerText = $("ticker-text");
  if (cfg.ticker) {
    tickerText.textContent = safeText(cfg.ticker);
    ticker.hidden = false;
  }

  const player = $("youtube-player");
  const chat = $("youtube-chat");
  const chatTab = $("chat-tab");
  const placeholder = $("stream-placeholder");
  const youtubeLink = $("youtube-link");
  const videoId = safeText(cfg.youtubeVideoId).trim();

  if (videoId) {
    player.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&modestbranding=1`;
    player.hidden = false;
    placeholder.hidden = true;
    youtubeLink.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    youtubeLink.hidden = false;

    const hostname = window.location.hostname || "www.motoxsyndicate.com";
    chat.src = `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&embed_domain=${encodeURIComponent(hostname)}`;
    chatTab.hidden = false;
  } else {
    player.hidden = true;
    placeholder.hidden = false;
    youtubeLink.hidden = true;
    chatTab.hidden = true;
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

  const nextEvent = cfg.nextEvent || {};
  $("next-event-title").textContent = safeText(nextEvent.title, "More MXS racing coming soon");
  $("next-event-description").textContent = safeText(nextEvent.description, "The next event will be announced soon.");
  $("next-event-date").textContent = safeText(nextEvent.date, "Date TBA");
  $("next-event-track").textContent = safeText(nextEvent.track, "Track TBA");

  const sponsorGrid = $("sponsor-grid");
  const sponsors = Array.isArray(cfg.sponsors) ? cfg.sponsors : [];
  sponsorGrid.innerHTML = sponsors.map((sponsor) => {
    const content = `<strong>${safeText(sponsor.name, "MXS PARTNER")}</strong><span>${safeText(sponsor.label, "Broadcast partner")}</span>`;
    return sponsor.url
      ? `<a class="sponsor-card" href="${sponsor.url}" target="_blank" rel="noopener">${content}</a>`
      : `<div class="sponsor-card sponsor-placeholder">${content}</div>`;
  }).join("");

  const countdownWrap = $("countdown-wrap");
  const countdown = $("countdown");
  const target = cfg.startTime ? new Date(cfg.startTime) : null;
  if (!target || Number.isNaN(target.getTime())) {
    countdownWrap.hidden = true;
    return;
  }

  countdownWrap.hidden = false;
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
    countdown.textContent = `${days ? `${days}d ` : ""}${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
    window.setTimeout(tick, 1000);
  };
  tick();
})();
