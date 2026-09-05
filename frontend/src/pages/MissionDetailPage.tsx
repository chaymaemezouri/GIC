import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Printer, ClipboardList, Truck, MapPin, Upload, Paperclip, ExternalLink, Info, FileText, History } from 'lucide-react';
import { api, formatDate, fetchChantierList, uploadForm } from '../lib/api';
import { Btn, Card, Input, KpiCard, MacActionBtn, Modal, StatusPill, TableWrap, Td, Th, Select, PageBackLink } from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';



type Tab = 'infos' | 'documents' | 'historique';

type MissionDoc = {
  id: string;
  name: string;
  category?: string | null;
  mimeType?: string | null;
  size?: number | null;
  path: string;
  createdAt: string;
};

type MissionDetail = {
  id: string;
  date: string;
  mission: string;
  driverName?: string | null;
  usage?: string | null;
  tranche?: string | null;
  requestedBy?: string | null;
  remark?: string | null;
  createdAt: string;
  engin: { id: string; brand?: string; matricule?: string; status: string; genre?: string };
  chantier?: { id: string; name: string } | null;
  documents?: MissionDoc[];
};

export default function MissionDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [item, setItem] = useState<MissionDetail | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [engins, setEngins] = useState<{ id: string; matricule?: string; brand?: string }[]>([]);
  const [chantiers, setChantiers] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editForm, setEditForm] = useState({
    enginId: '', date: '', mission: '', driverName: '', chantierId: '', usage: '', tranche: '', requestedBy: '', remark: '',
  });

  function load() {
    if (!id) return;
    setError('');
    api<MissionDetail>(`/engins/missions/${id}`)
      .then(setItem)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/engins/missions/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  useEffect(() => {
    load();
    api<{ id: string; matricule?: string; brand?: string }[]>('/engins/list').then(setEngins).catch(() => setEngins([]));
    fetchChantierList<{ id: string; name: string }>().then(setChantiers).catch(() => setChantiers([]));
  }, [id]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
  }, [tab, id]);

  function openEdit() {
    if (!item) return;
    setEditForm({
      enginId: item.engin.id,
      date: item.date.slice(0, 10),
      mission: item.mission,
      driverName: item.driverName || '',
      chantierId: item.chantier?.id || '',
      usage: item.usage || '',
      tranche: item.tranche || '',
      requestedBy: item.requestedBy || '',
      remark: item.remark || '',
    });
    setEditOpen(true);
  }

  useEffect(() => {
    if (item && (location.state as { edit?: boolean } | null)?.edit) {
      openEdit();
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [item, location.state, location.pathname, navigate]);

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    try {
      await api(`/engins/missions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          enginId: editForm.enginId,
          date: editForm.date,
          mission: editForm.mission,
          driverName: editForm.driverName || null,
          chantierId: editForm.chantierId || null,
          usage: editForm.usage || null,
          tranche: editForm.tranche || null,
          requestedBy: editForm.requestedBy || null,
          remark: editForm.remark || null,
        }),
      });
      setEditOpen(false);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!deleteMotif.trim() || !id) return;
    try {
      await api(`/engins/missions/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ motif: deleteMotif }),
      });
      navigate('/missions');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', file.name);
    fd.append('category', 'mission');
    try {
      await uploadForm(`/engins/missions/${id}/documents`, fd);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.uploadError'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function deleteDoc(docId: string) {
    if (!id || !await appConfirm(t('msg.confirmDeleteDocument'))) return;
    try {
      await api(`/engins/missions/${id}/documents/${docId}`, { method: 'DELETE' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printFiche() {
    if (!item) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><body style="font-family:sans-serif;padding:24px;font-size:12px">
      <h1>Mission — GIC</h1>
      <h2>${item.mission}</h2>
      <p><b>Engin :</b> ${item.engin.matricule || '—'} — ${item.engin.brand || ''}</p>
      <p><b>Date :</b> ${formatDate(item.date)}</p>
      <p><b>Chauffeur :</b> ${item.driverName || '—'}</p>
      <p><b>Chantier :</b> ${item.chantier?.name || '—'}</p>
      <p><b>Usage :</b> ${item.usage || '—'}</p>
      <p><b>Demandé par :</b> ${item.requestedBy || '—'}</p>
      <p><b>Remarque :</b> ${item.remark || '—'}</p>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (!item && !error) return <p className="text-[12px] text-gic-muted p-6">{t('common.loading')}</p>;

  if (error && !item) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/missions" className="mt-2" />
      </Card>
    );
  }

  const docs = item?.documents || [];
  const docCount = docs.length;

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/missions" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            <div className="mac-detail-photo-fallback">
              <ClipboardList size={28} strokeWidth={1.5} className="text-gic-muted" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.mission360')}</p>
            <h1 className="mac-detail-name truncate">{item!.mission}</h1>
            <p className="mac-detail-meta">
              <Link to={`/engins/${item!.engin.id}`} className="hover:text-[#007aff]">
                {item!.engin.matricule || 'Engin'} — {item!.engin.brand || ''}
              </Link>
              {' · '}{formatDate(item!.date)}
              {item!.driverName ? ` · ${item!.driverName}` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusPill status={item!.engin.status} quiet />
              {item!.chantier && (
                <Link to={`/chantiers/${item!.chantier.id}`} className="mac-chip mac-chip-green">
                  {item!.chantier.name}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          <Link to={`/engins/${item!.engin.id}`}><Btn variant="secondary" icon={Truck}>{t('actions.equipmentFiche')}</Btn></Link>
          <Btn variant="secondary" icon={Printer} onClick={printFiche}>{t('common.print')}</Btn>
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteOpen(true); setDeleteMotif(''); }} />
          </div>
                 </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-3 mb-4">
        <KpiCard title={t('fields.chantier')} value={item!.chantier?.name || '—'} icon={MapPin} tone="emerald" compact />
        <KpiCard title={t('fields.usage')} value={item!.usage || '—'} icon={ClipboardList} tone="violet" compact />
        <KpiCard title={t('tabs.documents')} value={docCount} icon={Paperclip} tone="amber" />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsMissionAria')}
            items={[
              { id: 'infos', label: t('tabs.informations'), icon: Info },
              { id: 'documents', label: t('tabs.attachments'), icon: FileText, badge: docCount },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >

        {tab === 'infos' && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-[12px] mt-1">
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.date')}</p><p className="font-medium">{formatDate(item!.date)}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.mission')}</p><p className="font-medium">{item!.mission}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.chauffeur')}</p><p>{item!.driverName || '—'}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.usage')}</p><p>{item!.usage || '—'}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.requestedBy')}</p><p>{item!.requestedBy || '—'}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.tranche')}</p><p>{item!.tranche || '—'}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">Engin</p>
              <Link to={`/engins/${item!.engin.id}`} className="mac-table-ref inline-flex items-center gap-1">
                {item!.engin.matricule} — {item!.engin.brand} <ExternalLink size={10} />
              </Link>
            </div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.equipmentStatus')}</p><StatusPill status={item!.engin.status} quiet /></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.chantier')}</p>
              {item!.chantier ? (
                <Link to={`/chantiers/${item!.chantier.id}`} className="mac-table-ref inline-flex items-center gap-1">
                  {item!.chantier.name} <ExternalLink size={10} />
                </Link>
              ) : '—'}
            </div>
            {item!.remark && (
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-gic-muted text-[10px] uppercase">{t('fields.remark')}</p>
                <p className="leading-relaxed">{item!.remark}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'documents' && (
          <div className="space-y-4 mt-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] text-gic-muted">{t('msg.missionDocsHint')}</p>
              <label className="cursor-pointer">
                <span className={`inline-flex items-center gap-2 rounded-lg border border-gic-border px-3 py-2 text-[12px] font-medium hover:bg-black/[0.03]${uploading ? ' opacity-60 pointer-events-none' : ''}`}>
                  <Upload size={14} /> {uploading ? t('msg.uploading') : t('actions.addFile')}
                </span>
                <input type="file" className="hidden" onChange={onUpload} />
              </label>
            </div>
            {docs.length === 0 ? (
              <p className="text-[12px] text-gic-muted">{t('msg.emptyAttachments')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('fields.file')}</Th>
                    <Th mac>{t('columns.category')}</Th>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <Td mac>
                        <a href={d.path} target="_blank" rel="noreferrer" className="mac-table-ref inline-flex items-center gap-1">
                          {d.name} <ExternalLink size={10} />
                        </a>
                      </Td>
                      <Td mac className="mac-table-muted">{d.category || '—'}</Td>
                      <Td mac className="text-[11px]">{formatDate(d.createdAt)}</Td>
                      <Td mac className="mac-td-actions">
                        <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteDoc(d.id)} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}

        {tab === 'historique' && (
          history.length === 0 ? (
            <p className="text-[12px] text-gic-muted mt-1">{t('msg.emptyHistoryShort')}</p>
          ) : (
            <div className="space-y-2 mt-1">
              {history.map((h) => (
                <div key={h.id} className="rounded-xl border border-gic-border px-3 py-2 text-[11px]">
                  <p className="font-medium capitalize">{h.action} — {h.entity}</p>
                  <p className="text-gic-muted">{h.details || '—'}</p>
                  <p className="text-[10px] text-gic-muted mt-1">
                    {formatDate(h.createdAt)} · {h.user ? `${h.user.firstName} ${h.user.lastName}` : t('common.system')}
                  </p>
                </div>
              ))}
            </div>
          )
        )}
            </DetailShell>

      <Modal open={editOpen} title={t('actions.editMission')} onClose={() => setEditOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-mission-form" type="submit">{t('common.save')}</Btn></>}
        size="lg"
      >
        <form id="edit-mission-form" onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-2">
          <Select label={t('fields.enginRequiredStar')} required value={editForm.enginId} onChange={(e) => setEditForm({ ...editForm, enginId: e.target.value })}>
            <option value="">{t('fields.selectOption')}</option>
            {engins.map((e) => <option key={e.id} value={e.id}>{e.matricule} — {e.brand}</option>)}
          </Select>
          <Input label={t('fields.date')} type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
          <Input label={t('fields.missionRequiredStar')} required className="sm:col-span-2" value={editForm.mission} onChange={(e) => setEditForm({ ...editForm, mission: e.target.value })} />
          <Input label={t('fields.chauffeur')} value={editForm.driverName} onChange={(e) => setEditForm({ ...editForm, driverName: e.target.value })} />
          <Select label={t('fields.chantier')} value={editForm.chantierId} onChange={(e) => setEditForm({ ...editForm, chantierId: e.target.value })}>
            <option value="">—</option>
            {chantiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label={t('fields.usage')} value={editForm.usage} onChange={(e) => setEditForm({ ...editForm, usage: e.target.value })} />
          <Input label={t('fields.tranche')} value={editForm.tranche} onChange={(e) => setEditForm({ ...editForm, tranche: e.target.value })} />
          <Input label={t('fields.requestedBy')} value={editForm.requestedBy} onChange={(e) => setEditForm({ ...editForm, requestedBy: e.target.value })} />
          <Input label={t('fields.remark')} className="sm:col-span-2" value={editForm.remark} onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })} />
        </form>
      </Modal>

      <Modal open={deleteOpen} title={t('actions.deleteMission')} onClose={() => setDeleteOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn></>}
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.attachmentDeleteHint')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.motifShortPlaceholder')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>
    </div>
  );
}
