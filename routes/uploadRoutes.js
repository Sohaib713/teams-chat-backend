import express from 'express';
import upload, { MAX_FILE_COUNT, MAX_FILE_SIZE_BYTES } from '../config/multerConfig.js';
import { handleFileUpload } from '../controllers/uploadController.js';

const router = express.Router();

// Route supports single or multiple file uploads via Multer .any()
// (every multipart field is accepted, so clients can use "files" or "file").
router.post('/upload', upload.any(), handleFileUpload);

// Advertised limits so the client can validate before burning bandwidth.
router.get('/upload/limits', (req, res) => {
  res.status(200).json({
    success: true,
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
    maxFilesPerRequest: MAX_FILE_COUNT,
  });
});

export default router;
