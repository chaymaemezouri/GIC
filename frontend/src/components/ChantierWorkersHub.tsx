import { appAlert } from '../lib/dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Clock, PauseCircle, SlidersHorizontal, Users, Wallet } from 'lucide-react';
import { api, fetchWorkforceList, formatDate, formatMad } from '../lib/api';
import { CHAUFFEUR_CATEGORY, workforceDetailPathForCategory } from '../lib/workforceScope';
import { Btn, KpiCard, MacDateInput, MacSearch, Modal, Select, TableWrap, Tabs, Td, Th } from './ui';
import { ChantierWorkersPanel, suspensionState, type SiteAssignment } from './ChantierWorkersPanel';
import PointageSessionManager from './PointageSessionManager';
import PointageWorkerSummary from './PointageWorkerSummary';
import { ChantierPaymentPanel } from './ChantierPaymentPanel';
import { useI18n } from '../i18n/I18nContext';

type Section = 'affectation' | 'transfer' | 'pointage' | 'synthese' | 'syntheseWorker' | 'paiement';

type ChantierOption = { id: string; name: string };
type TrancheOption = { id: string; name: string };

type SessionSynthesis = {
  id: string;
  date: string;
  tranche: string;
  linesCount: number;
  totalDays: number;
  brut: number;
  advances: number;
  bonuses: number;
  validatedCount: number;
};

type SessionLineDetail = {
  id: string;
  totalDay: number;
  dayRate?: number | null;
  advance: number;
  bonus: number;
  workforce: { id: string; firstName: string; lastName: string; category?: string | null; dailySalary: number };
};

function isoDay(value: string) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lineBrut(line: SessionLineDetail) {
  const rate = line.dayRate != null && line.dayRate > 0 ? line.dayRate : line.workforce.dailySalary || 0;
  return line.totalDay * rate;
}

function sessionNet(row: { brut: number; bonuses: number; advances: number }) {
  return row.brut + row.bonuses - row.advances;
}

