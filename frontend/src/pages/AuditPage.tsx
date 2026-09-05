import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Download, Printer, Eye, Shield, Activity, Calendar, Users,
  SlidersHorizontal, Check, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  PageHeader, Pagination, TableWrap, Td, Th,
} from '../components/ui';
import { ActionBadge, AUDIT_ACTION_FILTERS, auditActionLabel, auditEntityLabel, auditEntityLink, formatAuditDateTime } from '../lib/auditDisplay';
import { useI18n } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';

type AuditLog = {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string; email?: string } | null;
};

type Stats = {
  total: number;
  today: number;
  week: number;
  usersCount: number;
  entities: { id: string; count: number }[];
  actions: { id: string; count: number }[];
};

type UserOption = { id: string; firstName: string; lastName: string; email: string };

const PAGE_SIZE = 25;
type SortOrder = 'asc' | 'desc';

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function auditActionFilterLabel(id: string, t: TranslateFn): string {
  const map: Record<string, string> = {
    '': t('msg.auditFilterAll'),
    création: t('msg.auditFilterCreate'),
    modification: t('msg.auditFilterUpdate'),
    suppression: t('msg.auditFilterDelete'),
    connexion: t('msg.auditFilterLogin'),
    upload: t('msg.auditFilterUpload'),
    import: t('msg.auditFilterImport'),
    paie: t('msg.auditFilterPayroll'),
    workflow: t('msg.auditFilterWorkflow'),
    archivage: t('msg.auditFilterArchive'),
    résiliation: t('msg.auditFilterTerminate'),
    affectation: t('msg.auditFilterAssign'),
    pointage: t('msg.auditFilterAttendance'),
    sécurité: t('msg.auditFilterSecurity'),
    notification: t('msg.auditFilterNotifications'),
  };
  return map[id] ?? AUDIT_ACTION_FILTERS.find((f) => f.id === id)?.label ?? id;
}

