import { useEffect, useState } from 'react';
import { useI18n, tStatic } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';
import { fetchSupplierList } from '../lib/api';
import {
  DEPRECIATION_METHODS,
  ENGIN_KINDS,
  ENGIN_STATUSES,
  RENTAL_UNITS,
  formatMad2,
  inclusiveDays,
  num,
  round2,
  todayISO,
} from '../lib/engins';
import { Input, Select, Textarea } from './ui';
import { FormSection } from './engins/FleetCommon';

export type EnginOwnershipType = 'personnel' | 'loue';

export const ENGIN_OWNERSHIP_KEYS: Record<EnginOwnershipType, string> = {
  personnel: 'fleet.ownership.personnel',
  loue: 'fleet.ownership.loue',
};

export function enginOwnershipLabel(type: string | null | undefined, t: TranslateFn = tStatic): string {
  const key = type === 'loue' ? 'loue' : 'personnel';
  return t(ENGIN_OWNERSHIP_KEYS[key]);
}

export type EnginFormData = {
  kind: string;
  quantity: string;
  designation: string;
  genre: string;
  groupe: string;
  brand: string;
  model: string;
  chassisNo: string;
  matricule: string;
  acquisitionYear: string;
  commissioningDate: string;
  status: string;
  location: string;
  ownershipType: EnginOwnershipType;
  purchasePrice: string;
  acquisitionDate: string;
  residualValue: string;
  depreciationYears: string;
  depreciationMethod: string;
  usageCostPerHour: string;
  rentalSupplierId: string;
  rentalSupplier: string;
  rentalContractRef: string;
  rentalStart: string;
  rentalEnd: string;
  rentalPrice: string;
  rentalUnit: string;
  rentalDeposit: string;
  rentalTransport: string;
  rentalExtraFees: string;
  rentalInsurance: string;
  rentalTvaRate: string;
  rentalPaymentTerms: string;
  gpsNumber: string;
  gsmNumber: string;
  gpsMountDate: string;
  transferDate: string;
  counterValue: string;
  counterUnit: string;
  counterDate: string;
  fuelLevel: string;
  emptyWeight: string;
  totalWeight: string;
  insuranceExpiry: string;
  vignetteExpiry: string;
  visitExpiry: string;
  authExpiry: string;
  workPassport: string;
};

export function emptyEnginForm(kind = 'engin', ownershipType: EnginOwnershipType = 'personnel'): EnginFormData {
  return {
    kind,
    quantity: '1',
    designation: '',
    genre: '',
    groupe: '',
    brand: '',
    model: '',
    chassisNo: '',
    matricule: '',
    acquisitionYear: '',
    commissioningDate: '',
    status: 'disponible',
    location: '',
    ownershipType,
    purchasePrice: '',
    acquisitionDate: ownershipType === 'personnel' ? todayISO() : '',
    residualValue: '0',
    depreciationYears: '5',
    depreciationMethod: 'lineaire',
    usageCostPerHour: '',
    rentalSupplierId: '',
    rentalSupplier: '',
    rentalContractRef: '',
    rentalStart: ownershipType === 'loue' ? todayISO() : '',
    rentalEnd: '',
    rentalPrice: '',
    rentalUnit: 'jour',
    rentalDeposit: '',
    rentalTransport: '',
    rentalExtraFees: '',
    rentalInsurance: '',
    rentalTvaRate: '20',
    rentalPaymentTerms: '',
    gpsNumber: '',
    gsmNumber: '',
    gpsMountDate: '',
    transferDate: '',
    counterValue: '',
    counterUnit: kind === 'materiel' ? 'Hr' : 'KM',
    counterDate: '',
    fuelLevel: '',
    emptyWeight: '',
    totalWeight: '',
    insuranceExpiry: '',
    vignetteExpiry: '',
    visitExpiry: '',
    authExpiry: '',
    workPassport: '',
  };
}

function normalizeOwnershipType(v: unknown): EnginOwnershipType {
  const s = String(v || 'personnel').trim().toLowerCase();
  return s === 'loue' || s === 'loué' ? 'loue' : 'personnel';
}

