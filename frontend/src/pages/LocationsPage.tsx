import { fetchAllRows, printRows } from '../lib/listPrint';
import { appAlert } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Eye, Download, Printer, Ban, Wallet, Home, Key, TrendingUp,
  SlidersHorizontal, Check, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, downloadPdf, fetchClientList, fetchPropertyList, formatMad, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { RentalFormFields, emptyRentalForm, rentalToForm, rentalFormToBody, type RentalFormData } from '../components/RentalFormFields';
import { SelectAllTh, SelectTd, SelectionBar } from '../components/RowSelection';
import { printRentalReceipt } from '../lib/printRental';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useRowSelection } from '../hooks/useRowSelection';
import { useI18n } from '../i18n/I18nContext';
import { propertyDealOf } from '../lib/propertyDeal';

type Rental = {
  id: string;
  reference: string;
  status: string;
  monthlyRent: number;
  totalPaid: number;
  remaining: number;
  pending?: boolean;
  client: { id: string; firstName: string; lastName: string; reference: string };
  property: { id: string; name: string; reference: string };
};

type CatalogProperty = {
  id: string;
  reference: string;
  name: string;
  status: string;
  type?: string;
  price?: number | null;
};

function withUnrentedProperties(rentals: Rental[], props: CatalogProperty[]): Rental[] {
  const byProperty = new Map(rentals.map((r) => [r.property.id, r]));
  const seen = new Set<string>();
  const rows: Rental[] = [];
  for (const p of props.filter((row) => propertyDealOf(row) === 'location')) {
    seen.add(p.id);
    const rental = byProperty.get(p.id);
    if (rental) {
      rows.push(rental);
      continue;
    }
    const rent = Number(p.price || 0);
    rows.push({
      id: `bien:${p.id}`,
      reference: '',
      status: p.status || 'disponible',
      monthlyRent: rent,
      totalPaid: 0,
      remaining: rent,
      pending: true,
      client: { id: '', firstName: '', lastName: '', reference: '' },
      property: { id: p.id, name: p.name, reference: p.reference },
    });
  }
  for (const r of rentals) {
    if (!seen.has(r.property.id)) rows.push(r);
  }
  return rows;
}

type Stats = { total: number; actives: number; terminees: number; encaisse: number; reste: number; mensualites: number };

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

type LocationsPageProps = {
  projectId?: string;
  embedded?: boolean;
  onChanged?: () => void;
};

