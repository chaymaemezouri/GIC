import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import { upload } from '../lib/upload.js';
import { uploadDir } from '../lib/uploadPaths.js';
import { sendEmail } from '../lib/email.js';
import { logConversation } from '../lib/conversations.js';
import { sendExcel } from '../lib/exportExcel.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

const docInclude = {
  client: { select: { id: true, firstName: true, lastName: true, reference: true } },
  property: { select: { id: true, name: true, reference: true } },
  chantier: { select: { id: true, name: true } },
  supplier: { select: { id: true, companyName: true, reference: true } },
  sale: { select: { id: true, reference: true } },
  rental: { select: { id: true, reference: true } },
  engin: { select: { id: true, matricule: true, brand: true } },
};

function buildDocumentWhere(
  q: string,
  category: string,
  entityType: string,
  entityId: string,
  alert: string
) {
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);

  const alertFilter =
    alert === 'expiring'
      ? { expiresAt: { lte: in30, not: null } }
      : alert === 'expired'
        ? { expiresAt: { lt: now } }
        : {};

  return {
    AND: [
      q
        ? {
            OR: [
              { name: { contains: q } },
              { category: { contains: q } },
              { entityType: { contains: q } },
              { mimeType: { contains: q } },
            ],
          }
        : {},
      category ? { category } : {},
      entityType ? { entityType } : {},
      entityId ? { entityId } : {},
      alertFilter,
    ],
  };
}

function buildArchiveWhere(q: string, direction: string, category: string, dateFrom: string, dateTo: string) {
  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo) : null;
  if (from) from.setHours(0, 0, 0, 0);
  if (to) to.setHours(23, 59, 59, 999);

  return {
    AND: [
      q
        ? {
            OR: [
              { subject: { contains: q } },
              { sender: { contains: q } },
              { recipient: { contains: q } },
              { registerNo: { contains: q } },
              { category: { contains: q } },
            ],
          }
        : {},
      direction ? { direction } : {},
      category ? { category } : {},
      from || to
        ? {
            date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {},
    ],
  };
}

router.get('/stats', async (req, res) => {
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);

  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const alert = String(req.query.alert || '');
  const docWhere = buildDocumentWhere(q, category, '', '', alert);

  const direction = String(req.query.direction || '');
  const archiveCategory = String(req.query.archiveCategory || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const archiveWhere = buildArchiveWhere(q, direction, archiveCategory, dateFrom, dateTo);

  const [total, expiring, expired, sizeAgg, categories, archivesTotal, entrant, sortant] = await Promise.all([
    prisma.document.count({ where: docWhere }),
    prisma.document.count({ where: { AND: [docWhere, { expiresAt: { lte: in30, gte: now } }] } }),
    prisma.document.count({ where: { AND: [docWhere, { expiresAt: { lt: now } }] } }),
    prisma.document.aggregate({ where: docWhere, _sum: { size: true } }),
    prisma.document.findMany({
      where: { AND: [docWhere, { category: { not: null }, NOT: { category: '' } }] },
      select: { category: true },
      distinct: ['category'],
      take: 20,
    }),
    prisma.archiveEntry.count({ where: archiveWhere }),
    prisma.archiveEntry.count({ where: { AND: [archiveWhere, { direction: 'entrant' }] } }),
    prisma.archiveEntry.count({ where: { AND: [archiveWhere, { direction: 'sortant' }] } }),
  ]);

  res.json({
    total,
    expiring,
    expired,
    totalSize: sizeAgg._sum.size || 0,
    categories: categories.map((c) => c.category).filter(Boolean),
    archivesTotal,
    archivesEntrant: entrant,
    archivesSortant: sortant,
  });
});

router.get('/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const entityType = String(req.query.entityType || '');
  const entityId = String(req.query.entityId || '');
  const alert = String(req.query.alert || '');
  const where = buildDocumentWhere(q, category, entityType, entityId, alert);

  const docs = await prisma.document.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 3000,
    include: docInclude,
  });

  const header = 'Nom;Catégorie;Type MIME;Taille octets;Entité;Échéance;Client;Bien;Chantier;Date';
  const fmt = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
  const rows = docs.map((d) =>
    [
      d.name,
      d.category || '',
      d.mimeType || '',
      d.size ?? '',
      d.entityType || '',
      fmt(d.expiresAt),
      d.client ? `${d.client.reference} ${d.client.firstName} ${d.client.lastName}` : '',
      d.property?.reference || '',
      d.chantier?.name || '',
      fmt(d.createdAt),
    ].join(';')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=documents-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const entityType = String(req.query.entityType || '');
  const entityId = String(req.query.entityId || '');
  const alert = String(req.query.alert || '');
  const where = buildDocumentWhere(q, category, entityType, entityId, alert);

  const docs = await prisma.document.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: docInclude,
  });

  sendExcel(
    res,
    'documents-gic.xlsx',
    'Documents',
    docs.map((d) => ({
      Nom: d.name,
      Catégorie: d.category || '',
      Type: d.mimeType || '',
      Taille: d.size ?? '',
      Entité: d.entityType || '',
      Échéance: d.expiresAt ? d.expiresAt.toISOString().slice(0, 10) : '',
      Client: d.client ? `${d.client.reference} ${d.client.firstName} ${d.client.lastName}` : '',
      Bien: d.property?.reference || '',
      Chantier: d.chantier?.name || '',
      Date: d.createdAt.toISOString().slice(0, 10),
    })),
  );
});

