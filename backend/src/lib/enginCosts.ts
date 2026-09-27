import type { Engin, EnginAssignment, EnginExpense, EnginUsage, FuelLog, Maintenance } from '@prisma/client';
import { prisma } from './prisma.js';

export const ENGIN_KINDS = ['engin', 'materiel'] as const;
export const ENGIN_STATUSES = [
  'disponible',
  'affecte',
  'en_utilisation',
  'en_maintenance',
  'en_reparation',
  'hors_service',
  'restitue',
] as const;
export const RENTAL_UNITS = ['jour', 'semaine', 'mois', 'projet', 'tranche'] as const;
export const COST_METHODS = ['journalier', 'horaire', 'forfait'] as const;
export const DEPRECIATION_METHODS = ['lineaire', 'degressif'] as const;
export const MAINTENANCE_KINDS = ['entretien', 'reparation'] as const;
export const MAINTENANCE_TYPES = [
  'vidange',
  'filtres',
  'pneus',
  'graissage',
  'preventive',
  'controle_technique',
  'revision',
  'pieces',
  'autre',
] as const;
export const EXPENSE_CATEGORIES = [
  'carburant',
  'transport',
  'assurance',
  'taxes',
  'pneumatiques',
  'pieces',
  'main_oeuvre',
  'lavage',
  'gardiennage',
  'frais_admin',
  'autres',
] as const;
export const COST_CATEGORIES = ['amortissement', 'location', 'entretien', 'reparation', 'carburant', 'autres'] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

/** Statuts pilotés par l'atelier ou l'utilisateur : jamais écrasés par les affectations. */
const LOCKED_STATUSES = ['en_maintenance', 'en_reparation', 'hors_service'];

const DAY = 86_400_000;

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function utcDay(d: Date | string) {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

export function todayUtc() {
  return utcDay(new Date());
}

/** Jours calendaires inclusifs (01/10 → 20/10 = 20 j). */
export function inclusiveDays(from: Date, to: Date) {
  const a = utcDay(from).getTime();
  const b = utcDay(to).getTime();
  if (b < a) return 0;
  return Math.round((b - a) / DAY) + 1;
}

function overlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  const start = utcDay(aStart) > utcDay(bStart) ? aStart : bStart;
  const end = utcDay(aEnd) < utcDay(bEnd) ? aEnd : bEnd;
  return inclusiveDays(start, end);
}

export function enginLabel(e: { code?: string | null; designation?: string | null; brand?: string | null; genre?: string | null; matricule?: string | null }) {
  const name = e.designation || [e.genre, e.brand].filter(Boolean).join(' ') || e.matricule || 'Engin';
  return e.code ? `${e.code} — ${name}` : name;
}

// ─── Amortissement ──────────────────────────────────────────────────

type DepreciableEngin = Pick<
  Engin,
  'purchasePrice' | 'residualValue' | 'depreciationYears' | 'depreciationMethod' | 'acquisitionDate' | 'commissioningDate' | 'createdAt'
>;

export function depreciationStart(e: DepreciableEngin) {
  return utcDay(e.acquisitionDate || e.commissioningDate || e.createdAt);
}

function degressiveCoefficient(years: number) {
  if (years <= 4) return 1.25;
  if (years <= 6) return 1.75;
  return 2.25;
}

/** Annuité de l'exercice `yearIndex` (0 = première année). */
export function annualDepreciation(e: DepreciableEngin, yearIndex = 0) {
  const price = Number(e.purchasePrice || 0);
  const years = Number(e.depreciationYears || 0);
  if (price <= 0 || years <= 0 || yearIndex < 0 || yearIndex >= Math.ceil(years)) return 0;
  const residual = Math.min(Math.max(0, Number(e.residualValue || 0)), price);
  if (e.depreciationMethod !== 'degressif') return (price - residual) / years;

  const rate = degressiveCoefficient(years) / years;
  let vnc = price;
  for (let i = 0; i <= yearIndex; i += 1) {
    const remaining = years - i;
    if (remaining <= 0 || vnc <= residual) return 0;
    const degressive = vnc * rate;
    const linear = (vnc - residual) / remaining;
    const annuity = Math.min(Math.max(degressive, linear), vnc - residual);
    if (i === yearIndex) return Math.max(0, annuity);
    vnc -= annuity;
  }
  return 0;
}

