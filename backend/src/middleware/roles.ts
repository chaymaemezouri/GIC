import type { Request, Response, NextFunction } from 'express';

const ROLE_RANK: Record<string, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 80,
  COMPTABLE: 60,
  COMMERCIAL: 50,
  CHEF_CHANTIER: 40,
  USER: 10,
};

export function requireRole(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role || '';
    if (!allowed.includes(role) && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Accès non autorisé pour votre rôle' });
    }
    next();
  };
}

export function hasMinRole(userRole: string, minRole: string) {
  return (ROLE_RANK[userRole] || 0) >= (ROLE_RANK[minRole] || 0);
}
