import { fetchAllRows, printRows } from '../lib/listPrint';
import { appAlert } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CheckCircle, Download, Printer, Trash2, Pencil, Clock, Users, Wallet,
  SlidersHorizontal, Check, Save, ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  api, downloadCsv, downloadExcel, fetchChantierList, fetchWorkforceList, formatDate, formatMad, type PaginatedResponse,
} from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, StatusPill, TableWrap, MacToolbarTabs, Td, Th,
} from '../components/ui';
import {
  scopeQueryParams,
  workforceDetailPathForCategory,
  type WorkforceScope,
} from '../lib/workforceScope';
import { SelectAllTh, SelectTd, SelectionBar } from '../components/RowSelection';
import { useRowSelection } from '../hooks/useRowSelection';
import { useI18n } from '../i18n/I18nContext';
import PointageSessionManager from '../components/PointageSessionManager';
import PointageWorkerSummary from '../components/PointageWorkerSummary';

type Pointage = {
  id: string;
  date: string;
  dayValue: number;
  hours: number;
  totalDay: number;
  dayRate?: number | null;
  advance: number;
  bonus: number;
  validated: boolean;
  workforceId: string;
  workforce: { id: string; firstName: string; lastName: string; category?: string; dailySalary: number; reference?: string };
  chantier?: { id: string; name: string } | null;
};

type MatrixWorker = { id: string; firstName: string; lastName: string; reference?: string; category?: string };

type Stats = { total: number; validated: number; pending: number; totalDays: number; advances: number; bonuses: number; estimatedCost: number };

type Tab = 'gestion' | 'synthese' | 'matrice' | 'historique';
const TABS: Tab[] = ['gestion', 'synthese', 'matrice', 'historique'];
type SortOrder = 'asc' | 'desc';
type PointageRowEdit = { days: string; dayRate: string; advance: string; bonus: string };

const PAGE_SIZE = 20;
const HOURS_PER_DAY = 8;
/** 0.125 j = 1 h (journée = 8 h) */
const DAY_STEP = 0.125;

function formatDays(n: number) {
  return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '0';
}

function cellKey(workforceId: string, chantierId: string) {
  return `${workforceId}:${chantierId}`;
}

function cellInputClass(locked: boolean, width = 'w-16') {
  return `${width} rounded-lg border px-2 py-1 text-[11px] ${
    locked
      ? 'border-gic-border/60 bg-[#f5f5f7] text-gic-muted cursor-not-allowed'
      : 'border-gic-border bg-white'
  }`;
}

