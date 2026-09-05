import * as XLSX from 'xlsx';
import { prisma } from './prisma.js';
import { nextReference } from './references.js';

export type ProjectImportRow = {
  name: string;
  ownershipType?: string;
  city?: string;
  address?: string;
  description?: string;
  remark?: string;
  status?: string;
};

function normalizeOwnershipType(v: unknown) {
  const s = String(v || 'personnel').trim().toLowerCase();
  return s === 'client' ? 'client' : 'personnel';
}

export async function importProjectRows(rows: ProjectImportRow[]) {
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const { name, ownershipType, city, address, description, remark, status } = row;
    if (!name?.trim()) {
      skipped++;
      continue;
    }
    try {
      const reference = await nextReference('PRJ');
      await prisma.project.create({
        data: {
          reference,
          name: name.trim(),
          ownershipType: normalizeOwnershipType(ownershipType),
          city: city?.trim() || null,
          address: address?.trim() || null,
          description: description?.trim() || null,
          remark: remark?.trim() || null,
          status: status?.trim() || 'actif',
        },
      });
      created++;
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : 'erreur'}`);
    }
  }

  return { created, skipped, errors };
}

export function parseCsvProjectRows(csv: string): ProjectImportRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  const rows: ProjectImportRow[] = [];
  for (const line of lines) {
    const parts = line.split(';').map((p) => p.trim());
    if (parts.length < 1) continue;
    const [name, ownershipType, city, address, description, remark, status] = parts;
    if (name.toLowerCase() === 'nom' || name.toLowerCase() === 'name') continue;
    rows.push({ name, ownershipType, city, address, description, remark, status });
  }
  return rows;
}

export function parseExcelProjectRows(buffer: Buffer): ProjectImportRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
  return data
    .map((row) => ({
      name: String(row.Nom || row.name || '').trim(),
      ownershipType: String(row.Type || row.ownershipType || '').trim(),
      city: String(row.Ville || row.city || '').trim(),
      address: String(row.Adresse || row.address || '').trim(),
      description: String(row.Description || row.description || '').trim(),
      remark: String(row.Remarque || row.remark || '').trim(),
      status: String(row.Statut || row.status || '').trim(),
    }))
    .filter((r) => r.name);
}
