import { appAlert } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CheckCircle, Download, Printer, Trash2, Pencil, Clock, Users, Wallet,
  SlidersHorizontal, Check, Save, ArrowUp, ArrowDown, RotateCcw,
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
import { useI18n } from '../i18n/I18nContext';

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

type Stats = { total: number; validated: number; pending: number; totalDays: number; advances: number; bonuses: number; estimatedCost: number };

type Tab = 'saisie' | 'matrice' | 'historique';
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
    if (searchParams.get('workforceId')) return 'historique';
    if (searchParams.get('view') === 'matrice') return 'matrice';
    return 'saisie';
  });
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [chantierId, setChantierId] = useState(searchParams.get('chantierId') || '');
  const [trancheFilter, setTrancheFilter] = useState(searchParams.get('tranche') || '');
  const [chantiers, setChantiers] = useState<{ id: string; name: string; status?: string }[]>([]);
  const [chantierTranches, setChantierTranches] = useState<{ id: string; name: string }[]>([]);
  const [workforce, setWorkforce] = useState<any[]>([]);
  const [pointages, setPointages] = useState<Pointage[]>([]);
  const [rows, setRows] = useState<Record<string, PointageRowEdit>>({});
  const [workerQ, setWorkerQ] = useState('');
  const [dayStats, setDayStats] = useState<Stats>({ total: 0, validated: 0, pending: 0, totalDays: 0, advances: 0, bonuses: 0, estimatedCost: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
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

  useEffect(() => {
    fetchChantierList<{ id: string; name: string; status?: string }>().then(setChantiers);
  }, []);

  useEffect(() => {
    fetchWorkforceList(scopeQueryParams(scope)).then(setWorkforce);
  }, [scope]);

  function loadTranchesForChantier(id: string, target: 'saisie' | 'historique') {
    if (!id) {
      if (target === 'saisie') setChantierTranches([]);
      else setHistTranches([]);
      return;
    }
    api<{ id: string; name: string }[]>(`/chantiers/${id}/tranches`)
      .then((items) => {
        if (target === 'saisie') setChantierTranches(items);
        else setHistTranches(items);
      })
      .catch(() => {
        if (target === 'saisie') setChantierTranches([]);
        else setHistTranches([]);
      });
  }

  useEffect(() => {
    loadTranchesForChantier(chantierId, 'saisie');
  }, [chantierId]);

  useEffect(() => {
    loadTranchesForChantier(histChantier, 'historique');
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
    if (tab !== 'saisie' && tab !== 'matrice') return;
    const qs = new URLSearchParams();
    if (tab === 'matrice') qs.set('view', 'matrice');
    if (chantierId) qs.set('chantierId', chantierId);
    if (trancheFilter) qs.set('tranche', trancheFilter);
    setSearchParams(qs, { replace: true });
  }, [tab, chantierId, trancheFilter, setSearchParams]);

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

  function loadDay(forMatrix = tab === 'matrice') {
    setLoading(true);
    setError('');
    const filterChantier = forMatrix ? '' : chantierId;
    const qs = new URLSearchParams({ dateFrom: date, dateTo: date });
    if (filterChantier) qs.set('chantierId', filterChantier);
    if (!forMatrix && trancheFilter) qs.set('tranche', trancheFilter);
    const dayQs = new URLSearchParams({ date });
    if (filterChantier) dayQs.set('chantierId', filterChantier);
    if (!forMatrix && trancheFilter) dayQs.set('tranche', trancheFilter);
    Promise.all([
      api<Pointage[]>(`/chantiers/pointage/day?${dayQs}`),
      api<Stats>(`/chantiers/pointage/stats?${qs}`),
    ])
      .then(([pts, st]) => {
        setPointages(pts);
        setDayStats(st);
        setRows({});
        if (forMatrix) setMatrixDrafts({});
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
    if (tab === 'saisie' || tab === 'matrice') {
      qs.set('dateFrom', date);
      qs.set('dateTo', date);
      if (tab === 'saisie' && chantierId) qs.set('chantierId', chantierId);
      if (tab === 'saisie' && trancheFilter) qs.set('tranche', trancheFilter);
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
    if (tab === 'saisie' || tab === 'matrice') loadDay(tab === 'matrice');
  }, [date, chantierId, trancheFilter, tab]);

  useEffect(() => {
    if (tab === 'historique') loadHistory(histPage);
  }, [tab, histSort, histOrder]);

  function findDayPointage(workforceId: string) {
    return pointages.find(
      (p) =>
        p.workforceId === workforceId
        && (!chantierId || p.chantier?.id === chantierId),
    );
  }

  function getRowDefaults(id: string): PointageRowEdit {
    const existing = findDayPointage(id);
    const w = workforce.find((x) => x.id === id);
    const days = existing != null ? existing.dayValue : 1;
    return {
      days: formatDays(days),
      dayRate: String(existing?.dayRate ?? w?.dailySalary ?? ''),
      advance: String(existing?.advance ?? 0),
      bonus: String(existing?.bonus ?? 0),
    };
  }

  function getRow(id: string) {
    return rows[id] || getRowDefaults(id);
  }

  function setRow(id: string, patch: Partial<PointageRowEdit>) {
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] || getRowDefaults(id)), ...patch } }));
  }

  function rowTotalDay(id: string) {
    const n = Number(getRow(id).days);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function rowHours(id: string) {
    return rowTotalDay(id) * HOURS_PER_DAY;
  }

  function rowBrut(id: string, fallbackSalary = 0) {
    const r = getRow(id);
    return pointageBrut(rowTotalDay(id), Number(r.dayRate) || null, fallbackSalary);
  }

  function parseDayRate(value: string) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isNaN(n) || n <= 0 ? null : n;
  }

  function buildSavePayload(workforceId: string, validated: boolean) {
    const r = getRow(workforceId);
    return {
      date,
      workforceId,
      chantierId,
      dayValue: rowTotalDay(workforceId),
      dayRate: parseDayRate(r.dayRate),
      advance: Number(r.advance) || 0,
      bonus: Number(r.bonus) || 0,
      validated,
    };
  }

  async function saveOne(workforceId: string, validated = false, reload = true) {
    if (!chantierId) {
      await appAlert(t('msg.selectSiteFirst'));
      return;
    }
    setSaving(workforceId);
    try {
      const existing = findDayPointage(workforceId);
      const payload = buildSavePayload(workforceId, validated);
      if (existing?.id) {
        await api(`/chantiers/pointage/${existing.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            dayValue: payload.dayValue,
            dayRate: payload.dayRate,
            advance: payload.advance,
            bonus: payload.bonus,
            validated: payload.validated,
            chantierId: payload.chantierId,
          }),
        });
      } else {
        await api('/chantiers/pointage', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      if (payload.dayRate != null && payload.dayRate > 0) {
        setWorkforce((prev) =>
          prev.map((w) => (w.id === workforceId ? { ...w, dailySalary: payload.dayRate } : w)),
        );
      }
      if (reload) loadDay(false);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
      throw err;
    } finally {
      setSaving(null);
    }
  }

  async function saveAll(validated = false) {
    if (!chantierId) {
      await appAlert(t('msg.selectSiteFirst'));
      return;
    }
    if (filteredWorkforce.length === 0) return;
    setSavingAll(true);
    setError('');
    const failures: string[] = [];
    try {
      for (const w of filteredWorkforce) {
        try {
          await saveOne(w.id, validated, false);
        } catch (err) {
          failures.push(`${w.firstName} ${w.lastName}: ${err instanceof Error ? err.message : t('common.error')}`);
        }
      }
      loadDay(false);
      if (failures.length > 0) {
        await appAlert(t('msg.someLinesFailed', { details: failures.join('\n') }));
      }
    } finally {
      setSavingAll(false);
    }
  }

  async function validateAll() {
    await saveAll(true);
  }

  async function setPointageValidated(pointageId: string, validated: boolean) {
    await api(`/chantiers/pointage/${pointageId}`, {
      method: 'PUT',
      body: JSON.stringify({ validated }),
    });
  }

  async function unvalidateOne(workforceId: string) {
    const existing = findDayPointage(workforceId);
    if (!existing?.id) return;
    setSaving(workforceId);
    try {
      await setPointageValidated(existing.id, false);
      loadDay(false);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(null);
    }
  }

  async function unvalidateAll() {
    const validatedRows = filteredWorkforce.filter((w) => {
      const p = findDayPointage(w.id);
      return p?.validated;
    });
    if (validatedRows.length === 0) return;
    setSavingAll(true);
    const failures: string[] = [];
    try {
      for (const w of validatedRows) {
        const existing = findDayPointage(w.id);
        if (!existing?.id) continue;
        try {
          await setPointageValidated(existing.id, false);
        } catch (err) {
          failures.push(`${w.firstName} ${w.lastName}: ${err instanceof Error ? err.message : t('common.error')}`);
        }
      }
      loadDay(false);
      if (failures.length > 0) {
        await appAlert(t('msg.someValidationsFailed', { details: failures.join('\n') }));
      }
    } finally {
      setSavingAll(false);
    }
  }

  async function unlockForEdit(workforceId: string) {
    await unvalidateOne(workforceId);
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
      else loadDay(tab === 'matrice');
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
      loadDay(true);
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

  function printList(items: Pointage[]) {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${t('pages.attendance')} GIC</title></head><body>
      <h1>${t('pages.attendance')} — GIC</h1>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('common.date')}</th><th>${t('columns.worker')}</th><th>${t('columns.chantier')}</th><th>${t('columns.totalDays')}</th><th>${t('columns.validated')}</th></tr>
        ${items.map((p) => `<tr>
          <td>${formatDate(p.date)}</td>
          <td>${p.workforce.firstName} ${p.workforce.lastName}</td>
          <td>${p.chantier?.name || '—'}</td>
          <td>${p.totalDay.toFixed(2)}</td>
          <td>${p.validated ? t('common.yes') : t('common.no')}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const filteredWorkforce = workforce.filter((w) => {
    if (String(w.salaryPeriod || '').toLowerCase() === 'mois') return false;
    if (chantierId) {
      const assignmentsOnChantier = (w.assignments || []).filter(
        (a: { chantierId?: string; chantier?: { id: string }; tranche?: string | null }) =>
          a.chantierId === chantierId || a.chantier?.id === chantierId,
      );
      if (assignmentsOnChantier.length === 0) return false;
      if (trancheFilter) {
        const onTranche = assignmentsOnChantier.some((a: { tranche?: string | null }) => a.tranche === trancheFilter);
        if (!onTranche) return false;
      }
    }
    if (!workerQ) return true;
    const s = workerQ.toLowerCase();
    return `${w.firstName} ${w.lastName}`.toLowerCase().includes(s)
      || (w.category || '').toLowerCase().includes(s)
      || (w.reference || '').toLowerCase().includes(s);
  });

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

  const hasValidatedToday = tab === 'saisie' && filteredWorkforce.some((w) => {
    const p = findDayPointage(w.id);
    return p?.validated;
  });

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
            <div className="mac-action-group">
              <MacActionBtn
                icon={Printer}
                tone="gray"
                title={t('common.print')}
                onClick={() => printList(tab === 'historique' ? histItems : pointages)}
              />
            </div>
          </>
        }
      />

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
            { id: 'saisie', label: t('tabs.dayEntry') },
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
              else loadDay(tab === 'matrice');
            }}
          >
            {t('common.retry')}
          </Btn>
        </Card>
      )}

      {tab === 'saisie' && (
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
                <MacSelect
                  value={chantierId}
                  onChange={(v) => {
                    setChantierId(v);
                    setTrancheFilter('');
                  }}
                  options={[
                    { value: '', label: t('msg.chooseSite') },
                    ...chantiers.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  className="w-44 shrink-0"
                />
                {chantierId && (
                  <MacSelect
                    value={trancheFilter}
                    onChange={setTrancheFilter}
                    options={[
                      { value: '', label: t('msg.allTranches') },
                      ...chantierTranches.map((tr) => ({ value: tr.name, label: tr.name })),
                    ]}
                    className="w-44 shrink-0"
                  />
                )}
                {chantierId && (
                  <span className="text-[11px] text-gic-muted shrink-0">
                    {t('msg.assignedWorkers', { count: filteredWorkforce.length })}
                    {trancheFilter ? ` · ${trancheFilter}` : ''}
                  </span>
                )}
                {!chantierId && (
                  <span className="text-[11px] text-gic-coral shrink-0">{t('msg.siteRequiredToSave')}</span>
                )}
              </div>
              <div className="mac-filters-actions">
                <Btn
                  icon={Save}
                  variant="secondary"
                  onClick={() => saveAll(false)}
                  disabled={loading || savingAll || !chantierId || filteredWorkforce.length === 0}
                >
                  {savingAll ? t('auth.saving') : t('actions.saveAll')}
                </Btn>
                <Btn
                  icon={CheckCircle}
                  onClick={validateAll}
                  disabled={loading || savingAll || !chantierId || filteredWorkforce.length === 0}
                >
                  {t('actions.validateDay')}
                </Btn>
                {hasValidatedToday && (
                  <Btn
                    icon={RotateCcw}
                    variant="secondary"
                    onClick={unvalidateAll}
                    disabled={loading || savingAll}
                  >
                    {t('actions.unvalidateAll')}
                  </Btn>
                )}
              </div>
            </div>
          </div>

          <Card padding={false}>
            {loading ? (
              <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
            ) : !chantierId ? (
              <EmptyState title={t('msg.selectSiteForDayEntry')} />
            ) : filteredWorkforce.length === 0 ? (
              <EmptyState title={t('msg.emptyActiveWorkers')} />
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.worker')}</Th>
                    <Th mac>{t('columns.days')}</Th>
                    <Th mac>{t('columns.hours')}</Th>
                    <Th mac>{t('columns.dailyRateMad')}</Th>
                    <Th mac>{t('columns.brutAuto')}</Th>
                    <Th mac>{t('columns.advance')}</Th>
                    <Th mac>{t('columns.bonus')}</Th>
                    <Th mac>{t('columns.status')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkforce.map((w) => {
                    const r = getRow(w.id);
                    const brut = rowBrut(w.id, w.dailySalary || 0);
                    const existing = findDayPointage(w.id);
                    const validated = existing?.validated;
                    const locked = !!validated;
                    return (
                      <tr key={w.id} className={validated ? 'bg-gic-emerald-soft/20' : ''}>
                        <Td mac>
                          <Link to={workforceDetailPathForCategory(w.category, w.id)} className="mac-table-ref">
                            {w.reference ? `${w.reference} — ` : ''}{w.firstName} {w.lastName}
                          </Link>
                          {w.category && <span className="block text-[10px] text-gic-muted">{w.category}</span>}
                        </Td>
                        <Td mac>
                          <input
                            className={cellInputClass(locked)}
                            type="number"
                            min={0}
                            step={DAY_STEP}
                            readOnly={locked}
                            value={r.days}
                            onChange={(e) => setRow(w.id, { days: e.target.value })}
                            title={t('msg.dayStepHint')}
                          />
                        </Td>
                        <Td mac className="mac-table-muted">{rowHours(w.id).toFixed(1)} h</Td>
                        <Td mac>
                          <input
                            className={cellInputClass(locked, 'w-20')}
                            type="number"
                            min="0"
                            step="0.01"
                            readOnly={locked}
                            value={r.dayRate}
                            onChange={(e) => setRow(w.id, { dayRate: e.target.value })}
                          />
                        </Td>
                        <Td mac className="mac-table-muted">{formatMad(brut)}</Td>
                        <Td mac>
                          <input
                            className={cellInputClass(locked)}
                            readOnly={locked}
                            value={r.advance}
                            onChange={(e) => setRow(w.id, { advance: e.target.value })}
                          />
                        </Td>
                        <Td mac>
                          <input
                            className={cellInputClass(locked)}
                            readOnly={locked}
                            value={r.bonus}
                            onChange={(e) => setRow(w.id, { bonus: e.target.value })}
                          />
                        </Td>
                        <Td mac>
                          {validated ? (
                            <StatusPill status="validé" quiet />
                          ) : existing ? (
                            <StatusPill status="brouillon" quiet />
                          ) : (
                            '—'
                          )}
                        </Td>
                        <Td mac className="mac-td-actions">
                          <div className="mac-actions">
                            <MacActionBtn
                              icon={Save}
                              tone="blue"
                              title={saving === w.id ? t('auth.saving') : t('common.save')}
                              disabled={saving === w.id || savingAll || locked || !chantierId}
                              onClick={() => saveOne(w.id, false)}
                            />
                            <MacActionBtn
                              icon={CheckCircle}
                              tone="green"
                              title={t('actions.validate')}
                              disabled={saving === w.id || savingAll || validated || !chantierId}
                              onClick={() => saveOne(w.id, true)}
                            />
                            {validated && existing && (
                              <MacActionBtn
                                icon={Pencil}
                                tone="orange"
                                title={t('actions.editInList')}
                                disabled={saving === w.id || savingAll}
                                onClick={() => unlockForEdit(w.id)}
                              />
                            )}
                            {existing && (
                              <MacActionBtn
                                icon={Trash2}
                                tone="red"
                                title={t('common.delete')}
                                disabled={saving === w.id || savingAll}
                                onClick={() => { setDeleteId(existing.id); setDeleteMotif(''); }}
                              />
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
        </>
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

          <Card padding={false}>
            {loading ? (
              <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
            ) : histItems.length === 0 ? (
              <EmptyState title={t('msg.emptyAttendance')} />
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
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
