import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Btn, Input, Modal, Select } from './ui';

/** Vrai si début et fin sont renseignés et que début n'est pas strictement avant fin. */
export function chantierDateError(start: string, end: string) {
  return !!start && !!end && start >= end;
}

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
  const { user } = useAuth();
  const canCreateChef = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const [createdChefs, setCreatedChefs] = useState<ChefOption[]>([]);
  const [chefOpen, setChefOpen] = useState(false);
  const [chefForm, setChefForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [chefError, setChefError] = useState('');
  const [chefSaving, setChefSaving] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<{ email: string; password: string } | null>(null);
  const allChefs = [...chefs, ...createdChefs.filter((c) => !chefs.some((x) => x.id === c.id))];
  const dateError = chantierDateError(form.startDate, form.endDate) ? t('inline.dateOrderError') : '';

  async function saveChef(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setChefError('');
    setChefSaving(true);
    try {
      const chef = await api<ChefOption & { generatedPassword?: string | null }>('/chantiers/chefs', {
        method: 'POST',
        body: JSON.stringify(chefForm),
      });
      setCreatedChefs((prev) => [...prev, chef]);
      setForm({ ...form, managerUserId: chef.id, managerName: `${chef.firstName} ${chef.lastName}` });
      setChefOpen(false);
      if (chef.generatedPassword) {
        setGeneratedPassword({ email: chef.email || '', password: chef.generatedPassword });
      }
    } catch (err) {
      setChefError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setChefSaving(false);
    }
  }

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
      <Input
        label={t('fields.endDatePlanned')}
        type="date"
        min={form.startDate || undefined}
        value={form.endDate}
        onChange={(e) => setForm({ ...form, endDate: e.target.value })}
      />
      {dateError && <p className="sm:col-span-2 -mt-1 text-[11px] text-gic-coral">{dateError}</p>}
      <Input label={t('fields.budgetPurchases')} type="number" min="0" step="0.01" value={form.budgetAchats} onChange={(e) => setForm({ ...form, budgetAchats: e.target.value })} placeholder={t('fields.budgetMaterialsPlaceholder')} />
      <Input label={t('fields.workerCount')} type="number" min="0" value={form.workerCount} onChange={(e) => setForm({ ...form, workerCount: e.target.value })} />
      <div className="flex items-end gap-2">
        <Select
          className="flex-1"
          label={t('fields.siteManagerAccount')}
          value={form.managerUserId}
          onChange={(e) => {
            const id = e.target.value;
            const chef = allChefs.find((c) => c.id === id);
            setForm({
              ...form,
              managerUserId: id,
              managerName: chef ? `${chef.firstName} ${chef.lastName}` : form.managerName,
            });
          }}
        >
          <option value="">{t('fields.notLinked')}</option>
          {allChefs.map((c) => (
            <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
          ))}
        </Select>
        {canCreateChef && (
          <Btn
            type="button"
            variant="secondary"
            title={t('inline.newChef')}
            onClick={() => {
              setChefForm({ firstName: '', lastName: '', email: '', password: '' });
              setChefError('');
              setChefOpen(true);
            }}
          >
            <UserPlus size={14} />
          </Btn>
        )}
      </div>
      <Modal
        open={chefOpen}
        title={t('inline.newChef')}
        onClose={() => setChefOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setChefOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="inline-chef-form" type="submit" disabled={chefSaving}>
              {chefSaving ? t('inline.saving') : t('inline.createAndSelect')}
            </Btn>
          </>
        }
      >
        <form id="inline-chef-form" onSubmit={saveChef} className="grid gap-3 sm:grid-cols-2">
          <Input
            label={`${t('fields.firstName')} *`}
            required
            autoFocus
            value={chefForm.firstName}
            onChange={(e) => setChefForm({ ...chefForm, firstName: e.target.value })}
          />
          <Input
            label={`${t('fields.lastName')} *`}
            required
            value={chefForm.lastName}
            onChange={(e) => setChefForm({ ...chefForm, lastName: e.target.value })}
          />
          <Input
            className="sm:col-span-2"
            label={`${t('fields.email')} *`}
            type="email"
            required
            value={chefForm.email}
            onChange={(e) => setChefForm({ ...chefForm, email: e.target.value })}
          />
          <Input
            className="sm:col-span-2"
            label={t('inline.chefPassword')}
            type="text"
            minLength={6}
            value={chefForm.password}
            placeholder={t('inline.chefPasswordHint')}
            onChange={(e) => setChefForm({ ...chefForm, password: e.target.value })}
          />
          {chefError && <p className="sm:col-span-2 text-[11px] text-gic-coral">{chefError}</p>}
        </form>
      </Modal>
      <Modal
        open={!!generatedPassword}
        title={t('inline.chefCreated')}
        onClose={() => setGeneratedPassword(null)}
        footer={<Btn onClick={() => setGeneratedPassword(null)}>{t('common.close')}</Btn>}
      >
        <p className="text-[12px] text-gic-ink mb-2">{t('inline.chefCreatedHint')}</p>
        <p className="font-mono text-[13px] rounded-md bg-black/[0.04] px-3 py-2 select-all">
          {generatedPassword?.email} — {generatedPassword?.password}
        </p>
      </Modal>
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
