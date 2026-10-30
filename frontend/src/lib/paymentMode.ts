/** Libellés modes de paiement (encaissements / ventes / locations). */
export const PAYMENT_MODE_LABELS: Record<string, string> = {
  especes: 'Espèces',
  virement: 'Virement national',
  virement_national: 'Virement national',
  virement_international: 'Virement international',
  cheque: 'Chèque',
  carte: 'Carte bancaire',
  mandat: 'Mandat',
};

export const PAYMENT_MODE_OPTIONS = [
  { value: 'especes', labelKey: 'fields.modeCash' },
  { value: 'virement_national', labelKey: 'fields.modeTransferNational' },
  { value: 'virement_international', labelKey: 'fields.modeTransferInternational' },
  { value: 'cheque', labelKey: 'fields.modeCheck' },
  { value: 'carte', labelKey: 'fields.modeCard' },
  { value: 'mandat', labelKey: 'fields.modeMandate' },
] as const;

export function paymentModeLabel(mode?: string | null) {
  if (!mode) return '—';
  return PAYMENT_MODE_LABELS[mode] || mode;
}

export function isBankPaymentMode(mode?: string | null) {
  const m = String(mode || '').toLowerCase();
  return m === 'virement'
    || m === 'virement_national'
    || m === 'virement_international'
    || m === 'cheque'
    || m === 'carte'
    || m === 'mandat';
}

export const PAYER_RELATION_OPTIONS = [
  { value: 'client', labelKey: 'fields.payerRelationClient' },
  { value: 'famille', labelKey: 'fields.payerRelationFamily' },
] as const;

export function payerRelationLabel(value?: string | null) {
  if (value === 'famille') return 'Membre de la famille';
  if (value === 'client') return 'Le client';
  return '';
}

export function parsePayerName(raw?: string | null) {
  const text = String(raw || '');
  const match = text.match(/\[(client|famille)\]\s*(.*)$/i);
  if (!match) return { relation: 'client', name: text };
  return { relation: match[1].toLowerCase(), name: match[2] };
}

export function composePayerName(relation: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed && relation !== 'famille') return '';
  return `[${relation === 'famille' ? 'famille' : 'client'}] ${trimmed}`.trim();
}