export default function AuditPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, today: 0, week: 0, usersCount: 0, entities: [], actions: [] });
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [actionFilter, setActionFilter] = useState(searchParams.get('action') || '');
  const [entityFilter, setEntityFilter] = useState(searchParams.get('entity') || '');
  const [userFilter, setUserFilter] = useState(searchParams.get('userId') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || monthStartISO());
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || new Date().toISOString().slice(0, 10));
  const [sort, setSort] = useState(searchParams.get('sort') || 'createdAt');
  const [order, setOrder] = useState<SortOrder>((searchParams.get('order') as SortOrder) || 'desc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildStatsQuery() {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (actionFilter) qs.set('action', actionFilter);
    if (entityFilter) qs.set('entity', entityFilter);
    if (userFilter) qs.set('userId', userFilter);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    return qs.toString();
  }

  function buildQuery(
    pageNum = page,
    overrides?: { action?: string; entity?: string; userId?: string; sort?: string; order?: SortOrder },
  ) {
    const qs = new URLSearchParams();
    const act = overrides?.action !== undefined ? overrides.action : actionFilter;
    const ent = overrides?.entity !== undefined ? overrides.entity : entityFilter;
    const uid = overrides?.userId !== undefined ? overrides.userId : userFilter;
    const sortVal = overrides?.sort !== undefined ? overrides.sort : sort;
    const orderVal = overrides?.order !== undefined ? overrides.order : order;
    if (q) qs.set('q', q);
    if (act) qs.set('action', act);
    if (ent) qs.set('entity', ent);
    if (uid) qs.set('userId', uid);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    qs.set('sort', sortVal);
    qs.set('order', orderVal);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function syncUrl(pageNum = page) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (actionFilter) qs.set('action', actionFilter);
    if (entityFilter) qs.set('entity', entityFilter);
    if (userFilter) qs.set('userId', userFilter);
    if (dateFrom !== monthStartISO()) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    if (sort !== 'createdAt') qs.set('sort', sort);
    if (order !== 'desc') qs.set('order', order);
    if (pageNum > 1) qs.set('page', String(pageNum));
    setSearchParams(qs, { replace: true });
  }

  function load(
    pageNum = page,
    overrides?: { action?: string; entity?: string; userId?: string; sort?: string; order?: SortOrder },
  ) {
    setLoading(true);
    setError('');
    const statsQs = buildStatsQuery();
    Promise.all([
      api<PaginatedResponse<AuditLog>>(`/audit?${buildQuery(pageNum, overrides)}`),
      api<Stats>(`/audit/stats?${statsQs}`),
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
    api<PaginatedResponse<UserOption>>(`/auth/users?limit=100&sort=lastName&order=asc&active=true`)
      .then((res) => setUserOptions(res.items))
      .catch(() => setUserOptions([]));
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

  function exportCsv() {
    downloadCsv(`/audit/export/csv?${buildStatsQuery()}`, 'audit-gic.csv');
  }

  function exportExcel() {
    downloadExcel(`/audit/export/xlsx?${buildStatsQuery()}`, 'audit-gic.xlsx');
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><body style="font-family:sans-serif;padding:24px;font-size:11px">
      <h1>Journal d'audit — GIC</h1>
      <p>Période : ${dateFrom} → ${dateTo} · ${total} entrée(s)</p>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;width:100%">
        <tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Entité</th><th>Détails</th><th>IP</th></tr>
        ${items.map((l) => `<tr>
          <td>${formatAuditDateTime(l.createdAt)}</td>
          <td>${l.user ? `${l.user.firstName} ${l.user.lastName}` : '—'}</td>
          <td>${l.action}</td>
          <td>${auditEntityLabel(l.entity)}${l.entityId ? ' #' + l.entityId.slice(0, 8) : ''}</td>
          <td>${l.details || '—'}</td>
          <td>${l.ipAddress || '—'}</td>
        </tr>`).join('')}
      </table>
    </body></html>`);
    w.document.close();
    w.print();
  }

  const hasActiveFilters = !!actionFilter || !!entityFilter || !!userFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.audit')}
        subtitle={t('pages.auditSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={exportExcel}>{t('common.excel')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('kpi.entries')} value={stats.total} icon={Shield} tone="violet" delta={t('kpi.usersCount', { count: stats.usersCount })} deltaTone="muted" />
        <KpiCard title={t('kpi.today')} value={stats.today} icon={Calendar} tone="emerald" />
        <KpiCard title={t('kpi.last7Days')} value={stats.week} icon={Activity} tone="amber" />
        <KpiCard title={t('kpi.activeUsers')} value={stats.usersCount} icon={Users} tone="coral" />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchAudit')}
            />
            <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0" />
            <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0" />
            <MacSelect
              value={sort}
              onChange={(v) => {
                setSort(v);
                setPage(1);
                load(1, { sort: v });
              }}
              options={[
                { value: 'createdAt', label: t('fields.date') },
                { value: 'action', label: t('columns.action') },
                { value: 'entity', label: t('columns.entity') },
              ]}
              className="w-32 shrink-0"
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
                <div className="mac-filter-menu max-h-[70vh] overflow-y-auto" role="menu">
                  <p className="mac-filter-menu-section">{t('columns.action')}</p>
                  {AUDIT_ACTION_FILTERS.map((f) => (
                    <button
                      key={f.id || 'all-actions'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${actionFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setActionFilter(f.id);
                        setPage(1);
                        load(1, { action: f.id });
                        setShowFilters(false);
                      }}
                    >
                      <span>{auditActionFilterLabel(f.id, t)}</span>
                      {actionFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  {stats.actions.length > 0 && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <p className="mac-filter-menu-section">{t('msg.actionsDetail')}</p>
                      {stats.actions.slice(0, 12).map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          role="menuitem"
                          className={`mac-filter-menu-item${actionFilter === a.id ? ' mac-filter-menu-item-active' : ''}`}
                          onClick={() => {
                            setActionFilter(a.id);
                            setPage(1);
                            load(1, { action: a.id });
                            setShowFilters(false);
                          }}
                        >
                          <span className="truncate">{auditActionLabel(a.id)} ({a.count})</span>
                          {actionFilter === a.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                        </button>
                      ))}
                    </>
                  )}
                  <div className="mac-filter-menu-sep" />
                  <p className="mac-filter-menu-section">{t('columns.entity')}</p>
                  <button
                    type="button"
                    role="menuitem"
                    className={`mac-filter-menu-item${entityFilter === '' ? ' mac-filter-menu-item-active' : ''}`}
                    onClick={() => {
                      setEntityFilter('');
                      setPage(1);
                      load(1, { entity: '' });
                      setShowFilters(false);
                    }}
                  >
                    <span>{t('common.allFeminine')}</span>
                    {entityFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                  </button>
                  {stats.entities.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${entityFilter === e.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setEntityFilter(e.id);
                        setPage(1);
                        load(1, { entity: e.id });
                      }}
                    >
                      <span className="truncate">{auditEntityLabel(e.id)} ({e.count})</span>
                      {entityFilter === e.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  {userOptions.length > 0 && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <p className="mac-filter-menu-section">{t('columns.user')}</p>
                      <button
                        type="button"
                        role="menuitem"
                        className={`mac-filter-menu-item${userFilter === '' ? ' mac-filter-menu-item-active' : ''}`}
                        onClick={() => {
                          setUserFilter('');
                          setPage(1);
                          load(1, { userId: '' });
                        }}
                      >
                        <span>{t('common.all')}</span>
                        {userFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                      </button>
                      {userOptions.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          role="menuitem"
                          className={`mac-filter-menu-item${userFilter === u.id ? ' mac-filter-menu-item-active' : ''}`}
                          onClick={() => {
                            setUserFilter(u.id);
                            setPage(1);
                            load(1, { userId: u.id });
                          }}
                        >
                          <span className="truncate">{u.firstName} {u.lastName}</span>
                          {userFilter === u.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
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
                          setActionFilter('');
                          setEntityFilter('');
                          setUserFilter('');
                          setPage(1);
                          load(1, { action: '', entity: '', userId: '' });
                          setShowFilters(false);
                        }}
                      >
                        {t('common.reset')}
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
          <EmptyState title={t('msg.emptyAudit')} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.date')}</Th>
                <Th mac>{t('columns.user')}</Th>
                <Th mac>{t('columns.action')}</Th>
                <Th mac>{t('columns.entity')}</Th>
                <Th mac>{t('columns.details')}</Th>
                <Th mac>{t('columns.ip')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((l) => {
                const link = auditEntityLink(l.entity, l.entityId);
                return (
                  <tr
                    key={l.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/audit/${l.id}`)}
                  >
                    <Td mac className="text-[11px] whitespace-nowrap">{formatAuditDateTime(l.createdAt)}</Td>
                    <Td mac>
                      {l.user ? (
                        <Link
                          to={`/utilisateurs/${l.user.id}`}
                          className="font-medium hover:text-[#007aff]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {l.user.firstName} {l.user.lastName}
                        </Link>
                      ) : (
                        <span className="font-medium">{t('common.system')}</span>
                      )}
                      {l.user?.email && <span className="block text-[10px] text-gic-muted">{l.user.email}</span>}
                    </Td>
                    <Td mac><ActionBadge action={l.action} /></Td>
                    <Td mac>
                      <span className="font-medium">{auditEntityLabel(l.entity)}</span>
                      {l.entityId && (
                        link ? (
                          <Link
                            to={link}
                            className="block text-[10px] text-gic-violet hover:underline font-mono"
                            onClick={(e) => e.stopPropagation()}
                          >
                            #{l.entityId.slice(0, 8)}…
                          </Link>
                        ) : (
                          <span className="block text-[10px] text-gic-muted font-mono">#{l.entityId.slice(0, 8)}…</span>
                        )
                      )}
                    </Td>
                    <Td mac className="mac-table-muted max-w-[220px] truncate">{l.details || '—'}</Td>
                    <Td mac className="text-[10px] font-mono text-gic-muted">{l.ipAddress || '—'}</Td>
                    <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                      <MacActionBtn icon={Eye} tone="blue" title={t('actions.viewDetail')} onClick={() => navigate(`/audit/${l.id}`)} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => load(p)} mac />
      </Card>
    </div>
  );
}
