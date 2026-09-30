import { Router } from 'express';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import { upload, uploadExcel } from '../lib/upload.js';
import {
  TASKS_REFERENCE,
  STANDARD_TRANCHE_LOTS,
  buildStandardLotPhases,
} from '../lib/tasks.js';
import { buildChantierOverview } from '../lib/chantierOverview.js';
import { chantierEnginCosts } from '../lib/enginCosts.js';
import { listChantierTranches, getChantierTrancheDetail } from '../lib/chantierTranches.js';
import { validateWorkProgressPhases } from '../lib/workProgressPhases.js';
import { nextReference } from '../lib/references.js';
import { sendExcel } from '../lib/exportExcel.js';
import {
  importWorkforceRows,
  parseCsvWorkforceRows,
  parseExcelWorkforceRows,
} from '../lib/importWorkforce.js';
import { workforceDocHtml } from '../lib/workforcePrint.js';
import { getOrCreateCompanySettings } from '../lib/companySettings.js';
import { syncWorkforcePayrollMovement } from '../lib/cashSync.js';
import { workforceScopeFilters } from '../lib/workforceScope.js';
import {
  findSessionConflict,
  normalizeTranche,
  resolveSessionForLine,
} from '../lib/pointageSessions.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const router = Router();
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
router.use(requireAuth);
router.use(requirePermission);

router.get('/tasks/reference', async (_req, res) => {
  res.json(TASKS_REFERENCE);
});

router.get('/tasks/standard', async (_req, res) => {
  res.json(
    STANDARD_TRANCHE_LOTS.map((lot) => ({
      name: lot.name,
      phases: buildStandardLotPhases(lot),
    })),
  );
});

async function seedStandardTrancheProgress(chantierId: string, trancheName: string) {
  const existing = await prisma.workProgress.findMany({
    where: { chantierId, tranche: trancheName },
    select: { taskName: true },
  });
  const existingNames = new Set(existing.map((e) => e.taskName));
  const created = [];
  for (const lot of STANDARD_TRANCHE_LOTS) {
    if (existingNames.has(lot.name)) continue;
    const p = await prisma.workProgress.create({
      data: {
        chantierId,
        tranche: trancheName,
        taskName: lot.name,
        percent: 0,
        phases: buildStandardLotPhases(lot),
      },
    });
    created.push(p);
  }
  if (created.length) {
    const all = await prisma.workProgress.findMany({ where: { chantierId } });
    const avg = all.length ? all.reduce((s, row) => s + row.percent, 0) / all.length : 0;
    await prisma.chantier.update({ where: { id: chantierId }, data: { progressPct: avg } });
  }
  return created;
}

// --- Main-d'œuvre (avant /:id) ---
function buildWorkforceWhere(
  q: string,
  category: string,
  groupe: string,
  active: string,
  declared: string,
  chantierId: string,
  excludeCategory = '',
) {
  return {
    AND: [
      q
        ? {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { cin: { contains: q } },
              { phone1: { contains: q } },
              { category: { contains: q } },
              { groupe: { contains: q } },
              { reference: { contains: q } },
            ],
          }
        : {},
      ...workforceScopeFilters(category, excludeCategory).AND,
      groupe ? { groupe } : {},
      active === 'true' ? { isActive: true } : active === 'false' ? { isActive: false } : {},
      declared === 'true' ? { declared: true } : declared === 'false' ? { declared: false } : {},
      chantierId ? { assignments: { some: { chantierId } } } : {},
    ],
  };
}

router.get('/workforce/stats', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const excludeCategory = String(req.query.excludeCategory || '');
  const groupe = String(req.query.groupe || '');
  const active = String(req.query.active || '');
  const declared = String(req.query.declared || '');
  const chantierId = String(req.query.chantierId || '');
  const where = buildWorkforceWhere(q, category, groupe, active, declared, chantierId, excludeCategory);
  const scopeWhere = workforceScopeFilters(category, excludeCategory);

  const withoutRef = await prisma.workforce.findMany({ where: { reference: null }, select: { id: true } });
  for (const w of withoutRef) {
    await prisma.workforce.update({ where: { id: w.id }, data: { reference: await nextReference('MO') } });
  }

  const [total, actifs, declaredCount, assigned, avgSalary, categories, groupes] = await Promise.all([
    prisma.workforce.count({ where }),
    prisma.workforce.count({ where: { AND: [where, { isActive: true }] } }),
    prisma.workforce.count({ where: { AND: [where, { declared: true }] } }),
    prisma.workforce.count({ where: { AND: [where, { assignments: { some: {} } }] } }),
    prisma.workforce.aggregate({ where, _avg: { dailySalary: true } }),
    prisma.workforce.findMany({
      where: { ...scopeWhere, category: { not: null }, NOT: { category: '' } },
      select: { category: true },
      distinct: ['category'],
      take: 20,
    }),
    prisma.workforce.findMany({
      where: { ...scopeWhere, groupe: { not: null }, NOT: { groupe: '' } },
      select: { groupe: true },
      distinct: ['groupe'],
      take: 20,
    }),
  ]);
  res.json({
    total,
    actifs,
    inactifs: total - actifs,
    declared: declaredCount,
    assigned,
    avgSalary: Math.round(avgSalary._avg.dailySalary || 0),
    categories: categories.map((c) => c.category).filter(Boolean),
    groupes: groupes.map((g) => g.groupe).filter(Boolean),
  });
});

router.get('/workforce/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const excludeCategory = String(req.query.excludeCategory || '');
  const groupe = String(req.query.groupe || '');
  const active = String(req.query.active || '');
  const declared = String(req.query.declared || '');
  const chantierId = String(req.query.chantierId || '');
  const where = buildWorkforceWhere(q, category, groupe, active, declared, chantierId, excludeCategory);

  const workers = await prisma.workforce.findMany({
    where,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: { assignments: { include: { chantier: true }, take: 1 } },
  });
  const header = 'Référence;Prénom;Nom;CIN;Téléphone;Catégorie;Groupe;Contrat;Salaire/j;Déclaré CNSS;Actif;Chantier';
  const rows = workers.map((w) => {
    const ch = w.assignments[0]?.chantier?.name || '';
    return `${w.reference || ''};${w.firstName};${w.lastName};${w.cin || ''};${w.phone1 || ''};${w.category || ''};${w.groupe || ''};${w.contractType || ''};${w.dailySalary};${w.declared ? 'Oui' : 'Non'};${w.isActive ? 'Oui' : 'Non'};${ch}`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=main-oeuvre-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/workforce/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const excludeCategory = String(req.query.excludeCategory || '');
  const groupe = String(req.query.groupe || '');
  const active = String(req.query.active || '');
  const declared = String(req.query.declared || '');
  const chantierId = String(req.query.chantierId || '');
  const where = buildWorkforceWhere(q, category, groupe, active, declared, chantierId, excludeCategory);
  const workers = await prisma.workforce.findMany({
    where,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: { assignments: { include: { chantier: true }, take: 1 } },
    take: 5000,
  });
  sendExcel(
    res,
    'main-oeuvre-gic.xlsx',
    'Main-d\'œuvre',
    workers.map((w) => ({
      Référence: w.reference || '',
      Prénom: w.firstName,
      Nom: w.lastName,
      CIN: w.cin || '',
      Téléphone: w.phone1 || '',
      Catégorie: w.category || '',
      Groupe: w.groupe || '',
      Contrat: w.contractType || '',
      'Salaire/j': w.dailySalary,
      'CNSS déclaré': w.declared ? 'Oui' : 'Non',
      Actif: w.isActive ? 'Oui' : 'Non',
      Chantier: w.assignments[0]?.chantier?.name || '',
    }))
  );
});

router.post('/workforce/import/csv', async (req, res) => {
  const { csv } = req.body;
  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({ message: 'Contenu CSV requis' });
  }
  const result = await importWorkforceRows(parseCsvWorkforceRows(csv));
  await audit(req, 'import_csv', 'Workforce', undefined, `${result.created} créés`);
  res.json(result);
});

router.post('/workforce/import/xlsx', uploadExcel.single('file'), async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ message: 'Fichier Excel (.xlsx) requis' });
  const rows = parseExcelWorkforceRows(req.file.buffer);
  if (!rows.length) {
    return res.status(400).json({ message: 'Fichier vide ou format non reconnu' });
  }
  const result = await importWorkforceRows(rows);
  await audit(req, 'import_xlsx', 'Workforce', undefined, `${result.created} créés`);
  res.json(result);
});

router.get('/workforce/list', async (req, res) => {
  const category = String(req.query.category || '');
  const excludeCategory = String(req.query.excludeCategory || '');
  const scopeWhere = workforceScopeFilters(category, excludeCategory);
  res.json(
    await prisma.workforce.findMany({
      where: { isActive: true, ...scopeWhere },
      orderBy: { lastName: 'asc' },
      include: { assignments: { include: { chantier: true } } },
    })
  );
});

