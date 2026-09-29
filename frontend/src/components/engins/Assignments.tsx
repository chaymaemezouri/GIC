import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Download, Pencil, Plus, Printer, Trash2, Truck, Undo, Undo2, Wallet } from 'lucide-react';
import { api, formatDate, formatMad } from '../../lib/api';
import { appAlert } from '../../lib/dialog';
import { printRows, type PrintColumn } from '../../lib/listPrint';
import {
  ASSIGNMENT_STATUSES,
  COST_METHODS,
  RETURN_CONDITIONS,
  downloadRowsCsv,
  SITE_TOOL_STATUSES,
  enginLabel,
  fleetStatusLabel,
  errorMessage,
  formatMad2,
  inclusiveDays,
  isoDate,
  num,
  queryString,
  round2,
  todayISO,
  type Assignment,
  type EnginRef,
} from '../../lib/engins';
import { useRowSelection } from '../../hooks/useRowSelection';
import { useI18n } from '../../i18n/I18nContext';
import { SelectAllTh, SelectTd, SelectionBar } from '../RowSelection';
import { Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect, Modal, Select, TableWrap, Td, Textarea, Th } from '../ui';
import { ChantierTrancheFields, DeleteMotifModal, EnginSelect, FleetStatusPill, FormGrid, invalidateFleetRefs, useFleetRefs } from './FleetCommon';

type AssignmentForm = {
  enginId: string;
  chantierId: string;
  tranche: string;
  responsible: string;
  startDate: string;
  endDate: string;
  costMethod: string;
  dailyCost: string;
  hourlyCost: string;
  plannedHours: string;
  flatAmount: string;
  extraCost: string;
  remark: string;
  siteStatus: string;
};

type Suggestion = { mode: string; costMethod: string; dailyCost: number; hourlyCost: number | null; flatAmount: number | null; extraCost: number };

function emptyForm(defaults?: Partial<AssignmentForm>): AssignmentForm {
  return {
    enginId: '',
    chantierId: '',
    tranche: '',
    responsible: '',
    startDate: todayISO(),
    endDate: '',
    costMethod: 'journalier',
    dailyCost: '',
    hourlyCost: '',
    plannedHours: '',
    flatAmount: '',
    extraCost: '0',
    remark: '',
    siteStatus: 'en_exploitation',
    ...defaults,
  };
}

function formFromAssignment(a: Assignment): AssignmentForm {
  return {
    enginId: a.enginId,
    chantierId: a.chantierId || '',
    tranche: a.tranche || '',
    responsible: a.responsible || '',
    startDate: isoDate(a.startDate),
    endDate: isoDate(a.endDate),
    costMethod: a.costMethod,
    dailyCost: String(a.dailyCost ?? ''),
    hourlyCost: a.hourlyCost != null ? String(a.hourlyCost) : '',
    plannedHours: a.costMethod === 'horaire' && a.hourlyCost ? String(round2((a.plannedCost - a.extraCost) / a.hourlyCost)) : '',
    flatAmount: a.flatAmount != null ? String(a.flatAmount) : '',
    extraCost: String(a.extraCost ?? 0),
    remark: a.remark || '',
    siteStatus: a.engin?.status || 'en_exploitation',
  };
}

export function plannedPreview(f: AssignmentForm) {
  const extra = num(f.extraCost);
  if (f.costMethod === 'forfait') return round2(num(f.flatAmount) + extra);
  if (f.costMethod === 'horaire') return round2(num(f.hourlyCost) * num(f.plannedHours) + extra);
  return round2(num(f.dailyCost) * inclusiveDays(f.startDate, f.endDate) + extra);
}

