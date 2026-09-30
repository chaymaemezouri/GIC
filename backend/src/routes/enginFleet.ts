import { Router, type Request, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { removeAutomaticMovement, syncEnginExpenseMovement, syncFuelMovement } from '../lib/cashSync.js';
import { userDisplayName } from '../lib/purchaseWorkflow.js';
import {
  COST_METHODS,
  ENGIN_STATUSES,
  EXPENSE_CATEGORIES,
  ensureExploitationUsage,
  assignmentCostInWindow,
  assignmentStatus,
  buildCostLines,
  computeEnginCosts,
  depreciationDailyAt,
  depreciationSchedule,
  annualDepreciation,
  enginAnalytics,
  enginLabel,
  inclusiveDays,
  isAssignmentActive,
  loadCostRefs,
  loadFullEngins,
  netBookValue,
  plannedCostOf,
  refreshEnginStatus,
  rentalContractCost,
  rentalDailyRate,
  round2,
  suggestAssignmentCost,
  summarizeCostLines,
  todayUtc,
  utcDay,
} from '../lib/enginCosts.js';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────

function text(v: unknown) {
  const s = v == null ? '' : String(v).trim();
  return s || null;
}

function num(v: unknown) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function date(v: unknown) {
  if (!v) return null;
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function queryDate(req: Request, key: string) {
  return date(req.query[key]);
}

function pageParams(req: Request) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(5, Number(req.query.limit) || 50));
  return { page, limit, skip: (page - 1) * limit };
}

function dateRangeWhere(from: Date | null, to: Date | null) {
  if (!from && !to) return {};
  return { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: new Date(to.getTime() + 86_399_999) } : {}) } };
}

const enginSelect = {
  id: true,
  code: true,
  kind: true,
  designation: true,
  brand: true,
  genre: true,
  matricule: true,
  status: true,
  ownershipType: true,
  photo: true,
} as const;

const chantierSelect = { id: true, name: true, projectId: true } as const;

async function trancheExists(chantierId: string, tranche: string) {
  const found = await prisma.chantierTranche.findFirst({ where: { chantierId, name: tranche } });
  return !!found;
}

function fail(res: Response, message: string, status = 400) {
  return res.status(status).json({ message });
}

// ─── Coût suggéré ───────────────────────────────────────────────────

router.get('/suggest-cost', async (req, res) => {
  const enginId = String(req.query.enginId || '');
  const engin = await prisma.engin.findUnique({ where: { id: enginId } });
  if (!engin) return fail(res, 'Engin introuvable', 404);
  const start = queryDate(req, 'startDate') || todayUtc();
  res.json(suggestAssignmentCost(engin, start));
});

// ─── Affectations ───────────────────────────────────────────────────

type AssignmentRow = Prisma.EnginAssignmentGetPayload<{
  include: { engin: { select: typeof enginSelect }; chantier: { select: typeof chantierSelect }; project: { select: { id: true; name: true } }; usages: { select: { hours: true; date: true } } };
}>;

function serializeAssignment(a: AssignmentRow, expensesShare = 0) {
  const asOf = todayUtc();
  const hours = a.usages.filter((u) => utcDay(u.date) <= asOf).reduce((s, u) => s + Number(u.hours || 0), 0);
  const cost = assignmentCostInWindow(a, hours, asOf);
  const { usages: _usages, ...rest } = a;
  return {
    ...rest,
    enginLabel: enginLabel(a.engin),
    status: assignmentStatus(a, asOf),
    plannedDays: a.endDate ? inclusiveDays(a.startDate, a.endDate) : null,
    elapsedDays: cost.days,
    hours: cost.hours,
    actualCost: cost.amount,
    expensesShare: round2(expensesShare),
    totalCost: round2(cost.amount + expensesShare),
  };
}

const assignmentInclude = {
  engin: { select: enginSelect },
  chantier: { select: chantierSelect },
  project: { select: { id: true, name: true } },
  usages: { select: { hours: true, date: true } },
} as const;

/** Part des dépenses (entretien, réparation, carburant, autres) rattachée à chaque affectation. */
async function expenseSharesByAssignment(enginIds: string[]) {
  if (!enginIds.length) return new Map<string, number>();
  const [engins, refs] = await Promise.all([
    loadFullEngins().then((all) => all.filter((e) => enginIds.includes(e.id))),
    loadCostRefs(),
  ]);
  const shares = new Map<string, number>();
  for (const l of buildCostLines(engins, {}, refs)) {
    if (l.source === 'affectation' || !l.assignmentId) continue;
    shares.set(l.assignmentId, (shares.get(l.assignmentId) || 0) + l.amount);
  }
  return shares;
}

router.get('/assignments', async (req, res) => {
  const enginId = text(req.query.enginId);
  const chantierId = text(req.query.chantierId);
  const tranche = text(req.query.tranche);
  const projectId = text(req.query.projectId);
  const status = text(req.query.status);
  const q = text(req.query.q);
  const from = queryDate(req, 'dateFrom');
  const to = queryDate(req, 'dateTo');

  const where: Prisma.EnginAssignmentWhereInput = {
    AND: [
      enginId ? { enginId } : {},
      chantierId ? { chantierId } : {},
      tranche ? { tranche } : {},
      projectId ? { OR: [{ projectId }, { chantier: { projectId } }] } : {},
      to ? { startDate: { lte: to } } : {},
      from ? { OR: [{ endDate: null }, { endDate: { gte: from } }] } : {},
      q
        ? {
            OR: [
              { responsible: { contains: q } },
              { remark: { contains: q } },
              { engin: { code: { contains: q } } },
              { engin: { designation: { contains: q } } },
              { engin: { matricule: { contains: q } } },
              { chantier: { name: { contains: q } } },
            ],
          }
        : {},
    ],
  };
  const rows = await prisma.enginAssignment.findMany({ where, include: assignmentInclude, orderBy: { startDate: 'desc' } });
  const shares = await expenseSharesByAssignment([...new Set(rows.map((r) => r.enginId))]);
  let items = rows.map((r) => serializeAssignment(r, shares.get(r.id) || 0));
  if (status === 'actifs') items = items.filter((i) => i.status === 'en_cours' || i.status === 'a_retourner');
  else if (status) items = items.filter((i) => i.status === status);

  const totals = items.reduce(
    (s, i) => ({ planned: s.planned + i.plannedCost, actual: s.actual + i.actualCost, total: s.total + i.totalCost }),
    { planned: 0, actual: 0, total: 0 },
  );
  res.json({
    items,
    totals: { planned: round2(totals.planned), actual: round2(totals.actual), total: round2(totals.total) },
    counts: {
      total: items.length,
      en_cours: items.filter((i) => i.status === 'en_cours').length,
      a_retourner: items.filter((i) => i.status === 'a_retourner').length,
      planifie: items.filter((i) => i.status === 'planifie').length,
      termine: items.filter((i) => i.status === 'termine').length,
    },
  });
});

