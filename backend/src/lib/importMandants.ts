import * as XLSX from 'xlsx';
import { prisma } from './prisma.js';
import { nextReference } from './references.js';

export type MandantImportRow = {
  firstName: string;
  lastName: string;
  email?: string;
  phone1?: string;
  identityNumber?: string;
  identityType?: string;
};

export async function importMandantRows(rows: MandantImportRow[]) {
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const { firstName, lastName, email, phone1, identityNumber, identityType } = row;
    if (!firstName || !lastName) {
      skipped++;
      continue;
    }
    try {
      if (identityNumber) {
        const exists = await prisma.mandant.findFirst({ where: { identityNumber } });
        if (exists) {
          skipped++;
          continue;
        }
      }
      const reference = await nextReference('MAN');
      await prisma.mandant.create({
        data: {
          reference,
          firstName,
          lastName,
          email: email || null,
          phone1: phone1 || null,
          identityNumber: identityNumber || null,
          identityType: identityType || (identityNumber ? 'CIN' : null),
        },
      });
      created++;
    } catch (e) {
      errors.push(`${firstName} ${lastName}: ${e instanceof Error ? e.message : 'erreur'}`);
    }
  }

  return { created, skipped, errors };
}

export function parseCsvMandantRows(csv: string): MandantImportRow[] {
  const lines = csv.trim().split(/\r?\n/).slice(1);
  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const parts = line.split(';');
      const [firstName, lastName, email, phone1, identityNumber, identityType] = parts.map((p) => p?.trim());
      return { firstName, lastName, email, phone1, identityNumber, identityType };
    });
}

export function parseExcelMandantRows(buffer: Buffer): MandantImportRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];

  const raw = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' });
  if (!raw.length) return [];

  const header = raw[0].map((c) => String(c).toLowerCase().trim());
  const hasHeader =
    header.some((h) => h.includes('prénom') || h.includes('prenom')) ||
    header.some((h) => h.includes('nom'));

  const dataRows = hasHeader ? raw.slice(1) : raw;
  const col = (names: string[]) => {
    const i = header.findIndex((h) => names.some((n) => h.includes(n)));
    return i >= 0 ? i : -1;
  };

  const idx = hasHeader
    ? {
        firstName: col(['prénom', 'prenom', 'firstname']),
        lastName: col(['nom', 'lastname']),
        email: col(['email', 'mail']),
        phone1: col(['téléphone', 'telephone', 'phone', 'tel']),
        identityNumber: col(['cin', 'identité', 'identite', 'pièce', 'piece']),
        identityType: col(['type']),
      }
    : { firstName: 0, lastName: 1, email: 2, phone1: 3, identityNumber: 4, identityType: 5 };

  return dataRows
    .map((row) => ({
      firstName: String(row[idx.firstName] ?? '').trim(),
      lastName: String(row[idx.lastName] ?? '').trim(),
      email: String(row[idx.email] ?? '').trim(),
      phone1: String(row[idx.phone1] ?? '').trim(),
      identityNumber: String(row[idx.identityNumber] ?? '').trim(),
      identityType: String(row[idx.identityType] ?? '').trim(),
    }))
    .filter((r) => r.firstName && r.lastName);
}