export function depreciationDailyAt(e: DepreciableEngin, at: Date) {
  const start = depreciationStart(e);
  const yearIndex = Math.max(0, Math.floor((utcDay(at).getTime() - start.getTime()) / (365 * DAY)));
  return annualDepreciation(e, yearIndex) / 365;
}

export function depreciationSchedule(e: DepreciableEngin) {
  const years = Math.ceil(Number(e.depreciationYears || 0));
  const price = Number(e.purchasePrice || 0);
  const start = depreciationStart(e);
  const rows: Array<{ year: number; from: Date; annuity: number; daily: number; cumulated: number; netValue: number }> = [];
  let cumulated = 0;
  for (let i = 0; i < years; i += 1) {
    const annuity = annualDepreciation(e, i);
    cumulated += annuity;
    rows.push({
      year: i + 1,
      from: new Date(start.getTime() + i * 365 * DAY),
      annuity: round2(annuity),
      daily: round2(annuity / 365),
      cumulated: round2(cumulated),
      netValue: round2(price - cumulated),
    });
  }
  return rows;
}

/** Amortissement couru sur une période (jour par jour, par exercice). */
export function depreciationForPeriod(e: DepreciableEngin, from: Date, to: Date) {
  const years = Math.ceil(Number(e.depreciationYears || 0));
  if (!years || !e.purchasePrice) return 0;
  const start = depreciationStart(e);
  let total = 0;
  for (let i = 0; i < years; i += 1) {
    const yStart = new Date(start.getTime() + i * 365 * DAY);
    const yEnd = new Date(yStart.getTime() + 364 * DAY);
    const days = overlapDays(yStart, yEnd, from, to);
    if (days > 0) total += (annualDepreciation(e, i) / 365) * days;
  }
  return total;
}

export function netBookValue(e: DepreciableEngin, at = todayUtc()) {
  const price = Number(e.purchasePrice || 0);
  if (!price) return 0;
  return round2(price - depreciationForPeriod(e, depreciationStart(e), at));
}

// ─── Location ───────────────────────────────────────────────────────

type RentalEngin = Pick<
  Engin,
  'rentalPrice' | 'rentalMonthly' | 'rentalUnit' | 'rentalStart' | 'rentalEnd' | 'rentalTransport' | 'rentalExtraFees' | 'rentalInsurance' | 'rentalTvaRate'
>;

export function rentalUnitOf(e: RentalEngin) {
  if (e.rentalUnit) return e.rentalUnit;
  return e.rentalMonthly ? 'mois' : 'jour';
}

export function rentalPriceOf(e: RentalEngin) {
  return Number(e.rentalPrice ?? e.rentalMonthly ?? 0);
}

export function isFlatRental(e: RentalEngin) {
  const unit = rentalUnitOf(e);
  return unit === 'projet' || unit === 'tranche';
}

/** Prix de location ramené à la journée (null pour un forfait projet / tranche). */
export function rentalDailyRate(e: RentalEngin) {
  const price = rentalPriceOf(e);
  switch (rentalUnitOf(e)) {
    case 'jour':
      return price;
    case 'semaine':
      return price / 7;
    case 'mois':
      return price / 30;
    default:
      return null;
  }
}

export function rentalExtras(e: RentalEngin) {
  return Number(e.rentalTransport || 0) + Number(e.rentalExtraFees || 0) + Number(e.rentalInsurance || 0);
}

