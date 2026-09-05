import { Router } from 'express';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { nextReference } from '../lib/references.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import { upload, uploadExcel } from '../lib/upload.js';
import { recordClientAgentChange } from '../lib/clientAgentHistory.js';
import {
  importAgentRows,
  parseCsvAgentRows,
  parseExcelAgentRows,
} from '../lib/importAgents.js';

function buildAgentWhere(q: string, linked = '', active = '') {
  const linkedFilter =
    linked === 'true'
      ? { clients: { some: { isArchived: false } } }
      : linked === 'false'
        ? { clients: { none: { isArchived: false } } }
        : {};

  const activeFilter =
    active === 'true'
      ? { isActive: true }
      : active === 'false'
        ? { isActive: false }
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
              { reference: { contains: q } },
            ],
          }
        : {},
      linkedFilter,
      activeFilter,
    ],
  };
}

async function backfillReferences() {
  const missing = await prisma.agent.findMany({
    where: { reference: null },
    select: { id: true },
    take: 200,
  });
  for (const a of missing) {
    const reference = await nextReference('AGT');
    await prisma.agent.update({ where: { id: a.id }, data: { reference } });
  }
}

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

backfillReferences().catch(() => {});

router.get('/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const linked = String(req.query.linked || '');
  const active = String(req.query.active || '');
  const where = buildAgentWhere(q, linked, active);

  const agents = await prisma.agent.findMany({
    where,
    orderBy: { lastName: 'asc' },
    include: { _count: { select: { clients: true } } },
  });
  const header = 'Référence;Prénom;Nom;Email;Téléphone;Téléphone 2;Adresse;Remarque;Actif;Clients';
  const rows = agents.map(
    (a) =>
      `${a.reference || ''};${a.firstName};${a.lastName};${a.email || ''};${a.phone1 || ''};${a.phone2 || ''};${(a.address || '').replace(/;/g, ',')};${(a.remark || '').replace(/;/g, ',')};${a.isActive ? 'Oui' : 'Non'};${a._count.clients}`
  );
  const csv = [header, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=agents-gic.csv');
  res.send('\uFEFF' + csv);
});

router.post('/import/csv', async (req, res) => {
  const csv = String(req.body?.csv || '').trim();
  if (!csv) return res.status(400).json({ message: 'Contenu CSV requis' });
  const result = await importAgentRows(parseCsvAgentRows(csv));
  await audit(req, 'import_csv', 'Agent', undefined, `${result.created} créés`);
  res.json(result);
});

router.post('/import/xlsx', uploadExcel.single('file'), async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ message: 'Fichier Excel (.xlsx) requis' });
  const rows = parseExcelAgentRows(req.file.buffer);
  if (!rows.length) return res.status(400).json({ message: 'Fichier vide ou format non reconnu' });
  const result = await importAgentRows(rows);
  await audit(req, 'import_xlsx', 'Agent', undefined, `${result.created} créés`);
  res.json(result);
});

