import { useI18n } from '../i18n/I18nContext';

const STATUS_TONES: Record<string, string> = {
  elabore: 'mac-status',
  soumis: 'mac-status mac-status-info',
  livre: 'mac-status mac-status-warn',
  valide: 'mac-status mac-status-info',
  facture: 'mac-status mac-status-warn',
  paye: 'mac-status mac-status-ok',
  archive: 'mac-status',
};

const PAYMENT_TONES: Record<string, string> = {
  non_paye: 'mac-status mac-status-danger',
  partiel: 'mac-status mac-status-warn',
  paye: 'mac-status mac-status-ok',
};

const DELIVERY_TONES: Record<string, string> = {
  non_livre: 'mac-status',
  partiel: 'mac-status mac-status-warn',
  livre: 'mac-status mac-status-ok',
};

export function PurchaseStatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  const key = `purchase.status.${status}`;
  const label = t(key);
  return <span className={STATUS_TONES[status] || 'mac-status'}>{label === key ? status : label}</span>;
}

export function PurchasePaymentPill({ status }: { status: string }) {
  const { t } = useI18n();
  return <span className={PAYMENT_TONES[status] || 'mac-status'}>{t(`purchase.payment.${status}`)}</span>;
}

export function PurchaseDeliveryPill({ status }: { status: string }) {
  const { t } = useI18n();
  return <span className={DELIVERY_TONES[status] || 'mac-status'}>{t(`purchase.delivery.${status}`)}</span>;
}
