import { useEffect, useState } from 'react';
import { UserPlus, UserRound, X } from 'lucide-react';
import { api, fetchAgentList, fetchClientList } from '../lib/api';
import { Btn, Modal } from './ui';
import { ClientPickerPanel, type ClientPickerOption } from './ClientLinkPicker';
import { ClientFormFields, emptyClientForm, type ClientFormData } from './ClientFormFields';
import { useI18n } from '../i18n/I18nContext';

function labelClient(c: { firstName: string; lastName: string; reference?: string }) {
  return `${c.firstName} ${c.lastName}${c.reference ? ` (${c.reference})` : ''}`;
}

export function ClientFormPicker({
  value,
  onChange,
  label,
  required = false,
  allowCreate = true,
}: {
  value: string;
  onChange: (clientId: string) => void;
  label?: string;
  required?: boolean;
  allowCreate?: boolean;
}) {
  const { t } = useI18n();
  const resolvedLabel = label ?? `${t('fields.client')} *`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<ClientPickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ClientFormData>(emptyClientForm());
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [agents, setAgents] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [identityTypes, setIdentityTypes] = useState<string[]>([]);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);

  useEffect(() => {
    if (!value) {
      setSelectedLabel('');
      return;
    }
    fetchClientList<{ id: string; firstName: string; lastName: string; reference: string }>({ limit: 500, sort: 'lastName' })
      .then((list) => {
        const c = list.find((x) => x.id === value);
        setSelectedLabel((prev) => (c ? labelClient(c) : prev || value));
      })
      .catch(() => setSelectedLabel((prev) => prev || value));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchClientList<ClientPickerOption>({ limit: 500, sort: 'lastName' })
      .then(setClients)
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!createOpen) return;
    fetchAgentList<{ id: string; firstName: string; lastName: string }>({ active: 'true', limit: 500 })
      .then(setAgents)
      .catch(() => setAgents([]));
    api<{ value: string }[]>('/dropdowns/identity_type')
      .then((d) => setIdentityTypes(d.map((x) => x.value)))
      .catch(() => {});
    api<{ value: string }[]>('/dropdowns/client_source')
      .then((d) => setSourceOptions(d.map((x) => x.value)))
      .catch(() => {});
  }, [createOpen]);

  function handleClose() {
    setOpen(false);
    setQuery('');
  }

  function handleSelect(id: string) {
    onChange(id);
    const c = clients.find((x) => x.id === id);
    if (c) setSelectedLabel(labelClient(c));
    handleClose();
  }

  function openCreate() {
    setCreateForm(emptyClientForm());
    setCreateError('');
    setOpen(false);
    setCreateOpen(true);
  }

  async function saveNewClient(e: React.FormEvent) {
    // La modale est rendue en portail : sans stopPropagation, le submit remonte au formulaire parent.
    e.preventDefault();
    e.stopPropagation();
    setCreateError('');
    setCreating(true);
    try {
      const created = await api<{ id: string; firstName: string; lastName: string; reference?: string }>('/clients', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      setSelectedLabel(labelClient(created));
      onChange(created.id);
      setCreateOpen(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <label className="block text-[11px] font-medium text-gic-muted mb-1">
        {resolvedLabel}{required && !resolvedLabel.includes('*') ? ' *' : ''}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {value ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gic-violet-soft text-gic-violet px-3 py-1.5 text-[12px] font-medium">
            <UserRound size={13} />
            <span className="truncate max-w-[240px]">{selectedLabel || t('fields.selectedClient')}</span>
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-white/60"
              onClick={() => onChange('')}
              title={t('common.remove')}
            >
              <X size={12} />
            </button>
          </span>
        ) : (
          <span className="text-[12px] text-gic-muted">{t('fields.noClientSelected')}</span>
        )}
        <Btn type="button" variant="secondary" onClick={() => setOpen(true)}>
          {value ? t('common.change') : t('inline.selectExistingClient')}
        </Btn>
        {allowCreate && (
          <Btn type="button" variant="secondary" onClick={openCreate}>
            <UserPlus size={14} className="inline mr-1" />
            {t('inline.newClient')}
          </Btn>
        )}
      </div>

      <Modal
        open={open}
        size="lg"
        title={t('fields.selectClient')}
        onClose={handleClose}
        footer={
          <>
            {allowCreate && (
              <Btn variant="secondary" onClick={openCreate} className="mr-auto">
                <UserPlus size={14} className="inline mr-1" />
                {t('inline.newClient')}
              </Btn>
            )}
            <Btn variant="secondary" onClick={handleClose}>{t('common.close')}</Btn>
            <Btn onClick={handleClose} disabled={!value}>{t('common.confirm')}</Btn>
          </>
        }
      >
        <ClientPickerPanel
          open={open}
          excludeIds={[]}
          selectedId={value}
          onSelect={handleSelect}
          query={query}
          onQueryChange={setQuery}
          clients={clients}
          loading={loading}
        />
      </Modal>

      <Modal
        open={createOpen}
        size="lg"
        title={t('actions.newClient')}
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="inline-client-form" type="submit" disabled={creating}>
              {creating ? t('inline.saving') : t('inline.createAndSelect')}
            </Btn>
          </>
        }
      >
        <form id="inline-client-form" onSubmit={saveNewClient}>
          <ClientFormFields
            form={createForm}
            setForm={setCreateForm}
            agents={agents}
            identityTypes={identityTypes}
            sourceOptions={sourceOptions}
          />
          {createError && <p className="mt-3 text-[11px] text-gic-coral">{createError}</p>}
        </form>
      </Modal>
    </div>
  );
}
