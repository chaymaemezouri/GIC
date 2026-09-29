import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, Eye, FileX, Pencil, Plus, Star, Trash2, Upload, X } from 'lucide-react';
import { api, formatDate, uploadDocument, uploadForm } from '../lib/api';
import { fileUrl } from '../lib/photoUrl';
import { ENTITY_CHECKLISTS, parseChecklistConfig, type ChecklistConfig } from '../lib/entityChecklists';
import { DocumentAddButton } from './DocumentAddButton';
import { Btn, Input, MacActionBtn, Modal } from './ui';
import { useI18n } from '../i18n/I18nContext';

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
}: {
  entityType: string;
  entityId: string;
  extra?: Record<string, string>;
}) {
  const { t } = useI18n();
  const standards = ENTITY_CHECKLISTS[entityType] || [];
  const [docs, setDocs] = useState<Doc[]>([]);
  const [config, setConfig] = useState<ChecklistConfig>(EMPTY);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState('');

  async function load() {
    const [docRes, checkRes] = await Promise.all([
      api<{ items?: Doc[] } | Doc[]>(`/documents?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&limit=100`),
      api<{ config: string | null }>(`/documents/checklist?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`),
    ]);
    setDocs(Array.isArray(docRes) ? docRes : docRes.items || []);
    setConfig(parseChecklistConfig(checkRes.config));
  }

  useEffect(() => { load().catch(() => {}); }, [entityType, entityId]);

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

  const extras = docs.filter((d) => !rows.some((r) => r.doc?.id === d.id) && !rows.some((r) => r.key === d.category));
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

  async function onUpload(key: string, label: string, file: File, existingId?: string) {
    try {
      if (existingId) {
        const form = new FormData();
        form.append('file', file);
        form.append('keepName', '1');
        await uploadForm(`/documents/${existingId}/file`, form, 'PUT');
      } else {
        await uploadDocument(file, { name: file.name || label, category: key, entityType, entityId, ...extra });
      }
      await load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      await api(`/documents/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      await load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function setExpiry(id: string, expiresAt: string) {
    try {
      await api(`/documents/${id}`, { method: 'PUT', body: JSON.stringify({ expiresAt: expiresAt || null }) });
      await load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function detach(id: string) {
    if (!await appConfirm(t('checklists.detach'))) return;
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function removeRow(key: string) {
    if (!await appConfirm(t('projectDocs.confirmRemoveChecklist'))) return;
    const doc = docs.find((d) => d.category === key);
    if (doc) await api(`/documents/${doc.id}`, { method: 'DELETE' }).catch(() => {});
    const next = {
      ...config,
      custom: config.custom.filter((c) => c.key !== key),
      hidden: config.custom.some((c) => c.key === key) ? config.hidden : [...config.hidden, key],
    };
    await save(next);
    await load();
  }

  function toggleRequired(key: string, required: boolean) {
    save({ ...config, required: { ...config.required, [key]: !required } });
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
            onUploaded={() => { load().catch(() => {}); }}
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
                  <p className="text-[11px] text-gic-muted">
                    {row.doc ? row.doc.name : t('checklists.missing')}
                    {row.doc?.expiresAt ? ` · ${formatDate(row.doc.expiresAt)}` : ''}
                  </p>
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
                      <a href={fileUrl(row.doc.path)} target="_blank" rel="noreferrer" className="mac-action-btn mac-action-btn-blue" title={t('common.view')} aria-label={t('common.view')}>
                        <Eye size={14} strokeWidth={2.15} />
                      </a>
                      <Link to={`/documents/${row.doc.id}`} className="mac-action-btn mac-action-btn-gray" title={t('checklists.openSheet')} aria-label={t('checklists.openSheet')}>
                        <ExternalLink size={14} strokeWidth={2.15} />
                      </Link>
                      <MacActionBtn icon={Check} tone="green" title={t('projectDocs.stateValid')} onClick={() => setStatus(row.doc!.id, 'valid')} />
                      <MacActionBtn icon={X} tone="orange" title={t('checklists.refused')} onClick={() => setStatus(row.doc!.id, 'invalid')} />
                      <MacActionBtn icon={FileX} tone="gray" title={t('checklists.detach')} onClick={() => detach(row.doc!.id)} />
                      <input
                        type="date"
                        className="w-[7.5rem] rounded-md border border-black/[0.1] bg-black/[0.02] px-1.5 py-1 text-[11px]"
                        title={t('fields.expiry')}
                        aria-label={t('fields.expiry')}
                        value={row.doc.expiresAt ? row.doc.expiresAt.slice(0, 10) : ''}
                        onChange={(e) => setExpiry(row.doc!.id, e.target.value)}
                      />
                    </>
                  )}
                  <label className="mac-action-btn mac-action-btn-blue cursor-pointer" title={row.doc ? t('checklists.replace') : t('actions.addDocument')} aria-label={row.doc ? t('checklists.replace') : t('actions.addDocument')}>
                    <Upload size={14} strokeWidth={2.15} />
                    <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(row.key, row.label, f, row.doc?.id); e.target.value = ''; }} />
                  </label>
                  <MacActionBtn icon={Star} tone={row.required ? 'orange' : 'gray'} title={row.required ? t('checklists.markOptional') : t('checklists.markRequired')} onClick={() => toggleRequired(row.key, row.required)} />
                  <MacActionBtn icon={Pencil} tone="orange" title={t('projectDocs.renameChecklist')} onClick={() => { setRenameKey(row.key); setRenameLabel(row.label); }} />
                  <MacActionBtn icon={Trash2} tone="red" title={t('projectDocs.removeChecklist')} onClick={() => removeRow(row.key)} />
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
            <div key={d.id} className="mac-row">
              <div className="min-w-0">
                <p className="mac-row-title truncate">{d.name}</p>
                <p className="mac-row-subtitle">{d.category || '—'}</p>
              </div>
              <div className="mac-actions">
                <a href={fileUrl(d.path)} target="_blank" rel="noreferrer" className="mac-action-btn mac-action-btn-blue" title={t('common.view')} aria-label={t('common.view')}>
                  <Eye size={14} strokeWidth={2.15} />
                </a>
                <Link to={`/documents/${d.id}`} className="mac-action-btn mac-action-btn-gray" title={t('checklists.openSheet')} aria-label={t('checklists.openSheet')}>
                  <ExternalLink size={14} strokeWidth={2.15} />
                </Link>
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
        open={!!renameKey}
        title={t('projectDocs.renameChecklist')}
        onClose={() => setRenameKey(null)}
        footer={(
          <>
            <Btn variant="secondary" onClick={() => setRenameKey(null)}>{t('common.cancel')}</Btn>
            <Btn onClick={() => {
              if (!renameKey || !renameLabel.trim()) return;
              const custom = config.custom.map((c) => (c.key === renameKey ? { ...c, label: renameLabel.trim() } : c));
              save({ ...config, custom, labels: { ...config.labels, [renameKey]: renameLabel.trim() } });
              setRenameKey(null);
            }}>{t('common.save')}</Btn>
          </>
        )}
      >
        <Input label={t('fields.designation')} value={renameLabel} onChange={(e) => setRenameLabel(e.target.value)} />
      </Modal>
    </div>
  );
}
