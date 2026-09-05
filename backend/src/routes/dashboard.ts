import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

router.get('/', async (req, res) => {
  const projectId = String(req.query.projectId || '');
  const chantierId = String(req.query.chantierId || '');
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;

  const saleDateFilter =
    dateFrom || dateTo
      ? {
          contractDate: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {};

  const movementDateFilter =
    dateFrom || dateTo
      ? {
          date: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {};

  const propertyFilter = projectId ? { projectId } : {};
  const purchaseFilter = chantierId ? { chantierId } : {};

  const [
    clients,
    prospects,
    buyers,
    tenants,
    projects,
    projectsEncore,
    projectsValides,
    properties,
    disponibles,
    reserves,
    vendus,
    loues,
    sales,
    rentals,
    salesAgg,
    cash,
    chantiers,
    chantiersActifs,
    workforce,
    engins,
    enginsMaint,
    purchasesAgg,
  ] = await Promise.all([
    prisma.client.count({ where: { isArchived: false } }),
    prisma.client.count({ where: { isProspect: true, isArchived: false } }),
    prisma.client.count({ where: { isBuyer: true, isArchived: false } }),
    prisma.client.count({ where: { isTenant: true, isArchived: false } }),
    prisma.project.count(),
    prisma.project.count({ where: { status: { in: ['actif', 'en_cours'] } } }),
    prisma.project.count({ where: { status: 'actif' } }),
    prisma.property.count({ where: propertyFilter }),
    prisma.property.count({ where: { ...propertyFilter, status: 'disponible' } }),
    prisma.property.count({ where: { ...propertyFilter, status: 'réservé' } }),
    prisma.property.count({ where: { ...propertyFilter, status: 'vendu' } }),
    prisma.property.count({ where: { ...propertyFilter, status: 'loué' } }),
    prisma.sale.count({
      where: {
        status: { notIn: ['annulée', 'résiliée'] },
        ...saleDateFilter,
        ...(projectId ? { property: { projectId } } : {}),
      },
    }),
    prisma.rental.count({
      where: {
        status: 'active',
        ...(projectId ? { property: { projectId } } : {}),
      },
    }),
    prisma.sale.aggregate({
      _sum: { salePrice: true, totalPaid: true, remaining: true },
      where: {
        status: { notIn: ['annulée', 'résiliée'] },
        ...saleDateFilter,
        ...(projectId ? { property: { projectId } } : {}),
      },
    }),
    prisma.cashMovement.aggregate({
      _sum: { debit: true, credit: true },
      where: dateFrom || dateTo ? movementDateFilter : undefined,
    }),
    prisma.chantier.count(chantierId ? { where: { id: chantierId } } : undefined),
    prisma.chantier.count({
      where: chantierId ? { id: chantierId, status: 'actif' } : { status: 'actif' },
    }),
    prisma.workforce.count({ where: { isActive: true } }),
    prisma.engin.count(),
    prisma.engin.count({ where: { status: 'en_maintenance' } }),
    prisma.purchase.aggregate({
      _sum: { totalPrice: true },
      where: { ...purchaseFilter, ...movementDateFilter },
    }),
  ]);

  const avgProgress = await prisma.chantier.aggregate({
    _avg: { progressPct: true },
    where: chantierId ? { id: chantierId } : undefined,
  });

  const paymentsDue = await prisma.sale.count({
    where: {
      remaining: { gt: 0 },
      status: { in: ['en_cours', 'en_cours_paiement', 'signée'] },
      ...(projectId ? { property: { projectId } } : {}),
    },
  });

  const purchasesPending = await prisma.purchase.count({
    where: {
      status: { in: ['brouillon', 'retourné'] },
      ...purchaseFilter,
    },
  });

  const expiringDocs = await prisma.document.count({
    where: {
      expiresAt: {
        lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        gte: new Date(),
      },
    },
  });

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [clientsLast30, clientsPrev30, recentSales, recentClients] = await Promise.all([
    prisma.client.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.client.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    prisma.sale.findMany({
      take: 4,
      orderBy: { createdAt: 'desc' },
      where: projectId ? { property: { projectId } } : undefined,
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        property: { select: { name: true } },
      },
    }),
    prisma.client.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      where: { isArchived: false },
      select: {
        id: true,
        reference: true,
        firstName: true,
        lastName: true,
        email: true,
        isBuyer: true,
        isProspect: true,
        isTenant: true,
      },
    }),
  ]);

  const clientsDeltaPct =
    clientsPrev30 > 0
      ? Math.round(((clientsLast30 - clientsPrev30) / clientsPrev30) * 100)
      : clientsLast30 > 0
        ? 100
        : 0;

  // Séries mensuelles (12 mois)
  const chartStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const chartEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [chartSales, chartPayments] = await Promise.all([
    prisma.sale.findMany({
      where: {
        status: { notIn: ['annulée', 'résiliée'] },
        contractDate: { gte: chartStart, lte: chartEnd },
        ...(projectId ? { property: { projectId } } : {}),
      },
      select: { contractDate: true, salePrice: true },
    }),
    prisma.payment.findMany({
      where: {
        date: { gte: chartStart, lte: chartEnd },
        ...(projectId
          ? {
              OR: [
                { sale: { property: { projectId } } },
                { rental: { property: { projectId } } },
              ],
            }
          : {}),
      },
      select: { date: true, amount: true },
    }),
  ]);

  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const ventesByMonth: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]));
  const encaissementsByMonth: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]));

  for (const s of chartSales) {
    if (!s.contractDate) continue;
    const d = new Date(s.contractDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key in ventesByMonth) ventesByMonth[key] += s.salePrice || 0;
  }
  for (const p of chartPayments) {
    const d = new Date(p.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key in encaissementsByMonth) encaissementsByMonth[key] += p.amount || 0;
  }

  const monthLabels = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const charts = {
    months: monthKeys.map((key) => {
      const [y, m] = key.split('-').map(Number);
      return {
        key,
        label: `${monthLabels[m - 1]} ${String(y).slice(2)}`,
        ventes: Math.round(ventesByMonth[key]),
        encaissements: Math.round(encaissementsByMonth[key]),
      };
    }),
  };

  res.json({
    filters: { projectId, chantierId, dateFrom, dateTo },
    trends: {
      clientsLast30,
      clientsDeltaPct,
    },
    charts,
    recent: {
      sales: recentSales,
      clients: recentClients,
    },
    immobilier: {
      clients,
      prospects,
      buyers,
      tenants,
      projects,
      projectsEncore,
      projectsValides,
      properties,
      disponibles,
      reserves,
      vendus,
      loues,
      sales,
      rentals,
    },
    finance: {
      ventesTotal: salesAgg._sum.salePrice || 0,
      encaisse: salesAgg._sum.totalPaid || 0,
      reste: salesAgg._sum.remaining || 0,
      debit: cash._sum.debit || 0,
      credit: cash._sum.credit || 0,
      solde: (cash._sum.credit || 0) - (cash._sum.debit || 0),
      achats: purchasesAgg._sum.totalPrice || 0,
    },
    chantier: {
      chantiers,
      actifs: chantiersActifs,
      ouvriers: workforce,
      avancement: Math.round((avgProgress._avg.progressPct || 0) * 10) / 10,
      engins,
      enginsMaintenance: enginsMaint,
    },
    alertes: {
      paiementsASuivre: paymentsDue,
      achatsAction: purchasesPending,
      enginsMaintenance: enginsMaint,
      documentsExpirant: expiringDocs,
    },
  });
});

export default router;
