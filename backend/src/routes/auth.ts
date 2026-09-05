import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { generateSecret, generateURI, verify } from 'otplib';
import { prisma } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail } from '../lib/email.js';
import crypto from 'crypto';
import { requireRole } from '../middleware/roles.js';
import { sendExcel } from '../lib/exportExcel.js';
import { upload } from '../lib/upload.js';
import path from 'path';
import { parseSidebarPrefs, sanitizeSidebarPrefs } from '../lib/sidebarPrefs.js';
import { actionFilterClause, entityFilterClause } from '../lib/auditFilters.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

function signToken(user: { id: string; email: string; role: string }) {
  const secret = process.env.JWT_SECRET || 'dev';
  const expiresIn = (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'];
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, secret, { expiresIn });
}

function serializeSessionUser(user: {
  id: string;
  email: string;
  username?: string | null;
  firstName: string;
  lastName: string;
  photo?: string | null;
  role: string;
  twoFactorEnabled?: boolean;
  lastLoginAt?: Date | null;
  createdAt?: Date;
  sidebarPrefs?: unknown;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    photo: user.photo,
    role: user.role,
    twoFactorEnabled: user.twoFactorEnabled,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    sidebarPrefs: parseSidebarPrefs(user.role, user.sidebarPrefs),
  };
}

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Identifiants invalides' });
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username: email }],
      isActive: true,
    },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
  }

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    const secret = process.env.JWT_SECRET || 'dev';
    const pendingToken = jwt.sign(
      { id: user.id, pending2FA: true },
      secret,
      { expiresIn: '5m' }
    );
    return res.json({ requires2FA: true, pendingToken });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  const token = signToken(user);
  req.user = { id: user.id, email: user.email, role: user.role };
  await audit(req, 'connexion', 'User', user.id);
  res.json({
    token,
    user: serializeSessionUser(user),
  });
});

router.post('/2fa/verify', async (req, res) => {
  const { pendingToken, code } = req.body;
  if (!pendingToken || !code) {
    return res.status(400).json({ message: 'Code et session requis' });
  }
  try {
    const secret = process.env.JWT_SECRET || 'dev';
    const payload = jwt.verify(pendingToken, secret) as { id: string; pending2FA?: boolean };
    if (!payload.pending2FA) {
      return res.status(400).json({ message: 'Session 2FA invalide' });
    }
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user?.twoFactorSecret) {
      return res.status(400).json({ message: '2FA non configuré' });
    }
    const valid = (await verify({ token: String(code), secret: user.twoFactorSecret })).valid;
    if (!valid) {
      return res.status(401).json({ message: 'Code 2FA incorrect' });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const token = signToken(user);
    await audit(req, 'connexion_2fa', 'User', user.id);
    res.json({
      token,
      user: serializeSessionUser(user),
    });
  } catch {
    return res.status(401).json({ message: 'Session expirée, reconnectez-vous' });
  }
});

router.post('/2fa/setup', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
  const secret = generateSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: secret, twoFactorEnabled: false },
  });
  const otpauthUrl = generateURI({ issuer: 'GIC', label: user.email, secret });
  res.json({ secret, otpauthUrl });
});

router.post('/2fa/enable', requireAuth, async (req, res) => {
  const { code } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.twoFactorSecret) {
    return res.status(400).json({ message: 'Configurez d\'abord la 2FA' });
  }
  const valid = (await verify({ token: String(code), secret: user.twoFactorSecret })).valid;
  if (!valid) return res.status(400).json({ message: 'Code incorrect' });
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true },
  });
  await audit(req, 'activation_2fa', 'User', user.id);
  res.json({ ok: true, twoFactorEnabled: true });
});

router.post('/2fa/disable', requireAuth, async (req, res) => {
  const { code, password } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Mot de passe incorrect' });
  }
  if (user.twoFactorSecret) {
    const valid = (await verify({ token: String(code), secret: user.twoFactorSecret })).valid;
    if (!valid) return res.status(400).json({ message: 'Code 2FA incorrect' });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });
  await audit(req, 'désactivation_2fa', 'User', user.id);
  res.json({ ok: true });
});

