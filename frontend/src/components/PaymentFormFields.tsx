import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { fetchDropdownOptions } from '../lib/api';
import { Input, Select } from './ui';

export type PaymentTxType = 'vente' | 'location';

export type PaymentFormData = {
  txType: PaymentTxType;
  saleId: string;
  rentalId: string;
  amount: string;
  date: string;
  operationType: string;
  payerName: string;
  bank: string;
  nature: string;
  internalRef: string;
  operationNo: string;
  proofFile: string;
  proofFileObj: File | null;
};

export function emptyPaymentForm(): PaymentFormData {
  return {
    txType: 'vente',
    saleId: '',
    rentalId: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    operationType: 'especes',
    payerName: '',
    bank: '',
    nature: '',
    internalRef: '',
    operationNo: '',
    proofFile: '',
    proofFileObj: null,
  };
}

export function paymentToForm(p: Record<string, unknown>): PaymentFormData {
  const saleId = p.saleId ? String(p.saleId) : '';
  const rentalId = p.rentalId ? String(p.rentalId) : '';
  return {
    txType: saleId ? 'vente' : 'location',
    saleId,
    rentalId,
    amount: p.amount != null ? String(p.amount) : '',
    date: p.date ? String(p.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    operationType: String(p.operationType || 'especes'),
    payerName: String(p.payerName || ''),
    bank: String(p.bank || ''),
    nature: String(p.nature || ''),
    internalRef: String(p.internalRef || ''),
    operationNo: String(p.operationNo || ''),
    proofFile: String(p.proofFile || ''),
    proofFileObj: null,
  };
}

export function paymentFormToCreateBody(f: PaymentFormData) {
  return {
    saleId: f.txType === 'vente' ? f.saleId : null,
    rentalId: f.txType === 'location' ? f.rentalId : null,
    amount: f.amount,
    date: f.date || null,
    operationType: f.operationType,
    payerName: f.payerName || null,
    bank: f.bank || null,
    nature: f.nature || null,
    internalRef: f.internalRef || null,
    operationNo: f.operationNo || null,
  };
}

export function paymentFormToUpdateBody(f: PaymentFormData) {
  return {
    amount: f.amount,
    date: f.date || null,
    operationType: f.operationType,
    payerName: f.payerName || null,
    bank: f.bank || null,
    nature: f.nature || null,
    internalRef: f.internalRef || null,
    operationNo: f.operationNo || null,
  };
}

/** Build FormData for create/update when a proof file is attached (or always for multipart). */
export function paymentFormToFormData(f: PaymentFormData, editMode = false) {
  const fd = new FormData();
  const body = editMode ? paymentFormToUpdateBody(f) : paymentFormToCreateBody(f);
  Object.entries(body).forEach(([k, v]) => {
    if (v != null && v !== '') fd.append(k, String(v));
  });
  if (f.proofFileObj) fd.append('proof', f.proofFileObj);
  return fd;
}

type SaleOption = {
  id: string;
  reference: string;
  remaining: number;
  client?: { firstName: string; lastName: string };
};

type RentalOption = {
  id: string;
  reference: string;
  remaining: number;
  client?: { firstName: string; lastName: string };
};

export function PaymentFormFields({
  form,
  setForm,
  sales,
  rentals,
  editMode,
}: {
  form: PaymentFormData;
  setForm: (f: PaymentFormData) => void;
  sales: SaleOption[];
  rentals: RentalOption[];
  editMode?: boolean;
}) {
  const { t } = useI18n();
  const payableSales = sales.filter((s) => s.remaining > 0);
  const payableRentals = rentals.filter((r) => r.remaining > 0);
  const [natures, setNatures] = useState<{ value: string; label?: string }[]>([]);

  useEffect(() => {
    fetchDropdownOptions('payment_nature').then(setNatures).catch(() => setNatures([]));
  }, []);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {!editMode && (
        <>
          <Select
            className="sm:col-span-2"
            label={`${t('fields.transactionType')} *`}
            value={form.txType}
            onChange={(e) => setForm({
              ...form,
              txType: e.target.value as PaymentTxType,
              saleId: '',
              rentalId: '',
            })}
          >
            <option value="vente">{t('fields.sale')}</option>
            <option value="location">{t('fields.rental')}</option>
          </Select>
          {form.txType === 'vente' ? (
            <Select
              className="sm:col-span-2"
              label={`${t('fields.sale')} *`}
              required
              value={form.saleId}
              onChange={(e) => setForm({ ...form, saleId: e.target.value })}
            >
              <option value="">{t('fields.selectSale')}</option>
              {payableSales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.reference}
                  {s.client ? ` — ${s.client.firstName} ${s.client.lastName}` : ''}
                  {' '}({t('fields.remainingParen', { amount: Number(s.remaining).toLocaleString('fr-MA') })})
                </option>
              ))}
            </Select>
          ) : (
            <Select
              className="sm:col-span-2"
              label={`${t('fields.rental')} *`}
              required
              value={form.rentalId}
              onChange={(e) => setForm({ ...form, rentalId: e.target.value })}
            >
              <option value="">{t('fields.selectRental')}</option>
              {payableRentals.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.reference}
                  {r.client ? ` — ${r.client.firstName} ${r.client.lastName}` : ''}
                  {' '}({t('fields.remainingParen', { amount: Number(r.remaining).toLocaleString('fr-MA') })})
                </option>
              ))}
            </Select>
          )}
        </>
      )}
      <Input label={`${t('fields.amountMad')} *`} required type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      <Input label={t('fields.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      <Select label={t('fields.mode')} value={form.operationType} onChange={(e) => setForm({ ...form, operationType: e.target.value })}>
        <option value="especes">{t('fields.modeCash')}</option>
        <option value="virement">{t('fields.modeTransfer')}</option>
        <option value="cheque">{t('fields.modeCheck')}</option>
        <option value="carte">{t('fields.modeCard')}</option>
      </Select>
      {natures.length > 0 ? (
        <Select label={t('fields.nature')} value={form.nature} onChange={(e) => setForm({ ...form, nature: e.target.value })}>
          <option value="">—</option>
          {natures.map((n) => (
            <option key={n.value} value={n.value}>{n.label || n.value}</option>
          ))}
          {form.nature && !natures.some((n) => n.value === form.nature) && (
            <option value={form.nature}>{form.nature}</option>
          )}
        </Select>
      ) : (
        <Input label={t('fields.nature')} value={form.nature} onChange={(e) => setForm({ ...form, nature: e.target.value })} placeholder={t('fields.naturePlaceholder')} />
      )}
      <Input label={t('fields.payerName')} value={form.payerName} onChange={(e) => setForm({ ...form, payerName: e.target.value })} />
      <Input label={t('fields.bankRef')} value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
      <Input label={t('fields.internalRef')} value={form.internalRef} onChange={(e) => setForm({ ...form, internalRef: e.target.value })} />
      <Input label={t('fields.operationNo')} value={form.operationNo} onChange={(e) => setForm({ ...form, operationNo: e.target.value })} />
      <div className="sm:col-span-2">
        <label className="block text-[11px] font-medium text-gic-muted mb-1">{t('fields.proofDocument')}</label>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
          className="block w-full text-[12px] file:mr-3 file:rounded-lg file:border-0 file:bg-gic-violet/10 file:px-3 file:py-1.5 file:text-[11px] file:font-medium file:text-gic-violet"
          onChange={(e) => setForm({ ...form, proofFileObj: e.target.files?.[0] || null })}
        />
        {form.proofFile && !form.proofFileObj && (
          <p className="mt-1 text-[11px] text-gic-muted">
            {t('fields.currentProof')}{' '}
            <a href={form.proofFile} target="_blank" rel="noreferrer" className="text-[#007aff] hover:opacity-70">
              {t('fields.viewDownload')}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
