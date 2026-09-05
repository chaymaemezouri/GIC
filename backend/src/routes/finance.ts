import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import { upload } from '../lib/upload.js';
import { sendExcel } from '../lib/exportExcel.js';
import { findMovementBySource } from '../lib/cashSync.js';
import { CHAUFFEUR_CATEGORY } from '../lib/workforceScope.js';

function buildMovementWhere(
  accountId: string,
  q: string,
  dateFrom: Date | null,
  dateTo: Date | null,
  mode: string,
  type: string,
  holderUserId = ''
) {
  return {
    AND: [
      accountId ? { accountId } : {},
      holderUserId ? { account: { holderUserId } } : {},
      q
        ? {
            OR: [
              { designation: { contains: q } },
              { remark: { contains: q } },
            ],
          }
        : {},
      dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {},
      mode ? { mode } : {},
      type === 'debit' ? { debit: { gt: 0 } } : {},
      type === 'credit' ? { credit: { gt: 0 } } : {},
    ],
  };
}

const movementUpload = upload.fields([
  { name: 'proof', maxCount: 1 },
  { name: 'invoice', maxCount: 1 },
  { name: 'deliveryNote', maxCount: 1 },
  { name: 'receptionPv', maxCount: 1 },
]);

const accountHolderInclude = {
  holderUser: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

function firstUploaded(files: Express.Multer.File[] | undefined) {
  const f = files?.[0];
  return f ? `/uploads/${f.filename}` : undefined;
}

function movementFiles(req: Express.Request) {
  const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
  return {
    proofFile: firstUploaded(files?.proof),
    invoiceFile: firstUploaded(files?.invoice),
    deliveryNoteFile: firstUploaded(files?.deliveryNote),
    receptionPvFile: firstUploaded(files?.receptionPv),
  };
}

function movementQueryFilters(req: { query: Record<string, unknown> }) {
  return {
    accountId: String(req.query.accountId || ''),
    q: String(req.query.q || '').trim(),
    mode: String(req.query.mode || ''),
    type: String(req.query.type || ''),
    holderUserId: String(req.query.holderUserId || ''),
    dateFrom: req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null,
    dateTo: req.query.dateTo ? new Date(String(req.query.dateTo)) : null,
  };
}

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

router.get('/accounts', async (_req, res) => {
  res.json(
    await prisma.cashAccount.findMany({
      where: { isActive: true },
      include: accountHolderInclude,
      orderBy: { name: 'asc' },
    })
  );
});

router.post('/accounts', async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Nom du compte obligatoire' });
  const account = await prisma.cashAccount.create({
    data: {
      name,
      type: req.body.type || 'caisse',
      holderUserId: req.body.holderUserId || null,
      rib: req.body.rib || null,
      bankName: req.body.bankName || null,
      isActive: req.body.isActive !== false && req.body.isActive !== 'false',
    },
    include: accountHolderInclude,
  });
  await audit(req, 'création', 'CashAccount', account.id, account.name);
  res.status(201).json(account);
});

router.put('/accounts/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.cashAccount.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Compte introuvable' });
  const data: Record<string, unknown> = {};
  if (req.body.name != null) data.name = String(req.body.name).trim();
  if (req.body.type != null) data.type = req.body.type;
  if (req.body.holderUserId !== undefined) data.holderUserId = req.body.holderUserId || null;
  if (req.body.rib !== undefined) data.rib = req.body.rib || null;
  if (req.body.bankName !== undefined) data.bankName = req.body.bankName || null;
  if (req.body.isActive !== undefined) {
    data.isActive = req.body.isActive === true || req.body.isActive === 'true';
  }
  const account = await prisma.cashAccount.update({
    where: { id },
    data,
    include: accountHolderInclude,
  });
  await audit(req, 'modification', 'CashAccount', id, account.name);
  res.json(account);
});

router.get('/movements/stats', async (req, res) => {
  const { accountId, q, mode, type, holderUserId, dateFrom, dateTo } = movementQueryFilters(req);
  const where = buildMovementWhere(accountId, q, dateFrom, dateTo, mode, type, holderUserId);
  const withProofWhere = { AND: [where, { proofFile: { not: null } }] };

  const [total, withProof, accounts, agg] = await Promise.all([
    prisma.cashMovement.count({ where }),
    prisma.cashMovement.count({ where: withProofWhere }),
    prisma.cashAccount.count({ where: { isActive: true } }),
    prisma.cashMovement.aggregate({ where, _sum: { debit: true, credit: true } }),
  ]);
  const debit = agg._sum.debit || 0;
  const credit = agg._sum.credit || 0;
  res.json({ total, withProof, accounts, debit, credit, solde: credit - debit });
});

