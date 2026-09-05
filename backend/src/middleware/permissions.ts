import type { Request, Response, NextFunction } from 'express';
import { canAccessApi } from '../lib/permissions.js';

export function requirePermission(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentification requise' });
  }
  const path = req.originalUrl.split('?')[0];
  if (!canAccessApi(req.user.role, req.method, path)) {
    return res.status(403).json({ message: 'Accès non autorisé pour votre rôle' });
  }
  next();
}
