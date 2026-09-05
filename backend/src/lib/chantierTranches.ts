import { prisma } from './prisma.js';

type ProgressRow = {
  tranche: string | null;
  groupe: string | null;
  etage: string | null;
  taskName: string;
  percent: number;
  id: string;
  updatedAt: Date;
};

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

  const [tranches, progress, assignments, missions, purchases] = await Promise.all([
    prisma.chantierTranche.findMany({ where: { chantierId }, orderBy: { name: 'asc' } }),
    prisma.workProgress.findMany({ where: { chantierId } }),
    prisma.workforceAssignment.findMany({
      where: { chantierId },
      include: { workforce: true },
    }),
    prisma.mission.findMany({ where: { chantierId }, include: { engin: true } }),
    prisma.purchase.findMany({
      where: { chantierId },
      select: { tranche: true, totalPrice: true },
    }),
  ]);

  return tranches.map((t) => {
    const trancheProgress = progress.filter((p) => p.tranche === t.name);
    const tranchePurchases = purchases.filter((p) => p.tranche === t.name);
    const groupes = buildGroupes(progress as ProgressRow[], t.name);
    return {
      id: t.id,
      name: t.name,
      remark: t.remark,
      percent: avg(trancheProgress.map((p) => p.percent)),
      workersCount: assignments.filter((a) => a.tranche === t.name).length,
      missionsCount: missions.filter((m) => m.tranche === t.name).length,
      tasksCount: trancheProgress.length,
      purchasesCount: tranchePurchases.length,
      purchasesTotal: tranchePurchases.reduce((s, p) => s + Number(p.totalPrice || 0), 0),
      groupes,
    };
  });
}

export async function getChantierTrancheDetail(chantierId: string, trancheId: string) {
  const tranche = await prisma.chantierTranche.findFirst({
    where: { id: trancheId, chantierId },
  });
  if (!tranche) return null;

  const [progress, assignments, missions, purchases, stockItems] = await Promise.all([
    prisma.workProgress.findMany({
      where: { chantierId, tranche: tranche.name },
      orderBy: { taskName: 'asc' },
    }),
    prisma.workforceAssignment.findMany({
      where: { chantierId, tranche: tranche.name },
      include: { workforce: true },
      orderBy: { startDate: 'desc' },
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
    prisma.chantierStockItem.findMany({
      where: { chantierId, tranche: tranche.name },
      orderBy: { name: 'asc' },
    }),
  ]);

  const groupes = buildGroupes(progress as ProgressRow[], tranche.name);
  const purchasesTotal = purchases.reduce((s, p) => s + Number(p.totalPrice || 0), 0);

  return {
    id: tranche.id,
    name: tranche.name,
    remark: tranche.remark,
    percent: avg(progress.map((p) => p.percent)),
    workersCount: assignments.length,
    missionsCount: missions.length,
    tasksCount: progress.length,
    purchasesCount: purchases.length,
    purchasesTotal,
    stockCount: stockItems.length,
    groupes,
    progress,
    assignments,
    missions,
    purchases,
    stockItems,
  };
}
