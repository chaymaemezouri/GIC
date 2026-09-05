import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Download, Printer, Eye, Wallet, Users, TrendingUp, Banknote, Shield,
  SlidersHorizontal, Check, ArrowUp, ArrowDown, Save, CheckCircle,
} from 'lucide-react';
import { api, downloadCsv, formatMad, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, StatusPill, TableWrap, Tabs, Td, Th,
} from '../components/ui';
import { computeStaffNet } from '../lib/staffSalaryPeriod';
import { useI18n } from '../i18n/I18nContext';

type SortOrder = 'asc' | 'desc';
type PageTab = 'saisie' | 'paiements';
type PayViewFilter = '' | 'validé' | 'payé';

type StaffSalaryRow = {
  id: string;
  reference?: string | null;
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  department?: string | null;
  monthlySalary: number;
  salaryPeriod: string;
  salaryPeriodLabel: string;
  salary: {
    recordId?: string | null;
    periodLabel: string;
    baseSalary: number;
    bonus: number;
    deduction: number;
    advance: number;
    brut: number;
    netDue: number;
    amountPaid: number;
    remaining: number;
    status: string;
    remark?: string | null;
  };
};

type Stats = {
  totalStaff: number;
  withRecord: number;
  totalBrut: number;
  totalNet: number;
  totalAdvances: number;
  totalBonuses: number;
  totalPaid: number;
  totalRemaining: number;
};

type RowDraft = {
  baseSalary: string;
  bonus: string;
  deduction: string;
  advance: string;
};

