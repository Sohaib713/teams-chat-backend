import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import uploadRoutes from './routes/uploadRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import registerSocketHandlers from './socket/socketHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Absolute origin the frontend uses to build attachment URLs. It must NOT be
// derived from the incoming request: behind the Vite proxy the Host header is
// `localhost:5173`, which would produce previews pointing at the dev server.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Media browsers can render inline; everything else is forced to download so
// the `download` attribute still works when the asset is cross-origin.
const INLINE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif', '.bmp', '.ico',
  '.mp4', '.webm', '.ogv', '.ogg', '.mp3', '.wav', '.m4a', '.aac', '.flac',
  '.pdf',
]);

const app = express();
const server = http.createServer(app);

// WebSockets with full CORS support so non-proxied clients (LAN IP, packaged
// Electron) can also connect.
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  },
  // Allow clients that arrive over a proxied WebSocket upgrade.
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
  },
});

// Express Middlewares
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition', 'Content-Length'],
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Serve uploaded files with the right disposition + caching headers.
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '7d',
  etag: true,
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!INLINE_EXTENSIONS.has(ext)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

// REST API Endpoints
app.use('/api', uploadRoutes);
app.use('/api', profileRoutes);

// Healthcheck Route
const healthPayload = () => ({
  status: 'online',
  service: 'Microsoft Teams Chat Real-Time Engine',
  version: '1.0.0',
  publicBaseUrl: PUBLIC_BASE_URL,
  socketPath: '/socket.io',
  timestamp: new Date().toISOString(),
});

app.get('/', (req, res) => res.status(200).json(healthPayload()));
app.get('/api/health', (req, res) => res.status(200).json(healthPayload()));

// Attach WebSockets Event Handlers
registerSocketHandlers(io);

// Global Error Handler
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: describeMulterError(err) });
  }

  // Thrown by the Multer fileFilter for explicitly rejected types.
  if (err?.code === 'UNSUPPORTED_FILE_TYPE' || err?.name === 'UnsupportedFileTypeError') {
    return res.status(415).json({ success: false, message: err.message });
  }

  console.error('⚠️ Server Error:', err.message);
  return res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

function describeMulterError(err) {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return err.field === 'avatar'
        ? 'Profile picture exceeds the 5 MB limit.'
        : 'File size exceeds the 50 MB limit.';
    case 'LIMIT_FILE_COUNT':
      return 'Too many files in a single upload.';
    case 'LIMIT_UNEXPECTED_FILE':
      return err.field === 'avatar'
        ? 'Unexpected file field. Use the "avatar" field for profile pictures.'
        : 'Unexpected file field. Use the "files" field for uploads.';
    default:
      return err.message || 'File upload failed.';
  }
}

server.listen(PORT, HOST, () => {
  console.log(`
==================================================
🚀 Teams Real-Time Backend Active
🌐 HTTP Server: http://localhost:${PORT}
⚡ WebSockets: ws://localhost:${PORT}${io.path || '/socket.io'}
📁 Media Uploads: ${PUBLIC_BASE_URL}/uploads/
🔗 Public Base URL: ${PUBLIC_BASE_URL}
==================================================
  `);
});
