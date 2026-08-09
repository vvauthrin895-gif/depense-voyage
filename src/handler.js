const TIMEZONE = 'Africa/Casablanca';

export function casablancaTime(now = new Date()) {
  const time = new Intl.DateTimeFormat('fr-FR', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  const date = new Intl.DateTimeFormat('fr-FR', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);

  return { time, date, iso: now.toISOString(), timezone: TIMEZONE };
}

function pageHtml() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Heure à Casablanca</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: linear-gradient(135deg, #0b5d2e 0%, #1a9e4f 100%);
      color: #ffffff;
      font-family: system-ui, -apple-system, sans-serif;
      text-align: center;
      padding: 20px;
    }
    h1 { font-size: 1.4rem; font-weight: 500; opacity: 0.95; }
    #clock {
      font-size: clamp(4rem, 16vw, 9rem);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: 2px;
      text-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
    }
    #date { font-size: clamp(1.1rem, 4vw, 1.6rem); opacity: 0.92; }
    footer { margin-top: 40px; font-size: 0.85rem; opacity: 0.7; }
    a { color: #ffffff; }
  </style>
</head>
<body>
  <h1>🕒 Heure à Casablanca</h1>
  <div id="clock">--:--:--</div>
  <div id="date"></div>
  <footer><a href="/api/time">Voir la réponse JSON →</a></footer>
  <script>
    function update() {
      const now = new Date();
      const opts = { timeZone: 'Africa/Casablanca', hour12: false };
      document.getElementById('clock').textContent =
        new Intl.DateTimeFormat('fr-FR', { ...opts, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now);
      document.getElementById('date').textContent =
        new Intl.DateTimeFormat('fr-FR', { ...opts, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
    }
    update();
    setInterval(update, 1000);
  </script>
</body>
</html>`;
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// Handler HTTP réutilisable : utilisé tel quel par la fonction serverless
// Vercel (api/index.js) et par le serveur local (server.js).
export function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(pageHtml());
  }

  if (req.method === 'GET' && url.pathname === '/api/time') {
    return send(res, 200, casablancaTime());
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { status: 'ok', ...casablancaTime() });
  }

  send(res, 404, { error: 'Route introuvable' });
}