export function enginToForm(e: Record<string, unknown>): EnginFormData {
  const date = (v: unknown) => (v ? String(v).slice(0, 10) : '');
  const str = (v: unknown) => (v == null ? '' : String(v));
  const base = emptyEnginForm(String(e.kind || 'engin'), normalizeOwnershipType(e.ownershipType));
  const out = { ...base } as Record<string, string>;
  for (const key of Object.keys(base)) {
    const v = e[key];
    if (v === undefined) continue;
    out[key] = /Date$|Start$|End$|Expiry$/.test(key) ? date(v) : str(v);
  }
  if (!out.rentalPrice && e.rentalMonthly != null) {
    out.rentalPrice = String(e.rentalMonthly);
    out.rentalUnit = 'mois';
  }
  if (!out.status || out.status === 'en_mission') out.status = out.status ? 'en_utilisation' : 'disponible';
  return { ...(out as unknown as EnginFormData), ownershipType: normalizeOwnershipType(e.ownershipType) };
}

export function enginFormToBody(f: EnginFormData) {
  const ownershipType = normalizeOwnershipType(f.ownershipType);
  const n = (v: string) => (v === '' ? null : v);
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) body[k] = n(v as string);
  body.ownershipType = ownershipType;
  body.kind = f.kind || 'engin';
  body.counterUnit = f.counterUnit || 'KM';
  body.status = f.status || 'disponible';
  body.depreciationMethod = f.depreciationMethod || 'lineaire';
  if (ownershipType === 'loue') {
    for (const k of ['purchasePrice', 'acquisitionDate', 'residualValue', 'depreciationYears', 'usageCostPerHour']) body[k] = null;
    body.rentalMonthly = null;
    if (body.rentalSupplierId) body.rentalSupplier = null;
  } else {
    for (const k of Object.keys(body)) if (k.startsWith('rental')) body[k] = null;
  }
  return body;
}

/** Aperçu de l'amortissement : annuité linéaire (1re année pour le dégressif) et coût journalier. */
export function depreciationPreview(f: Pick<EnginFormData, 'purchasePrice' | 'residualValue' | 'depreciationYears' | 'depreciationMethod'>) {
  const price = num(f.purchasePrice);
  const years = num(f.depreciationYears);
  const residual = Math.min(num(f.residualValue), price);
  if (price <= 0 || years <= 0) return null;
  let annual = (price - residual) / years;
  if (f.depreciationMethod === 'degressif') {
    const coef = years <= 4 ? 1.25 : years <= 6 ? 1.75 : 2.25;
    annual = Math.min(Math.max((price * coef) / years, annual), price - residual);
  }
  return { annual: round2(annual), daily: round2(annual / 365), monthly: round2(annual / 12) };
}

export function rentalPreview(f: Pick<EnginFormData, 'rentalPrice' | 'rentalUnit' | 'rentalStart' | 'rentalEnd' | 'rentalTransport' | 'rentalExtraFees' | 'rentalInsurance' | 'rentalTvaRate'>) {
  const price = num(f.rentalPrice);
  const extras = num(f.rentalTransport) + num(f.rentalExtraFees) + num(f.rentalInsurance);
  const flat = f.rentalUnit === 'projet' || f.rentalUnit === 'tranche';
  const daily = flat ? null : f.rentalUnit === 'semaine' ? price / 7 : f.rentalUnit === 'mois' ? price / 30 : price;
  const days = inclusiveDays(f.rentalStart, f.rentalEnd);
  const base = flat ? price : days && daily != null ? daily * days : 0;
  const ht = base + extras;
  const tva = (ht * num(f.rentalTvaRate)) / 100;
  return { daily: daily != null ? round2(daily) : null, days, base: round2(base), extras: round2(extras), ht: round2(ht), tva: round2(tva), ttc: round2(ht + tva), flat };
}

type Supplier = { id: string; companyName: string };

