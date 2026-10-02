import { prisma } from './prisma.js';

/** SQLite peut laisser excludedWorkforceIds vide après db push — Prisma plante alors (P2023). */
export async function repairPointageSessionExclusions() {
  await prisma.$executeRawUnsafe(
    `UPDATE PointageSession SET excludedWorkforceIds = '[]' WHERE excludedWorkforceIds IS NULL OR TRIM(CAST(excludedWorkforceIds AS TEXT)) = '' OR CAST(excludedWorkforceIds AS TEXT) = 'null'`,
  );
}

export function normalizeTranche(raw: unknown) {
  return String(raw ?? '').trim();
}

function frDate(d: Date) {
  return d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
}

/**
 * Règle d'unicité : un seul pointage par jour pour un chantier (sans tranche)
 * et un seul par jour pour chaque tranche. Un pointage « chantier entier » et un
 * pointage « tranche » ne peuvent pas coexister le même jour.
 */
export async function findSessionConflict(chantierId: string, tranche: string, date: Date, excludeId?: string) {
  const sameDay = await prisma.pointageSession.findMany({
    where: { chantierId, date, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, tranche: true },
  });
  const exact = sameDay.find((s) => s.tranche === tranche);
  if (exact) {
    return {
      existingId: exact.id,
      message: tranche
        ? `Un pointage existe déjà le ${frDate(date)} pour la tranche « ${tranche} ».`
        : `Un pointage existe déjà le ${frDate(date)} pour ce chantier.`,
    };
  }
  if (!tranche) {
    const trancheSession = sameDay.find((s) => s.tranche);
    if (trancheSession) {
      return {
        existingId: trancheSession.id,
        message: `Un pointage par tranche (« ${trancheSession.tranche} ») existe déjà le ${frDate(date)} pour ce chantier.`,
      };
    }
  } else {
    const chantierSession = sameDay.find((s) => !s.tranche);
    if (chantierSession) {
      return {
        existingId: chantierSession.id,
        message: `Un pointage « chantier entier » existe déjà le ${frDate(date)} — impossible d'ajouter un pointage de tranche ce jour.`,
      };
    }
  }
  return null;
}

/** Session utilisée pour une ligne saisie hors « Gestion du pointage » (matrice, saisie rapide). */
export async function resolveSessionForLine(chantierId: string, date: Date, trancheRaw?: unknown) {
  const tranche = normalizeTranche(trancheRaw);
  if (tranche) {
    return prisma.pointageSession.upsert({
      where: { chantierId_tranche_date: { chantierId, tranche, date } },
      create: { chantierId, tranche, date },
      update: {},
    });
  }
  const sameDay = await prisma.pointageSession.findMany({
    where: { chantierId, date },
    orderBy: { createdAt: 'asc' },
  });
  const chantierLevel = sameDay.find((s) => !s.tranche);
  if (chantierLevel) return chantierLevel;
  if (sameDay.length === 1) return sameDay[0];
  return prisma.pointageSession.create({ data: { chantierId, tranche: '', date } });
}

/** Rattache les pointages historiques (sans session) à une session chantier/tranche/jour. */
export async function backfillPointageSessions() {
  const orphans = await prisma.pointage.findMany({
    where: { sessionId: null, chantierId: { not: null } },
    select: { id: true, date: true, chantierId: true, workforceId: true, tranche: true },
  });
  if (!orphans.length) return 0;

  const chantierIds = [...new Set(orphans.map((p) => p.chantierId!))];
  const assignments = await prisma.workforceAssignment.findMany({
    where: { chantierId: { in: chantierIds }, tranche: { not: null } },
    select: { chantierId: true, workforceId: true, tranche: true },
  });
  const trancheByWorker = new Map<string, Set<string>>();
  for (const a of assignments) {
    const key = `${a.chantierId}|${a.workforceId}`;
    if (!trancheByWorker.has(key)) trancheByWorker.set(key, new Set());
    const name = normalizeTranche(a.tranche);
    if (name) trancheByWorker.get(key)!.add(name);
  }

  const sessionCache = new Map<string, string>();
  let count = 0;
  for (const p of orphans) {
    const chantierId = p.chantierId!;
    let tranche = normalizeTranche(p.tranche);
    if (!tranche) {
      const set = trancheByWorker.get(`${chantierId}|${p.workforceId}`);
      if (set && set.size === 1) tranche = [...set][0];
    }
    const key = `${chantierId}|${tranche}|${p.date.toISOString()}`;
    let sessionId = sessionCache.get(key);
    if (!sessionId) {
      const session = await prisma.pointageSession.upsert({
        where: { chantierId_tranche_date: { chantierId, tranche, date: p.date } },
        create: { chantierId, tranche, date: p.date },
        update: {},
      });
      sessionId = session.id;
      sessionCache.set(key, sessionId);
    }
    await prisma.pointage.update({
      where: { id: p.id },
      data: { sessionId, tranche: tranche || null },
    });
    count++;
  }
  return count;
}
