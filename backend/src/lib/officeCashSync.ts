import { randomUUID } from 'crypto';
import { prisma } from './prisma.js';
import { getWorkspaceId } from './workspace.js';

export function isCashMode(mode: string | null | undefined) {
  return String(mode || '').trim().toLowerCase() === 'especes';
}

let ready: Promise<void> | null = null;

async function hasColumn(table: string, column: string) {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${table}")`);
  return rows.some((row) => row.name === column);
}

async function addColumn(table: string, column: string) {
  if (await hasColumn(table, column)) return;
  await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" TEXT`);
}

export function ensureOfficeCashColumns() {
  if (!ready) {
    ready = (async () => {
      await addColumn('OfficeCashMovement', 'sourceType');
      await addColumn('OfficeCashMovement', 'sourceId');
      await addColumn('OfficeCashMovement', 'sourceParent');
      await addColumn('InternalStaffSalaryRecord', 'paymentMode');
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

export type OfficeCashInput = {
  sourceType: string;
  sourceId: string;
  sourceParent?: string | null;
  workspaceId?: string | null;
  mode?: string | null;
  direction: 'entree' | 'sortie';
  amount: number;
  date: Date;
  designation: string;
  purpose: 'chantier' | 'travail' | 'aleatoire' | 'alimentation';
  chantierId?: string | null;
  remark?: string | null;
  createdBy?: string | null;
};

export async function removeOfficeCash(sourceType: string, sourceId: string) {
  await ensureOfficeCashColumns();
  await prisma.$executeRawUnsafe(
    `DELETE FROM OfficeCashMovement WHERE sourceType = ? AND sourceId = ?`,
    sourceType,
    sourceId,
  );
}

export async function clearOfficeCashParent(sourceParent: string) {
  await ensureOfficeCashColumns();
  await prisma.$executeRawUnsafe(
    `DELETE FROM OfficeCashMovement WHERE sourceParent = ?`,
    sourceParent,
  );
}

/** Crée ou retire le mouvement de caisse selon le mode. Seules les espèces restent. */
export async function syncOfficeCash(input: OfficeCashInput) {
  await ensureOfficeCashColumns();
  if (!isCashMode(input.mode) || !(input.amount > 0)) {
    await removeOfficeCash(input.sourceType, input.sourceId);
    return;
  }

  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM OfficeCashMovement WHERE sourceType = ? AND sourceId = ? LIMIT 1`,
    input.sourceType,
    input.sourceId,
  );
  const date = input.date.toISOString();
  const chantierId = input.chantierId || null;
  const remark = input.remark || null;
  const parent = input.sourceParent || null;

  if (rows[0]) {
    await prisma.$executeRawUnsafe(
      `UPDATE OfficeCashMovement
       SET date = ?, direction = ?, amount = ?, purpose = ?, designation = ?, chantierId = ?, remark = ?, sourceParent = ?
       WHERE id = ?`,
      date,
      input.direction,
      input.amount,
      input.purpose,
      input.designation,
      chantierId,
      remark,
      parent,
      rows[0].id,
    );
    return;
  }

  const id = randomUUID().replace(/-/g, '').slice(0, 25);
  await prisma.$executeRawUnsafe(
    `INSERT INTO OfficeCashMovement
      (id, workspaceId, date, direction, amount, purpose, designation, chantierId, remark, createdBy, createdAt, sourceType, sourceId, sourceParent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.workspaceId || getWorkspaceId(),
    date,
    input.direction,
    input.amount,
    input.purpose,
    input.designation,
    chantierId,
    remark,
    input.createdBy || null,
    new Date().toISOString(),
    input.sourceType,
    input.sourceId,
    parent,
  );
}
