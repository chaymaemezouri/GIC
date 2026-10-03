import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Download, Fuel, Gauge, Pencil, Plus, Printer, Receipt, Route, Trash2, Truck, Wallet } from 'lucide-react';
import { api, formatDate, formatMad } from '../../lib/api';
import { appAlert } from '../../lib/dialog';
import {
  EXPENSE_CATEGORIES,
  PAYMENT_MODES,
  chantierTrancheLabel,
  downloadRowsCsv,
  enginLabel,
  errorMessage,
  formatMad2,
  isoDate,
  queryString,
  round2,
  todayISO,
} from '../../lib/engins';
import { fetchAllRows, printRows, type PrintFilter } from '../../lib/listPrint';
import { useRowSelection } from '../../hooks/useRowSelection';
import { useI18n } from '../../i18n/I18nContext';
import { SelectAllTh, SelectTd, SelectionBar } from '../RowSelection';
import { Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect, Modal, Pagination, Select, TableWrap, Td, Textarea, Th } from '../ui';
import {
  AllocationFields,
  ChantierTrancheFields,
  DeleteMotifModal,
  EnginSelect,
  FormGrid,
  useDrivers,
  useFleetRefs,
  type AllocationValue,
} from './FleetCommon';

type Fixed = { enginId?: string; chantierId?: string; tranche?: string; kind?: 'engin' | 'materiel' };

type Paged<T> = { items: T[]; total: number; page: number; limit: number; pages: number };

const PAGE_SIZE = 50;

