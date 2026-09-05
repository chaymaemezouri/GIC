import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { nextReference } from '../lib/references.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import { notifyAllAdmins } from '../lib/notifications.js';
import { sendExcel } from '../lib/exportExcel.js';
import { assertUniqueCin } from '../lib/uniqueness.js';
import { supplierDocHtml } from '../lib/supplierPrint.js';
import { computePurchaseTax } from '../lib/purchaseTax.js';
import { findPurchaseCashMovement } from '../lib/purchaseCash.js';
import { removeAutomaticMovement, syncPurchaseMovement } from '../lib/cashSync.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

function buildSupplierWhere(q: string, source: string, active: string, withPortal: string) {
  return {
    AND: [
      q
        ? {
            OR: [
              { companyName: { contains: q } },
              { reference: { contains: q } },
              { cin: { contains: q } },
              { contactName: { contains: q } },
              { email: { contains: q } },
              { phone1: { contains: q } },
              { phone2: { contains: q } },
            ],
          }
        : {},
      source ? { source } : {},
      active === 'true' ? { isActive: true } : active === 'false' ? { isActive: false } : {},
      withPortal === 'true' ? { passwordHash: { not: null } } : withPortal === 'false' ? { passwordHash: null } : {},
    ],
  };
}

router.get('/suppliers/stats', async (_req, res) => {
  const [total, active, withEmail, withPortal, linked, purchaseAgg] = await Promise.all([
    prisma.supplier.count(),
    prisma.supplier.count({ where: { isActive: true } }),
    prisma.supplier.count({ where: { email: { not: null }, NOT: { email: '' } } }),
    prisma.supplier.count({ where: { passwordHash: { not: null } } }),
    prisma.supplier.count({ where: { purchases: { some: {} } } }),
    prisma.purchase.aggregate({ _sum: { totalPrice: true } }),
  ]);
  res.json({
    total,
    active,
    withEmail,
    withPortal,
    linked,
    purchaseTotal: purchaseAgg._sum.totalPrice || 0,
  });
});

