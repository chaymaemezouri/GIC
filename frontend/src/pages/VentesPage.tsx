import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Pencil, Eye, Download, Printer, Ban, Wallet, TrendingUp, FileText, AlertCircle,
  SlidersHorizontal, Check, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, downloadPdf, fetchClientList, fetchPropertyList, formatMad, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { SaleFormFields, emptySaleForm, saleFormToCreateBody, type SaleFormData } from '../components/SaleFormFields';
import { printSaleReceipt } from '../lib/printSale';
import { useI18n } from '../i18n/I18nContext';

type Sale = {
  id: string;
  reference: string;
  status: string;
  netPrice: number;
  totalPaid: number;
  remaining: number;
  client: { id: string; firstName: string; lastName: string; reference: string };
  property: { id: string; name: string; reference: string };
};

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

export default function VentesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Sale[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, soldees: 0, enCours: 0, encaisse: 0, reste: 0, volume: 0 });
  const [clients, setClients] = useState<{ id: string; reference: string; firstName: string; lastName: string }[]>([]);
  const [properties, setProperties] = useState<{ id: string; reference: string; name: string; status: string }[]>([]);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [clientFilter, setClientFilter] = useState(searchParams.get('clientId') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'createdAt');
  const [order, setOrder] = useState<SortOrder>(
    (searchParams.get('order') as SortOrder) || defaultOrderForSort(searchParams.get('sort') || 'createdAt'),
  );
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [resiliateId, setResiliateId] = useState<string | null>(null);
  const [resiliateMotif, setResiliateMotif] = useState('');
  const [form, setForm] = useState<SaleFormData>(emptySaleForm());
  const [payForm, setPayForm] = useState({ amount: '', operationType: 'especes', payerName: '', bank: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildStatsQuery(overrides?: { q?: string; status?: string; clientId?: string }) {
    const qs = new URLSearchParams();
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const status = overrides?.status !== undefined ? overrides.status : statusFilter;
    const clientId = overrides?.clientId !== undefined ? overrides.clientId : clientFilter;
    if (qVal) qs.set('q', qVal);
    if (status) qs.set('status', status);
    if (clientId) qs.set('clientId', clientId);
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
    qs.set('sort', sortVal);
    qs.set('order', orderVal);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function syncUrl(pageNum = page) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (statusFilter) qs.set('status', statusFilter);
    if (clientFilter) qs.set('clientId', clientFilter);
    if (sort !== 'createdAt') qs.set('sort', sort);
    if (order !== defaultOrderForSort(sort)) qs.set('order', order);
    if (pageNum > 1) qs.set('page', String(pageNum));
    setSearchParams(qs, { replace: true });
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
    ])
      .then(([res, st]) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        setStats(st);
        syncUrl(res.page);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('msg.serverError')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(page);
  }, []);

  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    openCreate();
    const qs = new URLSearchParams(searchParams);
    qs.delete('create');
    setSearchParams(qs, { replace: true });
  }, [searchParams]);

  useEffect(() => {
    fetchClientList<{ id: string; reference: string; firstName: string; lastName: string }>().then(setClients);
    fetchPropertyList<{ id: string; reference: string; name: string; status: string }>().then(setProperties);
  }, []);

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
    setForm(emptySaleForm());
    setError('');
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/transactions/sales', {
        method: 'POST',
        body: JSON.stringify(saleFormToCreateBody(form)),
      });
      setOpen(false);
      load(1);
      setPage(1);
      fetchPropertyList<{ id: string; reference: string; name: string; status: string }>().then(setProperties);
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
        body: JSON.stringify({ saleId: payOpen, ...payForm }),
      });
      setPayOpen(null);
      setPayForm({ amount: '', operationType: 'especes', payerName: '', bank: '' });
      load(page);
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
      fetchPropertyList<{ id: string; reference: string; name: string; status: string }>().then(setProperties);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${t('pages.sales')} — GIC</title></head><body>
      <h1>${t('pages.sales')} — GIC</h1>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.ref')}</th><th>${t('columns.client')}</th><th>${t('columns.property')}</th><th>${t('columns.net')}</th><th>${t('columns.paid')}</th><th>${t('columns.remaining')}</th><th>${t('columns.status')}</th></tr>
        ${items.map((s) => `<tr>
          <td>${s.reference}</td>
          <td>${s.client.firstName} ${s.client.lastName}</td>
          <td>${s.property.name}</td>
          <td>${s.netPrice}</td>
          <td>${s.totalPaid}</td>
          <td>${s.remaining}</td>
          <td>${s.status}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
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

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.sales')}
        subtitle={t('pages.salesSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/transactions/sales/export/csv?${buildStatsQuery()}`, 'ventes-gic.csv')}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadExcel(`/transactions/sales/export/xlsx?${buildStatsQuery()}`, 'ventes-gic.xlsx')}>{t('common.excel')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadPdf(`/transactions/sales/export/pdf?${buildStatsQuery()}`, 'ventes-gic.pdf')}>PDF</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newSale')}</Btn>
          </>
        }
      />

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

      <Card padding={false}>
        {loading ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState title={t('msg.emptySales')} action={<Btn icon={Plus} onClick={openCreate}>{t('actions.newSale')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.ref')}</Th>
                <Th mac>{t('columns.client')}</Th>
                <Th mac>{t('columns.property')}</Th>
                <Th mac>{t('columns.netPrice')}</Th>
                <Th mac>{t('columns.paid')}</Th>
                <Th mac>{t('columns.remaining')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/ventes/${s.id}`)}
                >
                  <Td mac>
                    <Link to={`/ventes/${s.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{s.reference}</Link>
                  </Td>
                  <Td mac>
                    <Link to={`/clients/${s.client.id}`} className="hover:text-[#007aff]" onClick={(e) => e.stopPropagation()}>
                      {s.client.firstName} {s.client.lastName}
                    </Link>
                  </Td>
                  <Td mac className="mac-table-muted">
                    <Link to={`/biens/${s.property.id}`} className="hover:text-[#007aff]" onClick={(e) => e.stopPropagation()}>{s.property.name}</Link>
                  </Td>
                  <Td mac>{formatMad(s.netPrice)}</Td>
                  <Td mac className="text-gic-emerald">{formatMad(s.totalPaid)}</Td>
                  <Td mac className={s.remaining > 0 ? 'text-gic-coral font-medium' : ''}>{formatMad(s.remaining)}</Td>
                  <Td mac><StatusPill status={s.status} quiet /></Td>
                  <Td mac className="mac-td-actions">
                    <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                      <MacActionBtn icon={Eye} tone="blue" title={t('actions.fiche360')} onClick={() => navigate(`/ventes/${s.id}`)} />
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => navigate(`/ventes/${s.id}`, { state: { edit: true } })} />
                      {s.remaining > 0 && !['résiliée', 'annulée', 'soldée'].includes(s.status) && (
                        <MacActionBtn icon={Wallet} tone="green" title={t('actions.payment')} onClick={() => setPayOpen(s.id)} />
                      )}
                      <MacActionBtn
                        icon={Printer}
                        tone="gray"
                        title={t('common.print')}
                        onClick={() => api(`/transactions/sales/${s.id}`).then(printSaleReceipt)}
                      />
                      {!['résiliée', 'annulée', 'soldée'].includes(s.status) && (
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
          <Input label={t('fields.payerNameShort')} value={payForm.payerName} onChange={(e) => setPayForm({ ...payForm, payerName: e.target.value })} />
          <Input label={t('fields.bankRefOperation')} value={payForm.bank} onChange={(e) => setPayForm({ ...payForm, bank: e.target.value })} />
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
