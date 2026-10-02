import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getProfile, getAllProfiles, updateProfile } from '../models/profileStore.js';
import { AVATAR_DIR } from '../config/multerConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mirrors server.js: never derive this from the request Host, which would be
// `localhost:5173` when the call arrives through the Vite proxy.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');

const normalizeAvatarUrl = (value) => {
  if (!value) return value;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  const pathOnly = value.startsWith('/') ? value : `/${value}`;
  return `${PUBLIC_BASE_URL}${pathOnly}`;
};

/** GET /api/users/:userId/profile */
export const getUserProfile = (req, res) => {
  const { userId } = req.params;

  const profile = getProfile(userId);
  if (!profile) {
    return res.status(404).json({ success: false, message: 'Profile not found' });
  }

  return res.status(200).json({
    success: true,
    user: { ...profile, avatar: normalizeAvatarUrl(profile.avatar) },
  });
};

/** GET /api/users/profiles */
export const listProfiles = (req, res) =>
  res.status(200).json({
    success: true,
    users: getAllProfiles().map((p) => ({ ...p, avatar: normalizeAvatarUrl(p.avatar) })),
  });

/**
 * POST /api/user/profile  (JSON)
 * PATCH /api/user/profile  (JSON)
 * Accepts `{ userId, name, role, statusText, avatar, ... }` and persists it.
 * Responds immediately; the socket layer broadcasts the change separately.
 */
export const saveProfile = (req, res) => {
  const body = req.body || {};
  const userId = body.userId || req.query.userId;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId is required' });
  }

  if (typeof body.name === 'string' && !body.name.trim()) {
    return res.status(400).json({ success: false, message: 'Display name cannot be empty.' });
  }

  const result = updateProfile(userId, body);
  if (!result) {
    return res.status(400).json({ success: false, message: 'Could not save profile' });
  }

  return res.status(200).json({
    success: true,
    message: 'Profile updated',
    changed: result.changed,
    user: { ...result.profile, avatar: normalizeAvatarUrl(result.profile.avatar) },
  });
};

/**
 * POST /api/user/avatar  (multipart, field: `avatar`)
 * Stores the image under uploads/avatars/ and returns the public URL.
 */
export const uploadAvatar = (req, res) => {
  const userId = req.params.userId || req.body?.userId;

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No image was uploaded.' });
  }

  const avatarUrl = `${PUBLIC_BASE_URL}/uploads/avatars/${req.file.filename}`;

  // Persist immediately so the URL survives a restart even if the client
  // never follows up with the JSON profile call.
  const result = userId ? updateProfile(userId, { avatar: avatarUrl }) : null;

  return res.status(200).json({
    success: true,
    message: 'Profile picture uploaded',
    avatar: avatarUrl,
    filename: req.file.filename,
    sizeBytes: req.file.size,
    user: result ? { ...result.profile, avatar: normalizeAvatarUrl(result.profile.avatar) } : null,
  });
};

/** DELETE /api/user/avatar */
export const removeAvatar = (req, res) => {
  const userId = req.body?.userId || req.query.userId;
  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId is required' });
  }

  const profile = getProfile(userId);
  const previous = profile?.avatar || '';

  const result = updateProfile(userId, {
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
  });

  // Best-effort cleanup of the old file when it lives on our own disk.
  if (previous.startsWith(`${PUBLIC_BASE_URL}/uploads/avatars/`)) {
    const filename = path.basename(previous);
    const target = path.join(AVATAR_DIR, filename);
    // Guard against path traversal before touching the filesystem.
    if (target.startsWith(AVATAR_DIR) && fs.existsSync(target)) {
      try {
        fs.unlinkSync(target);
      } catch (error) {
        console.warn('[profile] could not delete old avatar:', error.message);
      }
    }
  }

  return res.status(200).json({ success: true, user: result.profile });
};

export { __dirname };