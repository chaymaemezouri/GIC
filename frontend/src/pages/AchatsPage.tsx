import { fetchAllRows, printRows } from '../lib/listPrint';
import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Pencil, Eye, Download, Printer, Trash2, ShoppingCart, Clock, Wallet, Receipt,
  SlidersHorizontal, Check, ArrowUp, ArrowDown, Layers,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, fetchSupplierList, fetchChantierList, formatDate, formatMad, openPrintUrl, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, TableWrap, Td, Th, MacToolbarTabs,
} from '../components/ui';
import {
  PurchaseFormFields, emptyPurchaseForm, purchaseFormToBody, purchaseToForm, validatePurchaseForm, type PurchaseFormData,
} from '../components/PurchaseFormFields';
import { PurchaseDeliveryPill, PurchasePaymentPill, PurchaseStatusPill } from '../components/PurchaseBadges';
import PurchaseAnalyticsPanel from '../components/PurchaseAnalyticsPanel';
import { SelectAllTh, SelectTd, SelectionBar } from '../components/RowSelection';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useRowSelection } from '../hooks/useRowSelection';
import { useI18n } from '../i18n/I18nContext';
import { PURCHASE_STATUSES, PURCHASE_TYPES, type PurchaseDetail, type PurchaseType } from '../lib/purchases';

type Purchase = {
  id: string;
  reference: string;
  date: string;
  designation: string;
  totalPrice: number;
  amountHT?: number;
  paidAmount: number;
  remaining: number;
  status: string;
  paymentStatus: string;
  deliveryStatus: string;
  expectedDeliveryDate?: string | null;
  supplier?: { id: string; companyName: string; reference: string };
  chantier?: { id: string; name: string };
  tranche?: string | null;
  _count?: { lines: number; deliveries: number; payments: number };
};

type Stats = Record<string, number> & { total: number; enCours: number; amount: number; paid: number; remaining: number; advances: number };
type PurchaseListResponse = PaginatedResponse<Purchase> & { totals: { amount: number; paid: number; remaining: number } };
type Filters = { status: string; supplierId: string; chantierId: string; tranche: string; paymentStatus: string; deliveryStatus: string };
type ChantierOption = { id: string; name: string; project?: { id: string; name: string } | null };

const PAGE_SIZE = 20;

