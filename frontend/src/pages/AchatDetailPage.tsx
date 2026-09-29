import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Pencil, Trash2, Printer, History, FileText, CheckCircle, RotateCcw, ShoppingCart, Hash, Calendar, Truck,
  HardHat, Layers, Wallet, Info as InfoIcon, Package, Upload, Plus, User, UserCheck, Building2, Receipt, ClipboardCheck,
} from 'lucide-react';
import { api, fetchSupplierList, fetchChantierList, formatDate, formatMad, openPrintUrl, uploadForm } from '../lib/api';
import { Btn, Card, Input, KpiCard, MacActionBtn, Modal, Select, TableWrap, Td, Textarea, Th, PageBackLink } from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';
import { EntityDocChecklist } from '../components/EntityDocChecklist';
import { PurchaseFormFields, purchaseFormToBody, purchaseToForm, validatePurchaseForm, type PurchaseFormData } from '../components/PurchaseFormFields';
import { PurchaseDeliveryPill, PurchasePaymentPill, PurchaseStatusPill } from '../components/PurchaseBadges';
import {
  PURCHASE_DOC_TYPES, PURCHASE_PAYMENT_KINDS, PURCHASE_PAYMENT_MODES, PURCHASE_STATUSES,
  formatAmount, nextPurchaseStatus, previousPurchaseStatus, round2, statusIndex, type PurchaseDetail,
} from '../lib/purchases';

type Tab = 'infos' | 'lignes' | 'livraisons' | 'documents' | 'paiements' | 'historique';

type DeliveryRow = { lineId: string; quantity: string; rejectedQuantity: string; remark: string };

const today = () => new Date().toISOString().slice(0, 10);

