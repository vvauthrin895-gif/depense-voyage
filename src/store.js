import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function dataFile() {
  const dir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, '..', 'data');
  return path.join(dir, 'expenses.json');
}

async function load() {
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
