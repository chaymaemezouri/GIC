import { useEffect, useState } from 'react';
import { Btn, Modal, Textarea } from './ui';
import { useI18n } from '../i18n/I18nContext';

export type ChefDecision = 'valide' | 'non_valide';

export function PurchaseReviewModal({
  open,
  reference,
  initialRemark,
  busy,
  onClose,
  onDecide,
}: {
  open: boolean;
  reference?: string;
  initialRemark?: string | null;
  busy?: boolean;
  onClose: () => void;
  onDecide: (decision: ChefDecision, remark: string) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [remark, setRemark] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRemark(initialRemark || '');
    setError('');
  }, [open, initialRemark]);

  async function decide(decision: ChefDecision) {
    if (decision === 'non_valide' && !remark.trim()) {
      setError(t('purchase.review.remarkRequired'));
      return;
    }
    setError('');
    await onDecide(decision, remark.trim());
  }

  return (
    <Modal
      open={open}
      title={t('purchase.review.title')}
      onClose={onClose}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</Btn>
          <Btn variant="danger" onClick={() => decide('non_valide')} disabled={busy}>{t('purchase.review.reject')}</Btn>
          <Btn onClick={() => decide('valide')} disabled={busy}>{t('purchase.review.approve')}</Btn>
        </>
      }
    >
      <p className="mb-3 text-[12px] text-gic-muted">{t('purchase.review.hint', { ref: reference || '—' })}</p>
      <Textarea
        label={t('purchase.review.remark')}
        value={remark}
        placeholder={t('purchase.review.remarkPlaceholder')}
        onChange={(e) => setRemark(e.target.value)}
      />
      {error && <p className="mt-2 text-[11px] text-gic-coral">{error}</p>}
    </Modal>
  );
}
