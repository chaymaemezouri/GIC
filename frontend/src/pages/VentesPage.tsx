import { fetchAllRows, printRows } from '../lib/listPrint';
import { appAlert } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Pencil, Eye, Download, Printer, Ban, Wallet, TrendingUp, FileText, AlertCircle,
  SlidersHorizontal, Check, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, downloadPdf, fetchClientList, fetchPropertyList, formatMad, uploadForm, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { SaleFormFields, emptySaleForm, saleFormToCreateBody, attachSaleCreateFiles, type SaleFormData } from '../components/SaleFormFields';
import { isBankPaymentMode } from '../lib/paymentMode';
import { SelectAllTh, SelectTd, SelectionBar } from '../components/RowSelection';
import { printSaleReceipt } from '../lib/printSale';
import { useRowSelection } from '../hooks/useRowSelection';
import { useI18n } from '../i18n/I18nContext';
import { propertyDealOf } from '../lib/propertyDeal';

type Sale = {
  id: string;
  reference: string;
  status: string;
  paymentPlan?: string | null;
  netPrice: number;
  totalPaid: number;
  remaining: number;
  pending?: boolean;
  client: { id: string; firstName: string; lastName: string; reference: string };
  property: { id: string; name: string; reference: string };
  _count?: { schedules?: number };
};

type CatalogProperty = {
  id: string;
  reference: string;
  name: string;
  status: string;
  type?: string;
  paymentPlan?: string | null;
  price?: number | null;
};

function withUnsoldProperties(sales: Sale[], props: CatalogProperty[]): Sale[] {
  const byProperty = new Map(sales.map((s) => [s.property.id, s]));
  const seen = new Set<string>();
  const rows: Sale[] = [];
  for (const p of props.filter((row) => propertyDealOf(row) === 'vente')) {
    seen.add(p.id);
    const sale = byProperty.get(p.id);
    if (sale) {
      rows.push(sale);
      continue;
    }
    const price = Number(p.price || 0);
    rows.push({
      id: `bien:${p.id}`,
      reference: '',
      status: p.status || 'disponible',
      paymentPlan: p.paymentPlan,
      netPrice: price,
      totalPaid: 0,
      remaining: price,
      pending: true,
      client: { id: '', firstName: '', lastName: '', reference: '' },
      property: { id: p.id, name: p.name, reference: p.reference },
    });
  }
  for (const s of sales) {
    if (!seen.has(s.property.id)) rows.push(s);
  }
  return rows;
}

function salePaymentPlan(s: Sale): 'avance' | 'echeancier' {
  if (s.paymentPlan === 'echeancier') return 'echeancier';
  if (s.paymentPlan === 'avance') return 'avance';
  return (s._count?.schedules || 0) > 0 ? 'echeancier' : 'avance';
}

type Stats = { total: number; soldees: number; enCours: number; encaisse: number; reste: number; volume: number };

const PAGE_SIZE = 20;
type SortOrder = 'asc' | 'desc';

function defaultOrderForSort(sort: string): SortOrder {
  return sort === 'createdAt' ? 'desc' : 'asc';
}

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

type VentesPageProps = {
  projectId?: string;
  embedded?: boolean;
  onChanged?: () => void;
};

