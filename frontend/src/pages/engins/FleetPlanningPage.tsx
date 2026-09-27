import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Printer } from 'lucide-react';
import { api, formatDate } from '../../lib/api';
import { chantierTrancheLabel, fleetStatusLabel, isoDate, kindLabel, ownershipLabel, queryString, todayISO } from '../../lib/engins';
import { printRows } from '../../lib/listPrint';
import { useI18n } from '../../i18n/I18nContext';
import { Btn, Card, EmptyState, MacSelect, PageHeader } from '../../components/ui';
import { AssignmentModal } from '../../components/engins/Assignments';
import { FleetStatusPill, useFleetRefs } from '../../components/engins/FleetCommon';

type PlanningRow = {
  id: string;
  code: string | null;
  label: string;
  kind: string;
  status: string;
  ownershipType: string;
  assignments: { id: string; chantierId: string | null; chantierName: string | null; tranche: string | null; startDate: string; endDate: string | null; status: string; mode: string }[];
  downtimes: { id: string; startDate: string; endDate: string; kind: string; label: string }[];
};

type Planning = { from: string; to: string; today: string; rows: PlanningRow[] };

const DAY = 86_400_000;
const CELL = 22;

function addDays(iso: string, n: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

function dayIndex(from: string, iso: string) {
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

const BAR_TONES: Record<string, string> = {
  planifie: 'bg-[#007aff]/25 border-[#007aff]/50 text-[#004a99]',
  en_cours: 'bg-amber-200/80 border-amber-400 text-amber-900',
  a_retourner: 'bg-red-200/80 border-red-400 text-red-900',
  termine: 'bg-emerald-200/70 border-emerald-400 text-emerald-900',
};

export default function FleetPlanningPage() {
  const { t } = useI18n();
  const { chantiers } = useFleetRefs();
  const [start, setStart] = useState(() => `${todayISO().slice(0, 8)}01`);
  const [span, setSpan] = useState(60);
  const [kind, setKind] = useState('');
  const [chantierId, setChantierId] = useState('');
  const [data, setData] = useState<Planning | null>(null);
  const [modal, setModal] = useState<{ open: boolean; enginId?: string; startDate?: string }>({ open: false });
  const end = addDays(start, span - 1);

  function load() {
    api<Planning>(`/engins/planning?${queryString({ dateFrom: start, dateTo: end, kind, chantierId })}`)
      .then(setData)
      .catch(() => setData({ from: start, to: end, today: todayISO(), rows: [] }));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [start, span, kind, chantierId]);

  const days = useMemo(() => Array.from({ length: span }, (_, i) => addDays(start, i)), [start, span]);
  const todayIdx = dayIndex(start, todayISO());

  function barStyle(s: string, e: string | null) {
    const a = Math.max(0, dayIndex(start, s));
    const b = Math.min(span - 1, e ? dayIndex(start, e) : span - 1);
    if (b < 0 || a > span - 1) return null;
    return { left: a * CELL, width: Math.max(1, b - a + 1) * CELL - 2 };
  }

  function printPlanning() {
    if (!data) return;
    type PrintRow = { engin: PlanningRow; nature: string; start: string | null; end: string | null; site: string; status: string; details: string };
    const rows = data.rows.flatMap((r): PrintRow[] => {
      const periods: PrintRow[] = [
        ...r.assignments.map((a) => ({
          engin: r, nature: t('fleet.allocationShort.affectation'), start: a.startDate, end: a.endDate,
          site: chantierTrancheLabel(a.chantierName, a.tranche), status: fleetStatusLabel(a.status, t), details: t(`fleet.mode.${a.mode}`),
        })),
        ...r.downtimes.map((d) => ({
          engin: r, nature: `${t('fleet.hints.downtime')} — ${t(`fleet.maintKind.${d.kind || 'entretien'}`)}`, start: d.startDate, end: d.endDate,
          site: '', status: '', details: d.label,
        })),
      ].sort((a, b) => isoDate(a.start).localeCompare(isoDate(b.start)));
      return periods.length ? periods : [{ engin: r, nature: '', start: null, end: null, site: '', status: '', details: '' }];
    });
    printRows<PrintRow>({
      title: t('fleet.nav.planning'),
      landscape: true,
      filters: [
        [t('listPrint.period'), `${formatDate(start)} → ${formatDate(end)}`],
        [t('fleet.fields.kind'), kind && t(`fleet.kindPlural.${kind}`)],
        [t('fleet.fields.chantier'), chantierId && chantiers.find((c) => c.id === chantierId)?.name],
      ],
      columns: [
        { label: t('fleet.fields.engin'), value: (r) => r.engin.label },
        { label: t('fleet.fields.kind'), value: (r) => `${kindLabel(r.engin.kind, t)} · ${ownershipLabel(r.engin.ownershipType, t)}` },
        { label: t('fleet.fields.status'), value: (r) => fleetStatusLabel(r.engin.status, t) },
        { label: t('fleet.fields.maintKind'), value: (r) => r.nature },
        { label: t('fleet.fields.period'), value: (r) => (r.start ? `${formatDate(r.start)} → ${r.end ? formatDate(r.end) : '…'}` : '') },
        { label: t('fleet.fields.chantierTranche'), value: (r) => r.site },
        { label: t('listPrint.status'), value: (r) => r.status },
        { label: t('fleet.fields.details'), value: (r) => r.details },
      ],
      rows,
    });
  }

  return (
    <div className="space-y-3">
      <PageHeader
        mac
        title={t('fleet.nav.planning')}
        subtitle={t('fleet.pages.planningSubtitle')}
        backTo={false}
        actions={
          <>
            <Btn variant="secondary" icon={Printer} onClick={printPlanning} disabled={!data}>{t('common.print')}</Btn>
            <Btn icon={Plus} onClick={() => setModal({ open: true })}>{t('fleet.actions.newAssignment')}</Btn>
          </>
        }
      />
      <Card padding={false} className="overflow-visible">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-black/[0.05]">
          <Btn variant="secondary" icon={ChevronLeft} className="!px-2" onClick={() => setStart(addDays(start, -Math.round(span / 2)))} />
          <input type="date" className="rounded-md border border-black/[0.1] bg-black/[0.02] px-2 py-1 text-[12px]" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          <Btn variant="secondary" icon={ChevronRight} className="!px-2" onClick={() => setStart(addDays(start, Math.round(span / 2)))} />
          <Btn variant="ghost" onClick={() => setStart(addDays(todayISO(), -7))}>{t('fleet.actions.today')}</Btn>
          <MacSelect
            value={String(span)}
            onChange={(v) => setSpan(Number(v))}
            className="w-32 shrink-0"
            options={[30, 60, 90, 180].map((n) => ({ value: String(n), label: t('fleet.hints.spanDays', { days: n }) }))}
          />
          <MacSelect
            value={kind}
            onChange={setKind}
            className="w-36 shrink-0"
            options={[{ value: '', label: t('fleet.filters.allKinds') }, { value: 'engin', label: t('fleet.kindPlural.engin') }, { value: 'materiel', label: t('fleet.kindPlural.materiel') }]}
          />
          <MacSelect
            value={chantierId}
            onChange={setChantierId}
            className="w-44 shrink-0"
            options={[{ value: '', label: t('fleet.filters.allChantiers') }, ...chantiers.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2 text-[10px]">
            {(['planifie', 'en_cours', 'a_retourner', 'termine'] as const).map((s) => (
              <span key={s} className={`inline-flex items-center rounded border px-1.5 py-0.5 ${BAR_TONES[s]}`}>{t(`fleet.assignmentStatus.${s}`)}</span>
            ))}
            <span className="inline-flex items-center rounded border px-1.5 py-0.5 bg-[repeating-linear-gradient(45deg,#fecaca,#fecaca_4px,#fee2e2_4px,#fee2e2_8px)] border-red-300 text-red-900">{t('fleet.hints.downtime')}</span>
          </div>
        </div>

        {!data ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : data.rows.length === 0 ? (
          <EmptyState title={t('fleet.empty.planning')} />
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 260 + span * CELL }}>
              <div className="flex sticky top-0 bg-white z-10 border-b border-black/[0.06]">
                <div className="w-[260px] shrink-0 px-3 py-1.5 text-[10px] font-semibold uppercase text-gic-muted">{t('fleet.fields.engin')}</div>
                <div className="relative flex">
                  {days.map((d, i) => {
                    const date = new Date(`${d}T00:00:00Z`);
                    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
                    return (
                      <div
                        key={d}
                        style={{ width: CELL }}
                        className={`text-center text-[9px] leading-tight py-1 border-l border-black/[0.04] ${weekend ? 'bg-black/[0.03]' : ''} ${i === todayIdx ? 'bg-[#007aff]/15 font-bold' : ''}`}
                        title={d}
                      >
                        {date.getUTCDate() === 1 || i === 0 ? <span className="block text-[8px] text-gic-muted">{d.slice(5, 7)}</span> : <span className="block text-[8px] opacity-0">.</span>}
                        {date.getUTCDate()}
                      </div>
                    );
                  })}
                </div>
              </div>
              {data.rows.map((r) => (
                <div key={r.id} className="flex border-b border-black/[0.04] hover:bg-black/[0.015]">
                  <div className="w-[260px] shrink-0 px-3 py-1.5">
                    <Link to={`/engins/${r.id}`} className="mac-table-ref text-[12px] block truncate" title={r.label}>{r.label}</Link>
                    <span className="flex items-center gap-1.5 mt-0.5">
                      <FleetStatusPill status={r.status} />
                      <span className="text-[10px] text-gic-muted">{t(`fleet.kind.${r.kind === 'materiel' ? 'materiel' : 'engin'}`)} · {t(`fleet.ownership.${r.ownershipType === 'loue' ? 'loue' : 'personnel'}`)}</span>
                    </span>
                  </div>
                  <div
                    className="relative cursor-copy"
                    style={{ width: span * CELL, minHeight: 44 }}
                    onDoubleClick={(e) => {
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const idx = Math.floor((e.clientX - rect.left) / CELL);
                      setModal({ open: true, enginId: r.id, startDate: addDays(start, Math.max(0, idx)) });
                    }}
                    title={t('fleet.hints.doubleClickAssign')}
                  >
                    {todayIdx >= 0 && todayIdx < span && <div className="absolute top-0 bottom-0 w-px bg-[#007aff]/60" style={{ left: todayIdx * CELL + CELL / 2 }} />}
                    {r.downtimes.map((d) => {
                      const st = barStyle(isoDate(d.startDate), isoDate(d.endDate));
                      if (!st) return null;
                      return (
                        <div
                          key={d.id}
                          className="absolute bottom-1 h-3 rounded border border-red-300 bg-[repeating-linear-gradient(45deg,#fecaca,#fecaca_4px,#fee2e2_4px,#fee2e2_8px)]"
                          style={st}
                          title={`${t(`fleet.maintKind.${d.kind || 'entretien'}`)} — ${d.label}`}
                        />
                      );
                    })}
                    {r.assignments.map((a) => {
                      const st = barStyle(isoDate(a.startDate), a.endDate ? isoDate(a.endDate) : null);
                      if (!st) return null;
                      return (
                        <Link
                          key={a.id}
                          to={a.chantierId ? `/chantiers/${a.chantierId}?tab=engins` : '/engins/affectations'}
                          className={`absolute top-1.5 h-6 rounded border px-1.5 text-[10px] leading-6 truncate ${BAR_TONES[a.status] || BAR_TONES.planifie}`}
                          style={st}
                          title={`${a.chantierName || '—'}${a.tranche ? ` / ${a.tranche}` : ''} · ${isoDate(a.startDate)} → ${a.endDate ? isoDate(a.endDate) : '…'}`}
                        >
                          {a.chantierName || '—'}{a.tranche ? ` / ${a.tranche}` : ''}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
      <AssignmentModal
        open={modal.open}
        defaults={{ enginId: modal.enginId || '', startDate: modal.startDate || todayISO() }}
        onClose={() => setModal({ open: false })}
        onSaved={load}
      />
    </div>
  );
}
