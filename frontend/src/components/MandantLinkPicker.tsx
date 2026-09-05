import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { fetchMandantList } from '../lib/api';
import { Btn, Modal } from './ui';
import { EntityPickerPanel, mandantToPickerItem } from './EntityPickerPanel';
import { useI18n } from '../i18n/I18nContext';

export type MandantPickerOption = {
  id: string;
  reference?: string;
  photo?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone1?: string;
  identityNumber?: string;
  identityType?: string;
};

export function MandantPickerPanel({
  excludeIds,
  selectedId,
  onSelect,
  query,
  onQueryChange,
  mandants,
  loading,
  open,
}: {
  excludeIds: string[];
  selectedId: string;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  mandants: MandantPickerOption[];
  loading: boolean;
  open: boolean;
}) {
  const { t } = useI18n();
  const availableCount = mandants.filter((m) => !excludeIds.includes(m.id)).length;
  return (
    <EntityPickerPanel
      items={mandants.map(mandantToPickerItem)}
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
          ? t('msg.allMandantsLinked')
          : t('msg.noMandantMatch')
      }
      countLabel={(n) =>
        `${t('msg.mandantsAvailableCount', { count: n })}${query.trim() ? ` ${t('common.filteredParen')}` : ''}`
      }
      ariaLabel={t('msg.mandantsAvailableCount', { count: availableCount })}
    />
  );
}

export function MandantLinkPicker({
  excludeIds = [],
  onLink,
  buttonLabel,
}: {
  excludeIds?: string[];
  onLink: (mandantId: string) => Promise<void>;
  buttonLabel?: string;
}) {
  const { t } = useI18n();
  const resolvedButtonLabel = buttonLabel ?? t('actions.linkMandant');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mandants, setMandants] = useState<MandantPickerOption[]>([]);
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
    fetchMandantList<MandantPickerOption>({ limit: 500, sort: 'lastName' })
      .then(setMandants)
      .catch(() => setMandants([]))
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
      <Btn icon={Plus} onClick={() => setOpen(true)}>{resolvedButtonLabel}</Btn>

      <Modal
        open={open}
        size="lg"
        title={t('actions.linkMandant')}
        onClose={handleClose}
        footer={
          <>
            <Btn variant="secondary" onClick={handleClose}>{t('common.cancel')}</Btn>
            <Btn icon={Plus} onClick={handleLink} disabled={!selectedId || linking}>
              {linking ? t('common.linking') : t('common.link')}
            </Btn>
          </>
        }
      >
        <MandantPickerPanel
          open={open}
          excludeIds={excludeIds}
          selectedId={selectedId}
          onSelect={setSelectedId}
          query={query}
          onQueryChange={setQuery}
          mandants={mandants}
          loading={loading}
        />
      </Modal>
    </>
  );
}
