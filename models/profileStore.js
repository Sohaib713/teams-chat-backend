/**
 * Persistent user-profile store.
 *
 * Profiles live in `backend/data/profiles.json` so they survive a server
 * restart, and are cached in memory for synchronous reads. Every write is
 * flushed to disk (atomic rename) and listeners are notified so the socket
 * layer can broadcast changes to connected clients.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'profiles.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/** Fields a client is allowed to write. Everything else is server-owned. */
export const EDITABLE_FIELDS = ['name', 'role', 'statusText', 'avatar', 'email', 'status'];

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';

let cache = null;

const load = () => {
  if (cache) return cache;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      cache = parsed && typeof parsed === 'object' ? parsed : {};
    } else {
      cache = {};
    }
  } catch (error) {
    console.warn('[profiles] could not read profiles.json, starting empty:', error.message);
    cache = {};
  }
  return cache;
};

const persist = () => {
  try {
    // Write-then-rename so a crash mid-write cannot truncate the store.
    const tmp = `${DATA_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  } catch (error) {
    console.error('[profiles] failed to persist profiles:', error.message);
  }
};

/** Strip anything the client should not control (e.g. socketId). */
const sanitise = (input = {}) => {
  const out = {};
  EDITABLE_FIELDS.forEach((field) => {
    if (typeof input[field] === 'string' && input[field].trim()) {
      out[field] = input[field].trim();
    }
  });
  return out;
};

export const DEFAULT_PROFILE = Object.freeze({
  role: 'Software Engineer',
  status: 'online',
  statusText: 'Available',
  email: 'user@company.com',
  avatar: DEFAULT_AVATAR,
});

/** Returns the stored profile for `id`, merged over the defaults. */
export const getProfile = (id) => {
  if (!id) return null;
  const store = load();
  const stored = store[id] || {};
  return { id, ...DEFAULT_PROFILE, ...stored };
};

/** All known profiles as `{ id, ...profile }` records. */
export const getAllProfiles = () =>
  Object.keys(load()).map((id) => getProfile(id));

/**
 * Merges `patch` into the stored profile and persists it.
 * @returns {{profile: object, changed: string[]}}
 */
export const updateProfile = (id, patch = {}) => {
  if (!id) return null;

  const store = load();
  const before = getProfile(id);
  const clean = sanitise(patch);

  // Never blank out an existing avatar with an empty string.
  if (!clean.avatar) delete clean.avatar;

  const next = { ...before, ...clean };
  const changed = Object.keys(clean).filter((k) => before[k] !== next[k]);

  store[id] = next;
  persist();

  return { profile: { id, ...next }, changed };
};

/**
 * Applies any stored profile fields onto a freshly connected/registered user
 * so a returning user keeps their picture and name after a page reload.
 */
export const hydrateUser = (userData = {}) => {
  if (!userData.id) return userData;

  const stored = load()[userData.id];
  // Nothing persisted yet: keep whatever the client sent (seed/demo data).
  if (!stored) return userData;

  // The server is authoritative once a profile has been saved, so a custom
  // picture or display name survives re-registering from another device.
  // Live presence is deliberately left to the socket layer.
  const merged = { ...userData };
  ['avatar', 'name', 'role', 'statusText', 'email'].forEach((field) => {
    if (stored[field]) merged[field] = stored[field];
  });

  return merged;
};

export const AVATAR_STORAGE_SUBDIR = 'avatars';