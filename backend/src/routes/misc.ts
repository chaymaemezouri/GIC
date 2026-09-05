import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import { sendExcel } from '../lib/exportExcel.js';
import { actionFilterClause, entityFilterClause } from '../lib/auditFilters.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

const CATEGORY_LABELS: Record<string, string> = {
  identity_type: "Types d'identité",
  payment_mode: 'Modes de paiement',
  property_status: 'Statuts biens',
  contract_type: 'Types de contrat',
  work_category: "Catégories main-d'œuvre",
  chantier_status: 'Statuts chantier',
  purchase_status: 'Statuts achats',
  engin_status: 'Statuts engins',
};

function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] || category.replace(/_/g, ' ');
}

function buildDropdownWhere(q: string, category: string, active: string) {
  return {
    AND: [
      q
        ? {
            OR: [
              { label: { contains: q } },
              { value: { contains: q } },
              { category: { contains: q } },
            ],
          }
        : {},
      category ? { category } : {},
      active === 'true' ? { isActive: true } : active === 'false' ? { isActive: false } : {},
    ],
  };
}

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) return res.json({ results: [] });

  const [clients, properties, sales, chantiers, engins, documents] = await Promise.all([
    prisma.client.findMany({
      where: {
        OR: [
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { reference: { contains: q } },
          { email: { contains: q } },
        ],
      },
      take: 5,
    }),
    prisma.property.findMany({
      where: {
        OR: [{ name: { contains: q } }, { reference: { contains: q } }],
      },
      take: 5,
    }),
    prisma.sale.findMany({
      where: { reference: { contains: q } },
      take: 5,
      include: { client: true },
    }),
    prisma.chantier.findMany({
      where: { name: { contains: q } },
      take: 5,
    }),
    prisma.engin.findMany({
      where: {
        OR: [{ matricule: { contains: q } }, { brand: { contains: q } }],
      },
      take: 5,
    }),
    prisma.document.findMany({
      where: { name: { contains: q } },
      take: 5,
    }),
  ]);

  const results = [
    ...clients.map((c) => ({
      type: 'client',
      id: c.id,
      label: `${c.reference} — ${c.firstName} ${c.lastName}`,
      path: `/clients/${c.id}`,
    })),
    ...properties.map((p) => ({
      type: 'bien',
      id: p.id,
      label: `${p.reference} — ${p.name}`,
      path: `/biens/${p.id}`,
    })),
    ...sales.map((s) => ({
      type: 'vente',
      id: s.id,
      label: `${s.reference} — ${s.client.firstName} ${s.client.lastName}`,
      path: `/ventes`,
    })),
    ...chantiers.map((c) => ({
      type: 'chantier',
      id: c.id,
      label: c.name,
      path: `/chantiers/${c.id}`,
    })),
    ...engins.map((e) => ({
      type: 'engin',
      id: e.id,
      label: `${e.matricule || ''} ${e.brand || ''}`.trim(),
      path: `/engins`,
    })),
    ...documents.map((d) => ({
      type: 'document',
      id: d.id,
      label: d.name,
      path: `/documents`,
    })),
  ];

  res.json({ results });
});

function buildNotificationCategoryWhere(category: string) {
  const c = category.toLowerCase();
  if (c === 'alert') {
    return {
      OR: [
        { type: { contains: 'alert' } },
        { type: { contains: 'error' } },
        { type: { contains: 'retard' } },
        { type: 'warning' },
      ],
    };
  }
  if (c === 'success') {
    return {
      OR: [
        { type: { contains: 'success' } },
        { type: { contains: 'ok' } },
        { type: { contains: 'valid' } },
      ],
    };
  }
  if (c === 'achat') return { type: { contains: 'achat' } };
  if (c === 'chantier') {
    return { OR: [{ type: { contains: 'chantier' } }, { type: { contains: 'ops' } }] };
  }
  if (c === 'finance') {
    return {
      OR: [
        { type: { contains: 'finance' } },
        { type: { contains: 'paiement' } },
        { type: { contains: 'caisse' } },
      ],
    };
  }
  if (c === 'doc') return { type: { contains: 'doc' } };
  if (c === 'info') return { type: 'info' };
  return {};
}

