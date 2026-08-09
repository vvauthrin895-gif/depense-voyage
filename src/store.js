import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_USERNAME } from './users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// En local : data/expenses.json. Sur Vercel (serverless), le système de
// fichiers est en lecture seule sauf /tmp — on y écrit donc (éphémère).
function dataFile() {
  const dir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined
      ? '/tmp/depenses-api'
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
    // Migration : les dépenses créées avant la séparation par utilisateur
    // sont attribuées au compte administrateur (Victor).
    let migrated = false;
    for (const e of parsed.expenses) {
      if (!e.owner) {
        e.owner = ADMIN_USERNAME;
        migrated = true;
      }
    }
    if (migrated) await save(parsed);
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

// Chaque utilisateur ne voit que ses propres dépenses (champ owner).
export async function getAll(owner) {
  const data = await load();
  return data.expenses
    .filter((e) => e.owner === owner)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function create(expense, owner) {
  const data = await load();
  const item = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    owner,
    ...expense,
  };
  data.expenses.push(item);
  await save(data);
  return item;
}

export async function updateName(id, name, owner) {
  const data = await load();
  const expense = data.expenses.find((e) => e.id === id && e.owner === owner);
  if (!expense) return null;
  expense.name = name;
  expense.updatedAt = new Date().toISOString();
  await save(data);
  return expense;
}
