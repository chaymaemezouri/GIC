import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Pencil, Users, Download, Printer, Eye, SlidersHorizontal, Check,
  ArrowUp, ArrowDown, UserCheck, Wallet, BadgeCheck, Link2,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, formatMad, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import {
  InternalStaffFormFields, emptyInternalStaffForm, staffFormToBody,
} from '../components/InternalStaffFormFields';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { roleLabel } from '../lib/permissions';
import { useI18n } from '../i18n/I18nContext';

type StaffRow = {
  id: string;
  reference?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  monthlySalary?: number;
  declared?: boolean;
  isActive: boolean;
  user?: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
    twoFactorEnabled?: boolean;
    lastLoginAt?: string | null;
  } | null;
};

type Stats = {
  total: number;
  actifs: number;
  inactifs: number;
  declared?: number;
  withAccount?: number;
  payrollTotal?: number;
  avgSalary?: number;
};

const PAGE_SIZE = 20;
type SortOrder = 'asc' | 'desc';

export default function EquipeInternePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<StaffRow[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, actifs: 0, inactifs: 0 });
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [activeFilter, setActiveFilter] = useState(searchParams.get('active') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'lastName');
  const [order, setOrder] = useState<SortOrder>((searchParams.get('order') as SortOrder) || 'asc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyInternalStaffForm());
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildStatsQuery() {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (activeFilter) qs.set('active', activeFilter);
    return qs.toString();
  }

  function buildQuery(
    pageNum = page,
    overrides?: { active?: string; sort?: string; order?: SortOrder },
  ) {
    const qs = new URLSearchParams();
    const active = overrides?.active !== undefined ? overrides.active : activeFilter;
    const sortVal = overrides?.sort !== undefined ? overrides.sort : sort;
    const orderVal = overrides?.order !== undefined ? overrides.order : order;
    if (q) qs.set('q', q);
    if (active) qs.set('active', active);
    qs.set('sort', sortVal);
    qs.set('order', orderVal);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function syncUrl(pageNum = page) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (activeFilter) qs.set('active', activeFilter);
    if (sort !== 'lastName') qs.set('sort', sort);
    if (order !== 'asc') qs.set('order', order);
    if (pageNum > 1) qs.set('page', String(pageNum));
    setSearchParams(qs, { replace: true });
  }

  function load(
    pageNum = page,
    overrides?: { active?: string; sort?: string; order?: SortOrder },
  ) {
    setLoading(true);
    setError('');
    const statsQs = buildStatsQuery();
    Promise.all([
      api<PaginatedResponse<StaffRow>>(`/equipe-interne?${buildQuery(pageNum, overrides)}`),
      api<Stats>(`/equipe-interne/stats?${statsQs}`),
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
    setForm(emptyInternalStaffForm());
    setFormError('');
    setOpen(true);
  }

  useCreateQuery(openCreate);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    try {
      await api('/equipe-interne', {
        method: 'POST',
        body: JSON.stringify(staffFormToBody(form)),
      });
      setOpen(false);
      load(1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function exportCsv() {
    downloadCsv(`/equipe-interne/export/csv?${buildStatsQuery()}`, 'equipe-interne-gic.csv');
  }

  function exportExcel() {
    downloadExcel(`/equipe-interne/export/xlsx?${buildStatsQuery()}`, 'equipe-interne-gic.xlsx');
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><body style="font-family:sans-serif;padding:24px;font-size:12px">
      <h1>${t('pages.internalTeam')} — GIC</h1>
      <p>${stats.total} collaborateur(s) · ${stats.actifs} actifs</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
        <tr><th>${t('columns.name')}</th><th>${t('columns.function')}</th><th>${t('columns.salary')}</th><th>${t('columns.account')}</th><th>${t('columns.status')}</th></tr>
        ${items.map((s) => `<tr>
          <td>${s.firstName} ${s.lastName}</td>
          <td>${s.jobTitle || '—'}</td>
          <td>${s.monthlySalary ?? 0} MAD</td>
          <td>${s.user ? t('common.yes') : t('common.no')}</td>
          <td>${s.isActive ? t('status.active') : t('status.inactive')}</td>
        </tr>`).join('')}
      </table>
    </body></html>`);
    w.document.close();
    w.print();
  }

  const hasActiveFilters = !!activeFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.internalTeam')}
        subtitle={t('pages.internalTeamSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={exportExcel}>{t('common.excel')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newCollaborator')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('kpi.collaborators')} value={stats.total} icon={Users} tone="violet" />
        <KpiCard title={t('kpi.active')} value={stats.actifs} icon={UserCheck} tone="emerald" />
        <KpiCard title={t('kpi.payroll')} value={formatMad(stats.payrollTotal)} icon={Wallet} tone="amber" delta={`Moy. ${formatMad(stats.avgSalary)}`} deltaTone="muted" compact />
        <KpiCard title={t('kpi.platformAccounts')} value={stats.withAccount ?? 0} icon={Link2} tone="teal" delta={`${stats.declared ?? 0} CNSS`} deltaTone="muted" compact />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchNameFunctionRefPhone')}
            />
            <MacSelect
              value={sort}
              onChange={(v) => {
                setSort(v);
                setPage(1);
                load(1, { sort: v });
              }}
              options={[
                { value: 'lastName', label: t('common.name') },
                { value: 'firstName', label: t('fields.firstName') },
                { value: 'jobTitle', label: t('fields.function') },
                { value: 'department', label: t('fields.serviceField') },
                { value: 'monthlySalary', label: t('fields.salary') },
                { value: 'createdAt', label: t('msg.dateCreated') },
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
                  <p className="mac-filter-menu-section">Statut RH</p>
                  {[
                    { id: '', label: t('common.all') },
                    { id: 'true', label: t('kpi.active') },
                    { id: 'false', label: t('common.inactivePlural') },
                  ].map((f) => (
                    <button
                      key={f.id || 'all-status'}
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
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setActiveFilter('');
                          setPage(1);
                          load(1, { active: '' });
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
          <EmptyState title={t('msg.emptyCollaborators')} action={<Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.collaborator')}</Th>
                <Th mac>{t('columns.function')}</Th>
                <Th mac>{t('columns.salary')}</Th>
                <Th mac>{t('columns.platformAccount')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/equipe-interne/${s.id}`)}
                >
                  <Td mac className="font-medium">
                    <p>{s.firstName} {s.lastName}</p>
                    <p className="text-[10px] text-gic-muted font-normal">{s.reference || s.email || '—'}</p>
                  </Td>
                  <Td mac className="text-[11px]">
                    <p>{s.jobTitle || '—'}</p>
                    {s.department && <p className="text-[10px] text-gic-muted">{s.department}</p>}
                  </Td>
                  <Td mac className="tabular-nums text-[11px]">
                    {formatMad(s.monthlySalary)}
                    {s.declared && <span className="block text-[10px] text-gic-emerald">CNSS</span>}
                  </Td>
                  <Td mac className="text-[11px]">
                    {s.user ? (
                      <span className="inline-flex items-center gap-1 text-gic-emerald">
                        <Link2 size={11} /> {roleLabel(s.user.role)}
                      </span>
                    ) : (
                      <span className="text-gic-muted">Aucun</span>
                    )}
                  </Td>
                  <Td mac>
                    <StatusPill status={s.isActive ? 'actif' : 'inactif'} quiet />
                  </Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <MacActionBtn icon={Eye} tone="blue" title={t('actions.viewFiche')} onClick={() => navigate(`/equipe-interne/${s.id}`)} />
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => navigate(`/equipe-interne/${s.id}`, { state: { edit: true } })} />
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
        title={t('actions.newCollaborator')}
        onClose={() => setOpen(false)}
        size="lg"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="staff-form" type="submit">{t('common.add')}</Btn>
          </>
        }
      >
        <form id="staff-form" onSubmit={save}>
          <InternalStaffFormFields form={form} setForm={setForm} />
          <p className="text-[11px] text-gic-muted mt-3">{t('msg.platformAccountOptionalHint')}</p>
          {formError && <p className="text-[11px] text-gic-coral mt-3">{formError}</p>}
        </form>
      </Modal>
    </div>
  );
}
