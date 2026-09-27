import type { Request } from 'express';
import { prisma } from './prisma.js';
import { computePurchaseTax } from './purchaseTax.js';
import { findMovementBySource, removeAutomaticMovement, syncPurchasePaymentMovement } from './cashSync.js';

export const PURCHASE_STATUSES = ['elabore', 'soumis', 'livre', 'valide', 'facture', 'paye', 'archive'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_STATUS_LABELS: Record<string, string> = {
  elabore: 'Élaboré',
  soumis: 'Soumis (bon de commande)',
  livre: 'Livré',
  valide: 'Validé',
  facture: 'Facturé',
  paye: 'Payé',
  archive: 'Archivé',
};

/** Achats engagés auprès du fournisseur (bon de commande émis) */
export const ENGAGED_STATUSES: PurchaseStatus[] = ['soumis', 'livre', 'valide', 'facture', 'paye', 'archive'];
/** Achats en cours de traitement */
export const OPEN_STATUSES: PurchaseStatus[] = ['elabore', 'soumis', 'livre', 'valide', 'facture'];

export const PURCHASE_DOC_TYPES = [
  'bon_commande',
  'bon_livraison',
  'facture_fournisseur',
  'bon_reception',
  'devis_fournisseur',
  'demande_achat',
  'bon_paiement',
  'justificatif_paiement',
  'avoir',
  'autre',
] as const;

export const PURCHASE_DOC_LABELS: Record<string, string> = {
  bon_commande: 'Bon de commande',
  bon_livraison: 'Bon de livraison',
  facture_fournisseur: 'Facture fournisseur',
  bon_reception: 'Bon de réception',
  devis_fournisseur: 'Devis fournisseur',
  demande_achat: "Demande d'achat",
  bon_paiement: 'Bon de paiement',
  justificatif_paiement: 'Justificatif de paiement',
  avoir: 'Avoir',
  autre: 'Autre',
};

/** Catégories acceptées comme facture fournisseur (dont l'ancien dépôt portail) */
export const INVOICE_DOC_CATEGORIES = ['facture_fournisseur', 'facture'];

export const PURCHASE_PAYMENT_KINDS = ['avance', 'complement', 'solde'] as const;
export const PURCHASE_PAYMENT_MODES = ['especes', 'virement', 'cheque', 'carte'] as const;

const LEGACY_STATUS_MAP: Record<string, PurchaseStatus> = {
  brouillon: 'elabore',
  retourné: 'elabore',
  retourne: 'elabore',
  validé: 'soumis',
  visé: 'soumis',
  vise: 'soumis',
  contrôlé: 'paye',
  controle: 'paye',
};

const EPS = 0.01;

export function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function statusIndex(status: string) {
  return PURCHASE_STATUSES.indexOf(status as PurchaseStatus);
}

export type NormalizedLine = {
  product: string;
  reference: string | null;
  family: string | null;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  tvaRate: number;
  amountHT: number;
  tvaAmount: number;
  amountTTC: number;
  sortOrder: number;
};

function optionalText(v: unknown) {
  const s = v == null ? '' : String(v).trim();
  return s || null;
}

export function normalizeLines(raw: unknown): { lines: NormalizedLine[]; error?: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { lines: [], error: 'Au moins un produit est obligatoire' };
  }
  const lines: NormalizedLine[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = (raw[i] || {}) as Record<string, unknown>;
    const product = optionalText(r.product);
    const quantity = Number(r.quantity);
    const unitPrice = Number(r.unitPrice);
    const tvaRate = r.tvaRate == null || r.tvaRate === '' ? 20 : Number(r.tvaRate);
    const n = i + 1;
    if (!product) return { lines: [], error: `Ligne ${n} : produit obligatoire` };
    if (!Number.isFinite(quantity) || quantity <= 0) return { lines: [], error: `Ligne ${n} : quantité invalide` };
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return { lines: [], error: `Ligne ${n} : prix unitaire invalide` };
    if (!Number.isFinite(tvaRate) || tvaRate < 0 || tvaRate > 100) return { lines: [], error: `Ligne ${n} : taux de TVA invalide` };
    const tax = computePurchaseTax(quantity, unitPrice, tvaRate);
    lines.push({
      product,
      reference: optionalText(r.reference),
      family: optionalText(r.family),
      quantity,
      unit: optionalText(r.unit),
      unitPrice,
      tvaRate,
      amountHT: tax.amountHT,
      tvaAmount: tax.tvaAmount,
      amountTTC: tax.totalPrice,
      sortOrder: i,
    });
  }
  return { lines };
}

