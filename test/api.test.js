import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let server;
let baseUrl;
let dataDir;
let cookie = '';
const port = 3210;
const ADMIN = { username: 'admin', password: 'voyage2026' }; // compte de repli (AUTH_USER/AUTH_PASS)

// fetch avec un cookie de session (authentifié)
async function apiFetch(route, options = {}, useCookie = cookie) {
  const headers = { ...(options.headers || {}) };
  if (useCookie) headers.Cookie = useCookie;
  return fetch(baseUrl + route, { ...options, headers });
}

async function loginAs(username, password) {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const setCookie = res.headers.get('set-cookie');
  return {
    status: res.status,
    body: await res.json().catch(() => ({})),
    cookie: setCookie ? setCookie.split(';')[0] : '',
  };
}

before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'voyage-api-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
    stdio: 'ignore',
  });
  baseUrl = `http://127.0.0.1:${port}`;
  // attend que le serveur réponde
  let up = false;
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        up = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!up) throw new Error("Le serveur n'a pas démarré");

  // connexion du compte de repli pour les tests authentifiés
  const login = await loginAs(ADMIN.username, ADMIN.password);
  if (login.status !== 200) throw new Error('Login de test échoué');
  cookie = login.cookie;
});

after(async () => {
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
});

async function postExpense(body) {
  const res = await apiFetch('/api/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('sans authentification : page de connexion + API refusée', async () => {
  const page = await fetch(baseUrl + '/');
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /Se connecter/);
  assert.doesNotMatch(html, /Dépenses du voyage/);

  const res = await fetch(`${baseUrl}/api/expenses`);
  assert.equal(res.status, 401);
});

test('login avec de mauvais identifiants → 401', async () => {
  const { status } = await loginAs('admin', 'mauvais');
  assert.equal(status, 401);
});

test('anti force-brute : verrouillage après plusieurs échecs', async () => {
  const username = 'bruteforce-user';
  // 5 échecs successifs → 401 à chaque fois
  for (let i = 0; i < 5; i++) {
    const { status } = await loginAs(username, 'mauvais');
    assert.equal(status, 401);
  }
  // 6e tentative (même avec un mot de passe quelconque) → 429 + délai
  const blocked = await loginAs(username, 'peu-importe');
  assert.equal(blocked.status, 429);
  assert.ok(blocked.body.retryAfter > 0);
});

test('anti force-brute : un succès réinitialise le compteur', async () => {
  const username = 'reset-user';
  const { cookie: victorCookie } = await loginAs('Victor', '2580');
  const created = await apiFetch(
    '/api/users',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'secret1' }),
    },
    victorCookie
  );
  assert.equal(created.status, 201);

  // 2 échecs (sous le seuil de 5)
  for (let i = 0; i < 2; i++) {
    assert.equal((await loginAs(username, 'mauvais')).status, 401);
  }
  // connexion réussie → le compteur repart de zéro
  assert.equal((await loginAs(username, 'secret1')).status, 200);
  // 3 nouveaux échecs ne suffisent pas à verrouiller (sinon on serait à 5)
  for (let i = 0; i < 3; i++) {
    assert.equal((await loginAs(username, 'mauvais')).status, 401);
  }
  assert.equal((await loginAs(username, 'secret1')).status, 200);
});

