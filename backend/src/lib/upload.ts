import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { uploadDir } from './uploadPaths.js';

const ALLOWED = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx', '.svg', '.webp'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.includes(ext)) {
      return cb(new Error('Type de fichier non autorisé (PDF, JPG, PNG, DOCX, XLSX, SVG, WEBP)'));
    }
    cb(null, true);
  },
});

const EXCEL_EXT = ['.xlsx', '.xls'];

export const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!EXCEL_EXT.includes(ext)) {
      return cb(new Error('Format Excel requis (.xlsx ou .xls)'));
    }
    cb(null, true);
  },
});
