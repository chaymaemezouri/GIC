import * as XLSX from 'xlsx';
import { prisma } from './prisma.js';
import { nextReference } from './references.js';

export type WorkforceImportRow = {
  firstName: string;
  lastName: string;
  cin?: string;
  phone1?: string;
  category?: string;
  groupe?: string;
  dailySalary?: number;
  declared?: boolean;
  contractType?: string;
  cnssNumber?: string;
};

export async function importWorkforceRows(rows: WorkforceImportRow[]) {
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const { firstName, lastName, cin, phone1, category, groupe, dailySalary, declared, contractType, cnssNumber } = row;
    if (!firstName || !lastName) {
      skipped++;
      continue;
    }
    try {
      if (cin) {
        const exists = await prisma.workforce.findFirst({ where: { cin } });
        if (exists) {
          skipped++;
          continue;
        }
      }
      const reference = await nextReference('MO');
      await prisma.workforce.create({
        data: {
          reference,
          firstName,
          lastName,
          cin: cin || null,
          phone1: phone1 || null,
          category: category || null,
          groupe: groupe || null,
          dailySalary: dailySalary ?? 0,
          declared: declared ?? false,
          contractType: contractType || 'Journalier',
          cnssNumber: cnssNumber || null,
          isActive: true,
        },
      });
      created++;
    } catch (e) {
      errors.push(`${firstName} ${lastName}: ${e instanceof Error ? e.message : 'erreur'}`);
    }
  }

  return { created, skipped, errors };
}

function parseDeclared(v: string | undefined): boolean {
  const s = String(v || '').trim().toLowerCase();
  return s === 'oui' || s === 'true' || s === '1' || s === 'yes';
}

export function parseCsvWorkforceRows(csv: string): WorkforceImportRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const rows: WorkforceImportRow[] = [];
  for (const line of lines) {
    const parts = line.split(';').map((p) => p.trim());
    if (parts.length < 2) continue;
    const [firstName, lastName, cin, phone1, category, groupe, dailySalary, declared, contractType, cnssNumber] = parts;
    if (firstName.toLowerCase() === 'prénom' || firstName.toLowerCase() === 'prenom') continue;
    rows.push({
      firstName,
      lastName,
      cin,
      phone1,
      category,
      groupe,
      dailySalary: dailySalary ? Number(dailySalary) : 0,
      declared: parseDeclared(declared),
      contractType,
      cnssNumber,
    });
  }
  return rows;
}

export function parseExcelWorkforceRows(buffer: Buffer): WorkforceImportRow[] {
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
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  if (hasHeader) {
    const iFirst = col(['prénom', 'prenom', 'firstname']);
    const iLast = col(['nom', 'lastname']);
    const iCin = col(['cin']);
    const iPhone = col(['téléphone', 'telephone', 'tel', 'phone', 'tél']);
    const iCat = col(['catégorie', 'categorie', 'category']);
    const iGrp = col(['groupe', 'group']);
    const iSalary = col(['salaire', 'salaire/j', 'daily']);
    const iDeclared = col(['cnss', 'déclaré', 'declare', 'declared']);
    const iContract = col(['contrat', 'contract']);
    const iCnss = col(['n° cnss', 'cnss', 'num cnss']);
    return dataRows
      .filter((r) => r.some((c) => String(c).trim()))
      .map((r) => ({
        firstName: String(iFirst >= 0 ? r[iFirst] : r[0] ?? '').trim(),
        lastName: String(iLast >= 0 ? r[iLast] : r[1] ?? '').trim(),
        cin: String(iCin >= 0 ? r[iCin] : r[2] ?? '').trim() || undefined,
        phone1: String(iPhone >= 0 ? r[iPhone] : r[3] ?? '').trim() || undefined,
        category: String(iCat >= 0 ? r[iCat] : r[4] ?? '').trim() || undefined,
        groupe: String(iGrp >= 0 ? r[iGrp] : r[5] ?? '').trim() || undefined,
        dailySalary: Number(iSalary >= 0 ? r[iSalary] : r[6] ?? 0) || 0,
        declared: parseDeclared(String(iDeclared >= 0 ? r[iDeclared] : r[7] ?? '')),
        contractType: String(iContract >= 0 ? r[iContract] : r[8] ?? '').trim() || undefined,
        cnssNumber: String(iCnss >= 0 ? r[iCnss] : r[9] ?? '').trim() || undefined,
      }));
  }

  return dataRows
    .filter((r) => r.some((c) => String(c).trim()))
    .map((r) => ({
      firstName: String(r[0] ?? '').trim(),
      lastName: String(r[1] ?? '').trim(),
      cin: String(r[2] ?? '').trim() || undefined,
      phone1: String(r[3] ?? '').trim() || undefined,
      category: String(r[4] ?? '').trim() || undefined,
      groupe: String(r[5] ?? '').trim() || undefined,
      dailySalary: Number(r[6] ?? 0) || 0,
      declared: parseDeclared(String(r[7] ?? '')),
      contractType: String(r[8] ?? '').trim() || undefined,
      cnssNumber: String(r[9] ?? '').trim() || undefined,
    }));
}
