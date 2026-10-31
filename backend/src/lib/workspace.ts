import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '../generated/prisma/index.js';

export const DEMO_WORKSPACE = 'demo';
export const OMAR_WORKSPACE = 'omar';

const SHARED_MODELS = new Set([
  'User',
  'PasswordResetToken',
  'DropdownOption',
  'PurchaseFamily',
  'PurchaseDesignation',
  'Counter',
  'CompanySettings',
]);

type WorkspaceStore = { workspaceId: string; role: string };

const storage = new AsyncLocalStorage<WorkspaceStore>();

export function getWorkspaceId() {
  return storage.getStore()?.workspaceId || DEMO_WORKSPACE;
}

export function getWorkspaceRole() {
  return storage.getStore()?.role || '';
}

export function companySettingsId() {
  const ws = getWorkspaceId();
  return !ws || ws === DEMO_WORKSPACE ? 'default' : ws;
}

export function runWithWorkspace(workspaceId: string, role: string, next: () => void) {
  storage.run({ workspaceId: workspaceId || DEMO_WORKSPACE, role }, next);
}

function isTenanted(model: string) {
  return !SHARED_MODELS.has(model);
}

function delegateName(model: string) {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

async function assertWorkspaceRecord(client: PrismaClient, model: string, where: unknown) {
  if (!isTenanted(model) || !where) return;
  const row = await (client as unknown as Record<string, { findUnique: (args: unknown) => Promise<{ workspaceId?: string } | null> }>)[delegateName(model)].findUnique({
    where,
    select: { workspaceId: true },
  });
  if (row?.workspaceId && row.workspaceId !== getWorkspaceId()) {
    throw new Error('Opération non autorisée sur cet espace');
  }
}

function stampCreateData(data: unknown, ws: string): unknown {
  if (data == null) return data;
  if (Array.isArray(data)) return data.map((item) => stampCreateData(item, ws));
  if (typeof data !== 'object') return data;
  const next: Record<string, unknown> = { ...(data as Record<string, unknown>), workspaceId: ws };
  for (const [key, value] of Object.entries(next)) {
    if (!value || typeof value !== 'object') continue;
    const rel = value as Record<string, unknown>;
    if (rel.create !== undefined) rel.create = stampCreateData(rel.create, ws);
    if (rel.createMany && typeof rel.createMany === 'object') {
      const payload = rel.createMany as { data?: unknown };
      if (payload.data !== undefined) payload.data = stampCreateData(payload.data, ws);
    }
    if (rel.connectOrCreate !== undefined) {
      const items = Array.isArray(rel.connectOrCreate) ? rel.connectOrCreate : [rel.connectOrCreate];
      for (const item of items) {
        if (item && typeof item === 'object' && 'create' in item) {
          (item as { create: unknown }).create = stampCreateData((item as { create: unknown }).create, ws);
        }
      }
    }
  }
  return next;
}

function withWorkspaceWhere(where: unknown, ws: string) {
  if (!where || typeof where !== 'object') return { workspaceId: ws };
  return { AND: [where, { workspaceId: ws }] };
}

export function extendWithWorkspace(client: PrismaClient) {
  return client.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (!isTenanted(model)) {
            if (model === 'User' && getWorkspaceRole() && getWorkspaceRole() !== 'SUPER_ADMIN') {
              args.where = withWorkspaceWhere(args.where, getWorkspaceId()) as typeof args.where;
            }
            return query(args);
          }
          args.where = withWorkspaceWhere(args.where, getWorkspaceId()) as typeof args.where;
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (!isTenanted(model)) return query(args);
          args.where = withWorkspaceWhere(args.where, getWorkspaceId()) as typeof args.where;
          return query(args);
        },
        async findUnique({ model, args, query }) {
          if (!isTenanted(model)) return query(args);
          const delegate = (client as unknown as Record<string, { findFirst: (a: unknown) => Promise<unknown> }>)[delegateName(model)];
          return delegate.findFirst({
            ...args,
            where: { ...(args.where as object), workspaceId: getWorkspaceId() },
          });
        },
        async count({ model, args, query }) {
          if (!isTenanted(model)) return query(args);
          args.where = withWorkspaceWhere(args.where, getWorkspaceId()) as typeof args.where;
          return query(args);
        },
        async aggregate({ model, args, query }) {
          if (!isTenanted(model)) return query(args);
          args.where = withWorkspaceWhere(args.where, getWorkspaceId()) as typeof args.where;
          return query(args);
        },
        async groupBy({ model, args, query }) {
          if (!isTenanted(model)) return query(args);
          args.where = withWorkspaceWhere(args.where, getWorkspaceId()) as typeof args.where;
          return query(args);
        },
        async create({ model, args, query }) {
          if (model === 'User') {
            args.data = { ...(args.data as object), workspaceId: getWorkspaceId() } as typeof args.data;
            return query(args);
          }
          if (!isTenanted(model)) return query(args);
          args.data = stampCreateData(args.data, getWorkspaceId()) as typeof args.data;
          return query(args);
        },
        async createMany({ model, args, query }) {
          if (!isTenanted(model)) return query(args);
          args.data = stampCreateData(args.data, getWorkspaceId()) as typeof args.data;
          return query(args);
        },
        async update({ model, args, query }) {
          if (!isTenanted(model)) return query(args);
          await assertWorkspaceRecord(client, model, args.where);
          return query(args);
        },
        async updateMany({ model, args, query }) {
          if (!isTenanted(model)) return query(args);
          args.where = withWorkspaceWhere(args.where, getWorkspaceId()) as typeof args.where;
          return query(args);
        },
        async delete({ model, args, query }) {
          if (!isTenanted(model)) return query(args);
          await assertWorkspaceRecord(client, model, args.where);
          return query(args);
        },
        async deleteMany({ model, args, query }) {
          if (!isTenanted(model)) return query(args);
          args.where = withWorkspaceWhere(args.where, getWorkspaceId()) as typeof args.where;
          return query(args);
        },
        async upsert({ model, args, query }) {
          if (!isTenanted(model)) return query(args);
          args.create = stampCreateData(args.create, getWorkspaceId()) as typeof args.create;
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

const SKIP_ALTER = new Set([
  '_prisma_migrations',
  'sqlite_sequence',
  'PasswordResetToken',
  'DropdownOption',
  'PurchaseFamily',
  'PurchaseDesignation',
  'Counter',
  'CompanySettings',
]);

export async function ensureWorkspaceColumns(client: PrismaClient) {
  const tables = await client.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  for (const { name } of tables) {
    if (SKIP_ALTER.has(name)) continue;
    try {
      await client.$executeRawUnsafe(
        `ALTER TABLE "${name}" ADD COLUMN workspaceId TEXT NOT NULL DEFAULT 'demo'`,
      );
    } catch {
      /* already exists */
    }
  }
}
