import { Router } from 'express';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import { upload, uploadExcel } from '../lib/upload.js';
import { TASKS_REFERENCE } from '../lib/tasks.js';
import { buildChantierOverview } from '../lib/chantierOverview.js';
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
import { syncWorkforcePayrollMovement } from '../lib/cashSync.js';
import { workforceScopeFilters } from '../lib/workforceScope.js';

const router = Router();
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
router.use(requireAuth);
router.use(requirePermission);

router.get('/tasks/reference', async (_req, res) => {
  res.json(TASKS_REFERENCE);
});

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
  const category = String(req.query.category || '');
  const excludeCategory = String(req.query.excludeCategory || '');
  const scopeWhere = workforceScopeFilters(category, excludeCategory);

  const withoutRef = await prisma.workforce.findMany({ where: { reference: null }, select: { id: true } });
  for (const w of withoutRef) {
    await prisma.workforce.update({ where: { id: w.id }, data: { reference: await nextReference('MO') } });
  }

  const [total, actifs, declared, assigned, avgSalary, categories, groupes] = await Promise.all([
    prisma.workforce.count({ where: scopeWhere }),
    prisma.workforce.count({ where: { ...scopeWhere, isActive: true } }),
    prisma.workforce.count({ where: { ...scopeWhere, declared: true } }),
    prisma.workforce.count({ where: { ...scopeWhere, assignments: { some: {} } } }),
    prisma.workforce.aggregate({ where: scopeWhere, _avg: { dailySalary: true } }),
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
    declared,
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
        _count: { select: { pointages: true, assignments: true } },
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
    });
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
    });
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

  const [pointages, assignments] = await Promise.all([
    prisma.pointage.count({ where: { workforceId: id } }),
    prisma.workforceAssignment.count({ where: { workforceId: id } }),
  ]);
  if (pointages > 0 || assignments > 0) {
    return res.status(400).json({
      message: `Ouvrier lié à ${pointages} pointage(s) et ${assignments} affectation(s) — suppression impossible`,
    });
  }

  await prisma.workforce.delete({ where: { id } });
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
  const assignments = await prisma.workforceAssignment.findMany({
    where: { chantierId, tranche: name },
    select: { workforceId: true },
  });
  const ids = [...new Set(assignments.map((a) => a.workforceId))];
  if (!ids.length) return { workforceId: { in: ['__none__'] } };
  return { workforceId: { in: ids } };
}

