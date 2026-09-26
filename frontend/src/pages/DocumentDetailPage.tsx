import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Pencil, Trash2, Printer, FileText, ExternalLink, AlertTriangle, Info as InfoIcon, History,
  Download, Copy, CheckCircle2, XCircle, Clock, Eye, Link2, RefreshCw, FolderOpen,
} from 'lucide-react';
import { api, formatDate, formatMad, uploadForm } from '../lib/api';
import { Btn, Card, KpiCard, MacActionBtn, Modal, Select, TableWrap, Td, Th, PageBackLink, Input } from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';
import {
  daysUntilExpiry,
  entityLink,
  expiryClass,
  expiryLabel,
  fileExtension,
  fileUrl,
  formatSize,
  isImageDoc,
  isPdfDoc,
  isPreviewable,
  isDocumentLate,
  normalizeDocStatus,
  printDocumentFiche,
  type DocEntity,
  type DocStatus,
} from '../lib/documentDisplay';

type Tab = 'infos' | 'apercu' | 'lies' | 'historique';

type RelatedDoc = {
  id: string;
  name: string;
  category?: string | null;
  status?: string | null;
  mimeType?: string | null;
  size?: number | null;
  path: string;
  expiresAt?: string | null;
  createdAt: string;
};

const DOC_CATEGORIES = ['general', 'contrat', 'facture', 'devis', 'photo', 'archive', 'juridique', 'technique'];

function statusChipClass(status: DocStatus) {
  if (status === 'valid') return 'mac-chip-green';
  if (status === 'invalid') return 'mac-chip-orange';
  return 'mac-chip-gray';
}

function statusLabel(status: DocStatus, t: (k: string) => string) {
  if (status === 'valid') return t('projectDocs.stateValid');
  if (status === 'invalid') return t('projectDocs.stateInvalid');
  return t('projectDocs.statePending');
}

function expiryCountdown(days: number | null, t: (k: string, p?: Record<string, string | number>) => string) {
  if (days == null) return '—';
  if (days < 0) return t('docs.expiredDaysAgo', { n: Math.abs(days) });
  if (days === 0) return t('docs.expiresToday');
  return t('docs.expiresInDays', { n: days });
}