router.post('/supplier/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email et mot de passe requis' });
  }
  const supplier = await prisma.supplier.findFirst({
    where: { email, isActive: true, passwordHash: { not: null } },
  });
  if (!supplier?.passwordHash || !(await bcrypt.compare(password, supplier.passwordHash))) {
    return res.status(401).json({ message: 'Identifiants fournisseur incorrects' });
  }
  const secret = process.env.JWT_SECRET || 'dev';
  const token = jwt.sign(
    { id: supplier.id, email: supplier.email, role: 'SUPPLIER', supplierId: supplier.id },
    secret,
    { expiresIn: '8h' }
  );
  res.json({
    token,
    supplier: {
      id: supplier.id,
      reference: supplier.reference,
      companyName: supplier.companyName,
      email: supplier.email,
    },
  });
});

router.get('/me/stats', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const q = String(req.query.q || '').trim();
  const action = String(req.query.action || '');
  const entity = String(req.query.entity || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const activityWhere = buildMyActivityWhere(userId, q, action, entity, dateFrom, dateTo);

  const [user, actionsMonth, actionsTotal, unreadNotifs, actionsFiltered, actionGroups, entityGroups] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.auditLog.count({ where: { userId, createdAt: { gte: monthStart } } }),
    prisma.auditLog.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.auditLog.count({ where: activityWhere }),
    prisma.auditLog.groupBy({ by: ['action'], where: { userId }, _count: true, orderBy: { _count: { action: 'desc' } } }),
    prisma.auditLog.groupBy({ by: ['entity'], where: { userId }, _count: true, orderBy: { _count: { entity: 'desc' } } }),
  ]);
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

  res.json({
    twoFactorEnabled: user.twoFactorEnabled,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    actionsMonth,
    actionsTotal,
    actionsFiltered,
    unreadNotifications: unreadNotifs,
    role: user.role,
    actions: actionGroups.map((g) => ({ id: g.action, count: g._count })),
    entities: entityGroups.map((g) => ({ id: g.entity, count: g._count })),
  });
});

function buildMyActivityWhere(userId: string, q: string, action: string, entity: string, dateFrom: string, dateTo: string) {
  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo) : null;
  if (from) from.setHours(0, 0, 0, 0);
  if (to) to.setHours(23, 59, 59, 999);

  const qNorm = q.toLowerCase();
  const entityAliases: string[] = [];
  if (qNorm.includes('caisse') || qNorm.includes('officecash')) {
    entityAliases.push('Caisse', 'OfficeCashMovement');
  }
  if (qNorm.includes('balance') || (qNorm.includes('cash') && !qNorm.includes('caisse'))) {
    entityAliases.push('CashMovement');
  }

  const actionSearch =
    qNorm.includes('ajout')
      ? [{ action: 'création' }, { action: 'création_auto' }]
      : [];

  return {
    userId,
    AND: [
      q
        ? {
            OR: [
              { action: { contains: q } },
              { entity: { contains: q } },
              { details: { contains: q } },
              ...entityAliases.map((e) => ({ entity: e })),
              ...actionSearch,
            ],
          }
        : {},
      actionFilterClause(action),
      entityFilterClause(entity),
      from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {},
    ],
  };
}

function buildMyActivityOrderBy(sort: string, order: 'asc' | 'desc') {
  if (sort === 'action') return { action: order };
  if (sort === 'entity') return { entity: order };
  return { createdAt: order };
}

router.get('/me/activity/export/csv', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const q = String(req.query.q || '').trim();
  const action = String(req.query.action || '');
  const entity = String(req.query.entity || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const sort = String(req.query.sort || 'createdAt');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const where = buildMyActivityWhere(userId, q, action, entity, dateFrom, dateTo);

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: buildMyActivityOrderBy(sort, order),
    take: 2000,
  });

  const header = 'Date;Action;Entité;ID entité;Détails;IP';
  const rows = logs.map((l) =>
    [l.createdAt.toISOString(), l.action, l.entity, l.entityId || '', (l.details || '').replace(/;/g, ','), l.ipAddress || ''].join(';')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=mon-activite-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/me/activity/export/xlsx', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const q = String(req.query.q || '').trim();
  const action = String(req.query.action || '');
  const entity = String(req.query.entity || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const sort = String(req.query.sort || 'createdAt');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const where = buildMyActivityWhere(userId, q, action, entity, dateFrom, dateTo);

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: buildMyActivityOrderBy(sort, order),
    take: 5000,
  });

  sendExcel(
    res,
    'mon-activite-gic.xlsx',
    'Mon activité',
    logs.map((l) => ({
      Date: l.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      Action: l.action,
      Entité: l.entity,
      'ID entité': l.entityId || '',
      Détails: l.details || '',
      IP: l.ipAddress || '',
    })),
  );
});

