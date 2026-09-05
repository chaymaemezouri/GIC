import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Pencil, Eye, Download, Printer, Trash2, Truck, Wrench, MapPin, AlertTriangle, ClipboardList,
  SlidersHorizontal, Check, ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  api, downloadCsv, downloadExcel, fetchChantierList, fetchEnginList, formatDate, type PaginatedResponse,
} from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, StatusPill, Tabs, TableWrap, Td, Th,
} from '../components/ui';
import { EnginFormFields, emptyEnginForm, enginFormToBody, enginToForm, enginOwnershipLabel, type EnginFormData } from '../components/EnginFormFields';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';

type Engin = {
  id: string;
  ownershipType?: string;
  rentalSupplier?: string;
  rentalMonthly?: number;
  brand?: string;
  genre?: string;
  matricule?: string;
  gpsNumber?: string;
  fuelLevel?: number;
  status: string;
  counterValue?: number;
  counterUnit?: string;
  insuranceExpiry?: string;
  vignetteExpiry?: string;
  visitExpiry?: string;
  authExpiry?: string;
  _count?: { missions: number; maintenances: number };
};

type Mission = {
  id: string;
  date: string;
  mission: string;
  driverName?: string;
  usage?: string;
  engin?: { id: string; brand?: string; matricule?: string; status?: string };
  chantier?: { id: string; name: string } | null;
};

type Stats = {
  total: number;
  disponibles: number;
  enMission: number;
  enMaintenance: number;
  personnel: number;
  loue: number;
  missionsTotal: number;
  maintenanceBudget: number;
  paperExpiring: number;
  paperExpired: number;
  genres: string[];
};

const PAGE_SIZE = 20;
type SortOrder = 'asc' | 'desc';
type TabId = 'parc' | 'missions' | 'rappels';

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function paperAlertClass(date?: string | null) {
  if (!date) return 'mac-table-muted';
  const d = new Date(date);
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);
  if (d < now) return 'text-gic-coral font-medium';
  if (d <= in30) return 'text-gic-amber font-medium';
  return 'mac-table-muted';
}

