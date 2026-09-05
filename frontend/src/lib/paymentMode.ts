/** Libellés modes de paiement (encaissements / ventes). */
export const PAYMENT_MODE_LABELS: Record<string, string> = {
  especes: 'Espèces',
  virement: 'Virement',
  cheque: 'Chèque',
  carte: 'Carte bancaire',
};

export function paymentModeLabel(mode?: string | null) {
  if (!mode) return '—';
  return PAYMENT_MODE_LABELS[mode] || mode;
}

export function isBankPaymentMode(mode?: string | null) {
  const m = String(mode || '').toLowerCase();
  return m === 'virement' || m === 'cheque' || m === 'carte';
}
