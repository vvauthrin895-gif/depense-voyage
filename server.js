import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './src/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const TZ_CASABLANCA = 'Africa/Casablanca';
const TZ_FRANCE = 'Europe/Paris';
const CURRENCIES = ['EUR', 'MAD', 'USD', 'GBP'];
const CATEGORIES = ['Alimentation', 'Logement', 'Transport', 'Loisirs', 'Santé', 'Shopping', 'Autre'];
const EDIT_CODE = '1111';

const app = express();
app.use(express.json());

// Image dollar.avif (fond pendant l'ajout d'une dépense)
app.get('/dollar.avif', (req, res) => {
  res.sendFile(path.join(__dirname, 'dollar.avif'));
});

function timeIn(zone, now) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
}

function dateIn(zone, now) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
}

// — Page principale ---------------------------------------------------------
app.get('/', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Voyage — Heure & Dépenses</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      background: linear-gradient(135deg, #d9f2e3 0%, #b7e6c9 100%);
      color: #14532d;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 24px 16px;
    }
    #dollar-bg {
      position: fixed; inset: 0; z-index: -1;
      background:
        linear-gradient(rgba(217, 242, 227, 0.88), rgba(217, 242, 227, 0.88)),
        url('/dollar.avif') center / cover no-repeat;
    }
    #dollar-bg.hidden { display: none; }
    main {
      max-width: 640px;
      margin: 0 auto;
      background: rgba(255, 255, 255, 0.92);
      border-radius: 20px;
      padding: 28px;
      box-shadow: 0 10px 30px rgba(20, 83, 45, 0.15);
    }
    h1 { font-size: 1.4rem; margin-bottom: 18px; text-align: center; }
    h2 { font-size: 1.1rem; margin-bottom: 4px; }
    .clock { text-align: center; margin-bottom: 24px; }
    .zone { margin: 6px 0; }
    .label { display: block; font-size: 0.85rem; opacity: 0.75; }
    .time {
      font-weight: 700; font-variant-numeric: tabular-nums;
      letter-spacing: 1px; text-shadow: 0 2px 8px rgba(20, 83, 45, 0.15);
    }
    #casa-time { font-size: clamp(3rem, 12vw, 5rem); }
    #fr-time { font-size: clamp(1.6rem, 6vw, 2.4rem); }
    #date { margin-top: 8px; font-size: 0.95rem; opacity: 0.8; }
    .expenses-header {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      margin-bottom: 12px;
    }
    button {
      border: none; border-radius: 10px; padding: 10px 14px;
      font-size: 0.9rem; cursor: pointer; font-weight: 600;
    }
    #btn-add { background: #16a34a; color: #fff; }
    #btn-add:hover { background: #15803d; }
    form {
      background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px;
      padding: 16px; display: grid; gap: 10px; margin-bottom: 16px;
    }
    form.hidden { display: none; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; }
    .field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 130px; }
    .field label { font-size: 0.8rem; opacity: 0.8; }
    input, select {
      padding: 9px 10px; border: 1px solid #d1d5db; border-radius: 8px;
      font-size: 0.95rem; font-family: inherit;
    }
    .form-actions { display: flex; gap: 10px; margin-top: 4px; }
    .form-actions button[type="submit"] { background: #16a34a; color: #fff; }
    #btn-cancel { background: #e5e7eb; color: #374151; }
    #totals { font-weight: 700; margin-bottom: 8px; font-size: 0.95rem; }
    ul { list-style: none; display: grid; gap: 8px; }
    li {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px;
      padding: 10px 12px; font-size: 0.92rem; flex-wrap: wrap;
    }
    li .meta { opacity: 0.65; font-size: 0.82rem; }
    li button.edit {
      background: #eef2ff; color: #4338ca; padding: 6px 10px; font-size: 0.8rem;
    }
    #empty { opacity: 0.6; font-style: italic; }
  </style>
</head>
<body>
  <div id="dollar-bg" class="hidden"></div>
  <main>
    <h1>✈️ Mon voyage</h1>

    <section class="clock">
      <div class="zone">
        <span class="label">🇲🇦 Casablanca</span>
        <span class="time" id="casa-time">--:--:--</span>
      </div>
      <div class="zone">
        <span class="label">🇫🇷 France</span>
        <span class="time" id="fr-time">--:--:--</span>
      </div>
      <div id="date"></div>
    </section>

    <section class="expenses">
      <div class="expenses-header">
        <h2>💰 Dépenses du voyage</h2>
        <button id="btn-add">＋ Ajouter une dépense</button>
      </div>

      <form id="expense-form" class="hidden">
        <div class="field">
          <label for="f-name">Nom de la dépense</label>
          <input id="f-name" name="name" type="text" required placeholder="Ex. Restaurant">
        </div>
        <div class="row">
          <div class="field">
            <label for="f-amount">Montant</label>
            <input id="f-amount" name="amount" type="number" step="0.01" min="0.01" required placeholder="0.00">
          </div>
          <div class="field">
            <label for="f-currency">Devise</label>
            <select id="f-currency" name="currency">
              ${CURRENCIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="f-date">Date</label>
            <input id="f-date" name="date" type="date" required>
          </div>
          <div class="field">
            <label for="f-category">Catégorie</label>
            <select id="f-category" name="category">
              ${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit">💾 Enregistrer</button>
          <button type="button" id="btn-cancel">Annuler</button>
        </div>
      </form>

      <div id="totals"></div>
      <ul id="expenses-list"></ul>
      <p id="empty">Aucune dépense pour l'instant.</p>
    </section>
  </main>

  <script>
    const TZ_CASA = 'Africa/Casablanca';
    const TZ_FR = 'Europe/Paris';

    function tick() {
      const now = new Date();
      document.getElementById('casa-time').textContent =
        new Intl.DateTimeFormat('fr-FR', { timeZone: TZ_CASA, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
      document.getElementById('fr-time').textContent =
        new Intl.DateTimeFormat('fr-FR', { timeZone: TZ_FR, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
      document.getElementById('date').textContent =
        new Intl.DateTimeFormat('fr-FR', { timeZone: TZ_CASA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
    }
    tick();
    setInterval(tick, 1000);

    const form = document.getElementById('expense-form');
    const dollarBg = document.getElementById('dollar-bg');

    function openForm() {
      document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
      form.classList.remove('hidden');
      dollarBg.classList.remove('hidden'); // fond dollar pendant l'ajout
    }
    function closeForm() {
      form.reset();
      form.classList.add('hidden');
      dollarBg.classList.add('hidden');
    }

    document.getElementById('btn-add').addEventListener('click', openForm);
    document.getElementById('btn-cancel').addEventListener('click', closeForm);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: form.name.value,
        amount: Number(form.amount.value),
        currency: form.currency.value,
        date: form.date.value,
        category: form.category.value,
      };
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        closeForm();
        await loadExpenses();
      } else {
        const err = await res.json();
        alert('Erreur : ' + (err.errors ? err.errors.join(', ') : err.error));
      }
    });

    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c]));
    }

    async function loadExpenses() {
      const res = await fetch('/api/expenses');
      const list = await res.json();
      document.getElementById('empty').style.display = list.length ? 'none' : 'block';

      const totals = {};
      for (const e of list) totals[e.currency] = (totals[e.currency] || 0) + e.amount;
      document.getElementById('totals').textContent = Object.entries(totals)
        .map(([cur, v]) => 'Total : ' + v.toFixed(2) + ' ' + cur)
        .join('  ·  ');

      const ul = document.getElementById('expenses-list');
      ul.innerHTML = '';
      for (const e of list) {
        const li = document.createElement('li');
        li.innerHTML =
          '<span><strong>' + escapeHtml(e.name) + '</strong> — ' + e.amount.toFixed(2) + ' ' + escapeHtml(e.currency) +
          '<br><span class="meta">' + escapeHtml(e.category) + ' · ' + escapeHtml(e.date) + '</span></span>' +
          '<button class="edit" data-id="' + e.id + '">✏️ Modifier le nom</button>';
        ul.appendChild(li);
      }
      ul.querySelectorAll('button.edit').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const code = prompt('Code pour modifier (1111) :');
          if (code === null) return;
          if (code !== '1111') { alert('Code incorrect ❌'); return; }
          const name = prompt('Nouveau nom :');
          if (name === null || !name.trim()) return;
          const res = await fetch('/api/expenses/' + btn.dataset.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: '1111', name: name.trim() }),
          });
          if (res.ok) await loadExpenses();
          else alert('Erreur : ' + ((await res.json()).error || ''));
        });
      });
    }
    loadExpenses();
  </script>
