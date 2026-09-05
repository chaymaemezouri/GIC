import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Ban, Printer, Wallet, ExternalLink, FileText, Home, User, Building2,
  Info, Calendar, History, Upload, Trash2,
} from 'lucide-react';
import { api, fetchClientList, fetchDropdownOptions, fetchPropertyList, formatDate, formatMad, uploadDocument } from '../lib/api';
import {
  Btn, Card, Input, KpiCard, MacActionBtn, Modal, Select, StatusPill, TableWrap, Td, Th,
  PageBackLink,
} from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';

import { SaleFormFields, saleToForm, saleFormToUpdateBody, type SaleFormData } from '../components/SaleFormFields';
import { printSaleReceipt } from '../lib/printSale';
import PaymentSchedulePanel from '../components/PaymentSchedulePanel';
import { isBankPaymentMode, paymentModeLabel } from '../lib/paymentMode';
import { fileUrl } from '../lib/documentDisplay';

type Tab = 'infos' | 'echeancier' | 'paiements' | 'documents' | 'historique';

function formatMadCompact(n: number | null | undefined) {
  const v = Number(n || 0);
  if (v >= 1_000_000) {
    return `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M MAD`;
  }
  if (v >= 10_000) {
    return `${Math.round(v / 1_000).toLocaleString('fr-FR')} k MAD`;
  }
  return formatMad(v);
}