function useLogList<T, R extends Paged<T>>(path: string, params: Record<string, string | undefined>, reloadKey?: number) {
  const [data, setData] = useState<R | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const qs = useMemo(() => queryString({ ...params }), [params]);
  useEffect(() => setPage(1), [qs]);
  function load(p = page) {
    setLoading(true);
    api<R>(`${path}?${qs}&page=${p}&limit=${PAGE_SIZE}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    const id = setTimeout(() => load(page), params.q ? 250 : 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs, page, reloadKey]);
  return { data, page, setPage, loading, qs, reload: () => load(page) };
}

function LogToolbar({
  toolbar,
  fixed,
  q,
  setQ,
  enginId,
  setEnginId,
  chantierId,
  setChantierId,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  extra,
  actions,
  searchPlaceholder,
}: {
  toolbar: boolean;
  fixed: Fixed;
  q: string;
  setQ: (v: string) => void;
  enginId: string;
  setEnginId: (v: string) => void;
  chantierId: string;
  setChantierId: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  extra?: ReactNode;
  actions: ReactNode;
  searchPlaceholder: string;
}) {
  const { t } = useI18n();
  const { engins, chantiers } = useFleetRefs();
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-black/[0.05]">
      {toolbar && (
        <>
          <MacSearch value={q} onChange={setQ} placeholder={searchPlaceholder} />
          {!fixed.enginId && (
            <MacSelect
              value={enginId}
              onChange={setEnginId}
              className="w-48 shrink-0"
              options={[{ value: '', label: t('fleet.filters.allEngins') }, ...engins.filter((e) => !fixed.kind || e.kind === fixed.kind).map((e) => ({ value: e.id, label: [e.code, e.designation || e.brand].filter(Boolean).join(' — ') }))]}
            />
          )}
          {!fixed.chantierId && (
            <MacSelect
              value={chantierId}
              onChange={setChantierId}
              className="w-44 shrink-0"
              options={[{ value: '', label: t('fleet.filters.allChantiers') }, ...chantiers.map((c) => ({ value: c.id, label: c.name }))]}
            />
          )}
          {extra}
          <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('fields.from')} className="w-36 shrink-0" />
          <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('fields.to')} className="w-36 shrink-0" />
        </>
      )}
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </div>
  );
}

function useFilterState(fixed: Fixed) {
  const [q, setQ] = useState('');
  const [enginId, setEnginId] = useState('');
  const [chantierId, setChantierId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const params = useMemo(
    () => ({
      q,
      enginId: fixed.enginId || enginId,
      chantierId: fixed.chantierId || chantierId,
      dateFrom,
      dateTo,
    }),
    [q, enginId, chantierId, dateFrom, dateTo, fixed.enginId, fixed.chantierId],
  );
  return { q, setQ, enginId, setEnginId, chantierId, setChantierId, dateFrom, setDateFrom, dateTo, setDateTo, params };
}

function useLogPrintFilters(fixed: Fixed, params: ReturnType<typeof useFilterState>['params']): PrintFilter[] {
  const { t } = useI18n();
  const { engins, chantiers } = useFleetRefs();
  const { q, enginId, chantierId, dateFrom, dateTo } = params;
  return [
    [t('listPrint.search'), q],
    [t('fleet.fields.engin'), enginId && enginLabel(engins.find((e) => e.id === enginId))],
    [t('fleet.fields.chantier'), chantierId && chantiers.find((c) => c.id === chantierId)?.name],
    [t('fleet.fields.tranche'), fixed.tranche],
    [t('listPrint.period'), (dateFrom || dateTo) && `${dateFrom ? formatDate(dateFrom) : '…'} → ${dateTo ? formatDate(dateTo) : '…'}`],
  ];
}

function EnginCell({ id, label }: { id: string; label: string }) {
  return <Link to={`/engins/${id}`} className="mac-table-ref">{label}</Link>;
}

// ─── Pointage d'utilisation ─────────────────────────────────────────

type Usage = {
  id: string;
  enginId: string;
  enginLabel: string;
  date: string;
  chantierId: string | null;
  chantier?: { id: string; name: string } | null;
  tranche: string | null;
  assignmentId: string | null;
  driverId: string | null;
  driverName: string | null;
  startTime: string | null;
  endTime: string | null;
  hours: number;
  kmStart: number | null;
  kmEnd: number | null;
  km: number | null;
  counterStart: number | null;
  counterEnd: number | null;
  remark: string | null;
};

type UsageForm = {
  enginId: string;
  date: string;
  chantierId: string;
  tranche: string;
  driverId: string;
  driverName: string;
  startTime: string;
  endTime: string;
  hours: string;
  kmStart: string;
  kmEnd: string;
  counterStart: string;
  counterEnd: string;
  remark: string;
};

function computeHours(start: string, end: string) {
  if (!start || !end) return null;
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  let minutes = h2 * 60 + m2 - (h1 * 60 + m1);
  if (minutes < 0) minutes += 24 * 60;
  return round2(minutes / 60);
}

function UsageModal({ open, onClose, onSaved, usage, fixed }: { open: boolean; onClose: () => void; onSaved: () => void; usage: Usage | null; fixed: Fixed }) {
  const { t } = useI18n();
  const { engins, chantiers } = useFleetRefs();
  const drivers = useDrivers();
  const blank: UsageForm = {
    enginId: fixed.enginId || '', date: todayISO(), chantierId: fixed.chantierId || '', tranche: fixed.tranche || '', driverId: '', driverName: '',
    startTime: '08:00', endTime: '17:00', hours: '', kmStart: '', kmEnd: '', counterStart: '', counterEnd: '', remark: '',
  };
  const [form, setForm] = useState<UsageForm>(blank);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (usage) {
      const s = (v: number | null) => (v != null ? String(v) : '');
      setForm({
        enginId: usage.enginId, date: isoDate(usage.date), chantierId: usage.chantierId || '', tranche: usage.tranche || '', driverId: usage.driverId || '',
        driverName: usage.driverId ? '' : usage.driverName || '', startTime: usage.startTime || '', endTime: usage.endTime || '',
        hours: usage.startTime && usage.endTime ? '' : String(usage.hours), kmStart: s(usage.kmStart), kmEnd: s(usage.kmEnd),
        counterStart: s(usage.counterStart), counterEnd: s(usage.counterEnd), remark: usage.remark || '',
      });
    } else {
      setForm(blank);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, usage]);

  const auto = computeHours(form.startTime, form.endTime);
  const engin = engins.find((e) => e.id === form.enginId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const n = (v: string) => (v === '' ? null : Number(v));
    const body = {
      enginId: form.enginId, date: form.date, chantierId: form.chantierId || null, tranche: form.tranche || null,
      driverId: form.driverId || null, driverName: form.driverId ? null : form.driverName || null,
      startTime: form.startTime || null, endTime: form.endTime || null, hours: form.hours === '' ? undefined : Number(form.hours),
      kmStart: n(form.kmStart), kmEnd: n(form.kmEnd), counterStart: n(form.counterStart), counterEnd: n(form.counterEnd), remark: form.remark || null,
    };
    try {
      if (usage) await api(`/engins/usages/${usage.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/engins/usages', { method: 'POST', body: JSON.stringify(body) });
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
      title={usage ? t('fleet.actions.editUsage') : t('fleet.actions.newUsage')}
      onClose={onClose}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn form="fleet-usage-form" type="submit" disabled={saving}>{t('common.save')}</Btn>
        </>
      }
    >
      <form id="fleet-usage-form" onSubmit={submit}>
        <FormGrid>
          <div className="sm:col-span-2">
            <EnginSelect
              engins={engins}
              value={form.enginId}
              disabled={!!fixed.enginId || !!usage}
              filter={fixed.kind ? (e) => e.kind === fixed.kind : undefined}
              onChange={(enginId) => setForm({ ...form, enginId })}
            />
          </div>
          <Input label={`${t('fleet.fields.date')} *`} type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Select label={t('fleet.fields.driver')} value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
            <option value="">{t('fleet.hints.otherDriver')}</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}
          </Select>
          {!form.driverId && <Input label={t('fleet.fields.driverName')} value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} />}
          {!form.driverId && <div />}
          <ChantierTrancheFields
            chantierId={form.chantierId}
            tranche={form.tranche}
            chantiers={chantiers}
            lockChantier={!!fixed.chantierId}
            lockTranche={!!fixed.tranche}
            onChange={(v) => setForm({ ...form, ...v })}
          />
          <p className="sm:col-span-2 -mt-1 text-[10px] text-gic-muted">{t('fleet.hints.usageAutoLink')}</p>
          <Input label={t('fleet.fields.startTime')} type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
          <Input label={t('fleet.fields.endTime')} type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          <Input
            label={t('fleet.fields.hours')}
            type="number"
            min="0"
            max="24"
            step="0.25"
            placeholder={auto != null ? String(auto) : ''}
            value={form.hours}
            onChange={(e) => setForm({ ...form, hours: e.target.value })}
          />
          <p className="self-end pb-2 text-[11px] text-gic-muted">{auto != null && form.hours === '' ? t('fleet.hints.hoursAuto', { hours: auto }) : ''}</p>
          <Input label={t('fleet.fields.kmStart')} type="number" min="0" value={form.kmStart} onChange={(e) => setForm({ ...form, kmStart: e.target.value })} />
          <Input label={t('fleet.fields.kmEnd')} type="number" min="0" value={form.kmEnd} onChange={(e) => setForm({ ...form, kmEnd: e.target.value })} />
          <Input label={t('fleet.fields.counterStart')} type="number" min="0" step="0.1" placeholder={engin?.counterValue != null ? String(engin.counterValue) : ''} value={form.counterStart} onChange={(e) => setForm({ ...form, counterStart: e.target.value })} />
          <Input label={t('fleet.fields.counterEnd')} type="number" min="0" step="0.1" value={form.counterEnd} onChange={(e) => setForm({ ...form, counterEnd: e.target.value })} />
          <div className="sm:col-span-2">
            <Textarea label={t('fleet.fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </div>
        </FormGrid>
      </form>
    </Modal>
  );
}

export function UsagePanel({ fixed = {}, toolbar = false, showKpis = false, reloadKey, onChanged }: { fixed?: Fixed; toolbar?: boolean; showKpis?: boolean; reloadKey?: number; onChanged?: () => void }) {
  const { t } = useI18n();
  const f = useFilterState(fixed);
  const params = useMemo(() => ({ ...f.params, tranche: fixed.tranche, kind: fixed.kind }), [f.params, fixed.tranche, fixed.kind]);
  const list = useLogList<Usage, Paged<Usage> & { totals: { hours: number; km: number; engins: number } }>('/engins/usages', params, reloadKey);
  const [modal, setModal] = useState<{ open: boolean; usage: Usage | null }>({ open: false, usage: null });
  const [deleting, setDeleting] = useState<Usage | null>(null);
  const items = list.data?.items || [];
  const changed = () => { list.reload(); onChanged?.(); };
  const selection = useRowSelection<Usage>();
  const printFilters = useLogPrintFilters(fixed, f.params);

  function printList() {
    printRows<Usage>({
      title: t('fleet.nav.utilisation'),
      filters: printFilters,
      columns: [
        { label: t('fleet.fields.date'), value: (u) => formatDate(u.date) },
        ...(fixed.enginId ? [] : [{ label: t('fleet.fields.engin'), value: (u: Usage) => u.enginLabel }]),
        { label: t('fleet.fields.chantierTranche'), value: (u) => chantierTrancheLabel(u.chantier?.name, u.tranche) },
        { label: t('fleet.fields.driver'), value: (u) => u.driverName },
        { label: t('fleet.fields.schedule'), value: (u) => (u.startTime && u.endTime ? `${u.startTime} → ${u.endTime}` : '') },
        { label: t('fleet.fields.hours'), value: (u) => `${u.hours} h`, align: 'right', total: (rows) => `${round2(rows.reduce((s, u) => s + u.hours, 0))} h` },
        { label: t('fleet.fields.km'), value: (u) => (u.km != null ? `${u.km} km` : ''), align: 'right', total: (rows) => `${round2(rows.reduce((s, u) => s + (u.km || 0), 0))} km` },
        { label: t('fleet.fields.counter'), value: (u) => (u.counterStart != null || u.counterEnd != null ? `${u.counterStart ?? '…'} → ${u.counterEnd ?? '…'}` : '') },
        { label: t('fleet.fields.remark'), value: (u) => u.remark },
      ],
      rows: selection.count ? selection.rows : () => fetchAllRows<Usage>('/engins/usages', list.qs),
      selectedCount: selection.count,
    });
  }

  return (
    <div className="space-y-3">
      {showKpis && list.data && (
        <div className="mac-kpi-grid mac-kpi-grid-4">
          <KpiCard title={t('fleet.kpi.usageEntries')} value={list.data.total} icon={Clock} tone="violet" />
          <KpiCard title={t('fleet.kpi.hours')} value={`${list.data.totals.hours} h`} icon={Gauge} tone="emerald" />
          <KpiCard title={t('fleet.kpi.km')} value={`${list.data.totals.km} km`} icon={Route} tone="amber" />
          <KpiCard title={t('fleet.kpi.enginsUsed')} value={list.data.totals.engins} icon={Truck} tone="teal" />
        </div>
      )}
      <SelectionBar selection={selection} onPrint={printList} />
      <Card padding={false} className="overflow-visible">
        <LogToolbar
          toolbar={toolbar}
          fixed={fixed}
          {...f}
          searchPlaceholder={t('fleet.hints.searchUsage')}
          actions={
            <>
              <Btn variant="secondary" icon={Printer} onClick={printList}>{t('common.print')}</Btn>
              <Btn
                variant="secondary"
                icon={Download}
                onClick={() =>
                  downloadRowsCsv(
                    'pointage-engins.csv',
                    [t('fleet.fields.date'), t('fleet.fields.engin'), t('fleet.fields.chantier'), t('fleet.fields.tranche'), t('fleet.fields.driver'), t('fleet.fields.startTime'), t('fleet.fields.endTime'), t('fleet.fields.hours'), t('fleet.fields.kmStart'), t('fleet.fields.kmEnd'), t('fleet.fields.counterStart'), t('fleet.fields.counterEnd'), t('fleet.fields.remark')],
                    items.map((u) => [isoDate(u.date), u.enginLabel, u.chantier?.name, u.tranche, u.driverName, u.startTime, u.endTime, u.hours, u.kmStart, u.kmEnd, u.counterStart, u.counterEnd, u.remark]),
                  )
                }
              >
                {t('common.csv')}
              </Btn>
              <Btn icon={Plus} onClick={() => setModal({ open: true, usage: null })}>{t('fleet.actions.newUsage')}</Btn>
            </>
          }
        />
        {list.loading && !list.data ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState title={t('fleet.empty.usage')} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <SelectAllTh selection={selection} rows={items} />
                <Th mac>{t('fleet.fields.date')}</Th>
                {!fixed.enginId && <Th mac>{t('fleet.fields.engin')}</Th>}
                <Th mac>{t('fleet.fields.chantierTranche')}</Th>
                <Th mac>{t('fleet.fields.driver')}</Th>
                <Th mac>{t('fleet.fields.schedule')}</Th>
                <Th mac className="text-right">{t('fleet.fields.hours')}</Th>
                <Th mac className="text-right">{t('fleet.fields.km')}</Th>
                <Th mac>{t('fleet.fields.counter')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <SelectTd selection={selection} row={u} />
                  <Td mac className="text-[11px] whitespace-nowrap">{formatDate(u.date)}</Td>
                  {!fixed.enginId && <Td mac><EnginCell id={u.enginId} label={u.enginLabel} /></Td>}
                  <Td mac>{chantierTrancheLabel(u.chantier?.name, u.tranche)}</Td>
                  <Td mac>{u.driverName || '—'}</Td>
                  <Td mac className="text-[11px]">{u.startTime && u.endTime ? `${u.startTime} → ${u.endTime}` : '—'}</Td>
                  <Td mac className="text-right tabular-nums font-medium">{u.hours} h</Td>
                  <Td mac className="text-right tabular-nums">{u.km != null ? `${u.km} km` : '—'}</Td>
                  <Td mac className="text-[11px]">{u.counterStart != null || u.counterEnd != null ? `${u.counterStart ?? '…'} → ${u.counterEnd ?? '…'}` : '—'}</Td>
                  <Td mac className="mac-td-actions">
                    <div className="mac-actions">
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => setModal({ open: true, usage: u })} />
                      <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => setDeleting(u)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={PAGE_SIZE} onPage={list.setPage} mac />}
      </Card>
      <UsageModal open={modal.open} usage={modal.usage} fixed={fixed} onClose={() => setModal({ open: false, usage: null })} onSaved={changed} />
      <DeleteMotifModal
        open={!!deleting}
        title={t('fleet.actions.deleteUsage')}
        onClose={() => setDeleting(null)}
        onConfirm={async (motif) => {
          if (!deleting) return;
          try {
            await api(`/engins/usages/${deleting.id}`, { method: 'DELETE', body: JSON.stringify({ motif }) });
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

// ─── Dépenses ───────────────────────────────────────────────────────

type Expense = {
  id: string;
  enginId: string;
  enginLabel: string;
  date: string;
  category: string;
  designation: string;
  amount: number;
  supplier: string | null;
  allocation: string;
  chantierId: string | null;
  chantier?: { id: string; name: string } | null;
  tranche: string | null;
  invoiceRef: string | null;
  paymentMode: string | null;
  remark: string | null;
};

function AllocationCell({ allocation, chantier, tranche }: { allocation: string; chantier?: { name: string } | null; tranche: string | null }) {
  const { t } = useI18n();
  if (allocation === 'direct') return <span>{chantierTrancheLabel(chantier?.name, tranche)}</span>;
  return <span className="mac-chip mac-chip-blue">{t('fleet.allocationShort.reparti')}</span>;
}

function ExpenseModal({ open, onClose, onSaved, expense, fixed }: { open: boolean; onClose: () => void; onSaved: () => void; expense: Expense | null; fixed: Fixed }) {
  const { t } = useI18n();
  const { engins, chantiers } = useFleetRefs();
  const [form, setForm] = useState({ enginId: '', date: todayISO(), category: 'transport', designation: '', amount: '', supplier: '', invoiceRef: '', paymentMode: 'especes', remark: '' });
  const [alloc, setAlloc] = useState<AllocationValue>({ allocation: 'reparti', chantierId: '', tranche: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (expense) {
      setForm({
        enginId: expense.enginId, date: isoDate(expense.date), category: expense.category, designation: expense.designation, amount: String(expense.amount),
        supplier: expense.supplier || '', invoiceRef: expense.invoiceRef || '', paymentMode: expense.paymentMode || 'especes', remark: expense.remark || '',
      });
      setAlloc({ allocation: expense.allocation === 'direct' ? 'direct' : 'reparti', chantierId: expense.chantierId || '', tranche: expense.tranche || '' });
    } else {
      setForm({ enginId: fixed.enginId || '', date: todayISO(), category: 'transport', designation: '', amount: '', supplier: '', invoiceRef: '', paymentMode: 'especes', remark: '' });
      setAlloc(fixed.chantierId ? { allocation: 'direct', chantierId: fixed.chantierId, tranche: fixed.tranche || '' } : { allocation: 'reparti', chantierId: '', tranche: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = { ...form, amount: Number(form.amount), ...alloc, chantierId: alloc.chantierId || null, tranche: alloc.tranche || null };
    try {
      if (expense) await api(`/engins/expenses/${expense.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/engins/expenses', { method: 'POST', body: JSON.stringify(body) });
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
      title={expense ? t('fleet.actions.editExpense') : t('fleet.actions.newExpense')}
      onClose={onClose}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn form="fleet-expense-form" type="submit" disabled={saving}>{t('common.save')}</Btn>
        </>
      }
    >
      <form id="fleet-expense-form" onSubmit={submit}>
        <FormGrid>
          <div className="sm:col-span-2">
            <EnginSelect engins={engins} value={form.enginId} disabled={!!fixed.enginId || !!expense} onChange={(enginId) => setForm({ ...form, enginId })} />
          </div>
          <Input label={`${t('fleet.fields.date')} *`} type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Select label={`${t('fleet.fields.category')} *`} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`fleet.expenseCat.${c}`)}</option>)}
          </Select>
          <Input label={`${t('fleet.fields.designation')} *`} required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          <Input label={`${t('fleet.fields.amount')} *`} type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Input label={t('fleet.fields.supplier')} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          <Input label={t('fleet.fields.invoiceRef')} value={form.invoiceRef} onChange={(e) => setForm({ ...form, invoiceRef: e.target.value })} />
          <Select label={t('fleet.fields.paymentMode')} value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
            {PAYMENT_MODES.map((m) => <option key={m} value={m}>{t(`fleet.paymentMode.${m}`)}</option>)}
          </Select>
          <div />
          <AllocationFields value={alloc} onChange={setAlloc} chantiers={chantiers} />
          <div className="sm:col-span-2">
            <Textarea label={t('fleet.fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </div>
          <p className="sm:col-span-2 text-[10px] text-gic-muted">{t('fleet.hints.cashSync')}</p>
        </FormGrid>
      </form>
    </Modal>
  );
}

export function ExpensePanel({ fixed = {}, toolbar = false, showKpis = false, reloadKey, onChanged }: { fixed?: Fixed; toolbar?: boolean; showKpis?: boolean; reloadKey?: number; onChanged?: () => void }) {
  const { t } = useI18n();
  const f = useFilterState(fixed);
  const [category, setCategory] = useState('');
  const params = useMemo(() => ({ ...f.params, category }), [f.params, category]);
  const list = useLogList<Expense, Paged<Expense> & { amount: number; byCategory: { category: string; amount: number }[] }>('/engins/expenses', params, reloadKey);
  const [modal, setModal] = useState<{ open: boolean; expense: Expense | null }>({ open: false, expense: null });
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const items = list.data?.items || [];
  const changed = () => { list.reload(); onChanged?.(); };
  const topCats = [...(list.data?.byCategory || [])].sort((a, b) => b.amount - a.amount).slice(0, 2);
  const selection = useRowSelection<Expense>();
  const printFilters = useLogPrintFilters(fixed, f.params);

  function printList() {
    printRows<Expense>({
      title: t('fleet.nav.depenses'),
      filters: [...printFilters, [t('fleet.fields.category'), category && t(`fleet.expenseCat.${category}`)]],
      columns: [
        { label: t('fleet.fields.date'), value: (x) => formatDate(x.date) },
        ...(fixed.enginId ? [] : [{ label: t('fleet.fields.engin'), value: (x: Expense) => x.enginLabel }]),
        { label: t('fleet.fields.category'), value: (x) => t(`fleet.expenseCat.${x.category}`) },
        { label: t('fleet.fields.designation'), value: (x) => x.designation },
        { label: t('fleet.fields.supplier'), value: (x) => x.supplier },
        { label: t('fleet.fields.invoiceRef'), value: (x) => x.invoiceRef },
        { label: t('fleet.fields.allocation'), value: (x) => (x.allocation === 'direct' ? chantierTrancheLabel(x.chantier?.name, x.tranche) : t('fleet.allocationShort.reparti')) },
        { label: t('fleet.fields.amount'), value: (x) => formatMad2(x.amount), align: 'right', total: (rows) => formatMad2(rows.reduce((s, x) => s + x.amount, 0)) },
      ],
      rows: selection.count ? selection.rows : () => fetchAllRows<Expense>('/engins/expenses', list.qs),
      selectedCount: selection.count,
    });
  }

  return (
    <div className="space-y-3">
      {showKpis && list.data && (
        <div className="mac-kpi-grid mac-kpi-grid-4">
          <KpiCard title={t('fleet.kpi.expenses')} value={list.data.total} icon={Receipt} tone="violet" />
          <KpiCard title={t('fleet.kpi.expensesAmount')} value={formatMad(list.data.amount)} icon={Wallet} tone="coral" compact />
          {topCats.map((c) => (
            <KpiCard key={c.category} title={t(`fleet.expenseCat.${c.category}`)} value={formatMad(c.amount)} icon={Receipt} tone="amber" compact />
          ))}
        </div>
      )}
      <SelectionBar selection={selection} onPrint={printList} />
      <Card padding={false} className="overflow-visible">
        <LogToolbar
          toolbar={toolbar}
          fixed={fixed}
          {...f}
          searchPlaceholder={t('fleet.hints.searchExpenses')}
          extra={
            <MacSelect
              value={category}
              onChange={setCategory}
              className="w-40 shrink-0"
              options={[{ value: '', label: t('fleet.filters.allCategories') }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`fleet.expenseCat.${c}`) }))]}
            />
          }
          actions={
            <>
              <Btn variant="secondary" icon={Printer} onClick={printList}>{t('common.print')}</Btn>
              <Btn
                variant="secondary"
                icon={Download}
                onClick={() =>
                  downloadRowsCsv(
                    'depenses-engins.csv',
                    [t('fleet.fields.date'), t('fleet.fields.engin'), t('fleet.fields.category'), t('fleet.fields.designation'), t('fleet.fields.supplier'), t('fleet.fields.invoiceRef'), t('fleet.fields.allocation'), t('fleet.fields.chantier'), t('fleet.fields.tranche'), t('fleet.fields.amount')],
                    items.map((x) => [isoDate(x.date), x.enginLabel, t(`fleet.expenseCat.${x.category}`), x.designation, x.supplier, x.invoiceRef, t(`fleet.allocationShort.${x.allocation}`), x.chantier?.name, x.tranche, x.amount]),
                  )
                }
              >
                {t('common.csv')}
              </Btn>
              <Btn icon={Plus} onClick={() => setModal({ open: true, expense: null })}>{t('fleet.actions.newExpense')}</Btn>
            </>
          }
        />
        {list.loading && !list.data ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState title={t('fleet.empty.expenses')} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <SelectAllTh selection={selection} rows={items} />
                <Th mac>{t('fleet.fields.date')}</Th>
                {!fixed.enginId && <Th mac>{t('fleet.fields.engin')}</Th>}
                <Th mac>{t('fleet.fields.category')}</Th>
                <Th mac>{t('fleet.fields.designation')}</Th>
                <Th mac>{t('fleet.fields.allocation')}</Th>
                <Th mac className="text-right">{t('fleet.fields.amount')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <SelectTd selection={selection} row={x} />
                  <Td mac className="text-[11px] whitespace-nowrap">{formatDate(x.date)}</Td>
                  {!fixed.enginId && <Td mac><EnginCell id={x.enginId} label={x.enginLabel} /></Td>}
                  <Td mac><span className="mac-chip mac-chip-gray">{t(`fleet.expenseCat.${x.category}`)}</span></Td>
                  <Td mac>
                    {x.designation}
                    {(x.supplier || x.invoiceRef) && <span className="block text-[10px] mac-table-muted">{[x.supplier, x.invoiceRef].filter(Boolean).join(' · ')}</span>}
                  </Td>
                  <Td mac><AllocationCell allocation={x.allocation} chantier={x.chantier} tranche={x.tranche} /></Td>
                  <Td mac className="text-right tabular-nums font-medium">{formatMad2(x.amount)}</Td>
                  <Td mac className="mac-td-actions">
                    <div className="mac-actions">
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => setModal({ open: true, expense: x })} />
                      <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => setDeleting(x)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={PAGE_SIZE} onPage={list.setPage} mac />}
      </Card>
      <ExpenseModal open={modal.open} expense={modal.expense} fixed={fixed} onClose={() => setModal({ open: false, expense: null })} onSaved={changed} />
      <DeleteMotifModal
        open={!!deleting}
        title={t('fleet.actions.deleteExpense')}
        onClose={() => setDeleting(null)}
        onConfirm={async (motif) => {
          if (!deleting) return;
          try {
            await api(`/engins/expenses/${deleting.id}`, { method: 'DELETE', body: JSON.stringify({ motif }) });
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

// ─── Carburant & consommables ───────────────────────────────────────

type FuelLog = {
  id: string;
  enginId: string;
  enginLabel: string;
  date: string;
  liters: number;
  cost: number | null;
  counterValue: number | null;
  station: string | null;
  allocation: string;
  chantierId: string | null;
  chantier?: { id: string; name: string } | null;
  tranche: string | null;
  remark: string | null;
};

function FuelModal({ open, onClose, onSaved, log, fixed }: { open: boolean; onClose: () => void; onSaved: () => void; log: FuelLog | null; fixed: Fixed }) {
  const { t } = useI18n();
  const { engins, chantiers } = useFleetRefs();
  const [form, setForm] = useState({ enginId: '', date: todayISO(), liters: '', unitPrice: '', cost: '', counterValue: '', station: '', remark: '' });
  const [alloc, setAlloc] = useState<AllocationValue>({ allocation: 'reparti', chantierId: '', tranche: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (log) {
      setForm({
        enginId: log.enginId, date: isoDate(log.date), liters: String(log.liters), unitPrice: log.cost && log.liters ? String(round2(log.cost / log.liters)) : '',
        cost: log.cost != null ? String(log.cost) : '', counterValue: log.counterValue != null ? String(log.counterValue) : '', station: log.station || '', remark: log.remark || '',
      });
      setAlloc({ allocation: log.allocation === 'direct' ? 'direct' : 'reparti', chantierId: log.chantierId || '', tranche: log.tranche || '' });
    } else {
      setForm({ enginId: fixed.enginId || '', date: todayISO(), liters: '', unitPrice: '', cost: '', counterValue: '', station: '', remark: '' });
      setAlloc(fixed.chantierId ? { allocation: 'direct', chantierId: fixed.chantierId, tranche: fixed.tranche || '' } : { allocation: 'reparti', chantierId: '', tranche: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, log]);

  function setLiters(liters: string) {
    const cost = form.unitPrice && liters ? String(round2(Number(form.unitPrice) * Number(liters))) : form.cost;
    setForm({ ...form, liters, cost });
  }
  function setUnitPrice(unitPrice: string) {
    const cost = unitPrice && form.liters ? String(round2(Number(unitPrice) * Number(form.liters))) : form.cost;
    setForm({ ...form, unitPrice, cost });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = {
      enginId: form.enginId, date: form.date, liters: Number(form.liters), cost: form.cost === '' ? null : Number(form.cost),
      counterValue: form.counterValue === '' ? null : Number(form.counterValue), station: form.station || null, remark: form.remark || null,
      ...alloc, chantierId: alloc.chantierId || null, tranche: alloc.tranche || null,
    };
    try {
      if (log) await api(`/engins/fuel-logs/${log.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/engins/fuel-logs', { method: 'POST', body: JSON.stringify(body) });
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
      title={log ? t('fleet.actions.editFuel') : t('fleet.actions.newFuel')}
      onClose={onClose}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn form="fleet-fuel-form" type="submit" disabled={saving}>{t('common.save')}</Btn>
        </>
      }
    >
      <form id="fleet-fuel-form" onSubmit={submit}>
        <FormGrid>
          <div className="sm:col-span-2">
            <EnginSelect engins={engins} value={form.enginId} disabled={!!fixed.enginId || !!log} onChange={(enginId) => setForm({ ...form, enginId })} />
          </div>
          <Input label={`${t('fleet.fields.date')} *`} type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Input label={t('fleet.fields.station')} value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} />
          <Input label={`${t('fleet.fields.liters')} *`} type="number" min="0.01" step="0.01" required value={form.liters} onChange={(e) => setLiters(e.target.value)} />
          <Input label={t('fleet.fields.unitPrice')} type="number" min="0" step="0.01" value={form.unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          <Input label={t('fleet.fields.cost')} type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          <Input label={t('fleet.fields.counter')} type="number" min="0" value={form.counterValue} onChange={(e) => setForm({ ...form, counterValue: e.target.value })} />
          <AllocationFields value={alloc} onChange={setAlloc} chantiers={chantiers} />
          <div className="sm:col-span-2">
            <Textarea label={t('fleet.fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </div>
          <p className="sm:col-span-2 text-[10px] text-gic-muted">{t('fleet.hints.cashSync')}</p>
        </FormGrid>
      </form>
    </Modal>
  );
}

export function FuelPanel({ fixed = {}, toolbar = false, showKpis = false, reloadKey, onChanged }: { fixed?: Fixed; toolbar?: boolean; showKpis?: boolean; reloadKey?: number; onChanged?: () => void }) {
  const { t } = useI18n();
  const f = useFilterState(fixed);
  const list = useLogList<FuelLog, Paged<FuelLog> & { liters: number; cost: number; avgPrice: number | null }>('/engins/fuel-logs', f.params, reloadKey);
  const [modal, setModal] = useState<{ open: boolean; log: FuelLog | null }>({ open: false, log: null });
  const [deleting, setDeleting] = useState<FuelLog | null>(null);
  const items = list.data?.items || [];
  const changed = () => { list.reload(); onChanged?.(); };
  const selection = useRowSelection<FuelLog>();
  const printFilters = useLogPrintFilters(fixed, f.params);

  function printList() {
    printRows<FuelLog>({
      title: t('fleet.nav.carburant'),
      filters: printFilters,
      columns: [
        { label: t('fleet.fields.date'), value: (x) => formatDate(x.date) },
        ...(fixed.enginId ? [] : [{ label: t('fleet.fields.engin'), value: (x: FuelLog) => x.enginLabel }]),
        { label: t('fleet.fields.station'), value: (x) => x.station },
        { label: t('fleet.fields.liters'), value: (x) => `${x.liters} L`, align: 'right', total: (rows) => `${round2(rows.reduce((s, x) => s + x.liters, 0))} L` },
        { label: t('fleet.fields.cost'), value: (x) => (x.cost != null ? formatMad2(x.cost) : ''), align: 'right', total: (rows) => formatMad2(rows.reduce((s, x) => s + (x.cost || 0), 0)) },
        { label: t('fleet.fields.counter'), value: (x) => x.counterValue },
        { label: t('fleet.fields.allocation'), value: (x) => (x.allocation === 'direct' ? chantierTrancheLabel(x.chantier?.name, x.tranche) : t('fleet.allocationShort.reparti')) },
      ],
      rows: selection.count ? selection.rows : () => fetchAllRows<FuelLog>('/engins/fuel-logs', list.qs),
      selectedCount: selection.count,
    });
  }

  return (
    <div className="space-y-3">
      {showKpis && list.data && (
        <div className="mac-kpi-grid mac-kpi-grid-4">
          <KpiCard title={t('fleet.kpi.fuelEntries')} value={list.data.total} icon={Fuel} tone="violet" />
          <KpiCard title={t('fleet.kpi.liters')} value={`${list.data.liters} L`} icon={Fuel} tone="teal" />
          <KpiCard title={t('fleet.kpi.fuelCost')} value={formatMad(list.data.cost)} icon={Wallet} tone="coral" compact />
          <KpiCard title={t('fleet.kpi.avgPrice')} value={list.data.avgPrice != null ? `${formatMad2(list.data.avgPrice)} / L` : '—'} icon={Gauge} tone="amber" compact />
        </div>
      )}
      <SelectionBar selection={selection} onPrint={printList} />
      <Card padding={false} className="overflow-visible">
        <LogToolbar
          toolbar={toolbar}
          fixed={fixed}
          {...f}
          searchPlaceholder={t('fleet.hints.searchFuel')}
          actions={
            <>
              <Btn variant="secondary" icon={Printer} onClick={printList}>{t('common.print')}</Btn>
              <Btn
                variant="secondary"
                icon={Download}
                onClick={() =>
                  downloadRowsCsv(
                    'carburant-engins.csv',
                    [t('fleet.fields.date'), t('fleet.fields.engin'), t('fleet.fields.station'), t('fleet.fields.liters'), t('fleet.fields.cost'), t('fleet.fields.counter'), t('fleet.fields.allocation'), t('fleet.fields.chantier'), t('fleet.fields.tranche')],
                    items.map((x) => [isoDate(x.date), x.enginLabel, x.station, x.liters, x.cost, x.counterValue, t(`fleet.allocationShort.${x.allocation}`), x.chantier?.name, x.tranche]),
                  )
                }
              >
                {t('common.csv')}
              </Btn>
              <Btn icon={Plus} onClick={() => setModal({ open: true, log: null })}>{t('fleet.actions.newFuel')}</Btn>
            </>
          }
        />
        {list.loading && !list.data ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState title={t('fleet.empty.fuel')} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <SelectAllTh selection={selection} rows={items} />
                <Th mac>{t('fleet.fields.date')}</Th>
                {!fixed.enginId && <Th mac>{t('fleet.fields.engin')}</Th>}
                <Th mac>{t('fleet.fields.station')}</Th>
                <Th mac className="text-right">{t('fleet.fields.liters')}</Th>
                <Th mac className="text-right">{t('fleet.fields.cost')}</Th>
                <Th mac>{t('fleet.fields.counter')}</Th>
                <Th mac>{t('fleet.fields.allocation')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <SelectTd selection={selection} row={x} />
                  <Td mac className="text-[11px] whitespace-nowrap">{formatDate(x.date)}</Td>
                  {!fixed.enginId && <Td mac><EnginCell id={x.enginId} label={x.enginLabel} /></Td>}
                  <Td mac className="mac-table-muted">{x.station || '—'}</Td>
                  <Td mac className="text-right tabular-nums">{x.liters} L</Td>
                  <Td mac className="text-right tabular-nums font-medium">{x.cost != null ? formatMad2(x.cost) : '—'}</Td>
                  <Td mac className="text-[11px]">{x.counterValue ?? '—'}</Td>
                  <Td mac><AllocationCell allocation={x.allocation} chantier={x.chantier} tranche={x.tranche} /></Td>
                  <Td mac className="mac-td-actions">
                    <div className="mac-actions">
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => setModal({ open: true, log: x })} />
                      <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => setDeleting(x)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        {list.data && <Pagination page={list.page} pages={list.data.pages} total={list.data.total} limit={PAGE_SIZE} onPage={list.setPage} mac />}
      </Card>
      <FuelModal open={modal.open} log={modal.log} fixed={fixed} onClose={() => setModal({ open: false, log: null })} onSaved={changed} />
      <DeleteMotifModal
        open={!!deleting}
        title={t('fleet.actions.deleteFuel')}
        onClose={() => setDeleting(null)}
        onConfirm={async (motif) => {
          if (!deleting) return;
          try {
            await api(`/engins/fuel-logs/${deleting.id}`, { method: 'DELETE', body: JSON.stringify({ motif }) });
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