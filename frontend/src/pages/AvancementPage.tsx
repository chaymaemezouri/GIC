import { appAlert } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Download, Printer, HardHat, CheckCircle, Clock, BarChart3, Eye,
  SlidersHorizontal, Check, Pencil, Trash2, ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  api, downloadCsv, downloadExcel, fetchChantierList, formatDate, type PaginatedResponse,
} from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import ProgressSteps from '../components/ProgressSteps';
import type { TaskPhaseInput } from '../lib/progressPhases';
import { useI18n } from '../i18n/I18nContext';

type ProgressItem = {
  id: string;
  taskName: string;
  tranche?: string;
  groupe?: string;
  etage?: string;
  percent: number;
  remark?: string | null;
  phases?: TaskPhaseInput[] | null;
  updatedAt?: string;
  chantier: { id: string; name: string; progressPct: number; status: string; managerName?: string };
};

type Stats = {
  tasks: number;
  chantiersActifs: number;
  avgProgress: number;
  avgTaskProgress: number;
  completed: number;
  inProgress: number;
  notStarted: number;
};

type SortOrder = 'asc' | 'desc';

const PAGE_SIZE = 20;

function taskStatus(percent: number) {
  const p = Math.round(percent);
  if (p >= 100) return 'terminee';
  if (p > 0) return 'en_cours';
  return 'non_demarree';
}

