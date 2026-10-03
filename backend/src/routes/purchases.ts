import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { nextReference } from '../lib/references.js';
import { ensureExploitationUsage, plannedCostOf, suggestAssignmentCost } from '../lib/enginCosts.js';
import { audit } from '../lib/audit.js';
import { notifyAllAdmins } from '../lib/notifications.js';
import { sendExcel } from '../lib/exportExcel.js';
import { upload } from '../lib/upload.js';
import { wrapCompanyPrintHtml } from '../lib/companyPrintShell.js';
import { getOrCreateCompanySettings } from '../lib/companySettings.js';
import {
  ENGAGED_STATUSES,
  INVOICE_DOC_CATEGORIES,
  OPEN_STATUSES,
  PURCHASE_DOC_LABELS,
  PURCHASE_DOC_TYPES,
  PURCHASE_PAYMENT_KINDS,
  PURCHASE_PAYMENT_MODES,
  PURCHASE_STATUSES,
  PURCHASE_STATUS_LABELS,
  addHistory,
  buildPurchaseDetail,
  deletePaymentWithMovement,
  normalizeLines,
  recomputePurchase,
  round2,
  statusIndex,
  summarizeLines,
  syncPaymentMovement,
  userDisplayName,
  type PurchaseStatus,
} from '../lib/purchaseWorkflow.js';

const router = Router();

const EPS = 0.01;

function formatMad(n: number) {
  return `${Math.round(n).toLocaleString('fr-MA')} MAD`;
}

function optionalText(v: unknown) {
  const s = v == null ? '' : String(v).trim();
  return s || null;
}

