import { useI18n } from '../i18n/I18nContext';
import { Input, Textarea } from './ui';

export type AgentFormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone1: string;
  phone2: string;
  address: string;
  remark: string;
  isActive: boolean;
};

export function emptyAgentForm(): AgentFormData {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone1: '',
    phone2: '',
    address: '',
    remark: '',
    isActive: true,
  };
}

export function agentToForm(a: Record<string, unknown>): AgentFormData {
  return {
    firstName: String(a.firstName || ''),
    lastName: String(a.lastName || ''),
    email: String(a.email || ''),
    phone1: String(a.phone1 || ''),
    phone2: String(a.phone2 || ''),
    address: String(a.address || ''),
    remark: String(a.remark || ''),
    isActive: a.isActive !== false,
  };
}

export function AgentFormFields({
  form,
  setForm,
}: {
  form: AgentFormData;
  setForm: (f: AgentFormData) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide">{t('fields.sectionIdentity')}</p>
      <Input label={`${t('fields.firstName')} *`} required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
      <Input label={`${t('fields.lastName')} *`} required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />

      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide pt-1">{t('fields.sectionContact')}</p>
      <Input label={t('fields.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
        <span>{t('fields.agentActive')}</span>
      </label>

      <Textarea
        className="sm:col-span-2"
        label={t('fields.remark')}
        rows={3}
        value={form.remark}
        onChange={(e) => setForm({ ...form, remark: e.target.value })}
        placeholder={t('fields.agentNotesPlaceholder')}
      />
    </div>
  );
}
