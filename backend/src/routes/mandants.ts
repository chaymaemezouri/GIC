import { Router } from 'express';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { nextReference } from '../lib/references.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import { upload, uploadExcel } from '../lib/upload.js';
import {
  importMandantRows,
  parseCsvMandantRows,
  parseExcelMandantRows,
} from '../lib/importMandants.js';

function buildMandantWhere(q: string, identityType: string, linked = '') {
  const linkedFilter =
    linked === 'true'
      ? { clients: { some: {} } }
      : linked === 'false'
        ? { clients: { none: {} } }
        : {};

  return {
    AND: [
      q
        ? {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { email: { contains: q } },
              { phone1: { contains: q } },
              { identityNumber: { contains: q } },
              { reference: { contains: q } },
            ],
          }
        : {},
      identityType ? { identityType } : {},
      linkedFilter,
    ],
  };
}

async function ensureIdentityUnique(identityNumber: unknown, excludeId?: string) {
  const num = String(identityNumber || '').trim();
  if (!num) return null;
  const exists = await prisma.mandant.findFirst({
    where: {
      identityNumber: num,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (exists) return 'Ce numéro d\'identité existe déjà';
  return null;
}

async function backfillReferences() {
  const missing = await prisma.mandant.findMany({
    where: { reference: null },
    select: { id: true },
    take: 200,
  });
  for (const m of missing) {
    const reference = await nextReference('MAN');
    await prisma.mandant.update({ where: { id: m.id }, data: { reference } });
  }
}

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

backfillReferences().catch(() => {});

router.get('/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const identityType = String(req.query.identityType || '');
  const linked = String(req.query.linked || '');
  const where = buildMandantWhere(q, identityType, linked);

  const mandants = await prisma.mandant.findMany({
    where,
    orderBy: { lastName: 'asc' },
    include: { _count: { select: { clients: true } } },
  });
  const header = 'Référence;Prénom;Nom;Type identité;N° pièce;Email;Téléphone;Adresse;Remarque;Clients liés';
  const rows = mandants.map(
    (m) =>
      `${m.reference || ''};${m.firstName};${m.lastName};${m.identityType || ''};${m.identityNumber || ''};${m.email || ''};${m.phone1 || ''};${(m.address || '').replace(/;/g, ',')};${(m.remark || '').replace(/;/g, ',')};${m._count.clients}`
  );
  const csv = [header, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=mandants-gic.csv');
  res.send('\uFEFF' + csv);
});

router.post('/import/csv', async (req, res) => {
  const csv = String(req.body?.csv || '').trim();
  if (!csv) return res.status(400).json({ message: 'Contenu CSV requis' });
  const result = await importMandantRows(parseCsvMandantRows(csv));
  await audit(req, 'import_csv', 'Mandant', undefined, `${result.created} créés`);
  res.json(result);
});

router.post('/import/xlsx', uploadExcel.single('file'), async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ message: 'Fichier Excel (.xlsx) requis' });
  const rows = parseExcelMandantRows(req.file.buffer);
  if (!rows.length) return res.status(400).json({ message: 'Fichier vide ou format non reconnu' });
  const result = await importMandantRows(rows);
  await audit(req, 'import_xlsx', 'Mandant', undefined, `${result.created} créés`);
  res.json(result);
});

