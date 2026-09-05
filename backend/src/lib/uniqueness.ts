import { prisma } from './prisma.js';

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

export async function assertUniquePaymentRefs(data: {
  internalRef?: string | null;
  operationNo?: string | null;
  excludeId?: string;
}) {
  const not = data.excludeId ? { NOT: { id: data.excludeId } } : {};
  const internalRef = String(data.internalRef || '').trim();
  const operationNo = String(data.operationNo || '').trim();
  if (internalRef) {
    const exists = await prisma.payment.findFirst({ where: { internalRef, ...not } });
    if (exists) throw new Error('Cette référence interne paiement existe déjà');
  }
  if (operationNo) {
    const exists = await prisma.payment.findFirst({ where: { operationNo, ...not } });
    if (exists) throw new Error('Ce N° opération existe déjà');
  }
}
