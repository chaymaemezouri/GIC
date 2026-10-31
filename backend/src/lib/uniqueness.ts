import { prisma } from './prisma.js';
import { getWorkspaceId } from './workspace.js';

export async function assertUniqueCin(
  table: 'client' | 'supplier' | 'workforce' | 'mandant',
  cin: string | null | undefined,
  excludeId?: string
) {
  const value = String(cin || '').trim();
  if (!value) return;
  const not = excludeId ? { NOT: { id: excludeId } } : {};
  let exists = false;
  if (table === 'client') {
    exists = !!(await prisma.client.findFirst({ where: { identityNumber: value, ...not } }));
  } else if (table === 'supplier') {
    exists = !!(await prisma.supplier.findFirst({ where: { cin: value, ...not } }));
  } else if (table === 'workforce') {
    exists = !!(await prisma.workforce.findFirst({ where: { cin: value, ...not } }));
  } else if (table === 'mandant') {
    exists = !!(await prisma.mandant.findFirst({ where: { identityNumber: value, ...not } }));
  }
  if (exists) throw new Error(`Ce CIN / N° identité existe déjà (${value})`);
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
