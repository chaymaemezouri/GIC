export const PURCHASE_STATUSES = ['elabore', 'soumis', 'livre', 'valide', 'facture', 'paye', 'archive'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const OPEN_PURCHASE_STATUSES: PurchaseStatus[] = ['elabore', 'soumis', 'livre', 'valide', 'facture'];
export const ENGAGED_PURCHASE_STATUSES: PurchaseStatus[] = ['soumis', 'livre', 'valide', 'facture', 'paye', 'archive'];

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

export const PURCHASE_PAYMENT_MODES = ['especes', 'virement', 'cheque', 'carte'] as const;
export const PURCHASE_PAYMENT_KINDS = ['avance', 'complement', 'solde'] as const;

export type PurchaseLine = {
  id: string;
  product: string;
  reference?: string | null;
  family?: string | null;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  tvaRate: number;
  amountHT: number;
  tvaAmount: number;
  amountTTC: number;
  delivered: number;
  rejected: number;
  accepted: number;
  remaining: number;
  state: 'non_livre' | 'partiel' | 'livre';
};

export type PurchaseDelivery = {
  id: string;
  date: string;
  number?: string | null;
  remark?: string | null;
  createdBy?: string | null;
  items: {
    id: string;
    lineId: string;
    quantity: number;
    rejectedQuantity: number;
    remark?: string | null;
    line: { id: string; product: string; unit?: string | null; quantity: number };
  }[];
};

export type PurchasePayment = {
  id: string;
  kind: string;
  date: string;
  amount: number;
  mode?: string | null;
  reference?: string | null;
  remark?: string | null;
  createdBy?: string | null;
  cashMovementId?: string | null;
};

export type PurchaseDocument = {
  id: string;
  name: string;
  category?: string | null;
  path: string;
  mimeType?: string | null;
  docNumber?: string | null;
  docDate?: string | null;
  amount?: number | null;
  uploadedByName?: string | null;
  createdAt: string;
};

export type PurchaseDetail = {
  id: string;
  reference: string;
  date: string;
  designation: string;
  status: PurchaseStatus;
  paymentStatus: 'non_paye' | 'partiel' | 'paye';
  deliveryStatus: 'non_livre' | 'partiel' | 'livre';
  invoiced: boolean;
  requester?: string | null;
  responsible?: string | null;
  author?: string | null;
  expectedDeliveryDate?: string | null;
  advanceMode?: string | null;
  remark?: string | null;
  tranche?: string | null;
  supplierId?: string | null;
  chantierId?: string | null;
  supplier?: { id: string; reference: string; companyName: string } | null;
  chantier?: { id: string; name: string; budgetAchats?: number | null } | null;
  project?: { id: string; name: string; reference?: string | null; client?: { id: string; firstName: string; lastName: string } | null } | null;
  lines: PurchaseLine[];
  deliveries: PurchaseDelivery[];
  payments: PurchasePayment[];
  documents: PurchaseDocument[];
  history: { id: string; oldStatus?: string | null; newStatus: string; userName?: string | null; comment?: string | null; createdAt: string }[];
  totals: {
    amountHT: number;
    tvaAmount: number;
    totalTTC: number;
    advances: number;
    paid: number;
    remaining: number;
    orderedQty: number;
    acceptedQty: number;
    remainingQty: number;
    rejectedQty: number;
  };
  checks: { hasInvoice: boolean; hasDeliveries: boolean; fullyDelivered: boolean; fullyPaid: boolean };
  createdAt: string;
};

export function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function formatAmount(n: number | null | undefined) {
  return `${new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0))} MAD`;
}

export function computeLineAmounts(quantity: number, unitPrice: number, tvaRate: number) {
  const amountHT = round2(quantity * unitPrice);
  const tvaAmount = round2(amountHT * (tvaRate / 100));
  return { amountHT, tvaAmount, amountTTC: round2(amountHT + tvaAmount) };
}

export function statusIndex(status: string) {
  return PURCHASE_STATUSES.indexOf(status as PurchaseStatus);
}

export function nextPurchaseStatus(status: string): PurchaseStatus | null {
  const i = statusIndex(status);
  return i >= 0 && i < PURCHASE_STATUSES.length - 1 ? PURCHASE_STATUSES[i + 1] : null;
}

export function previousPurchaseStatus(status: string): PurchaseStatus | null {
  const i = statusIndex(status);
  return i > 0 ? PURCHASE_STATUSES[i - 1] : null;
}
