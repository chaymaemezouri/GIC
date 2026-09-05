import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Download, Printer, Eye, Wallet, Users, TrendingUp, Clock, Banknote,
  SlidersHorizontal, Check, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, downloadCsv, fetchChantierList, formatMad, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, StatusPill, TableWrap, Tabs, Td, Th,
} from '../components/ui';
import { useI18n } from '../i18n/I18nContext';
import {
  scopeQueryParams,
  workforceDetailPathForCategory,
  type WorkforceScope,
} from '../lib/workforceScope';

type SortOrder = 'asc' | 'desc';

type SalaryRow = {
  id: string;
  firstName: string;
  lastName: string;
  category?: string;
  groupe?: string;
  dailySalary: number;
  monthlySalary?: number;
  salaryPeriod?: string;
  bankName?: string | null;
  rib?: string | null;
  declared: boolean;
  chantier?: { id: string; name: string } | null;
  salary: {
    totalDays: number;
    advances: number;
    bonuses: number;
    brut: number;
    net: number;
    netDue: number;
    amountPaid: number;
    remaining: number;
    status: string;
    pointageCount: number;
    payrollId?: string | null;
    salaryPeriod?: string;
  };
};

type Stats = {
  totalWorkers: number;
  withPointage: number;
  totalDays: number;
  totalBrut: number;
  totalNet: number;
  totalAdvances: number;
  totalBonuses: number;
  totalPaid: number;
  totalRemaining: number;
};

const PAGE_SIZE = 20;

type PayFilter = '' | 'a_payer' | 'paye' | 'partiel';

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

