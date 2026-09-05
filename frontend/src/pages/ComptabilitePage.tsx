import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Download, Printer, BookOpen, TrendingUp, TrendingDown, Wallet, ShoppingCart, Receipt,
  SlidersHorizontal, Check, ArrowUp, ArrowDown, ExternalLink,
} from 'lucide-react';
import { api, downloadCsv, formatDate, formatMad, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  PageHeader, Pagination, TableWrap, Td, Th,
} from '../components/ui';
import { useI18n } from '../i18n/I18nContext';

type JournalEntry = {
  id: string;
  date: string;
  type: string;
  reference: string;
  label: string;
  debit: number;
  credit: number;
  mode?: string;
  entityType?: string;
  entityId?: string;
};

type Stats = {
  encaissements: number;
  paiementsCount: number;
  caisseSolde: number;
  caisseCredit: number;
  caisseDebit: number;
  achatsValides: number;
  ventesEncaisse: number;
  ventesReste: number;
  ventesVolume: number;
  comptesActifs: number;
  tvaEstimee: number;
};

type JournalResponse = PaginatedResponse<JournalEntry> & { totals: { debit: number; credit: number } };

const PAGE_SIZE = 30;

type SortOrder = 'asc' | 'desc';

function defaultOrderForSort(sort: string): SortOrder {
  return sort === 'date' ? 'desc' : 'asc';
}

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
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

const TYPE_CHIP: Record<string, string> = {
  encaissement: 'mac-chip-green',
  caisse: 'mac-chip-blue',
  achat: 'mac-chip-orange',
};

function entryPath(e: JournalEntry): string | null {
  if (e.entityType === 'payment' && e.entityId) return `/encaissements/${e.entityId}`;
  if (e.entityType === 'movement' && e.entityId) return `/balance/${e.entityId}`;
  if (e.entityType === 'purchase' && e.entityId) return `/achats/${e.entityId}`;
  if (e.id.startsWith('pay-')) return `/encaissements/${e.id.slice(4)}`;
  if (e.id.startsWith('mv-')) return `/balance/${e.id.slice(3)}`;
  if (e.id.startsWith('ach-')) return `/achats/${e.id.slice(4)}`;
  return null;
}

