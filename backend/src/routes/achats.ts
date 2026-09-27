import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { nextReference } from '../lib/references.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import { sendExcel } from '../lib/exportExcel.js';
import { assertUniqueCin } from '../lib/uniqueness.js';
import { supplierDocHtml } from '../lib/supplierPrint.js';
import { getOrCreateCompanySettings } from '../lib/companySettings.js';
import purchasesRoutes from './purchases.js';

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

router.get('/suppliers/stats', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const source = String(req.query.source || '');
  const active = String(req.query.active || '');
  const withPortal = String(req.query.withPortal || '');
  const where = buildSupplierWhere(q, source, active, withPortal);

  const [total, activeCount, withEmail, withPortalCount, linked, purchaseAgg] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.count({ where: { AND: [where, { isActive: true }] } }),
    prisma.supplier.count({ where: { AND: [where, { email: { not: null }, NOT: { email: '' } }] } }),
    prisma.supplier.count({ where: { AND: [where, { passwordHash: { not: null } }] } }),
    prisma.supplier.count({ where: { AND: [where, { purchases: { some: {} } }] } }),
    prisma.purchase.aggregate({
      _sum: { totalPrice: true },
      where: q || source || active || withPortal
        ? { supplier: where }
        : undefined,
    }),
  ]);
  res.json({
    total,
    active: activeCount,
    withEmail,
    withPortal: withPortalCount,
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

router.use('/purchases', purchasesRoutes);

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
  const company = await getOrCreateCompanySettings();
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
  }, company);
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
