import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

let server;
let baseUrl;
const port = 3210;

before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port) },
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

after(() => {
  server.kill();
});

test("GET / renvoie une page HTML verte avec l'heure", async () => {
  const res = await fetch(baseUrl + '/');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /background: linear-gradient\(135deg, #0b5d2e/);
  assert.match(html, /Heure à Casablanca/);
  assert.match(html, /Africa\/Casablanca/);
});

test("GET /api/time renvoie l'heure de Casablanca", async () => {
  const res = await fetch(`${baseUrl}/api/time`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.timezone, 'Africa/Casablanca');
  assert.match(body.time, /^\d{2}:\d{2}:\d{2}$/);
  assert.ok(body.date);
  assert.ok(body.iso);
});

test('route inconnue → 404', async () => {
  const res = await fetch(`${baseUrl}/inconnu`);
  assert.equal(res.status, 404);
});
