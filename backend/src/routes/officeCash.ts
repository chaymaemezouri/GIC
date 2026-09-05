import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import { upload } from '../lib/upload.js';

const PURPOSES = new Set(['chantier', 'travail', 'aleatoire', 'alimentation']);
const DIRECTIONS = new Set(['entree', 'sortie']);

function buildWhere(query: Record<string, unknown>) {
  const q = String(query.q || '').trim();
  const dateFrom = query.dateFrom ? new Date(String(query.dateFrom)) : null;
  const dateTo = query.dateTo ? new Date(String(query.dateTo)) : null;
  const reconnuId = String(query.reconnuId || '').trim();
  const chantierId = String(query.chantierId || '').trim();
  const purpose = String(query.purpose || '').trim();
  const direction = String(query.direction || '').trim();
  const remark = String(query.remark || '').trim();
  const createdBy = String(query.createdBy || '').trim();

  return {
    AND: [
      q
        ? {
            OR: [
              { designation: { contains: q } },
              { remark: { contains: q } },
              { workLabel: { contains: q } },
              { reconnuName: { contains: q } },
            ],
          }
        : {},
      remark ? { remark: { contains: remark } } : {},
      createdBy ? { createdBy: { contains: createdBy } } : {},
      reconnuId ? { reconnuId } : {},
      chantierId ? { chantierId } : {},
      purpose ? { purpose } : {},
      direction ? { direction } : {},
      dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo
                ? {
                    lte: (() => {
                      const d = new Date(dateTo);
                      d.setHours(23, 59, 59, 999);
                      return d;
                    })(),
                  }
                : {}),
            },
          }
        : {},
    ],
  };
}

async function validatePayload(body: Record<string, unknown>, opts?: { partial?: boolean }) {
  const direction = body.direction != null ? String(body.direction) : undefined;
  const purpose = body.purpose != null ? String(body.purpose) : undefined;
  const amount = body.amount != null ? Number(body.amount) : undefined;
  const designation = body.designation != null ? String(body.designation).trim() : undefined;
  const reconnuId = body.reconnuId != null && body.reconnuId !== '' ? String(body.reconnuId) : null;
  const reconnuName =
    body.reconnuName != null && String(body.reconnuName).trim() !== ''
      ? String(body.reconnuName).trim()
      : null;
  const chantierId = body.chantierId != null && body.chantierId !== '' ? String(body.chantierId) : null;

  if (!opts?.partial) {
    if (!direction || !DIRECTIONS.has(direction)) {
      return { error: 'Direction invalide (entree | sortie)' };
    }
    if (!purpose || !PURPOSES.has(purpose)) {
      return { error: 'Motif / purpose invalide' };
    }
    if (!designation) {
      return { error: 'Désignation obligatoire' };
    }
    if (!amount || amount <= 0 || Number.isNaN(amount)) {
      return { error: 'Montant obligatoire et positif' };
    }
  } else {
    if (direction != null && !DIRECTIONS.has(direction)) {
      return { error: 'Direction invalide (entree | sortie)' };
    }
    if (purpose != null && !PURPOSES.has(purpose)) {
      return { error: 'Motif / purpose invalide' };
    }
    if (amount != null && (amount <= 0 || Number.isNaN(amount))) {
      return { error: 'Montant doit être positif' };
    }
  }

  if (reconnuId) {
    const reconnu = await prisma.reconnu.findUnique({ where: { id: reconnuId } });
    if (!reconnu) return { error: 'Reconnu introuvable' };
  }
  if (chantierId) {
    const chantier = await prisma.chantier.findUnique({ where: { id: chantierId } });
    if (!chantier) return { error: 'Chantier introuvable' };
  }

  return {
    direction,
    purpose,
    amount,
    designation,
    reconnuId: reconnuId || null,
    /** Si un reconnu DB est choisi, on ignore le nom libre */
    reconnuName: reconnuId ? null : reconnuName,
    chantierId,
    workLabel: body.workLabel != null && body.workLabel !== '' ? String(body.workLabel) : null,
    remark: body.remark != null && body.remark !== '' ? String(body.remark) : null,
    date: body.date ? new Date(String(body.date)) : undefined,
  };
}

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

const movementInclude = {
  reconnu: { select: { id: true, reference: true, firstName: true, lastName: true } },
  chantier: { select: { id: true, name: true } },
} as const;

