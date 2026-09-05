import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { nextReference } from '../lib/references.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';

function buildWhere(q: string, active = '') {
  const activeFilter =
    active === 'true'
      ? { isActive: true }
      : active === 'false'
        ? { isActive: false }
        : {};

  return {
    AND: [
      q
        ? {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { phone1: { contains: q } },
              { phone2: { contains: q } },
              { reference: { contains: q } },
              { relation: { contains: q } },
              { address: { contains: q } },
            ],
          }
        : {},
      activeFilter,
    ],
  };
}

async function backfillReferences() {
  const missing = await prisma.reconnu.findMany({
    where: { reference: null },
    select: { id: true },
    take: 200,
  });
  for (const r of missing) {
    const reference = await nextReference('REC');
    await prisma.reconnu.update({ where: { id: r.id }, data: { reference } });
  }
}

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

backfillReferences().catch(() => {});

router.get('/stats', async (_req, res) => {
  const [total, active, withPhone, withMovements] = await Promise.all([
    prisma.reconnu.count(),
    prisma.reconnu.count({ where: { isActive: true } }),
    prisma.reconnu.count({
      where: {
        OR: [
          { phone1: { not: null }, NOT: { phone1: '' } },
          { phone2: { not: null }, NOT: { phone2: '' } },
        ],
      },
    }),
    prisma.reconnu.count({ where: { movements: { some: {} } } }),
  ]);
  res.json({ total, active, withPhone, withMovements });
});

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const active = String(req.query.active || '');
  const sort = String(req.query.sort || 'lastName');
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const orderBy =
    sort === 'createdAt'
      ? { createdAt: order as 'asc' | 'desc' }
      : sort === 'reference'
        ? { reference: order as 'asc' | 'desc' }
        : [{ lastName: order as 'asc' | 'desc' }, { firstName: order as 'asc' | 'desc' }];

  const where = buildWhere(q, active);
  const [items, total] = await Promise.all([
    prisma.reconnu.findMany({
      where,
      include: { _count: { select: { movements: true } } },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.reconnu.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.post('/', async (req, res) => {
  const { firstName, lastName } = req.body || {};
  if (!firstName || !lastName) {
    return res.status(400).json({ message: 'Prénom et nom obligatoires' });
  }
  const data = { ...req.body };
  delete data.id;
  delete data.reference;
  delete data._count;
  delete data.movements;
  data.reference = await nextReference('REC');
  if (data.isActive === undefined) data.isActive = true;

  const reconnu = await prisma.reconnu.create({ data });
  await audit(req, 'création', 'Reconnu', reconnu.id, `${reconnu.reference} ${reconnu.firstName} ${reconnu.lastName}`);
  res.status(201).json(reconnu);
});

router.get('/:id', async (req, res) => {
  const reconnu = await prisma.reconnu.findUnique({
    where: { id: String(req.params.id) },
    include: {
      movements: {
        orderBy: { date: 'desc' },
        take: 50,
        include: {
          chantier: { select: { id: true, name: true } },
        },
      },
      _count: { select: { movements: true } },
    },
  });
  if (!reconnu) return res.status(404).json({ message: 'Reconnu introuvable' });

  const [entrees, sorties] = await Promise.all([
    prisma.officeCashMovement.aggregate({
      where: { reconnuId: reconnu.id, direction: 'entree' },
      _sum: { amount: true },
    }),
    prisma.officeCashMovement.aggregate({
      where: { reconnuId: reconnu.id, direction: 'sortie' },
      _sum: { amount: true },
    }),
  ]);

  res.json({
    ...reconnu,
    stats: {
      totalEntrees: entrees._sum.amount || 0,
      totalSorties: sorties._sum.amount || 0,
    },
  });
});

router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const data = { ...req.body };
  delete data.id;
  delete data.reference;
  delete data._count;
  delete data.movements;
  delete data.stats;

  const reconnu = await prisma.reconnu.update({ where: { id }, data });
  await audit(req, 'modification', 'Reconnu', reconnu.id, `${reconnu.reference || ''} ${reconnu.firstName} ${reconnu.lastName}`);
  res.json(reconnu);
});

router.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const movements = await prisma.officeCashMovement.count({ where: { reconnuId: id } });
  if (movements > 0) {
    return res.status(400).json({
      message: `Reconnu lié à ${movements} mouvement(s) de caisse bureau — impossible de supprimer`,
    });
  }

  await prisma.reconnu.delete({ where: { id } });
  await audit(req, 'suppression', 'Reconnu', id, motif);
  res.json({ ok: true });
});

export default router;
