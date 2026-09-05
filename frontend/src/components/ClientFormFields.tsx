import { useI18n } from '../i18n/I18nContext';
import { Input, Select } from './ui';

export type ClientFormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone1: string;
  phone2: string;
  address: string;
  identityType: string;
  identityNumber: string;
  birthDate: string;
  isProspect: boolean;
  isBuyer: boolean;
  isTenant: boolean;
  agentId: string;
  source: string;
  remark: string;
  nb: string;
};

export const emptyClientForm = (): ClientFormData => ({
  firstName: '',
  lastName: '',
  email: '',
  phone1: '',
  phone2: '',
  address: '',
  identityType: 'CIN',
  identityNumber: '',
  birthDate: '',
  isProspect: true,
  isBuyer: false,
  isTenant: false,
  agentId: '',
  source: '',
  remark: '',
  nb: '',
});

export function clientToForm(c: Partial<ClientFormData> & Record<string, unknown>): ClientFormData {
  return {
    firstName: String(c.firstName || ''),
    lastName: String(c.lastName || ''),
    email: String(c.email || ''),
    phone1: String(c.phone1 || ''),
    phone2: String(c.phone2 || ''),
    address: String(c.address || ''),
    identityType: String(c.identityType || 'CIN'),
    identityNumber: String(c.identityNumber || ''),
    birthDate: c.birthDate ? String(c.birthDate).slice(0, 10) : '',
    isProspect: Boolean(c.isProspect),
    isBuyer: Boolean(c.isBuyer),
    isTenant: Boolean(c.isTenant),
    agentId: String(c.agentId || ''),
    source: String(c.source || ''),
    remark: String(c.remark || ''),
    nb: String(c.nb || ''),
  };
}

type Agent = { id: string; firstName: string; lastName: string };

export function ClientFormFields({
  form,
  setForm,
  agents,
  identityTypes,
  sourceOptions = [],
}: {
  form: ClientFormData;
  setForm: (f: ClientFormData) => void;
  agents: Agent[];
  identityTypes: string[];
  sourceOptions?: string[];
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide">{t('fields.sectionIdentity')}</p>
      <Input label={`${t('fields.firstName')} *`} required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
      <Input label={`${t('fields.lastName')} *`} required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
      <Select label={t('fields.identityType')} value={form.identityType} onChange={(e) => setForm({ ...form, identityType: e.target.value })}>
        {(identityTypes.length ? identityTypes : ['CIN', 'Passeport', 'Carte de séjour', 'Autre']).map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
      </Select>
      <Input label={t('fields.identityPieceNumber')} value={form.identityNumber} onChange={(e) => setForm({ ...form, identityNumber: e.target.value })} />
      <Input label={t('fields.birthDate')} type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
      <Input label={t('fields.nb')} value={form.nb} onChange={(e) => setForm({ ...form, nb: e.target.value })} placeholder={t('fields.nbPlaceholder')} />

      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide mt-1">{t('fields.sectionContact')}</p>
      <Input label={`${t('fields.email')} *`} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <Input label={`${t('fields.phone1')} *`} required value={form.phone1} onChange={(e) => setForm({ ...form, phone1: e.target.value })} />
      <Input label={t('fields.phone2')} value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} />
      <Input className="sm:col-span-2" label={t('fields.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />

      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide mt-1">{t('fields.sectionClassification')}</p>
      <label className="flex items-center gap-2 text-[12px]">
        <input type="checkbox" checked={form.isProspect} onChange={(e) => setForm({ ...form, isProspect: e.target.checked })} />
        {t('fields.prospect')}
      </label>
      <label className="flex items-center gap-2 text-[12px]">
        <input type="checkbox" checked={form.isBuyer} onChange={(e) => setForm({ ...form, isBuyer: e.target.checked })} />
        {t('fields.buyer')}
      </label>
      <label className="flex items-center gap-2 text-[12px]">
        <input type="checkbox" checked={form.isTenant} onChange={(e) => setForm({ ...form, isTenant: e.target.checked })} />
        {t('fields.tenant')}
      </label>
      <Select label={t('fields.associatedAgent')} value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })}>
        <option value="">{t('fields.noneOption')}</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
        ))}
      </Select>

      <Select label={t('fields.source')} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
        <option value="">{t('fields.noneSource')}</option>
        {(sourceOptions.length ? sourceOptions : ['Recommandation', 'Site web', 'Salon immobilier', 'Agent commercial', 'Réseaux sociaux']).map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </Select>

      <Input className="sm:col-span-2" label={t('fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
    </div>
  );
}
