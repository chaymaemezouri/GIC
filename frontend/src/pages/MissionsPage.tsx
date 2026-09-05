import { appAlert } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Download, Printer, Plus, MapPin, ClipboardList, Truck, Eye, SlidersHorizontal, Check,
  ArrowUp, ArrowDown, Pencil, Trash2, Wrench,
} from 'lucide-react';
import {
  api, downloadCsv, downloadExcel, fetchChantierList, fetchEnginList, formatDate, type PaginatedResponse,
} from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';

type Mission = {
  id: string;
  date: string;
  mission: string;
  driverName?: string;
  usage?: string;
  requestedBy?: string;
  engin?: { id: string; brand?: string; matricule?: string; status?: string };
  chantier?: { id: string; name: string } | null;
};

type Stats = { total: number; withChantier: number; withoutChantier: number };

const PAGE_SIZE = 20;
type SortOrder = 'asc' | 'desc';

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function MissionsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<Mission[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, withChantier: 0, withoutChantier: 0 });
  const [chantiers, setChantiers] = useState<{ id: string; name: string }[]>([]);
  const [engins, setEngins] = useState<{ id: string; matricule?: string; brand?: string }[]>([]);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [enginFilter, setEnginFilter] = useState(searchParams.get('enginId') || '');
  const [chantierFilter, setChantierFilter] = useState(searchParams.get('chantierId') || '');
  const [linkFilter, setLinkFilter] = useState(searchParams.get('linkFilter') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'date');
  const [order, setOrder] = useState<SortOrder>((searchParams.get('order') as SortOrder) || 'desc');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || monthStartISO());
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || new Date().toISOString().slice(0, 10));
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [missionOpen, setMissionOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [missionForm, setMissionForm] = useState({
    enginId: '', mission: '', driverName: '', chantierId: '', date: new Date().toISOString().slice(0, 10),
    usage: '', requestedBy: '', tranche: '', remark: '',
  });

  function buildStatsQuery() {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (enginFilter) qs.set('enginId', enginFilter);
    if (chantierFilter) qs.set('chantierId', chantierFilter);
    if (linkFilter) qs.set('linkFilter', linkFilter);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    return qs.toString();
  }

  function buildQuery(
    pageNum = page,
    overrides?: {
      enginId?: string;
      chantierId?: string;
      sort?: string;
      order?: SortOrder;
      linkFilter?: string;
    },
  ) {
    const qs = new URLSearchParams();
    const enginId = overrides?.enginId !== undefined ? overrides.enginId : enginFilter;
    const chantierId = overrides?.chantierId !== undefined ? overrides.chantierId : chantierFilter;
    const sortVal = overrides?.sort !== undefined ? overrides.sort : sort;
    const orderVal = overrides?.order !== undefined ? overrides.order : order;
    const linkVal = overrides?.linkFilter !== undefined ? overrides.linkFilter : linkFilter;
    if (q) qs.set('q', q);
    if (enginId) qs.set('enginId', enginId);
    if (chantierId) qs.set('chantierId', chantierId);
    if (linkVal) qs.set('linkFilter', linkVal);
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
    if (enginFilter) qs.set('enginId', enginFilter);
    if (chantierFilter) qs.set('chantierId', chantierFilter);
    if (linkFilter) qs.set('linkFilter', linkFilter);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    if (sort !== 'date') qs.set('sort', sort);
    if (order !== 'desc') qs.set('order', order);
    if (pageNum > 1) qs.set('page', String(pageNum));
    setSearchParams(qs, { replace: true });
  }

  function load(
    pageNum = page,
    overrides?: {
      enginId?: string;
      chantierId?: string;
      sort?: string;
      order?: SortOrder;
      linkFilter?: string;
    },
  ) {
    setLoading(true);
    setError('');
    const statsQs = buildStatsQuery();
    Promise.all([
      api<PaginatedResponse<Mission>>(`/engins/missions?${buildQuery(pageNum, overrides)}`),
      api<Stats>(`/engins/missions/stats?${statsQs}`),
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
    fetchChantierList<{ id: string; name: string }>().then(setChantiers);
    fetchEnginList<{ id: string; matricule?: string; brand?: string }>().then(setEngins);
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
    setMissionForm({
      enginId: enginFilter || '', mission: '', driverName: '', chantierId: chantierFilter || '',
      date: new Date().toISOString().slice(0, 10), usage: '', requestedBy: '', tranche: '', remark: '',
    });
    setMissionOpen(true);
  }

  useCreateQuery(openCreate);

  async function createMission(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/engins/missions', { method: 'POST', body: JSON.stringify(missionForm) });
      setMissionOpen(false);
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!deleteId || !deleteMotif.trim()) return;
    try {
      await api(`/engins/missions/${deleteId}`, {
        method: 'DELETE',
        body: JSON.stringify({ motif: deleteMotif }),
      });
      setDeleteId(null);
      setDeleteMotif('');
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function exportCsv() {
    downloadCsv(`/engins/missions/export/csv?${buildStatsQuery()}`, 'missions-gic.csv');
  }

  function exportExcel() {
    downloadExcel(`/engins/missions/export/xlsx?${buildStatsQuery()}`, 'missions-gic.xlsx');
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${t('pages.missions')} GIC</title></head><body>
      <h1>${t('pages.missionsPrintTitle')}</h1>
      <p>${t('fields.period')} : ${dateFrom} → ${dateTo} · ${t('msg.missionsCount', { count: stats.total })}</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.date')}</th><th>${t('columns.engin')}</th><th>${t('columns.mission')}</th><th>${t('columns.chauffeur')}</th><th>${t('columns.chantier')}</th><th>${t('columns.requestedBy')}</th></tr>
        ${items.map((m) => `<tr>
          <td>${formatDate(m.date)}</td>
          <td>${m.engin?.matricule || ''} ${m.engin?.brand || ''}</td>
          <td>${m.mission}</td>
          <td>${m.driverName || '—'}</td>
          <td>${m.chantier?.name || '—'}</td>
          <td>${m.requestedBy || '—'}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const hasActiveFilters = !!enginFilter || !!chantierFilter || !!linkFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.missions')}
        subtitle={t('pages.missionsSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={exportExcel}>{t('common.excel')}</Btn>
            <Link to="/engins"><Btn variant="secondary" icon={Truck}>{t('pages.equipmentPark')}</Btn></Link>
            <Link to="/maintenance"><Btn variant="secondary" icon={Wrench}>{t('pages.maintenance')}</Btn></Link>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newMission')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid">
        <KpiCard title={t('columns.missions')} value={stats.total} icon={ClipboardList} tone="violet" />
        <KpiCard title={t('kpi.withSite')} value={stats.withChantier} icon={MapPin} tone="emerald" />
        <KpiCard title={t('kpi.withoutSite')} value={stats.withoutChantier} icon={Truck} tone="amber" />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('pages.missionsSearchPlaceholder')}
            />
            <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0" />
            <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0" />
            <MacSelect
              value={enginFilter}
              onChange={(v) => {
                setEnginFilter(v);
                setPage(1);
                load(1, { enginId: v });
              }}
              options={[
                { value: '', label: t('pages.allEquipment') },
                ...engins.map((e) => ({ value: e.id, label: `${e.matricule || ''} — ${e.brand || ''}` })),
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
                { value: 'date', label: t('columns.date') },
                { value: 'mission', label: t('columns.mission') },
                { value: 'driverName', label: t('columns.chauffeur') },
              ]}
              className="w-36 shrink-0"
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
                  <p className="mac-filter-menu-section">{t('pages.linkedSite')}</p>
                  {[
                    { id: '', label: t('common.all') },
                    { id: 'with', label: t('kpi.withSite') },
                    { id: 'without', label: t('kpi.withoutSite') },
                  ].map((f) => (
                    <button
                      key={f.id || 'all-link'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${linkFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setLinkFilter(f.id);
                        setPage(1);
                        load(1, { linkFilter: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {linkFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  <div className="mac-filter-menu-sep" />
                  <p className="mac-filter-menu-section">{t('columns.chantier')}</p>
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
                      <span className="truncate">{c.name}</span>
                      {chantierFilter === c.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setEnginFilter('');
                          setChantierFilter('');
                          setLinkFilter('');
                          setPage(1);
                          load(1, { enginId: '', chantierId: '' });
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
          <EmptyState title={t('msg.emptyMissions')} action={<Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.date')}</Th>
                <Th mac>{t('columns.engin')}</Th>
                <Th mac>{t('columns.mission')}</Th>
                <Th mac>{t('columns.chauffeur')}</Th>
                <Th mac>{t('columns.chantier')}</Th>
                <Th mac>{t('columns.requestedBy')}</Th>
                <Th mac>{t('columns.enginStatus')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr
                  key={m.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/missions/${m.id}`)}
                >
                  <Td mac className="text-[11px]">{formatDate(m.date)}</Td>
                  <Td mac>
                    {m.engin ? (
                      <Link
                        to={`/engins/${m.engin.id}`}
                        className="mac-table-ref"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {m.engin.matricule} {m.engin.brand}
                      </Link>
                    ) : '—'}
                  </Td>
                  <Td mac>{m.mission}</Td>
                  <Td mac>{m.driverName || '—'}</Td>
                  <Td mac>
                    {m.chantier ? (
                      <Link
                        to={`/chantiers/${m.chantier.id}`}
                        className="hover:text-[#007aff]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {m.chantier.name}
                      </Link>
                    ) : '—'}
                  </Td>
                  <Td mac className="mac-table-muted">{m.requestedBy || '—'}</Td>
                  <Td mac>
                    {m.engin?.status ? <StatusPill status={m.engin.status} quiet /> : '—'}
                  </Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <MacActionBtn icon={Eye} tone="blue" title={t('actions.openFiche')} onClick={() => navigate(`/missions/${m.id}`)} />
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => navigate(`/missions/${m.id}`, { state: { edit: true } })} />
                      <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteId(m.id); setDeleteMotif(''); }} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => { setPage(p); load(p); }} mac />
      </Card>

      <Modal
        open={missionOpen}
        title={t('actions.newMission')}
        onClose={() => setMissionOpen(false)}
        size="lg"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setMissionOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="mission-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="mission-form" onSubmit={createMission} className="grid gap-3 sm:grid-cols-2">
          <Select label={t('fields.enginRequiredStar')} required value={missionForm.enginId} onChange={(e) => setMissionForm({ ...missionForm, enginId: e.target.value })}>
            <option value="">{t('actions.select')}</option>
            {engins.map((e) => <option key={e.id} value={e.id}>{e.matricule} — {e.brand}</option>)}
          </Select>
          <Input label={t('fields.date')} type="date" value={missionForm.date} onChange={(e) => setMissionForm({ ...missionForm, date: e.target.value })} />
          <Input label={t('fields.missionRequiredStar')} required className="sm:col-span-2" value={missionForm.mission} onChange={(e) => setMissionForm({ ...missionForm, mission: e.target.value })} />
          <Input label={t('fields.chauffeur')} value={missionForm.driverName} onChange={(e) => setMissionForm({ ...missionForm, driverName: e.target.value })} />
          <Select label={t('fields.chantier')} value={missionForm.chantierId} onChange={(e) => setMissionForm({ ...missionForm, chantierId: e.target.value })}>
            <option value="">—</option>
            {chantiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label={t('fields.usage')} value={missionForm.usage} onChange={(e) => setMissionForm({ ...missionForm, usage: e.target.value })} />
          <Input label={t('fields.tranche')} value={missionForm.tranche} onChange={(e) => setMissionForm({ ...missionForm, tranche: e.target.value })} />
          <Input label={t('fields.requestedBy')} value={missionForm.requestedBy} onChange={(e) => setMissionForm({ ...missionForm, requestedBy: e.target.value })} />
          <Input label={t('fields.remark')} className="sm:col-span-2" value={missionForm.remark} onChange={(e) => setMissionForm({ ...missionForm, remark: e.target.value })} />
        </form>
      </Modal>

      <Modal
        open={!!deleteId}
        title={t('actions.deleteMission')}
        onClose={() => { setDeleteId(null); setDeleteMotif(''); }}
        footer={
          <>
            <Btn variant="secondary" onClick={() => { setDeleteId(null); setDeleteMotif(''); }}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.attachmentDeleteHint')}</p>
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
