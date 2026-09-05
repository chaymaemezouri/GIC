import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Ban, Printer, Wallet, ExternalLink, KeyRound, Home, User, FileText, Upload,
  Info, Calendar, History,
} from 'lucide-react';
import { api, fetchDropdownOptions, fetchPropertyList, formatDate, formatMad, uploadDocument } from '../lib/api';
import {
  Btn, Card, Input, KpiCard, MacActionBtn, Modal, Select, StatusPill, TableWrap, Td, Th,
  PageBackLink,
} from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';

import { RentalFormFields, rentalToForm, rentalFormToBody, type RentalFormData } from '../components/RentalFormFields';
import { printRentalReceipt } from '../lib/printRental';
import RentalMonthlyPayments from '../components/RentalMonthlyPayments';
import PaymentSchedulePanel from '../components/PaymentSchedulePanel';

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

export default function LocationDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [rental, setRental] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const [properties, setProperties] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminateMotif, setTerminateMotif] = useState('');
  const [form, setForm] = useState<RentalFormData>({
    clientId: '', propertyId: '', monthlyRent: '', discount: '0',
    contractType: 'bail_habitation', description: '', contractDate: '', status: 'active',
    landlordSignatureDate: '', landlordLegalizationNo: '', tenantSignatureDate: '', tenantLegalizationNo: '',
  });
  const [payForm, setPayForm] = useState({ amount: '', operationType: 'especes', payerName: '', bank: '', nature: '' });
  const [paymentNatures, setPaymentNatures] = useState<{ value: string; label?: string }[]>([]);

  function load() {
    if (!id) return;
    setError('');
    api(`/transactions/rentals/${id}`).then(setRental).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadDocuments() {
    if (!id) return;
    api(`/transactions/rentals/${id}/documents`).then(setDocuments).catch(() => setDocuments([]));
  }

  function loadHistory() {
    if (!id) return;
    api(`/transactions/rentals/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  useEffect(() => {
    load();
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
        category: 'location',
        entityType: 'Rental',
        entityId: id,
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

  function openEdit() {
    if (!rental) return;
    setForm(rentalToForm(rental));
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/transactions/rentals/${id}`, {
        method: 'PUT',
        body: JSON.stringify(rentalFormToBody(form, true)),
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
        body: JSON.stringify({ rentalId: id, ...payForm }),
      });
      setPayOpen(false);
      setPayForm({ amount: '', operationType: 'especes', payerName: '', bank: '', nature: '' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmTerminate() {
    if (!terminateMotif.trim()) return;
    try {
      await api(`/transactions/rentals/${id}/terminate`, {
        method: 'POST',
        body: JSON.stringify({ motif: terminateMotif }),
      });
      navigate('/locations');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printPaymentReceipt(p: { receiptNo: string; amount: number; operationType?: string; date: string }) {
    const w = window.open('', '_blank');
    if (!w || !rental) return;
    w.document.write(`<html><body style="font-family:sans-serif;padding:24px">
      <h2>GIC — Reçu ${p.receiptNo}</h2>
      <p>Location: ${rental.reference}</p>
      <p>Montant: ${formatMad(p.amount)}</p>
      <p>Mode: ${p.operationType || '—'}</p>
      <p>Date: ${formatDate(p.date)}</p>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (!rental && !error) {
    return <p className="text-[12px] text-gic-muted p-6 text-center">{t('msg.loadingRental')}</p>;
  }

  if (error && !rental) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/locations" className="mt-2" />
      </Card>
    );
  }

  const isActive = rental.status === 'active';
  const unpaidMonths = (rental.schedules || []).filter((s: { status: string }) => s.status !== 'paid').length;
  const canPay = isActive && (rental.remaining > 0 || unpaidMonths > 0);
  const scheduleTotal = (rental.schedules || []).reduce((s: number, x: { amount: number }) => s + Number(x.amount || 0), 0);
  const expectedTotal = scheduleTotal > 0 ? scheduleTotal : Number(rental.totalPaid || 0) + Number(rental.remaining || 0) || Number(rental.monthlyRent || 0);
  const payProgress = expectedTotal > 0
    ? Math.min(100, Math.round((Number(rental.totalPaid || 0) / expectedTotal) * 100))
    : 0;

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/locations" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            <div className="mac-detail-photo-fallback">
              <KeyRound size={22} strokeWidth={1.75} />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.rental360')}</p>
            <h1 className="mac-detail-name truncate">{rental.reference}</h1>
            <p className="mac-detail-meta">
              {rental.client.firstName} {rental.client.lastName}
              <span className="text-[#c7c7cc]"> · </span>
              {rental.property.name}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <StatusPill status={rental.status} quiet />
              {rental.contractType && (
                <span className="mac-chip mac-chip-blue capitalize">{rental.contractType.replace(/_/g, ' ')}</span>
              )}
              <span className="mac-chip mac-chip-gray">{formatMad(rental.monthlyRent)}/mois</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {(['paiements', 'echeancier', 'documents'] as Tab[]).map((tabId) => (
                <button
                  key={tabId}
                  type="button"
                  className="mac-chip mac-chip-gray hover:bg-gray-200/80"
                  onClick={() => setTab(tabId)}
                >
                  {tabId === 'paiements' && `${t('tabs.payments')} (${rental.payments?.length || 0})`}
                  {tabId === 'echeancier' && `${t('tabs.monthlyRents')} (${rental.schedules?.length || 0})`}
                  {tabId === 'documents' && `${t('tabs.documents')} (${documents.length || rental.documents?.length || 0})`}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          {canPay && (
            <Btn icon={Wallet} onClick={() => setPayOpen(true)}>{t('actions.newPayment')}</Btn>
          )}
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={() => printRentalReceipt(rental)} />
            {isActive && (
              <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
            )}
            {isActive && (
              <MacActionBtn
                icon={Ban}
                tone="red"
                title={t('actions.resiliate')}
                onClick={() => { setTerminateOpen(true); setTerminateMotif(''); }}
              />
            )}
          </div>
                 </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('rental.monthlyAmount')} value={formatMadCompact(rental.monthlyRent)} icon={KeyRound} tone="violet" compact />
        <KpiCard title={t('fields.collected')} value={formatMadCompact(rental.totalPaid)} icon={Wallet} tone="emerald" compact />
        <KpiCard title={t('fields.remaining')} value={formatMadCompact(rental.remaining)} icon={Home} tone="coral" compact />
        <KpiCard title={t('fields.progression')} value={`${payProgress} %`} icon={User} tone="amber" />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsRentalAria')}
            items={[
              { id: 'infos', label: t('tabs.informations'), icon: Info },
              { id: 'echeancier', label: t('tabs.monthlyRentsShort'), icon: Calendar, badge: rental.schedules?.length || 0 },
              { id: 'paiements', label: t('tabs.payments'), icon: Wallet, badge: rental.payments?.length || 0 },
              { id: 'documents', label: t('tabs.documents'), icon: FileText, badge: documents.length || rental.documents?.length || 0 },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >
        {tab === 'infos' && (
          <div className="space-y-4 mt-1">
            {expectedTotal > 0 && (
              <div className="mac-section-card">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="text-[13px] text-gic-ink font-medium tracking-tight">
                    {payProgress}&nbsp;% {t('fields.collected').toLowerCase()}
                  </span>
                  <span className="text-[12px] text-gic-muted tabular-nums">
                    {formatMad(rental.totalPaid)}
                    <span className="text-[#c7c7cc]"> / </span>
                    {formatMad(expectedTotal)}
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
                    label={t('fields.tenant')}
                    value={
                      <Link to={`/clients/${rental.client.id}`} className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1">
                        {rental.client.reference} — {rental.client.firstName} {rental.client.lastName}
                        <ExternalLink size={10} />
                      </Link>
                    }
                  />
                  <InfoRow
                    label={t('fields.property')}
                    value={
                      <Link to={`/biens/${rental.property.id}`} className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1">
                        {rental.property.reference} — {rental.property.name}
                        <ExternalLink size={10} />
                      </Link>
                    }
                  />
                  <InfoRow
                    label={t('fields.project')}
                    value={
                      rental.property.project?.id ? (
                        <Link to={`/projets/${rental.property.project.id}`} className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1">
                          {rental.property.project.name}
                          <ExternalLink size={10} />
                        </Link>
                      ) : (
                        rental.property.project?.name || '—'
                      )
                    }
                  />
                </div>
              </div>

              <div className="mac-section-card">
                <div className="mac-section-card-header">
                  <h3 className="mac-section-card-title">
                    <KeyRound size={15} strokeWidth={2} />
                    {t('detail.lease')}
                  </h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label={t('rental.monthlyAmount')} value={formatMad(rental.monthlyRent)} />
                  <InfoRow label={t('fields.discount')} value={formatMad(rental.discount)} />
                  <InfoRow label={t('fields.rentalStart')} value={formatDate(rental.startDate || rental.contractDate)} />
                  <InfoRow label={t('fields.rentalEnd')} value={rental.endDate ? formatDate(rental.endDate) : t('fields.openEndedValue')} />
                  <InfoRow label={t('fields.leaseType')} value={(rental.contractType || '—').replace(/_/g, ' ')} />
                  <InfoRow label={t('fields.contractDate')} value={formatDate(rental.contractDate)} />
                  <InfoRow label={t('fields.createdAtFem')} value={formatDate(rental.createdAt)} />
                  <InfoRow label={t('fields.status')} value={<StatusPill status={rental.status} quiet />} />
                </div>
              </div>
            </div>

            {(rental.landlordSignatureDate || rental.landlordLegalizationNo || rental.tenantSignatureDate || rental.tenantLegalizationNo) && (
              <div className="mac-section-card">
                <div className="mac-section-card-header">
                  <h3 className="mac-section-card-title">
                    <FileText size={15} strokeWidth={2} />
                    {t('detail.signatures')}
                  </h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label={t('fields.landlordSignature')} value={rental.landlordSignatureDate ? formatDate(rental.landlordSignatureDate) : '—'} />
                  <InfoRow label={t('fields.landlordLegalizationNo')} value={rental.landlordLegalizationNo || '—'} />
                  <InfoRow label={t('fields.tenantSignature')} value={rental.tenantSignatureDate ? formatDate(rental.tenantSignatureDate) : '—'} />
                  <InfoRow label={t('fields.tenantLegalizationNo')} value={rental.tenantLegalizationNo || '—'} />
                </div>
              </div>
            )}

            {rental.description && (
              <div className="mac-section-card">
                <p className="mac-info-label">{t('fields.descriptionRemark')}</p>
                <p className="mac-info-value !font-normal text-gic-muted whitespace-pre-wrap">{rental.description}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'echeancier' && id && (
          <div className="space-y-6">
            <RentalMonthlyPayments
              rentalId={id}
              monthlyRent={Number(rental.monthlyRent) || 0}
              startDate={rental.startDate || rental.contractDate}
              endDate={rental.endDate}
              schedules={rental.schedules || []}
              onReload={load}
              canEdit={isActive}
            />
            <details className="rounded-xl border border-gic-border/80 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-[12px] font-medium text-gic-muted hover:text-gic-ink">
                Vue tableau détaillée (échéancier classique)
              </summary>
              <div className="border-t border-gic-border/60">
                <PaymentSchedulePanel
                  entityType="rentals"
                  entityId={id}
                  schedules={rental.schedules || []}
                  onReload={load}
                  canEdit={isActive}
                />
              </div>
            </details>
          </div>
        )}

        {tab === 'paiements' && (
          <div className="mt-1">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-[13px] font-medium text-gic-ink tracking-tight">{t('detail.paymentHistory')}</p>
              {canPay && (
                <Btn icon={Wallet} onClick={() => setPayOpen(true)}>{t('actions.newPayment')}</Btn>
              )}
            </div>
            {(rental.payments || []).length === 0 ? (
              <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyPayments')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.receipt')}</Th>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('columns.amount')}</Th>
                    <Th mac>{t('columns.mode')}</Th>
                    <Th mac>{t('fields.payer')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {rental.payments.map((p: {
                    id: string;
                    receiptNo: string;
                    date: string;
                    amount: number;
                    operationType?: string;
                    payerName?: string;
                  }) => (
                    <tr key={p.id}>
                      <Td mac>
                        <span className="mac-table-ref">{p.receiptNo}</span>
                      </Td>
                      <Td mac className="mac-table-muted">{formatDate(p.date)}</Td>
                      <Td mac className="font-medium">{formatMad(p.amount)}</Td>
                      <Td mac className="capitalize mac-table-muted">{p.operationType || '—'}</Td>
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
                {t('tabs.documents')} {t('detail.lease').toLowerCase()}
              </p>
              <label className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium bg-white border border-gic-border cursor-pointer hover:bg-gray-50">
                <Upload size={14} />
                {docUploading ? t('auth.sending') : t('actions.deposit')}
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={onDocUpload} disabled={docUploading} />
              </label>
            </div>
            {documents.length === 0 ? (
              <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyDocuments')}</p>
            ) : (
              <ul className="space-y-2">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-[12px] rounded-xl bg-gray-50 px-3 py-2">
                    <FileText size={14} className="text-gic-violet shrink-0" />
                    <span className="font-medium truncate flex-1">{d.name}</span>
                    {d.category && <span className="text-[10px] text-gic-muted shrink-0">{d.category}</span>}
                    <span className="text-[10px] text-gic-muted shrink-0">{formatDate(d.createdAt)}</span>
                    <a href={d.path} target="_blank" rel="noreferrer" className="text-gic-violet hover:underline shrink-0 inline-flex items-center gap-1">
                      {t('actions.open')} <ExternalLink size={11} />
                    </a>
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

      <Modal
        open={editOpen}
        size="lg"
        title={t('actions.editRental')}
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="edit-rental-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="edit-rental-form" onSubmit={save}>
          <RentalFormFields form={form} setForm={setForm} properties={properties} editMode />
        </form>
      </Modal>

      <Modal
        open={payOpen}
        title={t('actions.savePayment')}
        onClose={() => setPayOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPayOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="pay-loc-form" type="submit">{t('common.validate')}</Btn>
          </>
        }
      >
        <form id="pay-loc-form" onSubmit={addPayment} className="grid gap-3">
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

      <Modal
        open={terminateOpen}
        title={t('actions.resiliateLease')}
        onClose={() => setTerminateOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setTerminateOpen(false)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmTerminate} disabled={!terminateMotif.trim()}>{t('actions.resiliate')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.rentalTerminateHint')}</p>
        <textarea
          className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]"
          placeholder={t('msg.motifPlaceholder')}
          value={terminateMotif}
          onChange={(e) => setTerminateMotif(e.target.value)}
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
