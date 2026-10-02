import { prisma } from './prisma.js';
import { nextReference } from './references.js';

export type EntrepriseRow = {
  id: string;
  reference: string;
  companyName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  ice: string | null;
  remark: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function mapRow(row: Record<string, unknown>): EntrepriseRow {
  return {
    id: String(row.id),
    reference: String(row.reference || ''),
    companyName: String(row.companyName || ''),
    phone: row.phone != null ? String(row.phone) : null,
    email: row.email != null ? String(row.email) : null,
    address: row.address != null ? String(row.address) : null,
    ice: row.ice != null ? String(row.ice) : null,
    remark: row.remark != null ? String(row.remark) : null,
    isActive: Boolean(row.isActive),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  };
}

export async function listEntreprises(q = '', active = '') {
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM Entreprise
     WHERE (? = '' OR companyName LIKE '%' || ? || '%' OR reference LIKE '%' || ? || '%' OR IFNULL(phone,'') LIKE '%' || ? || '%')
       AND (? = '' OR isActive = CASE WHEN ? = 'false' THEN 0 ELSE 1 END)
     ORDER BY companyName COLLATE NOCASE ASC`,
    q, q, q, q, active, active,
  );
  return rows.map(mapRow);
}

export async function getEntreprise(id: string) {
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM Entreprise WHERE id = ? LIMIT 1`,
    id,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createEntreprise(data: {
  companyName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  ice?: string | null;
  remark?: string | null;
}) {
  const existing = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM Entreprise WHERE lower(companyName) = lower(?) LIMIT 1`,
    data.companyName,
  );
  if (existing[0]) return mapRow(existing[0]);
  const id = `ent_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const reference = await nextReference('ENT');
  const now = new Date().toISOString();
  await prisma.$executeRawUnsafe(
    `INSERT INTO Entreprise (id, reference, companyName, phone, email, address, ice, remark, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    id,
    reference,
    data.companyName,
    data.phone || null,
    data.email || null,
    data.address || null,
    data.ice || null,
    data.remark || null,
    now,
    now,
  );
  return (await getEntreprise(id))!;
}

export async function updateEntreprise(id: string, data: Partial<{
  companyName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  ice: string | null;
  remark: string | null;
  isActive: boolean;
}>) {
  const current = await getEntreprise(id);
  if (!current) return null;
  const next = { ...current, ...data, updatedAt: new Date() };
  await prisma.$executeRawUnsafe(
    `UPDATE Entreprise SET companyName = ?, phone = ?, email = ?, address = ?, ice = ?, remark = ?, isActive = ?, updatedAt = ? WHERE id = ?`,
    next.companyName,
    next.phone,
    next.email,
    next.address,
    next.ice,
    next.remark,
    next.isActive ? 1 : 0,
    next.updatedAt.toISOString(),
    id,
  );
  return getEntreprise(id);
}

export async function deleteEntreprise(id: string) {
  await prisma.$executeRawUnsafe(`DELETE FROM Entreprise WHERE id = ?`, id);
}

export async function backfillEntreprisesFromSubcontracts() {
  const names = await prisma.chantierSubcontractor.findMany({
    select: { companyName: true, phone: true },
    distinct: ['companyName'],
  });
  for (const row of names) {
    const name = String(row.companyName || '').trim();
    if (!name) continue;
    await createEntreprise({ companyName: name, phone: row.phone });
  }
}
