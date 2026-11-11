import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../i18n/I18nContext';
import { Btn, Modal } from './ui';

export type ImportDuplicateItem = {
  line: number;
  incomingName: string;
  matchKind: 'cin' | 'namePhone' | 'email' | 'projectName';
  matchValue: string;
  existing: {
    id: string;
    label: string;
    name: string;
    ref: string | null;
    deletePath: string | null;
  };
  replay: { path: string; body: Record<string, unknown> };
};

type CreatedRow = {
  id: string;
  reference?: string | null;
  firstName?: string;
  lastName?: string;
  name?: string;
  companyName?: string;
};

export function ImportDuplicatesModal({
  items,
  onClose,
  onChanged,
}: {
  items: ImportDuplicateItem[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState(items);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(items);
    setBusy(null);
    setError('');
  }, [items]);

  function matchLabel(item: ImportDuplicateItem) {
    if (item.matchKind === 'cin') return t('msg.importDuplicateCin', { cin: item.matchValue });
    if (item.matchKind === 'namePhone') return t('msg.importDuplicateNamePhone');
    if (item.matchKind === 'email') return t('msg.importDuplicateEmail', { email: item.matchValue });
    return t('msg.importDuplicateProject');
  }

  function drop(next: ImportDuplicateItem[]) {
    setRows(next);
    if (!next.length) onClose();
  }

  function keep(index: number) {
    drop(rows.filter((_, i) => i !== index));
  }

  async function replace(index: number) {
    const item = rows[index];
    if (!item?.existing.deletePath) {
      setError(t('msg.importDuplicateNoDelete'));
      return;
    }
    setBusy(index);
    setError('');
    try {
      try {
        await api(item.existing.deletePath, {
          method: 'DELETE',
          body: JSON.stringify({ motif: 'Doublon import Excel' }),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (!/introuvable/i.test(message)) throw err;
      }
      const created = await api<CreatedRow>(item.replay.path, {
        method: 'POST',
        body: JSON.stringify(item.replay.body),
      });
      const newName = (created.name || created.companyName || `${created.firstName || ''} ${created.lastName || ''}`).trim() || item.incomingName;
      const next = rows.flatMap((row, i) => {
        if (i === index) return [];
        if (row.existing.id !== item.existing.id) return [row];
        return [{
          ...row,
          existing: {
            ...row.existing,
            id: created.id,
            name: newName,
            ref: created.reference ?? row.existing.ref,
            deletePath: `${item.replay.path}/${created.id}`,
          },
        }];
      });
      onChanged();
      drop(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={rows.length > 0}
      title={t('msg.importDuplicatesTitle')}
      onClose={onClose}
      size="lg"
      footer={<Btn type="button" variant="secondary" onClick={onClose}>{t('common.close')}</Btn>}
    >
      <p className="text-[12px] text-gic-muted mb-3">{t('msg.importDuplicatesHint')}</p>
      {error && <p className="mb-3 text-[12px] text-gic-coral">{error}</p>}
      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {rows.map((item, index) => (
          <div key={`${item.line}-${item.existing.id}-${index}`} className="rounded-xl border border-gic-border p-3">
            <p className="text-[11px] text-gic-muted">{t('msg.importDuplicateFileLine', { line: item.line })}</p>
            <p className="text-[13px] font-medium text-gic-ink">{item.incomingName}</p>
            <p className="text-[12px] text-gic-muted mb-2">{matchLabel(item)}</p>
            <p className="text-[11px] text-gic-muted">{t('msg.importDuplicateExisting')}</p>
            <p className="text-[13px] text-gic-ink mb-3">
              {item.existing.label} {item.existing.name}
              {item.existing.ref ? ` (${item.existing.ref})` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <Btn
                type="button"
                variant="danger"
                disabled={busy !== null || !item.existing.deletePath}
                onClick={() => replace(index)}
              >
                {t('msg.importDuplicateDelete')}
              </Btn>
              <Btn type="button" variant="secondary" disabled={busy !== null} onClick={() => keep(index)}>
                {t('msg.importDuplicateKeep')}
              </Btn>
            </div>
            {!item.existing.deletePath && (
              <p className="mt-2 text-[11px] text-gic-muted">{t('msg.importDuplicateNoDelete')}</p>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
