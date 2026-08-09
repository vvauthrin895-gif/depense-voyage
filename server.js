import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './src/store.js';
import * as users from './src/users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const TZ_CASABLANCA = 'Africa/Casablanca';
const TZ_FRANCE = 'Europe/Paris';
const CURRENCIES = ['EUR', 'MAD', 'USD', 'GBP'];
const CATEGORIES = ['Alimentation', 'Logement', 'Transport', 'Loisirs', 'Santé', 'Shopping', 'Autre'];
const EDIT_CODE = '1111';

// Authentification (login / mot de passe) — modifiable via variables d'env
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'voyage2026';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const sessions = new Map(); // token -> { username, role, expiresAt }

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

function isAuthenticated(req) {
  const token = getCookie(req, 'session');
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  req.sessionUser = session.username;
  req.sessionRole = session.role;
  return true;
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'Authentification requise' });
}

function requireAdmin(req, res, next) {
  if (isAuthenticated(req) && req.sessionRole === 'admin') return next();
  return res.status(403).json({ error: "Accès réservé à l'administrateur" });
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createSession(username, role) {
  const now = Date.now();
  for (const [key, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(key);
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, role, expiresAt: now + SESSION_TTL_MS });
  return token;
}

// Vérifie les identifiants : d'abord dans le fichier utilisateurs (géré via
// la page admin), puis en repli le compte AUTH_USER/AUTH_PASS s'il n'est pas
// encore géré dans le fichier.
async function authenticate(username, password) {
  const stored = await users.verify(username, password);
  if (stored) return stored;
  if (safeEqual(username, AUTH_USER) && safeEqual(password, AUTH_PASS)) {
    const existing = await users.getByUsername(username);
    if (!existing) return { username, role: 'user' };
  }
  return null;
}

function setSessionCookie(res, token, maxAgeSeconds = SESSION_TTL_MS / 1000) {
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

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
function mainPageHtml(isAdmin) {
  return `<!DOCTYPE html>
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
    #btn-export { background: #f59e0b; color: #fff; }
    #btn-export:hover { background: #d97706; }
    #btn-logout { background: #fee2e2; color: #b91c1c; }
    #btn-logout:hover { background: #fecaca; }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 18px; }
    .topbar h1 { margin: 0; }
    .topbar-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .admin-link {
      text-decoration: none; background: #eef2ff; color: #4338ca;
      border-radius: 10px; padding: 8px 12px; font-size: 0.85rem; font-weight: 600;
    }
    .admin-link:hover { background: #e0e7ff; }
    .header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
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
    <div class="topbar">
      <h1>✈️ Mon voyage</h1>
      <div class="topbar-actions">
        ${isAdmin ? '<a class="admin-link" href="/admin">👥 Utilisateurs</a>' : ''}
        <button id="btn-logout">Déconnexion</button>
      </div>
    </div>

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
        <div class="header-actions">
          <button id="btn-export">⬇️ Exporter CSV</button>
          <button id="btn-add">＋ Ajouter une dépense</button>
        </div>
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

    // Export de toutes les données en CSV
    document.getElementById('btn-export').addEventListener('click', () => {
      window.location.href = '/api/expenses/export.csv';
    });

    // Déconnexion
    document.getElementById('btn-logout').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/';
    });

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
</html>`;
}

function loginPageHtml() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connexion — Voyage</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      background: linear-gradient(135deg, #d9f2e3 0%, #b7e6c9 100%);
      color: #14532d;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex; align-items: center; justify-content: center; padding: 24px 16px;
    }
    main {
      width: 100%; max-width: 380px;
      background: rgba(255, 255, 255, 0.92);
      border-radius: 20px; padding: 28px;
      box-shadow: 0 10px 30px rgba(20, 83, 45, 0.15);
    }
    h1 { font-size: 1.4rem; margin-bottom: 6px; text-align: center; }
    .sub { text-align: center; opacity: 0.7; font-size: 0.9rem; margin-bottom: 20px; }
    form { display: grid; gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field label { font-size: 0.8rem; opacity: 0.8; }
    input {
      padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px;
      font-size: 0.95rem; font-family: inherit;
    }
    button {
      border: none; border-radius: 10px; padding: 11px 14px;
      font-size: 0.95rem; cursor: pointer; font-weight: 600;
      background: #16a34a; color: #fff;
    }
    button:hover { background: #15803d; }
    .error { color: #b91c1c; font-size: 0.85rem; text-align: center; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <main>
    <h1>🔒 Connexion</h1>
    <p class="sub">Suivi du voyage — heure & dépenses</p>
    <form id="login-form">
      <div class="field">
        <label for="login-user">Nom d'utilisateur</label>
        <input id="login-user" name="user" type="text" autocomplete="username" required>
      </div>
      <div class="field">
        <label for="login-pass">Mot de passe</label>
        <input id="login-pass" name="pass" type="password" autocomplete="current-password" required>
      </div>
      <p id="login-error" class="error hidden"></p>
      <button type="submit">Se connecter</button>
    </form>
  </main>
  <script>
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.user.value, password: form.pass.value }),
      });
      if (res.ok) {
        window.location.href = '/';
      } else {
        const err = await res.json().catch(() => ({}));
        const el = document.getElementById('login-error');
        el.textContent = err.error || 'Erreur de connexion';
        el.classList.remove('hidden');
      }
    });
  </script>