router.get('/assignments/:id', async (req, res) => {
  const row = await prisma.enginAssignment.findUnique({ where: { id: String(req.params.id) }, include: assignmentInclude });
  if (!row) return fail(res, 'Affectation introuvable', 404);
  const shares = await expenseSharesByAssignment([row.enginId]);
  res.json(serializeAssignment(row, shares.get(row.id) || 0));
});

type AssignmentInput = {
  enginId: string;
  chantierId: string | null;
  projectId: string | null;
  tranche: string | null;
  startDate: Date;
  endDate: Date | null;
};

async function validateAssignment(input: AssignmentInput, excludeId?: string) {
  const engin = await prisma.engin.findUnique({ where: { id: input.enginId } });
  if (!engin) return { error: 'Engin / matériel introuvable' };
  if (engin.status === 'hors_service') return { error: 'Équipement hors service — affectation impossible' };
  if (engin.status === 'restitue') return { error: 'Location restituée — affectation impossible' };
  if (!input.chantierId && !input.projectId) return { error: 'Choisissez un chantier ou un projet' };
  if (input.tranche && !input.chantierId) return { error: 'Une tranche doit être rattachée à un chantier' };
  if (input.endDate && utcDay(input.endDate) < utcDay(input.startDate)) {
    return { error: 'La date de fin doit être postérieure ou égale à la date de début' };
  }
  let chantier: { id: string; name: string; projectId: string | null } | null = null;
  if (input.chantierId) {
    chantier = await prisma.chantier.findUnique({ where: { id: input.chantierId }, select: chantierSelect });
    if (!chantier) return { error: 'Chantier introuvable' };
    if (input.tranche && !(await trancheExists(input.chantierId, input.tranche))) {
      return { error: `Tranche « ${input.tranche} » introuvable sur ce chantier` };
    }
  }
  const others = await prisma.enginAssignment.findMany({
    where: { enginId: input.enginId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    include: { chantier: { select: { name: true } } },
  });
  const start = utcDay(input.startDate).getTime();
  const end = input.endDate ? utcDay(input.endDate).getTime() : Number.POSITIVE_INFINITY;
  const clash = others.find((o) => {
    const oStart = utcDay(o.startDate).getTime();
    const oEnd = o.endDate ? utcDay(o.endDate).getTime() : Number.POSITIVE_INFINITY;
    return start <= oEnd && oStart <= end;
  });
  if (clash) {
    const period = `${clash.startDate.toISOString().slice(0, 10)} → ${clash.endDate ? clash.endDate.toISOString().slice(0, 10) : '…'}`;
    return { error: `Chevauchement avec l'affectation ${clash.chantier?.name || ''} (${period}). Clôturez-la (retour) avant de réaffecter.` };
  }
  return { engin, chantier };
}

function locationLabel(chantierName: string | null | undefined, tranche: string | null | undefined) {
  if (!chantierName) return null;
  return tranche ? `${chantierName} — ${tranche}` : chantierName;
}

router.post('/assignments', async (req, res) => {
  const input: AssignmentInput = {
    enginId: String(req.body.enginId || ''),
    chantierId: text(req.body.chantierId),
    projectId: text(req.body.projectId),
    tranche: text(req.body.tranche),
    startDate: date(req.body.startDate) || todayUtc(),
    endDate: date(req.body.endDate),
  };
  const v = await validateAssignment(input);
  if ('error' in v) return fail(res, v.error!);
  const { engin, chantier } = v;

  const suggestion = suggestAssignmentCost(engin, input.startDate);
  const costMethod = COST_METHODS.includes(req.body.costMethod) ? String(req.body.costMethod) : suggestion.costMethod;
  const data = {
    ...input,
    projectId: input.projectId || chantier?.projectId || null,
    responsible: text(req.body.responsible),
    mode: engin.ownershipType === 'loue' ? 'location' : 'propriete',
    costMethod,
    dailyCost: num(req.body.dailyCost) ?? suggestion.dailyCost,
    hourlyCost: num(req.body.hourlyCost) ?? suggestion.hourlyCost,
    flatAmount: num(req.body.flatAmount) ?? suggestion.flatAmount,
    extraCost: num(req.body.extraCost) ?? suggestion.extraCost,
    plannedCost: num(req.body.plannedCost) ?? 0,
    remark: text(req.body.remark),
    createdBy: await userDisplayName(req),
  };
  if (data.dailyCost < 0 || (data.hourlyCost ?? 0) < 0 || (data.flatAmount ?? 0) < 0 || data.extraCost < 0) {
    return fail(res, 'Les coûts ne peuvent pas être négatifs');
  }
  data.plannedCost = plannedCostOf(data, num(req.body.plannedHours));

  const created = await prisma.enginAssignment.create({ data, include: assignmentInclude });
  if (isAssignmentActive(created)) {
    await prisma.engin.update({ where: { id: engin.id }, data: { location: locationLabel(chantier?.name, input.tranche) || engin.location } });
  }
  const siteStatus = text(req.body.siteStatus);
  if (siteStatus && (ENGIN_STATUSES as readonly string[]).includes(siteStatus)) {
    await prisma.engin.update({ where: { id: engin.id }, data: { status: siteStatus } });
  }
  await refreshEnginStatus(engin.id);
  await ensureExploitationUsage(created);
  await audit(req, 'affectation', 'EnginAssignment', created.id, `${enginLabel(engin)} → ${locationLabel(chantier?.name, input.tranche) || 'projet'}`);
  res.status(201).json(serializeAssignment(created));
});

router.put('/assignments/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.enginAssignment.findUnique({ where: { id } });
  if (!existing) return fail(res, 'Affectation introuvable', 404);

  const input: AssignmentInput = {
    enginId: existing.enginId,
    chantierId: req.body.chantierId !== undefined ? text(req.body.chantierId) : existing.chantierId,
    projectId: req.body.projectId !== undefined ? text(req.body.projectId) : existing.projectId,
    tranche: req.body.tranche !== undefined ? text(req.body.tranche) : existing.tranche,
    startDate: req.body.startDate !== undefined ? date(req.body.startDate) || existing.startDate : existing.startDate,
    endDate: req.body.endDate !== undefined ? date(req.body.endDate) : existing.endDate,
  };
  const v = await validateAssignment(input, id);
  if ('error' in v) return fail(res, v.error!);

  const data = {
    chantierId: input.chantierId,
    projectId: input.projectId || v.chantier?.projectId || null,
    tranche: input.tranche,
    startDate: input.startDate,
    endDate: input.endDate,
    responsible: req.body.responsible !== undefined ? text(req.body.responsible) : existing.responsible,
    costMethod: COST_METHODS.includes(req.body.costMethod) ? String(req.body.costMethod) : existing.costMethod,
    dailyCost: req.body.dailyCost !== undefined ? num(req.body.dailyCost) ?? 0 : existing.dailyCost,
    hourlyCost: req.body.hourlyCost !== undefined ? num(req.body.hourlyCost) : existing.hourlyCost,
    flatAmount: req.body.flatAmount !== undefined ? num(req.body.flatAmount) : existing.flatAmount,
    extraCost: req.body.extraCost !== undefined ? num(req.body.extraCost) ?? 0 : existing.extraCost,
    plannedCost: req.body.plannedCost !== undefined ? num(req.body.plannedCost) ?? 0 : existing.plannedCost,
    remark: req.body.remark !== undefined ? text(req.body.remark) : existing.remark,
  };
  const suspendedFrom = req.body.suspendedFrom !== undefined ? date(req.body.suspendedFrom) : existing.suspendedFrom;
  const suspendedUntil = req.body.suspendedUntil !== undefined ? date(req.body.suspendedUntil) : existing.suspendedUntil;
  if (suspendedUntil && !suspendedFrom) return fail(res, 'Le début de travail est requis');
  if (suspendedFrom && suspendedUntil && suspendedUntil < suspendedFrom) {
    return fail(res, 'La fin est avant le début de travail');
  }
  Object.assign(data, {
    ...(req.body.suspendedFrom !== undefined ? { suspendedFrom } : {}),
    ...(req.body.suspendedUntil !== undefined ? { suspendedUntil } : {}),
  });
  data.plannedCost = plannedCostOf(data, num(req.body.plannedHours));
  const updated = await prisma.enginAssignment.update({ where: { id }, data, include: assignmentInclude });
  await refreshEnginStatus(existing.enginId);
  await audit(req, 'modification', 'EnginAssignment', id, updated.engin ? enginLabel(updated.engin) : id);
  const shares = await expenseSharesByAssignment([existing.enginId]);
  res.json(serializeAssignment(updated, shares.get(id) || 0));
});