export default function AvancementPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<ProgressItem[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({
    tasks: 0, chantiersActifs: 0, avgProgress: 0, avgTaskProgress: 0,
    completed: 0, inProgress: 0, notStarted: 0,
  });
  const [chantiers, setChantiers] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [chantierFilter, setChantierFilter] = useState(searchParams.get('chantierId') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'taskName');
  const [order, setOrder] = useState<SortOrder>(searchParams.get('order') === 'desc' ? 'desc' : 'asc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingProgress, setSavingProgress] = useState<string | null>(null);

  const [editItem, setEditItem] = useState<ProgressItem | null>(null);
  const [editPercent, setEditPercent] = useState(0);
  const [editRemark, setEditRemark] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');

  function buildQuery(pageNum = page, overrides?: { chantierId?: string; q?: string; status?: string }) {
    const qs = new URLSearchParams();
    const query = overrides?.q ?? q;
    const ch = overrides?.chantierId !== undefined ? overrides.chantierId : chantierFilter;
    const st = overrides?.status !== undefined ? overrides.status : statusFilter;
    if (query) qs.set('q', query);
    if (ch) qs.set('chantierId', ch);
    if (st) qs.set('status', st);
    if (sort !== 'taskName') qs.set('sort', sort);
    if (order !== 'asc') qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function buildStatsQuery(overrides?: { chantierId?: string; q?: string; status?: string }) {
    const qs = new URLSearchParams();
    const query = overrides?.q ?? q;
    const ch = overrides?.chantierId !== undefined ? overrides.chantierId : chantierFilter;
    const st = overrides?.status !== undefined ? overrides.status : statusFilter;
    if (query) qs.set('q', query);
    if (ch) qs.set('chantierId', ch);
    if (st) qs.set('status', st);
    return qs.toString();
  }

  function load(pageNum = page, overrides?: { chantierId?: string; q?: string; status?: string }) {
    setLoading(true);
    setError('');
    const listQs = buildQuery(pageNum, overrides);
    const statsQs = buildStatsQuery(overrides);
    Promise.all([
      api<PaginatedResponse<ProgressItem>>(`/chantiers/avancement?${listQs}`),
      api<Stats>(`/chantiers/avancement/stats?${statsQs}`),
    ])
      .then(([res, st]) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        setStats(st);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchChantierList<{ id: string; name: string }>().then(setChantiers);
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (chantierFilter) qs.set('chantierId', chantierFilter);
    if (statusFilter) qs.set('status', statusFilter);
    if (sort !== 'taskName') qs.set('sort', sort);
    if (order !== 'asc') qs.set('order', order);
    if (page > 1) qs.set('page', String(page));
    setSearchParams(qs, { replace: true });
  }, [q, chantierFilter, statusFilter, sort, order, page, setSearchParams]);

  useEffect(() => {
    load(1);
    setPage(1);
  }, [chantierFilter, statusFilter, sort, order]);

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

  async function savePercent(id: string, percent: number) {
    setSavingProgress(id);
    try {
      await api(`/chantiers/progress/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ percent }),
      });
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingProgress(null);
    }
  }

  async function saveProgressEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem) return;
    try {
      await api(`/chantiers/progress/${editItem.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          percent: editPercent,
          remark: editRemark.trim() || null,
        }),
      });
      setEditItem(null);
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openEdit(p: ProgressItem) {
    setEditItem(p);
    setEditPercent(Math.round(p.percent));
    setEditRemark(p.remark || '');
  }

  async function confirmDelete() {
    if (!deleteId || !deleteMotif.trim()) return;
    try {
      await api(`/chantiers/progress/${deleteId}`, { method: 'DELETE' });
      setDeleteId(null);
      setDeleteMotif('');
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function exportCsv() {
    downloadCsv(`/chantiers/avancement/export/csv?${buildStatsQuery()}`, 'avancement-gic.csv');
  }

  function exportExcel() {
    downloadExcel(`/chantiers/avancement/export/xlsx?${buildStatsQuery()}`, 'avancement-gic.xlsx');
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${t('pages.progress')} GIC</title></head><body>
      <h1>${t('pages.progress')} — GIC</h1>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.chantier')}</th><th>${t('columns.task')}</th><th>${t('columns.tranche')}</th><th>${t('columns.taskProgress')}</th><th>${t('columns.globalProgress')}</th><th>${t('columns.status')}</th><th>${t('columns.updated')}</th></tr>
        ${items.map((p) => `<tr>
          <td>${p.chantier.name}</td>
          <td>${p.taskName}</td>
          <td>${[p.tranche, p.groupe, p.etage].filter(Boolean).join(' · ') || '—'}</td>
          <td>${Math.round(p.percent)}%</td>
          <td>${Math.round(p.chantier.progressPct)}%</td>
          <td>${taskStatus(p.percent).replace('_', ' ')}</td>
          <td>${p.updatedAt ? formatDate(p.updatedAt) : '—'}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const statusFilters = [
    { id: '', label: t('pages.allStatuses') },
    { id: 'completed', label: t('kpi.completedFeminine') },
    { id: 'in_progress', label: t('fields.statusInProgress') },
    { id: 'not_started', label: t('kpi.notStartedPlural') },
  ];

  const hasActiveFilters = !!chantierFilter || !!statusFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.progress')}
        subtitle={t('pages.progressSubtitle')}
        actions={
          <>
            <Link to="/chantiers"><Btn variant="secondary" icon={HardHat}>{t('pages.sites')}</Btn></Link>
            <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={exportExcel}>{t('common.excel')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard
          title={t('kpi.trackedTasks')}
          value={stats.tasks}
          icon={HardHat}
          tone="violet"
          delta={t('kpi.activeSitesDelta', { count: stats.chantiersActifs })}
          deltaTone="muted"
        />
        <KpiCard
          title={t('dashboard.avgProgress')}
          value={`${stats.avgTaskProgress}%`}
          icon={BarChart3}
          tone="emerald"
          delta={t('kpi.sitesAvgProgress', { pct: stats.avgProgress })}
          deltaTone="muted"
        />
        <KpiCard title={t('kpi.completedFeminine')} value={stats.completed} icon={CheckCircle} tone="emerald" />
        <KpiCard
          title={t('fields.statusInProgress')}
          value={stats.inProgress}
          icon={Clock}
          tone="amber"
          delta={t('kpi.notStartedCount', { count: stats.notStarted })}
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
              placeholder={t('pages.progressSearchPlaceholder')}
            />
            <MacSelect
              value={chantierFilter}
              onChange={setChantierFilter}
              options={[
                { value: '', label: t('pages.allSites') },
                ...chantiers.map((c) => ({ value: c.id, label: c.name })),
              ]}
              className="w-48 shrink-0"
            />
            <MacSelect
              value={sort}
              onChange={setSort}
              options={[
                { value: 'taskName', label: t('columns.task') },
                { value: 'percent', label: t('columns.progressPct') },
                { value: 'updatedAt', label: t('columns.lastUpdatedShort') },
                { value: 'chantier', label: t('columns.chantier') },
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
                  <p className="mac-filter-menu-section">{t('columns.chantier')}</p>
                  <button
                    type="button"
                    role="menuitem"
                    className={`mac-filter-menu-item${chantierFilter === '' ? ' mac-filter-menu-item-active' : ''}`}
                    onClick={() => { setChantierFilter(''); setShowFilters(false); }}
                  >
                    <span>{t('common.all')}</span>
                    {chantierFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                  </button>
                  {chantiers.slice(0, 30).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${chantierFilter === c.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => { setChantierFilter(c.id); setShowFilters(false); }}
                    >
                      <span className="truncate">{c.name}</span>
                      {chantierFilter === c.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  <div className="mac-filter-menu-sep" />
                  <p className="mac-filter-menu-section">{t('pages.taskStatus')}</p>
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
                        setShowFilters(false);
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
                          setChantierFilter('');
                          setStatusFilter('');
                          setQ('');
                          setPage(1);
                          load(1, { chantierId: '', q: '', status: '' });
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
        {loading ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState title={t('msg.emptyProgress')} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.chantier')}</Th>
                <Th mac>{t('columns.task')}</Th>
                <Th mac>{t('columns.trancheGroup')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac>{t('columns.taskProgress')}</Th>
                <Th mac>{t('columns.globalProgress')}</Th>
                <Th mac>{t('columns.updated')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  className={`cursor-pointer${Math.round(p.percent) >= 100 ? ' bg-gic-emerald-soft/10' : ''}`}
                  onClick={() => navigate(`/chantiers/${p.chantier.id}`)}
                >
                  <Td mac>
                    <Link
                      to={`/chantiers/${p.chantier.id}`}
                      className="mac-table-ref"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {p.chantier.name}
                    </Link>
                    {p.chantier.managerName && (
                      <span className="block text-[10px] text-gic-muted">{p.chantier.managerName}</span>
                    )}
                  </Td>
                  <Td mac>
                    <span className="mac-table-ref">{p.taskName}</span>
                  </Td>
                  <Td mac className="mac-table-muted">
                    {[p.tranche, p.groupe, p.etage].filter(Boolean).join(' · ') || '—'}
                  </Td>
                  <Td mac>
                    <StatusPill status={taskStatus(p.percent)} quiet />
                  </Td>
                  <Td mac onClick={(e) => e.stopPropagation()}>
                    <div className={savingProgress === p.id ? 'opacity-60' : ''}>
                      <ProgressSteps
                        percent={p.percent}
                        size="sm"
                        onChange={(pct) => savePercent(p.id, pct)}
                        task={{
                          taskName: p.taskName,
                          tranche: p.tranche,
                          groupe: p.groupe,
                          etage: p.etage,
                          remark: p.remark,
                          updatedAt: p.updatedAt,
                          phases: p.phases,
                        }}
                      />
                    </div>
                  </Td>
                  <Td mac>
                    <ProgressSteps percent={p.chantier.progressPct} size="sm" showLabel={false} />
                    <span className="text-[10px] text-gic-muted">{Math.round(p.chantier.progressPct)}%</span>
                  </Td>
                  <Td mac className="mac-table-muted text-[11px]">
                    {p.updatedAt ? formatDate(p.updatedAt) : '—'}
                  </Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(p)} />
                      <MacActionBtn
                        icon={Eye}
                        tone="blue"
                        title={t('actions.siteFiche')}
                        onClick={() => navigate(`/chantiers/${p.chantier.id}`)}
                      />
                      <MacActionBtn
                        icon={Trash2}
                        tone="red"
                        title={t('common.delete')}
                        onClick={() => { setDeleteId(p.id); setDeleteMotif(''); }}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <Pagination
          page={page}
          pages={pages}
          total={total}
          limit={PAGE_SIZE}
          onPage={(p) => { setPage(p); load(p); }}
          mac
        />
      </Card>

      <Modal
        open={!!editItem}
        title={t('actions.editProgress')}
        onClose={() => setEditItem(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEditItem(null)}>{t('common.cancel')}</Btn>
            <Btn form="edit-progress-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        {editItem && (
          <form id="edit-progress-form" onSubmit={saveProgressEdit} className="space-y-4">
            <p className="text-[12px] text-gic-muted">
              {editItem.chantier.name} · {editItem.taskName}
            </p>
            <div>
              <p className="text-[11px] font-medium text-gic-muted mb-2">{t('pages.progressClickHint')}</p>
              <ProgressSteps
                percent={editPercent}
                onChange={setEditPercent}
                task={{
                  taskName: editItem.taskName,
                  tranche: editItem.tranche,
                  groupe: editItem.groupe,
                  etage: editItem.etage,
                  remark: editRemark,
                  updatedAt: editItem.updatedAt,
                  phases: editItem.phases,
                }}
              />
            </div>
            <Input
              label={t('fields.remark')}
              value={editRemark}
              onChange={(e) => setEditRemark(e.target.value)}
              placeholder={t('pages.taskNotesPlaceholder')}
            />
          </form>
        )}
      </Modal>

      <Modal
        open={!!deleteId}
        title={t('actions.deleteTask')}
        onClose={() => setDeleteId(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.deleteTaskRecalc')}</p>
        <textarea
          className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]"
          placeholder={t('msg.motifPlaceholder')}
          value={deleteMotif}
          onChange={(e) => setDeleteMotif(e.target.value)}
        />
      </Modal>
    </div>
  );
}
