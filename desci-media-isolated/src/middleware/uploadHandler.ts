import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { TEMP_DIR, THUMBNAIL_FILES_DIR } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_TEMP_DIR = path.resolve(__dirname, '../..', TEMP_DIR);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(BASE_TEMP_DIR, THUMBNAIL_FILES_DIR));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Middleware to determine if it's a file upload or JSON request
export const uploadHandler = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'File upload error' });
    } else if (err) {
      return res.status(500).json({ error: 'Server error during file upload' });
    }
    next();
  });
};