/** Déplace une affectation vers un autre chantier ou une autre tranche, et fixe l'état de l'outil. */
router.post('/assignments/:id/transfer', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.enginAssignment.findUnique({ where: { id }, include: { engin: true, chantier: { select: { name: true } } } });
  if (!existing) return fail(res, 'Affectation introuvable', 404);
  if (existing.returnedAt) return fail(res, 'Affectation déjà clôturée');

  const chantierId = text(req.body.chantierId) || existing.chantierId;
  const tranche = req.body.tranche !== undefined ? text(req.body.tranche) : existing.tranche;
  const siteStatus = text(req.body.siteStatus);
  const input: AssignmentInput = {
    enginId: existing.enginId,
    chantierId,
    projectId: existing.projectId,
    tranche,
    startDate: existing.startDate,
    endDate: existing.endDate,
  };
  const v = await validateAssignment(input, id);
  if ('error' in v) return fail(res, v.error!);

  const updated = await prisma.enginAssignment.update({
    where: { id },
    data: {
      chantierId: input.chantierId,
      projectId: v.chantier?.projectId || input.projectId,
      tranche: input.tranche,
    },
    include: assignmentInclude,
  });
  if (siteStatus && (ENGIN_STATUSES as readonly string[]).includes(siteStatus)) {
    await prisma.engin.update({
      where: { id: existing.enginId },
      data: { status: siteStatus, location: locationLabel(v.chantier?.name, input.tranche) || existing.engin.location },
    });
  } else if (isAssignmentActive(updated)) {
    await prisma.engin.update({
      where: { id: existing.enginId },
      data: { location: locationLabel(v.chantier?.name, input.tranche) || existing.engin.location },
    });
  }
  await refreshEnginStatus(existing.enginId);
  await ensureExploitationUsage(updated);
  const from = locationLabel(existing.chantier?.name, existing.tranche) || '—';
  const to = locationLabel(v.chantier?.name, input.tranche) || '—';
  await audit(req, 'affectation', 'EnginAssignment', id, `${enginLabel(existing.engin)} : ${from} → ${to}`);
  const shares = await expenseSharesByAssignment([existing.enginId]);
  res.json(serializeAssignment(updated, shares.get(id) || 0));
});

