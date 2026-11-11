import { prisma } from './prisma.js';
import type { Payment, Purchase, PurchasePayment, InternalStaffSalaryRecord, WorkforcePayrollRecord, Maintenance, FuelLog, EnginExpense } from '@prisma/client';
import type { Request } from 'express';
import { audit } from './audit.js';
import { clearOfficeCashParent, ensureOfficeCashColumns, removeOfficeCash, syncOfficeCash } from './officeCashSync.js';

export const MOVEMENT_TAGS = {
  ENCAISSEMENT: 'GIC_ENCAISSEMENT:',
  ACHAT: 'GIC_ACHAT:',
  ACHAT_PAIEMENT: 'GIC_ACHAT_PAIEMENT:',
  MAIN_OEUVRE: 'GIC_MAIN_OEUVRE:',
  EQUIPE_INTERNE: 'GIC_EQUIPE_INTERNE:',
  MAINTENANCE: 'GIC_MAINTENANCE:',
  CARBURANT: 'GIC_CARBURANT:',
  ENGIN_DEPENSE: 'GIC_ENGIN_DEPENSE:',
} as const;

export type CashSourceType =
  | 'encaissement'
  | 'achat'
  | 'achat_paiement'
  | 'main_oeuvre'
  | 'equipe_interne'
  | 'maintenance'
  | 'carburant'
  | 'engin_depense';

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
    achat_paiement: MOVEMENT_TAGS.ACHAT_PAIEMENT,
    main_oeuvre: MOVEMENT_TAGS.MAIN_OEUVRE,
    equipe_interne: MOVEMENT_TAGS.EQUIPE_INTERNE,
    maintenance: MOVEMENT_TAGS.MAINTENANCE,
    carburant: MOVEMENT_TAGS.CARBURANT,
    engin_depense: MOVEMENT_TAGS.ENGIN_DEPENSE,
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
  proofFile?: string | null;
  req?: Request;
}) {
  const account = await resolveAccount(opts.mode);
  const tag = movementTag(opts.sourceType, opts.sourceId);
  const remark = [tag, opts.remarkExtra].filter(Boolean).join(' · ');
  const proofFile = opts.proofFile || null;

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
        proofFile,
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
      proofFile,
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
  await removeOfficeCash(sourceType, sourceId);
  if (sourceType === 'main_oeuvre') await clearOfficeCashParent(sourceId);
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

  const movement = await upsertAutomaticMovement({
    sourceType: 'encaissement',
    sourceId: payment.id,
    date: payment.date,
    designation: label,
    mode: payment.operationType,
    debit: 0,
    credit: payment.amount,
    remarkExtra: payment.payerName ? `Payeur: ${payment.payerName}` : payment.receiptNo,
    proofFile: payment.proofFile,
    req,
  });
  await syncOfficeCash({
    sourceType: 'encaissement',
    sourceId: payment.id,
    workspaceId: payment.workspaceId,
    mode: payment.operationType,
    direction: 'entree',
    amount: payment.amount,
    date: payment.date,
    designation: label,
    purpose: 'alimentation',
    remark: payment.payerName ? `Payeur: ${payment.payerName}` : payment.receiptNo,
    createdBy: req?.user?.email || null,
  });
  return movement;
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
    proofFile: purchase.proofFile,
    req,
  });
}

const PURCHASE_PAYMENT_KIND_LABELS: Record<string, string> = {
  avance: 'Avance',
  complement: 'Paiement',
  solde: 'Solde',
};