function formatMadCompact(n: number | null | undefined) {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M MAD`;
  if (v >= 10_000) return `${Math.round(v / 1_000).toLocaleString('fr-FR')} k MAD`;
  return formatMad(v);
}

type SortOrder = 'asc' | 'desc';

export default function AchatsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<'liste' | 'analyse'>(searchParams.get('tab') === 'analyse' ? 'analyse' : 'liste');
  const lockedType = PURCHASE_TYPES.includes(searchParams.get('type') as PurchaseType)
    ? (searchParams.get('type') as PurchaseType)
    : '';
  const [items, setItems] = useState<Purchase[]>([]);
  const [totals, setTotals] = useState({ amount: 0, paid: 0, remaining: 0 });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [suppliers, setSuppliers] = useState<{ id: string; companyName: string; reference: string }[]>([]);
  const [chantiers, setChantiers] = useState<ChantierOption[]>([]);
  const [filterTranches, setFilterTranches] = useState<{ id: string; name: string }[]>([]);
  const [formTranches, setFormTranches] = useState<{ id: string; name: string }[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>({
    status: searchParams.get('status') || '',
    supplierId: searchParams.get('supplierId') || '',
    chantierId: searchParams.get('chantierId') || '',
    tranche: searchParams.get('tranche') || '',
    paymentStatus: '',
    deliveryStatus: '',
  });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('date');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<PurchaseFormData>(emptyPurchaseForm());
  const [formError, setFormError] = useState('');
  const [famName, setFamName] = useState('');
  const [desLabel, setDesLabel] = useState('');
  const [desFamilyId, setDesFamilyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selection = useRowSelection<Purchase>();

  function buildQuery(pageNum = page, f: Filters = filters) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    Object.entries(f).forEach(([k, v]) => { if (v) qs.set(k, v); });
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    if (lockedType) qs.set('purchaseType', lockedType);
    qs.set('sort', sort);
    qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs;
  }

  function load(pageNum = page, f: Filters = filters) {
    setLoading(true);
    setError('');
    const qs = buildQuery(pageNum, f);
    Promise.all([
      api<PurchaseListResponse>(`/achats/purchases?${qs}`),
      api<Stats>(`/achats/purchases/stats?${qs}`),
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

  function applyFilters(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    if (patch.chantierId !== undefined && patch.tranche === undefined) next.tranche = '';
    setFilters(next);
    setPage(1);
    load(1, next);
  }

  function loadRefs() {
    fetchSupplierList<{ id: string; companyName: string; reference: string }>().then(setSuppliers);
    fetchChantierList<ChantierOption>().then(setChantiers);
    api('/achats/families').then(setFamilies);
  }

  useEffect(() => {
    load(1);
    setPage(1);
  }, [sort, order, dateFrom, dateTo, lockedType]);

  useEffect(() => {
    loadRefs();
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (view === 'analyse') next.set('tab', 'analyse');
    else next.delete('tab');
    ['chantierId', 'tranche', 'supplierId', 'status'].forEach((k) => {
      const v = filters[k as keyof Filters];
      if (v) next.set(k, v);
      else next.delete(k);
    });
    setSearchParams(next, { replace: true });
  }, [view, filters]);

  useEffect(() => {
    if (!filters.chantierId) {
      setFilterTranches([]);
      return;
    }
    api<{ id: string; name: string }[]>(`/chantiers/${filters.chantierId}/tranches`)
      .then(setFilterTranches)
      .catch(() => setFilterTranches([]));
  }, [filters.chantierId]);

  useEffect(() => {
    if (!form.chantierId) {
      setFormTranches([]);
      return;
    }
    api<{ id: string; name: string }[]>(`/chantiers/${form.chantierId}/tranches`)
      .then(setFormTranches)
      .catch(() => setFormTranches([]));
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
    setEditing(null);
    setForm({
      ...emptyPurchaseForm(lockedType || 'marchandise'),
      chantierId: filters.chantierId,
      tranche: filters.tranche,
      supplierId: filters.supplierId,
    });
    setFormError('');
    setOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(p: Purchase) {
    api<PurchaseDetail>(`/achats/purchases/${p.id}`).then((full) => {
      setEditing(full);
      setForm(purchaseToForm(full));
      setFormError('');
      setOpen(true);
    });
  }

  const trackingOnly = !!editing && editing.status !== 'elabore';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!trackingOnly) {
      const invalid = validatePurchaseForm(form, t);
      if (invalid) {
        setFormError(invalid);
        return;
      }
    }
    setSaving(true);
    try {
      const body = purchaseFormToBody(form, { trackingOnly });
      if (editing) {
        await api(`/achats/purchases/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setOpen(false);
        load(page);
      } else {
        const created = await api<PurchaseDetail>('/achats/purchases', { method: 'POST', body: JSON.stringify(body) });
        setOpen(false);
        navigate(`/achats/${created.id}`);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
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
    const supplier = suppliers.find((s) => s.id === filters.supplierId);
    const sortOptions: Record<string, string> = {
      date: t('common.date'),
      reference: t('fields.reference'),
      totalPrice: t('common.amount'),
      paidAmount: t('purchase.analytics.paid'),
      expectedDeliveryDate: t('purchase.fields.expectedDelivery'),
      status: t('common.status'),
    };
    const statusLabel = (s: string) => {
      const key = `purchase.status.${s}`;
      const label = t(key);
      return label === key ? s : label;
    };
    const sum = (rows: Purchase[], pick: (p: Purchase) => number) => formatMad(rows.reduce((acc, p) => acc + Number(pick(p) || 0), 0));
    printRows<Purchase>({
      title: t('pages.purchases'),
      filters: [
        [t('listPrint.search'), q],
        [t('columns.chantier'), filters.chantierId && chantiers.find((c) => c.id === filters.chantierId)?.name],
        [t('purchase.list.chantierTranche'), filters.tranche],
        [t('columns.supplier'), supplier && `${supplier.reference} — ${supplier.companyName}`],
        [t('listPrint.period'), (dateFrom || dateTo) && `${dateFrom ? formatDate(dateFrom) : '…'} → ${dateTo ? formatDate(dateTo) : '…'}`],
        [t('listPrint.status'), filters.status && statusFilters.find((f) => f.id === filters.status)?.label],
        [t('purchase.list.paymentFilter'), filters.paymentStatus && paymentFilters.find((f) => f.id === filters.paymentStatus)?.label],
        [t('purchase.list.deliveryFilter'), filters.deliveryStatus && deliveryFilters.find((f) => f.id === filters.deliveryStatus)?.label],
        [t('listPrint.sort'), (sort !== 'date' || order !== 'desc') && `${sortOptions[sort] || sort} (${order === 'asc' ? t('msg.ascending') : t('msg.descending')})`],
      ],
      columns: [
        { label: t('columns.ref'), value: (p) => p.reference },
        { label: t('columns.date'), value: (p) => new Date(p.date).toLocaleDateString('fr-MA') },
        { label: t('columns.designation'), value: (p) => p.designation },
        { label: t('columns.supplier'), value: (p) => p.supplier?.companyName },
        { label: t('purchase.list.chantierTranche'), value: (p) => [p.chantier?.name, p.tranche].filter(Boolean).join(' · ') },
        { label: t('purchase.fields.totalTtc'), value: (p) => formatMad(p.totalPrice), align: 'right', total: (rows) => sum(rows, (p) => p.totalPrice) },
        { label: t('purchase.analytics.paid'), value: (p) => formatMad(p.paidAmount), align: 'right', total: (rows) => sum(rows, (p) => p.paidAmount) },
        { label: t('purchase.fields.remaining'), value: (p) => formatMad(p.remaining), align: 'right', total: (rows) => sum(rows, (p) => p.remaining) },
        { label: t('purchase.list.payment'), value: (p) => t(`purchase.payment.${p.paymentStatus}`) },
        { label: t('purchase.list.delivery'), value: (p) => t(`purchase.delivery.${p.deliveryStatus}`) },
        { label: t('columns.status'), value: (p) => statusLabel(p.status) },
      ],
      rows: selection.count ? selection.rows : () => fetchAllRows<Purchase>('/achats/purchases', buildQuery(1)),
      selectedCount: selection.count,
    });
  }

  const statusFilters = [
    { id: '', label: t('common.all') },
    { id: 'en_cours', label: t('purchase.list.inProgress') },
    ...PURCHASE_STATUSES.map((s) => ({ id: s, label: t(`purchase.status.${s}`) })),
  ];
  const paymentFilters = [
    { id: '', label: t('common.all') },
    ...['non_paye', 'partiel', 'paye'].map((s) => ({ id: s, label: t(`purchase.payment.${s}`) })),
  ];
  const deliveryFilters = [
    { id: '', label: t('common.all') },
    ...['non_livre', 'partiel', 'livre'].map((s) => ({ id: s, label: t(`purchase.delivery.${s}`) })),
  ];
  const hasActiveFilters = !!(filters.status || filters.paymentStatus || filters.deliveryStatus || filters.tranche);

  function FilterSection({ title, options, value, field }: { title: string; options: { id: string; label: string }[]; value: string; field: keyof Filters }) {
    return (
      <>
        <p className="mac-filter-menu-section">{title}</p>
        {options.map((f) => (
          <button
            key={f.id || `all-${field}`}
            type="button"
            role="menuitem"
            className={`mac-filter-menu-item${value === f.id ? ' mac-filter-menu-item-active' : ''}`}
            onClick={() => applyFilters({ [field]: f.id })}
          >
            <span>{f.label}</span>
            {value === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
          </button>
        ))}
      </>
    );
  }

  const title = lockedType === 'outil'
    ? t('nav.purchaseTools')
    : lockedType === 'materiel'
      ? t('nav.purchaseMaterial')
      : lockedType === 'marchandise'
        ? t('nav.purchaseGoods')
        : t('pages.purchases');

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={title}
        subtitle={t('purchase.list.subtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/achats/purchases/export/csv?${buildQuery(1)}`, 'achats-gic.csv')}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadExcel(`/achats/purchases/export/xlsx?${buildQuery(1)}`, 'achats-gic.xlsx')}>{t('common.excel')}</Btn>
            <Btn variant="secondary" icon={Layers} onClick={() => setCatalogOpen(true)}>{t('purchase.list.catalog')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newPurchase')}</Btn>
          </>
        }
      />

      <Card className="mb-4 !pb-0">
        <MacToolbarTabs
          scopeLabel={t('fields.type')}
          scopeTabs={[
            { id: 'all', label: t('common.all') },
            ...PURCHASE_TYPES.map((id) => ({
              id,
              label: t(id === 'outil' ? 'nav.purchaseTools' : id === 'materiel' ? 'nav.purchaseMaterial' : 'nav.purchaseGoods'),
            })),
          ]}
          scope={lockedType || 'all'}
          onScopeChange={(id) => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              if (id === 'all') next.delete('type');
              else next.set('type', id);
              return next;
            }, { replace: true });
          }}
          viewTabs={[
            { id: 'liste', label: t('purchase.list.tabList') },
            { id: 'analyse', label: t('purchase.list.tabAnalytics') },
          ]}
          view={view}
          onViewChange={(id) => setView(id as 'liste' | 'analyse')}
        />
      </Card>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar flex-wrap">
            {view === 'liste' && (
              <MacSearch
                value={q}
                onChange={setQ}
                onSubmit={() => { setPage(1); load(1); }}
                placeholder={t('purchase.list.searchPlaceholder')}
              />
            )}
            <MacSelect
              value={filters.chantierId}
              onChange={(v) => applyFilters({ chantierId: v })}
              options={[{ value: '', label: t('common.allSites') }, ...chantiers.map((c) => ({ value: c.id, label: c.name }))]}
              className="w-40 shrink-0"
            />
            {filters.chantierId && (
              <MacSelect
                value={filters.tranche}
                onChange={(v) => applyFilters({ tranche: v })}
                options={[{ value: '', label: t('purchase.list.allTranches') }, ...filterTranches.map((tr) => ({ value: tr.name, label: tr.name }))]}
                className="w-36 shrink-0"
              />
            )}
            <MacSelect
              value={filters.supplierId}
              onChange={(v) => applyFilters({ supplierId: v })}
              options={[
                { value: '', label: t('common.allSuppliers') },
                ...suppliers.map((s) => ({ value: s.id, label: `${s.reference} — ${s.companyName}` })),
              ]}
              className="w-44 shrink-0"
            />
            <MacDateInput value={dateFrom} onChange={setDateFrom} />
            <MacDateInput value={dateTo} onChange={setDateTo} />
            {view === 'liste' && (
              <>
                <MacSelect
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: 'date', label: t('common.date') },
                    { value: 'reference', label: t('fields.reference') },
                    { value: 'totalPrice', label: t('common.amount') },
                    { value: 'paidAmount', label: t('purchase.analytics.paid') },
                    { value: 'expectedDeliveryDate', label: t('purchase.fields.expectedDelivery') },
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
                    <div className="mac-filter-menu max-h-[70vh] overflow-y-auto" role="menu">
                      <FilterSection title={t('common.status')} options={statusFilters} value={filters.status} field="status" />
                      <div className="mac-filter-menu-sep" />
                      <FilterSection title={t('purchase.list.paymentFilter')} options={paymentFilters} value={filters.paymentStatus} field="paymentStatus" />
                      <div className="mac-filter-menu-sep" />
                      <FilterSection title={t('purchase.list.deliveryFilter')} options={deliveryFilters} value={filters.deliveryStatus} field="deliveryStatus" />
                      {hasActiveFilters && (
                        <>
                          <div className="mac-filter-menu-sep" />
                          <button
                            type="button"
                            className="mac-filter-menu-item mac-filter-menu-reset"
                            onClick={() => {
                              applyFilters({ status: '', paymentStatus: '', deliveryStatus: '', tranche: '' });
                              setShowFilters(false);
                            }}
                          >
                            {t('purchase.list.resetFilters')}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {view === 'analyse' ? (
        <PurchaseAnalyticsPanel
          filters={{ chantierId: filters.chantierId, tranche: filters.tranche, supplierId: filters.supplierId, dateFrom, dateTo }}
        />
      ) : (
        <>
          {stats && (
            <div className="mac-kpi-grid mac-kpi-grid-4">
              <KpiCard title={t('pages.purchases')} value={stats.total} icon={ShoppingCart} tone="violet"
                delta={t('purchase.list.draftCount', { count: stats.elabore || 0 })} deltaTone="muted" />
              <KpiCard
                title={t('purchase.list.inProgress')}
                value={stats.enCours}
                icon={Clock}
                tone="amber"
                delta={t('purchase.list.inProgressDelta', { ordered: stats.soumis || 0, delivered: (stats.livre || 0) + (stats.valide || 0), invoiced: stats.facture || 0 })}
                deltaTone="muted"
              />
              <KpiCard title={t('purchase.list.totalAmount')} value={formatMadCompact(stats.amount)} icon={Wallet} tone="coral" compact
                delta={`${t('purchase.analytics.paid')} ${formatMadCompact(stats.paid)}`} deltaTone="muted" />
              <KpiCard title={t('purchase.fields.remaining')} value={formatMadCompact(stats.remaining)} icon={Receipt} tone="emerald" compact
                delta={`${t('purchase.analytics.advances')} ${formatMadCompact(stats.advances)}`} deltaTone="muted" />
            </div>
          )}

          {error && (
            <Card className="mb-4 border-gic-coral/40 bg-gic-coral-soft/30">
              <p className="text-[12px] text-gic-coral font-medium">{error}</p>
              <Btn variant="secondary" className="mt-2" onClick={() => load(page)}>{t('common.retry')}</Btn>
            </Card>
          )}

          <SelectionBar selection={selection} onPrint={printList} />

          <Card padding={false} className="mb-4">
            {loading ? (
              <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
            ) : items.length === 0 ? (
              <EmptyState title={t('msg.emptyPurchases')} action={<Btn icon={Plus} onClick={openCreate}>{t('actions.newPurchase')}</Btn>} />
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <SelectAllTh selection={selection} rows={items} />
                    <Th mac>{t('columns.ref')}</Th>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('columns.designation')}</Th>
                    <Th mac>{t('columns.supplier')}</Th>
                    <Th mac>{t('purchase.list.chantierTranche')}</Th>
                    <Th mac>{t('purchase.fields.totalTtc')}</Th>
                    <Th mac>{t('purchase.list.payment')}</Th>
                    <Th mac>{t('purchase.list.delivery')}</Th>
                    <Th mac>{t('columns.status')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/achats/${p.id}`)}>
                      <SelectTd selection={selection} row={p} />
                      <Td mac>
                        <Link to={`/achats/${p.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{p.reference}</Link>
                      </Td>
                      <Td mac className="text-[11px]">{new Date(p.date).toLocaleDateString('fr-MA')}</Td>
                      <Td mac>
                        <p className="truncate max-w-[220px]">{p.designation}</p>
                        <p className="text-[10px] text-gic-muted">{t('purchase.list.productsCount', { count: p._count?.lines || 0 })}</p>
                      </Td>
                      <Td mac>
                        {p.supplier ? (
                          <Link to={`/fournisseurs/${p.supplier.id}`} className="mac-table-muted hover:text-[#007aff]" onClick={(e) => e.stopPropagation()}>
                            {p.supplier.companyName}
                          </Link>
                        ) : '—'}
                      </Td>
                      <Td mac className="mac-table-muted">
                        {p.chantier?.name || '—'}
                        {p.tranche && <p className="text-[10px]">{p.tranche}</p>}
                      </Td>
                      <Td mac>
                        <span className="font-medium">{formatMad(p.totalPrice)}</span>
                        {p.amountHT != null && <p className="text-[10px] text-gic-muted">HT {formatMad(p.amountHT)}</p>}
                      </Td>
                      <Td mac>
                        <PurchasePaymentPill status={p.paymentStatus} />
                        {p.remaining > 0 && <p className="text-[10px] text-gic-muted">{t('purchase.list.remainingShort', { amount: formatMad(p.remaining) })}</p>}
                      </Td>
                      <Td mac><PurchaseDeliveryPill status={p.deliveryStatus} /></Td>
                      <Td mac><PurchaseStatusPill status={p.status} /></Td>
                      <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="mac-actions">
                          <Link to={`/achats/${p.id}`} className="mac-action-btn mac-action-btn-blue" title={t('actions.ficheDetail')}>
                            <Eye size={14} strokeWidth={2.15} />
                          </Link>
                          {p.status !== 'archive' && (
                            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(p)} />
                          )}
                          <MacActionBtn icon={Printer} tone="gray" title={t('purchase.actions.printOrder')} onClick={() => openPrintUrl(`/achats/purchases/${p.id}/print/bon_commande`)} />
                          {p.status === 'elabore' && (
                            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteId(p.id); setDeleteMotif(''); }} />
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
            <div className="px-4 py-3 border-t border-gic-border flex flex-wrap justify-between items-center gap-2">
              <p className="text-[12px] font-semibold">
                {t('purchase.list.filteredTotal')} : {formatMad(totals.amount)}
                <span className="text-gic-muted font-normal"> · {t('purchase.analytics.paid')} {formatMad(totals.paid)} · {t('purchase.fields.remaining')} {formatMad(totals.remaining)}</span>
              </p>
              <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => load(p)} mac />
            </div>
          </Card>
        </>
      )}

      <Modal
        open={open}
        size="xl"
        title={editing ? t('purchase.form.editTitle', { ref: editing.reference }) : t('actions.newPurchase')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="achat-form" type="submit" disabled={saving}>{editing ? t('common.save') : t('msg.createPurchase')}</Btn>
          </>
        }
      >
        <form id="achat-form" onSubmit={save}>
          <PurchaseFormFields
            form={form}
            setForm={setForm}
            suppliers={suppliers}
            chantiers={chantiers}
            families={families}
            tranches={formTranches}
            reference={editing?.reference}
            trackingOnly={trackingOnly}
            lockType={!!lockedType && !editing}
          />
          {formError && <p className="mt-3 text-[11px] text-gic-coral">{formError}</p>}
        </form>
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
                <option value="">{t('fields.family')}</option>
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
                    <MacActionBtn icon={Trash2} tone="red" title={t('actions.deleteFamily')} onClick={() => deleteFamily(f.id, f.name)} />
                  </div>
                  {(f.designations || []).length === 0 ? (
                    <p className="text-[10px] text-gic-muted">{t('msg.emptyDesignations')}</p>
                  ) : (
                    <ul className="space-y-1">
                      {(f.designations || []).map((d: { id: string; label: string }) => (
                        <li key={d.id} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-gic-muted truncate">{d.label}</span>
                          <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteDesignation(d.id, d.label)} />
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
        <p className="text-[12px] text-gic-muted mb-3">{t('purchase.list.deleteHint')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.motifPlaceholder')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>
    </div>
  );
}
