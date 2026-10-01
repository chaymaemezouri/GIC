import { fetchAllRows, printRows, type PrintColumn } from '../lib/listPrint';
import { appAlert } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Pencil, Eye, Download, Printer, Trash2, Truck, Wrench, Activity, AlertTriangle, ClipboardList,
  SlidersHorizontal, Check, ArrowUp, ArrowDown, CheckCircle2,
} from 'lucide-react';
import {
  api, downloadCsv, downloadExcel, fetchChantierList, formatDate, formatMad, type PaginatedResponse,
} from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, Tabs, TableWrap, Td, Th,
} from '../components/ui';
import { EnginFormFields, emptyEnginForm, enginFormToBody, enginToForm, type EnginFormData } from '../components/EnginFormFields';
import { DeleteMotifModal, FleetStatusPill, invalidateFleetRefs, useFleetRefs } from '../components/engins/FleetCommon';
import { MaintenanceModal } from '../components/engins/MaintenanceModal';
import { SelectAllTh, SelectTd, SelectionBar } from '../components/RowSelection';
import {
  ENGIN_STATUSES, chantierTrancheLabel, enginLabel, errorMessage, fleetStatusLabel, formatMad2, kindLabel, ownershipLabel,
} from '../lib/engins';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useRowSelection } from '../hooks/useRowSelection';
import { useI18n } from '../i18n/I18nContext';

type Engin = {
  id: string;
  code?: string | null;
  designation?: string | null;
  kind?: string | null;
  label?: string;
  ownershipType?: string;
  rentalSupplier?: string | null;
  rentalSupplierRef?: { id: string; companyName: string } | null;
  rentalContractRef?: string | null;
  rentalPrice?: number | null;
  rentalUnit?: string | null;
  rentalStart?: string | null;
  rentalEnd?: string | null;
  purchasePrice?: number | null;
  acquisitionDate?: string | null;
  depreciationYears?: number | null;
  brand?: string | null;
  genre?: string | null;
  model?: string | null;
  matricule?: string | null;
  location?: string | null;
  status: string;
  counterValue?: number | null;
  counterUnit?: string | null;
  insuranceExpiry?: string | null;
  vignetteExpiry?: string | null;
  visitExpiry?: string | null;
  authExpiry?: string | null;
  currentAssignment?: { id: string; chantierId: string | null; chantierName: string | null; tranche: string | null; startDate: string; endDate: string | null } | null;
  costInfo?: { dailyRate?: number | null; annualDepreciation?: number; dailyDepreciation?: number; netBookValue?: number | null };
  quantity?: number | null;
  _count?: { missions: number; maintenances: number; assignments: number };
};

type Mission = {
  id: string;
  date: string;
  mission: string;
  driverName?: string;
  usage?: string;
  engin?: { id: string; code?: string | null; designation?: string | null; brand?: string; matricule?: string; status?: string };
  chantier?: { id: string; name: string } | null;
};

type Stats = {
  total: number;
  disponibles: number;
  affectes: number;
  enMaintenance: number;
  horsService: number;
  materiels: number;
  enginsCount: number;
  personnel: number;
  loue: number;
  missionsTotal: number;
  paperExpiring: number;
  paperExpired: number;
  genres: string[];
};

type View = '' | 'acquisitions' | 'locations';
type KindParam = '' | 'engin' | 'materiel';

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

/** Les entrées de menu (référentiels, acquisitions, locations) partagent cette page : on remonte l’état à chaque changement de vue. */
export default function EnginsPage() {
  const [searchParams] = useSearchParams();
  const kind = (searchParams.get('kind') || '') as KindParam;
  const view = (searchParams.get('view') || '') as View;
  return <EnginsView key={`${kind}|${view}`} kind={kind} view={view} />;
}