const PAGE_SIZE = 20;
const SAISIE_LIMIT = 500;
function formatMadCompact(n: number | null | undefined) {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M MAD`;
  if (v >= 10_000) return `${Math.round(v / 1_000).toLocaleString('fr-FR')} k MAD`;
  return formatMad(v);
}

function mapStatus(status: string) {
  if (status === 'pending') return 'en_cours';
  if (status === 'validé') return 'actif';
  return status || 'en_cours';
}

function cellInputClass(locked: boolean, width = 'w-20') {
  return `${width} rounded-lg border px-2 py-1 text-[11px] ${
    locked
      ? 'border-gic-border/60 bg-[#f5f5f7] text-gic-muted cursor-not-allowed'
      : 'border-gic-border bg-white'
  }`;
}

function rowDefaults(row: StaffSalaryRow): RowDraft {
  return {
    baseSalary: String(row.salary.baseSalary ?? ''),
    bonus: String(row.salary.bonus ?? 0),
    deduction: String(row.salary.deduction ?? 0),
    advance: String(row.salary.advance ?? 0),
  };
}

function rowNet(draft: RowDraft) {
  return computeStaffNet(
    Number(draft.baseSalary) || 0,
    Number(draft.bonus) || 0,
    Number(draft.deduction) || 0,
    Number(draft.advance) || 0,
  ).net;
}

function isLockedStatus(status: string) {
  return status === 'validé' || status === 'payé';
}

export default function SalairesEquipeInternePage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const MONTHS = [
    t('months.jan'), t('months.feb'), t('months.mar'), t('months.apr'),
    t('months.may'), t('months.jun'), t('months.jul'), t('months.aug'),
    t('months.sep'), t('months.oct'), t('months.nov'), t('months.dec'),
  ];
  const PAY_VIEW_TABS: { id: PayViewFilter; label: string }[] = [
    { id: '', label: t('common.all') },
    { id: 'validé', label: t('rental.toPay') },
    { id: 'payé', label: t('rental.paid') },
  ];
  const navigate = useNavigate();
  const now = new Date();
  const [pageTab, setPageTab] = useState<PageTab>('saisie');
  const [periodYear, setPeriodYear] = useState(String(now.getFullYear()));
  const [periodMonth, setPeriodMonth] = useState(String(now.getMonth() + 1));
  const [periodWeek, setPeriodWeek] = useState('0');
  const [items, setItems] = useState<StaffSalaryRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({
    totalStaff: 0, withRecord: 0, totalBrut: 0, totalNet: 0,
    totalAdvances: 0, totalBonuses: 0, totalPaid: 0, totalRemaining: 0,
  });
  const [q, setQ] = useState('');
  const [payViewFilter, setPayViewFilter] = useState<PayViewFilter>('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [activeFilter] = useState('true');
  const [sort, setSort] = useState('lastName');
  const [order, setOrder] = useState<SortOrder>('asc');
  const [departments, setDepartments] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [validating, setValidating] = useState(false);
  const [payOpen, setPayOpen] = useState<StaffSalaryRow | null>(null);
  const [payMode, setPayMode] = useState('virement');
  const [payLoading, setPayLoading] = useState(false);

  function buildQuery(pageNum = page, overrides?: {
    q?: string; status?: string; active?: string; department?: string;
    sort?: string; order?: SortOrder; limit?: number;
  }) {
    const qs = new URLSearchParams();
    qs.set('periodYear', periodYear);
    qs.set('periodMonth', periodMonth);
    qs.set('periodWeek', periodWeek);
    if (overrides?.q ?? q) qs.set('q', overrides?.q ?? q);
    const st = overrides?.status ?? payViewFilter;
    if (st) qs.set('status', st);
    const act = overrides?.active ?? activeFilter;
    if (act) qs.set('active', act);
    const dept = overrides?.department ?? departmentFilter;
    if (dept) qs.set('department', dept);
    qs.set('sort', overrides?.sort ?? sort);
    qs.set('order', overrides?.order ?? order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(overrides?.limit ?? (pageTab === 'saisie' ? SAISIE_LIMIT : PAGE_SIZE)));
    return qs;
  }

  function buildStatsQuery() {
    const qs = new URLSearchParams();
    qs.set('periodYear', periodYear);
    qs.set('periodMonth', periodMonth);
    qs.set('periodWeek', periodWeek);
    if (q) qs.set('q', q);
    if (activeFilter) qs.set('active', activeFilter);
    if (departmentFilter) qs.set('department', departmentFilter);
    return qs;
  }

  function load(pageNum = page, overrides?: Parameters<typeof buildQuery>[1]) {
    setLoading(true);
    setError('');
    Promise.all([
      api<PaginatedResponse<StaffSalaryRow>>(`/equipe-interne/salaires?${buildQuery(pageNum, overrides)}`),
      api<Stats>(`/equipe-interne/salaires/stats?${buildStatsQuery()}`),
    ])
      .then(([res, st]) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        setStats(st);
        setRows(Object.fromEntries(res.items.map((r) => [r.id, rowDefaults(r)])));
        const deps = [...new Set(res.items.map((r) => r.department).filter(Boolean))] as string[];
        if (deps.length) setDepartments((prev) => [...new Set([...prev, ...deps])]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('msg.serverError')))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(1); }, []);

  useEffect(() => {
    load(1);
    setPage(1);
  }, [sort, order, pageTab]);

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

  function getRow(id: string, fallback: StaffSalaryRow) {
    return rows[id] ?? rowDefaults(fallback);
  }

  function setRow(id: string, patch: Partial<RowDraft>) {
    setRows((prev) => ({ ...prev, [id]: { ...getRow(id, items.find((x) => x.id === id)!), ...patch } }));
  }

  function toggleOrder() {
    setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
  }

  function openDetail(row: StaffSalaryRow) {
    navigate(`/equipe-interne/${row.id}?tab=salaire`);
  }

  function openPay(row: StaffSalaryRow, e?: React.MouseEvent) {
    e?.stopPropagation();
    setPayOpen(row);
    setPayMode('virement');
  }

  async function saveRows(staffIds: string[]) {
    const payload = staffIds.map((staffId) => {
      const item = items.find((x) => x.id === staffId);
      if (!item) return null;
      const r = getRow(staffId, item);
      return {
        staffId,
        baseSalary: Number(r.baseSalary) || 0,
        bonus: Number(r.bonus) || 0,
        deduction: Number(r.deduction) || 0,
        advance: Number(r.advance) || 0,
      };
    }).filter(Boolean);

    return api<{ saved: number; skipped: number; errors: string[] }>('/equipe-interne/salaires/save', {
      method: 'POST',
      body: JSON.stringify({
        periodYear: Number(periodYear),
        periodMonth: Number(periodMonth),
        periodWeek: Number(periodWeek),
        rows: payload,
      }),
    });
  }

  async function saveOne(staffId: string) {
    setSavingId(staffId);
    try {
      await saveRows([staffId]);
      load(pageTab === 'saisie' ? 1 : page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.saveError'));
    } finally {
      setSavingId(null);
    }
  }

  async function saveAll() {
    const editable = items.filter((r) => !isLockedStatus(r.salary.status));
    if (!editable.length) return;
    setSavingAll(true);
    try {
      const res = await saveRows(editable.map((r) => r.id));
      if (res.errors?.length) await appAlert(res.errors.join('\n'));
      load(1);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.saveError'));
    } finally {
      setSavingAll(false);
    }
  }

  async function validateAll() {
    const brouillons = items.filter((r) => r.salary.status === 'brouillon');
    if (!brouillons.length) {
      await appAlert(t('msg.saveDraftsFirst'));
      return;
    }
    if (!await appConfirm(t('msg.confirmValidateBulletins', { count: brouillons.length, period: periodLabel }))) return;
    setValidating(true);
    try {
      await api('/equipe-interne/salaires/validate', {
        method: 'POST',
        body: JSON.stringify({
          periodYear: Number(periodYear),
          periodMonth: Number(periodMonth),
          periodWeek: Number(periodWeek),
        }),
      });
      load(pageTab === 'saisie' ? 1 : page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.validateError'));
    } finally {
      setValidating(false);
    }
  }

  async function validateOne(staffId: string) {
    setSavingId(staffId);
    try {
      await api('/equipe-interne/salaires/validate', {
        method: 'POST',
        body: JSON.stringify({
          periodYear: Number(periodYear),
          periodMonth: Number(periodMonth),
          periodWeek: Number(periodWeek),
          staffIds: [staffId],
        }),
      });
      load(pageTab === 'saisie' ? 1 : page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.validateError'));
    } finally {
      setSavingId(null);
    }
  }

  async function confirmPay(e: React.FormEvent) {
    e.preventDefault();
    if (!payOpen) return;
    setPayLoading(true);
    try {
      await api(`/equipe-interne/salaires/${payOpen.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          periodYear: Number(periodYear),
          periodMonth: Number(periodMonth),
          periodWeek: Number(periodWeek),
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

  function exportCsv() {
    downloadCsv(`/equipe-interne/salaires/export/csv?${buildStatsQuery()}`, 'salaires-equipe-interne-gic.csv');
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${t('pages.salariesInternal')} — GIC</title></head><body>
      <h1>${t('pages.salariesInternal')} — GIC</h1>
      <p>${t('fields.period')} : ${periodLabel}</p>
      <p>${t('columns.net')} : ${formatMad(stats.totalNet)} · ${t('columns.paid')} : ${formatMad(stats.totalPaid)} · ${t('columns.remaining')} : ${formatMad(stats.totalRemaining)}</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.collaborator')}</th><th>${t('columns.service')}</th><th>${t('columns.base')}</th><th>${t('columns.bonuses')}</th><th>${t('columns.advances')}</th><th>${t('columns.netDue')}</th><th>${t('columns.paid')}</th><th>${t('columns.status')}</th></tr>
        ${items.map((r) => `<tr>
          <td>${r.firstName} ${r.lastName}</td>
          <td>${r.department || '—'}</td>
          <td>${r.salary.baseSalary}</td>
          <td>${r.salary.bonus}</td>
          <td>${r.salary.advance}</td>
          <td>${r.salary.netDue}</td>
          <td>${r.salary.amountPaid}</td>
          <td>${r.salary.status}</td>
        </tr>`).join('')}
      </table>
    </body></html>`);
    w.document.close();
    w.print();
  }

  function switchPayView(next: PayViewFilter) {
    setPayViewFilter(next);
    setPage(1);
    load(1, { status: next });
  }

  const hasActiveFilters = activeFilter !== 'true' || !!departmentFilter;
  const periodLabel = `${MONTHS[Number(periodMonth) - 1]} ${periodYear}`;
  const editableItems = items.filter((r) => !isLockedStatus(r.salary.status));
  const validatedItems = items.filter((r) => r.salary.status === 'validé');
  const displayItems = items;

  const periodToolbar = (
    <>
      <MacSelect
        value={periodMonth}
        onChange={setPeriodMonth}
        options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
        className="w-32 shrink-0"
      />
      <MacSelect
        value={periodYear}
        onChange={setPeriodYear}
        options={[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => ({
          value: String(y),
          label: String(y),
        }))}
        className="w-24 shrink-0"
      />
      <MacSelect
        value={periodWeek}
        onChange={setPeriodWeek}
        options={[
          { value: '0', label: t('msg.wholeMonth') },
          { value: '1', label: t('msg.weekQ1') },
          { value: '2', label: t('msg.weekQ2') },
          { value: '3', label: t('msg.week3') },
          { value: '4', label: t('msg.week4') },
        ]}
        className="w-28 shrink-0"
      />
      <Btn variant="secondary" onClick={() => { setPage(1); load(1); }}>{t('actions.applyPeriod')}</Btn>
    </>
  );

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-0'}>
      {!embedded && (
        <PageHeader
          mac
          title={t('pages.salariesInternal')}
          subtitle={t('pages.salariesInternalSubtitle')}
          actions={
            <>
              <Link to="/equipe-interne"><Btn variant="secondary" icon={Shield}>{t('kpi.collaborators')}</Btn></Link>
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
          <Link to="/equipe-interne"><Btn variant="secondary" icon={Shield}>{t('kpi.collaborators')}</Btn></Link>
          <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.export')}</Btn>
          <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
        </div>
      )}

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('kpi.collaborators')} value={stats.totalStaff} icon={Users} tone="violet" delta={t('msg.withBulletin', { count: stats.withRecord })} deltaTone="muted" />
        <KpiCard title={t('kpi.grossPayroll')} value={formatMadCompact(stats.totalBrut)} icon={TrendingUp} tone="emerald" compact delta={t('msg.bonusesDelta', { amount: formatMadCompact(stats.totalBonuses) })} deltaTone="muted" />
        <KpiCard title={t('kpi.netPayroll')} value={formatMadCompact(stats.totalNet)} icon={Wallet} tone="coral" compact delta={t('msg.advancesDelta', { amount: formatMadCompact(stats.totalAdvances) })} deltaTone="muted" />
        <KpiCard title={t('columns.paid')} value={formatMadCompact(stats.totalPaid)} icon={Banknote} tone="emerald" compact delta={t('msg.remainingDelta', { amount: formatMadCompact(stats.totalRemaining) })} deltaTone="muted" />
      </div>

      <Card className="mb-4">
        <Tabs mac active={payViewFilter} onChange={(id) => switchPayView(id as PayViewFilter)} tabs={PAY_VIEW_TABS} />
      </Card>

      <Card className="mb-4">
        <Tabs
          mac
          active={pageTab}
          onChange={(id) => setPageTab(id as PageTab)}
          tabs={[
            { id: 'saisie', label: t('tabs.monthEntry') },
            { id: 'paiements', label: t('tabs.validatePay') },
          ]}
        />
      </Card>

      {error && (
        <Card className="mb-4 border-gic-coral/40 bg-gic-coral-soft/30">
          <p className="text-[12px] text-gic-coral font-medium">{error}</p>
          <Btn variant="secondary" className="mt-2" onClick={() => load(page)}>{t('common.retry')}</Btn>
        </Card>
      )}

      {pageTab === 'saisie' && (
        <>
          <div className="mac-filters-panel">
            <div className="mac-filters-row mac-filters-row-between">
              <div className="mac-filters-toolbar flex-wrap">
                <MacSearch value={q} onChange={setQ} onSubmit={() => load(1)} placeholder={t('msg.searchCollaborator')} />
                {periodToolbar}
              </div>
              <div className="mac-filters-actions">
                <Btn icon={Save} variant="secondary" onClick={saveAll} disabled={loading || savingAll || !editableItems.length}>
                  {savingAll ? t('auth.saving') : t('actions.saveAll')}
                </Btn>
                <Btn icon={CheckCircle} onClick={validateAll} disabled={loading || validating || !items.some((r) => r.salary.status === 'brouillon')}>
                  {validating ? t('msg.validating') : t('actions.validateAll')}
                </Btn>
              </div>
            </div>
          </div>

          <Card padding={false}>
            {loading ? (
              <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
            ) : items.length === 0 ? (
              <EmptyState title={t('msg.emptyCollaborators')} />
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.collaborator')}</Th>
                    <Th mac>{t('columns.service')}</Th>
                    <Th mac>{t('columns.base')}</Th>
                    <Th mac>{t('columns.bonuses')}</Th>
                    <Th mac>{t('columns.deductions')}</Th>
                    <Th mac>{t('columns.advances')}</Th>
                    <Th mac>{t('columns.netAuto')}</Th>
                    <Th mac>{t('columns.status')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => {
                    const draft = getRow(r.id, r);
                    const locked = isLockedStatus(r.salary.status);
                    const net = rowNet(draft);
                    return (
                      <tr key={r.id} className={r.salary.status === 'validé' ? 'bg-gic-emerald-soft/15' : r.salary.status === 'payé' ? 'bg-gray-50/80' : ''}>
                        <Td mac>
                          <Link to={`/equipe-interne/${r.id}`} className="mac-table-ref">{r.firstName} {r.lastName}</Link>
                          <span className="block text-[10px] text-gic-muted">{r.jobTitle || '—'} · {r.salaryPeriodLabel}</span>
                        </Td>
                        <Td mac className="mac-table-muted">{r.department || '—'}</Td>
                        <Td mac>
                          <input className={cellInputClass(locked)} readOnly={locked} value={draft.baseSalary} onChange={(e) => setRow(r.id, { baseSalary: e.target.value })} />
                        </Td>
                        <Td mac>
                          <input className={cellInputClass(locked)} readOnly={locked} value={draft.bonus} onChange={(e) => setRow(r.id, { bonus: e.target.value })} />
                        </Td>
                        <Td mac>
                          <input className={cellInputClass(locked)} readOnly={locked} value={draft.deduction} onChange={(e) => setRow(r.id, { deduction: e.target.value })} />
                        </Td>
                        <Td mac>
                          <input className={cellInputClass(locked)} readOnly={locked} value={draft.advance} onChange={(e) => setRow(r.id, { advance: e.target.value })} />
                        </Td>
                        <Td mac className="font-semibold">{formatMad(net)}</Td>
                        <Td mac><StatusPill status={mapStatus(r.salary.status)} quiet /></Td>
                        <Td mac className="mac-td-actions">
                          <div className="mac-actions">
                            {!locked && (
                              <>
                                <MacActionBtn icon={Save} tone="blue" title={t('common.save')} disabled={savingId === r.id} onClick={() => saveOne(r.id)} />
                                {r.salary.status === 'brouillon' && (
                                  <MacActionBtn icon={CheckCircle} tone="green" title={t('actions.validate')} disabled={savingId === r.id} onClick={() => validateOne(r.id)} />
                                )}
                              </>
                            )}
                            {r.salary.status === 'validé' && (
                              <Btn
                                variant="secondary"
                                icon={Banknote}
                                className="!py-1 !px-2 !text-[11px] !h-7 !bg-gic-emerald-soft !text-gic-emerald hover:!bg-emerald-100 !border !border-gic-emerald/30"
                                onClick={(e) => { e.stopPropagation(); openPay(r, e); }}
                              >
                                {t('actions.pay')}
                              </Btn>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </Card>
          <p className="text-[11px] text-gic-muted px-1 mt-2">
            {t('msg.payrollWorkflowHint')}
          </p>
        </>
      )}

      {pageTab === 'paiements' && (
        <>
          <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
            <div className="mac-filters-row">
              <div className="mac-filters-toolbar">
                <MacSearch value={q} onChange={setQ} onSubmit={() => { setPage(1); load(1); }} placeholder={t('msg.searchCollaborator')} />
                {periodToolbar}
                <div className="flex items-center gap-1 shrink-0">
                  <MacSelect value={sort} onChange={setSort} options={[
                    { value: 'lastName', label: t('columns.name') },
                    { value: 'department', label: t('columns.service') },
                    { value: 'monthlySalary', label: t('fields.refSalary') },
                  ]} className="w-40" />
                  <MacActionBtn icon={order === 'asc' ? ArrowUp : ArrowDown} tone="gray" title={order === 'asc' ? t('msg.ascending') : t('msg.descending')} onClick={toggleOrder} />
                </div>
                <div ref={filtersRef} className="relative shrink-0 z-50">
                  <Btn variant="secondary" icon={SlidersHorizontal} className={`!px-2 !py-2 relative${hasActiveFilters ? ' ring-1 ring-[#007aff]/40' : ''}`} onClick={() => setShowFilters((v) => !v)}>
                    {hasActiveFilters && <span className="mac-filter-dot" aria-hidden />}
                  </Btn>
                  {showFilters && (
                    <div className="mac-filter-menu" role="menu">
                      {departments.length > 0 && (
                        <>
                          <p className="mac-filter-menu-section">{t('columns.service')}</p>
                          <button type="button" role="menuitem" className={`mac-filter-menu-item${departmentFilter === '' ? ' mac-filter-menu-item-active' : ''}`} onClick={() => { setDepartmentFilter(''); setPage(1); load(1, { department: '' }); }}>
                            <span>{t('common.all')}</span>
                            {departmentFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                          </button>
                          {departments.map((d) => (
                            <button key={d} type="button" role="menuitem" className={`mac-filter-menu-item${departmentFilter === d ? ' mac-filter-menu-item-active' : ''}`} onClick={() => { setDepartmentFilter(d); setPage(1); load(1, { department: d }); }}>
                              <span>{d}</span>
                              {departmentFilter === d && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {validatedItems.length > 0 && (
            <Card className="mb-4 border-gic-emerald/30 bg-gic-emerald-soft/20">
              <p className="text-[12px] text-gic-muted">
                {t('msg.validatedReadyPay', { count: validatedItems.length })}
              </p>
            </Card>
          )}

          <Card padding={false}>
            {loading ? (
              <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
            ) : displayItems.length === 0 ? (
              <EmptyState title={t('msg.emptyBulletinsFilter')} />
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.collaborator')}</Th>
                    <Th mac>{t('columns.service')}</Th>
                    <Th mac>{t('columns.period')}</Th>
                    <Th mac>{t('columns.base')}</Th>
                    <Th mac>{t('columns.bonuses')}</Th>
                    <Th mac>{t('columns.deductions')}</Th>
                    <Th mac>{t('columns.advances')}</Th>
                    <Th mac>{t('columns.netDue')}</Th>
                    <Th mac>{t('columns.paid')}</Th>
                    <Th mac>{t('columns.status')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((r) => (
                    <tr key={r.id} className="cursor-pointer" onClick={() => openDetail(r)}>
                      <Td mac>
                        <Link to={`/equipe-interne/${r.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{r.firstName} {r.lastName}</Link>
                        <span className="block text-[10px] text-gic-muted">{r.jobTitle || '—'}</span>
                      </Td>
                      <Td mac>{r.department || '—'}</Td>
                      <Td mac><span className="text-[11px]">{r.salary.periodLabel}</span></Td>
                      <Td mac>{formatMad(r.salary.baseSalary)}</Td>
                      <Td mac>{formatMad(r.salary.bonus)}</Td>
                      <Td mac>{formatMad(r.salary.deduction)}</Td>
                      <Td mac className="text-gic-coral">{formatMad(r.salary.advance)}</Td>
                      <Td mac className="font-semibold">{formatMad(r.salary.netDue)}</Td>
                      <Td mac className="text-gic-emerald">{formatMad(r.salary.amountPaid)}</Td>
                      <Td mac><StatusPill status={mapStatus(r.salary.status)} quiet /></Td>
                      <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="mac-actions">
                          {r.salary.status === 'validé' && (
                            <Btn
                              variant="secondary"
                              icon={Banknote}
                              className="!py-1 !px-2 !text-[11px] !h-7 !bg-gic-emerald-soft !text-gic-emerald hover:!bg-emerald-100 !border !border-gic-emerald/30"
                              onClick={(e) => { e.stopPropagation(); openPay(r, e); }}
                            >
                              {t('actions.pay')}
                            </Btn>
                          )}
                          <MacActionBtn icon={Eye} tone="blue" title={t('actions.openFiche')} onClick={() => openDetail(r)} />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
            {pageTab === 'paiements' && (
              <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => load(p)} mac />
            )}
          </Card>
        </>
      )}

      <Modal
        open={!!payOpen}
        title={t('actions.confirmPayment')}
        onClose={() => setPayOpen(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPayOpen(null)}>{t('common.cancel')}</Btn>
            <Btn form="pay-ei-form" type="submit" disabled={payLoading}>{payLoading ? t('common.inProgress') : t('actions.confirmPayment')}</Btn>
          </>
        }
      >
        {payOpen && (
          <form id="pay-ei-form" onSubmit={confirmPay} className="space-y-3">
            <p className="text-[12px] font-medium">{payOpen.firstName} {payOpen.lastName}</p>
            <p className="text-[11px] text-gic-muted">{periodLabel} · {payOpen.salary.periodLabel}</p>
            <div className="rounded-xl bg-gray-50 px-3 py-2 text-[12px] space-y-1">
              <p>{t('msg.payBreakdown', { base: formatMad(payOpen.salary.baseSalary), bonus: formatMad(payOpen.salary.bonus), deduction: formatMad(payOpen.salary.deduction), advance: formatMad(payOpen.salary.advance) })}</p>
              <p className="font-semibold text-gic-violet">{t('msg.netToPayLabel')} {formatMad(payOpen.salary.netDue)}</p>
            </div>
            <Select label={t('fields.settlementMode')} value={payMode} onChange={(e) => setPayMode(e.target.value)}>
              <option value="virement">{t('fields.modeTransfer')}</option>
              <option value="especes">{t('fields.modeCash')}</option>
              <option value="cheque">{t('fields.modeCheck')}</option>
            </Select>
            <p className="text-[11px] text-gic-muted">{t('msg.payReuseHint')}</p>
          </form>
        )}
      </Modal>
    </div>
  );
}