/** Coût du contrat de location (HT) : durée × prix unitaire, ou forfait. */
export function rentalContractCost(e: RentalEngin, asOf = todayUtc(), from?: Date | null, to?: Date | null) {
  const extras = rentalExtras(e);
  if (!e.rentalStart) return { days: 0, base: 0, extras: 0, total: 0 };
  const startsInWindow = (!from || utcDay(e.rentalStart) >= utcDay(from)) && (!to || utcDay(e.rentalStart) <= utcDay(to));
  if (isFlatRental(e)) {
    const base = startsInWindow ? rentalPriceOf(e) : 0;
    const x = startsInWindow ? extras : 0;
    return { days: 0, base, extras: x, total: round2(base + x) };
  }
  let end = e.rentalEnd && utcDay(e.rentalEnd) < asOf ? utcDay(e.rentalEnd) : asOf;
  if (to && utcDay(to) < end) end = utcDay(to);
  let start = utcDay(e.rentalStart);
  if (from && utcDay(from) > start) start = utcDay(from);
  const days = inclusiveDays(start, end);
  const base = (rentalDailyRate(e) || 0) * days;
  const x = startsInWindow ? extras : 0;
  return { days, base: round2(base), extras: x, total: round2(base + x) };
}

// ─── Affectations ───────────────────────────────────────────────────

type CostableEngin = DepreciableEngin & RentalEngin & Pick<Engin, 'ownershipType' | 'usageCostPerHour'>;

export function suggestAssignmentCost(e: CostableEngin, start: Date) {
  if (e.ownershipType === 'loue') {
    if (isFlatRental(e)) {
      return { mode: 'location', costMethod: 'forfait', dailyCost: 0, hourlyCost: null, flatAmount: rentalPriceOf(e), extraCost: rentalExtras(e) };
    }
    return {
      mode: 'location',
      costMethod: 'journalier',
      dailyCost: round2(rentalDailyRate(e) || 0),
      hourlyCost: null,
      flatAmount: null,
      extraCost: rentalExtras(e),
    };
  }
  return {
    mode: 'propriete',
    costMethod: 'journalier',
    dailyCost: round2(depreciationDailyAt(e, start)),
    hourlyCost: e.usageCostPerHour ?? null,
    flatAmount: null,
    extraCost: 0,
  };
}

type AssignmentCostInput = Pick<
  EnginAssignment,
  'startDate' | 'endDate' | 'costMethod' | 'dailyCost' | 'hourlyCost' | 'flatAmount' | 'extraCost' | 'plannedCost'
>;

export function plannedCostOf(a: AssignmentCostInput, plannedHours?: number | null) {
  const extra = Number(a.extraCost || 0);
  if (a.costMethod === 'forfait') return round2(Number(a.flatAmount || 0) + extra);
  if (a.costMethod === 'horaire') {
    if (plannedHours != null) return round2(Number(a.hourlyCost || 0) * plannedHours + extra);
    return round2(Number(a.plannedCost || 0));
  }
  if (!a.endDate) return 0;
  return round2(Number(a.dailyCost || 0) * inclusiveDays(a.startDate, a.endDate) + extra);
}

export function assignmentStatus(a: Pick<EnginAssignment, 'startDate' | 'endDate' | 'returnedAt'>, asOf = todayUtc()) {
  if (a.returnedAt) return 'termine';
  if (utcDay(a.startDate) > asOf) return 'planifie';
  if (a.endDate && utcDay(a.endDate) < asOf) return 'a_retourner';
  return 'en_cours';
}

export function isAssignmentActive(a: Pick<EnginAssignment, 'startDate' | 'endDate' | 'returnedAt'>, asOf = todayUtc()) {
  const s = assignmentStatus(a, asOf);
  return s === 'en_cours' || s === 'a_retourner';
}

