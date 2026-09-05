import { useI18n } from '../i18n/I18nContext';
import { Input, Select } from './ui';

export type ChantierFormData = {
  name: string;
  address: string;
  startDate: string;
  endDate: string;
  managerName: string;
  managerUserId: string;
  workerCount: string;
  remark: string;
  status: string;
  projectId: string;
  budgetAchats: string;
};

export type ProjectOption = { id: string; name: string; city?: string | null; status?: string };
export type ChefOption = { id: string; firstName: string; lastName: string; email?: string };

export function emptyChantierForm(): ChantierFormData {
  return {
    name: '',
    address: '',
    startDate: '',
    endDate: '',
    managerName: '',
    managerUserId: '',
    workerCount: '0',
    remark: '',
    status: 'actif',
    projectId: '',
    budgetAchats: '',
  };
}

export function chantierToForm(c: Record<string, unknown>): ChantierFormData {
  const project = c.project as { id?: string } | undefined;
  return {
    name: String(c.name || ''),
    address: String(c.address || ''),
    startDate: c.startDate ? String(c.startDate).slice(0, 10) : '',
    endDate: c.endDate ? String(c.endDate).slice(0, 10) : '',
    managerName: String(c.managerName || ''),
    managerUserId: String(c.managerUserId || ''),
    workerCount: String(c.workerCount ?? '0'),
    remark: String(c.remark || ''),
    status: String(c.status || 'actif'),
    projectId: String(c.projectId || project?.id || ''),
    budgetAchats: c.budgetAchats != null ? String(c.budgetAchats) : '',
  };
}

export function ChantierFormFields({
  form,
  setForm,
  projects = [],
  chefs = [],
}: {
  form: ChantierFormData;
  setForm: (f: ChantierFormData) => void;
  projects?: ProjectOption[];
  chefs?: ChefOption[];
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input className="sm:col-span-2" label={`${t('fields.chantierName')} *`} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input className="sm:col-span-2" label={t('fields.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      <Select
        className="sm:col-span-2"
        label={t('fields.linkedRealEstateProject')}
        value={form.projectId}
        onChange={(e) => setForm({ ...form, projectId: e.target.value })}
      >
        <option value="">{t('fields.noProject')}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}{p.city ? ` · ${p.city}` : ''}
          </option>
        ))}
      </Select>
      <Input label={t('fields.startDate')} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
      <Input label={t('fields.endDatePlanned')} type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
      <Input label={t('fields.budgetPurchases')} type="number" min="0" step="0.01" value={form.budgetAchats} onChange={(e) => setForm({ ...form, budgetAchats: e.target.value })} placeholder={t('fields.budgetMaterialsPlaceholder')} />
      <Input label={t('fields.workerCount')} type="number" min="0" value={form.workerCount} onChange={(e) => setForm({ ...form, workerCount: e.target.value })} />
      {chefs.length > 0 ? (
        <Select
          label={t('fields.siteManagerAccount')}
          value={form.managerUserId}
          onChange={(e) => {
            const id = e.target.value;
            const chef = chefs.find((c) => c.id === id);
            setForm({
              ...form,
              managerUserId: id,
              managerName: chef ? `${chef.firstName} ${chef.lastName}` : form.managerName,
            });
          }}
        >
          <option value="">{t('fields.notLinked')}</option>
          {chefs.map((c) => (
            <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
          ))}
        </Select>
      ) : null}
      <Input label={t('fields.siteManagerName')} value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} />
      <Select label={t('fields.status')} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
        <option value="actif">{t('fields.statusActiveBuilding')}</option>
        <option value="suspendu">{t('fields.statusSuspended')}</option>
        <option value="termine">{t('fields.statusFinished')}</option>
      </Select>
      <Input className="sm:col-span-2" label={t('fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
    </div>
  );
}
