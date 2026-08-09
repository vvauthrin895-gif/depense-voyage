import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

let dataDir;
let server;
let baseUrl;

async function start() {
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'expenses-api-'));
  process.env.DATA_DIR = dataDir;
  await start();
});

afterEach(async () => {
  delete process.env.DATA_DIR;
  server.close();
  await rm(dataDir, { recursive: true, force: true });
});

async function post(body) {
  const res = await fetch(`${baseUrl}/api/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('POST crée une dépense puis GET la retourne', async () => {
  const { status, body } = await post({
    label: 'Courses',
    amount: 42.5,
    category: 'Alimentation',
    date: '2026-08-03',
  });
  assert.equal(status, 201);
  assert.ok(body.id);

  const res = await fetch(`${baseUrl}/api/expenses`);
  const all = await res.json();
  assert.equal(all.length, 1);
  assert.equal(all[0].label, 'Courses');
});

test('POST rejette une dépense invalide', async () => {
  const { status, body } = await post({ label: '', amount: 0 });
  assert.equal(status, 400);
  assert.ok(Array.isArray(body.errors));
});

test('GET /api/expenses filtre par mois', async () => {
  await post({ label: 'Août', amount: 10, date: '2026-08-01' });
  await post({ label: 'Septembre', amount: 20, date: '2026-09-01' });

  const res = await fetch(`${baseUrl}/api/expenses?month=2026-08`);
  const list = await res.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].label, 'Août');
});

test('GET /api/summary calcule le total par catégorie', async () => {
  await post({ label: 'Courses', amount: 30, category: 'Alimentation', date: '2026-08-01' });
  await post({ label: 'Resto', amount: 20, category: 'Alimentation', date: '2026-08-02' });
  await post({ label: 'Essence', amount: 50, category: 'Transport', date: '2026-08-03' });

  const res = await fetch(`${baseUrl}/api/summary?month=2026-08`);
  const summary = await res.json();
  assert.equal(summary.count, 3);
  assert.equal(summary.total, 100);
  assert.equal(summary.byCategory.Alimentation, 50);
  assert.equal(summary.byCategory.Transport, 50);
});

test('PUT et DELETE fonctionnent', async () => {
  const { body: created } = await post({ label: 'Loyer', amount: 800, date: '2026-08-01' });

  const putRes = await fetch(`${baseUrl}/api/expenses/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 820 }),
  });
  assert.equal(putRes.status, 200);
  assert.equal((await putRes.json()).amount, 820);

  const delRes = await fetch(`${baseUrl}/api/expenses/${created.id}`, { method: 'DELETE' });
  assert.equal(delRes.status, 204);

  const getRes = await fetch(`${baseUrl}/api/expenses/${created.id}`);
  assert.equal(getRes.status, 404);
});

test('GET /api/time renvoie la date et l\'heure courantes', async () => {
  const res = await fetch(`${baseUrl}/api/time`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(body.time, /^\d{2}:\d{2}:\d{2}$/);
  assert.ok(body.iso);
  assert.ok(body.timezone);
  assert.ok(new Date(body.iso).getTime() > 0);
});

test('routes inconnues → 404 et JSON invalide → 400', async () => {
  const notFound = await fetch(`${baseUrl}/api/inconnu`);
  assert.equal(notFound.status, 404);

  const badJson = await fetch(`${baseUrl}/api/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{pas du json',
  });
  assert.equal(badJson.status, 400);
});
