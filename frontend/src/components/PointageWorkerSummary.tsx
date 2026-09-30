import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Clock, Lock, Printer, Save, Trash2, Users, Wallet } from 'lucide-react';
import { api, formatDate, formatMad, type PaginatedResponse } from '../lib/api';
import { escHtml } from '../lib/companyPrint';
import { appAlert, appConfirm } from '../lib/dialog';
import { printRows, type PrintFilter } from '../lib/listPrint';
import { workforceDetailPathForCategory } from '../lib/workforceScope';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect, Modal, StatusPill, TableWrap, Td, Th,
} from './ui';
import { SelectAllTh, SelectTd, SelectionBar } from './RowSelection';
import { useRowSelection } from '../hooks/useRowSelection';
import { useI18n } from '../i18n/I18nContext';

type SummaryItem = {
  workforceId: string;
  workforce: {
    id: string;
    reference?: string | null;
    firstName: string;
    lastName: string;
    category?: string | null;
    dailySalary: number;
  };
  lines: number;
  validatedLines: number;
  totalDays: number;
  brut: number;
  bonuses: number;
  advances: number;
  remaining: number;
  firstDate: string;
  lastDate: string;
};

type SummaryRow = SummaryItem & { id: string };

type SummaryTotals = { workers: number; totalDays: number; brut: number; bonuses: number; advances: number; remaining: number };

type Line = {
  id: string;
  date: string;
  dayValue: number;
  totalDay: number;
  dayRate?: number | null;
  advance: number;
  bonus: number;
  validated: boolean;
  tranche?: string | null;
  chantier?: { id: string; name: string } | null;
  workforce: { dailySalary: number };
};

type RowEdit = { days: string; dayRate: string; advance: string; bonus: string };

const DAY_STEP = 0.125;

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

