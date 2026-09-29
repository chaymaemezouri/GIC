import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { fetchDropdownOptions } from '../lib/api';
import { PURCHASE_PAYMENT_MODES, computeLineAmounts, formatAmount, round2, type PurchaseDetail } from '../lib/purchases';
import { Btn, Input, Select, Textarea } from './ui';

const FALLBACK_PURCHASE_UNITS = [
  'Unité', 'm²', 'm³', 'tonne', 'kg', 'litre', 'pièce', 'lot', 'forfait',
];

export type PurchaseLineForm = {
  key: string;
  product: string;
  reference: string;
  family: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  tvaRate: string;
};

export type PurchaseFormData = {
  date: string;
  chantierId: string;
  tranche: string;
  supplierId: string;
  requester: string;
  responsible: string;
  expectedDeliveryDate: string;
  remark: string;
  advanceAmount: string;
  advanceMode: string;
  advanceDate: string;
  purchaseType: 'marchandise' | 'outil';
  lines: PurchaseLineForm[];
};

let lineSeq = 0;
export function emptyPurchaseLine(): PurchaseLineForm {
  lineSeq += 1;
  return { key: `l${Date.now()}-${lineSeq}`, product: '', reference: '', family: '', quantity: '1', unit: '', unitPrice: '', tvaRate: '20' };
}

export function emptyPurchaseForm(): PurchaseFormData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    date: today,
    chantierId: '',
    tranche: '',
    supplierId: '',
    requester: '',
    responsible: '',
    expectedDeliveryDate: '',
    remark: '',
    advanceAmount: '',
    advanceMode: 'especes',
    advanceDate: today,
    purchaseType: 'marchandise',
    lines: [emptyPurchaseLine()],
  };
}