router.get('/me/activity', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const q = String(req.query.q || '').trim();
  const action = String(req.query.action || '');
  const entity = String(req.query.entity || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const sort = String(req.query.sort || 'createdAt');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const where = buildMyActivityWhere(userId, q, action, entity, dateFrom, dateTo);
  const orderBy = buildMyActivityOrderBy(sort, order);

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy, skip, take: limit }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.put('/me/profile', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { firstName, lastName, username } = req.body;
  if (!firstName?.trim() || !lastName?.trim()) {
    return res.status(400).json({ message: 'Prénom et nom requis' });
  }
  if (username) {
    const exists = await prisma.user.findFirst({
      where: { username, NOT: { id: userId } },
    });
    if (exists) return res.status(400).json({ message: 'Nom d\'utilisateur déjà pris' });
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      username: username ? String(username).trim() : null,
    },
  });
  await audit(req, 'modification', 'User', userId, 'Profil compte');
  res.json(serializeSessionUser(user));
});

router.put('/me/sidebar', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    if (req.body?.reset) {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { sidebarPrefs: null },
      });
      await audit(req, 'modification', 'User', user.id, 'Barre latérale — défaut');
      return res.json({ sidebarPrefs: parseSidebarPrefs(updated.role, updated.sidebarPrefs) });
    }

    const prefs = sanitizeSidebarPrefs(user.role, req.body);
    if (!prefs) {
      return res.status(400).json({ message: 'Configuration barre latérale invalide' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { sidebarPrefs: prefs },
    });
    await audit(req, 'modification', 'User', user.id, 'Barre latérale');
    res.json({ sidebarPrefs: parseSidebarPrefs(updated.role, updated.sidebarPrefs) });
  } catch (e) {
    console.error('PUT /me/sidebar', e);
    res.status(500).json({ message: 'Erreur lors de la mise à jour de la barre latérale' });
  }
});

router.post('/me/photo', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Photo requise' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return res.status(400).json({ message: 'Format photo : JPG, PNG ou WebP' });
  }
  const photo = `/uploads/${req.file.filename}`;
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { photo },
  });
  await audit(req, 'photo', 'User', user.id);
  res.json(serializeSessionUser(user));
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
  res.json(serializeSessionUser(user));
});

router.put('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(401).json({ message: 'Mot de passe actuel incorrect' });
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await audit(req, 'changement_mot_de_passe', 'User', user.id);
  res.json({ ok: true });
});

router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ message: 'Email requis' });
  const user = await prisma.user.findFirst({ where: { email, isActive: true } });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });
    const base = process.env.FRONTEND_URL || 'http://localhost:5173';
    const link = `${base}/login?reset=${token}`;
    await sendEmail(
      user.email,
      'Réinitialisation mot de passe GIC',
      `Bonjour ${user.firstName},\n\nCliquez sur ce lien pour réinitialiser votre mot de passe (valide 1h) :\n${link}\n\nGIC — ECC`
    ).catch(() => {});
  }
  res.json({ ok: true, message: 'Si le compte existe, un email a été envoyé.' });
});

router.post('/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const newPassword = String(req.body?.newPassword || '');
  if (!token || newPassword.length < 6) {
    return res.status(400).json({ message: 'Token et mot de passe (6+ car.) requis' });
  }
  const row = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    return res.status(400).json({ message: 'Lien expiré ou invalide' });
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
  ]);
  res.json({ ok: true });
});

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'COMPTABLE', 'COMMERCIAL', 'CHEF_CHANTIER', 'USER'] as const;

const userPublicSelect = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  photo: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  twoFactorEnabled: true,
  internalStaff: { select: { id: true, reference: true } },
} as const;

function buildUserWhere(q: string, role: string, active: string) {
  return {
    AND: [
      q
        ? {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { email: { contains: q } },
              { username: { contains: q } },
            ],
          }
        : {},
      role ? { role } : {},
      active === 'true' ? { isActive: true } : active === 'false' ? { isActive: false } : {},
    ],
  };
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    SUPER_ADMIN: 'Super Administrateur',
    ADMIN: 'Administrateur',
    COMPTABLE: 'Comptable',
    COMMERCIAL: 'Commercial',
    CHEF_CHANTIER: 'Chef de chantier',
    USER: 'Utilisateur',
  };
  return labels[role] || role;
}