router.get('/suppliers/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const source = String(req.query.source || '');
  const active = String(req.query.active || '');
  const withPortal = String(req.query.withPortal || '');
  const where = buildSupplierWhere(q, source, active, withPortal);

  const suppliers = await prisma.supplier.findMany({
    where,
    orderBy: { companyName: 'asc' },
    include: { _count: { select: { purchases: true } } },
  });
  const header = 'Référence;Raison sociale;Contact;Tél.1;Tél.2;Email;CIN;Source;Banque;RIB;Actif;Achats;Portail';
  const rows = suppliers.map(
    (s) =>
      `${s.reference};${s.companyName};${s.contactName || ''};${s.phone1 || ''};${s.phone2 || ''};${s.email || ''};${s.cin || ''};${s.source || ''};${s.bankName || ''};${s.rib || ''};${s.isActive ? 'Oui' : 'Non'};${s._count.purchases};${s.passwordHash ? 'Oui' : 'Non'}`
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=fournisseurs-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/suppliers', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const source = String(req.query.source || '');
  const active = String(req.query.active || '');
  const withPortal = String(req.query.withPortal || '');
  const sort = String(req.query.sort || 'companyName');
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const where = buildSupplierWhere(q, source, active, withPortal);
  const orderBy =
    sort === 'reference'
      ? { reference: order as 'asc' | 'desc' }
      : sort === 'createdAt'
        ? { createdAt: order as 'asc' | 'desc' }
        : sort === 'source'
          ? { source: order as 'asc' | 'desc' }
          : { companyName: order as 'asc' | 'desc' };

  const [items, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      include: {
        _count: { select: { purchases: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.supplier.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.post('/suppliers', async (req, res) => {
  try {
    await assertUniqueCin('supplier', req.body.cin);
  } catch (e) {
    return res.status(400).json({ message: e instanceof Error ? e.message : 'CIN en doublon' });
  }
  const reference = await nextReference('FRN');
  const supplier = await prisma.supplier.create({
    data: {
      reference,
      companyName: req.body.companyName,
      contactName: req.body.contactName,
      phone1: req.body.phone1,
      phone2: req.body.phone2,
      email: req.body.email,
      address: req.body.address,
      cin: req.body.cin || null,
      source: req.body.source || null,
      bankName: req.body.bankName,
      rib: req.body.rib,
      remark: req.body.remark,
      portalRole: req.body.portalRole || 'ACHATS',
      isActive: req.body.isActive ?? true,
    },
  });
  await audit(req, 'création', 'Supplier', supplier.id, reference);
  res.status(201).json(supplier);
});

router.get('/suppliers/:id/documents', async (req, res) => {
  const supplierId = String(req.params.id);
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } });
  if (!supplier) return res.status(404).json({ message: 'Fournisseur introuvable' });

  const purchaseIds = await prisma.purchase.findMany({
    where: { supplierId },
    select: { id: true },
  });
  const ids = purchaseIds.map((p) => p.id);

  const [uploaded, generated, purchaseFiles] = await Promise.all([
    prisma.document.findMany({
      where: {
        OR: [
          { supplierId },
          { entityType: 'Supplier', entityId: supplierId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.supplierDocument.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
    }),
    ids.length
      ? prisma.document.findMany({
          where: { entityType: 'purchase', entityId: { in: ids } },
          orderBy: { createdAt: 'desc' },
        })
      : [],
  ]);

  res.json({ uploaded, generated, purchaseFiles });
});

router.get('/suppliers/:id/history', async (req, res) => {
  const supplierId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Supplier', entityId: supplierId },
        { details: { contains: supplierId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/suppliers/:id', async (req, res) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: String(req.params.id) },
    include: {
      _count: { select: { purchases: true, documents: true } },
      purchases: {
        orderBy: { date: 'desc' },
        take: 50,
        include: { chantier: { select: { id: true, name: true } } },
      },
    },
  });
  if (!supplier) return res.status(404).json({ message: 'Fournisseur introuvable' });
  const { passwordHash, ...safe } = supplier;
  res.json({ ...safe, hasPortal: !!passwordHash });
});

router.put('/suppliers/:id', async (req, res) => {
  const id = String(req.params.id);
  const data = { ...req.body };
  delete data.reference;
  delete data.passwordHash;
  delete data.id;
  delete data.hasPortal;
  try {
    if (data.cin) await assertUniqueCin('supplier', data.cin, id);
  } catch (e) {
    return res.status(400).json({ message: e instanceof Error ? e.message : 'CIN en doublon' });
  }
  delete data._count;
  delete data.purchases;
  const supplier = await prisma.supplier.update({ where: { id }, data });
  await audit(req, 'modification', 'Supplier', id, supplier.companyName);
  res.json(supplier);
});

router.delete('/suppliers/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const linked = await prisma.purchase.count({ where: { supplierId: id } });
  if (linked > 0) {
    return res.status(400).json({
      message: `Fournisseur lié à ${linked} achat(s) — suppression impossible`,
    });
  }

  await prisma.supplier.delete({ where: { id } });
  await audit(req, 'suppression', 'Supplier', id, motif);
  res.json({ ok: true });
});

router.post('/suppliers/:id/portal-password', async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ message: 'Mot de passe min. 6 caractères' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.supplier.update({
    where: { id: String(req.params.id) },
    data: { passwordHash },
  });
  await audit(req, 'portail_fournisseur', 'Supplier', String(req.params.id));
  res.json({ ok: true });
});

function buildPurchaseWhere(
  q: string,
  status: string,
  supplierId: string,
  chantierId: string,
  dateFrom: Date | null,
  dateTo: Date | null,
  invoiced: string,
  tranche: string
) {
  return {
    AND: [
      q
        ? {
            OR: [
              { reference: { contains: q } },
              { designation: { contains: q } },
              { family: { contains: q } },
            ],
          }
        : {},
      status ? { status } : {},
      supplierId ? { supplierId } : {},
      chantierId ? { chantierId } : {},
      tranche ? { tranche } : {},
      dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {},
      invoiced === 'true' ? { invoiced: true } : invoiced === 'false' ? { invoiced: false } : {},
    ],
  };
}

router.get('/purchases/stats', async (_req, res) => {
  const [total, brouillon, valide, vise, controle, retourne, agg] = await Promise.all([
    prisma.purchase.count(),
    prisma.purchase.count({ where: { status: 'brouillon' } }),
    prisma.purchase.count({ where: { status: 'validé' } }),
    prisma.purchase.count({ where: { status: 'visé' } }),
    prisma.purchase.count({ where: { status: 'contrôlé' } }),
    prisma.purchase.count({ where: { status: 'retourné' } }),
    prisma.purchase.aggregate({ _sum: { totalPrice: true } }),
  ]);
  res.json({
    total,
    brouillon,
    valide,
    vise,
    controle,
    retourne,
    amount: agg._sum.totalPrice || 0,
  });
});

router.get('/purchases/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const supplierId = String(req.query.supplierId || '');
  const chantierId = String(req.query.chantierId || '');
  const tranche = String(req.query.tranche || '');
  const invoiced = String(req.query.invoiced || '');
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const where = buildPurchaseWhere(q, status, supplierId, chantierId, dateFrom, dateTo, invoiced, tranche);

  const purchases = await prisma.purchase.findMany({
    where,
    include: { supplier: true, chantier: true },
    orderBy: { date: 'desc' },
  });
  const header = 'Référence;Date;Désignation;Famille;Fournisseur;Chantier;Qté;PU;PT;Statut;Facturé';
  const rows = purchases.map(
    (p) =>
      `${p.reference};${p.date.toISOString().slice(0, 10)};${p.designation};${p.family || ''};${p.supplier?.companyName || ''};${p.chantier?.name || ''};${p.quantity};${p.unitPrice};${p.totalPrice};${p.status};${p.invoiced ? 'Oui' : 'Non'}`
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=achats-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/purchases', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const supplierId = String(req.query.supplierId || '');
  const chantierId = String(req.query.chantierId || '');
  const tranche = String(req.query.tranche || '');
  const invoiced = String(req.query.invoiced || '');
  const sort = String(req.query.sort || 'date');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;

  const where = buildPurchaseWhere(q, status, supplierId, chantierId, dateFrom, dateTo, invoiced, tranche);
  const orderBy =
    sort === 'reference'
      ? { reference: order as 'asc' | 'desc' }
      : sort === 'designation'
        ? { designation: order as 'asc' | 'desc' }
        : sort === 'totalPrice'
          ? { totalPrice: order as 'asc' | 'desc' }
          : sort === 'status'
            ? { status: order as 'asc' | 'desc' }
            : { date: order as 'asc' | 'desc' };

  const [items, total, agg] = await Promise.all([
    prisma.purchase.findMany({
      where,
      include: { supplier: true, chantier: true },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.purchase.count({ where }),
    prisma.purchase.aggregate({ where, _sum: { totalPrice: true } }),
  ]);

  res.json({
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    totals: { amount: agg._sum.totalPrice || 0 },
  });
});

router.post('/purchases', async (req, res) => {
  const { quantity, unitPrice, designation } = req.body;
  if (!designation || quantity == null || unitPrice == null) {
    return res.status(400).json({ message: 'Désignation, quantité et PU obligatoires' });
  }
  const tvaRate = Number(req.body.tvaRate ?? 20);
  const tax = computePurchaseTax(Number(quantity), Number(unitPrice), tvaRate);
  const reference = await nextReference('ACH');
  const purchase = await prisma.purchase.create({
    data: {
      reference,
      date: req.body.date ? new Date(req.body.date) : new Date(),
      family: req.body.family,
      designation,
      designationId: req.body.designationId || null,
      unit: req.body.unit,
      quantity: Number(quantity),
      unitPrice: Number(unitPrice),
      amountHT: tax.amountHT,
      tvaRate: tax.tvaRate,
      tvaAmount: tax.tvaAmount,
      totalPrice: tax.totalPrice,
      supplierId: req.body.supplierId || null,
      author: req.body.author,
      paymentMode: req.body.paymentMode,
      invoiced: !!req.body.invoiced,
      chantierId: req.body.chantierId || null,
      tranche: req.body.tranche ? String(req.body.tranche).trim() : null,
      status: 'brouillon',
      remark: req.body.remark,
    },
    include: { supplier: true, chantier: true },
  });
  await prisma.purchaseHistory.create({
    data: {
      purchaseId: purchase.id,
      userName: req.user?.email,
      newStatus: 'brouillon',
      comment: 'Création',
    },
  });
  await audit(req, 'création', 'Purchase', purchase.id, reference);
  await notifyAllAdmins(
    'Nouvel achat à valider',
    `${designation} — ${formatMad(tax.totalPrice)}`,
    { link: '/achats', type: 'warning' }
  );
  res.status(201).json(purchase);
});

function formatMad(n: number) {
  return `${Math.round(n).toLocaleString('fr-MA')} MAD`;
}

router.get('/purchases/:id/documents', async (req, res) => {
  const docs = await prisma.document.findMany({
    where: { entityType: 'purchase', entityId: String(req.params.id) },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs);
});

router.get('/purchases/:id/history', async (req, res) => {
  const purchaseId = String(req.params.id);
  const [workflow, auditLogs] = await Promise.all([
    prisma.purchaseHistory.findMany({
      where: { purchaseId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { entity: 'Purchase', entityId: purchaseId },
          { details: { contains: purchaseId } },
        ],
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);
  res.json({ workflow, auditLogs });
});

router.get('/purchases/:id', async (req, res) => {
  const purchase = await prisma.purchase.findUnique({
    where: { id: String(req.params.id) },
    include: {
      supplier: true,
      chantier: true,
      history: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!purchase) return res.status(404).json({ message: 'Achat introuvable' });
  const cashMovement = await findPurchaseCashMovement(purchase.id);
  res.json({ ...purchase, cashMovement });
});

router.put('/purchases/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.purchase.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Achat introuvable' });
  if (!['brouillon', 'retourné'].includes(existing.status)) {
    return res.status(400).json({ message: 'Modification impossible — achat déjà validé' });
  }

  const { quantity, unitPrice, designation } = req.body;
  const data: Record<string, unknown> = {};
  if (designation != null) data.designation = designation;
  if (req.body.family != null) data.family = req.body.family;
  if (req.body.unit != null) data.unit = req.body.unit;
  if (req.body.supplierId != null) data.supplierId = req.body.supplierId || null;
  if (req.body.chantierId != null) data.chantierId = req.body.chantierId || null;
  if (req.body.tranche !== undefined) data.tranche = req.body.tranche ? String(req.body.tranche).trim() : null;
  if (req.body.paymentMode != null) data.paymentMode = req.body.paymentMode;
  if (req.body.author != null) data.author = req.body.author;
  if (req.body.remark != null) data.remark = req.body.remark;
  if (req.body.invoiced != null) data.invoiced = !!req.body.invoiced;
  if (req.body.date != null) data.date = new Date(req.body.date);
  if (quantity != null) data.quantity = Number(quantity);
  if (unitPrice != null) data.unitPrice = Number(unitPrice);
  if (req.body.tvaRate != null) data.tvaRate = Number(req.body.tvaRate);
  const q = Number(data.quantity ?? existing.quantity);
  const pu = Number(data.unitPrice ?? existing.unitPrice);
  const rate = Number(data.tvaRate ?? existing.tvaRate ?? 20);
  const tax = computePurchaseTax(q, pu, rate);
  data.amountHT = tax.amountHT;
  data.tvaAmount = tax.tvaAmount;
  data.totalPrice = tax.totalPrice;

  const purchase = await prisma.purchase.update({
    where: { id },
    data,
    include: { supplier: true, chantier: true },
  });
  await audit(req, 'modification', 'Purchase', id, purchase.reference);
  res.json(purchase);
});

router.delete('/purchases/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const existing = await prisma.purchase.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Achat introuvable' });
  if (!['brouillon', 'retourné'].includes(existing.status)) {
    return res.status(400).json({ message: 'Suppression impossible — achat déjà validé' });
  }

  await prisma.purchaseHistory.deleteMany({ where: { purchaseId: id } });
  await removeAutomaticMovement('achat', id);
  await prisma.purchase.delete({ where: { id } });
  await audit(req, 'suppression', 'Purchase', id, motif);
  res.json({ ok: true });
});

router.patch('/purchases/:id/status', async (req, res) => {
  const id = String(req.params.id);
  const { status, comment } = req.body;
  const current = await prisma.purchase.findUnique({
    where: { id },
    include: { supplier: true },
  });
  if (!current) return res.status(404).json({ message: 'Achat introuvable' });
  const purchase = await prisma.purchase.update({
    where: { id },
    data: { status },
  });
  await prisma.purchaseHistory.create({
    data: {
      purchaseId: purchase.id,
      userName: req.user?.email,
      oldStatus: current.status,
      newStatus: status,
      comment,
    },
  });
  await audit(req, 'workflow', 'Purchase', purchase.id, `${current.status} → ${status}`);
  if (status === 'retourné') {
    await notifyAllAdmins('Achat retourné', `Achat ${purchase.reference} — correction requise`, {
      link: '/achats',
      type: 'warning',
    });
  }

  let cashMovement = null;
  let cashMovementCreated = false;

  if (current.status === 'contrôlé' && status !== 'contrôlé') {
    await removeAutomaticMovement('achat', purchase.id);
  }

  if (status === 'contrôlé') {
    try {
      const full = { ...purchase, supplier: current.supplier };
      const result = await syncPurchaseMovement(full, req);
      cashMovement = result.movement;
      cashMovementCreated = result.created;
      if (result.created && current.status !== 'contrôlé') {
        await notifyAllAdmins(
          'Décaissement caisse',
          `Achat ${purchase.reference} — ${Math.round(purchase.totalPrice).toLocaleString('fr-MA')} MAD`,
          { link: `/caisse/${result.movement.id}`, type: 'info' },
        );
      }
    } catch (e) {
      return res.status(400).json({
        message: e instanceof Error ? e.message : 'Impossible de synchroniser le mouvement caisse',
        purchase,
      });
    }
  }

  res.json({ ...purchase, cashMovement, cashMovementCreated });
});

router.get('/families', async (_req, res) => {
  res.json(await prisma.purchaseFamily.findMany({ include: { designations: true } }));
});

router.post('/families', async (req, res) => {
  const family = await prisma.purchaseFamily.create({ data: { name: req.body.name } });
  res.status(201).json(family);
});

router.post('/families/:id/designations', async (req, res) => {
  const designation = await prisma.purchaseDesignation.create({
    data: { familyId: req.params.id, label: req.body.label },
  });
  res.status(201).json(designation);
});

router.put('/designations/:id', async (req, res) => {
  const designation = await prisma.purchaseDesignation.update({
    where: { id: String(req.params.id) },
    data: { label: req.body.label },
  });
  res.json(designation);
});

router.delete('/designations/:id', async (req, res) => {
  const id = String(req.params.id);
  const linked = await prisma.purchase.count({ where: { designationId: id } });
  if (linked > 0) {
    return res.status(400).json({ message: `Désignation liée à ${linked} achat(s) — suppression impossible` });
  }
  await prisma.purchaseDesignation.delete({ where: { id } });
  res.json({ ok: true });
});

router.delete('/families/:id', async (req, res) => {
  const familyId = String(req.params.id);
  const family = await prisma.purchaseFamily.findUnique({
    where: { id: familyId },
    include: { designations: true },
  });
  if (!family) return res.status(404).json({ message: 'Famille introuvable' });

  for (const d of family.designations) {
    const linked = await prisma.purchase.count({ where: { designationId: d.id } });
    if (linked > 0) {
      return res.status(400).json({
        message: `Désignation « ${d.label} » liée à ${linked} achat(s) — suppression impossible`,
      });
    }
  }

  await prisma.purchaseDesignation.deleteMany({ where: { familyId } });
  await prisma.purchaseFamily.delete({ where: { id: familyId } });
  res.json({ ok: true });
});

router.get('/purchases/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const supplierId = String(req.query.supplierId || '');
  const chantierId = String(req.query.chantierId || '');
  const tranche = String(req.query.tranche || '');
  const invoiced = String(req.query.invoiced || '');
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const where = buildPurchaseWhere(q, status, supplierId, chantierId, dateFrom, dateTo, invoiced, tranche);
  const purchases = await prisma.purchase.findMany({
    where,
    include: { supplier: true, chantier: true },
    orderBy: { date: 'desc' },
  });
  sendExcel(
    res,
    'achats-gic.xlsx',
    'Achats',
    purchases.map((p) => ({
      Référence: p.reference,
      Date: p.date.toISOString().slice(0, 10),
      Désignation: p.designation,
      Famille: p.family || '',
      Fournisseur: p.supplier?.companyName || '',
      Chantier: p.chantier?.name || '',
      Quantité: p.quantity,
      'PU HT': p.unitPrice,
      'Montant HT': p.amountHT ?? p.quantity * p.unitPrice,
      'TVA %': p.tvaRate ?? 20,
      'Montant TVA': p.tvaAmount ?? 0,
      'Total TTC': p.totalPrice,
      Statut: p.status,
      Facturé: p.invoiced ? 'Oui' : 'Non',
    }))
  );
});

router.get('/suppliers/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const source = String(req.query.source || '');
  const active = String(req.query.active || '');
  const withPortal = String(req.query.withPortal || '');
  const where = buildSupplierWhere(q, source, active, withPortal);
  const items = await prisma.supplier.findMany({ where, orderBy: { companyName: 'asc' } });
  sendExcel(
    res,
    'fournisseurs-gic.xlsx',
    'Fournisseurs',
    items.map((s) => ({
      Référence: s.reference,
      Raison_sociale: s.companyName,
      Contact: s.contactName || '',
      CIN: s.cin || '',
      Source: s.source || '',
      Tél1: s.phone1 || '',
      Tél2: s.phone2 || '',
      Email: s.email || '',
      Actif: s.isActive ? 'Oui' : 'Non',
    }))
  );
});

router.get('/suppliers/:id/print/:docType', async (req, res) => {
  const supplier = await prisma.supplier.findUnique({ where: { id: String(req.params.id) } });
  if (!supplier) return res.status(404).json({ message: 'Fournisseur introuvable' });
  const docType = String(req.params.docType);
  const purchaseId = String(req.query.purchaseId || '');
  let purchase = null;
  if (purchaseId) {
    purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { chantier: true },
    });
  }
  const html = supplierDocHtml(docType, {
    supplierName: supplier.companyName,
    supplierRef: supplier.reference,
    purchaseRef: purchase?.reference,
    date: new Date().toLocaleDateString('fr-MA'),
    designation: purchase?.designation,
    quantity: purchase?.quantity,
    unitPrice: purchase?.unitPrice,
    totalPrice: purchase?.totalPrice,
    chantier: purchase?.chantier?.name,
    remark: purchase?.remark || undefined,
  });
  await prisma.supplierDocument.create({
    data: {
      supplierId: supplier.id,
      purchaseId: purchase?.id || null,
      docType,
      reference: purchase?.reference || supplier.reference,
      data: JSON.stringify({ generatedAt: new Date().toISOString() }),
    },
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

export default router;