/** Retour / désaffectation : clôture l'affectation et libère l'équipement. */
router.post('/assignments/:id/return', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.enginAssignment.findUnique({ where: { id }, include: { engin: true, chantier: { select: { name: true } } } });
  if (!existing) return fail(res, 'Affectation introuvable', 404);
  if (existing.returnedAt) return fail(res, 'Affectation déjà clôturée');
  const returnDate = date(req.body.returnDate) || todayUtc();
  if (utcDay(returnDate) < utcDay(existing.startDate)) return fail(res, 'La date de retour précède le début de l\'affectation');
  const counter = num(req.body.counter);

  const updated = await prisma.enginAssignment.update({
    where: { id },
    data: {
      endDate: returnDate,
      returnedAt: returnDate,
      returnCondition: text(req.body.condition),
      returnCounter: counter,
      returnRemark: text(req.body.remark),
    },
    include: assignmentInclude,
  });

  const enginData: Prisma.EnginUpdateInput = {};
  if (counter != null) {
    enginData.counterValue = counter;
    enginData.counterDate = returnDate;
  }
  const previousLocation = locationLabel(existing.chantier?.name, existing.tranche);
  if (!existing.engin.location || existing.engin.location === previousLocation) enginData.location = text(req.body.location) || 'Parc / dépôt';
  if (Object.keys(enginData).length) await prisma.engin.update({ where: { id: existing.enginId }, data: enginData });
  await refreshEnginStatus(existing.enginId);
  if (req.body.releaseRental === true && existing.engin.ownershipType === 'loue') {
    await prisma.engin.update({ where: { id: existing.enginId }, data: { status: 'restitue', rentalEnd: existing.engin.rentalEnd || returnDate } });
  } else if (req.body.condition === 'hors_service') {
    await prisma.engin.update({ where: { id: existing.enginId }, data: { status: 'hors_service' } });
  } else if (req.body.condition === 'a_reparer') {
    await prisma.engin.update({ where: { id: existing.enginId }, data: { status: 'en_reparation' } });
  }
  await audit(req, 'retour', 'EnginAssignment', id, `${enginLabel(existing.engin)} ← ${previousLocation || 'projet'} (${returnDate.toISOString().slice(0, 10)})`);
  const shares = await expenseSharesByAssignment([existing.enginId]);
  res.json(serializeAssignment(updated, shares.get(id) || 0));
});

router.delete('/assignments/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = text(req.body?.motif);
  if (!motif) return fail(res, 'Motif de suppression obligatoire');
  const existing = await prisma.enginAssignment.findUnique({ where: { id }, include: { engin: true } });
  if (!existing) return fail(res, 'Affectation introuvable', 404);
  await prisma.enginAssignment.delete({ where: { id } });
  await refreshEnginStatus(existing.enginId);
  await audit(req, 'suppression', 'EnginAssignment', id, `${enginLabel(existing.engin)} — ${motif}`);
  res.json({ ok: true });
});

// ─── Planning ───────────────────────────────────────────────────────

router.get('/planning', async (req, res) => {
  const from = queryDate(req, 'dateFrom') || new Date(Date.UTC(todayUtc().getUTCFullYear(), todayUtc().getUTCMonth(), 1));
  const to = queryDate(req, 'dateTo') || new Date(from.getTime() + 89 * 86_400_000);
  const kind = text(req.query.kind);
  const chantierId = text(req.query.chantierId);
  const engins = await prisma.engin.findMany({
    where: kind ? { kind } : {},
    select: {
      ...enginSelect,
      assignments: {
        where: {
          startDate: { lte: to },
          OR: [{ endDate: null }, { endDate: { gte: from } }],
          ...(chantierId ? { chantierId } : {}),
        },
        include: { chantier: { select: { id: true, name: true } } },
        orderBy: { startDate: 'asc' },
      },
      maintenances: {
        where: { date: { gte: from, lte: to }, downtimeDays: { gt: 0 } },
        select: { id: true, date: true, downtimeDays: true, kind: true, designation: true },
      },
    },
    orderBy: [{ kind: 'asc' }, { code: 'asc' }],
  });
  const asOf = todayUtc();
  res.json({
    from,
    to,
    today: asOf,
    rows: engins
      .filter((e) => !chantierId || e.assignments.length)
      .map((e) => ({
        id: e.id,
        code: e.code,
        label: enginLabel(e),
        kind: e.kind,
        status: e.status,
        ownershipType: e.ownershipType,
        assignments: e.assignments.map((a) => ({
          id: a.id,
          chantierId: a.chantierId,
          chantierName: a.chantier?.name || null,
          tranche: a.tranche,
          startDate: a.startDate,
          endDate: a.endDate,
          status: assignmentStatus(a, asOf),
          mode: a.mode,
        })),
        downtimes: e.maintenances.map((m) => ({
          id: m.id,
          startDate: m.date,
          endDate: new Date(utcDay(m.date).getTime() + (Math.ceil(Number(m.downtimeDays)) - 1) * 86_400_000),
          kind: m.kind,
          label: m.designation,
        })),
      })),
  });
});

// ─── Pointage d'utilisation ─────────────────────────────────────────

function hoursBetween(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  if ([h1, m1, h2, m2].some((n) => Number.isNaN(n))) return null;
  let minutes = h2 * 60 + m2 - (h1 * 60 + m1);
  if (minutes < 0) minutes += 24 * 60;
  return round2(minutes / 60);
}

async function buildUsageData(body: Record<string, unknown>, enginId: string) {
  const day = date(body.date) || todayUtc();
  const startTime = text(body.startTime);
  const endTime = text(body.endTime);
  const hours = num(body.hours) ?? hoursBetween(startTime, endTime) ?? 0;
  if (hours < 0 || hours > 24) return { error: 'Nombre d\'heures invalide (0 à 24 h)' };
  const kmStart = num(body.kmStart);
  const kmEnd = num(body.kmEnd);
  if (kmStart != null && kmEnd != null && kmEnd < kmStart) return { error: 'Kilométrage de fin inférieur au kilométrage de début' };
  const counterStart = num(body.counterStart);
  const counterEnd = num(body.counterEnd);
  if (counterStart != null && counterEnd != null && counterEnd < counterStart) return { error: 'Compteur horaire de fin inférieur au compteur de début' };

  let assignmentId = text(body.assignmentId);
  let chantierId = text(body.chantierId);
  let tranche = text(body.tranche);
  if (!assignmentId) {
    const active = await prisma.enginAssignment.findFirst({
      where: { enginId, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] },
      orderBy: { startDate: 'desc' },
    });
    if (active) assignmentId = active.id;
  }
  if (assignmentId) {
    const a = await prisma.enginAssignment.findUnique({ where: { id: assignmentId } });
    if (!a || a.enginId !== enginId) return { error: 'Affectation invalide pour cet engin' };
    chantierId = chantierId || a.chantierId;
    tranche = tranche || a.tranche;
  }
  const driverId = text(body.driverId);
  let driverName = text(body.driverName);
  if (driverId) {
    const w = await prisma.workforce.findUnique({ where: { id: driverId }, select: { firstName: true, lastName: true } });
    if (!w) return { error: 'Conducteur introuvable' };
    driverName = `${w.firstName} ${w.lastName}`.trim();
  }
  return {
    data: {
      date: day,
      assignmentId,
      chantierId,
      tranche,
      driverId,
      driverName,
      startTime,
      endTime,
      hours,
      kmStart,
      kmEnd,
      counterStart,
      counterEnd,
      remark: text(body.remark),
    },
  };
}