export function purchaseToForm(p: PurchaseDetail): PurchaseFormData {
  const advances = (p.payments || []).filter((pay) => pay.kind === 'avance');
  const firstAdvance = advances[0];
  const advanceTotal = round2(advances.reduce((s, pay) => s + pay.amount, 0));
  return {
    date: p.date ? String(p.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    chantierId: p.chantierId || '',
    tranche: p.tranche || '',
    supplierId: p.supplierId || '',
    requester: p.requester || '',
    responsible: p.responsible || '',
    expectedDeliveryDate: p.expectedDeliveryDate ? String(p.expectedDeliveryDate).slice(0, 10) : '',
    remark: p.remark || '',
    advanceAmount: advanceTotal ? String(advanceTotal) : '',
    advanceMode: firstAdvance?.mode || p.advanceMode || 'especes',
    advanceDate: firstAdvance ? String(firstAdvance.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    purchaseType: p.purchaseType === 'outil' ? 'outil' : 'marchandise',
    lines: (p.lines || []).length
      ? p.lines.map((l) => ({
          key: l.id,
          product: l.product,
          reference: l.reference || '',
          family: l.family || '',
          quantity: String(l.quantity),
          unit: l.unit || '',
          unitPrice: String(l.unitPrice),
          tvaRate: String(l.tvaRate ?? 20),
        }))
      : [emptyPurchaseLine()],
  };
}

export function computePurchaseFormTotals(form: PurchaseFormData) {
  let amountHT = 0;
  let tvaAmount = 0;
  let totalTTC = 0;
  const lines = form.lines.map((l) => {
    const a = computeLineAmounts(Number(l.quantity) || 0, Number(l.unitPrice) || 0, l.tvaRate === '' ? 20 : Number(l.tvaRate) || 0);
    amountHT += a.amountHT;
    tvaAmount += a.tvaAmount;
    totalTTC += a.amountTTC;
    return a;
  });
  const advance = round2(Number(form.advanceAmount) || 0);
  totalTTC = round2(totalTTC);
  return {
    lines,
    amountHT: round2(amountHT),
    tvaAmount: round2(tvaAmount),
    totalTTC,
    advance,
    remaining: round2(Math.max(0, totalTTC - advance)),
  };
}

/** Message d'erreur (clé i18n + params) ou null si le formulaire est valide */
export function validatePurchaseForm(form: PurchaseFormData, t: (k: string, p?: Record<string, string | number>) => string): string | null {
  const filled = form.lines.filter((l) => l.product.trim() || l.unitPrice || l.reference);
  if (!filled.length) return t('purchase.form.errorNoLine');
  for (let i = 0; i < form.lines.length; i++) {
    const l = form.lines[i];
    if (!l.product.trim() && !l.unitPrice && !l.reference) continue;
    const n = i + 1;
    if (!l.product.trim()) return t('purchase.form.errorProduct', { n });
    if (!(Number(l.quantity) > 0)) return t('purchase.form.errorQuantity', { n });
    if (l.unitPrice === '' || Number(l.unitPrice) < 0) return t('purchase.form.errorPrice', { n });
  }
  const totals = computePurchaseFormTotals(form);
  if (totals.advance < 0) return t('purchase.form.errorAdvance');
  if (totals.advance > totals.totalTTC + 0.01) return t('purchase.form.errorAdvanceTooHigh');
  if (totals.advance > 0 && !form.advanceMode) return t('purchase.form.errorAdvanceMode');
  return null;
}

export function purchaseFormToBody(form: PurchaseFormData, opts: { trackingOnly?: boolean } = {}) {
  const tracking = {
    requester: form.requester || null,
    responsible: form.responsible || null,
    expectedDeliveryDate: form.expectedDeliveryDate || null,
    remark: form.remark || null,
  };
  if (opts.trackingOnly) return tracking;
  return {
    ...tracking,
    date: form.date,
    chantierId: form.chantierId || null,
    tranche: form.tranche || null,
    supplierId: form.supplierId || null,
    advanceAmount: Number(form.advanceAmount) || 0,
    advanceMode: form.advanceMode || null,
    advanceDate: form.advanceDate || null,
    purchaseType: form.purchaseType === 'outil' ? 'outil' : 'marchandise',
    lines: form.lines
      .filter((l) => l.product.trim())
      .map((l) => ({
        product: l.product.trim(),
        reference: l.reference || null,
        family: l.family || null,
        quantity: Number(l.quantity),
        unit: l.unit || null,
        unitPrice: Number(l.unitPrice),
        tvaRate: l.tvaRate === '' ? 20 : Number(l.tvaRate),
      })),
  };
}

function LockedValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-[11px] font-medium text-gic-muted mb-1">{label}</span>
      <p className="rounded-md border border-black/[0.08] bg-gray-50/80 px-2.5 py-1.5 text-[12px] font-medium text-gic-ink truncate">{value || '—'}</p>
    </div>
  );
}

