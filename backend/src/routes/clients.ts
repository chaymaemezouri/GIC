import { Router } from 'express';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { nextReference } from '../lib/references.js';
import { audit } from '../lib/audit.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { uploadExcel, upload } from '../lib/upload.js';
import { importClientRows, parseCsvClientRows, parseExcelClientRows } from '../lib/importClients.js';
import { sendExcel } from '../lib/exportExcel.js';
import { recordClientAgentChange } from '../lib/clientAgentHistory.js';
import { sendEmail } from '../lib/email.js';
import { sendSms, sendWhatsApp } from '../lib/messaging.js';

function buildClientWhere(q: string, type: string, archived = '') {
  const archiveFilter =
    archived === 'true' ? { isArchived: true }
      : archived === 'all' ? {}
        : { isArchived: false };

  return {
    AND: [
      archiveFilter,
      q
        ? {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { email: { contains: q } },
              { reference: { contains: q } },
              { phone1: { contains: q } },
              { identityNumber: { contains: q } },
              { source: { contains: q } },
            ],
          }
        : {},
      type === 'prospect' ? { isProspect: true } : {},
      type === 'acheteur' ? { isBuyer: true } : {},
      type === 'locataire' ? { isTenant: true } : {},
    ],
  };
}

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

router.get('/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || '');
  const archived = String(req.query.archived || '');
  const where = buildClientWhere(q, type, archived);
  const clients = await prisma.client.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  const header = 'Référence;Prénom;Nom;Email;Téléphone;CIN;Prospect;Acheteur;Locataire';
  const rows = clients.map(
    (c) =>
      `${c.reference};${c.firstName};${c.lastName};${c.email};${c.phone1};${c.identityNumber || ''};${c.isProspect ? 'Oui' : 'Non'};${c.isBuyer ? 'Oui' : 'Non'};${c.isTenant ? 'Oui' : 'Non'}`
  );
  const csv = [header, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=clients-gic.csv');
  res.send('\uFEFF' + csv);
});

router.get('/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || '');
  const archived = String(req.query.archived || '');
  const where = buildClientWhere(q, type, archived);
  const clients = await prisma.client.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: { agent: { select: { firstName: true, lastName: true } } },
  });
  sendExcel(
    res,
    'clients-gic.xlsx',
    'Clients',
    clients.map((c) => ({
      Référence: c.reference,
      Nom: c.lastName,
      Prénom: c.firstName,
      CIN: c.identityNumber || '',
      Email: c.email,
      Tél1: c.phone1,
      Tél2: c.phone2 || '',
      Prospect: c.isProspect ? 'Oui' : 'Non',
      Acheteur: c.isBuyer ? 'Oui' : 'Non',
      Locataire: c.isTenant ? 'Oui' : 'Non',
      Source: c.source || '',
      Agent: c.agent ? `${c.agent.firstName} ${c.agent.lastName}` : '',
    }))
  );
});

router.post('/import/csv', async (req, res) => {
  const { csv } = req.body;
  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({ message: 'Contenu CSV requis' });
  }
  const result = await importClientRows(parseCsvClientRows(csv));
  await audit(req, 'import_csv', 'Client', undefined, `${result.created} créés`);
  res.json(result);
});

router.post('/import/xlsx', uploadExcel.single('file'), async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ message: 'Fichier Excel (.xlsx) requis' });
  const rows = parseExcelClientRows(req.file.buffer);
  if (!rows.length) {
    return res.status(400).json({ message: 'Fichier vide ou format non reconnu' });
  }
  const result = await importClientRows(rows);
  await audit(req, 'import_xlsx', 'Client', undefined, `${result.created} créés`);
  res.json(result);
});