async function bumpEnginCounter(enginId: string, value: number | null, at: Date) {
  if (value == null) return;
  const engin = await prisma.engin.findUnique({ where: { id: enginId }, select: { counterValue: true } });
  if (engin && (engin.counterValue == null || value > engin.counterValue)) {
    await prisma.engin.update({ where: { id: enginId }, data: { counterValue: value, counterDate: at } });
  }
}

const usageInclude = {
  engin: { select: enginSelect },
  chantier: { select: { id: true, name: true } },
  assignment: { select: { id: true, startDate: true, endDate: true } },
} as const;

router.get('/usages', async (req, res) => {
  const { page, limit, skip } = pageParams(req);
  const enginId = text(req.query.enginId);
  const chantierId = text(req.query.chantierId);
  const tranche = text(req.query.tranche);
  const q = text(req.query.q);
  const where: Prisma.EnginUsageWhereInput = {
    AND: [
      enginId ? { enginId } : {},
      chantierId ? { chantierId } : {},
      tranche ? { tranche } : {},
      dateRangeWhere(queryDate(req, 'dateFrom'), queryDate(req, 'dateTo')),
      q ? { OR: [{ driverName: { contains: q } }, { remark: { contains: q } }, { engin: { code: { contains: q } } }, { engin: { designation: { contains: q } } }] } : {},
    ],
  };
  const [items, total, all] = await Promise.all([
    prisma.enginUsage.findMany({ where, include: usageInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip, take: limit }),
    prisma.enginUsage.count({ where }),
    prisma.enginUsage.findMany({ where, select: { hours: true, kmStart: true, kmEnd: true, enginId: true } }),
  ]);
  const km = all.reduce((s, u) => s + (u.kmStart != null && u.kmEnd != null ? Math.max(0, u.kmEnd - u.kmStart) : 0), 0);
  res.json({
    items: items.map((u) => ({ ...u, enginLabel: enginLabel(u.engin), km: u.kmStart != null && u.kmEnd != null ? round2(u.kmEnd - u.kmStart) : null })),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    totals: { hours: round2(all.reduce((s, u) => s + u.hours, 0)), km: round2(km), engins: new Set(all.map((u) => u.enginId)).size },
  });
});

router.post('/usages', async (req, res) => {
  const enginId = String(req.body.enginId || '');
  const engin = await prisma.engin.findUnique({ where: { id: enginId } });
  if (!engin) return fail(res, 'Engin / matériel introuvable', 404);
  const built = await buildUsageData(req.body, enginId);
  if ('error' in built) return fail(res, built.error!);
  const usage = await prisma.enginUsage.create({
    data: { ...built.data, enginId, createdBy: await userDisplayName(req) },
    include: usageInclude,
  });
  await bumpEnginCounter(enginId, usage.counterEnd ?? usage.kmEnd, usage.date);
  await audit(req, 'utilisation', 'EnginUsage', usage.id, `${enginLabel(engin)} — ${usage.hours} h`);
  res.status(201).json(usage);
});

router.put('/usages/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.enginUsage.findUnique({ where: { id } });
  if (!existing) return fail(res, 'Pointage introuvable', 404);
  const merged = {
    date: existing.date.toISOString().slice(0, 10),
    startTime: existing.startTime,
    endTime: existing.endTime,
    kmStart: existing.kmStart,
    kmEnd: existing.kmEnd,
    counterStart: existing.counterStart,
    counterEnd: existing.counterEnd,
    driverId: existing.driverId,
    driverName: existing.driverName,
    chantierId: existing.chantierId,
    tranche: existing.tranche,
    assignmentId: existing.assignmentId,
    remark: existing.remark,
    ...req.body,
  };
  if (req.body.startTime !== undefined || req.body.endTime !== undefined) {
    if (req.body.hours === undefined) merged.hours = undefined;
  } else if (req.body.hours === undefined) {
    merged.hours = existing.hours;
  }
  const built = await buildUsageData(merged, existing.enginId);
  if ('error' in built) return fail(res, built.error!);
  const usage = await prisma.enginUsage.update({ where: { id }, data: built.data, include: usageInclude });
  await bumpEnginCounter(existing.enginId, usage.counterEnd ?? usage.kmEnd, usage.date);
  await audit(req, 'modification', 'EnginUsage', id, `${usage.hours} h`);
  res.json(usage);
});

router.delete('/usages/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.enginUsage.findUnique({ where: { id } });
  if (!existing) return fail(res, 'Pointage introuvable', 404);
  await prisma.enginUsage.delete({ where: { id } });
  await audit(req, 'suppression', 'EnginUsage', id, `${existing.hours} h`);
  res.json({ ok: true });
});

// ─── Imputation commune (dépenses, carburant, maintenance) ──────────

