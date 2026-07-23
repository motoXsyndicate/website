<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>MXS Broadcast Overlay</title>
  <link rel="stylesheet" href="/overlay/overlay.css?v=20260722a">
</head>
<body>
  <main class="overlay" aria-live="polite">
    <section class="top-left-card">
      <div class="brand-row">
        <span class="mxs-badge">MXS</span>
        <span id="status" class="status" data-status="offline">OFF AIR</span>
      </div>
      <div class="event-copy">
        <h1 id="event-title">MotoXsyndicate Outdoor Championship</h1>
        <div class="event-meta">
          <span id="round">Next Broadcast</span>
          <span class="divider">•</span>
          <span id="track">Track TBA</span>
        </div>
      </div>
    </section>

    <section class="session-card">
      <span class="session-label">CURRENT SESSION</span>
      <strong id="session">Race Coverage</strong>
      <div class="session-meta">
        <span id="race-class">Open Class</span>
        <span class="divider">•</span>
        <span id="race-format">Two Motos</span>
      </div>
    </section>

    <section id="countdown-card" class="countdown-card" hidden>
      <span id="countdown-label">Gate drops in</span>
      <strong id="countdown">00:00:00</strong>
    </section>

    <section id="ticker" class="ticker" hidden>
      <span class="ticker-label">MXS UPDATE</span>
      <div class="ticker-window"><span id="ticker-text"></span></div>
    </section>

    <div class="corner-mark">MOTOXSYNDICATE</div>
  </main>

  <script src="/static/live-config.js?v=20260719c"></script>
  <script src="/overlay/overlay.js?v=20260722a"></script>
</body>
</html>