function buildNotificationWhere(userId: string, q: string, unreadOnly: boolean, category: string) {
  return {
    userId,
    ...(unreadOnly ? { isRead: false } : {}),
    AND: [
      q
        ? {
            OR: [
              { title: { contains: q } },
              { message: { contains: q } },
              { type: { contains: q } },
            ],
          }
        : {},
      category ? buildNotificationCategoryWhere(category) : {},
    ],
  };
}

router.get('/notifications/stats', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const unreadOnly = String(req.query.unread || '') === '1';
  const category = String(req.query.category || '');
  const where = buildNotificationWhere(req.user!.id, q, unreadOnly, category);
  const [total, unread] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: { ...where, isRead: false },
    }),
  ]);
  res.json({ total, unread, read: total - unread });
});

router.get('/notifications', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const unreadOnly = String(req.query.unread || '') === '1';
  const category = String(req.query.category || '');
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const where = buildNotificationWhere(req.user!.id, q, unreadOnly, category);

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: { userId: req.user!.id, isRead: false },
    }),
  ]);
  res.json({
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    unreadCount,
  });
});

router.post('/notifications/read-all', async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true },
  });
  res.json({ ok: true, count: result.count });
});

router.post('/notifications/:id/read', async (req, res) => {
  const id = String(req.params.id);
  const notif = await prisma.notification.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!notif) return res.status(404).json({ message: 'Notification introuvable' });
  await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
  res.json({ ok: true });
});

router.delete('/notifications/:id', async (req, res) => {
  const id = String(req.params.id);
  const notif = await prisma.notification.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!notif) return res.status(404).json({ message: 'Notification introuvable' });
  await prisma.notification.delete({ where: { id } });
  res.json({ ok: true });
});

router.get('/dropdowns/stats', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const active = String(req.query.active || '');
  const where = buildDropdownWhere(q, category, active);

  const [total, actifs, grouped] = await Promise.all([
    prisma.dropdownOption.count({ where }),
    prisma.dropdownOption.count({ where: { ...where, isActive: true } }),
    prisma.dropdownOption.groupBy({ by: ['category'], where, _count: { _all: true } }),
  ]);
  res.json({
    total,
    actifs,
    inactifs: total - actifs,
    categoriesCount: grouped.length,
    categories: grouped.map((g) => ({
      id: g.category,
      label: categoryLabel(g.category),
      count: g._count._all,
    })),
  });
});

router.get('/dropdowns/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const active = String(req.query.active || '');
  const where = buildDropdownWhere(q, category, active);

  const items = await prisma.dropdownOption.findMany({
    where,
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
  });

  const header = 'Catégorie;Label catégorie;Label;Valeur;Ordre;Actif';
  const rows = items.map((i) =>
    [
      i.category,
      categoryLabel(i.category),
      i.label,
      i.value,
      i.sortOrder,
      i.isActive ? 'Oui' : 'Non',
    ].join(';')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=referentiels-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/dropdowns/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const active = String(req.query.active || '');
  const where = buildDropdownWhere(q, category, active);

  const items = await prisma.dropdownOption.findMany({
    where,
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    take: 5000,
  });

  sendExcel(
    res,
    'referentiels-gic.xlsx',
    'Référentiels',
    items.map((i) => ({
      Catégorie: i.category,
      'Label catégorie': categoryLabel(i.category),
      Label: i.label,
      Valeur: i.value,
      Ordre: i.sortOrder,
      Actif: i.isActive ? 'Oui' : 'Non',
    })),
  );
});

router.get('/dropdowns/item/:id', async (req, res) => {
  const item = await prisma.dropdownOption.findUnique({ where: { id: String(req.params.id) } });
  if (!item) return res.status(404).json({ message: 'Option introuvable' });
  res.json(item);
});

