import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { fetchClientList } from '../lib/api';
import { useI18n } from '../i18n/I18nContext';
import { Btn, Modal } from './ui';
import { clientToPickerItem, EntityPickerPanel } from './EntityPickerPanel';

export type ClientPickerOption = {
  id: string;
  reference?: string;
  photo?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone1?: string;
  identityNumber?: string;
  isProspect?: boolean;
  isBuyer?: boolean;
  isTenant?: boolean;
};

export function ClientPickerPanel({
  excludeIds,
  selectedId,
  onSelect,
  query,
  onQueryChange,
  clients,
  loading,
  open,
  allAssignedMessage,
}: {
  excludeIds: string[];
  selectedId: string;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  clients: ClientPickerOption[];
  loading: boolean;
  open: boolean;
  allAssignedMessage?: string;
}) {
  const { t } = useI18n();
  const availableCount = clients.filter((c) => !excludeIds.includes(c.id)).length;
  const filteredSuffix = query.trim() ? ` ${t('common.filteredParen')}` : '';
  return (
    <EntityPickerPanel
      items={clients.map(clientToPickerItem)}
      excludeIds={excludeIds}
      selectedId={selectedId || null}
      onSelect={onSelect}
      query={query}
      onQueryChange={onQueryChange}
      loading={loading}
      open={open}
      searchPlaceholder={t('fields.filterNameRefEmailCin')}
      emptyMessage={
        availableCount === 0
          ? (allAssignedMessage ?? t('msg.allClientsLinked'))
          : t('msg.noClientMatch')
      }
      countLabel={(n) => `${t('msg.clientsAvailableCount', { count: n })}${filteredSuffix}`}
      ariaLabel={t('msg.clientsAvailableAria')}
    />
  );
}

export function ClientLinkPicker({
  excludeIds = [],
  onLink,
  buttonLabel,
  modalTitle,
  confirmLabel,
  allAssignedMessage,
}: {
  excludeIds?: string[];
  onLink: (clientId: string) => Promise<void>;
  buttonLabel?: string;
  modalTitle?: string;
  confirmLabel?: string;
  allAssignedMessage?: string;
}) {
  const { t } = useI18n();
  const resolvedButton = buttonLabel ?? t('actions.linkClient');
  const resolvedTitle = modalTitle ?? t('actions.linkClient');
  const resolvedConfirm = confirmLabel ?? t('common.link');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<ClientPickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [linking, setLinking] = useState(false);

  function reset() {
    setQuery('');
    setSelectedId('');
  }

  function handleClose() {
    setOpen(false);
    reset();
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchClientList<ClientPickerOption>({ limit: 500, sort: 'lastName' })
      .then(setClients)
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }, [open]);

  async function handleLink() {
    if (!selectedId) return;
    setLinking(true);
    try {
      await onLink(selectedId);
      handleClose();
    } finally {
      setLinking(false);
    }
  }

  return (
    <>
      <Btn icon={Plus} onClick={() => setOpen(true)}>{resolvedButton}</Btn>

      <Modal
        open={open}
        size="lg"
        title={resolvedTitle}
        onClose={handleClose}
        footer={
          <>
            <Btn variant="secondary" onClick={handleClose}>{t('common.cancel')}</Btn>
            <Btn icon={Plus} onClick={handleLink} disabled={!selectedId || linking}>
              {linking ? t('common.inProgress') : resolvedConfirm}
            </Btn>
          </>
        }
      >
        <ClientPickerPanel
          open={open}
          excludeIds={excludeIds}
          selectedId={selectedId}
          onSelect={setSelectedId}
          query={query}
          onQueryChange={setQuery}
          clients={clients}
          loading={loading}
          allAssignedMessage={allAssignedMessage}
        />
      </Modal>
    </>
  );
}