export default function AchatDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [chantiers, setChantiers] = useState<any[]>([]);
  const [chantierTranches, setChantierTranches] = useState<{ id: string; name: string }[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<PurchaseFormData | null>(null);
  const [formError, setFormError] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');

  const [backOpen, setBackOpen] = useState(false);
  const [backReason, setBackReason] = useState('');

  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({ date: today(), number: '', remark: '' });
  const [deliveryRows, setDeliveryRows] = useState<DeliveryRow[]>([]);
  const [deliveryError, setDeliveryError] = useState('');

  const [docOpen, setDocOpen] = useState(false);
  const [docForm, setDocForm] = useState({ category: 'facture_fournisseur', docNumber: '', docDate: today(), amount: '', name: '' });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docError, setDocError] = useState('');

  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ kind: 'complement', date: today(), amount: '', mode: 'virement', reference: '', remark: '' });
  const [payError, setPayError] = useState('');

  function load() {
    if (!id) return;
    setError('');
    api<PurchaseDetail>(`/achats/purchases/${id}`)
      .then(setPurchase)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api<{ auditLogs: any[] }>(`/achats/purchases/${id}/history`)
      .then((h) => setAuditLogs(h.auditLogs || []))
      .catch(() => setAuditLogs([]));
  }

  useEffect(() => {
    load();
    fetchSupplierList().then(setSuppliers);
    fetchChantierList().then(setChantiers);
    api('/achats/families').then(setFamilies);
  }, [id]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
  }, [tab, id]);

  useEffect(() => {
    if (!form?.chantierId) {
      setChantierTranches([]);
      return;
    }
    api<{ id: string; name: string }[]>(`/chantiers/${form.chantierId}/tranches`)
      .then(setChantierTranches)
      .catch(() => setChantierTranches([]));
  }, [form?.chantierId]);

  const docsByType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of purchase?.documents || []) map[d.category || 'autre'] = (map[d.category || 'autre'] || 0) + 1;
    return map;
  }, [purchase?.documents]);

  if (!purchase && !error) return <p className="text-[12px] text-gic-muted p-6">{t('common.loading')}</p>;
  if (error && !purchase) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/achats" className="mt-2" />
      </Card>
    );
  }
  if (!purchase) return null;
  const p = purchase;

  const next = nextPurchaseStatus(p.status);
  const prev = previousPurchaseStatus(p.status);
  const isDraft = p.status === 'elabore';
  const isArchived = p.status === 'archive';
  const canDeliver = ['soumis', 'livre'].includes(p.status);
  const canPay = !['paye', 'archive'].includes(p.status) && p.totals.remaining > 0.009;
  const lockedPayments = ['paye', 'archive'].includes(p.status);

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  async function patchStatus(status: string, extra: Record<string, unknown> = {}) {
    return api<PurchaseDetail>(`/achats/purchases/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, ...extra }) });
  }

  function openDelivery() {
    setDeliveryForm({ date: today(), number: '', remark: '' });
    setDeliveryRows(p.lines.map((l) => ({ lineId: l.id, quantity: l.remaining > 0 ? String(l.remaining) : '0', rejectedQuantity: '0', remark: '' })));
    setDeliveryError('');
    setDeliveryOpen(true);
  }

  function openDocument(category = 'facture_fournisseur') {
    setDocForm({ category, docNumber: '', docDate: today(), amount: category === 'facture_fournisseur' ? String(p.totals.totalTTC) : '', name: '' });
    setDocFile(null);
    setDocError('');
    setDocOpen(true);
  }

  function openPayment(kind?: string) {
    const remaining = p.totals.remaining;
    setPayForm({
      kind: kind || (p.payments.length === 0 && isDraft ? 'avance' : 'solde'),
      date: today(),
      amount: String(remaining),
      mode: p.advanceMode || 'virement',
      reference: '',
      remark: '',
    });
    setPayError('');
    setPayOpen(true);
  }

  async function advance() {
    if (!next) return;
    if (next === 'livre' && !p.checks.hasDeliveries) {
      openDelivery();
      return;
    }
    if (next === 'facture' && !p.checks.hasInvoice) {
      await appAlert(t('purchase.detail.needInvoice'));
      openDocument('facture_fournisseur');
      return;
    }
    if (next === 'paye' && p.totals.remaining > 0.009) {
      await appAlert(t('purchase.detail.needPayment', { amount: formatAmount(p.totals.remaining) }));
      openPayment('solde');
      return;
    }
    if (!(await appConfirm(t(`purchase.confirm.${next}`)))) return;
    await run(async () => {
      try {
        setPurchase(await patchStatus(next));
      } catch (err) {
        const e = err as Error & { data?: { code?: string } };
        if (e.data?.code === 'REMAINING_QUANTITIES' && (await appConfirm(e.message))) {
          setPurchase(await patchStatus(next, { force: true }));
          return;
        }
        await appAlert(e.message || t('common.error'));
      }
    });
  }

  async function goBack() {
    if (!prev || !backReason.trim()) return;
    await run(async () => {
      try {
        setPurchase(await patchStatus(prev, { comment: backReason.trim() }));
        setBackOpen(false);
        setBackReason('');
      } catch (err) {
        await appAlert(err instanceof Error ? err.message : t('common.error'));
      }
    });
  }

  function openEdit() {
    setForm(purchaseToForm(p));
    setFormError('');
    setEditOpen(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!form) return;
    if (isDraft) {
      const invalid = validatePurchaseForm(form, t);
      if (invalid) {
        setFormError(invalid);
        return;
      }
    }
    await run(async () => {
      try {
        const updated = await api<PurchaseDetail>(`/achats/purchases/${id}`, {
          method: 'PUT',
          body: JSON.stringify(purchaseFormToBody(form, { trackingOnly: !isDraft })),
        });
        setPurchase(updated);
        setEditOpen(false);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : t('common.error'));
      }
    });
  }

  async function confirmDelete() {
    if (!deleteMotif.trim()) return;
    try {
      await api(`/achats/purchases/${id}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      navigate('/achats');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function saveDelivery(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDeliveryError('');
    const items = deliveryRows
      .map((r) => ({ ...r, q: Number(r.quantity) || 0, rej: Number(r.rejectedQuantity) || 0 }))
      .filter((r) => r.q > 0);
    if (!items.length) {
      setDeliveryError(t('purchase.delivery.errorEmpty'));
      return;
    }
    for (const r of items) {
      const line = p.lines.find((l) => l.id === r.lineId)!;
      if (r.rej > r.q) {
        setDeliveryError(t('purchase.delivery.errorRejected', { product: line.product }));
        return;
      }
      if (round2(r.q - r.rej) > line.remaining + 0.001) {
        setDeliveryError(t('purchase.delivery.errorTooMuch', { product: line.product, remaining: line.remaining }));
        return;
      }
    }
    await run(async () => {
      try {
        const updated = await api<PurchaseDetail>(`/achats/purchases/${id}/deliveries`, {
          method: 'POST',
          body: JSON.stringify({
            ...deliveryForm,
            items: items.map((r) => ({ lineId: r.lineId, quantity: r.q, rejectedQuantity: r.rej, remark: r.remark || null })),
          }),
        });
        setPurchase(updated);
        setDeliveryOpen(false);
        setTab('livraisons');
      } catch (err) {
        setDeliveryError(err instanceof Error ? err.message : t('common.error'));
      }
    });
  }

  async function deleteDelivery(deliveryId: string) {
    if (!(await appConfirm(t('purchase.delivery.deleteConfirm')))) return;
    await run(async () => {
      try {
        setPurchase(await api<PurchaseDetail>(`/achats/purchases/${id}/deliveries/${deliveryId}`, { method: 'DELETE' }));
      } catch (err) {
        await appAlert(err instanceof Error ? err.message : t('common.error'));
      }
    });
  }

  async function saveDocument(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDocError('');
    if (!docFile) {
      setDocError(t('purchase.documents.errorFile'));
      return;
    }
    const fd = new FormData();
    fd.append('file', docFile);
    Object.entries(docForm).forEach(([k, v]) => { if (v) fd.append(k, v); });
    await run(async () => {
      try {
        await uploadForm(`/achats/purchases/${id}/documents`, fd);
        setDocOpen(false);
        setTab('documents');
        load();
      } catch (err) {
        setDocError(err instanceof Error ? err.message : t('common.error'));
      }
    });
  }

  async function deleteDocument(docId: string) {
    if (!(await appConfirm(t('purchase.documents.deleteConfirm')))) return;
    try {
      await api(`/achats/purchases/${id}/documents/${docId}`, { method: 'DELETE' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function savePayment(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setPayError('');
    const amount = Number(payForm.amount);
    if (!(amount > 0)) {
      setPayError(t('purchase.payments.errorAmount'));
      return;
    }
    if (amount > p.totals.remaining + 0.009) {
      setPayError(t('purchase.payments.errorTooHigh', { amount: formatAmount(p.totals.remaining) }));
      return;
    }
    await run(async () => {
      try {
        const updated = await api<PurchaseDetail>(`/achats/purchases/${id}/payments`, {
          method: 'POST',
          body: JSON.stringify({ ...payForm, amount }),
        });
        setPurchase(updated);
        setPayOpen(false);
        setTab('paiements');
      } catch (err) {
        setPayError(err instanceof Error ? err.message : t('common.error'));
      }
    });
  }

  async function deletePayment(paymentId: string) {
    if (!(await appConfirm(t('purchase.payments.deleteConfirm')))) return;
    await run(async () => {
      try {
        setPurchase(await api<PurchaseDetail>(`/achats/purchases/${id}/payments/${paymentId}`, { method: 'DELETE' }));
      } catch (err) {
        await appAlert(err instanceof Error ? err.message : t('common.error'));
      }
    });
  }

  const deliveredPct = p.totals.orderedQty > 0 ? Math.round((p.totals.acceptedQty / p.totals.orderedQty) * 100) : 0;
  const deliveryLate = Boolean(p.expectedDeliveryDate && p.deliveryStatus !== 'livre' && new Date(p.expectedDeliveryDate) < new Date());
  const paidPct = p.totals.totalTTC > 0 ? Math.round((p.totals.paid / p.totals.totalTTC) * 100) : 0;
  const budget = p.chantier?.budgetAchats;

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/achats" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            <div className="mac-detail-photo-fallback text-[#7c3aed]">
              <ShoppingCart size={28} strokeWidth={1.5} />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('purchase.detail.eyebrow')}</p>
            <h1 className="mac-detail-name truncate">{p.reference}</h1>
            <p className="mac-detail-meta">
              {p.supplier?.companyName || t('purchase.detail.noSupplier')}
              {' · '}{p.chantier?.name || '—'}{p.tranche ? ` · ${p.tranche}` : ''}
              {' · '}{formatDate(p.date)}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <PurchaseStatusPill status={p.status} />
              <PurchasePaymentPill status={p.paymentStatus} />
              <PurchaseDeliveryPill status={p.deliveryStatus} />
              {p.invoiced && <span className="mac-chip mac-chip-green">{t('msg.invoicedChip')}</span>}
            </div>
            {deliveryLate && (
              <p className="mt-2 text-[12px] font-medium text-gic-coral">{t('siteOps.deliveryLate')} · {formatDate(p.expectedDeliveryDate)}</p>
            )}
            <div className="purchase-stepper">
              {PURCHASE_STATUSES.map((s, i) => {
                const idx = statusIndex(p.status);
                const cls = i < idx ? 'purchase-step-done' : i === idx ? 'purchase-step-current' : '';
                return (
                  <span key={s} className={`purchase-step ${cls}`} title={t(`purchase.statusHint.${s}`)}>
                    <span className="purchase-step-num">{i < idx ? '✓' : i + 1}</span>
                    {t(`purchase.status.${s}`)}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          {next && (
            <Btn icon={CheckCircle} onClick={advance} disabled={busy}>{t(`purchase.action.${next}`)}</Btn>
          )}
          {prev && (
            <Btn variant="secondary" icon={RotateCcw} onClick={() => { setBackReason(''); setBackOpen(true); }} disabled={busy}>
              {t('purchase.detail.back')}
            </Btn>
          )}
          <Btn variant="secondary" icon={Printer} onClick={() => openPrintUrl(`/achats/purchases/${id}/print/bon_commande`)}>
            {t('purchase.actions.printOrder')}
          </Btn>
          <div className="mac-action-group ml-0.5">
            {p.deliveries.length > 0 && (
              <MacActionBtn icon={ClipboardCheck} tone="teal" title={t('purchase.actions.printReception')} onClick={() => openPrintUrl(`/achats/purchases/${id}/print/bon_reception`)} />
            )}
            {!isArchived && <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />}
            {isDraft && <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteOpen(true); setDeleteMotif(''); }} />}
          </div>
        </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-4 mb-4">
        <KpiCard
          title={t('purchase.fields.totalTtc')}
          value={formatMad(p.totals.totalTTC)}
          icon={ShoppingCart}
          tone="violet"
          compact
          delta={`HT ${formatMad(p.totals.amountHT)} · TVA ${formatMad(p.totals.tvaAmount)}`}
          deltaTone="muted"
        />
        <KpiCard
          title={t('purchase.analytics.paid')}
          value={formatMad(p.totals.paid)}
          icon={Wallet}
          tone="emerald"
          compact
          delta={`${paidPct} % · ${t('purchase.analytics.advances')} ${formatMad(p.totals.advances)}`}
          deltaTone="muted"
        />
        <KpiCard
          title={t('purchase.fields.remaining')}
          value={formatMad(p.totals.remaining)}
          icon={Receipt}
          tone="coral"
          compact
          delta={t(`purchase.payment.${p.paymentStatus}`)}
          deltaTone={p.totals.remaining > 0 ? 'coral' : 'emerald'}
        />
        <KpiCard
          title={t('purchase.detail.deliveryProgress')}
          value={`${deliveredPct} %`}
          icon={Truck}
          tone="amber"
          compact
          delta={t('purchase.detail.qtySummary', { accepted: p.totals.acceptedQty, ordered: p.totals.orderedQty })}
          deltaTone="muted"
        />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(v) => setTab(v as Tab)}
            ariaLabel={t('detail.sectionsPurchaseAria')}
            items={[
              { id: 'infos', label: t('tabs.informations'), icon: InfoIcon },
              { id: 'lignes', label: t('purchase.tabs.lines'), icon: Package, badge: p.lines.length },
              { id: 'livraisons', label: t('purchase.tabs.deliveries'), icon: Truck, badge: p.deliveries.length },
              { id: 'documents', label: t('tabs.documents'), icon: FileText, badge: p.documents.length },
              { id: 'paiements', label: t('purchase.tabs.payments'), icon: Wallet, badge: p.payments.length },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >
        {tab === 'infos' && (
          <div className="space-y-4 mt-1">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-[12px]">
              <Info icon={Hash} label={t('purchase.fields.reference')} value={p.reference} />
              <Info icon={Calendar} label={t('purchase.fields.createdAt')} value={formatDate(p.date)} />
              <Info
                icon={HardHat}
                label={t('fields.chantier')}
                value={p.chantier ? <Link to={`/chantiers/${p.chantier.id}`} className="text-[#007aff] hover:underline">{p.chantier.name}</Link> : '—'}
              />
              <Info icon={Layers} label={t('fields.tranche')} value={p.tranche || t('fields.trancheGlobal')} />
              <Info
                icon={Building2}
                label={t('purchase.fields.project')}
                value={
                  p.project ? (
                    <span>
                      <Link to={`/projets/${p.project.id}`} className="text-[#007aff] hover:underline">{p.project.name}</Link>
                      {p.project.client && (
                        <> · <Link to={`/clients/${p.project.client.id}`} className="text-[#007aff] hover:underline">{p.project.client.firstName} {p.project.client.lastName}</Link></>
                      )}
                    </span>
                  ) : '—'
                }
              />
              <Info
                icon={Truck}
                label={t('fields.supplier')}
                value={p.supplier ? <Link to={`/fournisseurs/${p.supplier.id}`} className="text-[#007aff] hover:underline">{p.supplier.reference} — {p.supplier.companyName}</Link> : '—'}
              />
              <Info icon={User} label={t('purchase.fields.requester')} value={p.requester || '—'} />
              <Info icon={UserCheck} label={t('purchase.fields.responsible')} value={p.responsible || '—'} />
              <Info
                icon={Calendar}
                label={t('purchase.fields.expectedDelivery')}
                value={
                  p.expectedDeliveryDate ? (
                    <span className={p.deliveryStatus !== 'livre' && new Date(p.expectedDeliveryDate) < new Date() ? 'text-gic-coral' : ''}>
                      {formatDate(p.expectedDeliveryDate)}
                    </span>
                  ) : '—'
                }
              />
              <Info icon={Wallet} label={t('purchase.fields.advanceAmount')} value={`${formatAmount(p.totals.advances)}${p.advanceMode ? ` · ${t(`purchase.mode.${p.advanceMode}`)}` : ''}`} />
              <Info icon={User} label={t('purchase.fields.author')} value={p.author || '—'} />
              <Info icon={Calendar} label={t('fields.createdAt')} value={formatDate(p.createdAt)} />
              {p.remark && <Info icon={FileText} label={t('purchase.fields.observations')} value={p.remark} className="sm:col-span-2 lg:col-span-3" />}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="purchase-totals">
                <div><span>{t('purchase.fields.totalHt')}</span><strong>{formatAmount(p.totals.amountHT)}</strong></div>
                <div><span>{t('purchase.fields.totalTva')}</span><strong>{formatAmount(p.totals.tvaAmount)}</strong></div>
                <div className="purchase-totals-main"><span>{t('purchase.fields.totalTtc')}</span><strong>{formatAmount(p.totals.totalTTC)}</strong></div>
                <div><span>{t('purchase.fields.totalAdvance')}</span><strong>{formatAmount(p.totals.advances)}</strong></div>
                <div><span>{t('purchase.analytics.paid')}</span><strong>{formatAmount(p.totals.paid)}</strong></div>
                <div className="purchase-totals-remaining"><span>{t('purchase.fields.remaining')}</span><strong>{formatAmount(p.totals.remaining)}</strong></div>
              </div>
              <Card>
                <p className="text-[12px] font-semibold mb-2">{t('purchase.detail.chain')}</p>
                <ol className="space-y-1.5 text-[12px]">
                  <ChainStep done label={t('purchase.chain.chantier')} value={`${p.chantier?.name || '—'}${p.tranche ? ` · ${p.tranche}` : ''}`} />
                  <ChainStep done={!!p.supplier} label={t('purchase.chain.supplier')} value={p.supplier?.companyName || '—'} />
                  <ChainStep done={p.lines.length > 0} label={t('purchase.chain.products')} value={t('purchase.list.productsCount', { count: p.lines.length })} />
                  <ChainStep done={p.deliveryStatus === 'livre'} partial={p.deliveryStatus === 'partiel'} label={t('purchase.chain.deliveries')} value={`${p.deliveries.length} · ${t(`purchase.delivery.${p.deliveryStatus}`)}`} />
                  <ChainStep done={p.checks.hasInvoice} label={t('purchase.chain.invoices')} value={String(docsByType.facture_fournisseur || docsByType.facture || 0)} />
                  <ChainStep done={p.paymentStatus === 'paye'} partial={p.paymentStatus === 'partiel'} label={t('purchase.chain.payments')} value={`${p.payments.length} · ${t(`purchase.payment.${p.paymentStatus}`)}`} />
                </ol>
                {budget != null && budget > 0 && (
                  <p className="text-[11px] text-gic-muted mt-3">
                    {t('purchase.detail.budgetShare', { pct: Math.round((p.totals.totalTTC / budget) * 1000) / 10, budget: formatMad(budget) })}
                  </p>
                )}
              </Card>
            </div>
          </div>
        )}

        {tab === 'lignes' && (
          <div className="mt-1">
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>#</Th>
                  <Th mac>{t('purchase.fields.product')}</Th>
                  <Th mac>{t('purchase.fields.productRef')}</Th>
                  <Th mac>{t('purchase.fields.quantity')}</Th>
                  <Th mac>{t('purchase.fields.unitPrice')}</Th>
                  <Th mac>{t('purchase.fields.tva')}</Th>
                  <Th mac>{t('purchase.fields.amountTtc')}</Th>
                  <Th mac>{t('purchase.delivery.delivered')}</Th>
                  <Th mac>{t('purchase.delivery.remaining')}</Th>
                  <Th mac>{t('purchase.delivery.state')}</Th>
                </tr>
              </thead>
              <tbody>
                {p.lines.map((l, i) => (
                  <tr key={l.id}>
                    <Td mac className="mac-table-muted">{i + 1}</Td>
                    <Td mac>
                      <p className="font-medium">{l.product}</p>
                      {l.family && <p className="text-[10px] text-gic-muted">{l.family}</p>}
                    </Td>
                    <Td mac className="mac-table-muted">{l.reference || '—'}</Td>
                    <Td mac>{l.quantity} {l.unit || ''}</Td>
                    <Td mac>{formatAmount(l.unitPrice)}</Td>
                    <Td mac>{l.tvaRate} %</Td>
                    <Td mac className="font-medium">{formatAmount(l.amountTTC)}</Td>
                    <Td mac>
                      {l.accepted}
                      {l.rejected > 0 && <p className="text-[10px] text-gic-coral">{t('purchase.delivery.rejectedShort', { qty: l.rejected })}</p>}
                    </Td>
                    <Td mac className={l.remaining > 0 ? 'text-[#ff9500] font-medium' : ''}>{l.remaining}</Td>
                    <Td mac><PurchaseDeliveryPill status={l.state} /></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <div className="flex justify-end mt-3">
              <div className="purchase-totals min-w-[260px]">
                <div><span>{t('purchase.fields.totalHt')}</span><strong>{formatAmount(p.totals.amountHT)}</strong></div>
                <div><span>{t('purchase.fields.totalTva')}</span><strong>{formatAmount(p.totals.tvaAmount)}</strong></div>
                <div className="purchase-totals-main"><span>{t('purchase.fields.totalTtc')}</span><strong>{formatAmount(p.totals.totalTTC)}</strong></div>
              </div>
            </div>
            {isDraft && <p className="text-[11px] text-gic-muted mt-2">{t('purchase.detail.linesEditableHint')}</p>}
          </div>
        )}

        {tab === 'livraisons' && (
          <div className="space-y-3 mt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-gic-muted">
                {canDeliver ? t('purchase.delivery.hint') : isDraft ? t('purchase.delivery.needOrder') : t('purchase.delivery.locked')}
              </p>
              {canDeliver && p.totals.remainingQty > 0 && (
                <Btn icon={Plus} onClick={openDelivery}>{t('purchase.delivery.add')}</Btn>
              )}
            </div>
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('purchase.fields.product')}</Th>
                  <Th mac>{t('purchase.delivery.ordered')}</Th>
                  <Th mac>{t('purchase.delivery.delivered')}</Th>
                  <Th mac>{t('purchase.delivery.rejected')}</Th>
                  <Th mac>{t('purchase.delivery.remaining')}</Th>
                  <Th mac>{t('purchase.fields.unit')}</Th>
                  <Th mac>{t('purchase.delivery.state')}</Th>
                </tr>
              </thead>
              <tbody>
                {p.lines.map((l) => (
                  <tr key={l.id}>
                    <Td mac className="font-medium">{l.product}</Td>
                    <Td mac>{l.quantity}</Td>
                    <Td mac>{l.delivered}</Td>
                    <Td mac className={l.rejected > 0 ? 'text-gic-coral' : ''}>{l.rejected}</Td>
                    <Td mac className={l.remaining > 0 ? 'text-[#ff9500] font-medium' : ''}>{l.remaining}</Td>
                    <Td mac className="mac-table-muted">{l.unit || '—'}</Td>
                    <Td mac><PurchaseDeliveryPill status={l.state} /></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            {p.deliveries.length === 0 ? (
              <p className="text-[12px] text-gic-muted py-4 text-center">{t('purchase.delivery.empty')}</p>
            ) : (
              p.deliveries.map((d) => (
                <Card key={d.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-[12px] font-semibold">
                        {formatDate(d.date)}{d.number ? ` · ${t('purchase.delivery.number')} ${d.number}` : ''}
                      </p>
                      <p className="text-[10px] text-gic-muted">{d.createdBy || '—'}{d.remark ? ` · ${d.remark}` : ''}</p>
                    </div>
                    {canDeliver && <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteDelivery(d.id)} />}
                  </div>
                  <ul className="text-[12px] space-y-1">
                    {d.items.map((it) => (
                      <li key={it.id} className="flex flex-wrap justify-between gap-2">
                        <span>{it.line.product}</span>
                        <span className="text-gic-muted">
                          {t('purchase.delivery.itemSummary', { qty: it.quantity, unit: it.line.unit || '' })}
                          {it.rejectedQuantity > 0 && <span className="text-gic-coral"> · {t('purchase.delivery.rejectedShort', { qty: it.rejectedQuantity })}</span>}
                          {it.remark ? ` · ${it.remark}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))
            )}
          </div>
        )}

        {tab === 'documents' && (
          <div className="space-y-3 mt-1">
            {id && <EntityDocChecklist entityType="purchase" entityId={id} />}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {PURCHASE_DOC_TYPES.filter((dt) => ['bon_commande', 'bon_livraison', 'facture_fournisseur', 'justificatif_paiement'].includes(dt)).map((dt) => (
                  <span key={dt} className={`mac-chip ${docsByType[dt] ? 'mac-chip-green' : ''}`}>
                    {t(`purchase.docType.${dt}`)} · {docsByType[dt] || 0}
                  </span>
                ))}
              </div>
              {!isArchived && <Btn icon={Upload} onClick={() => openDocument('bon_livraison')}>{t('purchase.documents.add')}</Btn>}
            </div>
            {p.documents.length === 0 ? (
              <p className="text-[12px] text-gic-muted py-6 text-center">{t('purchase.documents.empty')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('purchase.documents.type')}</Th>
                    <Th mac>{t('purchase.documents.number')}</Th>
                    <Th mac>{t('purchase.documents.date')}</Th>
                    <Th mac>{t('purchase.documents.amount')}</Th>
                    <Th mac>{t('purchase.documents.uploadedBy')}</Th>
                    <Th mac>{t('purchase.documents.addedAt')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {p.documents.map((d) => (
                    <tr key={d.id}>
                      <Td mac>
                        <p className="font-medium">{d.category ? t(`purchase.docType.${d.category}`) : '—'}</p>
                        <p className="text-[10px] text-gic-muted truncate max-w-[200px]">{d.name}</p>
                      </Td>
                      <Td mac>{d.docNumber || '—'}</Td>
                      <Td mac className="text-[11px]">{d.docDate ? formatDate(d.docDate) : '—'}</Td>
                      <Td mac>{d.amount != null ? formatAmount(d.amount) : '—'}</Td>
                      <Td mac className="mac-table-muted text-[11px]">{d.uploadedByName || '—'}</Td>
                      <Td mac className="text-[11px]">{formatDate(d.createdAt)}</Td>
                      <Td mac className="mac-td-actions">
                        <div className="mac-actions">
                          <a href={d.path} target="_blank" rel="noreferrer" className="mac-action-btn mac-action-btn-blue" title={t('actions.open')}>
                            <FileText size={14} strokeWidth={2.15} />
                          </a>
                          {!isArchived && <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteDocument(d.id)} />}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}

        {tab === 'paiements' && (
          <div className="space-y-3 mt-1">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] items-start">
              <div className="purchase-totals">
                <div><span>{t('purchase.payments.purchaseAmount')}</span><strong>{formatAmount(p.totals.totalTTC)}</strong></div>
                <div><span>{t('purchase.payments.advancePaid')}</span><strong>{formatAmount(p.totals.advances)}</strong></div>
                <div><span>{t('purchase.payments.otherPayments')}</span><strong>{formatAmount(round2(p.totals.paid - p.totals.advances))}</strong></div>
                <div className="purchase-totals-main"><span>{t('purchase.analytics.paid')}</span><strong>{formatAmount(p.totals.paid)}</strong></div>
                <div className="purchase-totals-remaining"><span>{t('purchase.fields.remaining')}</span><strong>{formatAmount(p.totals.remaining)}</strong></div>
                <div><span>{t('purchase.payments.state')}</span><PurchasePaymentPill status={p.paymentStatus} /></div>
              </div>
              {canPay && <Btn icon={Plus} onClick={() => openPayment()}>{t('purchase.payments.add')}</Btn>}
            </div>
            {p.payments.length === 0 ? (
              <p className="text-[12px] text-gic-muted py-4 text-center">{t('purchase.payments.empty')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('purchase.payments.kind')}</Th>
                    <Th mac>{t('purchase.payments.mode')}</Th>
                    <Th mac>{t('purchase.payments.reference')}</Th>
                    <Th mac>{t('common.amount')}</Th>
                    <Th mac>{t('purchase.payments.cash')}</Th>
                    <Th mac>{t('columns.user')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {p.payments.map((pay) => (
                    <tr key={pay.id}>
                      <Td mac className="text-[11px]">{formatDate(pay.date)}</Td>
                      <Td mac>
                        {t(`purchase.kind.${pay.kind}`)}
                        {pay.remark && <p className="text-[10px] text-gic-muted">{pay.remark}</p>}
                      </Td>
                      <Td mac>{pay.mode ? t(`purchase.mode.${pay.mode}`) : '—'}</Td>
                      <Td mac className="mac-table-muted">{pay.reference || '—'}</Td>
                      <Td mac className="font-medium">{formatAmount(pay.amount)}</Td>
                      <Td mac>
                        {pay.cashMovementId ? (
                          <Link to={`/balance/${pay.cashMovementId}`} className="text-[#007aff] hover:underline text-[11px]">{t('purchase.payments.openMovement')}</Link>
                        ) : '—'}
                      </Td>
                      <Td mac className="mac-table-muted text-[11px]">{pay.createdBy || '—'}</Td>
                      <Td mac className="mac-td-actions">
                        {!lockedPayments && <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deletePayment(pay.id)} />}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
            {lockedPayments && <p className="text-[11px] text-gic-muted">{t('purchase.payments.lockedHint')}</p>}
          </div>
        )}

        {tab === 'historique' && (
          <div className="space-y-4 mt-1">
            {p.history.length === 0 ? (
              <p className="text-[12px] text-gic-muted py-4 text-center">{t('msg.emptyWorkflowSteps')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('columns.old')}</Th>
                    <Th mac>{t('common.new')}</Th>
                    <Th mac>{t('columns.user')}</Th>
                    <Th mac>{t('columns.comment')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {p.history.map((h) => (
                    <tr key={h.id}>
                      <Td mac className="text-[11px]">{new Date(h.createdAt).toLocaleString('fr-MA')}</Td>
                      <Td mac>{h.oldStatus ? <PurchaseStatusPill status={h.oldStatus} /> : '—'}</Td>
                      <Td mac><PurchaseStatusPill status={h.newStatus} /></Td>
                      <Td mac className="mac-table-muted text-[11px]">{h.userName || '—'}</Td>
                      <Td mac className="mac-table-muted text-[11px]">{h.comment || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
            {auditLogs.length > 0 && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gic-muted pt-2">{t('detail.auditLog')}</p>
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
                    {auditLogs.map((h) => (
                      <tr key={h.id}>
                        <Td mac className="text-[11px]">{new Date(h.createdAt).toLocaleString('fr-MA')}</Td>
                        <Td mac className="capitalize">{h.action}</Td>
                        <Td mac className="mac-table-muted text-[11px]">{h.user ? `${h.user.firstName} ${h.user.lastName}` : '—'}</Td>
                        <Td mac className="mac-table-muted text-[11px]">{h.details || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </>
            )}
          </div>
        )}
      </DetailShell>

      <Modal
        open={editOpen}
        size={isDraft ? 'xl' : 'md'}
        title={t('purchase.form.editTitle', { ref: p.reference })}
        onClose={() => setEditOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-purchase-form" type="submit" disabled={busy}>{t('common.save')}</Btn></>}
      >
        {form && (
          <form id="edit-purchase-form" onSubmit={saveEdit}>
            <PurchaseFormFields
              form={form}
              setForm={setForm}
              suppliers={suppliers}
              chantiers={chantiers}
              families={families}
              tranches={chantierTranches}
              reference={p.reference}
              trackingOnly={!isDraft}
            />
            {formError && <p className="mt-3 text-[11px] text-gic-coral">{formError}</p>}
          </form>
        )}
      </Modal>

      <Modal
        open={backOpen}
        title={t('purchase.detail.backTitle', { status: prev ? t(`purchase.status.${prev}`) : '' })}
        onClose={() => setBackOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setBackOpen(false)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={goBack} disabled={!backReason.trim() || busy}>{t('purchase.detail.back')}</Btn></>}
      >
        <Textarea label={`${t('purchase.detail.backReason')} *`} value={backReason} onChange={(e) => setBackReason(e.target.value)} />
      </Modal>

      <Modal
        open={deliveryOpen}
        size="xl"
        title={t('purchase.delivery.addTitle', { ref: p.reference })}
        onClose={() => setDeliveryOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setDeliveryOpen(false)}>{t('common.cancel')}</Btn><Btn form="delivery-form" type="submit" disabled={busy}>{t('purchase.delivery.save')}</Btn></>}
      >
        <form id="delivery-form" onSubmit={saveDelivery} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label={t('purchase.delivery.date')} type="date" value={deliveryForm.date} onChange={(e) => setDeliveryForm({ ...deliveryForm, date: e.target.value })} />
            <Input label={t('purchase.delivery.number')} value={deliveryForm.number} onChange={(e) => setDeliveryForm({ ...deliveryForm, number: e.target.value })} />
            <Input label={t('purchase.fields.observations')} value={deliveryForm.remark} onChange={(e) => setDeliveryForm({ ...deliveryForm, remark: e.target.value })} />
          </div>
          <div className="purchase-lines-wrap">
            <table className="purchase-lines-table">
              <thead>
                <tr>
                  <th>{t('purchase.fields.product')}</th>
                  <th className="w-20">{t('purchase.delivery.ordered')}</th>
                  <th className="w-20">{t('purchase.delivery.alreadyAccepted')}</th>
                  <th className="w-20">{t('purchase.delivery.remaining')}</th>
                  <th className="w-24">{t('purchase.delivery.deliveredNow')}</th>
                  <th className="w-24">{t('purchase.delivery.rejected')}</th>
                  <th>{t('purchase.fields.observations')}</th>
                </tr>
              </thead>
              <tbody>
                {deliveryRows.map((r, i) => {
                  const line = p.lines.find((l) => l.id === r.lineId)!;
                  const accepted = (Number(r.quantity) || 0) - (Number(r.rejectedQuantity) || 0);
                  const invalid = accepted > line.remaining + 0.001 || (Number(r.rejectedQuantity) || 0) > (Number(r.quantity) || 0);
                  const setRow = (patch: Partial<DeliveryRow>) =>
                    setDeliveryRows(deliveryRows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <tr key={r.lineId}>
                      <td>
                        <p className="font-medium">{line.product}</p>
                        <p className="text-[10px] text-gic-muted">{line.unit || ''}</p>
                      </td>
                      <td>{line.quantity}</td>
                      <td>{line.accepted}</td>
                      <td className={line.remaining > 0 ? 'text-[#ff9500] font-medium' : ''}>{line.remaining}</td>
                      <td>
                        <input type="number" min="0" step="0.01" className={invalid ? 'is-invalid' : ''} value={r.quantity}
                          disabled={line.remaining <= 0} onChange={(e) => setRow({ quantity: e.target.value })} />
                      </td>
                      <td>
                        <input type="number" min="0" step="0.01" className={invalid ? 'is-invalid' : ''} value={r.rejectedQuantity}
                          disabled={line.remaining <= 0} onChange={(e) => setRow({ rejectedQuantity: e.target.value })} />
                      </td>
                      <td><input value={r.remark} onChange={(e) => setRow({ remark: e.target.value })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gic-muted">{t('purchase.delivery.rejectedHint')}</p>
          {deliveryError && <p className="text-[11px] text-gic-coral">{deliveryError}</p>}
        </form>
      </Modal>

      <Modal
        open={docOpen}
        title={t('purchase.documents.addTitle')}
        onClose={() => setDocOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setDocOpen(false)}>{t('common.cancel')}</Btn><Btn form="purchase-doc-form" type="submit" disabled={busy}>{t('purchase.documents.upload')}</Btn></>}
      >
        <form id="purchase-doc-form" onSubmit={saveDocument} className="grid gap-3 sm:grid-cols-2">
          <Select label={`${t('purchase.documents.type')} *`} value={docForm.category} onChange={(e) => setDocForm({ ...docForm, category: e.target.value })}>
            {PURCHASE_DOC_TYPES.map((dt) => (
              <option key={dt} value={dt}>{t(`purchase.docType.${dt}`)}</option>
            ))}
          </Select>
          <Input label={t('purchase.documents.number')} value={docForm.docNumber} onChange={(e) => setDocForm({ ...docForm, docNumber: e.target.value })} />
          <Input label={t('purchase.documents.date')} type="date" value={docForm.docDate} onChange={(e) => setDocForm({ ...docForm, docDate: e.target.value })} />
          <Input label={t('purchase.documents.amountOptional')} type="number" min="0" step="0.01" value={docForm.amount} onChange={(e) => setDocForm({ ...docForm, amount: e.target.value })} />
          <div className="sm:col-span-2">
            <Input label={t('purchase.documents.name')} value={docForm.name} onChange={(e) => setDocForm({ ...docForm, name: e.target.value })} />
          </div>
          <label className="sm:col-span-2 block">
            <span className="block text-[11px] font-medium text-gic-muted mb-1">{t('purchase.documents.file')} *</span>
            <input type="file" accept="application/pdf,image/*" className="text-[12px]" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
          </label>
          {docError && <p className="sm:col-span-2 text-[11px] text-gic-coral">{docError}</p>}
        </form>
      </Modal>

      <Modal
        open={payOpen}
        title={t('purchase.payments.addTitle')}
        onClose={() => setPayOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setPayOpen(false)}>{t('common.cancel')}</Btn><Btn form="purchase-pay-form" type="submit" disabled={busy}>{t('purchase.payments.save')}</Btn></>}
      >
        <form id="purchase-pay-form" onSubmit={savePayment} className="grid gap-3 sm:grid-cols-2">
          <Select label={t('purchase.payments.kind')} value={payForm.kind} onChange={(e) => setPayForm({ ...payForm, kind: e.target.value })}>
            {PURCHASE_PAYMENT_KINDS.map((k) => (
              <option key={k} value={k}>{t(`purchase.kind.${k}`)}</option>
            ))}
          </Select>
          <Input label={t('purchase.payments.date')} type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} />
          <Input label={`${t('common.amount')} *`} type="number" min="0" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
          <Select label={`${t('purchase.payments.mode')} *`} value={payForm.mode} onChange={(e) => setPayForm({ ...payForm, mode: e.target.value })}>
            {PURCHASE_PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>{t(`purchase.mode.${m}`)}</option>
            ))}
          </Select>
          <Input label={t('purchase.payments.reference')} value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
          <Input label={t('fields.remark')} value={payForm.remark} onChange={(e) => setPayForm({ ...payForm, remark: e.target.value })} />
          <p className="sm:col-span-2 text-[11px] text-gic-muted">
            {t('purchase.payments.remainingHint', { amount: formatAmount(p.totals.remaining) })} {t('purchase.payments.cashHint')}
          </p>
          {payError && <p className="sm:col-span-2 text-[11px] text-gic-coral">{payError}</p>}
        </form>
      </Modal>

      <Modal open={deleteOpen} title={t('actions.deletePurchase')} onClose={() => setDeleteOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn></>}
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('purchase.list.deleteHint')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.motifShortPlaceholder')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>
    </div>
  );
}

function ChainStep({ done, partial, label, value }: { done: boolean; partial?: boolean; label: string; value: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`inline-block w-2 h-2 rounded-full ${done ? 'bg-[#34c759]' : partial ? 'bg-[#ff9500]' : 'bg-black/15'}`} />
      <span className="text-gic-muted w-28 shrink-0">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </li>
  );
}

function Info({
  icon: Icon,
  label,
  value,
  className = '',
}: {
  icon: typeof Hash;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] text-gic-muted uppercase flex items-center gap-1 mb-0.5">
        <Icon size={11} className="opacity-60" /> {label}
      </p>
      <div className="font-medium text-gic-ink">{value}</div>
    </div>
  );
}
