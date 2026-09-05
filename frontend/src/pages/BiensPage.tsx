import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, Download, Eye, Building2, Home, TrendingUp, Printer, MapPin,
  SlidersHorizontal, Check, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, fetchProjectList, formatMad, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import {
  BienFormFields, emptyBienForm, flattenProjectFloors,
  type BienFormData, type FloorOption,
} from '../components/BienFormFields';
import { useI18n } from '../i18n/I18nContext';

type Property = {
  id: string;
  reference: string;
  name: string;
  city?: string;
  status: string;
  surface?: number;
  price?: number;
  photo?: string | null;
  project?: { name: string; id: string };
  sales?: Array<{
    id: string;
    reference: string;
    client?: { id: string; firstName: string; lastName: string; reference?: string } | null;
  }>;
  rentals?: Array<{
    id: string;
    reference: string;
    client?: { id: string; firstName: string; lastName: string; reference?: string } | null;
  }>;
};

type Stats = {
  total: number;
  disponibles: number;
  reserves: number;
  vendus: number;
  loues: number;
  indisponibles: number;
  valeurPatrimoine: number;
};

const PAGE_SIZE = 20;
type SortOrder = 'asc' | 'desc';

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

export default function BiensPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Property[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({
    total: 0, disponibles: 0, reserves: 0, vendus: 0, loues: 0, indisponibles: 0, valeurPatrimoine: 0,
  });
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [floors, setFloors] = useState<FloorOption[]>([]);
  const [loadingFloors, setLoadingFloors] = useState(false);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [projectFilter, setProjectFilter] = useState(searchParams.get('projectId') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'createdAt');
  const [order, setOrder] = useState<SortOrder>((searchParams.get('order') as SortOrder) || 'desc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<BienFormData>(emptyBienForm());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildStatsQuery(overrides?: { q?: string; status?: string; projectId?: string }) {
    const qs = new URLSearchParams();
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const status = overrides?.status !== undefined ? overrides.status : statusFilter;
    const projectId = overrides?.projectId !== undefined ? overrides.projectId : projectFilter;
    if (qVal) qs.set('q', qVal);
    if (status) qs.set('status', status);
    if (projectId) qs.set('projectId', projectId);
    return qs.toString();
  }

  function buildListQuery(
    pageNum = page,
    overrides?: { q?: string; status?: string; projectId?: string; sort?: string; order?: SortOrder },
  ) {
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const status = overrides?.status !== undefined ? overrides.status : statusFilter;
    const projectId = overrides?.projectId !== undefined ? overrides.projectId : projectFilter;
    const sortVal = overrides?.sort !== undefined ? overrides.sort : sort;
    const orderVal = overrides?.order !== undefined ? overrides.order : order;
    const qs = new URLSearchParams();
    if (qVal) qs.set('q', qVal);
    if (status) qs.set('status', status);
    if (projectId) qs.set('projectId', projectId);
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
    if (projectFilter) qs.set('projectId', projectFilter);
    if (sort !== 'createdAt') qs.set('sort', sort);
    if (order !== 'desc') qs.set('order', order);
    if (pageNum > 1) qs.set('page', String(pageNum));
    setSearchParams(qs, { replace: true });
  }

  function load(
    pageNum = page,
    overrides?: { q?: string; status?: string; projectId?: string; sort?: string; order?: SortOrder },
  ) {
    setLoading(true);
    setError('');
    const statsQs = buildStatsQuery({
      q: overrides?.q,
      status: overrides?.status,
      projectId: overrides?.projectId,
    });
    Promise.all([
      api<PaginatedResponse<Property>>(`/immobilier/properties?${buildListQuery(pageNum, overrides)}`),
      api<Stats>(`/immobilier/properties/stats?${statsQs}`),
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
    fetchProjectList<{ id: string; name: string }>().then(setProjects);
  }, []);

  useEffect(() => {
    const create = searchParams.get('create');
    if (create !== '1') return;
    const projectId = searchParams.get('projectId') || projectFilter;
    setForm(projectId ? { ...emptyBienForm(), projectId } : emptyBienForm());
    setError('');
    setOpen(true);
    const qs = new URLSearchParams(searchParams);
    qs.delete('create');
    setSearchParams(qs, { replace: true });
  }, [searchParams]);

  useEffect(() => {
    if (!form.projectId) {
      setFloors([]);
      return;
    }
    setLoadingFloors(true);
    api(`/immobilier/projects/${form.projectId}/tree`)
      .then((tree) => setFloors(flattenProjectFloors(tree, t)))
      .catch(() => setFloors([]))
      .finally(() => setLoadingFloors(false));
  }, [form.projectId, t]);

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
    setForm(emptyBienForm());
    setError('');
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const body = {
        ...form,
        surface: form.surface ? Number(form.surface) : null,
        rooms: form.rooms ? Number(form.rooms) : null,
        price: form.price ? Number(form.price) : null,
        projectId: form.projectId || null,
        floorId: form.floorId || null,
      };
      await api('/immobilier/properties', { method: 'POST', body: JSON.stringify(body) });
      setOpen(false);
      load(1);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!deleteId || !deleteMotif.trim()) return;
    try {
      await api(`/immobilier/properties/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
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
    w.document.write(`<html><head><title>${t('pages.properties')} — GIC</title></head><body>
      <h1>${t('pages.properties')} — GIC</h1>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.ref')}</th><th>${t('columns.property')}</th><th>${t('columns.project')}</th><th>${t('columns.surface')}</th><th>${t('columns.price')}</th><th>${t('columns.status')}</th></tr>
        ${items.map((p) => `<tr>
          <td>${p.reference}</td>
          <td>${p.name}</td>
          <td>${p.project?.name || '—'}</td>
          <td>${p.surface ? p.surface + ' m²' : '—'}</td>
          <td>${p.price ? p.price + ' MAD' : '—'}</td>
          <td>${p.status}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const statusFilters = [
    { id: '', label: t('common.all') },
    { id: 'disponible', label: t('common.availablePlural') },
    { id: 'réservé', label: t('common.reservedPlural') },
    { id: 'vendu', label: t('common.soldPlural') },
    { id: 'loué', label: t('common.rentedPlural') },
    { id: 'indisponible', label: t('common.unavailablePlural') },
  ];

  const hasActiveFilters = !!statusFilter || !!projectFilter || !!q;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.properties')}
        subtitle={t('pages.propertiesListSubtitle')}
        actions={
          <>
            <Link to="/projets"><Btn variant="secondary" icon={MapPin}>{t('nav.projects')}</Btn></Link>
            <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/immobilier/properties/export/csv?${buildStatsQuery()}`, 'biens-gic.csv')}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadExcel(`/immobilier/properties/export/xlsx?${buildStatsQuery()}`, 'biens-gic.xlsx')}>{t('common.excel')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newProperty')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('pages.properties')} value={stats.total} icon={Building2} tone="violet" />
        <KpiCard
          title={t('common.availablePlural')}
          value={stats.disponibles}
          icon={Home}
          tone="emerald"
          delta={stats.reserves ? t('msg.reservedCount', { count: stats.reserves }) : undefined}
          deltaTone="muted"
        />
        <KpiCard title={t('kpi.soldRented')} value={`${stats.vendus} / ${stats.loues}`} icon={TrendingUp} tone="coral" />
        <KpiCard
          title={t('msg.availableValue')}
          value={formatMadCompact(stats.valeurPatrimoine)}
          icon={Building2}
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
              placeholder={t('msg.searchRefNameCity')}
            />
            <MacSelect
              value={projectFilter}
              onChange={(v) => {
                setProjectFilter(v);
                setPage(1);
                load(1, { projectId: v });
              }}
              options={[
                { value: '', label: t('common.allProjects') },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
              className="w-44 shrink-0"
            />
            <MacSelect
              value={sort}
              onChange={(v) => {
                setSort(v);
                setPage(1);
                load(1, { sort: v });
              }}
              options={[
                { value: 'createdAt', label: t('msg.newestFirst') },
                { value: 'reference', label: t('fields.reference') },
                { value: 'name', label: t('common.name') },
                { value: 'price', label: t('fields.price') },
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
                          setProjectFilter('');
                          setQ('');
                          setPage(1);
                          load(1, { q: '', status: '', projectId: '' });
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
          <EmptyState title={t('msg.emptyProperties')} action={<Btn icon={Plus} onClick={openCreate}>{t('actions.newProperty')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.photo')}</Th>
                <Th mac>{t('columns.ref')}</Th>
                <Th mac>{t('columns.property')}</Th>
                <Th mac>{t('columns.project')}</Th>
                <Th mac>{t('columns.surface')}</Th>
                <Th mac>{t('columns.price')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac>{t('columns.client')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const buyer = p.sales?.[0]?.client;
                const tenant = p.rentals?.[0]?.client;
                const client = buyer || tenant;
                const clientRole = buyer ? t('fields.buyer') : tenant ? t('fields.tenant') : null;
                return (
                <tr
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/biens/${p.id}`)}
                >
                  <Td mac>
                    {p.photo ? (
                      <img src={p.photo} alt="" className="mac-avatar" />
                    ) : (
                      <span className="mac-avatar-fallback">{p.reference.slice(-2)}</span>
                    )}
                  </Td>
                  <Td mac>
                    <Link to={`/biens/${p.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{p.reference}</Link>
                  </Td>
                  <Td mac className="font-medium">{p.name}</Td>
                  <Td mac className="mac-table-muted">{p.project?.name || '—'}</Td>
                  <Td mac className="mac-table-muted">{p.surface ? `${p.surface} m²` : '—'}</Td>
                  <Td mac>{p.price ? formatMad(p.price) : '—'}</Td>
                  <Td mac><StatusPill status={p.status} quiet /></Td>
                  <Td mac onClick={(e) => e.stopPropagation()}>
                    {client ? (
                      <>
                        <Link to={`/clients/${client.id}`} className="mac-table-ref">
                          {client.firstName} {client.lastName}
                        </Link>
                        {clientRole && <span className="block text-[10px] text-gic-muted">{clientRole}</span>}
                      </>
                    ) : (
                      <span className="mac-table-muted">—</span>
                    )}
                  </Td>
                  <Td mac className="mac-td-actions">
                    <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                      <MacActionBtn icon={Eye} tone="blue" title={t('actions.fiche360')} onClick={() => navigate(`/biens/${p.id}`)} />
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => navigate(`/biens/${p.id}`, { state: { edit: true } })} />
                      <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteId(p.id); setDeleteMotif(''); }} />
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
        title={t('actions.newProperty')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="bien-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="bien-form" onSubmit={save}>
          <BienFormFields form={form} setForm={setForm} projects={projects} floors={floors} loadingFloors={loadingFloors} />
          {error && <p className="mt-3 text-[11px] text-gic-coral">{error}</p>}
        </form>
      </Modal>

      <Modal
        open={!!deleteId}
        title={t('actions.deleteProperty')}
        onClose={() => setDeleteId(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">
          Un bien avec vente ou location active ne peut pas être supprimé (RG-BIEN-003).
        </p>
        <textarea
          className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]"
          placeholder={t('msg.motifDeletePlaceholder')}
          value={deleteMotif}
          onChange={(e) => setDeleteMotif(e.target.value)}
        />
      </Modal>
    </div>
  );
}
