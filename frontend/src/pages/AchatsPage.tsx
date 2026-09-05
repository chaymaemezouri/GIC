import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Pencil, Eye, Download, Printer, Trash2, FileText, CheckCircle, RotateCcw,
  ShoppingCart, Clock, CheckCheck, Wallet, SlidersHorizontal, Check, ArrowUp, ArrowDown, Layers,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, fetchSupplierList, fetchChantierList, formatMad, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { PurchaseFormFields, emptyPurchaseForm, purchaseToForm, type PurchaseFormData } from '../components/PurchaseFormFields';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';

type Purchase = {
  id: string;
  reference: string;
  date: string;
  designation: string;
  family?: string;
  quantity: number;
  unitPrice: number;
  amountHT?: number;
  tvaRate?: number;
  tvaAmount?: number;
  totalPrice: number;
  status: string;
  invoiced: boolean;
  supplier?: { id: string; companyName: string; reference: string };
  chantier?: { id: string; name: string };
  tranche?: string | null;
};

type Stats = { total: number; brouillon: number; valide: number; vise: number; controle: number; retourne: number; amount: number };
type PurchaseListResponse = PaginatedResponse<Purchase> & { totals: { amount: number } };

const PAGE_SIZE = 20;

const WORKFLOW: Record<string, { labelKey: string; next: string }> = {
  brouillon: { labelKey: 'common.validate', next: 'validé' },
  validé: { labelKey: 'actions.visaAction', next: 'visé' },
  visé: { labelKey: 'actions.control', next: 'contrôlé' },
};

const DOC_LABEL_KEYS: Record<string, string> = {
  devis: 'fields.quote',
  facture: 'common.facture',
  bon_livraison: 'common.bl',
};

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

type SortOrder = 'asc' | 'desc';