export default function LocationsPage({ projectId, embedded, onChanged }: LocationsPageProps = {}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Rental[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, actives: 0, terminees: 0, encaisse: 0, reste: 0, mensualites: 0 });
  const [clients, setClients] = useState<{ id: string; reference: string; firstName: string; lastName: string }[]>([]);
  const [properties, setProperties] = useState<{ id: string; reference: string; name: string; status: string; type?: string; price?: number | null }[]>([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [terminateId, setTerminateId] = useState<string | null>(null);
  const [terminateMotif, setTerminateMotif] = useState('');
  const [form, setForm] = useState<RentalFormData>(emptyRentalForm());
  const [payForm, setPayForm] = useState({ amount: '', operationType: 'especes', payerName: '', bank: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selection = useRowSelection<Rental>();

  function buildExportQuery(overrides?: { q?: string; status?: string; clientId?: string }) {
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

  function buildListQuery(pageNum = page, overrides?: { status?: string; clientId?: string; q?: string }) {
    const status = overrides?.status !== undefined ? overrides.status : statusFilter;
    const clientId = overrides?.clientId !== undefined ? overrides.clientId : clientFilter;
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const qs = new URLSearchParams();
    if (qVal) qs.set('q', qVal);
    if (status) qs.set('status', status);
    if (clientId) qs.set('clientId', clientId);
    if (projectId) qs.set('projectId', projectId);
    qs.set('sort', sort);
    qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(projectId ? 100 : PAGE_SIZE));
    return qs.toString();
  }

  function refreshProperties() {
    fetchPropertyList<{ id: string; reference: string; name: string; status: string; type?: string; price?: number | null }>({
      limit: 500,
      ...(projectId ? { projectId } : {}),
    }).then(setProperties);
  }

  function load(pageNum = page, overrides?: { status?: string; clientId?: string; q?: string }) {
    setLoading(true);
    setError('');
    const status = overrides?.status !== undefined ? overrides.status : statusFilter;
    const clientId = overrides?.clientId !== undefined ? overrides.clientId : clientFilter;
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const statsQs = buildExportQuery({ q: qVal, status, clientId });
    Promise.all([
      api<PaginatedResponse<Rental>>(`/transactions/rentals?${buildListQuery(pageNum, { q: qVal, status, clientId })}`),
      api<Stats>(`/transactions/rentals/stats?${statsQs}`),
      projectId
        ? fetchPropertyList<CatalogProperty>({ projectId, limit: 100 })
        : Promise.resolve(null),
    ])
      .then(([res, st, catalog]) => {
        const rows = catalog ? withUnrentedProperties(res.items, catalog) : res.items;
        setItems(rows);
        setPage(catalog ? 1 : res.page);
        setPages(catalog ? 1 : res.pages);
        setTotal(catalog ? rows.length : res.total);
        setStats(st);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('msg.serverError')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(1);
    setPage(1);
  }, [sort, order, projectId]);

  function onSortChange(nextSort: string) {
    setSort(nextSort);
    setOrder(defaultOrderForSort(nextSort));
  }

  function toggleOrder() {
    setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
  }

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
    setEditId(null);
    setForm({
      ...emptyRentalForm(),
      propertyId,
      monthlyRent: p?.price != null ? String(p.price) : '',
    });
    setError('');
    setOpen(true);
  }

  useCreateQuery(embedded ? () => {} : openCreate);

  function openEdit(r: Rental) {
    api(`/transactions/rentals/${r.id}`).then((full) => {
      setEditId(r.id);
      setForm(rentalToForm(full));
      setError('');
      setOpen(true);
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editId) {
        await api(`/transactions/rentals/${editId}`, {
          method: 'PUT',
          body: JSON.stringify(rentalFormToBody(form, true)),
        });
      } else {
        await api('/transactions/rentals', {
          method: 'POST',
          body: JSON.stringify(rentalFormToBody(form, false)),
        });
      }
      setOpen(false);
      load(page);
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
      await api('/transactions/payments', {
        method: 'POST',
        body: JSON.stringify({ rentalId: payOpen, ...payForm }),
      });
      setPayOpen(null);
      setPayForm({ amount: '', operationType: 'especes', payerName: '', bank: '' });
      load(page);
      onChanged?.();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmTerminate() {
    if (!terminateId || !terminateMotif.trim()) return;
    try {
      await api(`/transactions/rentals/${terminateId}/terminate`, {
        method: 'POST',
        body: JSON.stringify({ motif: terminateMotif }),
      });
      setTerminateId(null);
      setTerminateMotif('');
      load(page);
      refreshProperties();
      onChanged?.();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printList() {
    const client = clientFilter ? clients.find((c) => c.id === clientFilter) : null;
    printRows<Rental>({
      title: t('pages.rentals'),
      filters: [
        [t('listPrint.search'), q],
        [t('fields.tenant'), client ? `${client.reference} — ${client.lastName}` : ''],
        [t('listPrint.status'), statusFilter && statusFilters.find((f) => f.id === statusFilter)?.label],
      ],
      columns: [
        { label: t('columns.ref'), value: (r) => r.reference },
        { label: t('columns.tenant'), value: (r) => `${r.client.firstName} ${r.client.lastName}` },
        { label: t('columns.property'), value: (r) => r.property.name },
        { label: t('columns.monthly'), value: (r) => formatMad(r.monthlyRent), align: 'right', total: (rows) => formatMad(rows.reduce((s, r) => s + Number(r.monthlyRent || 0), 0)) },
        { label: t('columns.paid'), value: (r) => formatMad(r.totalPaid), align: 'right', total: (rows) => formatMad(rows.reduce((s, r) => s + Number(r.totalPaid || 0), 0)) },
        { label: t('columns.remaining'), value: (r) => formatMad(r.remaining), align: 'right', total: (rows) => formatMad(rows.reduce((s, r) => s + Number(r.remaining || 0), 0)) },
        { label: t('columns.status'), value: (r) => (r.status ?? '').replace(/_/g, ' ') },
      ],
      rows: selection.count ? selection.rows : () => fetchAllRows<Rental>('/transactions/rentals', buildListQuery(1)),
      selectedCount: selection.count,
    });
  }

  const statusFilters = [
    { id: '', label: t('common.allFeminine') },
    { id: 'active', label: t('common.activeFemininePlural') },
    { id: 'suspendue', label: t('common.suspendedPlural') },
    { id: 'terminée', label: t('common.endedPlural') },
  ];

  const hasActiveFilters = !!statusFilter || !!clientFilter;

  const headerActions = (
    <>
      <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/transactions/rentals/export/csv?${buildExportQuery()}`, 'locations-gic.csv')}>{t('common.csv')}</Btn>
      <Btn variant="secondary" icon={Download} onClick={() => downloadExcel(`/transactions/rentals/export/xlsx?${buildExportQuery()}`, 'locations-gic.xlsx')}>{t('common.excel')}</Btn>
      <Btn variant="secondary" icon={Download} onClick={() => downloadPdf(`/transactions/rentals/export/pdf?${buildExportQuery()}`, 'locations-gic.pdf')}>PDF</Btn>
      <div className="mac-action-group">
        <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
      </div>
      <Btn icon={Plus} onClick={() => openCreate()}>{t('actions.newRental')}</Btn>
    </>
  );

  return (
    <div className="space-y-0">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-end gap-2 mb-3">{headerActions}</div>
      ) : (
        <PageHeader
          mac
          title={t('pages.rentals')}
          subtitle={t('pages.rentalsSubtitle')}
          actions={headerActions}
        />
      )}

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('pages.rentals')} value={stats.total} icon={Key} tone="violet" />
        <KpiCard title={t('status.active')} value={stats.actives} icon={Home} tone="emerald" delta={t('msg.endedCount', { count: stats.terminees })} deltaTone="muted" />
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
          title={t('kpi.activeMonthlyRents')}
          value={formatMadCompact(stats.mensualites)}
          icon={TrendingUp}
          tone="amber"
          compact
        />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchRefTenantProperty')}
            />
            <div className="flex items-center gap-1 shrink-0">
              <MacSelect
                value={sort}
                onChange={onSortChange}
                options={[
                  { value: 'createdAt', label: t('msg.dateCreated') },
                  { value: 'reference', label: t('fields.reference') },
                  { value: 'monthlyRent', label: t('columns.monthly') },
                ]}
                className="w-36"
              />
              <MacActionBtn
                icon={order === 'asc' ? ArrowUp : ArrowDown}
                tone="gray"
                title={order === 'asc' ? t('msg.ascending') : t('msg.descending')}
                onClick={toggleOrder}
              />
            </div>
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
                  <p className="mac-filter-menu-section">{t('fields.tenant')}</p>
                  <button
                    type="button"
                    role="menuitem"
                    className={`mac-filter-menu-item${clientFilter === '' ? ' mac-filter-menu-item-active' : ''}`}
                    onClick={() => {
                      setClientFilter('');
                      setPage(1);
                      load(1, { clientId: '' });
                    }}
                  >
                    <span>Tous</span>
                    {clientFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                  </button>
                  {clients.slice(0, 40).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${clientFilter === c.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setClientFilter(c.id);
                        setPage(1);
                        load(1, { clientId: c.id });
                      }}
                    >
                      <span className="truncate">{c.reference} — {c.lastName}</span>
                      {clientFilter === c.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
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
                          setPage(1);
                          load(1, { status: '', clientId: '' });
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
          <EmptyState title={t('msg.emptyRentals')} action={<Btn icon={Plus} onClick={() => openCreate()}>{t('actions.newRental')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <SelectAllTh selection={selection} rows={items} />
                {embedded && <Th mac>{t('columns.reference')}</Th>}
                <Th mac>{embedded ? t('columns.rentalRef') : t('columns.ref')}</Th>
                <Th mac>{t('columns.tenant')}</Th>
                <Th mac>{t('columns.property')}</Th>
                <Th mac>{t('columns.monthly')}</Th>
                <Th mac>{t('columns.paid')}</Th>
                <Th mac>{t('columns.remaining')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => (r.pending ? openCreate(r.property.id) : navigate(`/locations/${r.id}`))}>
                  <SelectTd selection={selection} row={r} />
                  {embedded && (
                    <Td mac>
                      <Link to={`/biens/${r.property.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{r.property.reference}</Link>
                    </Td>
                  )}
                  <Td mac>
                    {r.pending || !r.reference ? (
                      <span className="text-gic-muted">—</span>
                    ) : (
                      <Link to={`/locations/${r.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{r.reference}</Link>
                    )}
                  </Td>
                  <Td mac>
                    {r.pending || !r.client.id ? (
                      <button type="button" className="text-[12px] text-[#007aff] hover:underline" onClick={(e) => { e.stopPropagation(); openCreate(r.property.id); }}>
                        {t('fields.selectClient')}
                      </button>
                    ) : (
                      <Link to={`/clients/${r.client.id}`} className="hover:text-[#007aff]" onClick={(e) => e.stopPropagation()}>
                        {r.client.firstName} {r.client.lastName}
                      </Link>
                    )}
                  </Td>
                  <Td mac className="mac-table-muted">
                    <Link to={`/biens/${r.property.id}`} className="hover:text-[#007aff]">{r.property.name}</Link>
                  </Td>
                  <Td mac>{r.pending ? '—' : formatMad(r.monthlyRent)}</Td>
                  <Td mac>{r.pending ? '—' : formatMad(r.totalPaid)}</Td>
                  <Td mac className={!r.pending && r.remaining > 0 ? 'text-gic-coral font-medium' : ''}>{r.pending ? '—' : formatMad(r.remaining)}</Td>
                  <Td mac>
                    <StatusPill status={r.status} quiet />
                  </Td>
                  <Td mac className="mac-td-actions">
                    <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                      {r.pending ? (
                        <MacActionBtn icon={Eye} tone="blue" title={t('actions.ficheDetail')} onClick={() => navigate(`/biens/${r.property.id}`)} />
                      ) : (
                      <Link to={`/locations/${r.id}`} className="mac-action-btn mac-action-btn-blue" title={t('actions.ficheDetail')}>
                        <Eye size={14} strokeWidth={2.15} />
                      </Link>
                      )}
                      <MacActionBtn icon={Pencil} tone="orange" title={r.pending ? t('actions.newRental') : t('common.edit')} onClick={() => (r.pending ? openCreate(r.property.id) : openEdit(r))} />
                      {!r.pending && r.status === 'active' && (
                        <MacActionBtn icon={Wallet} tone="green" title={t('actions.payment')} onClick={() => setPayOpen(r.id)} />
                      )}
                      {!r.pending && (
                      <MacActionBtn
                        icon={Printer}
                        tone="gray"
                        title={t('common.print')}
                        onClick={() => api(`/transactions/rentals/${r.id}`).then(printRentalReceipt)}
                      />
                      )}
                      {!r.pending && r.status === 'active' && (
                        <MacActionBtn
                          icon={Ban}
                          tone="red"
                          title={t('actions.resiliate')}
                          onClick={() => { setTerminateId(r.id); setTerminateMotif(''); }}
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

      <Modal
        open={open}
        size="lg"
        title={editId ? t('actions.editRental') : t('actions.newRental')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="rental-form" type="submit">{editId ? t('common.save') : t('common.add')}</Btn>
          </>
        }
      >
        <form id="rental-form" onSubmit={save}>
          <RentalFormFields form={form} setForm={setForm} clients={clients} properties={properties} editMode={!!editId} />
          {error && <p className="mt-3 text-[11px] text-gic-coral">{error}</p>}
        </form>
      </Modal>

      <Modal
        open={!!payOpen}
        title={t('actions.paymentRental')}
        onClose={() => setPayOpen(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPayOpen(null)}>{t('common.cancel')}</Btn>
            <Btn form="rental-pay-form" type="submit">{t('common.validate')}</Btn>
          </>
        }
      >
        <form id="rental-pay-form" onSubmit={addPayment} className="grid gap-3">
          <Input label={t('fields.amountMadRequired')} required type="number" min="0" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
          <Select label={t('fields.mode')} value={payForm.operationType} onChange={(e) => setPayForm({ ...payForm, operationType: e.target.value })}>
            <option value="especes">{t('fields.modeCash')}</option>
            <option value="virement">{t('fields.modeTransfer')}</option>
            <option value="cheque">{t('fields.modeCheck')}</option>
            <option value="carte">{t('fields.modeCard')}</option>
          </Select>
          <Input label={t('fields.payerNameShort')} value={payForm.payerName} onChange={(e) => setPayForm({ ...payForm, payerName: e.target.value })} />
          <Input label={t('fields.bankRef')} value={payForm.bank} onChange={(e) => setPayForm({ ...payForm, bank: e.target.value })} />
        </form>
      </Modal>

      <Modal
        open={!!terminateId}
        title={t('actions.resiliateLease')}
        onClose={() => setTerminateId(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setTerminateId(null)}>{t('common.cancel')}</Btn>
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
