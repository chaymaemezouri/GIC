import { Router } from 'express';
import type { Prisma } from '@prisma/client';
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
import { CHAUFFEUR_CATEGORY } from '../lib/workforceScope.js';
import { nextReference } from '../lib/references.js';
import { ownedDelta, stockSnapshot } from '../lib/materielStock.js';
import {
  ENGIN_KINDS,
  ENGIN_STATUSES,
  MAINTENANCE_KINDS,
  MAINTENANCE_TYPES,
  RENTAL_UNITS,
  DEPRECIATION_METHODS,
  annualDepreciation,
  depreciationDailyAt,
  enginLabel as fleetLabel,
  isAssignmentActive,
  netBookValue,
  refreshEnginStatus,
  rentalDailyRate,
  round2,
  todayUtc,
} from '../lib/enginCosts.js';
import enginFleetRoutes, { buildFuelData, parseAllocation } from './enginFleet.js';

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
router.use(enginFleetRoutes);

const ENGIN_DATE_FIELDS = [
  'gpsMountDate',
  'transferDate',
  'counterDate',
  'insuranceExpiry',
  'vignetteExpiry',
  'visitExpiry',
  'authExpiry',
  'commissioningDate',
  'acquisitionDate',
  'rentalStart',
  'rentalEnd',
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

function buildEnginWhere(q: string, status: string, genre: string, alert: string, ownershipType = '', kind = '') {
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);

  const alertFilter =
    alert === 'expiring'
      ? {
          OR: [
            { insuranceExpiry: { gte: now, lte: in30 } },
            { vignetteExpiry: { gte: now, lte: in30 } },
            { visitExpiry: { gte: now, lte: in30 } },
            { authExpiry: { gte: now, lte: in30 } },
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
              { code: { contains: q } },
              { designation: { contains: q } },
              { model: { contains: q } },
              { brand: { contains: q } },
              { genre: { contains: q } },
              { matricule: { contains: q } },
              { gpsNumber: { contains: q } },
              { chassisNo: { contains: q } },
              { location: { contains: q } },
            ],
          }
        : {},
      status === 'affecte' ? { status: { in: ['affecte', 'en_utilisation'] } } : status ? { status } : {},
      genre ? { genre } : {},
      ownershipType ? { ownershipType: normalizeOwnershipType(ownershipType) } : {},
      kind ? { kind } : {},
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
  if (engin?.status === 'en_utilisation' && count === 0) {
    await prisma.engin.update({ where: { id: enginId }, data: { status: 'disponible' } });
    await refreshEnginStatus(enginId);
  }
}

