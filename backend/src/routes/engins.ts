import { Router } from 'express';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import { upload } from '../lib/upload.js';
import { sendExcel } from '../lib/exportExcel.js';
import {
  removeAutomaticMovement,
  syncFuelMovement,
  syncMaintenanceMovement,
} from '../lib/cashSync.js';

const router = Router();

router.post('/gps/webhook', async (req, res) => {
  const token = String(req.headers['x-gps-token'] || req.body?.token || '');
  const expected = process.env.GPS_TRACKER_TOKEN || 'gic-gps-tracker';
  if (token !== expected) return res.status(401).json({ message: 'Token GPS invalide' });

  const gpsNumber = String(req.body?.gpsNumber || req.body?.deviceId || '').trim();
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!gpsNumber || Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ message: 'gpsNumber, lat et lng requis' });
  }

  const engin = await prisma.engin.findFirst({ where: { gpsNumber } });
  if (!engin) return res.status(404).json({ message: 'Engin introuvable pour ce N° GPS' });

  const pos = await prisma.gpsPosition.create({
    data: { enginId: engin.id, lat, lng, source: 'tracker', recordedAt: new Date() },
  });
  res.status(201).json({ ok: true, enginId: engin.id, positionId: pos.id });
});

router.use(requireAuth);
router.use(requirePermission);

const ENGIN_DATE_FIELDS = [
  'gpsMountDate',
  'transferDate',
  'counterDate',
  'insuranceExpiry',
  'vignetteExpiry',
  'visitExpiry',
  'authExpiry',
];

function parseEnginDates(data: Record<string, unknown>) {
  for (const key of ENGIN_DATE_FIELDS) {
    if (data[key] !== undefined) {
      data[key] = data[key] ? new Date(String(data[key])) : null;
    }
  }
}

function parseDateRange(dateFrom?: string, dateTo?: string) {
  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo) : null;
  if (from) from.setHours(0, 0, 0, 0);
  if (to) to.setHours(23, 59, 59, 999);
  return { from, to };
}

function normalizeOwnershipType(v: unknown) {
  const s = String(v || 'personnel').trim().toLowerCase();
  return s === 'loue' || s === 'loué' || s === 'rented' ? 'loue' : 'personnel';
}

function buildEnginWhere(q: string, status: string, genre: string, alert: string, ownershipType = '') {
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);

  const alertFilter =
    alert === 'expiring'
      ? {
          OR: [
            { insuranceExpiry: { lte: in30, not: null } },
            { vignetteExpiry: { lte: in30, not: null } },
            { visitExpiry: { lte: in30, not: null } },
            { authExpiry: { lte: in30, not: null } },
          ],
        }
      : alert === 'expired'
        ? {
            OR: [
              { insuranceExpiry: { lt: now } },
              { vignetteExpiry: { lt: now } },
              { visitExpiry: { lt: now } },
              { authExpiry: { lt: now } },
            ],
          }
        : {};

  return {
    AND: [
      q
        ? {
            OR: [
              { brand: { contains: q } },
              { genre: { contains: q } },
              { matricule: { contains: q } },
              { gpsNumber: { contains: q } },
              { chassisNo: { contains: q } },
            ],
          }
        : {},
      status ? { status } : {},
      genre ? { genre } : {},
      ownershipType ? { ownershipType: normalizeOwnershipType(ownershipType) } : {},
      alertFilter,
    ],
  };
}