export function AssignmentModal({
  open,
  onClose,
  onSaved,
  assignment,
  defaults,
  lock,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  assignment?: Assignment | null;
  defaults?: Partial<AssignmentForm>;
  lock?: { engin?: boolean; chantier?: boolean; tranche?: boolean };
}) {
  const { t } = useI18n();
  const { engins, chantiers } = useFleetRefs();
  const [form, setForm] = useState<AssignmentForm>(emptyForm(defaults));
  const [costTouched, setCostTouched] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [saving, setSaving] = useState(false);
  const isEdit = !!assignment;

  useEffect(() => {
    if (!open) return;
    setForm(assignment ? formFromAssignment(assignment) : emptyForm(defaults));
    setCostTouched(!!assignment);
    setSuggestion(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assignment]);

  useEffect(() => {
    if (!open || !form.enginId) return;
    let alive = true;
    api<Suggestion>(`/engins/suggest-cost?${queryString({ enginId: form.enginId, startDate: form.startDate })}`)
      .then((s) => {
        if (!alive) return;
        setSuggestion(s);
        if (!costTouched) {
          setForm((f) => ({
            ...f,
            costMethod: s.costMethod,
            dailyCost: String(s.dailyCost ?? ''),
            hourlyCost: s.hourlyCost != null ? String(s.hourlyCost) : '',
            flatAmount: s.flatAmount != null ? String(s.flatAmount) : '',
            extraCost: String(s.extraCost ?? 0),
          }));
        }
      })
      .catch(() => alive && setSuggestion(null));
    return () => {
      alive = false;
    };
  }, [open, form.enginId, form.startDate, costTouched]);

  const engin = engins.find((e) => e.id === form.enginId);
  const days = inclusiveDays(form.startDate, form.endDate);
  const planned = plannedPreview(form);

  function setCost(patch: Partial<AssignmentForm>) {
    setCostTouched(true);
    setForm((f) => ({ ...f, ...patch }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = {
      enginId: form.enginId,
      chantierId: form.chantierId || null,
      tranche: form.tranche || null,
      responsible: form.responsible || null,
      startDate: form.startDate,
      endDate: form.endDate || null,
      costMethod: form.costMethod,
      dailyCost: form.dailyCost === '' ? 0 : Number(form.dailyCost),
      hourlyCost: form.hourlyCost === '' ? null : Number(form.hourlyCost),
      plannedHours: form.plannedHours === '' ? null : Number(form.plannedHours),
      flatAmount: form.flatAmount === '' ? null : Number(form.flatAmount),
      extraCost: form.extraCost === '' ? 0 : Number(form.extraCost),
      remark: form.remark || null,
      ...(!isEdit ? { siteStatus: form.siteStatus || 'en_exploitation' } : {}),
    };
    try {
      if (isEdit) await api(`/engins/assignments/${assignment!.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/engins/assignments', { method: 'POST', body: JSON.stringify(body) });
      onSaved();
      onClose();
    } catch (err) {
      await appAlert(errorMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      size="lg"
      title={isEdit ? t('fleet.actions.editAssignment') : t('fleet.actions.newAssignment')}
      onClose={onClose}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn form="fleet-assignment-form" type="submit" disabled={saving}>{isEdit ? t('common.save') : t('fleet.actions.assign')}</Btn>
        </>
      }
    >
      <form id="fleet-assignment-form" onSubmit={submit}>
        <FormGrid>
          <div className="sm:col-span-2">
            <EnginSelect
              engins={engins}
              value={form.enginId}
              disabled={isEdit || lock?.engin}
              onChange={(enginId) => { setCostTouched(false); setForm((f) => ({ ...f, enginId })); }}
              filter={(x: EnginRef) => x.status !== 'hors_service' && x.status !== 'restitue'}
            />
          </div>
          <ChantierTrancheFields
            required
            chantierId={form.chantierId}
            tranche={form.tranche}
            chantiers={chantiers}
            lockChantier={lock?.chantier}
            lockTranche={lock?.tranche}
            onChange={(n) => setForm((f) => ({ ...f, ...n }))}
          />
          {!isEdit && (
            <div className="sm:col-span-2">
              <Select label={t('fields.status')} value={form.siteStatus} onChange={(e) => setForm({ ...form, siteStatus: e.target.value })}>
                {SITE_TOOL_STATUSES.map((s) => <option key={s} value={s}>{fleetStatusLabel(s, t)}</option>)}
              </Select>
              <p className="mt-1 text-[11px] text-gic-muted">{t('siteOps.exploitationHint')}</p>
            </div>
          )}
          <Input label={t('fleet.fields.responsible')} value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
          <div />
          <Input label={`${t('fleet.fields.startDate')} *`} type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <Input label={t('fleet.fields.endDatePlanned')} type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />

          <div className="sm:col-span-2 rounded-lg border border-black/[0.06] bg-black/[0.015] p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[11px] font-semibold text-gic-muted uppercase tracking-wide">{t('fleet.sections.costing')}</p>
              {engin && (
                <span className={`mac-chip ${engin.ownershipType === 'loue' ? 'mac-chip-orange' : 'mac-chip-blue'}`}>
                  {t(engin.ownershipType === 'loue' ? 'fleet.mode.location' : 'fleet.mode.propriete')}
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label={t('fleet.fields.costMethod')} value={form.costMethod} onChange={(e) => setCost({ costMethod: e.target.value })}>
                {COST_METHODS.map((m) => <option key={m} value={m}>{t(`fleet.costMethod.${m}`)}</option>)}
              </Select>
              {form.costMethod === 'journalier' && (
                <Input label={t('fleet.fields.dailyCost')} type="number" min="0" step="0.01" value={form.dailyCost} onChange={(e) => setCost({ dailyCost: e.target.value })} />
              )}
              {form.costMethod === 'horaire' && (
                <>
                  <Input label={t('fleet.fields.hourlyCost')} type="number" min="0" step="0.01" value={form.hourlyCost} onChange={(e) => setCost({ hourlyCost: e.target.value })} />
                  <Input label={t('fleet.fields.plannedHours')} type="number" min="0" step="0.5" value={form.plannedHours} onChange={(e) => setForm({ ...form, plannedHours: e.target.value })} />
                </>
              )}
              {form.costMethod === 'forfait' && (
                <Input label={t('fleet.fields.flatAmount')} type="number" min="0" step="0.01" value={form.flatAmount} onChange={(e) => setCost({ flatAmount: e.target.value })} />
              )}
              <Input label={t('fleet.fields.extraCost')} type="number" min="0" step="0.01" value={form.extraCost} onChange={(e) => setCost({ extraCost: e.target.value })} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
              {form.costMethod === 'journalier' && (
                <span className="text-gic-muted">
                  {form.endDate
                    ? t('fleet.calc.dailyFormula', { days, daily: formatMad2(num(form.dailyCost)), extra: formatMad2(num(form.extraCost)) })
                    : t('fleet.hints.openEnded')}
                </span>
              )}
              <span className="font-semibold">{t('fleet.fields.plannedCost')} : {formatMad2(planned)}</span>
              {suggestion && costTouched && !isEdit && (
                <button
                  type="button"
                  className="text-[11px] text-[#007aff] hover:underline"
                  onClick={() => { setCostTouched(false); }}
                >
                  {t('fleet.actions.resetSuggested')}
                </button>
              )}
            </div>
            {suggestion && (
              <p className="mt-1 text-[10px] text-gic-muted">
                {suggestion.mode === 'location'
                  ? t('fleet.hints.suggestRental', { daily: formatMad2(suggestion.dailyCost) })
                  : t('fleet.hints.suggestOwned', { daily: formatMad2(suggestion.dailyCost) })}
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Textarea label={t('fleet.fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </div>
        </FormGrid>
      </form>
    </Modal>
  );
}

export function ReturnModal({
  assignment,
  onClose,
  onSaved,
}: {
  assignment: Assignment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({ returnDate: todayISO(), condition: 'bon', counter: '', location: '', remark: '', releaseRental: false });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!assignment) return;
    const end = assignment.endDate && isoDate(assignment.endDate) < todayISO() ? isoDate(assignment.endDate) : todayISO();
    setForm({ returnDate: end < isoDate(assignment.startDate) ? isoDate(assignment.startDate) : end, condition: 'bon', counter: '', location: '', remark: '', releaseRental: false });
  }, [assignment]);
  if (!assignment) return null;
  const isRental = assignment.mode === 'location';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/engins/assignments/${assignment!.id}/return`, {
        method: 'POST',
        body: JSON.stringify({
          returnDate: form.returnDate,
          condition: form.condition,
          counter: form.counter === '' ? null : Number(form.counter),
          location: form.location || null,
          remark: form.remark || null,
          releaseRental: form.releaseRental,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      await appAlert(errorMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={t('fleet.actions.returnEquipment')}
      onClose={onClose}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn form="fleet-return-form" type="submit" disabled={saving}>{t('fleet.actions.confirmReturn')}</Btn>
        </>
      }
    >
      <form id="fleet-return-form" onSubmit={submit} className="grid gap-3">
        <p className="text-[12px] text-gic-muted">
          {assignment.enginLabel} — {assignment.chantier?.name || assignment.project?.name || '—'}
          {assignment.tranche ? ` / ${assignment.tranche}` : ''} · {t('fleet.hints.since', { date: formatDate(assignment.startDate) })}
        </p>
        <Input label={`${t('fleet.fields.returnDate')} *`} type="date" required min={isoDate(assignment.startDate)} value={form.returnDate} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} />
        <Select label={t('fleet.fields.condition')} value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
          {RETURN_CONDITIONS.map((c) => <option key={c} value={c}>{t(`fleet.returnCondition.${c}`)}</option>)}
        </Select>
        <Input label={t('fleet.fields.returnCounter')} type="number" min="0" value={form.counter} onChange={(e) => setForm({ ...form, counter: e.target.value })} />
        <Input label={t('fleet.fields.returnLocation')} placeholder={t('fleet.hints.depot')} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        {isRental && (
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={form.releaseRental} onChange={(e) => setForm({ ...form, releaseRental: e.target.checked })} />
            {t('fleet.fields.releaseRental')}
          </label>
        )}
        <Textarea label={t('fleet.fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
        <p className="text-[11px] text-gic-muted">
          {t('fleet.hints.returnCost', { days: inclusiveDays(assignment.startDate, form.returnDate) })}
        </p>
      </form>
    </Modal>
  );
}

type ListResponse = {
  items: Assignment[];
  totals: { planned: number; actual: number; total: number };
  counts: { total: number; en_cours: number; a_retourner: number; planifie: number; termine: number };
};

export function AssignmentsPanel({
  fixed = {},
  initialStatus = '',
  toolbar = false,
  showKpis = false,
  site = false,
  returnFocus = false,
  onChanged,
  defaults,
  lock,
  reloadKey,
}: {
  fixed?: { enginId?: string; chantierId?: string; tranche?: string; projectId?: string };
  initialStatus?: string;
  toolbar?: boolean;
  showKpis?: boolean;
  /** Sur une fiche chantier ou tranche : seulement les engins affectés et l’affectation. */
  site?: boolean;
  returnFocus?: boolean;
  onChanged?: () => void;
  defaults?: Partial<AssignmentForm>;
  lock?: { engin?: boolean; chantier?: boolean; tranche?: boolean };
  reloadKey?: number;
}) {
  const { t } = useI18n();
  const { engins, chantiers } = useFleetRefs();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [enginId, setEnginId] = useState('');
  const [chantierId, setChantierId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [returning, setReturning] = useState<Assignment | null>(null);
  const [deleting, setDeleting] = useState<Assignment | null>(null);
  const selection = useRowSelection<Assignment>();

  const query = useMemo(
    () =>
      queryString({
        enginId: fixed.enginId || enginId,
        chantierId: fixed.chantierId || chantierId,
        tranche: fixed.tranche,
        projectId: fixed.projectId,
        status,
        q,
        dateFrom,
        dateTo,
      }),
    [fixed.enginId, fixed.chantierId, fixed.tranche, fixed.projectId, enginId, chantierId, status, q, dateFrom, dateTo],
  );

  function load() {
    setLoading(true);
    api<ListResponse>(`/engins/assignments?${query}`)
      .then(setData)
      .catch(() => setData({ items: [], totals: { planned: 0, actual: 0, total: 0 }, counts: { total: 0, en_cours: 0, a_retourner: 0, planifie: 0, termine: 0 } }))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const id = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, reloadKey]);

  function changed() {
    invalidateFleetRefs();
    load();
    onChanged?.();
  }

  function exportCsv() {
    if (!data) return;
    downloadRowsCsv(
      'affectations-engins.csv',
      [t('fleet.fields.engin'), t('fleet.fields.chantier'), t('fleet.fields.tranche'), t('fleet.fields.responsible'), t('fleet.fields.startDate'), t('fleet.fields.endDate'), t('fleet.fields.mode'), t('fleet.fields.costMethod'), t('fleet.fields.dailyCost'), t('fleet.fields.plannedCost'), t('fleet.fields.actualCost'), t('fleet.fields.expensesShare'), t('fleet.fields.totalCost'), t('fleet.fields.status')],
      data.items.map((a) => [
        a.enginLabel,
        a.chantier?.name || a.project?.name || '',
        a.tranche || '',
        a.responsible || '',
        isoDate(a.startDate),
        isoDate(a.endDate),
        t(`fleet.mode.${a.mode}`),
        t(`fleet.costMethod.${a.costMethod}`),
        a.dailyCost,
        a.plannedCost,
        a.actualCost,
        a.expensesShare,
        a.totalCost,
        t(`fleet.assignmentStatus.${a.status}`),
      ]),
    );
  }

  const items = data?.items || [];
  const showEngin = !fixed.enginId;
  const showChantier = !fixed.chantierId;

  function printList() {
    const enginFilterId = fixed.enginId || enginId;
    const chantierFilterId = fixed.chantierId || chantierId;
    const enginRef = engins.find((e) => e.id === enginFilterId);
    const sumMad = (rows: Assignment[], pick: (a: Assignment) => number) => formatMad(rows.reduce((s, a) => s + (pick(a) || 0), 0));
    const columns: PrintColumn<Assignment>[] = [
      ...(showEngin ? [{ label: t('fleet.fields.engin'), value: (a: Assignment) => a.enginLabel }] : []),
      ...(showChantier ? [{ label: t('fleet.fields.chantier'), value: (a: Assignment) => a.chantier?.name || a.project?.name }] : []),
      { label: t('fleet.fields.tranche'), value: (a) => a.tranche || (showChantier ? '' : t('fleet.hints.wholeChantier')) },
      { label: t('fleet.fields.responsible'), value: (a) => a.responsible },
      { label: t('fleet.fields.startDate'), value: (a) => formatDate(a.startDate) },
      { label: t('fleet.fields.endDate'), value: (a) => (a.endDate ? formatDate(a.endDate) : '') },
      { label: t('fleet.fields.mode'), value: (a) => t(`fleet.mode.${a.mode}`) },
      {
        label: t('fleet.fields.costMethod'),
        value: (a) => `${t(`fleet.costMethod.${a.costMethod}`)} — ${a.costMethod === 'forfait' ? formatMad2(a.flatAmount) : a.costMethod === 'horaire' ? `${formatMad2(a.hourlyCost)} / h` : `${formatMad2(a.dailyCost)} / j`}`,
      },
      { label: t('fleet.fields.plannedCost'), value: (a) => formatMad(a.plannedCost), align: 'right', total: (rows) => sumMad(rows, (a) => a.plannedCost) },
      { label: t('fleet.fields.actualCost'), value: (a) => formatMad(a.actualCost), align: 'right', total: (rows) => sumMad(rows, (a) => a.actualCost) },
      { label: t('fleet.fields.expensesShare'), value: (a) => formatMad(a.expensesShare), align: 'right', total: (rows) => sumMad(rows, (a) => a.expensesShare) },
      { label: t('fleet.fields.totalCost'), value: (a) => formatMad(a.totalCost), align: 'right', total: (rows) => sumMad(rows, (a) => a.totalCost) },
      { label: t('fleet.fields.status'), value: (a) => t(`fleet.assignmentStatus.${a.status}`) },
    ];
    printRows<Assignment>({
      title: returnFocus ? t('fleet.nav.retours') : t('fleet.nav.affectations'),
      filters: [
        [t('listPrint.search'), q],
        [t('listPrint.status'), status === 'actifs' ? t('fleet.filters.activeOnly') : status && t(`fleet.assignmentStatus.${status}`)],
        [t('fleet.fields.engin'), enginFilterId && (enginRef ? enginLabel(enginRef) : items.find((a) => a.enginId === enginFilterId)?.enginLabel)],
        [t('fleet.fields.chantier'), chantierFilterId && (chantiers.find((c) => c.id === chantierFilterId)?.name || items.find((a) => a.chantierId === chantierFilterId)?.chantier?.name)],
        [t('fleet.fields.tranche'), fixed.tranche],
        [t('columns.project'), fixed.projectId && items.find((a) => a.projectId === fixed.projectId)?.project?.name],
        [t('listPrint.period'), dateFrom || dateTo ? `${dateFrom ? formatDate(dateFrom) : '…'} → ${dateTo ? formatDate(dateTo) : '…'}` : ''],
      ],
      columns,
      rows: selection.count ? selection.rows : items,
      selectedCount: selection.count,
    });
  }

  return (
    <div className="space-y-3">
      {showKpis && data && (
        <div className="mac-kpi-grid mac-kpi-grid-4">
          <KpiCard title={t('fleet.kpi.assignments')} value={data.counts.total} icon={Truck} tone="violet" delta={t('fleet.kpi.ongoingDelta', { count: data.counts.en_cours })} deltaTone="muted" />
          <KpiCard title={t('fleet.kpi.toReturn')} value={data.counts.a_retourner} icon={Undo} tone="coral" delta={t('fleet.kpi.plannedDelta', { count: data.counts.planifie })} deltaTone="muted" />
          <KpiCard title={t('fleet.fields.plannedCost')} value={formatMad(data.totals.planned)} icon={CalendarClock} tone="amber" compact />
          <KpiCard title={t('fleet.kpi.actualTotal')} value={formatMad(data.totals.total)} icon={Wallet} tone="emerald" compact delta={t('fleet.kpi.actualDelta', { amount: formatMad(data.totals.actual) })} deltaTone="muted" />
        </div>
      )}

      {!site && <SelectionBar selection={selection} onPrint={printList} />}

      <Card padding={false} className="overflow-visible">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-black/[0.05]">
          {toolbar && !site && (
            <>
              <MacSearch value={q} onChange={setQ} placeholder={t('fleet.hints.searchAssignments')} />
              <MacSelect
                value={status}
                onChange={setStatus}
                className="w-40 shrink-0"
                options={[
                  { value: '', label: t('fleet.filters.allStatuses') },
                  { value: 'actifs', label: t('fleet.filters.activeOnly') },
                  ...ASSIGNMENT_STATUSES.map((s) => ({ value: s, label: t(`fleet.assignmentStatus.${s}`) })),
                ]}
              />
              {showEngin && (
                <MacSelect
                  value={enginId}
                  onChange={setEnginId}
                  className="w-48 shrink-0"
                  options={[{ value: '', label: t('fleet.filters.allEngins') }, ...engins.map((e) => ({ value: e.id, label: [e.code, e.designation || e.brand].filter(Boolean).join(' — ') }))]}
                />
              )}
              {showChantier && (
                <MacSelect
                  value={chantierId}
                  onChange={setChantierId}
                  className="w-44 shrink-0"
                  options={[{ value: '', label: t('fleet.filters.allChantiers') }, ...chantiers.map((c) => ({ value: c.id, label: c.name }))]}
                />
              )}
              <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('fields.from')} className="w-36 shrink-0" />
              <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('fields.to')} className="w-36 shrink-0" />
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {!site && <Btn variant="secondary" icon={Printer} onClick={printList}>{t('common.print')}</Btn>}
            {!site && <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.csv')}</Btn>}
            <Btn icon={Plus} onClick={() => { setEditing(null); setModalOpen(true); }}>{t('fleet.actions.newAssignment')}</Btn>
          </div>
        </div>

        {loading && !data ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState title={returnFocus ? t('fleet.empty.toReturn') : t('fleet.empty.assignments')} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                {!site && <SelectAllTh selection={selection} rows={items} />}
                {showEngin && <Th mac>{t('fleet.fields.engin')}</Th>}
                {showChantier && !site && <Th mac>{t('fleet.fields.chantierTranche')}</Th>}
                {!showChantier && <Th mac>{t('fleet.fields.tranche')}</Th>}
                {!site && <Th mac>{t('fleet.fields.period')}</Th>}
                {!site && <Th mac>{t('fleet.fields.costMethod')}</Th>}
                {!site && <Th mac className="text-right">{t('fleet.fields.plannedCost')}</Th>}
                {!site && <Th mac className="text-right">{t('fleet.fields.actualCost')}</Th>}
                {!site && <Th mac className="text-right">{t('fleet.fields.expensesShare')}</Th>}
                {!site && <Th mac className="text-right">{t('fleet.fields.totalCost')}</Th>}
                <Th mac>{site ? t('fields.status') : t('fleet.fields.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  {!site && <SelectTd selection={selection} row={a} />}
                  {showEngin && (
                    <Td mac>
                      <Link to={`/engins/${a.enginId}`} className="mac-table-ref">{a.enginLabel}</Link>
                      <span className="block text-[10px] mac-table-muted">{t(`fleet.mode.${a.mode}`)}</span>
                    </Td>
                  )}
                  {showChantier && !site && (
                    <Td mac>
                      {a.chantier ? <Link to={`/chantiers/${a.chantier.id}`} className="hover:text-[#007aff]">{a.chantier.name}</Link> : a.project?.name || '—'}
                      {a.tranche && <span className="block text-[10px] mac-table-muted">{a.tranche}</span>}
                    </Td>
                  )}
                  {!showChantier && <Td mac>{a.tranche || <span className="mac-table-muted">{t('fleet.hints.wholeChantier')}</span>}</Td>}
                  {!site && <Td mac className="text-[11px] whitespace-nowrap">
                    {formatDate(a.startDate)} → {a.endDate ? formatDate(a.endDate) : '…'}
                    <span className="block text-[10px] mac-table-muted">
                      {a.plannedDays != null ? t('fleet.hints.daysPlanned', { days: a.plannedDays }) : t('fleet.hints.openEndedShort')}
                      {a.elapsedDays ? ` · ${t('fleet.hints.daysElapsed', { days: a.elapsedDays })}` : ''}
                      {a.hours ? ` · ${a.hours} h` : ''}
                    </span>
                    {a.responsible && <span className="block text-[10px] mac-table-muted">{a.responsible}</span>}
                  </Td>}
                  {!site && <Td mac className="text-[11px]">
                    {t(`fleet.costMethod.${a.costMethod}`)}
                    <span className="block text-[10px] mac-table-muted">
                      {a.costMethod === 'forfait' ? formatMad2(a.flatAmount) : a.costMethod === 'horaire' ? `${formatMad2(a.hourlyCost)} / h` : `${formatMad2(a.dailyCost)} / j`}
                    </span>
                  </Td>}
                  {!site && <Td mac className="text-right tabular-nums">{formatMad(a.plannedCost)}</Td>}
                  {!site && <Td mac className="text-right tabular-nums">{formatMad(a.actualCost)}</Td>}
                  {!site && <Td mac className="text-right tabular-nums mac-table-muted">{formatMad(a.expensesShare)}</Td>}
                  {!site && <Td mac className="text-right tabular-nums font-semibold">{formatMad(a.totalCost)}</Td>}
                  <Td mac><FleetStatusPill status={site ? (a.engin?.status || a.status) : a.status} /></Td>
                  <Td mac className="mac-td-actions">
                    <div className="mac-actions">
                      {!a.returnedAt && (
                        <MacActionBtn icon={Undo2} tone={a.status === 'a_retourner' || returnFocus ? 'red' : 'teal'} title={t('fleet.actions.returnEquipment')} onClick={() => setReturning(a)} />
                      )}
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => { setEditing(a); setModalOpen(true); }} />
                      <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => setDeleting(a)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
            {data && items.length > 1 && !site && (
              <tfoot>
                <tr className="font-semibold">
                  <Td mac colSpan={(showEngin ? 1 : 0) + 4}>{t('fleet.hints.totalRows', { count: items.length })}</Td>
                  <Td mac className="text-right tabular-nums">{formatMad(data.totals.planned)}</Td>
                  <Td mac className="text-right tabular-nums">{formatMad(data.totals.actual)}</Td>
                  <Td mac className="text-right tabular-nums">{formatMad(round2(data.totals.total - data.totals.actual))}</Td>
                  <Td mac className="text-right tabular-nums">{formatMad(data.totals.total)}</Td>
                  <Td mac colSpan={2}>{''}</Td>
                </tr>
              </tfoot>
            )}
          </TableWrap>
        )}
      </Card>

      <AssignmentModal
        open={modalOpen}
        assignment={editing}
        defaults={{ ...defaults, enginId: fixed.enginId || defaults?.enginId || '', chantierId: fixed.chantierId || defaults?.chantierId || '', tranche: fixed.tranche || defaults?.tranche || '' }}
        lock={lock ?? { engin: !!fixed.enginId, chantier: !!fixed.chantierId, tranche: !!fixed.tranche }}
        onClose={() => setModalOpen(false)}
        onSaved={changed}
      />
      <ReturnModal assignment={returning} onClose={() => setReturning(null)} onSaved={changed} />
      <DeleteMotifModal
        open={!!deleting}
        title={t('fleet.actions.deleteAssignment')}
        onClose={() => setDeleting(null)}
        onConfirm={async (motif) => {
          if (!deleting) return;
          try {
            await api(`/engins/assignments/${deleting.id}`, { method: 'DELETE', body: JSON.stringify({ motif }) });
            setDeleting(null);
            changed();
          } catch (err) {
            await appAlert(errorMessage(err, t('common.error')));
          }
        }}
      />
    </div>
  );
}
