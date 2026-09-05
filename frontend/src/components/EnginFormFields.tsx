import { useI18n, tStatic } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';
import { Input, Select } from './ui';

export type EnginOwnershipType = 'personnel' | 'loue';

export const ENGIN_OWNERSHIP_KEYS: Record<EnginOwnershipType, string> = {
  personnel: 'fields.ownershipPersonal',
  loue: 'fields.ownershipRented',
};

export function enginOwnershipLabel(type: string | null | undefined, t: TranslateFn = tStatic): string {
  const key = type === 'loue' ? 'loue' : 'personnel';
  return t(ENGIN_OWNERSHIP_KEYS[key]);
}

/** @deprecated Prefer enginOwnershipLabel(type, t) */
export const ENGIN_OWNERSHIP_LABELS: Record<EnginOwnershipType, string> = {
  get personnel() { return tStatic('fields.ownershipPersonal'); },
  get loue() { return tStatic('fields.ownershipRented'); },
};

export type EnginFormData = {
  ownershipType: EnginOwnershipType;
  rentalSupplier: string;
  rentalMonthly: string;
  brand: string;
  genre: string;
  matricule: string;
  chassisNo: string;
  gpsNumber: string;
  gsmNumber: string;
  gpsMountDate: string;
  transferDate: string;
  counterValue: string;
  counterUnit: string;
  counterDate: string;
  purchasePrice: string;
  fuelLevel: string;
  emptyWeight: string;
  totalWeight: string;
  status: string;
  insuranceExpiry: string;
  vignetteExpiry: string;
  visitExpiry: string;
  authExpiry: string;
  groupe: string;
  workPassport: string;
};

export function emptyEnginForm(): EnginFormData {
  return {
    ownershipType: 'personnel',
    rentalSupplier: '',
    rentalMonthly: '',
    brand: '',
    genre: '',
    matricule: '',
    chassisNo: '',
    gpsNumber: '',
    gsmNumber: '',
    gpsMountDate: '',
    transferDate: '',
    counterValue: '',
    counterUnit: 'KM',
    counterDate: '',
    purchasePrice: '',
    fuelLevel: '',
    emptyWeight: '',
    totalWeight: '',
    status: 'disponible',
    insuranceExpiry: '',
    vignetteExpiry: '',
    visitExpiry: '',
    authExpiry: '',
    groupe: '',
    workPassport: '',
  };
}

function normalizeOwnershipType(v: unknown): EnginOwnershipType {
  const s = String(v || 'personnel').trim().toLowerCase();
  return s === 'loue' || s === 'loué' ? 'loue' : 'personnel';
}

export function enginToForm(e: Record<string, unknown>): EnginFormData {
  const date = (v: unknown) => (v ? String(v).slice(0, 10) : '');
  return {
    ownershipType: normalizeOwnershipType(e.ownershipType),
    rentalSupplier: String(e.rentalSupplier || ''),
    rentalMonthly: e.rentalMonthly != null ? String(e.rentalMonthly) : '',
    brand: String(e.brand || ''),
    genre: String(e.genre || ''),
    matricule: String(e.matricule || ''),
    chassisNo: String(e.chassisNo || ''),
    gpsNumber: String(e.gpsNumber || ''),
    gsmNumber: String(e.gsmNumber || ''),
    gpsMountDate: date(e.gpsMountDate),
    transferDate: date(e.transferDate),
    counterValue: e.counterValue != null ? String(e.counterValue) : '',
    counterUnit: String(e.counterUnit || 'KM'),
    counterDate: date(e.counterDate),
    purchasePrice: e.purchasePrice != null ? String(e.purchasePrice) : '',
    fuelLevel: e.fuelLevel != null ? String(e.fuelLevel) : '',
    emptyWeight: e.emptyWeight != null ? String(e.emptyWeight) : '',
    totalWeight: e.totalWeight != null ? String(e.totalWeight) : '',
    status: String(e.status || 'disponible'),
    insuranceExpiry: date(e.insuranceExpiry),
    vignetteExpiry: date(e.vignetteExpiry),
    visitExpiry: date(e.visitExpiry),
    authExpiry: date(e.authExpiry),
    groupe: String(e.groupe || ''),
    workPassport: String(e.workPassport || ''),
  };
}

export function enginFormToBody(f: EnginFormData) {
  const ownershipType = normalizeOwnershipType(f.ownershipType);
  return {
    ownershipType,
    rentalSupplier: ownershipType === 'loue' ? f.rentalSupplier || null : null,
    rentalMonthly: ownershipType === 'loue' ? f.rentalMonthly || null : null,
    brand: f.brand || null,
    genre: f.genre || null,
    matricule: f.matricule || null,
    chassisNo: f.chassisNo || null,
    gpsNumber: f.gpsNumber || null,
    gsmNumber: f.gsmNumber || null,
    gpsMountDate: f.gpsMountDate || null,
    transferDate: f.transferDate || null,
    counterValue: f.counterValue || null,
    counterUnit: f.counterUnit || 'KM',
    counterDate: f.counterDate || null,
    purchasePrice: ownershipType === 'personnel' ? f.purchasePrice || null : null,
    fuelLevel: f.fuelLevel || null,
    emptyWeight: f.emptyWeight || null,
    totalWeight: f.totalWeight || null,
    status: f.status || 'disponible',
    insuranceExpiry: f.insuranceExpiry || null,
    vignetteExpiry: f.vignetteExpiry || null,
    visitExpiry: f.visitExpiry || null,
    authExpiry: f.authExpiry || null,
    groupe: f.groupe || null,
    workPassport: f.workPassport || null,
  };
}

