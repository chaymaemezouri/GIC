import { prisma } from './prisma.js';

export type PartyClient = {
  id: string;
  reference: string;
  firstName: string;
  lastName: string;
};

type DealTable = 'Sale' | 'Rental';

export function formatPartyNames(
  client: { firstName?: string | null; lastName?: string | null } | null | undefined,
  co?: { firstName?: string | null; lastName?: string | null }[] | null,
) {
  const names: string[] = [];
  const main = `${client?.firstName || ''} ${client?.lastName || ''}`.trim();
  if (main) names.push(main);
  for (const person of co || []) {
    const name = `${person.firstName || ''} ${person.lastName || ''}`.trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names.join(', ');
}

export function parsePartyIds(raw: unknown, primaryId: string): string[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    list = parsed;
  } else {
    return [];
  }
  const ids: string[] = [];
  for (const item of list) {
    const id = String(item || '').trim();
    if (!id || id === primaryId || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= 2) break;
  }
  return ids;
}

export async function resolvePartyIds(raw: unknown, primaryId: string): Promise<{ ids: string[] } | { error: string }> {
  let ids: string[];
  try {
    ids = parsePartyIds(raw, primaryId);
  } catch {
    return { error: 'Liste des personnes invalide' };
  }
  if (!ids.length) return { ids };
  const found = await prisma.client.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) return { error: 'Une des personnes associées est introuvable' };
  return { ids };
}

export async function savePartyIds(table: DealTable, id: string, ids: string[]) {
  await prisma.$executeRawUnsafe(
    `UPDATE ${table} SET partyClientIds = ? WHERE id = ?`,
    ids.length ? JSON.stringify(ids) : null,
    id,
  );
}

export async function markParties(ids: string[], role: 'buyer' | 'tenant') {
  if (!ids.length) return;
  await prisma.client.updateMany({
    where: { id: { in: ids } },
    data: role === 'buyer'
      ? { isBuyer: true, isProspect: false }
      : { isTenant: true, isProspect: false },
  });
}

export async function idsWherePartyContains(table: DealTable, clientId: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM ${table} WHERE partyClientIds LIKE ?`,
    `%"${clientId}"%`,
  );
  return rows.map((row) => row.id);
}

async function partyIdsMatchingQuery(table: DealTable, q: string): Promise<string[]> {
  const people = await prisma.client.findMany({
    where: {
      OR: [
        { lastName: { contains: q } },
        { firstName: { contains: q } },
        { reference: { contains: q } },
      ],
    },
    select: { id: true },
    take: 40,
  });
  if (!people.length) return [];
  const clauses = people.map(() => 'partyClientIds LIKE ?').join(' OR ');
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM ${table} WHERE partyClientIds IS NOT NULL AND (${clauses})`,
    ...people.map((person) => `%"${person.id}"%`),
  );
  return rows.map((row) => row.id);
}

export async function saleSearchExtras(q: string, clientId: string) {
  const [nameHits, partyOfClient] = await Promise.all([
    q ? partyIdsMatchingQuery('Sale', q) : Promise.resolve([] as string[]),
    clientId ? idsWherePartyContains('Sale', clientId) : Promise.resolve([] as string[]),
  ]);
  return { nameHits, partyOfClient };
}

export async function rentalSearchExtras(q: string, clientId: string) {
  const [nameHits, partyOfClient] = await Promise.all([
    q ? partyIdsMatchingQuery('Rental', q) : Promise.resolve([] as string[]),
    clientId ? idsWherePartyContains('Rental', clientId) : Promise.resolve([] as string[]),
  ]);
  return { nameHits, partyOfClient };
}

async function readPartyMap(table: DealTable, ids: string[]) {
  const map = new Map<string, string[]>();
  if (!ids.length) return map;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await prisma.$queryRawUnsafe<{ id: string; partyClientIds: string | null }[]>(
    `SELECT id, partyClientIds FROM ${table} WHERE id IN (${placeholders})`,
    ...ids,
  );
  for (const row of rows) {
    try {
      map.set(row.id, parsePartyIds(row.partyClientIds, ''));
    } catch {
      map.set(row.id, []);
    }
  }
  return map;
}

export async function attachCoClients<T extends { id: string }>(table: DealTable, rows: T[]) {
  const map = await readPartyMap(table, rows.map((row) => row.id));
  const ids = [...new Set([...map.values()].flat())];
  const clients = ids.length
    ? await prisma.client.findMany({
        where: { id: { in: ids } },
        select: { id: true, reference: true, firstName: true, lastName: true },
      })
    : [];
  const byId = new Map(clients.map((client) => [client.id, client]));
  return rows.map((row) => ({
    ...row,
    coClients: (map.get(row.id) || [])
      .map((id) => byId.get(id))
      .filter((client): client is PartyClient => !!client),
  }));
}

export async function decoratePropertyParties<T extends { sales?: { id: string }[]; rentals?: { id: string }[] }>(items: T[]) {
  const sales = items.flatMap((item) => item.sales || []);
  const rentals = items.flatMap((item) => item.rentals || []);
  const [saleRows, rentalRows] = await Promise.all([
    attachCoClients('Sale', sales),
    attachCoClients('Rental', rentals),
  ]);
  const saleById = new Map(saleRows.map((row) => [row.id, row]));
  const rentalById = new Map(rentalRows.map((row) => [row.id, row]));
  return items.map((item) => ({
    ...item,
    sales: (item.sales || []).map((sale) => saleById.get(sale.id) || sale),
    rentals: (item.rentals || []).map((rental) => rentalById.get(rental.id) || rental),
  }));
}

export async function extraDealsForClient(table: DealTable, clientId: string) {
  const ids = await idsWherePartyContains(table, clientId);
  if (!ids.length) return [];
  if (table === 'Sale') {
    return prisma.sale.findMany({
      where: { id: { in: ids }, NOT: { clientId } },
      include: { property: true, payments: true },
    });
  }
  return prisma.rental.findMany({
    where: { id: { in: ids }, NOT: { clientId } },
    include: { property: true, payments: true },
  });
}