</body>
</html>`);
});

// — API heure ---------------------------------------------------------------
app.get('/api/time', (req, res) => {
  const now = new Date();
  res.json({
    casablanca: { time: timeIn(TZ_CASABLANCA, now), date: dateIn(TZ_CASABLANCA, now), timezone: TZ_CASABLANCA },
    france: { time: timeIn(TZ_FRANCE, now), date: dateIn(TZ_FRANCE, now), timezone: TZ_FRANCE },
    iso: now.toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// — API dépenses ------------------------------------------------------------
function parseExpense(body) {
  const errors = [];
  const expense = {};
  const input = body ?? {};

  if (typeof input.name !== 'string' || !input.name.trim()) {
    errors.push('name : chaîne non vide requise');
  } else {
    expense.name = input.name.trim();
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push('amount : nombre strictement positif requis');
  } else {
    expense.amount = Math.round(amount * 100) / 100;
  }

  if (input.date !== undefined && input.date !== '') {
    if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      errors.push('date : format YYYY-MM-DD requis');
    } else {
      expense.date = input.date;
    }
  } else {
    expense.date = new Date().toISOString().slice(0, 10);
  }

  if (typeof input.category !== 'string' || !input.category.trim()) {
    errors.push('category : chaîne requise');
  } else {
    expense.category = input.category.trim();
  }

  if (input.currency !== undefined) {
    if (!CURRENCIES.includes(input.currency)) {
      errors.push('currency : valeur invalide (EUR, MAD, USD, GBP)');
    } else {
      expense.currency = input.currency;
    }
  } else {
    expense.currency = 'EUR';
  }

  return { expense, errors };
}

app.get('/api/expenses', async (req, res, next) => {
  try {
    res.json(await store.getAll());
  } catch (err) {
    next(err);
  }
});

app.post('/api/expenses', async (req, res, next) => {
  try {
    const { expense, errors } = parseExpense(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }
    const created = await store.create(expense);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// Modifier le nom d'une dépense — protégé par le code 1111
app.put('/api/expenses/:id', async (req, res, next) => {
  try {
    if (req.body?.code !== EDIT_CODE) {
      return res.status(403).json({ error: 'Code incorrect' });
    }
    if (typeof req.body?.name !== 'string' || !req.body.name.trim()) {
      return res.status(400).json({ error: 'name : chaîne non vide requise' });
    }
    const updated = await store.updateName(req.params.id, req.body.name.trim());
    if (!updated) {
      return res.status(404).json({ error: 'Dépense introuvable' });
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

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

// Pattern officiel Vercel : app.listen (port listener)
app.listen(PORT, () => {
  console.log(`API Voyage démarrée sur http://localhost:${PORT}`);
});