export default function VentesPage({ projectId, embedded, onChanged }: VentesPageProps = {}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Sale[]>([]);
  const [page, setPage] = useState(embedded ? 1 : Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, soldees: 0, enCours: 0, encaisse: 0, reste: 0, volume: 0 });
  const [clients, setClients] = useState<{ id: string; reference: string; firstName: string; lastName: string }[]>([]);
  const [properties, setProperties] = useState<{ id: string; reference: string; name: string; status: string; type?: string; paymentPlan?: string | null; price?: number | null }[]>([]);
  const [q, setQ] = useState(embedded ? '' : (searchParams.get('q') || ''));
  const [statusFilter, setStatusFilter] = useState(embedded ? '' : (searchParams.get('status') || ''));
  const [clientFilter, setClientFilter] = useState(embedded ? '' : (searchParams.get('clientId') || ''));
  const [sort, setSort] = useState(embedded ? 'createdAt' : (searchParams.get('sort') || 'createdAt'));
  const [order, setOrder] = useState<SortOrder>(
    embedded
      ? 'desc'
      : ((searchParams.get('order') as SortOrder) || defaultOrderForSort(searchParams.get('sort') || 'createdAt')),
  );
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [resiliateId, setResiliateId] = useState<string | null>(null);
  const [resiliateMotif, setResiliateMotif] = useState('');
  const [form, setForm] = useState<SaleFormData>(emptySaleForm());
  const [payForm, setPayForm] = useState({ amount: '', operationType: 'especes', payerName: '', bank: '', nature: 'acompte', proof: null as File | null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selection = useRowSelection<Sale>();

  function buildStatsQuery(overrides?: { q?: string; status?: string; clientId?: string }) {
    const qs = new URLSearchParams();
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const status = overrides?.status !== undefined ? overrides.status : statusFilter;
    const clientId = overrides?.clientId !== undefined ? overrides.clientId : clientFilter;
    if (qVal) qs.set('q', qVal);
    if (status) qs.set('status', status);
    if (clientId) qs.set('clientId', clientId);
    if (projectId) qs.set('projectId', projectId);
    return qs.toString();
  }

  function buildListQuery(
    pageNum = page,
    overrides?: { q?: string; status?: string; clientId?: string; sort?: string; order?: SortOrder },
  ) {
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const status = overrides?.status !== undefined ? overrides.status : statusFilter;
    const clientId = overrides?.clientId !== undefined ? overrides.clientId : clientFilter;
    const sortVal = overrides?.sort !== undefined ? overrides.sort : sort;
    const orderVal = overrides?.order !== undefined ? overrides.order : order;
    const qs = new URLSearchParams();
    if (qVal) qs.set('q', qVal);
    if (status) qs.set('status', status);
    if (clientId) qs.set('clientId', clientId);
    if (projectId) qs.set('projectId', projectId);
    qs.set('sort', sortVal);
    qs.set('order', orderVal);
    qs.set('page', String(pageNum));
    qs.set('limit', String(projectId ? 100 : PAGE_SIZE));
    return qs.toString();
  }

  function syncUrl(pageNum = page) {
    if (embedded) return;
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (statusFilter) qs.set('status', statusFilter);
    if (clientFilter) qs.set('clientId', clientFilter);
    if (sort !== 'createdAt') qs.set('sort', sort);
    if (order !== defaultOrderForSort(sort)) qs.set('order', order);
    if (pageNum > 1) qs.set('page', String(pageNum));
    setSearchParams(qs, { replace: true });
  }

  function refreshProperties() {
    fetchPropertyList<{ id: string; reference: string; name: string; status: string; type?: string; paymentPlan?: string | null; price?: number | null }>({
      limit: 500,
      ...(projectId ? { projectId } : {}),
    }).then(setProperties);
  }

  function load(
    pageNum = page,
    overrides?: { q?: string; status?: string; clientId?: string; sort?: string; order?: SortOrder },
  ) {
    setLoading(true);
    setError('');
    const statsQs = buildStatsQuery({
      q: overrides?.q,
      status: overrides?.status,
      clientId: overrides?.clientId,
    });
    Promise.all([
      api<PaginatedResponse<Sale>>(`/transactions/sales?${buildListQuery(pageNum, overrides)}`),
      api<Stats>(`/transactions/sales/stats?${statsQs}`),
      projectId
        ? fetchPropertyList<CatalogProperty>({ projectId, limit: 100 })
        : Promise.resolve(null),
    ])
      .then(([res, st, catalog]) => {
        const rows = catalog ? withUnsoldProperties(res.items, catalog) : res.items;
        setItems(rows);
        setPage(catalog ? 1 : res.page);
        setPages(catalog ? 1 : res.pages);
        setTotal(catalog ? rows.length : res.total);
        setStats(st);
        syncUrl(catalog ? 1 : res.page);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('msg.serverError')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(1);
    setPage(1);
  }, [projectId]);

  useEffect(() => {
    if (embedded || searchParams.get('create') !== '1') return;
    openCreate();
    const qs = new URLSearchParams(searchParams);
    qs.delete('create');
    setSearchParams(qs, { replace: true });
  }, [searchParams, embedded]);

  useEffect(() => {
    fetchClientList<{ id: string; reference: string; firstName: string; lastName: string }>().then(setClients);
    refreshProperties();
  }, [projectId]);

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

  function openCreate(propertyId = '') {
    const p = properties.find((row) => row.id === propertyId);
    setForm({
      ...emptySaleForm(),
      propertyId,
      salePrice: p?.price != null ? String(p.price) : '',
      paymentPlan: p?.paymentPlan === 'echeancier' ? 'echeancier' : 'avance',
    });
    setError('');
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const created = await api<{ id: string; advancePaymentId?: string | null }>('/transactions/sales', {
        method: 'POST',
        body: JSON.stringify(saleFormToCreateBody(form)),
      });
      await attachSaleCreateFiles(created.id, created.advancePaymentId, form);
      setOpen(false);
      load(1);
      setPage(1);
      refreshProperties();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payOpen) return;
    try {
      const fd = new FormData();
      fd.append('saleId', payOpen);
      fd.append('amount', payForm.amount);
      fd.append('operationType', payForm.operationType);
      fd.append('nature', payForm.nature || 'acompte');
      if (payForm.payerName) fd.append('payerName', payForm.payerName);
      if (payForm.bank) fd.append('bank', payForm.bank);
      if (payForm.proof) fd.append('proof', payForm.proof);
      await uploadForm('/transactions/payments', fd);
      setPayOpen(null);
      setPayForm({ amount: '', operationType: 'especes', payerName: '', bank: '', nature: 'acompte', proof: null });
      load(page);
      onChanged?.();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmResiliate() {
    if (!resiliateId || !resiliateMotif.trim()) return;
    try {
      await api(`/transactions/sales/${resiliateId}/resiliate`, {
        method: 'POST',
        body: JSON.stringify({ motif: resiliateMotif }),
      });
      setResiliateId(null);
      setResiliateMotif('');
      load(page);
      refreshProperties();
      onChanged?.();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printList() {
    const client = clientFilter ? clients.find((c) => c.id === clientFilter) : null;
    printRows<Sale>({
      title: t('pages.sales'),
      filters: [
        [t('listPrint.search'), q],
        [t('columns.client'), client ? `${client.reference} — ${client.lastName}` : ''],
        [t('listPrint.status'), statusFilter && statusFilters.find((f) => f.id === statusFilter)?.label],
      ],
      columns: [
        { label: t('columns.ref'), value: (s) => s.reference },
        { label: t('columns.client'), value: (s) => `${s.client.firstName} ${s.client.lastName}` },
        { label: t('columns.property'), value: (s) => s.property.name },
        { label: t('columns.netPrice'), value: (s) => formatMad(s.netPrice), align: 'right', total: (rows) => formatMad(rows.reduce((sum, s) => sum + Number(s.netPrice || 0), 0)) },
        { label: t('columns.paid'), value: (s) => formatMad(s.totalPaid), align: 'right', total: (rows) => formatMad(rows.reduce((sum, s) => sum + Number(s.totalPaid || 0), 0)) },
        { label: t('columns.remaining'), value: (s) => formatMad(s.remaining), align: 'right', total: (rows) => formatMad(rows.reduce((sum, s) => sum + Number(s.remaining || 0), 0)) },
        {
          label: t('fields.salePaymentPlan'),
          value: (s) => (salePaymentPlan(s) === 'echeancier' ? t('tabs.paymentBySchedule') : t('tabs.paymentByAdvance')),
        },
        { label: t('columns.status'), value: (s) => (s.status ?? '').replace(/_/g, ' ') },
      ],
      rows: selection.count ? selection.rows : () => fetchAllRows<Sale>('/transactions/sales', buildListQuery(1)),
      selectedCount: selection.count,
    });
  }

  const statusFilters = [
    { id: '', label: t('common.allFeminine') },
    { id: 'en_cours', label: t('fields.statusInProgress') },
    { id: 'en_cours_paiement', label: t('msg.paymentInProgressChip') },
    { id: 'soldée', label: t('common.settledPlural') },
    { id: 'signée', label: t('common.signedPlural') },
    { id: 'résiliée', label: t('common.resiliatedPlural') },
  ];

  const hasActiveFilters = !!statusFilter || !!clientFilter || !!q;

  const headerActions = (
    <>
      <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/transactions/sales/export/csv?${buildStatsQuery()}`, 'ventes-gic.csv')}>{t('common.csv')}</Btn>
      <Btn variant="secondary" icon={Download} onClick={() => downloadExcel(`/transactions/sales/export/xlsx?${buildStatsQuery()}`, 'ventes-gic.xlsx')}>{t('common.excel')}</Btn>
      <Btn variant="secondary" icon={Download} onClick={() => downloadPdf(`/transactions/sales/export/pdf?${buildStatsQuery()}`, 'ventes-gic.pdf')}>PDF</Btn>
      <div className="mac-action-group">
        <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
      </div>
      <Btn icon={Plus} onClick={() => openCreate()}>{t('actions.newSale')}</Btn>
    </>
  );

  return (
    <div className="space-y-0">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-end gap-2 mb-3">{headerActions}</div>
      ) : (
        <PageHeader
          mac
          title={t('pages.sales')}
          subtitle={t('pages.salesSubtitle')}
          actions={headerActions}
        />
      )}

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('pages.sales')} value={stats.total} icon={FileText} tone="violet" />
        <KpiCard title={t('status.complete')} value={stats.soldees} icon={TrendingUp} tone="emerald" />
        <KpiCard
          title={t('fields.collected')}
          value={formatMadCompact(stats.encaisse)}
          icon={Wallet}
          tone="coral"
          compact
          delta={stats.reste ? `Reste ${formatMadCompact(stats.reste)}` : undefined}
          deltaTone="muted"
        />
        <KpiCard
          title={t('kpi.salesVolume')}
          value={formatMadCompact(stats.volume)}
          icon={AlertCircle}
          tone="amber"
          compact
          delta={t('msg.toFollow', { count: stats.enCours })}
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
              placeholder={t('msg.searchRefClientProperty')}
            />
            <MacSelect
              value={clientFilter}
              onChange={(v) => {
                setClientFilter(v);
                setPage(1);
                load(1, { clientId: v });
              }}
              options={[
                { value: '', label: t('common.allClients') },
                ...clients.map((c) => ({ value: c.id, label: `${c.reference} — ${c.lastName}` })),
              ]}
              className="w-48 shrink-0"
            />
            <MacSelect
              value={sort}
              onChange={(v) => {
                const nextOrder = defaultOrderForSort(v);
                setSort(v);
                setOrder(nextOrder);
                setPage(1);
                load(1, { sort: v, order: nextOrder });
              }}
              options={[
                { value: 'createdAt', label: t('msg.newestFirstFeminine') },
                { value: 'reference', label: t('fields.reference') },
                { value: 'remaining', label: t('msg.remainingToPay') },
              ]}
              className="w-40 shrink-0"
            />
            <Btn
              variant="secondary"
              icon={order === 'asc' ? ArrowUp : ArrowDown}
              className="!px-2 !py-2 shrink-0"
              title={order === 'asc' ? t('msg.ascending') : t('msg.descending')}
              onClick={() => {
                const next = order === 'asc' ? 'desc' : 'asc';
                setOrder(next);
                setPage(1);
                load(1, { order: next });
              }}
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
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setStatusFilter('');
                          setClientFilter('');
                          setQ('');
                          setPage(1);
                          load(1, { q: '', status: '', clientId: '' });
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

      <SelectionBar selection={selection} onPrint={printList} />

      <Card padding={false}>
        {loading ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState title={t('msg.emptySales')} action={<Btn icon={Plus} onClick={() => openCreate()}>{t('actions.newSale')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <SelectAllTh selection={selection} rows={items} />
                <Th mac>{t('columns.ref')}</Th>
                <Th mac>{t('columns.client')}</Th>
                <Th mac>{t('columns.property')}</Th>
                <Th mac>{t('columns.netPrice')}</Th>
                <Th mac>{t('columns.paid')}</Th>
                <Th mac>{t('columns.remaining')}</Th>
                <Th mac>{t('fields.salePaymentPlan')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => (s.pending ? openCreate(s.property.id) : navigate(`/ventes/${s.id}`))}
                >
                  <SelectTd selection={selection} row={s} />
                  <Td mac>
                    {s.pending ? (
                      <span className="text-gic-muted">—</span>
                    ) : (
                      <Link to={`/ventes/${s.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{s.reference}</Link>
                    )}
                  </Td>
                  <Td mac>
                    {s.pending || !s.client.id ? (
                      <button type="button" className="text-[12px] text-[#007aff] hover:underline" onClick={(e) => { e.stopPropagation(); openCreate(s.property.id); }}>
                        {t('fields.selectClient')}
                      </button>
                    ) : (
                      <Link to={`/clients/${s.client.id}`} className="hover:text-[#007aff]" onClick={(e) => e.stopPropagation()}>
                        {s.client.firstName} {s.client.lastName}
                      </Link>
                    )}
                  </Td>
                  <Td mac className="mac-table-muted">
                    <Link to={`/biens/${s.property.id}`} className="hover:text-[#007aff]" onClick={(e) => e.stopPropagation()}>{s.property.name}</Link>
                  </Td>
                  <Td mac>{formatMad(s.netPrice)}</Td>
                  <Td mac className="text-gic-emerald">{formatMad(s.totalPaid)}</Td>
                  <Td mac className={s.remaining > 0 ? 'text-gic-coral font-medium' : ''}>{formatMad(s.remaining)}</Td>
                  <Td mac>
                    <span className={`mac-chip ${salePaymentPlan(s) === 'echeancier' ? 'mac-chip-blue' : 'mac-chip-gray'}`}>
                      {salePaymentPlan(s) === 'echeancier' ? t('tabs.paymentBySchedule') : t('tabs.paymentByAdvance')}
                    </span>
                  </Td>
                  <Td mac><StatusPill status={s.status} quiet /></Td>
                  <Td mac className="mac-td-actions">
                    <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                      <MacActionBtn icon={Eye} tone="blue" title={t('actions.fiche360')} onClick={() => navigate(s.pending ? `/biens/${s.property.id}` : `/ventes/${s.id}`)} />
                      <MacActionBtn icon={Pencil} tone="orange" title={s.pending ? t('actions.newSale') : t('common.edit')} onClick={() => (s.pending ? openCreate(s.property.id) : navigate(`/ventes/${s.id}`, { state: { edit: true } }))} />
                      {!s.pending && s.remaining > 0 && !['résiliée', 'annulée', 'soldée'].includes(s.status) && (
                        <MacActionBtn
                          icon={Wallet}
                          tone="green"
                          title={salePaymentPlan(s) === 'echeancier' ? t('tabs.paymentBySchedule') : t('tabs.paymentByAdvance')}
                          onClick={() => {
                            if (salePaymentPlan(s) === 'echeancier') {
                              navigate(`/ventes/${s.id}`, { state: { tab: 'echeancier' } });
                            } else {
                              setPayOpen(s.id);
                            }
                          }}
                        />
                      )}
                      {!s.pending && (
                      <MacActionBtn
                        icon={Printer}
                        tone="gray"
                        title={t('common.print')}
                        onClick={() => api(`/transactions/sales/${s.id}`).then(printSaleReceipt)}
                      />
                      )}
                      {!s.pending && !['résiliée', 'annulée', 'soldée'].includes(s.status) && (
                        <MacActionBtn
                          icon={Ban}
                          tone="red"
                          title={t('actions.resiliate')}
                          onClick={() => { setResiliateId(s.id); setResiliateMotif(''); }}
                        />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => load(p)} mac />
      </Card>

      <Modal open={open} size="lg" title={t('actions.newSale')} onClose={() => setOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn><Btn form="sale-form" type="submit">{t('common.add')}</Btn></>}
      >
        <form id="sale-form" onSubmit={save}>
          <SaleFormFields form={form} setForm={setForm} clients={clients} properties={properties} editMode={false} />
          {error && <p className="mt-3 text-[11px] text-gic-coral">{error}</p>}
        </form>
      </Modal>

      <Modal open={!!payOpen} title={t('actions.newPayment')} onClose={() => setPayOpen(null)}
        footer={<><Btn variant="secondary" onClick={() => setPayOpen(null)}>{t('common.cancel')}</Btn><Btn form="pay-form" type="submit">{t('common.validate')}</Btn></>}
      >
        <form id="pay-form" onSubmit={addPayment} className="grid gap-3">
          <Input label={t('fields.amountMadRequired')} required type="number" min="0" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
          <Select label={t('fields.paymentModeFull')} value={payForm.operationType} onChange={(e) => setPayForm({ ...payForm, operationType: e.target.value })}>
            <option value="especes">{t('fields.modeCash')}</option>
            <option value="virement">{t('fields.modeTransfer')}</option>
            <option value="cheque">{t('fields.modeCheck')}</option>
            <option value="carte">{t('fields.modeCard')}</option>
          </Select>
          <Select label={t('fields.nature')} value={payForm.nature} onChange={(e) => setPayForm({ ...payForm, nature: e.target.value })}>
            <option value="acompte">{t('fields.paymentNatureAdvance')}</option>
            <option value="echeance">{t('fields.paymentNatureInstallment')}</option>
            <option value="solde">{t('fields.paymentNatureBalance')}</option>
          </Select>
          <Input label={t('fields.payerNameShort')} value={payForm.payerName} onChange={(e) => setPayForm({ ...payForm, payerName: e.target.value })} />
          {isBankPaymentMode(payForm.operationType) && (
            <Input label={t('fields.bankRefOperation')} value={payForm.bank} onChange={(e) => setPayForm({ ...payForm, bank: e.target.value })} />
          )}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gic-muted">{t('fields.proofDocument')}</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="block w-full text-[12px]"
              onChange={(e) => setPayForm({ ...payForm, proof: e.target.files?.[0] || null })}
            />
          </div>
        </form>
      </Modal>

      <Modal open={!!resiliateId} title={t('actions.resiliate')} onClose={() => setResiliateId(null)}
        footer={<><Btn variant="secondary" onClick={() => setResiliateId(null)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmResiliate} disabled={!resiliateMotif.trim()}>{t('actions.resiliate')}</Btn></>}
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.rentalTerminateHint')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.resiliateMotifPlaceholder')} value={resiliateMotif} onChange={(e) => setResiliateMotif(e.target.value)} />
      </Modal>
    </div>
  );
}
