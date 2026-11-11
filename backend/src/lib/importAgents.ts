import * as XLSX from 'xlsx';
import { prisma } from './prisma.js';
import { nextReference } from './references.js';
import { requiredCinPhoneError } from './requiredContact.js';
import {
  agentSeenKeys,
  findAgentDuplicate,
  type ImportDuplicate,
  type SeenPerson,
} from './importDuplicates.js';

export type AgentImportRow = {
  firstName: string;
  lastName: string;
  email?: string;
  phone1?: string;
  phone2?: string;
  address?: string;
};

export async function importAgentRows(rows: AgentImportRow[]) {
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const duplicates: ImportDuplicate[] = [];
  const seen = new Map<string, SeenPerson>();

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const line = index + 2;
    const { firstName, lastName, email, phone1, phone2, address } = row;
    if (!firstName || !lastName) {
      skipped++;
      continue;
    }
    const contactError = requiredCinPhoneError({
      phone1: { value: phone1, required: true },
    });
    if (contactError) {
      skipped++;
      errors.push(`${firstName} ${lastName}: ${contactError}`);
      continue;
    }
    const incomingName = `${firstName} ${lastName}`.trim();
    const replay = {
      path: '/agents',
      body: {
        firstName,
        lastName,
        email: email || null,
        phone1: phone1 || null,
        phone2: phone2 || null,
        address: address || null,
        isActive: true,
      },
    };
    const keys = agentSeenKeys(row);
    const seenHit = keys.map((key) => ({ key, person: seen.get(key) })).find((hit) => hit.person);
    const found = seenHit?.person
      ? { person: seenHit.person, kind: (seenHit.key.startsWith('em:') ? 'email' : 'namePhone') as 'email' | 'namePhone' }
      : await findAgentDuplicate(row);
    if (found) {
      skipped++;
      duplicates.push({
        line,
        incomingName,
        matchKind: found.kind,
        matchValue: found.kind === 'email' ? String(email || '').trim() : incomingName,
        existing: found.person,
        replay,
      });
      continue;
    }
    try {
      const reference = await nextReference('AGT');
      const agent = await prisma.agent.create({
        data: {
          reference,
          firstName,
          lastName,
          email: email || null,
          phone1: phone1 || null,
          phone2: phone2 || null,
          address: address || null,
          isActive: true,
        },
      });
      const person: SeenPerson = {
        id: agent.id,
        label: 'Agent',
        name: incomingName,
        ref: agent.reference,
        deletePath: `/agents/${agent.id}`,
      };
      for (const key of keys) seen.set(key, person);
      created++;
    } catch (e) {
      skipped++;
      errors.push(`${incomingName}: ${e instanceof Error ? e.message : 'erreur'}`);
    }
  }

  return { created, skipped, errors, duplicates };
}

export function parseCsvAgentRows(csv: string): AgentImportRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  const rows: AgentImportRow[] = [];
  for (const line of lines) {
    const parts = line.split(';').map((p) => p.trim());
    if (parts.length < 2) continue;
    const [firstName, lastName, email, phone1, phone2, address] = parts;
    if (firstName.toLowerCase() === 'prénom' || firstName.toLowerCase() === 'prenom') continue;
    rows.push({ firstName, lastName, email, phone1, phone2, address });
  }
  return rows;
}

export function parseExcelAgentRows(buffer: Buffer): AgentImportRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
  return data.map((row) => ({
    firstName: String(row['Prénom'] || row.Prenom || row.firstName || '').trim(),
    lastName: String(row['Nom'] || row.lastName || '').trim(),
    email: String(row.Email || row.email || '').trim(),
    phone1: String(row['Téléphone'] || row.Telephone || row.phone1 || '').trim(),
    phone2: String(row['Téléphone 2'] || row.phone2 || '').trim(),
    address: String(row.Adresse || row.address || '').trim(),
  })).filter((r) => r.firstName && r.lastName);
}