export default function SalairesPage({ embedded = false, mode = 'main_oeuvre' }: { embedded?: boolean; mode?: WorkforceScope }) {
  const { t } = useI18n();
  const PAY_TABS: { id: PayFilter; label: string }[] = [
    { id: '', label: t('common.all') },
    { id: 'a_payer', label: t('rental.toPay') },
    { id: 'paye', label: t('rental.paid') },
    { id: 'partiel', label: t('status.partial') },
  ];
  const isChauffeur = mode === 'chauffeur';
  const isAll = mode === 'all';
  const showCategory = isAll || mode === 'main_oeuvre';
  const scopeParams = scopeQueryParams(mode);
  const navigate = useNavigate();
  const [items, setItems] = useState<SalaryRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({
    totalWorkers: 0, withPointage: 0, totalDays: 0, totalBrut: 0, totalNet: 0,
    totalAdvances: 0, totalBonuses: 0, totalPaid: 0, totalRemaining: 0,
  });
  const [dateFrom, setDateFrom] = useState(monthStartISO);
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [q, setQ] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('true');
  const [sort, setSort] = useState('lastName');
  const [order, setOrder] = useState<SortOrder>('asc');
  const [chantierFilter, setChantierFilter] = useState('');
  const [chantiers, setChantiers] = useState<{ id: string; name: string }[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payFilter, setPayFilter] = useState<PayFilter>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [payOpen, setPayOpen] = useState<SalaryRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('especes');
  const [payLoading, setPayLoading] = useState(false);

  function buildQuery(pageNum = page, overrides?: {
    q?: string; category?: string; active?: string; sort?: string; order?: SortOrder;
    dateFrom?: string; dateTo?: string; chantierId?: string; payStatus?: PayFilter;
  }) {
    const qs = new URLSearchParams();
    const df = overrides?.dateFrom ?? dateFrom;
    const dt = overrides?.dateTo ?? dateTo;
    const query = overrides?.q ?? q;
    const cat = overrides?.category ?? categoryFilter;
    const active = overrides?.active ?? activeFilter;
    const sortVal = overrides?.sort ?? sort;
    const orderVal = overrides?.order ?? order;
    const chantierId = overrides?.chantierId ?? chantierFilter;
    const payStatus = overrides?.payStatus ?? payFilter;
    if (df) qs.set('dateFrom', df);
    if (dt) qs.set('dateTo', dt);
    if (query) qs.set('q', query);
    if (!isChauffeur && !isAll && cat) qs.set('category', cat);
    if (scopeParams.category) qs.set('category', scopeParams.category);
    if (scopeParams.excludeCategory) qs.set('excludeCategory', scopeParams.excludeCategory);
    if (active) qs.set('active', active);
    if (chantierId) qs.set('chantierId', chantierId);
    if (payStatus) qs.set('payStatus', payStatus);
    qs.set('sort', sortVal);
    qs.set('order', orderVal);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs;
  }

  function buildStatsQuery(overrides?: {
    q?: string; category?: string; active?: string;
    dateFrom?: string; dateTo?: string; chantierId?: string; payStatus?: PayFilter;
  }) {
    const qs = new URLSearchParams();
    const df = overrides?.dateFrom ?? dateFrom;
    const dt = overrides?.dateTo ?? dateTo;
    const query = overrides?.q ?? q;
    const cat = overrides?.category ?? categoryFilter;
    const active = overrides?.active ?? activeFilter;
    const chantierId = overrides?.chantierId ?? chantierFilter;
    const payStatus = overrides?.payStatus ?? payFilter;
    if (df) qs.set('dateFrom', df);
    if (dt) qs.set('dateTo', dt);
    if (query) qs.set('q', query);
    if (!isChauffeur && !isAll && cat) qs.set('category', cat);
    if (scopeParams.category) qs.set('category', scopeParams.category);
    if (scopeParams.excludeCategory) qs.set('excludeCategory', scopeParams.excludeCategory);
    if (active) qs.set('active', active);
    if (chantierId) qs.set('chantierId', chantierId);
    if (payStatus) qs.set('payStatus', payStatus);
    return qs;
  }

  function load(pageNum = page, overrides?: Parameters<typeof buildQuery>[1]) {
    setLoading(true);
    setError('');
    Promise.all([
      api<PaginatedResponse<SalaryRow>>(`/chantiers/salaries?${buildQuery(pageNum, overrides)}`),
      api<Stats>(`/chantiers/salaries/stats?${buildStatsQuery(overrides)}`),
    ])
      .then(([res, st]) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        setStats(st);
        const cats = [...new Set(res.items.map((r) => r.category).filter(Boolean))] as string[];
        if (cats.length) setCategories((prev) => [...new Set([...prev, ...cats])]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('msg.serverError')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(1);
    api<{ categories: string[] }>(`/chantiers/workforce/stats?${new URLSearchParams(scopeParams)}`)
      .then((s) => setCategories(s.categories || []))
      .catch(() => {});
    fetchChantierList<{ id: string; name: string }>().then(setChantiers).catch(() => {});
  }, [mode]);

  useEffect(() => {
    load(1);
    setPage(1);
  }, [sort, order]);

  function toggleOrder() {
    setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
  }

  function openDetail(row: SalaryRow) {
    const qs = new URLSearchParams();
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    navigate(`/salaires/${row.id}?${qs}`);
  }

  function openPay(row: SalaryRow, e?: React.MouseEvent) {
    e?.stopPropagation();
    setPayOpen(row);
    setPayAmount(String(row.salary.remaining > 0 ? row.salary.remaining : row.salary.netDue));
    setPayMode('especes');
  }

  async function confirmPay(e: React.FormEvent) {
    e.preventDefault();
    if (!payOpen) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setPayLoading(true);
    try {
      const d = new Date(dateFrom);
      await api(`/chantiers/salaries/${payOpen.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          periodYear: d.getFullYear(),
          periodMonth: d.getMonth() + 1,
          amount,
          paymentMode: payMode,
        }),
      });
      setPayOpen(null);
      load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('msg.paymentError'));
    } finally {
      setPayLoading(false);
    }
  }

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

  function exportCsv() {
    downloadCsv(`/chantiers/salaries/export/csv?${buildStatsQuery()}`, exportName);
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${t('pages.salaries')} GIC</title></head><body>
      <h1>${t('pages.salaries')} — GIC</h1>
      <p>${t('fields.period')} : ${dateFrom} → ${dateTo}</p>
      <p>${t('columns.net')} : ${formatMad(stats.totalNet)} · ${t('columns.brut')} : ${formatMad(stats.totalBrut)}</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.worker')}</th><th>${t('columns.category')}</th><th>${t('fields.daysCount')}</th><th>${t('columns.brut')}</th><th>${t('columns.bonuses')}</th><th>${t('columns.advances')}</th><th>${t('columns.net')}</th></tr>
        ${items.map((r) => `<tr>
          <td>${r.firstName} ${r.lastName}</td>
          <td>${r.category || '—'}</td>
          <td>${r.salary.totalDays.toFixed(2)}</td>
          <td>${r.salary.brut}</td>
          <td>${r.salary.bonuses}</td>
          <td>${r.salary.advances}</td>
          <td>${r.salary.net}</td>
        </tr>`).join('')}
      </table>
      <p style="margin-top:16px;font-size:11px">${t('msg.salaryFormulaHint')}</p>
    </body></html>`);
    w.document.close();
    w.print();
  }

  const activeFilters = [
    { id: 'true', label: t('kpi.active') },
    { id: 'false', label: t('status.inactives') },
    { id: '', label: t('common.all') },
  ];

  const hasActiveFilters = activeFilter !== 'true' || (!isChauffeur && !!categoryFilter) || !!chantierFilter;
  const exportName = isChauffeur ? 'salaires-chauffeurs-gic.csv' : 'salaires-gic.csv';

  function switchPayFilter(next: PayFilter) {
    setPayFilter(next);
    setPage(1);
    load(1, { payStatus: next });
  }

  const personLabel = isChauffeur ? t('create.driver') : isAll ? t('tabs.personnel') : t('columns.worker');
  const pageTitle = isChauffeur ? t('pages.salariesDrivers') : isAll ? t('pages.salariesAll') : t('pages.salariesWorkforce');
  const pageSubtitle = isChauffeur
    ? t('pages.salariesDriversSubtitle')
    : isAll
      ? t('pages.salariesAllSubtitle')
      : t('pages.salariesWorkforceSubtitle');

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-0'}>
      {!embedded && (
      <PageHeader
        mac
        title={pageTitle}
        subtitle={pageSubtitle}
        actions={
          <>
            <Link to="/pointage"><Btn variant="secondary" icon={Clock}>{t('pages.attendance')}</Btn></Link>
            <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.export')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
          </>
        }
      />
      )}

      {embedded && (
        <div className="flex flex-wrap gap-2 mb-2">
          <Link to="/pointage"><Btn variant="secondary" icon={Clock}>{t('pages.attendance')}</Btn></Link>
          <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.export')}</Btn>
          <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
        </div>
      )}

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={isAll ? t('tabs.personnel') : isChauffeur ? t('pages.drivers') : t('tabs.workers')} value={stats.totalWorkers} icon={Users} tone="violet" delta={t('msg.withPointage', { count: stats.withPointage })} deltaTone="muted" />
        <KpiCard
          title={t('kpi.grossPayroll')}
          value={formatMadCompact(stats.totalBrut)}
          icon={TrendingUp}
          tone="emerald"
          compact
          delta={t('msg.bonusesDelta', { amount: formatMadCompact(stats.totalBonuses) })}
          deltaTone="muted"
        />
        <KpiCard
          title={t('kpi.netPayroll')}
          value={formatMadCompact(stats.totalNet)}
          icon={Wallet}
          tone="coral"
          compact
          delta={t('msg.advancesDelta', { amount: formatMadCompact(stats.totalAdvances) })}
          deltaTone="muted"
        />
        <KpiCard
          title={t('columns.paid')}
          value={formatMadCompact(stats.totalPaid)}
          icon={Banknote}
          tone="emerald"
          compact
          delta={t('msg.remainingDelta', { amount: formatMadCompact(stats.totalRemaining) })}
          deltaTone="muted"
        />
      </div>

      <Card className="mb-4">
        <Tabs mac active={payFilter} onChange={(id) => switchPayFilter(id as PayFilter)} tabs={PAY_TABS} />
      </Card>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchWorker')}
            />
            <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0" />
            <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0" />
            <div className="flex items-center gap-1 shrink-0">
              <MacSelect
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'lastName', label: t('columns.name') },
                  { value: 'net', label: t('columns.net') },
                  { value: 'brut', label: t('columns.brut') },
                  { value: 'totalDays', label: t('fields.daysCount') },
                  { value: 'dailySalary', label: t('fields.dailySalaryShort') },
                ]}
                className="w-40"
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
                  {activeFilters.map((f) => (
                    <button
                      key={f.id || 'all-active'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${activeFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setActiveFilter(f.id);
                        setPage(1);
                        load(1, { active: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {activeFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  {categories.length > 0 && showCategory && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <p className="mac-filter-menu-section">{t('fields.category')}</p>
                      <button
                        type="button"
                        role="menuitem"
                        className={`mac-filter-menu-item${categoryFilter === '' ? ' mac-filter-menu-item-active' : ''}`}
                        onClick={() => {
                          setCategoryFilter('');
                          setPage(1);
                          load(1, { category: '' });
                        }}
                      >
                        <span>{t('msg.allFeminine')}</span>
                        {categoryFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                      </button>
                      {categories.map((c) => (
                        <button
                          key={c}
                          type="button"
                          role="menuitem"
                          className={`mac-filter-menu-item${categoryFilter === c ? ' mac-filter-menu-item-active' : ''}`}
                          onClick={() => {
                            setCategoryFilter(c);
                            setPage(1);
                            load(1, { category: c });
                          }}
                        >
                          <span>{c}</span>
                          {categoryFilter === c && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                        </button>
                      ))}
                    </>
                  )}
                  {chantiers.length > 0 && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <p className="mac-filter-menu-section">{t('fields.chantier')}</p>
                      <button
                        type="button"
                        role="menuitem"
                        className={`mac-filter-menu-item${chantierFilter === '' ? ' mac-filter-menu-item-active' : ''}`}
                        onClick={() => {
                          setChantierFilter('');
                          setPage(1);
                          load(1, { chantierId: '' });
                        }}
                      >
                        <span>{t('common.all')}</span>
                        {chantierFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                      </button>
                      {chantiers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          role="menuitem"
                          className={`mac-filter-menu-item${chantierFilter === c.id ? ' mac-filter-menu-item-active' : ''}`}
                          onClick={() => {
                            setChantierFilter(c.id);
                            setPage(1);
                            load(1, { chantierId: c.id });
                          }}
                        >
                          <span>{c.name}</span>
                          {chantierFilter === c.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                        </button>
                      ))}
                    </>
                  )}
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setActiveFilter('true');
                          setCategoryFilter('');
                          setChantierFilter('');
                          setPage(1);
                          load(1, { active: 'true', category: '', chantierId: '' });
                          setShowFilters(false);
                        }}
                      >
                        {t('settings.resetFilters')}
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
          <EmptyState title={isAll ? t('msg.noneFound') : isChauffeur ? t('msg.emptyDrivers') : t('msg.emptyWorkers')} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{personLabel}</Th>
                {showCategory && <Th mac>{t('columns.category')}</Th>}
                <Th mac>{t('columns.mode')}</Th>
                <Th mac>{t('columns.salary')}</Th>
                <Th mac>{t('columns.workDays')}</Th>
                <Th mac>{t('columns.brut')}</Th>
                <Th mac>{t('columns.bonuses')}</Th>
                <Th mac>{t('columns.advances')}</Th>
                <Th mac>{t('columns.netDue')}</Th>
                <Th mac>{t('columns.paid')}</Th>
                <Th mac>{t('columns.remaining')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac>{t('columns.pointageShort')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const isMois = r.salaryPeriod === 'mois' || r.salary?.salaryPeriod === 'mois';
                return (
                <tr key={r.id} className="cursor-pointer" onClick={() => openDetail(r)}>
                  <Td mac>
                    <Link to={workforceDetailPathForCategory(r.category, r.id)} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>
                      {r.firstName} {r.lastName}
                    </Link>
                    {r.chantier && <span className="block text-[10px] text-gic-muted">{r.chantier.name}</span>}
                    {isMois && r.bankName && (
                      <span className="block text-[10px] text-gic-muted">{r.bankName}{r.rib ? ` · ${r.rib}` : ''}</span>
                    )}
                  </Td>
                  {!showCategory ? null : <Td mac>{r.category || '—'}</Td>}
                  <Td mac>
                    <span className={`mac-chip ${isMois ? 'mac-chip-violet' : 'mac-chip-blue'}`}>
                      {isMois ? t('columns.month') : t('msg.periodDay')}
                    </span>
                  </Td>
                  <Td mac>{formatMad(isMois ? (r.monthlySalary || r.salary.brut) : r.dailySalary)}</Td>
                  <Td mac>{isMois ? '—' : r.salary.totalDays.toFixed(2)}</Td>
                  <Td mac className="text-gic-emerald">{formatMad(r.salary.brut)}</Td>
                  <Td mac>{formatMad(r.salary.bonuses)}</Td>
                  <Td mac className="text-gic-coral">{formatMad(r.salary.advances)}</Td>
                  <Td mac className="font-semibold">{formatMad(r.salary.netDue)}</Td>
                  <Td mac className="text-gic-emerald">{formatMad(r.salary.amountPaid)}</Td>
                  <Td mac>{r.salary.remaining > 0 ? formatMad(r.salary.remaining) : '—'}</Td>
                  <Td mac><StatusPill status={r.salary.status} quiet /></Td>
                  <Td mac>
                    <span className="mac-chip mac-chip-blue">{isMois ? '—' : r.salary.pointageCount}</span>
                  </Td>
                  <Td mac className="mac-td-actions">
                    <div className="mac-actions">
                      {r.salary.netDue > 0 && r.salary.remaining > 0 && (
                        <Btn
                          variant="secondary"
                          icon={Banknote}
                          className="!py-1 !px-2 !text-[11px] !h-7 !bg-gic-emerald-soft !text-gic-emerald hover:!bg-emerald-100 !border !border-gic-emerald/30"
                          onClick={(e) => { e.stopPropagation(); openPay(r, e); }}
                        >
                          {t('actions.pay')}
                        </Btn>
                      )}
                      <MacActionBtn
                        icon={Eye}
                        tone="blue"
                        title={t('msg.calcDetail')}
                        onClick={(e) => { e.stopPropagation(); openDetail(r); }}
                      />
                    </div>
                  </Td>
                </tr>
              );
              })}
            </tbody>
          </TableWrap>
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => load(p)} mac />
      </Card>

      <Modal
        open={!!payOpen}
        title={isChauffeur ? t('pages.disbursementDriver') : isAll ? t('pages.disbursementSalary') : t('pages.disbursementWorkforce')}
        onClose={() => setPayOpen(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPayOpen(null)}>{t('common.cancel')}</Btn>
            <Btn form="pay-mo-form" type="submit" disabled={payLoading}>{payLoading ? t('common.inProgress') : t('actions.confirmPayment')}</Btn>
          </>
        }
      >
        {payOpen && (
          <form id="pay-mo-form" onSubmit={confirmPay} className="space-y-3">
            <p className="text-[12px] text-gic-muted">
              {t('msg.netDuePerson', { name: `${payOpen.firstName} ${payOpen.lastName}`, amount: formatMad(payOpen.salary.netDue) })}
              {payOpen.salary.amountPaid > 0 && ` · ${t('msg.alreadyPaid', { amount: formatMad(payOpen.salary.amountPaid) })}`}
            </p>
            <Input label={t('fields.amountMad')} type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
            <Select label={t('fields.mode')} value={payMode} onChange={(e) => setPayMode(e.target.value)}>
              <option value="especes">{t('fields.modeCash')}</option>
              <option value="virement">{t('fields.modeTransfer')}</option>
              <option value="cheque">{t('fields.modeCheck')}</option>
            </Select>
            <p className="text-[11px] text-gic-muted">{t('msg.debitBalanceHint')}</p>
          </form>
        )}
      </Modal>
    </div>
  );
}
