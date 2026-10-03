import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarPlus, CheckCircle, ChevronLeft, ChevronRight, Clock, Lock, Pencil, Printer, RotateCcw, Save, Trash2, UserPlus,
  Users, Wallet, X,
} from 'lucide-react';
import { api, formatDate, formatMad, type ApiError } from '../lib/api';
import { escHtml } from '../lib/companyPrint';
import { appAlert, appConfirm } from '../lib/dialog';
import { printRows } from '../lib/listPrint';
import { workforceDetailPathForCategory } from '../lib/workforceScope';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacSearch, MacSelect, Modal, StatusPill, TableWrap, Td, Th,
} from './ui';
import { EntityPickerPanel, workforceToPickerItem } from './EntityPickerPanel';
import { SelectAllTh, SelectTd, SelectionBar } from './RowSelection';
import { useRowSelection } from '../hooks/useRowSelection';
import { useI18n } from '../i18n/I18nContext';

export type SessionSummary = {
  id: string;
  chantierId: string;
  tranche: string;
  date: string;
  remark?: string | null;
  index: number;
  linesCount: number;
  validatedCount: number;
  totalDays: number;
  brut: number;
  advances: number;
  bonuses: number;
};

type SessionLine = {
  id: string;
  workforceId: string;
  dayValue: number;
  totalDay: number;
  dayRate?: number | null;
  advance: number;
  bonus: number;
  validated: boolean;
  workforce: {
    id: string;
    firstName: string;
    lastName: string;
    reference?: string | null;
    category?: string | null;
    dailySalary: number;
  };
};

type SessionDetail = SessionSummary & {
  chantier: { id: string; name: string };
  lines: SessionLine[];
};

type RowEdit = { days: string; dayRate: string; advance: string; bonus: string };

type SessionRow = { id: string; workforceId: string; worker: Worker; line: SessionLine | null };

type Worker = {
  id: string;
  firstName: string;
  lastName: string;
  reference?: string | null;
  category?: string | null;
  dailySalary?: number;
  salaryPeriod?: string | null;
  isActive?: boolean;
  photo?: string | null;
};

const DAY_STEP = 0.125;
const HOURS_PER_DAY = 8;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isFutureIso(value: string) {
  return value > todayIso();
}

function clampDays(raw: string) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return '0';
  return fmtDays(Math.min(1, n));
}

function isoDay(value: string) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toIso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function mondayPad(y: number, m: number) {
  const dow = new Date(y, m, 1).getDay();
  return dow === 0 ? 6 : dow - 1;
}

type DayTone = 'ok' | 'partial' | 'miss' | 'future';

function sessionDayTone(daySessions: SessionSummary[]): Exclude<DayTone, 'future'> {
  const pointed = daySessions.filter((s) => s.linesCount > 0);
  if (!pointed.length) return 'miss';
  if (pointed.every((s) => s.validatedCount >= s.linesCount)) return 'ok';
  return 'partial';
}

function fmtDays(n: number) {
  return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '0';
}

function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function rateOrNull(v: string) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) || n <= 0 ? null : n;
}

function cellClass(locked: boolean, width = 'w-16') {
  return `${width} rounded-lg border px-2 py-1 text-[11px] ${
    locked ? 'border-gic-border/60 bg-[#f5f5f7] text-gic-muted cursor-not-allowed' : 'border-gic-border bg-white'
  }`;
}

