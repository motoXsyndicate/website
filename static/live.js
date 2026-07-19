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

  $("event-title").textContent = safeText(cfg.eventTitle, "MotoXsyndicate Live");
  $("event-round").textContent = safeText(cfg.round, "Next Broadcast");
  $("event-track").textContent = safeText(cfg.track, "TBA");
  $("event-session").textContent = safeText(cfg.session, "Race Coverage");
  $("live-announcement").textContent = safeText(cfg.announcement, "Broadcast information coming soon.");

  const discord = $("discord-link");
  discord.href = safeText(cfg.discordUrl, "https://discord.gg/2XXBNqXJwD");

  const setOptionalLink = (id, url) => {
    const link = $(id);
    if (url) {
      link.href = url;
      link.hidden = false;
    } else {
      link.hidden = true;
    }
  };
  setOptionalLink("registration-link", cfg.registrationUrl);
  setOptionalLink("results-link", cfg.resultsUrl);

  const player = $("youtube-player");
  const placeholder = $("stream-placeholder");
  const youtubeLink = $("youtube-link");
  const videoId = safeText(cfg.youtubeVideoId).trim();

  if (videoId) {
    player.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&modestbranding=1`;
    player.hidden = false;
    placeholder.hidden = true;
    youtubeLink.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    youtubeLink.hidden = false;
  } else {
    player.hidden = true;
    placeholder.hidden = false;
    youtubeLink.hidden = true;
  }

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