/** Coût réel d'une affectation (base + frais ponctuels) couru jusqu'à `asOf`, éventuellement borné à une fenêtre. */
export function assignmentCostInWindow(
  a: AssignmentCostInput,
  usageHours: number,
  asOf = todayUtc(),
  from?: Date | null,
  to?: Date | null,
) {
  const start0 = utcDay(a.startDate);
  let end = a.endDate && utcDay(a.endDate) < asOf ? utcDay(a.endDate) : asOf;
  if (to && utcDay(to) < end) end = utcDay(to);
  let start = start0;
  if (from && utcDay(from) > start) start = utcDay(from);
  const days = inclusiveDays(start, end);
  const startsInWindow = start0 <= asOf && (!from || start0 >= utcDay(from)) && (!to || start0 <= utcDay(to));
  const extra = startsInWindow ? Number(a.extraCost || 0) : 0;
  let base = 0;
  if (a.costMethod === 'horaire') base = Number(a.hourlyCost || 0) * usageHours;
  else if (a.costMethod === 'forfait') base = startsInWindow ? Number(a.flatAmount || 0) : 0;
  else base = Number(a.dailyCost || 0) * days;
  return { days, hours: round2(usageHours), base: round2(base), extra: round2(extra), amount: round2(base + extra) };
}

/** Met à jour l'état de l'engin selon ses affectations (sans toucher aux états atelier). */
export async function refreshEnginStatus(enginId: string) {
  const engin = await prisma.engin.findUnique({
    where: { id: enginId },
    select: { status: true, assignments: { select: { startDate: true, endDate: true, returnedAt: true } } },
  });
  if (!engin || LOCKED_STATUSES.includes(engin.status)) return;
  const active = engin.assignments.some((a) => isAssignmentActive(a));
  let next = engin.status;
  if (active && !['affecte', 'en_utilisation'].includes(engin.status)) next = 'affecte';
  if (!active && ['affecte', 'en_utilisation'].includes(engin.status)) next = 'disponible';
  if (next !== engin.status) await prisma.engin.update({ where: { id: enginId }, data: { status: next } });
}

// ─── Synthèse des coûts ─────────────────────────────────────────────

export type CostFilters = {
  chantierId?: string | null;
  tranche?: string | null;
  projectId?: string | null;
  enginId?: string | null;
  kind?: string | null;
  from?: Date | null;
  to?: Date | null;
};

export type CostLine = {
  source: 'affectation' | 'entretien' | 'reparation' | 'carburant' | 'depense';
  sourceId: string;
  category: CostCategory;
  enginId: string;
  enginLabel: string;
  enginKind: string;
  mode: string;
  assignmentId: string | null;
  chantierId: string | null;
  chantierName: string | null;
  projectId: string | null;
  projectName: string | null;
  tranche: string | null;
  date: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  days: number;
  hours: number;
  amount: number;
  allocation: 'affectation' | 'direct' | 'reparti' | 'non_impute';
  label: string;
};

type AssignmentWithRefs = EnginAssignment & {
  chantier: { id: string; name: string; projectId: string | null } | null;
  project: { id: string; name: string } | null;
};

type FullEngin = Engin & {
  assignments: AssignmentWithRefs[];
  usages: EnginUsage[];
  maintenances: Maintenance[];
  fuelLogs: FuelLog[];
  expenses: EnginExpense[];
};

function monthBounds(d: Date) {
  const x = utcDay(d);
  const start = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1));
  const end = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0));
  return { start, end };
}

function assignmentEnd(a: Pick<EnginAssignment, 'endDate'>, asOf: Date) {
  return a.endDate ? utcDay(a.endDate) : asOf;
}

function inWindow(date: Date, from?: Date | null, to?: Date | null) {
  const d = utcDay(date);
  return (!from || d >= utcDay(from)) && (!to || d <= utcDay(to));
}

type ExpenseItem = {
  source: CostLine['source'];
  sourceId: string;
  category: CostCategory;
  date: Date;
  amount: number;
  allocation: string;
  chantierId: string | null;
  tranche: string | null;
  label: string;
};

export function maintenanceAmount(m: Pick<Maintenance, 'budget' | 'partsCost' | 'laborCost'>) {
  if (m.budget != null) return Number(m.budget);
  return Number(m.partsCost || 0) + Number(m.laborCost || 0);
}

