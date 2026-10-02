import path from 'path';

/**
 * Builds the public origin for attachment URLs.
 *
 * Never derived from the incoming request: behind the Vite dev proxy the Host
 * header is `localhost:5173`, so echoing it back would hand the frontend
 * previews that point at the dev server instead of the upload directory.
 */
const resolveBaseUrl = (req) => {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');

  const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = (req.headers['x-forwarded-host'] || '').split(',')[0].trim();

  const protocol = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host') || `localhost:${process.env.PORT || 5000}`;

  return `${protocol}://${host}`;
};

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico', 'heic']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogv', 'mov', 'mkv', 'avi', 'm4v']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus']);

const extensionOf = (filename) => path.extname(filename || '').replace('.', '').toLowerCase();

/** Classifies an upload so the frontend knows which renderer to use. */
export const classifyFile = (mimetype = '', extension = '') => {
  if (mimetype.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (mimetype.startsWith('video/') || VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (mimetype.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension)) return 'audio';
  return 'document';
};

const humanSize = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
};

export const handleFileUpload = (req, res) => {
  try {
    const files = req.files || (req.file ? [req.file] : []);

    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const baseUrl = resolveBaseUrl(req);

    const uploadedMetadata = files.map((file) => {
      const extension = extensionOf(file.originalname || file.filename);
      const type = classifyFile(file.mimetype, extension);
      const publicUrl = `${baseUrl}/uploads/${encodeURIComponent(file.filename)}`;

      return {
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: file.originalname,
        filename: file.filename,
        type,
        // Same URL serves the inline preview and the download; the static
        // route sets Content-Disposition for anything non-previewable.
        url: publicUrl,
        downloadUrl: publicUrl,
        sizeBytes: file.size,
        size: humanSize(file.size),
        mimeType: file.mimetype,
        extension: extension || 'file',
      };
    });

    console.log(`📁 Successfully uploaded ${uploadedMetadata.length} file(s)`);

    return res.status(200).json({
      success: true,
      message: 'File(s) uploaded successfully',
      baseUrl,
      files: uploadedMetadata
    });

  } catch (error) {
    console.error('File Upload Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'File upload failed'
    });
  }
};
