import express from 'express';
import { router as expensesRouter, summaryRouter } from './routes/expenses.js';
import { storageBackend } from './store.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), storage: storageBackend() });
  });

  app.get('/api/time', (req, res) => {
    const now = new Date();
    res.json({
      date: now.toISOString().slice(0, 10),
      time: now.toTimeString().slice(0, 8),
      iso: now.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });

  app.get('/', (req, res) => {
    res.type('html').send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>API Dépenses</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #1f2937; }
    h1 { color: #111827; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; font-size: 0.95em; }
    th { background: #f9fafb; }
    .ok { color: #059669; font-weight: 600; }
  </style>
</head>
<body>
  <h1>🤑 API Dépenses</h1>
  <p class="ok">✔ L'API est en ligne</p>
  <h2>Endpoints</h2>
  <table>
    <tr><th>Méthode</th><th>Route</th><th>Description</th></tr>
    <tr><td>POST</td><td><code>/api/expenses</code></td><td>Créer une dépense</td></tr>
    <tr><td>GET</td><td><code>/api/expenses</code></td><td>Lister les dépenses</td></tr>
    <tr><td>GET</td><td><code>/api/expenses?month=YYYY-MM</code></td><td>Dépenses d'un mois</td></tr>
    <tr><td>GET</td><td><code>/api/summary?month=YYYY-MM</code></td><td>Résumé du mois</td></tr>
    <tr><td>GET</td><td><code>/api/time</code></td><td>Heure courante</td></tr>
    <tr><td>GET</td><td><code>/health</code></td><td>Healthcheck</td></tr>
  </table>
  <p><a href="/api/expenses">Voir la liste des dépenses →</a></p>
</body>
</html>`);
  });

  app.use('/api/expenses', expensesRouter);
  app.use('/api/summary', summaryRouter);

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: 'Route introuvable' });
  });

  // erreurs
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON invalide' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  });

  return app;
}