router.get('/archives/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const direction = String(req.query.direction || '');
  const category = String(req.query.category || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const where = buildArchiveWhere(q, direction, category, dateFrom, dateTo);

  const items = await prisma.archiveEntry.findMany({ where, orderBy: { date: 'desc' }, take: 3000 });
  const header = 'N° registre;Date;Objet;Expéditeur;Destinataire;Direction;Catégorie';
  const rows = items.map((a) =>
    [a.registerNo || '', a.date.toISOString().slice(0, 10), a.subject, a.sender || '', a.recipient || '', a.direction || '', a.category || ''].join(';')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=bureau-ordre-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/archives/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const direction = String(req.query.direction || '');
  const category = String(req.query.category || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const where = buildArchiveWhere(q, direction, category, dateFrom, dateTo);

  const items = await prisma.archiveEntry.findMany({ where, orderBy: { date: 'desc' }, take: 5000 });
  sendExcel(
    res,
    'bureau-ordre-gic.xlsx',
    'Bureau d\'ordre',
    items.map((a) => ({
      'N° registre': a.registerNo || '',
      Date: a.date.toISOString().slice(0, 10),
      Objet: a.subject,
      Expéditeur: a.sender || '',
      Destinataire: a.recipient || '',
      Direction: a.direction || '',
      Catégorie: a.category || '',
    })),
  );
});

router.get('/archives', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const direction = String(req.query.direction || '');
  const category = String(req.query.category || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const sort = String(req.query.sort || 'date');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const where = buildArchiveWhere(q, direction, category, dateFrom, dateTo);

  const orderBy =
    sort === 'subject'
      ? { subject: order as 'asc' | 'desc' }
      : sort === 'registerNo'
        ? { registerNo: order as 'asc' | 'desc' }
        : { date: order as 'asc' | 'desc' };

  const [items, total] = await Promise.all([
    prisma.archiveEntry.findMany({ where, orderBy, skip, take: limit }),
    prisma.archiveEntry.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.post('/archives', upload.single('file'), async (req, res) => {
  const entry = await prisma.archiveEntry.create({
    data: {
      registerNo: req.body.registerNo || null,
      date: req.body.date ? new Date(req.body.date) : new Date(),
      subject: req.body.subject,
      sender: req.body.sender || null,
      recipient: req.body.recipient || null,
      category: req.body.category || null,
      direction: req.body.direction || 'entrant',
      remark: req.body.remark || null,
      filePath: req.file ? `/uploads/${req.file.filename}` : null,
    },
  });
  await audit(req, 'création', 'ArchiveEntry', entry.id, entry.subject);
  res.status(201).json(entry);
});

router.get('/archives/:id/history', async (req, res) => {
  const entryId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'ArchiveEntry', entityId: entryId },
        { details: { contains: entryId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/archives/:id', async (req, res) => {
  const entry = await prisma.archiveEntry.findUnique({ where: { id: String(req.params.id) } });
  if (!entry) return res.status(404).json({ message: 'Entrée introuvable' });
  res.json(entry);
});

router.put('/archives/:id', upload.single('file'), async (req, res) => {
  const id = String(req.params.id);
  const data: Record<string, unknown> = {};
  if (req.body.registerNo != null) data.registerNo = req.body.registerNo || null;
  if (req.body.subject != null) data.subject = req.body.subject;
  if (req.body.sender != null) data.sender = req.body.sender || null;
  if (req.body.recipient != null) data.recipient = req.body.recipient || null;
  if (req.body.category != null) data.category = req.body.category || null;
  if (req.body.direction != null) data.direction = req.body.direction;
  if (req.body.remark != null) data.remark = req.body.remark || null;
  if (req.body.date) data.date = new Date(req.body.date);
  if (req.file) data.filePath = `/uploads/${req.file.filename}`;

  const entry = await prisma.archiveEntry.update({ where: { id }, data });
  await audit(req, 'modification', 'ArchiveEntry', id, entry.subject);
  res.json(entry);
});

router.delete('/archives/:id', async (req, res) => {
  const id = String(req.params.id);
  const entry = await prisma.archiveEntry.findUnique({ where: { id } });
  if (!entry) return res.status(404).json({ message: 'Entrée introuvable' });
  await prisma.archiveEntry.delete({ where: { id } });
  await audit(req, 'suppression', 'ArchiveEntry', id, entry.subject);
  res.json({ ok: true });
});

router.post('/archives/:id/send-email', async (req, res) => {
  const id = String(req.params.id);
  const to = String(req.body?.to || '').trim();
  const message = String(req.body?.message || '').trim();
  const entry = await prisma.archiveEntry.findUnique({ where: { id } });
  if (!entry) return res.status(404).json({ message: 'Entrée introuvable' });
  const emailTo = to || entry.emailTo || entry.recipient;
  if (!emailTo || !emailTo.includes('@')) {
    return res.status(400).json({ message: 'Adresse email destinataire requise' });
  }
  const body =
    message ||
    `Bonjour,\n\nVeuillez trouver ci-joint les informations du bureau d'ordre GIC.\n\nObjet : ${entry.subject}\nN° registre : ${entry.registerNo || '—'}\nExpéditeur : ${entry.sender || '—'}\n\nGIC — Expertise & Consulting Company`;
  await sendEmail(emailTo, `Bureau d'ordre GIC — ${entry.subject}`, body);
  await prisma.archiveEntry.update({
    where: { id },
    data: { emailTo, emailSentAt: new Date() },
  });
  if (entry.entityType && entry.entityId) {
    await logConversation({
      entityType: entry.entityType as 'Client',
      entityId: entry.entityId,
      channel: 'email',
      subject: entry.subject,
      body,
      recipient: emailTo,
      userId: req.user?.id,
      userName: req.user?.email,
    });
  }
  await audit(req, 'email_bureau_ordre', 'ArchiveEntry', id, emailTo);
  res.json({ ok: true });
});

router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
  const { name, category, entityType, entityId, clientId, propertyId, chantierId, rentalId, saleId, supplierId, enginId, expiresAt } = req.body;
  const linkedRentalId =
    rentalId || (entityType === 'Rental' && entityId ? String(entityId) : null);
  const linkedSaleId =
    saleId || (entityType === 'Sale' && entityId ? String(entityId) : null);
  const linkedEnginId =
    enginId || (entityType === 'Engin' && entityId ? String(entityId) : null);
  const doc = await prisma.document.create({
    data: {
      name: name || req.file.originalname,
      category: category || 'general',
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/${req.file.filename}`,
      entityType: entityType || null,
      entityId: entityId || null,
      clientId: clientId || null,
      propertyId: propertyId || null,
      chantierId: chantierId || null,
      rentalId: linkedRentalId || null,
      saleId: linkedSaleId || null,
      supplierId: supplierId || (entityType === 'Supplier' && entityId ? String(entityId) : null),
      enginId: linkedEnginId || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
    include: docInclude,
  });
  await audit(req, 'upload', 'Document', doc.id, doc.name);
  res.status(201).json(doc);
});

router.get('/:id/history', async (req, res) => {
  const docId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Document', entityId: docId },
        { details: { contains: docId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/:id', async (req, res) => {
  const doc = await prisma.document.findUnique({
    where: { id: String(req.params.id) },
    include: docInclude,
  });
  if (!doc) return res.status(404).json({ message: 'Document introuvable' });
  res.json(doc);
});

router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const data: Record<string, unknown> = {};
  if (req.body.name != null) data.name = req.body.name;
  if (req.body.category != null) data.category = req.body.category || null;
  if (req.body.entityType != null) data.entityType = req.body.entityType || null;
  if (req.body.entityId != null) data.entityId = req.body.entityId || null;
  if (req.body.expiresAt !== undefined) data.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;

  const doc = await prisma.document.update({ where: { id }, data, include: docInclude });
  await audit(req, 'modification', 'Document', id, doc.name);
  res.json(doc);
});

router.delete('/:id', async (req, res) => {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ message: 'Document introuvable' });
  const filename = path.basename(doc.path);
  const fullPath = path.join(uploadDir, filename);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  await prisma.document.delete({ where: { id: req.params.id } });
  await audit(req, 'suppression', 'Document', req.params.id, doc.name);
  res.json({ ok: true });
});

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const entityType = String(req.query.entityType || '');
  const entityId = String(req.query.entityId || '');
  const alert = String(req.query.alert || '');
  const sort = String(req.query.sort || 'createdAt');
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const paginated = !!(
    req.query.page ||
    req.query.limit ||
    req.query.q ||
    req.query.category ||
    req.query.entityType ||
    req.query.alert
  );

  if (!paginated && !entityType && !entityId) {
    const docs = await prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: docInclude,
    });
    return res.json(docs);
  }

  const where = buildDocumentWhere(q, category, entityType, entityId, alert);
  const orderBy =
    sort === 'name'
      ? { name: order as 'asc' | 'desc' }
      : sort === 'category'
        ? { category: order as 'asc' | 'desc' }
        : sort === 'size'
          ? { size: order as 'asc' | 'desc' }
          : sort === 'expiresAt'
            ? { expiresAt: order as 'asc' | 'desc' }
            : { createdAt: order as 'asc' | 'desc' };

  const [items, total] = await Promise.all([
    prisma.document.findMany({ where, include: docInclude, orderBy, skip, take: limit }),
    prisma.document.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

export default router;