function expenseItems(e: FullEngin): ExpenseItem[] {
  return [
    ...e.maintenances.map((m) => ({
      source: (m.kind === 'reparation' ? 'reparation' : 'entretien') as CostLine['source'],
      sourceId: m.id,
      category: (m.kind === 'reparation' ? 'reparation' : 'entretien') as CostCategory,
      date: m.date,
      amount: maintenanceAmount(m),
      allocation: m.allocation,
      chantierId: m.chantierId,
      tranche: m.tranche,
      label: m.designation,
    })),
    ...e.fuelLogs.map((f) => ({
      source: 'carburant' as const,
      sourceId: f.id,
      category: 'carburant' as CostCategory,
      date: f.date,
      amount: Number(f.cost || 0),
      allocation: f.allocation,
      chantierId: f.chantierId,
      tranche: f.tranche,
      label: `Carburant ${f.liters} L`,
    })),
    ...e.expenses.map((x) => ({
      source: 'depense' as const,
      sourceId: x.id,
      category: (x.category === 'carburant' ? 'carburant' : 'autres') as CostCategory,
      date: x.date,
      amount: Number(x.amount || 0),
      allocation: x.allocation,
      chantierId: x.chantierId,
      tranche: x.tranche,
      label: x.designation,
    })),
  ].filter((i) => i.amount > 0);
}

/**
 * Répartition d'une dépense :
 * - direct : imputée au chantier / tranche saisi (rattachée à l'affectation correspondante si elle existe) ;
 * - reparti : répartie au prorata des jours d'affectation de l'engin sur le mois de la dépense.
 * Sans affectation sur le mois, la dépense reste « non imputée » (charge de l'engin).
 */
function allocateExpense(item: ExpenseItem, assignments: AssignmentWithRefs[], asOf: Date) {
  if (item.allocation === 'direct' && item.chantierId) {
    const match = assignments.find(
      (a) =>
        a.chantierId === item.chantierId &&
        (a.tranche || null) === (item.tranche || null) &&
        utcDay(a.startDate) <= utcDay(item.date) &&
        assignmentEnd(a, asOf) >= utcDay(item.date),
    );
    return [{ assignment: match || null, chantierId: item.chantierId, tranche: item.tranche, amount: item.amount, allocation: 'direct' as const }];
  }
  const { start, end } = monthBounds(item.date);
  const shares = assignments
    .map((a) => ({ a, days: overlapDays(a.startDate, assignmentEnd(a, asOf), start, end) }))
    .filter((s) => s.days > 0);
  const totalDays = shares.reduce((s, x) => s + x.days, 0);
  if (!totalDays) return [];
  return shares.map((s) => ({
    assignment: s.a,
    chantierId: s.a.chantierId,
    tranche: s.a.tranche,
    amount: (item.amount * s.days) / totalDays,
    allocation: 'reparti' as const,
  }));
}