export function PurchaseFormFields({
  form,
  setForm,
  suppliers,
  chantiers,
  families,
  tranches = [],
  reference,
  trackingOnly = false,
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
  chantiers: { id: string; name: string; project?: { id: string; name: string } | null }[];
  families: { id: string; name: string; designations?: { label: string }[] }[];
  tranches?: { id: string; name: string }[];
  reference?: string;
  /** Achat déjà soumis : seules les informations de suivi restent modifiables */
  trackingOnly?: boolean;
  lockTranche?: string;
  lockedTrancheName?: string;
  lockChantier?: string;
  lockedChantierName?: string;
  lockSupplier?: string;
  lockedSupplierName?: string;
}) {
  const { t } = useI18n();
  const [units, setUnits] = useState<{ value: string; label: string }[]>(
    FALLBACK_PURCHASE_UNITS.map((u) => ({ value: u, label: u })),
  );

  useEffect(() => {
    fetchDropdownOptions('purchase_unit')
      .then((opts) => {
        if (opts.length > 0) setUnits(opts.map((o) => ({ value: o.value, label: o.label || o.value })));
      })
      .catch(() => {});
  }, []);

  const catalog = useMemo(
    () => families.flatMap((f) => (f.designations || []).map((d) => ({ label: d.label, family: f.name }))),
    [families],
  );
  const totals = computePurchaseFormTotals(form);
  const chantierId = lockChantier || form.chantierId;
  const project = chantiers.find((c) => c.id === chantierId)?.project;

  const set = (patch: Partial<PurchaseFormData>) => setForm({ ...form, ...patch });
  const setLine = (key: string, patch: Partial<PurchaseLineForm>) =>
    setForm({ ...form, lines: form.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  const onProductChange = (key: string, product: string) => {
    const match = catalog.find((c) => c.label === product);
    const line = form.lines.find((l) => l.key === key);
    setLine(key, { product, ...(match && !line?.family ? { family: match.family } : {}) });
  };

  const trackingFields = (
    <>
      <Input label={t('purchase.fields.requester')} value={form.requester} onChange={(e) => set({ requester: e.target.value })} />
      <Input label={t('purchase.fields.responsible')} value={form.responsible} onChange={(e) => set({ responsible: e.target.value })} />
      <Input label={t('purchase.fields.expectedDelivery')} type="date" value={form.expectedDeliveryDate} onChange={(e) => set({ expectedDeliveryDate: e.target.value })} />
    </>
  );

  if (trackingOnly) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-gic-amber-soft/50 px-3 py-2 text-[11px] text-gic-amber">{t('purchase.form.trackingOnlyHint')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {trackingFields}
          <div className="sm:col-span-2">
            <Textarea label={t('purchase.fields.observations')} value={form.remark} onChange={(e) => set({ remark: e.target.value })} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section>
        <p className="purchase-form-section">{t('purchase.form.generalInfo')}</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {(['marchandise', 'outil'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className={`rounded-full px-3 py-1 text-[12px] font-medium border ${form.purchaseType === kind ? 'bg-gic-violet text-white border-gic-violet' : 'bg-white text-gic-ink border-gic-border'}`}
              onClick={() => set({ purchaseType: kind })}
            >
              {t(kind === 'outil' ? 'siteOps.purchaseTools' : 'siteOps.purchaseGoods')}
            </button>
          ))}
        </div>
        {form.purchaseType === 'outil' && (
          <p className="text-[11px] text-gic-muted mb-3">{t('siteOps.toolCreatedHint')}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <LockedValue label={t('purchase.fields.reference')} value={reference || t('purchase.form.autoReference')} />
          <Input label={t('purchase.fields.createdAt')} type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          {lockChantier ? (
            <LockedValue label={t('fields.chantier')} value={lockedChantierName || lockChantier} />
          ) : (
            <Select label={t('fields.chantier')} value={form.chantierId} onChange={(e) => set({ chantierId: e.target.value, tranche: '' })}>
              <option value="">—</option>
              {chantiers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}
          {lockTranche ? (
            <LockedValue label={t('fields.tranche')} value={lockedTrancheName || lockTranche} />
          ) : chantierId ? (
            <Select label={t('fields.tranche')} value={form.tranche} onChange={(e) => set({ tranche: e.target.value })}>
              <option value="">{t('fields.trancheGlobal')}</option>
              {tranches.map((tr) => (
                <option key={tr.id} value={tr.name}>{tr.name}</option>
              ))}
            </Select>
          ) : (
            <LockedValue label={t('fields.tranche')} value="—" />
          )}
          <LockedValue label={t('purchase.fields.project')} value={project?.name || '—'} />
          {lockSupplier ? (
            <LockedValue label={t('fields.supplier')} value={lockedSupplierName || lockSupplier} />
          ) : (
            <Select label={t('fields.supplier')} value={form.supplierId} onChange={(e) => set({ supplierId: e.target.value })}>
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.reference} — {s.companyName}</option>
              ))}
            </Select>
          )}
          {trackingFields}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="purchase-form-section !mb-0">{t('purchase.form.products')} ({form.lines.length})</p>
          <Btn type="button" variant="secondary" icon={Plus} onClick={() => set({ lines: [...form.lines, emptyPurchaseLine()] })}>
            {t('purchase.form.addLine')}
          </Btn>
        </div>
        {catalog.length > 0 && (
          <datalist id="purchase-catalog-list">
            {catalog.map((c) => (
              <option key={`${c.family}-${c.label}`} value={c.label}>{c.family}</option>
            ))}
          </datalist>
        )}
        {families.length > 0 && (
          <datalist id="purchase-family-list">
            {families.map((f) => (
              <option key={f.id} value={f.name} />
            ))}
          </datalist>
        )}
        <div className="purchase-lines-wrap">
          <table className="purchase-lines-table">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>{t('purchase.fields.product')} *</th>
                <th>{t('purchase.fields.productRef')}</th>
                <th>{t('purchase.fields.category')}</th>
                <th className="w-20">{t('purchase.fields.quantity')} *</th>
                <th className="w-24">{t('purchase.fields.unit')}</th>
                <th className="w-24">{t('purchase.fields.unitPrice')} *</th>
                <th className="w-16">{t('purchase.fields.tva')}</th>
                <th className="w-28 text-right">{t('purchase.fields.amountTtc')}</th>
                <th className="w-8" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {form.lines.map((l, i) => (
                <tr key={l.key}>
                  <td className="text-gic-muted text-center">{i + 1}</td>
                  <td>
                    <input
                      value={l.product}
                      list={catalog.length ? 'purchase-catalog-list' : undefined}
                      placeholder={t('purchase.form.productPlaceholder')}
                      onChange={(e) => onProductChange(l.key, e.target.value)}
                    />
                  </td>
                  <td><input value={l.reference} onChange={(e) => setLine(l.key, { reference: e.target.value })} /></td>
                  <td>
                    <input
                      value={l.family}
                      list={families.length ? 'purchase-family-list' : undefined}
                      onChange={(e) => setLine(l.key, { family: e.target.value })}
                    />
                  </td>
                  <td><input type="number" min="0" step="0.01" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} /></td>
                  <td>
                    <select value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })}>
                      <option value="">—</option>
                      {units.map((u) => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                      {l.unit && !units.some((u) => u.value === l.unit) && <option value={l.unit}>{l.unit}</option>}
                    </select>
                  </td>
                  <td><input type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} /></td>
                  <td><input type="number" min="0" max="100" step="0.1" value={l.tvaRate} onChange={(e) => setLine(l.key, { tvaRate: e.target.value })} /></td>
                  <td className="text-right font-semibold whitespace-nowrap">{formatAmount(totals.lines[i]?.amountTTC || 0)}</td>
                  <td>
                    <button
                      type="button"
                      className="purchase-line-remove"
                      title={t('common.delete')}
                      disabled={form.lines.length === 1}
                      onClick={() => set({ lines: form.lines.filter((x) => x.key !== l.key) })}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="purchase-form-section">{t('purchase.form.advance')}</p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <Input
              label={t('purchase.fields.advanceAmount')}
              type="number"
              min="0"
              step="0.01"
              value={form.advanceAmount}
              onChange={(e) => set({ advanceAmount: e.target.value })}
            />
            <Select label={t('purchase.fields.advanceMode')} value={form.advanceMode} onChange={(e) => set({ advanceMode: e.target.value })}>
              {PURCHASE_PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>{t(`purchase.mode.${m}`)}</option>
              ))}
            </Select>
            <Input label={t('purchase.fields.advanceDate')} type="date" value={form.advanceDate} onChange={(e) => set({ advanceDate: e.target.value })} />
          </div>
          <div className="mt-3">
            <Textarea label={t('purchase.fields.observations')} value={form.remark} onChange={(e) => set({ remark: e.target.value })} />
          </div>
        </div>
        <div className="purchase-totals">
          <div><span>{t('purchase.fields.totalHt')}</span><strong>{formatAmount(totals.amountHT)}</strong></div>
          <div><span>{t('purchase.fields.totalTva')}</span><strong>{formatAmount(totals.tvaAmount)}</strong></div>
          <div className="purchase-totals-main"><span>{t('purchase.fields.totalTtc')}</span><strong>{formatAmount(totals.totalTTC)}</strong></div>
          <div><span>{t('purchase.fields.totalAdvance')}</span><strong>{formatAmount(totals.advance)}</strong></div>
          <div className="purchase-totals-remaining"><span>{t('purchase.fields.remaining')}</span><strong>{formatAmount(totals.remaining)}</strong></div>
        </div>
      </section>
    </div>
  );
}