</body>
</html>`;
}

function adminPageHtml() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Utilisateurs — Voyage</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      background: linear-gradient(135deg, #d9f2e3 0%, #b7e6c9 100%);
      color: #14532d;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 24px 16px;
    }
    main {
      max-width: 640px; margin: 0 auto;
      background: rgba(255, 255, 255, 0.92);
      border-radius: 20px; padding: 28px;
      box-shadow: 0 10px 30px rgba(20, 83, 45, 0.15);
    }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 18px; }
    h1 { font-size: 1.3rem; }
    button {
      border: none; border-radius: 10px; padding: 10px 14px;
      font-size: 0.9rem; cursor: pointer; font-weight: 600;
    }
    #btn-back {
      background: #e5e7eb; color: #374151; text-decoration: none; display: inline-block;
    }
    #btn-back:hover { background: #d1d5db; }
    form#add-user {
      background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px;
      padding: 16px; display: grid; gap: 10px; margin-bottom: 20px;
    }
    .row { display: flex; gap: 10px; flex-wrap: wrap; }
    .field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 130px; }
    .field label { font-size: 0.8rem; opacity: 0.8; }
    input, select {
      padding: 9px 10px; border: 1px solid #d1d5db; border-radius: 8px;
      font-size: 0.95rem; font-family: inherit;
    }
    form#add-user button[type="submit"] { background: #16a34a; color: #fff; }
    ul { list-style: none; display: grid; gap: 8px; }
    li {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px;
      padding: 10px 12px; font-size: 0.92rem; flex-wrap: wrap;
    }
    .badge { font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
    .badge.admin { background: #dcfce7; color: #166534; }
    .badge.user { background: #e0e7ff; color: #3730a3; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .actions button { padding: 6px 10px; font-size: 0.8rem; }
    .btn-role { background: #eef2ff; color: #4338ca; }
    .btn-pass { background: #fffbeb; color: #b45309; }
    .btn-del { background: #fee2e2; color: #b91c1c; }
    .msg { margin-top: 12px; font-size: 0.9rem; font-weight: 600; }
    .msg.error { color: #b91c1c; }
    .msg.ok { color: #166534; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <main>
    <div class="topbar">
      <h1>👥 Gestion des utilisateurs</h1>
      <a id="btn-back" href="/">← Retour</a>
    </div>

    <form id="add-user">
      <div class="row">
        <div class="field">
          <label for="u-name">Nom d'utilisateur</label>
          <input id="u-name" type="text" required placeholder="Ex. Marie">
        </div>
        <div class="field">
          <label for="u-pass">Mot de passe</label>
          <input id="u-pass" type="password" required minlength="4" placeholder="Min. 4 caractères">
        </div>
        <div class="field">
          <label for="u-role">Rôle</label>
          <select id="u-role">
            <option value="user">Utilisateur</option>
            <option value="admin">Administrateur</option>
          </select>
        </div>
      </div>
      <button type="submit">＋ Ajouter l'utilisateur</button>
    </form>

    <p id="msg" class="msg hidden"></p>
    <ul id="users-list"></ul>
    <p id="empty">Aucun utilisateur.</p>
  </main>
  <script>
    const listEl = document.getElementById('users-list');
    const emptyEl = document.getElementById('empty');
    const msgEl = document.getElementById('msg');
    const form = document.getElementById('add-user');

    function showMsg(text, ok) {
      msgEl.textContent = text;
      msgEl.classList.remove('hidden', 'error', 'ok');
      msgEl.classList.add(ok ? 'ok' : 'error');
    }

    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c]));
    }

    async function loadUsers() {
      const res = await fetch('/api/users');
      if (!res.ok) {
        showMsg('Erreur : ' + ((await res.json().catch(() => ({}))).error || res.status));
        return;
      }
      const users = await res.json();
      emptyEl.style.display = users.length ? 'none' : 'block';
      listEl.innerHTML = '';
      for (const u of users) {
        const li = document.createElement('li');
        li.innerHTML =
          '<span><strong>' + escapeHtml(u.username) + '</strong> ' +
          '<span class="badge ' + (u.role === 'admin' ? 'admin' : 'user') + '">' +
          (u.role === 'admin' ? 'Admin' : 'Utilisateur') + '</span></span>' +
          '<span class="actions">' +
          '<button class="btn-pass" data-user="' + escapeHtml(u.username) + '">🔑 Mot de passe</button>' +
          '<button class="btn-role" data-user="' + escapeHtml(u.username) + '" data-role="' + u.role + '">' +
          (u.role === 'admin' ? 'Retirer admin' : 'Passer admin') + '</button>' +
          '<button class="btn-del" data-user="' + escapeHtml(u.username) + '">🗑 Supprimer</button>' +
          '</span>';
        listEl.appendChild(li);
      }
      listEl.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const username = btn.dataset.user;
          const url = '/api/users/' + encodeURIComponent(username);
          if (btn.classList.contains('btn-pass')) {
            const pass = prompt('Nouveau mot de passe pour ' + username + ' (min. 4 caractères) :');
            if (!pass || pass.length < 4) return;
            const res = await fetch(url, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password: pass }),
            });
            const body = await res.json().catch(() => ({}));
            if (res.ok) showMsg('Mot de passe modifié ✅', true);
            else showMsg('Erreur : ' + (body.error || (body.errors || []).join(', ') || 'inconnue'));
          } else if (btn.classList.contains('btn-role')) {
            const newRole = btn.dataset.role === 'admin' ? 'user' : 'admin';
            const res = await fetch(url, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: newRole }),
            });
            const body = await res.json().catch(() => ({}));
            if (res.ok) { showMsg('Rôle modifié ✅', true); await loadUsers(); }
            else showMsg('Erreur : ' + (body.error || 'inconnue'));
          } else if (btn.classList.contains('btn-del')) {
            if (!confirm('Supprimer le compte ' + username + ' ?')) return;
            const res = await fetch(url, { method: 'DELETE' });
            const body = await res.json().catch(() => ({}));
            if (res.ok) { showMsg('Compte supprimé ✅', true); await loadUsers(); }
            else showMsg('Erreur : ' + (body.error || 'inconnue'));
          }
        });
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('u-name').value.trim(),
          password: document.getElementById('u-pass').value,
          role: document.getElementById('u-role').value,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        showMsg('Utilisateur créé ✅', true);
        form.reset();
        await loadUsers();
      } else {
        showMsg('Erreur : ' + (body.error || (body.errors || []).join(', ') || 'inconnue'));
      }
    });

    loadUsers();
  </script>
</body>
</html>`;
}