test("GET / authentifié renvoie la page avec l'heure Casablanca + France et le bouton CSV", async () => {
  const res = await apiFetch('/');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /background: linear-gradient\(135deg, #d9f2e3/);
  assert.match(html, /Casablanca/);
  assert.match(html, /France/);
  assert.match(html, /dollar\.avif/);
  assert.match(html, /Dépenses du voyage/);
  assert.match(html, /Exporter CSV/);
  assert.match(html, /btn-logout/);
  assert.doesNotMatch(html, /href="\/admin"/); // le compte de repli n'est pas admin
});

test('Victor / 2580 se connecte en tant qu\'administrateur', async () => {
  const { status, body, cookie: victorCookie } = await loginAs('Victor', '2580');
  assert.equal(status, 200);
  assert.equal(body.role, 'admin');

  // la page principale lui affiche le lien vers la gestion des utilisateurs
  const page = await apiFetch('/', {}, victorCookie);
  const html = await page.text();
  assert.match(html, /href="\/admin"/);
  assert.match(html, /👥 Utilisateurs/);
});

test('un utilisateur simple ne peut pas gérer les utilisateurs', async () => {
  const res = await apiFetch('/api/users');
  assert.equal(res.status, 403);
});

test("l'administrateur crée, liste et protège contre les doublons", async () => {
  const { cookie: victorCookie } = await loginAs('Victor', '2580');

  const created = await apiFetch(
    '/api/users',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Marie', password: 'secret1', role: 'user' }),
    },
    victorCookie
  );
  assert.equal(created.status, 201);

  const dup = await apiFetch(
    '/api/users',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Marie', password: 'secret1' }),
    },
    victorCookie
  );
  assert.equal(dup.status, 409);

  const list = await apiFetch('/api/users', {}, victorCookie);
  const users = await list.json();
  assert.ok(users.some((u) => u.username === 'Victor' && u.role === 'admin'));
  assert.ok(users.some((u) => u.username === 'Marie' && u.role === 'user'));
  assert.ok(users.every((u) => u.passwordHash === undefined && u.salt === undefined));
});

test("l'administrateur change le mot de passe d'un utilisateur", async () => {
  const { cookie: victorCookie } = await loginAs('Victor', '2580');

  const res = await apiFetch(
    '/api/users/Marie',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'abcd' }),
    },
    victorCookie
  );
  assert.equal(res.status, 200);

  const login = await loginAs('Marie', 'abcd');
  assert.equal(login.status, 200);
  assert.equal(login.body.role, 'user');
});

test('garde-fous : dernier admin et auto-suppression', async () => {
  const { cookie: victorCookie } = await loginAs('Victor', '2580');

  // retirer le rôle admin du dernier administrateur → refusé
  const demote = await apiFetch(
    '/api/users/Victor',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user' }),
    },
    victorCookie
  );
  assert.equal(demote.status, 400);

  // se supprimer soi-même → refusé
  const self = await apiFetch('/api/users/Victor', { method: 'DELETE' }, victorCookie);
  assert.equal(self.status, 400);

  // supprimer un autre utilisateur → OK
  const del = await apiFetch('/api/users/Marie', { method: 'DELETE' }, victorCookie);
  assert.equal(del.status, 200);
  const list = await apiFetch('/api/users', {}, victorCookie);
  const users = await list.json();
  assert.ok(!users.some((u) => u.username === 'Marie'));
});

test("l'administrateur peut promouvoir un utilisateur", async () => {
  const { cookie: victorCookie } = await loginAs('Victor', '2580');

  await apiFetch(
    '/api/users',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Marie', password: 'secret1' }),
    },
    victorCookie
  );

  const res = await apiFetch(
    '/api/users/Marie',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    },
    victorCookie
  );
  assert.equal(res.status, 200);

  const login = await loginAs('Marie', 'secret1');
  assert.equal(login.status, 200);
  assert.equal(login.body.role, 'admin');
});

test('page /admin : réservée à l\'administrateur', async () => {
  // Victor → 200
  const { cookie: victorCookie } = await loginAs('Victor', '2580');
  const adminPage = await apiFetch('/admin', {}, victorCookie);
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /Gestion des utilisateurs/);

  // utilisateur simple → redirection
  const userPage = await apiFetch('/admin', { redirect: 'manual' }, cookie);
  assert.equal(userPage.status, 302);

  // non connecté → redirection
  const anon = await fetch(baseUrl + '/admin', { redirect: 'manual' });
  assert.equal(anon.status, 302);
});

test('GET /api/time renvoie l\'heure de Casablanca et de France', async () => {
  const res = await fetch(`${baseUrl}/api/time`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.casablanca.timezone, 'Africa/Casablanca');
  assert.match(body.casablanca.time, /^\d{2}:\d{2}:\d{2}$/);
  assert.equal(body.france.timezone, 'Europe/Paris');
  assert.match(body.france.time, /^\d{2}:\d{2}:\d{2}$/);
  assert.ok(body.iso);
});