export default function DocumentDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState<DocEntity | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [related, setRelated] = useState<RelatedDoc[]>([]);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category: 'general',
    expiresAt: '',
    status: 'pending' as DocStatus,
    feeAmount: '',
    estimatedStartDate: '',
    estimatedEndDate: '',
  });

  function load() {
    if (!id) return;
    setError('');
    api<DocEntity>(`/documents/${id}`).then(setDoc).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/documents/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  function loadRelated() {
    if (!id) return;
    api<RelatedDoc[]>(`/documents/${id}/related`).then(setRelated).catch(() => setRelated([]));
  }

  useEffect(() => {
    load();
    loadRelated();
  }, [id]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
    if (tab === 'lies') loadRelated();
  }, [tab, id]);

  function fillForm(d: DocEntity) {
    setForm({
      name: d.name,
      category: d.category || 'general',
      expiresAt: d.expiresAt ? d.expiresAt.slice(0, 10) : '',
      status: normalizeDocStatus(d.status),
      feeAmount: d.feeAmount != null && d.feeAmount > 0 ? String(d.feeAmount) : '',
      estimatedStartDate: d.estimatedStartDate ? d.estimatedStartDate.slice(0, 10) : '',
      estimatedEndDate: d.estimatedEndDate ? d.estimatedEndDate.slice(0, 10) : '',
    });
  }

  useEffect(() => {
    if (doc && (location.state as { edit?: boolean } | null)?.edit) {
      fillForm(doc);
      setEditOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [doc, location.state, location.pathname, navigate]);

  function openEdit() {
    if (!doc) return;
    fillForm(doc);
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/documents/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          expiresAt: form.expiresAt || null,
          status: form.status,
          feeAmount: form.feeAmount === '' ? null : Number(form.feeAmount),
          estimatedStartDate: form.estimatedStartDate || null,
          estimatedEndDate: form.estimatedEndDate || null,
        }),
      });
      setEditOpen(false);
      load();
      loadRelated();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function setStatus(status: DocStatus) {
    if (!id || !doc) return;
    setSavingStatus(true);
    setDoc({ ...doc, status });
    try {
      await api(`/documents/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
      load();
    } finally {
      setSavingStatus(false);
    }
  }

  async function confirmDelete() {
    if (!await appConfirm(t('msg.confirmDeleteDocument'))) return;
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      navigate('/documents');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function copyLink() {
    if (!doc) return;
    const url = `${window.location.origin}${fileUrl(doc.path)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      await appAlert(t('docs.copyFailed'));
    }
  }

  async function onReplaceFile(file: File | null) {
    if (!file || !id) return;
    setReplacing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('keepName', '1');
      await uploadForm(`/documents/${id}/file`, fd, 'PUT');
      load();
      loadHistory();
      await appAlert(t('docs.fileReplaced'));
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setReplacing(false);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  }

  if (!doc && !error) {
    return <p className="text-[12px] text-gic-muted p-6 text-center">{t('msg.loadingDocument')}</p>;
  }

  if (error && !doc) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/documents" className="mt-2" />
      </Card>
    );
  }

  const d = doc!;
  const link = entityLink(d);
  const status = normalizeDocStatus(d.status);
  const expiryStatus = expiryLabel(d.expiresAt, t);
  const url = fileUrl(d.path);
  const canPreview = isPreviewable(d.mimeType, d.path);
  const isImage = isImageDoc(d.mimeType, d.path);
  const isPdf = isPdfDoc(d.mimeType, d.path);
  const ext = fileExtension(d.name, d.path);
  const late = isDocumentLate(d);
  const estimateDays = daysUntilExpiry(d.estimatedEndDate);

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/documents" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            {isImage ? (
              <img src={url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="mac-detail-photo-fallback">
                <FileText size={22} strokeWidth={1.75} />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.document360')}</p>
            <h1 className="mac-detail-name truncate">{d.name}</h1>
            <p className="mac-detail-meta">
              {d.category || t('msg.noCategory')}
              <span className="text-[#c7c7cc]"> · </span>
              {formatSize(d.size, t)}
              <span className="text-[#c7c7cc]"> · </span>
              {ext}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <span className={`mac-chip ${statusChipClass(status)}`}>{statusLabel(status, t)}</span>
              {late && (
                <span className="mac-chip mac-chip-orange">
                  <AlertTriangle size={10} /> {t('docs.lateDossier')}
                </span>
              )}
              {d.feeAmount != null && d.feeAmount > 0 && (
                <span className="mac-chip mac-chip-violet">{formatMad(d.feeAmount)}</span>
              )}
              {d.category && <span className="mac-chip mac-chip-blue capitalize">{d.category}</span>}
              {d.expiresAt && (
                <span className={`mac-chip ${expiryClass(d.expiresAt).includes('coral') ? 'mac-chip-orange' : 'mac-chip-gray'}`}>
                  <AlertTriangle size={10} /> {expiryStatus}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          <a href={url} target="_blank" rel="noreferrer">
            <Btn variant="secondary" icon={ExternalLink}>{t('actions.open')}</Btn>
          </a>
          <a href={url} download={d.name}>
            <Btn variant="secondary" icon={Download}>{t('common.download')}</Btn>
          </a>
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={copied ? CheckCircle2 : Copy} tone="blue" title={t('docs.copyLink')} onClick={copyLink} />
            <MacActionBtn icon={RefreshCw} tone="gray" title={t('projectDocs.replace')} onClick={() => replaceInputRef.current?.click()} />
            <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={() => printDocumentFiche(d, t)} />
            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={confirmDelete} />
          </div>
          <input
            ref={replaceInputRef}
            type="file"
            className="hidden"
            onChange={(e) => onReplaceFile(e.target.files?.[0] || null)}
          />
        </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-4 mb-4">
        <KpiCard
          title={t('docs.feeOptional')}
          value={d.feeAmount != null && d.feeAmount > 0 ? formatMad(d.feeAmount) : '—'}
          icon={FileText}
          tone="violet"
          compact
          delta={d.chantier && d.feeAmount ? t('docs.feeBudgetHint') : undefined}
          deltaTone="muted"
        />
        <KpiCard
          title={t('docs.estimatedEnd')}
          value={formatDate(d.estimatedEndDate)}
          icon={AlertTriangle}
          tone={late ? 'coral' : estimateDays != null && estimateDays <= 7 ? 'amber' : 'emerald'}
          compact
          delta={late ? t('docs.lateDossier') : estimateDays != null ? expiryCountdown(estimateDays, t) : t('docs.noEstimate')}
          deltaTone="muted"
        />
        <KpiCard
          title={t('common.status')}
          value={statusLabel(status, t)}
          icon={status === 'valid' ? CheckCircle2 : status === 'invalid' ? XCircle : Clock}
          tone={status === 'valid' ? 'emerald' : status === 'invalid' || late ? 'coral' : 'amber'}
          compact
        />
        <KpiCard title={t('fields.addedAt')} value={formatDate(d.createdAt)} icon={FileText} tone="emerald" compact />
      </div>

      <div className={`mac-section-card mb-4 ${savingStatus || replacing ? 'opacity-70' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gic-muted">{t('docs.validationTitle')}</p>
            <p className="text-[12px] text-gic-muted mt-0.5">{t('docs.validationHint')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {status !== 'valid' && (
              <Btn variant="secondary" icon={CheckCircle2} onClick={() => setStatus('valid')} disabled={savingStatus}>
                {t('projectDocs.markValid')}
              </Btn>
            )}
            {status !== 'invalid' && (
              <Btn variant="secondary" icon={XCircle} onClick={() => setStatus('invalid')} disabled={savingStatus}>
                {t('projectDocs.markInvalid')}
              </Btn>
            )}
            {status !== 'pending' && (
              <Btn variant="ghost" icon={Clock} onClick={() => setStatus('pending')} disabled={savingStatus}>
                {t('projectDocs.resetPending')}
              </Btn>
            )}
          </div>
        </div>
        {replacing && <p className="text-[11px] text-gic-muted mt-2">{t('docs.replacing')}</p>}
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(sectionId) => setTab(sectionId as Tab)}
            ariaLabel={t('detail.sectionsDocumentAria')}
            items={[
              { id: 'infos', label: t('tabs.informations'), icon: InfoIcon },
              { id: 'apercu', label: t('tabs.preview'), icon: Eye },
              { id: 'lies', label: t('tabs.related'), icon: Link2, badge: related.length || undefined },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >
        {tab === 'infos' && (
          <div className="space-y-4 mt-1 text-[12px]">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Info label={t('fields.mimeType')} value={d.mimeType || '—'} />
              <Info label={t('docs.extension')} value={ext} />
              <Info label={t('common.status')} value={statusLabel(status, t)} />
              <Info label={t('docs.feeOptional')} value={d.feeAmount != null && d.feeAmount > 0 ? formatMad(d.feeAmount) : t('docs.noFee')} />
              <Info label={t('docs.estimatedStart')} value={formatDate(d.estimatedStartDate)} />
              <Info label={t('docs.estimatedEnd')} value={formatDate(d.estimatedEndDate)} />
              <Info label={t('fields.expiry')} value={formatDate(d.expiresAt)} />
              <Info label={t('columns.entity')} value={d.entityType || '—'} />
              <Info label={t('fields.size')} value={formatSize(d.size, t)} />
            </div>

            {late && (
              <div className="mac-section-card border-[#ff3b30]/25 bg-[rgba(255,59,48,0.06)]">
                <p className="mac-info-label text-[#c93400]">{t('docs.lateDossier')}</p>
                <p className="text-[12px] text-gic-muted mt-1">{t('docs.lateDossierHint')}</p>
              </div>
            )}

            {link && (
              <div className="mac-section-card">
                <p className="mac-info-label">{t('fields.linkedTo')}</p>
                <Link to={link.to} className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1 font-medium">
                  {link.label}
                  <ExternalLink size={10} />
                </Link>
              </div>
            )}

            <div className="mac-section-card">
              <p className="mac-info-label mb-2">{t('fields.file')}</p>
              <div className="flex flex-wrap gap-2">
                <a href={url} target="_blank" rel="noreferrer">
                  <Btn variant="secondary" icon={ExternalLink}>{t('actions.openDocument')}</Btn>
                </a>
                <a href={url} download={d.name}>
                  <Btn variant="secondary" icon={Download}>{t('common.download')}</Btn>
                </a>
                <Btn variant="secondary" icon={copied ? CheckCircle2 : Copy} onClick={copyLink}>
                  {copied ? t('docs.linkCopied') : t('docs.copyLink')}
                </Btn>
                <Btn variant="secondary" icon={RefreshCw} onClick={() => replaceInputRef.current?.click()} disabled={replacing}>
                  {t('projectDocs.replace')}
                </Btn>
              </div>
            </div>
          </div>
        )}

        {tab === 'apercu' && (
          <div className="mt-1 space-y-3">
            {!canPreview ? (
              <div className="mac-section-card text-center py-10">
                <FolderOpen size={28} className="mx-auto text-gic-muted opacity-40 mb-2" />
                <p className="text-[13px] font-medium text-gic-ink">{t('docs.noPreview')}</p>
                <p className="text-[12px] text-gic-muted mt-1">{t('docs.noPreviewHint')}</p>
                <div className="flex justify-center gap-2 mt-4">
                  <a href={url} target="_blank" rel="noreferrer">
                    <Btn icon={ExternalLink}>{t('actions.open')}</Btn>
                  </a>
                  <a href={url} download={d.name}>
                    <Btn variant="secondary" icon={Download}>{t('common.download')}</Btn>
                  </a>
                </div>
              </div>
            ) : isImage ? (
              <div className="mac-section-card overflow-hidden p-2">
                <img src={url} alt={d.name} className="max-h-[70vh] w-full object-contain rounded-lg bg-black/[0.03]" />
              </div>
            ) : isPdf ? (
              <div className="mac-section-card overflow-hidden p-0">
                <iframe title={d.name} src={url} className="w-full min-h-[70vh] rounded-lg border-0 bg-white" />
              </div>
            ) : null}
          </div>
        )}

        {tab === 'lies' && (
          <div className="mt-1">
            {related.length === 0 ? (
              <p className="py-6 text-[12px] text-gic-muted text-center">{t('docs.emptyRelated')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.name')}</Th>
                    <Th mac>{t('columns.category')}</Th>
                    <Th mac>{t('columns.status')}</Th>
                    <Th mac>{t('fields.size')}</Th>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac />
                  </tr>
                </thead>
                <tbody>
                  {related.map((r) => {
                    const rs = normalizeDocStatus(r.status);
                    return (
                      <tr key={r.id} className="cursor-pointer hover:bg-black/[0.02]" onClick={() => navigate(`/documents/${r.id}`)}>
                        <Td mac className="font-medium">{r.name}</Td>
                        <Td mac className="mac-table-muted capitalize">{r.category || '—'}</Td>
                        <Td mac>
                          <span className={`mac-chip ${statusChipClass(rs)}`}>{statusLabel(rs, t)}</span>
                        </Td>
                        <Td mac className="mac-table-muted">{formatSize(r.size, t)}</Td>
                        <Td mac className="mac-table-muted">{formatDate(r.createdAt)}</Td>
                        <Td mac>
                          <MacActionBtn icon={Eye} tone="blue" title={t('actions.viewSheet')} onClick={(e) => { e.stopPropagation(); navigate(`/documents/${r.id}`); }} />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}

        {tab === 'historique' && (
          <div className="mt-1">
            {history.length === 0 ? (
              <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyHistory')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('columns.action')}</Th>
                    <Th mac>{t('columns.user')}</Th>
                    <Th mac>{t('columns.details')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <Td mac className="mac-table-muted">{formatDate(h.createdAt)}</Td>
                      <Td mac className="capitalize">{h.action}</Td>
                      <Td mac className="mac-table-muted">
                        {h.user ? `${h.user.firstName} ${h.user.lastName}` : '—'}
                      </Td>
                      <Td mac className="mac-table-muted">{h.details || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}
      </DetailShell>

      <Modal
        open={editOpen}
        title={t('actions.editDocument')}
        onClose={() => setEditOpen(false)}
        footer={(
          <>
            <Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="edit-doc-form" type="submit">{t('common.save')}</Btn>
          </>
        )}
      >
        <form id="edit-doc-form" onSubmit={save} className="grid gap-3">
          <Input
            label={t('fields.name')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Select label={t('fields.category')} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select label={t('common.status')} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as DocStatus })}>
            <option value="pending">{t('projectDocs.statePending')}</option>
            <option value="valid">{t('projectDocs.stateValid')}</option>
            <option value="invalid">{t('projectDocs.stateInvalid')}</option>
          </Select>
          <Input
            label={t('fields.expiry')}
            type="date"
            value={form.expiresAt}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
          />
          <Input
            label={t('docs.feeOptional')}
            type="number"
            min={0}
            step="0.01"
            value={form.feeAmount}
            onChange={(e) => setForm({ ...form, feeAmount: e.target.value })}
            placeholder={t('docs.feePlaceholder')}
          />
          <p className="text-[10px] text-gic-muted -mt-1">{t('docs.feeBudgetHint')}</p>
          <Input
            label={t('docs.estimatedStart')}
            type="date"
            value={form.estimatedStartDate}
            onChange={(e) => setForm({ ...form, estimatedStartDate: e.target.value })}
          />
          <Input
            label={t('docs.estimatedEnd')}
            type="date"
            value={form.estimatedEndDate}
            onChange={(e) => setForm({ ...form, estimatedEndDate: e.target.value })}
          />
          <p className="text-[10px] text-gic-muted -mt-1">{t('docs.estimateHint')}</p>
        </form>
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-gic-muted uppercase">{label}</p>
      <div className="font-medium break-all">{value}</div>
    </div>
  );
}