export default function VenteDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [sale, setSale] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [paymentNatures, setPaymentNatures] = useState<{ value: string; label?: string }[]>([]);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [resiliateOpen, setResiliateOpen] = useState(false);
  const [resiliateMotif, setResiliateMotif] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [newClientId, setNewClientId] = useState('');
  const [createNewSale, setCreateNewSale] = useState(false);
  const [form, setForm] = useState<SaleFormData>({
    clientId: '', propertyId: '', salePrice: '', discount: '0', advance: '0',
    contractType: 'compromis', description: '', contractDate: '', status: 'en_cours',
    sellerSignatureDate: '', sellerLegalizationNo: '', buyerSignatureDate: '', buyerLegalizationNo: '',
  });
  const [payForm, setPayForm] = useState({ amount: '', operationType: 'especes', payerName: '', bank: '', nature: '' });

  function load() {
    if (!id) return;
    setError('');
    api(`/transactions/sales/${id}`).then(setSale).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadDocuments() {
    if (!id) return;
    api(`/transactions/sales/${id}/documents`).then(setDocuments).catch(() => setDocuments([]));
  }

  function loadHistory() {
    if (!id) return;
    api(`/transactions/sales/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  useEffect(() => {
    load();
    fetchClientList().then(setClients);
    fetchPropertyList().then(setProperties);
    fetchDropdownOptions('payment_nature').then(setPaymentNatures).catch(() => setPaymentNatures([]));
  }, [id]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
    if (tab === 'documents') loadDocuments();
  }, [tab, id]);

  async function onDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setDocUploading(true);
    try {
      await uploadDocument(file, {
        name: file.name,
        category: 'vente',
        entityType: 'Sale',
        entityId: id,
        saleId: id,
      });
      loadDocuments();
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.uploadError'));
    } finally {
      setDocUploading(false);
      e.target.value = '';
    }
  }

  async function deleteDoc(docId: string) {
    if (!await appConfirm(t('msg.confirmDeleteDocument'))) return;
    try {
      await api(`/documents/${docId}`, { method: 'DELETE' });
      loadDocuments();
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    if (sale && (location.state as { edit?: boolean } | null)?.edit) {
      setForm(saleToForm(sale));
      setEditOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [sale, location.state, location.pathname, navigate]);

  function openEdit() {
    if (!sale) return;
    setForm(saleToForm(sale));
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/transactions/sales/${id}`, {
        method: 'PUT',
        body: JSON.stringify(saleFormToUpdateBody(form)),
      });
      setEditOpen(false);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/transactions/payments', {
        method: 'POST',
        body: JSON.stringify({ saleId: id, ...payForm }),
      });
      setPayOpen(false);
      setPayForm({ amount: '', operationType: 'especes', payerName: '', bank: '', nature: '' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmResiliate() {
    if (!resiliateMotif.trim()) return;
    try {
      const res = await api<{ sale: any; newSale?: any }>(`/transactions/sales/${id}/resiliate`, {
        method: 'POST',
        body: JSON.stringify({
          motif: resiliateMotif,
          newClientId: createNewSale ? newClientId : undefined,
          createNewSale,
        }),
      });
      if (res.newSale) navigate(`/ventes/${res.newSale.id}`);
      else navigate('/ventes');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!deleteMotif.trim()) return;
    try {
      await api(`/transactions/sales/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ motif: deleteMotif }),
      });
      navigate('/ventes');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printPaymentReceipt(p: any) {
    const w = window.open('', '_blank');
    if (!w || !sale) return;
    w.document.write(`<html><body style="font-family:sans-serif;padding:24px">
      <h2>GIC — Reçu ${p.receiptNo}</h2>
      <p>Vente: ${sale.reference}</p>
      <p>Montant: ${formatMad(p.amount)}</p>
      <p>Mode: ${p.operationType || '—'}</p>
      <p>Date: ${formatDate(p.date)}</p>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (!sale && !error) {
    return <p className="text-[12px] text-gic-muted p-6 text-center">{t('msg.loadingSale')}</p>;
  }

  if (error && !sale) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/ventes" className="mt-2" />
      </Card>
    );
  }

  const closed = ['résiliée', 'annulée'].includes(sale.status);
  const canPay = sale.remaining > 0 && !['résiliée', 'annulée', 'soldée'].includes(sale.status);
  const payProgress = sale.netPrice > 0
    ? Math.min(100, Math.round((sale.totalPaid / sale.netPrice) * 100))
    : 0;

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/ventes" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            <div className="mac-detail-photo-fallback">
              <FileText size={22} strokeWidth={1.75} />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.sale360')}</p>
            <h1 className="mac-detail-name truncate">{sale.reference}</h1>
            <p className="mac-detail-meta">
              {sale.client.firstName} {sale.client.lastName}
              <span className="text-[#c7c7cc]"> · </span>
              {sale.property.name}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <StatusPill status={sale.status} quiet />
              {sale.contractType && (
                <span className="mac-chip mac-chip-blue capitalize">{sale.contractType}</span>
              )}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          {canPay && (
            <Btn icon={Wallet} onClick={() => setPayOpen(true)}>{t('tabs.payments')}</Btn>
          )}
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={() => printSaleReceipt(sale)} />
            {!closed && (
              <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
            )}
            {!closed && sale.status !== 'soldée' && (
              <MacActionBtn
                icon={Ban}
                tone="red"
                title={t('actions.resiliate')}
                onClick={() => { setResiliateOpen(true); setResiliateMotif(''); }}
              />
            )}
            <MacActionBtn
              icon={Trash2}
              tone="red"
              title={t('common.delete')}
              onClick={() => { setDeleteOpen(true); setDeleteMotif(''); }}
            />
          </div>
                 </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('fields.netPrice')} value={formatMadCompact(sale.netPrice)} icon={FileText} tone="violet" compact />
        <KpiCard title={t('fields.collected')} value={formatMadCompact(sale.totalPaid)} icon={Wallet} tone="emerald" compact />
        <KpiCard title={t('fields.remaining')} value={formatMadCompact(sale.remaining)} icon={Building2} tone="coral" compact />
        <KpiCard title={t('fields.progression')} value={`${payProgress} %`} icon={Home} tone="amber" />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsSaleAria')}
            items={[
              { id: 'infos', label: t('tabs.informations'), icon: Info },
              { id: 'echeancier', label: t('tabs.paymentSchedule'), icon: Calendar, badge: sale.schedules?.length || 0 },
              { id: 'paiements', label: t('tabs.payments'), icon: Wallet, badge: sale.payments?.length || 0 },
              { id: 'documents', label: t('tabs.documents'), icon: FileText, badge: documents.length || sale.documents?.length || 0 },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >
        {tab === 'infos' && (
          <div className="space-y-4 mt-1">
            {sale.netPrice > 0 && (
              <div className="mac-section-card">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="text-[13px] text-gic-ink font-medium tracking-tight">
                    {payProgress}&nbsp;% {t('fields.collected').toLowerCase()}
                  </span>
                  <span className="text-[12px] text-gic-muted tabular-nums">
                    {formatMad(sale.totalPaid)}
                    <span className="text-[#c7c7cc]"> / </span>
                    {formatMad(sale.netPrice)}
                  </span>
                </div>
                <div className="mac-progress">
                  <div className="mac-progress-bar" style={{ width: `${payProgress}%` }} />
                </div>
              </div>
            )}

            <div className="grid lg:grid-cols-2 gap-4">
              <div className="mac-section-card">
                <div className="mac-section-card-header">
                  <h3 className="mac-section-card-title">
                    <User size={15} strokeWidth={2} />
                    {t('detail.parties')}
                  </h3>
                </div>
                <div className="grid gap-3">
                  <InfoRow
                    label={t('fields.client')}
                    value={
                      <Link to={`/clients/${sale.client.id}`} className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1">
                        {sale.client.reference} — {sale.client.firstName} {sale.client.lastName}
                        <ExternalLink size={10} />
                      </Link>
                    }
                  />
                  <InfoRow
                    label={t('fields.property')}
                    value={
                      <Link to={`/biens/${sale.property.id}`} className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1">
                        {sale.property.reference} — {sale.property.name}
                        <ExternalLink size={10} />
                      </Link>
                    }
                  />
                  <InfoRow
                    label={t('fields.project')}
                    value={
                      sale.property.project?.id ? (
                        <Link to={`/projets/${sale.property.project.id}`} className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1">
                          {sale.property.project.name}
                          <ExternalLink size={10} />
                        </Link>
                      ) : (
                        sale.property.project?.name || '—'
                      )
                    }
                  />
                </div>
              </div>

              <div className="mac-section-card">
                <div className="mac-section-card-header">
                  <h3 className="mac-section-card-title">
                    <FileText size={15} strokeWidth={2} />
                    {t('detail.contract')}
                  </h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label={t('fields.salePriceShort')} value={formatMad(sale.salePrice)} />
                  <InfoRow label={t('fields.discount')} value={formatMad(sale.discount)} />
                  <InfoRow label={t('fields.initialAdvance')} value={formatMad(sale.advance)} />
                  <InfoRow label={t('fields.contractType')} value={sale.contractType || '—'} />
                  <InfoRow label={t('fields.contractDate')} value={formatDate(sale.contractDate)} />
                  <InfoRow label={t('fields.createdAtFem')} value={formatDate(sale.createdAt)} />
                </div>
              </div>
            </div>

            {(sale.sellerSignatureDate || sale.sellerLegalizationNo || sale.buyerSignatureDate || sale.buyerLegalizationNo) && (
              <div className="mac-section-card">
                <div className="mac-section-card-header">
                  <h3 className="mac-section-card-title">
                    <FileText size={15} strokeWidth={2} />
                    {t('detail.signatures')}
                  </h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label={t('fields.sellerSignature')} value={sale.sellerSignatureDate ? formatDate(sale.sellerSignatureDate) : '—'} />
                  <InfoRow label={t('fields.sellerLegalizationNo')} value={sale.sellerLegalizationNo || '—'} />
                  <InfoRow label={t('fields.buyerSignature')} value={sale.buyerSignatureDate ? formatDate(sale.buyerSignatureDate) : '—'} />
                  <InfoRow label={t('fields.buyerLegalizationNo')} value={sale.buyerLegalizationNo || '—'} />
                </div>
              </div>
            )}

            {sale.description && (
              <div className="mac-section-card">
                <p className="mac-info-label">{t('fields.description')}</p>
                <p className="mac-info-value !font-normal text-gic-muted whitespace-pre-wrap">{sale.description}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'echeancier' && id && (
          <PaymentSchedulePanel
            entityType="sales"
            entityId={id}
            schedules={sale.schedules || []}
            onReload={load}
            canEdit={!closed}
          />
        )}

        {tab === 'paiements' && (
          <div className="mt-1">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-[13px] font-medium text-gic-ink tracking-tight">{t('detail.paymentHistory')}</p>
              {canPay && (
                <Btn icon={Wallet} onClick={() => setPayOpen(true)}>{t('actions.newPayment')}</Btn>
              )}
            </div>
            {(sale.payments || []).length === 0 ? (
              <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyPayments')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.receipt')}</Th>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('columns.amount')}</Th>
                    <Th mac>{t('columns.mode')}</Th>
                    <Th mac>{t('columns.bank')}</Th>
                    <Th mac>{t('columns.proof')}</Th>
                    <Th mac>{t('fields.payer')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {sale.payments.map((p: any) => (
                    <tr key={p.id}>
                      <Td mac>
                        <span className="mac-table-ref">{p.receiptNo}</span>
                      </Td>
                      <Td mac className="mac-table-muted">{formatDate(p.date)}</Td>
                      <Td mac className="font-medium">{formatMad(p.amount)}</Td>
                      <Td mac>{paymentModeLabel(p.operationType)}</Td>
                      <Td mac className="mac-table-muted">
                        {isBankPaymentMode(p.operationType) ? (p.bank || '—') : '—'}
                      </Td>
                      <Td mac>
                        {p.proofFile ? (
                          <a href={fileUrl(p.proofFile)} target="_blank" rel="noreferrer" className="text-[#007aff] hover:opacity-70">
                            {t('common.view')}
                          </a>
                        ) : (
                          <span className="mac-table-muted">—</span>
                        )}
                      </Td>
                      <Td mac className="mac-table-muted">{p.payerName || '—'}</Td>
                      <Td mac className="mac-td-actions">
                        <div className="mac-actions">
                          <MacActionBtn icon={Printer} tone="gray" title={t('actions.printReceipt')} onClick={() => printPaymentReceipt(p)} />
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
          <div className="mt-1">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-[13px] font-medium text-gic-ink tracking-tight flex items-center gap-2">
                <FileText size={15} />
                {t('tabs.documents')} {t('fields.sale').toLowerCase()}
              </p>
              <label className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium bg-white border border-gic-border cursor-pointer hover:bg-gray-50">
                <Upload size={14} />
                {docUploading ? t('auth.sending') : t('actions.deposit')}
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={onDocUpload} disabled={docUploading} />
              </label>
            </div>
            {(documents.length === 0 && !(sale.documents?.length)) ? (
              <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyDocuments')}</p>
            ) : (
              <ul className="space-y-2">
                {(documents.length ? documents : sale.documents || []).map((d: any) => (
                  <li key={d.id} className="flex items-center gap-2 text-[12px] rounded-xl bg-gray-50 px-3 py-2">
                    <FileText size={14} className="text-gic-violet shrink-0" />
                    <span className="font-medium truncate flex-1">{d.name}</span>
                    {d.category && <span className="text-[10px] text-gic-muted shrink-0">{d.category}</span>}
                    <span className="text-[10px] text-gic-muted shrink-0">{formatDate(d.createdAt)}</span>
                    <a href={fileUrl(d.path)} target="_blank" rel="noreferrer" className="text-gic-violet hover:underline shrink-0 inline-flex items-center gap-1">
                      {t('actions.open')} <ExternalLink size={11} />
                    </a>
                    <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteDoc(d.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'historique' && (
          history.length === 0 ? (
            <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyHistory')}</p>
          ) : (
            <div className="mac-section-card !p-0 overflow-hidden mt-1">
              {history.map((h) => (
                <div key={h.id} className="mac-row">
                  <div className="min-w-0">
                    <p className="mac-row-title capitalize">{h.action}</p>
                    {h.details && <p className="mac-row-subtitle">{h.details}</p>}
                  </div>
                  <div className="mac-row-meta shrink-0 text-right">
                    <p className="mac-row-meta-value">{formatDate(h.createdAt)}</p>
                    <p className="mac-row-subtitle !mt-0">
                      {h.user ? `${h.user.firstName} ${h.user.lastName}` : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </DetailShell>

      <Modal open={editOpen} size="lg" title={t('actions.editSale')} onClose={() => setEditOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-sale-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="edit-sale-form" onSubmit={save}>
          <SaleFormFields form={form} setForm={setForm} clients={clients} properties={properties} editMode />
        </form>
      </Modal>

      <Modal open={payOpen} title={t('actions.savePayment')} onClose={() => setPayOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setPayOpen(false)}>{t('common.cancel')}</Btn><Btn form="pay-detail-form" type="submit">{t('common.validate')}</Btn></>}
      >
        <form id="pay-detail-form" onSubmit={addPayment} className="grid gap-3">
          <Input label={t('fields.amountMadRequired')} required type="number" min="0" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
          <Select label={t('fields.mode')} value={payForm.operationType} onChange={(e) => setPayForm({ ...payForm, operationType: e.target.value })}>
            <option value="especes">{t('fields.modeCash')}</option>
            <option value="virement">{t('fields.modeTransfer')}</option>
            <option value="cheque">{t('fields.modeCheck')}</option>
            <option value="carte">{t('fields.modeCard')}</option>
          </Select>
          {paymentNatures.length > 0 ? (
            <Select label={t('fields.nature')} value={payForm.nature} onChange={(e) => setPayForm({ ...payForm, nature: e.target.value })}>
              <option value="">—</option>
              {paymentNatures.map((n) => (
                <option key={n.value} value={n.value}>{n.label || n.value}</option>
              ))}
              {payForm.nature && !paymentNatures.some((n) => n.value === payForm.nature) && (
                <option value={payForm.nature}>{payForm.nature}</option>
              )}
            </Select>
          ) : (
            <Input label={t('fields.nature')} value={payForm.nature} onChange={(e) => setPayForm({ ...payForm, nature: e.target.value })} placeholder={t('fields.naturePlaceholder')} />
          )}
          <Input label={t('fields.payerName')} value={payForm.payerName} onChange={(e) => setPayForm({ ...payForm, payerName: e.target.value })} />
          <Input label={t('fields.bankRef')} value={payForm.bank} onChange={(e) => setPayForm({ ...payForm, bank: e.target.value })} />
        </form>
      </Modal>

      <Modal open={resiliateOpen} title={t('actions.resiliateSale')} onClose={() => setResiliateOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setResiliateOpen(false)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmResiliate} disabled={!resiliateMotif.trim()}>{t('actions.resiliate')}</Btn></>}
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.saleResiliateHint')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px] mb-3" placeholder={t('msg.motifPlaceholder')} value={resiliateMotif} onChange={(e) => setResiliateMotif(e.target.value)} />
        <label className="flex items-center gap-2 text-[12px] mb-2">
          <input type="checkbox" checked={createNewSale} onChange={(e) => setCreateNewSale(e.target.checked)} />
          {t('actions.newSale')}
        </label>
        {createNewSale && (
          <Input label={t('msg.newBuyerClientId')} value={newClientId} onChange={(e) => setNewClientId(e.target.value)} placeholder={t('msg.pasteClientId')} />
        )}
      </Modal>

      <Modal open={deleteOpen} title={t('actions.deleteSale')} onClose={() => setDeleteOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn></>}
      >
        <p className="text-[12px] text-gic-muted mb-3">
          Suppression définitive. Impossible s&apos;il existe des paiements — supprimez-les d&apos;abord. Le bien redeviendra disponible.
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

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="mac-info-label">{label}</p>
      <div className="mac-info-value">{value}</div>
    </div>
  );
}