router.get('/movements/export/csv', async (req, res) => {
  const { accountId, q, mode, type, holderUserId, dateFrom, dateTo } = movementQueryFilters(req);
  const where = buildMovementWhere(accountId, q, dateFrom, dateTo, mode, type, holderUserId);

  const movements = await prisma.cashMovement.findMany({
    where,
    include: { account: true },
    orderBy: { date: 'desc' },
  });
  const header = 'Date;Désignation;Compte;Mode;Débit;Crédit;Remarque;Pièce';
  const rows = movements.map(
    (m) =>
      `${m.date.toISOString().slice(0, 10)};${m.designation};${m.account.name};${m.mode || ''};${m.debit};${m.credit};${(m.remark || '').replace(/;/g, ',')};${m.proofFile ? 'Oui' : 'Non'}`
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=caisse-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/movements/export/xlsx', async (req, res) => {
  const { accountId, q, mode, type, holderUserId, dateFrom, dateTo } = movementQueryFilters(req);
  const where = buildMovementWhere(accountId, q, dateFrom, dateTo, mode, type, holderUserId);

  const movements = await prisma.cashMovement.findMany({
    where,
    include: { account: true },
    orderBy: { date: 'desc' },
    take: 5000,
  });
  sendExcel(
    res,
    'caisse-gic.xlsx',
    'Caisse',
    movements.map((m) => ({
      Date: m.date.toISOString().slice(0, 10),
      Désignation: m.designation,
      Compte: m.account.name,
      Mode: m.mode || '',
      Débit: m.debit,
      Crédit: m.credit,
      Remarque: m.remark || '',
      Pièce: m.proofFile ? 'Oui' : 'Non',
    })),
  );
});

router.get('/movements', async (req, res) => {
  const { accountId, q, mode, type, holderUserId, dateFrom, dateTo } = movementQueryFilters(req);
  const sort = String(req.query.sort || 'date');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const where = buildMovementWhere(accountId, q, dateFrom, dateTo, mode, type, holderUserId);
  const orderBy =
    sort === 'designation'
      ? { designation: order as 'asc' | 'desc' }
      : sort === 'debit'
        ? { debit: order as 'asc' | 'desc' }
        : sort === 'credit'
          ? { credit: order as 'asc' | 'desc' }
          : { date: order as 'asc' | 'desc' };

  const [items, total, agg] = await Promise.all([
    prisma.cashMovement.findMany({
      where,
      include: { account: { include: accountHolderInclude } },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.cashMovement.count({ where }),
    prisma.cashMovement.aggregate({ where, _sum: { debit: true, credit: true } }),
  ]);

  const debit = agg._sum.debit || 0;
  const credit = agg._sum.credit || 0;
  res.json({
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    totals: { debit, credit, solde: credit - debit },
  });
});

router.post('/movements', movementUpload, async (req, res) => {
  const { designation, accountId, mode, remark, date } = req.body;
  const debit = Number(req.body.debit || 0);
  const credit = Number(req.body.credit || 0);
  if (!designation || !accountId) {
    return res.status(400).json({ message: 'Désignation et compte obligatoires' });
  }
  if ((!debit && !credit) || (debit > 0 && credit > 0)) {
    return res.status(400).json({ message: 'Renseigner un débit ou un crédit (pas les deux)' });
  }
  const account = await prisma.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) return res.status(404).json({ message: 'Compte introuvable' });
  const files = movementFiles(req);
  const movement = await prisma.cashMovement.create({
    data: {
      designation,
      accountId,
      mode: mode || null,
      debit: debit || 0,
      credit: credit || 0,
      remark: remark || null,
      date: date ? new Date(date) : new Date(),
      proofFile: files.proofFile || null,
      invoiceFile: files.invoiceFile || null,
      deliveryNoteFile: files.deliveryNoteFile || null,
      receptionPvFile: files.receptionPvFile || null,
      createdBy: req.user?.email || req.user?.id || null,
      isAutomatic: false,
      sourceType: 'manuel',
    },
    include: { account: { include: accountHolderInclude } },
  });
  await audit(req, 'création', 'CashMovement', movement.id, designation);
  res.status(201).json(movement);
});

router.get('/movements/:id/history', async (req, res) => {
  const movementId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'CashMovement', entityId: movementId },
        { details: { contains: movementId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/movements/:id', async (req, res) => {
  const movement = await prisma.cashMovement.findUnique({
    where: { id: String(req.params.id) },
    include: { account: { include: accountHolderInclude } },
  });
  if (!movement) return res.status(404).json({ message: 'Mouvement introuvable' });

  let sourceHref: string | null = null;
  if (movement.sourceType === 'encaissement' && movement.sourceId) {
    sourceHref = `/encaissements/${movement.sourceId}`;
  } else if (movement.sourceType === 'achat' && movement.sourceId) {
    sourceHref = `/achats/${movement.sourceId}`;
  } else if (movement.sourceType === 'main_oeuvre' && movement.sourceId) {
    const payroll = await prisma.workforcePayrollRecord.findUnique({
      where: { id: movement.sourceId },
      select: { workforceId: true },
    });
    if (payroll) sourceHref = `/salaires/${payroll.workforceId}`;
  } else if (movement.sourceType === 'equipe_interne' && movement.sourceId) {
    const record = await prisma.internalStaffSalaryRecord.findUnique({
      where: { id: movement.sourceId },
      select: { staffId: true },
    });
    if (record) sourceHref = `/equipe-interne/${record.staffId}`;
  } else if (movement.sourceType === 'maintenance' && movement.sourceId) {
    sourceHref = `/maintenance/${movement.sourceId}`;
  } else if (movement.sourceType === 'carburant' && movement.sourceId) {
    const log = await prisma.fuelLog.findUnique({
      where: { id: movement.sourceId },
      select: { enginId: true },
    });
    if (log) sourceHref = `/engins/${log.enginId}`;
  }

  res.json({ ...movement, sourceHref });
});

router.put('/movements/:id', movementUpload, async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.cashMovement.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Mouvement introuvable' });
  if (existing.isAutomatic) {
    return res.status(403).json({
      message: 'Ce mouvement est généré automatiquement et ne peut pas être modifié.',
    });
  }
  const data: Record<string, unknown> = {};
  if (req.body.designation != null) data.designation = req.body.designation;
  if (req.body.accountId != null) data.accountId = req.body.accountId;
  if (req.body.mode !== undefined) data.mode = req.body.mode || null;
  if (req.body.remark !== undefined) data.remark = req.body.remark || null;
  if (req.body.date) data.date = new Date(req.body.date);
  if (req.body.debit != null || req.body.credit != null) {
    const debit = req.body.debit != null ? Number(req.body.debit) : existing.debit;
    const credit = req.body.credit != null ? Number(req.body.credit) : existing.credit;
    if ((!debit && !credit) || (debit > 0 && credit > 0)) {
      return res.status(400).json({ message: 'Renseigner un débit ou un crédit (pas les deux)' });
    }
    data.debit = debit || 0;
    data.credit = credit || 0;
  }
  const files = movementFiles(req);
  if (files.proofFile) data.proofFile = files.proofFile;
  if (files.invoiceFile) data.invoiceFile = files.invoiceFile;
  if (files.deliveryNoteFile) data.deliveryNoteFile = files.deliveryNoteFile;
  if (files.receptionPvFile) data.receptionPvFile = files.receptionPvFile;
  const movement = await prisma.cashMovement.update({
    where: { id },
    data,
    include: { account: { include: accountHolderInclude } },
  });
  await audit(req, 'modification', 'CashMovement', id, movement.designation);
  res.json(movement);
});

router.delete('/movements/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.cashMovement.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Mouvement introuvable' });
  if (existing.isAutomatic) {
    return res.status(403).json({
      message: 'Ce mouvement est généré automatiquement. Supprimez ou modifiez l\'opération source.',
    });
  }
  await prisma.cashMovement.delete({ where: { id } });
  await audit(req, 'suppression', 'CashMovement', id, existing.designation);
  res.json({ ok: true });
});

