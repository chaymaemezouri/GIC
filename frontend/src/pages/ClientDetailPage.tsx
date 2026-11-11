import { PrintChoiceModal } from '../components/PrintChoiceModal';
import { printFieldGrid, printTable, type PrintSection } from '../lib/printBlocks';
import { printPaymentReceipt, printPaymentsReceipt } from '../lib/printPayment';
import { alertCinDuplicate, appAlert } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Upload, Trash2, Pencil, Printer, Camera, Save, X, FileText, ExternalLink,
  Mail, MessageCircle, CheckCircle2, TrendingUp, Wallet, Archive, ArchiveRestore,
  User, Phone, MapPin, Calendar, Hash, Briefcase, Users, CreditCard, ChevronRight,
  LayoutDashboard, Home, Building2, KeyRound, History,
} from 'lucide-react';
import { api, fetchAgentList, formatMad, formatDate, uploadDocument, uploadForm } from '../lib/api';
import {
  Btn, KpiCard, MacActionBtn, Modal, Select, StatusPill, TableWrap, Td, Th,
  PageBackLink,
} from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';

import { ClientFormFields, clientToForm, type ClientFormData } from '../components/ClientFormFields';
import { EntityDocChecklist } from '../components/EntityDocChecklist';
import { DocumentFileActions } from '../components/DocumentScanner';
import MacProfilePhoto from '../components/MacProfilePhoto';
import ConversationsPanel from '../components/ConversationsPanel';
import { MandantLinkPicker } from '../components/MandantLinkPicker';
import {
  emptyPaymentForm,
  PaymentFormFields,
  paymentFormToCreateBody,
  paymentFormToFormData,
  type PaymentFormData,
} from '../components/PaymentFormFields';
import { fileUrl } from '../lib/documentDisplay';
import { isBankPaymentMode, paymentModeLabel } from '../lib/paymentMode';

