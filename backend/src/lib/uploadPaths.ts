import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// src/lib ou dist/lib → racine backend/
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Dossier uploads absolu (toujours relatif au dossier backend/, pas au cwd). */
export function resolveUploadDir(envPath = process.env.UPLOAD_DIR || './uploads') {
  const dir = path.isAbsolute(envPath) ? envPath : path.resolve(backendRoot, envPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const uploadDir = resolveUploadDir();
