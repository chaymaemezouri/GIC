import { useI18n } from '../i18n/I18nContext';
import { MAROC_BANKS } from '../lib/marocBanks';
import { clampRib } from '../lib/rib';
import { FormPhotoField, emptyPhotoFields, photoFieldsFrom } from './FormPhotoField';
import { Input, Select, Textarea } from './ui';

export type MandantFormData = {
  firstName: string;
  lastName: string;
  identityType: string;
  identityNumber: string;
  birthDate: string;
  email: string;
  phone1: string;
  phone2: string;
  address: string;
  bankName: string;
  rib: string;
  remark: string;
  photoFile: File | null;
  photoUrl: string;
};

export function emptyMandantForm(): MandantFormData {
  return {
    firstName: '',
    lastName: '',
    identityType: 'CIN',
    identityNumber: '',
    birthDate: '',
    email: '',
    phone1: '',
    phone2: '',
    address: '',
    bankName: '',
    rib: '',
    remark: '',
    ...emptyPhotoFields(),
  };
}

export function mandantToForm(m: Record<string, unknown>): MandantFormData {
  return {
    firstName: String(m.firstName || ''),
    lastName: String(m.lastName || ''),
    identityType: String(m.identityType || 'CIN'),
    identityNumber: String(m.identityNumber || ''),
    birthDate: m.birthDate ? String(m.birthDate).slice(0, 10) : '',
    email: String(m.email || ''),
    phone1: String(m.phone1 || ''),
    phone2: String(m.phone2 || ''),
    address: String(m.address || ''),
    bankName: String(m.bankName || ''),
    rib: clampRib(String(m.rib || '')),
    remark: String(m.remark || ''),
    ...photoFieldsFrom(m as { photo?: string | null }),
  };
}

export function MandantFormFields({
  form,
  setForm,
  identityTypes,
}: {
  form: MandantFormData;
  setForm: (f: MandantFormData) => void;
  identityTypes: string[];
}) {
  const { t } = useI18n();
  const types = identityTypes.length ? identityTypes : ['CIN', 'Passeport', 'Carte de séjour', 'Autre'];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormPhotoField file={form.photoFile} photoUrl={form.photoUrl} onFile={(photoFile) => setForm({ ...form, photoFile })} />
      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide">{t('fields.sectionIdentity')}</p>
      <Input label={`${t('fields.firstName')} *`} required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
      <Input label={`${t('fields.lastName')} *`} required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
      <Select label={t('fields.identityType')} value={form.identityType} onChange={(e) => setForm({ ...form, identityType: e.target.value })}>
        {types.map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
      </Select>
      <Input label={`${t('fields.identityPieceNumber')} *`} required value={form.identityNumber} onChange={(e) => setForm({ ...form, identityNumber: e.target.value })} />
      <Input label={t('fields.birthDate')} type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />

      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide pt-1">{t('fields.sectionContact')}</p>
      <Input label={t('fields.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <Input label={`${t('fields.phonePrimary')} *`} required value={form.phone1} onChange={(e) => setForm({ ...form, phone1: e.target.value })} />
      <Input label={t('fields.phoneSecondary')} value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} />
      <Input className="sm:col-span-2" label={t('fields.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      <Select label={t('fields.bank')} value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })}>
        <option value="">{t('fields.chooseBank')}</option>
        {MAROC_BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
        {form.bankName && !(MAROC_BANKS as readonly string[]).includes(form.bankName) && <option value={form.bankName}>{form.bankName}</option>}
      </Select>
      <Input label={t('fields.rib')} value={form.rib} inputMode="numeric" placeholder={t('fields.ribDigitsPlaceholder')} onChange={(e) => setForm({ ...form, rib: clampRib(e.target.value) })} />
      <Textarea
        className="sm:col-span-2"
        label={t('fields.remark')}
        rows={3}
        value={form.remark}
        onChange={(e) => setForm({ ...form, remark: e.target.value })}
        placeholder={t('fields.mandantNotesPlaceholder')}
      />
    </div>
  );
}