export async function loadFullEngins(filters: Pick<CostFilters, 'enginId' | 'kind'> = {}) {
  return prisma.engin.findMany({
    where: {
      ...(filters.enginId ? { id: filters.enginId } : {}),
      ...(filters.kind ? { kind: filters.kind } : {}),
    },
    include: {
      assignments: {
        include: {
          chantier: { select: { id: true, name: true, projectId: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { startDate: 'asc' },
      },
      usages: true,
      maintenances: true,
      fuelLogs: true,
      expenses: true,
    },
  }) as Promise<FullEngin[]>;
}

export function buildCostLines(engins: FullEngin[], filters: CostFilters, refs: { chantiers: Map<string, { name: string; projectId: string | null }>; projects: Map<string, string> }) {
  const asOf = todayUtc();
  const lines: CostLine[] = [];
  const chantierInfo = (id: string | null) => (id ? refs.chantiers.get(id) : undefined);

  for (const e of engins) {
    const label = enginLabel(e);
    const base = { enginId: e.id, enginLabel: label, enginKind: e.kind, mode: e.ownershipType === 'loue' ? 'location' : 'propriete' };

    for (const a of e.assignments) {
      const hours = e.usages
        .filter((u) => u.assignmentId === a.id && inWindow(u.date, filters.from, filters.to) && utcDay(u.date) <= asOf)
        .reduce((s, u) => s + Number(u.hours || 0), 0);
      const r = assignmentCostInWindow(a, hours, asOf, filters.from, filters.to);
      if (r.amount <= 0 && r.days <= 0) continue;
      const projectId = a.projectId || a.chantier?.projectId || null;
      let periodEnd = a.endDate && utcDay(a.endDate) < asOf ? utcDay(a.endDate) : asOf;
      if (filters.to && utcDay(filters.to) < periodEnd) periodEnd = utcDay(filters.to);
      const periodStart = filters.from && utcDay(filters.from) > utcDay(a.startDate) ? utcDay(filters.from) : utcDay(a.startDate);
      lines.push({
        ...base,
        mode: a.mode,
        source: 'affectation',
        sourceId: a.id,
        category: a.mode === 'location' ? 'location' : 'amortissement',
        assignmentId: a.id,
        chantierId: a.chantierId,
        chantierName: a.chantier?.name || null,
        projectId,
        projectName: a.project?.name || (projectId ? refs.projects.get(projectId) || null : null),
        tranche: a.tranche,
        date: a.startDate,
        periodStart,
        periodEnd,
        days: r.days,
        hours: r.hours,
        amount: r.amount,
        allocation: 'affectation',
        label: a.costMethod === 'forfait' ? 'Forfait' : a.costMethod === 'horaire' ? `${r.hours} h` : `${r.days} j`,
      });
    }

    for (const item of expenseItems(e)) {
      if (!inWindow(item.date, filters.from, filters.to)) continue;
      const parts = allocateExpense(item, e.assignments, asOf);
      const common = {
        ...base,
        source: item.source,
        sourceId: item.sourceId,
        category: item.category,
        date: item.date,
        periodStart: null,
        periodEnd: null,
        days: 0,
        hours: 0,
        label: item.label,
      };
      if (!parts.length) {
        lines.push({ ...common, assignmentId: null, chantierId: null, chantierName: null, projectId: null, projectName: null, tranche: null, amount: round2(item.amount), allocation: 'non_impute' });
        continue;
      }
      for (const p of parts) {
        const info = chantierInfo(p.chantierId);
        const projectId = p.assignment?.projectId || p.assignment?.chantier?.projectId || info?.projectId || null;
        lines.push({
          ...common,
          assignmentId: p.assignment?.id || null,
          chantierId: p.chantierId,
          chantierName: p.assignment?.chantier?.name || info?.name || null,
          projectId,
          projectName: projectId ? refs.projects.get(projectId) || null : null,
          tranche: p.tranche,
          amount: round2(p.amount),
          allocation: p.allocation,
        });
      }
    }
  }

  return lines.filter(
    (l) =>
      (!filters.chantierId || l.chantierId === filters.chantierId) &&
      (!filters.tranche || (l.tranche || '') === filters.tranche) &&
      (!filters.projectId || l.projectId === filters.projectId),
  );
}

function emptyCategories() {
  return { amortissement: 0, location: 0, entretien: 0, reparation: 0, carburant: 0, autres: 0, total: 0 };
}

type Bucket = ReturnType<typeof emptyCategories>;

function addTo(bucket: Bucket, l: CostLine) {
  bucket[l.category] += l.amount;
  bucket.total += l.amount;
}

function roundBucket<T extends Bucket>(b: T): T {
  for (const k of [...COST_CATEGORIES, 'total'] as const) b[k] = round2(b[k]);
  return b;
}

export async function loadCostRefs() {
  const [chantiers, projects] = await Promise.all([
    prisma.chantier.findMany({ select: { id: true, name: true, projectId: true } }),
    prisma.project.findMany({ select: { id: true, name: true } }),
  ]);
  return {
    chantiers: new Map(chantiers.map((c) => [c.id, { name: c.name, projectId: c.projectId }])),
    projects: new Map(projects.map((p) => [p.id, p.name])),
  };
}

export function summarizeCostLines(lines: CostLine[]) {
  const totals = { ...emptyCategories(), imputed: 0, unallocated: 0 };
  const byChantier = new Map<string, Bucket & { chantierId: string; chantierName: string; projectId: string | null; projectName: string | null }>();
  const byTranche = new Map<string, Bucket & { chantierId: string; chantierName: string; tranche: string }>();
  const byProject = new Map<string, Bucket & { projectId: string; projectName: string }>();
  const byEngin = new Map<string, Bucket & { enginId: string; enginLabel: string; enginKind: string; days: number; hours: number }>();

  for (const l of lines) {
    addTo(totals, l);
    if (l.chantierId) totals.imputed += l.amount;
    else totals.unallocated += l.amount;

    if (l.chantierId) {
      const c = byChantier.get(l.chantierId) || { ...emptyCategories(), chantierId: l.chantierId, chantierName: l.chantierName || '—', projectId: l.projectId, projectName: l.projectName };
      addTo(c, l);
      byChantier.set(l.chantierId, c);
      const tk = `${l.chantierId}::${l.tranche || ''}`;
      const t = byTranche.get(tk) || { ...emptyCategories(), chantierId: l.chantierId, chantierName: l.chantierName || '—', tranche: l.tranche || '' };
      addTo(t, l);
      byTranche.set(tk, t);
    }
    if (l.projectId) {
      const p = byProject.get(l.projectId) || { ...emptyCategories(), projectId: l.projectId, projectName: l.projectName || '—' };
      addTo(p, l);
      byProject.set(l.projectId, p);
    }
    const e = byEngin.get(l.enginId) || { ...emptyCategories(), enginId: l.enginId, enginLabel: l.enginLabel, enginKind: l.enginKind, days: 0, hours: 0 };
    addTo(e, l);
    e.days += l.days;
    e.hours += l.hours;
    byEngin.set(l.enginId, e);
  }

  const sortDesc = <T extends Bucket>(arr: T[]) => arr.map(roundBucket).sort((a, b) => b.total - a.total);
  totals.imputed = round2(totals.imputed);
  totals.unallocated = round2(totals.unallocated);
  return {
    totals: roundBucket(totals),
    byChantier: sortDesc([...byChantier.values()]),
    byTranche: sortDesc([...byTranche.values()]),
    byProject: sortDesc([...byProject.values()]),
    byEngin: sortDesc([...byEngin.values()]).map((e) => ({ ...e, hours: round2(e.hours) })),
  };
}

export async function computeEnginCosts(filters: CostFilters) {
  const [engins, refs] = await Promise.all([loadFullEngins(filters), loadCostRefs()]);
  const lines = buildCostLines(engins, filters, refs);
  return { lines, ...summarizeCostLines(lines) };
}

/** Total Engins & Matériels imputé à un chantier (et ventilé par tranche). */
export async function chantierEnginCosts(chantierId: string) {
  const { totals, byTranche, byEngin } = await computeEnginCosts({ chantierId });
  return { total: totals.total, totals, byTranche, byEngin };
}

/** Coût Engins & Matériels d'une tranche : totaux, ventilation par engin et lignes détaillées. */
export async function trancheEnginCosts(chantierId: string, tranche: string) {
  const { totals, byEngin, lines } = await computeEnginCosts({ chantierId, tranche });
  return {
    total: totals.total,
    totals,
    byEngin,
    lines: lines
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((l) => ({ ...l, amount: round2(l.amount) })),
  };
}

// ─── Indicateurs par engin ──────────────────────────────────────────

export function enginAnalytics(e: FullEngin, from: Date, to: Date) {
  const asOf = todayUtc();
  const end = utcDay(to) < asOf ? utcDay(to) : asOf;
  const cats = emptyCategories();

  if (e.ownershipType === 'loue') {
    if (e.rentalStart) {
      cats.location = rentalContractCost(e, asOf, from, to).total;
    } else {
      for (const a of e.assignments.filter((x) => x.mode === 'location')) {
        const hours = e.usages.filter((u) => u.assignmentId === a.id && inWindow(u.date, from, end)).reduce((s, u) => s + u.hours, 0);
        cats.location += assignmentCostInWindow(a, hours, asOf, from, to).amount;
      }
    }
  } else {
    cats.amortissement = depreciationForPeriod(e, from, end);
  }
  for (const item of expenseItems(e)) {
    if (inWindow(item.date, from, end)) cats[item.category] += item.amount;
  }
  cats.total = cats.amortissement + cats.location + cats.entretien + cats.reparation + cats.carburant + cats.autres;

  const hours = e.usages.filter((u) => inWindow(u.date, from, end)).reduce((s, u) => s + Number(u.hours || 0), 0);
  const km = e.usages
    .filter((u) => inWindow(u.date, from, end) && u.kmStart != null && u.kmEnd != null)
    .reduce((s, u) => s + Math.max(0, Number(u.kmEnd) - Number(u.kmStart)), 0);

  const lifeStart = e.ownershipType === 'loue' && e.rentalStart ? utcDay(e.rentalStart) : utcDay(e.commissioningDate || e.acquisitionDate || e.createdAt);
  const availableFrom = lifeStart > utcDay(from) ? lifeStart : utcDay(from);
  let availableTo = end;
  if (e.ownershipType === 'loue' && e.rentalEnd && utcDay(e.rentalEnd) < availableTo) availableTo = utcDay(e.rentalEnd);
  const availableDays = inclusiveDays(availableFrom, availableTo);
  const assignedDays = Math.min(
    availableDays,
    e.assignments.reduce((s, a) => s + overlapDays(a.startDate, assignmentEnd(a, asOf), availableFrom, availableTo), 0),
  );
  const downtimeDays = e.maintenances.filter((m) => inWindow(m.date, from, end)).reduce((s, m) => s + Number(m.downtimeDays || 0), 0);

  const current = e.assignments.find((a) => isAssignmentActive(a, asOf)) || null;
  return {
    enginId: e.id,
    enginLabel: enginLabel(e),
    kind: e.kind,
    ownershipType: e.ownershipType,
    status: e.status,
    ...roundBucket(cats),
    hours: round2(hours),
    km: round2(km),
    costPerHour: hours > 0 ? round2(cats.total / hours) : null,
    availableDays,
    assignedDays,
    utilizationRate: availableDays > 0 ? round2((assignedDays / availableDays) * 100) : 0,
    downtimeDays: round2(downtimeDays),
    currentAssignment: current
      ? { id: current.id, chantierId: current.chantierId, chantierName: current.chantier?.name || null, tranche: current.tranche, startDate: current.startDate, endDate: current.endDate }
      : null,
  };
}

// ─── Reprise des données existantes ─────────────────────────────────

/** Normalise le parc existant : états, codes, désignations, paramètres d'amortissement et de location. */
export async function migrateEnginFleet() {
  const { nextReference } = await import('./references.js');
  let changed = 0;
  const legacy = await prisma.engin.updateMany({ where: { status: 'en_mission' }, data: { status: 'en_utilisation' } });
  changed += legacy.count;
  const engins = await prisma.engin.findMany({ orderBy: { createdAt: 'asc' } });
  for (const e of engins) {
    const data: Record<string, unknown> = {};
    if (!e.code) data.code = await nextReference(e.kind === 'materiel' ? 'MAT' : 'ENG');
    if (!e.designation) {
      const designation = [e.genre, e.brand].filter(Boolean).join(' ');
      if (designation) data.designation = designation;
    }
    if (e.ownershipType === 'loue') {
      if (e.rentalPrice == null && e.rentalMonthly != null) {
        data.rentalPrice = e.rentalMonthly;
        data.rentalUnit = e.rentalUnit || 'mois';
      }
    } else if (e.purchasePrice && !e.depreciationYears) {
      data.depreciationYears = 5;
      data.depreciationMethod = e.depreciationMethod || 'lineaire';
      if (!e.acquisitionDate) data.acquisitionDate = e.transferDate || e.createdAt;
    }
    if (Object.keys(data).length) {
      await prisma.engin.update({ where: { id: e.id }, data });
      changed += 1;
    }
  }
  return changed;
}