/** Champs agrégés conservés sur Purchase (listes, finance, exports historiques) */
export function summarizeLines(lines: Array<Omit<NormalizedLine, 'sortOrder'>>) {
  const amountHT = round2(lines.reduce((s, l) => s + l.amountHT, 0));
  const tvaAmount = round2(lines.reduce((s, l) => s + l.tvaAmount, 0));
  const totalPrice = round2(lines.reduce((s, l) => s + l.amountTTC, 0));
  const first = lines[0];
  const single = lines.length === 1;
  const families = [...new Set(lines.map((l) => l.family).filter(Boolean))];
  return {
    designation: first ? `${first.product}${lines.length > 1 ? ` (+${lines.length - 1})` : ''}` : '—',
    family: families[0] || null,
    unit: single ? first.unit : 'lot',
    quantity: single ? first.quantity : 1,
    unitPrice: single ? first.unitPrice : amountHT,
    tvaRate: single ? first.tvaRate : amountHT > 0 ? round2((tvaAmount / amountHT) * 100) : 20,
    amountHT,
    tvaAmount,
    totalPrice,
  };
}

type DeliveryItemLike = { lineId: string; quantity: number; rejectedQuantity: number };

export function lineProgress(line: { id: string; quantity: number }, items: DeliveryItemLike[]) {
  const own = items.filter((i) => i.lineId === line.id);
  const delivered = round2(own.reduce((s, i) => s + i.quantity, 0));
  const rejected = round2(own.reduce((s, i) => s + i.rejectedQuantity, 0));
  const accepted = round2(delivered - rejected);
  const remaining = round2(Math.max(0, line.quantity - accepted));
  const state = remaining <= EPS ? 'livre' : accepted > EPS ? 'partiel' : 'non_livre';
  return { delivered, rejected, accepted, remaining, state };
}

export function paymentStatusFor(total: number, paid: number) {
  if (paid <= EPS) return 'non_paye';
  if (total > 0 && paid >= total - EPS) return 'paye';
  return 'partiel';
}

export function deliveryStatusFor(progress: Array<{ state: string }>) {
  if (progress.length === 0) return 'non_livre';
  if (progress.every((p) => p.state === 'livre')) return 'livre';
  if (progress.some((p) => p.state !== 'non_livre')) return 'partiel';
  return 'non_livre';
}

/** Recalcule totaux, livraison et paiement depuis les lignes / livraisons / paiements */
export async function recomputePurchase(purchaseId: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      deliveries: { include: { items: true } },
      payments: true,
    },
  });
  if (!purchase) return null;

  const items = purchase.deliveries.flatMap((d) => d.items);
  const progress = purchase.lines.map((l) => lineProgress(l, items));
  const summary = purchase.lines.length ? summarizeLines(purchase.lines) : null;
  const totalPrice = summary ? summary.totalPrice : purchase.totalPrice;
  const paidAmount = round2(purchase.payments.reduce((s, p) => s + p.amount, 0));
  const advanceAmount = round2(purchase.payments.filter((p) => p.kind === 'avance').reduce((s, p) => s + p.amount, 0));

  return prisma.purchase.update({
    where: { id: purchaseId },
    data: {
      ...(summary || {}),
      paidAmount,
      advanceAmount,
      paymentStatus: paymentStatusFor(totalPrice, paidAmount),
      deliveryStatus: deliveryStatusFor(progress),
    },
  });
}

export async function syncPaymentMovement(paymentId: string, req?: Request) {
  const payment = await prisma.purchasePayment.findUnique({
    where: { id: paymentId },
    include: { purchase: { include: { supplier: { select: { companyName: true } } } } },
  });
  if (!payment) return null;
  const result = await syncPurchasePaymentMovement(payment, payment.purchase, req);
  return result?.movement || null;
}

export async function deletePaymentWithMovement(paymentId: string) {
  await removeAutomaticMovement('achat_paiement', paymentId);
  await prisma.purchasePayment.delete({ where: { id: paymentId } });
}

export async function addHistory(purchaseId: string, req: Request | undefined, newStatus: string, oldStatus: string | null, comment?: string | null) {
  await prisma.purchaseHistory.create({
    data: {
      purchaseId,
      userName: req?.user?.email || null,
      oldStatus,
      newStatus,
      comment: comment || null,
    },
  });
}

export async function userDisplayName(req: Request) {
  if (!req.user) return null;
  const u = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { firstName: true, lastName: true },
  });
  const name = u ? `${u.firstName} ${u.lastName}`.trim() : '';
  return name || req.user.email || null;
}