test('POST crée une dépense avec devise puis GET la retourne', async () => {
  const { status, body } = await postExpense({
    name: 'Resto',
    amount: 45.5,
    currency: 'MAD',
    date: '2026-08-09',
    category: 'Alimentation',
  });
  assert.equal(status, 201);
  assert.ok(body.id);
  assert.equal(body.currency, 'MAD');

  const res = await apiFetch('/api/expenses');
  const list = await res.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Resto');
});

test('POST rejette une dépense invalide', async () => {
  const { status, body } = await postExpense({ name: '', amount: -3, currency: 'XXX' });
  assert.equal(status, 400);
  assert.ok(Array.isArray(body.errors));
});

test('PUT modifie le nom uniquement avec le code 1111', async () => {
  const { body: created } = await postExpense({
    name: 'Taxi',
    amount: 100,
    currency: 'EUR',
    date: '2026-08-09',
    category: 'Transport',
  });

  // mauvais code → 403
  const bad = await apiFetch(`/api/expenses/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '0000', name: 'Hack' }),
  });
  assert.equal(bad.status, 403);

  // bon code → nom modifié
  const ok = await apiFetch(`/api/expenses/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '1111', name: 'Taxi aéroport' }),
  });
  assert.equal(ok.status, 200);
  const updated = await ok.json();
  assert.equal(updated.name, 'Taxi aéroport');
  assert.equal(updated.amount, 100);
});

test('GET /api/expenses/export.csv renvoie toutes les données en CSV', async () => {
  const res = await apiFetch('/api/expenses/export.csv');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/csv/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM UTF-8 pour Excel
  const csv = buf.toString('utf8').replace(/^\uFEFF/, '');
  assert.match(csv, /^id;name;amount;currency;date;category;createdAt;updatedAt/m);
  assert.match(csv, /Resto;45\.5;MAD;2026-08-09;Alimentation/);
  assert.match(csv, /Taxi aéroport;100;EUR;2026-08-09;Transport/);
});

test("chaque utilisateur n'a accès qu'à ses propres dépenses", async () => {
  const { cookie: victorCookie } = await loginAs('Victor', '2580');

  // dépense créée par Victor
  const v = await apiFetch(
    '/api/expenses',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dépense privée de Victor', amount: 10, currency: 'EUR', date: '2026-08-09', category: 'Autre' }),
    },
    victorCookie
  );
  assert.equal(v.status, 201);

  // Victor la voit, l'autre utilisateur ne la voit pas
  const victorList = await (await apiFetch('/api/expenses', {}, victorCookie)).json();
  assert.ok(victorList.some((e) => e.name === 'Dépense privée de Victor'));
  const adminList = await (await apiFetch('/api/expenses')).json();
  assert.ok(!adminList.some((e) => e.name === 'Dépense privée de Victor'));

  // Victor ne peut pas modifier une dépense de l'autre utilisateur (404)
  const adminExpense = adminList.find((e) => e.name === 'Resto');
  assert.ok(adminExpense);
  const hijack = await apiFetch(
    `/api/expenses/${adminExpense.id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '1111', name: 'Volé' }),
    },
    victorCookie
  );
  assert.equal(hijack.status, 404);

  // l'export CSV de Victor ne contient que ses dépenses
  const csv = await (await apiFetch('/api/expenses/export.csv', {}, victorCookie)).text();
  assert.match(csv, /Dépense privée de Victor/);
  assert.doesNotMatch(csv, /Resto/);
});

test('CSV export sans authentification → 401', async () => {
  const res = await fetch(`${baseUrl}/api/expenses/export.csv`);
  assert.equal(res.status, 401);
});

test('route inconnue → 404', async () => {
  const res = await fetch(`${baseUrl}/inconnu`);
  assert.equal(res.status, 404);
});