router.get('/workforce', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const excludeCategory = String(req.query.excludeCategory || '');
  const groupe = String(req.query.groupe || '');
  const active = String(req.query.active || '');
  const declared = String(req.query.declared || '');
  const chantierId = String(req.query.chantierId || '');
  const sort = String(req.query.sort || 'lastName');
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const where = buildWorkforceWhere(q, category, groupe, active, declared, chantierId, excludeCategory);
  const orderBy =
    sort === 'dailySalary'
      ? { dailySalary: order as 'asc' | 'desc' }
      : sort === 'category'
        ? { category: order as 'asc' | 'desc' }
        : sort === 'createdAt'
          ? { createdAt: order as 'asc' | 'desc' }
          : [{ lastName: order as 'asc' | 'desc' }, { firstName: order as 'asc' | 'desc' }];

  const [items, total] = await Promise.all([
    prisma.workforce.findMany({
      where,
      include: {
        assignments: { include: { chantier: { select: { id: true, name: true } } }, take: 3 },
        vehicleAssignments: {
          where: { endDate: null },
          include: { engin: { select: { id: true, brand: true, genre: true, matricule: true } } },
          take: 1,
        },
        _count: { select: { pointages: true, assignments: true, vehicleAssignments: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.workforce.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.post('/workforce', async (req, res) => {
  const data = normalizeWorkforcePayFields({ ...req.body });
  if (data.birthDate) data.birthDate = new Date(String(data.birthDate));
  if (data.hireDate) data.hireDate = new Date(String(data.hireDate));
  data.reference = await nextReference('MO');
  const worker = await prisma.workforce.create({ data: data as any });
  await audit(req, 'création', 'Workforce', worker.id, `${worker.reference} — ${worker.firstName} ${worker.lastName}`);
  res.status(201).json(worker);
});

router.get('/workforce/:id/history', async (req, res) => {
  const workforceId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Workforce', entityId: workforceId },
        { details: { contains: workforceId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/workforce/:id/documents', async (req, res) => {
  const workforceId = String(req.params.id);
  const worker = await prisma.workforce.findUnique({ where: { id: workforceId }, select: { id: true } });
  if (!worker) return res.status(404).json({ message: 'Ouvrier introuvable' });
  const [uploaded, generated] = await Promise.all([
    prisma.document.findMany({
      where: { entityType: 'Workforce', entityId: workforceId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.workforceDocument.findMany({
      where: { workforceId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  res.json({ uploaded, generated });
});

router.get('/workforce/:id/print/:docType', async (req, res) => {
  const workforceId = String(req.params.id);
  const docType = String(req.params.docType);
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');

  const worker = await prisma.workforce.findUnique({
    where: { id: workforceId },
    include: {
      assignments: { include: { chantier: true }, orderBy: { startDate: 'desc' } },
    },
  });
  if (!worker) return res.status(404).json({ message: 'Ouvrier introuvable' });

  const { from, to } = parseDateRange(dateFrom, dateTo);
  const company = await getOrCreateCompanySettings();
  let html = '';
  let printData: Record<string, unknown> = { generatedAt: new Date().toISOString() };

  if (docType === 'fiche_paie') {
    const pointages = await prisma.pointage.findMany({
      where: {
        workforceId,
        validated: true,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: { chantier: { select: { name: true } } },
      orderBy: { date: 'asc' },
    });
    const salary = computeWorkerPeriodSalary(worker, pointages);
    printData = { ...printData, dateFrom, dateTo, ...salary };
    html = workforceDocHtml(docType, {
      reference: worker.reference,
      firstName: worker.firstName,
      lastName: worker.lastName,
      dailySalary: isMonthlyWorkforce(worker) ? worker.monthlySalary : worker.dailySalary,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      totalDays: salary.totalDays,
      brut: salary.brut,
      advances: salary.advances,
      bonuses: salary.bonuses,
      net: salary.net,
      pointages: pointages.map((p) => ({
        date: p.date.toISOString().slice(0, 10),
        chantier: p.chantier?.name,
        totalDay: p.totalDay,
        advance: p.advance,
        bonus: p.bonus,
      })),
    }, company);
  } else {
    html = workforceDocHtml(docType, {
      reference: worker.reference,
      firstName: worker.firstName,
      lastName: worker.lastName,
      cin: worker.cin,
      category: worker.category,
      groupe: worker.groupe,
      phone1: worker.phone1,
      contractType: worker.contractType,
      dailySalary: worker.dailySalary,
      declared: worker.declared,
      cnssNumber: worker.cnssNumber,
      hireDate: worker.hireDate?.toISOString().slice(0, 10),
      workPassport: worker.workPassport,
      assignments: worker.assignments.map((a) => ({
        chantier: a.chantier.name,
        functionRole: a.functionRole,
        tranche: a.tranche,
        startDate: a.startDate.toISOString().slice(0, 10),
      })),
    }, company);
  }

  await prisma.workforceDocument.create({
    data: {
      workforceId,
      docType,
      reference: worker.reference,
      data: JSON.stringify(printData),
    },
  });
  await audit(req, 'document', 'Workforce', workforceId, docType);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.post('/workforce/:id/assign', async (req, res) => {
  const workforceId = String(req.params.id);
  const chantierId = String(req.body.chantierId || '').trim();
  if (!chantierId) return res.status(400).json({ message: 'Chantier requis' });

  const worker = await prisma.workforce.findUnique({ where: { id: workforceId } });
  if (!worker) return res.status(404).json({ message: 'Ouvrier introuvable' });

  const chantier = await prisma.chantier.findUnique({ where: { id: chantierId }, select: { id: true, name: true } });
  if (!chantier) return res.status(404).json({ message: 'Chantier introuvable' });

  const existing = await prisma.workforceAssignment.findFirst({ where: { workforceId, chantierId } });
  if (existing) return res.status(400).json({ message: 'Ouvrier déjà affecté à ce chantier' });

  const tranche = req.body.tranche ? String(req.body.tranche).trim() : null;
  const assignment = await prisma.workforceAssignment.create({
    data: {
      chantierId,
      workforceId,
      functionRole: req.body.functionRole ? String(req.body.functionRole).trim() : null,
      tranche,
    },
    include: { chantier: true },
  });
  await audit(
    req,
    'affectation',
    'Workforce',
    workforceId,
    `${worker.firstName} ${worker.lastName} → ${chantier.name}`
  );
  res.status(201).json(assignment);
});

router.delete('/workforce/:id/assign/:assignmentId', async (req, res) => {
  const workforceId = String(req.params.id);
  const assignmentId = String(req.params.assignmentId);
  const assignment = await prisma.workforceAssignment.findFirst({
    where: { id: assignmentId, workforceId },
    include: {
      chantier: { select: { name: true } },
      workforce: { select: { firstName: true, lastName: true } },
    },
  });
  if (!assignment) return res.status(404).json({ message: 'Affectation introuvable' });
  await prisma.workforceAssignment.delete({ where: { id: assignmentId } });
  await audit(
    req,
    'désaffectation',
    'Workforce',
    workforceId,
    `${assignment.workforce.firstName} ${assignment.workforce.lastName} — ${assignment.chantier.name}`
  );
  res.json({ ok: true });
});

router.get('/workforce/:id', async (req, res) => {
  const worker = await prisma.workforce.findUnique({
    where: { id: String(req.params.id) },
    include: {
      assignments: { include: { chantier: true }, orderBy: { startDate: 'desc' } },
      vehicleAssignments: {
        include: {
          engin: { select: { id: true, brand: true, genre: true, matricule: true, status: true, photo: true } },
        },
        orderBy: { startDate: 'desc' },
      },
      pointages: {
        orderBy: { date: 'desc' },
        take: 30,
        include: { chantier: { select: { id: true, name: true } } },
      },
      _count: { select: { pointages: true, assignments: true } },
    },
  });
  if (!worker) return res.status(404).json({ message: 'Ouvrier introuvable' });
  res.json(worker);
});

router.put('/workforce/:id', async (req, res) => {
  const id = String(req.params.id);
  const data = normalizeWorkforcePayFields({ ...req.body });
  delete data.id;
  delete data.reference;
  delete data._count;
  delete data.assignments;
  delete data.vehicleAssignments;
  delete data.pointages;
  if (data.birthDate != null) data.birthDate = data.birthDate ? new Date(String(data.birthDate)) : null;
  if (data.hireDate != null) data.hireDate = data.hireDate ? new Date(String(data.hireDate)) : null;
  if (data.declared != null) data.declared = !!data.declared;
  if (data.isActive != null) data.isActive = !!data.isActive;
  const worker = await prisma.workforce.update({ where: { id }, data: data as any });
  await audit(req, 'modification', 'Workforce', id, `${worker.firstName} ${worker.lastName}`);
  res.json(worker);
});

router.delete('/workforce/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const pointages = await prisma.pointage.count({ where: { workforceId: id } });
  if (pointages > 0) {
    return res.status(400).json({
      message: `Ouvrier lié à ${pointages} pointage(s) — suppression impossible (désactivez-le plutôt)`,
    });
  }

  await prisma.$transaction([
    prisma.workforceAssignment.deleteMany({ where: { workforceId: id } }),
    prisma.workforce.delete({ where: { id } }),
  ]);
  await audit(req, 'suppression', 'Workforce', id, motif);
  res.json({ ok: true });
});

router.post('/workforce/:id/photo', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Photo requise' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return res.status(400).json({ message: 'Format photo : JPG, PNG ou WebP' });
  }
  const photo = `/uploads/${req.file.filename}`;
  const worker = await prisma.workforce.update({
    where: { id: String(req.params.id) },
    data: { photo },
  });
  await audit(req, 'photo', 'Workforce', worker.id, `${worker.firstName} ${worker.lastName}`);
  res.json(worker);
});

router.delete('/workforce/:id/photo', async (req, res) => {
  const worker = await prisma.workforce.update({
    where: { id: String(req.params.id) },
    data: { photo: null },
  });
  await audit(req, 'photo', 'Workforce', worker.id, 'suppression photo');
  res.json(worker);
});

function parseDateRange(dateFrom?: string, dateTo?: string) {
  const from = dateFrom ? parsePointageDate(dateFrom) : null;
  const to = dateTo ? parsePointageDate(dateTo) : null;
  if (to) to.setHours(23, 59, 59, 999);
  return { from, to };
}

function parsePointageDate(dateStr: string) {
  const d = new Date(String(dateStr));
  if (Number.isNaN(d.getTime())) throw new Error('Date invalide');
  d.setHours(0, 0, 0, 0);
  return d;
}

async function pointageTrancheClause(chantierId: string, tranche: string) {
  const name = tranche.trim();
  if (!name || !chantierId) return null;
  return { tranche: name };
}

function workforceCategoryClause(category?: string, excludeCategory?: string) {
  const cat = String(category || '').trim();
  const exclude = String(excludeCategory || '').trim();
  if (cat) return { workforce: { category: cat } };
  if (exclude) {
    return {
      workforce: {
        OR: [{ category: null }, { category: '' }, { category: { not: exclude } }],
      },
    };
  }
  return null;
}

async function buildPointageWhere(query: {
  dateFrom?: string | null;
  dateTo?: string | null;
  chantierId?: string;
  workforceId?: string;
  validated?: string;
  tranche?: string;
  category?: string;
  excludeCategory?: string;
}) {
  const { from, to } = parseDateRange(query.dateFrom || undefined, query.dateTo || undefined);
  const chantierId = String(query.chantierId || '');
  const workforceId = String(query.workforceId || '');
  const validated = String(query.validated || '');
  const trancheClause = await pointageTrancheClause(chantierId, String(query.tranche || ''));
  const categoryClause = workforceCategoryClause(query.category, query.excludeCategory);

  const AND: object[] = [
    from || to
      ? {
          date: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {},
    chantierId ? { chantierId } : {},
    workforceId ? { workforceId } : {},
    ...(trancheClause ? [trancheClause] : []),
    ...(categoryClause ? [categoryClause] : []),
    validated === 'true' ? { validated: true } : validated === 'false' ? { validated: false } : {},
  ].filter((clause) => Object.keys(clause).length > 0);

  return { AND };
}

function pointageRate(p: { dayRate?: number | null }, fallback: number) {
  return p.dayRate != null && p.dayRate > 0 ? p.dayRate : fallback;
}

function pointageBrut(
  p: { totalDay: number; dayRate?: number | null },
  dailySalary: number
) {
  return p.totalDay * pointageRate(p, dailySalary);
}

function computeSalary(
  dailySalary: number,
  pointages: Array<{ totalDay: number; advance: number; bonus: number; dayRate?: number | null }>
) {
  const totalDays = pointages.reduce((s, p) => s + p.totalDay, 0);
  const advances = pointages.reduce((s, p) => s + p.advance, 0);
  const bonuses = pointages.reduce((s, p) => s + p.bonus, 0);
  const brut = pointages.reduce((s, p) => s + pointageBrut(p, dailySalary), 0);
  const net = brut + bonuses - advances;
  return { totalDays, advances, bonuses, brut, net, pointageCount: pointages.length };
}

/** Paie au mois = hors pointage (salaire fixe). */
function paymentInstant(value: unknown) {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date();
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function pointageTrancheMatch(tranche: string) {
  if (!tranche) return { OR: [{ tranche: null }, { tranche: '' }] };
  return { tranche };
}

function isMonthlyWorkforce(w: { salaryPeriod?: string | null; contractType?: string | null }) {
  return String(w.salaryPeriod || '').toLowerCase() === 'mois';
}

function computeWorkerPeriodSalary(
  w: { salaryPeriod?: string | null; dailySalary: number; monthlySalary?: number | null },
  pointages: Array<{ totalDay: number; advance: number; bonus: number; dayRate?: number | null }>,
) {
  if (isMonthlyWorkforce(w)) {
    const brut = Number(w.monthlySalary) || 0;
    return { totalDays: 0, advances: 0, bonuses: 0, brut, net: brut, pointageCount: 0, salaryPeriod: 'mois' as const };
  }
  return { ...computeSalary(w.dailySalary, pointages), salaryPeriod: 'jour' as const };
}

function normalizeWorkforcePayFields(data: Record<string, unknown>) {
  const periodRaw = String(data.salaryPeriod ?? '').toLowerCase();
  const contractRaw = String(data.contractType ?? '').toLowerCase();
  const isMois = periodRaw === 'mois' || periodRaw === 'mensuel' || (!periodRaw && contractRaw === 'mensuel');
  data.salaryPeriod = isMois ? 'mois' : 'jour';
  if (isMois) data.contractType = 'Mensuel';
  else if (!data.contractType || contractRaw === 'mensuel') data.contractType = 'Journalier';
  data.dailySalary = Number(data.dailySalary || 0);
  data.monthlySalary = Number(data.monthlySalary || 0);
  data.bankName =
    data.bankName != null && String(data.bankName).trim() !== '' ? String(data.bankName).trim() : null;
  data.rib = data.rib != null && String(data.rib).trim() !== '' ? String(data.rib).trim() : null;
  if (!isMois) {
    // Banque / RIB seulement pour les mensuels
    data.bankName = null;
    data.rib = null;
  }
  return data;
}

/** Si un tarif/j est saisi au pointage, met à jour le salaire journalier de la fiche ouvrier. */
async function syncWorkforceDailyRateFromPointage(
  req: import('express').Request,
  workforceId: string,
  dayRate: number | null,
) {
  if (dayRate == null || !(dayRate > 0)) return null;
  const worker = await prisma.workforce.findUnique({
    where: { id: workforceId },
    select: { id: true, dailySalary: true, salaryPeriod: true, firstName: true, lastName: true },
  });
  if (!worker || isMonthlyWorkforce(worker)) return null;
  if (Math.abs(Number(worker.dailySalary) - dayRate) < 0.001) return null;
  const updated = await prisma.workforce.update({
    where: { id: workforceId },
    data: { dailySalary: dayRate },
  });
  await audit(
    req,
    'modification',
    'Workforce',
    workforceId,
    `Tarif journalier ${worker.dailySalary} → ${dayRate} MAD (via pointage)`,
  );
  return updated;
}

async function getSalaryRows(
  dateFrom: string,
  dateTo: string,
  q: string,
  category: string,
  active: string,
  chantierId: string,
  periodYear?: number,
  periodMonth?: number,
  excludeCategory = '',
) {
  const { from, to } = parseDateRange(dateFrom, dateTo);
  const py = periodYear ?? (from ? from.getFullYear() : new Date().getFullYear());
  const pm = periodMonth ?? (from ? from.getMonth() + 1 : new Date().getMonth() + 1);
  const where = buildWorkforceWhere(q, category, '', active, '', chantierId, excludeCategory);
  const workers = await prisma.workforce.findMany({
    where,
    include: {
      assignments: { include: { chantier: { select: { id: true, name: true } } }, take: 1 },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  if (!workers.length) return [];

  const workerIds = workers.map((w) => w.id);
  const [pointages, payrollRecords] = await Promise.all([
    prisma.pointage.findMany({
      where: {
        workforceId: { in: workerIds },
        validated: true,
        ...(chantierId ? { chantierId } : {}),
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
    }),
    prisma.workforcePayrollRecord.findMany({
      where: {
        workforceId: { in: workerIds },
        periodYear: py,
        periodMonth: pm,
      },
    }),
  ]);

  const byWorker = new Map<string, typeof pointages>();
  for (const p of pointages) {
    const list = byWorker.get(p.workforceId) || [];
    list.push(p);
    byWorker.set(p.workforceId, list);
  }
  const payrollByWorker = new Map<string, typeof payrollRecords>();
  for (const record of payrollRecords) {
    const list = payrollByWorker.get(record.workforceId) || [];
    list.push(record);
    payrollByWorker.set(record.workforceId, list);
  }

  return workers.map((w) => {
    const computed = computeWorkerPeriodSalary(w, byWorker.get(w.id) || []);
    const records = payrollByWorker.get(w.id) || [];
    const siteKey = chantierId && !isMonthlyWorkforce(w) ? chantierId : '';
    const matched = chantierId
      ? records.filter((r) => r.chantierId === siteKey)
      : records;
    const amountPaid = matched.reduce((s, r) => s + r.amountPaid, 0);
    const payroll = matched.find((r) => r.chantierId === siteKey) || matched[0];
    const netDue = computed.net;
    const remaining = Math.max(0, netDue - amountPaid);
    let status = 'none';
    if (netDue > 0) {
      if (remaining <= 0) status = 'paid';
      else if (amountPaid > 0) status = 'partial';
      else status = 'pending';
    }
    return {
      id: w.id,
      firstName: w.firstName,
      lastName: w.lastName,
      cin: w.cin,
      category: w.category,
      groupe: w.groupe,
      dailySalary: w.dailySalary,
      monthlySalary: w.monthlySalary,
      salaryPeriod: computed.salaryPeriod,
      bankName: w.bankName,
      rib: w.rib,
      declared: w.declared,
      isActive: w.isActive,
      chantier: w.assignments[0]?.chantier || null,
      periodYear: py,
      periodMonth: pm,
      salary: {
        ...computed,
        netDue,
        amountPaid,
        remaining,
        status,
        payrollId: payroll?.id ?? null,
      },
    };
  });
}

router.get('/salaries/stats', async (req, res) => {
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const excludeCategory = String(req.query.excludeCategory || '');
  const active = String(req.query.active || '');
  const chantierId = String(req.query.chantierId || '');
  const payStatus = String(req.query.payStatus || '');

  let rows = await getSalaryRows(dateFrom, dateTo, q, category, active, chantierId, undefined, undefined, excludeCategory);
  if (payStatus === 'a_payer') {
    rows = rows.filter((r) => r.salary.netDue > 0 && r.salary.remaining > 0);
  } else if (payStatus === 'paye') {
    rows = rows.filter((r) => r.salary.amountPaid > 0 && r.salary.remaining <= 0);
  } else if (payStatus === 'partiel') {
    rows = rows.filter((r) => r.salary.status === 'partial');
  }
  const withPointage = rows.filter((r) => r.salary.pointageCount > 0 || r.salaryPeriod === 'mois');

  res.json({
    totalWorkers: rows.length,
    withPointage: withPointage.length,
    totalDays: rows.reduce((s, r) => s + r.salary.totalDays, 0),
    totalBrut: rows.reduce((s, r) => s + r.salary.brut, 0),
    totalNet: rows.reduce((s, r) => s + r.salary.netDue, 0),
    totalAdvances: rows.reduce((s, r) => s + r.salary.advances, 0),
    totalBonuses: rows.reduce((s, r) => s + r.salary.bonuses, 0),
    totalPaid: rows.reduce((s, r) => s + r.salary.amountPaid, 0),
    totalRemaining: rows.reduce((s, r) => s + r.salary.remaining, 0),
  });
});

router.get('/salaries/export/csv', async (req, res) => {
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const excludeCategory = String(req.query.excludeCategory || '');
  const active = String(req.query.active || '');
  const chantierId = String(req.query.chantierId || '');

  const rows = await getSalaryRows(dateFrom, dateTo, q, category, active, chantierId, undefined, undefined, excludeCategory);
  const header = 'Prénom;Nom;Catégorie;Salaire/j;Journées;Brut;Primes;Avances;Net dû;Payé;Reste;Statut;Pointages;Chantier';
  const lines = rows.map(
    (r) =>
      `${r.firstName};${r.lastName};${r.category || ''};${r.dailySalary};${r.salary.totalDays.toFixed(2)};${r.salary.brut};${r.salary.bonuses};${r.salary.advances};${r.salary.netDue};${r.salary.amountPaid};${r.salary.remaining};${r.salary.status};${r.salary.pointageCount};${r.chantier?.name || ''}`
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=salaires-gic.csv');
  res.send('\uFEFF' + [header, ...lines].join('\n'));
});

router.get('/salaries', async (req, res) => {
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const excludeCategory = String(req.query.excludeCategory || '');
  const active = String(req.query.active || '');
  const chantierId = String(req.query.chantierId || '');
  const sort = String(req.query.sort || 'lastName');
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));

  const payStatus = String(req.query.payStatus || '');
  let rows = await getSalaryRows(dateFrom, dateTo, q, category, active, chantierId, undefined, undefined, excludeCategory);

  if (payStatus === 'a_payer') {
    rows = rows.filter((r) => r.salary.netDue > 0 && r.salary.remaining > 0);
  } else if (payStatus === 'paye') {
    rows = rows.filter((r) => r.salary.amountPaid > 0 && r.salary.remaining <= 0);
  } else if (payStatus === 'partiel') {
    rows = rows.filter((r) => r.salary.status === 'partial');
  }

  rows.sort((a, b) => {
    let va: number | string = a.lastName;
    let vb: number | string = b.lastName;
    if (sort === 'net') { va = a.salary.net; vb = b.salary.net; }
    else if (sort === 'brut') { va = a.salary.brut; vb = b.salary.brut; }
    else if (sort === 'totalDays') { va = a.salary.totalDays; vb = b.salary.totalDays; }
    else if (sort === 'dailySalary') { va = a.dailySalary; vb = b.dailySalary; }
    if (typeof va === 'number' && typeof vb === 'number') return order === 'asc' ? va - vb : vb - va;
    return order === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });

  const total = rows.length;
  const skip = (page - 1) * limit;
  const items = rows.slice(skip, skip + limit);

  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.post('/salaries/:workforceId/pay', async (req, res) => {
  const workforceId = String(req.params.workforceId);
  const periodYear = Number(req.body.periodYear) || new Date().getFullYear();
  const periodMonth = Number(req.body.periodMonth) || new Date().getMonth() + 1;
  const amount = Number(req.body.amount);
  const paymentMode = String(req.body.paymentMode || 'especes');
  const remark = req.body.remark ? String(req.body.remark) : null;
  const requestedSite = String(req.body.chantierId || '').trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Montant invalide' });
  }

  const worker = await prisma.workforce.findUnique({ where: { id: workforceId } });
  if (!worker) return res.status(404).json({ message: 'Ouvrier introuvable' });

  const siteKey = requestedSite && !isMonthlyWorkforce(worker) ? requestedSite : '';
  const trancheSpecified = Object.prototype.hasOwnProperty.call(req.body, 'tranche');
  const trancheKey = siteKey && trancheSpecified ? String(req.body.tranche || '').trim() : '';
  const periodStart = new Date(periodYear, periodMonth - 1, 1);
  const periodEnd = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);

  const pointages = await prisma.pointage.findMany({
    where: {
      workforceId,
      validated: true,
      date: { gte: periodStart, lte: periodEnd },
      ...(siteKey ? { chantierId: siteKey } : {}),
      ...(siteKey && trancheSpecified ? pointageTrancheMatch(trancheKey) : {}),
    },
  });
  const computed = computeWorkerPeriodSalary(worker, pointages);
  const netDue = computed.net;

  if (netDue <= 0) {
    return res.status(400).json({ message: 'Aucun salaire dû pour cette période' });
  }

  const periodRecords = await prisma.workforcePayrollRecord.findMany({
    where: { workforceId, periodYear, periodMonth },
  });
  const existing = periodRecords.find((r) => r.chantierId === siteKey && String(r.tranche || '') === trancheKey);
  const paidElsewhere = periodRecords
    .filter((r) => r.chantierId !== siteKey)
    .reduce((s, r) => s + r.amountPaid, 0);
  const prevPaid = existing?.amountPaid ?? 0;
  const amountPaid = prevPaid + amount;
  const cap = siteKey ? netDue : Math.max(0, netDue - paidElsewhere);
  if (amountPaid > cap + 0.01) {
    return res.status(400).json({
      message: `Montant supérieur au net dû (${netDue.toLocaleString('fr-MA')} MAD, reste ${Math.max(0, cap - prevPaid).toLocaleString('fr-MA')} MAD)`,
    });
  }

  const remaining = siteKey
    ? Math.max(0, netDue - amountPaid)
    : Math.max(0, netDue - amountPaid - paidElsewhere);
  const status = remaining <= 0 ? 'paid' : 'partial';
  const reference = existing?.reference || (await nextReference('MO'));

  const record = await prisma.workforcePayrollRecord.upsert({
    where: {
      workforceId_periodYear_periodMonth_chantierId_tranche: {
        workforceId,
        periodYear,
        periodMonth,
        chantierId: siteKey,
        tranche: trancheKey,
      },
    },
    create: {
      reference,
      workforceId,
      chantierId: siteKey,
      tranche: trancheKey,
      periodYear,
      periodMonth,
      brut: computed.brut,
      advances: computed.advances,
      bonuses: computed.bonuses,
      netDue,
      amountPaid,
      remaining,
      paymentMode,
      status,
      paidAt: paymentInstant(req.body.paidAt),
      remark,
    },
    update: {
      brut: computed.brut,
      advances: computed.advances,
      bonuses: computed.bonuses,
      netDue,
      amountPaid,
      remaining,
      paymentMode,
      status,
      paidAt: paymentInstant(req.body.paidAt),
      ...(remark != null ? { remark } : {}),
    },
    include: { workforce: { select: { firstName: true, lastName: true, reference: true } } },
  });

  await syncWorkforcePayrollMovement(record, req);
  await audit(
    req,
    'décaissement',
    'WorkforcePayrollRecord',
    record.id,
    `${worker.firstName} ${worker.lastName} — ${amount.toLocaleString('fr-MA')} MAD`,
  );

  res.json(record);
});

router.get('/:id/payroll-lines', async (req, res) => {
  const chantierId = String(req.params.id);
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const category = String(req.query.category || '').trim();
  const excludeCategory = String(req.query.excludeCategory || '').trim();
  const { from, to } = parseDateRange(dateFrom, dateTo);
  const py = from ? from.getFullYear() : new Date().getFullYear();
  const pm = from ? from.getMonth() + 1 : new Date().getMonth() + 1;

  const chantier = await prisma.chantier.findUnique({
    where: { id: chantierId },
    select: { id: true, name: true },
  });
  if (!chantier) return res.status(404).json({ message: 'Chantier introuvable' });

  const categoryWhere = category
    ? { category }
    : excludeCategory
      ? { OR: [{ category: null }, { category: '' }, { category: { not: excludeCategory } }] }
      : {};

  const [pointages, assignments] = await Promise.all([
    prisma.pointage.findMany({
      where: {
        chantierId,
        validated: true,
        ...(from || to
          ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
        workforce: categoryWhere,
      },
      include: {
        session: { select: { remark: true } },
        workforce: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            category: true,
            dailySalary: true,
            monthlySalary: true,
            salaryPeriod: true,
            contractType: true,
          },
        },
      },
    }),
    prisma.workforceAssignment.findMany({
      where: { chantierId },
      select: { workforceId: true, tranche: true, functionRole: true },
    }),
  ]);

  function taskFor(workforceId: string, tranche: string, category: string | null) {
    const rows = assignments.filter((row) => row.workforceId === workforceId);
    const exact = rows.find((row) => String(row.tranche || '') === tranche && row.functionRole);
    const any = rows.find((row) => row.functionRole);
    return exact?.functionRole || any?.functionRole || category || '';
  }

  type DayLine = {
    id: string;
    date: Date;
    tranche: string;
    task: string;
    remark: string;
    days: number;
    hours: number;
    rate: number;
    brut: number;
    advance: number;
    bonus: number;
    net: number;
  };
  type Bucket = {
    workforceId: string;
    firstName: string;
    lastName: string;
    category: string | null;
    monthly: boolean;
    tranche: string;
    task: string;
    totalDays: number;
    advances: number;
    bonuses: number;
    brut: number;
    days: DayLine[];
  };
  const buckets = new Map<string, Bucket>();
  for (const p of pointages) {
    if (isMonthlyWorkforce(p.workforce)) continue;
    const tranche = String(p.tranche || '');
    const key = `${p.workforceId}::${tranche}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        workforceId: p.workforce.id,
        firstName: p.workforce.firstName,
        lastName: p.workforce.lastName,
        category: p.workforce.category,
        monthly: false,
        tranche,
        task: taskFor(p.workforce.id, tranche, p.workforce.category),
        totalDays: 0,
        advances: 0,
        bonuses: 0,
        brut: 0,
        days: [],
      };
      buckets.set(key, bucket);
    }
    const rate = pointageRate(p, p.workforce.dailySalary || 0);
    const brut = pointageBrut(p, p.workforce.dailySalary || 0);
    bucket.totalDays += p.totalDay;
    bucket.advances += p.advance;
    bucket.bonuses += p.bonus;
    bucket.brut += brut;
    bucket.days.push({
      id: p.id,
      date: p.date,
      tranche,
      task: bucket.task,
      remark: p.session?.remark || '',
      days: p.totalDay,
      hours: p.hours,
      rate,
      brut,
      advance: p.advance,
      bonus: p.bonus,
      net: brut + p.bonus - p.advance,
    });
  }

  const monthlyWorkers = await prisma.workforce.findMany({
    where: {
      salaryPeriod: 'mois',
      assignments: { some: { chantierId } },
      ...categoryWhere,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      category: true,
      monthlySalary: true,
    },
  });
  for (const w of monthlyWorkers) {
    const key = `${w.id}::`;
    if (buckets.has(key)) continue;
    buckets.set(key, {
      workforceId: w.id,
      firstName: w.firstName,
      lastName: w.lastName,
      category: w.category,
      monthly: true,
      tranche: '',
      task: taskFor(w.id, '', w.category),
      totalDays: 0,
      advances: 0,
      bonuses: 0,
      brut: Number(w.monthlySalary) || 0,
      days: [],
    });
  }

  const ids = [...new Set([...buckets.values()].map((b) => b.workforceId))];
  const records = ids.length
    ? await prisma.workforcePayrollRecord.findMany({
        where: { workforceId: { in: ids }, periodYear: py, periodMonth: pm },
      })
    : [];

  const lines = [...buckets.values()]
    .map((b) => {
      const netDue = b.brut + b.bonuses - b.advances;
      const record = records.find((r) => (
        r.workforceId === b.workforceId
        && r.chantierId === (b.monthly ? '' : chantierId)
        && String(r.tranche || '') === (b.monthly ? '' : b.tranche)
      ));
      const paid = record?.amountPaid ?? 0;
      const remaining = Math.max(0, netDue - paid);
      const status = netDue <= 0 ? 'none' : remaining <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
      return {
        id: `${b.workforceId}::${b.tranche}`,
        workforceId: b.workforceId,
        firstName: b.firstName,
        lastName: b.lastName,
        category: b.category,
        monthly: b.monthly,
        chantierName: chantier.name,
        tranche: b.tranche,
        task: b.task,
        totalDays: b.totalDays,
        advances: b.advances,
        netDue,
        amountPaid: paid,
        remaining,
        status,
        paymentMode: record?.paymentMode || null,
        paidAt: record?.paidAt || null,
        days: b.days
          .slice()
          .sort((a, c) => c.date.getTime() - a.date.getTime()),
      };
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.tranche.localeCompare(b.tranche, 'fr'));

  const totals = lines.reduce(
    (s, line) => ({
      totalDays: s.totalDays + line.totalDays,
      advances: s.advances + line.advances,
      remaining: s.remaining + line.remaining,
    }),
    { totalDays: 0, advances: 0, remaining: 0 },
  );

  res.json({ periodYear: py, periodMonth: pm, lines, totals });
});

router.get('/salaries/:workforceId', async (req, res) => {
  const workforceId = String(req.params.workforceId);
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const { from, to } = parseDateRange(dateFrom, dateTo);

  const worker = await prisma.workforce.findUnique({
    where: { id: workforceId },
    include: { assignments: { include: { chantier: true }, take: 3 } },
  });
  if (!worker) return res.status(404).json({ message: 'Ouvrier introuvable' });

  const pointages = await prisma.pointage.findMany({
    where: {
      workforceId,
      validated: true,
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    include: { chantier: { select: { id: true, name: true } } },
    orderBy: { date: 'desc' },
  });

  const salary = computeWorkerPeriodSalary(worker, pointages);
  res.json({
    worker,
    salary: {
      ...salary,
      dailySalary: worker.dailySalary,
      monthlySalary: worker.monthlySalary,
      salaryPeriod: salary.salaryPeriod,
    },
    pointages: isMonthlyWorkforce(worker) ? [] : pointages,
  });
});

router.get('/pointage/stats', async (req, res) => {
  const where = await buildPointageWhere({
    dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : null,
    dateTo: req.query.dateTo ? String(req.query.dateTo) : null,
    chantierId: String(req.query.chantierId || ''),
    workforceId: String(req.query.workforceId || ''),
    validated: String(req.query.validated || ''),
    tranche: String(req.query.tranche || ''),
  });

  const [total, validatedCount, agg, rows] = await Promise.all([
    prisma.pointage.count({ where }),
    prisma.pointage.count({ where: { AND: [...(where.AND as object[]), { validated: true }] } }),
    prisma.pointage.aggregate({ where, _sum: { totalDay: true, advance: true, bonus: true } }),
    prisma.pointage.findMany({
      where,
      include: { workforce: { select: { dailySalary: true } } },
    }),
  ]);

  const estimatedCost = rows.reduce(
    (s, p) => s + pointageBrut(p, p.workforce?.dailySalary || 0),
    0
  );

  res.json({
    total,
    validated: validatedCount,
    pending: total - validatedCount,
    totalDays: agg._sum.totalDay || 0,
    advances: agg._sum.advance || 0,
    bonuses: agg._sum.bonus || 0,
    estimatedCost,
  });
});

router.get('/pointage/export/csv', async (req, res) => {
  const where = await buildPointageWhere({
    dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : null,
    dateTo: req.query.dateTo ? String(req.query.dateTo) : null,
    chantierId: String(req.query.chantierId || ''),
    workforceId: String(req.query.workforceId || ''),
    validated: String(req.query.validated || ''),
    tranche: String(req.query.tranche || ''),
  });

  const pointages = await prisma.pointage.findMany({
    where,
    include: { workforce: true, chantier: true },
    orderBy: { date: 'desc' },
  });

  const header = 'Date;Ouvrier;Chantier;Journée;Heures;Total j.;Tarif/j;Avance;Prime;Validé';
  const rows = pointages.map(
    (p) =>
      `${p.date.toISOString().slice(0, 10)};${p.workforce.firstName} ${p.workforce.lastName};${p.chantier?.name || ''};${p.dayValue};${p.hours};${p.totalDay};${p.dayRate ?? p.workforce.dailySalary};${p.advance};${p.bonus};${p.validated ? 'Oui' : 'Non'}`
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=pointage-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/pointage/export/xlsx', async (req, res) => {
  const where = await buildPointageWhere({
    dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : null,
    dateTo: req.query.dateTo ? String(req.query.dateTo) : null,
    chantierId: String(req.query.chantierId || ''),
    workforceId: String(req.query.workforceId || ''),
    validated: String(req.query.validated || ''),
    tranche: String(req.query.tranche || ''),
  });

  const pointages = await prisma.pointage.findMany({
    where,
    include: { workforce: true, chantier: true },
    orderBy: { date: 'desc' },
    take: 5000,
  });

  sendExcel(
    res,
    'pointage-gic.xlsx',
    'Pointage',
    pointages.map((p) => ({
      Date: p.date.toISOString().slice(0, 10),
      Référence: p.workforce.reference || '',
      Ouvrier: `${p.workforce.firstName} ${p.workforce.lastName}`,
      Chantier: p.chantier?.name || '',
      Journée: p.dayValue,
      Heures: p.hours,
      'Total j.': p.totalDay,
      'Tarif/j': p.dayRate ?? p.workforce.dailySalary,
      'Brut est.': pointageBrut(p, p.workforce.dailySalary || 0),
      Avance: p.advance,
      Prime: p.bonus,
      Validé: p.validated ? 'Oui' : 'Non',
    }))
  );
});

router.get('/pointage/salary-summary', async (req, res) => {
  const workforceId = String(req.query.workforceId || '');
  if (!workforceId) return res.status(400).json({ message: 'workforceId requis' });
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const { from, to } = parseDateRange(dateFrom, dateTo);

  const worker = await prisma.workforce.findUnique({ where: { id: workforceId } });
  if (!worker) return res.status(404).json({ message: 'Ouvrier introuvable' });
  const pointages = await prisma.pointage.findMany({
    where: {
      workforceId,
      validated: true,
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
  });
  const salary = computeWorkerPeriodSalary(worker, pointages);
  res.json({
    ...salary,
    dailySalary: worker.dailySalary,
    monthlySalary: worker.monthlySalary,
    salaryPeriod: salary.salaryPeriod,
  });
});

// --- Gestion du pointage : un pointage = une journée d'un chantier / d'une tranche ---
const sessionLineInclude = {
  workforce: true,
  chantier: { select: { id: true, name: true } },
} as const;

function summarizeSessionLines(
  lines: Array<{
    totalDay: number;
    advance: number;
    bonus: number;
    dayRate: number | null;
    validated: boolean;
    workforce?: { dailySalary: number } | null;
  }>,
) {
  return {
    linesCount: lines.length,
    validatedCount: lines.filter((l) => l.validated).length,
    totalDays: lines.reduce((s, l) => s + l.totalDay, 0),
    brut: lines.reduce((s, l) => s + pointageBrut(l, l.workforce?.dailySalary || 0), 0),
    advances: lines.reduce((s, l) => s + l.advance, 0),
    bonuses: lines.reduce((s, l) => s + l.bonus, 0),
  };
}

async function sessionScopeList(chantierId: string, tranche: string) {
  return prisma.pointageSession.findMany({
    where: { chantierId, ...(tranche ? { tranche } : {}) },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    include: { lines: { include: { workforce: { select: { dailySalary: true, category: true } } } } },
  });
}

async function sessionDetail(id: string) {
  const session = await prisma.pointageSession.findUnique({
    where: { id },
    include: {
      chantier: { select: { id: true, name: true } },
      lines: { include: sessionLineInclude, orderBy: { workforce: { lastName: 'asc' } } },
    },
  });
  if (!session) return null;
  return { ...session, ...summarizeSessionLines(session.lines) };
}

router.get('/pointage/sessions', async (req, res) => {
  const chantierId = String(req.query.chantierId || '').trim();
  if (!chantierId) return res.status(400).json({ message: 'chantierId requis' });
  const tranche = normalizeTranche(req.query.tranche);
  const category = String(req.query.category || '').trim();
  const excludeCategory = String(req.query.excludeCategory || '').trim();
  const sessions = await sessionScopeList(chantierId, tranche);
  const scoped = sessions
    .map((s) => ({
      ...s,
      lines: s.lines.filter((line) => {
        const cat = line.workforce?.category || '';
        if (category) return cat === category;
        if (excludeCategory) return cat !== excludeCategory;
        return true;
      }),
    }))
    .filter((s) => !category && !excludeCategory || s.lines.length > 0);
  res.json(
    scoped.map((s, i) => {
      const { lines, ...rest } = s;
      return { ...rest, index: i + 1, ...summarizeSessionLines(lines) };
    }),
  );
});

function coversPointageDay(
  assignment: { startDate: Date; endDate: Date | null; suspendedFrom: Date | null; suspendedUntil: Date | null },
  day: Date,
) {
  const start = new Date(assignment.startDate);
  start.setHours(0, 0, 0, 0);
  if (start > day) return false;
  if (assignment.endDate) {
    const end = new Date(assignment.endDate);
    end.setHours(23, 59, 59, 999);
    if (end < day) return false;
  }
  if (assignment.suspendedFrom) {
    const from = new Date(assignment.suspendedFrom);
    from.setHours(0, 0, 0, 0);
    const until = assignment.suspendedUntil ? new Date(assignment.suspendedUntil) : null;
    if (until) until.setHours(23, 59, 59, 999);
    if (day >= from && (!until || day <= until)) return false;
  }
  return true;
}

/** Crée le pointage du jour, s'il manque, et y ajoute les ouvriers affectés à cette date. */
router.post('/pointage/sessions/ensure', async (req, res) => {
  const chantierId = String(req.body.chantierId || '').trim();
  if (!chantierId || !req.body.date) return res.status(400).json({ message: 'Chantier et date requis' });
  let date: Date;
  try {
    date = parsePointageDate(String(req.body.date));
  } catch {
    return res.status(400).json({ message: 'Date invalide' });
  }
  const category = String(req.body.category || '').trim();
  const excludeCategory = String(req.body.excludeCategory || '').trim();
  const trancheSpecified = Object.prototype.hasOwnProperty.call(req.body, 'tranche');
  const onlyTranche = trancheSpecified ? normalizeTranche(req.body.tranche) : null;

  const assignments = await prisma.workforceAssignment.findMany({
    where: {
      chantierId,
      workforce: {
        isActive: true,
        ...(category ? { category } : {}),
        ...(excludeCategory
          ? { OR: [{ category: null }, { category: '' }, { category: { not: excludeCategory } }] }
          : {}),
      },
    },
    include: { workforce: { select: { id: true, dailySalary: true, salaryPeriod: true, contractType: true } } },
  });
  const active = assignments.filter((row) => coversPointageDay(row, date) && !isMonthlyWorkforce(row.workforce));
  const byTranche = new Map<string, typeof active>();
  for (const row of active) {
    const name = String(row.tranche || '').trim();
    const list = byTranche.get(name) || [];
    list.push(row);
    byTranche.set(name, list);
  }

  const targets = onlyTranche != null
    ? [onlyTranche]
    : [...byTranche.keys()].filter((name) => name || ![...byTranche.keys()].some(Boolean));

  let primaryId: string | null = null;
  for (const tranche of targets) {
    const workers = byTranche.get(tranche) || [];
    let session = await prisma.pointageSession.findFirst({ where: { chantierId, tranche, date } });
    if (!session) {
      const conflict = await findSessionConflict(chantierId, tranche, date);
      if (conflict) {
        if (!primaryId) primaryId = conflict.existingId;
        continue;
      }
      if (!workers.length && trancheSpecified) continue;
      if (!workers.length) continue;
      session = await prisma.pointageSession.create({
        data: { chantierId, tranche, date },
      });
    }
    const already = new Set(
      (await prisma.pointage.findMany({
        where: { chantierId, date },
        select: { workforceId: true },
      })).map((row) => row.workforceId),
    );
    for (const row of workers) {
      if (already.has(row.workforceId)) continue;
      await prisma.pointage.create({
        data: {
          date,
          workforceId: row.workforceId,
          chantierId,
          sessionId: session.id,
          tranche: tranche || null,
          dayValue: 1,
          hours: 8,
          totalDay: 1,
          dayRate: row.workforce.dailySalary > 0 ? row.workforce.dailySalary : null,
        },
      });
      already.add(row.workforceId);
    }
    primaryId = session.id;
  }

  res.json({ id: primaryId });
});

router.get('/pointage/sessions/:id', async (req, res) => {
  const detail = await sessionDetail(String(req.params.id));
  if (!detail) return res.status(404).json({ message: 'Pointage introuvable' });
  res.json(detail);
});

router.post('/pointage/sessions', async (req, res) => {
  const chantierId = String(req.body.chantierId || '').trim();
  const tranche = normalizeTranche(req.body.tranche);
  if (!chantierId || !req.body.date) {
    return res.status(400).json({ message: 'Chantier et date requis' });
  }
  const chantier = await prisma.chantier.findUnique({ where: { id: chantierId }, select: { id: true, name: true } });
  if (!chantier) return res.status(404).json({ message: 'Chantier introuvable' });
  if (tranche) {
    const trancheExists = await prisma.chantierTranche.findFirst({ where: { chantierId, name: tranche } });
    if (!trancheExists) return res.status(404).json({ message: 'Tranche introuvable' });
  }
  let date: Date;
  try {
    date = parsePointageDate(String(req.body.date));
  } catch {
    return res.status(400).json({ message: 'Date invalide' });
  }
  const conflict = await findSessionConflict(chantierId, tranche, date);
  if (conflict) return res.status(409).json(conflict);

  const session = await prisma.pointageSession.create({
    data: {
      chantierId,
      tranche,
      date,
      remark: req.body.remark ? String(req.body.remark).trim() : null,
    },
  });

  if (req.body.copyPrevious) {
    const previous = await prisma.pointageSession.findFirst({
      where: { chantierId, tranche, date: { lt: date } },
      orderBy: { date: 'desc' },
      include: { lines: { include: { workforce: true } } },
    });
    const alreadyPointed = new Set(
      (
        await prisma.pointage.findMany({
          where: { chantierId, date },
          select: { workforceId: true },
        })
      ).map((p) => p.workforceId),
    );
    for (const line of previous?.lines || []) {
      if (!line.workforce.isActive || isMonthlyWorkforce(line.workforce)) continue;
      if (alreadyPointed.has(line.workforceId)) continue;
      await prisma.pointage.create({
        data: {
          date,
          workforceId: line.workforceId,
          chantierId,
          sessionId: session.id,
          tranche: tranche || null,
          dayValue: 1,
          hours: 8,
          totalDay: 1,
          dayRate: line.dayRate,
        },
      });
    }
  }

  await audit(
    req,
    'création',
    'PointageSession',
    session.id,
    `${chantier.name}${tranche ? ` — ${tranche}` : ''} — ${String(req.body.date).slice(0, 10)}`,
  );
  res.status(201).json(await sessionDetail(session.id));
});

router.put('/pointage/sessions/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.pointageSession.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Pointage introuvable' });
  await prisma.pointageSession.update({
    where: { id },
    data: { remark: req.body.remark != null ? String(req.body.remark).trim() || null : existing.remark },
  });
  res.json(await sessionDetail(id));
});

/** Enregistrement groupé (par lot) des lignes d'un pointage. */
router.post('/pointage/sessions/:id/lines', async (req, res) => {
  const id = String(req.params.id);
  const session = await prisma.pointageSession.findUnique({ where: { id } });
  if (!session) return res.status(404).json({ message: 'Pointage introuvable' });
  const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
  if (!lines.length) return res.status(400).json({ message: 'Aucune ligne à enregistrer' });

  const errors: string[] = [];
  let saved = 0;
  for (const raw of lines) {
    const workforceId = String(raw?.workforceId || '').trim();
    if (!workforceId) continue;
    const worker = await prisma.workforce.findUnique({
      where: { id: workforceId },
      select: { id: true, salaryPeriod: true, firstName: true, lastName: true },
    });
    if (!worker) {
      errors.push(`Ouvrier introuvable (${workforceId})`);
      continue;
    }
    const name = `${worker.firstName} ${worker.lastName}`;
    if (isMonthlyWorkforce(worker)) {
      errors.push(`${name} est payé au mois — pas de pointage`);
      continue;
    }
    const other = await prisma.pointage.findUnique({
      where: {
        date_workforceId_chantierId: { date: session.date, workforceId, chantierId: session.chantierId },
      },
    });
    if (other && other.sessionId && other.sessionId !== id) {
      errors.push(`${name} est déjà pointé ce jour sur ce chantier${other.tranche ? ` (tranche ${other.tranche})` : ''}`);
      continue;
    }
    const dv = parseDayValue(raw.dayValue ?? 1);
    const rate =
      raw.dayRate != null && raw.dayRate !== '' && !Number.isNaN(Number(raw.dayRate)) ? Number(raw.dayRate) : null;
    const validated = raw.validated != null ? !!raw.validated : other?.validated ?? false;
    const data = {
      sessionId: id,
      tranche: session.tranche || null,
      dayValue: dv,
      hours: dv * 8,
      totalDay: dv,
      dayRate: rate,
      advance: Number(raw.advance) || 0,
      bonus: Number(raw.bonus) || 0,
      validated,
      validatedAt: validated ? other?.validatedAt || new Date() : null,
    };
    if (other) {
      await prisma.pointage.update({ where: { id: other.id }, data });
    } else {
      await prisma.pointage.create({
        data: { ...data, date: session.date, workforceId, chantierId: session.chantierId },
      });
    }
    await syncWorkforceDailyRateFromPointage(req, workforceId, rate);
    saved++;
  }
  await prisma.pointageSession.update({ where: { id }, data: { updatedAt: new Date() } });
  if (saved) {
    await audit(req, 'pointage', 'PointageSession', id, `${saved} ligne(s) enregistrée(s)`);
  }
  res.json({ saved, errors, session: await sessionDetail(id) });
});

router.put('/pointage/sessions/:id/validate', async (req, res) => {
  const id = String(req.params.id);
  const session = await prisma.pointageSession.findUnique({ where: { id } });
  if (!session) return res.status(404).json({ message: 'Pointage introuvable' });
  const validated = req.body.validated !== false;
  await prisma.pointage.updateMany({
    where: { sessionId: id },
    data: { validated, validatedAt: validated ? new Date() : null },
  });
  await audit(req, validated ? 'validation' : 'dévalidation', 'PointageSession', id, session.date.toISOString().slice(0, 10));
  res.json(await sessionDetail(id));
});

router.delete('/pointage/sessions/:id', async (req, res) => {
  const id = String(req.params.id);
  const session = await prisma.pointageSession.findUnique({
    where: { id },
    include: { chantier: { select: { name: true } }, _count: { select: { lines: true } } },
  });
  if (!session) return res.status(404).json({ message: 'Pointage introuvable' });
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });
  await prisma.$transaction([
    prisma.pointage.deleteMany({ where: { sessionId: id } }),
    prisma.pointageSession.delete({ where: { id } }),
  ]);
  await audit(
    req,
    'suppression',
    'PointageSession',
    id,
    `${session.chantier.name}${session.tranche ? ` — ${session.tranche}` : ''} — ${session.date
      .toISOString()
      .slice(0, 10)} — ${session._count.lines} ligne(s) — ${motif}`,
  );
  res.json({ ok: true, deletedLines: session._count.lines });
});

/** Synthèse par ouvrier (chantier / tranche / période). */
router.get('/pointage/by-worker', async (req, res) => {
  const where = await buildPointageWhere({
    dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : null,
    dateTo: req.query.dateTo ? String(req.query.dateTo) : null,
    chantierId: String(req.query.chantierId || ''),
    validated: String(req.query.validated || ''),
    tranche: String(req.query.tranche || ''),
    category: String(req.query.category || ''),
    excludeCategory: String(req.query.excludeCategory || ''),
  });
  const rows = await prisma.pointage.findMany({
    where,
    include: { workforce: true },
    orderBy: { date: 'asc' },
  });
  const map = new Map<
    string,
    {
      workforce: (typeof rows)[number]['workforce'];
      lines: number;
      validatedLines: number;
      totalDays: number;
      brut: number;
      bonuses: number;
      advances: number;
      firstDate: Date;
      lastDate: Date;
    }
  >();
  for (const p of rows) {
    let entry = map.get(p.workforceId);
    if (!entry) {
      entry = {
        workforce: p.workforce,
        lines: 0,
        validatedLines: 0,
        totalDays: 0,
        brut: 0,
        bonuses: 0,
        advances: 0,
        firstDate: p.date,
        lastDate: p.date,
      };
      map.set(p.workforceId, entry);
    }
    entry.lines++;
    if (p.validated) entry.validatedLines++;
    entry.totalDays += p.totalDay;
    entry.brut += pointageBrut(p, p.workforce.dailySalary || 0);
    entry.bonuses += p.bonus;
    entry.advances += p.advance;
    if (p.date < entry.firstDate) entry.firstDate = p.date;
    if (p.date > entry.lastDate) entry.lastDate = p.date;
  }
  const items = [...map.values()]
    .map((e) => ({
      workforceId: e.workforce.id,
      workforce: {
        id: e.workforce.id,
        reference: e.workforce.reference,
        firstName: e.workforce.firstName,
        lastName: e.workforce.lastName,
        category: e.workforce.category,
        photo: e.workforce.photo,
        dailySalary: e.workforce.dailySalary,
      },
      lines: e.lines,
      validatedLines: e.validatedLines,
      totalDays: e.totalDays,
      brut: e.brut,
      bonuses: e.bonuses,
      advances: e.advances,
      remaining: e.brut + e.bonuses - e.advances,
      firstDate: e.firstDate,
      lastDate: e.lastDate,
    }))
    .sort((a, b) => a.workforce.lastName.localeCompare(b.workforce.lastName, 'fr'));
  const totals = items.reduce(
    (s, i) => ({
      workers: s.workers + 1,
      totalDays: s.totalDays + i.totalDays,
      brut: s.brut + i.brut,
      bonuses: s.bonuses + i.bonuses,
      advances: s.advances + i.advances,
      remaining: s.remaining + i.remaining,
    }),
    { workers: 0, totalDays: 0, brut: 0, bonuses: 0, advances: 0, remaining: 0 },
  );
  res.json({ items, totals });
});

router.get('/pointage/day', async (req, res) => {
  const date = req.query.date ? String(req.query.date) : new Date().toISOString().slice(0, 10);
  const chantierId = String(req.query.chantierId || '');
  const where = await buildPointageWhere({
    dateFrom: date,
    dateTo: date,
    chantierId,
    tranche: String(req.query.tranche || ''),
  });
  // Sans chantierId : tous les pointages du jour (tous chantiers) — matrice multi-projets
  const pointages = await prisma.pointage.findMany({
    where,
    include: { workforce: true, chantier: true },
    orderBy: [{ workforce: { lastName: 'asc' } }, { chantier: { name: 'asc' } }],
  });
  res.json(pointages);
});

router.get('/pointage', async (req, res) => {
  const sort = String(req.query.sort || 'date');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const where = await buildPointageWhere({
    dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : null,
    dateTo: req.query.dateTo ? String(req.query.dateTo) : null,
    chantierId: String(req.query.chantierId || ''),
    workforceId: String(req.query.workforceId || ''),
    validated: String(req.query.validated || ''),
    tranche: String(req.query.tranche || ''),
    category: String(req.query.category || ''),
    excludeCategory: String(req.query.excludeCategory || ''),
  });

  const orderBy =
    sort === 'totalDay'
      ? { totalDay: order as 'asc' | 'desc' }
      : { date: order as 'asc' | 'desc' };

  const [items, total] = await Promise.all([
    prisma.pointage.findMany({
      where,
      include: { workforce: true, chantier: true },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.pointage.count({ where }),
  ]);

  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

/** dayValue float libre (pas de round 0.5) — pas de 0.125 = 1 h (8 h / j). */
function parseDayValue(raw: unknown) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

router.post('/pointage', async (req, res) => {
  const {
    date,
    workforceId,
    chantierId,
    dayValue = 0,
    advance = 0,
    bonus = 0,
    validated,
    dayRate,
  } = req.body;
  if (!date || !workforceId) {
    return res.status(400).json({ message: 'date et workforceId requis' });
  }
  // Unique Prisma date_workforceId_chantierId exige un chantierId non null
  const cid = String(chantierId || '').trim();
  if (!cid) {
    return res.status(400).json({ message: 'chantierId requis (pointage par chantier)' });
  }
  const chantierExists = await prisma.chantier.findUnique({ where: { id: cid }, select: { id: true } });
  if (!chantierExists) return res.status(404).json({ message: 'Chantier introuvable' });

  const workerCheck = await prisma.workforce.findUnique({
    where: { id: String(workforceId) },
    select: { salaryPeriod: true, firstName: true, lastName: true },
  });
  if (!workerCheck) return res.status(404).json({ message: 'Ouvrier introuvable' });
  if (isMonthlyWorkforce(workerCheck)) {
    return res.status(400).json({
      message: `${workerCheck.firstName} ${workerCheck.lastName} est payé au mois — pas de pointage (géré dans Salaires)`,
    });
  }
  const pointageDate = parsePointageDate(String(date));
  const dv = parseDayValue(dayValue);
  const hours = dv * 8;
  const totalDay = dv;
  const rate =
    dayRate != null && dayRate !== '' && !Number.isNaN(Number(dayRate)) ? Number(dayRate) : null;
  const existingLine = await prisma.pointage.findUnique({
    where: {
      date_workforceId_chantierId: { date: pointageDate, workforceId: String(workforceId), chantierId: cid },
    },
    select: { sessionId: true },
  });
  const session = existingLine?.sessionId
    ? null
    : await resolveSessionForLine(cid, pointageDate, req.body.tranche);
  const pointage = await prisma.pointage.upsert({
    where: {
      date_workforceId_chantierId: {
        date: pointageDate,
        workforceId: String(workforceId),
        chantierId: cid,
      },
    },
    create: {
      date: pointageDate,
      workforceId: String(workforceId),
      chantierId: cid,
      sessionId: session?.id ?? null,
      tranche: session?.tranche || null,
      dayValue: dv,
      hours,
      totalDay,
      dayRate: rate,
      advance: Number(advance) || 0,
      bonus: Number(bonus) || 0,
      validated: !!validated,
      validatedAt: validated ? new Date() : null,
    },
    update: {
      ...(session ? { sessionId: session.id, tranche: session.tranche || null } : {}),
      dayValue: dv,
      hours,
      totalDay,
      dayRate: rate,
      advance: Number(advance) || 0,
      bonus: Number(bonus) || 0,
      validated: !!validated,
      validatedAt: validated ? new Date() : null,
    },
    include: { workforce: true, chantier: true },
  });
  await syncWorkforceDailyRateFromPointage(req, String(workforceId), rate);
  const refreshed = await prisma.pointage.findUnique({
    where: { id: pointage.id },
    include: { workforce: true, chantier: true },
  });
  await audit(req, 'pointage', 'Pointage', pointage.id, `${workforceId} — ${date} — ${cid}`);
  res.status(201).json(refreshed || pointage);
});

router.get('/pointage/:id', async (req, res) => {
  const pointage = await prisma.pointage.findUnique({
    where: { id: String(req.params.id) },
    include: { workforce: true, chantier: true },
  });
  if (!pointage) return res.status(404).json({ message: 'Pointage introuvable' });
  res.json(pointage);
});

router.put('/pointage/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.pointage.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Pointage introuvable' });

  const dayValue = req.body.dayValue != null ? parseDayValue(req.body.dayValue) : existing.dayValue;
  const hours = dayValue * 8;
  const totalDay = dayValue;
  const validated = req.body.validated != null ? !!req.body.validated : existing.validated;
  const dayRate =
    req.body.dayRate !== undefined
      ? req.body.dayRate != null && req.body.dayRate !== '' && !Number.isNaN(Number(req.body.dayRate))
        ? Number(req.body.dayRate)
        : null
      : existing.dayRate;

  const nextChantierId =
    req.body.chantierId !== undefined ? req.body.chantierId || null : existing.chantierId;
  let sessionPatch: { sessionId: string | null; tranche: string | null } | null = null;
  if (nextChantierId !== existing.chantierId) {
    if (nextChantierId) {
      const s = await resolveSessionForLine(nextChantierId, existing.date);
      sessionPatch = { sessionId: s.id, tranche: s.tranche || null };
    } else {
      sessionPatch = { sessionId: null, tranche: null };
    }
  }
  const pointage = await prisma.pointage.update({
    where: { id },
    data: {
      chantierId: nextChantierId,
      ...(sessionPatch || {}),
      dayValue,
      hours,
      totalDay,
      dayRate,
      advance: req.body.advance != null ? Number(req.body.advance) : existing.advance,
      bonus: req.body.bonus != null ? Number(req.body.bonus) : existing.bonus,
      validated,
      validatedAt: validated ? (existing.validatedAt || new Date()) : null,
    },
    include: { workforce: true, chantier: true },
  });
  await syncWorkforceDailyRateFromPointage(req, existing.workforceId, dayRate);
  const refreshed = await prisma.pointage.findUnique({
    where: { id },
    include: { workforce: true, chantier: true },
  });
  await audit(req, 'modification', 'Pointage', id, pointage.workforce.firstName);
  res.json(refreshed || pointage);
});

router.delete('/pointage/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  await prisma.pointage.delete({ where: { id } });
  await audit(req, 'suppression', 'Pointage', id, motif);
  res.json({ ok: true });
});

router.put('/progress/:progressId', async (req, res) => {
  const existing = await prisma.workProgress.findUnique({ where: { id: req.params.progressId } });
  if (!existing) return res.status(404).json({ message: 'Tâche introuvable' });

  const data: { percent?: number; remark?: string | null; phases?: unknown } = {};
  if (req.body.percent != null) {
    data.percent = Math.min(100, Math.max(0, Number(req.body.percent)));
  }
  if (req.body.remark !== undefined) {
    data.remark = req.body.remark ? String(req.body.remark).trim() : null;
  }
  if (req.body.phases !== undefined) {
    const phases = validateWorkProgressPhases(req.body.phases);
    if ('message' in phases) return res.status(400).json({ message: phases.message });
    data.phases = phases;
  }

  const progress = await prisma.workProgress.update({
    where: { id: req.params.progressId },
    data,
  });
  const all = await prisma.workProgress.findMany({ where: { chantierId: progress.chantierId } });
  const avg = all.length ? all.reduce((s, p) => s + p.percent, 0) / all.length : 0;
  await prisma.chantier.update({ where: { id: progress.chantierId }, data: { progressPct: avg } });
  res.json(progress);
});

router.delete('/progress/:progressId', async (req, res) => {
  const progress = await prisma.workProgress.findUnique({ where: { id: String(req.params.progressId) } });
  if (!progress) return res.status(404).json({ message: 'Tâche introuvable' });
  await prisma.workProgress.delete({ where: { id: progress.id } });
  const all = await prisma.workProgress.findMany({ where: { chantierId: progress.chantierId } });
  const avg = all.length ? all.reduce((s, p) => s + p.percent, 0) / all.length : 0;
  await prisma.chantier.update({ where: { id: progress.chantierId }, data: { progressPct: avg } });
  await audit(req, 'suppression', 'WorkProgress', progress.id, progress.taskName);
  res.json({ ok: true });
});

// Chantier routes
function normalizeProjectId(value: unknown) {
  if (value === '' || value == null) return null;
  return String(value);
}

function buildChantierWhere(q: string, status: string, projectId?: string) {
  return {
    AND: [
      q
        ? {
            OR: [
              { name: { contains: q } },
              { address: { contains: q } },
              { managerName: { contains: q } },
            ],
          }
        : {},
      status ? { status } : {},
      projectId ? { projectId } : {},
    ],
  };
}

function toValidDate(v: unknown): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date de début strictement antérieure à la date de fin. */
function dateOrderError(start: unknown, end: unknown) {
  const s = toValidDate(start);
  const e = toValidDate(end);
  if (s && e && s.getTime() >= e.getTime()) {
    return 'La date de début doit être strictement antérieure à la date de fin.';
  }
  return null;
}

router.get('/chefs', async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['CHEF_CHANTIER', 'ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { firstName: 'asc' },
  });
  res.json(users);
});

/** Création rapide d'un chef de chantier (compte utilisateur rôle CHEF_CHANTIER). */
router.post('/chefs', async (req, res) => {
  if (!['ADMIN', 'SUPER_ADMIN'].includes(String(req.user?.role))) {
    return res.status(403).json({ message: 'Seul un administrateur peut créer un chef de chantier' });
  }
  const firstName = String(req.body.firstName || '').trim();
  const lastName = String(req.body.lastName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!firstName || !lastName || !email) {
    return res.status(400).json({ message: 'Prénom, nom et email requis' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Email invalide' });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(400).json({ message: 'Email déjà utilisé' });
  const provided = String(req.body.password || '');
  if (provided && provided.length < 6) {
    return res.status(400).json({ message: 'Mot de passe : 6 caractères minimum' });
  }
  const password = provided || crypto.randomBytes(6).toString('base64url');
  const user = await prisma.user.create({
    data: {
      email,
      firstName,
      lastName,
      role: 'CHEF_CHANTIER',
      passwordHash: await bcrypt.hash(password, 10),
    },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  await audit(req, 'création', 'User', user.id, `Chef de chantier ${user.firstName} ${user.lastName}`);
  res.status(201).json({ ...user, generatedPassword: provided ? null : password });
});

router.get('/stats', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const projectId = String(req.query.projectId || '').trim();
  const chefClause =
    req.user?.role === 'CHEF_CHANTIER' && req.user.id
      ? { managerUserId: req.user.id }
      : {};
  const baseWhere = { AND: [...buildChantierWhere(q, '', projectId).AND, chefClause] };
  const where = { AND: [...buildChantierWhere(q, status, projectId).AND, chefClause] };

  const [total, actifs, termines, suspendus, avgProgress, workerSum, purchaseAgg] = await Promise.all([
    prisma.chantier.count({ where }),
    prisma.chantier.count({ where: { AND: [baseWhere, { status: 'actif' }] } }),
    prisma.chantier.count({ where: { AND: [baseWhere, { status: 'termine' }] } }),
    prisma.chantier.count({ where: { AND: [baseWhere, { status: 'suspendu' }] } }),
    prisma.chantier.aggregate({ where, _avg: { progressPct: true } }),
    prisma.chantier.aggregate({ where, _sum: { workerCount: true } }),
    prisma.purchase.aggregate({
      _sum: { totalPrice: true },
      where: {
        chantierId: { not: null },
        ...(q || status || projectId || chefClause.managerUserId
          ? { chantier: where }
          : {}),
      },
    }),
  ]);
  res.json({
    total,
    actifs,
    termines,
    suspendus,
    avgProgress: Math.round(avgProgress._avg.progressPct || 0),
    workers: workerSum._sum.workerCount || 0,
    purchaseTotal: purchaseAgg._sum.totalPrice || 0,
  });
});

router.get('/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const projectId = String(req.query.projectId || '').trim();
  const where = buildChantierWhere(q, status, projectId);
  const chantiers = await prisma.chantier.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { _count: { select: { assignments: true, purchases: true } } },
  });
  const header = 'Nom;Adresse;Chef;Ouvriers;Avancement %;Statut;Personnel;Achats;Date début';
  const rows = chantiers.map(
    (c) =>
      `${c.name};${(c.address || '').replace(/;/g, ',')};${c.managerName || ''};${c.workerCount};${Math.round(c.progressPct)};${c.status};${c._count.assignments};${c._count.purchases};${c.startDate ? c.startDate.toISOString().slice(0, 10) : ''}`
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=chantiers-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const projectId = String(req.query.projectId || '').trim();
  const sort = String(req.query.sort || 'createdAt');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const where = buildChantierWhere(q, status, projectId);
  if (req.user?.role === 'CHEF_CHANTIER') {
    where.AND.push({ managerUserId: req.user.id });
  }
  const orderBy =
    sort === 'name'
      ? { name: order as 'asc' | 'desc' }
      : sort === 'progressPct'
        ? { progressPct: order as 'asc' | 'desc' }
        : sort === 'workerCount'
          ? { workerCount: order as 'asc' | 'desc' }
          : { createdAt: order as 'asc' | 'desc' };

  const [items, total] = await Promise.all([
    prisma.chantier.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, city: true, status: true } },
        _count: { select: { assignments: true, purchases: true, missions: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.chantier.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.post('/', async (req, res) => {
  const data = { ...req.body };
  if (data.startDate) data.startDate = new Date(data.startDate);
  if (data.endDate) data.endDate = data.endDate ? new Date(data.endDate) : null;
  const dateErr = dateOrderError(data.startDate, data.endDate);
  if (dateErr) return res.status(400).json({ message: dateErr });
  data.workerCount = Number(data.workerCount || 0);
  data.projectId = normalizeProjectId(data.projectId);
  if (data.managerUserId) data.managerUserId = String(data.managerUserId);
  else data.managerUserId = null;
  if (data.budgetAchats != null) data.budgetAchats = data.budgetAchats ? Number(data.budgetAchats) : null;
  const chantier = await prisma.chantier.create({ data });
  await audit(req, 'création', 'Chantier', chantier.id, chantier.name);
  res.status(201).json(chantier);
});

function buildAvancementWhere(q: string, chantierId: string, status?: string) {
  const statusWhere =
    status === 'completed'
      ? { percent: { gte: 100 } }
      : status === 'in_progress'
        ? { percent: { gt: 0, lt: 100 } }
        : status === 'not_started'
          ? { percent: { lte: 0 } }
          : {};
  return {
    AND: [
      chantierId ? { chantierId } : {},
      statusWhere,
      q
        ? {
            OR: [
              { taskName: { contains: q } },
              { tranche: { contains: q } },
              { groupe: { contains: q } },
              { etage: { contains: q } },
              { chantier: { name: { contains: q } } },
            ],
          }
        : {},
    ],
  };
}

router.get('/avancement/stats', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const chantierId = String(req.query.chantierId || '');
  const status = String(req.query.status || '');
  const where = buildAvancementWhere(q, chantierId, status);
  const baseWhere = buildAvancementWhere(q, chantierId, '');

  const [tasks, avgTask, chantiers] = await Promise.all([
    prisma.workProgress.count({ where }),
    prisma.workProgress.aggregate({ where, _avg: { percent: true } }),
    chantierId
      ? prisma.chantier.count({ where: { id: chantierId, status: 'actif' } })
      : prisma.chantier.count({ where: { status: 'actif' } }),
  ]);

  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  if (status === 'completed') {
    completed = tasks;
  } else if (status === 'in_progress') {
    inProgress = tasks;
  } else if (status === 'not_started') {
    notStarted = tasks;
  } else {
    [completed, inProgress, notStarted] = await Promise.all([
      prisma.workProgress.count({ where: { ...baseWhere, percent: { gte: 100 } } }),
      prisma.workProgress.count({ where: { ...baseWhere, percent: { gt: 0, lt: 100 } } }),
      prisma.workProgress.count({ where: { ...baseWhere, percent: { lte: 0 } } }),
    ]);
  }

  const avgChantier = chantierId
    ? await prisma.chantier.aggregate({ where: { id: chantierId }, _avg: { progressPct: true } })
    : await prisma.chantier.aggregate({ _avg: { progressPct: true } });

  res.json({
    tasks,
    chantiersActifs: chantiers,
    avgProgress: Math.round(avgChantier._avg.progressPct || 0),
    avgTaskProgress: Math.round(avgTask._avg.percent || 0),
    completed,
    inProgress,
    notStarted,
  });
});

router.get('/avancement/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const chantierId = String(req.query.chantierId || '');
  const status = String(req.query.status || '');
  const where = buildAvancementWhere(q, chantierId, status);
  const items = await prisma.workProgress.findMany({
    where,
    include: { chantier: { select: { name: true, progressPct: true } } },
    orderBy: [{ chantier: { name: 'asc' } }, { taskName: 'asc' }],
  });
  const header = 'Chantier;Tâche;Tranche;Groupe;Étage;Avancement %;Chantier %;Dernière MAJ';
  const rows = items.map(
    (p) =>
      `${p.chantier.name};${p.taskName};${p.tranche || ''};${p.groupe || ''};${p.etage || ''};${Math.round(p.percent)};${Math.round(p.chantier.progressPct || 0)};${p.updatedAt.toISOString().slice(0, 10)}`
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=avancement-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/avancement/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const chantierId = String(req.query.chantierId || '');
  const status = String(req.query.status || '');
  const where = buildAvancementWhere(q, chantierId, status);

  const items = await prisma.workProgress.findMany({
    where,
    include: { chantier: { select: { name: true, progressPct: true, managerName: true } } },
    orderBy: [{ chantier: { name: 'asc' } }, { taskName: 'asc' }],
    take: 5000,
  });

  sendExcel(
    res,
    'avancement-gic.xlsx',
    'Avancement',
    items.map((p) => ({
      Chantier: p.chantier.name,
      Chef: p.chantier.managerName || '',
      Tâche: p.taskName,
      Tranche: p.tranche || '',
      Groupe: p.groupe || '',
      Étage: p.etage || '',
      'Avancement %': Math.round(p.percent),
      'Chantier %': Math.round(p.chantier.progressPct || 0),
      Statut: p.percent >= 100 ? 'Terminée' : p.percent > 0 ? 'En cours' : 'Non démarrée',
      'Dernière MAJ': p.updatedAt.toISOString().slice(0, 10),
      Remarque: p.remark || '',
    }))
  );
});

router.get('/avancement', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const chantierId = String(req.query.chantierId || '');
  const status = String(req.query.status || '');
  const sort = String(req.query.sort || 'taskName');
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const where = buildAvancementWhere(q, chantierId, status);

  const orderBy =
    sort === 'percent'
      ? { percent: order as 'asc' | 'desc' }
      : sort === 'updatedAt'
        ? { updatedAt: order as 'asc' | 'desc' }
        : sort === 'chantier'
          ? { chantier: { name: order as 'asc' | 'desc' } }
          : { taskName: order as 'asc' | 'desc' };

  const [items, total] = await Promise.all([
    prisma.workProgress.findMany({
      where,
      include: {
        chantier: { select: { id: true, name: true, progressPct: true, status: true, managerName: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.workProgress.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.get('/:id/tranches', async (req, res) => {
  const chantierId = String(req.params.id);
  const chantier = await prisma.chantier.findUnique({ where: { id: chantierId }, select: { id: true } });
  if (!chantier) return res.status(404).json({ message: 'Chantier introuvable' });
  res.json(await listChantierTranches(chantierId));
});

router.post('/:id/tranches', async (req, res) => {
  const chantierId = String(req.params.id);
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Nom de tranche requis' });
  const chantier = await prisma.chantier.findUnique({ where: { id: chantierId }, select: { id: true } });
  if (!chantier) return res.status(404).json({ message: 'Chantier introuvable' });
  const estimatedStartDate = toValidDate(req.body.estimatedStartDate);
  const estimatedEndDate = toValidDate(req.body.estimatedEndDate);
  const existingTranche = await prisma.chantierTranche.findUnique({
    where: { chantierId_name: { chantierId, name } },
  });
  const dateErr = dateOrderError(
    req.body.estimatedStartDate !== undefined ? estimatedStartDate : existingTranche?.estimatedStartDate,
    req.body.estimatedEndDate !== undefined ? estimatedEndDate : existingTranche?.estimatedEndDate,
  );
  if (dateErr) return res.status(400).json({ message: dateErr });
  if (existingTranche) {
    const updated = await prisma.chantierTranche.update({
      where: { id: existingTranche.id },
      data: {
        remark: req.body.remark !== undefined ? (req.body.remark ? String(req.body.remark).trim() : null) : undefined,
        estimatedStartDate: req.body.estimatedStartDate !== undefined ? estimatedStartDate : undefined,
        estimatedEndDate: req.body.estimatedEndDate !== undefined ? estimatedEndDate : undefined,
      },
    });
    await audit(req, 'modification', 'ChantierTranche', updated.id, updated.name);
    return res.status(200).json(updated);
  }
  const tranche = await prisma.chantierTranche.create({
    data: {
      chantierId,
      name,
      remark: req.body.remark ? String(req.body.remark).trim() : null,
      estimatedStartDate,
      estimatedEndDate,
    },
  });
  await seedStandardTrancheProgress(chantierId, tranche.name);
  await audit(req, 'création', 'ChantierTranche', tranche.id, tranche.name);
  res.status(201).json(tranche);
});

router.get('/:id/tranches/:trancheId', async (req, res) => {
  const chantierId = String(req.params.id);
  const trancheId = String(req.params.trancheId);
  const detail = await getChantierTrancheDetail(chantierId, trancheId);
  if (!detail) return res.status(404).json({ message: 'Tranche introuvable' });
  res.json(detail);
});

router.put('/:id/tranches/:trancheId', async (req, res) => {
  const chantierId = String(req.params.id);
  const trancheId = String(req.params.trancheId);
  const tranche = await prisma.chantierTranche.findFirst({ where: { id: trancheId, chantierId } });
  if (!tranche) return res.status(404).json({ message: 'Tranche introuvable' });
  const newName = req.body.name != null ? String(req.body.name).trim() : tranche.name;
  const remark = req.body.remark !== undefined ? (req.body.remark ? String(req.body.remark).trim() : null) : tranche.remark;
  if (!newName) return res.status(400).json({ message: 'Nom requis' });
  const oldName = tranche.name;
  const data: {
    name: string;
    remark: string | null;
    estimatedStartDate?: Date | null;
    estimatedEndDate?: Date | null;
  } = { name: newName, remark };
  if (req.body.estimatedStartDate !== undefined) {
    data.estimatedStartDate = toValidDate(req.body.estimatedStartDate);
  }
  if (req.body.estimatedEndDate !== undefined) {
    data.estimatedEndDate = toValidDate(req.body.estimatedEndDate);
  }
  const dateErr = dateOrderError(
    data.estimatedStartDate !== undefined ? data.estimatedStartDate : tranche.estimatedStartDate,
    data.estimatedEndDate !== undefined ? data.estimatedEndDate : tranche.estimatedEndDate,
  );
  if (dateErr) return res.status(400).json({ message: dateErr });
  if (newName !== oldName) {
    const clash = await prisma.chantierTranche.findUnique({
      where: { chantierId_name: { chantierId, name: newName } },
    });
    if (clash) return res.status(400).json({ message: `Une tranche « ${newName} » existe déjà sur ce chantier` });
  }
  const updated = await prisma.chantierTranche.update({ where: { id: trancheId }, data });
  if (newName !== oldName) {
    await Promise.all([
      prisma.workProgress.updateMany({ where: { chantierId, tranche: oldName }, data: { tranche: newName } }),
      prisma.workforceAssignment.updateMany({ where: { chantierId, tranche: oldName }, data: { tranche: newName } }),
      prisma.mission.updateMany({ where: { chantierId, tranche: oldName }, data: { tranche: newName } }),
      prisma.purchase.updateMany({ where: { chantierId, tranche: oldName }, data: { tranche: newName } }),
      prisma.pointage.updateMany({ where: { chantierId, tranche: oldName }, data: { tranche: newName } }),
      prisma.pointageSession.updateMany({ where: { chantierId, tranche: oldName }, data: { tranche: newName } }),
    ]);
  }
  await audit(req, 'modification', 'ChantierTranche', trancheId, updated.name);
  res.json(updated);
});

router.delete('/:id/tranches/:trancheId', async (req, res) => {
  const chantierId = String(req.params.id);
  const trancheId = String(req.params.trancheId);
  const tranche = await prisma.chantierTranche.findFirst({ where: { id: trancheId, chantierId } });
  if (!tranche) return res.status(404).json({ message: 'Tranche introuvable' });

  const [progress, pointages, missions, purchases] = await Promise.all([
    prisma.workProgress.count({
      where: {
        chantierId,
        tranche: tranche.name,
        OR: [{ percent: { gt: 0 } }, { remark: { not: null } }],
      },
    }),
    prisma.pointage.count({ where: { chantierId, tranche: tranche.name } }),
    prisma.mission.count({ where: { chantierId, tranche: tranche.name } }),
    prisma.purchase.count({ where: { chantierId, tranche: tranche.name } }),
  ]);
  if (progress + pointages + missions + purchases > 0) {
    return res.status(400).json({
      message: `Tranche liée à ${progress} tâche(s) commencée(s), ${pointages} pointage(s), ${missions} mission(s), ${purchases} achat(s) — suppression impossible`,
    });
  }

  await prisma.$transaction([
    prisma.workProgress.deleteMany({ where: { chantierId, tranche: tranche.name } }),
    prisma.workforceAssignment.updateMany({ where: { chantierId, tranche: tranche.name }, data: { tranche: null } }),
    prisma.pointageSession.deleteMany({ where: { chantierId, tranche: tranche.name } }),
    prisma.chantierTranche.delete({ where: { id: trancheId } }),
  ]);
  await audit(req, 'suppression', 'ChantierTranche', trancheId, tranche.name);
  res.json({ ok: true });
});

router.get('/:id/history', async (req, res) => {
  const chantierId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Chantier', entityId: chantierId },
        { details: { contains: chantierId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/:id', async (req, res) => {
  const id = String(req.params.id);
  const chantier = await prisma.chantier.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          city: true,
          status: true,
          description: true,
          tranches: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        },
      },
      managerUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      purchases: { include: { supplier: true }, orderBy: { date: 'desc' } },
      assignments: { include: { workforce: true } },
      progress: true,
      missions: { include: { engin: true } },
      documents: true,
      cameras: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!chantier) return res.status(404).json({ message: 'Chantier introuvable' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [history, pointageToday, pointageValidatedToday, costMOAgg, cnssNonDeclare] = await Promise.all([
    prisma.auditLog.findMany({
      where: { entity: 'Chantier', entityId: id },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.pointage.count({
      where: { chantierId: id, date: { gte: today, lt: tomorrow } },
    }),
    prisma.pointage.count({
      where: { chantierId: id, date: { gte: today, lt: tomorrow }, validated: true },
    }),
    prisma.pointage.aggregate({
      where: { chantierId: id, validated: true },
      _sum: { totalDay: true },
    }),
    prisma.pointage.findMany({
      where: { chantierId: id },
      distinct: ['workforceId'],
      select: { workforceId: true, workforce: { select: { declared: true, isActive: true } } },
    }),
  ]);
  const personnelCount = cnssNonDeclare.length;
  const enginCosts = await chantierEnginCosts(id);

  const overview = buildChantierOverview({
    id: chantier.id,
    budgetAchats: chantier.budgetAchats,
    workerCount: chantier.workerCount,
    progressPct: chantier.progressPct,
    purchases: chantier.purchases,
    progress: chantier.progress,
    assignments: chantier.assignments,
    documents: chantier.documents,
    history,
    pointageToday,
    pointageValidatedToday,
    costMO: Number(costMOAgg._sum.totalDay || 0),
    cnssNonDeclare: cnssNonDeclare.filter((p) => !p.workforce.declared && p.workforce.isActive).length,
    personnelCount,
    costEngins: enginCosts.total,
  });

  res.json({ ...chantier, overview, enginCosts, pointedWorkersCount: personnelCount });
});

router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const data = { ...req.body };
  delete data.id;
  delete data._count;
  delete data.purchases;
  delete data.assignments;
  delete data.progress;
  delete data.missions;
  delete data.documents;
  delete data.cameras;
  delete data.overview;
  delete data.project;
  delete data.pointedWorkersCount;
  if (data.startDate != null) data.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.endDate != null) data.endDate = data.endDate ? new Date(data.endDate) : null;
  if (data.startDate !== undefined || data.endDate !== undefined) {
    const current = await prisma.chantier.findUnique({ where: { id }, select: { startDate: true, endDate: true } });
    if (!current) return res.status(404).json({ message: 'Chantier introuvable' });
    const err = dateOrderError(
      data.startDate !== undefined ? data.startDate : current.startDate,
      data.endDate !== undefined ? data.endDate : current.endDate,
    );
    if (err) return res.status(400).json({ message: err });
  }
  if (data.workerCount != null) data.workerCount = Number(data.workerCount);
  if (data.progressPct != null) data.progressPct = Number(data.progressPct);
  if (data.budgetAchats != null) data.budgetAchats = data.budgetAchats ? Number(data.budgetAchats) : null;
  if ('projectId' in data) data.projectId = normalizeProjectId(data.projectId);
  if ('managerUserId' in data) data.managerUserId = data.managerUserId ? String(data.managerUserId) : null;
  delete data.photo;
  const chantier = await prisma.chantier.update({ where: { id }, data });
  await audit(req, 'modification', 'Chantier', id, chantier.name);
  res.json(chantier);
});

router.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const [purchases, missions, pointages, progress] = await Promise.all([
    prisma.purchase.count({ where: { chantierId: id } }),
    prisma.mission.count({ where: { chantierId: id } }),
    prisma.pointage.count({ where: { chantierId: id } }),
    prisma.workProgress.count({ where: { chantierId: id } }),
  ]);
  const linked = purchases + missions + pointages + progress;
  if (linked > 0) {
    return res.status(400).json({
      message: `Chantier lié à des données (${purchases} achats, ${pointages} pointages, ${missions} missions, ${progress} tâches) — suppression impossible`,
    });
  }

  await prisma.$transaction([
    prisma.workforceAssignment.deleteMany({ where: { chantierId: id } }),
    prisma.chantier.delete({ where: { id } }),
  ]);
  await audit(req, 'suppression', 'Chantier', id, motif);
  res.json({ ok: true });
});

router.get('/:id/assign', async (req, res) => {
  const items = await prisma.workforceAssignment.findMany({
    where: { chantierId: String(req.params.id) },
    include: {
      workforce: { select: { id: true, firstName: true, lastName: true, category: true, groupe: true, phone1: true } },
    },
    orderBy: [{ workforce: { lastName: 'asc' } }, { workforce: { firstName: 'asc' } }],
  });
  res.json(items);
});

function assignmentDates(body: Record<string, unknown>, partial = false) {
  const keys = ['startDate', 'endDate', 'suspendedFrom', 'suspendedUntil'] as const;
  const data: Partial<Record<(typeof keys)[number], Date | null>> = {};
  for (const key of keys) {
    if (partial && !(key in body)) continue;
    const raw = body[key];
    if (raw == null || raw === '') {
      if (key !== 'startDate' && (partial ? key in body : key === 'endDate' || key.startsWith('suspended'))) data[key] = null;
      continue;
    }
    try {
      data[key] = parsePointageDate(String(raw));
    } catch {
      return { error: 'Date invalide', data };
    }
  }
  return { error: '', data };
}

function assignmentSpanError(
  data: Partial<Record<'startDate' | 'endDate' | 'suspendedFrom' | 'suspendedUntil', Date | null>>,
  existing?: { startDate: Date; endDate: Date | null; suspendedFrom: Date | null; suspendedUntil: Date | null },
) {
  const start = data.startDate ?? existing?.startDate;
  const end = 'endDate' in data ? data.endDate : existing?.endDate;
  if (start && end && end < start) return 'La date de fin est avant la date d’affectation';
  const from = 'suspendedFrom' in data ? data.suspendedFrom : existing?.suspendedFrom;
  const until = 'suspendedUntil' in data ? data.suspendedUntil : existing?.suspendedUntil;
  if (until && !from) return 'Le début de la suspension est requis';
  if (from && until && until < from) return 'La fin de la suspension est avant le début';
  return '';
}

router.post('/:id/assign', async (req, res) => {
  const chantierId = String(req.params.id);
  const workforceId = String(req.body.workforceId || '').trim();
  if (!workforceId) return res.status(400).json({ message: 'Ouvrier requis' });

  const worker = await prisma.workforce.findUnique({ where: { id: workforceId } });
  if (!worker) return res.status(404).json({ message: 'Ouvrier introuvable' });

  const existing = await prisma.workforceAssignment.findFirst({ where: { workforceId, chantierId } });
  if (existing) return res.status(400).json({ message: 'Ouvrier déjà affecté à ce chantier' });

  const tranche = req.body.tranche ? String(req.body.tranche).trim() : null;
  const dates = assignmentDates(req.body);
  if (dates.error) return res.status(400).json({ message: dates.error });
  const spanError = assignmentSpanError(dates.data);
  if (spanError) return res.status(400).json({ message: spanError });
  const assignment = await prisma.workforceAssignment.create({
    data: {
      chantierId,
      workforceId,
      functionRole: req.body.functionRole ? String(req.body.functionRole).trim() : null,
      tranche,
      ...dates.data,
    },
    include: { workforce: true },
  });
  await audit(req, 'affectation', 'Chantier', chantierId, `${worker.firstName} ${worker.lastName}`);
  res.status(201).json(assignment);
});

router.put('/:id/assign/:assignmentId', async (req, res) => {
  const chantierId = String(req.params.id);
  const assignmentId = String(req.params.assignmentId);
  const assignment = await prisma.workforceAssignment.findFirst({
    where: { id: assignmentId, chantierId },
    include: { workforce: { select: { firstName: true, lastName: true } } },
  });
  if (!assignment) return res.status(404).json({ message: 'Affectation introuvable' });

  const data: {
    tranche?: string | null;
    functionRole?: string | null;
    startDate?: Date;
    endDate?: Date | null;
    suspendedFrom?: Date | null;
    suspendedUntil?: Date | null;
  } = {};
  if ('tranche' in req.body) data.tranche = req.body.tranche ? String(req.body.tranche).trim() : null;
  if ('functionRole' in req.body) data.functionRole = req.body.functionRole ? String(req.body.functionRole).trim() : null;
  const dates = assignmentDates(req.body, true);
  if (dates.error) return res.status(400).json({ message: dates.error });
  const spanError = assignmentSpanError(dates.data, assignment);
  if (spanError) return res.status(400).json({ message: spanError });
  Object.assign(data, dates.data);
  const updated = await prisma.workforceAssignment.update({
    where: { id: assignmentId },
    data,
    include: { workforce: true },
  });
  await audit(
    req,
    'affectation',
    'Chantier',
    chantierId,
    `${assignment.workforce.firstName} ${assignment.workforce.lastName}${data.tranche ? ` — ${data.tranche}` : ''}`
  );
  res.json(updated);
});

router.post('/:id/assign/:assignmentId/transfer', async (req, res) => {
  const chantierId = String(req.params.id);
  const assignmentId = String(req.params.assignmentId);
  const assignment = await prisma.workforceAssignment.findFirst({
    where: { id: assignmentId, chantierId },
    include: { workforce: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!assignment) return res.status(404).json({ message: 'Affectation introuvable' });

  const destId = String(req.body.chantierId || chantierId).trim();
  const dest = await prisma.chantier.findUnique({ where: { id: destId }, select: { id: true, name: true } });
  if (!dest) return res.status(404).json({ message: 'Chantier de destination introuvable' });
  const tranche = req.body.tranche ? String(req.body.tranche).trim() : null;

  const duplicate = await prisma.workforceAssignment.findFirst({
    where: { workforceId: assignment.workforceId, chantierId: destId, NOT: { id: assignmentId } },
  });
  if (duplicate) return res.status(400).json({ message: 'Ouvrier déjà affecté au chantier de destination' });

  const updated = await prisma.workforceAssignment.update({
    where: { id: assignmentId },
    data: { chantierId: destId, tranche },
    include: { workforce: true, chantier: { select: { id: true, name: true } } },
  });
  await audit(
    req,
    'affectation',
    'Chantier',
    destId,
    `${assignment.workforce.firstName} ${assignment.workforce.lastName} → ${dest.name}${tranche ? ` — ${tranche}` : ''}`,
  );
  res.json(updated);
});

router.delete('/:id/assign/:assignmentId', async (req, res) => {
  const chantierId = String(req.params.id);
  const assignmentId = String(req.params.assignmentId);
  const assignment = await prisma.workforceAssignment.findFirst({
    where: { id: assignmentId, chantierId },
    include: { workforce: { select: { firstName: true, lastName: true } } },
  });
  if (!assignment) return res.status(404).json({ message: 'Affectation introuvable' });
  await prisma.workforceAssignment.delete({ where: { id: assignmentId } });
  await audit(
    req,
    'désaffectation',
    'Chantier',
    chantierId,
    `${assignment.workforce.firstName} ${assignment.workforce.lastName}`
  );
  res.json({ ok: true });
});

router.post('/:id/cameras', async (req, res) => {
  const chantierId = String(req.params.id);
  const { name, url, zone } = req.body;
  if (!name?.trim() || !url?.trim()) {
    return res.status(400).json({ message: 'Nom et URL de la caméra requis' });
  }
  const camera = await prisma.chantierCamera.create({
    data: {
      chantierId,
      name: String(name).trim(),
      url: String(url).trim(),
      zone: zone ? String(zone).trim() : null,
    },
  });
  await audit(req, 'création', 'ChantierCamera', camera.id, camera.name);
  res.status(201).json(camera);
});

router.put('/:id/cameras/:cameraId', async (req, res) => {
  const camera = await prisma.chantierCamera.findFirst({
    where: { id: String(req.params.cameraId), chantierId: String(req.params.id) },
  });
  if (!camera) return res.status(404).json({ message: 'Caméra introuvable' });
  const updated = await prisma.chantierCamera.update({
    where: { id: camera.id },
    data: {
      name: req.body.name != null ? String(req.body.name).trim() : undefined,
      url: req.body.url != null ? String(req.body.url).trim() : undefined,
      zone: req.body.zone !== undefined ? (req.body.zone ? String(req.body.zone).trim() : null) : undefined,
      isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : undefined,
    },
  });
  await audit(req, 'modification', 'ChantierCamera', updated.id, updated.name);
  res.json(updated);
});

router.delete('/:id/cameras/:cameraId', async (req, res) => {
  const camera = await prisma.chantierCamera.findFirst({
    where: { id: String(req.params.cameraId), chantierId: String(req.params.id) },
  });
  if (!camera) return res.status(404).json({ message: 'Caméra introuvable' });
  await prisma.chantierCamera.delete({ where: { id: camera.id } });
  await audit(req, 'suppression', 'ChantierCamera', camera.id, camera.name);
  res.json({ ok: true });
});

router.get('/:id/progress', async (req, res) => {
  res.json(await prisma.workProgress.findMany({ where: { chantierId: req.params.id } }));
});

router.post('/:id/progress', async (req, res) => {
  const phases = validateWorkProgressPhases(req.body.phases);
  if ('message' in phases) return res.status(400).json({ message: phases.message });

  const percent = Math.min(100, Math.max(0, Number(req.body.percent || 0)));
  const progress = await prisma.workProgress.create({
    data: {
      chantierId: req.params.id,
      tranche: req.body.tranche,
      groupe: req.body.groupe,
      etage: req.body.etage,
      taskName: req.body.taskName,
      percent,
      remark: req.body.remark,
      phases,
    },
  });
  const all = await prisma.workProgress.findMany({ where: { chantierId: req.params.id } });
  const avg = all.length ? all.reduce((s, p) => s + p.percent, 0) / all.length : 0;
  await prisma.chantier.update({ where: { id: req.params.id }, data: { progressPct: avg } });
  res.status(201).json(progress);
});

router.post('/:id/progress/init', async (req, res) => {
  const { tranche, trancheId } = req.body;
  let trancheName = tranche ? String(tranche).trim() : '';
  if (trancheId) {
    const t = await prisma.chantierTranche.findFirst({
      where: { id: String(trancheId), chantierId: req.params.id },
    });
    if (t) trancheName = t.name;
  }
  if (!trancheName) return res.status(400).json({ message: 'Tranche requise' });
  const created = await seedStandardTrancheProgress(String(req.params.id), trancheName);
  res.status(201).json({ created: created.length, tasks: created });
});

router.post('/:id/photo', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return res.status(400).json({ message: 'Format : JPG, PNG ou WebP' });
  }
  const photo = `/uploads/${req.file.filename}`;
  const chantier = await prisma.chantier.update({
    where: { id: String(req.params.id) },
    data: { photo },
  });
  await audit(req, 'photo', 'Chantier', chantier.id, chantier.name);
  res.json(chantier);
});

router.get('/:id/images', async (req, res) => {
  const chantierId = String(req.params.id);
  const images = await prisma.chantierImage.findMany({
    where: { chantierId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json(images);
});

router.post('/:id/images', upload.array('files', 30), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files?.length) return res.status(400).json({ message: 'Fichier(s) requis' });
  const chantierId = String(req.params.id);
  const chantier = await prisma.chantier.findUnique({ where: { id: chantierId }, select: { id: true, photo: true } });
  if (!chantier) return res.status(404).json({ message: 'Chantier introuvable' });

  const count = await prisma.chantierImage.count({ where: { chantierId } });
  const created: { id: string; path: string }[] = [];
  let order = count;

  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXT.includes(ext)) continue;
    const imagePath = `/uploads/${file.filename}`;
    const img = await prisma.chantierImage.create({
      data: { chantierId, path: imagePath, sortOrder: order },
    });
    created.push({ id: img.id, path: img.path });
    order++;
  }

  if (!created.length) {
    return res.status(400).json({ message: 'Format image : JPG, PNG ou WebP' });
  }

  if (!chantier.photo) {
    await prisma.chantier.update({ where: { id: chantierId }, data: { photo: created[0].path } });
  }

  await audit(req, 'images', 'Chantier', chantierId, `${created.length} image(s)`);
  res.status(201).json({ created });
});

router.post('/:id/images/:imageId/cover', async (req, res) => {
  const chantierId = String(req.params.id);
  const imageId = String(req.params.imageId);
  const img = await prisma.chantierImage.findFirst({ where: { id: imageId, chantierId } });
  if (!img) return res.status(404).json({ message: 'Image introuvable' });
  const chantier = await prisma.chantier.update({
    where: { id: chantierId },
    data: { photo: img.path },
  });
  res.json(chantier);
});

router.delete('/:id/images/:imageId', async (req, res) => {
  const chantierId = String(req.params.id);
  const imageId = String(req.params.imageId);
  const img = await prisma.chantierImage.findFirst({ where: { id: imageId, chantierId } });
  if (!img) return res.status(404).json({ message: 'Image introuvable' });

  const chantier = await prisma.chantier.findUnique({ where: { id: chantierId }, select: { photo: true } });
  await prisma.chantierImage.delete({ where: { id: imageId } });

  if (chantier?.photo === img.path) {
    const next = await prisma.chantierImage.findFirst({
      where: { chantierId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    await prisma.chantier.update({
      where: { id: chantierId },
      data: { photo: next?.path ?? null },
    });
  }

  await audit(req, 'suppression', 'ChantierImage', imageId, img.path);
  res.json({ ok: true });
});

router.delete('/:id/photo', async (req, res) => {
  const chantierId = String(req.params.id);
  const chantier = await prisma.chantier.update({
    where: { id: chantierId },
    data: { photo: null },
  });
  await audit(req, 'photo', 'Chantier', chantier.id, 'suppression couverture');
  res.json(chantier);
});

router.get('/:id/subcontractors', async (req, res) => {
  const items = await prisma.chantierSubcontractor.findMany({
    where: { chantierId: String(req.params.id) },
    orderBy: { companyName: 'asc' },
  });
  res.json(items);
});

router.post('/:id/subcontractors', async (req, res) => {
  const sub = await prisma.chantierSubcontractor.create({
    data: {
      chantierId: String(req.params.id),
      companyName: String(req.body.companyName || '').trim(),
      corpsEtat: req.body.corpsEtat ? String(req.body.corpsEtat).trim() : null,
      phone: req.body.phone ? String(req.body.phone).trim() : null,
      amount: req.body.amount != null ? Number(req.body.amount) : null,
      progressPct: req.body.progressPct != null ? Number(req.body.progressPct) : 0,
      paidAmount: req.body.paidAmount != null ? Number(req.body.paidAmount) : 0,
      status: req.body.status || 'actif',
      remark: req.body.remark ? String(req.body.remark).trim() : null,
    },
  });
  res.status(201).json(sub);
});

router.put('/:id/subcontractors/:subId', async (req, res) => {
  const sub = await prisma.chantierSubcontractor.findFirst({
    where: { id: String(req.params.subId), chantierId: String(req.params.id) },
  });
  if (!sub) return res.status(404).json({ message: 'Sous-traitant introuvable' });
  const updated = await prisma.chantierSubcontractor.update({
    where: { id: sub.id },
    data: {
      companyName: req.body.companyName != null ? String(req.body.companyName).trim() : undefined,
      corpsEtat: req.body.corpsEtat !== undefined ? (req.body.corpsEtat ? String(req.body.corpsEtat).trim() : null) : undefined,
      phone: req.body.phone !== undefined ? (req.body.phone ? String(req.body.phone).trim() : null) : undefined,
      amount: req.body.amount !== undefined ? (req.body.amount ? Number(req.body.amount) : null) : undefined,
      progressPct: req.body.progressPct !== undefined ? Number(req.body.progressPct) : undefined,
      paidAmount: req.body.paidAmount !== undefined ? Number(req.body.paidAmount) : undefined,
      status: req.body.status != null ? String(req.body.status) : undefined,
      remark: req.body.remark !== undefined ? (req.body.remark ? String(req.body.remark).trim() : null) : undefined,
    },
  });
  res.json(updated);
});

router.delete('/:id/subcontractors/:subId', async (req, res) => {
  const sub = await prisma.chantierSubcontractor.findFirst({
    where: { id: String(req.params.subId), chantierId: String(req.params.id) },
  });
  if (!sub) return res.status(404).json({ message: 'Sous-traitant introuvable' });
  await prisma.chantierSubcontractor.delete({ where: { id: sub.id } });
  res.json({ ok: true });
});

export default router;
