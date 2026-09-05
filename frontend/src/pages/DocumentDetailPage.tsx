import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Printer, FileText, ExternalLink, AlertTriangle, Info as InfoIcon, History
} from 'lucide-react';
import { api, formatDate } from '../lib/api';
import { Btn, Card, KpiCard, MacActionBtn, Modal, Select, TableWrap, Td, Th, PageBackLink } from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';


import { entityLink, expiryClass, expiryLabel, fileUrl, formatSize, printDocumentFiche, type DocEntity } from '../lib/documentDisplay';

type Tab = 'infos' | 'historique';

const DOC_CATEGORIES = ['general', 'contrat', 'facture', 'devis', 'photo', 'archive', 'juridique', 'technique'];

export default function DocumentDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [doc, setDoc] = useState<DocEntity | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'general', expiresAt: '' });

  function load() {
    if (!id) return;
    setError('');
    api<DocEntity>(`/documents/${id}`).then(setDoc).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/documents/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
  }, [tab, id]);

  useEffect(() => {
    if (doc && (location.state as { edit?: boolean } | null)?.edit) {
      setForm({
        name: doc.name,
        category: doc.category || 'general',
        expiresAt: doc.expiresAt ? doc.expiresAt.slice(0, 10) : '',
      });
      setEditOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [doc, location.state, location.pathname, navigate]);

  function openEdit() {
    if (!doc) return;
    setForm({
      name: doc.name,
      category: doc.category || 'general',
      expiresAt: doc.expiresAt ? doc.expiresAt.slice(0, 10) : '',
    });
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
        }),
      });
      setEditOpen(false);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
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

  const link = entityLink(doc!);
  const expiryStatus = expiryLabel(doc!.expiresAt);

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/documents" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            <div className="mac-detail-photo-fallback">
              <FileText size={22} strokeWidth={1.75} />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.document360')}</p>
            <h1 className="mac-detail-name truncate">{doc!.name}</h1>
            <p className="mac-detail-meta">
              {doc!.category ? doc!.category : t('msg.noCategory')}
              <span className="text-[#c7c7cc]"> · </span>
              {formatSize(doc!.size)}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {doc!.category && <span className="mac-chip mac-chip-blue capitalize">{doc!.category}</span>}
              {doc!.mimeType && <span className="mac-chip mac-chip-gray">{doc!.mimeType}</span>}
              {doc!.expiresAt && (
                <span className={`mac-chip ${expiryClass(doc!.expiresAt).includes('coral') ? 'mac-chip-orange' : 'mac-chip-gray'}`}>
                  <AlertTriangle size={10} /> {expiryStatus}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          <a href={fileUrl(doc!.path)} target="_blank" rel="noreferrer">
            <Btn variant="secondary" icon={FileText}>{t('actions.open')}</Btn>
          </a>
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={() => printDocumentFiche(doc!)} />
            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={confirmDelete} />
          </div>
                 </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-4 mb-4">
        <KpiCard title={t('fields.size')} value={formatSize(doc!.size)} icon={FileText} tone="violet" compact />
        <KpiCard title={t('fields.expiry')} value={formatDate(doc!.expiresAt)} icon={AlertTriangle} tone="amber" compact />
        <KpiCard title={t('common.status')} value={expiryStatus} icon={AlertTriangle} tone="coral" compact />
        <KpiCard title={t('fields.addedAt')} value={formatDate(doc!.createdAt)} icon={FileText} tone="emerald" compact />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsDocumentAria')}
            items={[
              { id: 'infos', label: t('tabs.informations'), icon: InfoIcon },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >

        {tab === 'infos' && (
          <div className="space-y-4 mt-1 text-[12px]">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Info label={t('fields.mimeType')} value={doc!.mimeType || '—'} />
              <Info label={t('columns.entity')} value={doc!.entityType || '—'} />
              <Info label={t('fields.entityId')} value={doc!.entityId || '—'} />
            </div>
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
              <p className="mac-info-label">{t('fields.file')}</p>
              <a href={fileUrl(doc!.path)} target="_blank" rel="noreferrer" className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1 font-medium">
                {t('actions.openDocument')}
                <ExternalLink size={10} />
              </a>
            </div>
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

      <Modal open={editOpen} title={t('actions.editDocument')} onClose={() => setEditOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-doc-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="edit-doc-form" onSubmit={save} className="grid gap-3">
          <label className="block">
            <span className="text-[11px] font-medium text-gic-muted">{t('fields.name')}</span>
            <input className="mt-1 w-full rounded-lg border border-gic-border px-3 py-2 text-[12px]" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <Select label={t('fields.category')} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <label className="block">
            <span className="text-[11px] font-medium text-gic-muted">{t('fields.expiry')}</span>
            <input type="date" className="mt-1 w-full rounded-lg border border-gic-border px-3 py-2 text-[12px]" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </label>
        </form>
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-gic-muted uppercase">{label}</p>
      <div className="font-medium">{value}</div>
    </div>
  );
}
