import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Printer, History, FileText, CheckCircle, RotateCcw, ShoppingCart, Hash, Calendar, Truck, HardHat, CreditCard, Layers, Wallet, Info as InfoIcon } from 'lucide-react';
import { api, fetchSupplierList, fetchChantierList, formatDate, formatMad } from '../lib/api';
import { Btn, Card, KpiCard, MacActionBtn, Modal, StatusPill, TableWrap, Td, Th, PageBackLink } from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';


import { PurchaseFormFields, purchaseToForm, type PurchaseFormData } from '../components/PurchaseFormFields';
import { useAuth } from '../context/AuthContext';

type Tab = 'infos' | 'documents' | 'historique';

const WORKFLOW_STEPS = ['brouillon', 'validé', 'visé', 'contrôlé'] as const;

/** Soft role gate for purchase workflow steps (visa / contrôle). */
function canAdvancePurchaseWorkflow(role: string | undefined, nextStatus: string): boolean {
  // No dedicated controller role in ROLE_MODULES — soft-check admin / comptable for visa & contrôle.
  const r = (role || '').toUpperCase();
  const isAdmin = r === 'SUPER_ADMIN' || r === 'ADMIN';
  const isController = isAdmin || r === 'COMPTABLE' || r.includes('CONTROL') || r.includes('CONTROLE') || r.includes('VISA');
  if (nextStatus === 'visé' || nextStatus === 'contrôlé') return isController;
  return true; // validation (brouillon → validé) open to achats module users
}

function purchaseDocLabel(t: (key: string) => string, category: string) {
  const map: Record<string, string> = {
    devis: t('fields.quote'),
    facture: t('fields.invoice'),
    bon_livraison: t('fields.deliveryNote'),
  };
  return map[category] || category;
}

