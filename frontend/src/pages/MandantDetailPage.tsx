import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Trash2, Users, Printer, Mail, Phone, Camera,
  Upload, FileText, Hash, Calendar, MapPin, Info as InfoIcon, MessageCircle, History,
} from 'lucide-react';
import {
  api, formatDate, uploadDocument, uploadForm,
} from '../lib/api';
import {
  Btn, Card, KpiCard, MacActionBtn, Modal, StatusPill, TableWrap, Td, Th,
  PageBackLink,
} from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';

import { MandantFormFields, emptyMandantForm, mandantToForm, type MandantFormData } from '../components/MandantFormFields';
import ConversationsPanel from '../components/ConversationsPanel';
import { ClientLinkPicker } from '../components/ClientLinkPicker';

type Tab = 'infos' | 'clients' | 'documents' | 'echanges' | 'historique';

export default function MandantDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [mandant, setMandant] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [identityTypes, setIdentityTypes] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<MandantFormData>(emptyMandantForm());

  function load() {
    if (!id) return;
    setError('');
    api(`/mandants/${id}`)
      .then(setMandant)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/mandants/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  function loadDocuments() {
    if (!id) return;
    api(`/mandants/${id}/documents`).then(setDocuments).catch(() => setDocuments([]));
  }

  useEffect(() => {
    load();
    loadDocuments();
    api<{ value: string }[]>('/dropdowns/identity_type').then((d) => setIdentityTypes(d.map((x) => x.value))).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
    if (tab === 'documents') loadDocuments();
  }, [tab, id]);

  function openEdit() {
    if (!mandant) return;
    setForm(mandantToForm(mandant));
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/mandants/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...form, birthDate: form.birthDate || null }),
      });
      setEditOpen(false);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!deleteMotif.trim()) return;
    try {
      await api(`/mandants/${id}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      navigate('/mandants');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      await uploadForm(`/mandants/${id}/photo`, fd);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.uploadError'));
    } finally {
      e.target.value = '';
    }
  }

  async function onUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      await uploadDocument(file, {
        name: file.name,
        category: 'identite',
        entityType: 'Mandant',
        entityId: id,
      });
      loadDocuments();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.uploadError'));
    } finally {
      e.target.value = '';
    }
  }

  async function deleteDoc(docId: string) {
    if (!await appConfirm(t('msg.confirmDeleteDocument'))) return;
    await api(`/documents/${docId}`, { method: 'DELETE' });
    loadDocuments();
  }

  async function linkClient(clientId: string) {
    if (!clientId || !id) return;
    await api(`/mandants/${id}/clients`, { method: 'POST', body: JSON.stringify({ clientId }) });
    load();
  }

  async function unlinkClient(clientId: string) {
    if (!id) return;
    await api(`/mandants/${id}/clients/${clientId}`, { method: 'DELETE' });
    load();
  }

  function printFiche() {
    if (!mandant) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const linkedClients = (mandant.clients || []).map((cm: any) => cm.client);
    w.document.write(`<html><head><title>Mandant ${mandant.firstName} ${mandant.lastName}</title></head><body style="font-family:sans-serif;padding:24px">
      <h1>Fiche mandant — GIC</h1>
      <h2>${mandant.reference || ''} — ${mandant.firstName} ${mandant.lastName}</h2>
      <p><b>Identité :</b> ${mandant.identityType || '—'} ${mandant.identityNumber || ''}</p>
      <p><b>Email :</b> ${mandant.email || '—'}</p>
      <p><b>Téléphone :</b> ${mandant.phone1 || '—'} ${mandant.phone2 ? '/ ' + mandant.phone2 : ''}</p>
      <p><b>Adresse :</b> ${mandant.address || '—'}</p>
      <p><b>Remarque :</b> ${mandant.remark || '—'}</p>
      <h3>Clients liés (${linkedClients.length})</h3>
      <ul>${linkedClients.map((c: any) => `<li>${c.reference} — ${c.firstName} ${c.lastName}</li>`).join('')}</ul>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (!mandant && !error) return <p className="text-[12px] text-gic-muted p-6">{t('common.loading')}</p>;

  if (error && !mandant) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/mandants" className="mt-2" />
      </Card>
    );
  }

  const linkedClients = (mandant.clients || []).map((cm: any) => cm.client);
  const linkedClientIds = linkedClients.map((c: { id: string }) => c.id);

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/mandants" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            {mandant.photo ? (
              <img src={mandant.photo} alt="" />
            ) : (
              <div className="mac-detail-photo-fallback">
                {mandant.firstName[0]}{mandant.lastName[0]}
              </div>
            )}
            <label className="mac-detail-photo-cam" title={t('actions.changePhoto')}>
              <Camera size={12} strokeWidth={2} />
              <input type="file" className="hidden" accept=".jpg,.jpeg,.png" onChange={onPhoto} />
            </label>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.mandant360')}</p>
            <h1 className="mac-detail-name truncate">{mandant.firstName} {mandant.lastName}</h1>
            <p className="mac-detail-meta">
              {mandant.reference || '—'} · {mandant.identityType || t('columns.identity')} {mandant.identityNumber || ''}
              {mandant.birthDate ? ` · ${t('msg.bornOn', { date: formatDate(mandant.birthDate) })}` : ''}
            </p>
            <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-gic-muted">
              {mandant.email && (
                <a href={`mailto:${mandant.email}`} className="flex items-center gap-1 hover:text-[#007aff]">
                  <Mail size={12} /> {mandant.email}
                </a>
              )}
              {mandant.phone1 && (
                <a href={`tel:${mandant.phone1}`} className="flex items-center gap-1 hover:text-[#007aff]">
                  <Phone size={12} /> {mandant.phone1}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          <Btn variant="secondary" icon={Printer} onClick={printFiche}>{t('common.print')}</Btn>
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteOpen(true); setDeleteMotif(''); }} />
          </div>
                 </div>
      </div>

      <div className="mac-kpi-grid mb-4">
        <KpiCard title={t('tabs.linkedClients')} value={mandant._count?.clients ?? linkedClients.length} icon={Users} tone="violet" />
        <KpiCard title={t('tabs.documents')} value={documents.length} icon={FileText} tone="emerald" />
        <KpiCard title={t('fields.createdAtFem')} value={formatDate(mandant.createdAt)} icon={Calendar} tone="amber" />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsMandantAria')}
            items={[
              { id: 'infos', label: t('tabs.informations'), icon: InfoIcon },
              { id: 'clients', label: t('tabs.linkedClients'), icon: Users, badge: linkedClients.length },
              { id: 'documents', label: t('tabs.documents'), icon: FileText, badge: documents.length },
              { id: 'echanges', label: t('tabs.exchanges'), icon: MessageCircle },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >
        {tab === 'infos' && (
          <div className="grid sm:grid-cols-2 gap-4 text-[12px] mt-1">
            <Info icon={Hash} label={t('fields.reference')} value={mandant.reference || '—'} />
            <Info icon={Users} label={t('fields.fullName')} value={`${mandant.firstName} ${mandant.lastName}`} />
            <Info icon={FileText} label={t('fields.identityTypeShort')} value={mandant.identityType || '—'} />
            <Info icon={Hash} label={t('fields.pieceNumber')} value={mandant.identityNumber || '—'} />
            <Info icon={Calendar} label={t('fields.birthDate')} value={formatDate(mandant.birthDate)} />
            <Info icon={Mail} label={t('fields.email')} value={mandant.email || '—'} link={mandant.email ? `mailto:${mandant.email}` : undefined} />
            <Info icon={Phone} label={t('fields.phonePrimary')} value={mandant.phone1 || '—'} link={mandant.phone1 ? `tel:${mandant.phone1}` : undefined} />
            <Info icon={Phone} label={t('fields.phoneSecondary')} value={mandant.phone2 || '—'} link={mandant.phone2 ? `tel:${mandant.phone2}` : undefined} />
            <Info icon={MapPin} label={t('fields.address')} value={mandant.address || '—'} className="sm:col-span-2" />
            <Info icon={FileText} label={t('fields.remark')} value={mandant.remark || '—'} className="sm:col-span-2" />
            <Info icon={Calendar} label={t('fields.updatedAt')} value={formatDate(mandant.updatedAt)} />
          </div>
        )}

        {tab === 'clients' && (
          <div className="space-y-4 mt-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] text-gic-muted">
                {t('msg.clientsAttachedCount', { count: linkedClients.length })}
              </p>
              <ClientLinkPicker excludeIds={linkedClientIds} onLink={linkClient} />
            </div>
            {linkedClients.length === 0 ? (
              <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyClientsAttached')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.reference')}</Th>
                    <Th mac>{t('columns.name')}</Th>
                    <Th mac>{t('columns.email')}</Th>
                    <Th mac>{t('columns.phoneFull')}</Th>
                    <Th mac>{t('columns.classification')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {linkedClients.map((c: any) => (
                    <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/clients/${c.id}`)}>
                      <Td mac>
                        <Link to={`/clients/${c.id}`} className="mac-table-ref font-medium" onClick={(e) => e.stopPropagation()}>
                          {c.reference}
                        </Link>
                      </Td>
                      <Td mac>
                        <Link to={`/clients/${c.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>
                          {c.firstName} {c.lastName}
                        </Link>
                      </Td>
                      <Td mac className="mac-table-muted" onClick={(e) => e.stopPropagation()}>
                        {c.email ? <a href={`mailto:${c.email}`} className="hover:text-[#007aff]">{c.email}</a> : '—'}
                      </Td>
                      <Td mac onClick={(e) => e.stopPropagation()}>
                        {c.phone1 ? <a href={`tel:${c.phone1}`} className="hover:text-[#007aff]">{c.phone1}</a> : '—'}
                      </Td>
                      <Td mac>
                        <div className="flex flex-wrap gap-1">
                          {c.isProspect && <StatusPill status="brouillon" quiet />}
                          {c.isBuyer && <StatusPill status="actif" quiet />}
                          {c.isTenant && <StatusPill status="loué" quiet />}
                        </div>
                      </Td>
                      <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="mac-actions">
                          <MacActionBtn icon={Trash2} tone="red" title={t('common.remove')} onClick={() => unlinkClient(c.id)} />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}

        {tab === 'documents' && (
          <div className="space-y-3 mt-1">
            <label className="mac-upload-btn">
              <Upload size={14} /> {t('actions.uploadIdentityDoc')}
              <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={onUploadDoc} />
            </label>
            <div className="mac-section-card !p-0 overflow-hidden">
              {documents.map((d) => (
                <div key={d.id} className="mac-row">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-[#007aff] shrink-0" />
                    <div className="min-w-0">
                      <p className="mac-row-title truncate">{d.name}</p>
                      <p className="mac-row-subtitle capitalize">{d.category || 'doc'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a href={d.path} target="_blank" rel="noreferrer" className="mac-table-action px-2">{t('common.view')}</a>
                    <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteDoc(d.id)} />
                  </div>
                </div>
              ))}
              {documents.length === 0 && (
                <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyDocuments')}</p>
              )}
            </div>
          </div>
        )}

        {tab === 'echanges' && (
          <ConversationsPanel
            entityType="Mandant"
            entityId={mandant.id}
            defaultEmail={mandant.email || undefined}
            defaultPhone={mandant.phone1 || undefined}
          />
        )}

        {tab === 'historique' && (
          history.length === 0 ? (
            <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyHistory')}</p>
          ) : (
            <TableWrap mac className="mt-1">
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
                    <Td mac className="text-[11px]">{formatDate(h.createdAt)}</Td>
                    <Td mac className="capitalize">{h.action}</Td>
                    <Td mac className="mac-table-muted text-[11px]">
                      {h.user ? `${h.user.firstName} ${h.user.lastName}` : '—'}
                    </Td>
                    <Td mac className="mac-table-muted text-[11px]">{h.details || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )
        )}
      </DetailShell>

      <Modal
        open={editOpen}
        size="lg"
        title={t('actions.editMandant')}
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="edit-mandant-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="edit-mandant-form" onSubmit={save}>
          <MandantFormFields form={form} setForm={setForm} identityTypes={identityTypes} />
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        title={t('actions.deleteMandant')}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">
          {t('msg.mandantDeleteHint')}
        </p>
        <textarea
          className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]"
          placeholder={t('msg.motifDeletePlaceholder')}
          value={deleteMotif}
          onChange={(e) => setDeleteMotif(e.target.value)}
        />
      </Modal>
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
  link,
  className = '',
}: {
  icon: typeof Hash;
  label: string;
  value: string;
  link?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] text-gic-muted uppercase flex items-center gap-1 mb-0.5">
        <Icon size={11} /> {label}
      </p>
      {link ? (
        <a href={link} className="font-medium hover:text-[#007aff]">{value}</a>
      ) : (
        <p className="font-medium">{value}</p>
      )}
    </div>
  );
}