type PointageWorker = {
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

export function ChantierPointagePanel({ chantierId, scope = 'workers' }: { chantierId: string; scope?: 'workers' | 'drivers' }) {
  const [tranche, setTranche] = useState('');
  const [workforce, setWorkforce] = useState<PointageWorker[]>([]);

  useEffect(() => {
    const opts = scope === 'drivers' ? { category: CHAUFFEUR_CATEGORY } : { excludeCategory: CHAUFFEUR_CATEGORY };
    fetchWorkforceList<PointageWorker>(opts).then(setWorkforce).catch(() => setWorkforce([]));
  }, [chantierId, scope]);

  return (
    <PointageSessionManager
      hideSiteSelect
      chantiers={[]}
      chantierId={chantierId}
      onChantierChange={() => {}}
      tranche={tranche}
      onTrancheChange={setTranche}
      workforce={workforce}
      category={scope === 'drivers' ? CHAUFFEUR_CATEGORY : undefined}
      excludeCategory={scope === 'drivers' ? undefined : CHAUFFEUR_CATEGORY}
    />
  );
}

export function ChantierWorkersHub({
  chantierId,
  assignments,
  tranches,
  scope = 'workers',
  onChanged,
}: {
  chantierId: string;
  assignments: SiteAssignment[];
  tranches: string[];
  scope?: 'workers' | 'drivers';
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>('affectation');
  const [chantiers, setChantiers] = useState<ChantierOption[]>([]);
  const [destTranches, setDestTranches] = useState<string[]>([]);
  const [destId, setDestId] = useState('');
  const [destAssignments, setDestAssignments] = useState<SiteAssignment[]>([]);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [destFilter, setDestFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [selectedLeft, setSelectedLeft] = useState<string[]>([]);
  const [selectedRight, setSelectedRight] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [filterTranche, setFilterTranche] = useState('');
  const [workerTranche, setWorkerTranche] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sessions, setSessions] = useState<SessionSynthesis[]>([]);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [sessionLines, setSessionLines] = useState<SessionLineDetail[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);

  useEffect(() => {
    api<{ items: ChantierOption[] }>('/chantiers?limit=100&sort=name&order=asc')
      .then((r) => setChantiers(r.items || []))
      .catch(() => setChantiers([]));
  }, []);

  useEffect(() => {
    if (!destId || destId === chantierId) {
      setDestTranches([]);
      setDestAssignments([]);
      return;
    }
    api<TrancheOption[]>(`/chantiers/${destId}/tranches`)
      .then((rows) => setDestTranches(rows.map((tr) => tr.name)))
      .catch(() => setDestTranches([]));
    api<SiteAssignment[]>(`/chantiers/${destId}/assign`)
      .then((rows) => setDestAssignments(rows.filter((row) => (
        scope === 'drivers'
          ? row.workforce.category === CHAUFFEUR_CATEGORY
          : row.workforce.category !== CHAUFFEUR_CATEGORY
      ))))
      .catch(() => setDestAssignments([]));
  }, [destId, chantierId, tranches, assignments, scope]);

  useEffect(() => {
    if (section !== 'synthese') return;
    const qs = new URLSearchParams({ chantierId });
    if (filterTranche) qs.set('tranche', filterTranche);
    if (scope === 'drivers') qs.set('category', CHAUFFEUR_CATEGORY);
    else qs.set('excludeCategory', CHAUFFEUR_CATEGORY);
    api<SessionSynthesis[]>(`/chantiers/pointage/sessions?${qs}`)
      .then((rows) => {
        setSessions(rows);
        setOpenSessionId((current) => (current && rows.some((row) => row.id === current) ? current : null));
      })
      .catch(() => setSessions([]));
  }, [section, chantierId, filterTranche, scope]);

  useEffect(() => {
    if (!openSessionId) {
      setSessionLines([]);
      return;
    }
    setSessionLoading(true);
    api<SessionSynthesis & { lines: SessionLineDetail[] }>(`/chantiers/pointage/sessions/${openSessionId}`)
      .then((detail) => setSessionLines((detail.lines || []).filter((line) => (
        scope === 'drivers'
          ? line.workforce.category === CHAUFFEUR_CATEGORY
          : line.workforce.category !== CHAUFFEUR_CATEGORY
      ))))
      .catch(() => setSessionLines([]))
      .finally(() => setSessionLoading(false));
  }, [openSessionId, scope]);

  function placeOf(filter: string) {
    return filter === 'all' || filter === 'whole' ? '' : filter;
  }

  function visibleOf(rows: SiteAssignment[], filter: string, q: string) {
    const needle = q.trim().toLowerCase();
    return rows.filter((a) => {
      if (filter === 'whole' && a.tranche) return false;
      if (filter !== 'all' && filter !== 'whole' && a.tranche !== filter) return false;
      if (!needle) return true;
      return `${a.workforce.firstName} ${a.workforce.lastName} ${a.workforce.category || ''}`.toLowerCase().includes(needle);
    });
  }

  const visibleSessions = useMemo(() => {
    return sessions
      .filter((row) => {
        const day = isoDay(row.date);
        if (dateFrom && day < dateFrom) return false;
        if (dateTo && day > dateTo) return false;
        return true;
      })
      .slice()
      .reverse();
  }, [sessions, dateFrom, dateTo]);

  useEffect(() => {
    if (openSessionId && !visibleSessions.some((row) => row.id === openSessionId)) setOpenSessionId(null);
  }, [visibleSessions, openSessionId]);

  const openSession = sessions.find((row) => row.id === openSessionId) || null;

  const synthesisTotals = useMemo(() => ({
    pointages: visibleSessions.length,
    workers: visibleSessions.reduce((sum, row) => sum + row.linesCount, 0),
    days: visibleSessions.reduce((sum, row) => sum + row.totalDays, 0),
    net: visibleSessions.reduce((sum, row) => sum + sessionNet(row), 0),
  }), [visibleSessions]);

  const sourceWorkers = useMemo(() => visibleOf(assignments, sourceFilter, query), [assignments, sourceFilter, query]);
  const destWorkers = useMemo(() => visibleOf(destAssignments, destFilter, destQuery), [destAssignments, destFilter, destQuery]);
  const otherSites = chantiers.filter((c) => c.id !== chantierId);

  function toggle(list: string[], id: string, setList: (ids: string[]) => void) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function move(direction: 'out' | 'in') {
    if (!destId || saving) return;
    const rows = direction === 'out'
      ? assignments.filter((a) => selectedLeft.includes(a.id))
      : destAssignments.filter((a) => selectedRight.includes(a.id));
    if (!rows.length) return;
    const fromId = direction === 'out' ? chantierId : destId;
    const toId = direction === 'out' ? destId : chantierId;
    const tranche = placeOf(direction === 'out' ? destFilter : sourceFilter);
    setSaving(true);
    const failed: string[] = [];
    let ok = 0;
    for (const row of rows) {
      try {
        await api(`/chantiers/${fromId}/assign/${row.id}/transfer`, {
          method: 'POST',
          body: JSON.stringify({ chantierId: toId, tranche: tranche || null }),
        });
        ok += 1;
      } catch (err) {
        failed.push(`${row.workforce.firstName} ${row.workforce.lastName} — ${err instanceof Error ? err.message : t('common.error')}`);
      }
    }
    setSelectedLeft([]);
    setSelectedRight([]);
    onChanged();
    setSaving(false);
    if (failed.length) await appAlert(failed.join('\n'));
    else if (ok) await appAlert(t('siteOps.transferDone', { count: ok }));
  }

  const tabs = [
    { id: 'affectation', label: t('siteOps.affectation') },
    { id: 'transfer', label: t('siteOps.transfer') },
    { id: 'pointage', label: t('siteOps.attendance') },
    { id: 'synthese', label: t('siteOps.synthesisByDate') },
    { id: 'syntheseWorker', label: scope === 'drivers' ? t('siteOps.synthesisByDriver') : t('pointageMgmt.byWorkerTab') },
    { id: 'paiement', label: t('actions.payment') },
  ];

  return (
    <div className="mt-2 space-y-3">
      <Tabs mac active={section} onChange={(id) => setSection(id as Section)} tabs={tabs} />

      {section === 'affectation' && (
        <ChantierWorkersPanel chantierId={chantierId} assignments={assignments} tranches={tranches} scope={scope} onChanged={onChanged} />
      )}

      {section === 'transfer' && (
        <div className="space-y-3">
          <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <WorkerColumn
              tone="blue"
              title={t('siteOps.transferHere')}
              count={sourceWorkers.length}
              query={query}
              onQuery={setQuery}
              searchPlaceholder={t('common.searchEllipsis')}
              filter={sourceFilter}
              onFilter={setSourceFilter}
              tranches={tranches}
              allLabel={t('common.all')}
              wholeLabel={t('msg.wholeSite')}
              arrive={t('siteOps.transferArrive', { place: placeOf(sourceFilter) || t('msg.wholeSite') })}
              rows={sourceWorkers}
              selected={selectedLeft}
              onToggle={(id) => toggle(selectedLeft, id, setSelectedLeft)}
              empty={t('siteOps.transferNone')}
            />
            <div className="flex lg:flex-col items-center justify-center gap-2">
              <Btn
                icon={ArrowRight}
                title={t('siteOps.transferOut')}
                disabled={!destId || !selectedLeft.length || saving}
                onClick={() => move('out')}
              >
                {t('siteOps.transferOut')}
              </Btn>
              <Btn
                className="!bg-[#248a3d] hover:!bg-[#1f7a34]"
                icon={ArrowLeft}
                title={t('siteOps.transferIn')}
                disabled={!destId || !selectedRight.length || saving}
                onClick={() => move('in')}
              >
                {t('siteOps.transferIn')}
              </Btn>
            </div>
            <div className="mac-section-card !p-0 overflow-visible flex flex-col min-h-[380px] !border-[#248a3d]/25">
              <div className="px-3 py-3 bg-[#e9f8ee] border-b border-black/[0.06]">
                <p className="text-[13px] font-semibold text-gic-ink">{t('siteOps.transferThere')}</p>
                <div className="mt-2">
                  <Select value={destId} onChange={(e) => { setDestId(e.target.value); setDestFilter('all'); setSelectedRight([]); }}>
                    <option value="">{t('msg.chooseSite')}</option>
                    {otherSites.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
              </div>
              {destId ? (
                <WorkerColumn
                  embedded
                  tone="green"
                  title=""
                  count={destWorkers.length}
                  query={destQuery}
                  onQuery={setDestQuery}
                  searchPlaceholder={t('common.searchEllipsis')}
                  filter={destFilter}
                  onFilter={setDestFilter}
                  tranches={destTranches}
                  allLabel={t('common.all')}
                  wholeLabel={t('msg.wholeSite')}
                  arrive={t('siteOps.transferArrive', { place: placeOf(destFilter) || t('msg.wholeSite') })}
                  rows={destWorkers}
                  selected={selectedRight}
                  onToggle={(id) => toggle(selectedRight, id, setSelectedRight)}
                  empty={t('siteOps.transferNone')}
                />
              ) : (
                <p className="px-3 py-8 text-center text-[12px] text-gic-muted">{t('msg.chooseSite')}</p>
              )}
            </div>
          </div>
        </div>
      )}
      {section === 'pointage' && <ChantierPointagePanel chantierId={chantierId} scope={scope} />}

      {section === 'synthese' && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-56">
            <Select label={t('columns.tranche')} value={filterTranche} onChange={(e) => setFilterTranche(e.target.value)}>
              <option value="">{t('common.all')}</option>
              {tranches.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
          </div>
          <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0" />
          <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0" />
          <MacDateInput
            value={dateFrom && dateFrom === dateTo ? dateFrom : ''}
            onChange={(value) => { setDateFrom(value); setDateTo(value); }}
            placeholder={t('pointageMgmt.preciseDate')}
            className="w-36 shrink-0"
          />
        </div>
      )}

      {section === 'synthese' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <KpiCard title={t('siteOps.attendance')} value={synthesisTotals.pointages} icon={Clock} compact />
            <KpiCard title={t('tabs.workers')} value={synthesisTotals.workers} icon={Users} compact />
            <KpiCard title={t('columns.workDays')} value={synthesisTotals.days.toFixed(1)} icon={Clock} compact />
            <KpiCard title={t('pointageMgmt.netToPay')} value={formatMad(synthesisTotals.net)} icon={Wallet} compact />
          </div>
          {visibleSessions.length === 0 ? (
            <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyAttendanceOnSite')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.date')}</Th>
                  <Th mac>{t('columns.tranche')}</Th>
                  <Th mac>{t('tabs.workers')}</Th>
                  <Th mac>{t('columns.workDays')}</Th>
                  <Th mac>{t('columns.advance')}</Th>
                  <Th mac>{t('columns.bonus')}</Th>
                  <Th mac>{t('pointageMgmt.netToPay')}</Th>
                </tr>
              </thead>
              <tbody>
                {visibleSessions.map((row) => {
                  const net = sessionNet(row);
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer hover:bg-black/[0.02]"
                      onClick={() => setOpenSessionId(row.id)}
                    >
                      <Td mac>
                        <span className="mac-table-ref">{formatDate(row.date)}</span>
                      </Td>
                      <Td mac className="mac-table-muted">{row.tranche || t('msg.wholeSite')}</Td>
                      <Td mac>{row.linesCount}</Td>
                      <Td mac>{row.totalDays.toFixed(2)}</Td>
                      <Td mac>{formatMad(row.advances)}</Td>
                      <Td mac>{formatMad(row.bonuses)}</Td>
                      <Td mac className="font-medium">{formatMad(net)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
          <Modal
            open={!!openSessionId}
            size="xl"
            title={openSession ? `${formatDate(openSession.date)} · ${openSession.tranche || t('msg.wholeSite')}` : t('siteOps.attendance')}
            onClose={() => setOpenSessionId(null)}
            footer={<Btn variant="secondary" onClick={() => setOpenSessionId(null)}>{t('common.close')}</Btn>}
          >
            {sessionLoading ? (
              <p className="py-6 text-center text-[12px] text-gic-muted">{t('common.loading')}</p>
            ) : sessionLines.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-gic-muted">{t('pointageMgmt.emptyLines')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.worker')}</Th>
                    <Th mac>{t('columns.workDays')}</Th>
                    <Th mac>{t('columns.hours')}</Th>
                    <Th mac>{t('columns.dailyRateMad')}</Th>
                    <Th mac>{t('columns.brut')}</Th>
                    <Th mac>{t('columns.advance')}</Th>
                    <Th mac>{t('columns.bonus')}</Th>
                    <Th mac>{t('pointageMgmt.netToPay')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {sessionLines.map((line) => {
                    const brut = lineBrut(line);
                    const rate = line.dayRate != null && line.dayRate > 0 ? line.dayRate : line.workforce.dailySalary || 0;
                    return (
                      <tr key={line.id}>
                        <Td mac>
                          <Link to={workforceDetailPathForCategory(line.workforce.category, line.workforce.id)} className="mac-table-ref">
                            {line.workforce.firstName} {line.workforce.lastName}
                          </Link>
                        </Td>
                        <Td mac>{line.totalDay.toFixed(2)}</Td>
                        <Td mac className="mac-table-muted">{(line.totalDay * 8).toFixed(1)} h</Td>
                        <Td mac>{formatMad(rate)}</Td>
                        <Td mac>{formatMad(brut)}</Td>
                        <Td mac>{formatMad(line.advance)}</Td>
                        <Td mac>{formatMad(line.bonus)}</Td>
                        <Td mac className="font-medium">{formatMad(brut + line.bonus - line.advance)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </Modal>
        </div>
      )}

      {section === 'syntheseWorker' && (
        <PointageWorkerSummary
          hideSiteSelect
          chantiers={chantiers}
          chantierId={chantierId}
          onChantierChange={() => {}}
          tranche={workerTranche}
          onTrancheChange={setWorkerTranche}
          category={scope === 'drivers' ? CHAUFFEUR_CATEGORY : undefined}
          excludeCategory={scope === 'drivers' ? undefined : CHAUFFEUR_CATEGORY}
        />
      )}

      {section === 'paiement' && <ChantierPaymentPanel chantierId={chantierId} scope={scope} />}
    </div>
  );
}


function WorkerColumn({
  title, count, query, onQuery, searchPlaceholder, filter, onFilter, tranches, allLabel, wholeLabel, arrive, rows, selected, onToggle, empty, embedded, tone = 'blue',
}: {
  title: string;
  count: number;
  query: string;
  onQuery: (v: string) => void;
  searchPlaceholder: string;
  filter: string;
  onFilter: (v: string) => void;
  tranches: string[];
  allLabel: string;
  wholeLabel: string;
  arrive: string;
  rows: SiteAssignment[];
  selected: string[];
  onToggle: (id: string) => void;
  empty: string;
  embedded?: boolean;
  tone?: 'blue' | 'green';
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = filter === 'all' ? allLabel : filter === 'whole' ? wholeLabel : filter;
  const chip = tone === 'green' ? 'mac-chip-green' : 'mac-chip-blue';
  const head = tone === 'green' ? 'bg-[#e9f8ee]' : 'bg-[#e8f2ff]';
  const picked = tone === 'green' ? 'bg-[#e9f8ee]' : 'bg-[#e8f2ff]';
  const mark = tone === 'green' ? 'bg-[#248a3d] border-[#248a3d]' : 'bg-[#007aff] border-[#007aff]';

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const options = [
    { id: 'all', label: allLabel },
    { id: 'whole', label: wholeLabel },
    ...tranches.map((name) => ({ id: name, label: name })),
  ];

  const body = (
    <>
      <div className={`${head} ${embedded ? 'px-3 pb-3' : 'px-3 py-3'} border-b border-black/[0.06]`}>
        {!embedded && (
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[13px] font-semibold text-gic-ink">{title}</p>
            <span className={`mac-chip ${chip}`}>{count}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <MacSearch value={query} onChange={onQuery} placeholder={searchPlaceholder} />
          </div>
          <div ref={menuRef} className="relative shrink-0">
            <Btn
              variant="secondary"
              icon={SlidersHorizontal}
              title={t('common.filters')}
              aria-label={t('common.filters')}
              className={`!px-2 !py-2 relative${filter !== 'all' ? ' ring-1 ring-[#007aff]/40' : ''}`}
              onClick={() => setOpen((v) => !v)}
            >
              {filter !== 'all' && <span className="mac-filter-dot" aria-hidden />}
            </Btn>
            {open && (
              <div className="mac-filter-menu" role="menu">
                <p className="mac-filter-menu-section">{t('columns.tranche')}</p>
                {options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitem"
                    className={`mac-filter-menu-item${filter === option.id ? ' mac-filter-menu-item-active' : ''}`}
                    onClick={() => { onFilter(option.id); setOpen(false); }}
                  >
                    <span>{option.label}</span>
                    {filter === option.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className={`mac-chip ${chip} mt-2`}>{current} · {arrive}</p>
      </div>
      <ul className="flex-1 overflow-auto max-h-[420px] bg-white">
        {rows.length === 0 && <li className="px-3 py-8 text-center text-[12px] text-gic-muted">{empty}</li>}
        {rows.map((a) => {
          const on = selected.includes(a.id);
          return (
            <li key={a.id}>
              <button type="button" onClick={() => onToggle(a.id)} className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 border-b border-black/[0.04] ${on ? picked : 'hover:bg-black/[0.02]'}`}>
                <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${on ? `${mark} text-white` : 'border-[#d2d2d7] bg-white'}`}>
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[12px] font-medium text-gic-ink truncate">
                    <span className="truncate">{a.workforce.firstName} {a.workforce.lastName}</span>
                    {suspensionState(a) !== 'none' && <PauseCircle size={14} className="text-[#ff9500] shrink-0" aria-hidden />}
                  </span>
                  <span className={`mac-chip ${a.tranche ? chip : 'mac-chip-gray'} mt-0.5`}>{a.tranche || wholeLabel}</span>
                  {a.workforce.category && <span className="ml-1.5 text-[11px] text-gic-muted">{a.workforce.category}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
  if (embedded) return <div className="flex flex-col flex-1 min-h-0">{body}</div>;
  return <section className="mac-section-card !p-0 overflow-visible flex flex-col min-h-[380px] !border-[#007aff]/25">{body}</section>;
}