function parseDate(v: unknown) {
  if (v == null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function readFilters(req: Request) {
  const dateFrom = parseDate(req.query.dateFrom);
  const dateTo = parseDate(req.query.dateTo);
  if (dateFrom) dateFrom.setHours(0, 0, 0, 0);
  if (dateTo) dateTo.setHours(23, 59, 59, 999);
  return {
    q: String(req.query.q || '').trim(),
    status: String(req.query.status || ''),
    supplierId: String(req.query.supplierId || ''),
    chantierId: String(req.query.chantierId || ''),
    tranche: String(req.query.tranche || ''),
    invoiced: String(req.query.invoiced || ''),
    paymentStatus: String(req.query.paymentStatus || ''),
    deliveryStatus: String(req.query.deliveryStatus || ''),
    purchaseType: String(req.query.purchaseType || ''),
    dateFrom,
    dateTo,
  };
}

type Filters = ReturnType<typeof readFilters>;

function buildPurchaseWhere(f: Filters, opts: { ignoreStatus?: boolean } = {}): Prisma.PurchaseWhereInput {
  return {
    AND: [
      f.q
        ? {
            OR: [
              { reference: { contains: f.q } },
              { designation: { contains: f.q } },
              { family: { contains: f.q } },
              { requester: { contains: f.q } },
              { responsible: { contains: f.q } },
              { lines: { some: { OR: [{ product: { contains: f.q } }, { reference: { contains: f.q } }] } } },
              { supplier: { companyName: { contains: f.q } } },
            ],
          }
        : {},
      f.status && !opts.ignoreStatus
        ? f.status === 'en_cours'
          ? { status: { in: OPEN_STATUSES } }
          : { status: f.status }
        : {},
      f.supplierId ? { supplierId: f.supplierId } : {},
      f.chantierId ? { chantierId: f.chantierId } : {},
      f.tranche ? { tranche: f.tranche } : {},
      f.purchaseType && ['outil', 'materiel', 'marchandise'].includes(f.purchaseType) ? { purchaseType: f.purchaseType } : {},
      f.paymentStatus === 'a_payer'
        ? { paymentStatus: { in: ['non_paye', 'partiel'] } }
        : f.paymentStatus
          ? { paymentStatus: f.paymentStatus }
          : {},
      f.deliveryStatus ? { deliveryStatus: f.deliveryStatus } : {},
      f.dateFrom || f.dateTo
        ? { date: { ...(f.dateFrom ? { gte: f.dateFrom } : {}), ...(f.dateTo ? { lte: f.dateTo } : {}) } }
        : {},
      f.invoiced === 'true' ? { invoiced: true } : f.invoiced === 'false' ? { invoiced: false } : {},
    ],
  };
}

async function resolveProjectId(chantierId: string | null) {
  if (!chantierId) return null;
  const c = await prisma.chantier.findUnique({ where: { id: chantierId }, select: { projectId: true } });
  return c?.projectId || null;
}

function validPaymentMode(mode: unknown) {
  const m = optionalText(mode);
  return m && (PURCHASE_PAYMENT_MODES as readonly string[]).includes(m) ? m : null;
}

function parsePurchaseType(value: unknown) {
  const s = String(value || '');
  return s === 'outil' || s === 'materiel' ? s : 'marchandise';
}

async function createCatalogFromPurchase(purchase: {
  id: string;
  reference: string;
  purchaseType: string;
  chantierId: string | null;
  tranche: string | null;
  projectId: string | null;
  date: Date;
}, lines: { product: string; quantity: number; amountTTC: number }[]) {
  if (purchase.purchaseType !== 'outil' && purchase.purchaseType !== 'materiel') return;
  const chantier = purchase.chantierId
    ? await prisma.chantier.findUnique({ where: { id: purchase.chantierId }, select: { name: true } })
    : null;
  for (const line of lines) {
    const code = await nextReference('MAT');
    const engin = await prisma.engin.create({
      data: {
        code,
        kind: 'materiel',
        designation: line.quantity > 1 ? `${line.product} × ${line.quantity}` : line.product,
        purchasePrice: line.amountTTC,
        status: purchase.chantierId ? 'en_exploitation' : 'disponible',
        location: chantier?.name || `Achat ${purchase.reference}`,
      },
    });
    if (purchase.chantierId) {
      const suggestion = suggestAssignmentCost(engin, purchase.date);
      const cost = {
        costMethod: suggestion.costMethod,
        dailyCost: suggestion.dailyCost,
        hourlyCost: suggestion.hourlyCost,
        flatAmount: suggestion.flatAmount,
        extraCost: suggestion.extraCost ?? 0,
        plannedCost: 0,
        startDate: purchase.date,
        endDate: null as Date | null,
      };
      cost.plannedCost = plannedCostOf(cost);
      const assignment = await prisma.enginAssignment.create({
        data: {
          enginId: engin.id,
          chantierId: purchase.chantierId,
          tranche: purchase.tranche,
          projectId: purchase.projectId,
          startDate: purchase.date,
          mode: 'propriete',
          ...cost,
        },
      });
      await ensureExploitationUsage(assignment);
    }
  }
}

function sendDetail(res: import('express').Response, id: string, status = 200) {
  return buildPurchaseDetail(id).then((d) => {
    if (!d) return res.status(404).json({ message: 'Achat introuvable' });
    return res.status(status).json(d);
  });
}

// ─── Statistiques & analyse ─────────────────────────────────────────

router.get('/stats', async (req, res) => {
  const f = readFilters(req);
  const baseWhere = buildPurchaseWhere(f, { ignoreStatus: true });
  const where = buildPurchaseWhere(f);
  const [byStatus, agg, total] = await Promise.all([
    prisma.purchase.groupBy({ by: ['status'], where: baseWhere, _count: { id: true } }),
    prisma.purchase.aggregate({ where, _sum: { totalPrice: true, paidAmount: true, advanceAmount: true } }),
    prisma.purchase.count({ where }),
  ]);
  const counts = Object.fromEntries(PURCHASE_STATUSES.map((s) => [s, 0])) as Record<PurchaseStatus, number>;
  for (const row of byStatus) {
    if (row.status in counts) counts[row.status as PurchaseStatus] = row._count.id;
  }
  const amount = agg._sum.totalPrice || 0;
  const paid = agg._sum.paidAmount || 0;
  res.json({
    total,
    ...counts,
    enCours: OPEN_STATUSES.reduce((s, st) => s + counts[st], 0),
    amount,
    paid,
    advances: agg._sum.advanceAmount || 0,
    remaining: round2(Math.max(0, amount - paid)),
  });
});

router.get('/analytics', async (req, res) => {
  const f = readFilters(req);
  const purchases = await prisma.purchase.findMany({
    where: buildPurchaseWhere({ ...f, status: '' }),
    include: {
      supplier: { select: { id: true, companyName: true } },
      chantier: { select: { id: true, name: true, budgetAchats: true } },
      lines: { select: { family: true, amountTTC: true, amountHT: true } },
      payments: { select: { amount: true, kind: true, date: true } },
    },
    orderBy: { date: 'desc' },
  });

  const engaged = purchases.filter((p) => (ENGAGED_STATUSES as string[]).includes(p.status));
  const sum = (arr: number[]) => round2(arr.reduce((s, n) => s + n, 0));

  type Bucket = { key: string; label: string; count: number; engaged: number; paid: number; remaining: number };
  const bucket = (map: Map<string, Bucket>, key: string, label: string) => {
    if (!map.has(key)) map.set(key, { key, label, count: 0, engaged: 0, paid: 0, remaining: 0 });
    return map.get(key)!;
  };

  const byChantier = new Map<string, Bucket & { budget: number | null }>();
  const byTranche = new Map<string, Bucket>();
  const bySupplier = new Map<string, Bucket>();
  const byFamily = new Map<string, Bucket>();
  const byMonth = new Map<string, Bucket>();

  for (const p of engaged) {
    const remaining = Math.max(0, p.totalPrice - p.paidAmount);
    const add = (b: Bucket) => {
      b.count += 1;
      b.engaged = round2(b.engaged + p.totalPrice);
      b.paid = round2(b.paid + p.paidAmount);
      b.remaining = round2(b.remaining + remaining);
    };
    const cKey = p.chantierId || '__none__';
    if (!byChantier.has(cKey)) {
      byChantier.set(cKey, {
        key: cKey,
        label: p.chantier?.name || 'Sans chantier',
        count: 0,
        engaged: 0,
        paid: 0,
        remaining: 0,
        budget: p.chantier?.budgetAchats ?? null,
      });
    }
    add(byChantier.get(cKey)!);
    if (f.chantierId) add(bucket(byTranche, p.tranche || '__none__', p.tranche || 'Chantier entier'));
    add(bucket(bySupplier, p.supplierId || '__none__', p.supplier?.companyName || 'Sans fournisseur'));
    const month = p.date.toISOString().slice(0, 7);
    add(bucket(byMonth, month, month));

    const totalLines = p.lines.reduce((s, l) => s + l.amountTTC, 0);
    for (const l of p.lines) {
      const fam = l.family || 'Sans catégorie';
      const b = bucket(byFamily, fam, fam);
      const ratio = totalLines > 0 ? l.amountTTC / totalLines : 0;
      b.engaged = round2(b.engaged + l.amountTTC);
      b.paid = round2(b.paid + p.paidAmount * ratio);
      b.remaining = round2(b.remaining + remaining * ratio);
    }
    const fams = new Set(p.lines.map((l) => l.family || 'Sans catégorie'));
    for (const fam of fams) bucket(byFamily, fam, fam).count += 1;
  }

  const allPayments = purchases.flatMap((p) => p.payments);
  const notDelivered = purchases.filter(
    (p) => ['soumis', 'livre'].includes(p.status) && p.deliveryStatus !== 'livre',
  );
  const unpaidInvoices = purchases.filter(
    (p) => (p.status === 'facture' || (p.invoiced && ENGAGED_STATUSES.includes(p.status as PurchaseStatus))) && p.totalPrice - p.paidAmount > EPS && p.status !== 'archive',
  );
  const openList = purchases.filter((p) => (OPEN_STATUSES as string[]).includes(p.status));
  const mini = (p: (typeof purchases)[number]) => ({
    id: p.id,
    reference: p.reference,
    date: p.date,
    designation: p.designation,
    status: p.status,
    supplier: p.supplier?.companyName || null,
    chantier: p.chantier?.name || null,
    tranche: p.tranche,
    totalPrice: p.totalPrice,
    paidAmount: p.paidAmount,
    remaining: round2(Math.max(0, p.totalPrice - p.paidAmount)),
    deliveryStatus: p.deliveryStatus,
    expectedDeliveryDate: p.expectedDeliveryDate,
  });

  const chantierRows = [...byChantier.values()].map((c) => ({
    ...c,
    budgetUsedPct: c.budget && c.budget > 0 ? round2((c.engaged / c.budget) * 100) : null,
    budgetRemaining: c.budget != null ? round2(c.budget - c.engaged) : null,
  }));

  let budget: number | null = null;
  if (f.chantierId) {
    const c = await prisma.chantier.findUnique({ where: { id: f.chantierId }, select: { budgetAchats: true } });
    budget = c?.budgetAchats ?? null;
  } else {
    const budgets = chantierRows.map((c) => c.budget).filter((b): b is number => b != null);
    budget = budgets.length ? sum(budgets) : null;
  }
  const engagedTotal = sum(engaged.map((p) => p.totalPrice));

  const sortDesc = <T extends { engaged: number }>(arr: T[]) => arr.sort((a, b) => b.engaged - a.engaged);

  res.json({
    totals: {
      count: purchases.length,
      engagedCount: engaged.length,
      engaged: engagedTotal,
      draft: sum(purchases.filter((p) => p.status === 'elabore').map((p) => p.totalPrice)),
      paid: sum(purchases.map((p) => p.paidAmount)),
      advances: sum(allPayments.filter((p) => p.kind === 'avance').map((p) => p.amount)),
      remaining: sum(engaged.map((p) => Math.max(0, p.totalPrice - p.paidAmount))),
      budget,
      budgetUsedPct: budget && budget > 0 ? round2((engagedTotal / budget) * 100) : null,
      openCount: openList.length,
      openAmount: sum(openList.map((p) => p.totalPrice)),
      notDeliveredCount: notDelivered.length,
      notDeliveredAmount: sum(notDelivered.map((p) => p.totalPrice)),
      unpaidInvoicesCount: unpaidInvoices.length,
      unpaidInvoicesAmount: sum(unpaidInvoices.map((p) => p.totalPrice - p.paidAmount)),
    },
    byChantier: sortDesc(chantierRows),
    byTranche: sortDesc([...byTranche.values()]),
    bySupplier: sortDesc([...bySupplier.values()]),
    byFamily: sortDesc([...byFamily.values()]),
    byMonth: [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key)),
    notDelivered: notDelivered.slice(0, 30).map(mini),
    unpaidInvoices: unpaidInvoices.slice(0, 30).map(mini),
    open: openList.slice(0, 30).map(mini),
  });
});

// ─── Exports ────────────────────────────────────────────────────────

async function exportRows(req: Request) {
  const purchases = await prisma.purchase.findMany({
    where: buildPurchaseWhere(readFilters(req)),
    include: { supplier: true, chantier: true },
    orderBy: { date: 'desc' },
  });
  return purchases.map((p) => ({
    Référence: p.reference,
    Date: p.date.toISOString().slice(0, 10),
    Type: p.purchaseType === 'outil' ? 'Outils' : p.purchaseType === 'materiel' ? 'Matériel' : 'Marchandises',
    Désignation: p.designation,
    Famille: p.family || '',
    Fournisseur: p.supplier?.companyName || '',
    Chantier: p.chantier?.name || '',
    Tranche: p.tranche || '',
    Demandeur: p.requester || '',
    Responsable: p.responsible || '',
    'Total HT': p.amountHT ?? 0,
    'Total TVA': p.tvaAmount ?? 0,
    'Total TTC': p.totalPrice,
    Avances: p.advanceAmount,
    Payé: p.paidAmount,
    'Reste à payer': round2(Math.max(0, p.totalPrice - p.paidAmount)),
    Statut: PURCHASE_STATUS_LABELS[p.status] || p.status,
    Livraison: p.deliveryStatus,
    Paiement: p.paymentStatus,
    Facturé: p.invoiced ? 'Oui' : 'Non',
  }));
}

router.get('/export/csv', async (req, res) => {
  const rows = await exportRows(req);
  const headers = rows.length ? Object.keys(rows[0]) : ['Référence'];
  const lines = rows.map((r) => headers.map((h) => String((r as Record<string, unknown>)[h] ?? '').replace(/;/g, ',')).join(';'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=achats-gic.csv');
  res.send('\uFEFF' + [headers.join(';'), ...lines].join('\n'));
});

router.get('/export/xlsx', async (req, res) => {
  sendExcel(res, 'achats-gic.xlsx', 'Achats', await exportRows(req));
});

// ─── Liste & création ───────────────────────────────────────────────

router.get('/', async (req, res) => {
  const f = readFilters(req);
  const sort = String(req.query.sort || 'date');
  const order: Prisma.SortOrder = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const where = buildPurchaseWhere(f);
  const sortable = ['reference', 'designation', 'totalPrice', 'status', 'paidAmount', 'expectedDeliveryDate'];
  const orderBy: Prisma.PurchaseOrderByWithRelationInput = sortable.includes(sort) ? { [sort]: order } : { date: order };

  const [items, total, agg] = await Promise.all([
    prisma.purchase.findMany({
      where,
      include: { supplier: true, chantier: true, _count: { select: { lines: true, deliveries: true, payments: true } } },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.purchase.count({ where }),
    prisma.purchase.aggregate({ where, _sum: { totalPrice: true, paidAmount: true } }),
  ]);
  const amount = agg._sum.totalPrice || 0;
  const paid = agg._sum.paidAmount || 0;
  res.json({
    items: items.map((p) => ({ ...p, remaining: round2(Math.max(0, p.totalPrice - p.paidAmount)) })),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    totals: { amount, paid, remaining: round2(Math.max(0, amount - paid)) },
  });
});

router.post('/', async (req, res) => {
  const { lines, error } = normalizeLines(req.body.lines);
  if (error) return res.status(400).json({ message: error });
  const summary = summarizeLines(lines);

  const advanceAmount = round2(Number(req.body.advanceAmount) || 0);
  if (advanceAmount < 0) return res.status(400).json({ message: "Montant de l'avance invalide" });
  if (advanceAmount > summary.totalPrice + EPS) {
    return res.status(400).json({ message: "L'avance ne peut pas dépasser le total TTC" });
  }
  const advanceMode = validPaymentMode(req.body.advanceMode);
  if (advanceAmount > 0 && !advanceMode) {
    return res.status(400).json({ message: "Mode de paiement de l'avance obligatoire" });
  }

  const chantierId = optionalText(req.body.chantierId);
  const reference = await nextReference('ACH');
  const date = parseDate(req.body.date) || new Date();
  const purchase = await prisma.purchase.create({
    data: {
      reference,
      date,
      ...summary,
      supplierId: optionalText(req.body.supplierId),
      author: optionalText(req.body.author) || (await userDisplayName(req)),
      requester: optionalText(req.body.requester),
      responsible: optionalText(req.body.responsible),
      paymentMode: advanceMode || validPaymentMode(req.body.paymentMode),
      advanceMode,
      chantierId,
      tranche: optionalText(req.body.tranche),
      projectId: optionalText(req.body.projectId) || (await resolveProjectId(chantierId)),
      expectedDeliveryDate: parseDate(req.body.expectedDeliveryDate),
      remark: optionalText(req.body.remark),
      status: 'elabore',
      purchaseType: parsePurchaseType(req.body.purchaseType),
      lines: { create: lines },
    },
  });

  await createCatalogFromPurchase(purchase, lines);

  if (advanceAmount > 0) {
    const payment = await prisma.purchasePayment.create({
      data: {
        purchaseId: purchase.id,
        kind: 'avance',
        date: parseDate(req.body.advanceDate) || date,
        amount: advanceAmount,
        mode: advanceMode,
        createdBy: req.user?.email || null,
      },
    });
    await syncPaymentMovement(payment.id, req);
  }
  await recomputePurchase(purchase.id);
  await addHistory(purchase.id, req, 'elabore', null, 'Création');
  await audit(req, 'création', 'Purchase', purchase.id, reference);
  await notifyAllAdmins('Nouvel achat élaboré', `${reference} — ${summary.designation} — ${formatMad(summary.totalPrice)}`, {
    link: `/achats/${purchase.id}`,
    type: 'info',
  });
  return sendDetail(res, purchase.id, 201);
});

// ─── Détail ─────────────────────────────────────────────────────────

router.get('/:id/documents', async (req, res) => {
  const docs = await prisma.document.findMany({
    where: { entityType: 'purchase', entityId: String(req.params.id) },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs);
});

router.get('/:id/history', async (req, res) => {
  const purchaseId = String(req.params.id);
  const [workflow, auditLogs] = await Promise.all([
    prisma.purchaseHistory.findMany({ where: { purchaseId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.auditLog.findMany({
      where: { OR: [{ entity: 'Purchase', entityId: purchaseId }, { details: { contains: purchaseId } }] },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);
  res.json({ workflow, auditLogs });
});

router.get('/:id', async (req, res) => {
  await sendDetail(res, String(req.params.id));
});

/** En élaboré : tout est modifiable. Ensuite : seules les infos de suivi (hors archivé). */
router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.purchase.findUnique({ where: { id }, include: { payments: true } });
  if (!existing) return res.status(404).json({ message: 'Achat introuvable' });
  if (existing.status === 'archive') return res.status(400).json({ message: 'Achat archivé — modification impossible' });

  const data: Prisma.PurchaseUncheckedUpdateInput = {};
  if (req.body.requester !== undefined) data.requester = optionalText(req.body.requester);
  if (req.body.responsible !== undefined) data.responsible = optionalText(req.body.responsible);
  if (req.body.expectedDeliveryDate !== undefined) data.expectedDeliveryDate = parseDate(req.body.expectedDeliveryDate);
  if (req.body.remark !== undefined) data.remark = optionalText(req.body.remark);

  if (existing.status !== 'elabore') {
    const forbidden = ['lines', 'supplierId', 'chantierId', 'tranche', 'date', 'advanceAmount'].filter(
      (k) => req.body[k] !== undefined,
    );
    if (forbidden.length) {
      return res.status(400).json({
        message: `Achat ${PURCHASE_STATUS_LABELS[existing.status] || existing.status} — seuls le demandeur, le responsable, la livraison prévue et les observations restent modifiables`,
      });
    }
    await prisma.purchase.update({ where: { id }, data });
    await audit(req, 'modification', 'Purchase', id, existing.reference);
    return sendDetail(res, id);
  }

  if (req.body.supplierId !== undefined) data.supplierId = optionalText(req.body.supplierId);
  if (req.body.chantierId !== undefined) {
    const chantierId = optionalText(req.body.chantierId);
    data.chantierId = chantierId;
    data.projectId = optionalText(req.body.projectId) || (await resolveProjectId(chantierId));
  } else if (req.body.projectId !== undefined) {
    data.projectId = optionalText(req.body.projectId);
  }
  if (req.body.tranche !== undefined) data.tranche = optionalText(req.body.tranche);
  if (req.body.purchaseType !== undefined) data.purchaseType = parsePurchaseType(req.body.purchaseType);
  if (req.body.date !== undefined) data.date = parseDate(req.body.date) || existing.date;
  if (req.body.author !== undefined) data.author = optionalText(req.body.author);

  let newTotal = existing.totalPrice;
  if (req.body.lines !== undefined) {
    const { lines, error } = normalizeLines(req.body.lines);
    if (error) return res.status(400).json({ message: error });
    newTotal = summarizeLines(lines).totalPrice;
    await prisma.$transaction([
      prisma.purchaseLine.deleteMany({ where: { purchaseId: id } }),
      prisma.purchaseLine.createMany({ data: lines.map((l) => ({ ...l, purchaseId: id })) }),
    ]);
  }

  const advancePayments = existing.payments.filter((p) => p.kind === 'avance');
  const otherPaid = existing.payments.filter((p) => p.kind !== 'avance').reduce((s, p) => s + p.amount, 0);
  if (req.body.advanceAmount !== undefined) {
    const advanceAmount = round2(Number(req.body.advanceAmount) || 0);
    const advanceMode = validPaymentMode(req.body.advanceMode) || advancePayments[0]?.mode || null;
    if (advanceAmount < 0) return res.status(400).json({ message: "Montant de l'avance invalide" });
    if (advanceAmount + otherPaid > newTotal + EPS) {
      return res.status(400).json({ message: 'Les paiements dépasseraient le total TTC' });
    }
    if (advanceAmount > 0 && !advanceMode) {
      return res.status(400).json({ message: "Mode de paiement de l'avance obligatoire" });
    }
    data.advanceMode = advanceMode;
    const [first, ...extra] = advancePayments;
    for (const p of extra) await deletePaymentWithMovement(p.id);
    if (advanceAmount <= 0) {
      if (first) await deletePaymentWithMovement(first.id);
    } else if (first) {
      await prisma.purchasePayment.update({
        where: { id: first.id },
        data: { amount: advanceAmount, mode: advanceMode, date: parseDate(req.body.advanceDate) || first.date },
      });
      await syncPaymentMovement(first.id, req);
    } else {
      const payment = await prisma.purchasePayment.create({
        data: {
          purchaseId: id,
          kind: 'avance',
          date: parseDate(req.body.advanceDate) || existing.date,
          amount: advanceAmount,
          mode: advanceMode,
          createdBy: req.user?.email || null,
        },
      });
      await syncPaymentMovement(payment.id, req);
    }
  } else if (existing.paidAmount > newTotal + EPS) {
    return res.status(400).json({ message: 'Le total TTC ne peut pas être inférieur aux montants déjà payés' });
  }

  await prisma.purchase.update({ where: { id }, data });
  await recomputePurchase(id);
  const payments = await prisma.purchasePayment.findMany({ where: { purchaseId: id }, select: { id: true } });
  for (const p of payments) await syncPaymentMovement(p.id);
  await audit(req, 'modification', 'Purchase', id, existing.reference);
  return sendDetail(res, id);
});

router.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });
  const existing = await prisma.purchase.findUnique({ where: { id }, include: { payments: true } });
  if (!existing) return res.status(404).json({ message: 'Achat introuvable' });
  if (existing.status !== 'elabore') {
    return res.status(400).json({ message: 'Suppression possible uniquement pour un achat élaboré' });
  }
  for (const p of existing.payments) await deletePaymentWithMovement(p.id);
  await prisma.$transaction([
    prisma.purchaseHistory.deleteMany({ where: { purchaseId: id } }),
    prisma.document.deleteMany({ where: { entityType: 'purchase', entityId: id } }),
    prisma.purchase.delete({ where: { id } }),
  ]);
  await audit(req, 'suppression', 'Purchase', id, `${existing.reference} — ${motif}`);
  res.json({ ok: true });
});

// ─── Cycle de vie ───────────────────────────────────────────────────

router.patch('/:id/status', async (req, res) => {
  const id = String(req.params.id);
  const target = String(req.body.status || '') as PurchaseStatus;
  const comment = optionalText(req.body.comment);
  const force = req.body.force === true || req.body.force === 'true';
  if (statusIndex(target) < 0) return res.status(400).json({ message: 'Statut inconnu' });

  const detail = await buildPurchaseDetail(id);
  if (!detail) return res.status(404).json({ message: 'Achat introuvable' });
  const from = detail.status;
  const fromIdx = statusIndex(from);
  const toIdx = statusIndex(target);
  if (from === target) return res.status(400).json({ message: 'Achat déjà dans ce statut' });

  if (toIdx < fromIdx) {
    if (!comment) return res.status(400).json({ message: 'Motif obligatoire pour revenir à une étape précédente' });
    if (from === 'archive' && target !== 'paye') {
      return res.status(400).json({ message: 'Un achat archivé ne peut revenir qu’à l’étape Payé' });
    }
    if (toIdx < statusIndex('livre') && detail.deliveries.length > 0) {
      return res.status(400).json({ message: 'Supprimez d’abord les livraisons enregistrées' });
    }
  } else {
    if (toIdx !== fromIdx + 1) {
      return res.status(400).json({
        message: `Étape suivante attendue : ${PURCHASE_STATUS_LABELS[PURCHASE_STATUSES[fromIdx + 1]] || '—'}`,
      });
    }
    if (target === 'soumis') {
      if (!detail.lines.length) return res.status(400).json({ message: 'Ajoutez au moins un produit' });
      if (!detail.supplierId) return res.status(400).json({ message: 'Fournisseur obligatoire pour émettre le bon de commande' });
    }
    if (target === 'livre' && !detail.deliveries.length) {
      return res.status(400).json({ message: 'Enregistrez au moins une livraison' });
    }
    if (target === 'valide' && detail.totals.remainingQty > EPS && !force) {
      return res.status(409).json({
        code: 'REMAINING_QUANTITIES',
        message: `Il reste ${detail.totals.remainingQty} unité(s) non livrée(s) — confirmer la validation ?`,
      });
    }
    if (target === 'facture' && !detail.checks.hasInvoice) {
      return res.status(400).json({ message: 'Associez la facture fournisseur (document) avant de passer en Facturé' });
    }
    if (target === 'paye' && detail.totals.remaining > EPS) {
      return res.status(400).json({ message: `Reste à payer : ${formatMad(detail.totals.remaining)}` });
    }
  }

  const data: Prisma.PurchaseUncheckedUpdateInput = { status: target };
  if (target === 'facture') data.invoiced = true;
  await prisma.purchase.update({ where: { id }, data });
  const autoComment =
    target === 'valide' && detail.totals.remainingQty > EPS ? `Validé avec reliquat de ${detail.totals.remainingQty} unité(s)` : null;
  await addHistory(id, req, target, from, [comment, autoComment].filter(Boolean).join(' · ') || null);
  await audit(req, 'workflow', 'Purchase', id, `${PURCHASE_STATUS_LABELS[from] || from} → ${PURCHASE_STATUS_LABELS[target]}`);

  if (target === 'soumis') {
    await notifyAllAdmins('Bon de commande émis', `${detail.reference} — ${detail.supplier?.companyName || ''} — ${formatMad(detail.totalPrice)}`, {
      link: `/achats/${id}`,
      type: 'info',
    });
  }
  if (toIdx < fromIdx) {
    await notifyAllAdmins('Achat renvoyé', `${detail.reference} — retour à « ${PURCHASE_STATUS_LABELS[target]} » : ${comment}`, {
      link: `/achats/${id}`,
      type: 'warning',
    });
  }
  return sendDetail(res, id);
});

// ─── Livraisons ─────────────────────────────────────────────────────

router.post('/:id/deliveries', async (req, res) => {
  const id = String(req.params.id);
  const detail = await buildPurchaseDetail(id);
  if (!detail) return res.status(404).json({ message: 'Achat introuvable' });
  if (!['soumis', 'livre'].includes(detail.status)) {
    return res.status(400).json({ message: 'Livraison possible uniquement après émission du bon de commande (Soumis / Livré)' });
  }
  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
  const lineById = new Map(detail.lines.map((l) => [l.id, l]));
  const items: Array<{ lineId: string; quantity: number; rejectedQuantity: number; remark: string | null }> = [];
  for (const raw of rawItems) {
    const line = lineById.get(String(raw?.lineId || ''));
    if (!line) return res.status(400).json({ message: 'Ligne de commande inconnue' });
    const quantity = round2(Number(raw.quantity) || 0);
    const rejectedQuantity = round2(Number(raw.rejectedQuantity) || 0);
    if (quantity < 0 || rejectedQuantity < 0) return res.status(400).json({ message: `${line.product} : quantités invalides` });
    if (rejectedQuantity > quantity + EPS) {
      return res.status(400).json({ message: `${line.product} : la quantité refusée dépasse la quantité livrée` });
    }
    if (quantity - rejectedQuantity > line.remaining + EPS) {
      return res.status(400).json({
        message: `${line.product} : ${quantity - rejectedQuantity} accepté(s) pour ${line.remaining} restant(s)`,
      });
    }
    if (quantity > 0) items.push({ lineId: line.id, quantity, rejectedQuantity, remark: optionalText(raw.remark) });
  }
  if (!items.length) return res.status(400).json({ message: 'Saisissez au moins une quantité livrée' });

  const delivery = await prisma.purchaseDelivery.create({
    data: {
      purchaseId: id,
      date: parseDate(req.body.date) || new Date(),
      number: optionalText(req.body.number),
      remark: optionalText(req.body.remark),
      createdBy: (await userDisplayName(req)) || null,
      items: { create: items },
    },
  });
  const updated = await recomputePurchase(id);
  const partial = updated?.deliveryStatus !== 'livre';
  if (detail.status === 'soumis') {
    await prisma.purchase.update({ where: { id }, data: { status: 'livre' } });
    await addHistory(id, req, 'livre', 'soumis', partial ? 'Livraison partielle reçue' : 'Livraison complète reçue');
  }
  await audit(req, 'livraison', 'Purchase', id, `${detail.reference} — ${delivery.number || delivery.id} (${partial ? 'partielle' : 'complète'})`);
  return sendDetail(res, id, 201);
});

router.delete('/:id/deliveries/:deliveryId', async (req, res) => {
  const id = String(req.params.id);
  const purchase = await prisma.purchase.findUnique({ where: { id }, include: { deliveries: { select: { id: true } } } });
  if (!purchase) return res.status(404).json({ message: 'Achat introuvable' });
  if (!['soumis', 'livre'].includes(purchase.status)) {
    return res.status(400).json({ message: 'Livraisons verrouillées après validation — revenez à l’étape Livré' });
  }
  const delivery = await prisma.purchaseDelivery.findFirst({ where: { id: String(req.params.deliveryId), purchaseId: id } });
  if (!delivery) return res.status(404).json({ message: 'Livraison introuvable' });
  await prisma.purchaseDelivery.delete({ where: { id: delivery.id } });
  await recomputePurchase(id);
  if (purchase.status === 'livre' && purchase.deliveries.length === 1) {
    await prisma.purchase.update({ where: { id }, data: { status: 'soumis' } });
    await addHistory(id, req, 'soumis', 'livre', 'Dernière livraison supprimée');
  }
  await audit(req, 'suppression livraison', 'Purchase', id, `${purchase.reference} — ${delivery.number || delivery.id}`);
  return sendDetail(res, id);
});

// ─── Documents ──────────────────────────────────────────────────────

router.post('/:id/documents', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
  const id = String(req.params.id);
  const purchase = await prisma.purchase.findUnique({ where: { id } });
  if (!purchase) return res.status(404).json({ message: 'Achat introuvable' });
  if (purchase.status === 'archive') return res.status(400).json({ message: 'Achat archivé' });
  const category = String(req.body.category || 'autre');
  if (!(PURCHASE_DOC_TYPES as readonly string[]).includes(category)) {
    return res.status(400).json({ message: 'Type de document inconnu' });
  }
  const amountRaw = req.body.amount;
  const amount = amountRaw == null || amountRaw === '' ? null : Number(amountRaw);
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) return res.status(400).json({ message: 'Montant invalide' });

  const doc = await prisma.document.create({
    data: {
      name: optionalText(req.body.name) || `${PURCHASE_DOC_LABELS[category]} ${purchase.reference}`,
      category,
      status: 'valid',
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/${req.file.filename}`,
      entityType: 'purchase',
      entityId: id,
      supplierId: purchase.supplierId,
      docNumber: optionalText(req.body.docNumber),
      docDate: parseDate(req.body.docDate),
      amount,
      uploadedById: req.user?.id || null,
      uploadedByName: await userDisplayName(req),
    },
  });
  if (INVOICE_DOC_CATEGORIES.includes(category) && !purchase.invoiced) {
    await prisma.purchase.update({ where: { id }, data: { invoiced: true } });
  }
  await audit(req, 'document achat', 'Purchase', id, `${purchase.reference} — ${PURCHASE_DOC_LABELS[category]} ${doc.docNumber || ''}`.trim());
  res.status(201).json(doc);
});

router.delete('/:id/documents/:docId', async (req, res) => {
  const id = String(req.params.id);
  const purchase = await prisma.purchase.findUnique({ where: { id } });
  if (!purchase) return res.status(404).json({ message: 'Achat introuvable' });
  if (purchase.status === 'archive') return res.status(400).json({ message: 'Achat archivé' });
  const doc = await prisma.document.findFirst({ where: { id: String(req.params.docId), entityType: 'purchase', entityId: id } });
  if (!doc) return res.status(404).json({ message: 'Document introuvable' });
  const isInvoice = INVOICE_DOC_CATEGORIES.includes(doc.category || '');
  if (isInvoice && statusIndex(purchase.status) >= statusIndex('facture')) {
    const otherInvoices = await prisma.document.count({
      where: { entityType: 'purchase', entityId: id, category: { in: INVOICE_DOC_CATEGORIES }, id: { not: doc.id } },
    });
    if (!otherInvoices) {
      return res.status(400).json({ message: 'Facture requise à ce stade — revenez à l’étape Validé pour la retirer' });
    }
  }
  await prisma.document.delete({ where: { id: doc.id } });
  if (isInvoice) {
    const remaining = await prisma.document.count({ where: { entityType: 'purchase', entityId: id, category: { in: INVOICE_DOC_CATEGORIES } } });
    if (!remaining) await prisma.purchase.update({ where: { id }, data: { invoiced: false } });
  }
  await audit(req, 'suppression document achat', 'Purchase', id, `${purchase.reference} — ${doc.name}`);
  res.json({ ok: true });
});

// ─── Paiements ──────────────────────────────────────────────────────

router.post('/:id/payments', async (req, res) => {
  const id = String(req.params.id);
  const purchase = await prisma.purchase.findUnique({ where: { id }, include: { supplier: true } });
  if (!purchase) return res.status(404).json({ message: 'Achat introuvable' });
  if (['paye', 'archive'].includes(purchase.status)) {
    return res.status(400).json({ message: 'Achat déjà soldé' });
  }
  const amount = round2(Number(req.body.amount) || 0);
  if (amount <= 0) return res.status(400).json({ message: 'Montant invalide' });
  const remaining = round2(purchase.totalPrice - purchase.paidAmount);
  if (amount > remaining + EPS) {
    return res.status(400).json({ message: `Le montant dépasse le reste à payer (${formatMad(remaining)})` });
  }
  const mode = validPaymentMode(req.body.mode);
  if (!mode) return res.status(400).json({ message: 'Mode de paiement obligatoire' });
  const kindRaw = String(req.body.kind || '');
  const kind = (PURCHASE_PAYMENT_KINDS as readonly string[]).includes(kindRaw)
    ? kindRaw
    : Math.abs(amount - remaining) <= EPS
      ? 'solde'
      : 'complement';

  const payment = await prisma.purchasePayment.create({
    data: {
      purchaseId: id,
      kind,
      date: parseDate(req.body.date) || new Date(),
      amount,
      mode,
      reference: optionalText(req.body.reference),
      remark: optionalText(req.body.remark),
      createdBy: await userDisplayName(req),
    },
  });
  const movement = await syncPaymentMovement(payment.id, req);
  const updated = await recomputePurchase(id);
  if (!purchase.paymentMode) await prisma.purchase.update({ where: { id }, data: { paymentMode: mode } });

  if (updated?.paymentStatus === 'paye' && purchase.status === 'facture') {
    await prisma.purchase.update({ where: { id }, data: { status: 'paye' } });
    await addHistory(id, req, 'paye', 'facture', 'Paiement intégral');
  }
  await audit(req, 'paiement achat', 'Purchase', id, `${purchase.reference} — ${formatMad(amount)} (${kind})`);
  if (movement) {
    await notifyAllAdmins('Décaissement achat', `${purchase.reference} — ${formatMad(amount)}`, {
      link: `/caisse/${movement.id}`,
      type: 'info',
    });
  }
  return sendDetail(res, id, 201);
});

router.delete('/:id/payments/:paymentId', async (req, res) => {
  const id = String(req.params.id);
  const purchase = await prisma.purchase.findUnique({ where: { id } });
  if (!purchase) return res.status(404).json({ message: 'Achat introuvable' });
  if (['paye', 'archive'].includes(purchase.status)) {
    return res.status(400).json({ message: 'Achat soldé — revenez à l’étape Facturé pour corriger un paiement' });
  }
  const payment = await prisma.purchasePayment.findFirst({ where: { id: String(req.params.paymentId), purchaseId: id } });
  if (!payment) return res.status(404).json({ message: 'Paiement introuvable' });
  await deletePaymentWithMovement(payment.id);
  await recomputePurchase(id);
  await audit(req, 'suppression paiement achat', 'Purchase', id, `${purchase.reference} — ${formatMad(payment.amount)}`);
  return sendDetail(res, id);
});

// ─── Impression ─────────────────────────────────────────────────────

function esc(v: unknown) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

router.get('/:id/print/:docType', async (req, res) => {
  const detail = await buildPurchaseDetail(String(req.params.id));
  if (!detail) return res.status(404).json({ message: 'Achat introuvable' });
  const docType = String(req.params.docType);
  const settings = await getOrCreateCompanySettings();
  const money = (n: number) => `${round2(n).toLocaleString('fr-MA', { minimumFractionDigits: 2 })}`;
  const d = (x: Date | null | undefined) => (x ? new Date(x).toLocaleDateString('fr-MA') : '—');
  const header = `
<p><strong>Réf. achat :</strong> ${esc(detail.reference)} &nbsp; <strong>Date :</strong> ${d(detail.date)}</p>
<p><strong>Fournisseur :</strong> ${esc(detail.supplier?.companyName || '—')}</p>
<p><strong>Chantier :</strong> ${esc(detail.chantier?.name || '—')}${detail.tranche ? ` · ${esc(detail.tranche)}` : ''}${detail.project ? ` &nbsp; <strong>Projet :</strong> ${esc(detail.project.name)}` : ''}</p>
<p><strong>Demandeur :</strong> ${esc(detail.requester || '—')} &nbsp; <strong>Responsable :</strong> ${esc(detail.responsible || '—')}</p>
${detail.expectedDeliveryDate ? `<p><strong>Livraison prévue :</strong> ${d(detail.expectedDeliveryDate)}</p>` : ''}`;

  let title = 'Bon de commande';
  let body = '';
  if (docType === 'bon_reception') {
    title = 'Bon de réception';
    body = `${header}
<table><thead><tr><th>Produit</th><th>Unité</th><th>Commandé</th><th>Livré</th><th>Refusé</th><th>Accepté</th><th>Restant</th></tr></thead><tbody>
${detail.lines
  .map(
    (l) =>
      `<tr><td>${esc(l.product)}${l.reference ? ` <small>(${esc(l.reference)})</small>` : ''}</td><td>${esc(l.unit || '')}</td><td>${l.quantity}</td><td>${l.delivered}</td><td>${l.rejected}</td><td>${l.accepted}</td><td>${l.remaining}</td></tr>`,
  )
  .join('')}
</tbody></table>
<h3>Livraisons</h3>
<table><thead><tr><th>Date</th><th>N° BL</th><th>Détail</th><th>Observations</th></tr></thead><tbody>
${detail.deliveries
  .map(
    (dl) =>
      `<tr><td>${d(dl.date)}</td><td>${esc(dl.number || '—')}</td><td>${dl.items
        .map((i) => `${esc(i.line.product)} : ${i.quantity}${i.rejectedQuantity ? ` (refusé ${i.rejectedQuantity})` : ''}`)
        .join('<br/>')}</td><td>${esc(dl.remark || '')}</td></tr>`,
  )
  .join('') || '<tr><td colspan="4">Aucune livraison</td></tr>'}
</tbody></table>`;
  } else {
    body = `${header}
<table><thead><tr><th>Produit / marchandise</th><th>Réf.</th><th>Qté</th><th>Unité</th><th>PU HT</th><th>TVA %</th><th>Montant TTC</th></tr></thead><tbody>
${detail.lines
  .map(
    (l) =>
      `<tr><td>${esc(l.product)}</td><td>${esc(l.reference || '')}</td><td>${l.quantity}</td><td>${esc(l.unit || '')}</td><td>${money(l.unitPrice)}</td><td>${l.tvaRate}</td><td>${money(l.amountTTC)}</td></tr>`,
  )
  .join('')}
</tbody></table>
<p class="total">Total HT : ${money(detail.totals.amountHT)} MAD · TVA : ${money(detail.totals.tvaAmount)} MAD · Total TTC : ${money(detail.totals.totalTTC)} MAD</p>
<p><strong>Avance versée :</strong> ${money(detail.totals.advances)} MAD &nbsp; <strong>Reste à payer :</strong> ${money(detail.totals.remaining)} MAD</p>
${detail.remark ? `<p><strong>Observations :</strong> ${esc(detail.remark)}</p>` : ''}`;
  }
  const signs = `<div class="sign-slots"><div class="sign-slot">Établi par<div class="sign-line"></div></div><div class="sign-slot">Cachet et signature<div class="sign-line"></div></div><div class="sign-slot">Reçu par<div class="sign-line"></div></div></div>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(wrapCompanyPrintHtml({ title, bodyHtml: body + signs, settings }));
});

export default router;
