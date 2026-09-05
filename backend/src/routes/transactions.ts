import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { nextReference } from '../lib/references.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import { assertUniquePaymentRefs } from '../lib/uniqueness.js';
import { notifyAllAdmins } from '../lib/notifications.js';
import { sendExcel } from '../lib/exportExcel.js';
import { sendPdfTable } from '../lib/exportPdf.js';
import { removeAutomaticMovement, syncEncaissementMovement } from '../lib/cashSync.js';
import { upload } from '../lib/upload.js';
import { addMonths, iterRentMonths, monthKey, monthLabelFr, startOfMonth } from '../lib/rentMonths.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

/** Sync des mois de loyer (idempotent) + recalcul totalPaid / remaining */
async function syncRentalMonthSchedules(
  rentalId: string,
  opts?: { startDate?: Date | null; endDate?: Date | null; monthlyRent?: number; horizonMonths?: number },
) {
  const rental = await prisma.rental.findUnique({ where: { id: rentalId } });
  if (!rental) return [];

  const start = opts?.startDate ?? rental.startDate ?? rental.contractDate ?? rental.createdAt;
  const end = opts?.endDate !== undefined ? opts.endDate : rental.endDate;
  const rent = opts?.monthlyRent ?? rental.monthlyRent;
  const months = iterRentMonths(start, end, opts?.horizonMonths ?? 6);

  const existing = await prisma.paymentSchedule.findMany({ where: { rentalId } });
  const byKey = new Map(existing.map((s) => [monthKey(new Date(s.dueDate)), s]));

  for (const m of months) {
    const key = monthKey(m);
    const label = `Loyer ${monthLabelFr(m)}`;
    const found = byKey.get(key);
    if (!found) {
      await prisma.paymentSchedule.create({
        data: {
          rentalId,
          dueDate: m,
          amount: rent,
          label,
          status: 'pending',
        },
      });
    } else if (found.status !== 'paid' && found.amount !== rent) {
      await prisma.paymentSchedule.update({
        where: { id: found.id },
        data: { amount: rent, label: found.label || label },
      });
    }
  }

  return recalculateRentalBalances(rentalId);
}

async function recalculateRentalBalances(rentalId: string) {
  const schedules = await prisma.paymentSchedule.findMany({ where: { rentalId } });
  const unpaid = schedules.filter((s) => s.status !== 'paid');
  const paidSum = schedules.filter((s) => s.status === 'paid').reduce((a, s) => a + s.amount, 0);
  const remaining = unpaid.reduce((a, s) => a + s.amount, 0);

  // Prefer sum of linked payments if any; else paid schedule amounts
  const paymentAgg = await prisma.payment.aggregate({
    where: { rentalId },
    _sum: { amount: true },
  });
  const totalPaid = paymentAgg._sum.amount ?? paidSum;

  await prisma.rental.update({
    where: { id: rentalId },
    data: {
      totalPaid,
      remaining,
    },
  });
  return prisma.paymentSchedule.findMany({ where: { rentalId }, orderBy: { dueDate: 'asc' } });
}

function buildSaleWhere(q: string, status: string, clientId: string) {
  return {
    AND: [
      q
        ? {
            OR: [
              { reference: { contains: q } },
              { client: { lastName: { contains: q } } },
              { client: { firstName: { contains: q } } },
              { client: { reference: { contains: q } } },
              { property: { name: { contains: q } } },
              { property: { reference: { contains: q } } },
            ],
          }
        : {},
      status ? { status } : {},
      clientId ? { clientId } : {},
    ],
  };
}