router.get('/dropdowns', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '');
  const active = String(req.query.active || '');
  const sort = String(req.query.sort || 'category');
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const paginated = !!(req.query.page || req.query.limit || req.query.q || req.query.category || req.query.active || req.query.sort);

  if (!paginated) {
    const items = await prisma.dropdownOption.findMany({ orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] });
    const categories = [...new Set(items.map((i) => i.category))];
    return res.json({ categories, items });
  }

  const where = buildDropdownWhere(q, category, active);
  const orderBy =
    sort === 'label'
      ? { label: order as 'asc' | 'desc' }
      : sort === 'value'
        ? { value: order as 'asc' | 'desc' }
        : sort === 'sortOrder'
          ? { sortOrder: order as 'asc' | 'desc' }
          : sort === 'createdAt'
            ? { createdAt: order as 'asc' | 'desc' }
            : [{ category: order as 'asc' | 'desc' }, { sortOrder: 'asc' as const }];

  const [items, total] = await Promise.all([
    prisma.dropdownOption.findMany({ where, orderBy, skip, take: limit }),
    prisma.dropdownOption.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.post('/dropdowns', async (req, res) => {
  const { category, label, value, sortOrder } = req.body;
  if (!category || !label || !value) {
    return res.status(400).json({ message: 'Catégorie, label et value requis' });
  }

  const exists = await prisma.dropdownOption.findFirst({
    where: { category, value, isActive: true },
  });
  if (exists) {
    return res.status(400).json({ message: 'Cette valeur existe déjà dans la catégorie' });
  }

  const maxOrder = await prisma.dropdownOption.aggregate({
    where: { category },
    _max: { sortOrder: true },
  });
  const item = await prisma.dropdownOption.create({
    data: {
      category,
      label,
      value,
      sortOrder: sortOrder != null ? Number(sortOrder) : (maxOrder._max.sortOrder ?? 0) + 1,
    },
  });
  await audit(req, 'création', 'DropdownOption', item.id, `${category}: ${label}`);
  res.status(201).json(item);
});

router.put('/dropdowns/:id', async (req, res) => {
  const id = String(req.params.id);
  const data: Record<string, unknown> = {};
  if (req.body.label != null) data.label = String(req.body.label);
  if (req.body.value != null) data.value = String(req.body.value);
  if (req.body.category != null) data.category = String(req.body.category);
  if (req.body.sortOrder != null) data.sortOrder = Number(req.body.sortOrder);
  if (req.body.isActive != null) data.isActive = !!req.body.isActive;

  const item = await prisma.dropdownOption.update({ where: { id }, data });
  await audit(req, 'modification', 'DropdownOption', id, `${item.category}: ${item.label}`);
  res.json(item);
});

router.delete('/dropdowns/:id', async (req, res) => {
  const id = String(req.params.id);
  const item = await prisma.dropdownOption.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ message: 'Option introuvable' });

  await prisma.dropdownOption.update({
    where: { id },
    data: { isActive: false },
  });
  await audit(req, 'suppression', 'DropdownOption', id, `${item.category}: ${item.label}`);
  res.json({ ok: true });
});