export default function PointageSessionManager({
  chantiers,
  chantierId,
  onChantierChange,
  tranche,
  onTrancheChange,
  workforce,
  hideSiteSelect = false,
  hideTrancheSelect = false,
  category,
  excludeCategory,
}: {
  chantiers: { id: string; name: string }[];
  chantierId: string;
  onChantierChange: (id: string) => void;
  tranche: string;
  onTrancheChange: (name: string) => void;
  workforce: Worker[];
  hideSiteSelect?: boolean;
  hideTrancheSelect?: boolean;
  category?: string;
  excludeCategory?: string;
}) {
  const { t } = useI18n();
  const MONTHS = [
    t('months.jan'), t('months.feb'), t('months.mar'), t('months.apr'),
    t('months.may'), t('months.jun'), t('months.jul'), t('months.aug'),
    t('months.sep'), t('months.oct'), t('months.nov'), t('months.dec'),
  ];
  const MONTHS_SHORT = [
    t('monthsShort.jan'), t('monthsShort.feb'), t('monthsShort.mar'), t('monthsShort.apr'),
    t('monthsShort.may'), t('monthsShort.jun'), t('monthsShort.jul'), t('monthsShort.aug'),
    t('monthsShort.sep'), t('monthsShort.oct'), t('monthsShort.nov'), t('monthsShort.dec'),
  ];
  const WEEKDAYS = [
    t('pointageMgmt.weekMon'), t('pointageMgmt.weekTue'), t('pointageMgmt.weekWed'),
    t('pointageMgmt.weekThu'), t('pointageMgmt.weekFri'), t('pointageMgmt.weekSat'), t('pointageMgmt.weekSun'),
  ];
  const [tranches, setTranches] = useState<{ id: string; name: string }[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [calCursor, setCalCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [calMode, setCalMode] = useState<'days' | 'months'>('days');
  const [lineQuery, setLineQuery] = useState('');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowEdit>>({});
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [bulkDays, setBulkDays] = useState('1');

  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ date: todayIso(), remark: '', copyPrevious: true });
  const [newError, setNewError] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addSelected, setAddSelected] = useState<string[]>([]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');

  const [remarkDraft, setRemarkDraft] = useState<string | null>(null);
  const selection = useRowSelection<SessionRow>();

  const workerPool = useMemo(
    () => workforce.filter((w) => {
      if (w.isActive === false || String(w.salaryPeriod || '').toLowerCase() === 'mois') return false;
      if (category && w.category !== category) return false;
      if (excludeCategory && w.category === excludeCategory) return false;
      return true;
    }),
    [workforce, category, excludeCategory],
  );

  useEffect(() => {
    if (!chantierId) {
      setTranches([]);
      return;
    }
    api<{ id: string; name: string }[]>(`/chantiers/${chantierId}/tranches`)
      .then(setTranches)
      .catch(() => setTranches([]));
  }, [chantierId]);

  function loadSessions(selectId?: string | null) {
    if (!chantierId) {
      setSessions([]);
      setCurrentId(null);
      setDetail(null);
      return;
    }
    setLoading(true);
    const qs = new URLSearchParams({ chantierId });
    if (tranche && tranche !== '__whole') qs.set('tranche', tranche);
    api<SessionSummary[]>(`/chantiers/pointage/sessions?${qs}`)
      .then((list) => {
        setSessions(list);
        const wanted = selectId !== undefined ? selectId : currentId;
        const keep = wanted && list.some((s) => s.id === wanted) ? wanted : list[list.length - 1]?.id ?? null;
        setCurrentId(keep);
        if (!keep) setDetail(null);
      })
      .catch(async (err) => {
        setSessions([]);
        await appAlert(err instanceof Error ? err.message : t('common.error'));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const d = new Date();
    setCalCursor({ y: d.getFullYear(), m: d.getMonth() });
    setCalMode('days');
  }, [chantierId, tranche]);

  useEffect(() => {
    if (!chantierId) {
      setSessions([]);
      setCurrentId(null);
      setDetail(null);
      return;
    }
    if (!hideSiteSelect && !chantierId) {
      loadSessions(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const body: Record<string, unknown> = { chantierId, date: todayIso() };
        if (tranche === '__whole') body.tranche = '';
        else if (tranche) body.tranche = tranche;
        if (category) body.category = category;
        if (excludeCategory) body.excludeCategory = excludeCategory;
        const result = await api<{ id: string | null }>('/chantiers/pointage/sessions/ensure', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (!cancelled) loadSessions(result.id);
      } catch {
        if (!cancelled) loadSessions(null);
      }
    })();
    return () => { cancelled = true; };
  }, [chantierId, tranche, hideSiteSelect, category, excludeCategory]);

  function loadDetail(id: string) {
    api<SessionDetail>(`/chantiers/pointage/sessions/${id}`)
      .then((d) => {
        setDetail(d);
        setDrafts({});
        setPendingIds([]);
        setRemarkDraft(null);
      })
      .catch(() => setDetail(null));
  }

  useEffect(() => {
    selection.clear();
    setLineQuery('');
    if (currentId) loadDetail(currentId);
    else setDetail(null);
  }, [currentId]);

  const scopeTranche = tranche === '__whole' ? '' : tranche;
  const visibleSessions = useMemo(() => sessions.filter((s) => {
    if (tranche === '__whole' && s.tranche) return false;
    if (tranche && tranche !== '__whole' && s.tranche !== tranche) return false;
    return true;
  }), [sessions, tranche]);

  const currentIndex = visibleSessions.findIndex((s) => s.id === currentId);
  const hasUnsaved = pendingIds.length > 0 || Object.keys(drafts).length > 0;

  async function fillAssigned(date: string) {
    if (!chantierId || !date || isFutureIso(date)) return null;
    const body: Record<string, unknown> = { chantierId, date };
    if (tranche === '__whole') body.tranche = '';
    else if (tranche) body.tranche = tranche;
    if (category) body.category = category;
    if (excludeCategory) body.excludeCategory = excludeCategory;
    const result = await api<{ id: string | null }>('/chantiers/pointage/sessions/ensure', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return result.id;
  }

  async function goTo(id: string | null) {
    if (!id || id === currentId) return;
    if (hasUnsaved && !(await appConfirm(t('pointageMgmt.unsavedConfirm')))) return;
    const session = sessions.find((row) => row.id === id);
    if (session && isFutureIso(isoDay(session.date))) {
      await appAlert(t('pointageMgmt.cannotPointFuture'));
      return;
    }
    if (session) {
      try {
        const filled = await fillAssigned(isoDay(session.date));
        setCurrentId(filled || id);
        return;
      } catch {
        /* la feuille existante reste consultable */
      }
    }
    setCurrentId(id);
  }

  function sessionsOnDay(value: string) {
    return sessions.filter((s) => {
      if (isoDay(s.date) !== value) return false;
      if (tranche === '__whole' && s.tranche) return false;
      if (tranche && tranche !== '__whole' && s.tranche !== tranche) return false;
      return true;
    });
  }

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, SessionSummary[]>();
    for (const s of visibleSessions) {
      const key = isoDay(s.date);
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    }
    return map;
  }, [visibleSessions]);

  function toneForIso(iso: string): DayTone {
    if (iso > todayIso()) return 'future';
    return sessionDayTone(sessionsByDay.get(iso) || []);
  }

  async function jumpToDate(value: string) {
    if (!value) return;
    if (isFutureIso(value)) {
      await appAlert(t('pointageMgmt.cannotPointFuture'));
      return;
    }
    if (hasUnsaved && detail && isoDay(detail.date) !== value && !(await appConfirm(t('pointageMgmt.unsavedConfirm')))) {
      return;
    }
    const parts = value.split('-').map(Number);
    if (parts.length === 3 && parts.every(Number.isFinite)) {
      setCalCursor({ y: parts[0], m: parts[1] - 1 });
    }
    if (chantierId) {
      try {
        const filled = await fillAssigned(value);
        if (filled) {
          loadSessions(filled);
          if (filled === currentId) loadDetail(filled);
          return;
        }
      } catch (err) {
        await appAlert(err instanceof Error ? err.message : t('common.error'));
      }
    }
    const matches = sessionsOnDay(value);
    if (!matches.length) return;
    const target = matches[matches.length - 1];
    if (target.id !== currentId) await goTo(target.id);
  }

  function lineDefaults(line: SessionLine): RowEdit {
    return {
      days: fmtDays(line.dayValue ?? line.totalDay ?? 0),
      dayRate: String(line.dayRate ?? line.workforce.dailySalary ?? ''),
      advance: String(line.advance ?? 0),
      bonus: String(line.bonus ?? 0),
    };
  }

  function pendingDefaults(workforceId: string): RowEdit {
    const w = workerPool.find((x) => x.id === workforceId) || workforce.find((x) => x.id === workforceId);
    return { days: '1', dayRate: String(w?.dailySalary ?? ''), advance: '0', bonus: '0' };
  }

  function rowFor(workforceId: string): RowEdit {
    if (drafts[workforceId]) return drafts[workforceId];
    const line = detail?.lines.find((l) => l.workforceId === workforceId);
    return line ? lineDefaults(line) : pendingDefaults(workforceId);
  }

  function advanceCeiling(saved: number, sum: number) {
    return Math.max(saved, sum);
  }

  function onAdvanceChange(raw: string, saved: number, sum: number) {
    if (raw.trim() === '') return raw;
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    const ceiling = advanceCeiling(saved, sum);
    if (n > ceiling) return String(ceiling);
    return raw;
  }

  function settleAdvance(raw: string, saved: number, sum: number) {
    const n = Number(raw);
    const ceiling = advanceCeiling(saved, sum);
    const value = Number.isFinite(n) ? n : saved;
    return String(Math.round(Math.min(Math.max(value, saved), ceiling) * 100) / 100);
  }

  function patchRow(workforceId: string, patch: Partial<RowEdit>) {
    if (patch.days != null) patch = { ...patch, days: clampDays(patch.days) };
    setDrafts((prev) => ({ ...prev, [workforceId]: { ...rowFor(workforceId), ...patch } }));
  }

  const rows = useMemo<SessionRow[]>(() => {
    const saved = (detail?.lines || [])
      .filter((l) => {
        const cat = l.workforce?.category || '';
        if (category) return cat === category;
        if (excludeCategory) return cat !== excludeCategory;
        return true;
      })
      .map((l) => ({
      id: l.workforceId,
      workforceId: l.workforceId,
      worker: l.workforce as Worker,
      line: l as SessionLine | null,
    }));
    const pending = pendingIds
      .filter((id) => !saved.some((s) => s.workforceId === id))
      .map((id) => ({
        id,
        workforceId: id,
        worker: (workerPool.find((w) => w.id === id) || workforce.find((w) => w.id === id)) as Worker,
        line: null as SessionLine | null,
      }))
      .filter((r) => !!r.worker);
    return [...saved, ...pending];
  }, [detail, pendingIds, workerPool, workforce, category, excludeCategory]);

  const visibleRows = useMemo(() => {
    const needle = lineQuery.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.worker.reference || ''} ${r.worker.firstName} ${r.worker.lastName} ${r.worker.category || ''}`
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, lineQuery]);

  const totals = useMemo(() => {
    let days = 0;
    let brut = 0;
    let advances = 0;
    let bonuses = 0;
    for (const r of rows) {
      const e = rowFor(r.workforceId);
      const d = num(e.days);
      const rate = rateOrNull(e.dayRate) ?? r.worker?.dailySalary ?? 0;
      days += d;
      brut += d * rate;
      advances += num(e.advance);
      bonuses += num(e.bonus);
    }
    return { days, brut, advances, bonuses };
  }, [rows, drafts, detail]);

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!chantierId) return;
    setNewError('');
    if (isFutureIso(newForm.date)) {
      setNewError(t('pointageMgmt.cannotPointFuture'));
      return;
    }
    setBusy(true);
    try {
      const created = await api<SessionDetail>('/chantiers/pointage/sessions', {
        method: 'POST',
        body: JSON.stringify({
          chantierId,
          tranche: scopeTranche,
          date: newForm.date,
          remark: newForm.remark || null,
          copyPrevious: newForm.copyPrevious,
        }),
      });
      setNewOpen(false);
      loadSessions(created.id);
    } catch (err) {
      const apiErr = err as ApiError;
      const message = apiErr.message || t('common.error');
      if (apiErr.status === 409) {
        setNewError(message);
        const existingId = apiErr.data?.existingId as string | undefined;
        await appAlert(message, { title: t('pointageMgmt.duplicateTitle') });
        if (existingId && sessions.some((s) => s.id === existingId)) {
          if (await appConfirm(t('pointageMgmt.openExisting'))) {
            setNewOpen(false);
            setCurrentId(existingId);
          }
        }
      } else {
        setNewError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  function openNew() {
    setNewForm({ date: todayIso(), remark: '', copyPrevious: sessions.length > 0 });
    setNewError('');
    setNewOpen(true);
  }

  const duplicateInList = newOpen
    ? sessions.find((s) => isoDay(s.date) === newForm.date && s.tranche === scopeTranche)
    : undefined;

  async function saveAll(validate: boolean) {
    if (!detail) return;
    const payload = rows
      .filter((r) => !r.line?.validated)
      .map((r) => {
        const e = rowFor(r.workforceId);
        return {
          workforceId: r.workforceId,
          dayValue: Math.min(1, num(e.days)),
          dayRate: rateOrNull(e.dayRate),
          advance: num(e.advance),
          bonus: num(e.bonus),
          ...(validate ? { validated: true } : {}),
        };
      });
    if (!payload.length) {
      if (validate) await appAlert(t('pointageMgmt.nothingToValidate'));
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ saved: number; errors: string[]; session: SessionDetail }>(
        `/chantiers/pointage/sessions/${detail.id}/lines`,
        { method: 'POST', body: JSON.stringify({ lines: payload }) },
      );
      setDetail(res.session);
      setDrafts({});
      setPendingIds([]);
      loadSessions(detail.id);
      if (res.errors.length) await appAlert(res.errors.join('\n'), { title: t('pointageMgmt.someLinesRejected') });
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function unvalidateSession() {
    if (!detail) return;
    if (!(await appConfirm(t('pointageMgmt.unvalidateConfirm')))) return;
    setBusy(true);
    try {
      const d = await api<SessionDetail>(`/chantiers/pointage/sessions/${detail.id}/validate`, {
        method: 'PUT',
        body: JSON.stringify({ validated: false }),
      });
      setDetail(d);
      loadSessions(detail.id);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleLineValidated(line: SessionLine, validated: boolean) {
    setBusy(true);
    try {
      await api(`/chantiers/pointage/${line.id}`, { method: 'PUT', body: JSON.stringify({ validated }) });
      if (detail) loadDetail(detail.id);
      loadSessions(detail?.id);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(r: SessionRow) {
    if (!r.line) {
      if (selection.isSelected(r.id)) selection.toggle(r);
      setPendingIds((prev) => prev.filter((id) => id !== r.workforceId));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[r.workforceId];
        return next;
      });
      return;
    }
    if (r.line.validated) {
      await appAlert(t('pointageMgmt.unlockBeforeRemove'));
      return;
    }
    const name = `${r.worker.firstName} ${r.worker.lastName}`;
    if (!(await appConfirm(t('pointageMgmt.removeLineConfirm', { name })))) return;
    setBusy(true);
    try {
      await api(`/chantiers/pointage/${r.line.id}`, {
        method: 'DELETE',
        body: JSON.stringify({
          motif: `Retiré du pointage du ${detail ? formatDate(detail.date) : ''}`,
        }),
      });
      if (selection.isSelected(r.id)) selection.toggle(r);
      if (detail) loadDetail(detail.id);
      loadSessions(detail?.id);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteSession() {
    if (!detail || !deleteMotif.trim()) return;
    setBusy(true);
    try {
      await api(`/chantiers/pointage/sessions/${detail.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ motif: deleteMotif.trim() }),
      });
      setDeleteOpen(false);
      setDeleteMotif('');
      const idx = currentIndex;
      const remaining = sessions.filter((s) => s.id !== detail.id);
      const nextId = remaining[Math.min(idx, remaining.length - 1)]?.id ?? null;
      loadSessions(nextId);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function saveRemark() {
    if (!detail || remarkDraft == null) return;
    try {
      const d = await api<SessionDetail>(`/chantiers/pointage/sessions/${detail.id}`, {
        method: 'PUT',
        body: JSON.stringify({ remark: remarkDraft }),
      });
      setDetail(d);
      setRemarkDraft(null);
      loadSessions(detail.id);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function applyBulkDays() {
    const value = clampDays(bulkDays);
    setBulkDays(value);
    if (!Number.isFinite(Number(value)) || Number(value) < 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (r.line?.validated) continue;
        next[r.workforceId] = { ...rowFor(r.workforceId), days: value };
      }
      return next;
    });
  }

  function confirmAddWorkers() {
    setPendingIds((prev) => [...prev, ...addSelected.filter((id) => !prev.includes(id))]);
    setAddSelected([]);
    setAddQuery('');
    setAddOpen(false);
  }

  const inSessionIds = rows.map((r) => r.workforceId);
  const allValidated = !!detail && detail.lines.length > 0 && detail.validatedCount === detail.linesCount;
  const anyValidated = !!detail && detail.validatedCount > 0;
  const trancheLabel = (s: { tranche: string }) => s.tranche || t('pointageMgmt.wholeSite');

  function printList() {
    if (!detail) return;
    const days = (r: SessionRow) => num(rowFor(r.workforceId).days);
    const rate = (r: SessionRow) => rateOrNull(rowFor(r.workforceId).dayRate) ?? r.worker.dailySalary ?? 0;
    const advance = (r: SessionRow) => num(rowFor(r.workforceId).advance);
    const bonus = (r: SessionRow) => num(rowFor(r.workforceId).bonus);
    const sum = (list: SessionRow[], fn: (r: SessionRow) => number) => list.reduce((s, r) => s + fn(r), 0);
    const selected = rows.filter((r) => selection.isSelected(r.id));
    const sessionStatus = allValidated
      ? t('pointageMgmt.validated')
      : anyValidated
        ? t('pointageMgmt.partiallyValidated', { done: detail.validatedCount, total: detail.linesCount })
        : t('pointageMgmt.draft');
    printRows<SessionRow>({
      title: `${t('pages.attendance')} — ${t('actions.enterAttendance')}`,
      subtitle: `${t('pointageMgmt.pointageN', { n: visibleSessions[currentIndex]?.index ?? 1 })} · ${formatDate(detail.date)}`,
      filters: [
        [t('columns.chantier'), detail.chantier.name],
        [t('fields.tranche'), trancheLabel(detail)],
        [t('common.date'), formatDate(detail.date)],
        [t('listPrint.status'), sessionStatus],
        [t('fields.remark'), detail.remark],
      ],
      columns: [
        { label: t('columns.worker'), value: (r) => `${r.worker.reference ? `${r.worker.reference} — ` : ''}${r.worker.firstName} ${r.worker.lastName}${r.worker.category ? ` (${r.worker.category})` : ''}` },
        { label: t('columns.days'), value: (r) => fmtDays(days(r)), align: 'right', total: (list) => fmtDays(sum(list, days)) },
        { label: t('columns.hours'), value: (r) => `${(days(r) * HOURS_PER_DAY).toFixed(1)} h`, align: 'right', total: (list) => `${(sum(list, days) * HOURS_PER_DAY).toFixed(1)} h` },
        { label: t('columns.dailyRateMad'), value: (r) => formatMad(rate(r)), align: 'right' },
        { label: t('columns.brutAuto'), value: (r) => formatMad(days(r) * rate(r)), align: 'right', total: (list) => formatMad(sum(list, (r) => days(r) * rate(r))) },
        { label: t('columns.advance'), value: (r) => formatMad(advance(r)), align: 'right', total: (list) => formatMad(sum(list, advance)) },
        { label: t('columns.bonus'), value: (r) => formatMad(bonus(r)), align: 'right', total: (list) => formatMad(sum(list, bonus)) },
        {
          label: t('columns.status'),
          value: (r) => (r.line?.validated ? t('pointageMgmt.validated') : r.line ? t('pointageMgmt.draft') : t('pointageMgmt.newLine')),
        },
      ],
      rows: selected.length ? selected : rows,
      selectedCount: selected.length,
      extraHtml: (list) => {
        const net = sum(list, (r) => days(r) * rate(r)) + sum(list, bonus) - sum(list, advance);
        return `<p><span class="k">${escHtml(t('pointageMgmt.netToPay'))} :</span> ${escHtml(formatMad(net))}</p>`;
      },
    });
  }

  const monthDays = useMemo(() => {
    const pad = mondayPad(calCursor.y, calCursor.m);
    const count = new Date(calCursor.y, calCursor.m + 1, 0).getDate();
    const cells: { iso: string | null; day: number | null }[] = [];
    for (let i = 0; i < pad; i++) cells.push({ iso: null, day: null });
    for (let d = 1; d <= count; d++) cells.push({ iso: toIso(calCursor.y, calCursor.m, d), day: d });
    return cells;
  }, [calCursor]);

  const selectedIso = detail ? isoDay(detail.date) : '';
  const today = todayIso();

  const pointageCalendar = (
    <div className="pointage-cal-wrap">
      <div className="min-w-0 flex-1">
        <h2 className="text-[17px] font-semibold text-gic-ink">
          {MONTHS[calCursor.m]} {calCursor.y}
        </h2>
        {detail && (
          <>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="mac-chip">{trancheLabel(detail)}</span>
              {allValidated ? (
                <span className="mac-chip mac-chip-green">{t('pointageMgmt.validated')}</span>
              ) : anyValidated ? (
                <span className="mac-chip mac-chip-orange">
                  {t('pointageMgmt.partiallyValidated', { done: detail.validatedCount, total: detail.linesCount })}
                </span>
              ) : (
                <span className="mac-chip mac-chip-gray">{t('pointageMgmt.draft')}</span>
              )}
              {hasUnsaved && <span className="mac-chip mac-chip-blue">{t('pointageMgmt.unsaved')}</span>}
            </div>
            {remarkDraft == null ? (
              <button
                type="button"
                className="mt-2 text-[12px] text-gic-muted hover:text-gic-ink inline-flex items-center gap-1"
                onClick={() => setRemarkDraft(detail.remark || '')}
              >
                <Pencil size={11} /> {detail.remark || t('pointageMgmt.addRemark')}
              </button>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="rounded-lg border border-gic-border px-2 py-1 text-[12px] w-72 max-w-full"
                  value={remarkDraft}
                  autoFocus
                  onChange={(e) => setRemarkDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveRemark();
                    if (e.key === 'Escape') setRemarkDraft(null);
                  }}
                />
                <MacActionBtn icon={Save} tone="blue" title={t('common.save')} onClick={saveRemark} />
                <MacActionBtn icon={X} tone="gray" title={t('common.cancel')} onClick={() => setRemarkDraft(null)} />
              </div>
            )}
          </>
        )}
      </div>
      <div className="pointage-cal" role="group" aria-label={t('pointageMgmt.dayCalendar')}>
        <div className="pointage-cal-header">
          <button
            type="button"
            className="pointage-cal-nav"
            aria-label={calMode === 'months' ? t('pointageMgmt.prevYear') : t('common.prevMonth')}
            onClick={() => setCalCursor((c) => (
              calMode === 'months'
                ? { ...c, y: c.y - 1 }
                : c.m === 0 ? { y: c.y - 1, m: 11 } : { ...c, m: c.m - 1 }
            ))}
          >
            <ChevronLeft size={14} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            className="pointage-cal-title"
            onClick={() => setCalMode((mode) => (mode === 'days' ? 'months' : 'days'))}
          >
            {calMode === 'months' ? calCursor.y : `${MONTHS[calCursor.m]} ${calCursor.y}`}
          </button>
          <button
            type="button"
            className="pointage-cal-nav"
            aria-label={calMode === 'months' ? t('pointageMgmt.nextYear') : t('common.nextMonth')}
            onClick={() => setCalCursor((c) => (
              calMode === 'months'
                ? { ...c, y: c.y + 1 }
                : c.m === 11 ? { y: c.y + 1, m: 0 } : { ...c, m: c.m + 1 }
            ))}
          >
            <ChevronRight size={14} strokeWidth={2.25} />
          </button>
        </div>
        {calMode === 'months' ? (
          <div className="pointage-mini-months">
            {MONTHS_SHORT.map((label, idx) => (
              <button
                key={`${label}-${idx}`}
                type="button"
                className={`pointage-mini-month${calCursor.m === idx ? ' is-active' : ''}`}
                onClick={() => { setCalCursor((c) => ({ ...c, m: idx })); setCalMode('days'); }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="pointage-cal-weekdays">
              {WEEKDAYS.map((d, i) => (
                <span key={`${d}-${i}`}>{d}</span>
              ))}
            </div>
            <div className="pointage-cal-grid">
              {monthDays.map((cell, i) => {
                if (!cell.iso || cell.day == null) {
                  return <span key={`pad-${i}`} className="pointage-cal-day is-empty" />;
                }
                const tone = toneForIso(cell.iso);
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    className={[
                      'pointage-cal-day',
                      `is-${tone}`,
                      cell.iso === today ? 'is-today' : '',
                      cell.iso === selectedIso ? 'is-selected' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => {
                      if (tone === 'future') return;
                      void jumpToDate(cell.iso!);
                    }}
                    disabled={tone === 'future'}
                    aria-label={cell.iso}
                    aria-current={cell.iso === selectedIso ? 'date' : undefined}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className="pointage-mini-legend">
          <span><i className="pointage-cal-dot is-ok" aria-hidden />{t('pointageMgmt.legendValidated')}</span>
          <span><i className="pointage-cal-dot is-partial" aria-hidden />{t('pointageMgmt.legendPartial')}</span>
          <span><i className="pointage-cal-dot is-miss" aria-hidden />{t('pointageMgmt.legendMissing')}</span>
        </div>
      </div>
    </div>
  );

  const filterControls = (
    <>
      {!hideSiteSelect && (
        <MacSelect
          value={chantierId}
          onChange={async (v) => {
            if (hasUnsaved && !(await appConfirm(t('pointageMgmt.unsavedConfirm')))) return;
            onChantierChange(v);
          }}
          options={[
            { value: '', label: t('msg.chooseSite') },
            ...chantiers.map((c) => ({ value: c.id, label: c.name })),
          ]}
          className="w-48 shrink-0"
        />
      )}
      {chantierId && !hideTrancheSelect && (
        <MacSelect
          value={tranche}
          onChange={async (v) => {
            if (hasUnsaved && !(await appConfirm(t('pointageMgmt.unsavedConfirm')))) return;
            onTrancheChange(v);
          }}
          options={[
            { value: '', label: t('msg.allTranches') },
            { value: '__whole', label: t('pointageMgmt.wholeSite') },
            ...tranches.map((tr) => ({ value: tr.name, label: tr.name })),
          ]}
          className="w-44 shrink-0"
        />
      )}
    </>
  );

  const listActions = (
    <div className="flex flex-wrap items-center gap-2">
      <Btn icon={CheckCircle} onClick={() => saveAll(true)} disabled={busy || rows.length === 0 || (allValidated && !hasUnsaved)}>
        {t('pointageMgmt.validatePointage')}
      </Btn>
      <Btn variant="secondary" icon={UserPlus} onClick={() => setAddOpen(true)} disabled={busy || !detail}>
        {t('pointageMgmt.addWorkers')}
      </Btn>
      {anyValidated && (
        <Btn variant="secondary" icon={RotateCcw} onClick={unvalidateSession} disabled={busy}>
          {t('actions.unvalidateAll')}
        </Btn>
      )}
      <Btn
        variant="secondary"
        icon={Save}
        title={busy ? t('auth.saving') : t('actions.saveAll')}
        aria-label={busy ? t('auth.saving') : t('actions.saveAll')}
        className="!px-2"
        onClick={() => saveAll(false)}
        disabled={busy || rows.length === 0}
      />
      <Btn
        variant="secondary"
        icon={Printer}
        title={t('common.print')}
        aria-label={t('common.print')}
        className="!px-2"
        onClick={printList}
        disabled={!detail || rows.length === 0}
      />
      <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px] text-gic-muted">
        <span>{t('pointageMgmt.bulkApply')}</span>
        <input
          className="w-16 rounded-lg border border-gic-border bg-white px-2 py-1 text-[11px]"
          type="number"
          min={0}
          max={1}
          step={DAY_STEP}
          value={bulkDays}
          onChange={(e) => setBulkDays(clampDays(e.target.value))}
        />
        <span>{t('columns.days')}</span>
        <Btn variant="secondary" className="!py-1" onClick={applyBulkDays} disabled={!detail}>{t('pointageMgmt.apply')}</Btn>
        {detail && (
          <Btn variant="danger" icon={Trash2} onClick={() => { setDeleteMotif(''); setDeleteOpen(true); }} disabled={busy}>
            {t('pointageMgmt.deletePointage')}
          </Btn>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {!detail && !hideSiteSelect && (
        <div className="mac-filters-panel">
          <div className="mac-filters-row mac-filters-row-between">
            <div className="mac-filters-toolbar">{filterControls}</div>
            <div className="mac-filters-actions">
              <Btn icon={CalendarPlus} onClick={openNew} disabled={!chantierId || busy}>
                {t('pointageMgmt.newPointage')}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {!chantierId ? (
        <Card>
          <EmptyState title={t('pointageMgmt.selectSite')} />
        </Card>
      ) : loading && !sessions.length ? (
        <Card>
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        </Card>
      ) : (
        <>
          {detail && (
          <div className="mac-kpi-grid mac-kpi-grid-4">
            <KpiCard title={t('pointageMgmt.workers')} value={rows.length} icon={Users} tone="violet" compact />
            <KpiCard title={t('kpi.eqDays')} value={fmtDays(totals.days)} icon={Clock} tone="amber" compact />
            <KpiCard title={t('columns.brut')} value={formatMad(totals.brut)} icon={Wallet} tone="emerald" compact />
            <KpiCard
              title={t('pointageMgmt.netToPay')}
              value={formatMad(Math.max(0, totals.brut + totals.bonuses - totals.advances))}
              icon={Wallet}
              tone="coral"
              compact
              delta={`${t('columns.advance')} ${formatMad(totals.advances)} · ${t('columns.bonus')} ${formatMad(totals.bonuses)}`}
              deltaTone="muted"
            />
          </div>
          )}

          <Card className="!p-4 overflow-visible">
            {pointageCalendar}
          </Card>

          {sessions.length === 0 || visibleSessions.length === 0 || !detail ? (
            <Card>
              <div className="py-10 text-center">
                {loading ? (
                  <p className="text-[12px] text-gic-muted">{t('common.loading')}</p>
                ) : sessions.length === 0 ? (
                  <>
                    <p className="text-[13px] font-medium text-gic-ink">{hideSiteSelect ? t('pointageMgmt.emptyLines') : t('pointageMgmt.emptySessions')}</p>
                    {!hideSiteSelect && <p className="text-[12px] text-gic-muted mt-1 mb-4">{t('pointageMgmt.emptySessionsHint')}</p>}
                    {!hideSiteSelect && <Btn icon={CalendarPlus} onClick={openNew}>{t('pointageMgmt.newPointage')}</Btn>}
                  </>
                ) : visibleSessions.length === 0 ? (
                  <p className="text-[13px] text-gic-muted">{t('pointageMgmt.emptyPeriod')}</p>
                ) : (
                  <p className="text-[12px] text-gic-muted">{t('common.loading')}</p>
                )}
              </div>
            </Card>
          ) : (
            <>
          <SelectionBar selection={selection} onPrint={printList} />

          <Card padding={false}>
            <div className="space-y-3 border-b border-gic-border/70 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {filterControls}
                <MacSearch
                  value={lineQuery}
                  onChange={setLineQuery}
                  placeholder={t('pointageMgmt.findWorker')}
                  className="w-52"
                />
                {!hideSiteSelect && (
                  <Btn className="ml-auto" icon={CalendarPlus} onClick={openNew} disabled={!chantierId || busy}>
                    {t('pointageMgmt.newPointage')}
                  </Btn>
                )}
              </div>
              {listActions}
            </div>
            {rows.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[12px] text-gic-muted">{t('pointageMgmt.emptyLines')}</p>
              </div>
            ) : visibleRows.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-gic-muted">{t('pointageMgmt.noWorkerMatch')}</p>
            ) : (
              <TableWrap mac>
                  <thead>
                    <tr>
                      <SelectAllTh selection={selection} rows={visibleRows} />
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
                    {visibleRows.map((r) => {
                      const e = rowFor(r.workforceId);
                      const locked = !!r.line?.validated;
                      const d = num(e.days);
                      const rate = rateOrNull(e.dayRate) ?? r.worker.dailySalary ?? 0;
                      const dirty = !!drafts[r.workforceId] || !r.line;
                      return (
                        <tr key={r.workforceId} className={locked ? 'bg-gic-emerald-soft/20' : dirty ? 'bg-[#007aff]/[0.03]' : ''}>
                          <SelectTd selection={selection} row={r} />
                          <Td mac>
                            <Link to={workforceDetailPathForCategory(r.worker.category, r.worker.id)} className="mac-table-ref">
                              {r.worker.reference ? `${r.worker.reference} — ` : ''}{r.worker.firstName} {r.worker.lastName}
                            </Link>
                            {r.worker.category && <span className="block text-[10px] text-gic-muted">{r.worker.category}</span>}
                          </Td>
                          <Td mac>
                            <input
                              className={cellClass(locked)}
                              type="number"
                              min={0}
                              max={1}
                              step={DAY_STEP}
                              readOnly={locked}
                              value={e.days}
                              onChange={(ev) => patchRow(r.workforceId, { days: ev.target.value })}
                              title={t('msg.dayStepHint')}
                            />
                          </Td>
                          <Td mac className="mac-table-muted">{(d * HOURS_PER_DAY).toFixed(1)} h</Td>
                          <Td mac>
                            <input
                              className={cellClass(locked, 'w-20')}
                              type="number"
                              min="0"
                              step="0.01"
                              readOnly={locked}
                              value={e.dayRate}
                              onChange={(ev) => patchRow(r.workforceId, { dayRate: ev.target.value })}
                            />
                          </Td>
                          <Td mac className="mac-table-muted">{formatMad(d * rate)}</Td>
                          <Td mac>
                            {(() => {
                              const saved = r.line?.advance ?? 0;
                              const sum = Math.round(d * rate * 100) / 100;
                              return (
                                <input
                                  className={cellClass(locked)}
                                  type="number"
                                  min={saved}
                                  max={advanceCeiling(saved, sum)}
                                  step="0.01"
                                  readOnly={locked}
                                  value={e.advance}
                                  onChange={(ev) => patchRow(r.workforceId, { advance: onAdvanceChange(ev.target.value, saved, sum) })}
                                  onBlur={(ev) => patchRow(r.workforceId, { advance: settleAdvance(ev.currentTarget.value, saved, sum) })}
                                />
                              );
                            })()}
                          </Td>
                          <Td mac>
                            <input
                              className={cellClass(locked)}
                              readOnly={locked}
                              value={e.bonus}
                              onChange={(ev) => patchRow(r.workforceId, { bonus: ev.target.value })}
                            />
                          </Td>
                          <Td mac>
                            {locked ? (
                              <StatusPill status="validé" quiet />
                            ) : r.line ? (
                              <StatusPill status="brouillon" quiet />
                            ) : (
                              <span className="mac-chip mac-chip-blue">{t('pointageMgmt.newLine')}</span>
                            )}
                          </Td>
                          <Td mac className="mac-td-actions">
                            <div className="mac-actions">
                              {r.line && !locked && (
                                <MacActionBtn
                                  icon={CheckCircle}
                                  tone="green"
                                  title={t('actions.validate')}
                                  disabled={busy || dirty}
                                  onClick={() => toggleLineValidated(r.line!, true)}
                                />
                              )}
                              {r.line && locked && (
                                <MacActionBtn
                                  icon={Lock}
                                  tone="orange"
                                  title={t('actions.editInList')}
                                  disabled={busy}
                                  onClick={() => toggleLineValidated(r.line!, false)}
                                />
                              )}
                              <MacActionBtn
                                icon={Trash2}
                                tone="red"
                                title={t('common.remove')}
                                disabled={busy}
                                onClick={() => removeRow(r)}
                              />
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
        </>
      )}

      <Modal
        open={newOpen}
        title={t('pointageMgmt.newPointage')}
        onClose={() => setNewOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setNewOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="new-pointage-form" type="submit" disabled={busy || !newForm.date || !!duplicateInList}>
              {t('actions.create')}
            </Btn>
          </>
        }
      >
        <form id="new-pointage-form" onSubmit={createSession} className="grid gap-3">
          <p className="text-[12px] text-gic-muted">
            {chantiers.find((c) => c.id === chantierId)?.name || detail?.chantier.name} · {scopeTranche || t('pointageMgmt.wholeSite')}
          </p>
          <Input
            label={`${t('common.date')} *`}
            type="date"
            required
            max={todayIso()}
            value={newForm.date}
            onChange={(e) => { setNewForm({ ...newForm, date: e.target.value }); setNewError(''); }}
          />
          {duplicateInList && (
            <div className="rounded-lg border border-[#ff9500]/40 bg-[#ff9500]/10 px-3 py-2 text-[12px] text-[#b25e00]">
              {t('pointageMgmt.duplicateInline', { date: formatDate(duplicateInList.date) })}
              <button
                type="button"
                className="ml-2 underline font-medium"
                onClick={() => { setNewOpen(false); void goTo(duplicateInList.id); }}
              >
                {t('pointageMgmt.openIt')}
              </button>
            </div>
          )}
          <Input
            label={t('fields.remark')}
            value={newForm.remark}
            onChange={(e) => setNewForm({ ...newForm, remark: e.target.value })}
          />
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={newForm.copyPrevious}
              onChange={(e) => setNewForm({ ...newForm, copyPrevious: e.target.checked })}
            />
            {t('pointageMgmt.copyPrevious')}
          </label>
          {newError && <p className="text-[11px] text-gic-coral">{newError}</p>}
        </form>
      </Modal>

      <Modal
        open={addOpen}
        size="lg"
        title={t('pointageMgmt.addWorkers')}
        onClose={() => setAddOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setAddOpen(false)}>{t('common.cancel')}</Btn>
            <Btn onClick={confirmAddWorkers} disabled={addSelected.length === 0}>
              {t('pointageMgmt.addCount', { count: addSelected.length })}
            </Btn>
          </>
        }
      >
        <EntityPickerPanel
          items={workerPool.map(workforceToPickerItem)}
          excludeIds={inSessionIds}
          multiple
          selectedIds={addSelected}
          onToggleSelect={(id) =>
            setAddSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
          }
          query={addQuery}
          onQueryChange={setAddQuery}
          open={addOpen}
          searchPlaceholder={t('fields.filterNameRefCinCat')}
          emptyMessage={t('msg.emptyWorkersAvailable')}
          countLabel={(n) => t('msg.workersAvailableCount', { count: n })}
          ariaLabel={t('pointageMgmt.addWorkers')}
        />
        <p className="text-[11px] text-gic-muted mt-2">{t('pointageMgmt.addWorkersHint')}</p>
      </Modal>

      <Modal
        open={deleteOpen}
        title={t('pointageMgmt.deletePointage')}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDeleteSession} disabled={busy || !deleteMotif.trim()}>
              {t('pointageMgmt.confirmDelete')}
            </Btn>
          </>
        }
      >
        {detail && (
          <div className="space-y-3">
            <div className="rounded-lg border border-gic-coral/30 bg-gic-coral-soft/30 px-3 py-2 text-[12px] text-gic-ink">
              {t('pointageMgmt.deleteWarning', {
                date: formatDate(detail.date),
                count: detail.linesCount,
                scope: `${detail.chantier.name} · ${trancheLabel(detail)}`,
              })}
            </div>
            <textarea
              className="w-full h-20 rounded-xl border border-gic-border p-3 text-[12px]"
              placeholder={t('msg.motifPlaceholder')}
              value={deleteMotif}
              onChange={(e) => setDeleteMotif(e.target.value)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
