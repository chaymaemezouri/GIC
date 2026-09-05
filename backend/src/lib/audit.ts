import { prisma } from './prisma.js';
import type { Request } from 'express';

export async function audit(
  req: Request,
  action: string,
  entity: string,
  entityId?: string,
  details?: string
) {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entity,
      entityId,
      details,
      ipAddress: req.ip,
    },
  });
}