export default function EnginsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabId>((searchParams.get('tab') as TabId) || 'parc');
  const [items, setItems] = useState<Engin[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({
    total: 0, disponibles: 0, enMission: 0, enMaintenance: 0, personnel: 0, loue: 0,
    missionsTotal: 0,
    maintenanceBudget: 0, paperExpiring: 0, paperExpired: 0, genres: [],
  });
  const [chantiers, setChantiers] = useState<{ id: string; name: string }[]>([]);
  const [enginOptions, setEnginOptions] = useState<{ id: string; matricule?: string; brand?: string }[]>([]);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [genreFilter, setGenreFilter] = useState(searchParams.get('genre') || '');
  const [ownershipFilter, setOwnershipFilter] = useState(searchParams.get('ownershipType') || '');
  const [alertFilter, setAlertFilter] = useState(searchParams.get('alert') || 'expiring');
  const [sort, setSort] = useState(searchParams.get('sort') || 'matricule');
  const [order, setOrder] = useState<SortOrder>(searchParams.get('order') === 'desc' ? 'desc' : 'asc');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || monthStartISO());
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || new Date().toISOString().slice(0, 10));
  const [enginFilter, setEnginFilter] = useState(searchParams.get('enginId') || '');
  const [chantierFilter, setChantierFilter] = useState(searchParams.get('chantierId') || '');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [missionOpen, setMissionOpen] = useState(false);
  const [maintOpen, setMaintOpen] = useState<string | null>(null);
  const [form, setForm] = useState<EnginFormData>(emptyEnginForm());
  const [missionForm, setMissionForm] = useState({
    enginId: '', mission: '', driverName: '', chantierId: '', date: new Date().toISOString().slice(0, 10), usage: '', requestedBy: '',
  });
  const [maintForm, setMaintForm] = useState({ designation: '', budget: '', responsible: '', date: new Date().toISOString().slice(0, 10) });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildParcQuery(pageNum = page, overrides?: { status?: string; genre?: string; alert?: string; ownershipType?: string; q?: string }) {
    const qs = new URLSearchParams();
    const query = overrides?.q !== undefined ? overrides.q : q;
    if (query) qs.set('q', query);
    const st = overrides?.status !== undefined ? overrides.status : statusFilter;
    const gen = overrides?.genre !== undefined ? overrides.genre : genreFilter;
    const al = overrides?.alert !== undefined ? overrides.alert : alertFilter;
    const own = overrides?.ownershipType !== undefined ? overrides.ownershipType : ownershipFilter;
    if (st) qs.set('status', st);
    if (gen) qs.set('genre', gen);
    if (al) qs.set('alert', al);
    if (own) qs.set('ownershipType', own);
    if (sort !== 'matricule') qs.set('sort', sort);
    if (order !== 'asc') qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs;
  }

  function buildStatsQuery(overrides?: { status?: string; genre?: string; alert?: string; ownershipType?: string; q?: string }) {
    const qs = new URLSearchParams();
    const query = overrides?.q !== undefined ? overrides.q : q;
    if (query) qs.set('q', query);
    if (tab === 'rappels') {
      const al = overrides?.alert !== undefined ? overrides.alert : alertFilter;
      if (al) qs.set('alert', al);
    } else if (tab === 'parc') {
      const st = overrides?.status !== undefined ? overrides.status : statusFilter;
      const gen = overrides?.genre !== undefined ? overrides.genre : genreFilter;
      const own = overrides?.ownershipType !== undefined ? overrides.ownershipType : ownershipFilter;
      if (st) qs.set('status', st);
      if (gen) qs.set('genre', gen);
      if (own) qs.set('ownershipType', own);
    }
    return qs.toString();
  }

  function buildMissionQuery(pageNum = page) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (enginFilter) qs.set('enginId', enginFilter);
    if (chantierFilter) qs.set('chantierId', chantierFilter);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    qs.set('sort', 'date');
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs;
  }

  function loadStats(overrides?: { status?: string; genre?: string; alert?: string; ownershipType?: string; q?: string }) {
    api<Stats>(`/engins/stats?${buildStatsQuery(overrides)}`).then(setStats).catch(() => {});
  }

  function loadParc(pageNum = page, overrides?: { status?: string; genre?: string; alert?: string; ownershipType?: string; q?: string }) {
    setLoading(true);
    setError('');
    loadStats(overrides);
    api<PaginatedResponse<Engin>>(`/engins?${buildParcQuery(pageNum, overrides)}`)
      .then((res) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('msg.serverError')))
      .finally(() => setLoading(false));
  }

  function loadMissions(pageNum = page) {
    setLoading(true);
    setError('');
    api<PaginatedResponse<Mission>>(`/engins/missions?${buildMissionQuery(pageNum)}`)
      .then((res) => {
        setMissions(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('msg.serverError')))
      .finally(() => setLoading(false));
  }

  function loadRappels(pageNum = page, overrides?: { alert?: string }) {
    setLoading(true);
    setError('');
    const al = overrides?.alert !== undefined ? overrides.alert : alertFilter;
    loadStats({ alert: al });
    api<PaginatedResponse<Engin>>(`/engins?${buildParcQuery(pageNum, { alert: al })}`)
      .then((res) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('msg.serverError')))
      .finally(() => setLoading(false));
  }

  function load(pageNum = 1, overrides?: { status?: string; genre?: string; alert?: string }) {
    loadStats();
    if (tab === 'parc') loadParc(pageNum, overrides);
    else if (tab === 'missions') loadMissions(pageNum);
    else loadRappels(pageNum, overrides);
  }

  useEffect(() => {
    fetchChantierList<{ id: string; name: string }>().then(setChantiers);
    fetchEnginList<{ id: string; matricule?: string; brand?: string }>().then(setEnginOptions);
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (tab !== 'parc') qs.set('tab', tab);
    if (q) qs.set('q', q);
    if (tab === 'parc') {
      if (statusFilter) qs.set('status', statusFilter);
      if (genreFilter) qs.set('genre', genreFilter);
      if (ownershipFilter) qs.set('ownershipType', ownershipFilter);
      if (sort !== 'matricule') qs.set('sort', sort);
      if (order !== 'asc') qs.set('order', order);
    }
    if (tab === 'rappels' && alertFilter !== 'expiring') qs.set('alert', alertFilter);
    if (tab === 'missions') {
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
      if (enginFilter) qs.set('enginId', enginFilter);
      if (chantierFilter) qs.set('chantierId', chantierFilter);
    }
    if (page > 1) qs.set('page', String(page));
    setSearchParams(qs, { replace: true });
  }, [tab, q, statusFilter, genreFilter, ownershipFilter, alertFilter, sort, order, dateFrom, dateTo, enginFilter, chantierFilter, page, setSearchParams]);

  useEffect(() => {
    setPage(1);
    load(1);
  }, [tab, sort, order]);

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
    setForm(emptyEnginForm());
    setOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(e: Engin) {
    api(`/engins/${e.id}`).then((full) => {
      setEditId(e.id);
      setForm(enginToForm(full));
      setOpen(true);
    });
  }

  async function saveEngin(e: React.FormEvent) {
    e.preventDefault();
    try {
      const body = enginFormToBody(form);
      if (editId) {
        await api(`/engins/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/engins', { method: 'POST', body: JSON.stringify(body) });
      }
      setOpen(false);
      load(page);
      fetchEnginList<{ id: string; matricule?: string; brand?: string }>().then(setEnginOptions);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!deleteId || !deleteMotif.trim()) return;
    try {
      await api(`/engins/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      setDeleteId(null);
      setDeleteMotif('');
      load(page);
      fetchEnginList<{ id: string; matricule?: string; brand?: string }>().then(setEnginOptions);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function createMission(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/engins/missions', { method: 'POST', body: JSON.stringify(missionForm) });
      setMissionOpen(false);
      setMissionForm({ enginId: '', mission: '', driverName: '', chantierId: '', date: new Date().toISOString().slice(0, 10), usage: '', requestedBy: '' });
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function createMaint(e: React.FormEvent) {
    e.preventDefault();
    if (!maintOpen) return;
    try {
      await api(`/engins/${maintOpen}/maintenances`, { method: 'POST', body: JSON.stringify(maintForm) });
      setMaintOpen(null);
      setMaintForm({ designation: '', budget: '', responsible: '', date: new Date().toISOString().slice(0, 10) });
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function exportCsv() {
    if (tab === 'missions') {
      downloadCsv(`/engins/missions/export/csv?${buildMissionQuery()}`, 'missions-engins-gic.csv');
    } else {
      downloadCsv(`/engins/export/csv?${buildParcQuery()}`, 'engins-gic.csv');
    }
  }

  function exportExcel() {
    if (tab === 'missions') {
      downloadExcel(`/engins/missions/export/xlsx?${buildMissionQuery()}`, 'missions-engins-gic.xlsx');
    } else {
      downloadExcel(`/engins/export/xlsx?${buildParcQuery()}`, 'engins-gic.xlsx');
    }
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    if (tab === 'missions') {
      w.document.write(`<html><body style="font-family:sans-serif;padding:24px;font-size:12px">
        <h1>${t('nav.missions')} — GIC</h1>
        <p>Période : ${dateFrom} → ${dateTo}</p>
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
          <tr><th>${t('columns.date')}</th><th>${t('columns.engin')}</th><th>${t('columns.mission')}</th><th>${t('columns.chauffeur')}</th><th>${t('columns.chantier')}</th></tr>
          ${missions.map((m) => `<tr><td>${formatDate(m.date)}</td><td>${m.engin?.matricule || m.engin?.brand || '—'}</td><td>${m.mission}</td><td>${m.driverName || '—'}</td><td>${m.chantier?.name || '—'}</td></tr>`).join('')}
        </table>
      </body></html>`);
    } else {
      w.document.write(`<html><body style="font-family:sans-serif;padding:24px;font-size:12px">
        <h1>${t('pages.equipment')} — GIC</h1>
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
          <tr><th>${t('columns.matricule')}</th><th>${t('columns.brand')}</th><th>${t('columns.genre')}</th><th>${t('columns.status')}</th><th>${t('columns.gps')}</th><th>${t('columns.fuel')}</th></tr>
          ${items.map((e) => `<tr><td>${e.matricule || '—'}</td><td>${e.brand || '—'}</td><td>${e.genre || '—'}</td><td>${e.status}</td><td>${e.gpsNumber || '—'}</td><td>${e.fuelLevel != null ? e.fuelLevel + '%' : '—'}</td></tr>`).join('')}
        </table>
      </body></html>`);
    }
    w.document.close();
    w.print();
  }

  const statusFilters = [
    { id: '', label: t('common.all') },
    { id: 'disponible', label: t('common.availablePlural') },
    { id: 'en_mission', label: t('fields.onMission') },
    { id: 'en_maintenance', label: t('nav.maintenance') },
  ];

  const alertFilters = [
    { id: 'expiring', label: t('common.expire30d') },
    { id: 'expired', label: t('common.expiredPapers') },
    { id: '', label: t('common.allPapers') },
  ];

  const ownershipFilters = [
    { id: '', label: t('common.all') },
    { id: 'personnel', label: t('fields.ownershipPersonal') },
    { id: 'loue', label: t('fields.ownershipRented') },
  ];

  const hasActiveFilters =
    tab === 'parc'
      ? !!statusFilter || !!genreFilter || !!ownershipFilter
      : tab === 'rappels'
        ? alertFilter !== 'expiring'
        : !!enginFilter || !!chantierFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.equipment')}
        subtitle={t('pages.equipmentListSubtitle')}
        actions={
          <>
            <Link to="/missions"><Btn variant="secondary" icon={ClipboardList}>{t('nav.missions')}</Btn></Link>
            <Link to="/maintenance"><Btn variant="secondary" icon={Wrench}>{t('nav.maintenance')}</Btn></Link>
            <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={exportExcel}>{t('common.excel')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            {tab === 'parc' && <Btn icon={Plus} onClick={openCreate}>{t('actions.addEquipment')}</Btn>}
            {tab === 'missions' && <Btn icon={Plus} onClick={() => setMissionOpen(true)}>{t('actions.newMission')}</Btn>}
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('kpi.fleetTotal')} value={stats.total} icon={Truck} tone="violet" delta={t('msg.persLouesDelta', { pers: stats.personnel, loues: stats.loue })} deltaTone="muted" />
        <KpiCard title={t('kpi.onMission')} value={stats.enMission} icon={MapPin} tone="amber" delta={t('msg.maintenanceDelta', { count: stats.enMaintenance })} deltaTone="muted" />
        <KpiCard title={t('columns.missions')} value={stats.missionsTotal} icon={ClipboardList} tone="emerald" />
        <KpiCard title={t('kpi.paperAlerts')} value={stats.paperExpiring + stats.paperExpired} icon={AlertTriangle} tone="coral" delta={t('msg.expiredDelta', { count: stats.paperExpired })} deltaTone="muted" />
      </div>

      <Card padding={false} className="mb-0 overflow-visible">
        <div className="px-3 pt-3">
          <Tabs
            mac
            active={tab}
            onChange={(id) => { setTab(id); setShowFilters(false); }}
            tabs={[
              { id: 'parc', label: t('common.parc') },
              { id: 'missions', label: t('nav.missions') },
              { id: 'rappels', label: t('tabs.paperReminders') },
            ]}
          />
        </div>

        <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
          <div className="mac-filters-row">
            <div className="mac-filters-toolbar">
              <MacSearch
                value={q}
                onChange={setQ}
                onSubmit={() => { setPage(1); load(1); }}
                placeholder={tab === 'missions' ? t('msg.searchMission') : t('msg.searchEquipment')}
              />
              {tab === 'missions' && (
                <>
                  <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('fields.from')} className="w-36 shrink-0" />
                  <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('fields.to')} className="w-36 shrink-0" />
                  <MacSelect
                    value={enginFilter}
                    onChange={setEnginFilter}
                    options={[
                      { value: '', label: t('common.allEquipment') },
                      ...enginOptions.map((e) => ({ value: e.id, label: e.matricule || e.brand || e.id })),
                    ]}
                    className="w-40 shrink-0"
                  />
                  <MacSelect
                    value={chantierFilter}
                    onChange={setChantierFilter}
                    options={[
                      { value: '', label: t('common.allSites') },
                      ...chantiers.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                    className="w-40 shrink-0"
                  />
                </>
              )}
              {tab === 'parc' && (
                <>
                  <MacSelect
                    value={sort}
                    onChange={setSort}
                    options={[
                      { value: 'matricule', label: t('fields.matricule') },
                      { value: 'brand', label: t('fields.brand') },
                      { value: 'status', label: t('common.status') },
                      { value: 'fuelLevel', label: t('tabs.fuel') },
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
                </>
              )}
              {(tab === 'parc' || tab === 'rappels') && (
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
                      {tab === 'parc' && (
                        <>
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
                                loadParc(1, { status: f.id });
                              }}
                            >
                              <span>{f.label}</span>
                              {statusFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                            </button>
                          ))}
                          {stats.genres.length > 0 && (
                            <>
                              <div className="mac-filter-menu-sep" />
                              <p className="mac-filter-menu-section">{t('fields.genre')}</p>
                              <button
                                type="button"
                                role="menuitem"
                                className={`mac-filter-menu-item${genreFilter === '' ? ' mac-filter-menu-item-active' : ''}`}
                                onClick={() => {
                                  setGenreFilter('');
                                  setPage(1);
                                  loadParc(1, { genre: '' });
                                }}
                              >
                                <span>Tous</span>
                                {genreFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                              </button>
                              {stats.genres.map((g) => (
                                <button
                                  key={g}
                                  type="button"
                                  role="menuitem"
                                  className={`mac-filter-menu-item${genreFilter === g ? ' mac-filter-menu-item-active' : ''}`}
                                  onClick={() => {
                                    setGenreFilter(g);
                                    setPage(1);
                                    loadParc(1, { genre: g });
                                  }}
                                >
                                  <span>{g}</span>
                                  {genreFilter === g && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                                </button>
                              ))}
                            </>
                          )}
                          <div className="mac-filter-menu-sep" />
                          <p className="mac-filter-menu-section">Propriété</p>
                          {ownershipFilters.map((f) => (
                            <button
                              key={f.id || 'all-ownership'}
                              type="button"
                              role="menuitem"
                              className={`mac-filter-menu-item${ownershipFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                              onClick={() => {
                                setOwnershipFilter(f.id);
                                setPage(1);
                                loadParc(1, { ownershipType: f.id });
                              }}
                            >
                              <span>{f.label}</span>
                              {ownershipFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
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
                                  setGenreFilter('');
                                  setOwnershipFilter('');
                                  setPage(1);
                                  loadParc(1, { status: '', genre: '', ownershipType: '' });
                                  setShowFilters(false);
                                }}
                              >
                                Réinitialiser
                              </button>
                            </>
                          )}
                        </>
                      )}
                      {tab === 'rappels' && (
                        <>
                          <p className="mac-filter-menu-section">{t('common.alerts')}</p>
                          {alertFilters.map((f) => (
                            <button
                              key={f.id || 'all-alert'}
                              type="button"
                              role="menuitem"
                              className={`mac-filter-menu-item${alertFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                              onClick={() => {
                                setAlertFilter(f.id);
                                setPage(1);
                                loadRappels(1, { alert: f.id });
                              }}
                            >
                              <span>{f.label}</span>
                              {alertFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              <Btn variant="secondary" onClick={() => { setPage(1); load(1); }}>{t('common.filter')}</Btn>
            </div>
          </div>
        </div>
      </Card>

      {error && (
        <Card className="mb-4 border-gic-coral/40 bg-gic-coral-soft/30">
          <p className="text-[12px] text-gic-coral font-medium">{error}</p>
          <Btn variant="secondary" className="mt-2" onClick={() => load(page)}>{t('common.retry')}</Btn>
        </Card>
      )}

      <Card padding={false}>
        {loading ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : tab === 'missions' ? (
          missions.length === 0 ? (
            <EmptyState title={t('msg.emptyMissions')} action={<Btn icon={Plus} onClick={() => setMissionOpen(true)}>{t('actions.newMission')}</Btn>} />
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.date')}</Th>
                  <Th mac>{t('columns.engin')}</Th>
                  <Th mac>{t('columns.mission')}</Th>
                  <Th mac>{t('columns.chauffeur')}</Th>
                  <Th mac>{t('columns.chantier')}</Th>
                  <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {missions.map((m) => (
                  <tr
                    key={m.id}
                    className="cursor-pointer"
                    onClick={() => m.engin?.id && navigate(`/engins/${m.engin.id}`)}
                  >
                    <Td mac className="text-[11px]">{formatDate(m.date)}</Td>
                    <Td mac>
                      {m.engin ? (
                        <Link to={`/engins/${m.engin.id}`} className="mac-table-ref">
                          {m.engin.matricule || m.engin.brand}
                        </Link>
                      ) : '—'}
                    </Td>
                    <Td mac>{m.mission}</Td>
                    <Td mac>{m.driverName || '—'}</Td>
                    <Td mac>
                      {m.chantier ? (
                        <Link to={`/chantiers/${m.chantier.id}`} className="hover:text-[#007aff]">{m.chantier.name}</Link>
                      ) : '—'}
                    </Td>
                    <Td mac className="mac-td-actions">
                      {m.engin && (
                        <div className="mac-actions">
                          <Link to={`/engins/${m.engin.id}`} className="mac-action-btn mac-action-btn-blue" title={t('actions.viewEquipment')}>
                            <Eye size={14} strokeWidth={2.15} />
                          </Link>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )
        ) : tab === 'rappels' ? (
          items.length === 0 ? (
            <EmptyState title={t('msg.emptyPaperAlerts')} />
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.engin')}</Th>
                  <Th mac>{t('columns.assurance')}</Th>
                  <Th mac>{t('columns.vignette')}</Th>
                  <Th mac>{t('columns.visite')}</Th>
                  <Th mac>{t('columns.autorisation')}</Th>
                  <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/engins/${e.id}`)}
                  >
                    <Td mac>
                      <Link to={`/engins/${e.id}`} className="mac-table-ref">{e.matricule || e.brand}</Link>
                      <span className="block text-[10px] mac-table-muted">{e.genre || '—'}</span>
                    </Td>
                    <Td mac className={`text-[11px] ${paperAlertClass(e.insuranceExpiry)}`}>{formatDate(e.insuranceExpiry)}</Td>
                    <Td mac className={`text-[11px] ${paperAlertClass(e.vignetteExpiry)}`}>{formatDate(e.vignetteExpiry)}</Td>
                    <Td mac className={`text-[11px] ${paperAlertClass(e.visitExpiry)}`}>{formatDate(e.visitExpiry)}</Td>
                    <Td mac className={`text-[11px] ${paperAlertClass(e.authExpiry)}`}>{formatDate(e.authExpiry)}</Td>
                    <Td mac className="mac-td-actions">
                      <div className="mac-actions">
                        <Link to={`/engins/${e.id}`} className="mac-action-btn mac-action-btn-blue" title={t('actions.viewFiche')}>
                          <Eye size={14} strokeWidth={2.15} />
                        </Link>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )
        ) : items.length === 0 ? (
          <EmptyState title={t('msg.emptyEquipment')} action={<Btn icon={Plus} onClick={openCreate}>{t('actions.addEquipment')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.matricule')}</Th>
                <Th mac>{t('columns.brandGenre')}</Th>
                <Th mac>{t('columns.ownership')}</Th>
                <Th mac>{t('columns.gps')}</Th>
                <Th mac>{t('columns.counter')}</Th>
                <Th mac>{t('columns.fuel')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac>{t('columns.missions')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr
                  key={e.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/engins/${e.id}`)}
                >
                  <Td mac>
                    <Link to={`/engins/${e.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{e.matricule || '—'}</Link>
                  </Td>
                  <Td mac>
                    {e.brand || '—'}
                    {e.genre && <span className="block text-[10px] mac-table-muted">{e.genre}</span>}
                  </Td>
                  <Td mac>
                    <span className={`mac-chip ${e.ownershipType === 'loue' ? 'mac-chip-orange' : 'mac-chip-blue'}`}>
                      {enginOwnershipLabel(e.ownershipType, t)}
                    </span>
                    {e.ownershipType === 'loue' && e.rentalSupplier && (
                      <span className="block text-[10px] mac-table-muted mt-0.5">{e.rentalSupplier}</span>
                    )}
                  </Td>
                  <Td mac className="mac-table-muted text-[11px]">{e.gpsNumber || '—'}</Td>
                  <Td mac className="text-[11px]">{e.counterValue != null ? `${e.counterValue} ${e.counterUnit || ''}` : '—'}</Td>
                  <Td mac>{e.fuelLevel != null ? `${e.fuelLevel}%` : '—'}</Td>
                  <Td mac>
                    <StatusPill status={e.status} quiet />
                  </Td>
                  <Td mac>
                    <span className="mac-chip mac-chip-blue">{e._count?.missions ?? 0}</span>
                  </Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <Link to={`/engins/${e.id}`} className="mac-action-btn mac-action-btn-blue" title={t('common.view')}>
                        <Eye size={14} strokeWidth={2.15} />
                      </Link>
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(e)} />
                      <MacActionBtn icon={Wrench} tone="teal" title={t('nav.maintenance')} onClick={() => setMaintOpen(e.id)} />
                      <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteId(e.id); setDeleteMotif(''); }} />
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
        size="lg"
        title={editId ? t('actions.editEquipment') : t('actions.newEquipment')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="engin-form" type="submit">{editId ? t('common.save') : t('common.create')}</Btn>
          </>
        }
      >
        <form id="engin-form" onSubmit={saveEngin}><EnginFormFields form={form} setForm={setForm} /></form>
      </Modal>

      <Modal
        open={!!deleteId}
        title={t('actions.deleteEquipment')}
        onClose={() => setDeleteId(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.confirm')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">Motif obligatoire (RG audit GIC).</p>
        <Input label={t('msg.motifStar')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>

      <Modal
        open={missionOpen}
        title={t('actions.newMission')}
        onClose={() => setMissionOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setMissionOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="mission-form" type="submit">{t('common.add')}</Btn>
          </>
        }
      >
        <form id="mission-form" onSubmit={createMission} className="grid gap-3">
          <Select label={t('fields.enginRequiredStar')} required value={missionForm.enginId} onChange={(e) => setMissionForm({ ...missionForm, enginId: e.target.value })}>
            <option value="">—</option>
            {enginOptions.map((e) => <option key={e.id} value={e.id}>{e.matricule} {e.brand}</option>)}
          </Select>
          <Input label={t('common.date')} type="date" value={missionForm.date} onChange={(e) => setMissionForm({ ...missionForm, date: e.target.value })} />
          <Input label={t('fields.missionRequired')} required value={missionForm.mission} onChange={(e) => setMissionForm({ ...missionForm, mission: e.target.value })} />
          <Input label={t('fields.chauffeur')} value={missionForm.driverName} onChange={(e) => setMissionForm({ ...missionForm, driverName: e.target.value })} />
          <Input label={t('fields.usage')} value={missionForm.usage} onChange={(e) => setMissionForm({ ...missionForm, usage: e.target.value })} />
          <Input label={t('fields.requestedBy')} value={missionForm.requestedBy} onChange={(e) => setMissionForm({ ...missionForm, requestedBy: e.target.value })} />
          <Select label={t('fields.chantier')} value={missionForm.chantierId} onChange={(e) => setMissionForm({ ...missionForm, chantierId: e.target.value })}>
            <option value="">—</option>
            {chantiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </form>
      </Modal>

      <Modal
        open={!!maintOpen}
        title={t('actions.registerMaintenance')}
        onClose={() => setMaintOpen(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setMaintOpen(null)}>{t('common.cancel')}</Btn>
            <Btn form="maint-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="maint-form" onSubmit={createMaint} className="grid gap-3">
          <Input label={t('common.date')} type="date" value={maintForm.date} onChange={(e) => setMaintForm({ ...maintForm, date: e.target.value })} />
          <Input label={t('fields.designationRequired')} required value={maintForm.designation} onChange={(e) => setMaintForm({ ...maintForm, designation: e.target.value })} />
          <Input label={t('fields.budgetMad')} value={maintForm.budget} onChange={(e) => setMaintForm({ ...maintForm, budget: e.target.value })} />
          <Input label={t('fields.responsible')} value={maintForm.responsible} onChange={(e) => setMaintForm({ ...maintForm, responsible: e.target.value })} />
        </form>
      </Modal>
    </div>
  );
}