function EnginsView({ kind, view }: { kind: KindParam; view: View }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { engins: enginOptions } = useFleetRefs();
  const fixedOwnership = view === 'acquisitions' ? 'personnel' : view === 'locations' ? 'loue' : '';
  const [tab, setTab] = useState<TabId>((searchParams.get('tab') as TabId) || 'parc');
  const [items, setItems] = useState<Engin[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({
    total: 0, disponibles: 0, affectes: 0, enMaintenance: 0, horsService: 0, materiels: 0, enginsCount: 0,
    personnel: 0, loue: 0, missionsTotal: 0, paperExpiring: 0, paperExpired: 0, genres: [],
  });
  const [chantiers, setChantiers] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [genreFilter, setGenreFilter] = useState(searchParams.get('genre') || '');
  const [ownershipFilter, setOwnershipFilter] = useState(fixedOwnership || searchParams.get('ownershipType') || '');
  const [alertFilter, setAlertFilter] = useState(searchParams.get('alert') || 'expiring');
  const [sort, setSort] = useState(searchParams.get('sort') || 'code');
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
  const [missionOpen, setMissionOpen] = useState(false);
  const [maintEnginId, setMaintEnginId] = useState<string | null>(null);
  const [form, setForm] = useState<EnginFormData>(emptyEnginForm(kind || 'engin', fixedOwnership === 'loue' ? 'loue' : 'personnel'));
  const [missionForm, setMissionForm] = useState({
    enginId: '', mission: '', driverName: '', chantierId: '', date: new Date().toISOString().slice(0, 10), usage: '', requestedBy: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const parcSelection = useRowSelection<Engin>();
  const rappelsSelection = useRowSelection<Engin>();
  const missionSelection = useRowSelection<Mission>();

  type Overrides = { status?: string; genre?: string; alert?: string; ownershipType?: string; q?: string };

  function baseEnginParams(overrides?: Overrides) {
    const qs = new URLSearchParams();
    const query = overrides?.q !== undefined ? overrides.q : q;
    if (query) qs.set('q', query);
    if (kind) qs.set('kind', kind);
    const own = fixedOwnership || (overrides?.ownershipType !== undefined ? overrides.ownershipType : ownershipFilter);
    if (own) qs.set('ownershipType', own);
    return qs;
  }

  function buildParcQuery(pageNum = page, overrides?: Overrides) {
    const qs = baseEnginParams(overrides);
    const st = overrides?.status !== undefined ? overrides.status : statusFilter;
    const gen = overrides?.genre !== undefined ? overrides.genre : genreFilter;
    if (st) qs.set('status', st);
    if (gen) qs.set('genre', gen);
    if (overrides?.alert) qs.set('alert', overrides.alert);
    if (sort !== 'matricule') qs.set('sort', sort);
    if (order !== 'asc') qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs;
  }

  function buildStatsQuery(overrides?: Overrides) {
    const qs = baseEnginParams(overrides);
    if (tab === 'rappels') {
      const al = overrides?.alert !== undefined ? overrides.alert : alertFilter;
      if (al) qs.set('alert', al);
    } else if (tab === 'parc') {
      const st = overrides?.status !== undefined ? overrides.status : statusFilter;
      const gen = overrides?.genre !== undefined ? overrides.genre : genreFilter;
      if (st) qs.set('status', st);
      if (gen) qs.set('genre', gen);
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
    qs.set('order', 'desc');
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs;
  }

  function loadStats(overrides?: Overrides) {
    api<Stats>(`/engins/stats?${buildStatsQuery(overrides)}`).then(setStats).catch(() => {});
  }

  function loadList(qs: URLSearchParams) {
    setLoading(true);
    setError('');
    api<PaginatedResponse<Engin>>(`/engins?${qs}`)
      .then((res) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
      })
      .catch((err) => setError(errorMessage(err, t('msg.serverError'))))
      .finally(() => setLoading(false));
  }

  function loadParc(pageNum = page, overrides?: Overrides) {
    loadStats(overrides);
    loadList(buildParcQuery(pageNum, overrides));
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
      .catch((err) => setError(errorMessage(err, t('msg.serverError'))))
      .finally(() => setLoading(false));
  }

  function loadRappels(pageNum = page, overrides?: { alert?: string }) {
    const al = overrides?.alert !== undefined ? overrides.alert : alertFilter;
    loadStats({ alert: al });
    loadList(buildParcQuery(pageNum, { alert: al, status: '', genre: '' }));
  }

  function load(pageNum = 1, overrides?: Overrides) {
    if (tab === 'parc') loadParc(pageNum, overrides);
    else if (tab === 'missions') {
      loadStats();
      loadMissions(pageNum);
    } else loadRappels(pageNum, overrides);
  }

  useEffect(() => {
    fetchChantierList<{ id: string; name: string }>().then(setChantiers);
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (kind) qs.set('kind', kind);
    if (view) qs.set('view', view);
    if (tab !== 'parc') qs.set('tab', tab);
    if (q) qs.set('q', q);
    if (tab === 'parc') {
      if (statusFilter) qs.set('status', statusFilter);
      if (genreFilter) qs.set('genre', genreFilter);
      if (ownershipFilter && !fixedOwnership) qs.set('ownershipType', ownershipFilter);
      if (sort !== 'code') qs.set('sort', sort);
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
  }, [kind, view, fixedOwnership, tab, q, statusFilter, genreFilter, ownershipFilter, alertFilter, sort, order, dateFrom, dateTo, enginFilter, chantierFilter, page, setSearchParams]);

  useEffect(() => {
    setPage(1);
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setForm(emptyEnginForm(kind || 'engin', fixedOwnership === 'loue' ? 'loue' : 'personnel'));
    setOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(e: Engin) {
    api<Record<string, unknown>>(`/engins/${e.id}`).then((full) => {
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
      invalidateFleetRefs();
      load(page);
    } catch (err) {
      await appAlert(errorMessage(err, t('common.error')));
    }
  }

  async function confirmDelete(motif: string) {
    if (!deleteId) return;
    try {
      await api(`/engins/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ motif }) });
      setDeleteId(null);
      invalidateFleetRefs();
      load(page);
    } catch (err) {
      await appAlert(errorMessage(err, t('common.error')));
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
      await appAlert(errorMessage(err, t('common.error')));
    }
  }

  const fileBase = view === 'locations' ? 'engins-loues-gic' : view === 'acquisitions' ? 'engins-proprietes-gic' : kind === 'materiel' ? 'materiels-gic' : 'engins-gic';

  function exportCsv() {
    if (tab === 'missions') downloadCsv(`/engins/missions/export/csv?${buildMissionQuery()}`, 'missions-engins-gic.csv');
    else downloadCsv(`/engins/export/csv?${buildParcQuery()}`, `${fileBase}.csv`);
  }

  function exportExcel() {
    if (tab === 'missions') downloadExcel(`/engins/missions/export/xlsx?${buildMissionQuery()}`, 'missions-engins-gic.xlsx');
    else downloadExcel(`/engins/export/xlsx?${buildParcQuery()}`, `${fileBase}.xlsx`);
  }

  function rentalCost(e: Engin) {
    if (!e.rentalPrice) return '—';
    return `${formatMad(e.rentalPrice)} / ${t(`fleet.rentalUnit.${e.rentalUnit || 'mois'}`)}`;
  }

  function dailyCost(e: Engin) {
    if (e.ownershipType === 'loue') return e.costInfo?.dailyRate != null ? formatMad2(e.costInfo.dailyRate) : '—';
    return e.costInfo?.dailyDepreciation ? formatMad2(e.costInfo.dailyDepreciation) : '—';
  }

  const title =
    view === 'acquisitions' ? t('fleet.nav.acquisitions')
      : view === 'locations' ? t('fleet.nav.locations')
        : kind === 'materiel' ? t('fleet.nav.referentielMateriels')
          : kind === 'engin' ? t('fleet.nav.referentielEngins')
            : t('pages.equipment');
  const subtitle =
    view === 'acquisitions' ? t('fleet.pages.acquisitionsSubtitle')
      : view === 'locations' ? t('fleet.pages.locationsSubtitle')
        : kind === 'materiel' ? t('fleet.pages.materielsSubtitle')
          : t('pages.equipmentListSubtitle');

  function dailyCostValue(e: Engin) {
    return (e.ownershipType === 'loue' ? e.costInfo?.dailyRate : e.costInfo?.dailyDepreciation) || 0;
  }

  function sumMad(rows: Engin[], pick: (e: Engin) => number | null | undefined) {
    return formatMad(rows.reduce((s, e) => s + (pick(e) || 0), 0));
  }

  function printList() {
    const own = fixedOwnership || ownershipFilter;
    const baseFilters: [string, unknown][] = [
      [t('listPrint.search'), q],
      [t('fleet.fields.kind'), kind && kindLabel(kind, t)],
      [t('fleet.fields.mode'), own && ownershipLabel(own, t)],
    ];
    const sortFilter: [string, unknown] = [
      t('listPrint.sort'),
      `${sortOptions.find((o) => o.value === sort)?.label || sort} (${order === 'asc' ? t('msg.ascending') : t('msg.descending')})`,
    ];

    if (tab === 'missions') {
      printRows<Mission>({
        title: t('nav.missions'),
        filters: [
          [t('listPrint.search'), q],
          [t('listPrint.period'), dateFrom || dateTo ? `${dateFrom ? formatDate(dateFrom) : '…'} → ${dateTo ? formatDate(dateTo) : '…'}` : ''],
          [t('columns.engin'), enginFilter && enginLabel(enginOptions.find((e) => e.id === enginFilter))],
          [t('columns.chantier'), chantierFilter && chantiers.find((c) => c.id === chantierFilter)?.name],
        ],
        columns: [
          { label: t('columns.date'), value: (m) => formatDate(m.date) },
          { label: t('columns.engin'), value: (m) => (m.engin ? enginLabel(m.engin) : '') },
          { label: t('columns.mission'), value: (m) => m.mission },
          { label: t('columns.chauffeur'), value: (m) => m.driverName },
          { label: t('columns.chantier'), value: (m) => m.chantier?.name },
        ],
        rows: missionSelection.count ? missionSelection.rows : () => fetchAllRows<Mission>('/engins/missions', buildMissionQuery(1)),
        selectedCount: missionSelection.count,
      });
      return;
    }

    if (tab === 'rappels') {
      printRows<Engin>({
        title,
        subtitle: t('tabs.paperReminders'),
        filters: [
          ...baseFilters,
          [t('common.alerts'), alertFilters.find((f) => f.id === alertFilter)?.label],
          sortFilter,
        ],
        columns: [
          { label: t('columns.engin'), value: (e) => enginLabel(e) },
          { label: t('fields.matricule'), value: (e) => e.matricule || e.genre },
          { label: t('columns.assurance'), value: (e) => formatDate(e.insuranceExpiry) },
          { label: t('columns.vignette'), value: (e) => formatDate(e.vignetteExpiry) },
          { label: t('columns.visite'), value: (e) => formatDate(e.visitExpiry) },
          { label: t('columns.autorisation'), value: (e) => formatDate(e.authExpiry) },
        ],
        rows: rappelsSelection.count
          ? rappelsSelection.rows
          : () => fetchAllRows<Engin>('/engins', buildParcQuery(1, { alert: alertFilter, status: '', genre: '' })),
        selectedCount: rappelsSelection.count,
      });
      return;
    }

    const columns: PrintColumn<Engin>[] = [
      { label: t('fleet.fields.code'), value: (e) => e.code },
      { label: t('fields.matricule'), value: (e) => e.matricule },
      { label: t('fleet.fields.designation'), value: (e) => e.designation || [e.genre, e.brand].filter(Boolean).join(' ') },
      ...(!kind ? [{ label: t('fleet.fields.kind'), value: (e: Engin) => kindLabel(e.kind, t) }] : []),
      ...(!view
        ? [{
          label: t('fleet.fields.mode'),
          value: (e: Engin) => [
            ownershipLabel(e.ownershipType, t),
            e.ownershipType === 'loue' ? e.rentalSupplierRef?.companyName || e.rentalSupplier : '',
          ].filter(Boolean).join(' — '),
        }]
        : []),
      ...(view === 'acquisitions'
        ? [
          {
            label: t('fleet.fields.purchasePrice'),
            value: (e: Engin) => (e.purchasePrice != null ? formatMad(e.purchasePrice) : ''),
            align: 'right' as const,
            total: (rows: Engin[]) => sumMad(rows, (e) => e.purchasePrice),
          },
          {
            label: t('fleet.fields.acquisitionDate'),
            value: (e: Engin) => [
              e.acquisitionDate ? formatDate(e.acquisitionDate) : '',
              e.depreciationYears ? t('fleet.hints.overYears', { years: e.depreciationYears }) : '',
            ].filter(Boolean).join(' — '),
          },
          {
            label: t('fleet.fields.annualDepreciation'),
            value: (e: Engin) => (e.costInfo?.annualDepreciation ? formatMad(e.costInfo.annualDepreciation) : ''),
            align: 'right' as const,
            total: (rows: Engin[]) => sumMad(rows, (e) => e.costInfo?.annualDepreciation),
          },
          {
            label: t('fleet.fields.netBookValue'),
            value: (e: Engin) => (e.costInfo?.netBookValue != null ? formatMad(e.costInfo.netBookValue) : ''),
            align: 'right' as const,
            total: (rows: Engin[]) => sumMad(rows, (e) => e.costInfo?.netBookValue),
          },
        ]
        : []),
      ...(view === 'locations'
        ? [
          { label: t('fleet.fields.rentalSupplier'), value: (e: Engin) => e.rentalSupplierRef?.companyName || e.rentalSupplier },
          { label: t('fleet.fields.rentalContract'), value: (e: Engin) => e.rentalContractRef },
          { label: t('fleet.fields.rentalPrice'), value: (e: Engin) => rentalCost(e), align: 'right' as const },
          {
            label: t('fleet.fields.rentalPeriod'),
            value: (e: Engin) => `${e.rentalStart ? formatDate(e.rentalStart) : '—'} → ${e.rentalEnd ? formatDate(e.rentalEnd) : '…'}`,
          },
        ]
        : []),
      { label: t('fleet.fields.status'), value: (e) => fleetStatusLabel(e.status, t) },
      {
        label: t('fleet.fields.currentAssignment'),
        value: (e) => (e.currentAssignment
          ? `${chantierTrancheLabel(e.currentAssignment.chantierName, e.currentAssignment.tranche)} — ${t('fleet.hints.since', { date: formatDate(e.currentAssignment.startDate) })}`
          : ''),
      },
      {
        label: t('fleet.fields.dailyCost'),
        value: (e) => dailyCost(e),
        align: 'right',
        total: (rows) => formatMad2(rows.reduce((s, e) => s + dailyCostValue(e), 0)),
      },
    ];

    printRows<Engin>({
      title,
      filters: [
        ...baseFilters,
        [t('listPrint.status'), statusFilter && t(`fleet.status.${statusFilter}`)],
        [t('fleet.fields.type'), genreFilter],
        sortFilter,
      ],
      columns,
      rows: parcSelection.count ? parcSelection.rows : () => fetchAllRows<Engin>('/engins', buildParcQuery(1)),
      selectedCount: parcSelection.count,
    });
  }

  const sortOptions = [
    { value: 'code', label: t('fleet.fields.code') },
    { value: 'designation', label: t('fleet.fields.designation') },
    { value: 'matricule', label: t('fields.matricule') },
    { value: 'status', label: t('common.status') },
    { value: 'createdAt', label: t('fleet.filters.recent') },
  ];

  const statusFilters = [{ id: '', label: t('common.all') }, ...ENGIN_STATUSES.map((s) => ({ id: s, label: t(`fleet.status.${s}`) }))];

  const alertFilters = [
    { id: 'expiring', label: t('common.expire30d') },
    { id: 'expired', label: t('common.expiredPapers') },
    { id: '', label: t('common.allPapers') },
  ];

  const ownershipFilters = [
    { id: '', label: t('common.all') },
    { id: 'personnel', label: t('fleet.ownership.personnel') },
    { id: 'loue', label: t('fleet.ownership.loue') },
  ];

  const hasActiveFilters =
    tab === 'parc'
      ? !!statusFilter || !!genreFilter || (!fixedOwnership && !!ownershipFilter)
      : tab === 'rappels'
        ? alertFilter !== 'expiring'
        : !!enginFilter || !!chantierFilter;

  const tabs = [
    { id: 'parc', label: view === 'locations' ? t('fleet.tabs.contracts') : view === 'acquisitions' ? t('fleet.tabs.assets') : t('common.parc') },
    ...(kind !== 'materiel' && !view ? [{ id: 'missions', label: t('nav.missions') }] : []),
    { id: 'rappels', label: t('tabs.paperReminders') },
  ];

  const addLabel = kind === 'materiel' ? t('fleet.actions.addMateriel') : view === 'locations' ? t('fleet.actions.addRental') : t('actions.addEquipment');

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={title}
        subtitle={subtitle}
        backTo={false}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={exportExcel}>{t('common.excel')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            {tab === 'parc' && <Btn icon={Plus} onClick={openCreate}>{addLabel}</Btn>}
            {tab === 'missions' && <Btn icon={Plus} onClick={() => setMissionOpen(true)}>{t('actions.newMission')}</Btn>}
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard
          title={kind === 'materiel' ? t('fleet.kpi.materiels') : t('kpi.fleetTotal')}
          value={stats.total}
          icon={Truck}
          tone="violet"
          delta={view ? undefined : t('fleet.kpi.enginsMaterielsDelta', { engins: stats.enginsCount, materiels: stats.materiels, loues: stats.loue })}
          deltaTone="muted"
        />
        <KpiCard title={t('fleet.kpi.available')} value={stats.disponibles} icon={CheckCircle2} tone="emerald" />
        <KpiCard title={t('fleet.kpi.assigned')} value={stats.affectes} icon={Activity} tone="amber" delta={t('fleet.kpi.repairShortDelta', { count: stats.enMaintenance })} deltaTone="muted" />
        <KpiCard title={t('kpi.paperAlerts')} value={stats.paperExpiring + stats.paperExpired} icon={AlertTriangle} tone="coral" delta={t('msg.expiredDelta', { count: stats.paperExpired })} deltaTone="muted" />
      </div>

      <Card padding={false} className="mb-0 overflow-visible">
        <div className="px-3 pt-3">
          <Tabs mac active={tab} onChange={(id) => { setTab(id as TabId); setShowFilters(false); }} tabs={tabs} />
        </div>

        <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
          <div className="mac-filters-row">
            <div className="mac-filters-toolbar">
              <MacSearch
                value={q}
                onChange={setQ}
                onSubmit={() => { setPage(1); load(1); }}
                placeholder={tab === 'missions' ? t('msg.searchMission') : t('fleet.filters.searchEngin')}
              />
              {tab === 'missions' && (
                <>
                  <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('fields.from')} className="w-36 shrink-0"  onSubmit={() => { setPage(1); load(1); }}/>
                  <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('fields.to')} className="w-36 shrink-0"  onSubmit={() => { setPage(1); load(1); }}/>
                  <MacSelect
                    value={enginFilter}
                    onChange={setEnginFilter}
                    options={[{ value: '', label: t('common.allEquipment') }, ...enginOptions.map((e) => ({ value: e.id, label: enginLabel(e) }))]}
                    className="w-48 shrink-0"
                  />
                  <MacSelect
                    value={chantierFilter}
                    onChange={setChantierFilter}
                    options={[{ value: '', label: t('common.allSites') }, ...chantiers.map((c) => ({ value: c.id, label: c.name }))]}
                    className="w-40 shrink-0"
                  />
                </>
              )}
              {tab === 'parc' && (
                <>
                  <MacSelect
                    value={statusFilter}
                    onChange={(v) => { setStatusFilter(v); setPage(1); loadParc(1, { status: v }); }}
                    options={statusFilters.map((f) => ({ value: f.id, label: f.id ? f.label : t('fleet.filters.allStatuses') }))}
                    className="w-40 shrink-0"
                  />
                  <MacSelect
                    value={sort}
                    onChange={setSort}
                    options={sortOptions}
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
                          {stats.genres.length > 0 && (
                            <>
                              <p className="mac-filter-menu-section">{t('fleet.fields.type')}</p>
                              {['', ...stats.genres].map((g) => (
                                <button
                                  key={g || 'all-genre'}
                                  type="button"
                                  role="menuitem"
                                  className={`mac-filter-menu-item${genreFilter === g ? ' mac-filter-menu-item-active' : ''}`}
                                  onClick={() => { setGenreFilter(g); setPage(1); loadParc(1, { genre: g }); }}
                                >
                                  <span>{g || t('common.all')}</span>
                                  {genreFilter === g && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                                </button>
                              ))}
                            </>
                          )}
                          {!fixedOwnership && (
                            <>
                              <div className="mac-filter-menu-sep" />
                              <p className="mac-filter-menu-section">{t('fleet.fields.mode')}</p>
                              {ownershipFilters.map((f) => (
                                <button
                                  key={f.id || 'all-ownership'}
                                  type="button"
                                  role="menuitem"
                                  className={`mac-filter-menu-item${ownershipFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                                  onClick={() => { setOwnershipFilter(f.id); setPage(1); loadParc(1, { ownershipType: f.id }); }}
                                >
                                  <span>{f.label}</span>
                                  {ownershipFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
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
                                  setStatusFilter('');
                                  setGenreFilter('');
                                  if (!fixedOwnership) setOwnershipFilter('');
                                  setPage(1);
                                  loadParc(1, { status: '', genre: '', ownershipType: '' });
                                  setShowFilters(false);
                                }}
                              >
                                {t('auth.reset')}
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
                              onClick={() => { setAlertFilter(f.id); setPage(1); loadRappels(1, { alert: f.id }); }}
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

      {tab === 'missions' && <SelectionBar selection={missionSelection} onPrint={printList} />}
      {tab === 'rappels' && <SelectionBar selection={rappelsSelection} onPrint={printList} />}
      {tab === 'parc' && <SelectionBar selection={parcSelection} onPrint={printList} />}

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
                  <SelectAllTh selection={missionSelection} rows={missions} />
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
                  <tr key={m.id} className="cursor-pointer" onClick={() => m.engin?.id && navigate(`/engins/${m.engin.id}`)}>
                    <SelectTd selection={missionSelection} row={m} />
                    <Td mac className="text-[11px]">{formatDate(m.date)}</Td>
                    <Td mac>
                      {m.engin ? <Link to={`/engins/${m.engin.id}`} className="mac-table-ref">{enginLabel(m.engin)}</Link> : '—'}
                    </Td>
                    <Td mac>{m.mission}</Td>
                    <Td mac>{m.driverName || '—'}</Td>
                    <Td mac>
                      {m.chantier ? <Link to={`/chantiers/${m.chantier.id}`} className="hover:text-[#007aff]">{m.chantier.name}</Link> : '—'}
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
                  <SelectAllTh selection={rappelsSelection} rows={items} />
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
                  <tr key={e.id} className="cursor-pointer" onClick={() => navigate(`/engins/${e.id}`)}>
                    <SelectTd selection={rappelsSelection} row={e} />
                    <Td mac>
                      <Link to={`/engins/${e.id}`} className="mac-table-ref">{enginLabel(e)}</Link>
                      <span className="block text-[10px] mac-table-muted">{e.matricule || e.genre || '—'}</span>
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
          <EmptyState title={t('msg.emptyEquipment')} action={<Btn icon={Plus} onClick={openCreate}>{addLabel}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <SelectAllTh selection={parcSelection} rows={items} />
                <Th mac>{t('fleet.fields.code')}</Th>
                <Th mac>{t('fleet.fields.designation')}</Th>
                {kind === 'materiel' && <Th mac>{t('fleet.fields.quantity')}</Th>}
                {!kind && <Th mac>{t('fleet.fields.kind')}</Th>}
                {!view && <Th mac>{t('fleet.fields.mode')}</Th>}
                {view === 'acquisitions' && (
                  <>
                    <Th mac className="text-right">{t('fleet.fields.purchasePrice')}</Th>
                    <Th mac>{t('fleet.fields.acquisitionDate')}</Th>
                    <Th mac className="text-right">{t('fleet.fields.annualDepreciation')}</Th>
                    <Th mac className="text-right">{t('fleet.fields.netBookValue')}</Th>
                  </>
                )}
                {view === 'locations' && (
                  <>
                    <Th mac>{t('fleet.fields.rentalSupplier')}</Th>
                    <Th mac>{t('fleet.fields.rentalContract')}</Th>
                    <Th mac className="text-right">{t('fleet.fields.rentalPrice')}</Th>
                    <Th mac>{t('fleet.fields.rentalPeriod')}</Th>
                  </>
                )}
                <Th mac>{t('fleet.fields.status')}</Th>
                <Th mac>{t('fleet.fields.currentAssignment')}</Th>
                <Th mac className="text-right">{t('fleet.fields.dailyCost')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="cursor-pointer" onClick={() => navigate(`/engins/${e.id}`)}>
                  <SelectTd selection={parcSelection} row={e} />
                  <Td mac>
                    <Link to={`/engins/${e.id}`} className="mac-table-ref" onClick={(ev) => ev.stopPropagation()}>{e.code || '—'}</Link>
                    {e.matricule && <span className="block text-[10px] mac-table-muted">{e.matricule}</span>}
                  </Td>
                  <Td mac>
                    {e.designation || [e.genre, e.brand].filter(Boolean).join(' ') || '—'}
                    <span className="block text-[10px] mac-table-muted">{[e.genre, e.brand, e.model].filter(Boolean).join(' · ') || '—'}</span>
                  </Td>
                  {kind === 'materiel' && <Td mac className="font-medium">{e.quantity ?? 0}</Td>}
                  {!kind && (
                    <Td mac>
                      <span className={`mac-chip ${e.kind === 'materiel' ? 'mac-chip-gray' : 'mac-chip-blue'}`}>{kindLabel(e.kind, t)}</span>
                    </Td>
                  )}
                  {!view && (
                    <Td mac>
                      <span className={`mac-chip ${e.ownershipType === 'loue' ? 'mac-chip-orange' : 'mac-chip-green'}`}>{ownershipLabel(e.ownershipType, t)}</span>
                      {e.ownershipType === 'loue' && (e.rentalSupplierRef?.companyName || e.rentalSupplier) && (
                        <span className="block text-[10px] mac-table-muted mt-0.5">{e.rentalSupplierRef?.companyName || e.rentalSupplier}</span>
                      )}
                    </Td>
                  )}
                  {view === 'acquisitions' && (
                    <>
                      <Td mac className="text-right tabular-nums">{e.purchasePrice != null ? formatMad(e.purchasePrice) : '—'}</Td>
                      <Td mac className="text-[11px]">
                        {formatDate(e.acquisitionDate)}
                        {e.depreciationYears ? <span className="block text-[10px] mac-table-muted">{t('fleet.hints.overYears', { years: e.depreciationYears })}</span> : null}
                      </Td>
                      <Td mac className="text-right tabular-nums">{e.costInfo?.annualDepreciation ? formatMad(e.costInfo.annualDepreciation) : '—'}</Td>
                      <Td mac className="text-right tabular-nums">{e.costInfo?.netBookValue != null ? formatMad(e.costInfo.netBookValue) : '—'}</Td>
                    </>
                  )}
                  {view === 'locations' && (
                    <>
                      <Td mac>{e.rentalSupplierRef?.companyName || e.rentalSupplier || '—'}</Td>
                      <Td mac className="mac-table-muted text-[11px]">{e.rentalContractRef || '—'}</Td>
                      <Td mac className="text-right tabular-nums">{rentalCost(e)}</Td>
                      <Td mac className="text-[11px]">
                        {e.rentalStart ? formatDate(e.rentalStart) : '—'} → {e.rentalEnd ? formatDate(e.rentalEnd) : '…'}
                      </Td>
                    </>
                  )}
                  <Td mac><FleetStatusPill status={e.status} /></Td>
                  <Td mac className="text-[11px]">
                    {e.currentAssignment ? (
                      <>
                        {e.currentAssignment.chantierId ? (
                          <Link
                            to={`/chantiers/${e.currentAssignment.chantierId}?tab=engins`}
                            className="hover:text-[#007aff]"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            {chantierTrancheLabel(e.currentAssignment.chantierName, e.currentAssignment.tranche)}
                          </Link>
                        ) : chantierTrancheLabel(e.currentAssignment.chantierName, e.currentAssignment.tranche)}
                        <span className="block text-[10px] mac-table-muted">
                          {t('fleet.hints.since', { date: formatDate(e.currentAssignment.startDate) })}
                        </span>
                      </>
                    ) : <span className="mac-table-muted">—</span>}
                  </Td>
                  <Td mac className="text-right tabular-nums text-[11px]">
                    {dailyCost(e)}
                    <span className="block text-[10px] mac-table-muted">
                      {e.ownershipType === 'loue' ? t('fleet.hints.rentalPerDay') : t('fleet.hints.depreciationPerDay')}
                    </span>
                  </Td>
                  <Td mac className="mac-td-actions" onClick={(ev) => ev.stopPropagation()}>
                    <div className="mac-actions">
                      <Link to={`/engins/${e.id}`} className="mac-action-btn mac-action-btn-blue" title={t('common.view')}>
                        <Eye size={14} strokeWidth={2.15} />
                      </Link>
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(e)} />
                      <MacActionBtn icon={Wrench} tone="teal" title={t('fleet.actions.newMaintenance')} onClick={() => setMaintEnginId(e.id)} />
                      <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => setDeleteId(e.id)} />
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
        size="xl"
        title={editId ? t('actions.editEquipment') : kind === 'materiel' ? t('fleet.actions.newMateriel') : t('actions.newEquipment')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="engin-form" type="submit">{editId ? t('common.save') : t('common.create')}</Btn>
          </>
        }
      >
        <form id="engin-form" onSubmit={saveEngin}><EnginFormFields form={form} setForm={setForm} isEdit={!!editId} /></form>
      </Modal>

      <DeleteMotifModal open={!!deleteId} title={t('actions.deleteEquipment')} onClose={() => setDeleteId(null)} onConfirm={confirmDelete} />

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
            {enginOptions.map((e) => <option key={e.id} value={e.id}>{enginLabel(e)}</option>)}
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

      <MaintenanceModal
        open={!!maintEnginId}
        enginId={maintEnginId || undefined}
        onClose={() => setMaintEnginId(null)}
        onSaved={() => { invalidateFleetRefs(); load(page); }}
      />

      {tab === 'parc' && stats.missionsTotal > 0 && !view && kind !== 'materiel' && (
        <p className="text-[11px] text-gic-muted mt-2 flex items-center gap-1">
          <ClipboardList size={12} /> {t('fleet.hints.missionsCount', { count: stats.missionsTotal })}
        </p>
      )}
    </div>
  );
}