async function buildPointageWhere(query: {
  dateFrom?: string | null;
  dateTo?: string | null;
  chantierId?: string;
  workforceId?: string;
  validated?: string;
  tranche?: string;
}) {
  const { from, to } = parseDateRange(query.dateFrom || undefined, query.dateTo || undefined);
  const chantierId = String(query.chantierId || '');
  const workforceId = String(query.workforceId || '');
  const validated = String(query.validated || '');
  const trancheClause = await pointageTrancheClause(chantierId, String(query.tranche || ''));

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

  const [pointages, payrollRecords] = await Promise.all([
    prisma.pointage.findMany({
      where: {
        workforceId: { in: workers.map((w) => w.id) },
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
    }),
    prisma.workforcePayrollRecord.findMany({
      where: {
        workforceId: { in: workers.map((w) => w.id) },
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
  const payrollByWorker = new Map(payrollRecords.map((r) => [r.workforceId, r]));

  return workers.map((w) => {
    const computed = computeWorkerPeriodSalary(w, byWorker.get(w.id) || []);
    const payroll = payrollByWorker.get(w.id);
    const netDue = computed.net;
    const amountPaid = payroll?.amountPaid ?? 0;
    const remaining = payroll ? payroll.remaining : Math.max(0, netDue - amountPaid);
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

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Montant invalide' });
  }

  const worker = await prisma.workforce.findUnique({ where: { id: workforceId } });
  if (!worker) return res.status(404).json({ message: 'Ouvrier introuvable' });

  const periodStart = new Date(periodYear, periodMonth - 1, 1);
  const periodEnd = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);

  const pointages = await prisma.pointage.findMany({
    where: { workforceId, validated: true, date: { gte: periodStart, lte: periodEnd } },
  });
  const computed = computeWorkerPeriodSalary(worker, pointages);
  const netDue = computed.net;

  if (netDue <= 0) {
    return res.status(400).json({ message: 'Aucun salaire dû pour cette période' });
  }

  const existing = await prisma.workforcePayrollRecord.findUnique({
    where: { workforceId_periodYear_periodMonth: { workforceId, periodYear, periodMonth } },
  });
  const prevPaid = existing?.amountPaid ?? 0;
  const amountPaid = prevPaid + amount;
  if (amountPaid > netDue + 0.01) {
    return res.status(400).json({
      message: `Montant supérieur au net dû (${netDue.toLocaleString('fr-MA')} MAD, reste ${Math.max(0, netDue - prevPaid).toLocaleString('fr-MA')} MAD)`,
    });
  }

  const remaining = Math.max(0, netDue - amountPaid);
  const status = remaining <= 0 ? 'paid' : 'partial';
  const reference = existing?.reference || (await nextReference('MO'));

  const record = await prisma.workforcePayrollRecord.upsert({
    where: { workforceId_periodYear_periodMonth: { workforceId, periodYear, periodMonth } },
    create: {
      reference,
      workforceId,
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
      paidAt: new Date(),
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
      paidAt: new Date(),
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

  const pointage = await prisma.pointage.update({
    where: { id },
    data: {
      chantierId: req.body.chantierId !== undefined ? req.body.chantierId || null : existing.chantierId,
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

router.get('/chefs', async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['CHEF_CHANTIER', 'ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { firstName: 'asc' },
  });
  res.json(users);
});

router.get('/stats', async (_req, res) => {
  const [total, actifs, termines, suspendus, avgProgress, workerSum, purchaseAgg] = await Promise.all([
    prisma.chantier.count(),
    prisma.chantier.count({ where: { status: 'actif' } }),
    prisma.chantier.count({ where: { status: 'termine' } }),
    prisma.chantier.count({ where: { status: 'suspendu' } }),
    prisma.chantier.aggregate({ _avg: { progressPct: true } }),
    prisma.chantier.aggregate({ _sum: { workerCount: true } }),
    prisma.purchase.aggregate({ _sum: { totalPrice: true }, where: { chantierId: { not: null } } }),
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
  const tranche = await prisma.chantierTranche.upsert({
    where: { chantierId_name: { chantierId, name } },
    create: { chantierId, name, remark: req.body.remark ? String(req.body.remark).trim() : null },
    update: { remark: req.body.remark !== undefined ? (req.body.remark ? String(req.body.remark).trim() : null) : undefined },
  });
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
  const updated = await prisma.chantierTranche.update({ where: { id: trancheId }, data: { name: newName, remark } });
  if (newName !== oldName) {
    await Promise.all([
      prisma.workProgress.updateMany({ where: { chantierId, tranche: oldName }, data: { tranche: newName } }),
      prisma.workforceAssignment.updateMany({ where: { chantierId, tranche: oldName }, data: { tranche: newName } }),
      prisma.mission.updateMany({ where: { chantierId, tranche: oldName }, data: { tranche: newName } }),
      prisma.purchase.updateMany({ where: { chantierId, tranche: oldName }, data: { tranche: newName } }),
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

  const [progress, assignments, missions, purchases] = await Promise.all([
    prisma.workProgress.count({ where: { chantierId, tranche: tranche.name } }),
    prisma.workforceAssignment.count({ where: { chantierId, tranche: tranche.name } }),
    prisma.mission.count({ where: { chantierId, tranche: tranche.name } }),
    prisma.purchase.count({ where: { chantierId, tranche: tranche.name } }),
  ]);
  if (progress + assignments + missions + purchases > 0) {
    return res.status(400).json({
      message: `Tranche liée à ${progress} tâche(s), ${assignments} ouvrier(s), ${missions} mission(s), ${purchases} achat(s) — suppression impossible`,
    });
  }

  await prisma.chantierTranche.delete({ where: { id: trancheId } });
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
    prisma.workforceAssignment.count({
      where: { chantierId: id, workforce: { declared: false, isActive: true } },
    }),
  ]);

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
    cnssNonDeclare,
  });

  res.json({ ...chantier, overview });
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
  if (data.startDate != null) data.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.endDate != null) data.endDate = data.endDate ? new Date(data.endDate) : null;
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

  const [purchases, assignments, missions, pointages, progress] = await Promise.all([
    prisma.purchase.count({ where: { chantierId: id } }),
    prisma.workforceAssignment.count({ where: { chantierId: id } }),
    prisma.mission.count({ where: { chantierId: id } }),
    prisma.pointage.count({ where: { chantierId: id } }),
    prisma.workProgress.count({ where: { chantierId: id } }),
  ]);
  const linked = purchases + assignments + missions + pointages + progress;
  if (linked > 0) {
    return res.status(400).json({
      message: `Chantier lié à des données (${purchases} achats, ${assignments} affectations, ${missions} missions) — suppression impossible`,
    });
  }

  await prisma.chantier.delete({ where: { id } });
  await audit(req, 'suppression', 'Chantier', id, motif);
  res.json({ ok: true });
});

router.post('/:id/assign', async (req, res) => {
  const chantierId = String(req.params.id);
  const workforceId = String(req.body.workforceId || '').trim();
  if (!workforceId) return res.status(400).json({ message: 'Ouvrier requis' });

  const worker = await prisma.workforce.findUnique({ where: { id: workforceId } });
  if (!worker) return res.status(404).json({ message: 'Ouvrier introuvable' });

  const tranche = req.body.tranche ? String(req.body.tranche).trim() : null;
  const assignment = await prisma.workforceAssignment.create({
    data: {
      chantierId,
      workforceId,
      functionRole: req.body.functionRole ? String(req.body.functionRole).trim() : null,
      tranche,
    },
    include: { workforce: true },
  });
  await audit(req, 'affectation', 'Chantier', chantierId, `${worker.firstName} ${worker.lastName}`);
  res.status(201).json(assignment);
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
  const { tranche, groupe, etage, trancheId } = req.body;
  let trancheName = tranche ? String(tranche).trim() : '';
  if (trancheId) {
    const t = await prisma.chantierTranche.findFirst({
      where: { id: String(trancheId), chantierId: req.params.id },
    });
    if (t) trancheName = t.name;
  }
  if (!trancheName) return res.status(400).json({ message: 'Tranche requise' });
  const existing = await prisma.workProgress.findMany({ where: { chantierId: req.params.id } });
  const existingNames = new Set(existing.map((e) => e.taskName));
  const created = [];
  for (const taskName of TASKS_REFERENCE) {
    if (existingNames.has(taskName)) continue;
    const p = await prisma.workProgress.create({
      data: { chantierId: req.params.id, tranche: trancheName, groupe, etage, taskName, percent: 0 },
    });
    created.push(p);
  }
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

router.get('/:id/stock', async (req, res) => {
  const items = await prisma.chantierStockItem.findMany({
    where: { chantierId: String(req.params.id) },
    orderBy: { name: 'asc' },
  });
  res.json(items);
});

router.post('/:id/stock', async (req, res) => {
  const item = await prisma.chantierStockItem.create({
    data: {
      chantierId: String(req.params.id),
      name: String(req.body.name || '').trim(),
      quantity: Number(req.body.quantity || 0),
      unit: req.body.unit ? String(req.body.unit).trim() : null,
      tranche: req.body.tranche ? String(req.body.tranche).trim() : null,
      remark: req.body.remark ? String(req.body.remark).trim() : null,
    },
  });
  res.status(201).json(item);
});

router.put('/:id/stock/:itemId', async (req, res) => {
  const item = await prisma.chantierStockItem.findFirst({
    where: { id: String(req.params.itemId), chantierId: String(req.params.id) },
  });
  if (!item) return res.status(404).json({ message: 'Article introuvable' });
  const updated = await prisma.chantierStockItem.update({
    where: { id: item.id },
    data: {
      name: req.body.name != null ? String(req.body.name).trim() : undefined,
      quantity: req.body.quantity != null ? Number(req.body.quantity) : undefined,
      unit: req.body.unit !== undefined ? (req.body.unit ? String(req.body.unit).trim() : null) : undefined,
      tranche: req.body.tranche !== undefined ? (req.body.tranche ? String(req.body.tranche).trim() : null) : undefined,
      remark: req.body.remark !== undefined ? (req.body.remark ? String(req.body.remark).trim() : null) : undefined,
    },
  });
  res.json(updated);
});

router.delete('/:id/stock/:itemId', async (req, res) => {
  const item = await prisma.chantierStockItem.findFirst({
    where: { id: String(req.params.itemId), chantierId: String(req.params.id) },
  });
  if (!item) return res.status(404).json({ message: 'Article introuvable' });
  await prisma.chantierStockItem.delete({ where: { id: item.id } });
  res.json({ ok: true });
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
