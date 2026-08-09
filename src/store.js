import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// — Stockage -----------------------------------------------------------------
// 1. Vercel KV (Redis managé) si KV_REST_API_URL et KV_REST_API_TOKEN sont
//    définis → persistant, recommandé sur Vercel.
// 2. Sinon, fichier JSON local. Sur Vercel le système de fichiers est en
//    lecture seule (sauf /tmp) : on écrit donc dans /tmp (éphémère).
// 3. En local : data/expenses.json (ou DATA_DIR si défini).

const KV_KEY = 'expenses:data';

function kvConfig() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

function isVercel() {
  return process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined;
}

function dataFile() {
  const dir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : isVercel()
      ? '/tmp/depenses-api'
      : path.join(__dirname, '..', 'data');
  return path.join(dir, 'expenses.json');
}

export function storageBackend() {
  if (kvConfig()) return 'vercel-kv (persistant)';
  if (process.env.DATA_DIR) return 'fichier (DATA_DIR)';
  if (isVercel()) return '/tmp (éphémère sur Vercel)';
  return 'fichier local (data/)';
}

async function kvGet() {
  const { url, token } = kvConfig();
  const res = await fetch(`${url}/json/get/${KV_KEY}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Erreur KV (get) : ${res.status}`);
  const { result } = await res.json();
  return result ?? null;
}

async function kvSet(data) {
  const { url, token } = kvConfig();
  const res = await fetch(`${url}/json/set/${KV_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Erreur KV (set) : ${res.status}`);
}

async function load() {
  if (kvConfig()) {
    const data = await kvGet();
    if (data === null) return { expenses: [] };
    if (!Array.isArray(data.expenses)) {
      throw new Error('Format des données KV invalide');
    }
    return data;
  }
  try {
    const raw = await readFile(dataFile(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.expenses)) {
      throw new Error('Format du fichier de données invalide');
    }
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { expenses: [] };
    }
    throw err;
  }
}

async function save(data) {
  if (kvConfig()) {
    await kvSet(data);
    return;
  }
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

export async function getAll() {
  const data = await load();
  return [...data.expenses].sort((a, b) => b.date.localeCompare(a.date));
}

export async function getById(id) {
  const data = await load();
  return data.expenses.find((e) => e.id === id) ?? null;
}

export async function create(expense) {
  const data = await load();
  const item = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...expense,
  };
  data.expenses.push(item);
  await save(data);
  return item;
}

export async function update(id, patch) {
  const data = await load();
  const index = data.expenses.findIndex((e) => e.id === id);
  if (index === -1) return null;
  data.expenses[index] = {
    ...data.expenses[index],
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  await save(data);
  return data.expenses[index];
}

export async function remove(id) {
  const data = await load();
  const before = data.expenses.length;
  data.expenses = data.expenses.filter((e) => e.id !== id);
  if (data.expenses.length === before) return false;
  await save(data);
  return true;
}
