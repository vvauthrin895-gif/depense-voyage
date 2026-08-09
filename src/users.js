import { readFile, writeFile, mkdir } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ADMIN_USERNAME = 'Victor';
const DEFAULT_ADMIN_PASSWORD = '2580';

// Même logique de stockage que les dépenses (data/users.json en local,
// /tmp sur Vercel — éphémère).
function dataFile() {
  const dir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined
      ? '/tmp/depenses-api'
      : path.join(__dirname, '..', 'data');
  return path.join(dir, 'users.json');
}

async function load() {
  try {
    const raw = await readFile(dataFile(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.users)) {
      throw new Error('Format du fichier utilisateurs invalide');
    }
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { users: [] };
    }
    throw err;
  }
}

async function save(data) {
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(salt + password).digest('hex');
}

function verifyPassword(user, password) {
  const a = Buffer.from(hashPassword(password, user.salt), 'utf8');
  const b = Buffer.from(user.passwordHash, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function makeUser(username, password, role) {
  const salt = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    username,
    salt,
    passwordHash: hashPassword(password, salt),
    role, // 'user' | 'admin'
    createdAt: now,
    updatedAt: now,
  };
}

function toPublic(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// Garantit la présence du compte administrateur Victor (2580) et importe
// AUTH_USER / AUTH_PASS s'ils sont définis explicitement.
export async function ensureSeeded() {
  const data = await load();
  let changed = false;

  if (!data.users.some((u) => u.username === ADMIN_USERNAME)) {
    data.users.push(makeUser(ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD, 'admin'));
    changed = true;
  }

  const envUser = process.env.AUTH_USER;
  const envPass = process.env.AUTH_PASS;
  if (
    (envUser !== undefined || envPass !== undefined) &&
    envUser &&
    envPass &&
    !data.users.some((u) => u.username === envUser)
  ) {
    data.users.push(makeUser(envUser, envPass, 'user'));
    changed = true;
  }

  if (changed) await save(data);
  return data.users;
}

export async function list() {
  const data = await load();
  return data.users.map(toPublic);
}

export async function getByUsername(username) {
  const data = await load();
  const user = data.users.find((u) => u.username === username);
  return user ? toPublic(user) : null;
}

// Vérifie les identifiants ; renvoie { username, role } ou null.
export async function verify(username, password) {
  const data = await load();
  const user = data.users.find((u) => u.username === username);
  if (!user || !verifyPassword(user, String(password))) return null;
  return { username: user.username, role: user.role };
}

export async function create(username, password, role = 'user') {
  const data = await load();
  if (data.users.some((u) => u.username === username)) {
    const err = new Error("Ce nom d'utilisateur existe déjà");
    err.code = 'DUPLICATE';
    throw err;
  }
  const user = makeUser(username, password, role);
  data.users.push(user);
  await save(data);
  return toPublic(user);
}

export async function update(username, { password, role } = {}) {
  const data = await load();
  const user = data.users.find((u) => u.username === username);
  if (!user) return null;
  if (password !== undefined) {
    user.salt = crypto.randomBytes(16).toString('hex');
    user.passwordHash = hashPassword(password, user.salt);
  }
  if (role !== undefined) user.role = role;
  user.updatedAt = new Date().toISOString();
  await save(data);
  return toPublic(user);
}

export async function remove(username) {
  const data = await load();
  const index = data.users.findIndex((u) => u.username === username);
  if (index === -1) return false;
  data.users.splice(index, 1);
  await save(data);
  return true;
}