app.get('/', (req, res) => {
  if (!isAuthenticated(req)) {
    return res.type('html').send(loginPageHtml());
  }
  res.type('html').send(mainPageHtml(req.sessionRole === 'admin'));
});

// — Page d'administration des utilisateurs ----------------------------------
app.get('/admin', (req, res) => {
  if (!isAuthenticated(req) || req.sessionRole !== 'admin') {
    return res.redirect('/');
  }
  res.type('html').send(adminPageHtml());
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

// — API authentification -----------------------------------------------------
app.post('/api/login', async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const account = await authenticate(username, password);
    if (!account) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const token = createSession(account.username, account.role);
    setSessionCookie(res, token);
    res.json({ username: account.username, role: account.role });
  } catch (err) {
    next(err);
  }
});

app.post('/api/logout', (req, res) => {
  const token = getCookie(req, 'session');
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/status', (req, res) => {
  const authenticated = isAuthenticated(req);
  res.json({
    authenticated,
    username: authenticated ? req.sessionUser : null,
    role: authenticated ? req.sessionRole : null,
  });
});

// — API utilisateurs (réservée à l'administrateur) --------------------------
app.get('/api/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await users.list());
  } catch (err) {
    next(err);
  }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { username, password, role } = req.body ?? {};
    const errors = [];
    if (typeof username !== 'string' || !username.trim()) {
      errors.push('username : chaîne non vide requise');
    }
    if (typeof password !== 'string' || password.length < 4) {
      errors.push('password : au moins 4 caractères requis');
    }
    const userRole = role === undefined ? 'user' : role;
    if (!['user', 'admin'].includes(userRole)) {
      errors.push('role : user ou admin requis');
    }
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }
    const created = await users.create(username.trim(), password, userRole);
    res.status(201).json(created);
  } catch (err) {
    if (err.code === 'DUPLICATE') {
      return res.status(409).json({ error: err.message });
    }
    next(err);
  }
});