function pointageBrut(totalDay: number, dayRate: number | null | undefined, fallback: number) {
  const rate = dayRate != null && dayRate > 0 ? dayRate : fallback;
  return totalDay * rate;
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

export default function PointagePage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scope, setScope] = useState<WorkforceScope>(
    searchParams.get('scope') === 'chauffeur' ? 'chauffeur' : 'main_oeuvre',
  );
  const isChauffeur = scope === 'chauffeur';
  const [tab, setTab] = useState<Tab>(() => {
    const urlTab = searchParams.get('tab') as Tab | null;
    if (urlTab && TABS.includes(urlTab)) return urlTab;
    if (searchParams.get('workforceId')) return 'historique';
    if (searchParams.get('view') === 'matrice') return 'matrice';
    return 'gestion';
  });
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [chantierId, setChantierId] = useState(searchParams.get('chantierId') || '');
  const [trancheFilter, setTrancheFilter] = useState(searchParams.get('tranche') || '');
  const [chantiers, setChantiers] = useState<{ id: string; name: string; status?: string }[]>([]);
  const [workforce, setWorkforce] = useState<any[]>([]);
  const [pointages, setPointages] = useState<Pointage[]>([]);
  const [workerQ, setWorkerQ] = useState('');
  const [dayStats, setDayStats] = useState<Stats>({ total: 0, validated: 0, pending: 0, totalDays: 0, advances: 0, bonuses: 0, estimatedCost: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  /** Chantiers visibles en colonnes (matrice) — vide = tous actifs */
  const [matrixChantierIds, setMatrixChantierIds] = useState<string[]>([]);
  const [matrixDrafts, setMatrixDrafts] = useState<Record<string, string>>({});

  // Historique
  const [histItems, setHistItems] = useState<Pointage[]>([]);
  const [histPage, setHistPage] = useState(Number(searchParams.get('page') || 1));
  const [histPages, setHistPages] = useState(1);
  const [histTotal, setHistTotal] = useState(0);
  const [histStats, setHistStats] = useState<Stats>({ total: 0, validated: 0, pending: 0, totalDays: 0, advances: 0, bonuses: 0, estimatedCost: 0 });
  const [dateFrom, setDateFrom] = useState(() => {
    const fromUrl = searchParams.get('dateFrom');
    if (fromUrl) return fromUrl;
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || new Date().toISOString().slice(0, 10));
  const [histChantier, setHistChantier] = useState(searchParams.get('chantierId') || '');
  const [histTranche, setHistTranche] = useState(searchParams.get('tranche') || '');
  const [histTranches, setHistTranches] = useState<{ id: string; name: string }[]>([]);
  const [histWorker, setHistWorker] = useState(searchParams.get('workforceId') || '');
  const [validatedFilter, setValidatedFilter] = useState(searchParams.get('validated') || '');
  const [histSort, setHistSort] = useState(searchParams.get('sort') || 'date');
  const [histOrder, setHistOrder] = useState<SortOrder>(searchParams.get('order') === 'asc' ? 'asc' : 'desc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [histRows, setHistRows] = useState<Record<string, PointageRowEdit>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const histSelection = useRowSelection<Pointage>();
  const matrixSelection = useRowSelection<MatrixWorker>();

  useEffect(() => {
    fetchChantierList<{ id: string; name: string; status?: string }>().then(setChantiers);
  }, []);

  useEffect(() => {
    fetchWorkforceList(scopeQueryParams(scope)).then(setWorkforce);
  }, [scope]);

  useEffect(() => {
    if (!histChantier) {
      setHistTranches([]);
      return;
    }
    api<{ id: string; name: string }[]>(`/chantiers/${histChantier}/tranches`)
      .then(setHistTranches)
      .catch(() => setHistTranches([]));
  }, [histChantier]);

  useEffect(() => {
    const wf = searchParams.get('workforceId');
    if (wf) {
      setHistWorker(wf);
      setTab('historique');
    }
  }, [searchParams]);

  useEffect(() => {
    if (tab !== 'historique') return;
    const qs = new URLSearchParams();
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    if (histChantier) qs.set('chantierId', histChantier);
    if (histTranche) qs.set('tranche', histTranche);
    if (histWorker) qs.set('workforceId', histWorker);
    if (validatedFilter) qs.set('validated', validatedFilter);
    if (histSort !== 'date') qs.set('sort', histSort);
    if (histOrder !== 'desc') qs.set('order', histOrder);
    if (histPage > 1) qs.set('page', String(histPage));
    setSearchParams(qs, { replace: true });
  }, [tab, dateFrom, dateTo, histChantier, histTranche, histWorker, validatedFilter, histSort, histOrder, histPage, setSearchParams]);

  useEffect(() => {
    if (tab === 'historique') return;
    const qs = new URLSearchParams();
    qs.set('tab', tab);
    if (tab !== 'matrice' && chantierId) qs.set('chantierId', chantierId);
    if (tab !== 'matrice' && chantierId && trancheFilter) qs.set('tranche', trancheFilter);
    if (isChauffeur) qs.set('scope', 'chauffeur');
    setSearchParams(qs, { replace: true });
  }, [tab, chantierId, trancheFilter, isChauffeur, setSearchParams]);

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

  function loadDay() {
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ dateFrom: date, dateTo: date });
    const dayQs = new URLSearchParams({ date });
    Promise.all([
      api<Pointage[]>(`/chantiers/pointage/day?${dayQs}`),
      api<Stats>(`/chantiers/pointage/stats?${qs}`),
    ])
      .then(([pts, st]) => {
        setPointages(pts);
        setDayStats(st);
        setMatrixDrafts({});
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }

  function buildHistoryQuery(pageNum = histPage, overrides?: { validated?: string }) {
    const qs = new URLSearchParams();
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    if (histChantier) qs.set('chantierId', histChantier);
    if (histTranche) qs.set('tranche', histTranche);
    if (histWorker) qs.set('workforceId', histWorker);
    const val = overrides?.validated !== undefined ? overrides.validated : validatedFilter;
    if (val) qs.set('validated', val);
    qs.set('sort', histSort);
    qs.set('order', histOrder);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs;
  }

  function buildExportQuery() {
    const qs = new URLSearchParams();
    if (tab === 'matrice') {
      qs.set('dateFrom', date);
      qs.set('dateTo', date);
    } else if (tab === 'gestion' || tab === 'synthese') {
      if (chantierId) qs.set('chantierId', chantierId);
      if (chantierId && trancheFilter) qs.set('tranche', trancheFilter);
    } else {
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
      if (histChantier) qs.set('chantierId', histChantier);
      if (histTranche) qs.set('tranche', histTranche);
      if (histWorker) qs.set('workforceId', histWorker);
      if (validatedFilter) qs.set('validated', validatedFilter);
    }
    return qs;
  }

  function loadHistory(pageNum = histPage, overrides?: { validated?: string }) {
    setLoading(true);
    setError('');
    const qs = buildHistoryQuery(pageNum, overrides);
    Promise.all([
      api<PaginatedResponse<Pointage>>(`/chantiers/pointage?${qs}`),
      api<Stats>(`/chantiers/pointage/stats?${qs}`),
    ])
      .then(([res, st]) => {
        setHistItems(res.items);
        setHistPage(res.page);
        setHistPages(res.pages);
        setHistTotal(res.total);
        setHistStats(st);
        setHistRows({});
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (tab === 'matrice') loadDay();
  }, [date, tab]);

  useEffect(() => {
    if (tab === 'historique') loadHistory(histPage);
  }, [tab, histSort, histOrder]);

  function parseDayRate(value: string) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isNaN(n) || n <= 0 ? null : n;
  }

  async function setPointageValidated(pointageId: string, validated: boolean) {
    await api(`/chantiers/pointage/${pointageId}`, {
      method: 'PUT',
      body: JSON.stringify({ validated }),
    });
  }

  function histRowDefaults(p: Pointage): PointageRowEdit {
    return {
      days: formatDays(p.dayValue ?? p.totalDay ?? 0),
      dayRate: String(p.dayRate ?? p.workforce.dailySalary ?? ''),
      advance: String(p.advance ?? 0),
      bonus: String(p.bonus ?? 0),
    };
  }

  function getHistRow(p: Pointage) {
    return histRows[p.id] || histRowDefaults(p);
  }

  function setHistRow(id: string, patch: Partial<PointageRowEdit>, p?: Pointage) {
    setHistRows((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || histRowDefaults(p!)), ...patch },
    }));
  }

  function histRowTotalDay(p: Pointage) {
    const n = Number(getHistRow(p).days);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  async function saveHistOne(p: Pointage, validated = false) {
    setSaving(p.id);
    try {
      const r = getHistRow(p);
      const dayRate = parseDayRate(r.dayRate);
      if (!p.chantier?.id) {
        await appAlert(t('msg.attendanceNoSite'));
        return;
      }
      await api(`/chantiers/pointage/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          dayValue: histRowTotalDay(p),
          dayRate,
          advance: Number(r.advance) || 0,
          bonus: Number(r.bonus) || 0,
          validated,
          chantierId: p.chantier.id,
        }),
      });
      if (dayRate != null && dayRate > 0) {
        setWorkforce((prev) =>
          prev.map((w) => (w.id === p.workforceId ? { ...w, dailySalary: dayRate } : w)),
        );
      }
      loadHistory(histPage);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(null);
    }
  }

  async function unlockHistForEdit(p: Pointage) {
    if (!p.validated) return;
    setSaving(p.id);
    try {
      await setPointageValidated(p.id, false);
      loadHistory(histPage);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(null);
    }
  }

  async function confirmDelete() {
    if (!deleteId || !deleteMotif.trim()) return;
    try {
      await api(`/chantiers/pointage/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      setDeleteId(null);
      setDeleteMotif('');
      if (tab === 'historique') loadHistory(histPage);
      else loadDay();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function matrixPointage(workforceId: string, cid: string) {
    return pointages.find((p) => p.workforceId === workforceId && p.chantier?.id === cid);
  }

  function matrixCellValue(workforceId: string, cid: string) {
    const key = cellKey(workforceId, cid);
    if (matrixDrafts[key] !== undefined) return matrixDrafts[key];
    const p = matrixPointage(workforceId, cid);
    return p != null ? formatDays(p.dayValue) : '';
  }

  function setMatrixCell(workforceId: string, cid: string, value: string) {
    setMatrixDrafts((prev) => ({ ...prev, [cellKey(workforceId, cid)]: value }));
  }

  async function saveMatrixCell(workforceId: string, cid: string) {
    const key = cellKey(workforceId, cid);
    const raw = matrixDrafts[key];
    if (raw === undefined) return;
    const dayValue = Number(raw);
    if (!Number.isFinite(dayValue) || dayValue < 0) {
      await appAlert(t('msg.invalidDayValue'));
      return;
    }
    const existing = matrixPointage(workforceId, cid);
    // Cellule vide / 0 sans pointage existant → rien à créer
    if (!existing && dayValue === 0 && raw.trim() === '') {
      setMatrixDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setSaving(key);
    try {
      await api('/chantiers/pointage', {
        method: 'POST',
        body: JSON.stringify({
          date,
          workforceId,
          chantierId: cid,
          dayValue,
          advance: existing?.advance ?? 0,
          bonus: existing?.bonus ?? 0,
          validated: existing?.validated ?? false,
          dayRate: existing?.dayRate ?? null,
        }),
      });
      setMatrixDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      loadDay();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(null);
    }
  }

  function exportCsv() {
    downloadCsv(`/chantiers/pointage/export/csv?${buildExportQuery()}`, 'pointage-gic.csv');
  }

  function exportExcel() {
    downloadExcel(`/chantiers/pointage/export/xlsx?${buildExportQuery()}`, 'pointage-gic.xlsx');
  }

  function pointageDays(p: Pointage) {
    return p.dayValue ?? p.totalDay ?? 0;
  }

  function workerLabel(w: { firstName: string; lastName: string; reference?: string }) {
    return `${w.reference ? `${w.reference} — ` : ''}${w.firstName} ${w.lastName}`;
  }

  function printHistory() {
    const worker = workforce.find((w) => w.id === histWorker);
    printRows<Pointage>({
      title: `${t('pages.attendance')} — ${t('tabs.history')}`,
      subtitle: isChauffeur ? t('pages.drivers') : t('pages.workforce'),
      filters: [
        [t('listPrint.period'), dateFrom || dateTo ? `${dateFrom ? formatDate(dateFrom) : '…'} → ${dateTo ? formatDate(dateTo) : '…'}` : ''],
        [t('columns.chantier'), histChantier && chantiers.find((c) => c.id === histChantier)?.name],
        [t('fields.tranche'), histTranche],
        [t('columns.worker'), worker ? workerLabel(worker) : ''],
        [t('msg.validation'), validatedFilter && validatedFilters.find((f) => f.id === validatedFilter)?.label],
        [t('listPrint.sort'), `${histSort === 'totalDay' ? t('msg.totalDaysSort') : t('common.date')} (${histOrder === 'asc' ? t('msg.ascending') : t('msg.descending')})`],
      ],
      columns: [
        { label: t('columns.date'), value: (p) => formatDate(p.date) },
        { label: t('columns.worker'), value: (p) => `${p.workforce.firstName} ${p.workforce.lastName}` },
        { label: t('columns.chantier'), value: (p) => p.chantier?.name },
        { label: t('columns.days'), value: (p) => formatDays(pointageDays(p)), align: 'right', total: (rows) => formatDays(rows.reduce((s, p) => s + pointageDays(p), 0)) },
        { label: t('columns.hours'), value: (p) => (pointageDays(p) * HOURS_PER_DAY).toFixed(1), align: 'right' },
        { label: t('columns.dailyRate'), value: (p) => formatMad(p.dayRate ?? p.workforce.dailySalary ?? 0), align: 'right' },
        {
          label: t('columns.brut'),
          value: (p) => formatMad(pointageBrut(pointageDays(p), p.dayRate, p.workforce.dailySalary || 0)),
          align: 'right',
          total: (rows) => formatMad(rows.reduce((s, p) => s + pointageBrut(pointageDays(p), p.dayRate, p.workforce.dailySalary || 0), 0)),
        },
        { label: t('columns.advance'), value: (p) => formatMad(p.advance || 0), align: 'right', total: (rows) => formatMad(rows.reduce((s, p) => s + (p.advance || 0), 0)) },
        { label: t('columns.bonus'), value: (p) => formatMad(p.bonus || 0), align: 'right', total: (rows) => formatMad(rows.reduce((s, p) => s + (p.bonus || 0), 0)) },
        { label: t('columns.validated'), value: (p) => p.validated },
      ],
      rows: histSelection.count ? histSelection.rows : () => fetchAllRows<Pointage>('/chantiers/pointage', buildHistoryQuery(1)),
      selectedCount: histSelection.count,
    });
  }

  function printMatrix() {
    const cellDays = (w: MatrixWorker, cid: string) => {
      const v = Number(matrixCellValue(w.id, cid));
      return Number.isFinite(v) ? v : 0;
    };
    const rowTotal = (w: MatrixWorker) => matrixColumns.reduce((s, c) => s + cellDays(w, c.id), 0);
    printRows<MatrixWorker>({
      title: `${t('pages.attendance')} — ${t('tabs.matrixMultiSite')}`,
      subtitle: isChauffeur ? t('pages.drivers') : t('pages.workforce'),
      filters: [
        [t('common.date'), formatDate(date)],
        [t('listPrint.search'), workerQ],
        [t('columns.chantier'), matrixChantierIds.length > 0 ? matrixColumns.map((c) => c.name).join(', ') : t('msg.allSites')],
      ],
      columns: [
        { label: t('columns.worker'), value: (w) => `${workerLabel(w)}${w.category ? ` (${w.category})` : ''}` },
        ...matrixColumns.map((c) => ({
          label: c.name,
          value: (w: MatrixWorker) => matrixCellValue(w.id, c.id),
          align: 'center' as const,
          total: (rows: MatrixWorker[]) => formatDays(rows.reduce((s, w) => s + cellDays(w, c.id), 0)),
        })),
        { label: t('columns.totalDays'), value: (w) => rowTotal(w).toFixed(3), align: 'right', total: (rows) => rows.reduce((s, w) => s + rowTotal(w), 0).toFixed(3) },
      ],
      rows: matrixSelection.count ? matrixSelection.rows : matrixWorkers,
      selectedCount: matrixSelection.count,
    });
  }

  function printList() {
    if (tab === 'historique') printHistory();
    else printMatrix();
  }


  const matrixWorkers = workforce.filter((w) => {
    if (String(w.salaryPeriod || '').toLowerCase() === 'mois') return false;
    if (!workerQ) return true;
    const s = workerQ.toLowerCase();
    return `${w.firstName} ${w.lastName}`.toLowerCase().includes(s)
      || (w.category || '').toLowerCase().includes(s)
      || (w.reference || '').toLowerCase().includes(s);
  });

  const activeChantiers = chantiers.filter(
    (c) => !c.status || String(c.status).toLowerCase() === 'actif',
  );
  const matrixColumns = (
    matrixChantierIds.length > 0
      ? activeChantiers.filter((c) => matrixChantierIds.includes(c.id))
      : activeChantiers
  );

  const stats = tab === 'historique' ? histStats : dayStats;

  const validatedFilters = [
    { id: '', label: t('common.all') },
    { id: 'true', label: t('msg.validatedPlural') },
    { id: 'false', label: t('status.pending') },
  ];

  const hasActiveFilters = !!validatedFilter || !!histChantier || !!histWorker || !!histTranche;

  const activeChantierId = tab === 'historique' ? histChantier : chantierId;
  const activeTranche = tab === 'historique' ? histTranche : trancheFilter;
  const activeChantierName = chantiers.find((c) => c.id === activeChantierId)?.name;
  const pageSubtitle = tab === 'matrice'
    ? t('pages.attendanceMatrixSubtitle', { step: DAY_STEP })
    : isChauffeur
      ? (activeChantierName
        ? `${t('pages.drivers')} · ${activeChantierName}${activeTranche ? ` · ${activeTranche}` : ''}`
        : t('pages.attendanceDriversSubtitle'))
      : (activeChantierName
        ? `${activeChantierName}${activeTranche ? ` · ${activeTranche}` : ` · ${t('msg.allTranches')}`}`
        : t('pages.attendanceSubtitle'));

  function toggleMatrixChantier(id: string) {
    setMatrixChantierIds((prev) => {
      // Premier clic depuis « tous » : partir de la liste complète puis retirer
      const base = prev.length === 0 ? activeChantiers.map((c) => c.id) : prev;
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      // Tous sélectionnés → sentinel vide (= tous)
      if (next.length === activeChantiers.length) return [];
      return next;
    });
  }

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.attendance')}
        subtitle={pageSubtitle}
        actions={
          <>
            <Link to={isChauffeur ? '/chauffeurs' : '/main-oeuvre'}><Btn variant="secondary" icon={Users}>{isChauffeur ? t('pages.drivers') : t('tabs.personnel')}</Btn></Link>
            <Link to={isChauffeur ? '/salaires?type=chauffeur' : '/salaires?type=main_oeuvre'}><Btn variant="secondary" icon={Wallet}>{t('pages.salaries')}</Btn></Link>
            <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={exportExcel}>{t('common.excel')}</Btn>
            {(tab === 'matrice' || tab === 'historique') && (
              <div className="mac-action-group">
                <MacActionBtn
                  icon={Printer}
                  tone="gray"
                  title={t('common.print')}
                  onClick={printList}
                />
              </div>
            )}
          </>
        }
      />

      {(tab === 'matrice' || tab === 'historique') && (
      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('columns.attendanceCount')} value={stats.total} icon={Clock} tone="violet" />
        <KpiCard title={t('columns.validated')} value={stats.validated} icon={CheckCircle} tone="emerald" delta={t('msg.pendingCount', { count: stats.pending })} deltaTone="muted" />
        <KpiCard title={t('kpi.eqDays')} value={stats.totalDays.toFixed(2)} icon={Users} tone="amber" />
        <KpiCard
          title={t('kpi.estimatedCost')}
          value={formatMadCompact(stats.estimatedCost)}
          icon={Wallet}
          tone="coral"
          compact
          delta={t('msg.bonusesDelta', { amount: formatMadCompact(stats.bonuses) })}
          deltaTone="muted"
        />
      </div>
      )}

      <Card className="mb-4 !pb-0">
        <MacToolbarTabs
          scopeLabel={t('tabs.personnel')}
          scopeTabs={[
            { id: 'main_oeuvre', label: t('pages.workforce') },
            { id: 'chauffeur', label: t('pages.drivers') },
          ]}
          scope={scope}
          onScopeChange={(id) => {
            setScope(id as WorkforceScope);
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              if (id === 'chauffeur') next.set('scope', 'chauffeur');
              else next.delete('scope');
              return next;
            }, { replace: true });
          }}
          viewTabs={[
            { id: 'gestion', label: t('actions.enterAttendance') },
            { id: 'synthese', label: t('pointageMgmt.byWorkerTab') },
            { id: 'matrice', label: t('tabs.matrixMultiSite') },
            { id: 'historique', label: t('tabs.history') },
          ]}
          view={tab}
          onViewChange={(id) => { setTab(id as Tab); setShowFilters(false); }}
        />
      </Card>

      {error && (
        <Card className="mb-4 border-gic-coral/40 bg-gic-coral-soft/30">
          <p className="text-[12px] text-gic-coral font-medium">{error}</p>
          <Btn
            variant="secondary"
            className="mt-2"
            onClick={() => {
              if (tab === 'historique') loadHistory(histPage);
              else loadDay();
            }}
          >
            {t('common.retry')}
          </Btn>
        </Card>
      )}

      {tab === 'gestion' && (
        <PointageSessionManager
          chantiers={chantiers}
          chantierId={chantierId}
          onChantierChange={(v) => { setChantierId(v); setTrancheFilter(''); }}
          tranche={trancheFilter}
          onTrancheChange={setTrancheFilter}
          workforce={workforce}
        />
      )}

      {tab === 'synthese' && (
        <PointageWorkerSummary
          chantiers={chantiers}
          chantierId={chantierId}
          onChantierChange={(v) => { setChantierId(v); setTrancheFilter(''); }}
          tranche={trancheFilter}
          onTrancheChange={setTrancheFilter}
        />
      )}

      {tab === 'matrice' && (
        <>
          <div className="mac-filters-panel">
            <div className="mac-filters-row mac-filters-row-between">
              <div className="mac-filters-toolbar">
                <MacSearch
                  value={workerQ}
                  onChange={setWorkerQ}
                  placeholder={isChauffeur ? t('msg.searchDriver') : t('msg.searchWorker')}
                />
                <MacDateInput value={date} onChange={setDate} placeholder={t('common.date')} className="w-36 shrink-0" />
                <span className="text-[11px] text-gic-muted shrink-0">
                  {t('msg.matrixColumnsHint', { count: matrixColumns.length })}
                </span>
              </div>
              <div className="mac-filters-actions">
                <Btn variant="secondary" onClick={() => setMatrixChantierIds([])}>
                  {t('msg.allSites')}
                </Btn>
              </div>
            </div>
            {activeChantiers.length > 0 && (
              <div className="flex flex-wrap gap-2 px-1 pb-2">
                {activeChantiers.map((c) => {
                  const selected = matrixChantierIds.length === 0 || matrixChantierIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleMatrixChantier(c.id)}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] transition-colors ${
                        selected
                          ? 'border-[#007aff]/50 bg-[#007aff]/10 text-[#007aff]'
                          : 'border-gic-border bg-white text-gic-muted'
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <SelectionBar selection={matrixSelection} onPrint={printMatrix} />

          <Card padding={false}>
            {loading ? (
              <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
            ) : matrixWorkers.length === 0 ? (
              <EmptyState title={t('msg.emptyWorkersNonMonthly')} />
            ) : matrixColumns.length === 0 ? (
              <EmptyState title={t('msg.emptyActiveSites')} />
            ) : (
              <div className="overflow-x-auto mac-table-scroll">
                <table className="mac-table">
                  <thead>
                    <tr>
                      <SelectAllTh selection={matrixSelection} rows={matrixWorkers as MatrixWorker[]} />
                      <Th mac className="sticky left-0 z-10 bg-[#f5f5f7]">{t('columns.worker')}</Th>
                      {matrixColumns.map((c) => (
                        <Th mac key={c.id} className="min-w-[5.5rem] text-center">
                          <span className="block max-w-[7rem] truncate" title={c.name}>{c.name}</span>
                        </Th>
                      ))}
                      <Th mac className="text-center">{t('columns.totalDays')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixWorkers.map((w) => {
                      const rowTotal = matrixColumns.reduce((sum, c) => {
                        const v = Number(matrixCellValue(w.id, c.id));
                        return sum + (Number.isFinite(v) ? v : 0);
                      }, 0);
                      return (
                        <tr key={w.id}>
                          <SelectTd selection={matrixSelection} row={w as MatrixWorker} />
                          <Td mac className="sticky left-0 z-10 bg-white">
                            <Link to={workforceDetailPathForCategory(w.category, w.id)} className="mac-table-ref">
                              {w.reference ? `${w.reference} — ` : ''}{w.firstName} {w.lastName}
                            </Link>
                            {w.category && <span className="block text-[10px] text-gic-muted">{w.category}</span>}
                          </Td>
                          {matrixColumns.map((c) => {
                            const key = cellKey(w.id, c.id);
                            const existing = matrixPointage(w.id, c.id);
                            const locked = !!existing?.validated;
                            const dirty = matrixDrafts[key] !== undefined;
                            return (
                              <Td mac key={c.id} className="text-center">
                                <input
                                  className={`${cellInputClass(locked, 'w-14')} text-center mx-auto${dirty ? ' ring-1 ring-[#007aff]/50' : ''}`}
                                  type="number"
                                  min={0}
                                  step={DAY_STEP}
                                  readOnly={locked}
                                  value={matrixCellValue(w.id, c.id)}
                                  onChange={(e) => setMatrixCell(w.id, c.id, e.target.value)}
                                  onBlur={() => { if (!locked) void saveMatrixCell(w.id, c.id); }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !locked) {
                                      e.currentTarget.blur();
                                    }
                                  }}
                                  disabled={saving === key}
                                  title={locked ? t('msg.lockedViaHistory') : t('msg.daysStepTitle')}
                                />
                              </Td>
                            );
                          })}
                          <Td mac className="mac-table-muted text-center">{rowTotal.toFixed(3)}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'historique' && (
        <>
          <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
            <div className="mac-filters-row">
              <div className="mac-filters-toolbar">
                <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0" />
                <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0" />
                <MacSelect
                  value={histChantier}
                  onChange={(v) => {
                    setHistChantier(v);
                    setHistTranche('');
                  }}
                  options={[
                    { value: '', label: t('msg.allSitesShort') },
                    ...chantiers.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  className="w-44 shrink-0"
                />
                {histChantier && (
                  <MacSelect
                    value={histTranche}
                    onChange={setHistTranche}
                    options={[
                      { value: '', label: t('msg.allTranches') },
                      ...histTranches.map((tr) => ({ value: tr.name, label: tr.name })),
                    ]}
                    className="w-44 shrink-0"
                  />
                )}
                <MacSelect
                  value={histWorker}
                  onChange={setHistWorker}
                  options={[
                    { value: '', label: t('msg.allWorkers') },
                    ...workforce
                      .filter((w) => String(w.salaryPeriod || '').toLowerCase() !== 'mois')
                      .map((w) => ({
                      value: w.id,
                      label: `${w.reference ? `${w.reference} — ` : ''}${w.firstName} ${w.lastName}`,
                    })),
                  ]}
                  className="w-52 shrink-0"
                />
                <MacSelect
                  value={histSort}
                  onChange={setHistSort}
                  options={[
                    { value: 'date', label: t('common.date') },
                    { value: 'totalDay', label: t('msg.totalDaysSort') },
                  ]}
                  className="w-36 shrink-0"
                />
                <Btn
                  variant="secondary"
                  icon={histOrder === 'asc' ? ArrowUp : ArrowDown}
                  className="!px-2 !py-2 shrink-0"
                  title={histOrder === 'asc' ? t('msg.ascending') : t('msg.descending')}
                  onClick={() => setHistOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
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
                      <p className="mac-filter-menu-section">{t('msg.validation')}</p>
                      {validatedFilters.map((f) => (
                        <button
                          key={f.id || 'all'}
                          type="button"
                          role="menuitem"
                          className={`mac-filter-menu-item${validatedFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                          onClick={() => {
                            setValidatedFilter(f.id);
                            setHistPage(1);
                            loadHistory(1, { validated: f.id });
                          }}
                        >
                          <span>{f.label}</span>
                          {validatedFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                        </button>
                      ))}
                      {hasActiveFilters && (
                        <>
                          <div className="mac-filter-menu-sep" />
                          <button
                            type="button"
                            className="mac-filter-menu-item mac-filter-menu-reset"
                            onClick={() => {
                              setValidatedFilter('');
                              setHistChantier('');
                              setHistWorker('');
                              setHistTranche('');
                              setHistPage(1);
                              loadHistory(1, { validated: '' });
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
                <Btn variant="secondary" onClick={() => { setHistPage(1); loadHistory(1); }}>{t('common.filter')}</Btn>
              </div>
            </div>
          </div>

          <SelectionBar selection={histSelection} onPrint={printHistory} />

          <Card padding={false}>
            {loading ? (
              <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
            ) : histItems.length === 0 ? (
              <EmptyState title={t('msg.emptyAttendance')} />
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <SelectAllTh selection={histSelection} rows={histItems} />
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('columns.worker')}</Th>
                    <Th mac>{t('columns.chantier')}</Th>
                    <Th mac>{t('columns.days')}</Th>
                    <Th mac>{t('columns.hours')}</Th>
                    <Th mac>{t('columns.dailyRate')}</Th>
                    <Th mac>{t('columns.brut')}</Th>
                    <Th mac>{t('columns.advance')}</Th>
                    <Th mac>{t('columns.bonus')}</Th>
                    <Th mac>{t('columns.validated')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {histItems.map((p) => {
                    const hr = getHistRow(p);
                    const locked = p.validated;
                    const days = histRowTotalDay(p);
                    const histBrut = pointageBrut(days, parseDayRate(hr.dayRate), p.workforce.dailySalary || 0);
                    return (
                    <tr
                      key={p.id}
                      className={p.validated ? ' bg-gic-emerald-soft/10' : ''}
                    >
                      <SelectTd selection={histSelection} row={p} />
                      <Td mac className="mac-table-muted">{formatDate(p.date)}</Td>
                      <Td mac>
                        <Link to={workforceDetailPathForCategory(p.workforce.category, p.workforce.id)} className="mac-table-ref">
                          {p.workforce.firstName} {p.workforce.lastName}
                        </Link>
                      </Td>
                      <Td mac className="mac-table-muted">
                        {p.chantier ? (
                          <Link to={`/chantiers/${p.chantier.id}`} className="mac-table-ref">
                            {p.chantier.name}
                          </Link>
                        ) : '—'}
                      </Td>
                      <Td mac>
                        <input
                          className={cellInputClass(locked)}
                          type="number"
                          min={0}
                          step={DAY_STEP}
                          readOnly={locked}
                          value={hr.days}
                          onChange={(e) => setHistRow(p.id, { days: e.target.value }, p)}
                          title={t('msg.dayStepHint')}
                        />
                      </Td>
                      <Td mac className="mac-table-muted">{(days * HOURS_PER_DAY).toFixed(1)}</Td>
                      <Td mac>
                        <input
                          className={cellInputClass(locked, 'w-20')}
                          type="number"
                          min="0"
                          step="0.01"
                          readOnly={locked}
                          value={hr.dayRate}
                          onChange={(e) => setHistRow(p.id, { dayRate: e.target.value }, p)}
                        />
                      </Td>
                      <Td mac className="mac-table-muted">{formatMad(histBrut)}</Td>
                      <Td mac>
                        <input
                          className={cellInputClass(locked)}
                          readOnly={locked}
                          value={hr.advance}
                          onChange={(e) => setHistRow(p.id, { advance: e.target.value }, p)}
                        />
                      </Td>
                      <Td mac>
                        <input
                          className={cellInputClass(locked)}
                          readOnly={locked}
                          value={hr.bonus}
                          onChange={(e) => setHistRow(p.id, { bonus: e.target.value }, p)}
                        />
                      </Td>
                      <Td mac>
                        <StatusPill status={p.validated ? 'validé' : 'brouillon'} quiet />
                      </Td>
                      <Td mac className="mac-td-actions">
                        <div className="mac-actions">
                          <MacActionBtn
                            icon={Save}
                            tone="blue"
                            title={saving === p.id ? t('auth.saving') : t('common.save')}
                            disabled={saving === p.id || locked}
                            onClick={() => saveHistOne(p, false)}
                          />
                          {!p.validated ? (
                            <MacActionBtn
                              icon={CheckCircle}
                              tone="green"
                              title={t('actions.validate')}
                              disabled={saving === p.id}
                              onClick={() => saveHistOne(p, true)}
                            />
                          ) : (
                            <MacActionBtn
                              icon={Pencil}
                              tone="orange"
                              title={t('actions.editInList')}
                              disabled={saving === p.id}
                              onClick={() => unlockHistForEdit(p)}
                            />
                          )}
                          <MacActionBtn
                            icon={Trash2}
                            tone="red"
                            title={t('common.delete')}
                            onClick={() => { setDeleteId(p.id); setDeleteMotif(''); }}
                          />
                        </div>
                      </Td>
                    </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
            <Pagination page={histPage} pages={histPages} total={histTotal} limit={PAGE_SIZE} onPage={(p) => { setHistPage(p); loadHistory(p); }} mac />
          </Card>
        </>
      )}

      <Modal
        open={!!deleteId}
        title={t('msg.deleteAttendance')}
        onClose={() => setDeleteId(null)}
        footer={<><Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn></>}
      >
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.motifPlaceholder')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>
    </div>
  );
}