function buildMissionWhere(
  q: string,
  enginId: string,
  chantierId: string,
  dateFrom: string,
  dateTo: string,
  linkFilter = '',
) {
  const { from, to } = parseDateRange(dateFrom, dateTo);
  return {
    AND: [
      q
        ? {
            OR: [
              { mission: { contains: q } },
              { driverName: { contains: q } },
              { requestedBy: { contains: q } },
              { engin: { matricule: { contains: q } } },
              { engin: { brand: { contains: q } } },
            ],
          }
        : {},
      enginId ? { enginId } : {},
      chantierId ? { chantierId } : {},
      linkFilter === 'with' ? { chantierId: { not: null } } : {},
      linkFilter === 'without' ? { chantierId: null } : {},
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

async function syncEnginMissionStatus(enginId: string) {
  const count = await prisma.mission.count({ where: { enginId } });
  const engin = await prisma.engin.findUnique({ where: { id: enginId }, select: { status: true } });
  if (engin?.status === 'en_mission' && count === 0) {
    await prisma.engin.update({ where: { id: enginId }, data: { status: 'disponible' } });
  }
}

function buildMaintenanceWhere(q: string, enginId: string, dateFrom: string, dateTo: string) {
  const { from, to } = parseDateRange(dateFrom, dateTo);
  return {
    AND: [
      enginId ? { enginId } : {},
      q
        ? {
            OR: [
              { designation: { contains: q } },
              { responsible: { contains: q } },
              { supervisor: { contains: q } },
              { engin: { matricule: { contains: q } } },
              { engin: { brand: { contains: q } } },
            ],
          }
        : {},
      from || to
        ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {},
    ],
  };
}

function countPaperAlerts(engins: Array<{ insuranceExpiry: Date | null; vignetteExpiry: Date | null; visitExpiry: Date | null; authExpiry: Date | null }>) {
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);
  let expiring = 0;
  let expired = 0;
  for (const e of engins) {
    for (const d of [e.insuranceExpiry, e.vignetteExpiry, e.visitExpiry, e.authExpiry]) {
      if (!d) continue;
      if (d < now) expired += 1;
      else if (d <= in30) expiring += 1;
    }
  }
  return { expiring, expired };
}

router.get('/stats', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const genre = String(req.query.genre || '');
  const alert = String(req.query.alert || '');
  const ownershipType = String(req.query.ownershipType || '');
  const where = buildEnginWhere(q, status, genre, alert, ownershipType);

  const [total, disponibles, enMission, enMaintenance, personnel, loue, missionsTotal, maintenanceBudget, genres, filteredEngins] =
    await Promise.all([
      prisma.engin.count({ where }),
      prisma.engin.count({ where: { ...where, status: 'disponible' } }),
      prisma.engin.count({ where: { ...where, status: 'en_mission' } }),
      prisma.engin.count({ where: { ...where, status: 'en_maintenance' } }),
      prisma.engin.count({ where: { ...where, ownershipType: 'personnel' } }),
      prisma.engin.count({ where: { ...where, ownershipType: 'loue' } }),
      prisma.mission.count(),
      prisma.maintenance.aggregate({ _sum: { budget: true } }),
      prisma.engin.findMany({
        where: { genre: { not: null }, NOT: { genre: '' } },
        select: { genre: true },
        distinct: ['genre'],
        take: 20,
      }),
      prisma.engin.findMany({
        where,
        select: { insuranceExpiry: true, vignetteExpiry: true, visitExpiry: true, authExpiry: true },
      }),
    ]);
  const alerts = countPaperAlerts(filteredEngins);
  res.json({
    total,
    disponibles,
    enMission,
    enMaintenance,
    personnel,
    loue,
    missionsTotal,
    maintenanceBudget: Math.round(maintenanceBudget._sum.budget || 0),
    paperExpiring: alerts.expiring,
    paperExpired: alerts.expired,
    genres: genres.map((g) => g.genre).filter(Boolean),
  });
});

router.get('/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const genre = String(req.query.genre || '');
  const alert = String(req.query.alert || '');
  const ownershipType = String(req.query.ownershipType || '');
  const where = buildEnginWhere(q, status, genre, alert, ownershipType);

  const engins = await prisma.engin.findMany({
    where,
    orderBy: [{ matricule: 'asc' }, { brand: 'asc' }],
    include: { _count: { select: { missions: true, maintenances: true } } },
  });

  const header =
    'Matricule;Marque;Genre;Propriété;Loueur;Location mensuelle MAD;Prix achat MAD;Statut;GPS;Carburant %;Compteur;Unité;Assurance;Vignette;Visite;Autorisation;Missions;Maintenances';
  const fmt = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
  const ownershipLabel = (t?: string | null) => (t === 'loue' ? 'Loué' : 'Personnel');
  const rows = engins.map((e) =>
    [
      e.matricule || '',
      e.brand || '',
      e.genre || '',
      ownershipLabel(e.ownershipType),
      e.rentalSupplier || '',
      e.rentalMonthly ?? '',
      e.purchasePrice ?? '',
      e.status,
      e.gpsNumber || '',
      e.fuelLevel ?? '',
      e.counterValue ?? '',
      e.counterUnit || '',
      fmt(e.insuranceExpiry),
      fmt(e.vignetteExpiry),
      fmt(e.visitExpiry),
      fmt(e.authExpiry),
      e._count.missions,
      e._count.maintenances,
    ].join(';')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=engins-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const genre = String(req.query.genre || '');
  const alert = String(req.query.alert || '');
  const ownershipType = String(req.query.ownershipType || '');
  const where = buildEnginWhere(q, status, genre, alert, ownershipType);

  const engins = await prisma.engin.findMany({
    where,
    orderBy: [{ matricule: 'asc' }, { brand: 'asc' }],
    include: { _count: { select: { missions: true, maintenances: true } } },
    take: 5000,
  });

  const ownershipLabel = (t?: string | null) => (t === 'loue' ? 'Loué' : 'Personnel');
  const fmt = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

  sendExcel(
    res,
    'engins-gic.xlsx',
    'Engins',
    engins.map((e) => ({
      Matricule: e.matricule || '',
      Marque: e.brand || '',
      Genre: e.genre || '',
      Propriété: ownershipLabel(e.ownershipType),
      Loueur: e.rentalSupplier || '',
      'Location MAD/mois': e.rentalMonthly ?? '',
      'Prix achat MAD': e.purchasePrice ?? '',
      Statut: e.status,
      GPS: e.gpsNumber || '',
      'Carburant %': e.fuelLevel ?? '',
      Compteur: e.counterValue ?? '',
      Unité: e.counterUnit || '',
      Assurance: fmt(e.insuranceExpiry),
      Vignette: fmt(e.vignetteExpiry),
      Visite: fmt(e.visitExpiry),
      Autorisation: fmt(e.authExpiry),
      Missions: e._count.missions,
      Maintenances: e._count.maintenances,
    }))
  );
});

router.get('/list', async (_req, res) => {
  res.json(
    await prisma.engin.findMany({
      orderBy: [{ matricule: 'asc' }, { brand: 'asc' }],
      select: { id: true, brand: true, genre: true, matricule: true, status: true },
    })
  );
});

router.get('/missions/stats', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const enginId = String(req.query.enginId || '');
  const chantierId = String(req.query.chantierId || '');
  const linkFilter = String(req.query.linkFilter || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const where = buildMissionWhere(q, enginId, chantierId, dateFrom, dateTo, linkFilter);

  const [total, withChantier] = await Promise.all([
    prisma.mission.count({ where }),
    prisma.mission.count({ where: { ...where, chantierId: { not: null } } }),
  ]);
  res.json({ total, withChantier, withoutChantier: total - withChantier });
});

router.get('/missions/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const enginId = String(req.query.enginId || '');
  const chantierId = String(req.query.chantierId || '');
  const linkFilter = String(req.query.linkFilter || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const where = buildMissionWhere(q, enginId, chantierId, dateFrom, dateTo, linkFilter);

  const missions = await prisma.mission.findMany({
    where,
    orderBy: { date: 'desc' },
    include: { engin: true, chantier: true },
  });

  const header = 'Date;Engin;Matricule;Mission;Chauffeur;Chantier;Usage;Demandé par';
  const rows = missions.map((m) =>
    [
      m.date.toISOString().slice(0, 10),
      m.engin?.brand || '',
      m.engin?.matricule || '',
      m.mission,
      m.driverName || '',
      m.chantier?.name || '',
      m.usage || '',
      m.requestedBy || '',
    ].join(';')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=missions-engins-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/missions/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const enginId = String(req.query.enginId || '');
  const chantierId = String(req.query.chantierId || '');
  const linkFilter = String(req.query.linkFilter || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const where = buildMissionWhere(q, enginId, chantierId, dateFrom, dateTo, linkFilter);

  const missions = await prisma.mission.findMany({
    where,
    orderBy: { date: 'desc' },
    include: { engin: true, chantier: true },
    take: 5000,
  });

  sendExcel(
    res,
    'missions-engins-gic.xlsx',
    'Missions',
    missions.map((m) => ({
      Date: m.date.toISOString().slice(0, 10),
      Engin: m.engin?.brand || '',
      Matricule: m.engin?.matricule || '',
      Mission: m.mission,
      Chauffeur: m.driverName || '',
      Chantier: m.chantier?.name || '',
      Usage: m.usage || '',
      'Demandé par': m.requestedBy || '',
    }))
  );
});

router.get('/missions/all', async (_req, res) => {
  res.json(
    await prisma.mission.findMany({
      include: { engin: true, chantier: true },
      orderBy: { date: 'desc' },
      take: 500,
    })
  );
});

router.get('/missions', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const enginId = String(req.query.enginId || '');
  const chantierId = String(req.query.chantierId || '');
  const linkFilter = String(req.query.linkFilter || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const sort = String(req.query.sort || 'date');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const where = buildMissionWhere(q, enginId, chantierId, dateFrom, dateTo, linkFilter);

  const orderBy =
    sort === 'mission'
      ? { mission: order as 'asc' | 'desc' }
      : sort === 'driverName'
        ? { driverName: order as 'asc' | 'desc' }
        : { date: order as 'asc' | 'desc' };

  const [items, total] = await Promise.all([
    prisma.mission.findMany({
      where,
      include: {
        engin: { select: { id: true, brand: true, matricule: true, status: true } },
        chantier: { select: { id: true, name: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.mission.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.post('/missions', async (req, res) => {
  const mission = await prisma.mission.create({
    data: {
      enginId: req.body.enginId,
      date: req.body.date ? new Date(req.body.date) : new Date(),
      driverName: req.body.driverName || null,
      mission: req.body.mission,
      usage: req.body.usage || null,
      chantierId: req.body.chantierId || null,
      tranche: req.body.tranche ? String(req.body.tranche).trim() : null,
      requestedBy: req.body.requestedBy || null,
      remark: req.body.remark || null,
    },
    include: { engin: true, chantier: true },
  });
  await prisma.engin.update({ where: { id: req.body.enginId }, data: { status: 'en_mission' } });
  await audit(req, 'création', 'Mission', mission.id, mission.mission);
  res.status(201).json(mission);
});

router.get('/missions/:id', async (req, res) => {
  const mission = await prisma.mission.findUnique({
    where: { id: String(req.params.id) },
    include: {
      engin: { select: { id: true, brand: true, matricule: true, status: true, genre: true } },
      chantier: { select: { id: true, name: true } },
    },
  });
  if (!mission) return res.status(404).json({ message: 'Mission introuvable' });

  const documents = await prisma.document.findMany({
    where: { entityType: 'Mission', entityId: mission.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ ...mission, documents });
});

router.put('/missions/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.mission.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Mission introuvable' });

  const data: Record<string, unknown> = {};
  if (req.body.date) data.date = new Date(req.body.date);
  if (req.body.mission != null) data.mission = String(req.body.mission).trim();
  if (req.body.driverName !== undefined) data.driverName = req.body.driverName ? String(req.body.driverName).trim() : null;
  if (req.body.usage !== undefined) data.usage = req.body.usage ? String(req.body.usage).trim() : null;
  if (req.body.chantierId !== undefined) data.chantierId = req.body.chantierId || null;
  if (req.body.tranche !== undefined) data.tranche = req.body.tranche ? String(req.body.tranche).trim() : null;
  if (req.body.requestedBy !== undefined) data.requestedBy = req.body.requestedBy ? String(req.body.requestedBy).trim() : null;
  if (req.body.remark !== undefined) data.remark = req.body.remark ? String(req.body.remark).trim() : null;

  const previousEnginId = existing.enginId;
  let newEnginId = previousEnginId;
  if (req.body.enginId && req.body.enginId !== previousEnginId) {
    newEnginId = String(req.body.enginId);
    data.enginId = newEnginId;
  }

  const mission = await prisma.mission.update({
    where: { id },
    data,
    include: {
      engin: { select: { id: true, brand: true, matricule: true, status: true, genre: true } },
      chantier: { select: { id: true, name: true } },
    },
  });

  if (newEnginId !== previousEnginId) {
    await prisma.engin.update({ where: { id: newEnginId }, data: { status: 'en_mission' } });
    await syncEnginMissionStatus(previousEnginId);
  }

  await audit(req, 'modification', 'Mission', id, mission.mission);
  res.json(mission);
});

router.delete('/missions/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const mission = await prisma.mission.findUnique({ where: { id } });
  if (!mission) return res.status(404).json({ message: 'Mission introuvable' });

  await prisma.document.deleteMany({ where: { entityType: 'Mission', entityId: id } });
  await prisma.mission.delete({ where: { id } });
  await syncEnginMissionStatus(mission.enginId);
  await audit(req, 'suppression', 'Mission', id, motif);
  res.json({ ok: true });
});

router.get('/missions/:id/history', async (req, res) => {
  const id = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Mission', entityId: id },
        { details: { contains: id } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.post('/missions/:id/documents', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
  const missionId = String(req.params.id);
  const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { id: true, mission: true } });
  if (!mission) return res.status(404).json({ message: 'Mission introuvable' });

  const doc = await prisma.document.create({
    data: {
      name: req.body.name || req.file.originalname,
      category: req.body.category || 'mission',
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/${req.file.filename}`,
      entityType: 'Mission',
      entityId: missionId,
    },
  });
  await audit(req, 'upload', 'Mission', missionId, doc.name);
  res.status(201).json(doc);
});

router.delete('/missions/:id/documents/:docId', async (req, res) => {
  const missionId = String(req.params.id);
  const docId = String(req.params.docId);
  const doc = await prisma.document.findFirst({
    where: { id: docId, entityType: 'Mission', entityId: missionId },
  });
  if (!doc) return res.status(404).json({ message: 'Document introuvable' });
  await prisma.document.delete({ where: { id: docId } });
  await audit(req, 'suppression', 'Document', docId, doc.name);
  res.json({ ok: true });
});

router.get('/maintenances/stats', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const enginId = String(req.query.enginId || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const where = buildMaintenanceWhere(q, enginId, dateFrom, dateTo);

  const [total, budgetAgg, enginsEnMaint] = await Promise.all([
    prisma.maintenance.count({ where }),
    prisma.maintenance.aggregate({ where, _sum: { budget: true } }),
    prisma.engin.count({ where: { status: 'en_maintenance' } }),
  ]);
  res.json({
    total,
    budgetTotal: Math.round(budgetAgg._sum.budget || 0),
    enginsEnMaintenance: enginsEnMaint,
  });
});

router.get('/maintenances/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const enginId = String(req.query.enginId || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const where = buildMaintenanceWhere(q, enginId, dateFrom, dateTo);

  const items = await prisma.maintenance.findMany({
    where,
    include: { engin: { select: { brand: true, matricule: true } } },
    orderBy: { date: 'desc' },
  });
  const header = 'Date;Engin;Matricule;Désignation;Budget;Responsable;Superviseur';
  const rows = items.map((m) =>
    [
      m.date.toISOString().slice(0, 10),
      m.engin.brand || '',
      m.engin.matricule || '',
      m.designation,
      m.budget || 0,
      m.responsible || '',
      m.supervisor || '',
    ].join(';')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=maintenances-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/maintenances/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const enginId = String(req.query.enginId || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const where = buildMaintenanceWhere(q, enginId, dateFrom, dateTo);

  const items = await prisma.maintenance.findMany({
    where,
    include: { engin: { select: { brand: true, matricule: true } } },
    orderBy: { date: 'desc' },
    take: 5000,
  });

  sendExcel(
    res,
    'maintenances-gic.xlsx',
    'Maintenances',
    items.map((m) => ({
      Date: m.date.toISOString().slice(0, 10),
      Engin: m.engin.brand || '',
      Matricule: m.engin.matricule || '',
      Désignation: m.designation,
      Budget: m.budget || 0,
      Responsable: m.responsible || '',
      Superviseur: m.supervisor || '',
    }))
  );
});

router.get('/maintenances', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const enginId = String(req.query.enginId || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const sort = String(req.query.sort || 'date');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const where = buildMaintenanceWhere(q, enginId, dateFrom, dateTo);

  const orderBy =
    sort === 'designation'
      ? { designation: order as 'asc' | 'desc' }
      : sort === 'budget'
        ? { budget: order as 'asc' | 'desc' }
        : { date: order as 'asc' | 'desc' };

  const [items, total, budgetAgg] = await Promise.all([
    prisma.maintenance.findMany({
      where,
      include: {
        engin: { select: { id: true, brand: true, matricule: true, status: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.maintenance.count({ where }),
    prisma.maintenance.aggregate({ where, _sum: { budget: true } }),
  ]);
  res.json({
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    budgetTotal: Math.round(budgetAgg._sum.budget || 0),
  });
});

router.get('/maintenances/:id', async (req, res) => {
  const maintenance = await prisma.maintenance.findUnique({
    where: { id: String(req.params.id) },
    include: {
      engin: { select: { id: true, brand: true, matricule: true, status: true, genre: true } },
    },
  });
  if (!maintenance) return res.status(404).json({ message: 'Maintenance introuvable' });

  const documents = await prisma.document.findMany({
    where: { entityType: 'Maintenance', entityId: maintenance.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ ...maintenance, documents });
});

router.put('/maintenances/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.maintenance.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Maintenance introuvable' });

  const data: Record<string, unknown> = {};
  if (req.body.date) data.date = new Date(req.body.date);
  if (req.body.designation != null) data.designation = String(req.body.designation).trim();
  if (req.body.responsible !== undefined) data.responsible = req.body.responsible ? String(req.body.responsible).trim() : null;
  if (req.body.supervisor !== undefined) data.supervisor = req.body.supervisor ? String(req.body.supervisor).trim() : null;
  if (req.body.budget !== undefined) data.budget = req.body.budget != null && req.body.budget !== '' ? Number(req.body.budget) : null;
  if (req.body.counterValue !== undefined) data.counterValue = req.body.counterValue != null && req.body.counterValue !== '' ? Number(req.body.counterValue) : null;
  if (req.body.remark !== undefined) data.remark = req.body.remark ? String(req.body.remark).trim() : null;

  const maintenance = await prisma.maintenance.update({
    where: { id },
    data,
    include: { engin: { select: { id: true, brand: true, matricule: true, status: true, genre: true } } },
  });
  await syncMaintenanceMovement(maintenance, req);
  await audit(req, 'modification', 'Maintenance', id, maintenance.designation);
  res.json(maintenance);
});

router.delete('/maintenances/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const maintenance = await prisma.maintenance.findUnique({ where: { id } });
  if (!maintenance) return res.status(404).json({ message: 'Maintenance introuvable' });

  await prisma.document.deleteMany({ where: { entityType: 'Maintenance', entityId: id } });
  await removeAutomaticMovement('maintenance', id);
  await prisma.maintenance.delete({ where: { id } });
  await audit(req, 'suppression', 'Maintenance', id, motif);
  res.json({ ok: true });
});

router.get('/maintenances/:id/history', async (req, res) => {
  const id = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Maintenance', entityId: id },
        { details: { contains: id } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.post('/maintenances/:id/documents', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
  const maintenanceId = String(req.params.id);
  const maintenance = await prisma.maintenance.findUnique({ where: { id: maintenanceId }, select: { id: true, designation: true } });
  if (!maintenance) return res.status(404).json({ message: 'Maintenance introuvable' });

  const doc = await prisma.document.create({
    data: {
      name: req.body.name || req.file.originalname,
      category: req.body.category || 'maintenance',
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/${req.file.filename}`,
      entityType: 'Maintenance',
      entityId: maintenanceId,
    },
  });
  await audit(req, 'upload', 'Maintenance', maintenanceId, doc.name);
  res.status(201).json(doc);
});

router.delete('/maintenances/:id/documents/:docId', async (req, res) => {
  const maintenanceId = String(req.params.id);
  const docId = String(req.params.docId);
  const doc = await prisma.document.findFirst({
    where: { id: docId, entityType: 'Maintenance', entityId: maintenanceId },
  });
  if (!doc) return res.status(404).json({ message: 'Document introuvable' });
  await prisma.document.delete({ where: { id: docId } });
  await audit(req, 'suppression', 'Document', docId, doc.name);
  res.json({ ok: true });
});

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const genre = String(req.query.genre || '');
  const alert = String(req.query.alert || '');
  const ownershipType = String(req.query.ownershipType || '');
  const sort = String(req.query.sort || 'matricule');
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const where = buildEnginWhere(q, status, genre, alert, ownershipType);

  const orderBy =
    sort === 'brand'
      ? { brand: order as 'asc' | 'desc' }
      : sort === 'status'
        ? { status: order as 'asc' | 'desc' }
        : sort === 'createdAt'
          ? { createdAt: order as 'asc' | 'desc' }
          : sort === 'fuelLevel'
            ? { fuelLevel: order as 'asc' | 'desc' }
            : { matricule: order as 'asc' | 'desc' };

  const [items, total] = await Promise.all([
    prisma.engin.findMany({
      where,
      include: { _count: { select: { missions: true, maintenances: true } } },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.engin.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

function parseEnginNumbers(data: Record<string, unknown>) {
  for (const key of ['fuelLevel', 'counterValue', 'purchasePrice', 'rentalMonthly', 'emptyWeight', 'totalWeight']) {
    if (data[key] !== undefined) data[key] = data[key] === '' || data[key] == null ? null : Number(data[key]);
  }
}

function applyOwnershipRules(data: Record<string, unknown>) {
  data.ownershipType = normalizeOwnershipType(data.ownershipType);
  if (data.ownershipType === 'loue') {
    data.purchasePrice = null;
  } else {
    data.rentalSupplier = null;
    data.rentalMonthly = null;
  }
}

router.post('/', async (req, res) => {
  const data = { ...req.body };
  parseEnginDates(data);
  parseEnginNumbers(data);
  applyOwnershipRules(data);
  const engin = await prisma.engin.create({ data });
  await audit(req, 'création', 'Engin', engin.id, `${engin.matricule || ''} ${engin.brand || ''}`.trim());
  res.status(201).json(engin);
});

router.get('/:id/maintenances', async (req, res) => {
  res.json(
    await prisma.maintenance.findMany({
      where: { enginId: req.params.id },
      orderBy: { date: 'desc' },
    })
  );
});

router.post('/:id/maintenances', async (req, res) => {
  const enginId = String(req.params.id);
  const maintenance = await prisma.maintenance.create({
    data: {
      enginId,
      date: req.body.date ? new Date(req.body.date) : new Date(),
      responsible: req.body.responsible || null,
      supervisor: req.body.supervisor || null,
      designation: req.body.designation,
      budget: req.body.budget ? Number(req.body.budget) : null,
      counterValue: req.body.counterValue ? Number(req.body.counterValue) : null,
      remark: req.body.remark || null,
    },
    include: { engin: { select: { brand: true, matricule: true } } },
  });
  await prisma.engin.update({ where: { id: enginId }, data: { status: 'en_maintenance' } });
  await syncMaintenanceMovement(maintenance, req);
  await audit(req, 'création', 'Maintenance', maintenance.id, maintenance.designation);
  res.status(201).json(maintenance);
});

router.get('/:id/history', async (req, res) => {
  const enginId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Engin', entityId: enginId },
        { entity: 'Maintenance', details: { contains: enginId } },
        { entity: 'Mission', details: { contains: enginId } },
        { details: { contains: enginId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/:id/fuel', async (req, res) => {
  const enginId = String(req.params.id);
  const items = await prisma.fuelLog.findMany({
    where: { enginId },
    orderBy: { date: 'desc' },
    take: 100,
  });
  res.json({ items });
});

router.post('/:id/fuel', async (req, res) => {
  const enginId = String(req.params.id);
  const { liters, cost, counterValue, remark, date } = req.body;
  if (liters == null) return res.status(400).json({ message: 'Litres requis' });
  const engin = await prisma.engin.findUnique({
    where: { id: enginId },
    select: { brand: true, matricule: true },
  });
  const log = await prisma.fuelLog.create({
    data: {
      enginId,
      liters: Number(liters),
      cost: cost != null ? Number(cost) : null,
      counterValue: counterValue != null ? Number(counterValue) : null,
      remark: remark || null,
      date: date ? new Date(date) : new Date(),
    },
  });
  if (counterValue != null) {
    await prisma.engin.update({
      where: { id: enginId },
      data: { counterValue: Number(counterValue), counterDate: new Date(), fuelLevel: Number(liters) },
    });
  }
  await syncFuelMovement({ ...log, engin }, req);
  await audit(req, 'carburant', 'Engin', enginId, `${liters} L`);
  res.status(201).json(log);
});

router.get('/:id/gps', async (req, res) => {
  const enginId = String(req.params.id);
  const [latest, history] = await Promise.all([
    prisma.gpsPosition.findFirst({ where: { enginId }, orderBy: { recordedAt: 'desc' } }),
    prisma.gpsPosition.findMany({ where: { enginId }, orderBy: { recordedAt: 'desc' }, take: 50 }),
  ]);
  res.json({ latest, history });
});

router.post('/:id/gps', async (req, res) => {
  const enginId = String(req.params.id);
  const { lat, lng, source } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ message: 'Latitude et longitude requises' });
  const pos = await prisma.gpsPosition.create({
    data: {
      enginId,
      lat: Number(lat),
      lng: Number(lng),
      source: source || 'manual',
    },
  });
  await audit(req, 'gps', 'Engin', enginId, `${lat}, ${lng}`);
  res.status(201).json(pos);
});

router.get('/:id', async (req, res) => {
  const engin = await prisma.engin.findUnique({
    where: { id: String(req.params.id) },
    include: {
      missions: {
        orderBy: { date: 'desc' },
        take: 20,
        include: { chantier: { select: { id: true, name: true } } },
      },
      maintenances: { orderBy: { date: 'desc' }, take: 20 },
      documents: { orderBy: { createdAt: 'desc' }, take: 10 },
      _count: { select: { missions: true, maintenances: true, documents: true } },
    },
  });
  if (!engin) return res.status(404).json({ message: 'Engin introuvable' });
  res.json(engin);
});

router.post('/:id/photo', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Photo requise' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return res.status(400).json({ message: 'Format photo : JPG, PNG ou WebP' });
  }
  const photo = `/uploads/${req.file.filename}`;
  const engin = await prisma.engin.update({
    where: { id: String(req.params.id) },
    data: { photo },
  });
  await audit(req, 'photo', 'Engin', engin.id, `${engin.matricule || ''} ${engin.brand || ''}`.trim());
  res.json(engin);
});

router.delete('/:id/photo', async (req, res) => {
  const engin = await prisma.engin.update({
    where: { id: String(req.params.id) },
    data: { photo: null },
  });
  await audit(req, 'photo', 'Engin', engin.id, 'suppression photo');
  res.json(engin);
});

router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const data = { ...req.body };
  delete data.id;
  delete data._count;
  delete data.missions;
  delete data.maintenances;
  delete data.documents;
  parseEnginDates(data);
  parseEnginNumbers(data);
  if (data.ownershipType !== undefined) applyOwnershipRules(data);
  const engin = await prisma.engin.update({ where: { id }, data });
  await audit(req, 'modification', 'Engin', id, `${engin.matricule || ''} ${engin.brand || ''}`.trim());
  res.json(engin);
});

router.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const [missions, maintenances] = await Promise.all([
    prisma.mission.count({ where: { enginId: id } }),
    prisma.maintenance.count({ where: { enginId: id } }),
  ]);
  if (missions > 0 || maintenances > 0) {
    return res.status(400).json({
      message: `Engin lié à ${missions} mission(s) et ${maintenances} maintenance(s) — suppression impossible`,
    });
  }

  const engin = await prisma.engin.findUnique({ where: { id } });
  await prisma.engin.delete({ where: { id } });
  await audit(req, 'suppression', 'Engin', id, motif);
  res.json({ ok: true, label: `${engin?.matricule || ''} ${engin?.brand || ''}`.trim() });
});

export default router;
