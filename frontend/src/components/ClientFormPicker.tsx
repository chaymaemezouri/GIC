import { useEffect, useState } from 'react';
import { UserRound, X } from 'lucide-react';
import { fetchClientList } from '../lib/api';
import { Btn, Modal } from './ui';
import { ClientPickerPanel, type ClientPickerOption } from './ClientLinkPicker';
import { useI18n } from '../i18n/I18nContext';

function labelClient(c: { firstName: string; lastName: string; reference?: string }) {
  return `${c.firstName} ${c.lastName}${c.reference ? ` (${c.reference})` : ''}`;
}

export function ClientFormPicker({
  value,
  onChange,
  label,
  required = false,
}: {
  value: string;
  onChange: (clientId: string) => void;
  label?: string;
  required?: boolean;
}) {
  const { t } = useI18n();
  const resolvedLabel = label ?? `${t('fields.client')} *`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<ClientPickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');

  useEffect(() => {
    if (!value) {
      setSelectedLabel('');
      return;
    }
    fetchClientList<{ id: string; firstName: string; lastName: string; reference: string }>({ limit: 500, sort: 'lastName' })
      .then((list) => {
        const c = list.find((x) => x.id === value);
        setSelectedLabel(c ? labelClient(c) : value);
      })
      .catch(() => setSelectedLabel(value));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchClientList<ClientPickerOption>({ limit: 500, sort: 'lastName' })
      .then(setClients)
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }, [open]);

  function handleClose() {
    setOpen(false);
    setQuery('');
  }

  function handleSelect(id: string) {
    onChange(id);
    const c = clients.find((x) => x.id === id);
    if (c) setSelectedLabel(`${c.firstName} ${c.lastName} (${c.reference || ''})`);
    handleClose();
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
          {value ? t('common.change') : t('fields.selectClient')}
        </Btn>
      </div>

      <Modal
        open={open}
        size="lg"
        title={t('fields.selectClient')}
        onClose={handleClose}
        footer={
          <>
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
    </div>
  );
}