router.get('/comptabilite/stats', async (req, res) => {
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const dateFilter =
    dateFrom || dateTo
      ? {
          date: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {};

  const [paymentAgg, movementAgg, purchaseAgg, saleAgg, accounts] = await Promise.all([
    prisma.payment.aggregate({ _sum: { amount: true }, _count: true, where: dateFilter }),
    prisma.cashMovement.aggregate({ _sum: { debit: true, credit: true }, where: dateFilter }),
    prisma.purchase.aggregate({
      _sum: { totalPrice: true },
      where: { status: { not: 'brouillon' }, ...dateFilter },
    }),
    prisma.sale.aggregate({ _sum: { totalPaid: true, remaining: true, netPrice: true } }),
    prisma.cashAccount.count({ where: { isActive: true } }),
  ]);
  const encaissements = paymentAgg._sum.amount || 0;
  const credits = movementAgg._sum.credit || 0;
  const debits = movementAgg._sum.debit || 0;
  res.json({
    encaissements,
    paiementsCount: paymentAgg._count,
    caisseSolde: credits - debits,
    caisseCredit: credits,
    caisseDebit: debits,
    achatsValides: purchaseAgg._sum.totalPrice || 0,
    ventesEncaisse: saleAgg._sum.totalPaid || 0,
    ventesReste: saleAgg._sum.remaining || 0,
    ventesVolume: saleAgg._sum.netPrice || 0,
    comptesActifs: accounts,
    tvaEstimee: Math.round(encaissements * 0.2),
  });
});

router.get('/comptabilite/journal', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const type = String(req.query.type || '');
  const sort = String(req.query.sort || 'date');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 30));
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;

  type JournalEntry = {
    id: string;
    date: Date;
    type: string;
    reference: string;
    label: string;
    debit: number;
    credit: number;
    mode?: string | null;
    entityType?: string;
    entityId?: string;
  };

  const entries: JournalEntry[] = [];

  const [payments, movements, purchases] = await Promise.all([
    prisma.payment.findMany({
      where: {
        AND: [
          dateFrom || dateTo
            ? {
                date: {
                  ...(dateFrom ? { gte: dateFrom } : {}),
                  ...(dateTo ? { lte: dateTo } : {}),
                },
              }
            : {},
        ],
      },
      include: { sale: true, rental: true },
      orderBy: { date: 'desc' },
      take: 500,
    }),
    prisma.cashMovement.findMany({
      where: {
        AND: [
          dateFrom || dateTo
            ? {
                date: {
                  ...(dateFrom ? { gte: dateFrom } : {}),
                  ...(dateTo ? { lte: dateTo } : {}),
                },
              }
            : {},
        ],
      },
      include: { account: true },
      orderBy: { date: 'desc' },
      take: 500,
    }),
    prisma.purchase.findMany({
      where: {
        status: { not: 'brouillon' },
        AND: [
          dateFrom || dateTo
            ? {
                date: {
                  ...(dateFrom ? { gte: dateFrom } : {}),
                  ...(dateTo ? { lte: dateTo } : {}),
                },
              }
            : {},
        ],
      },
      orderBy: { date: 'desc' },
      take: 500,
    }),
  ]);

  for (const p of payments) {
    entries.push({
      id: `pay-${p.id}`,
      date: p.date,
      type: 'encaissement',
      reference: p.receiptNo,
      label: p.saleId ? `Encaissement vente ${p.sale?.reference || ''}` : `Encaissement location ${p.rental?.reference || ''}`,
      debit: 0,
      credit: p.amount,
      mode: p.operationType,
      entityType: 'payment',
      entityId: p.id,
    });
  }
  for (const m of movements) {
    entries.push({
      id: `mv-${m.id}`,
      date: m.date,
      type: 'caisse',
      reference: m.id.slice(0, 8),
      label: `${m.designation} (${m.account.name})`,
      debit: m.debit,
      credit: m.credit,
      mode: m.mode,
      entityType: 'movement',
      entityId: m.id,
    });
  }
  for (const a of purchases) {
    entries.push({
      id: `ach-${a.id}`,
      date: a.date,
      type: 'achat',
      reference: a.reference,
      label: a.designation,
      debit: a.totalPrice,
      credit: 0,
      mode: a.paymentMode,
      entityType: 'purchase',
      entityId: a.id,
    });
  }

  let filtered = entries;
  if (type) filtered = filtered.filter((e) => e.type === type);
  if (q) {
    filtered = filtered.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.reference.toLowerCase().includes(q) ||
        e.type.includes(q)
    );
  }

  const sortMult = order === 'asc' ? 1 : -1;
  filtered = [...filtered].sort((a, b) => {
    if (sort === 'debit') return (a.debit - b.debit) * sortMult;
    if (sort === 'credit') return (a.credit - b.credit) * sortMult;
    return (a.date.getTime() - b.date.getTime()) * sortMult;
  });

  const total = filtered.length;
  const skip = (page - 1) * limit;
  const items = filtered.slice(skip, skip + limit);
  const totals = filtered.reduce(
    (acc, e) => ({ debit: acc.debit + e.debit, credit: acc.credit + e.credit }),
    { debit: 0, credit: 0 }
  );

  res.json({
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    totals,
  });
});