export async function parseAllocation(body: Record<string, unknown>) {
  const allocation = body.allocation === 'direct' ? 'direct' : 'reparti';
  const chantierId = allocation === 'direct' ? text(body.chantierId) : null;
  const tranche = allocation === 'direct' ? text(body.tranche) : null;
  if (allocation === 'direct') {
    if (!chantierId) return { error: 'Imputation directe : choisissez le chantier concerné' };
    const exists = await prisma.chantier.findUnique({ where: { id: chantierId }, select: { id: true } });
    if (!exists) return { error: 'Chantier introuvable' };
    if (tranche && !(await trancheExists(chantierId, tranche))) return { error: `Tranche « ${tranche} » introuvable sur ce chantier` };
  }
  return { allocation, chantierId, tranche };
}

// ─── Dépenses liées à l'engin ───────────────────────────────────────

const expenseInclude = { engin: { select: enginSelect }, chantier: { select: { id: true, name: true } } } as const;

router.get('/expenses', async (req, res) => {
  const { page, limit, skip } = pageParams(req);
  const enginId = text(req.query.enginId);
  const chantierId = text(req.query.chantierId);
  const category = text(req.query.category);
  const q = text(req.query.q);
  const where: Prisma.EnginExpenseWhereInput = {
    AND: [
      enginId ? { enginId } : {},
      chantierId ? { chantierId } : {},
      category ? { category } : {},
      dateRangeWhere(queryDate(req, 'dateFrom'), queryDate(req, 'dateTo')),
      q ? { OR: [{ designation: { contains: q } }, { supplier: { contains: q } }, { invoiceRef: { contains: q } }, { engin: { code: { contains: q } } }] } : {},
    ],
  };
  const [items, total, agg, byCat] = await Promise.all([
    prisma.enginExpense.findMany({ where, include: expenseInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip, take: limit }),
    prisma.enginExpense.count({ where }),
    prisma.enginExpense.aggregate({ where, _sum: { amount: true } }),
    prisma.enginExpense.groupBy({ by: ['category'], where, _sum: { amount: true } }),
  ]);
  res.json({
    items: items.map((x) => ({ ...x, enginLabel: enginLabel(x.engin) })),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    amount: round2(agg._sum.amount || 0),
    byCategory: byCat.map((c) => ({ category: c.category, amount: round2(c._sum.amount || 0) })),
  });
});

async function buildExpenseData(body: Record<string, unknown>) {
  const category = String(body.category || '');
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return { error: 'Catégorie de dépense invalide' };
  const designation = text(body.designation);
  if (!designation) return { error: 'Désignation obligatoire' };
  const amount = num(body.amount);
  if (amount == null || amount <= 0) return { error: 'Montant obligatoire (> 0)' };
  const alloc = await parseAllocation(body);
  if ('error' in alloc) return { error: alloc.error };
  return {
    data: {
      date: date(body.date) || todayUtc(),
      category,
      designation,
      amount: round2(amount),
      supplier: text(body.supplier),
      invoiceRef: text(body.invoiceRef),
      paymentMode: text(body.paymentMode),
      remark: text(body.remark),
      allocation: alloc.allocation!,
      chantierId: alloc.chantierId ?? null,
      tranche: alloc.tranche ?? null,
    },
  };
}

router.post('/expenses', async (req, res) => {
  const enginId = String(req.body.enginId || '');
  const engin = await prisma.engin.findUnique({ where: { id: enginId } });
  if (!engin) return fail(res, 'Engin / matériel introuvable', 404);
  const built = await buildExpenseData(req.body);
  if ('error' in built) return fail(res, built.error!);
  const expense = await prisma.enginExpense.create({
    data: { ...built.data, enginId, createdBy: await userDisplayName(req) },
    include: expenseInclude,
  });
  await syncEnginExpenseMovement(expense, req);
  await audit(req, 'dépense', 'EnginExpense', expense.id, `${enginLabel(engin)} — ${expense.designation} ${expense.amount} MAD`);
  res.status(201).json(expense);
});

router.put('/expenses/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.enginExpense.findUnique({ where: { id } });
  if (!existing) return fail(res, 'Dépense introuvable', 404);
  const built = await buildExpenseData({
    ...existing,
    date: existing.date.toISOString().slice(0, 10),
    ...req.body,
  });
  if ('error' in built) return fail(res, built.error!);
  const expense = await prisma.enginExpense.update({ where: { id }, data: built.data, include: expenseInclude });
  await syncEnginExpenseMovement(expense, req);
  await audit(req, 'modification', 'EnginExpense', id, expense.designation);
  res.json(expense);
});

router.delete('/expenses/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.enginExpense.findUnique({ where: { id } });
  if (!existing) return fail(res, 'Dépense introuvable', 404);
  await removeAutomaticMovement('engin_depense', id);
  await prisma.enginExpense.delete({ where: { id } });
  await audit(req, 'suppression', 'EnginExpense', id, existing.designation);
  res.json({ ok: true });
});

// ─── Carburant (vue globale) ────────────────────────────────────────

const fuelInclude = { engin: { select: enginSelect }, chantier: { select: { id: true, name: true } } } as const;

router.get('/fuel-logs', async (req, res) => {
  const { page, limit, skip } = pageParams(req);
  const enginId = text(req.query.enginId);
  const chantierId = text(req.query.chantierId);
  const q = text(req.query.q);
  const where: Prisma.FuelLogWhereInput = {
    AND: [
      enginId ? { enginId } : {},
      chantierId ? { chantierId } : {},
      dateRangeWhere(queryDate(req, 'dateFrom'), queryDate(req, 'dateTo')),
      q ? { OR: [{ station: { contains: q } }, { remark: { contains: q } }, { engin: { code: { contains: q } } }, { engin: { matricule: { contains: q } } }] } : {},
    ],
  };
  const [items, total, agg] = await Promise.all([
    prisma.fuelLog.findMany({ where, include: fuelInclude, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip, take: limit }),
    prisma.fuelLog.count({ where }),
    prisma.fuelLog.aggregate({ where, _sum: { liters: true, cost: true } }),
  ]);
  const liters = agg._sum.liters || 0;
  const cost = agg._sum.cost || 0;
  res.json({
    items: items.map((f) => ({ ...f, enginLabel: enginLabel(f.engin) })),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    liters: round2(liters),
    cost: round2(cost),
    avgPrice: liters > 0 ? round2(cost / liters) : null,
  });
});