/** Vue complète d'un achat : lignes + avancement livraison, livraisons, paiements, documents, totaux */
export async function buildPurchaseDetail(id: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      supplier: true,
      chantier: { select: { id: true, name: true, budgetAchats: true, projectId: true } },
      project: { select: { id: true, name: true, reference: true, client: { select: { id: true, firstName: true, lastName: true } } } },
      lines: { orderBy: { sortOrder: 'asc' } },
      deliveries: {
        orderBy: { date: 'desc' },
        include: { items: { include: { line: { select: { id: true, product: true, unit: true, quantity: true } } } } },
      },
      payments: { orderBy: { date: 'asc' } },
      history: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!purchase) return null;

  const items = purchase.deliveries.flatMap((d) => d.items);
  const lines = purchase.lines.map((l) => ({ ...l, ...lineProgress(l, items) }));
  const [documents, movements] = await Promise.all([
    prisma.document.findMany({
      where: { entityType: 'purchase', entityId: id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.cashMovement.findMany({
      where: { sourceType: 'achat_paiement', sourceId: { in: purchase.payments.map((p) => p.id) } },
      select: { id: true, sourceId: true, accountId: true },
    }),
  ]);
  const movementByPayment = new Map(movements.map((m) => [m.sourceId, m]));
  const payments = purchase.payments.map((p) => ({ ...p, cashMovementId: movementByPayment.get(p.id)?.id || null }));

  const totalTTC = purchase.totalPrice;
  const paid = purchase.paidAmount;
  const hasInvoice = documents.some((d) => INVOICE_DOC_CATEGORIES.includes(d.category || ''));
  const legacyMovement = await findMovementBySource('achat', id);

  return {
    ...purchase,
    lines,
    payments,
    documents,
    cashMovement: legacyMovement,
    totals: {
      amountHT: purchase.amountHT ?? 0,
      tvaAmount: purchase.tvaAmount ?? 0,
      totalTTC,
      advances: purchase.advanceAmount,
      paid,
      remaining: round2(Math.max(0, totalTTC - paid)),
      orderedQty: round2(lines.reduce((s, l) => s + l.quantity, 0)),
      acceptedQty: round2(lines.reduce((s, l) => s + l.accepted, 0)),
      remainingQty: round2(lines.reduce((s, l) => s + l.remaining, 0)),
      rejectedQty: round2(lines.reduce((s, l) => s + l.rejected, 0)),
    },
    checks: {
      hasInvoice,
      hasDeliveries: purchase.deliveries.length > 0,
      fullyDelivered: purchase.deliveryStatus === 'livre',
      fullyPaid: purchase.paymentStatus === 'paye',
    },
  };
}

/**
 * Reprise des achats mono-produit : statuts historiques, ligne unique,
 * livraison et paiement reconstitués pour les achats contrôlés (mouvement caisse relié au paiement).
 */
export async function migrateLegacyPurchases() {
  const legacy = await prisma.purchase.findMany({
    where: {
      OR: [
        { status: { in: Object.keys(LEGACY_STATUS_MAP) } },
        { lines: { none: {} } },
      ],
    },
    include: { lines: true, payments: true, deliveries: true },
  });
  let migrated = 0;
  for (const p of legacy) {
    const newStatus = LEGACY_STATUS_MAP[p.status] || (statusIndex(p.status) >= 0 ? p.status : 'elabore');
    let lineId = p.lines[0]?.id;
    if (!p.lines.length) {
      const tax = computePurchaseTax(p.quantity, p.unitPrice, p.tvaRate ?? 20);
      const line = await prisma.purchaseLine.create({
        data: {
          purchaseId: p.id,
          product: p.designation,
          family: p.family,
          quantity: p.quantity,
          unit: p.unit,
          unitPrice: p.unitPrice,
          tvaRate: p.tvaRate ?? 20,
          amountHT: p.amountHT ?? tax.amountHT,
          tvaAmount: p.tvaAmount ?? tax.tvaAmount,
          amountTTC: p.totalPrice,
          sortOrder: 0,
        },
      });
      lineId = line.id;
    }

    if (newStatus === 'paye' && lineId) {
      if (!p.deliveries.length) {
        await prisma.purchaseDelivery.create({
          data: {
            purchaseId: p.id,
            date: p.updatedAt,
            remark: 'Reprise historique (achat contrôlé)',
            items: { create: [{ lineId, quantity: p.quantity }] },
          },
        });
      }
      if (!p.payments.length) {
        const legacyMovement = await findMovementBySource('achat', p.id);
        const payment = await prisma.purchasePayment.create({
          data: {
            purchaseId: p.id,
            kind: 'solde',
            date: legacyMovement?.date || p.updatedAt,
            amount: p.totalPrice,
            mode: p.paymentMode,
            remark: 'Reprise historique (achat contrôlé)',
          },
        });
        if (legacyMovement) {
          await prisma.cashMovement.update({
            where: { id: legacyMovement.id },
            data: { sourceType: 'achat_paiement', sourceId: payment.id },
          });
        }
      }
    }

    if (newStatus !== p.status) {
      await prisma.purchase.update({ where: { id: p.id }, data: { status: newStatus } });
      await prisma.purchaseHistory.create({
        data: { purchaseId: p.id, oldStatus: p.status, newStatus, comment: 'Migration nouveau cycle achats' },
      });
    }
    await recomputePurchase(p.id);
    migrated += 1;
  }
  return migrated;
}