router.get('/sales/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const clientId = String(req.query.clientId || '');
  const where = buildSaleWhere(q, status, clientId);
  const sales = await prisma.sale.findMany({
    where,
    include: { client: true, property: true },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  const header = 'Référence;Client;Bien;Prix net;Payé;Reste;Statut;Date contrat';
  const rows = sales.map(
    (s) =>
      `${s.reference};${s.client.firstName} ${s.client.lastName};${s.property.name};${s.netPrice};${s.totalPaid};${s.remaining};${s.status};${s.contractDate ? s.contractDate.toISOString().slice(0, 10) : ''}`
  );
  const csv = [header, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=ventes-gic.csv');
  res.send('\uFEFF' + csv);
});

router.get('/sales/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const clientId = String(req.query.clientId || '');
  const where = buildSaleWhere(q, status, clientId);
  const sales = await prisma.sale.findMany({
    where,
    include: { client: true, property: true },
    orderBy: { createdAt: 'desc' },
  });
  sendExcel(
    res,
    'ventes-gic.xlsx',
    'Ventes',
    sales.map((s) => ({
      Référence: s.reference,
      Client: `${s.client.firstName} ${s.client.lastName}`,
      Bien: s.property.name,
      'Prix net': s.netPrice,
      Payé: s.totalPaid,
      Reste: s.remaining,
      Statut: s.status,
      'Date contrat': s.contractDate ? s.contractDate.toISOString().slice(0, 10) : '',
    }))
  );
});

router.get('/sales/export/pdf', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const clientId = String(req.query.clientId || '');
  const where = buildSaleWhere(q, status, clientId);
  const sales = await prisma.sale.findMany({
    where,
    include: { client: true, property: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  sendPdfTable(
    res,
    'ventes-gic.pdf',
    'Liste des ventes — GIC',
    [
      { key: 'ref', label: 'Réf.' },
      { key: 'client', label: 'Client' },
      { key: 'bien', label: 'Bien' },
      { key: 'net', label: 'Net' },
      { key: 'paye', label: 'Payé' },
      { key: 'statut', label: 'Statut' },
    ],
    sales.map((s) => ({
      ref: s.reference,
      client: `${s.client.firstName} ${s.client.lastName}`,
      bien: s.property.name,
      net: s.netPrice,
      paye: s.totalPaid,
      statut: s.status,
    }))
  );
});

router.get('/sales/stats', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const clientId = String(req.query.clientId || '');
  const baseWhere = buildSaleWhere(q, status, clientId);
  const activeFilter = { AND: [baseWhere, { status: { notIn: ['annulée', 'résiliée'] } }] };
  const [total, soldees, enCours, agg] = await Promise.all([
    prisma.sale.count({ where: activeFilter }),
    prisma.sale.count({ where: { AND: [baseWhere, { status: 'soldée' }] } }),
    prisma.sale.count({ where: { AND: [activeFilter, { remaining: { gt: 0 } }] } }),
    prisma.sale.aggregate({
      _sum: { totalPaid: true, remaining: true, netPrice: true },
      where: activeFilter,
    }),
  ]);
  res.json({
    total,
    soldees,
    enCours,
    encaisse: agg._sum.totalPaid || 0,
    reste: agg._sum.remaining || 0,
    volume: agg._sum.netPrice || 0,
  });
});

router.get('/sales', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const clientId = String(req.query.clientId || '');
  const sort = String(req.query.sort || 'createdAt');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const orderBy =
    sort === 'reference'
      ? { reference: order as 'asc' | 'desc' }
      : sort === 'remaining'
        ? { remaining: order as 'asc' | 'desc' }
        : { createdAt: order as 'asc' | 'desc' };

  const where = buildSaleWhere(q, status, clientId);
  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        client: { select: { id: true, reference: true, firstName: true, lastName: true } },
        property: { select: { id: true, reference: true, name: true, projectId: true } },
        payments: { orderBy: { date: 'desc' }, take: 1 },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.sale.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.post('/sales', async (req, res) => {
  const { clientId, propertyId, salePrice, discount = 0, advance = 0, contractType, description, status } = req.body;
  if (!clientId || !propertyId || salePrice == null) {
    return res.status(400).json({ message: 'Client, bien et prix obligatoires' });
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) return res.status(404).json({ message: 'Bien introuvable' });
  if (property.status === 'vendu') {
    return res.status(400).json({ message: 'Bien déjà vendu (RG-BIEN-002)' });
  }
  const active = await prisma.sale.findFirst({
    where: { propertyId, status: { notIn: ['annulée', 'résiliée'] } },
  });
  if (active) {
    return res.status(400).json({ message: 'Une vente active existe déjà pour ce bien' });
  }
  const netPrice = Number(salePrice) - Number(discount || 0);
  const advanceAmount = Number(advance || 0);
  const remaining = netPrice - advanceAmount;
  const reference = await nextReference('VNT');
  const sale = await prisma.$transaction(async (tx) => {
    const created = await tx.sale.create({
      data: {
        reference,
        clientId,
        propertyId,
        salePrice: Number(salePrice),
        discount: Number(discount || 0),
        advance: advanceAmount,
        netPrice,
        totalPaid: advanceAmount,
        remaining,
        contractType,
        description,
        status: status || 'en_cours',
        contractDate: req.body.contractDate ? new Date(req.body.contractDate) : new Date(),
        sellerSignatureDate: req.body.sellerSignatureDate || null,
        sellerLegalizationNo: req.body.sellerLegalizationNo || null,
        buyerSignatureDate: req.body.buyerSignatureDate || null,
        buyerLegalizationNo: req.body.buyerLegalizationNo || null,
      },
      include: { client: true, property: true },
    });
    await tx.property.update({ where: { id: propertyId }, data: { status: 'vendu' } });
    await tx.client.update({
      where: { id: clientId },
      data: { isBuyer: true, isProspect: false },
    });
    return created;
  });
  await audit(req, 'création', 'Sale', sale.id, reference);

  if (advanceAmount > 0) {
    const receiptNo = await nextReference('REC');
    const client = sale.client;
    const payment = await prisma.payment.create({
      data: {
        receiptNo,
        saleId: sale.id,
        amount: advanceAmount,
        nature: 'acompte',
        operationType: req.body.advanceMode || req.body.paymentMode || 'especes',
        bank: req.body.advanceBank || null,
        payerName: client ? `${client.firstName} ${client.lastName}`.trim() : null,
        date: sale.contractDate,
      },
    });
    await audit(req, 'création', 'Payment', payment.id, `${receiptNo} — acompte ${reference}`);
    const full = await prisma.payment.findUnique({
      where: { id: payment.id },
      include: { sale: { select: { reference: true } }, rental: { select: { reference: true } } },
    });
    if (full) await syncEncaissementMovement(full, req);
  }

  res.status(201).json(sale);
});

router.get('/sales/:id/documents', async (req, res) => {
  const saleId = String(req.params.id);
  const docs = await prisma.document.findMany({
    where: {
      OR: [
        { saleId },
        { entityType: 'Sale', entityId: saleId },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs);
});

router.get('/sales/:id/history', async (req, res) => {
  const saleId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Sale', entityId: saleId },
        { details: { contains: saleId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/sales/:id', async (req, res) => {
  const sale = await prisma.sale.findUnique({
    where: { id: String(req.params.id) },
    include: {
      client: true,
      property: {
        include: {
          project: true,
          floor: {
            include: {
              lot: {
                include: {
                  bloc: {
                    include: {
                      tranche: { include: { project: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      payments: { orderBy: { date: 'desc' } },
      documents: true,
      schedules: { orderBy: { dueDate: 'asc' } },
    },
  });
  if (!sale) return res.status(404).json({ message: 'Vente introuvable' });
  res.json(sale);
});

router.get('/sales/:id/schedules', async (req, res) => {
  const saleId = String(req.params.id);
  const items = await prisma.paymentSchedule.findMany({ where: { saleId }, orderBy: { dueDate: 'asc' } });
  res.json(items);
});

router.post('/sales/:id/schedules', async (req, res) => {
  const saleId = String(req.params.id);
  const { dueDate, amount, label, remark } = req.body;
  if (!dueDate || amount == null) return res.status(400).json({ message: 'Date et montant requis' });
  const item = await prisma.paymentSchedule.create({
    data: {
      saleId,
      dueDate: new Date(dueDate),
      amount: Number(amount),
      label: label || null,
      remark: remark || null,
    },
  });
  res.status(201).json(item);
});

router.post('/sales/:id/schedules/generate', async (req, res) => {
  const saleId = String(req.params.id);
  const count = Math.max(1, Math.min(60, Number(req.body.count) || 12));
  const startDate = req.body.startDate ? new Date(req.body.startDate) : new Date();
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) return res.status(404).json({ message: 'Vente introuvable' });
  const total = sale.remaining > 0 ? sale.remaining : sale.netPrice;
  const per = Math.round((total / count) * 100) / 100;
  await prisma.paymentSchedule.deleteMany({ where: { saleId, status: 'pending' } });
  const items = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);
    const amt = i === count - 1 ? Math.round((total - per * (count - 1)) * 100) / 100 : per;
    items.push(
      await prisma.paymentSchedule.create({
        data: {
          saleId,
          dueDate: d,
          amount: amt,
          label: `Échéance ${i + 1}/${count}`,
        },
      })
    );
  }
  res.status(201).json(items);
});

router.put('/sales/:id', async (req, res) => {
  const id = String(req.params.id);
  const sale = await prisma.sale.findUnique({ where: { id } });
  if (!sale) return res.status(404).json({ message: 'Vente introuvable' });
  if (['résiliée', 'annulée'].includes(sale.status)) {
    return res.status(400).json({ message: 'Vente clôturée — modification impossible' });
  }
  const data: Record<string, unknown> = {};
  if (req.body.description != null) data.description = req.body.description;
  if (req.body.contractType != null) data.contractType = req.body.contractType;
  if (req.body.contractDate != null) data.contractDate = new Date(req.body.contractDate);
  if (req.body.status != null) data.status = req.body.status;
  if (req.body.sellerSignatureDate !== undefined) data.sellerSignatureDate = req.body.sellerSignatureDate || null;
  if (req.body.sellerLegalizationNo !== undefined) data.sellerLegalizationNo = req.body.sellerLegalizationNo || null;
  if (req.body.buyerSignatureDate !== undefined) data.buyerSignatureDate = req.body.buyerSignatureDate || null;
  if (req.body.buyerLegalizationNo !== undefined) data.buyerLegalizationNo = req.body.buyerLegalizationNo || null;
  const updated = await prisma.sale.update({ where: { id }, data });
  await audit(req, 'modification', 'Sale', id, updated.reference);
  res.json(updated);
});

router.post('/sales/:id/resiliate', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  const newClientId = String(req.body?.newClientId || '').trim();
  const createNewSale = req.body?.createNewSale === true;
  if (!motif) return res.status(400).json({ message: 'Motif de résiliation obligatoire' });
  const sale = await prisma.sale.findUnique({ where: { id }, include: { property: true, client: true } });
  if (!sale) return res.status(404).json({ message: 'Vente introuvable' });
  if (['résiliée', 'annulée', 'soldée'].includes(sale.status)) {
    return res.status(400).json({ message: 'Cette vente ne peut pas être résiliée' });
  }

  const result = await prisma.$transaction(async (tx) => {
    const s = await tx.sale.update({
      where: { id: sale.id },
      data: {
        status: 'résiliée',
        resiliationMotif: motif,
        resiliatedAt: new Date(),
        resiliatedBy: req.user?.email || req.user?.id || null,
        description: sale.description ? `${sale.description}\n[Résiliation] ${motif}` : `[Résiliation] ${motif}`,
      },
    });
    await tx.property.update({
      where: { id: sale.propertyId },
      data: { status: 'disponible' },
    });

    let newSale = null;
    if (createNewSale && newClientId) {
      const active = await tx.sale.findFirst({
        where: { propertyId: sale.propertyId, status: { notIn: ['résiliée', 'annulée'] } },
      });
      if (active) throw new Error('Une vente active existe encore pour ce bien');
      const client = await tx.client.findUnique({ where: { id: newClientId } });
      if (!client) throw new Error('Nouveau client introuvable');
      const reference = await nextReference('VTE');
      newSale = await tx.sale.create({
        data: {
          reference,
          clientId: newClientId,
          propertyId: sale.propertyId,
          salePrice: sale.salePrice,
          discount: sale.discount,
          advance: 0,
          netPrice: sale.netPrice,
          totalPaid: 0,
          remaining: sale.netPrice,
          contractType: sale.contractType,
          status: 'brouillon',
          description: `Reprise après résiliation ${sale.reference}`,
        },
      });
      await tx.property.update({ where: { id: sale.propertyId }, data: { status: 'réservé' } });
      await tx.client.update({ where: { id: newClientId }, data: { isBuyer: true, isProspect: false } });
    }

    return { sale: s, newSale };
  });

  await audit(req, 'résiliation', 'Sale', sale.id, motif);
  if (result.newSale) {
    await audit(req, 'création', 'Sale', result.newSale.id, `Reprise bien après résiliation ${sale.reference}`);
  }
  res.json(result);
});

router.delete('/sales/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { payments: { select: { id: true } } },
  });
  if (!sale) return res.status(404).json({ message: 'Vente introuvable' });
  if (sale.payments.length > 0) {
    return res.status(400).json({
      message: 'Impossible de supprimer : des paiements existent. Supprimez d\'abord les encaissements liés.',
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentSchedule.deleteMany({ where: { saleId: id } });
    await tx.document.updateMany({ where: { saleId: id }, data: { saleId: null } });
    await tx.sale.delete({ where: { id } });
    await tx.property.update({
      where: { id: sale.propertyId },
      data: { status: 'disponible' },
    });
  });

  await audit(req, 'suppression', 'Sale', id, `${sale.reference}: ${motif}`);
  res.json({ ok: true });
});

function buildRentalWhere(q: string, status: string, clientId: string) {
  return {
    AND: [
      q
        ? {
            OR: [
              { reference: { contains: q } },
              { client: { lastName: { contains: q } } },
              { client: { firstName: { contains: q } } },
              { client: { reference: { contains: q } } },
              { property: { name: { contains: q } } },
              { property: { reference: { contains: q } } },
            ],
          }
        : {},
      status ? { status } : {},
      clientId ? { clientId } : {},
    ],
  };
}

router.get('/rentals/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const clientId = String(req.query.clientId || '');
  const where = buildRentalWhere(q, status, clientId);
  const rentals = await prisma.rental.findMany({
    where,
    include: { client: true, property: true },
    orderBy: { createdAt: 'desc' },
  });
  const header = 'Référence;Locataire;Bien;Mensualité;Payé;Reste;Statut;Date contrat;Description';
  const rows = rentals.map(
    (r) =>
      `${r.reference};${r.client.firstName} ${r.client.lastName};${r.property.name};${r.monthlyRent};${r.totalPaid};${r.remaining};${r.status};${r.contractDate ? r.contractDate.toISOString().slice(0, 10) : ''};${(r.description || '').replace(/;/g, ',')}`
  );
  const csv = [header, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=locations-gic.csv');
  res.send('\uFEFF' + csv);
});

router.get('/rentals/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const clientId = String(req.query.clientId || '');
  const where = buildRentalWhere(q, status, clientId);
  const rentals = await prisma.rental.findMany({
    where,
    include: { client: true, property: true },
    orderBy: { createdAt: 'desc' },
  });
  sendExcel(
    res,
    'locations-gic.xlsx',
    'Locations',
    rentals.map((r) => ({
      Référence: r.reference,
      Locataire: `${r.client.firstName} ${r.client.lastName}`,
      Bien: r.property.name,
      Mensualité: r.monthlyRent,
      Payé: r.totalPaid,
      Reste: r.remaining,
      Statut: r.status,
      'Date contrat': r.contractDate ? r.contractDate.toISOString().slice(0, 10) : '',
    }))
  );
});

router.get('/rentals/export/pdf', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const clientId = String(req.query.clientId || '');
  const where = buildRentalWhere(q, status, clientId);
  const rentals = await prisma.rental.findMany({
    where,
    include: { client: true, property: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  sendPdfTable(
    res,
    'locations-gic.pdf',
    'Liste des locations — GIC',
    [
      { key: 'ref', label: 'Réf.' },
      { key: 'client', label: 'Locataire' },
      { key: 'bien', label: 'Bien' },
      { key: 'loyer', label: 'Mensualité' },
      { key: 'statut', label: 'Statut' },
    ],
    rentals.map((r) => ({
      ref: r.reference,
      client: `${r.client.firstName} ${r.client.lastName}`,
      bien: r.property.name,
      loyer: r.monthlyRent,
      statut: r.status,
    }))
  );
});

router.get('/rentals/stats', async (_req, res) => {
  const [total, actives, terminees, agg] = await Promise.all([
    prisma.rental.count(),
    prisma.rental.count({ where: { status: 'active' } }),
    prisma.rental.count({ where: { status: 'terminée' } }),
    prisma.rental.aggregate({
      _sum: { totalPaid: true, remaining: true, monthlyRent: true },
      where: { status: 'active' },
    }),
  ]);
  res.json({
    total,
    actives,
    terminees,
    encaisse: agg._sum.totalPaid || 0,
    reste: agg._sum.remaining || 0,
    mensualites: agg._sum.monthlyRent || 0,
  });
});

router.get('/rentals', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const clientId = String(req.query.clientId || '');
  const sort = String(req.query.sort || 'createdAt');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const orderBy =
    sort === 'reference'
      ? { reference: order as 'asc' | 'desc' }
      : sort === 'monthlyRent'
        ? { monthlyRent: order as 'asc' | 'desc' }
        : { createdAt: order as 'asc' | 'desc' };

  const where = buildRentalWhere(q, status, clientId);
  const [items, total] = await Promise.all([
    prisma.rental.findMany({
      where,
      include: {
        client: { select: { id: true, reference: true, firstName: true, lastName: true } },
        property: { select: { id: true, reference: true, name: true } },
        payments: { orderBy: { date: 'desc' }, take: 1 },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.rental.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.post('/rentals', async (req, res) => {
  const { clientId, propertyId, monthlyRent, discount = 0, contractType, description } = req.body;
  if (!clientId || !propertyId || monthlyRent == null) {
    return res.status(400).json({ message: 'Client, bien et mensualité obligatoires' });
  }
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property || !['disponible', 'réservé'].includes(property.status)) {
    return res.status(400).json({ message: 'Bien non disponible à la location' });
  }
  const startDate = req.body.startDate
    ? new Date(req.body.startDate)
    : req.body.contractDate
      ? new Date(req.body.contractDate)
      : new Date();
  const endDate = req.body.endDate ? new Date(req.body.endDate) : null;
  if (endDate && endDate < startDate) {
    return res.status(400).json({ message: 'La date de fin doit être après la date de début' });
  }
  const reference = await nextReference('LOC');
  const rentNet = Number(monthlyRent) - Number(discount || 0);
  const rental = await prisma.$transaction(async (tx) => {
    const created = await tx.rental.create({
      data: {
        reference,
        clientId,
        propertyId,
        monthlyRent: Number(monthlyRent),
        discount: Number(discount || 0),
        remaining: Math.max(0, rentNet),
        contractType,
        description,
        status: 'active',
        contractDate: req.body.contractDate ? new Date(req.body.contractDate) : startDate,
        startDate,
        endDate,
        landlordSignatureDate: req.body.landlordSignatureDate || null,
        landlordLegalizationNo: req.body.landlordLegalizationNo || null,
        tenantSignatureDate: req.body.tenantSignatureDate || null,
        tenantLegalizationNo: req.body.tenantLegalizationNo || null,
      },
      include: { client: true, property: true },
    });
    await tx.property.update({ where: { id: propertyId }, data: { status: 'loué' } });
    await tx.client.update({
      where: { id: clientId },
      data: { isTenant: true, isProspect: false },
    });
    return created;
  });
  await syncRentalMonthSchedules(rental.id, {
    startDate,
    endDate,
    monthlyRent: Number(monthlyRent),
  });
  await audit(req, 'création', 'Rental', rental.id, reference);
  const full = await prisma.rental.findUnique({
    where: { id: rental.id },
    include: { client: true, property: true, schedules: { orderBy: { dueDate: 'asc' } } },
  });
  res.status(201).json(full);
});

router.get('/rentals/:id/documents', async (req, res) => {
  const rentalId = String(req.params.id);
  const docs = await prisma.document.findMany({
    where: {
      OR: [
        { rentalId },
        { entityType: 'Rental', entityId: rentalId },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs);
});

router.get('/rentals/:id/history', async (req, res) => {
  const rentalId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Rental', entityId: rentalId },
        { details: { contains: rentalId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/rentals/:id', async (req, res) => {
  const rental = await prisma.rental.findUnique({
    where: { id: String(req.params.id) },
    include: {
      client: true,
      property: {
        include: {
          project: true,
          floor: {
            include: {
              lot: {
                include: {
                  bloc: {
                    include: {
                      tranche: { include: { project: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      payments: { orderBy: { date: 'desc' } },
      documents: true,
      schedules: { orderBy: { dueDate: 'asc' } },
    },
  });
  if (!rental) return res.status(404).json({ message: 'Location introuvable' });
  res.json(rental);
});

router.get('/rentals/:id/schedules', async (req, res) => {
  const rentalId = String(req.params.id);
  const items = await prisma.paymentSchedule.findMany({ where: { rentalId }, orderBy: { dueDate: 'asc' } });
  res.json(items);
});

router.post('/rentals/:id/schedules', async (req, res) => {
  const rentalId = String(req.params.id);
  const { dueDate, amount, label, remark } = req.body;
  if (!dueDate || amount == null) return res.status(400).json({ message: 'Date et montant requis' });
  const item = await prisma.paymentSchedule.create({
    data: {
      rentalId,
      dueDate: new Date(dueDate),
      amount: Number(amount),
      label: label || null,
      remark: remark || null,
    },
  });
  res.status(201).json(item);
});

router.post('/rentals/:id/schedules/generate', async (req, res) => {
  const rentalId = String(req.params.id);
  const rental = await prisma.rental.findUnique({ where: { id: rentalId } });
  if (!rental) return res.status(404).json({ message: 'Location introuvable' });

  const startDate = req.body.startDate
    ? new Date(req.body.startDate)
    : rental.startDate || rental.contractDate || new Date();
  const endDate =
    req.body.endDate != null && req.body.endDate !== ''
      ? new Date(req.body.endDate)
      : rental.endDate;
  const count = req.body.count != null ? Math.max(1, Math.min(60, Number(req.body.count))) : null;

  let effectiveEnd = endDate;
  if (!effectiveEnd && count) {
    effectiveEnd = addMonths(startOfMonth(startDate), count - 1);
  }

  // Update rental dates if provided
  if (req.body.startDate || req.body.endDate !== undefined) {
    await prisma.rental.update({
      where: { id: rentalId },
      data: {
        ...(req.body.startDate ? { startDate } : {}),
        ...(req.body.endDate !== undefined
          ? { endDate: req.body.endDate ? new Date(req.body.endDate) : null }
          : {}),
      },
    });
  }

  const items = await syncRentalMonthSchedules(rentalId, {
    startDate,
    endDate: effectiveEnd,
    monthlyRent: rental.monthlyRent,
    horizonMonths: count || 6,
  });
  await audit(req, 'génération', 'PaymentSchedule', rentalId, `${items.length} mois de loyer`);
  res.status(201).json(items);
});

router.post('/rentals/:id/schedules/sync', async (req, res) => {
  const rentalId = String(req.params.id);
  const rental = await prisma.rental.findUnique({ where: { id: rentalId } });
  if (!rental) return res.status(404).json({ message: 'Location introuvable' });
  const items = await syncRentalMonthSchedules(rentalId);
  res.json(items);
});

router.put('/schedules/:id/toggle-paid', async (req, res) => {
  const id = String(req.params.id);
  const schedule = await prisma.paymentSchedule.findUnique({
    where: { id },
    include: { rental: true, payments: true },
  });
  if (!schedule) return res.status(404).json({ message: 'Échéance introuvable' });
  if (!schedule.rentalId || !schedule.rental) {
    return res.status(400).json({ message: 'Réservé aux loyers de location' });
  }
  if (schedule.rental.status === 'terminée') {
    return res.status(400).json({ message: 'Location terminée' });
  }

  const markPaid = schedule.status !== 'paid';
  const operationType = String(req.body.operationType || 'especes');
  const payerName = req.body.payerName != null ? String(req.body.payerName) : null;
  const bank = req.body.bank != null ? String(req.body.bank) : null;

  if (markPaid) {
    const receiptNo = await nextReference('REC');
    await prisma.$transaction(async (tx) => {
      await tx.paymentSchedule.update({
        where: { id },
        data: { status: 'paid', paidAt: new Date() },
      });
      await tx.payment.create({
        data: {
          receiptNo,
          rentalId: schedule.rentalId,
          scheduleId: id,
          amount: schedule.amount,
          nature: schedule.label || `Loyer ${monthLabelFr(new Date(schedule.dueDate))}`,
          operationType,
          payerName,
          bank,
          date: new Date(schedule.dueDate),
        },
      });
    });
    await audit(req, 'paiement', 'PaymentSchedule', id, schedule.label || receiptNo);
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { scheduleId: id } });
      await tx.paymentSchedule.update({
        where: { id },
        data: { status: 'pending', paidAt: null },
      });
    });
    await audit(req, 'annulation', 'PaymentSchedule', id, schedule.label || id);
  }

  await recalculateRentalBalances(schedule.rentalId);
  const updated = await prisma.paymentSchedule.findUnique({
    where: { id },
    include: { payments: true },
  });
  res.json(updated);
});

router.put('/schedules/:id', async (req, res) => {
  const id = String(req.params.id);
  const data: Record<string, unknown> = {};
  if (req.body.dueDate) data.dueDate = new Date(req.body.dueDate);
  if (req.body.amount != null) data.amount = Number(req.body.amount);
  if (req.body.label != null) data.label = req.body.label;
  if (req.body.remark != null) data.remark = req.body.remark;
  if (req.body.status != null) {
    data.status = req.body.status;
    if (req.body.status === 'paid') data.paidAt = new Date();
    if (req.body.status === 'pending') data.paidAt = null;
  }
  const item = await prisma.paymentSchedule.update({ where: { id }, data });
  if (item.rentalId) await recalculateRentalBalances(item.rentalId);
  res.json(item);
});

router.delete('/schedules/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.paymentSchedule.findUnique({ where: { id } });
  await prisma.paymentSchedule.delete({ where: { id } });
  if (existing?.rentalId) await recalculateRentalBalances(existing.rentalId);
  res.json({ ok: true });
});

router.put('/rentals/:id', async (req, res) => {
  const id = String(req.params.id);
  const rental = await prisma.rental.findUnique({ where: { id } });
  if (!rental) return res.status(404).json({ message: 'Location introuvable' });
  if (rental.status === 'terminée') {
    return res.status(400).json({ message: 'Location terminée — modification impossible' });
  }
  const data: Record<string, unknown> = {};
  if (req.body.description != null) data.description = req.body.description;
  if (req.body.contractType != null) data.contractType = req.body.contractType;
  if (req.body.contractDate != null) data.contractDate = new Date(req.body.contractDate);
  if (req.body.startDate != null && req.body.startDate !== '') data.startDate = new Date(req.body.startDate);
  if (req.body.endDate !== undefined) data.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
  if (req.body.monthlyRent != null) {
    data.monthlyRent = Number(req.body.monthlyRent);
  }
  if (req.body.discount != null) data.discount = Number(req.body.discount);
  if (req.body.status != null) data.status = req.body.status;
  if (req.body.landlordSignatureDate !== undefined) data.landlordSignatureDate = req.body.landlordSignatureDate || null;
  if (req.body.landlordLegalizationNo !== undefined) data.landlordLegalizationNo = req.body.landlordLegalizationNo || null;
  if (req.body.tenantSignatureDate !== undefined) data.tenantSignatureDate = req.body.tenantSignatureDate || null;
  if (req.body.tenantLegalizationNo !== undefined) data.tenantLegalizationNo = req.body.tenantLegalizationNo || null;
  const updated = await prisma.rental.update({ where: { id }, data });
  if (
    req.body.startDate != null ||
    req.body.endDate !== undefined ||
    req.body.monthlyRent != null
  ) {
    await syncRentalMonthSchedules(id);
  } else {
    await recalculateRentalBalances(id);
  }
  await audit(req, 'modification', 'Rental', id, updated.reference);
  const full = await prisma.rental.findUnique({
    where: { id },
    include: { schedules: { orderBy: { dueDate: 'asc' } } },
  });
  res.json(full);
});

router.post('/rentals/:id/terminate', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de résiliation obligatoire' });
  const rental = await prisma.rental.findUnique({ where: { id } });
  if (!rental) return res.status(404).json({ message: 'Location introuvable' });
  if (rental.status === 'terminée') {
    return res.status(400).json({ message: 'Location déjà terminée' });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.rental.update({
      where: { id },
      data: {
        status: 'terminée',
        description: rental.description ? `${rental.description}\n[Résiliation] ${motif}` : `[Résiliation] ${motif}`,
      },
    });
    await tx.property.update({
      where: { id: rental.propertyId },
      data: { status: 'disponible' },
    });
    return r;
  });
  await audit(req, 'résiliation', 'Rental', rental.id, motif);
  res.json(updated);
});

function buildPaymentWhere(q: string, type: string, mode: string, dateFrom: Date | null, dateTo: Date | null) {
  return {
    AND: [
      q
        ? {
            OR: [
              { receiptNo: { contains: q } },
              { payerName: { contains: q } },
              { nature: { contains: q } },
              { sale: { reference: { contains: q } } },
              { rental: { reference: { contains: q } } },
              { sale: { client: { lastName: { contains: q } } } },
              { rental: { client: { lastName: { contains: q } } } },
              { rental: { client: { firstName: { contains: q } } } },
            ],
          }
        : {},
      type === 'vente' ? { saleId: { not: null } } : {},
      type === 'location' ? { rentalId: { not: null } } : {},
      mode ? { operationType: mode } : {},
      dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {},
    ],
  };
}

router.get('/payments/stats', async (req, res) => {
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

  const [total, ventes, locations, agg] = await Promise.all([
    prisma.payment.count({ where: dateFilter }),
    prisma.payment.count({ where: { ...dateFilter, saleId: { not: null } } }),
    prisma.payment.count({ where: { ...dateFilter, rentalId: { not: null } } }),
    prisma.payment.aggregate({ where: dateFilter, _sum: { amount: true } }),
  ]);
  res.json({
    total,
    ventes,
    locations,
    montantTotal: agg._sum.amount || 0,
  });
});

router.get('/payments/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || '');
  const mode = String(req.query.mode || '');
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const where = buildPaymentWhere(q, type, mode, dateFrom, dateTo);

  const payments = await prisma.payment.findMany({
    where,
    include: {
      sale: { include: { client: true } },
      rental: { include: { client: true } },
    },
    orderBy: { date: 'desc' },
  });
  const header = 'Date;Reçu;Type;Réf. transaction;Client;Montant;Mode;Nature';
  const rows = payments.map((p) => {
    const isSale = !!p.saleId;
    const ref = isSale ? p.sale?.reference : p.rental?.reference;
    const client = isSale
      ? p.sale?.client
        ? `${p.sale.client.firstName} ${p.sale.client.lastName}`
        : ''
      : p.rental?.client
        ? `${p.rental.client.firstName} ${p.rental.client.lastName}`
        : '';
    return [
      p.date.toISOString().slice(0, 10),
      p.receiptNo,
      isSale ? 'Vente' : 'Location',
      ref || '',
      client,
      p.amount,
      p.operationType || '',
      p.nature || '',
    ].join(';');
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=paiements-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/payments/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || '');
  const mode = String(req.query.mode || '');
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const where = buildPaymentWhere(q, type, mode, dateFrom, dateTo);
  const payments = await prisma.payment.findMany({
    where,
    include: { sale: { include: { client: true } }, rental: { include: { client: true } } },
    orderBy: { date: 'desc' },
  });
  sendExcel(
    res,
    'paiements-gic.xlsx',
    'Paiements',
    payments.map((p) => {
      const isSale = !!p.saleId;
      const client = isSale ? p.sale?.client : p.rental?.client;
      return {
        Date: p.date.toISOString().slice(0, 10),
        Reçu: p.receiptNo,
        Type: isSale ? 'Vente' : 'Location',
        'Réf. transaction': isSale ? p.sale?.reference : p.rental?.reference,
        Client: client ? `${client.firstName} ${client.lastName}` : '',
        Montant: p.amount,
        Mode: p.operationType || '',
        Nature: p.nature || '',
      };
    })
  );
});

router.get('/payments/export/pdf', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || '');
  const mode = String(req.query.mode || '');
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const where = buildPaymentWhere(q, type, mode, dateFrom, dateTo);
  const payments = await prisma.payment.findMany({
    where,
    include: { sale: { include: { client: true } }, rental: { include: { client: true } } },
    orderBy: { date: 'desc' },
    take: 200,
  });
  sendPdfTable(
    res,
    'paiements-gic.pdf',
    'Liste des paiements — GIC',
    [
      { key: 'date', label: 'Date' },
      { key: 'recu', label: 'Reçu' },
      { key: 'type', label: 'Type' },
      { key: 'client', label: 'Client' },
      { key: 'montant', label: 'Montant' },
    ],
    payments.map((p) => {
      const isSale = !!p.saleId;
      const client = isSale ? p.sale?.client : p.rental?.client;
      return {
        date: p.date.toISOString().slice(0, 10),
        recu: p.receiptNo,
        type: isSale ? 'Vente' : 'Location',
        client: client ? `${client.firstName} ${client.lastName}` : '',
        montant: p.amount,
      };
    })
  );
});

router.get('/payments', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || '');
  const mode = String(req.query.mode || '');
  const sort = String(req.query.sort || 'date');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const where = buildPaymentWhere(q, type, mode, dateFrom, dateTo);

  const orderBy =
    sort === 'amount'
      ? { amount: order as 'asc' | 'desc' }
      : sort === 'receiptNo'
        ? { receiptNo: order as 'asc' | 'desc' }
        : { date: order as 'asc' | 'desc' };

  const [items, total, agg] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        sale: {
          select: {
            id: true,
            reference: true,
            client: { select: { id: true, firstName: true, lastName: true, reference: true } },
          },
        },
        rental: {
          select: {
            id: true,
            reference: true,
            client: { select: { id: true, firstName: true, lastName: true, reference: true } },
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where, _sum: { amount: true } }),
  ]);

  res.json({
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    montantPage: items.reduce((s, p) => s + p.amount, 0),
    montantTotal: agg._sum.amount || 0,
  });
});

router.get('/payments/:id/history', async (req, res) => {
  const paymentId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Payment', entityId: paymentId },
        { details: { contains: paymentId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/payments/:id', async (req, res) => {
  const payment = await prisma.payment.findUnique({
    where: { id: String(req.params.id) },
    include: {
      sale: {
        include: {
          client: true,
          property: {
            select: {
              id: true,
              reference: true,
              name: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
      },
      rental: {
        include: {
          client: true,
          property: {
            select: {
              id: true,
              reference: true,
              name: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!payment) return res.status(404).json({ message: 'Paiement introuvable' });
  res.json(payment);
});

function saleStatusAfterPayment(sale: { status: string }, totalPaid: number, remaining: number) {
  if (['résiliée', 'annulée', 'brouillon'].includes(sale.status)) return sale.status;
  if (remaining <= 0) return 'soldée';
  if (totalPaid > 0) return 'en_cours_paiement';
  if (sale.status === 'soldée') return 'en_cours';
  return sale.status;
}

async function applySalePaymentDelta(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  saleId: string,
  delta: number
) {
  const sale = await tx.sale.findUnique({ where: { id: saleId } });
  if (!sale) throw new Error('Vente introuvable');
  const totalPaid = Math.max(0, sale.totalPaid + delta);
  const remaining = sale.netPrice - totalPaid;
  const status = saleStatusAfterPayment(sale, totalPaid, remaining);
  await tx.sale.update({ where: { id: saleId }, data: { totalPaid, remaining, status } });
}

async function applyRentalPaymentDelta(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  rentalId: string,
  delta: number
) {
  const rental = await tx.rental.findUnique({ where: { id: rentalId } });
  if (!rental) throw new Error('Location introuvable');
  const totalPaid = Math.max(0, rental.totalPaid + delta);
  const remaining = Math.max(0, rental.remaining - delta);
  await tx.rental.update({ where: { id: rentalId }, data: { totalPaid, remaining } });
}

router.put('/payments/:id', upload.single('proof'), async (req, res) => {
  const id = String(req.params.id);
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) return res.status(404).json({ message: 'Paiement introuvable' });

  const newAmount = req.body.amount != null ? Number(req.body.amount) : payment.amount;
  if (!Number.isFinite(newAmount) || newAmount <= 0) {
    return res.status(400).json({ message: 'Montant invalide' });
  }

  try {
    if (req.body.internalRef || req.body.operationNo) {
      await assertUniquePaymentRefs({
        internalRef: req.body.internalRef,
        operationNo: req.body.operationNo,
        excludeId: id,
      });
    }
  } catch (e) {
    return res.status(400).json({ message: e instanceof Error ? e.message : 'Doublon détecté' });
  }

  const delta = newAmount - payment.amount;
  const data: Record<string, unknown> = { amount: newAmount };
  if (req.body.date) data.date = new Date(req.body.date);
  if (req.body.nature !== undefined) data.nature = req.body.nature || null;
  if (req.body.operationType !== undefined) data.operationType = req.body.operationType || null;
  if (req.body.bank !== undefined) data.bank = req.body.bank || null;
  if (req.body.payerName !== undefined) data.payerName = req.body.payerName || null;
  if (req.body.operationNo !== undefined) data.operationNo = req.body.operationNo || null;
  if (req.body.internalRef !== undefined) data.internalRef = req.body.internalRef || null;
  if (req.file) data.proofFile = `/uploads/${req.file.filename}`;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.payment.update({ where: { id }, data });
    if (delta !== 0) {
      if (payment.saleId) await applySalePaymentDelta(tx, payment.saleId, delta);
      if (payment.rentalId) await applyRentalPaymentDelta(tx, payment.rentalId, delta);
    }
    return row;
  });

  await audit(req, 'modification', 'Payment', id, `${payment.receiptNo} — ${newAmount} MAD`);
  const full = await prisma.payment.findUnique({
    where: { id },
    include: { sale: { select: { reference: true } }, rental: { select: { reference: true } } },
  });
  if (full) await syncEncaissementMovement(full, req);
  res.json(updated);
});

router.delete('/payments/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) return res.status(404).json({ message: 'Paiement introuvable' });

  await prisma.$transaction(async (tx) => {
    if (payment.saleId) await applySalePaymentDelta(tx, payment.saleId, -payment.amount);
    if (payment.rentalId) await applyRentalPaymentDelta(tx, payment.rentalId, -payment.amount);
    await tx.payment.delete({ where: { id } });
  });

  await removeAutomaticMovement('encaissement', id);
  await audit(req, 'suppression', 'Payment', id, `${payment.receiptNo} — ${motif}`);
  res.json({ ok: true });
});

router.post('/payments', upload.single('proof'), async (req, res) => {
  const { saleId, rentalId, amount, nature, operationType, bank, payerName, operationNo, internalRef } = req.body;
  if ((!saleId && !rentalId) || amount == null) {
    return res.status(400).json({ message: 'Transaction et montant obligatoires' });
  }
  if (saleId && rentalId) {
    return res.status(400).json({ message: 'Vente ou location, pas les deux' });
  }
  if (Number(amount) <= 0) {
    return res.status(400).json({ message: 'Montant invalide' });
  }
  if (saleId) {
    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale || ['résiliée', 'annulée'].includes(sale.status)) {
      return res.status(400).json({ message: 'Vente non éligible au paiement' });
    }
  }
  if (rentalId) {
    const rental = await prisma.rental.findUnique({ where: { id: rentalId } });
    if (!rental || rental.status === 'terminée') {
      return res.status(400).json({ message: 'Location non éligible au paiement' });
    }
  }
  try {
    await assertUniquePaymentRefs({ internalRef, operationNo });
  } catch (e) {
    return res.status(400).json({ message: e instanceof Error ? e.message : 'Doublon détecté' });
  }
  const receiptNo = await nextReference('REC');
  const proofFile = req.file ? `/uploads/${req.file.filename}` : null;
  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        receiptNo,
        saleId: saleId || null,
        rentalId: rentalId || null,
        amount: Number(amount),
        nature,
        operationType,
        bank,
        payerName,
        operationNo: operationNo || null,
        internalRef: internalRef || null,
        proofFile,
        date: req.body.date ? new Date(req.body.date) : new Date(),
      },
    });
    if (saleId) {
      const sale = await tx.sale.findUnique({ where: { id: saleId } });
      if (!sale) throw new Error('Vente introuvable');
      const totalPaid = sale.totalPaid + Number(amount);
      const remaining = sale.netPrice - totalPaid;
      await tx.sale.update({
        where: { id: saleId },
        data: {
          totalPaid,
          remaining,
          status: remaining <= 0 ? 'soldée' : 'en_cours_paiement',
        },
      });
    }
    if (rentalId) {
      const rental = await tx.rental.findUnique({ where: { id: rentalId } });
      if (!rental) throw new Error('Location introuvable');
      const totalPaid = rental.totalPaid + Number(amount);
      await tx.rental.update({
        where: { id: rentalId },
        data: { totalPaid, remaining: Math.max(0, rental.remaining - Number(amount)) },
      });
    }
    return created;
  });
  if (rentalId) await recalculateRentalBalances(rentalId);
  await audit(req, 'création', 'Payment', payment.id, receiptNo);
  const full = await prisma.payment.findUnique({
    where: { id: payment.id },
    include: { sale: { select: { reference: true } }, rental: { select: { reference: true } } },
  });
  if (full) await syncEncaissementMovement(full, req);
  await notifyAllAdmins(
    'Encaissement enregistré',
    `Reçu ${receiptNo} — ${Number(amount).toLocaleString('fr-MA')} MAD`,
    { link: '/encaissements', type: 'info' }
  );
  res.status(201).json(payment);
});

export default router;