router.get('/dropdowns/:category', async (req, res) => {
  res.json(
    await prisma.dropdownOption.findMany({
      where: { category: req.params.category, isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
  );
});

router.get('/audit/stats', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const action = String(req.query.action || '');
  const entity = String(req.query.entity || '');
  const userId = String(req.query.userId || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const where = buildAuditWhere(q, action, entity, userId, dateFrom, dateTo);

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  const [total, today, week, groupedUsers, groupedEntities, groupedActions] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.count({ where: { ...where, createdAt: { gte: todayStart } } }),
    prisma.auditLog.count({ where: { ...where, createdAt: { gte: weekStart } } }),
    prisma.auditLog.groupBy({ by: ['userId'], where: { ...where, userId: { not: null } }, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ['entity'], where, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ['action'], where, _count: { _all: true } }),
  ]);

  res.json({
    total,
    today,
    week,
    usersCount: groupedUsers.length,
    entities: groupedEntities
      .map((e) => ({ id: e.entity, count: e._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    actions: groupedActions
      .map((a) => ({ id: a.action, count: a._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
  });
});

function buildAuditWhere(
  q: string,
  action: string,
  entity: string,
  userId: string,
  dateFrom: string,
  dateTo: string
) {
  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo) : null;
  if (from) from.setHours(0, 0, 0, 0);
  if (to) to.setHours(23, 59, 59, 999);

  return {
    AND: [
      q
        ? {
            OR: [
              { action: { contains: q } },
              { entity: { contains: q } },
              { details: { contains: q } },
              { entityId: { contains: q } },
              { ipAddress: { contains: q } },
              { user: { firstName: { contains: q } } },
              { user: { lastName: { contains: q } } },
              { user: { email: { contains: q } } },
            ],
          }
        : {},
      actionFilterClause(action),
      entityFilterClause(entity),
      userId ? { userId } : {},
      from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {},
    ],
  };
}

router.get('/audit/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const action = String(req.query.action || '');
  const entity = String(req.query.entity || '');
  const userId = String(req.query.userId || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const where = buildAuditWhere(q, action, entity, userId, dateFrom, dateTo);

  const logs = await prisma.auditLog.findMany({
    where,
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const header = 'Date;Utilisateur;Email;Action;Entité;ID entité;Détails;IP';
  const rows = logs.map((l) =>
    [
      l.createdAt.toISOString(),
      l.user ? `${l.user.firstName} ${l.user.lastName}` : '',
      l.user?.email || '',
      l.action,
      l.entity,
      l.entityId || '',
      (l.details || '').replace(/;/g, ','),
      l.ipAddress || '',
    ].join(';')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=audit-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/audit/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const action = String(req.query.action || '');
  const entity = String(req.query.entity || '');
  const userId = String(req.query.userId || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const where = buildAuditWhere(q, action, entity, userId, dateFrom, dateTo);

  const logs = await prisma.auditLog.findMany({
    where,
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  sendExcel(
    res,
    'audit-gic.xlsx',
    'Audit',
    logs.map((l) => ({
      Date: l.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      Utilisateur: l.user ? `${l.user.firstName} ${l.user.lastName}` : '',
      Email: l.user?.email || '',
      Action: l.action,
      Entité: l.entity,
      'ID entité': l.entityId || '',
      Détails: l.details || '',
      IP: l.ipAddress || '',
    })),
  );
});

router.get('/audit/:id', async (req, res) => {
  const log = await prisma.auditLog.findUnique({
    where: { id: String(req.params.id) },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  if (!log) return res.status(404).json({ message: 'Entrée introuvable' });
  res.json(log);
});

router.get('/audit', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const action = String(req.query.action || '');
  const entity = String(req.query.entity || '');
  const userId = String(req.query.userId || '');
  const dateFrom = String(req.query.dateFrom || '');
  const dateTo = String(req.query.dateTo || '');
  const sort = String(req.query.sort || 'createdAt');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const paginated = !!(
    req.query.page ||
    req.query.limit ||
    req.query.q ||
    req.query.action ||
    req.query.entity ||
    req.query.userId ||
    req.query.dateFrom ||
    req.query.dateTo
  );

  if (!paginated) {
    return res.json(
      await prisma.auditLog.findMany({
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    );
  }

  const where = buildAuditWhere(q, action, entity, userId, dateFrom, dateTo);
  const orderBy =
    sort === 'action'
      ? { action: order as 'asc' | 'desc' }
      : sort === 'entity'
        ? { entity: order as 'asc' | 'desc' }
        : { createdAt: order as 'asc' | 'desc' };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

const DEFAULT_BANK_INTRO =
  'Madame, Monsieur,\n\nNous vous prions de bien vouloir procéder au virement des salaires au profit des bénéficiaires dont la liste figure ci-après, selon les coordonnées bancaires (CIN et RIB) indiquées pour chacun.\n\nNous vous remercions de l\'attention que vous porterez à la présente demande.\n\nCordialement,';

async function getOrCreateCompanySettings() {
  let row = await prisma.companySettings.findUnique({ where: { id: 'default' } });
  if (!row) {
    row = await prisma.companySettings.create({
      data: {
        id: 'default',
        companyName: 'GIC — Expertise & Consulting',
        bankLetterTitle: 'Demande de virement de salaires',
        bankLetterIntro: DEFAULT_BANK_INTRO,
      },
    });
  }
  return row;
}

router.get('/settings/company', async (_req, res) => {
  res.json(await getOrCreateCompanySettings());
});

router.put('/settings/company', async (req, res) => {
  await getOrCreateCompanySettings();
  const b = req.body || {};
  const data: Record<string, unknown> = {};
  for (const key of [
    'companyName', 'address', 'city', 'phone', 'email', 'ice', 'rc',
    'bankLetterTitle', 'bankLetterIntro', 'bankLetterFooter',
  ] as const) {
    if (b[key] !== undefined) data[key] = b[key] == null ? null : String(b[key]);
  }
  const row = await prisma.companySettings.update({ where: { id: 'default' }, data: data as never });
  await audit(req, 'modification', 'CompanySettings', 'default', 'Paramètres société / liste banque');
  res.json(row);
});

router.post('/settings/company/logo', async (req, res, next) => {
  const { upload } = await import('../lib/upload.js');
  upload.single('logo')(req, res, async (err) => {
    if (err) return next(err);
    try {
      if (!req.file) return res.status(400).json({ message: 'Logo requis' });
      await getOrCreateCompanySettings();
      const logoPath = `/uploads/${req.file.filename}`;
      const row = await prisma.companySettings.update({
        where: { id: 'default' },
        data: { logoPath },
      });
      await audit(req, 'upload', 'CompanySettings', 'default', 'Logo société');
      res.json(row);
    } catch (e) {
      next(e);
    }
  });
});

/** Candidats pour liste de virement banque (MO + équipe) */
router.get('/salaires/virement-candidates', async (req, res) => {
  const source = String(req.query.source || 'all'); // all | ouvrier | equipe
  const bank = String(req.query.bank || '').trim();
  const q = String(req.query.q || '').trim().toLowerCase();
  const withRibOnly = String(req.query.withRib || '') === 'true';

  type Row = {
    id: string;
    source: 'ouvrier' | 'equipe';
    firstName: string;
    lastName: string;
    cin: string | null;
    bankName: string | null;
    rib: string | null;
    category?: string | null;
  };

  const rows: Row[] = [];

  if (source === 'all' || source === 'ouvrier') {
    const workers = await prisma.workforce.findMany({
      where: { isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        cin: true,
        bankName: true,
        rib: true,
        category: true,
        salaryPeriod: true,
      },
    });
    for (const w of workers) {
      rows.push({
        id: `w:${w.id}`,
        source: 'ouvrier',
        firstName: w.firstName,
        lastName: w.lastName,
        cin: w.cin,
        bankName: w.bankName,
        rib: w.rib,
        category: w.category || (w.salaryPeriod === 'mois' ? 'Mensuel' : 'Journalier'),
      });
    }
  }

  if (source === 'all' || source === 'equipe') {
    const staff = await prisma.internalStaff.findMany({
      where: { isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        cin: true,
        bankName: true,
        rib: true,
        bankAccount: true,
        jobTitle: true,
      },
    });
    for (const s of staff) {
      rows.push({
        id: `e:${s.id}`,
        source: 'equipe',
        firstName: s.firstName,
        lastName: s.lastName,
        cin: s.cin,
        bankName: s.bankName,
        rib: s.rib || s.bankAccount,
        category: s.jobTitle,
      });
    }
  }

  let filtered = rows;
  if (bank) {
    filtered = filtered.filter((r) => (r.bankName || '').toLowerCase() === bank.toLowerCase());
  }
  if (withRibOnly) {
    filtered = filtered.filter((r) => !!(r.rib && String(r.rib).trim()));
  }
  if (q) {
    filtered = filtered.filter((r) => {
      const hay = `${r.firstName} ${r.lastName} ${r.cin || ''} ${r.rib || ''} ${r.bankName || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  filtered.sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr'));
  res.json({ items: filtered, total: filtered.length });
});

export default router;