router.get('/stats', async (_req, res) => {
  const [total, active, withEmail, withPhone, linked, unlinked] = await Promise.all([
    prisma.agent.count(),
    prisma.agent.count({ where: { isActive: true } }),
    prisma.agent.count({ where: { email: { not: null }, NOT: { email: '' } } }),
    prisma.agent.count({ where: { phone1: { not: null }, NOT: { phone1: '' } } }),
    prisma.agent.count({ where: { clients: { some: { isArchived: false } } } }),
    prisma.agent.count({ where: { clients: { none: { isArchived: false } } } }),
  ]);
  res.json({ total, active, withEmail, withPhone, linked, unlinked });
});

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const linked = String(req.query.linked || '');
  const active = String(req.query.active || '');
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
        : sort === 'clients'
          ? { clients: { _count: order as 'asc' | 'desc' } }
          : [{ lastName: order as 'asc' | 'desc' }, { firstName: order as 'asc' | 'desc' }];

  const where = buildAgentWhere(q, linked, active);
  const [items, total] = await Promise.all([
    prisma.agent.findMany({
      where,
      include: { _count: { select: { clients: true } } },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.agent.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.post('/', async (req, res) => {
  const { firstName, lastName } = req.body || {};
  if (!firstName || !lastName) {
    return res.status(400).json({ message: 'Prénom et nom obligatoires' });
  }
  const data = { ...req.body };
  delete data.id;
  delete data.reference;
  delete data._count;
  delete data.clients;
  data.reference = await nextReference('AGT');
  if (data.isActive === undefined) data.isActive = true;

  const agent = await prisma.agent.create({ data });
  await audit(req, 'création', 'Agent', agent.id, `${agent.reference} ${agent.firstName} ${agent.lastName}`);
  res.status(201).json(agent);
});

router.get('/:id/history', async (req, res) => {
  const agentId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Agent', entityId: agentId },
        { details: { contains: agentId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(logs);
});

router.get('/:id/documents', async (req, res) => {
  const agentId = String(req.params.id);
  const docs = await prisma.document.findMany({
    where: { entityType: 'Agent', entityId: agentId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs);
});

router.post('/:id/clients', async (req, res) => {
  const agentId = String(req.params.id);
  const clientId = String(req.body?.clientId || '');
  if (!clientId) return res.status(400).json({ message: 'clientId requis' });

  const existing = await prisma.client.findUnique({ where: { id: clientId } });
  if (!existing) return res.status(404).json({ message: 'Client introuvable' });

  const client = await prisma.client.update({
    where: { id: clientId },
    data: { agentId },
  });
  await recordClientAgentChange(clientId, existing.agentId, agentId, req.user?.email);
  await audit(req, 'affectation', 'Client', clientId, `agent ${agentId}`);
  res.json(client);
});

router.delete('/:id/clients/:clientId', async (req, res) => {
  const agentId = String(req.params.id);
  const clientId = String(req.params.clientId);
  const existing = await prisma.client.findUnique({ where: { id: clientId } });
  if (!existing || existing.agentId !== agentId) {
    return res.status(404).json({ message: 'Client non assigné à cet agent' });
  }
  await prisma.client.update({ where: { id: clientId }, data: { agentId: null } });
  await recordClientAgentChange(clientId, agentId, null, req.user?.email);
  await audit(req, 'déliaison', 'Client', clientId, `agent ${agentId}`);
  res.json({ ok: true });
});

router.post('/:id/photo', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Photo requise' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
    return res.status(400).json({ message: 'Format photo : JPG ou PNG' });
  }
  const photo = `/uploads/${req.file.filename}`;
  const agent = await prisma.agent.update({
    where: { id: String(req.params.id) },
    data: { photo },
  });
  await audit(req, 'photo', 'Agent', agent.id, agent.reference || agent.id);
  res.json(agent);
});

router.get('/:id', async (req, res) => {
  const agent = await prisma.agent.findUnique({
    where: { id: String(req.params.id) },
    include: {
      clients: {
        where: { isArchived: false },
        orderBy: { createdAt: 'desc' },
        take: 200,
      },
      _count: { select: { clients: true } },
    },
  });
  if (!agent) return res.status(404).json({ message: 'Agent introuvable' });

  const salesCount = await prisma.sale.count({
    where: { client: { agentId: agent.id, isArchived: false } },
  });
  const rentalsCount = await prisma.rental.count({
    where: { client: { agentId: agent.id, isArchived: false } },
  });

  res.json({ ...agent, stats: { salesCount, rentalsCount } });
});

router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const data = { ...req.body };
  delete data.id;
  delete data.reference;
  delete data._count;
  delete data.clients;
  delete data.stats;

  const agent = await prisma.agent.update({ where: { id }, data });
  await audit(req, 'modification', 'Agent', agent.id, `${agent.reference || ''} ${agent.firstName} ${agent.lastName}`);
  res.json(agent);
});

router.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const linked = await prisma.client.count({ where: { agentId: id, isArchived: false } });
  if (linked > 0) {
    return res.status(400).json({
      message: `Agent lié à ${linked} client(s) — réaffectez ou retirez les clients (RG-AGT-001)`,
    });
  }

  await prisma.agent.delete({ where: { id } });
  await audit(req, 'suppression', 'Agent', id, motif);
  res.json({ ok: true });
});

export default router;
