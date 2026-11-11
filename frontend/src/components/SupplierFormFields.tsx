import { useI18n } from '../i18n/I18nContext';
import { clampRib } from '../lib/rib';
import { Input, Select } from './ui';

export type SupplierFormData = {
  companyName: string;
  contactName: string;
  phone1: string;
  phone2: string;
  email: string;
  cin: string;
  ice: string;
  source: string;
  address: string;
  bankName: string;
  rib: string;
  remark: string;
  isActive: string;
};

export function emptySupplierForm(): SupplierFormData {
  return {
    companyName: '',
    contactName: '',
    phone1: '',
    phone2: '',
    email: '',
    cin: '',
    ice: '',
    source: '',
    address: '',
    bankName: '',
    rib: '',
    remark: '',
    isActive: 'true',
  };
}

export function supplierToForm(s: Record<string, unknown>): SupplierFormData {
  return {
    companyName: String(s.companyName || ''),
    contactName: String(s.contactName || ''),
    phone1: String(s.phone1 || ''),
    phone2: String(s.phone2 || ''),
    email: String(s.email || ''),
    cin: String(s.cin || ''),
    ice: String(s.ice || ''),
    source: String(s.source || ''),
    address: String(s.address || ''),
    bankName: String(s.bankName || ''),
    rib: clampRib(String(s.rib || '')),
    remark: String(s.remark || ''),
    isActive: s.isActive === false ? 'false' : 'true',
  };
}

export function SupplierFormFields({
  form,
  setForm,
  sourceOptions = [],
}: {
  form: SupplierFormData;
  setForm: (f: SupplierFormData) => void;
  sourceOptions?: string[];
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide">{t('fields.sectionIdentity')}</p>
      <Input className="sm:col-span-2" label={`${t('fields.companyName')} *`} required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
      <Input label={t('fields.contactPerson')} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
      <Input label={`${t('fields.cin')} *`} required value={form.cin} onChange={(e) => setForm({ ...form, cin: e.target.value })} />
      <Input label={t('fields.ice')} value={form.ice} onChange={(e) => setForm({ ...form, ice: e.target.value })} />
      <Input label={t('fields.source')} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder={t('fields.supplierSourcePlaceholder')} list="supplier-source-list" />
      {sourceOptions.length > 0 && (
        <datalist id="supplier-source-list">
          {sourceOptions.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
      <Select label={t('fields.status')} value={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.value })}>
        <option value="true">{t('status.active')}</option>
        <option value="false">{t('status.inactive')}</option>
      </Select>

      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide pt-1">{t('fields.sectionContact')}</p>
      <Input label={`${t('fields.phone1')} *`} required value={form.phone1} onChange={(e) => setForm({ ...form, phone1: e.target.value })} />
      <Input label={t('fields.phone2')} value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} />
      <Input label={t('fields.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <Input className="sm:col-span-2" label={t('fields.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />

      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide pt-1">{t('fields.sectionBank')}</p>
      <Input label={t('fields.bank')} value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
      <Input label={t('fields.rib')} value={form.rib} inputMode="numeric" placeholder={t('fields.ribDigitsPlaceholder')} onChange={(e) => setForm({ ...form, rib: clampRib(e.target.value) })} />

      <Input className="sm:col-span-2" label={t('fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
    </div>
  );
}
