import * as XLSX from 'xlsx';
import { prisma } from './prisma.js';
import { nextReference } from './references.js';

export type ClientImportRow = {
  firstName: string;
  lastName: string;
  email: string;
  phone1: string;
  identityNumber?: string;
};

export async function importClientRows(rows: ClientImportRow[]) {
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const { firstName, lastName, email, phone1, identityNumber } = row;
    if (!firstName || !lastName || !email || !phone1) {
      skipped++;
      continue;
    }
    try {
      if (identityNumber) {
        const exists = await prisma.client.findFirst({ where: { identityNumber } });
        if (exists) {
          skipped++;
          continue;
        }
      }
      const reference = await nextReference('CLI');
      await prisma.client.create({
        data: {
          reference,
          firstName,
          lastName,
          email,
          phone1,
          identityNumber: identityNumber || null,
          identityType: identityNumber ? 'CIN' : null,
          isProspect: true,
        },
      });
      created++;
    } catch (e) {
      errors.push(`${firstName} ${lastName}: ${e instanceof Error ? e.message : 'erreur'}`);
    }
  }

  return { created, skipped, errors };
}

export function parseCsvClientRows(csv: string): ClientImportRow[] {
  const lines = csv.trim().split(/\r?\n/).slice(1);
  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const parts = line.split(';');
      const [firstName, lastName, email, phone1, identityNumber] = parts.map((p) => p?.trim());
      return { firstName, lastName, email, phone1, identityNumber };
    });
}

export function parseExcelClientRows(buffer: Buffer): ClientImportRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];

  const raw = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' });
  if (!raw.length) return [];

  const header = raw[0].map((c) => String(c).toLowerCase().trim());
  const hasHeader =
    header.some((h) => h.includes('prénom') || h.includes('prenom')) ||
    header.some((h) => h.includes('nom')) ||
    header.some((h) => h.includes('email'));

  const dataRows = hasHeader ? raw.slice(1) : raw;
  const col = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  if (hasHeader) {
    const iFirst = col(['prénom', 'prenom', 'firstname']);
    const iLast = col(['nom', 'lastname']);
    const iEmail = col(['email', 'e-mail', 'mail']);
    const iPhone = col(['téléphone', 'telephone', 'tel', 'phone', 'tél']);
    const iCin = col(['cin', 'n° pièce', 'piece', 'identité', 'identite']);
    return dataRows
      .filter((r) => r.some((c) => String(c).trim()))
      .map((r) => ({
        firstName: String(iFirst >= 0 ? r[iFirst] : r[0] ?? '').trim(),
        lastName: String(iLast >= 0 ? r[iLast] : r[1] ?? '').trim(),
        email: String(iEmail >= 0 ? r[iEmail] : r[2] ?? '').trim(),
        phone1: String(iPhone >= 0 ? r[iPhone] : r[3] ?? '').trim(),
        identityNumber: String(iCin >= 0 ? r[iCin] : r[4] ?? '').trim() || undefined,
      }));
  }

  return dataRows
    .filter((r) => r.some((c) => String(c).trim()))
    .map((r) => ({
      firstName: String(r[0] ?? '').trim(),
      lastName: String(r[1] ?? '').trim(),
      email: String(r[2] ?? '').trim(),
      phone1: String(r[3] ?? '').trim(),
      identityNumber: String(r[4] ?? '').trim() || undefined,
    }));
}