router.get('/stats', async (req, res) => {
  const where = buildWhere(req.query as Record<string, unknown>);
  const [count, entrees, sorties] = await Promise.all([
    prisma.officeCashMovement.count({ where }),
    prisma.officeCashMovement.aggregate({
      where: { AND: [where, { direction: 'entree' }] },
      _sum: { amount: true },
    }),
    prisma.officeCashMovement.aggregate({
      where: { AND: [where, { direction: 'sortie' }] },
      _sum: { amount: true },
    }),
  ]);
  const totalEntrees = entrees._sum.amount || 0;
  const totalSorties = sorties._sum.amount || 0;
  res.json({
    count,
    totalEntrees,
    totalSorties,
    solde: totalEntrees - totalSorties,
  });
});

router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const where = buildWhere(req.query as Record<string, unknown>);

  const [items, total, entrees, sorties] = await Promise.all([
    prisma.officeCashMovement.findMany({
      where,
      include: movementInclude,
      orderBy: { date: 'desc' },
      skip,
      take: limit,
    }),
    prisma.officeCashMovement.count({ where }),
    prisma.officeCashMovement.aggregate({
      where: { AND: [where, { direction: 'entree' }] },
      _sum: { amount: true },
    }),
    prisma.officeCashMovement.aggregate({
      where: { AND: [where, { direction: 'sortie' }] },
      _sum: { amount: true },
    }),
  ]);

  const totalEntrees = entrees._sum.amount || 0;
  const totalSorties = sorties._sum.amount || 0;
  res.json({
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    totals: {
      entrees: totalEntrees,
      sorties: totalSorties,
      solde: totalEntrees - totalSorties,
    },
  });
});

router.post('/', upload.single('proof'), async (req, res) => {
  const parsed = await validatePayload(req.body || {});
  if ('error' in parsed && parsed.error) {
    return res.status(400).json({ message: parsed.error });
  }
  const { direction, purpose, amount, designation, reconnuId, reconnuName, chantierId, workLabel, remark, date } = parsed;

  const movement = await prisma.officeCashMovement.create({
    data: {
      direction: direction!,
      purpose: purpose!,
      amount: amount!,
      designation: designation!,
      reconnuId,
      reconnuName,
      chantierId,
      workLabel,
      remark,
      date: date || new Date(),
      proofFile: req.file ? `/uploads/${req.file.filename}` : null,
      createdBy: req.user?.email || req.user?.id || null,
    },
    include: movementInclude,
  });
  await audit(req, 'création', 'Caisse', movement.id, designation!);
  res.status(201).json(movement);
});

router.get('/:id', async (req, res) => {
  const movement = await prisma.officeCashMovement.findUnique({
    where: { id: String(req.params.id) },
    include: movementInclude,
  });
  if (!movement) return res.status(404).json({ message: 'Mouvement introuvable' });
  res.json(movement);
});

router.put('/:id', upload.single('proof'), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.officeCashMovement.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Mouvement introuvable' });

  const parsed = await validatePayload(req.body || {}, { partial: true });
  if ('error' in parsed && parsed.error) {
    return res.status(400).json({ message: parsed.error });
  }

  const nextDirection = parsed.direction ?? existing.direction;
  void nextDirection;

  const data: Record<string, unknown> = {};
  if (parsed.direction != null) data.direction = parsed.direction;
  if (parsed.purpose != null) data.purpose = parsed.purpose;
  if (parsed.amount != null) data.amount = parsed.amount;
  if (parsed.designation != null) data.designation = parsed.designation;
  if (req.body.reconnuId !== undefined) data.reconnuId = parsed.reconnuId;
  if (req.body.reconnuName !== undefined || req.body.reconnuId !== undefined) {
    data.reconnuName = parsed.reconnuId ? null : (parsed.reconnuName ?? null);
  }
  if (req.body.chantierId !== undefined) data.chantierId = parsed.chantierId;
  if (req.body.workLabel !== undefined) data.workLabel = parsed.workLabel;
  if (req.body.remark !== undefined) data.remark = parsed.remark;
  if (parsed.date) data.date = parsed.date;
  if (req.file) data.proofFile = `/uploads/${req.file.filename}`;

  const movement = await prisma.officeCashMovement.update({
    where: { id },
    data,
    include: movementInclude,
  });
  await audit(req, 'modification', 'Caisse', id, movement.designation);
  res.json(movement);
});

router.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const existing = await prisma.officeCashMovement.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Mouvement introuvable' });

  await prisma.officeCashMovement.delete({ where: { id } });
  await audit(
    req,
    'suppression',
    'Caisse',
    id,
    `${existing.designation} — motif: ${motif}`,
  );
  res.json({ ok: true });
});

export default router;