function buildMaintenanceWhere(q: string, enginId: string, dateFrom: string, dateTo: string, kind = '', chantierId = '') {
  const { from, to } = parseDateRange(dateFrom, dateTo);
  return {
    AND: [
      enginId ? { enginId } : {},
      kind ? { kind } : {},
      chantierId ? { chantierId } : {},
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
  const where = buildEnginWhere(q, status, genre, alert, ownershipType, String(req.query.kind || ''));

  const [total, disponibles, enMission, enMaintenance, personnel, loue, missionsTotal, maintenanceBudget, genres, filteredEngins, horsService, materiels] =
    await Promise.all([
      prisma.engin.count({ where }),
      prisma.engin.count({ where: { ...where, status: 'disponible' } }),
      prisma.engin.count({ where: { ...where, status: { in: ['affecte', 'en_utilisation'] } } }),
      prisma.engin.count({ where: { ...where, status: { in: ['en_maintenance', 'en_reparation'] } } }),
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
      prisma.engin.count({ where: { ...where, status: 'hors_service' } }),
      prisma.engin.count({ where: { ...where, kind: 'materiel' } }),
    ]);
  const alerts = countPaperAlerts(filteredEngins);
  res.json({
    total,
    disponibles,
    enMission,
    affectes: enMission,
    enMaintenance,
    horsService,
    materiels,
    enginsCount: total - materiels,
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
  const where = buildEnginWhere(q, status, genre, alert, ownershipType, String(req.query.kind || ''));

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
  const where = buildEnginWhere(q, status, genre, alert, ownershipType, String(req.query.kind || ''));

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
      orderBy: [{ code: 'asc' }, { matricule: 'asc' }, { brand: 'asc' }],
      select: {
        id: true,
        code: true,
        designation: true,
        kind: true,
        ownershipType: true,
        brand: true,
        genre: true,
        model: true,
        matricule: true,
        status: true,
        photo: true,
        counterUnit: true,
        counterValue: true,
        driverAssignments: {
          where: { endDate: null },
          take: 1,
          select: { id: true, workforce: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
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
  await prisma.engin.update({ where: { id: req.body.enginId }, data: { status: 'en_utilisation' } });
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
    await prisma.engin.update({ where: { id: newEnginId }, data: { status: 'en_utilisation' } });
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
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      feeAmount: req.body.feeAmount ? Number(req.body.feeAmount) : null,
      estimatedStartDate: req.body.estimatedStartDate ? new Date(req.body.estimatedStartDate) : null,
      estimatedEndDate: req.body.estimatedEndDate ? new Date(req.body.estimatedEndDate) : null,
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
  const where = buildMaintenanceWhere(q, enginId, dateFrom, dateTo, String(req.query.kind || ''), String(req.query.chantierId || ''));

  const [total, budgetAgg, enginsEnMaint, enginsEnRep] = await Promise.all([
    prisma.maintenance.count({ where }),
    prisma.maintenance.aggregate({ where, _sum: { budget: true, downtimeDays: true, partsCost: true, laborCost: true } }),
    prisma.engin.count({ where: { status: 'en_maintenance' } }),
    prisma.engin.count({ where: { status: 'en_reparation' } }),
  ]);
  res.json({
    total,
    budgetTotal: Math.round(budgetAgg._sum.budget || 0),
    downtimeDays: budgetAgg._sum.downtimeDays || 0,
    partsCost: Math.round(budgetAgg._sum.partsCost || 0),
    laborCost: Math.round(budgetAgg._sum.laborCost || 0),
    enginsEnMaintenance: enginsEnMaint,
    enginsEnReparation: enginsEnRep,
  });
});

router.get('/maintenances/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const enginId = String(req.query.enginId || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const where = buildMaintenanceWhere(q, enginId, dateFrom, dateTo, String(req.query.kind || ''), String(req.query.chantierId || ''));

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
  const where = buildMaintenanceWhere(q, enginId, dateFrom, dateTo, String(req.query.kind || ''), String(req.query.chantierId || ''));

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
  const where = buildMaintenanceWhere(q, enginId, dateFrom, dateTo, String(req.query.kind || ''), String(req.query.chantierId || ''));

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
        engin: { select: { id: true, code: true, designation: true, genre: true, brand: true, matricule: true, status: true, kind: true } },
        chantier: { select: { id: true, name: true } },
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

  const built = await buildMaintenanceData(req.body, existing);
  if ('error' in built) return res.status(400).json({ message: built.error });

  const maintenance = await prisma.maintenance.update({
    where: { id },
    data: built.data,
    include: { engin: { select: { id: true, brand: true, matricule: true, status: true, genre: true } } },
  });
  await syncMaintenanceMovement({ ...maintenance, engin: { brand: maintenance.engin.brand || '', matricule: maintenance.engin.matricule || '' } }, req);
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
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      feeAmount: req.body.feeAmount ? Number(req.body.feeAmount) : null,
      estimatedStartDate: req.body.estimatedStartDate ? new Date(req.body.estimatedStartDate) : null,
      estimatedEndDate: req.body.estimatedEndDate ? new Date(req.body.estimatedEndDate) : null,
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

// --- Affectations chauffeur ↔ véhicule (historisées) ---
const driverAssignmentInclude = {
  workforce: {
    select: { id: true, reference: true, firstName: true, lastName: true, phone1: true, photo: true, category: true },
  },
  engin: { select: { id: true, brand: true, genre: true, matricule: true, status: true, photo: true } },
} as const;

function enginLabel(e: { brand?: string | null; genre?: string | null; matricule?: string | null }) {
  return [e.matricule, e.brand, e.genre].filter(Boolean).join(' — ') || 'Engin';
}

router.get('/driver-assignments', async (req, res) => {
  const workforceId = String(req.query.workforceId || '').trim();
  const enginId = String(req.query.enginId || '').trim();
  const current = String(req.query.current || '') === 'true';
  res.json(
    await prisma.driverAssignment.findMany({
      where: {
        ...(workforceId ? { workforceId } : {}),
        ...(enginId ? { enginId } : {}),
        ...(current ? { endDate: null } : {}),
      },
      include: driverAssignmentInclude,
      orderBy: { startDate: 'desc' },
      take: 500,
    }),
  );
});

router.post('/driver-assignments', async (req, res) => {
  const workforceId = String(req.body.workforceId || '').trim();
  const enginId = String(req.body.enginId || '').trim();
  if (!workforceId || !enginId) return res.status(400).json({ message: 'Chauffeur et véhicule requis' });
  const [driver, engin] = await Promise.all([
    prisma.workforce.findUnique({ where: { id: workforceId } }),
    prisma.engin.findUnique({ where: { id: enginId } }),
  ]);
  if (!driver) return res.status(404).json({ message: 'Chauffeur introuvable' });
  if (!engin) return res.status(404).json({ message: 'Véhicule introuvable' });
  if (driver.category !== CHAUFFEUR_CATEGORY) {
    return res.status(400).json({ message: `${driver.firstName} ${driver.lastName} n'est pas enregistré comme chauffeur` });
  }
  if (!driver.isActive) return res.status(400).json({ message: 'Chauffeur inactif' });
  const startDate = req.body.startDate ? new Date(String(req.body.startDate)) : new Date();
  if (Number.isNaN(startDate.getTime())) return res.status(400).json({ message: 'Date invalide' });

  const same = await prisma.driverAssignment.findFirst({ where: { workforceId, enginId, endDate: null } });
  if (same) return res.status(400).json({ message: 'Ce chauffeur est déjà affecté à ce véhicule' });

  const open = await prisma.driverAssignment.findMany({
    where: { endDate: null, OR: [{ enginId }, { workforceId }] },
  });
  const tooLate = open.find((a) => a.startDate.getTime() > startDate.getTime());
  if (tooLate) {
    return res.status(400).json({
      message: "La date d'affectation doit être postérieure au début de l'affectation en cours",
    });
  }
  const created = await prisma.$transaction(async (tx) => {
    if (open.length) {
      await tx.driverAssignment.updateMany({
        where: { id: { in: open.map((a) => a.id) } },
        data: { endDate: startDate },
      });
    }
    return tx.driverAssignment.create({
      data: {
        workforceId,
        enginId,
        startDate,
        remark: req.body.remark ? String(req.body.remark).trim() : null,
      },
      include: driverAssignmentInclude,
    });
  });
  await audit(
    req,
    'affectation',
    'Engin',
    enginId,
    `${driver.firstName} ${driver.lastName} → ${enginLabel(engin)} (${workforceId})`,
  );
  await audit(req, 'affectation véhicule', 'Workforce', workforceId, `Véhicule : ${enginLabel(engin)}`);
  res.status(201).json(created);
});

router.put('/driver-assignments/:id/end', async (req, res) => {
  const id = String(req.params.id);
  const a = await prisma.driverAssignment.findUnique({ where: { id }, include: driverAssignmentInclude });
  if (!a) return res.status(404).json({ message: 'Affectation introuvable' });
  if (a.endDate) return res.status(400).json({ message: 'Affectation déjà terminée' });
  const endDate = req.body.endDate ? new Date(String(req.body.endDate)) : new Date();
  if (Number.isNaN(endDate.getTime())) return res.status(400).json({ message: 'Date invalide' });
  if (endDate.getTime() < a.startDate.getTime()) {
    return res.status(400).json({ message: "La date de fin doit être postérieure à la date d'affectation" });
  }
  const updated = await prisma.driverAssignment.update({
    where: { id },
    data: { endDate },
    include: driverAssignmentInclude,
  });
  await audit(
    req,
    'désaffectation',
    'Engin',
    a.enginId,
    `${a.workforce.firstName} ${a.workforce.lastName} — ${enginLabel(a.engin)} (${a.workforceId})`,
  );
  await audit(req, 'fin affectation véhicule', 'Workforce', a.workforceId, `Véhicule : ${enginLabel(a.engin)}`);
  res.json(updated);
});

router.delete('/driver-assignments/:id', async (req, res) => {
  const id = String(req.params.id);
  const a = await prisma.driverAssignment.findUnique({ where: { id }, include: driverAssignmentInclude });
  if (!a) return res.status(404).json({ message: 'Affectation introuvable' });
  await prisma.driverAssignment.delete({ where: { id } });
  await audit(
    req,
    'suppression',
    'DriverAssignment',
    id,
    `${a.workforce.firstName} ${a.workforce.lastName} — ${enginLabel(a.engin)} (${a.workforceId}, ${a.enginId})`,
  );
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
  const where = buildEnginWhere(q, status, genre, alert, ownershipType, String(req.query.kind || ''));

  const orderBy =
    sort === 'brand'
      ? { brand: order as 'asc' | 'desc' }
      : sort === 'status'
        ? { status: order as 'asc' | 'desc' }
        : sort === 'createdAt'
          ? { createdAt: order as 'asc' | 'desc' }
          : sort === 'fuelLevel'
            ? { fuelLevel: order as 'asc' | 'desc' }
            : sort === 'code'
              ? { code: order as 'asc' | 'desc' }
              : sort === 'designation'
                ? { designation: order as 'asc' | 'desc' }
                : { matricule: order as 'asc' | 'desc' };

  const [rows, total] = await Promise.all([
    prisma.engin.findMany({
      where,
      include: {
        _count: { select: { missions: true, maintenances: true, assignments: true } },
        driverAssignments: {
          where: { endDate: null },
          include: { workforce: { select: { id: true, firstName: true, lastName: true } } },
          take: 1,
        },
        assignments: {
          where: { returnedAt: null },
          include: { chantier: { select: { id: true, name: true } } },
          orderBy: { startDate: 'desc' },
          take: 5,
        },
        rentalSupplierRef: { select: { id: true, companyName: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.engin.count({ where }),
  ]);
  const today = todayUtc();
  const items = rows.map(({ assignments, ...e }) => {
    const current = assignments.find((a) => isAssignmentActive(a, today)) || null;
    const isRented = e.ownershipType === 'loue';
    return {
      ...e,
      label: fleetLabel(e),
      currentAssignment: current
        ? { id: current.id, chantierId: current.chantierId, chantierName: current.chantier?.name || null, tranche: current.tranche, startDate: current.startDate, endDate: current.endDate }
        : null,
      costInfo: isRented
        ? { dailyRate: rentalDailyRate(e) != null ? round2(rentalDailyRate(e)!) : null }
        : {
            annualDepreciation: round2(annualDepreciation(e, 0)),
            dailyDepreciation: round2(depreciationDailyAt(e, today)),
            netBookValue: netBookValue(e, today),
          },
    };
  });
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

const ENGIN_NUMBER_FIELDS = [
  'quantity',
  'fuelLevel',
  'counterValue',
  'purchasePrice',
  'rentalMonthly',
  'emptyWeight',
  'totalWeight',
  'residualValue',
  'depreciationYears',
  'usageCostPerHour',
  'rentalPrice',
  'rentalDeposit',
  'rentalTransport',
  'rentalExtraFees',
  'rentalInsurance',
  'rentalTvaRate',
];

const PROPERTY_FIELDS = ['purchasePrice', 'acquisitionDate', 'residualValue', 'depreciationYears', 'usageCostPerHour'];
const RENTAL_FIELDS = [
  'rentalSupplier',
  'rentalSupplierId',
  'rentalMonthly',
  'rentalContractRef',
  'rentalStart',
  'rentalEnd',
  'rentalPrice',
  'rentalUnit',
  'rentalDeposit',
  'rentalTransport',
  'rentalExtraFees',
  'rentalInsurance',
  'rentalTvaRate',
  'rentalPaymentTerms',
];

/** Champs modifiables de la fiche (les relations et calculs sont ignorés). */
const ENGIN_WRITABLE_FIELDS = [
  'kind', 'quantity', 'designation', 'model', 'acquisitionYear', 'commissioningDate', 'location', 'ownershipType', 'depreciationMethod',
  'brand', 'genre', 'groupe', 'workPassport', 'matricule', 'chassisNo', 'emptyWeight', 'totalWeight', 'gsmNumber', 'gpsNumber',
  'gpsMountDate', 'transferDate', 'counterValue', 'counterUnit', 'counterDate', 'status', 'fuelLevel',
  'insuranceExpiry', 'vignetteExpiry', 'visitExpiry', 'authExpiry',
  ...PROPERTY_FIELDS,
  ...RENTAL_FIELDS,
];

function parseEnginNumbers(data: Record<string, unknown>) {
  for (const key of ENGIN_NUMBER_FIELDS) {
    if (data[key] !== undefined) data[key] = data[key] === '' || data[key] == null ? null : Number(data[key]);
  }
  if (data.acquisitionYear !== undefined) {
    data.acquisitionYear = data.acquisitionYear === '' || data.acquisitionYear == null ? null : Math.trunc(Number(data.acquisitionYear));
  }
}

function applyOwnershipRules(data: Record<string, unknown>) {
  data.ownershipType = normalizeOwnershipType(data.ownershipType);
  const cleared = data.ownershipType === 'loue' ? PROPERTY_FIELDS : RENTAL_FIELDS;
  for (const key of cleared) data[key] = null;
}

function pickWritable(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const key of ENGIN_WRITABLE_FIELDS) {
    if (body[key] !== undefined) data[key] = typeof body[key] === 'string' ? (body[key] as string).trim() || null : body[key];
  }
  return data;
}

async function validateEnginData(data: Record<string, unknown>, existingId?: string) {
  if (data.kind !== undefined && !(ENGIN_KINDS as readonly string[]).includes(String(data.kind))) return 'Type invalide (engin ou matériel)';
  if (data.status !== undefined && data.status !== null && !(ENGIN_STATUSES as readonly string[]).includes(String(data.status))) return 'État invalide';
  if (data.rentalUnit && !(RENTAL_UNITS as readonly string[]).includes(String(data.rentalUnit))) return 'Unité de facturation invalide';
  if (data.depreciationMethod && !(DEPRECIATION_METHODS as readonly string[]).includes(String(data.depreciationMethod))) return 'Méthode d\'amortissement invalide';
  for (const key of ENGIN_NUMBER_FIELDS) {
    const v = data[key];
    if (v != null && (Number.isNaN(v as number) || (v as number) < 0)) return `Valeur invalide : ${key}`;
  }
  if (data.purchasePrice != null && data.residualValue != null && Number(data.residualValue) > Number(data.purchasePrice)) {
    return 'La valeur résiduelle ne peut pas dépasser le prix d\'acquisition';
  }
  if (data.rentalStart && data.rentalEnd && new Date(String(data.rentalEnd)) < new Date(String(data.rentalStart))) {
    return 'La fin de location doit être postérieure au début';
  }
  if (data.matricule) {
    const dup = await prisma.engin.findFirst({ where: { matricule: String(data.matricule), ...(existingId ? { id: { not: existingId } } : {}) } });
    if (dup) return `Immatriculation déjà utilisée (${dup.code || dup.brand || dup.id})`;
  }
  if (data.rentalSupplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: String(data.rentalSupplierId) }, select: { companyName: true } });
    if (!supplier) return 'Fournisseur introuvable';
    data.rentalSupplier = supplier.companyName;
  }
  return null;
}

router.post('/', async (req, res) => {
  const data = pickWritable(req.body);
  data.kind = data.kind || 'engin';
  parseEnginDates(data);
  parseEnginNumbers(data);
  applyOwnershipRules(data);
  const error = await validateEnginData(data);
  if (error) return res.status(400).json({ message: error });
  data.code = await nextReference(data.kind === 'materiel' ? 'MAT' : 'ENG');
  if (!data.designation) data.designation = [data.genre, data.brand].filter(Boolean).join(' ') || null;
  const engin = await prisma.engin.create({ data: data as Prisma.EnginUncheckedCreateInput });
  await audit(req, 'création', 'Engin', engin.id, fleetLabel(engin));
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

function optNum(v: unknown) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function optText(v: unknown) {
  const s = v == null ? '' : String(v).trim();
  return s || null;
}

/** Entretien ou réparation : validation + coût total = pièces + main-d'œuvre si non saisi. */
async function buildMaintenanceData(body: Record<string, unknown>, existing?: { kind: string; designation: string }) {
  const kind = body.kind !== undefined ? String(body.kind) : existing?.kind || 'entretien';
  if (!(MAINTENANCE_KINDS as readonly string[]).includes(kind)) return { error: 'Type invalide (entretien ou réparation)' };
  const maintenanceType = body.maintenanceType !== undefined ? optText(body.maintenanceType) : undefined;
  if (maintenanceType && !(MAINTENANCE_TYPES as readonly string[]).includes(maintenanceType)) return { error: 'Nature d\'entretien invalide' };
  const designation = body.designation !== undefined ? optText(body.designation) : existing?.designation;
  if (!designation) return { error: 'Désignation obligatoire' };

  const data: Record<string, unknown> = { kind, designation };
  if (body.date !== undefined) data.date = body.date ? new Date(String(body.date)) : new Date();
  if (maintenanceType !== undefined) data.maintenanceType = maintenanceType;
  for (const key of ['breakdownNature', 'description', 'repairer', 'invoiceRef', 'responsible', 'supervisor', 'remark']) {
    if (body[key] !== undefined) data[key] = optText(body[key]);
  }
  for (const key of ['partsCost', 'laborCost', 'downtimeDays', 'counterValue', 'budget']) {
    if (body[key] !== undefined) {
      const n = optNum(body[key]);
      if (n != null && n < 0) return { error: `Valeur négative : ${key}` };
      data[key] = n;
    }
  }
  if ((data.budget === null || data.budget === undefined) && (data.partsCost != null || data.laborCost != null)) {
    data.budget = round2(Number(data.partsCost || 0) + Number(data.laborCost || 0));
  }
  if (body.allocation !== undefined || body.chantierId !== undefined) {
    const alloc = await parseAllocation(body);
    if ('error' in alloc) return { error: alloc.error };
    data.allocation = alloc.allocation;
    data.chantierId = alloc.chantierId;
    data.tranche = alloc.tranche;
  }
  return { data };
}

router.post('/:id/maintenances', async (req, res) => {
  const enginId = String(req.params.id);
  const engin = await prisma.engin.findUnique({ where: { id: enginId }, select: { id: true } });
  if (!engin) return res.status(404).json({ message: 'Engin introuvable' });
  const built = await buildMaintenanceData({ date: req.body.date || new Date().toISOString(), ...req.body });
  if ('error' in built) return res.status(400).json({ message: built.error });
  const maintenance = await prisma.maintenance.create({
    data: { ...(built.data as Prisma.MaintenanceUncheckedCreateInput), enginId },
    include: { engin: { select: { brand: true, matricule: true } } },
  });
  const nextStatus = maintenance.kind === 'reparation' ? 'en_reparation' : 'en_maintenance';
  if (req.body.setStatus !== false) await prisma.engin.update({ where: { id: enginId }, data: { status: nextStatus } });
  await syncMaintenanceMovement({ ...maintenance, engin: { brand: maintenance.engin.brand || '', matricule: maintenance.engin.matricule || '' } }, req);
  await audit(req, 'création', 'Maintenance', maintenance.id, `${maintenance.kind} — ${maintenance.designation} [${enginId}]`);
  res.status(201).json(maintenance);
});

/** Remise en service après entretien / réparation : disponible, ou affecté si une affectation est en cours. */
router.post('/:id/release', async (req, res) => {
  const id = String(req.params.id);
  const engin = await prisma.engin.findUnique({ where: { id } });
  if (!engin) return res.status(404).json({ message: 'Engin introuvable' });
  if (engin.status === 'restitue') return res.status(400).json({ message: 'Location restituée — remise en service impossible' });
  await prisma.engin.update({ where: { id }, data: { status: 'disponible' } });
  await refreshEnginStatus(id);
  const updated = await prisma.engin.findUnique({ where: { id } });
  await audit(req, 'remise en service', 'Engin', id, fleetLabel(engin));
  res.json(updated);
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
  const engin = await prisma.engin.findUnique({
    where: { id: enginId },
    select: { brand: true, matricule: true, code: true },
  });
  if (!engin) return res.status(404).json({ message: 'Engin introuvable' });
  const built = await buildFuelData(req.body);
  if ('error' in built) return res.status(400).json({ message: built.error });
  const log = await prisma.fuelLog.create({ data: { ...built.data, enginId } });
  if (log.counterValue != null) {
    await prisma.engin.update({
      where: { id: enginId },
      data: { counterValue: log.counterValue, counterDate: log.date },
    });
  }
  await syncFuelMovement({ ...log, engin: { brand: engin.brand || '', matricule: engin.matricule || engin.code || '' } }, req);
  await audit(req, 'carburant', 'FuelLog', log.id, `${log.liters} L [${enginId}]`);
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
      maintenances: { orderBy: { date: 'desc' }, take: 50, include: { chantier: { select: { id: true, name: true } } } },
      documents: { orderBy: { createdAt: 'desc' }, take: 50 },
      driverAssignments: { include: driverAssignmentInclude, orderBy: { startDate: 'desc' } },
      rentalSupplierRef: { select: { id: true, companyName: true, phone1: true, email: true } },
      assignments: {
        orderBy: { startDate: 'desc' },
        include: { chantier: { select: { id: true, name: true } } },
      },
      _count: { select: { missions: true, maintenances: true, documents: true, assignments: true, usages: true, expenses: true, fuelLogs: true } },
    },
  });
  if (!engin) return res.status(404).json({ message: 'Engin introuvable' });
  const today = todayUtc();
  const current = engin.assignments.find((a) => isAssignmentActive(a, today)) || null;
  res.json({
    ...engin,
    label: fleetLabel(engin),
    currentAssignment: current
      ? { id: current.id, chantierId: current.chantierId, chantierName: current.chantier?.name || null, tranche: current.tranche, startDate: current.startDate, endDate: current.endDate }
      : null,
  });
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
  const existing = await prisma.engin.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Engin introuvable' });
  const data = pickWritable(req.body);
  parseEnginDates(data);
  parseEnginNumbers(data);
  if (data.ownershipType !== undefined) applyOwnershipRules(data);
  const error = await validateEnginData(data, id);
  if (error) return res.status(400).json({ message: error });
  if (data.kind && data.kind !== existing.kind && existing.code?.startsWith(existing.kind === 'materiel' ? 'MAT-' : 'ENG-')) {
    data.code = await nextReference(data.kind === 'materiel' ? 'MAT' : 'ENG');
  }
  const engin = await prisma.engin.update({ where: { id }, data: data as Prisma.EnginUncheckedUpdateInput });
  await audit(req, 'modification', 'Engin', id, fleetLabel(engin));
  if (data.status === undefined) await refreshEnginStatus(id);
  res.json(engin);
});

router.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const [missions, maintenances, assignments, usages, expenses] = await Promise.all([
    prisma.mission.count({ where: { enginId: id } }),
    prisma.maintenance.count({ where: { enginId: id } }),
    prisma.enginAssignment.count({ where: { enginId: id } }),
    prisma.enginUsage.count({ where: { enginId: id } }),
    prisma.enginExpense.count({ where: { enginId: id } }),
  ]);
  if (missions + maintenances + assignments + usages + expenses > 0) {
    return res.status(400).json({
      message: `Engin lié à ${missions} mission(s), ${maintenances} entretien(s)/réparation(s), ${assignments} affectation(s), ${usages} pointage(s) et ${expenses} dépense(s) — suppression impossible (utilisez l’état « Hors service » ou « Restitué »)`,
    });
  }

  const engin = await prisma.engin.findUnique({ where: { id } });
  await prisma.engin.delete({ where: { id } });
  await audit(req, 'suppression', 'Engin', id, motif);
  res.json({ ok: true, label: `${engin?.matricule || ''} ${engin?.brand || ''}`.trim() });
});

const movementInclude = {
  chantier: { select: { id: true, name: true } },
  fromChantier: { select: { id: true, name: true } },
} as const;

function movementInput(body: Record<string, unknown>) {
  const quantity = Number(body.quantity);
  return {
    movementType: String(body.movementType || '').trim(),
    quantity: Number.isInteger(quantity) ? quantity : NaN,
    chantierId: body.chantierId ? String(body.chantierId) : null,
    tranche: body.tranche ? String(body.tranche).trim() : null,
    fromChantierId: body.fromChantierId ? String(body.fromChantierId) : null,
    fromTranche: body.fromTranche ? String(body.fromTranche).trim() : null,
    date: body.date ? new Date(String(body.date)) : new Date(),
    remark: body.remark ? String(body.remark).trim() : null,
  };
}

async function stockOf(enginId: string) {
  const engin = await prisma.engin.findUnique({ where: { id: enginId } });
  if (!engin) return null;
  const movements = await prisma.materielMovement.findMany({
    where: { enginId },
    include: movementInclude,
    orderBy: [{ createdAt: 'asc' }],
  });
  const opening = (engin.quantity || 0) - ownedDelta(movements);
  const snap = stockSnapshot(opening, movements);
  return { engin, movements, snap };
}

router.get('/materiel/positions', async (req, res) => {
  const chantierId = req.query.chantierId ? String(req.query.chantierId) : '';
  const tranche = req.query.tranche ? String(req.query.tranche) : '';
  const engins = await prisma.engin.findMany({
    where: { kind: 'materiel' },
    select: { id: true, code: true, designation: true, quantity: true },
    orderBy: { designation: 'asc' },
  });
  const rows: Array<{
    enginId: string;
    code: string | null;
    designation: string | null;
    chantierId: string;
    chantierName: string;
    tranche: string | null;
    quantity: number;
    depot: number;
    owned: number;
    repair: number;
  }> = [];
  const catalog: Array<{
    id: string;
    code: string | null;
    designation: string | null;
    depot: number;
    owned: number;
    repair: number;
    onSite: number;
  }> = [];
  const movements = [];
  for (const engin of engins) {
    const stock = await stockOf(engin.id);
    if (!stock || !stock.snap.ok) continue;
    const onSite = chantierId
      ? stock.snap.sites.filter((site) => site.chantierId === chantierId).reduce((s, site) => s + site.quantity, 0)
      : stock.snap.sites.reduce((s, site) => s + site.quantity, 0);
    catalog.push({
      id: engin.id,
      code: engin.code,
      designation: engin.designation,
      depot: stock.snap.depot,
      owned: stock.snap.owned,
      repair: stock.snap.repair,
      onSite,
    });
    let sites = chantierId ? stock.snap.sites.filter((site) => site.chantierId === chantierId) : stock.snap.sites;
    if (tranche) sites = sites.filter((site) => (site.tranche || '') === tranche);
    for (const site of sites) {
      rows.push({
        enginId: engin.id,
        code: engin.code,
        designation: engin.designation,
        chantierId: site.chantierId,
        chantierName: site.chantierId,
        tranche: site.tranche,
        quantity: site.quantity,
        depot: stock.snap.depot,
        owned: stock.snap.owned,
        repair: stock.snap.repair,
      });
    }
    const related = stock.movements.filter((move) => {
      if (chantierId && move.chantierId !== chantierId && move.fromChantierId !== chantierId) return false;
      if (tranche && (move.tranche || '') !== tranche && (move.fromTranche || '') !== tranche) return false;
      return true;
    });
    movements.push(...related.map((move) => ({ ...move, engin: { id: engin.id, code: engin.code, designation: engin.designation } })));
  }
  const names = await prisma.chantier.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.chantierId))] } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(names.map((row) => [row.id, row.name]));
  for (const row of rows) row.chantierName = nameOf.get(row.chantierId) || row.chantierId;
  movements.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  catalog.sort((a, b) => (a.designation || a.code || '').localeCompare(b.designation || b.code || '', 'fr'));
  res.json({ rows, movements, catalog });
});

router.get('/:id/mouvements', async (req, res) => {
  const stock = await stockOf(String(req.params.id));
  if (!stock) return res.status(404).json({ message: 'Matériel introuvable' });
  if (!stock.snap.ok) return res.status(400).json({ message: stock.snap.message });
  const names = await prisma.chantier.findMany({
    where: { id: { in: stock.snap.sites.map((site) => site.chantierId) } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(names.map((row) => [row.id, row.name]));
  res.json({
    owned: stock.snap.owned,
    depot: stock.snap.depot,
    repair: stock.snap.repair,
    sites: stock.snap.sites.map((site) => ({ ...site, chantierName: nameOf.get(site.chantierId) || site.chantierId })),
    movements: [...stock.movements].reverse(),
  });
});

router.post('/:id/mouvements', async (req, res) => {
  const id = String(req.params.id);
  const stock = await stockOf(id);
  if (!stock) return res.status(404).json({ message: 'Matériel introuvable' });
  if (stock.engin.kind !== 'materiel') return res.status(400).json({ message: 'Les mouvements de quantité concernent le matériel' });
  const input = movementInput(req.body as Record<string, unknown>);
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return res.status(400).json({ message: 'La quantité doit être un entier (1, 2, 3…)' });
  }
  const opening = (stock.engin.quantity || 0) - ownedDelta(stock.movements);
  const next = stockSnapshot(opening, [...stock.movements, input]);
  if (!next.ok) return res.status(400).json({ message: next.message });
  await prisma.materielMovement.create({
    data: { enginId: id, ...input },
  });
  await prisma.engin.update({ where: { id }, data: { quantity: next.owned } });
  const fresh = await stockOf(id);
  res.status(201).json(fresh && fresh.snap.ok ? {
    owned: fresh.snap.owned,
    depot: fresh.snap.depot,
    repair: fresh.snap.repair,
    sites: fresh.snap.sites,
    movements: [...fresh.movements].reverse(),
  } : { owned: next.owned });
});

export default router;