// Modifier le mot de passe et/ou le rôle d'un utilisateur
app.put('/api/users/:username', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { password, role } = req.body ?? {};
    const errors = [];
    if (password !== undefined && (typeof password !== 'string' || password.length < 4)) {
      errors.push('password : au moins 4 caractères requis');
    }
    if (role !== undefined && !['user', 'admin'].includes(role)) {
      errors.push('role : user ou admin requis');
    }
    if (password === undefined && role === undefined) {
      errors.push('password ou role requis');
    }
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const target = await users.getByUsername(req.params.username);
    if (!target) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    // Garde-fou : ne jamais retirer le rôle admin du dernier administrateur
    if (role === 'user' && target.role === 'admin') {
      const admins = (await users.list()).filter((u) => u.role === 'admin');
      if (admins.length <= 1) {
        return res.status(400).json({ error: "Impossible de retirer le rôle admin du dernier administrateur" });
      }
    }

    const updated = await users.update(req.params.username, { password, role });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/users/:username', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (req.params.username === req.sessionUser) {
      return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });
    }
    const target = await users.getByUsername(req.params.username);
    if (!target) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (target.role === 'admin') {
      const admins = (await users.list()).filter((u) => u.role === 'admin');
      if (admins.length <= 1) {
        return res.status(400).json({ error: 'Impossible de supprimer le dernier administrateur' });
      }
    }
    await users.remove(req.params.username);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
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

// — CSV ----------------------------------------------------------------------
function csvField(value) {
  const s = String(value ?? '');
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(expenses) {
  const header = ['id', 'name', 'amount', 'currency', 'date', 'category', 'createdAt', 'updatedAt'];
  const lines = [header.join(';')];
  for (const e of expenses) {
    lines.push(
      [e.id, e.name, e.amount, e.currency, e.date, e.category, e.createdAt ?? '', e.updatedAt ?? '']
        .map(csvField)
        .join(';')
    );
  }
  // BOM UTF-8 pour que Excel ouvre les accents correctement ; séparateur ';'
  return '\uFEFF' + lines.join('\r\n');
}

app.get('/api/expenses', requireAuth, async (req, res, next) => {
  try {
    res.json(await store.getAll());
  } catch (err) {
    next(err);
  }
});

// Export de toutes les dépenses en CSV
app.get('/api/expenses/export.csv', requireAuth, async (req, res, next) => {
  try {
    const list = await store.getAll();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="depenses.csv"');
    res.send(toCsv(list));
  } catch (err) {
    next(err);
  }
});

app.post('/api/expenses', requireAuth, async (req, res, next) => {
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
app.put('/api/expenses/:id', requireAuth, async (req, res, next) => {
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

// S'assure que le compte admin Victor (et l'éventuel compte AUTH_USER) existe
await users.ensureSeeded();

// Pattern officiel Vercel : app.listen (port listener)
app.listen(PORT, () => {
  console.log(`API Voyage démarrée sur http://localhost:${PORT}`);
});
