import { prisma } from './prisma.js';
import { getWorkspaceId } from './workspace.js';
import { cinOwnerLabel, findCinOwner, normalizeCin, type CinTable } from './uniqueness.js';

export type SeenPerson = {
  id: string;
  label: string;
  name: string;
  ref: string | null;
  deletePath: string | null;
};

export type ImportDuplicate = {
  line: number;
  incomingName: string;
  matchKind: 'cin' | 'namePhone' | 'email' | 'projectName';
  matchValue: string;
  existing: SeenPerson;
  replay: { path: string; body: Record<string, unknown> };
};

export function collapseName(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function phoneDigits(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '');
}

export function cinDeletePath(table: CinTable, id: string): string | null {
  if (table === 'client') return `/clients/${id}`;
  if (table === 'mandant') return `/mandants/${id}`;
  if (table === 'supplier') return `/achats/suppliers/${id}`;
  if (table === 'workforce') return `/chantiers/workforce/${id}`;
  return null;
}

export function personFromCinOwner(owner: {
  id: string;
  table: CinTable;
  name: string | null;
  ref: string | null;
  category: string | null;
}): SeenPerson {
  return {
    id: owner.id,
    label: cinOwnerLabel(owner.table, owner.category),
    name: owner.name?.trim() || '—',
    ref: owner.ref,
    deletePath: cinDeletePath(owner.table, owner.id),
  };
}

/** Doublon de CIN déjà vu dans le fichier, ou déjà enregistré. N'insère rien. */
export async function takeCinDuplicate(opts: {
  cin: string | undefined;
  incomingName: string;
  line: number;
  seen: Map<string, SeenPerson>;
  replay: { path: string; body: Record<string, unknown> };
}): Promise<ImportDuplicate | null> {
  const key = normalizeCin(opts.cin);
  if (!key) return null;
  let existing = opts.seen.get(key);
  if (!existing) {
    const owner = await findCinOwner(opts.cin);
    if (!owner) return null;
    existing = personFromCinOwner(owner);
  }
  return {
    line: opts.line,
    incomingName: opts.incomingName,
    matchKind: 'cin',
    matchValue: key,
    existing,
    replay: opts.replay,
  };
}

export function rememberCin(seen: Map<string, SeenPerson>, cin: string | undefined, person: SeenPerson) {
  const key = normalizeCin(cin);
  if (key) seen.set(key, person);
}

type AgentHit = { id: string; name: string | null; ref: string | null; phone1: string | null; email: string | null };

export async function findAgentDuplicate(row: {
  firstName: string;
  lastName: string;
  email?: string;
  phone1?: string;
}): Promise<{ person: SeenPerson; kind: 'namePhone' | 'email' } | null> {
  const name = collapseName(`${row.firstName} ${row.lastName}`);
  const phone = phoneDigits(row.phone1);
  const email = String(row.email || '').trim().toLowerCase();
  if (!name) return null;
  const rows = await prisma.$queryRawUnsafe<AgentHit[]>(
    `SELECT id, reference AS ref,
            TRIM(COALESCE(firstName, '') || ' ' || COALESCE(lastName, '')) AS name,
            phone1, email
     FROM Agent
     WHERE IFNULL(workspaceId, 'demo') = ?
       AND (
         LOWER(TRIM(REPLACE(REPLACE(REPLACE(COALESCE(firstName, '') || ' ' || COALESCE(lastName, ''), '  ', ' '), '  ', ' '), '  ', ' '))) = ?
         OR (? != '' AND LOWER(TRIM(COALESCE(email, ''))) = ?)
       )
     LIMIT 30`,
    getWorkspaceId(),
    name,
    email,
    email,
  );
  const byPhone = phone
    ? rows.find((hit) => collapseName(hit.name || '') === name && phoneDigits(hit.phone1) === phone)
    : undefined;
  if (byPhone) {
    return { kind: 'namePhone', person: agentPerson(byPhone) };
  }
  const byEmail = email
    ? rows.find((hit) => String(hit.email || '').trim().toLowerCase() === email)
    : undefined;
  if (byEmail) return { kind: 'email', person: agentPerson(byEmail) };
  return null;
}

function agentPerson(hit: AgentHit): SeenPerson {
  return {
    id: hit.id,
    label: 'Agent',
    name: hit.name?.trim() || '—',
    ref: hit.ref,
    deletePath: `/agents/${hit.id}`,
  };
}

export function agentSeenKeys(row: { firstName: string; lastName: string; email?: string; phone1?: string }) {
  const keys: string[] = [];
  const name = collapseName(`${row.firstName} ${row.lastName}`);
  const phone = phoneDigits(row.phone1);
  const email = String(row.email || '').trim().toLowerCase();
  if (name && phone) keys.push(`np:${name}|${phone}`);
  if (email) keys.push(`em:${email}`);
  return keys;
}

type ProjectHit = { id: string; name: string | null; ref: string | null };

export async function findProjectDuplicate(name: string): Promise<SeenPerson | null> {
  const key = collapseName(name);
  if (!key) return null;
  const rows = await prisma.$queryRawUnsafe<ProjectHit[]>(
    `SELECT id, reference AS ref, name
     FROM Project
     WHERE IFNULL(workspaceId, 'demo') = ?
       AND LOWER(TRIM(REPLACE(REPLACE(REPLACE(name, '  ', ' '), '  ', ' '), '  ', ' '))) = ?
     LIMIT 1`,
    getWorkspaceId(),
    key,
  );
  const hit = rows[0];
  if (!hit) return null;
  return {
    id: hit.id,
    label: 'Projet',
    name: hit.name?.trim() || name,
    ref: hit.ref,
    deletePath: `/immobilier/projects/${hit.id}`,
  };
}