export default function ClientDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [client, setClient] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [agentHistory, setAgentHistory] = useState<any[]>([]);
  const [tab, setTab] = useState('vue');
  const [printOpen, setPrintOpen] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [identityTypes, setIdentityTypes] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ClientFormData | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [saveError, setSaveError] = useState('');
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyChannel, setNotifyChannel] = useState<'email' | 'sms' | 'whatsapp'>('email');
  const [notifySubject, setNotifySubject] = useState('GIC — Expertise & Consulting');
  const [notifyMessage, setNotifyMessage] = useState('');
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveMotif, setArchiveMotif] = useState('');
  const [notifyResult, setNotifyResult] = useState('');
  const [saleIdx, setSaleIdx] = useState(0);
  const [rentalIdx, setRentalIdx] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState<PaymentFormData>(emptyPaymentForm());
  const [payError, setPayError] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [docReload, setDocReload] = useState(0);

  function load() {
    if (!id) return;
    api(`/clients/${id}`).then((c) => {
      setClient(c);
      setForm(clientToForm(c));
    });
    api(`/clients/${id}/history`).then(setHistory).catch(() => setHistory([]));
    api(`/clients/${id}/agent-history`).then(setAgentHistory).catch(() => setAgentHistory([]));
  }

  useEffect(() => {
    setPropertyFilter('');
    load();
    fetchAgentList({ active: 'true', limit: 500 }).then(setAgents);
    api<{ value: string }[]>('/dropdowns/identity_type').then((d) => setIdentityTypes(d.map((x) => x.value))).catch(() => {});
    api<{ value: string }[]>('/dropdowns/client_source').then((d) => setSourceOptions(d.map((x) => x.value))).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (client && form && (location.state as { edit?: boolean } | null)?.edit) {
      setEditing(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [client, form, location.state, location.pathname, navigate]);

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !id) return;
    setSaveError('');
    try {
      await api(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(form) });
      setEditing(false);
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('common.error'));
      await alertCinDuplicate(err);
    }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const fd = new FormData();
    fd.append('file', file);
    await uploadForm(`/clients/${id}/photo`, fd);
    load();
    e.target.value = '';
  }

  async function linkMandant(mandantId: string) {
    if (!mandantId || !id) return;
    await api(`/clients/${id}/mandants`, { method: 'POST', body: JSON.stringify({ mandantId }) });
    load();
  }

  async function unlinkMandant(mandantId: string) {
    if (!id) return;
    await api(`/clients/${id}/mandants/${mandantId}`, { method: 'DELETE' });
    load();
  }

  async function onUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !id) return;
    try {
      await uploadDocument(file, { name: file.name, category: 'cin', clientId: id, entityType: 'client', entityId: id });
      setDocReload((n) => n + 1);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openPayModal() {
    const clientSales = ((client?.sales || []) as { id: string; remaining: number; propertyId?: string; property?: { id?: string } }[])
      .filter((s) => !propertyFilter || s.propertyId === propertyFilter || s.property?.id === propertyFilter);
    const clientRentals = ((client?.rentals || []) as { id: string; remaining: number; propertyId?: string; property?: { id?: string } }[])
      .filter((r) => !propertyFilter || r.propertyId === propertyFilter || r.property?.id === propertyFilter);
    const payableSales = clientSales.filter((s) => Number(s.remaining) > 0);
    const payableRentals = clientRentals.filter((r) => Number(r.remaining) > 0);
    const preferLocation = payableSales.length === 0 && payableRentals.length > 0;
    const next = emptyPaymentForm();
    next.txType = preferLocation ? 'location' : 'vente';
    next.saleId = preferLocation ? '' : (payableSales[0]?.id || '');
    next.rentalId = preferLocation ? (payableRentals[0]?.id || '') : '';
    next.payerName = client
      ? `${client.firstName || ''} ${client.lastName || ''}`.trim()
      : '';
    setPayForm(next);
    setPayError('');
    setPayOpen(true);
  }

  async function savePayment(e: React.FormEvent) {
    e.preventDefault();
    setPayError('');
    if (payForm.txType === 'vente' && !payForm.saleId) {
      setPayError(`${t('fields.selectSale')}.`);
      return;
    }
    if (payForm.txType === 'location' && !payForm.rentalId) {
      setPayError(`${t('fields.selectRental')}.`);
      return;
    }
    try {
      if (payForm.proofFileObj) {
        await uploadForm('/transactions/payments', paymentFormToFormData(payForm, false));
      } else {
        await api('/transactions/payments', {
          method: 'POST',
          body: JSON.stringify(paymentFormToCreateBody(payForm)),
        });
      }
      setPayOpen(false);
      setPayForm(emptyPaymentForm());
      load();
    } catch (err) {
      setPayError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function sendNotify(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !notifyMessage.trim()) return;
    setNotifyResult('');
    try {
      const res = await api<{ simulated?: boolean }>(`/clients/${id}/notify`, {
        method: 'POST',
        body: JSON.stringify({
          channel: notifyChannel,
          subject: notifySubject,
          message: notifyMessage,
        }),
      });
      setNotifyResult(res.simulated ? 'Message simulé (voir console serveur)' : t('msg.messageSent'));
      setNotifyMessage('');
      load();
    } catch (err) {
      setNotifyResult(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!id || !deleteMotif.trim()) return;
    try {
      await api(`/clients/${id}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      navigate('/clients');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function toggleArchive() {
    if (!id) return;
    if (client?.isArchived) {
      await api(`/clients/${id}/unarchive`, { method: 'POST' });
      load();
      return;
    }
    if (!archiveMotif.trim()) return;
    await api(`/clients/${id}/archive`, { method: 'POST', body: JSON.stringify({ motif: archiveMotif }) });
    setArchiveOpen(false);
    setArchiveMotif('');
    load();
  }

  function openPrint() {
    if (!client) return;
    setPrintOpen(true);
  }

  if (!client || !form) {
    return <p className="text-[12px] text-gic-muted p-6 text-center">{t('msg.loadingClient')}</p>;
  }

  const salesAll = client.sales || [];
  const rentalsAll = client.rentals || [];
  const docs = client.documents || [];
  const propertiesAll = client.properties || [];
  const paymentsAll = client.allPayments || [];
  const matchProperty = (propertyId?: string | null) => !propertyFilter || propertyId === propertyFilter;
  const sales = salesAll.filter((s: any) => matchProperty(s.propertyId || s.property?.id));
  const rentals = rentalsAll.filter((r: any) => matchProperty(r.propertyId || r.property?.id));
  const properties = propertiesAll.filter((p: any) => !propertyFilter || p.id === propertyFilter);
  const payments = paymentsAll.filter((p: any) => matchProperty(p.propertyId));
  const linkedMandants = (client.mandants || []).map((m: any) => m.mandant);
  const summary = client.summary || {};
  const source = client.source || null;
  const safeSaleIdx = sales.length ? Math.min(saleIdx, sales.length - 1) : 0;
  const safeRentalIdx = rentals.length ? Math.min(rentalIdx, rentals.length - 1) : 0;
  const currentSale = sales[safeSaleIdx];
  const currentRental = rentals[safeRentalIdx];
  const isDossierComplet = Boolean(
    client.identityNumber && client.email && client.phone1 && client.agentId && docs.length > 0
  );
  const recentPayments = payments.slice(0, 5);
  const canAddPayment =
    salesAll.some((s: any) => Number(s.remaining) > 0) ||
    rentalsAll.some((r: any) => Number(r.remaining) > 0);
  const payProgress = summary.totalContracted > 0
    ? Math.min(100, Math.round((summary.totalPaid / summary.totalContracted) * 100))
    : 0;
  const transactions = [
    ...sales.map((s: any) => ({
      id: s.id, type: 'vente' as const, ref: s.reference, bien: s.property?.name,
      montant: s.netPrice, paye: s.totalPaid, reste: s.remaining, statut: s.status,
      link: `/ventes/${s.id}`,
    })),
    ...rentals.map((r: any) => ({
      id: r.id, type: 'location' as const, ref: r.reference, bien: r.property?.name,
      montant: r.monthlyRent, paye: r.totalPaid, reste: r.remaining, statut: r.status,
      link: `/locations/${r.id}`,
    })),
  ];

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/clients" />
        <div className="mac-detail-hero-main">
          <MacProfilePhoto
            photo={client.photo}
            firstName={client.firstName}
            lastName={client.lastName}
            editable
            onFileChange={onPhoto}
          />
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.client360')}</p>
            <h1 className="mac-detail-name truncate">{client.firstName} {client.lastName}</h1>
            <p className="mac-detail-meta">
              {client.reference} · {t('fields.clientSince')} {formatDate(client.createdAt)}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {client.isBuyer && <span className="mac-chip mac-chip-green">{t('fields.buyer')}</span>}
              {client.isTenant && <span className="mac-chip mac-chip-blue">{t('fields.tenant')}</span>}
              {client.isProspect && <span className="mac-chip mac-chip-orange">{t('fields.prospect')}</span>}
              {client.isArchived && <span className="mac-chip mac-chip-gray">{t('status.archived')}</span>}
              {isDossierComplet && (
                <span className="mac-chip mac-chip-blue">
                  <CheckCircle2 size={11} /> {t('status.complete')}
                </span>
              )}
            </div>
            {client.agent && (
              <p className="mac-detail-meta mt-2">
                {t('fields.agent')} : <span className="text-gic-ink font-medium">{client.agent.firstName} {client.agent.lastName}</span>
              </p>
            )}
          </div>
        </div>
        <div className="mac-page-actions">
          {!editing ? (
            <>
              <Btn variant="secondary" icon={Mail} onClick={() => { setNotifyOpen(true); setNotifyResult(''); }}>{t('actions.contact')}</Btn>
              {client.isArchived ? (
                <Btn variant="secondary" icon={ArchiveRestore} onClick={toggleArchive}>{t('actions.restore')}</Btn>
              ) : (
                <Btn variant="secondary" icon={Archive} onClick={() => setArchiveOpen(true)}>{t('actions.archive')}</Btn>
              )}
              <div className="mac-action-group ml-0.5">
                <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={openPrint} />
                <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => setEditing(true)} />
                <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => setDeleteOpen(true)} />
              </div>
                         </>
          ) : (
            <>
              <Btn variant="secondary" icon={X} onClick={() => { setEditing(false); setForm(clientToForm(client)); }}>{t('common.cancel')}</Btn>
              <Btn icon={Save} form="edit-client-form" type="submit">{t('common.save')}</Btn>
            </>
          )}
        </div>
      </div>

      <div className="mac-kpi-grid mb-4">
        <KpiCard title={t('dashboard.contractedSales')} value={formatMad(summary.totalContracted)} icon={TrendingUp} tone="violet" />
        <KpiCard title={t('fields.collected')} value={formatMad(summary.totalPaid)} icon={Wallet} tone="emerald" />
        <KpiCard title={t('dashboard.toCollect')} value={formatMad(summary.totalRemaining)} icon={FileText} tone="coral" />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={setTab}
            ariaLabel={t('detail.sectionsClientAria')}
            groups={[
              {
                id: 'pilotage',
                label: t('tabs.pilotage'),
                items: [
                  { id: 'vue', label: t('tabs.generalView'), icon: LayoutDashboard },
                ],
              },
              {
                id: 'transactions',
                label: t('tabs.transactions'),
                items: [
                  { id: 'ventes', label: t('tabs.sales'), icon: Home, badge: salesAll.length },
                  { id: 'locations', label: t('tabs.rentals'), icon: KeyRound, badge: rentalsAll.length },
                  { id: 'biens', label: t('tabs.properties'), icon: Building2, badge: propertiesAll.length },
                  { id: 'paiements', label: t('tabs.payments'), icon: Wallet, badge: paymentsAll.length },
                ],
              },
              {
                id: 'relations',
                label: t('tabs.relations'),
                items: [
                  { id: 'mandants', label: t('tabs.mandants'), icon: Users, badge: linkedMandants.length },
                  { id: 'agent', label: t('tabs.agent'), icon: Briefcase, badge: agentHistory.length },
                  { id: 'echanges', label: t('tabs.exchanges'), icon: MessageCircle },
                ],
              },
              {
                id: 'documents',
                label: t('tabs.documents'),
                items: [
                  { id: 'documents', label: t('tabs.documents'), icon: FileText, badge: docs.length },
                ],
              },
              {
                id: 'suivi',
                label: t('tabs.followUp'),
                items: [
                  { id: 'historique', label: t('tabs.history'), icon: History },
                ],
              },
            ]}
          />
        }
      >
        {propertiesAll.length > 1 && ['vue', 'ventes', 'locations', 'biens', 'paiements'].includes(tab) && (
          <div className="mb-3 max-w-md">
            <Select
              label={t('fields.property')}
              value={propertyFilter}
              onChange={(e) => {
                setPropertyFilter(e.target.value);
                setSaleIdx(0);
                setRentalIdx(0);
              }}
            >
              <option value="">{t('common.allProperties')}</option>
              {propertiesAll.map((p: { id: string; reference?: string; name?: string }) => (
                <option key={p.id} value={p.id}>
                  {p.reference ? `${p.reference} — ${p.name || ''}` : (p.name || p.id)}
                </option>
              ))}
            </Select>
          </div>
        )}
        {tab === 'vue' && (
          editing ? (
            <form id="edit-client-form" onSubmit={saveEdit}>
              <ClientFormFields form={form} setForm={setForm} agents={agents} identityTypes={identityTypes} sourceOptions={sourceOptions} />
              {saveError && <p className="mt-3 text-[11px] text-gic-coral">{saveError}</p>}
            </form>
          ) : (
            <div className="space-y-4 mt-1">
              {/* Ligne 1 — Identité + Relation commerciale */}
              <div className="grid lg:grid-cols-2 gap-4">
                <SectionCard title={t('detail.identityContact')} icon={User}>
                  <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
                    <InfoRow icon={Hash} label={t('fields.reference')} value={client.reference} />
                    <InfoRow icon={User} label={t('fields.fullName')} value={`${client.firstName} ${client.lastName}`} />
                    <InfoRow icon={Calendar} label={t('fields.birthDate')} value={client.birthDate ? formatDate(client.birthDate) : '—'} />
                    <InfoRow icon={FileText} label={t('fields.identityType')} value={`${client.identityType || 'CIN'} — ${client.identityNumber || '—'}`} />
                    <InfoRow icon={Hash} label={t('fields.nb')} value={client.nb || '—'} />
                    <InfoRow icon={Mail} label={t('fields.email')} value={client.email} />
                    <InfoRow icon={Phone} label={t('fields.phone1')} value={client.phone1} />
                    {client.phone2 && <InfoRow icon={Phone} label={t('fields.phone2')} value={client.phone2} />}
                    <InfoRow icon={MapPin} label={t('fields.address')} value={client.address || '—'} className="sm:col-span-2" />
                    <InfoRow icon={Hash} label={t('fields.bank')} value={client.bankName || '—'} />
                    <InfoRow icon={Hash} label={t('fields.rib')} value={client.rib || '—'} />
                  </div>
                </SectionCard>

                <SectionCard title={t('detail.commercialRelation')} icon={Briefcase}>
                  <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
                    <div className="sm:col-span-2">
                      <p className="mac-info-label">{t('fields.classification')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {client.isBuyer && <span className="mac-chip mac-chip-green">{t('fields.buyer')}</span>}
                        {client.isTenant && <span className="mac-chip mac-chip-blue">{t('fields.tenant')}</span>}
                        {client.isProspect && <span className="mac-chip mac-chip-orange">{t('fields.prospect')}</span>}
                        {!client.isBuyer && !client.isTenant && !client.isProspect && (
                          <span className="text-[12px] text-gic-muted">{t('msg.unclassified')}</span>
                        )}
                      </div>
                    </div>
                    <InfoRow label={t('fields.source')} value={source || '—'} />
                    <InfoRow label={t('fields.agentAssigned')} value={
                      client.agent ? (
                        <Link to={`/agents/${client.agent.id}`} className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1">
                          {client.agent.firstName} {client.agent.lastName}
                          <ExternalLink size={10} />
                        </Link>
                      ) : '—'
                    } />
                    <InfoRow label={t('fields.clientSince')} value={formatDate(client.createdAt)} />
                    <InfoRow label={t('fields.lastUpdated')} value={formatDate(client.updatedAt)} />
                    {client.remark && (
                      <div className="sm:col-span-2 pt-2 border-t border-black/[0.06]">
                        <p className="mac-info-label">{t('fields.remark')}</p>
                        <p className="mac-info-value !font-normal text-gic-muted whitespace-pre-wrap">{client.remark}</p>
                      </div>
                    )}
                  </div>
                </SectionCard>
              </div>

              {/* Ligne 2 — Synthèse financière */}
              <SectionCard
                title={t('detail.financialSummary')}
                icon={Wallet}
                action={<TabLink onClick={() => setTab('paiements')}>{t('detail.paymentHistory')}</TabLink>}
              >
                {summary.totalContracted > 0 ? (
                  <div>
                    <div className="flex items-baseline justify-between gap-3 mb-2">
                      <span className="text-[13px] text-gic-ink font-medium tracking-tight">
                        {payProgress}&nbsp;% {t('fields.collected').toLowerCase()}
                      </span>
                      <span className="text-[12px] text-gic-muted tabular-nums">
                        {formatMad(summary.totalPaid)}
                        <span className="text-[#c7c7cc]"> / </span>
                        {formatMad(summary.totalContracted)}
                      </span>
                    </div>
                    <div className="mac-progress">
                      <div className="mac-progress-bar" style={{ width: `${payProgress}%` }} />
                    </div>
                    <p className="mt-2.5 text-[12px] text-gic-muted">
                      {sales.length} vente{sales.length > 1 ? 's' : ''}
                      <span className="text-[#c7c7cc]"> · </span>
                      {rentals.length} location{rentals.length > 1 ? 's' : ''}
                      <span className="text-[#c7c7cc]"> · </span>
                      {propertiesAll.length} bien{propertiesAll.length > 1 ? 's' : ''}
                    </p>
                  </div>
                ) : (
                  <p className="text-[12px] text-gic-muted">{t('msg.emptyContractsHint')}</p>
                )}
              </SectionCard>

              {/* Transactions pleine largeur */}
              <SectionCard
                title={t('tabs.transactions')}
                icon={TrendingUp}
                action={<TabLink onClick={() => setTab('ventes')}>{t('common.seeAll')}</TabLink>}
              >
                {transactions.length === 0 ? (
                  <EmptyBlock message={t('msg.emptySalesAndRentals')} />
                ) : (
                  <TableWrap mac>
                    <thead>
                      <tr>
                        <Th mac>{t('columns.type')}</Th>
                        <Th mac>{t('columns.ref')}</Th>
                        <Th mac>{t('columns.property')}</Th>
                        <Th mac>{t('columns.amount')}</Th>
                        <Th mac>{t('columns.paid')}</Th>
                        <Th mac>{t('columns.remaining')}</Th>
                        <Th mac>{t('columns.status')}</Th>
                        <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={`${tx.type}-${tx.id}`}>
                          <Td mac>
                            <span className={`mac-chip ${tx.type === 'vente' ? 'mac-chip-blue' : 'mac-chip-green'}`}>
                              {tx.type}
                            </span>
                          </Td>
                          <Td mac className="font-medium">{tx.ref}</Td>
                          <Td mac className="mac-table-muted max-w-[140px] truncate">{tx.bien || '—'}</Td>
                          <Td mac>{formatMad(tx.montant)}</Td>
                          <Td mac className="text-gic-emerald">{formatMad(tx.paye)}</Td>
                          <Td mac className="text-gic-coral">{formatMad(tx.reste ?? 0)}</Td>
                          <Td mac><StatusPill status={tx.statut} quiet /></Td>
                          <Td mac className="mac-td-actions">
                            <Link to={tx.link} className="mac-table-action inline-flex items-center gap-0.5">
                              {t('common.view')} <ChevronRight size={12} />
                            </Link>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
              </SectionCard>

              {/* Paiements · Documents · Mandants — 3 colonnes */}
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                <SectionCard
                  title={t('detail.recentPayments')}
                  icon={CreditCard}
                  action={
                    <span className="inline-flex items-center gap-2">
                      {canAddPayment && (
                        <button type="button" className="mac-section-card-action inline-flex items-center gap-1" onClick={openPayModal}>
                          <Plus size={12} /> {t('common.new')}
                        </button>
                      )}
                      {payments.length > 0 ? <TabLink onClick={() => setTab('paiements')}>{t('common.seeAll')}</TabLink> : null}
                    </span>
                  }
                >
                  {recentPayments.length === 0 ? (
                    <EmptyBlock message={t('msg.emptyPayments')} />
                  ) : (
                    <div>
                      {recentPayments.slice(0, 4).map((p: any) => (
                        <div key={p.id} className="mac-side-row">
                          <div className="min-w-0">
                            <p className="mac-info-value">{formatMad(p.amount)}</p>
                            <p className="mac-info-label !mb-0 mt-0.5 capitalize">
                              {p.nature || p.type} · {p.receiptNo || p.reference || p.mode || p.operationType || '—'}
                            </p>
                          </div>
                          <span className="text-[11px] text-gic-muted shrink-0">{formatDate(p.date)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title={t('tabs.documents')}
                  icon={FileText}
                  action={docs.length > 0 ? <TabLink onClick={() => setTab('documents')}>{t('common.manage')}</TabLink> : undefined}
                >
                  {docs.length === 0 ? (
                    <EmptyBlock
                      message={t('msg.emptyDocuments')}
                      action={
                        <DocumentFileActions
                          labelClassName="mac-section-card-action cursor-pointer inline-flex items-center gap-1"
                          accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
                          onChange={onUploadDoc}
                        >
                          <Plus size={12} /> {t('common.add')}
                        </DocumentFileActions>
                      }
                    />
                  ) : (
                    <div>
                      {docs.slice(0, 4).map((d: any) => (
                        <div key={d.id} className="mac-side-row items-center">
                          <div className="min-w-0 flex-1">
                            <p className="mac-info-value truncate">{d.name}</p>
                            {d.category && <p className="mac-info-label !mb-0 capitalize">{d.category}</p>}
                          </div>
                          <a href={d.path} target="_blank" rel="noreferrer" className="mac-table-action shrink-0">{t('common.view')}</a>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title={t('detail.linkedMandants')}
                  icon={Users}
                  action={linkedMandants.length > 0 ? <TabLink onClick={() => setTab('mandants')}>{t('common.manage')}</TabLink> : undefined}
                >
                  {linkedMandants.length === 0 ? (
                    <EmptyBlock message={t('msg.emptyMandants')} action={<TabLink onClick={() => setTab('mandants')}>{t('actions.linkMandant')}</TabLink>} />
                  ) : (
                    <div>
                      {linkedMandants.slice(0, 4).map((m: any) => (
                        <Link key={m.id} to={`/mandants/${m.id}`} className="mac-side-row items-center group">
                          <div className="min-w-0">
                            <p className="mac-info-value">{m.firstName} {m.lastName}</p>
                            <p className="mac-info-label !mb-0">{m.identityNumber || m.reference || '—'}</p>
                          </div>
                          <ChevronRight size={14} className="text-gic-muted group-hover:text-[#007aff] shrink-0" />
                        </Link>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>
            </div>
          )
        )}

        {tab === 'ventes' && (
          sales.length === 0 ? <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptySalesShort')}</p> : (
            <div className="space-y-3">
              {sales.length > 1 && (
                <LinkedPager
                  label={t('fields.sale')}
                  index={safeSaleIdx}
                  total={sales.length}
                  onPrev={() => setSaleIdx((i) => (i <= 0 ? sales.length - 1 : i - 1))}
                  onNext={() => setSaleIdx((i) => (i >= sales.length - 1 ? 0 : i + 1))}
                  onSelect={setSaleIdx}
                />
              )}
              {currentSale && (
                <div className="mac-section-card">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <p className="text-[13px] font-medium text-gic-ink">{currentSale.reference}</p>
                      <p className="text-[12px] text-gic-muted">{currentSale.property?.name || '—'}</p>
                    </div>
                    <StatusPill status={currentSale.status} quiet />
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3 text-[12px] mb-3">
                    <div><p className="mac-info-label">{t('fields.netPrice')}</p><p className="mac-info-value">{formatMad(currentSale.netPrice)}</p></div>
                    <div><p className="mac-info-label">{t('columns.paid')}</p><p className="mac-info-value text-gic-emerald">{formatMad(currentSale.totalPaid)}</p></div>
                    <div><p className="mac-info-label">{t('fields.remaining')}</p><p className="mac-info-value text-gic-coral">{formatMad(currentSale.remaining)}</p></div>
                  </div>
                  <Link to={`/ventes/${currentSale.id}`} className="mac-table-action inline-flex items-center gap-0.5">
                    {t('actions.openFiche')} <ChevronRight size={12} />
                  </Link>
                </div>
              )}
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>#</Th>
                    <Th mac>{t('columns.ref')}</Th>
                    <Th mac>{t('columns.property')}</Th>
                    <Th mac>{t('columns.netPrice')}</Th>
                    <Th mac>{t('columns.paid')}</Th>
                    <Th mac>{t('columns.remaining')}</Th>
                    <Th mac>{t('columns.status')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s: any, i: number) => (
                    <tr key={s.id} className={i === safeSaleIdx ? 'bg-[#007aff]/05' : undefined} onClick={() => setSaleIdx(i)}>
                      <Td mac className="mac-table-muted">{i + 1}</Td>
                      <Td mac className="font-medium">{s.reference}</Td>
                      <Td mac className="mac-table-muted">{s.property?.name || '—'}</Td>
                      <Td mac>{formatMad(s.netPrice)}</Td>
                      <Td mac className="text-gic-emerald">{formatMad(s.totalPaid)}</Td>
                      <Td mac className="text-gic-coral">{formatMad(s.remaining)}</Td>
                      <Td mac><StatusPill status={s.status} quiet /></Td>
                      <Td mac className="mac-td-actions">
                        <Link to={`/ventes/${s.id}`} className="mac-table-action inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                          {t('common.view')} <ChevronRight size={12} />
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          )
        )}

        {tab === 'locations' && (
          rentals.length === 0 ? <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyRentalsShort')}</p> : (
            <div className="space-y-3">
              {rentals.length > 1 && (
                <LinkedPager
                  label={t('fields.rental')}
                  index={safeRentalIdx}
                  total={rentals.length}
                  onPrev={() => setRentalIdx((i) => (i <= 0 ? rentals.length - 1 : i - 1))}
                  onNext={() => setRentalIdx((i) => (i >= rentals.length - 1 ? 0 : i + 1))}
                  onSelect={setRentalIdx}
                />
              )}
              {currentRental && (
                <div className="mac-section-card">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <p className="text-[13px] font-medium text-gic-ink">{currentRental.reference}</p>
                      <p className="text-[12px] text-gic-muted">{currentRental.property?.name || '—'}</p>
                    </div>
                    <StatusPill status={currentRental.status} quiet />
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3 text-[12px] mb-3">
                    <div><p className="mac-info-label">{t('rental.monthlyAmount')}</p><p className="mac-info-value">{formatMad(currentRental.monthlyRent)}</p></div>
                    <div><p className="mac-info-label">{t('columns.paid')}</p><p className="mac-info-value text-gic-emerald">{formatMad(currentRental.totalPaid)}</p></div>
                    <div><p className="mac-info-label">{t('fields.remaining')}</p><p className="mac-info-value text-gic-coral">{formatMad(currentRental.remaining)}</p></div>
                  </div>
                  <Link to={`/locations/${currentRental.id}`} className="mac-table-action inline-flex items-center gap-0.5">
                    {t('actions.openFiche')} <ChevronRight size={12} />
                  </Link>
                </div>
              )}
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>#</Th>
                    <Th mac>{t('columns.ref')}</Th>
                    <Th mac>{t('columns.property')}</Th>
                    <Th mac>{t('columns.monthly')}</Th>
                    <Th mac>{t('columns.paid')}</Th>
                    <Th mac>{t('columns.remaining')}</Th>
                    <Th mac>{t('columns.status')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {rentals.map((r: any, i: number) => (
                    <tr key={r.id} className={i === safeRentalIdx ? 'bg-[#007aff]/05' : undefined} onClick={() => setRentalIdx(i)}>
                      <Td mac className="mac-table-muted">{i + 1}</Td>
                      <Td mac className="font-medium">{r.reference}</Td>
                      <Td mac className="mac-table-muted">{r.property?.name || '—'}</Td>
                      <Td mac>{formatMad(r.monthlyRent)}</Td>
                      <Td mac className="text-gic-emerald">{formatMad(r.totalPaid)}</Td>
                      <Td mac className="text-gic-coral">{formatMad(r.remaining)}</Td>
                      <Td mac><StatusPill status={r.status} quiet /></Td>
                      <Td mac className="mac-td-actions">
                        <Link to={`/locations/${r.id}`} className="mac-table-action inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                          {t('common.view')} <ChevronRight size={12} />
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          )
        )}

        {tab === 'biens' && (
          properties.length === 0 ? <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyProperties')}</p> : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.property')}</Th>
                  <Th mac>{t('columns.link')}</Th>
                  <Th mac>{t('columns.saleContract')}</Th>
                  <Th mac>{t('columns.net')}</Th>
                  <Th mac>{t('columns.paid')}</Th>
                  <Th mac>{t('columns.remaining')}</Th>
                  <Th mac>{t('columns.status')}</Th>
                  <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {properties.map((p: any) => (
                  <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/biens/${p.id}`)}>
                    <Td mac>
                      <span className="mac-table-ref">{p.reference}</span>
                      <span className="block font-medium">{p.name}</span>
                      <span className="block text-[10px] text-gic-muted">
                        {[p.city, p.surface != null ? `${p.surface} m²` : null, p.rooms != null ? `${p.rooms} p.` : null]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </span>
                    </Td>
                    <Td mac>
                      <span className={`mac-chip ${p.relation === 'achat' ? 'mac-chip-emerald' : 'mac-chip-blue'}`}>
                        {p.relation === 'achat' ? 'Achat' : t('create.rental')}
                      </span>
                    </Td>
                    <Td mac>
                      {p.saleId ? (
                        <Link to={`/ventes/${p.saleId}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>
                          {p.saleReference}
                        </Link>
                      ) : p.rentalId ? (
                        <Link to={`/locations/${p.rentalId}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>
                          {p.rentalReference}
                        </Link>
                      ) : '—'}
                      {p.contractDate && (
                        <span className="block text-[10px] text-gic-muted">{formatDate(p.contractDate)}</span>
                      )}
                    </Td>
                    <Td mac>{p.netPrice != null ? formatMad(p.netPrice) : '—'}</Td>
                    <Td mac className="text-gic-emerald">{p.totalPaid != null ? formatMad(p.totalPaid) : '—'}</Td>
                    <Td mac className="text-gic-coral">{p.remaining != null && p.remaining > 0 ? formatMad(p.remaining) : '—'}</Td>
                    <Td mac><StatusPill status={p.saleStatus || p.status} quiet /></Td>
                    <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/biens/${p.id}`} className="mac-table-action inline-flex items-center gap-0.5">
                        {t('actions.openFiche')} <ChevronRight size={12} />
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )
        )}

        {tab === 'paiements' && (
          <div className="mt-1">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-[13px] font-medium text-gic-ink tracking-tight">{t('detail.paymentHistory')}</p>
              <div className="flex items-center gap-2">
                {payments.length > 0 && (
                  <Btn
                    variant="secondary"
                    icon={Printer}
                    onClick={() => printPaymentsReceipt({
                      clientName: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
                      lines: payments.map((p: any) => ({
                        receiptNo: p.receiptNo || p.reference,
                        date: p.date,
                        amount: p.amount,
                        operationType: p.mode || p.operationType,
                        nature: p.nature,
                        ref: p.ref,
                        propertyName: p.propertyName,
                        type: p.type,
                      })),
                    })}
                  >
                    {t('actions.printAllReceipts')}
                  </Btn>
                )}
                {canAddPayment && (
                  <Btn icon={Wallet} onClick={openPayModal}>{t('actions.newPayment')}</Btn>
                )}
              </div>
            </div>
            {payments.length === 0 ? (
              <p className="text-[12px] text-gic-muted py-6 text-center">
                {canAddPayment
                  ? t('msg.emptyPaymentsHint')
                  : t('msg.emptyPayments')}
              </p>
            ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.date')}</Th>
                  <Th mac>{t('columns.type')}</Th>
                  <Th mac>{t('rental.monthPaid')}</Th>
                  <Th mac>{t('columns.propertyRef')}</Th>
                  <Th mac>{t('columns.amount')}</Th>
                  <Th mac>{t('columns.mode')}</Th>
                  <Th mac>{t('columns.bank')}</Th>
                  <Th mac>{t('columns.proof')}</Th>
                  <Th mac>{t('columns.receipt')}</Th>
                  <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/encaissements/${p.id}`)}>
                    <Td mac className="mac-table-muted whitespace-nowrap">{formatDate(p.date)}</Td>
                    <Td mac className="capitalize">{p.type}</Td>
                    <Td mac className="mac-table-muted">{p.nature || '—'}</Td>
                    <Td mac>
                      <span className="mac-table-ref">{p.ref}</span>
                      {p.propertyName && <span className="block text-[10px] text-gic-muted">{p.propertyName}</span>}
                    </Td>
                    <Td mac className="font-medium">{formatMad(p.amount)}</Td>
                    <Td mac>{paymentModeLabel(p.mode || p.operationType)}</Td>
                    <Td mac className="mac-table-muted">
                      {isBankPaymentMode(p.mode || p.operationType) ? (p.bank || '—') : '—'}
                    </Td>
                    <Td mac onClick={(e) => e.stopPropagation()}>
                      {p.proofFile ? (
                        <a href={fileUrl(p.proofFile)} target="_blank" rel="noreferrer" className="text-[#007aff] hover:opacity-70">
                          {t('common.view')}
                        </a>
                      ) : (
                        <span className="mac-table-muted">—</span>
                      )}
                    </Td>
                    <Td mac className="mac-table-muted">{p.reference || p.receiptNo || '—'}</Td>
                    <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                      <MacActionBtn
                        icon={Printer}
                        tone="gray"
                        title={t('actions.printReceipt')}
                        onClick={() => printPaymentReceipt({
                          ...p,
                          receiptNo: p.receiptNo || p.reference,
                          propertyName: p.propertyName,
                          sale: p.type === 'vente' ? { reference: p.ref, client } : null,
                          rental: p.type === 'location' ? { reference: p.ref, client } : null,
                        })}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            )}
          </div>
        )}

        {tab === 'mandants' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] text-gic-muted">
                {linkedMandants.length} mandant{linkedMandants.length > 1 ? 's' : ''} rattaché{linkedMandants.length > 1 ? 's' : ''}
              </p>
              <MandantLinkPicker
                excludeIds={linkedMandants.map((m: { id: string }) => m.id)}
                onLink={linkMandant}
              />
            </div>
            <div className="mac-section-card !p-0 overflow-hidden">
              {linkedMandants.map((m: any) => (
                <div key={m.id} className="mac-row">
                  <div className="min-w-0">
                    <p className="mac-row-title">{m.firstName} {m.lastName}</p>
                    <p className="mac-row-subtitle">{m.identityNumber || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link to={`/mandants/${m.id}`} className="mac-table-action">{t('actions.openFiche')}</Link>
                    <MacActionBtn icon={Trash2} tone="red" title={t('common.remove')} onClick={() => unlinkMandant(m.id)} />
                  </div>
                </div>
              ))}
              {linkedMandants.length === 0 && (
                <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyMandants')}</p>
              )}
            </div>
          </div>
        )}

        {tab === 'documents' && id && (
          <div className="space-y-3">
            <EntityDocChecklist
              entityType="client"
              entityId={id}
              extra={{ clientId: id }}
              reloadToken={docReload}
              onChanged={load}
            />
          </div>
        )}

        {tab === 'agent' && (
          agentHistory.length === 0 ? (
            <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyHistory')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.date')}</Th>
                  <Th mac>{t('columns.oldAgent')}</Th>
                  <Th mac>{t('columns.newAgentLabel')}</Th>
                  <Th mac>{t('columns.by')}</Th>
                </tr>
              </thead>
              <tbody>
                {agentHistory.map((h) => (
                  <tr key={h.id}>
                    <Td mac className="mac-table-muted">{formatDate(h.createdAt)}</Td>
                    <Td mac>{h.previousAgentName || '—'}</Td>
                    <Td mac className="font-medium">{h.newAgentName || '—'}</Td>
                    <Td mac className="mac-table-muted">{h.changedBy || t('common.system')}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )
        )}

        {tab === 'historique' && (
          history.length === 0 ? <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyHistory')}</p> : (
            <div className="mac-section-card !p-0 overflow-hidden">
              {history.map((h) => (
                <div key={h.id} className="mac-row">
                  <div className="min-w-0">
                    <p className="mac-row-title capitalize">{h.action}</p>
                    {h.details && <p className="mac-row-subtitle">{h.details}</p>}
                  </div>
                  <div className="mac-row-meta shrink-0 text-right">
                    <p className="mac-row-meta-value">{formatDate(h.createdAt)}</p>
                    <p className="mac-row-subtitle !mt-0">{h.user ? `${h.user.firstName} ${h.user.lastName}` : t('common.system')}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'echanges' && id && (
          <ConversationsPanel
            entityType="Client"
            entityId={id}
            defaultEmail={client.email}
            defaultPhone={client.phone1}
          />
        )}
      </DetailShell>

      <Modal open={archiveOpen} title={t('actions.archiveClient')} onClose={() => setArchiveOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setArchiveOpen(false)}>{t('common.cancel')}</Btn><Btn onClick={toggleArchive} disabled={!archiveMotif.trim()}>{t('actions.archive')}</Btn></>}>
        <p className="text-[12px] text-gic-muted mb-3">Le client sera masqué des listes actives mais restera consultable via le filtre « Archivés ».</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" value={archiveMotif} onChange={(e) => setArchiveMotif(e.target.value)} placeholder={t('msg.motifArchivePlaceholder')} />
      </Modal>

      <Modal
        open={payOpen}
        title={t('actions.newPayment')}
        onClose={() => setPayOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPayOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="client-pay-form" type="submit">{t('common.validate')}</Btn>
          </>
        }
      >
        <form id="client-pay-form" onSubmit={savePayment} className="space-y-3">
          {payError && <p className="text-[12px] text-gic-coral">{payError}</p>}
          <PaymentFormFields
            form={payForm}
            setForm={setPayForm}
            sales={propertyFilter ? sales : salesAll}
            rentals={propertyFilter ? rentals : rentalsAll}
          />
        </form>
      </Modal>

      <Modal open={deleteOpen} title={t('actions.deleteClient')} onClose={() => setDeleteOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn></>}>
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.clientDeleteBlocked')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} placeholder={t('msg.motifShortPlaceholder')} />
      </Modal>

      <Modal
        open={notifyOpen}
        title={t('actions.contactClient')}
        onClose={() => setNotifyOpen(false)}
        footer={<Btn form="notify-form" type="submit">{t('actions.send')}</Btn>}
      >
        <form id="notify-form" onSubmit={sendNotify} className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Btn type="button" variant={notifyChannel === 'email' ? 'primary' : 'secondary'} icon={Mail} onClick={() => setNotifyChannel('email')}>{t('fields.email')}</Btn>
            <Btn type="button" variant={notifyChannel === 'sms' ? 'primary' : 'secondary'} icon={MessageCircle} onClick={() => setNotifyChannel('sms')}>SMS</Btn>
            <Btn type="button" variant={notifyChannel === 'whatsapp' ? 'primary' : 'secondary'} icon={MessageCircle} onClick={() => setNotifyChannel('whatsapp')}>WhatsApp</Btn>
          </div>
          <p className="text-[11px] text-gic-muted">
            {t('fields.recipient')} : {notifyChannel === 'email' ? client.email : client.phone1}
          </p>
          {notifyChannel === 'email' && (
            <input
              className="w-full rounded-xl border border-gic-border px-3 py-2 text-[12px]"
              placeholder={t('fields.subject')}
              value={notifySubject}
              onChange={(e) => setNotifySubject(e.target.value)}
            />
          )}
          <textarea
            className="w-full h-28 rounded-xl border border-gic-border p-3 text-[12px]"
            placeholder={t('msg.yourMessage')}
            required
            value={notifyMessage}
            onChange={(e) => setNotifyMessage(e.target.value)}
          />
          {notifyResult && (
            <p className={`text-[11px] ${notifyResult === t('msg.messageSent') || notifyResult.includes('simulé') ? 'text-gic-emerald' : 'text-gic-coral'}`}>
              {notifyResult}
            </p>
          )}
        </form>
      </Modal>

      <PrintChoiceModal
        open={printOpen}
        title={`${client.firstName} ${client.lastName}`}
        sections={clientPrintSections()}
        onClose={() => setPrintOpen(false)}
      />
    </div>
  );

  function clientPrintSections(): PrintSection[] {
    const yesNo = (value: unknown) => (value ? t('common.yes') : t('common.no'));
    const when = (value: unknown) => (value ? formatDate(value as string) : '—');
    const lines = (count: number) => t('msg.printLines', { count });
    const empty = t('msg.noData');
    const sales = client.sales || [];
    const rentals = client.rentals || [];
    const properties = client.properties || [];
    const payments = client.allPayments || [];
    const documents = client.documents || [];
    const mandants = (client.mandants || []).map((row: any) => row.mandant).filter(Boolean);
    const summary = client.summary || {};
    return [
      {
        id: 'infos',
        label: t('tabs.informations'),
        hint: t('msg.printAllFields'),
        html: printFieldGrid([
          [t('fields.reference'), client.reference],
          [t('fields.firstName'), client.firstName],
          [t('fields.lastName'), client.lastName],
          [t('fields.identityType'), client.identityType],
          [t('fields.identityPieceNumber'), client.identityNumber],
          [t('fields.birthDate'), when(client.birthDate)],
          [t('fields.nb'), client.nb],
          [t('fields.email'), client.email],
          [t('fields.phone1'), client.phone1],
          [t('fields.phone2'), client.phone2],
          [t('fields.address'), client.address],
          [t('fields.bank'), client.bankName],
          [t('fields.rib'), client.rib],
          [t('fields.prospect'), yesNo(client.isProspect)],
          [t('fields.buyer'), yesNo(client.isBuyer)],
          [t('fields.tenant'), yesNo(client.isTenant)],
          [t('fields.associatedAgent'), client.agent ? `${client.agent.firstName} ${client.agent.lastName}` : ''],
          [t('fields.source'), client.source],
          [t('fields.remark'), client.remark],
          [t('status.archived'), yesNo(client.isArchived)],
          [t('fields.createdAt'), when(client.createdAt)],
          [t('fields.updatedAt'), when(client.updatedAt)],
        ]),
      },
      {
        id: 'synthese',
        label: t('msg.printSummary'),
        html: printFieldGrid([
          [t('dashboard.contractedSales'), formatMad(summary.totalContracted || 0)],
          [t('fields.collected'), formatMad(summary.totalPaid || 0)],
          [t('dashboard.toCollect'), formatMad(summary.totalRemaining || 0)],
          [t('tabs.sales'), summary.salesCount ?? sales.length],
          [t('tabs.rentals'), summary.rentalsCount ?? rentals.length],
          [t('tabs.payments'), summary.paymentsCount ?? payments.length],
        ]),
      },
      {
        id: 'biens',
        label: t('tabs.properties'),
        hint: lines(properties.length),
        html: printTable(
          [t('columns.ref'), t('columns.property'), t('fields.city'), t('columns.type'), t('columns.status'), t('columns.paid'), t('columns.remaining')],
          properties.map((p: any) => [p.reference, p.name, p.city, p.relation, p.status, formatMad(p.totalPaid || 0), formatMad(p.remaining || 0)]),
          empty,
        ),
      },
      {
        id: 'ventes',
        label: t('tabs.sales'),
        hint: lines(sales.length),
        html: printTable(
          [t('columns.ref'), t('columns.property'), t('columns.netPrice'), t('columns.paid'), t('columns.remaining'), t('columns.status'), t('columns.date')],
          sales.map((s: any) => [s.reference, s.property?.name, formatMad(s.netPrice), formatMad(s.totalPaid), formatMad(s.remaining), s.status, when(s.contractDate)]),
          empty,
        ),
      },
      {
        id: 'locations',
        label: t('tabs.rentals'),
        hint: lines(rentals.length),
        html: printTable(
          [t('columns.ref'), t('columns.property'), t('fields.monthlyRent'), t('columns.paid'), t('columns.remaining'), t('columns.status'), t('columns.date')],
          rentals.map((r: any) => [r.reference, r.property?.name, formatMad(r.monthlyRent), formatMad(r.totalPaid), formatMad(r.remaining), r.status, when(r.contractDate)]),
          empty,
        ),
      },
      {
        id: 'paiements',
        label: t('tabs.payments'),
        hint: lines(payments.length),
        html: printTable(
          [t('columns.date'), t('columns.type'), t('columns.ref'), t('columns.property'), t('columns.amount'), t('columns.mode'), t('columns.bank'), t('columns.receipt')],
          payments.map((p: any) => [
            when(p.date),
            p.type,
            p.ref,
            p.propertyName,
            formatMad(p.amount),
            paymentModeLabel(p.mode || p.operationType),
            p.bank,
            p.receiptNo || p.reference,
          ]),
          empty,
        ),
      },
      {
        id: 'mandants',
        label: t('tabs.mandants'),
        hint: lines(mandants.length),
        html: printTable(
          [t('columns.ref'), t('columns.name'), t('columns.cin'), t('fields.phone1'), t('fields.email')],
          mandants.map((m: any) => [m.reference, `${m.firstName || ''} ${m.lastName || ''}`.trim(), m.identityNumber, m.phone1, m.email]),
          empty,
        ),
      },
      {
        id: 'documents',
        label: t('tabs.documents'),
        hint: lines(documents.length),
        html: printTable(
          [t('columns.name'), t('columns.category'), t('columns.status'), t('fields.expirationDate')],
          documents.map((d: any) => [d.name, d.category, d.status, when(d.expiresAt)]),
          empty,
        ),
      },
      {
        id: 'agent',
        label: t('tabs.agent'),
        hint: lines(agentHistory.length),
        html: printTable(
          [t('columns.date'), t('columns.oldAgent'), t('columns.newAgentLabel'), t('columns.by')],
          agentHistory.map((h) => [when(h.createdAt), h.previousAgentName, h.newAgentName, h.changedBy]),
          empty,
        ),
      },
      {
        id: 'historique',
        label: t('tabs.history'),
        hint: lines(history.length),
        html: printTable(
          [t('columns.date'), t('columns.action'), t('columns.details'), t('columns.user')],
          history.map((h) => [when(h.createdAt), h.action, h.details, h.user ? `${h.user.firstName} ${h.user.lastName}` : '']),
          empty,
        ),
      },
    ];
  }
}

function SectionCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mac-section-card">
      <div className="mac-section-card-header">
        <h3 className="mac-section-card-title">
          <Icon size={15} strokeWidth={2} />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon: Icon,
  className = '',
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mac-info-label">
        {Icon && <Icon size={11} strokeWidth={2} />}
        {label}
      </p>
      <div className="mac-info-value">{value}</div>
    </div>
  );
}

function TabLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mac-section-card-action">
      {children}
    </button>
  );
}

function EmptyBlock({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-5">
      <p className="text-[12px] text-gic-muted">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function LinkedPager({
  index,
  total,
  label,
  onPrev,
  onNext,
  onSelect,
}: {
  index: number;
  total: number;
  label?: string;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (i: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 py-2">
      <button type="button" className="mac-action-btn mac-action-btn-gray px-2" onClick={onPrev} title={t('common.prev')} aria-label={t('common.prev')}>
        &lt;&lt;&lt;
      </button>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={`min-w-[28px] h-7 rounded-lg text-[12px] font-medium ${
              i === index ? 'bg-[#007aff] text-white' : 'bg-black/[0.04] text-gic-ink hover:bg-black/[0.08]'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <button type="button" className="mac-action-btn mac-action-btn-gray px-2" onClick={onNext} title={t('common.next')} aria-label={t('common.next')}>
        &gt;&gt;&gt;
      </button>
      {label && <span className="text-[11px] text-gic-muted ml-1">{label} {index + 1}/{total}</span>}
    </div>
  );
}
