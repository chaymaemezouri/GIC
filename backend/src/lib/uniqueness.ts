import type { Response } from 'express';
import { prisma } from './prisma.js';
import { getWorkspaceId } from './workspace.js';

export const CIN_DUPLICATE_CODE = 'CIN_DUPLICATE';

export type CinTable = 'client' | 'supplier' | 'workforce' | 'mandant' | 'staff';

export class CinDuplicateError extends Error {
  code = CIN_DUPLICATE_CODE;
  constructor(message: string) {
    super(message);
    this.name = 'CinDuplicateError';
  }
}

/** Comparaison sans espaces ni casse : « ab 123456 » et « AB123456 » sont le même CIN. */
export function normalizeCin(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '').toUpperCase();
}

type CinHit = { id: string; name: string | null; ref: string | null; category: string | null };

const CIN_LOOKUPS: Array<{ table: CinTable; sql: string }> = [
  {
    table: 'client',
    sql: `SELECT id, TRIM(COALESCE(firstName, '') || ' ' || COALESCE(lastName, '')) AS name, reference AS ref, NULL AS category
          FROM Client
          WHERE identityNumber IS NOT NULL AND TRIM(identityNumber) != ''
            AND REPLACE(UPPER(TRIM(identityNumber)), ' ', '') = ?
            AND IFNULL(workspaceId, 'demo') = ? AND id != ?`,
  },
  {
    table: 'mandant',
    sql: `SELECT id, TRIM(COALESCE(firstName, '') || ' ' || COALESCE(lastName, '')) AS name, reference AS ref, NULL AS category
          FROM Mandant
          WHERE identityNumber IS NOT NULL AND TRIM(identityNumber) != ''
            AND REPLACE(UPPER(TRIM(identityNumber)), ' ', '') = ?
            AND IFNULL(workspaceId, 'demo') = ? AND id != ?`,
  },
  {
    table: 'supplier',
    sql: `SELECT id, TRIM(COALESCE(companyName, '')) AS name, reference AS ref, NULL AS category
          FROM Supplier
          WHERE cin IS NOT NULL AND TRIM(cin) != ''
            AND REPLACE(UPPER(TRIM(cin)), ' ', '') = ?
            AND IFNULL(workspaceId, 'demo') = ? AND id != ?`,
  },
  {
    table: 'workforce',
    sql: `SELECT id, TRIM(COALESCE(firstName, '') || ' ' || COALESCE(lastName, '')) AS name, reference AS ref, category
          FROM Workforce
          WHERE cin IS NOT NULL AND TRIM(cin) != ''
            AND REPLACE(UPPER(TRIM(cin)), ' ', '') = ?
            AND IFNULL(workspaceId, 'demo') = ? AND id != ?`,
  },
  {
    table: 'staff',
    sql: `SELECT id, TRIM(COALESCE(firstName, '') || ' ' || COALESCE(lastName, '')) AS name, reference AS ref, NULL AS category
          FROM InternalStaff
          WHERE cin IS NOT NULL AND TRIM(cin) != ''
            AND REPLACE(UPPER(TRIM(cin)), ' ', '') = ?
            AND IFNULL(workspaceId, 'demo') = ? AND id != ?`,
  },
];

export function cinOwnerLabel(table: CinTable, category: string | null) {
  if (table === 'client') return 'Client';
  if (table === 'mandant') return 'Mandant';
  if (table === 'supplier') return 'Fournisseur';
  if (table === 'staff') return 'Équipe interne';
  return String(category || '').trim().toLowerCase() === 'chauffeur' ? 'Chauffeur' : 'Ouvrier';
}

export function cinDuplicateMessage(hit: { table: CinTable; name?: string | null; ref?: string | null; category?: string | null }) {
  const who = [cinOwnerLabel(hit.table, hit.category || null), hit.name?.trim(), hit.ref?.trim() ? `(${hit.ref.trim()})` : '']
    .filter(Boolean)
    .join(' ');
  return who ? `CIN en double, il existe déjà.\n${who}` : 'CIN en double, il existe déjà.';
}