router.get('/comptabilite/journal/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const type = String(req.query.type || '');
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;

  type JournalEntry = { date: Date; type: string; reference: string; label: string; debit: number; credit: number; mode?: string | null };
  const entries: JournalEntry[] = [];

  const dateFilter =
    dateFrom || dateTo
      ? { date: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
      : undefined;

  const [payments, movements, purchases] = await Promise.all([
    prisma.payment.findMany({ where: dateFilter, include: { sale: true, rental: true }, orderBy: { date: 'desc' }, take: 1000 }),
    prisma.cashMovement.findMany({ where: dateFilter, include: { account: true }, orderBy: { date: 'desc' }, take: 1000 }),
    prisma.purchase.findMany({ where: { status: { not: 'brouillon' }, ...(dateFilter || {}) }, orderBy: { date: 'desc' }, take: 1000 }),
  ]);

  for (const p of payments) {
    entries.push({
      date: p.date, type: 'encaissement', reference: p.receiptNo,
      label: p.saleId ? `Encaissement vente ${p.sale?.reference || ''}` : `Encaissement location ${p.rental?.reference || ''}`,
      debit: 0, credit: p.amount, mode: p.operationType,
    });
  }
  for (const m of movements) {
    entries.push({
      date: m.date, type: 'caisse', reference: m.id.slice(0, 8),
      label: `${m.designation} (${m.account.name})`, debit: m.debit, credit: m.credit, mode: m.mode,
    });
  }
  for (const a of purchases) {
    entries.push({ date: a.date, type: 'achat', reference: a.reference, label: a.designation, debit: a.totalPrice, credit: 0, mode: a.paymentMode });
  }

  let filtered = entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  if (type) filtered = filtered.filter((e) => e.type === type);
  if (q) filtered = filtered.filter((e) => e.label.toLowerCase().includes(q) || e.reference.toLowerCase().includes(q));

  const header = 'Date;Type;Référence;Libellé;Mode;Débit;Crédit';
  const rows = filtered.map((e) =>
    [e.date.toISOString().slice(0, 10), e.type, e.reference, e.label.replace(/;/g, ','), e.mode || '', e.debit, e.credit].join(';')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=journal-comptable-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/decaissements/stats', async (req, res) => {
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const dateFilter =
    dateFrom || dateTo
      ? {
          date: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {};

  const [achats, mainOeuvre, chauffeursPayroll, equipeInterne, maintenanceAgg, fuelAgg, movementAgg] = await Promise.all([
    prisma.purchase.aggregate({
      _sum: { totalPrice: true },
      _count: true,
      where: { status: 'contrôlé', ...dateFilter },
    }),
    prisma.workforcePayrollRecord.aggregate({
      _sum: { amountPaid: true, remaining: true, netDue: true },
      _count: true,
      where: {
        amountPaid: { gt: 0 },
        workforce: { NOT: { category: CHAUFFEUR_CATEGORY } },
        ...(dateFrom || dateTo
          ? {
              paidAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
    }),
    prisma.workforcePayrollRecord.aggregate({
      _sum: { amountPaid: true, remaining: true, netDue: true },
      _count: true,
      where: {
        amountPaid: { gt: 0 },
        workforce: { category: CHAUFFEUR_CATEGORY },
        ...(dateFrom || dateTo
          ? {
              paidAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
    }),
    prisma.internalStaffSalaryRecord.aggregate({
      _sum: { netSalary: true, advance: true },
      _count: true,
      where: {
        status: 'payé',
        ...(dateFrom || dateTo
          ? {
              paidAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
    }),
    prisma.maintenance.aggregate({
      _sum: { budget: true },
      _count: true,
      where: {
        budget: { gt: 0 },
        ...(dateFrom || dateTo
          ? {
              date: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
    }),
    prisma.fuelLog.aggregate({
      _sum: { cost: true },
      _count: true,
      where: {
        cost: { gt: 0 },
        ...(dateFrom || dateTo
          ? {
              date: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
    }),
    prisma.cashMovement.aggregate({
      _sum: { debit: true },
      where: { debit: { gt: 0 }, isAutomatic: true, ...dateFilter },
    }),
  ]);

  res.json({
    totalDebit: movementAgg._sum.debit || 0,
    achats: achats._sum.totalPrice || 0,
    achatsCount: achats._count,
    mainOeuvre: mainOeuvre._sum.amountPaid || 0,
    mainOeuvreDue: mainOeuvre._sum.netDue || 0,
    mainOeuvreRemaining: mainOeuvre._sum.remaining || 0,
    mainOeuvreCount: mainOeuvre._count,
    chauffeurs: chauffeursPayroll._sum.amountPaid || 0,
    chauffeursDue: chauffeursPayroll._sum.netDue || 0,
    chauffeursRemaining: chauffeursPayroll._sum.remaining || 0,
    chauffeursCount: chauffeursPayroll._count,
    equipeInterne: equipeInterne._sum.netSalary || 0,
    equipeInterneCount: equipeInterne._count,
    maintenance: maintenanceAgg._sum.budget || 0,
    maintenanceCount: maintenanceAgg._count,
    carburant: fuelAgg._sum.cost || 0,
    carburantCount: fuelAgg._count,
  });
});

router.get('/decaissements', async (req, res) => {
  const category = String(req.query.category || 'all');
  const q = String(req.query.q || '').trim().toLowerCase();
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  if (dateTo) dateTo.setHours(23, 59, 59, 999);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 30));

  type Item = {
    id: string;
    date: Date;
    category: string;
    reference: string;
    label: string;
    amount: number;
    remaining?: number;
    mode?: string | null;
    status: string;
    entityType: string;
    entityId: string;
    brut?: number;
    advances?: number;
    bonuses?: number;
    netDue?: number;
    amountPaid?: number;
    baseSalary?: number;
    advance?: number;
    netSalary?: number;
    period?: string;
    supplier?: string;
    engin?: string;
  };

  const items: Item[] = [];
  const includeAll = category === 'all';
  const dateFilter =
    dateFrom || dateTo
      ? { date: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
      : undefined;
  const paidAtFilter =
    dateFrom || dateTo
      ? {
          paidAt: {
            not: null,
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : { paidAt: { not: null } };

  if (includeAll || category === 'achat') {
    const purchases = await prisma.purchase.findMany({
      where: { status: 'contrôlé', ...(dateFilter || {}) },
      include: { supplier: { select: { companyName: true } } },
      orderBy: { date: 'desc' },
      take: 500,
    });
    for (const a of purchases) {
      items.push({
        id: `ach-${a.id}`,
        date: a.date,
        category: 'achat',
        reference: a.reference,
        label: a.designation,
        supplier: a.supplier?.companyName || undefined,
        amount: a.totalPrice,
        mode: a.paymentMode,
        status: a.status,
        entityType: 'purchase',
        entityId: a.id,
      });
    }
  }

  const payrollCategories: Array<'main_oeuvre' | 'chauffeurs'> = includeAll
    ? ['main_oeuvre', 'chauffeurs']
    : category === 'chauffeurs'
      ? ['chauffeurs']
      : category === 'main_oeuvre'
        ? ['main_oeuvre']
        : [];

  for (const pc of payrollCategories) {
    const isChauffeur = pc === 'chauffeurs';
    const workforceWhere = isChauffeur
      ? { category: CHAUFFEUR_CATEGORY }
      : { NOT: { category: CHAUFFEUR_CATEGORY } };
    const itemCategory = pc;
    const idPrefix = isChauffeur ? 'ch' : 'mo';

    const payrolls = await prisma.workforcePayrollRecord.findMany({
      where: {
        amountPaid: { gt: 0 },
        ...paidAtFilter,
        workforce: workforceWhere,
      },
      include: {
        workforce: { select: { firstName: true, lastName: true, reference: true, category: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 500,
    });
    for (const p of payrolls) {
      const period = `${String(p.periodMonth).padStart(2, '0')}/${p.periodYear}`;
      items.push({
        id: `${idPrefix}-${p.id}`,
        date: p.paidAt || p.updatedAt,
        category: itemCategory,
        reference: p.reference || period,
        label: `${p.workforce.firstName} ${p.workforce.lastName}`,
        period,
        brut: p.brut,
        advances: p.advances,
        bonuses: p.bonuses,
        netDue: p.netDue,
        amountPaid: p.amountPaid,
        amount: p.amountPaid,
        remaining: p.remaining,
        mode: p.paymentMode,
        status: p.status,
        entityType: 'workforce_payroll',
        entityId: p.workforceId,
      });
    }
  }

  if (includeAll || category === 'equipe_interne') {
    const records = await prisma.internalStaffSalaryRecord.findMany({
      where: {
        status: 'payé',
        ...paidAtFilter,
      },
      include: { staff: { select: { firstName: true, lastName: true, reference: true } } },
      orderBy: { paidAt: 'desc' },
      take: 500,
    });
    for (const r of records) {
      const period = `${String(r.periodMonth).padStart(2, '0')}/${r.periodYear}`;
      items.push({
        id: `ei-${r.id}`,
        date: r.paidAt || r.updatedAt,
        category: 'equipe_interne',
        reference: r.staff.reference || period,
        label: `${r.staff.firstName} ${r.staff.lastName}`,
        period,
        baseSalary: r.baseSalary,
        advance: r.advance,
        bonuses: r.bonus,
        netSalary: r.netSalary,
        amount: r.netSalary,
        remaining: 0,
        mode: 'virement',
        status: r.status,
        entityType: 'staff_salary',
        entityId: r.staffId,
      });
    }
  }

  if (includeAll || category === 'maintenance') {
    const maintenances = await prisma.maintenance.findMany({
      where: {
        budget: { gt: 0 },
        ...(dateFilter || {}),
      },
      include: {
        engin: { select: { id: true, brand: true, matricule: true, genre: true } },
      },
      orderBy: { date: 'desc' },
      take: 500,
    });
    for (const m of maintenances) {
      const enginLabel = m.engin
        ? `${m.engin.brand || m.engin.genre || 'Engin'} ${m.engin.matricule || ''}`.trim()
        : 'Engin';
      items.push({
        id: `mnt-${m.id}`,
        date: m.date,
        category: 'maintenance',
        reference: m.id.slice(0, 8).toUpperCase(),
        label: m.designation,
        engin: enginLabel,
        amount: m.budget || 0,
        status: 'enregistré',
        entityType: 'maintenance',
        entityId: m.id,
      });
    }
  }

  if (includeAll || category === 'carburant') {
    const fuels = await prisma.fuelLog.findMany({
      where: {
        cost: { gt: 0 },
        ...(dateFilter || {}),
      },
      include: {
        engin: { select: { id: true, brand: true, matricule: true, genre: true } },
      },
      orderBy: { date: 'desc' },
      take: 500,
    });
    for (const f of fuels) {
      const enginLabel = f.engin
        ? `${f.engin.brand || f.engin.genre || 'Engin'} ${f.engin.matricule || ''}`.trim()
        : 'Engin';
      items.push({
        id: `fuel-${f.id}`,
        date: f.date,
        category: 'carburant',
        reference: f.id.slice(0, 8).toUpperCase(),
        label: `${f.liters} L — ${enginLabel}`,
        engin: enginLabel,
        amount: f.cost || 0,
        status: 'enregistré',
        entityType: 'fuel_log',
        entityId: f.enginId,
      });
    }
  }

  let filtered = items.sort((a, b) => b.date.getTime() - a.date.getTime());
  if (q) {
    filtered = filtered.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.reference.toLowerCase().includes(q) ||
        i.category.includes(q),
    );
  }

  const total = filtered.length;
  const skip = (page - 1) * limit;
  const pageItems = filtered.slice(skip, skip + limit);
  const totalAmount = filtered.reduce((s, i) => s + i.amount, 0);
  const totalRemaining = filtered.reduce((s, i) => s + (i.remaining || 0), 0);

  res.json({
    items: pageItems,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    totals: { amount: totalAmount, remaining: totalRemaining },
  });
});

export default router;
