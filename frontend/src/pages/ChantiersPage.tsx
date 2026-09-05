import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Eye, Download, Printer, Trash2, HardHat, TrendingUp, Users, ShoppingCart,
  SlidersHorizontal, Check, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, downloadCsv, formatDate, formatMad, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { ChantierFormFields, emptyChantierForm, chantierToForm, type ChantierFormData, type ProjectOption, type ChefOption } from '../components/ChantierFormFields';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';

type Chantier = {
  id: string;
  name: string;
  address?: string;
  managerName?: string;
  workerCount: number;
  progressPct: number;
  status: string;
  photo?: string | null;
  startDate?: string;
  endDate?: string;
  project?: { id: string; name: string; city?: string | null };
  _count?: { assignments: number; purchases: number; missions: number };
};

type SortOrder = 'asc' | 'desc';

type Stats = { total: number; actifs: number; termines: number; suspendus: number; avgProgress: number; workers: number; purchaseTotal: number };

const PAGE_SIZE = 20;

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

export default function ChantiersPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Chantier[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, actifs: 0, termines: 0, suspendus: 0, avgProgress: 0, workers: 0, purchaseTotal: 0 });
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<ChantierFormData>(emptyChantierForm());
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [chefs, setChefs] = useState<ChefOption[]>([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildQuery(pageNum = page, overrides?: { status?: string; projectId?: string }) {
    const qs = new URLSearchParams();
    const status = overrides?.status ?? statusFilter;
    const projectId = overrides?.projectId !== undefined ? overrides.projectId : projectFilter;
    if (q) qs.set('q', q);
    if (status) qs.set('status', status);
    if (projectId) qs.set('projectId', projectId);
    qs.set('sort', sort);
    qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs;
  }

  function load(pageNum = page, overrides?: { status?: string; projectId?: string }) {
    setLoading(true);
    setError('');
    const qs = buildQuery(pageNum, overrides);
    Promise.all([
      api<PaginatedResponse<Chantier>>(`/chantiers?${qs}`),
      api<Stats>('/chantiers/stats'),
    ])
      .then(([res, st]) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
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
    load(1);
    setPage(1);
  }, [projectFilter]);

  useEffect(() => {
    api<{ items: ProjectOption[] }>('/immobilier/projects?limit=100&sort=name&order=asc')
      .then((r) => setProjects(r.items))
      .catch(() => {});
    api<ChefOption[]>('/chantiers/chefs').then(setChefs).catch(() => {});
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
    setEditId(null);
    setForm(emptyChantierForm());
    setError('');
    setOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(c: Chantier) {
    api(`/chantiers/${c.id}`).then((full) => {
      setEditId(c.id);
      setForm(chantierToForm(full));
      setError('');
      setOpen(true);
    });
  }

  function toBody(f: ChantierFormData) {
    return {
      name: f.name,
      address: f.address || null,
      startDate: f.startDate || null,
      endDate: f.endDate || null,
      managerName: f.managerName || null,
      managerUserId: f.managerUserId || null,
      workerCount: Number(f.workerCount || 0),
      remark: f.remark || null,
      status: f.status,
      projectId: f.projectId || null,
      budgetAchats: f.budgetAchats ? Number(f.budgetAchats) : null,
    };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const body = toBody(form);
      if (editId) {
        await api(`/chantiers/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/chantiers', { method: 'POST', body: JSON.stringify(body) });
      }
      setOpen(false);
      load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!deleteId || !deleteMotif.trim()) return;
    try {
      await api(`/chantiers/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      setDeleteId(null);
      setDeleteMotif('');
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${t('pages.sites')} — GIC</title></head><body>
      <h1>${t('pages.sites')} — GIC</h1>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.name')}</th><th>${t('columns.address')}</th><th>${t('columns.chef')}</th><th>${t('tabs.workers')}</th><th>${t('columns.progress')}</th><th>${t('columns.status')}</th></tr>
        ${items.map((c) => `<tr>
          <td>${c.name}</td>
          <td>${c.address || '—'}</td>
          <td>${c.managerName || '—'}</td>
          <td>${c.workerCount}</td>
          <td>${Math.round(c.progressPct || 0)}%</td>
          <td>${c.status}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const statusFilters = [
    { id: '', label: t('common.all') },
    { id: 'actif', label: t('kpi.active') },
    { id: 'suspendu', label: t('common.suspendedSites') },
    { id: 'termine', label: t('common.finishedPlural') },
  ];

  const hasActiveFilters = !!statusFilter || !!projectFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.sites')}
        subtitle={t('pages.sitesSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/chantiers/export/csv?${buildQuery(1)}`, 'chantiers-gic.csv')}>{t('common.export')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newSite')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('kpi.totalSites')} value={stats.total} icon={HardHat} tone="violet" />
        <KpiCard
          title={t('kpi.active')}
          value={stats.actifs}
          icon={TrendingUp}
          tone="emerald"
          delta={`${stats.avgProgress}% avancement moy.`}
          deltaTone="muted"
        />
        <KpiCard
          title={t('kpi.declaredStaff')}
          value={stats.workers}
          icon={Users}
          tone="amber"
          delta={`${stats.suspendus} suspendus`}
          deltaTone="muted"
        />
        <KpiCard
          title={t('kpi.purchaseVolume')}
          value={formatMadCompact(stats.purchaseTotal)}
          icon={ShoppingCart}
          tone="coral"
          compact
          delta={t('msg.finishedCountShort', { count: stats.termines })}
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
              placeholder={t('msg.searchNameAddressChef')}
            />
            <MacSelect
              value={sort}
              onChange={setSort}
              options={[
                { value: 'createdAt', label: t('msg.newestFirst') },
                { value: 'name', label: t('common.name') },
                { value: 'progressPct', label: t('columns.progress') },
                { value: 'workerCount', label: t('tabs.workers') },
              ]}
              className="w-40 shrink-0"
            />
            <MacActionBtn
              icon={order === 'asc' ? ArrowUp : ArrowDown}
              tone="gray"
              title={order === 'asc' ? t('msg.ascending') : t('msg.descending')}
              onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            />
            <MacSelect
              value={projectFilter}
              onChange={setProjectFilter}
              options={[
                { value: '', label: t('common.allProjects') },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
              className="w-44 shrink-0"
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
                          setProjectFilter('');
                          setPage(1);
                          load(1, { status: '', projectId: '' });
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
          <EmptyState title={t('msg.emptySites')} action={<Btn icon={Plus} onClick={openCreate}>{t('actions.newSite')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac className="w-12" aria-label={t('fields.photo')} />
                <Th mac>{t('columns.name')}</Th>
                <Th mac>{t('columns.project')}</Th>
                <Th mac>{t('columns.address')}</Th>
                <Th mac>{t('columns.start')}</Th>
                <Th mac>{t('columns.chef')}</Th>
                <Th mac>{t('columns.staff')}</Th>
                <Th mac>{t('columns.purchases')}</Th>
                <Th mac>{t('columns.progress')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const pct = Math.min(100, Math.round(c.progressPct || 0));
                const initials = c.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
                return (
                  <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/chantiers/${c.id}`)}>
                    <Td mac>
                      {c.photo ? (
                        <img src={c.photo} alt="" className="h-9 w-9 rounded-lg object-cover ring-1 ring-black/5" />
                      ) : (
                        <div className="h-9 w-9 rounded-lg bg-gradient-to-b from-[#ffb340] to-[#ff9500] text-white text-[10px] font-bold flex items-center justify-center">
                          {initials.slice(0, 2)}
                        </div>
                      )}
                    </Td>
                    <Td mac>
                      <Link to={`/chantiers/${c.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{c.name}</Link>
                    </Td>
                    <Td mac className="mac-table-muted">
                      {c.project ? (
                        <Link to={`/projets/${c.project.id}`} className="hover:text-[#5856d6] truncate max-w-[140px] block">
                          {c.project.name}
                        </Link>
                      ) : '—'}
                    </Td>
                    <Td mac className="mac-table-muted">{c.address || '—'}</Td>
                    <Td mac className="mac-table-muted text-[11px]">{c.startDate ? formatDate(c.startDate) : '—'}</Td>
                    <Td mac>{c.managerName || '—'}</Td>
                    <Td mac className="mac-table-muted">
                      {c._count?.assignments ?? 0} / {c.workerCount}
                    </Td>
                    <Td mac className="mac-table-muted">{c._count?.purchases ?? 0}</Td>
                    <Td mac>
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <div className="mac-progress flex-1">
                          <div className="mac-progress-bar" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] text-gic-muted w-8 tabular-nums">{pct}%</span>
                      </div>
                    </Td>
                    <Td mac><StatusPill status={c.status} quiet /></Td>
                    <Td mac className="mac-td-actions">
                      <div className="mac-actions">
                        <MacActionBtn
                          icon={Eye}
                          tone="blue"
                          title={t('actions.fiche360')}
                          onClick={(e) => { e.stopPropagation(); navigate(`/chantiers/${c.id}`); }}
                        />
                        <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={(e) => { e.stopPropagation(); openEdit(c); }} />
                        <MacActionBtn
                          icon={Trash2}
                          tone="red"
                          title={t('common.delete')}
                          onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); setDeleteMotif(''); }}
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
        open={open}
        size="lg"
        title={editId ? t('actions.editSite') : t('actions.newSite')}
        onClose={() => setOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn><Btn form="chantier-form" type="submit">{editId ? t('common.save') : t('common.create')}</Btn></>}
      >
        <form id="chantier-form" onSubmit={save}>
          <ChantierFormFields form={form} setForm={setForm} projects={projects} chefs={chefs} />
          {error && <p className="mt-3 text-[11px] text-gic-coral">{error}</p>}
        </form>
      </Modal>

      <Modal open={!!deleteId} title={t('actions.deleteSite')} onClose={() => setDeleteId(null)}
        footer={<><Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn></>}
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.siteDeleteBlockedFull')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.motifPlaceholder')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>
    </div>
  );
}
