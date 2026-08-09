import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let dataDir;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'expenses-store-'));
  process.env.DATA_DIR = dataDir;
});

afterEach(async () => {
  delete process.env.DATA_DIR;
  await rm(dataDir, { recursive: true, force: true });
});

test('create puis getAll retourne la dépense', async () => {
  const { create, getAll } = await import('../src/store.js');
  const created = await create({
    label: 'Courses',
    amount: 42.5,
    category: 'Alimentation',
    date: '2026-08-01',
  });
  assert.ok(created.id);
  assert.equal(created.amount, 42.5);

  const all = await getAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].label, 'Courses');
});

test('update modifie les champs et conserve la date de création', async () => {
  const { create, update, getById } = await import('../src/store.js');
  const created = await create({ label: 'Loyer', amount: 800, date: '2026-08-05' });
  const updated = await update(created.id, { amount: 820 });
  assert.equal(updated.amount, 820);
  assert.equal(updated.label, 'Loyer');
  assert.equal(updated.createdAt, created.createdAt);
  assert.ok(updated.updatedAt);

  const fetched = await getById(created.id);
  assert.equal(fetched.amount, 820);
});

test('remove supprime et retourne false si introuvable', async () => {
  const { create, remove, getAll } = await import('../src/store.js');
  const created = await create({ label: 'Test', amount: 5, date: '2026-08-10' });
  assert.equal(await remove(created.id), true);
  assert.equal(await getAll().then((l) => l.length), 0);
  assert.equal(await remove(created.id), false);
});

test('getAll trie par date décroissante', async () => {
  const { create, getAll } = await import('../src/store.js');
  await create({ label: 'Ancien', amount: 1, date: '2026-01-15' });
  await create({ label: 'Récent', amount: 2, date: '2026-08-15' });
  const all = await getAll();
  assert.equal(all[0].label, 'Récent');
  assert.equal(all[1].label, 'Ancien');
});