export default function AchatDetailPage() {
  const { t } = useI18n();

  const WORKFLOW: Record<string, { label: string; next: string }> = {
    brouillon: { label: t('columns.validate'), next: 'validé' },
    validé: { label: t('columns.visa'), next: 'visé' },
    visé: { label: t('columns.control'), next: 'contrôlé' },
  };
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [purchase, setPurchase] = useState<any>(null);
  const [history, setHistory] = useState<{ workflow: any[]; auditLogs: any[] }>({ workflow: [], auditLogs: [] });
  const [docs, setDocs] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [chantiers, setChantiers] = useState<any[]>([]);
  const [chantierTranches, setChantierTranches] = useState<{ id: string; name: string }[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<PurchaseFormData>({
    designation: '', family: '', unit: '', quantity: '1', unitPrice: '', tvaRate: '20',
    supplierId: '', chantierId: '', tranche: '', paymentMode: 'especes', author: '', remark: '', date: '', invoiced: 'false',
  });

  function load() {
    if (!id) return;
    setError('');
    api(`/achats/purchases/${id}`).then(setPurchase).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/achats/purchases/${id}/history`).then(setHistory).catch(() => setHistory({ workflow: [], auditLogs: [] }));
  }

  function loadDocs() {
    if (!id) return;
    api(`/achats/purchases/${id}/documents`).then(setDocs).catch(() => setDocs([]));
  }

  useEffect(() => {
    load();
    loadDocs();
    fetchSupplierList().then(setSuppliers);
    fetchChantierList().then(setChantiers);
    api('/achats/families').then(setFamilies);
  }, [id]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
    if (tab === 'documents') loadDocs();
  }, [tab, id]);

  useEffect(() => {
    if (!form.chantierId) {
      setChantierTranches([]);
      return;
    }
    api<{ id: string; name: string }[]>(`/chantiers/${form.chantierId}/tranches`)
      .then(setChantierTranches)
      .catch(() => setChantierTranches([]));
  }, [form.chantierId]);

  function openEdit() {
    if (!purchase) return;
    setForm(purchaseToForm(purchase));
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/achats/purchases/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          designation: form.designation,
          family: form.family || null,
          unit: form.unit || null,
          quantity: form.quantity,
          unitPrice: form.unitPrice,
          tvaRate: form.tvaRate || '20',
          supplierId: form.supplierId || null,
          chantierId: form.chantierId || null,
          tranche: form.tranche || null,
          paymentMode: form.paymentMode,
          author: form.author || null,
          remark: form.remark || null,
          date: form.date,
          invoiced: form.invoiced === 'true',
        }),
      });
      setEditOpen(false);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function setStatus(status: string, comment?: string) {
    // Soft gate: visa / contrôle réservés admin ou comptable (pas de rôle dédié dans permissions).
    if (!canAdvancePurchaseWorkflow(user?.role, status)) {
      await appAlert(t('msg.purchaseAdminOnly'));
      return;
    }
    try {
      const res = await api<{ cashMovement?: { id: string }; cashMovementCreated?: boolean }>(`/achats/purchases/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, comment: comment || `Passage → ${status}` }),
      });
      load();
      loadHistory();
      if (status === 'contrôlé' && res.cashMovement?.id) {
        const msg = res.cashMovementCreated
          ? t('msg.balanceAutoCreated')
          : t('msg.balanceAlreadyRegistered');
        if (await appConfirm(t('msg.openBalanceConfirm', { msg }))) {
          navigate(`/balance/${res.cashMovement.id}`);
        }
      }
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
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

  function printFiche() {
    if (!purchase) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Achat ${purchase.reference}</title></head><body style="font-family:sans-serif;padding:24px;font-size:12px">
      <h1>Bon d'achat — GIC</h1>
      <h2>${purchase.reference}</h2>
      <p><b>Date :</b> ${formatDate(purchase.date)}</p>
      <p><b>Désignation :</b> ${purchase.designation}</p>
      <p><b>Fournisseur :</b> ${purchase.supplier?.companyName || '—'}</p>
      <p><b>Chantier :</b> ${purchase.chantier?.name || '—'}</p>
      <p><b>Tranche :</b> ${purchase.tranche || '—'}</p>
      <p><b>Quantité :</b> ${purchase.quantity} ${purchase.unit || ''}</p>
      <p><b>PU HT :</b> ${formatMad(purchase.unitPrice)}</p>
      <p><b>Total TTC :</b> ${formatMad(purchase.totalPrice)}</p>
      <p><b>Statut :</b> ${purchase.status}</p>
      <p><b>Mode paiement :</b> ${purchase.paymentMode || '—'}</p>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (!purchase && !error) return <p className="text-[12px] text-gic-muted p-6">{t('common.loading')}</p>;

  if (error && !purchase) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/achats" className="mt-2" />
      </Card>
    );
  }

  const canEdit = ['brouillon', 'retourné'].includes(purchase.status);
  const canReturn = ['validé', 'visé'].includes(purchase.status);
  const nextStep = WORKFLOW[purchase.status];
  const canRunNext = nextStep ? canAdvancePurchaseWorkflow(user?.role, nextStep.next) : false;

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
            <p className="mac-detail-eyebrow">{t('detail.purchaseOrder')}</p>
            <h1 className="mac-detail-name truncate">{purchase.reference}</h1>
            <p className="mac-detail-meta">
              {purchase.designation}
              {' · '}{formatMad(purchase.totalPrice)} TTC
              {' · '}{formatDate(purchase.date)}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusPill status={purchase.status} />
              {purchase.invoiced && <span className="mac-chip mac-chip-green">{t('msg.invoicedChip')}</span>}
              {purchase.tranche && <span className="mac-chip">{purchase.tranche}</span>}
              {purchase.cashMovement && (
                <Link to={`/balance/${purchase.cashMovement.id}`} className="mac-chip mac-chip-blue hover:opacity-90">
                  Balance · {formatMad(purchase.cashMovement.debit)}
                </Link>
              )}
            </div>
            <WorkflowBar status={purchase.status} t={t} />
          </div>
        </div>
        <div className="mac-page-actions">
          {nextStep && canRunNext && (
            <Btn icon={CheckCircle} onClick={() => setStatus(nextStep.next)}>{nextStep.label}</Btn>
          )}
          {nextStep && !canRunNext && (
            <Btn
              variant="secondary"
              icon={CheckCircle}
              title={t('msg.adminComptableTitle')}
              onClick={() => setStatus(nextStep.next)}
            >
              {nextStep.label}
            </Btn>
          )}
          {canReturn && (
            <Btn variant="secondary" icon={RotateCcw} onClick={() => setStatus('retourné', t('msg.returnForCorrection'))}>{t('msg.returnPurchase')}</Btn>
          )}
          <Btn variant="secondary" icon={Printer} onClick={printFiche}>{t('common.print')}</Btn>
          <div className="mac-action-group ml-0.5">
            {canEdit && <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />}
            {canEdit && <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteOpen(true); setDeleteMotif(''); }} />}
          </div>
                 </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-4 mb-4">
        <KpiCard title={t('fields.totalTtc')} value={formatMad(purchase.totalPrice)} icon={ShoppingCart} tone="coral" compact />
        <KpiCard
          title={t('fields.amountHt')}
          value={formatMad(purchase.amountHT ?? purchase.quantity * purchase.unitPrice)}
          icon={CreditCard}
          tone="violet"
          delta={`TVA ${purchase.tvaRate ?? 20}% · ${formatMad(purchase.tvaAmount ?? 0)}`}
          deltaTone="muted"
        />
        <KpiCard title={t('fields.quantity')} value={`${purchase.quantity} ${purchase.unit || ''}`.trim()} icon={Hash} tone="amber" />
        <KpiCard
          title={t('fields.paymentMode')}
          value={(purchase.paymentMode || '—').replace(/_/g, ' ')}
          icon={CreditCard}
          tone="emerald"
          delta={purchase.invoiced ? t('msg.invoicedChip') : t('msg.notInvoiced')}
          deltaTone="muted"
        />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsPurchaseAria')}
            items={[
              { id: 'infos', label: t('tabs.informations'), icon: InfoIcon },
              { id: 'documents', label: t('tabs.documents'), icon: FileText, badge: docs.length },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >

        {tab === 'infos' && (
          <div className="grid sm:grid-cols-2 gap-4 text-[12px] mt-1">
            <Info icon={Calendar} label={t('fields.date')} value={formatDate(purchase.date)} />
            <Info icon={Hash} label={t('fields.family')} value={purchase.family || '—'} />
            <Info icon={ShoppingCart} label={t('fields.designation')} value={purchase.designation} className="sm:col-span-2" />
            <Info icon={CreditCard} label={t('fields.unitPriceHt')} value={formatMad(purchase.unitPrice)} />
            <Info icon={CreditCard} label={t('fields.paymentMode')} value={(purchase.paymentMode || '—').replace(/_/g, ' ')} />
            <Info icon={Hash} label={t('fields.authorRequester')} value={purchase.author || '—'} />
            <Info
              icon={Truck}
              label={t('fields.supplier')}
              value={
                purchase.supplier ? (
                  <Link to={`/fournisseurs/${purchase.supplier.id}`} className="text-[#007aff] hover:underline">
                    {purchase.supplier.reference} — {purchase.supplier.companyName}
                  </Link>
                ) : '—'
              }
            />
            <Info
              icon={HardHat}
              label={t('fields.chantier')}
              value={
                purchase.chantier ? (
                  <Link to={`/chantiers/${purchase.chantier.id}`} className="text-[#007aff] hover:underline">
                    {purchase.chantier.name}
                  </Link>
                ) : '—'
              }
            />
            <Info icon={Layers} label={t('fields.tranche')} value={purchase.tranche || '—'} />
            {purchase.cashMovement && (
              <Info
                icon={Wallet}
                label={t('fields.movementBalance')}
                value={
                  <Link to={`/balance/${purchase.cashMovement.id}`} className="text-[#007aff] hover:underline">
                    {formatMad(purchase.cashMovement.debit)} — {purchase.cashMovement.account?.name || 'Compte'}
                  </Link>
                }
              />
            )}
            <Info icon={Calendar} label={t('fields.createdAt')} value={formatDate(purchase.createdAt)} />
            {purchase.remark && (
              <Info icon={FileText} label={t('fields.remark')} value={purchase.remark} className="sm:col-span-2" />
            )}
          </div>
        )}

        {tab === 'documents' && (
          docs.length === 0 ? (
            <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyPurchasePortalDocs')}</p>
          ) : (
            <div className="space-y-2 mt-1">
              {docs.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-xl bg-black/[0.03] px-3 py-2.5">
                  <FileText size={16} className="text-[#007aff] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium">{purchaseDocLabel(t, d.category)}</p>
                    <p className="text-[10px] text-gic-muted truncate">{d.name} · {formatDate(d.createdAt)}</p>
                  </div>
                  <a href={d.path} target="_blank" rel="noreferrer" className="text-[11px] text-[#007aff] hover:underline shrink-0">
                    {t('actions.open')}
                  </a>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'historique' && (
          <div className="space-y-4 mt-1">
            {history.workflow.length === 0 ? (
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
                  {history.workflow.map((h) => (
                    <tr key={h.id}>
                      <Td mac className="text-[11px]">{formatDate(h.createdAt)}</Td>
                      <Td mac className="capitalize mac-table-muted">{h.oldStatus || '—'}</Td>
                      <Td mac><StatusPill status={h.newStatus} quiet /></Td>
                      <Td mac className="mac-table-muted text-[11px]">{h.userName || '—'}</Td>
                      <Td mac className="mac-table-muted text-[11px]">{h.comment || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
            {history.auditLogs.length > 0 && (
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
                    {history.auditLogs.map((h) => (
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
              </>
            )}
          </div>
        )}
            </DetailShell>

      <Modal open={editOpen} size="lg" title={t('actions.editPurchase')} onClose={() => setEditOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-purchase-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="edit-purchase-form" onSubmit={save}>
          <PurchaseFormFields
            form={form}
            setForm={setForm}
            suppliers={suppliers}
            chantiers={chantiers}
            families={families}
            tranches={chantierTranches}
          />
        </form>
      </Modal>

      <Modal open={deleteOpen} title={t('actions.deletePurchase')} onClose={() => setDeleteOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn></>}
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.purchaseDeleteHint')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.motifShortPlaceholder')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>
    </div>
  );
}

function WorkflowBar({ status, t }: { status: string; t: (key: string) => string }) {
  if (status === 'retourné') {
    return (
      <p className="text-[11px] text-[#ff9500] mt-2 font-medium">{t('msg.returnedForCorrection')}</p>
    );
  }
  const currentIdx = WORKFLOW_STEPS.indexOf(status as typeof WORKFLOW_STEPS[number]);
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-3">
      {WORKFLOW_STEPS.map((step, i) => {
        const done = currentIdx >= i && status !== 'retourné';
        const current = step === status;
        return (
          <span
            key={step}
            className={[
              'rounded-full px-2.5 py-0.5 text-[10px] font-medium capitalize',
              done ? 'bg-[rgba(52,199,89,0.12)] text-[#248a3d]' : 'bg-black/[0.05] text-gic-muted',
              current ? 'ring-1 ring-[#007aff]/30' : '',
            ].filter(Boolean).join(' ')}
          >
            {step}
          </span>
        );
      })}
    </div>
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