export default function ComptabilitePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<JournalEntry[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState({ debit: 0, credit: 0 });
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(monthStartISO());
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [sort, setSort] = useState('date');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function typeLabel(type: string) {
    const map: Record<string, string> = {
      encaissement: t('accounting.typeReceipt'),
      caisse: t('accounting.typeBalance'),
      achat: t('accounting.typePurchase'),
    };
    return map[type] || type;
  }

  function buildQuery(pageNum = page, overrides?: { type?: string }) {
    const qs = new URLSearchParams();
    const type = overrides?.type ?? typeFilter;
    if (q) qs.set('q', q);
    if (type) qs.set('type', type);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    qs.set('sort', sort);
    qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function buildStatsQuery() {
    const qs = new URLSearchParams();
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    return qs.toString();
  }

  function load(pageNum = page, overrides?: { type?: string }) {
    setLoading(true);
    setError('');
    const type = overrides?.type ?? typeFilter;
    Promise.all([
      api<JournalResponse>(`/finance/comptabilite/journal?${buildQuery(pageNum, { type })}`),
      api<Stats>(`/finance/comptabilite/stats?${buildStatsQuery()}`),
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

  useEffect(() => {
    load(1);
    setPage(1);
  }, [sort, order]);

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

  function onSortChange(nextSort: string) {
    setSort(nextSort);
    setOrder(defaultOrderForSort(nextSort));
  }

  function toggleOrder() {
    setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
  }

  function printJournal() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${t('accounting.journalPrintTitle')}</title><style>body{font-family:sans-serif;padding:24px;font-size:12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px}</style></head><body>
      <h1>${t('accounting.journalTitle')} — GIC</h1>
      <p>${t('fields.period')} : ${dateFrom} → ${dateTo}</p>
      <p>${t('columns.debit')} ${totals.debit} · ${t('columns.credit')} ${totals.credit}</p>
      <table><tr><th>${t('columns.date')}</th><th>${t('columns.type')}</th><th>${t('columns.ref')}</th><th>${t('columns.label')}</th><th>${t('columns.debit')}</th><th>${t('columns.credit')}</th></tr>
      ${items.map((e) => `<tr><td>${formatDate(e.date)}</td><td>${typeLabel(e.type)}</td><td>${e.reference}</td><td>${e.label}</td><td>${e.debit || ''}</td><td>${e.credit || ''}</td></tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const typeFilters = [
    { id: '', label: t('common.all') },
    { id: 'encaissement', label: t('pages.receipts') },
    { id: 'caisse', label: t('pages.balance') },
    { id: 'achat', label: t('pages.purchases') },
  ];

  const hasActiveFilters = !!typeFilter;
  const periodLabel = dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : t('fields.period');

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.accounting')}
        subtitle={t('pages.accountingSubtitle')}
        actions={
          <>
            <Btn
              variant="secondary"
              icon={Download}
              onClick={() => downloadCsv(`/finance/comptabilite/journal/export/csv?${buildQuery()}`, 'journal-comptable-gic.csv')}
            >
              {t('actions.exportCsv')}
            </Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printJournal} />
            </div>
          </>
        }
      />

      {stats && (
        <div className="mac-kpi-grid mac-kpi-grid-5">
          <KpiCard
            title={t('pages.receipts')}
            value={formatMadCompact(stats.encaissements)}
            icon={TrendingUp}
            tone="emerald"
            compact
            delta={t('kpi.paymentsPeriod', { count: stats.paiementsCount, period: periodLabel })}
            deltaTone="muted"
          />
          <KpiCard title={t('dashboard.balanceSolde')} value={formatMadCompact(stats.caisseSolde)} icon={Wallet} tone="violet" compact delta={periodLabel} deltaTone="muted" />
          <KpiCard
            title={t('kpi.estimatedVat')}
            value={formatMadCompact(stats.tvaEstimee)}
            icon={Receipt}
            tone="amber"
            compact
            delta={t('kpi.vatOnReceipts')}
            deltaTone="muted"
          />
          <KpiCard title={t('kpi.purchasesPeriod')} value={formatMadCompact(stats.achatsValides)} icon={ShoppingCart} tone="amber" compact />
          <KpiCard
            title={t('kpi.salesRemaining')}
            value={formatMadCompact(stats.ventesReste)}
            icon={TrendingDown}
            tone="coral"
            compact
            delta={t('kpi.volumeDelta', { amount: formatMadCompact(stats.ventesVolume) })}
            deltaTone="muted"
          />
        </div>
      )}

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('pages.accountingSearchPlaceholder')}
            />
            <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0" />
            <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0" />
            <div className="flex items-center gap-1 shrink-0">
              <MacSelect
                value={sort}
                onChange={onSortChange}
                options={[
                  { value: 'date', label: t('columns.date') },
                  { value: 'credit', label: t('columns.credit') },
                  { value: 'debit', label: t('columns.debit') },
                ]}
                className="w-28"
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
                  <p className="mac-filter-menu-section">{t('common.type')}</p>
                  {typeFilters.map((f) => (
                    <button
                      key={f.id || 'all-type'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${typeFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setTypeFilter(f.id);
                        setPage(1);
                        load(1, { type: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {typeFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setTypeFilter('');
                          setPage(1);
                          load(1, { type: '' });
                          setShowFilters(false);
                        }}
                      >
                        {t('auth.reset')}
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
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gic-border text-[12px]">
          <BookOpen size={15} className="text-[#007aff]" />
          <span className="font-semibold">{t('accounting.journalTitle')}</span>
          <span className="text-gic-muted ml-auto tabular-nums">
            {t('accounting.debitCreditSolde', {
              debit: formatMad(totals.debit),
              credit: formatMad(totals.credit),
              solde: formatMad(totals.credit - totals.debit),
            })}
          </span>
        </div>
        {loading ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState title={t('msg.emptyAccounting')} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.date')}</Th>
                <Th mac>{t('columns.type')}</Th>
                <Th mac>{t('columns.reference')}</Th>
                <Th mac>{t('columns.label')}</Th>
                <Th mac>{t('columns.mode')}</Th>
                <Th mac>{t('columns.debit')}</Th>
                <Th mac>{t('columns.credit')}</Th>
                <Th mac className="w-10" aria-label={t('columns.link')} />
              </tr>
            </thead>
            <tbody>
              {items.map((e) => {
                const path = entryPath(e);
                return (
                  <tr
                    key={e.id}
                    className={path ? 'cursor-pointer' : undefined}
                    onClick={() => path && navigate(path)}
                  >
                    <Td mac>{formatDate(e.date)}</Td>
                    <Td mac>
                      <span className={`mac-chip ${TYPE_CHIP[e.type] || 'mac-chip-gray'}`}>
                        {typeLabel(e.type)}
                      </span>
                    </Td>
                    <Td mac className="font-medium text-gic-violet">{e.reference}</Td>
                    <Td mac className="max-w-[240px] truncate" title={e.label}>{e.label}</Td>
                    <Td mac className="mac-table-muted capitalize">{e.mode || '—'}</Td>
                    <Td mac className={e.debit > 0 ? 'text-gic-coral font-medium' : 'text-gic-muted'}>
                      {e.debit > 0 ? formatMad(e.debit) : '—'}
                    </Td>
                    <Td mac className={e.credit > 0 ? 'text-gic-emerald font-medium' : 'text-gic-muted'}>
                      {e.credit > 0 ? formatMad(e.credit) : '—'}
                    </Td>
                    <Td mac>
                      {path && (
                        <Link
                          to={path}
                          className="text-[#007aff] hover:opacity-70 inline-flex"
                          onClick={(ev) => ev.stopPropagation()}
                          title={t('actions.openFiche')}
                        >
                          <ExternalLink size={14} />
                        </Link>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => { setPage(p); load(p); }} mac />
      </Card>
    </div>
  );
}
