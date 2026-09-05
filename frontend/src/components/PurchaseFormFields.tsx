import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { fetchDropdownOptions } from '../lib/api';
import { Input, Select } from './ui';

const FALLBACK_PURCHASE_UNITS = [
  'Unité', 'm²', 'm³', 'tonne', 'kg', 'litre', 'pièce', 'lot', 'forfait',
];

export type PurchaseFormData = {
  designation: string;
  family: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  tvaRate: string;
  supplierId: string;
  chantierId: string;
  tranche: string;
  paymentMode: string;
  author: string;
  remark: string;
  date: string;
  invoiced: string;
};

export function emptyPurchaseForm(): PurchaseFormData {
  return {
    designation: '',
    family: '',
    unit: '',
    quantity: '1',
    unitPrice: '',
    tvaRate: '20',
    supplierId: '',
    chantierId: '',
    tranche: '',
    paymentMode: 'especes',
    author: '',
    remark: '',
    date: new Date().toISOString().slice(0, 10),
    invoiced: 'false',
  };
}

export function purchaseToForm(p: Record<string, unknown>): PurchaseFormData {
  return {
    designation: String(p.designation || ''),
    family: String(p.family || ''),
    unit: String(p.unit || ''),
    quantity: String(p.quantity ?? '1'),
    unitPrice: String(p.unitPrice ?? ''),
    tvaRate: String(p.tvaRate ?? '20'),
    supplierId: String(p.supplierId || ''),
    chantierId: String(p.chantierId || ''),
    tranche: String(p.tranche || ''),
    paymentMode: String(p.paymentMode || 'especes'),
    author: String(p.author || ''),
    remark: String(p.remark || ''),
    date: p.date ? String(p.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    invoiced: p.invoiced ? 'true' : 'false',
  };
}

export function PurchaseFormFields({
  form,
  setForm,
  suppliers,
  chantiers,
  families,
  tranches = [],
  lockTranche,
  lockedTrancheName,
  lockChantier,
  lockedChantierName,
  lockSupplier,
  lockedSupplierName,
}: {
  form: PurchaseFormData;
  setForm: (f: PurchaseFormData) => void;
  suppliers: { id: string; reference: string; companyName: string }[];
  chantiers: { id: string; name: string }[];
  families: { id: string; name: string; designations?: { label: string }[] }[];
  tranches?: { id: string; name: string }[];
  lockTranche?: string;
  lockedTrancheName?: string;
  lockChantier?: string;
  lockedChantierName?: string;
  lockSupplier?: string;
  lockedSupplierName?: string;
}) {
  const { t } = useI18n();
  const selectedFamily = families.find((f) => f.name === form.family);
  const qty = Number(form.quantity) || 0;
  const pu = Number(form.unitPrice) || 0;
  const rate = Number(form.tvaRate) || 20;
  const amountHT = Math.round(qty * pu * 100) / 100;
  const tvaAmount = Math.round(amountHT * (rate / 100) * 100) / 100;
  const totalTTC = Math.round((amountHT + tvaAmount) * 100) / 100;
  const [units, setUnits] = useState<{ value: string; label: string }[]>(
    FALLBACK_PURCHASE_UNITS.map((u) => ({ value: u, label: u })),
  );

  useEffect(() => {
    fetchDropdownOptions('purchase_unit')
      .then((opts) => {
        if (opts.length > 0) {
          setUnits(opts.map((o) => ({ value: o.value, label: o.label || o.value })));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input className="sm:col-span-2" label={`${t('fields.designation')} *`} required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
      <Select label={t('fields.family')} value={form.family} onChange={(e) => setForm({ ...form, family: e.target.value, designation: '' })}>
        <option value="">—</option>
        {families.map((f) => (
          <option key={f.id} value={f.name}>{f.name}</option>
        ))}
      </Select>
      {selectedFamily && (selectedFamily.designations || []).length > 0 ? (
        <Select label={t('fields.catalogDesignation')} value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })}>
          <option value="">—</option>
          {(selectedFamily.designations || []).map((d) => (
            <option key={d.label} value={d.label}>{d.label}</option>
          ))}
        </Select>
      ) : (
        <span className="hidden sm:block" aria-hidden />
      )}
      <Select label={t('fields.unit')} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
        <option value="">—</option>
        {units.map((u) => (
          <option key={u.value} value={u.value}>{u.label}</option>
        ))}
        {form.unit && !units.some((u) => u.value === form.unit) && (
          <option value={form.unit}>{form.unit}</option>
        )}
      </Select>
      <Input label={`${t('fields.quantity')} *`} required type="number" min="0" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
      <Input label={`${t('fields.unitPriceHt')} *`} required type="number" min="0" step="0.01" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
      <Input label={`${t('fields.tva')} (%)`} type="number" min="0" max="100" step="0.1" value={form.tvaRate} onChange={(e) => setForm({ ...form, tvaRate: e.target.value })} />
      <Input label={t('fields.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      <Select label={t('fields.paymentMode')} value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
        <option value="especes">{t('fields.modeCash')}</option>
        <option value="virement">{t('fields.modeTransfer')}</option>
        <option value="cheque">{t('fields.modeCheck')}</option>
        <option value="carte">{t('fields.modeCard')}</option>
      </Select>
      {lockSupplier ? (
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-medium text-gic-muted mb-1">{t('fields.supplier')}</label>
          <p className="rounded-xl border border-gic-border bg-gray-50/80 px-3 py-2 text-[12px] font-medium text-gic-ink">
            {lockedSupplierName || lockSupplier}
          </p>
        </div>
      ) : (
        <Select label={t('fields.supplier')} value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
          <option value="">—</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.reference} — {s.companyName}</option>
          ))}
        </Select>
      )}
      {lockChantier ? (
        <div>
          <label className="block text-[11px] font-medium text-gic-muted mb-1">{t('fields.chantier')}</label>
          <p className="rounded-xl border border-gic-border bg-gray-50/80 px-3 py-2 text-[12px] font-medium text-gic-ink">
            {lockedChantierName || lockChantier}
          </p>
        </div>
      ) : (
        <Select label={t('fields.chantier')} value={form.chantierId} onChange={(e) => setForm({ ...form, chantierId: e.target.value, tranche: '' })}>
          <option value="">—</option>
          {chantiers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      )}
      {lockTranche ? (
        <div>
          <label className="block text-[11px] font-medium text-gic-muted mb-1">{t('fields.tranche')}</label>
          <p className="rounded-xl border border-gic-border bg-gray-50/80 px-3 py-2 text-[12px] font-medium text-gic-ink">
            {lockedTrancheName || lockTranche}
          </p>
        </div>
      ) : (form.chantierId || lockChantier) ? (
        <Select label={t('fields.tranche')} value={form.tranche} onChange={(e) => setForm({ ...form, tranche: e.target.value })}>
          <option value="">{t('fields.trancheGlobal')}</option>
          {tranches.map((tr) => (
            <option key={tr.id} value={tr.name}>{tr.name}</option>
          ))}
        </Select>
      ) : (
        <div />
      )}
      <Input label={t('fields.authorRequester')} value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
      <Select label={t('fields.invoiced')} value={form.invoiced} onChange={(e) => setForm({ ...form, invoiced: e.target.value })}>
        <option value="false">{t('fields.no')}</option>
        <option value="true">{t('fields.yes')}</option>
      </Select>
      <Input className="sm:col-span-2" label={t('fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
      {form.quantity && form.unitPrice && (
        <div className="sm:col-span-2 rounded-xl bg-gic-violet-soft/40 border border-gic-violet/20 p-3 grid sm:grid-cols-3 gap-2 text-[11px]">
          <div><span className="text-gic-muted">{t('fields.amountHt')}</span><p className="font-semibold">{amountHT.toLocaleString('fr-MA')} MAD</p></div>
          <div><span className="text-gic-muted">{t('fields.tva')} ({rate} %)</span><p className="font-semibold">{tvaAmount.toLocaleString('fr-MA')} MAD</p></div>
          <div><span className="text-gic-muted">{t('fields.totalTtc')}</span><p className="font-semibold text-gic-violet">{totalTTC.toLocaleString('fr-MA')} MAD</p></div>
        </div>
      )}
    </div>
  );
}