router.get('/stats', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || '');
  const archived = String(req.query.archived || '');
  const where = buildClientWhere(q, type, archived);

  const [total, prospects, buyers, tenants, archivedGlobal] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.count({ where: { ...where, isProspect: true } }),
    prisma.client.count({ where: { ...where, isBuyer: true } }),
    prisma.client.count({ where: { ...where, isTenant: true } }),
    prisma.client.count({ where: { isArchived: true } }),
  ]);
  res.json({ total, prospects, buyers, tenants, archived: archivedGlobal });
});

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || '');
  const archived = String(req.query.archived || '');
  const sort = String(req.query.sort || 'createdAt');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const orderBy =
    sort === 'name'
      ? [{ lastName: order as 'asc' | 'desc' }, { firstName: order as 'asc' | 'desc' }]
      : sort === 'reference'
        ? { reference: order as 'asc' | 'desc' }
        : { createdAt: order as 'asc' | 'desc' };

  const where = buildClientWhere(q, type, archived);
  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      include: {
        agent: true,
        _count: { select: { sales: true, rentals: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.client.count({ where }),
  ]);
  res.json({ items: clients, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.get('/:id/history', async (req, res) => {
  const clientId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Client', entityId: clientId },
        { details: { contains: clientId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/:id/agent-history', async (req, res) => {
  const clientId = String(req.params.id);
  const history = await prisma.clientAgentHistory.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(history);
});

router.post('/:id/notify', async (req, res) => {
  const clientId = String(req.params.id);
  const { channel, subject, message } = req.body;
  if (!channel || !message) {
    return res.status(400).json({ message: 'Canal et message requis' });
  }
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return res.status(404).json({ message: 'Client introuvable' });

  let result: { simulated?: boolean; sent?: boolean } = {};
  if (channel === 'email') {
    result = await sendEmail(client.email, subject || 'GIC — Expertise & Consulting', String(message));
  } else if (channel === 'sms') {
    result = await sendSms(client.phone1, String(message));
  } else if (channel === 'whatsapp') {
    result = await sendWhatsApp(client.phone1, String(message));
  } else {
    return res.status(400).json({ message: 'Canal : email, sms ou whatsapp' });
  }

  await audit(req, `notification_${channel}`, 'Client', client.id, String(message).slice(0, 120));
  const { logConversation } = await import('../lib/conversations.js');
  await logConversation({
    entityType: 'Client',
    entityId: client.id,
    channel: channel as 'email' | 'sms' | 'whatsapp',
    subject: subject || 'GIC',
    body: String(message),
    recipient: channel === 'email' ? client.email : client.phone1,
    userId: req.user?.id,
    userName: req.user?.email,
  });
  res.json({ ok: true, ...result });
});

router.get('/:id', async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      agent: true,
      mandants: { include: { mandant: true } },
      sales: { include: { property: true, payments: true } },
      rentals: { include: { property: true, payments: true } },
      documents: true,
    },
  });
  if (!client) return res.status(404).json({ message: 'Client introuvable' });

  const allPayments = [
    ...client.sales.flatMap((s) =>
      s.payments.map((p) => ({
        ...p,
        type: 'vente',
        ref: s.reference,
        saleId: s.id,
        propertyId: s.propertyId,
        propertyName: s.property?.name || null,
        mode: p.operationType,
        reference: p.receiptNo,
      }))
    ),
    ...client.rentals.flatMap((r) =>
      r.payments.map((p) => ({
        ...p,
        type: 'location',
        ref: r.reference,
        rentalId: r.id,
        propertyId: r.propertyId,
        propertyName: r.property?.name || null,
        mode: p.operationType,
        reference: p.receiptNo,
      }))
    ),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  type ClientPropertyRow = {
    id: string;
    reference: string;
    name: string;
    status: string;
    city?: string | null;
    surface?: number | null;
    rooms?: number | null;
    price?: number | null;
    photo?: string | null;
    relation: 'achat' | 'location';
    saleId?: string;
    saleReference?: string;
    saleStatus?: string;
    rentalId?: string;
    rentalReference?: string;
    netPrice?: number;
    totalPaid?: number;
    remaining?: number;
    contractDate?: Date | string | null;
    payments?: typeof client.sales[0]['payments'];
  };

  const propertiesMap = new Map<string, ClientPropertyRow>();
  for (const s of client.sales) {
    if (!s.property) continue;
    propertiesMap.set(s.property.id, {
      id: s.property.id,
      reference: s.property.reference,
      name: s.property.name,
      status: s.property.status,
      city: s.property.city,
      surface: s.property.surface,
      rooms: s.property.rooms,
      price: s.property.price,
      photo: s.property.photo,
      relation: 'achat',
      saleId: s.id,
      saleReference: s.reference,
      saleStatus: s.status,
      netPrice: s.netPrice,
      totalPaid: s.totalPaid,
      remaining: s.remaining,
      contractDate: s.contractDate,
      payments: s.payments,
    });
  }
  for (const r of client.rentals) {
    if (!r.property) continue;
    if (propertiesMap.has(r.property.id)) continue;
    propertiesMap.set(r.property.id, {
      id: r.property.id,
      reference: r.property.reference,
      name: r.property.name,
      status: r.property.status,
      city: r.property.city,
      surface: r.property.surface,
      rooms: r.property.rooms,
      price: r.property.price,
      photo: r.property.photo,
      relation: 'location',
      rentalId: r.id,
      rentalReference: r.reference,
      totalPaid: r.totalPaid,
      contractDate: r.contractDate,
      payments: r.payments,
    });
  }

  const summary = {
    totalContracted:
      client.sales.reduce((acc, s) => acc + s.netPrice, 0) +
      client.rentals.reduce((acc, r) => acc + r.monthlyRent * 12, 0),
    totalPaid:
      client.sales.reduce((acc, s) => acc + s.totalPaid, 0) +
      client.rentals.reduce((acc, r) => acc + r.totalPaid, 0),
    totalRemaining: client.sales.reduce((acc, s) => acc + s.remaining, 0),
    salesCount: client.sales.length,
    rentalsCount: client.rentals.length,
    paymentsCount: allPayments.length,
  };

  res.json({ ...client, summary, allPayments, properties: [...propertiesMap.values()] });
});

router.post('/', async (req, res) => {
  const {
    firstName, lastName, email, phone1, phone2, address,
    identityType, identityNumber, birthDate, isProspect, isBuyer, isTenant,
    agentId, remark, source, nb,
  } = req.body;
  if (!firstName || !lastName || !email || !phone1) {
    return res.status(400).json({ message: 'Nom, prénom, email et téléphone obligatoires' });
  }
  if (identityNumber) {
    const exists = await prisma.client.findFirst({ where: { identityNumber } });
    if (exists) return res.status(400).json({ message: 'Ce numéro d\'identité existe déjà' });
  }
  const reference = await nextReference('CLI');
  const client = await prisma.client.create({
    data: {
      reference,
      firstName,
      lastName,
      email,
      phone1,
      phone2,
      address,
      identityType,
      identityNumber,
      birthDate: birthDate ? new Date(birthDate) : null,
      isProspect: isProspect ?? true,
      isBuyer: isBuyer ?? false,
      isTenant: isTenant ?? false,
      agentId: agentId || null,
      remark,
      source: source || null,
      nb: nb || null,
    },
  });
  await audit(req, 'création', 'Client', client.id, reference);
  if (client.agentId) {
    await recordClientAgentChange(client.id, null, client.agentId, req.user?.email);
  }
  const welcomeMsg = `Bonjour ${client.firstName} ${client.lastName},\n\nVotre dossier client GIC (${reference}) a été créé avec succès.\n\nExpertise & Consulting Company`;
  await sendEmail(client.email, 'Bienvenue — GIC', welcomeMsg).catch(() => {});
  res.status(201).json(client);
});

router.put('/:id', async (req, res) => {
  const clientId = String(req.params.id);
  const data = { ...req.body };
  delete data.id;
  delete data.reference;
  delete data.summary;
  delete data.allPayments;
  delete data.properties;
  if (data.birthDate) data.birthDate = new Date(data.birthDate);
  if (data.agentId === '') data.agentId = null;
  if (data.identityNumber) {
    const exists = await prisma.client.findFirst({
      where: { identityNumber: data.identityNumber, NOT: { id: clientId } },
    });
    if (exists) return res.status(400).json({ message: 'Ce numéro d\'identité existe déjà' });
  }
  const existing = await prisma.client.findUnique({ where: { id: clientId } });
  if (!existing) return res.status(404).json({ message: 'Client introuvable' });

  const client = await prisma.client.update({ where: { id: clientId }, data });
  if (existing.agentId !== client.agentId) {
    await recordClientAgentChange(client.id, existing.agentId, client.agentId, req.user?.email);
    await audit(
      req,
      'changement_agent',
      'Client',
      client.id,
      `${existing.agentId || 'aucun'} → ${client.agentId || 'aucun'}`
    );
  }
  await audit(req, 'modification', 'Client', client.id);
  res.json(client);
});

router.post('/:id/archive', async (req, res) => {
  const clientId = String(req.params.id);
  const { motif } = req.body || {};
  const client = await prisma.client.update({
    where: { id: clientId },
    data: { isArchived: true, archivedAt: new Date() },
  });
  await audit(req, 'archivage', 'Client', client.id, motif || 'Archivage manuel');
  res.json(client);
});

router.post('/:id/unarchive', async (req, res) => {
  const clientId = String(req.params.id);
  const client = await prisma.client.update({
    where: { id: clientId },
    data: { isArchived: false, archivedAt: null },
  });
  await audit(req, 'désarchivage', 'Client', client.id);
  res.json(client);
});

router.post('/:id/photo', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Photo requise' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
    return res.status(400).json({ message: 'Format photo : JPG ou PNG' });
  }
  const photo = `/uploads/${req.file.filename}`;
  const clientId = String(req.params.id);
  const client = await prisma.client.update({
    where: { id: clientId },
    data: { photo },
  });
  await audit(req, 'photo', 'Client', client.id);
  res.json(client);
});

