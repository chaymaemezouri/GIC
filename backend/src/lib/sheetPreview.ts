import fs from 'fs';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

const SHEET_EXT = new Set(['.xlsx', '.xls', '.csv']);
const WORD_EXT = new Set(['.docx']);

/** Fichier d’upload, sans sortie du dossier. */
export function resolveSafeUpload(relPath: string, roots: string[]) {
  let rel = relPath;
  try { rel = decodeURIComponent(relPath); } catch { /* chemin brut */ }
  rel = rel.replace(/^[/\\]+/, '');
  if (!rel || rel.split(/[/\\]/).includes('..')) return null;
  for (const root of roots) {
    const rootResolved = path.resolve(root);
    const full = path.resolve(rootResolved, rel);
    if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) continue;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

/** Excel / CSV demandé avec ?view=1 → tableau JSON, affiché dans la page. */
export function sheetPreview(roots: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (String(req.query.view || '') !== '1') return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const ext = path.extname(req.path).toLowerCase();
    if (!SHEET_EXT.has(ext) && !WORD_EXT.has(ext)) return next();
    const file = resolveSafeUpload(req.path, roots);
    if (!file) return res.status(404).json({ message: 'Fichier introuvable' });
    try {
      if (WORD_EXT.has(ext)) {
        const result = await mammoth.convertToHtml({ path: file });
        const html = result.value
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
          .replace(/\son\w+=(?:"[^"]*"|'[^']*')/gi, '');
        return res.json({ html });
      }
      const wb = XLSX.readFile(file, { cellDates: false });
      const sheets = wb.SheetNames.slice(0, 8).map((name) => {
        const grid = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(wb.Sheets[name], {
          header: 1,
          raw: false,
          defval: '',
          blankrows: false,
        });
        const rows = grid.slice(0, 300).map((row) => (
          (Array.isArray(row) ? row : []).slice(0, 40).map((cell) => String(cell ?? ''))
        ));
        return { name, rows };
      });
      res.json({ sheets });
    } catch (err) {
      next(err);
    }
  };
}
