import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { DEMO_WORKSPACE, runWithWorkspace } from '../lib/workspace.js';

export type AuthUser = { id: string; email: string; role: string; workspaceId?: string };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentification requise' });
  }
  try {
    const token = header.slice(7);
    const secret = process.env.JWT_SECRET || 'dev';
    const payload = jwt.verify(token, secret) as AuthUser;
    let workspaceId = payload.workspaceId;
    if (!workspaceId) {
      try {
        const rows = await prisma.$queryRawUnsafe<{ workspaceId: string | null }[]>(
          'SELECT workspaceId FROM User WHERE id = ? LIMIT 1',
          payload.id,
        );
        workspaceId = rows[0]?.workspaceId || DEMO_WORKSPACE;
      } catch {
        workspaceId = DEMO_WORKSPACE;
      }
    }
    req.user = { ...payload, workspaceId };
    runWithWorkspace(workspaceId, payload.role, () => next());
  } catch {
    return res.status(401).json({ message: 'Session expirée ou invalide' });
  }
}