router.get('/users/stats', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const role = String(req.query.role || '');
  const active = String(req.query.active || '');
  const where = buildUserWhere(q, role, active);

  const [total, actifs] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { ...where, isActive: true } }),
  ]);
  res.json({
    total,
    actifs,
    inactifs: total - actifs,
  });
});

router.get('/users/export/csv', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const role = String(req.query.role || '');
  const active = String(req.query.active || '');
  const where = buildUserWhere(q, role, active);

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: userPublicSelect,
  });

  const header = 'Prénom;Nom;Email;Rôle;Statut;2FA;Dernière connexion';
  const rows = users.map((u) =>
    [
      u.firstName,
      u.lastName,
      u.email,
      roleLabel(u.role),
      u.isActive ? 'Actif' : 'Inactif',
      u.twoFactorEnabled ? 'Oui' : 'Non',
      u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 16).replace('T', ' ') : '',
    ].join(';'),
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=utilisateurs-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/users/export/xlsx', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const role = String(req.query.role || '');
  const active = String(req.query.active || '');
  const where = buildUserWhere(q, role, active);

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: userPublicSelect,
    take: 5000,
  });

  sendExcel(
    res,
    'utilisateurs-gic.xlsx',
    'Utilisateurs',
    users.map((u) => ({
      Prénom: u.firstName,
      Nom: u.lastName,
      Email: u.email,
      Rôle: roleLabel(u.role),
      Statut: u.isActive ? 'Actif' : 'Inactif',
      '2FA': u.twoFactorEnabled ? 'Oui' : 'Non',
      'Dernière connexion': u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 16).replace('T', ' ') : '',
      'Créé le': u.createdAt.toISOString().slice(0, 10),
    })),
  );
});

router.get('/users', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const role = String(req.query.role || '');
  const active = String(req.query.active || '');
  const sort = String(req.query.sort || 'lastName');
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const where = buildUserWhere(q, role, active);

  const orderBy =
    sort === 'email'
      ? { email: order as 'asc' | 'desc' }
      : sort === 'role'
        ? { role: order as 'asc' | 'desc' }
        : sort === 'createdAt'
          ? { createdAt: order as 'asc' | 'desc' }
          : sort === 'lastLoginAt'
            ? { lastLoginAt: order as 'asc' | 'desc' }
            : sort === 'firstName'
              ? { firstName: order as 'asc' | 'desc' }
              : { lastName: order as 'asc' | 'desc' };

  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy, skip, take: limit, select: userPublicSelect }),
    prisma.user.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.get('/users/:id/history', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const id = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'User', entityId: id },
        { userId: id },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/users/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const id = String(req.params.id);
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...userPublicSelect,
      _count: { select: { auditLogs: true, notifications: true, managedChantiers: true } },
    },
  });
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
  res.json(user);
});

router.post('/users', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const { email, password, firstName, lastName, role } = req.body;
  if (!email?.trim() || !password || !firstName?.trim() || !lastName?.trim()) {
    return res.status(400).json({ message: 'Email, mot de passe, prénom et nom requis' });
  }
  const roleVal = ROLES.includes(role) ? role : 'USER';
  if (roleVal === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ message: 'Seul un super administrateur peut créer ce rôle' });
  }
  const existing = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
  if (existing) return res.status(400).json({ message: 'Email déjà utilisé' });
  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = await prisma.user.create({
    data: {
      email: String(email).trim().toLowerCase(),
      passwordHash,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      role: roleVal,
    },
    select: userPublicSelect,
  });
  await audit(req, 'création', 'User', user.id, user.email);
  res.status(201).json(user);
});

router.put('/users/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const id = String(req.params.id);
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ message: 'Utilisateur introuvable' });
  if (target.role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN' && req.user!.id !== id) {
    return res.status(403).json({ message: 'Modification non autorisée' });
  }
  const data: Record<string, unknown> = {};
  if (req.body.firstName != null) data.firstName = String(req.body.firstName).trim();
  if (req.body.lastName != null) data.lastName = String(req.body.lastName).trim();
  if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
  if (req.body.role != null && ROLES.includes(req.body.role)) {
    if (req.body.role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Rôle non autorisé' });
    }
    data.role = req.body.role;
  }
  if (req.body.password) {
    data.passwordHash = await bcrypt.hash(String(req.body.password), 10);
  }
  const user = await prisma.user.update({ where: { id }, data: data as never, select: userPublicSelect });
  await audit(req, 'modification', 'User', user.id, user.email);
  res.json(user);
});

export default router;