router.get('/stats', async (_req, res) => {
  const [total, withEmail, withPhone, linked, unlinked] = await Promise.all([
    prisma.mandant.count(),
    prisma.mandant.count({ where: { email: { not: null }, NOT: { email: '' } } }),
    prisma.mandant.count({ where: { phone1: { not: null }, NOT: { phone1: '' } } }),
    prisma.mandant.count({ where: { clients: { some: {} } } }),
    prisma.mandant.count({ where: { clients: { none: {} } } }),
  ]);
  res.json({ total, withEmail, withPhone, linked, unlinked });
});

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const identityType = String(req.query.identityType || '');
  const linked = String(req.query.linked || '');
  const sort = String(req.query.sort || 'lastName');
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const orderBy =
    sort === 'createdAt'
      ? { createdAt: order as 'asc' | 'desc' }
      : sort === 'reference'
        ? { reference: order as 'asc' | 'desc' }
        : [{ lastName: order as 'asc' | 'desc' }, { firstName: order as 'asc' | 'desc' }];

  const where = buildMandantWhere(q, identityType, linked);
  const [items, total] = await Promise.all([
    prisma.mandant.findMany({
      where,
      include: { _count: { select: { clients: true } } },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.mandant.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.post('/', async (req, res) => {
  const { firstName, lastName } = req.body || {};
  if (!firstName || !lastName) {
    return res.status(400).json({ message: 'Prénom et nom obligatoires' });
  }
  const dup = await ensureIdentityUnique(req.body.identityNumber);
  if (dup) return res.status(400).json({ message: dup });

  const data = { ...req.body };
  if (data.birthDate) data.birthDate = new Date(data.birthDate);
  data.reference = await nextReference('MAN');

  const mandant = await prisma.mandant.create({ data });
  await audit(req, 'création', 'Mandant', mandant.id, `${mandant.reference} ${mandant.firstName} ${mandant.lastName}`);
  res.status(201).json(mandant);
});

router.get('/:id/history', async (req, res) => {
  const mandantId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Mandant', entityId: mandantId },
        { details: { contains: mandantId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/:id/documents', async (req, res) => {
  const mandantId = String(req.params.id);
  const docs = await prisma.document.findMany({
    where: { entityType: 'Mandant', entityId: mandantId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs);
});

router.post('/:id/clients', async (req, res) => {
  const mandantId = String(req.params.id);
  const clientId = String(req.body?.clientId || '');
  if (!clientId) return res.status(400).json({ message: 'clientId requis' });

  const link = await prisma.clientMandant.upsert({
    where: { clientId_mandantId: { clientId, mandantId } },
    create: { clientId, mandantId },
    update: {},
  });
  await audit(req, 'liaison', 'ClientMandant', link.id, `mandant ${mandantId} ↔ client ${clientId}`);
  res.status(201).json(link);
});

router.delete('/:id/clients/:clientId', async (req, res) => {
  await prisma.clientMandant.delete({
    where: {
      clientId_mandantId: {
        clientId: String(req.params.clientId),
        mandantId: String(req.params.id),
      },
    },
  });
  await audit(req, 'déliaison', 'ClientMandant', String(req.params.id), `client ${req.params.clientId}`);
  res.json({ ok: true });
});

router.post('/:id/photo', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Photo requise' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
    return res.status(400).json({ message: 'Format photo : JPG ou PNG' });
  }
  const photo = `/uploads/${req.file.filename}`;
  const mandant = await prisma.mandant.update({
    where: { id: String(req.params.id) },
    data: { photo },
  });
  await audit(req, 'photo', 'Mandant', mandant.id, mandant.reference || mandant.id);
  res.json(mandant);
});

router.get('/:id', async (req, res) => {
  const mandant = await prisma.mandant.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { clients: true } },
      clients: {
        include: {
          client: {
            select: {
              id: true,
              reference: true,
              firstName: true,
              lastName: true,
              email: true,
              phone1: true,
              isBuyer: true,
              isTenant: true,
              isProspect: true,
            },
          },
        },
      },
    },
  });
  if (!mandant) return res.status(404).json({ message: 'Mandant introuvable' });
  res.json(mandant);
});

router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const dup = await ensureIdentityUnique(req.body.identityNumber, id);
  if (dup) return res.status(400).json({ message: dup });

  const data = { ...req.body };
  delete data.id;
  delete data.reference;
  delete data._count;
  delete data.clients;
  if (data.birthDate !== undefined) data.birthDate = data.birthDate ? new Date(data.birthDate) : null;

  const mandant = await prisma.mandant.update({ where: { id }, data });
  await audit(req, 'modification', 'Mandant', mandant.id, `${mandant.reference || ''} ${mandant.firstName} ${mandant.lastName}`);
  res.json(mandant);
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const linked = await prisma.clientMandant.count({ where: { mandantId: id } });
  if (linked > 0) {
    return res.status(400).json({
      message: `Mandant lié à ${linked} client(s) — supprimez d'abord les liaisons (RG-MAN-001)`,
    });
  }

  await prisma.mandant.delete({ where: { id } });
  await audit(req, 'suppression', 'Mandant', id, motif);
  res.json({ ok: true });
});

export default router;