export default function AchatsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSupplier = searchParams.get('supplierId') || '';
  const initialChantier = searchParams.get('chantierId') || '';
  const [items, setItems] = useState<Purchase[]>([]);
  const [totals, setTotals] = useState({ amount: 0 });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, brouillon: 0, valide: 0, vise: 0, controle: 0, retourne: 0, amount: 0 });
  const [suppliers, setSuppliers] = useState<{ id: string; companyName: string; reference: string }[]>([]);
  const [chantiers, setChantiers] = useState<{ id: string; name: string }[]>([]);
  const [chantierTranches, setChantierTranches] = useState<{ id: string; name: string }[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [invoicedFilter, setInvoicedFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState(initialSupplier);
  const [chantierFilter, setChantierFilter] = useState(initialChantier);
  const [sort, setSort] = useState('date');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [docsOpen, setDocsOpen] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [form, setForm] = useState<PurchaseFormData>(emptyPurchaseForm());
  const [famName, setFamName] = useState('');
  const [desLabel, setDesLabel] = useState('');
  const [desFamilyId, setDesFamilyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildQuery(pageNum = page, overrides?: { status?: string; supplierId?: string; chantierId?: string; invoiced?: string }) {
    const qs = new URLSearchParams();
    const status = overrides?.status ?? statusFilter;
    const supplierId = overrides?.supplierId ?? supplierFilter;
    const chantierId = overrides?.chantierId ?? chantierFilter;
    const invoiced = overrides?.invoiced ?? invoicedFilter;
    if (q) qs.set('q', q);
    if (status) qs.set('status', status);
    if (supplierId) qs.set('supplierId', supplierId);
    if (chantierId) qs.set('chantierId', chantierId);
    if (invoiced) qs.set('invoiced', invoiced);
    qs.set('sort', sort);
    qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs;
  }

  function load(pageNum = page, overrides?: { status?: string; supplierId?: string; chantierId?: string; invoiced?: string }) {
    setLoading(true);
    setError('');
    const qs = buildQuery(pageNum, overrides);
    Promise.all([
      api<PurchaseListResponse>(`/achats/purchases?${qs}`),
      api<Stats>('/achats/purchases/stats'),
    ])
      .then(([res, st]) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        setTotals(res.totals);
        setStats(st);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('msg.serverError')))
      .finally(() => setLoading(false));
  }

  function loadRefs() {
    fetchSupplierList<{ id: string; companyName: string; reference: string }>().then(setSuppliers);
    fetchChantierList<{ id: string; name: string }>().then(setChantiers);
    api('/achats/families').then(setFamilies);
  }

  useEffect(() => {
    load(1);
    setPage(1);
  }, [sort, order]);

  useEffect(() => {
    loadRefs();
  }, []);

  useEffect(() => {
    if (!form.chantierId) {
      setChantierTranches([]);
      return;
    }
    api<{ id: string; name: string }[]>(`/chantiers/${form.chantierId}/tranches`)
      .then(setChantierTranches)
      .catch(() => setChantierTranches([]));
  }, [form.chantierId]);

  useEffect(() => {
    if (!showFilters) return;
    function onClick(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setShowFilters(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowFilters(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [showFilters]);

  function openCreate() {
    setEditId(null);
    setForm(emptyPurchaseForm());
    setError('');
    setOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(p: Purchase) {
    api(`/achats/purchases/${p.id}`).then((full) => {
      setEditId(p.id);
      setForm(purchaseToForm(full));
      setError('');
      setOpen(true);
    });
  }

  function toBody(f: PurchaseFormData) {
    return {
      designation: f.designation,
      family: f.family || null,
      unit: f.unit || null,
      quantity: f.quantity,
      unitPrice: f.unitPrice,
      tvaRate: f.tvaRate || '20',
      supplierId: f.supplierId || null,
      chantierId: f.chantierId || null,
      tranche: f.tranche || null,
      paymentMode: f.paymentMode,
      author: f.author || null,
      remark: f.remark || null,
      date: f.date,
      invoiced: f.invoiced === 'true',
    };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const body = toBody(form);
      if (editId) {
        await api(`/achats/purchases/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/achats/purchases', { method: 'POST', body: JSON.stringify(body) });
      }
      setOpen(false);
      load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function setStatus(id: string, status: string, comment?: string) {
    try {
      const res = await api<{ cashMovement?: { id: string }; cashMovementCreated?: boolean }>(`/achats/purchases/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, comment: comment || `Passage → ${status}` }),
      });
      load(page);
      if (status === 'contrôlé' && res.cashMovement?.id) {
        const msg = res.cashMovementCreated
          ? t('msg.balanceAutoCreated')
          : t('msg.balanceAlreadyRegistered');
        if (await appConfirm(`${msg} Ouvrir la fiche balance ?`)) {
          navigate(`/balance/${res.cashMovement.id}`);
        }
      }
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!deleteId || !deleteMotif.trim()) return;
    try {
      await api(`/achats/purchases/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      setDeleteId(null);
      setDeleteMotif('');
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function showDocs(id: string) {
    setDocsOpen(id);
    const list = await api(`/achats/purchases/${id}/documents`);
    setDocs(list);
  }

  async function addFamily(e: React.FormEvent) {
    e.preventDefault();
    await api('/achats/families', { method: 'POST', body: JSON.stringify({ name: famName }) });
    setFamName('');
    loadRefs();
  }

  async function addDesignation(e: React.FormEvent) {
    e.preventDefault();
    await api(`/achats/families/${desFamilyId}/designations`, { method: 'POST', body: JSON.stringify({ label: desLabel }) });
    setDesLabel('');
    loadRefs();
  }

  async function deleteFamily(familyId: string, name: string) {
    if (!await appConfirm(t('msg.deleteFamilyConfirm', { name }))) return;
    try {
      await api(`/achats/families/${familyId}`, { method: 'DELETE' });
      loadRefs();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function deleteDesignation(designationId: string, label: string) {
    if (!await appConfirm(t('msg.deleteDesignationConfirm', { label }))) return;
    try {
      await api(`/achats/designations/${designationId}`, { method: 'DELETE' });
      loadRefs();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${t('pages.purchases')} — GIC</title></head><body>
      <h1>${t('pages.purchases')} — GIC</h1>
      <p>Total filtré : ${formatMad(totals.amount)}</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.ref')}</th><th>${t('columns.designation')}</th><th>${t('columns.supplier')}</th><th>${t('columns.chantier')}</th><th>${t('columns.pt')}</th><th>${t('columns.status')}</th></tr>
        ${items.map((p) => `<tr>
          <td>${p.reference}</td>
          <td>${p.designation}</td>
          <td>${p.supplier?.companyName || '—'}</td>
          <td>${p.chantier?.name || '—'}</td>
          <td>${p.totalPrice}</td>
          <td>${p.status}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  function exportCsv() {
    downloadCsv(`/achats/purchases/export/csv?${buildQuery(1)}`, 'achats-gic.csv');
  }

  function exportExcel() {
    downloadExcel(`/achats/purchases/export/xlsx?${buildQuery(1)}`, 'achats-gic.xlsx');
  }

  const statusFilters = [
    { id: '', label: t('common.all') },
    { id: 'brouillon', label: t('status.draft') },
    { id: 'validé', label: t('status.validated') },
    { id: 'visé', label: t('fields.statusVisa') },
    { id: 'contrôlé', label: t('fields.statusControlled') },
    { id: 'retourné', label: t('fields.statusReturned') },
  ];

  const invoicedFilters = [
    { id: '', label: t('common.all') },
    { id: 'true', label: t('common.invoicedPlural') },
    { id: 'false', label: t('common.notInvoicedPlural') },
  ];

  const canEdit = (s: string) => ['brouillon', 'retourné'].includes(s);
  const canReturn = (s: string) => ['validé', 'visé'].includes(s);
  const hasActiveFilters = !!statusFilter || !!supplierFilter || !!chantierFilter || !!invoicedFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.purchases')}
        subtitle={t('pages.purchasesSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={exportExcel}>{t('common.excel')}</Btn>
            <Btn variant="secondary" icon={Layers} onClick={() => setCatalogOpen(true)}>Catalogue</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newPurchase')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('pages.purchases')} value={stats.total} icon={ShoppingCart} tone="violet" />
        <KpiCard
          title={t('kpi.pending')}
          value={stats.brouillon + stats.retourne}
          icon={Clock}
          tone="amber"
          delta={t('msg.draftReturnedDelta', { draft: stats.brouillon, returned: stats.retourne })}
          deltaTone="muted"
        />
        <KpiCard title={t('kpi.globalAmount')} value={formatMadCompact(stats.amount)} icon={Wallet} tone="coral" compact />
        <KpiCard
          title={t('kpi.controlled')}
          value={stats.controle}
          icon={CheckCheck}
          tone="emerald"
          delta={`${stats.valide + stats.vise} en cours`}
          deltaTone="muted"
        />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchRefDesignation')}
            />
            <MacSelect
              value={supplierFilter}
              onChange={(v) => {
                setSupplierFilter(v);
                setPage(1);
                load(1, { supplierId: v });
              }}
              options={[
                { value: '', label: t('common.allSuppliers') },
                ...suppliers.map((s) => ({ value: s.id, label: `${s.reference} — ${s.companyName}` })),
              ]}
              className="w-44 shrink-0"
            />
            <MacSelect
              value={chantierFilter}
              onChange={(v) => {
                setChantierFilter(v);
                setPage(1);
                load(1, { chantierId: v });
              }}
              options={[
                { value: '', label: t('common.allSites') },
                ...chantiers.map((c) => ({ value: c.id, label: c.name })),
              ]}
              className="w-40 shrink-0"
            />
            <MacSelect
              value={sort}
              onChange={setSort}
              options={[
                { value: 'date', label: t('common.date') },
                { value: 'reference', label: t('fields.reference') },
                { value: 'totalPrice', label: t('common.amount') },
                { value: 'status', label: t('common.status') },
              ]}
              className="w-36 shrink-0"
            />
            <Btn
              variant="secondary"
              icon={order === 'asc' ? ArrowUp : ArrowDown}
              className="!px-2 !py-2 shrink-0"
              title={order === 'asc' ? t('msg.ascending') : t('msg.descending')}
              onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            />
            <div ref={filtersRef} className="relative shrink-0 z-50">
              <Btn
                variant="secondary"
                icon={SlidersHorizontal}
                title={t('common.filters')}
                aria-label={t('common.filters')}
                className={`!px-2 !py-2 relative${hasActiveFilters ? ' ring-1 ring-[#007aff]/40' : ''}`}
                onClick={() => setShowFilters((v) => !v)}
              >
                {hasActiveFilters && <span className="mac-filter-dot" aria-hidden />}
              </Btn>
              {showFilters && (
                <div className="mac-filter-menu" role="menu">
                  <p className="mac-filter-menu-section">{t('common.status')}</p>
                  {statusFilters.map((f) => (
                    <button
                      key={f.id || 'all-status'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${statusFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setStatusFilter(f.id);
                        setPage(1);
                        load(1, { status: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {statusFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  <div className="mac-filter-menu-sep" />
                  <p className="mac-filter-menu-section">{t('common.billing')}</p>
                  {invoicedFilters.map((f) => (
                    <button
                      key={f.id || 'all-invoiced'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${invoicedFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setInvoicedFilter(f.id);
                        setPage(1);
                        load(1, { invoiced: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {invoicedFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setStatusFilter('');
                          setSupplierFilter('');
                          setChantierFilter('');
                          setInvoicedFilter('');
                          setPage(1);
                          load(1, { status: '', supplierId: '', chantierId: '', invoiced: '' });
                          setShowFilters(false);
                        }}
                      >
                        Réinitialiser
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <Btn variant="secondary" onClick={() => { setPage(1); load(1); }}>{t('common.filter')}</Btn>
          </div>
        </div>
      </div>

      {error && (
        <Card className="mb-4 border-gic-coral/40 bg-gic-coral-soft/30">
          <p className="text-[12px] text-gic-coral font-medium">{error}</p>
          <Btn variant="secondary" className="mt-2" onClick={() => load(page)}>{t('common.retry')}</Btn>
        </Card>
      )}

      <Card padding={false} className="mb-4">
        {loading ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState title={t('msg.emptyPurchases')} action={<Btn icon={Plus} onClick={openCreate}>{t('actions.newPurchase')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.ref')}</Th>
                <Th mac>{t('columns.date')}</Th>
                <Th mac>{t('columns.designation')}</Th>
                <Th mac>{t('columns.supplier')}</Th>
                <Th mac>{t('columns.chantier')}</Th>
                <Th mac>{t('columns.tranche')}</Th>
                <Th mac>{t('columns.pt')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/achats/${p.id}`)}>
                  <Td mac>
                    <Link to={`/achats/${p.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{p.reference}</Link>
                  </Td>
                  <Td mac className="text-[11px]">{new Date(p.date).toLocaleDateString('fr-MA')}</Td>
                  <Td mac>{p.designation}</Td>
                  <Td mac>
                    {p.supplier ? (
                      <Link to={`/fournisseurs/${p.supplier.id}`} className="mac-table-muted hover:text-[#007aff]">
                        {p.supplier.companyName}
                      </Link>
                    ) : '—'}
                  </Td>
                  <Td mac className="mac-table-muted">{p.chantier?.name || '—'}</Td>
                  <Td mac className="mac-table-muted">{p.tranche || '—'}</Td>
                  <Td mac>
                    <span className="font-medium">{formatMad(p.totalPrice)}</span>
                    {p.amountHT != null && (
                      <p className="text-[10px] text-gic-muted">HT {formatMad(p.amountHT)} · TVA {p.tvaRate ?? 20}%</p>
                    )}
                  </Td>
                  <Td mac><StatusPill status={p.status} quiet /></Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <Link to={`/achats/${p.id}`} className="mac-action-btn mac-action-btn-blue" title={t('actions.ficheDetail')}>
                        <Eye size={14} strokeWidth={2.15} />
                      </Link>
                      {canEdit(p.status) && (
                        <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(p)} />
                      )}
                      <MacActionBtn icon={FileText} tone="gray" title={t('actions.supplierDocs')} onClick={() => showDocs(p.id)} />
                      {WORKFLOW[p.status] && (
                        <MacActionBtn
                          icon={CheckCircle}
                          tone="green"
                          title={t(WORKFLOW[p.status].labelKey)}
                          onClick={() => setStatus(p.id, WORKFLOW[p.status].next)}
                        />
                      )}
                      {canReturn(p.status) && (
                        <MacActionBtn
                          icon={RotateCcw}
                          tone="orange"
                          title={t('actions.returnAction')}
                          onClick={() => setStatus(p.id, 'retourné', t('msg.returnForCorrection'))}
                        />
                      )}
                      {canEdit(p.status) && (
                        <MacActionBtn
                          icon={Trash2}
                          tone="red"
                          title={t('common.delete')}
                          onClick={() => { setDeleteId(p.id); setDeleteMotif(''); }}
                        />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <div className="px-4 py-3 border-t border-gic-border flex flex-wrap justify-between items-center gap-2">
          <p className="text-[12px] font-semibold">Total filtré : {formatMad(totals.amount)}</p>
          <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => load(p)} mac />
        </div>
      </Card>

      <Modal
        open={open}
        size="lg"
        title={editId ? t('common.edit') : t('actions.newPurchase')}
        onClose={() => setOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn><Btn form="achat-form" type="submit">{editId ? t('common.save') : t('common.create')}</Btn></>}
      >
        <form id="achat-form" onSubmit={save}>
          <PurchaseFormFields
            form={form}
            setForm={setForm}
            suppliers={suppliers}
            chantiers={chantiers}
            families={families}
            tranches={chantierTranches}
          />
          {error && <p className="mt-3 text-[11px] text-gic-coral">{error}</p>}
        </form>
      </Modal>

      <Modal open={!!docsOpen} title={t('actions.supplierDocs')} onClose={() => setDocsOpen(null)}>
        {docs.length === 0 ? (
          <p className="text-[12px] text-gic-muted">{t('msg.emptySupplierPortalDocs')}</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-[12px] rounded-xl bg-gray-50 px-3 py-2">
                <FileText size={14} className="text-[#007aff] shrink-0" />
                <span className="font-medium">{DOC_LABEL_KEYS[d.category] ? t(DOC_LABEL_KEYS[d.category]) : d.category}</span>
                <span className="text-gic-muted truncate flex-1">{d.name}</span>
                <a href={d.path} target="_blank" rel="noreferrer" className="text-[#007aff] hover:underline shrink-0">Ouvrir</a>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal open={catalogOpen} title={t('actions.catalogFamilies')} onClose={() => setCatalogOpen(false)} size="lg"
        footer={<Btn variant="secondary" onClick={() => setCatalogOpen(false)}>{t('common.close')}</Btn>}
      >
        <div className="grid lg:grid-cols-2 gap-4">
          <div>
            <form onSubmit={addFamily} className="flex gap-2 mb-3">
              <Input placeholder={t('actions.newFamily')} value={famName} onChange={(e) => setFamName(e.target.value)} />
              <Btn type="submit">+</Btn>
            </form>
            <form onSubmit={addDesignation} className="flex gap-2">
              <Select value={desFamilyId} onChange={(e) => setDesFamilyId(e.target.value)}>
                <option value="">Famille</option>
                {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
              <Input placeholder={t('fields.designation')} value={desLabel} onChange={(e) => setDesLabel(e.target.value)} />
              <Btn type="submit">+</Btn>
            </form>
          </div>
          <div className="space-y-2 text-[12px] max-h-64 overflow-y-auto">
            {families.length === 0 ? (
              <p className="text-[12px] text-gic-muted py-4 text-center">{t('msg.emptyFamiliesHint')}</p>
            ) : (
              families.map((f) => (
                <div key={f.id} className="rounded-xl bg-black/[0.03] px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="font-medium text-gic-ink">{f.name}</p>
                    <MacActionBtn
                      icon={Trash2}
                      tone="red"
                      title={t('actions.deleteFamily')}
                      onClick={() => deleteFamily(f.id, f.name)}
                    />
                  </div>
                  {(f.designations || []).length === 0 ? (
                    <p className="text-[10px] text-gic-muted">{t('msg.emptyDesignations')}</p>
                  ) : (
                    <ul className="space-y-1">
                      {(f.designations || []).map((d: { id: string; label: string }) => (
                        <li key={d.id} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-gic-muted truncate">{d.label}</span>
                          <MacActionBtn
                            icon={Trash2}
                            tone="red"
                            title={t('common.delete')}
                            onClick={() => deleteDesignation(d.id, d.label)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteId}
        title={t('actions.deletePurchase')}
        onClose={() => setDeleteId(null)}
        footer={<><Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn></>}
      >
        <p className="text-[12px] text-gic-muted mb-3">Uniquement pour les achats en brouillon ou retournés.</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.motifPlaceholder')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>
    </div>
  );
}
