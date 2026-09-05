import { prisma } from './prisma.js';
import type { Payment, Purchase, InternalStaffSalaryRecord, WorkforcePayrollRecord, Maintenance, FuelLog } from '@prisma/client';
import type { Request } from 'express';
import { audit } from './audit.js';

export const MOVEMENT_TAGS = {
  ENCAISSEMENT: 'GIC_ENCAISSEMENT:',
  ACHAT: 'GIC_ACHAT:',
  MAIN_OEUVRE: 'GIC_MAIN_OEUVRE:',
  EQUIPE_INTERNE: 'GIC_EQUIPE_INTERNE:',
  MAINTENANCE: 'GIC_MAINTENANCE:',
  CARBURANT: 'GIC_CARBURANT:',
} as const;

export type CashSourceType =
  | 'encaissement'
  | 'achat'
  | 'main_oeuvre'
  | 'equipe_interne'
  | 'maintenance'
  | 'carburant';

export function accountIdForPaymentMode(mode: string | null | undefined) {
  if (mode === 'especes') return 'caisse-principale';
  if (mode === 'virement' || mode === 'cheque' || mode === 'carte') return 'banque-principale';
  return 'caisse-principale';
}

async function resolveAccount(mode: string | null | undefined) {
  const preferredId = accountIdForPaymentMode(mode);
  let account = await prisma.cashAccount.findFirst({
    where: { id: preferredId, isActive: true },
  });
  if (!account) {
    account = await prisma.cashAccount.findFirst({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }
  if (!account) throw new Error('Aucun compte caisse actif');
  return account;
}

export async function findMovementBySource(sourceType: CashSourceType, sourceId: string) {
  return prisma.cashMovement.findFirst({
    where: { sourceType, sourceId },
    include: { account: true },
  });
}

function movementTag(sourceType: CashSourceType, sourceId: string) {
  const map: Record<CashSourceType, string> = {
    encaissement: MOVEMENT_TAGS.ENCAISSEMENT,
    achat: MOVEMENT_TAGS.ACHAT,
    main_oeuvre: MOVEMENT_TAGS.MAIN_OEUVRE,
    equipe_interne: MOVEMENT_TAGS.EQUIPE_INTERNE,
    maintenance: MOVEMENT_TAGS.MAINTENANCE,
    carburant: MOVEMENT_TAGS.CARBURANT,
  };
  return `${map[sourceType]}${sourceId}`;
}

async function upsertAutomaticMovement(opts: {
  sourceType: CashSourceType;
  sourceId: string;
  date: Date;
  designation: string;
  mode?: string | null;
  debit: number;
  credit: number;
  remarkExtra?: string;
  req?: Request;
}) {
  const account = await resolveAccount(opts.mode);
  const tag = movementTag(opts.sourceType, opts.sourceId);
  const remark = [tag, opts.remarkExtra].filter(Boolean).join(' · ');

  const existing = await findMovementBySource(opts.sourceType, opts.sourceId);
  if (existing) {
    const movement = await prisma.cashMovement.update({
      where: { id: existing.id },
      data: {
        date: opts.date,
        designation: opts.designation,
        accountId: account.id,
        mode: opts.mode || null,
        debit: opts.debit,
        credit: opts.credit,
        remark,
        isAutomatic: true,
        sourceType: opts.sourceType,
        sourceId: opts.sourceId,
      },
      include: { account: true },
    });
    return { movement, created: false };
  }

  const movement = await prisma.cashMovement.create({
    data: {
      date: opts.date,
      designation: opts.designation,
      accountId: account.id,
      mode: opts.mode || null,
      debit: opts.debit,
      credit: opts.credit,
      remark,
      isAutomatic: true,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
    },
    include: { account: true },
  });

  if (opts.req) {
    await audit(opts.req, 'caisse_auto', 'CashMovement', movement.id, opts.designation);
  }

  return { movement, created: true };
}

export async function removeAutomaticMovement(sourceType: CashSourceType, sourceId: string) {
  const existing = await findMovementBySource(sourceType, sourceId);
  if (existing) {
    await prisma.cashMovement.delete({ where: { id: existing.id } });
  }
}

export async function syncEncaissementMovement(
  payment: Payment & {
    sale?: { reference: string } | null;
    rental?: { reference: string } | null;
  },
  req?: Request,
) {
  const label = payment.saleId
    ? `Encaissement vente ${payment.sale?.reference || ''} — ${payment.receiptNo}`
    : `Encaissement location ${payment.rental?.reference || ''} — ${payment.receiptNo}`;

  return upsertAutomaticMovement({
    sourceType: 'encaissement',
    sourceId: payment.id,
    date: payment.date,
    designation: label,
    mode: payment.operationType,
    debit: 0,
    credit: payment.amount,
    remarkExtra: payment.payerName ? `Payeur: ${payment.payerName}` : payment.receiptNo,
    req,
  });
}

export async function syncPurchaseMovement(
  purchase: Purchase & { supplier?: { companyName: string } | null },
  req?: Request,
) {
  const supplierLabel = purchase.supplier?.companyName ? ` · ${purchase.supplier.companyName}` : '';
  return upsertAutomaticMovement({
    sourceType: 'achat',
    sourceId: purchase.id,
    date: purchase.date,
    designation: `Achat ${purchase.reference} — ${purchase.designation}`,
    mode: purchase.paymentMode,
    debit: purchase.totalPrice,
    credit: 0,
    remarkExtra: `${purchase.reference}${supplierLabel}`,
    req,
  });
}

export async function syncWorkforcePayrollMovement(
  record: WorkforcePayrollRecord & {
    workforce?: { firstName: string; lastName: string; reference?: string | null };
  },
  req?: Request,
) {
  if (record.amountPaid <= 0) {
    await removeAutomaticMovement('main_oeuvre', record.id);
    return null;
  }

  const name = record.workforce
    ? `${record.workforce.firstName} ${record.workforce.lastName}`
    : 'Ouvrier';
  const period = `${String(record.periodMonth).padStart(2, '0')}/${record.periodYear}`;

  return upsertAutomaticMovement({
    sourceType: 'main_oeuvre',
    sourceId: record.id,
    date: record.paidAt || new Date(),
    designation: `Main-d'œuvre ${name} — ${period}`,
    mode: record.paymentMode,
    debit: record.amountPaid,
    credit: 0,
    remarkExtra: record.reference || period,
    req,
  });
}

export async function syncStaffSalaryMovement(
  record: InternalStaffSalaryRecord & {
    staff?: { firstName: string; lastName: string };
  },
  req?: Request,
) {
  if (record.status !== 'payé' || record.netSalary <= 0) {
    await removeAutomaticMovement('equipe_interne', record.id);
    return null;
  }

  const name = record.staff ? `${record.staff.firstName} ${record.staff.lastName}` : 'Collaborateur';
  const period = `${String(record.periodMonth).padStart(2, '0')}/${record.periodYear}`;
  const periodDetail =
    record.periodWeek > 0
      ? `${period} (S${record.periodWeek})`
      : period;

  return upsertAutomaticMovement({
    sourceType: 'equipe_interne',
    sourceId: record.id,
    date: record.paidAt || new Date(),
    designation: `Salaire équipe interne ${name} — ${periodDetail}`,
    mode: 'virement',
    debit: record.netSalary,
    credit: 0,
    remarkExtra: period,
    req,
  });
}

export async function syncMaintenanceMovement(
  maintenance: Maintenance & { engin?: { brand: string; matricule: string } | null },
  req?: Request,
) {
  const budget = maintenance.budget ?? 0;
  if (budget <= 0) {
    await removeAutomaticMovement('maintenance', maintenance.id);
    return null;
  }

  const enginLabel = maintenance.engin
    ? `${maintenance.engin.brand} ${maintenance.engin.matricule}`.trim()
    : 'Engin';

  return upsertAutomaticMovement({
    sourceType: 'maintenance',
    sourceId: maintenance.id,
    date: maintenance.date,
    designation: `Maintenance ${enginLabel} — ${maintenance.designation}`,
    mode: 'especes',
    debit: budget,
    credit: 0,
    remarkExtra: maintenance.responsible || undefined,
    req,
  });
}

export async function syncFuelMovement(
  log: FuelLog & { engin?: { brand: string; matricule: string } | null },
  req?: Request,
) {
  const cost = log.cost ?? 0;
  if (cost <= 0) {
    await removeAutomaticMovement('carburant', log.id);
    return null;
  }

  const enginLabel = log.engin
    ? `${log.engin.brand} ${log.engin.matricule}`.trim()
    : 'Engin';

  return upsertAutomaticMovement({
    sourceType: 'carburant',
    sourceId: log.id,
    date: log.date,
    designation: `Carburant ${enginLabel} — ${log.liters} L`,
    mode: 'especes',
    debit: cost,
    credit: 0,
    remarkExtra: log.remark || `${log.liters} L`,
    req,
  });
}

/** Legacy tag lookup for older movements without sourceType */
export async function findLegacyPurchaseMovement(purchaseId: string) {
  return prisma.cashMovement.findFirst({
    where: { remark: { contains: `${MOVEMENT_TAGS.ACHAT}${purchaseId}` } },
    include: { account: true },
  });
}