export function EnginFormFields({
  form,
  setForm,
}: {
  form: EnginFormData;
  setForm: (f: EnginFormData) => void;
}) {
  const { t } = useI18n();
  const isLoue = form.ownershipType === 'loue';

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        label={t('fields.ownership')}
        value={form.ownershipType}
        onChange={(e) => {
          const ownershipType = normalizeOwnershipType(e.target.value);
          setForm({
            ...form,
            ownershipType,
            rentalSupplier: ownershipType === 'personnel' ? '' : form.rentalSupplier,
            rentalMonthly: ownershipType === 'personnel' ? '' : form.rentalMonthly,
            purchasePrice: ownershipType === 'loue' ? '' : form.purchasePrice,
          });
        }}
      >
        <option value="personnel">{t('fields.ownershipPersonal')}</option>
        <option value="loue">{t('fields.ownershipRented')}</option>
      </Select>
      {isLoue ? (
        <>
          <Input
            label={t('fields.rentalSupplier')}
            value={form.rentalSupplier}
            onChange={(e) => setForm({ ...form, rentalSupplier: e.target.value })}
          />
          <Input
            label={t('fields.rentalMonthlyCost')}
            type="number"
            value={form.rentalMonthly}
            onChange={(e) => setForm({ ...form, rentalMonthly: e.target.value })}
          />
        </>
      ) : (
        <Input
          label={t('fields.purchasePriceMad')}
          type="number"
          value={form.purchasePrice}
          onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
        />
      )}
      <Input label={t('fields.brand')} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
      <Input label={t('fields.genreType')} value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} />
      <Input label={t('fields.group')} value={form.groupe} onChange={(e) => setForm({ ...form, groupe: e.target.value })} />
      <Input label={t('fields.workPassport')} value={form.workPassport} onChange={(e) => setForm({ ...form, workPassport: e.target.value })} />
      <Input label={t('fields.matricule')} value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} />
      <Input label={t('fields.chassisNo')} value={form.chassisNo} onChange={(e) => setForm({ ...form, chassisNo: e.target.value })} />
      <Input label={t('fields.gpsNo')} value={form.gpsNumber} onChange={(e) => setForm({ ...form, gpsNumber: e.target.value })} />
      <Input label={t('fields.gsmNo')} value={form.gsmNumber} onChange={(e) => setForm({ ...form, gsmNumber: e.target.value })} />
      <Input label={t('fields.gpsMountDate')} type="date" value={form.gpsMountDate} onChange={(e) => setForm({ ...form, gpsMountDate: e.target.value })} />
      <Input label={t('fields.transferDate')} type="date" value={form.transferDate} onChange={(e) => setForm({ ...form, transferDate: e.target.value })} />
      <Input label={t('fields.counter')} type="number" value={form.counterValue} onChange={(e) => setForm({ ...form, counterValue: e.target.value })} />
      <Select label={t('fields.counterUnit')} value={form.counterUnit} onChange={(e) => setForm({ ...form, counterUnit: e.target.value })}>
        <option value="KM">KM</option>
        <option value="Hr">{t('fields.hours')}</option>
      </Select>
      <Input label={t('fields.counterDate')} type="date" value={form.counterDate} onChange={(e) => setForm({ ...form, counterDate: e.target.value })} />
      <Input label={t('fields.fuelPercent')} type="number" min="0" max="100" value={form.fuelLevel} onChange={(e) => setForm({ ...form, fuelLevel: e.target.value })} />
      <Select label={t('fields.status')} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
        <option value="disponible">{t('status.available')}</option>
        <option value="en_mission">{t('fields.onMission')}</option>
        <option value="en_maintenance">{t('fields.inMaintenance')}</option>
      </Select>
      <Input label={t('fields.emptyWeightKg')} type="number" value={form.emptyWeight} onChange={(e) => setForm({ ...form, emptyWeight: e.target.value })} />
      <Input label={t('fields.ptacKg')} type="number" value={form.totalWeight} onChange={(e) => setForm({ ...form, totalWeight: e.target.value })} />
      <Input label={t('fields.insuranceExpiry')} type="date" value={form.insuranceExpiry} onChange={(e) => setForm({ ...form, insuranceExpiry: e.target.value })} />
      <Input label={t('fields.vignetteExpiry')} type="date" value={form.vignetteExpiry} onChange={(e) => setForm({ ...form, vignetteExpiry: e.target.value })} />
      <Input label={t('fields.visitExpiry')} type="date" value={form.visitExpiry} onChange={(e) => setForm({ ...form, visitExpiry: e.target.value })} />
      <Input label={t('fields.authExpiry')} type="date" value={form.authExpiry} onChange={(e) => setForm({ ...form, authExpiry: e.target.value })} />
    </div>
  );
}