export async function buildFuelData(body: Record<string, unknown>) {
  const liters = num(body.liters);
  if (liters == null || liters <= 0) return { error: 'Litres obligatoires (> 0)' };
  const cost = num(body.cost);
  if (cost != null && cost < 0) return { error: 'Coût invalide' };
  const alloc = await parseAllocation(body);
  if ('error' in alloc) return { error: alloc.error };
  return {
    data: {
      date: date(body.date) || todayUtc(),
      liters,
      cost,
      counterValue: num(body.counterValue),
      station: text(body.station),
      remark: text(body.remark),
      allocation: alloc.allocation!,
      chantierId: alloc.chantierId ?? null,
      tranche: alloc.tranche ?? null,
    },
  };
}

router.post('/fuel-logs', async (req, res) => {
  const enginId = String(req.body.enginId || '');
  const engin = await prisma.engin.findUnique({ where: { id: enginId } });
  if (!engin) return fail(res, 'Engin / matériel introuvable', 404);
  const built = await buildFuelData(req.body);
  if ('error' in built) return fail(res, built.error!);
  const log = await prisma.fuelLog.create({ data: { ...built.data, enginId }, include: fuelInclude });
  await bumpEnginCounter(enginId, log.counterValue, log.date);
  await syncFuelMovement({ ...log, engin: { brand: engin.brand || '', matricule: engin.matricule || engin.code || '' } }, req);
  await audit(req, 'carburant', 'FuelLog', log.id, `${enginLabel(engin)} — ${log.liters} L`);
  res.status(201).json(log);
});

router.put('/fuel-logs/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.fuelLog.findUnique({ where: { id }, include: { engin: true } });
  if (!existing) return fail(res, 'Plein introuvable', 404);
  const built = await buildFuelData({ ...existing, date: existing.date.toISOString().slice(0, 10), ...req.body });
  if ('error' in built) return fail(res, built.error!);
  const log = await prisma.fuelLog.update({ where: { id }, data: built.data, include: fuelInclude });
  await syncFuelMovement({ ...log, engin: { brand: existing.engin.brand || '', matricule: existing.engin.matricule || existing.engin.code || '' } }, req);
  await audit(req, 'modification', 'FuelLog', id, `${log.liters} L`);
  res.json(log);
});

router.delete('/fuel-logs/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.fuelLog.findUnique({ where: { id } });
  if (!existing) return fail(res, 'Plein introuvable', 404);
  await removeAutomaticMovement('carburant', id);
  await prisma.fuelLog.delete({ where: { id } });
  await audit(req, 'suppression', 'FuelLog', id, `${existing.liters} L`);
  res.json({ ok: true });
});

// ─── Calcul des coûts ───────────────────────────────────────────────

function costFilters(req: Request) {
  return {
    chantierId: text(req.query.chantierId),
    tranche: text(req.query.tranche),
    projectId: text(req.query.projectId),
    enginId: text(req.query.enginId),
    kind: text(req.query.kind),
    from: queryDate(req, 'dateFrom'),
    to: queryDate(req, 'dateTo'),
  };
}

router.get('/costs', async (req, res) => {
  const result = await computeEnginCosts(costFilters(req));
  res.json({
    ...result,
    synthesis: result.lines.filter((l) => l.source === 'affectation'),
  });
});

router.get('/costs/export/csv', async (req, res) => {
  const { lines, totals } = await computeEnginCosts(costFilters(req));
  const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
  const header = 'Date;Projet;Chantier;Tranche;Engin / matériel;Type;Mode;Source;Catégorie;Imputation;Période début;Période fin;Jours;Heures;Libellé;Montant MAD';
  const rows = lines.map((l) =>
    [
      fmt(l.date),
      l.projectName || '',
      l.chantierName || 'Non imputé',
      l.tranche || '',
      l.enginLabel,
      l.enginKind,
      l.mode,
      l.source,
      l.category,
      l.allocation,
      fmt(l.periodStart),
      fmt(l.periodEnd),
      l.days,
      l.hours,
      l.label.replace(/;/g, ','),
      String(l.amount).replace('.', ','),
    ].join(';'),
  );
  rows.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL', String(totals.total).replace('.', ',')].join(';'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=couts-engins-materiels.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

// ─── Tableau de bord ────────────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  const today = todayUtc();
  const from = queryDate(req, 'dateFrom') || new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const to = queryDate(req, 'dateTo') || today;
  const [engins, refs] = await Promise.all([loadFullEngins(), loadCostRefs()]);

  const perEngin = engins.map((e) => enginAnalytics(e, from, to));
  const lines = buildCostLines(engins, { from, to }, refs);
  const imputed = summarizeCostLines(lines);

  const sum = (key: 'amortissement' | 'location' | 'entretien' | 'reparation' | 'carburant' | 'autres' | 'total' | 'hours' | 'downtimeDays' | 'assignedDays' | 'availableDays') =>
    round2(perEngin.reduce((s, x) => s + Number(x[key] || 0), 0));
  const count = (pred: (e: (typeof engins)[number]) => boolean) => engins.filter(pred).length;
  const hours = sum('hours');
  const total = sum('total');

  res.json({
    period: { from, to },
    counts: {
      engins: count((e) => e.kind !== 'materiel'),
      materiels: count((e) => e.kind === 'materiel'),
      total: engins.length,
      disponibles: count((e) => e.status === 'disponible'),
      affectes: count((e) => e.status === 'affecte' || e.status === 'en_utilisation'),
      enMaintenance: count((e) => e.status === 'en_maintenance'),
      enReparation: count((e) => e.status === 'en_reparation'),
      horsService: count((e) => e.status === 'hors_service'),
      loues: count((e) => e.ownershipType === 'loue' && e.status !== 'restitue'),
      restitues: count((e) => e.status === 'restitue'),
      proprietes: count((e) => e.ownershipType !== 'loue'),
      activeAssignments: engins.reduce((s, e) => s + e.assignments.filter((a) => isAssignmentActive(a)).length, 0),
    },
    costs: {
      amortissement: sum('amortissement'),
      location: sum('location'),
      entretien: sum('entretien'),
      reparation: sum('reparation'),
      carburant: sum('carburant'),
      autres: sum('autres'),
      total,
      imputed: imputed.totals.imputed,
      unallocated: round2(Math.max(0, total - imputed.totals.imputed)),
      idle: round2(Math.max(0, total - imputed.totals.total)),
      hours,
      costPerHour: hours > 0 ? round2(total / hours) : null,
    },
    utilization: {
      assignedDays: sum('assignedDays'),
      availableDays: sum('availableDays'),
      rate: sum('availableDays') > 0 ? round2((sum('assignedDays') / sum('availableDays')) * 100) : 0,
      downtimeDays: sum('downtimeDays'),
    },
    byChantier: imputed.byChantier,
    byTranche: imputed.byTranche,
    byProject: imputed.byProject,
    byEngin: perEngin.sort((a, b) => b.total - a.total),
  });
});

