import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let server;
let baseUrl;
let dataDir;
const port = 3210;

before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'voyage-api-'));
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
    stdio: 'ignore',
  });
  baseUrl = `http://127.0.0.1:${port}`;
  // attend que le serveur réponde
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("Le serveur n'a pas démarré");
});

after(async () => {
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
});

async function postExpense(body) {
  const res = await fetch(`${baseUrl}/api/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test("GET / renvoie la page avec l'heure Casablanca + France et un fond vert pâle", async () => {
  const res = await fetch(baseUrl + '/');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /background: linear-gradient\(135deg, #d9f2e3/);
  assert.match(html, /Casablanca/);
  assert.match(html, /France/);
  assert.match(html, /dollar\.avif/);
  assert.match(html, /Dépenses du voyage/);
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

  const res = await fetch(`${baseUrl}/api/expenses`);
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
  const bad = await fetch(`${baseUrl}/api/expenses/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '0000', name: 'Hack' }),
  });
  assert.equal(bad.status, 403);

  // bon code → nom modifié
  const ok = await fetch(`${baseUrl}/api/expenses/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '1111', name: 'Taxi aéroport' }),
  });
  assert.equal(ok.status, 200);
  const updated = await ok.json();
  assert.equal(updated.name, 'Taxi aéroport');
  assert.equal(updated.amount, 100);
});

test('route inconnue → 404', async () => {
  const res = await fetch(`${baseUrl}/inconnu`);
  assert.equal(res.status, 404);
});
