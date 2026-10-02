import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_FILE_COUNT = 10;

/** Extensions we refuse outright (executables / disk images). */
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.msi', '.msp', '.jar',
  '.dll', '.sys', '.vbs', '.ps1', '.sh', '.so', '.dmg', '.iso', '.apk',
]);

/** Strips directories, control characters and keeps a safe base name. */
const sanitizeBaseName = (originalName) => {
  const ext = path.extname(originalName || '');
  const base = path
    .basename(originalName || 'file', ext)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 80);

  return base || 'file';
};

/** Lower-cased extension without the dot, e.g. `pdf`. */
export const getExtension = (filename) =>
  path.extname(filename || '').replace('.', '').toLowerCase();

// Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    // Preserve the real extension, defaulting to .bin when the browser omits it.
    const ext = path.extname(file.originalname || '') || guessExtensionFromMime(file.mimetype);
    cb(null, `${sanitizeBaseName(file.originalname)}-${uniqueSuffix}${ext}`);
  }
});

function guessExtensionFromMime(mimetype = '') {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'application/zip': '.zip',
  };
  return map[mimetype] || '.bin';
}

// File Filter Validation
// Deliberately permissive: browsers report wildly inconsistent MIME types
// (`.docx` is sometimes `application/octet-stream`, `.csv` is `text/csv`).
// Anything that is not a known-dangerous executable is accepted and then
// classified by the controller.
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (BLOCKED_EXTENSIONS.has(ext)) {
    const error = new Error(`File type "${ext}" is not allowed.`);
    error.name = 'UnsupportedFileTypeError';
    error.code = 'UNSUPPORTED_FILE_TYPE';
    return cb(error, false);
  }

  return cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILE_COUNT,
  },
});

/* ── Avatar uploads ──────────────────────────────────────────────────────
   Profile pictures are stricter than chat attachments: images only, one
   file, 5 MB cap, written to uploads/avatars/ so they are easy to inspect
   and prune independently of message attachments.                      */

export const AVATAR_DIR = path.join(uploadsDir, 'avatars');
if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const AVATAR_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

const AVATAR_MIME_MAP = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** Reject anything that is not a raster image, by MIME *and* extension. */
const avatarFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (!AVATAR_MIME_MAP[mime] || !AVATAR_EXTENSIONS.has(ext)) {
    const error = new Error('Profile pictures must be a PNG, JPG, WEBP or GIF image.');
    error.name = 'UnsupportedFileTypeError';
    error.code = 'UNSUPPORTED_FILE_TYPE';
    return cb(error, false);
  }

  return cb(null, true);
};

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    // Key the filename on the user id when we have one so the newest upload
    // replaces the previous one on disk.
    const userId = sanitizeBaseName(req.params?.userId || req.body?.userId || 'user');
    const ext = (AVATAR_MIME_MAP[(file.mimetype || '').toLowerCase()] ||
      path.extname(file.originalname || '').toLowerCase() ||
      '.png');
    cb(null, `${userId}-${Date.now()}${ext}`);
  },
});

export const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: {
    fileSize: MAX_AVATAR_SIZE_BYTES,
    files: 1,
  },
});

export default upload;