export function cinDuplicateResponse(err: unknown): { message: string; code: typeof CIN_DUPLICATE_CODE } | null {
  if (err instanceof CinDuplicateError) return { message: err.message, code: CIN_DUPLICATE_CODE };
  if (!err || typeof err !== 'object' || !('code' in err)) return null;
  if ((err as { code?: string }).code !== 'P2002') return null;
  const target = (err as { meta?: { target?: unknown } }).meta?.target;
  const fields = Array.isArray(target) ? target.join(',') : String(target || '');
  if (/cin|identityNumber/i.test(fields)) {
    return { message: 'CIN en double, il existe déjà.', code: CIN_DUPLICATE_CODE };
  }
  return null;
}

export function replyIfCinDuplicate(res: Response, err: unknown) {
  const body = cinDuplicateResponse(err);
  if (!body) return false;
  res.status(400).json(body);
  return true;
}

export type CinOwner = CinHit & { table: CinTable };

/** Fiche qui porte déjà ce CIN, tous types confondus. `null` si le CIN est vide ou libre. */
export async function findCinOwner(
  cin: string | null | undefined,
  table?: CinTable,
  excludeId?: string,
): Promise<CinOwner | null> {
  const value = normalizeCin(cin);
  if (!value) return null;
  const workspaceId = getWorkspaceId();
  for (const lookup of CIN_LOOKUPS) {
    const rows = await prisma.$queryRawUnsafe<CinHit[]>(
      `${lookup.sql} LIMIT 1`,
      value,
      workspaceId,
      lookup.table === table ? excludeId || '' : '',
    );
    const hit = rows[0];
    if (hit) return { ...hit, table: lookup.table };
  }
  return null;
}

/** Le même CIN ne peut pas exister deux fois, dans aucune fiche (client, mandant, fournisseur, ouvrier, chauffeur, équipe interne). */
export async function assertUniqueCin(
  table: CinTable,
  cin: string | null | undefined,
  excludeId?: string,
) {
  const owner = await findCinOwner(cin, table, excludeId);
  if (owner) throw new CinDuplicateError(cinDuplicateMessage(owner));
}

export function normalizePaymentRef(value?: string | null): string | null {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text || null;
}

export function uniquePaymentViolationMessage(err: unknown): string | null {
  if (!err || typeof err !== 'object' || !('code' in err)) return null;
  if ((err as { code?: string }).code !== 'P2002') return null;
  const target = (err as { meta?: { target?: unknown } }).meta?.target;
  const fields = Array.isArray(target) ? target.join(',') : String(target || '');
  if (fields.includes('operationNo')) return "Ce N° d'opération existe déjà";
  if (fields.includes('internalRef')) return 'Cette référence interne paiement existe déjà';
  return 'Cette référence existe déjà';
}

async function paymentRefExists(column: 'operationNo' | 'internalRef', value: string, excludeId?: string) {
  const workspaceId = getWorkspaceId();
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    excludeId
      ? `SELECT id FROM Payment WHERE ${column} IS NOT NULL AND TRIM(${column}) != '' AND LOWER(TRIM(${column})) = LOWER(?) AND id != ? AND IFNULL(workspaceId, 'demo') = ? LIMIT 1`
      : `SELECT id FROM Payment WHERE ${column} IS NOT NULL AND TRIM(${column}) != '' AND LOWER(TRIM(${column})) = LOWER(?) AND IFNULL(workspaceId, 'demo') = ? LIMIT 1`,
    value,
    ...(excludeId ? [excludeId, workspaceId] : [workspaceId]),
  );
  return rows.length > 0;
}

export async function assertUniquePaymentRefs(data: {
  internalRef?: string | null;
  operationNo?: string | null;
  excludeId?: string;
}) {
  const internalRef = normalizePaymentRef(data.internalRef);
  const operationNo = normalizePaymentRef(data.operationNo);
  if (internalRef && await paymentRefExists('internalRef', internalRef, data.excludeId)) {
    throw new Error('Cette référence interne paiement existe déjà');
  }
  if (operationNo && await paymentRefExists('operationNo', operationNo, data.excludeId)) {
    throw new Error("Ce N° d'opération existe déjà");
  }
}