// ─── Documents & historique du module ───────────────────────────────

router.get('/documents-all', async (req, res) => {
  const enginId = text(req.query.enginId);
  const q = text(req.query.q);
  const category = text(req.query.category);
  const maintenances = await prisma.maintenance.findMany({
    where: enginId ? { enginId } : {},
    select: { id: true, designation: true, kind: true, enginId: true },
  });
  const maintMap = new Map(maintenances.map((m) => [m.id, m]));
  const docs = await prisma.document.findMany({
    where: {
      AND: [
        { OR: [enginId ? { enginId } : { enginId: { not: null } }, { entityType: 'Maintenance', entityId: { in: [...maintMap.keys()] } }] },
        q ? { OR: [{ name: { contains: q } }, { docNumber: { contains: q } }] } : {},
        category ? { category } : {},
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const enginIds = new Set<string>();
  for (const d of docs) {
    const id = d.enginId || (d.entityId ? maintMap.get(d.entityId)?.enginId : null);
    if (id) enginIds.add(id);
  }
  const engins = await prisma.engin.findMany({ where: { id: { in: [...enginIds] } }, select: enginSelect });
  const enginMap = new Map(engins.map((e) => [e.id, e]));
  res.json(
    docs.map((d) => {
      const maint = d.entityType === 'Maintenance' && d.entityId ? maintMap.get(d.entityId) : undefined;
      const id = d.enginId || maint?.enginId || null;
      const engin = id ? enginMap.get(id) : undefined;
      return {
        ...d,
        enginId: id,
        enginLabel: engin ? enginLabel(engin) : null,
        maintenance: maint ? { id: maint.id, designation: maint.designation, kind: maint.kind } : null,
      };
    }),
  );
});

const HISTORY_ENTITIES = ['Engin', 'EnginAssignment', 'EnginUsage', 'EnginExpense', 'Maintenance', 'FuelLog', 'Mission', 'DriverAssignment'];

router.get('/history-all', async (req, res) => {
  const { page, limit, skip } = pageParams(req);
  const entity = text(req.query.entity);
  const q = text(req.query.q);
  const range = dateRangeWhere(queryDate(req, 'dateFrom'), queryDate(req, 'dateTo')) as { date?: Prisma.DateTimeFilter };
  const where: Prisma.AuditLogWhereInput = {
    AND: [
      { entity: entity && HISTORY_ENTITIES.includes(entity) ? entity : { in: HISTORY_ENTITIES } },
      q ? { OR: [{ details: { contains: q } }, { action: { contains: q } }] } : {},
      range.date ? { createdAt: range.date } : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

// ─── Coûts d'un engin ───────────────────────────────────────────────

router.get('/:id/costs', async (req, res) => {
  const id = String(req.params.id);
  const [engins, refs] = await Promise.all([loadFullEngins({ enginId: id }), loadCostRefs()]);
  const engin = engins[0];
  if (!engin) return fail(res, 'Engin introuvable', 404);
  const today = todayUtc();
  const from = queryDate(req, 'dateFrom') || utcDay(engin.commissioningDate || engin.acquisitionDate || engin.rentalStart || engin.createdAt);
  const to = queryDate(req, 'dateTo') || today;
  const lines = buildCostLines(engins, { from, to }, refs);
  const summary = summarizeCostLines(lines);
  const shares = new Map<string, number>();
  for (const l of lines) {
    if (l.source !== 'affectation' && l.assignmentId) shares.set(l.assignmentId, (shares.get(l.assignmentId) || 0) + l.amount);
  }
  const isRented = engin.ownershipType === 'loue';
  res.json({
    period: { from, to },
    analytics: enginAnalytics(engin, from, to),
    imputed: summary,
    depreciation: isRented
      ? null
      : {
          annual: round2(annualDepreciation(engin, 0)),
          daily: round2(depreciationDailyAt(engin, today)),
          netBookValue: netBookValue(engin, today),
          schedule: depreciationSchedule(engin),
        },
    rental: isRented
      ? {
          dailyRate: rentalDailyRate(engin) != null ? round2(rentalDailyRate(engin)!) : null,
          contract: rentalContractCost(engin, today),
          tvaAmount: round2((rentalContractCost(engin, today).total * Number(engin.rentalTvaRate || 0)) / 100),
        }
      : null,
    assignments: engin.assignments.map((a) => {
      const hours = engin.usages.filter((u) => u.assignmentId === a.id && utcDay(u.date) <= today).reduce((s, u) => s + u.hours, 0);
      const cost = assignmentCostInWindow(a, hours, today);
      return {
        id: a.id,
        chantierId: a.chantierId,
        chantierName: a.chantier?.name || null,
        projectName: a.project?.name || null,
        tranche: a.tranche,
        startDate: a.startDate,
        endDate: a.endDate,
        returnedAt: a.returnedAt,
        mode: a.mode,
        costMethod: a.costMethod,
        dailyCost: a.dailyCost,
        status: assignmentStatus(a, today),
        days: cost.days,
        hours: cost.hours,
        plannedCost: a.plannedCost,
        actualCost: cost.amount,
        expensesShare: round2(shares.get(a.id) || 0),
        totalCost: round2(cost.amount + (shares.get(a.id) || 0)),
      };
    }),
  });
});

export default router;
