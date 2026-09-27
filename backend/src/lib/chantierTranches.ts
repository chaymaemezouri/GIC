import { prisma } from './prisma.js';
import { TASKS_REFERENCE } from './tasks.js';
import { chantierEnginCosts, trancheEnginCosts } from './enginCosts.js';

type ProgressRow = {
  tranche: string | null;
  groupe: string | null;
  etage: string | null;
  taskName: string;
  percent: number;
  id: string;
  updatedAt: Date;
};

function lotSortIndex(taskName: string) {
  const i = TASKS_REFERENCE.indexOf(taskName);
  return i >= 0 ? i : 999;
}

function sortProgressByStandardOrder<T extends { taskName: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const d = lotSortIndex(a.taskName) - lotSortIndex(b.taskName);
    if (d !== 0) return d;
    return a.taskName.localeCompare(b.taskName, 'fr');
  });
}

export async function syncChantierTranchesFromProgress(chantierId: string) {
  const progress = await prisma.workProgress.findMany({
    where: { chantierId },
    select: { tranche: true },
  });
  const names = [...new Set(progress.map((p) => p.tranche).filter(Boolean))] as string[];
  for (const name of names) {
    await prisma.chantierTranche.upsert({
      where: { chantierId_name: { chantierId, name } },
      create: { chantierId, name },
      update: {},
    });
  }
}

function avg(nums: number[]) {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
}

function buildGroupes(progress: ProgressRow[], trancheName: string) {
  const gMap = new Map<string, { percents: number[]; etages: Set<string> }>();
  for (const p of progress.filter((x) => x.tranche === trancheName)) {
    const groupe = p.groupe || 'Ensemble';
    if (!gMap.has(groupe)) gMap.set(groupe, { percents: [], etages: new Set() });
    const g = gMap.get(groupe)!;
    g.percents.push(p.percent);
    if (p.etage) g.etages.add(p.etage);
  }
  return [...gMap.entries()].map(([name, data]) => ({
    name,
    percent: avg(data.percents),
    etages: [...data.etages].sort(),
  }));
}

export async function listChantierTranches(chantierId: string) {
  await syncChantierTranchesFromProgress(chantierId);

  const [tranches, progress, pointedWorkers, missions, purchases, enginCosts] = await Promise.all([
    prisma.chantierTranche.findMany({ where: { chantierId }, orderBy: { name: 'asc' } }),
    prisma.workProgress.findMany({ where: { chantierId } }),
    prisma.pointage.findMany({
      where: { chantierId, tranche: { not: null } },
      distinct: ['tranche', 'workforceId'],
      select: { tranche: true, workforceId: true },
    }),
    prisma.mission.findMany({ where: { chantierId }, include: { engin: true } }),
    prisma.purchase.findMany({
      where: { chantierId },
      select: { tranche: true, totalPrice: true },
    }),
    chantierEnginCosts(chantierId),
  ]);

  return tranches.map((t) => {
    const trancheProgress = progress.filter((p) => p.tranche === t.name);
    const tranchePurchases = purchases.filter((p) => p.tranche === t.name);
    const groupes = buildGroupes(progress as ProgressRow[], t.name);
    return {
      id: t.id,
      name: t.name,
      remark: t.remark,
      estimatedStartDate: t.estimatedStartDate,
      estimatedEndDate: t.estimatedEndDate,
      percent: avg(trancheProgress.map((p) => p.percent)),
      workersCount: pointedWorkers.filter((p) => p.tranche === t.name).length,
      missionsCount: missions.filter((m) => m.tranche === t.name).length,
      tasksCount: trancheProgress.length,
      purchasesCount: tranchePurchases.length,
      purchasesTotal: tranchePurchases.reduce((s, p) => s + Number(p.totalPrice || 0), 0),
      enginsCost: enginCosts.byTranche.find((x) => x.tranche === t.name)?.total || 0,
      groupes,
    };
  });
}

export async function getChantierTrancheDetail(chantierId: string, trancheId: string) {
  const tranche = await prisma.chantierTranche.findFirst({
    where: { id: trancheId, chantierId },
  });
  if (!tranche) return null;

  const [progress, assignments, pointedWorkers, missions, purchases] = await Promise.all([
    prisma.workProgress.findMany({
      where: { chantierId, tranche: tranche.name },
    }),
    prisma.workforceAssignment.findMany({
      where: { chantierId, tranche: tranche.name },
      include: { workforce: true },
      orderBy: { startDate: 'desc' },
    }),
    prisma.pointage.findMany({
      where: { chantierId, tranche: tranche.name },
      distinct: ['workforceId'],
      select: { workforceId: true },
    }),
    prisma.mission.findMany({
      where: { chantierId, tranche: tranche.name },
      include: { engin: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.purchase.findMany({
      where: { chantierId, tranche: tranche.name },
      include: { supplier: true },
      orderBy: { date: 'desc' },
    }),
  ]);

  const orderedProgress = sortProgressByStandardOrder(progress);

  const groupes = buildGroupes(orderedProgress as ProgressRow[], tranche.name);
  const purchasesTotal = purchases.reduce((s, p) => s + Number(p.totalPrice || 0), 0);
  const [enginCosts, enginAssignments] = await Promise.all([
    trancheEnginCosts(chantierId, tranche.name),
    prisma.enginAssignment.findMany({
      where: { chantierId, tranche: tranche.name },
      include: { engin: { select: { id: true, code: true, designation: true, brand: true, genre: true, matricule: true, kind: true, ownershipType: true, status: true } } },
      orderBy: { startDate: 'desc' },
    }),
  ]);

  return {
    id: tranche.id,
    name: tranche.name,
    remark: tranche.remark,
    estimatedStartDate: tranche.estimatedStartDate,
    estimatedEndDate: tranche.estimatedEndDate,
    percent: avg(orderedProgress.map((p) => p.percent)),
    workersCount: pointedWorkers.length,
    missionsCount: missions.length,
    tasksCount: orderedProgress.length,
    purchasesCount: purchases.length,
    purchasesTotal,
    enginsCost: enginCosts.total,
    enginCosts,
    enginAssignments,
    groupes,
    progress: orderedProgress,
    assignments,
    missions,
    purchases,
  };
}
