import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Trash2, Users, Printer, Mail, Phone, Camera,
  Upload, FileText, Hash, Calendar, MapPin, TrendingUp, Home, Info as InfoIcon, MessageCircle, History,
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

import { AgentFormFields, emptyAgentForm, agentToForm, type AgentFormData } from '../components/AgentFormFields';
import MacProfilePhoto from '../components/MacProfilePhoto';
import ConversationsPanel from '../components/ConversationsPanel';
import { ClientLinkPicker } from '../components/ClientLinkPicker';

type Tab = 'infos' | 'clients' | 'documents' | 'echanges' | 'historique';

export default function AgentDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('clients');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<AgentFormData>(emptyAgentForm());

  function load() {
    if (!id) return;
    setError('');
    api(`/agents/${id}`)
      .then(setAgent)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/agents/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  function loadDocuments() {
    if (!id) return;
    api(`/agents/${id}/documents`).then(setDocuments).catch(() => setDocuments([]));
  }

  useEffect(() => {
    load();
    loadDocuments();
  }, [id]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
    if (tab === 'documents') loadDocuments();
  }, [tab, id]);

  function openEdit() {
    if (!agent) return;
    setForm(agentToForm(agent));
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/agents/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          email: form.email.trim() || null,
          phone1: form.phone1.trim() || null,
          phone2: form.phone2.trim() || null,
          address: form.address.trim() || null,
          remark: form.remark.trim() || null,
        }),
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
      await api(`/agents/${id}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      navigate('/agents');
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
      await uploadForm(`/agents/${id}/photo`, fd);
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
        category: 'admin',
        entityType: 'Agent',
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

  async function assignClient(clientId: string) {
    if (!id) return;
    await api(`/agents/${id}/clients`, { method: 'POST', body: JSON.stringify({ clientId }) });
    load();
  }

  async function unassignClient(clientId: string) {
    if (!id) return;
    await api(`/agents/${id}/clients/${clientId}`, { method: 'DELETE' });
    load();
  }

  function printFiche() {
    if (!agent) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const clients = agent.clients || [];
    w.document.write(`<html><head><title>Agent ${agent.firstName} ${agent.lastName}</title></head><body style="font-family:sans-serif;padding:24px">
      <h1>Fiche agent — GIC</h1>
      <h2>${agent.reference || ''} — ${agent.firstName} ${agent.lastName}</h2>
      <p><b>Email :</b> ${agent.email || '—'}</p>
      <p><b>Téléphone :</b> ${agent.phone1 || '—'} ${agent.phone2 ? '/ ' + agent.phone2 : ''}</p>
      <p><b>Adresse :</b> ${agent.address || '—'}</p>
      <p><b>Remarque :</b> ${agent.remark || '—'}</p>
      <p><b>Statut :</b> ${agent.isActive ? 'Actif' : 'Inactif'}</p>
      <h3>Clients (${clients.length})</h3>
      <ul>${clients.map((c: any) => `<li>${c.reference} — ${c.firstName} ${c.lastName}</li>`).join('')}</ul>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (!agent && !error) return <p className="text-[12px] text-gic-muted p-6">{t('common.loading')}</p>;

  if (error && !agent) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/agents" className="mt-2" />
      </Card>
    );
  }

  const clients = agent.clients || [];
  const clientIds = clients.map((c: { id: string }) => c.id);

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/agents" />
        <div className="mac-detail-hero-main">
          <MacProfilePhoto
            photo={agent.photo}
            firstName={agent.firstName}
            lastName={agent.lastName}
            editable
            onFileChange={onPhoto}
          />
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.agent360')}</p>
            <h1 className="mac-detail-name truncate">{agent.firstName} {agent.lastName}</h1>
            <p className="mac-detail-meta">
              {agent.reference || '—'}
              {!agent.isActive && t('msg.inactiveSuffix')}
              {t('msg.sinceDate', { date: formatDate(agent.createdAt) })}
            </p>
            <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-gic-muted">
              {agent.email && (
                <a href={`mailto:${agent.email}`} className="flex items-center gap-1 hover:text-[#007aff]">
                  <Mail size={12} /> {agent.email}
                </a>
              )}
              {agent.phone1 && (
                <a href={`tel:${agent.phone1}`} className="flex items-center gap-1 hover:text-[#007aff]">
                  <Phone size={12} /> {agent.phone1}
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
        <KpiCard title={t('msg.clientsAssigned')} value={agent._count?.clients ?? clients.length} icon={Users} tone="violet" />
        <KpiCard title={t('msg.salesLinked')} value={agent.stats?.salesCount ?? 0} icon={TrendingUp} tone="emerald" />
        <KpiCard title={t('msg.rentalsLinked')} value={agent.stats?.rentalsCount ?? 0} icon={Home} tone="amber" />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsAgentAria')}
            items={[
              { id: 'clients', label: t('tabs.clients'), icon: Users, badge: clients.length },
              { id: 'infos', label: t('tabs.informations'), icon: InfoIcon },
              { id: 'documents', label: t('tabs.documents'), icon: FileText, badge: documents.length },
              { id: 'echanges', label: t('tabs.exchanges'), icon: MessageCircle },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >
        {tab === 'infos' && (
          <div className="grid sm:grid-cols-2 gap-4 text-[12px] mt-1">
            <Info icon={Hash} label={t('fields.reference')} value={agent.reference || '—'} />
            <Info icon={Users} label={t('fields.fullName')} value={`${agent.firstName} ${agent.lastName}`} />
            <Info icon={Mail} label={t('fields.email')} value={agent.email || '—'} link={agent.email ? `mailto:${agent.email}` : undefined} />
            <Info icon={Phone} label={t('fields.phonePrimary')} value={agent.phone1 || '—'} link={agent.phone1 ? `tel:${agent.phone1}` : undefined} />
            <Info icon={Phone} label={t('fields.phoneSecondary')} value={agent.phone2 || '—'} link={agent.phone2 ? `tel:${agent.phone2}` : undefined} />
            <Info icon={MapPin} label={t('fields.address')} value={agent.address || '—'} className="sm:col-span-2" />
            <Info icon={FileText} label={t('fields.remark')} value={agent.remark || '—'} className="sm:col-span-2" />
            <Info icon={Users} label={t('fields.status')} value={agent.isActive ? t('status.active') : t('status.inactive')} />
            <Info icon={Calendar} label={t('fields.createdAt')} value={formatDate(agent.createdAt)} />
            <Info icon={Calendar} label={t('fields.updatedAt')} value={formatDate(agent.updatedAt)} />
          </div>
        )}

        {tab === 'clients' && (
          <div className="space-y-4 mt-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] text-gic-muted">
                {t('msg.clientsPortfolioCount', { count: clients.length })}
              </p>
              <ClientLinkPicker
                excludeIds={clientIds}
                buttonLabel={t('actions.assignClient')}
                modalTitle={t('actions.assignClient')}
                confirmLabel={t('common.assign')}
                allAssignedMessage={t('msg.agentPortfolioAllAssigned')}
                onLink={assignClient}
              />
            </div>
            {clients.length === 0 ? (
              <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyClientsAssigned')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.reference')}</Th>
                    <Th mac>{t('columns.name')}</Th>
                    <Th mac>{t('columns.email')}</Th>
                    <Th mac>{t('columns.classification')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c: any) => (
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
                      <Td mac>
                        <div className="flex flex-wrap gap-1">
                          {c.isProspect && <StatusPill status="brouillon" quiet />}
                          {c.isBuyer && <StatusPill status="actif" quiet />}
                          {c.isTenant && <StatusPill status="loué" quiet />}
                        </div>
                      </Td>
                      <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="mac-actions">
                          <MacActionBtn icon={Trash2} tone="red" title={t('actions.unassignFromPortfolio')} onClick={() => unassignClient(c.id)} />
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
              <Upload size={14} /> {t('actions.addDocument')}
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
            entityType="Agent"
            entityId={agent.id}
            defaultEmail={agent.email || undefined}
            defaultPhone={agent.phone1 || undefined}
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
        title={t('actions.editAgent')}
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="edit-agent-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="edit-agent-form" onSubmit={save}>
          <AgentFormFields form={form} setForm={setForm} />
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        title={t('actions.deleteAgent')}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">
          Un agent avec des clients assignés ne peut pas être supprimé (RG-AGT-001).
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
