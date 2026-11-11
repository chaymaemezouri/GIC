import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eye, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { api, formatDate, uploadDocument } from '../lib/api';
import { fileUrl } from '../lib/photoUrl';
import { ENTITY_CHECKLISTS, parseChecklistConfig, type ChecklistConfig } from '../lib/entityChecklists';
import { DocumentAddButton } from './DocumentAddButton';
import { DocumentFileActions } from './DocumentScanner';
import { Btn, Input, MacActionBtn, Modal } from './ui';
import { useI18n } from '../i18n/I18nContext';
import { displayFileName, requestPdfPreview } from './PdfPreview';

type Doc = {
  id: string;
  name: string;
  category?: string | null;
  path: string;
  status?: string | null;
  expiresAt?: string | null;
};

type Filter = 'all' | 'missing' | 'deposited' | 'pending' | 'invalid' | 'expired';

const EMPTY: ChecklistConfig = { custom: [], labels: {}, hidden: [], required: {} };

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return false;
  return expiresAt.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

export function EntityDocChecklist({
  entityType,
  entityId,
  extra = {},
  reloadToken = 0,
  onChanged,
}: {
  entityType: string;
  entityId: string;
  extra?: Record<string, string>;
  reloadToken?: number;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const standards = ENTITY_CHECKLISTS[entityType] || [];
  const requestId = useRef(0);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [config, setConfig] = useState<ChecklistConfig>(EMPTY);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [deposit, setDeposit] = useState<{ key: string; label: string; file: File } | null>(null);
  const [depositExpiry, setDepositExpiry] = useState('');
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [editName, setEditName] = useState('');
  const [editExpiry, setEditExpiry] = useState('');

  function remember(doc: Doc) {
    setDocs((prev) => [doc, ...prev.filter((item) => item.id !== doc.id)]);
  }

  async function load() {
    const current = ++requestId.current;
    const docsPromise = api<{ items?: Doc[] } | Doc[]>(`/documents?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&limit=100`)
      .then((value) => {
        if (current !== requestId.current) return;
        setDocs(Array.isArray(value) ? value : value.items || []);
      })
      .catch(() => {});
    const checkPromise = api<{ config: string | null }>(`/documents/checklist?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`)
      .then((value) => {
        if (current !== requestId.current) return;
        setConfig(parseChecklistConfig(value.config));
      })
      .catch(() => {});
    await Promise.allSettled([docsPromise, checkPromise]);
  }

  async function refresh() {
    await load();
    onChanged?.();
  }

  useEffect(() => { load().catch(() => {}); }, [entityType, entityId, reloadToken]);

  async function save(next: ChecklistConfig) {
    setConfig(next);
    try {
      await api('/documents/checklist', { method: 'PUT', body: JSON.stringify({ entityType, entityId, ...next }) });
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const rows = useMemo(() => {
    const byCat = new Map<string, Doc>();
    for (const d of docs) {
      if (d.category && !byCat.has(d.category)) byCat.set(d.category, d);
    }
    const standard = standards
      .filter((s) => !config.hidden.includes(s.key))
      .map((s) => ({
        key: s.key,
        label: config.labels[s.key] || t(s.labelKey),
        required: config.required[s.key] ?? s.required,
        custom: false,
        doc: byCat.get(s.key) || null,
      }));
    const custom = config.custom.map((c) => ({
      key: c.key,
      label: c.label,
      required: config.required[c.key] ?? c.required,
      custom: true,
      doc: byCat.get(c.key) || null,
    }));
    return [...standard, ...custom];
  }, [standards, config, docs, t]);

  const extras = docs.filter((d) => !rows.some((r) => r.doc?.id === d.id));
  const visible = rows.filter((row) => {
    const q = query.trim().toLowerCase();
    if (q && !`${row.label} ${row.doc?.name || ''}`.toLowerCase().includes(q)) return false;
    if (filter === 'missing') return !row.doc;
    if (filter === 'deposited') return !!row.doc;
    if (filter === 'pending') return row.doc?.status !== 'valid' && row.doc?.status !== 'invalid' && !!row.doc;
    if (filter === 'invalid') return row.doc?.status === 'invalid';
    if (filter === 'expired') return isExpired(row.doc?.expiresAt);
    return true;
  });

  const requiredRows = rows.filter((r) => r.required);
  const requiredValid = requiredRows.filter((r) => r.doc?.status === 'valid' && !isExpired(r.doc.expiresAt)).length;
  const done = rows.filter((r) => r.doc).length;

  function stageUpload(key: string, label: string, file: File) {
    setDeposit({ key, label, file });
    setDepositExpiry('');
  }

  async function saveDeposit() {
    if (!deposit) return;
    try {
      const saved = await uploadDocument(deposit.file, {
        name: deposit.file.name || deposit.label,
        category: deposit.key,
        entityType,
        entityId,
        ...extra,
        ...(depositExpiry ? { expiresAt: depositExpiry } : {}),
      }) as Doc;
      if (saved?.id) remember(saved);
      setDeposit(null);
      setDepositExpiry('');
      await refresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openEdit(doc: Doc) {
    setEditDoc(doc);
    setEditName(doc.name);
    setEditExpiry(doc.expiresAt ? doc.expiresAt.slice(0, 10) : '');
  }

  async function saveEdit() {
    if (!editDoc) return;
    const name = editName.trim();
    if (!name) return;
    try {
      const saved = await api<Doc>(`/documents/${editDoc.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, expiresAt: editExpiry || null }),
      });
      if (saved?.id) remember(saved);
      setEditDoc(null);
      await refresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      await api(`/documents/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      await refresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openDoc(path: string, name?: string) {
    requestPdfPreview(fileUrl(path), false, name);
  }

  async function detach(id: string) {
    if (!await appConfirm(t('msg.confirmDeleteDocument'))) return;
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('checklists.all') },
    { id: 'missing', label: t('checklists.missing') },
    { id: 'deposited', label: t('checklists.deposited') },
    { id: 'pending', label: t('checklists.toValidate') },
    { id: 'invalid', label: t('checklists.refused') },
    { id: 'expired', label: t('checklists.expired') },
  ];

  return (
    <div className="mac-section-card mb-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <p className="text-[13px] font-medium text-gic-ink">{t('projectDocs.checklist')}</p>
          <p className="text-[11px] text-gic-muted">{t('checklists.progress', { done, total: rows.length })}</p>
          <p className="text-[11px] text-gic-muted">{t('checklists.requiredProgress', { done: requiredValid, total: requiredRows.length })}</p>
        </div>
        <div className="flex items-center gap-2">
          <DocumentAddButton
            entityType={entityType}
            entityId={entityId}
            extra={extra}
            categories={[...standards.map((s) => s.key), ...config.custom.map((c) => c.key)]}
            onUploaded={(doc) => { if (doc?.id && doc.path) remember(doc as Doc); refresh().catch(() => {}); }}
          />
          <MacActionBtn icon={Plus} tone="blue" title={t('projectDocs.addChecklistItem')} onClick={() => { setNewLabel(''); setAddOpen(true); }} />
        </div>
      </div>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('common.searchEllipsis')} className="mb-2" />
      <div className="flex flex-wrap gap-1.5 mb-3">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium border ${filter === f.id ? 'bg-gic-violet text-white border-gic-violet' : 'bg-white text-gic-ink border-gic-border'}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {visible.map((row) => {
          const status = row.doc?.status || (row.doc ? 'pending' : '');
          const expired = isExpired(row.doc?.expiresAt);
          return (
            <div key={row.key} className="rounded-lg border border-black/[0.06] px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-gic-ink">
                    {row.label}{row.required ? ' *' : ''}
                  </p>
                  {row.doc ? (
                    <button type="button" className="text-left text-[11px] text-gic-muted hover:text-gic-ink" onClick={() => openDoc(row.doc!.path, row.doc!.name)}>
                      {displayFileName(row.doc.name)}
                      {row.doc.expiresAt ? ` · ${formatDate(row.doc.expiresAt)}` : ''}
                    </button>
                  ) : (
                    <p className="text-[11px] text-gic-muted">{t('checklists.missing')}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {!row.doc && <span className="mac-chip">{t('checklists.missing')}</span>}
                    {status === 'pending' && <span className="mac-chip mac-chip-orange">{t('checklists.toValidate')}</span>}
                    {status === 'valid' && <span className="mac-chip mac-chip-emerald">{t('projectDocs.stateValid')}</span>}
                    {status === 'invalid' && <span className="mac-chip mac-chip-orange">{t('checklists.refused')}</span>}
                    {expired && <span className="mac-chip mac-chip-orange">{t('checklists.expired')}</span>}
                  </div>
                </div>
                <div className="mac-actions">
                  {row.doc && (
                    <>
                      <MacActionBtn icon={Eye} tone="blue" title={t('common.view')} onClick={() => openDoc(row.doc!.path, row.doc!.name)} />
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(row.doc!)} />
                      <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => detach(row.doc!.id)} />
                      {status !== 'valid' && (
                        <MacActionBtn icon={Check} tone="green" title={t('projectDocs.stateValid')} onClick={() => setStatus(row.doc!.id, 'valid')} />
                      )}
                    </>
                  )}
                  {!row.doc && (
                    <DocumentFileActions
                      labelClassName="mac-action-btn mac-action-btn-blue cursor-pointer"
                      labelTitle={t('actions.addDocument')}
                      scanVariant="icon"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) stageUpload(row.key, row.label, f); e.target.value = ''; }}
                    >
                      <Upload size={14} strokeWidth={2.15} />
                    </DocumentFileActions>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {visible.length === 0 && <p className="py-4 text-center text-[12px] text-gic-muted">{t('msg.emptyDocuments')}</p>}
      </div>

      {extras.length > 0 && filter === 'all' && !query && (
        <div className="mt-4">
          <p className="text-[12px] font-medium text-gic-ink mb-2">{t('checklists.otherDocs')}</p>
          {extras.map((d) => (
            <div key={d.id} className="mac-row flex-col !items-stretch">
              <div className="flex w-full items-center justify-between gap-2">
                <button type="button" className="min-w-0 text-left" onClick={() => openDoc(d.path, d.name)}>
                  <p className="mac-row-title truncate">{displayFileName(d.name)}</p>
                  <p className="mac-row-subtitle">{d.category || '—'}{d.expiresAt ? ` · ${formatDate(d.expiresAt)}` : ''}</p>
                </button>
                <div className="mac-actions">
                  <MacActionBtn icon={Eye} tone="blue" title={t('common.view')} onClick={() => openDoc(d.path, d.name)} />
                  <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(d)} />
                  <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => detach(d.id)} />
                  {d.status !== 'valid' && (
                    <MacActionBtn icon={Check} tone="green" title={t('projectDocs.stateValid')} onClick={() => setStatus(d.id, 'valid')} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={addOpen}
        title={t('projectDocs.addChecklistItem')}
        onClose={() => setAddOpen(false)}
        footer={(
          <>
            <Btn variant="secondary" onClick={() => setAddOpen(false)}>{t('common.cancel')}</Btn>
            <Btn onClick={() => {
              const label = newLabel.trim();
              if (!label) return;
              save({ ...config, custom: [...config.custom, { key: `custom_${Date.now().toString(36)}`, label, required: false }] });
              setAddOpen(false);
            }}>{t('common.save')}</Btn>
          </>
        )}
      >
        <Input label={t('fields.designation')} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
      </Modal>
      <Modal
        open={!!deposit}
        title={t('actions.addDocument')}
        onClose={() => setDeposit(null)}
        footer={(
          <>
            <Btn variant="secondary" onClick={() => setDeposit(null)}>{t('common.cancel')}</Btn>
            <Btn onClick={() => { saveDeposit().catch(() => {}); }}>{t('common.save')}</Btn>
          </>
        )}
      >
        <p className="mb-3 text-[12px] text-gic-ink">{deposit?.file.name}</p>
        <Input label={t('fields.expirationDate')} type="date" value={depositExpiry} onChange={(e) => setDepositExpiry(e.target.value)} />
      </Modal>
      <Modal
        open={!!editDoc}
        title={t('common.edit')}
        onClose={() => setEditDoc(null)}
        footer={(
          <>
            <Btn variant="secondary" onClick={() => setEditDoc(null)}>{t('common.cancel')}</Btn>
            <Btn onClick={() => { saveEdit().catch(() => {}); }}>{t('common.save')}</Btn>
          </>
        )}
      >
        <div className="grid gap-3">
          <Input label={t('fields.displayName')} value={editName} onChange={(e) => setEditName(e.target.value)} />
          <Input label={t('fields.expirationDate')} type="date" value={editExpiry} onChange={(e) => setEditExpiry(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
