import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, ExternalLink, CreditCard, Wallet, FileText, User, Home, Pencil, Trash2, Info, History } from 'lucide-react';
import { api, formatDate, formatMad, uploadForm } from '../lib/api';
import { Btn, Card, KpiCard, MacActionBtn, Modal, StatusPill, PageBackLink } from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';


import { PaymentFormFields, paymentToForm, paymentFormToUpdateBody, paymentFormToFormData, type PaymentFormData } from '../components/PaymentFormFields';
import { fileUrl } from '../lib/documentDisplay';
import { printPaymentReceipt } from '../lib/printPayment';

type Tab = 'infos' | 'historique';

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

export default function PaiementDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [payment, setPayment] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<PaymentFormData>({
    txType: 'vente', saleId: '', rentalId: '', amount: '', date: '', operationType: 'especes',
    payerName: '', bank: '', nature: '', internalRef: '', operationNo: '', proofFile: '', proofFileObj: null,
  });
  const [formError, setFormError] = useState('');

  function load() {
    if (!id) return;
    setError('');
    api(`/transactions/payments/${id}`)
      .then(setPayment)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/transactions/payments/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
  }, [tab, id]);

  function openEdit() {
    if (!payment) return;
    setForm(paymentToForm(payment));
    setFormError('');
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    try {
      if (form.proofFileObj) {
        await uploadForm(`/transactions/payments/${id}`, paymentFormToFormData(form, true), 'PUT');
      } else {
        await api(`/transactions/payments/${id}`, {
          method: 'PUT',
          body: JSON.stringify(paymentFormToUpdateBody(form)),
        });
      }
      setEditOpen(false);
      load();
      if (tab === 'historique') loadHistory();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!deleteMotif.trim()) return;
    try {
      await api(`/transactions/payments/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ motif: deleteMotif }),
      });
      navigate('/encaissements');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  if (!payment && !error) {
    return <p className="text-[12px] text-gic-muted p-6 text-center">{t('msg.loadingPayment')}</p>;
  }

  if (error && !payment) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/encaissements" className="mt-2" />
      </Card>
    );
  }

  const isSale = !!payment.sale;
  const tx = isSale ? payment.sale : payment.rental;
  const client = tx?.client;
  const property = tx?.property;
  const txLink = isSale ? `/ventes/${payment.sale?.id}` : `/locations/${payment.rental?.id}`;
  const txLabel = isSale ? t('create.sale') : t('create.rental');

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/encaissements" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            <div className="mac-detail-photo-fallback">
              <CreditCard size={22} strokeWidth={1.75} />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.collection')}</p>
            <h1 className="mac-detail-name truncate">{payment.receiptNo}</h1>
            <p className="mac-detail-meta">
              {formatDate(payment.date)}
              <span className="text-[#c7c7cc]"> · </span>
              {formatMad(payment.amount)}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <span className={`mac-chip ${isSale ? 'mac-chip-blue' : 'mac-chip-orange'}`}>{txLabel}</span>
              {payment.operationType && (
                <span className="mac-chip mac-chip-gray capitalize">{payment.operationType}</span>
              )}
              {tx?.reference && (
                <Link to={txLink} className="mac-chip mac-chip-blue hover:opacity-90">
                  {tx.reference}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Printer} tone="gray" title={t('actions.printReceipt')} onClick={() => printPaymentReceipt(payment)} />
            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteOpen(true); setDeleteMotif(''); }} />
          </div>
                 </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-3">
        <KpiCard title={t('common.amount')} value={formatMadCompact(payment.amount)} icon={Wallet} tone="emerald" compact />
        <KpiCard title={t('common.type')} value={txLabel} icon={FileText} tone="violet" />
        <KpiCard title={t('fields.mode')} value={payment.operationType || '—'} icon={CreditCard} tone="amber" />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsPaymentAria')}
            items={[
              { id: 'infos', label: t('tabs.informations'), icon: Info },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >

        {tab === 'infos' && (
          <div className="space-y-4 mt-1">
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="mac-section-card">
                <div className="mac-section-card-header">
                  <h3 className="mac-section-card-title">
                    <Wallet size={15} strokeWidth={2} />
                    {t('detail.collection')}
                  </h3>
                </div>
                <div className="grid gap-3">
                  <InfoRow label={t('fields.receiptNo')} value={payment.receiptNo} />
                  <InfoRow label={t('fields.date')} value={formatDate(payment.date)} />
                  <InfoRow label={t('fields.amount')} value={formatMad(payment.amount)} />
                  <InfoRow label={t('fields.mode')} value={payment.operationType || '—'} />
                  <InfoRow label={t('fields.payer')} value={payment.payerName || '—'} />
                  <InfoRow label={t('fields.bankRef')} value={payment.bank || '—'} />
                  <InfoRow label={t('fields.nature')} value={payment.nature || '—'} />
                  {payment.internalRef && <InfoRow label={t('fields.internalRef')} value={payment.internalRef} />}
                  {payment.operationNo && <InfoRow label={t('fields.operationNo')} value={payment.operationNo} />}
                  <InfoRow
                    label={t('fields.proof')}
                    value={
                      payment.proofFile ? (
                        <a href={fileUrl(payment.proofFile)} target="_blank" rel="noreferrer" className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1">
                          {t('fields.viewDownload')}
                        </a>
                      ) : '—'
                    }
                  />
                </div>
              </div>

              <div className="mac-section-card">
                <div className="mac-section-card-header">
                  <h3 className="mac-section-card-title">
                    <User size={15} strokeWidth={2} />
                    {t('detail.linkedTxn')}
                  </h3>
                </div>
                <div className="grid gap-3">
                  <InfoRow
                    label={t('fields.type')}
                    value={<span className={`mac-chip ${isSale ? 'mac-chip-blue' : 'mac-chip-orange'}`}>{txLabel}</span>}
                  />
                  <InfoRow
                    label={t('fields.reference')}
                    value={
                      <Link to={txLink} className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1">
                        {tx?.reference || '—'}
                        <ExternalLink size={10} />
                      </Link>
                    }
                  />
                  {client && (
                    <InfoRow
                      label={t('fields.client')}
                      value={
                        <Link to={`/clients/${client.id}`} className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1">
                          {client.reference} — {client.firstName} {client.lastName}
                          <ExternalLink size={10} />
                        </Link>
                      }
                    />
                  )}
                  {property && (
                    <InfoRow
                      label={t('fields.property')}
                      value={
                        <Link to={`/biens/${property.id}`} className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1">
                          {property.reference} — {property.name}
                          <ExternalLink size={10} />
                        </Link>
                      }
                    />
                  )}
                  {property?.project && (
                    <InfoRow
                      label={t('fields.project')}
                      value={
                        property.project.id ? (
                          <Link to={`/projets/${property.project.id}`} className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1">
                            {property.project.name}
                            <ExternalLink size={10} />
                          </Link>
                        ) : (
                          property.project.name || '—'
                        )
                      }
                    />
                  )}
                  {isSale && tx?.status && (
                    <InfoRow label={t('fields.sale')} value={<StatusPill status={tx.status} quiet />} />
                  )}
                  {!isSale && tx?.status && (
                    <InfoRow label={t('fields.rental')} value={<StatusPill status={tx.status} quiet />} />
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link to={txLink}>
                <Btn variant="secondary" icon={FileText}>{t('msg.viewTransaction', { type: txLabel.toLowerCase() })}</Btn>
              </Link>
              {client && (
                <Link to={`/clients/${client.id}`}>
                  <Btn variant="secondary" icon={User}>{t('actions.viewClientFiche')}</Btn>
                </Link>
              )}
              {property && (
                <Link to={`/biens/${property.id}`}>
                  <Btn variant="secondary" icon={Home}>{t('actions.openFiche')} {t('create.property').toLowerCase()}</Btn>
                </Link>
              )}
            </div>
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
        title={t('actions.editPayment')}
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="edit-payment-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="edit-payment-form" onSubmit={save}>
          <PaymentFormFields form={form} setForm={setForm} sales={[]} rentals={[]} editMode />
          {formError && <p className="mt-3 text-[11px] text-gic-coral">{formError}</p>}
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        title={t('actions.deletePayment')}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">
          {t('msg.paymentDeleteHint')}
        </p>
        <textarea
          className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]"
          placeholder={t('msg.motifShortPlaceholder')}
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