export function EnginFormFields({
  form,
  setForm,
  isEdit = false,
}: {
  form: EnginFormData;
  setForm: (f: EnginFormData) => void;
  isEdit?: boolean;
}) {
  const { t } = useI18n();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const isLoue = form.ownershipType === 'loue';
  const set = (patch: Partial<EnginFormData>) => setForm({ ...form, ...patch });

  useEffect(() => {
    if (isLoue && suppliers.length === 0) fetchSupplierList<Supplier>().then(setSuppliers).catch(() => {});
  }, [isLoue, suppliers.length]);

  const dep = depreciationPreview(form);
  const rent = rentalPreview(form);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormSection title={t('fleet.sections.identity')}>
        <Select label={t('fleet.fields.kind')} value={form.kind} disabled={isEdit} onChange={(e) => set({ kind: e.target.value })}>
          {ENGIN_KINDS.map((k) => <option key={k} value={k}>{t(`fleet.kind.${k}`)}</option>)}
        </Select>
        <Select
          label={t('fleet.fields.ownership')}
          value={form.ownershipType}
          onChange={(e) => {
            const ownershipType = normalizeOwnershipType(e.target.value);
            set({
              ownershipType,
              acquisitionDate: ownershipType === 'personnel' ? form.acquisitionDate || todayISO() : form.acquisitionDate,
              rentalStart: ownershipType === 'loue' ? form.rentalStart || todayISO() : form.rentalStart,
            });
          }}
        >
          <option value="personnel">{t('fleet.ownership.personnel')}</option>
          <option value="loue">{t('fleet.ownership.loue')}</option>
        </Select>
        <div className="sm:col-span-2">
          <Input label={t('fleet.fields.designation')} placeholder={[form.genre, form.brand].filter(Boolean).join(' ')} value={form.designation} onChange={(e) => set({ designation: e.target.value })} />
        </div>
        {form.kind === 'materiel' && (
          <Input label={t('fleet.fields.quantity')} type="number" min="1" step="1" inputMode="numeric" value={form.quantity} onChange={(e) => {
            const n = parseInt(e.target.value.replace(',', '.'), 10);
            set({ quantity: Number.isFinite(n) && n > 0 ? String(n) : '' });
          }} />
        )}
        <Input label={t('fleet.fields.type')} placeholder={t('fleet.hints.typeExample')} value={form.genre} onChange={(e) => set({ genre: e.target.value })} />
        <Input label={t('fleet.fields.category')} placeholder={t('fleet.hints.categoryExample')} value={form.groupe} onChange={(e) => set({ groupe: e.target.value })} />
        <Input label={t('fleet.fields.brand')} value={form.brand} onChange={(e) => set({ brand: e.target.value })} />
        <Input label={t('fleet.fields.model')} value={form.model} onChange={(e) => set({ model: e.target.value })} />
        <Input label={t('fleet.fields.serialNo')} value={form.chassisNo} onChange={(e) => set({ chassisNo: e.target.value })} />
        <Input label={t('fleet.fields.matricule')} value={form.matricule} onChange={(e) => set({ matricule: e.target.value })} />
        <Input label={t('fleet.fields.acquisitionYear')} type="number" min="1950" max="2100" value={form.acquisitionYear} onChange={(e) => set({ acquisitionYear: e.target.value })} />
        <Input label={t('fleet.fields.commissioningDate')} type="date" value={form.commissioningDate} onChange={(e) => set({ commissioningDate: e.target.value })} />
        <Select label={t('fleet.fields.status')} value={form.status} onChange={(e) => set({ status: e.target.value })}>
          {ENGIN_STATUSES.map((s) => <option key={s} value={s}>{t(`fleet.status.${s}`)}</option>)}
        </Select>
        <Input label={t('fleet.fields.location')} placeholder={t('fleet.hints.depot')} value={form.location} onChange={(e) => set({ location: e.target.value })} />
      </FormSection>

      {!isLoue ? (
        <FormSection title={t('fleet.sections.acquisition')}>
          <Input label={`${t('fleet.fields.purchasePrice')} *`} type="number" min="0" step="0.01" required value={form.purchasePrice} onChange={(e) => set({ purchasePrice: e.target.value })} />
          <Input label={t('fleet.fields.acquisitionDate')} type="date" value={form.acquisitionDate} onChange={(e) => set({ acquisitionDate: e.target.value })} />
          <Input label={t('fleet.fields.residualValue')} type="number" min="0" step="0.01" value={form.residualValue} onChange={(e) => set({ residualValue: e.target.value })} />
          <Input label={t('fleet.fields.depreciationYears')} type="number" min="0.5" step="0.5" value={form.depreciationYears} onChange={(e) => set({ depreciationYears: e.target.value })} />
          <Select label={t('fleet.fields.depreciationMethod')} value={form.depreciationMethod} onChange={(e) => set({ depreciationMethod: e.target.value })}>
            {DEPRECIATION_METHODS.map((m) => <option key={m} value={m}>{t(`fleet.depMethod.${m}`)}</option>)}
          </Select>
          <Input label={t('fleet.fields.usageCostPerHour')} type="number" min="0" step="0.01" value={form.usageCostPerHour} onChange={(e) => set({ usageCostPerHour: e.target.value })} />
          <div className="sm:col-span-2 rounded-lg bg-gic-violet-soft/60 px-3 py-2 text-[12px]">
            {dep ? (
              <>
                <p className="font-semibold text-gic-violet">
                  {t('fleet.calc.depreciationFormula', {
                    price: formatMad2(num(form.purchasePrice) - Math.min(num(form.residualValue), num(form.purchasePrice))),
                    years: num(form.depreciationYears),
                    annual: formatMad2(dep.annual),
                  })}
                </p>
                <p className="text-gic-muted mt-0.5">
                  {t('fleet.calc.dailyFromAnnual', { annual: formatMad2(dep.annual), daily: formatMad2(dep.daily) })} · {t('fleet.calc.monthly', { monthly: formatMad2(dep.monthly) })}
                </p>
                {form.depreciationMethod === 'degressif' && <p className="text-[10px] text-gic-muted mt-0.5">{t('fleet.hints.degressiveFirstYear')}</p>}
              </>
            ) : (
              <p className="text-gic-muted">{t('fleet.hints.depreciationMissing')}</p>
            )}
          </div>
        </FormSection>
      ) : (
        <FormSection title={t('fleet.sections.rental')}>
          <Select label={t('fleet.fields.supplier')} value={form.rentalSupplierId} onChange={(e) => set({ rentalSupplierId: e.target.value })}>
            <option value="">{t('fleet.hints.supplierFree')}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
          </Select>
          {!form.rentalSupplierId ? (
            <Input label={t('fleet.fields.supplierName')} value={form.rentalSupplier} onChange={(e) => set({ rentalSupplier: e.target.value })} />
          ) : (
            <div />
          )}
          <Input label={t('fleet.fields.contractRef')} value={form.rentalContractRef} onChange={(e) => set({ rentalContractRef: e.target.value })} />
          <Input label={t('fleet.fields.paymentTerms')} placeholder={t('fleet.hints.paymentTermsExample')} value={form.rentalPaymentTerms} onChange={(e) => set({ rentalPaymentTerms: e.target.value })} />
          <Input label={`${t('fleet.fields.rentalStart')} *`} type="date" required value={form.rentalStart} onChange={(e) => set({ rentalStart: e.target.value })} />
          <Input label={t('fleet.fields.rentalEnd')} type="date" min={form.rentalStart} value={form.rentalEnd} onChange={(e) => set({ rentalEnd: e.target.value })} />
          <Input label={`${t('fleet.fields.rentalPrice')} *`} type="number" min="0" step="0.01" required value={form.rentalPrice} onChange={(e) => set({ rentalPrice: e.target.value })} />
          <Select label={t('fleet.fields.rentalUnit')} value={form.rentalUnit} onChange={(e) => set({ rentalUnit: e.target.value })}>
            {RENTAL_UNITS.map((u) => <option key={u} value={u}>{t(`fleet.rentalUnit.${u}`)}</option>)}
          </Select>
          <Input label={t('fleet.fields.deposit')} type="number" min="0" step="0.01" value={form.rentalDeposit} onChange={(e) => set({ rentalDeposit: e.target.value })} />
          <Input label={t('fleet.fields.transport')} type="number" min="0" step="0.01" value={form.rentalTransport} onChange={(e) => set({ rentalTransport: e.target.value })} />
          <Input label={t('fleet.fields.extraFees')} type="number" min="0" step="0.01" value={form.rentalExtraFees} onChange={(e) => set({ rentalExtraFees: e.target.value })} />
          <Input label={t('fleet.fields.insurance')} type="number" min="0" step="0.01" value={form.rentalInsurance} onChange={(e) => set({ rentalInsurance: e.target.value })} />
          <Input label={t('fleet.fields.tvaRate')} type="number" min="0" max="100" step="0.5" value={form.rentalTvaRate} onChange={(e) => set({ rentalTvaRate: e.target.value })} />
          <div />
          <div className="sm:col-span-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px]">
            {num(form.rentalPrice) > 0 ? (
              <>
                <p className="font-semibold">
                  {rent.flat
                    ? t('fleet.calc.rentalFlat', { amount: formatMad2(rent.base) })
                    : rent.days
                      ? t('fleet.calc.rentalFormula', { days: rent.days, daily: formatMad2(rent.daily), base: formatMad2(rent.base) })
                      : t('fleet.calc.rentalDaily', { daily: formatMad2(rent.daily) })}
                </p>
                <p className="text-gic-muted mt-0.5">
                  {t('fleet.calc.rentalTotals', { extras: formatMad2(rent.extras), ht: formatMad2(rent.ht), tva: formatMad2(rent.tva), ttc: formatMad2(rent.ttc) })}
                </p>
              </>
            ) : (
              <p className="text-gic-muted">{t('fleet.hints.rentalMissing')}</p>
            )}
          </div>
        </FormSection>
      )}

      <FormSection title={t('fleet.sections.technical')}>
        <Input label={t('fleet.fields.counter')} type="number" min="0" value={form.counterValue} onChange={(e) => set({ counterValue: e.target.value })} />
        <Select label={t('fleet.fields.counterUnit')} value={form.counterUnit} onChange={(e) => set({ counterUnit: e.target.value })}>
          <option value="KM">KM</option>
          <option value="Hr">{t('fleet.fields.hours')}</option>
        </Select>
        <Input label={t('fields.counterDate')} type="date" value={form.counterDate} onChange={(e) => set({ counterDate: e.target.value })} />
        <Input label={t('fields.fuelPercent')} type="number" min="0" max="100" value={form.fuelLevel} onChange={(e) => set({ fuelLevel: e.target.value })} />
        <Input label={t('fields.emptyWeightKg')} type="number" min="0" value={form.emptyWeight} onChange={(e) => set({ emptyWeight: e.target.value })} />
        <Input label={t('fields.ptacKg')} type="number" min="0" value={form.totalWeight} onChange={(e) => set({ totalWeight: e.target.value })} />
        <Input label={t('fields.gpsNo')} value={form.gpsNumber} onChange={(e) => set({ gpsNumber: e.target.value })} />
        <Input label={t('fields.gsmNo')} value={form.gsmNumber} onChange={(e) => set({ gsmNumber: e.target.value })} />
        <Input label={t('fields.gpsMountDate')} type="date" value={form.gpsMountDate} onChange={(e) => set({ gpsMountDate: e.target.value })} />
        <Input label={t('fields.transferDate')} type="date" value={form.transferDate} onChange={(e) => set({ transferDate: e.target.value })} />
        <div className="sm:col-span-2">
          <Textarea label={t('fields.workPassport')} value={form.workPassport} onChange={(e) => set({ workPassport: e.target.value })} />
        </div>
      </FormSection>

      <FormSection title={t('fleet.sections.papers')}>
        <Input label={t('fields.insuranceExpiry')} type="date" value={form.insuranceExpiry} onChange={(e) => set({ insuranceExpiry: e.target.value })} />
        <Input label={t('fields.vignetteExpiry')} type="date" value={form.vignetteExpiry} onChange={(e) => set({ vignetteExpiry: e.target.value })} />
        <Input label={t('fields.visitExpiry')} type="date" value={form.visitExpiry} onChange={(e) => set({ visitExpiry: e.target.value })} />
        <Input label={t('fields.authExpiry')} type="date" value={form.authExpiry} onChange={(e) => set({ authExpiry: e.target.value })} />
      </FormSection>
    </div>
  );
}
