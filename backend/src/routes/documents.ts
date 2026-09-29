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
import {
  parseOptionalDate,
  parseOptionalFee,
} from '../lib/documentFees.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

router.get('/checklist', async (req, res) => {
  const entityType = String(req.query.entityType || '').trim();
  const entityId = String(req.query.entityId || '').trim();
  if (!entityType || !entityId) return res.status(400).json({ message: 'Fiche requise' });
  const row = await prisma.documentChecklist.findUnique({
    where: { entityType_entityId: { entityType, entityId } },
  });
  res.json({ config: row?.config || null });
});

router.put('/checklist', async (req, res) => {
  const entityType = String(req.body.entityType || '').trim();
  const entityId = String(req.body.entityId || '').trim();
  if (!entityType || !entityId) return res.status(400).json({ message: 'Fiche requise' });
  const config = JSON.stringify({
    custom: Array.isArray(req.body.custom) ? req.body.custom : [],
    labels: req.body.labels && typeof req.body.labels === 'object' ? req.body.labels : {},
    hidden: Array.isArray(req.body.hidden) ? req.body.hidden : [],
    required: req.body.required && typeof req.body.required === 'object' ? req.body.required : {},
  });
  const row = await prisma.documentChecklist.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    update: { config },
    create: { entityType, entityId, config },
  });
  await audit(req, 'modification', 'DocumentChecklist', row.id, `${entityType} ${entityId}`);
  res.json({ config: row.config });
});

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
      ? { expiresAt: { gte: now, lte: in30 } }
      : alert === 'expired'
        ? { expiresAt: { lt: now } }
        : alert === 'late'
          ? (() => {
              const startOfToday = new Date();
              startOfToday.setHours(0, 0, 0, 0);
              return {
                estimatedEndDate: { lt: startOfToday },
                NOT: { status: 'valid' },
              };
            })()
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

  const [total, expiring, expired, late, sizeAgg, categories, archivesTotal, entrant, sortant] = await Promise.all([
    prisma.document.count({ where: docWhere }),
    prisma.document.count({ where: { AND: [docWhere, { expiresAt: { lte: in30, gte: now } }] } }),
    prisma.document.count({ where: { AND: [docWhere, { expiresAt: { lt: now } }] } }),
    prisma.document.count({
      where: {
        AND: [
          docWhere,
          {
            estimatedEndDate: { lt: (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })() },
            NOT: { status: 'valid' },
          },
        ],
      },
    }),
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
    late,
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
  const {
    name, category, entityType, entityId, clientId, propertyId, chantierId,
    rentalId, saleId, supplierId, enginId, expiresAt, feeAmount,
    estimatedStartDate, estimatedEndDate,
  } = req.body;
  const linkedRentalId =
    rentalId || (entityType === 'Rental' && entityId ? String(entityId) : null);
  const linkedSaleId =
    saleId || (entityType === 'Sale' && entityId ? String(entityId) : null);
  const linkedEnginId =
    enginId || (entityType === 'Engin' && entityId ? String(entityId) : null);
  const linkedChantierId =
    chantierId || (entityType === 'Chantier' && entityId ? String(entityId) : null);
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
      chantierId: linkedChantierId || null,
      rentalId: linkedRentalId || null,
      saleId: linkedSaleId || null,
      supplierId: supplierId || (entityType === 'Supplier' && entityId ? String(entityId) : null),
      enginId: linkedEnginId || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      feeAmount: parseOptionalFee(feeAmount),
      estimatedStartDate: parseOptionalDate(estimatedStartDate),
      estimatedEndDate: parseOptionalDate(estimatedEndDate),
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

router.get('/:id/related', async (req, res) => {
  const id = String(req.params.id);
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return res.status(404).json({ message: 'Document introuvable' });

  const or: object[] = [];
  if (doc.clientId) or.push({ clientId: doc.clientId });
  if (doc.propertyId) or.push({ propertyId: doc.propertyId });
  if (doc.chantierId) or.push({ chantierId: doc.chantierId });
  if (doc.supplierId) or.push({ supplierId: doc.supplierId });
  if (doc.saleId) or.push({ saleId: doc.saleId });
  if (doc.rentalId) or.push({ rentalId: doc.rentalId });
  if (doc.enginId) or.push({ enginId: doc.enginId });
  if (doc.entityType && doc.entityId) {
    or.push({ entityType: doc.entityType, entityId: doc.entityId });
  }

  if (!or.length) return res.json([]);

  const related = await prisma.document.findMany({
    where: {
      id: { not: id },
      OR: or,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      name: true,
      category: true,
      status: true,
      mimeType: true,
      size: true,
      path: true,
      expiresAt: true,
      createdAt: true,
    },
  });
  res.json(related);
});

router.put('/:id/file', upload.single('file'), async (req, res) => {
  const id = String(req.params.id);
  if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
  const existing = await prisma.document.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Document introuvable' });

  const oldFilename = path.basename(existing.path);
  const oldFull = path.join(uploadDir, oldFilename);
  if (fs.existsSync(oldFull) && oldFilename !== req.file.filename) {
    try {
      fs.unlinkSync(oldFull);
    } catch {
      /* ignore */
    }
  }

  const keepName = String(req.body.keepName || '') === '1' || String(req.body.keepName || '') === 'true';
  const doc = await prisma.document.update({
    where: { id },
    data: {
      path: `/uploads/${req.file.filename}`,
      mimeType: req.file.mimetype,
      size: req.file.size,
      name: keepName ? existing.name : String(req.body.name || req.file.originalname || existing.name),
      status: 'pending',
    },
    include: docInclude,
  });
  await audit(req, 'remplacement', 'Document', id, doc.name);
  res.json(doc);
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
  if (req.body.status != null) {
    const status = String(req.body.status);
    if (!['pending', 'valid', 'invalid'].includes(status)) {
      return res.status(400).json({ message: 'Statut document invalide' });
    }
    data.status = status;
    if (status === 'valid') data.lateNotifiedAt = null;
  }
  if (req.body.entityType != null) data.entityType = req.body.entityType || null;
  if (req.body.entityId != null) data.entityId = req.body.entityId || null;
  if (req.body.expiresAt !== undefined) data.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
  if (req.body.feeAmount !== undefined) data.feeAmount = parseOptionalFee(req.body.feeAmount);
  if (req.body.estimatedStartDate !== undefined) {
    data.estimatedStartDate = parseOptionalDate(req.body.estimatedStartDate);
  }
  if (req.body.estimatedEndDate !== undefined) {
    data.estimatedEndDate = parseOptionalDate(req.body.estimatedEndDate);
  }
  if (req.body.chantierId !== undefined) {
    data.chantierId = req.body.chantierId ? String(req.body.chantierId) : null;
  }

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
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const paginated = !!(
    req.query.page ||
    req.query.limit ||
    req.query.q ||
    req.query.category ||
    req.query.entityType ||
    req.query.entityId ||
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
