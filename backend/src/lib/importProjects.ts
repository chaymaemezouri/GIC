import * as XLSX from 'xlsx';
import { prisma } from './prisma.js';
import { nextReference } from './references.js';
import {
  collapseName,
  findProjectDuplicate,
  type ImportDuplicate,
  type SeenPerson,
} from './importDuplicates.js';

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
  const duplicates: ImportDuplicate[] = [];
  const seen = new Map<string, SeenPerson>();

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const line = index + 2;
    const { name, ownershipType, city, address, description, remark, status } = row;
    const trimmed = name?.trim();
    if (!trimmed) {
      skipped++;
      continue;
    }
    const replay = {
      path: '/immobilier/projects',
      body: {
        name: trimmed,
        ownershipType: ownershipType || 'personnel',
        city: city?.trim() || null,
        address: address?.trim() || null,
        description: description?.trim() || null,
        remark: remark?.trim() || null,
        status: status?.trim() || 'actif',
      },
    };
    const key = collapseName(trimmed);
    const prior = seen.get(key);
    const existing = prior || (await findProjectDuplicate(trimmed));
    if (existing) {
      skipped++;
      duplicates.push({
        line,
        incomingName: trimmed,
        matchKind: 'projectName',
        matchValue: trimmed,
        existing,
        replay,
      });
      continue;
    }
    try {
      const reference = await nextReference('PRJ');
      const project = await prisma.project.create({
        data: {
          reference,
          name: trimmed,
          ownershipType: normalizeOwnershipType(ownershipType),
          city: city?.trim() || null,
          address: address?.trim() || null,
          description: description?.trim() || null,
          remark: remark?.trim() || null,
          status: status?.trim() || 'actif',
        },
      });
      seen.set(key, {
        id: project.id,
        label: 'Projet',
        name: project.name,
        ref: project.reference,
        deletePath: `/immobilier/projects/${project.id}`,
      });
      created++;
    } catch (e) {
      skipped++;
      errors.push(`${trimmed}: ${e instanceof Error ? e.message : 'erreur'}`);
    }
  }

  return { created, skipped, errors, duplicates };
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