router.post('/:id/mandants', async (req, res) => {
  const { mandantId } = req.body;
  if (!mandantId) return res.status(400).json({ message: 'mandantId requis' });
  const link = await prisma.clientMandant.upsert({
    where: { clientId_mandantId: { clientId: req.params.id, mandantId } },
    create: { clientId: req.params.id, mandantId },
    update: {},
  });
  await audit(req, 'liaison', 'ClientMandant', link.id);
  res.status(201).json(link);
});

router.delete('/:id/mandants/:mandantId', async (req, res) => {
  await prisma.clientMandant.delete({
    where: {
      clientId_mandantId: { clientId: req.params.id, mandantId: req.params.mandantId },
    },
  });
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  const { motif } = req.body || {};
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { sales: true, rentals: true },
  });
  if (!client) return res.status(404).json({ message: 'Client introuvable' });
  if (client.sales.length || client.rentals.length) {
    return res.status(400).json({
      message: 'Impossible de supprimer un client lié à une vente ou location (RG-CLI-003)',
    });
  }
  if (!motif) {
    return res.status(400).json({ message: 'Motif de suppression obligatoire' });
  }
  await prisma.client.delete({ where: { id: req.params.id } });
  await audit(req, 'suppression', 'Client', req.params.id, motif);
  res.json({ ok: true });
});

export default router;
