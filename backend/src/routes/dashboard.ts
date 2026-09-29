import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { ENGAGED_STATUSES, OPEN_STATUSES } from '../lib/purchaseWorkflow.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

router.get('/', async (req, res) => {
  const projectId = String(req.query.projectId || '');
  const chantierId = String(req.query.chantierId || '');
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  if (dateFrom) dateFrom.setHours(0, 0, 0, 0);
  if (dateTo) dateTo.setHours(23, 59, 59, 999);

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
      where: { ...purchaseFilter, ...movementDateFilter, status: { in: ENGAGED_STATUSES } },
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
      status: { in: OPEN_STATUSES },
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

  const lateCutoff = new Date();
  lateCutoff.setHours(0, 0, 0, 0);
  const lateDocs = await prisma.document.count({
    where: {
      estimatedEndDate: { lt: lateCutoff },
      NOT: { status: 'valid' },
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
      documentsEnRetard: lateDocs,
    },
    todo: await buildTodayList(),
  });
});

const DEFAULT_REQUIRED: Record<string, string[]> = {
  client: ['cin'],
  mandant: ['cin', 'procuration'],
  agent: ['cin', 'contrat'],
  property: ['titre'],
  sale: ['compromis', 'cin_acheteur'],
  rental: ['bail', 'cin_locataire'],
  chantier: ['ordre_service', 'plans', 'assurance'],
  workforce: ['cin', 'contrat'],
  staff: ['cin', 'contrat'],
  engin: ['carte_grise', 'assurance', 'visite'],
  supplier: ['rc', 'ice'],
  purchase: ['bon_commande', 'facture'],
};

function entityPath(type: string | null | undefined, id: string | null | undefined) {
  if (!type || !id) return '/documents';
  const map: Record<string, string> = {
    client: `/clients/${id}`,
    mandant: `/mandants/${id}`,
    agent: `/agents/${id}`,
    property: `/biens/${id}`,
    sale: `/ventes/${id}`,
    rental: `/locations/${id}`,
    chantier: `/chantiers/${id}`,
    workforce: `/main-oeuvre/${id}`,
    staff: `/equipe-interne/${id}`,
    engin: `/engins/${id}`,
    supplier: `/fournisseurs/${id}`,
    purchase: `/achats/${id}`,
    Mission: `/engins`,
  };
  return map[type] || '/documents';
}

function dayLabel(value: Date | null | undefined) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('fr-MA');
}

async function buildTodayList() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 30);
  const [engins, schedules, purchases, documents, checklists] = await Promise.all([
    prisma.engin.findMany({
      where: {
        OR: [
          { insuranceExpiry: { lte: horizon } },
          { visitExpiry: { lte: horizon } },
        ],
      },
      take: 8,
      select: { id: true, designation: true, matricule: true, brand: true, insuranceExpiry: true, visitExpiry: true },
    }),
    prisma.paymentSchedule.findMany({
      where: {
        status: { not: 'paid' },
        dueDate: { lt: today },
        OR: [{ saleId: { not: null } }, { rentalId: { not: null } }],
      },
      take: 8,
      orderBy: { dueDate: 'asc' },
      include: {
        sale: { select: { id: true, reference: true } },
        rental: { select: { id: true, reference: true } },
      },
    }),
    prisma.purchase.findMany({
      where: {
        deliveryStatus: { not: 'livre' },
        expectedDeliveryDate: { lt: today },
        status: { not: 'archive' },
      },
      take: 8,
      orderBy: { expectedDeliveryDate: 'asc' },
      select: { id: true, reference: true, designation: true, expectedDeliveryDate: true },
    }),
    prisma.document.findMany({
      where: { OR: [{ expiresAt: { lt: today } }, { status: 'invalid' }] },
      take: 8,
      orderBy: { expiresAt: 'asc' },
      select: { id: true, name: true, entityType: true, entityId: true, expiresAt: true, status: true },
    }),
    prisma.documentChecklist.findMany({ take: 40, orderBy: { updatedAt: 'desc' } }),
  ]);

  const items: Array<{ kind: string; title: string; detail: string; path: string }> = [];
  const push = (item: { kind: string; title: string; detail: string; path: string }, cap: number) => {
    if (items.filter((row) => row.kind === item.kind).length >= cap) return;
    items.push(item);
  };
  for (const engin of engins) {
    const name = engin.designation || engin.brand || engin.matricule || 'Engin';
    if (engin.insuranceExpiry && engin.insuranceExpiry <= horizon) {
      push({ kind: 'paper', title: name, detail: `Assurance ${dayLabel(engin.insuranceExpiry)}`, path: `/engins/${engin.id}` }, 5);
    }
    if (engin.visitExpiry && engin.visitExpiry <= horizon) {
      push({ kind: 'paper', title: name, detail: `Contrôle technique ${dayLabel(engin.visitExpiry)}`, path: `/engins/${engin.id}` }, 5);
    }
  }
  for (const schedule of schedules) {
    const ref = schedule.sale?.reference || schedule.rental?.reference || 'Échéance';
    const path = schedule.sale ? `/ventes/${schedule.sale.id}` : `/locations/${schedule.rental?.id}`;
    push({ kind: 'payment', title: ref, detail: `Échéance ${dayLabel(schedule.dueDate)}`, path }, 5);
  }
  for (const purchase of purchases) {
    push({
      kind: 'delivery',
      title: purchase.reference,
      detail: `${purchase.designation} · ${dayLabel(purchase.expectedDeliveryDate)}`,
      path: `/achats/${purchase.id}`,
    }, 5);
  }
  for (const doc of documents) {
    push({
      kind: 'document',
      title: doc.name,
      detail: doc.status === 'invalid' ? 'Document refusé' : `Expire le ${dayLabel(doc.expiresAt)}`,
      path: doc.entityId ? entityPath(doc.entityType, doc.entityId) : `/documents/${doc.id}`,
    }, 4);
  }

  const needed = checklists.flatMap((row) => {
    let cfg: { required?: string[]; hidden?: string[] } = {};
    try { cfg = JSON.parse(row.config || '{}'); } catch { cfg = {}; }
    const hidden = new Set(cfg.hidden || []);
    const keys = (cfg.required?.length ? cfg.required : DEFAULT_REQUIRED[row.entityType] || []).filter((key) => !hidden.has(key));
    return keys.map((key) => ({ entityType: row.entityType, entityId: row.entityId, key }));
  });
  if (needed.length) {
    const docs = await prisma.document.findMany({
      where: { OR: needed.map((n) => ({ entityType: n.entityType, entityId: n.entityId, category: n.key })) },
      select: { entityType: true, entityId: true, category: true },
    });
    const have = new Set(docs.map((d) => `${d.entityType}:${d.entityId}:${d.category}`));
    for (const row of needed) {
      if (have.has(`${row.entityType}:${row.entityId}:${row.key}`)) continue;
      push({
        kind: 'missing',
        title: row.key,
        detail: row.entityType,
        path: entityPath(row.entityType, row.entityId),
      }, 5);
      if (items.filter((i) => i.kind === 'missing').length >= 5) break;
    }
  }
  return items.slice(0, 24);
}

export default router;
