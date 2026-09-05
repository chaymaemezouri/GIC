import { useI18n } from '../i18n/I18nContext';
import { Input, Textarea } from './ui';

export type ReconnuFormData = {
  firstName: string;
  lastName: string;
  phone1: string;
  phone2: string;
  address: string;
  relation: string;
  remark: string;
  isActive: boolean;
};

export function emptyReconnuForm(): ReconnuFormData {
  return {
    firstName: '',
    lastName: '',
    phone1: '',
    phone2: '',
    address: '',
    relation: '',
    remark: '',
    isActive: true,
  };
}

export function reconnuToForm(r: Record<string, unknown>): ReconnuFormData {
  return {
    firstName: String(r.firstName || ''),
    lastName: String(r.lastName || ''),
    phone1: String(r.phone1 || ''),
    phone2: String(r.phone2 || ''),
    address: String(r.address || ''),
    relation: String(r.relation || ''),
    remark: String(r.remark || ''),
    isActive: r.isActive !== false,
  };
}

export function ReconnuFormFields({
  form,
  setForm,
}: {
  form: ReconnuFormData;
  setForm: (f: ReconnuFormData) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide">{t('fields.sectionIdentity')}</p>
      <Input label={`${t('fields.firstName')} *`} required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
      <Input label={`${t('fields.lastName')} *`} required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
      <Input
        className="sm:col-span-2"
        label={t('fields.relationRole')}
        value={form.relation}
        onChange={(e) => setForm({ ...form, relation: e.target.value })}
        placeholder={t('fields.relationPlaceholder')}
      />

      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide pt-1">{t('fields.sectionContact')}</p>
      <Input label={t('fields.phonePrimary')} value={form.phone1} onChange={(e) => setForm({ ...form, phone1: e.target.value })} />
      <Input label={t('fields.phoneSecondary')} value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} />
      <Input className="sm:col-span-2" label={t('fields.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />

      <label className="sm:col-span-2 flex items-center gap-2 text-[12px] cursor-pointer">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          className="rounded border-gic-border"
        />
        <span>{t('fields.recognizedActive')}</span>
      </label>

      <Textarea
        className="sm:col-span-2"
        label={t('fields.remark')}
        rows={3}
        value={form.remark}
        onChange={(e) => setForm({ ...form, remark: e.target.value })}
        placeholder={t('fields.notesPlaceholder')}
      />
    </div>
  );
}