export default function PointageWorkerSummary({
  chantiers,
  chantierId,
  onChantierChange,
  tranche,
  onTrancheChange,
  hideSiteSelect = false,
  category,
  excludeCategory,
}: {
  chantiers: { id: string; name: string }[];
  chantierId: string;
  onChantierChange: (id: string) => void;
  tranche: string;
  onTrancheChange: (name: string) => void;
  hideSiteSelect?: boolean;
  category?: string;
  excludeCategory?: string;
}) {
  const { t } = useI18n();
  const [tranches, setTranches] = useState<{ id: string; name: string }[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [validated, setValidated] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [totals, setTotals] = useState<SummaryTotals | null>(null);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState<SummaryItem | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowEdit>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteLine, setDeleteLine] = useState<Line | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const selection = useRowSelection<SummaryRow>();
  const lineSelection = useRowSelection<Line>();

  useEffect(() => {
    if (!chantierId) {
      setTranches([]);
      return;
    }
    api<{ id: string; name: string }[]>(`/chantiers/${chantierId}/tranches`)
      .then(setTranches)
      .catch(() => setTranches([]));
  }, [chantierId]);

  function scopeQuery() {
    const qs = new URLSearchParams();
    if (chantierId) qs.set('chantierId', chantierId);
    if (chantierId && tranche) qs.set('tranche', tranche);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    if (category) qs.set('category', category);
    if (excludeCategory) qs.set('excludeCategory', excludeCategory);
    return qs;
  }

  function load() {
    setLoading(true);
    const qs = scopeQuery();
    if (validated) qs.set('validated', validated);
    api<{ items: SummaryItem[]; totals: SummaryTotals }>(`/chantiers/pointage/by-worker?${qs}`)
      .then((r) => {
        setItems(r.items);
        setTotals(r.totals);
      })
      .catch(async (err) => {
        setItems([]);
        setTotals(null);
        await appAlert(err instanceof Error ? err.message : t('common.error'));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [chantierId, tranche, dateFrom, dateTo, validated, category, excludeCategory]);

  async function loadLines(workforceId: string) {
    setLinesLoading(true);
    try {
      const all: Line[] = [];
      for (let page = 1; page <= 20; page++) {
        const qs = scopeQuery();
        qs.set('workforceId', workforceId);
        qs.set('sort', 'date');
        qs.set('order', 'asc');
        qs.set('limit', '100');
        qs.set('page', String(page));
        const res = await api<PaginatedResponse<Line>>(`/chantiers/pointage?${qs}`);
        all.push(...res.items);
        if (page >= res.pages) break;
      }
      setLines(all);
      setDrafts({});
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLinesLoading(false);
    }
  }

  function openWorker(item: SummaryItem) {
    setSelected(item);
    setLines([]);
    lineSelection.clear();
    void loadLines(item.workforceId);
  }

  async function closeWorker() {
    if (Object.keys(drafts).length && !(await appConfirm(t('pointageMgmt.unsavedConfirm')))) return;
    setSelected(null);
    setDrafts({});
    lineSelection.clear();
  }

  function lineDefaults(l: Line): RowEdit {
    return {
      days: fmtDays(l.dayValue ?? l.totalDay ?? 0),
      dayRate: String(l.dayRate ?? l.workforce.dailySalary ?? ''),
      advance: String(l.advance ?? 0),
      bonus: String(l.bonus ?? 0),
    };
  }

  function rowFor(l: Line) {
    return drafts[l.id] || lineDefaults(l);
  }

  function patch(l: Line, p: Partial<RowEdit>) {
    setDrafts((prev) => ({ ...prev, [l.id]: { ...rowFor(l), ...p } }));
  }

  async function saveLine(l: Line, validatedValue?: boolean) {
    const e = rowFor(l);
    await api(`/chantiers/pointage/${l.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        dayValue: num(e.days),
        dayRate: rateOrNull(e.dayRate),
        advance: num(e.advance),
        bonus: num(e.bonus),
        ...(validatedValue != null ? { validated: validatedValue } : {}),
      }),
    });
  }

  async function onSaveLine(l: Line, validatedValue?: boolean) {
    if (!selected) return;
    setBusy(l.id);
    try {
      await saveLine(l, validatedValue);
      await loadLines(selected.workforceId);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  async function unlockLine(l: Line) {
    if (!selected) return;
    setBusy(l.id);
    try {
      await api(`/chantiers/pointage/${l.id}`, { method: 'PUT', body: JSON.stringify({ validated: false }) });
      await loadLines(selected.workforceId);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(null);
    }
  }

  async function saveAllForWorker(validate: boolean) {
    if (!selected) return;
    const targets = lines.filter((l) => !l.validated && (validate || drafts[l.id]));
    if (!targets.length) return;
    setBusy('all');
    const failures: string[] = [];
    for (const l of targets) {
      try {
        await saveLine(l, validate ? true : undefined);
      } catch (err) {
        failures.push(`${formatDate(l.date)} : ${err instanceof Error ? err.message : t('common.error')}`);
      }
    }
    await loadLines(selected.workforceId);
    load();
    setBusy(null);
    if (failures.length) await appAlert(failures.join('\n'));
  }

  async function confirmDeleteLine() {
    if (!deleteLine || !deleteMotif.trim() || !selected) return;
    try {
      await api(`/chantiers/pointage/${deleteLine.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ motif: deleteMotif.trim() }),
      });
      if (lineSelection.isSelected(deleteLine.id)) lineSelection.toggle(deleteLine);
      setDeleteLine(null);
      setDeleteMotif('');
      await loadLines(selected.workforceId);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const visible = useMemo<SummaryRow[]>(() => {
    const s = q.trim().toLowerCase();
    const withId = items.map((i) => ({ ...i, id: i.workforceId }));
    if (!s) return withId;
    return withId.filter((i) =>
      `${i.workforce.firstName} ${i.workforce.lastName} ${i.workforce.reference || ''} ${i.workforce.category || ''}`
        .toLowerCase()
        .includes(s),
    );
  }, [items, q]);

  const lineTotals = useMemo(() => {
    let days = 0;
    let brut = 0;
    let advances = 0;
    let bonuses = 0;
    for (const l of lines) {
      const e = rowFor(l);
      const d = num(e.days);
      days += d;
      brut += d * (rateOrNull(e.dayRate) ?? l.workforce.dailySalary ?? 0);
      advances += num(e.advance);
      bonuses += num(e.bonus);
    }
    return { days, brut, advances, bonuses, remaining: brut + bonuses - advances };
  }, [lines, drafts]);

  const scopeLabel = [
    chantiers.find((c) => c.id === chantierId)?.name || t('msg.allSitesShort'),
    chantierId ? tranche || t('msg.allTranches') : null,
  ].filter(Boolean).join(' · ');

  function scopeFilters(): PrintFilter[] {
    return [
      [t('columns.chantier'), chantiers.find((c) => c.id === chantierId)?.name || t('msg.allSitesShort')],
      [t('fields.tranche'), chantierId ? tranche || t('msg.allTranches') : ''],
      [t('listPrint.period'), dateFrom || dateTo ? `${dateFrom ? formatDate(dateFrom) : '…'} → ${dateTo ? formatDate(dateTo) : '…'}` : ''],
    ];
  }

  function workerLabel(w: SummaryItem['workforce']) {
    return `${w.reference ? `${w.reference} — ` : ''}${w.firstName} ${w.lastName}`;
  }

  function printList() {
    const sum = (list: SummaryRow[], fn: (i: SummaryRow) => number) => list.reduce((s, i) => s + fn(i), 0);
    printRows<SummaryRow>({
      title: `${t('pages.attendance')} — ${t('pointageMgmt.byWorkerTab')}`,
      subtitle: scopeLabel,
      filters: [
        [t('listPrint.search'), q.trim()],
        ...scopeFilters(),
        [t('msg.validation'), validated === 'true' ? t('msg.validatedPlural') : validated === 'false' ? t('status.pending') : ''],
      ],
      columns: [
        { label: t('columns.worker'), value: (i) => `${workerLabel(i.workforce)}${i.workforce.category ? ` (${i.workforce.category})` : ''}` },
        {
          label: t('pointageMgmt.pointagesCount'),
          value: (i) => `${i.lines}${i.validatedLines < i.lines ? ` (${t('msg.pendingCount', { count: i.lines - i.validatedLines })})` : ''}`,
          align: 'right',
          total: (list) => String(sum(list, (i) => i.lines)),
        },
        { label: t('pointageMgmt.totalDaysWorked'), value: (i) => fmtDays(i.totalDays), align: 'right', total: (list) => fmtDays(sum(list, (i) => i.totalDays)) },
        { label: t('columns.brut'), value: (i) => formatMad(i.brut), align: 'right', total: (list) => formatMad(sum(list, (i) => i.brut)) },
        { label: t('columns.bonus'), value: (i) => formatMad(i.bonuses), align: 'right', total: (list) => formatMad(sum(list, (i) => i.bonuses)) },
        { label: t('pointageMgmt.totalAdvances'), value: (i) => formatMad(i.advances), align: 'right', total: (list) => formatMad(sum(list, (i) => i.advances)) },
        { label: t('pointageMgmt.remainingToPay'), value: (i) => formatMad(i.remaining), align: 'right', total: (list) => formatMad(sum(list, (i) => i.remaining)) },
        { label: t('pointageMgmt.period'), value: (i) => `${formatDate(i.firstDate)} → ${formatDate(i.lastDate)}` },
      ],
      rows: selection.count ? selection.rows : visible,
      selectedCount: selection.count,
    });
  }

  function printLines() {
    if (!selected) return;
    const days = (l: Line) => num(rowFor(l).days);
    const rate = (l: Line) => rateOrNull(rowFor(l).dayRate) ?? l.workforce.dailySalary ?? 0;
    const advance = (l: Line) => num(rowFor(l).advance);
    const bonus = (l: Line) => num(rowFor(l).bonus);
    const sum = (list: Line[], fn: (l: Line) => number) => list.reduce((s, l) => s + fn(l), 0);
    const picked = lines.filter((l) => lineSelection.isSelected(l.id));
    printRows<Line>({
      title: `${t('pages.attendance')} — ${workerLabel(selected.workforce)}`,
      subtitle: scopeLabel,
      filters: [[t('columns.worker'), workerLabel(selected.workforce)], ...scopeFilters()],
      columns: [
        { label: t('columns.date'), value: (l) => formatDate(l.date) },
        ...(!chantierId ? [{ label: t('columns.chantier'), value: (l: Line) => l.chantier?.name }] : []),
        ...(!tranche ? [{ label: t('columns.tranche'), value: (l: Line) => l.tranche }] : []),
        { label: t('columns.days'), value: (l) => fmtDays(days(l)), align: 'right', total: (list) => fmtDays(sum(list, days)) },
        { label: t('columns.dailyRate'), value: (l) => formatMad(rate(l)), align: 'right' },
        { label: t('columns.advance'), value: (l) => formatMad(advance(l)), align: 'right', total: (list) => formatMad(sum(list, advance)) },
        { label: t('columns.bonus'), value: (l) => formatMad(bonus(l)), align: 'right', total: (list) => formatMad(sum(list, bonus)) },
        { label: t('columns.status'), value: (l) => (l.validated ? t('pointageMgmt.validated') : t('pointageMgmt.draft')) },
      ],
      rows: picked.length ? picked : lines,
      selectedCount: picked.length,
      extraHtml: (list) => {
        const brut = sum(list, (l) => days(l) * rate(l));
        const remaining = brut + sum(list, bonus) - sum(list, advance);
        return `<p><span class="k">${escHtml(t('columns.brut'))} :</span> ${escHtml(formatMad(brut))} · <span class="k">${escHtml(t('pointageMgmt.remainingToPay'))} :</span> ${escHtml(formatMad(remaining))}</p>`;
      },
    });
  }

  return (
    <div className="space-y-3">
      <div className="mac-filters-panel">
        <div className="mac-filters-row mac-filters-row-between">
          <div className="mac-filters-toolbar">
            <MacSearch value={q} onChange={setQ} placeholder={t('msg.searchWorker')} />
            {!hideSiteSelect && (
              <MacSelect
                value={chantierId}
                onChange={onChantierChange}
                options={[
                  { value: '', label: t('msg.allSitesShort') },
                  ...chantiers.map((c) => ({ value: c.id, label: c.name })),
                ]}
                className="w-48 shrink-0"
              />
            )}
            {chantierId && (
              <MacSelect
                value={tranche}
                onChange={onTrancheChange}
                options={[
                  { value: '', label: t('msg.allTranches') },
                  ...tranches.map((tr) => ({ value: tr.name, label: tr.name })),
                ]}
                className="w-44 shrink-0"
              />
            )}
            <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0" />
            <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0" />
            <MacDateInput
              value={dateFrom && dateFrom === dateTo ? dateFrom : ''}
              onChange={(value) => { setDateFrom(value); setDateTo(value); }}
              placeholder={t('pointageMgmt.preciseDate')}
              className="w-36 shrink-0"
            />
            <MacSelect
              value={validated}
              onChange={setValidated}
              options={[
                { value: '', label: t('common.all') },
                { value: 'true', label: t('msg.validatedPlural') },
                { value: 'false', label: t('status.pending') },
              ]}
              className="w-36 shrink-0"
            />
          </div>
          <div className="mac-filters-actions">
            <Btn variant="secondary" icon={Printer} onClick={printList} disabled={loading}>
              {t('common.print')}
            </Btn>
          </div>
        </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('pointageMgmt.workers')} value={totals?.workers ?? 0} icon={Users} tone="violet" compact />
        <KpiCard title={t('pointageMgmt.totalDaysWorked')} value={fmtDays(totals?.totalDays ?? 0)} icon={Clock} tone="amber" compact />
        <KpiCard
          title={t('pointageMgmt.totalAdvances')}
          value={formatMad(totals?.advances ?? 0)}
          icon={Wallet}
          tone="emerald"
          compact
          delta={`${t('columns.brut')} ${formatMad(totals?.brut ?? 0)}`}
          deltaTone="muted"
        />
        <KpiCard title={t('pointageMgmt.remainingToPay')} value={formatMad(totals?.remaining ?? 0)} icon={Wallet} tone="coral" compact />
      </div>

      <SelectionBar selection={selection} onPrint={printList} />

      <Card padding={false}>
        {loading ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : visible.length === 0 ? (
          <EmptyState title={t('pointageMgmt.emptySummary')} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <SelectAllTh selection={selection} rows={visible} />
                <Th mac>{t('columns.worker')}</Th>
                <Th mac>{t('pointageMgmt.pointagesCount')}</Th>
                <Th mac>{t('pointageMgmt.totalDaysWorked')}</Th>
                <Th mac>{t('columns.brut')}</Th>
                <Th mac>{t('columns.bonus')}</Th>
                <Th mac>{t('pointageMgmt.totalAdvances')}</Th>
                <Th mac>{t('pointageMgmt.remainingToPay')}</Th>
                <Th mac>{t('pointageMgmt.period')}</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => (
                <tr key={i.workforceId} className="cursor-pointer hover:bg-black/[0.02]" onClick={() => openWorker(i)}>
                  <SelectTd selection={selection} row={i} />
                  <Td mac>
                    <span className="mac-table-ref">
                      {i.workforce.reference ? `${i.workforce.reference} — ` : ''}{i.workforce.firstName} {i.workforce.lastName}
                    </span>
                    {i.workforce.category && <span className="block text-[10px] text-gic-muted">{i.workforce.category}</span>}
                  </Td>
                  <Td mac className="mac-table-muted">
                    {i.lines}
                    {i.validatedLines < i.lines && (
                      <span className="ml-1 text-[10px] text-[#b25e00]">
                        ({t('msg.pendingCount', { count: i.lines - i.validatedLines })})
                      </span>
                    )}
                  </Td>
                  <Td mac className="font-medium">{fmtDays(i.totalDays)}</Td>
                  <Td mac className="mac-table-muted">{formatMad(i.brut)}</Td>
                  <Td mac className="mac-table-muted">{formatMad(i.bonuses)}</Td>
                  <Td mac className="text-gic-coral">{formatMad(i.advances)}</Td>
                  <Td mac className="font-medium">{formatMad(i.remaining)}</Td>
                  <Td mac className="mac-table-muted text-[11px]">
                    {formatDate(i.firstDate)} → {formatDate(i.lastDate)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={!!selected}
        size="lg"
        title={selected ? `${selected.workforce.firstName} ${selected.workforce.lastName} — ${scopeLabel}` : ''}
        onClose={closeWorker}
        footer={
          <>
            {selected && (
              <Link
                to={workforceDetailPathForCategory(selected.workforce.category, selected.workforce.id)}
                className="mr-auto text-[12px] text-[#007aff] hover:underline"
              >
                {t('pointageMgmt.openWorkerFile')}
              </Link>
            )}
            <Btn variant="secondary" icon={Printer} onClick={printLines} disabled={lines.length === 0}>
              {t('common.print')}
            </Btn>
            <Btn variant="secondary" onClick={closeWorker}>{t('common.close')}</Btn>
            <Btn
              variant="secondary"
              icon={Save}
              onClick={() => saveAllForWorker(false)}
              disabled={!!busy || Object.keys(drafts).length === 0}
            >
              {t('actions.saveAll')}
            </Btn>
            <Btn
              icon={CheckCircle}
              onClick={() => saveAllForWorker(true)}
              disabled={!!busy || !lines.some((l) => !l.validated)}
            >
              {t('pointageMgmt.validateAllForWorker')}
            </Btn>
          </>
        }
      >
        {linesLoading && !lines.length ? (
          <p className="py-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : lines.length === 0 ? (
          <EmptyState title={t('msg.emptyAttendance')} />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
              <div className="rounded-lg bg-black/[0.03] px-3 py-2">
                <p className="text-[10px] text-gic-muted uppercase">{t('pointageMgmt.totalDaysWorked')}</p>
                <p className="font-semibold">{fmtDays(lineTotals.days)}</p>
              </div>
              <div className="rounded-lg bg-black/[0.03] px-3 py-2">
                <p className="text-[10px] text-gic-muted uppercase">{t('columns.brut')}</p>
                <p className="font-semibold">{formatMad(lineTotals.brut)}</p>
              </div>
              <div className="rounded-lg bg-black/[0.03] px-3 py-2">
                <p className="text-[10px] text-gic-muted uppercase">{t('pointageMgmt.totalAdvances')}</p>
                <p className="font-semibold text-gic-coral">{formatMad(lineTotals.advances)}</p>
              </div>
              <div className="rounded-lg bg-black/[0.03] px-3 py-2">
                <p className="text-[10px] text-gic-muted uppercase">{t('pointageMgmt.remainingToPay')}</p>
                <p className="font-semibold">{formatMad(lineTotals.remaining)}</p>
              </div>
            </div>
            <SelectionBar selection={lineSelection} onPrint={printLines} />
            <div className="overflow-x-auto">
              <TableWrap mac>
                <thead>
                  <tr>
                    <SelectAllTh selection={lineSelection} rows={lines} />
                    <Th mac>{t('columns.date')}</Th>
                    {!chantierId && <Th mac>{t('columns.chantier')}</Th>}
                    {!tranche && <Th mac>{t('columns.tranche')}</Th>}
                    <Th mac>{t('columns.days')}</Th>
                    <Th mac>{t('columns.dailyRate')}</Th>
                    <Th mac>{t('columns.advance')}</Th>
                    <Th mac>{t('columns.bonus')}</Th>
                    <Th mac>{t('columns.status')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const e = rowFor(l);
                    const locked = l.validated;
                    const dirty = !!drafts[l.id];
                    return (
                      <tr key={l.id} className={locked ? 'bg-gic-emerald-soft/20' : dirty ? 'bg-[#007aff]/[0.03]' : ''}>
                        <SelectTd selection={lineSelection} row={l} />
                        <Td mac className="mac-table-muted whitespace-nowrap">{formatDate(l.date)}</Td>
                        {!chantierId && <Td mac className="mac-table-muted">{l.chantier?.name || '—'}</Td>}
                        {!tranche && <Td mac className="mac-table-muted">{l.tranche || '—'}</Td>}
                        <Td mac>
                          <input
                            className={cellClass(locked)}
                            type="number"
                            min={0}
                            step={DAY_STEP}
                            readOnly={locked}
                            value={e.days}
                            onChange={(ev) => patch(l, { days: ev.target.value })}
                          />
                        </Td>
                        <Td mac>
                          <input
                            className={cellClass(locked, 'w-20')}
                            type="number"
                            min="0"
                            step="0.01"
                            readOnly={locked}
                            value={e.dayRate}
                            onChange={(ev) => patch(l, { dayRate: ev.target.value })}
                          />
                        </Td>
                        <Td mac>
                          <input
                            className={cellClass(locked)}
                            readOnly={locked}
                            value={e.advance}
                            onChange={(ev) => patch(l, { advance: ev.target.value })}
                          />
                        </Td>
                        <Td mac>
                          <input
                            className={cellClass(locked)}
                            readOnly={locked}
                            value={e.bonus}
                            onChange={(ev) => patch(l, { bonus: ev.target.value })}
                          />
                        </Td>
                        <Td mac>
                          <StatusPill status={locked ? 'validé' : 'brouillon'} quiet />
                        </Td>
                        <Td mac className="mac-td-actions">
                          <div className="mac-actions">
                            {!locked && (
                              <MacActionBtn
                                icon={Save}
                                tone="blue"
                                title={t('common.save')}
                                disabled={!!busy || !dirty}
                                onClick={() => onSaveLine(l)}
                              />
                            )}
                            {!locked ? (
                              <MacActionBtn
                                icon={CheckCircle}
                                tone="green"
                                title={t('actions.validate')}
                                disabled={!!busy}
                                onClick={() => onSaveLine(l, true)}
                              />
                            ) : (
                              <MacActionBtn
                                icon={Lock}
                                tone="orange"
                                title={t('actions.editInList')}
                                disabled={!!busy}
                                onClick={() => unlockLine(l)}
                              />
                            )}
                            <MacActionBtn
                              icon={Trash2}
                              tone="red"
                              title={t('common.delete')}
                              disabled={!!busy}
                              onClick={() => { setDeleteLine(l); setDeleteMotif(''); }}
                            />
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleteLine}
        title={t('msg.deleteAttendance')}
        onClose={() => setDeleteLine(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteLine(null)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDeleteLine} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
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