export async function syncPurchasePaymentMovement(
  payment: PurchasePayment,
  purchase: Pick<Purchase, 'reference' | 'designation' | 'chantierId'> & { supplier?: { companyName: string } | null },
  req?: Request,
) {
  if (payment.amount <= 0) {
    await removeAutomaticMovement('achat_paiement', payment.id);
    return null;
  }
  const kind = PURCHASE_PAYMENT_KIND_LABELS[payment.kind] || 'Paiement';
  const supplierLabel = purchase.supplier?.companyName ? ` · ${purchase.supplier.companyName}` : '';
  const designation = `${kind} achat ${purchase.reference} — ${purchase.designation}`;
  const movement = await upsertAutomaticMovement({
    sourceType: 'achat_paiement',
    sourceId: payment.id,
    date: payment.date,
    designation,
    mode: payment.mode,
    debit: payment.amount,
    credit: 0,
    remarkExtra: [purchase.reference + supplierLabel, payment.reference].filter(Boolean).join(' · '),
    req,
  });
  await syncOfficeCash({
    sourceType: 'achat_paiement',
    sourceId: payment.id,
    workspaceId: payment.workspaceId,
    mode: payment.mode,
    direction: 'sortie',
    amount: payment.amount,
    date: payment.date,
    designation,
    purpose: purchase.chantierId ? 'chantier' : 'aleatoire',
    chantierId: purchase.chantierId,
    remark: purchase.reference + supplierLabel,
    createdBy: req?.user?.email || payment.createdBy || null,
  });
  return movement;
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

  const movement = await upsertAutomaticMovement({
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
  await syncWorkforceOfficeCash(record, name, period, req);
  return movement;
}

async function syncWorkforceOfficeCash(
  record: WorkforcePayrollRecord & {
    workforce?: { firstName: string; lastName: string; reference?: string | null };
  },
  name: string,
  period: string,
  req?: Request,
) {
  await clearOfficeCashParent(record.id);
  const payments = await prisma.workforcePayrollPayment.findMany({ where: { recordId: record.id } });
  const siteId = record.chantierId || null;
  if (!payments.length) {
    await syncOfficeCash({
      sourceType: 'main_oeuvre',
      sourceId: record.id,
      sourceParent: record.id,
      workspaceId: record.workspaceId,
      mode: record.paymentMode,
      direction: 'sortie',
      amount: record.amountPaid,
      date: record.paidAt || new Date(),
      designation: `Main-d'œuvre ${name} — ${period}`,
      purpose: siteId ? 'chantier' : 'travail',
      chantierId: siteId,
      remark: record.reference || period,
      createdBy: req?.user?.email || null,
    });
    return;
  }
  for (const payment of payments) {
    await syncOfficeCash({
      sourceType: 'main_oeuvre_ligne',
      sourceId: payment.id,
      sourceParent: record.id,
      workspaceId: payment.workspaceId,
      mode: payment.paymentMode,
      direction: 'sortie',
      amount: payment.amount,
      date: payment.paidAt,
      designation: `Main-d'œuvre ${name} — ${period}`,
      purpose: siteId ? 'chantier' : 'travail',
      chantierId: siteId,
      remark: payment.remark || record.reference || period,
      createdBy: req?.user?.email || null,
    });
  }
}

async function staffPaymentMode(recordId: string, mode?: string | null) {
  await ensureOfficeCashColumns();
  if (mode) return mode;
  const rows = await prisma.$queryRawUnsafe<{ paymentMode: string | null }[]>(
    `SELECT paymentMode FROM InternalStaffSalaryRecord WHERE id = ? LIMIT 1`,
    recordId,
  );
  return rows[0]?.paymentMode || 'virement';
}

export async function syncStaffSalaryMovement(
  record: InternalStaffSalaryRecord & {
    staff?: { firstName: string; lastName: string };
  },
  req?: Request,
  mode?: string | null,
) {
  if (record.status !== 'payé' || record.netSalary <= 0) {
    await removeAutomaticMovement('equipe_interne', record.id);
    return null;
  }

  const paymentMode = await staffPaymentMode(record.id, mode);
  const name = record.staff ? `${record.staff.firstName} ${record.staff.lastName}` : 'Collaborateur';
  const period = `${String(record.periodMonth).padStart(2, '0')}/${record.periodYear}`;
  const periodDetail =
    record.periodWeek > 0
      ? `${period} (S${record.periodWeek})`
      : period;
  const designation = `Salaire équipe interne ${name} — ${periodDetail}`;

  const movement = await upsertAutomaticMovement({
    sourceType: 'equipe_interne',
    sourceId: record.id,
    date: record.paidAt || new Date(),
    designation,
    mode: paymentMode,
    debit: record.netSalary,
    credit: 0,
    remarkExtra: period,
    req,
  });
  await syncOfficeCash({
    sourceType: 'equipe_interne',
    sourceId: record.id,
    workspaceId: record.workspaceId,
    mode: paymentMode,
    direction: 'sortie',
    amount: record.netSalary,
    date: record.paidAt || new Date(),
    designation,
    purpose: 'travail',
    remark: period,
    createdBy: req?.user?.email || null,
  });
  return movement;
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

export async function syncEnginExpenseMovement(
  expense: EnginExpense & { engin?: { code: string | null; designation: string | null; matricule: string | null } | null },
  req?: Request,
) {
  if (!(expense.amount > 0)) {
    await removeAutomaticMovement('engin_depense', expense.id);
    return null;
  }
  const enginLabel = expense.engin
    ? [expense.engin.code, expense.engin.designation || expense.engin.matricule].filter(Boolean).join(' ')
    : 'Engin';
  const designation = `Dépense ${enginLabel} — ${expense.designation}`;
  const movement = await upsertAutomaticMovement({
    sourceType: 'engin_depense',
    sourceId: expense.id,
    date: expense.date,
    designation,
    mode: expense.paymentMode || 'especes',
    debit: expense.amount,
    credit: 0,
    remarkExtra: expense.supplier || expense.invoiceRef || undefined,
    req,
  });
  await syncOfficeCash({
    sourceType: 'engin_depense',
    sourceId: expense.id,
    workspaceId: expense.workspaceId,
    mode: expense.paymentMode || 'especes',
    direction: 'sortie',
    amount: expense.amount,
    date: expense.date,
    designation,
    purpose: expense.chantierId ? 'chantier' : 'aleatoire',
    chantierId: expense.chantierId,
    remark: expense.supplier || expense.invoiceRef || null,
    createdBy: req?.user?.email || expense.createdBy || null,
  });
  return movement;
}

/** Reprend les paiements espèces déjà enregistrés pour qu'ils figurent en caisse. */
export async function backfillOfficeCashFromPayments() {
  await ensureOfficeCashColumns();
  let count = 0;

  const receipts = await prisma.payment.findMany({
    where: { operationType: 'especes', amount: { gt: 0 } },
    include: { sale: { select: { reference: true } }, rental: { select: { reference: true } } },
  });
  for (const payment of receipts) {
    await syncEncaissementMovement(payment);
    count += 1;
  }

  const purchasePayments = await prisma.purchasePayment.findMany({
    where: { mode: 'especes', amount: { gt: 0 } },
    include: { purchase: { include: { supplier: { select: { companyName: true } } } } },
  });
  for (const payment of purchasePayments) {
    await syncPurchasePaymentMovement(payment, payment.purchase);
    count += 1;
  }

  const payroll = await prisma.workforcePayrollRecord.findMany({
    where: { amountPaid: { gt: 0 } },
    include: { workforce: { select: { firstName: true, lastName: true, reference: true } } },
  });
  for (const record of payroll) await syncWorkforcePayrollMovement(record);

  const subs = await prisma.subcontractorPayment.findMany({
    where: { paymentMode: 'especes', amount: { gt: 0 } },
    include: { subcontractor: { select: { companyName: true, chantierId: true } } },
  });
  for (const payment of subs) {
    await syncOfficeCash({
      sourceType: 'sous_traitance',
      sourceId: payment.id,
      workspaceId: payment.workspaceId,
      mode: payment.paymentMode,
      direction: 'sortie',
      amount: payment.amount,
      date: payment.date,
      designation: `Sous-traitance ${payment.subcontractor.companyName}`,
      purpose: 'chantier',
      chantierId: payment.subcontractor.chantierId,
      remark: payment.remark,
    });
    count += 1;
  }

  const expenses = await prisma.enginExpense.findMany({
    where: { paymentMode: 'especes', amount: { gt: 0 } },
    include: { engin: { select: { code: true, designation: true, matricule: true } } },
  });
  for (const expense of expenses) {
    await syncEnginExpenseMovement(expense);
    count += 1;
  }

  const staffIds = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM InternalStaffSalaryRecord WHERE status = 'payé' AND lower(ifnull(paymentMode, '')) = 'especes'`,
  );
  for (const row of staffIds) {
    const record = await prisma.internalStaffSalaryRecord.findUnique({
      where: { id: row.id },
      include: { staff: { select: { firstName: true, lastName: true } } },
    });
    if (record) {
      await syncStaffSalaryMovement(record, undefined, 'especes');
      count += 1;
    }
  }

  return count;
}

/** Legacy tag lookup for older movements without sourceType */
export async function findLegacyPurchaseMovement(purchaseId: string) {
  return prisma.cashMovement.findFirst({
    where: { remark: { contains: `${MOVEMENT_TAGS.ACHAT}${purchaseId}` } },
    include: { account: true },
  });
}
