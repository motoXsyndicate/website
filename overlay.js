(() => {
  const defaults = window.MXS_LIVE_CONFIG || {};
  let cfg = typeof structuredClone === "function" ? structuredClone(defaults) : JSON.parse(JSON.stringify(defaults));
  let countdownTimer = null;
  const $ = (id) => document.getElementById(id);
  const text = (value, fallback = "") => String(value ?? "").trim() || fallback;

  function parseCsv(source) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i], next = source[i + 1];
      if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { row.push(cell); cell = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += char;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  const normalize = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  function centralDateTimeToIso(dateValue, timeValue) {
    const combined = `${text(dateValue)} ${text(timeValue)}`.trim();
    if (!combined) return "";
    const parsed = new Date(combined);
    if (Number.isNaN(parsed.getTime())) return "";
    const y = parsed.getFullYear(), m = parsed.getMonth() + 1, d = parsed.getDate();
    const h = parsed.getHours(), min = parsed.getMinutes(), sec = parsed.getSeconds();
    let guess = Date.UTC(y, m - 1, d, h, min, sec);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    });
    for (let i = 0; i < 2; i += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(guess))
        .filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
      guess += Date.UTC(y, m - 1, d, h, min, sec) - Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    }
    return new Date(guess).toISOString();
  }

  function mergeRows(rows) {
    const next = typeof structuredClone === "function" ? structuredClone(cfg) : JSON.parse(JSON.stringify(cfg));
    const map = new Map();
    rows.forEach((row) => { const key = normalize(row[0]); if (key) map.set(key, text(row[1])); });
    const get = (...keys) => {
      for (const key of keys) { const value = map.get(normalize(key)); if (value) return value; }
      return "";
    };
    const assign = (prop, ...keys) => { const value = get(...keys); if (value) next[prop] = value; };
    assign("eventTitle", "Event Name", "Event Title");
    assign("eventDate", "Race Date", "Event Date");
    assign("eventTime", "Race Time", "Start Time", "Event Time");
    assign("status", "Broadcast Status", "Status");
    assign("round", "Round");
    assign("track", "Track");
    assign("session", "Session");
    assign("raceClass", "Race Class", "Class");
    assign("raceFormat", "Race Format", "Format");
    assign("ticker", "Ticker", "Ticker Text");
    assign("countdownLabel", "Countdown Label");
    next.startTime = next.eventDate && next.eventTime ? centralDateTimeToIso(next.eventDate, next.eventTime) : next.startTime;
    return next;
  }

  function set(id, value, fallback = "") { const el = $(id); if (el) el.textContent = text(value, fallback); }

  function renderStatus() {
    const raw = text(cfg.status, "offline").toLowerCase().replace(/[_-]+/g, " ");
    const normalized = raw === "off air" ? "offline" : raw === "starting soon" ? "starting" : raw === "live now" ? "live" : raw === "broadcast ended" ? "ended" : raw;
    const labels = { offline:"OFF AIR", starting:"STARTING SOON", live:"LIVE NOW", intermission:"INTERMISSION", ended:"BROADCAST ENDED" };
    const el = $("status");
    el.textContent = labels[normalized] || text(cfg.status, "OFF AIR").toUpperCase();
    el.dataset.status = ["offline","starting","live","intermission","ended"].includes(normalized) ? normalized : "offline";
  }

  function renderCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    const card = $("countdown-card"), output = $("countdown");
    const target = cfg.startTime ? new Date(cfg.startTime) : null;
    if (!target || Number.isNaN(target.getTime())) { card.hidden = true; return; }
    card.hidden = false;
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { output.textContent = "00:00:00"; return; }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      output.textContent = `${days ? `${days}d ` : ""}${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
    };
    tick(); countdownTimer = setInterval(tick, 1000);
  }

  function render() {
    renderStatus();
    set("event-title", cfg.eventTitle, "MotoXsyndicate Live");
    set("round", cfg.round, "Next Broadcast");
    set("track", cfg.track, "Track TBA");
    set("session", cfg.session, "Race Coverage");
    set("race-class", cfg.raceClass, "Open Class");
    set("race-format", cfg.raceFormat, "Two Motos");
    set("countdown-label", cfg.countdownLabel, "Gate drops in");
    const ticker = $("ticker");
    if (text(cfg.ticker)) { set("ticker-text", cfg.ticker); ticker.hidden = false; }
    else ticker.hidden = true;
    renderCountdown();
  }

  async function refresh() {
    if (!defaults.sheetCsvUrl) { render(); return; }
    try {
      const sep = defaults.sheetCsvUrl.includes("?") ? "&" : "?";
      const response = await fetch(`${defaults.sheetCsvUrl}${sep}cacheBust=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Sheet returned ${response.status}`);
      cfg = mergeRows(parseCsv(await response.text()));
      render();
      document.documentElement.dataset.sheetStatus = "connected";
    } catch (error) {
      console.warn("MXS overlay could not refresh sheet; keeping last successful values.", error);
      document.documentElement.dataset.sheetStatus = "error";
      render();
    }
  }

  refresh();
  setInterval(refresh, Math.max(5, Number(defaults.sheetRefreshSeconds) || 10) * 1000);
})();
