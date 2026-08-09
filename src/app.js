import express from 'express';
import { router as expensesRouter, summaryRouter } from './routes/expenses.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
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
