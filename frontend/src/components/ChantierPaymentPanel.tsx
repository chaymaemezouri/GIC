import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Clock, Gift, Pencil, Trash2, Wallet } from 'lucide-react';
import { api, formatDate, formatMad } from '../lib/api';
import { appAlert, appConfirm } from '../lib/dialog';
import { CHAUFFEUR_CATEGORY, workforceDetailPathForCategory } from '../lib/workforceScope';
import { useRowSelection } from '../hooks/useRowSelection';
import { SelectAllTh, SelectTd } from './RowSelection';
import { Btn, Input, KpiCard, MacActionBtn, MacDateInput, MacSearch, Modal, Select, TableWrap, Tabs, Td, Textarea, Th } from './ui';
import { useI18n } from '../i18n/I18nContext';

type PayEvent = {
  id?: string;
  recordId?: string;
  amount: number;
  paidAt?: string | null;
  paymentMode?: string | null;
  tranche?: string;
  remark?: string | null;
};

type PayLine = {
  id: string;
  workforceId: string;
  firstName: string;
  lastName: string;
  category?: string | null;
  monthly: boolean;
  chantierName: string;
  tranche: string;
  totalDays: number;
  advances: number;
  bonuses?: number;
  brut?: number;
  netDue: number;
  amountPaid: number;
  remaining: number;
  status: string;
  paymentMode?: string | null;
  paidAt?: string | null;
  remark?: string | null;
  task?: string;
  days?: PayDay[];
  payments?: PayEvent[];
  adjustments?: PayAdj[];
};

type PayAdj = {
  id: string;
  kind: 'bonus' | 'advance' | string;
  amount: number;
  occurredAt: string;
  remark?: string | null;
};

type HistKind = 'in' | 'wage' | 'advance' | 'bonus' | 'payment';

function money(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

type HistRow = {
  key: string;
  date: string;
  kind: 'wage' | 'advance' | 'bonus' | 'payment';
  amount: number;
  after: number;
  mode?: string | null;
  note?: string;
  pointageId?: string;
  paymentId?: string;
  recordId?: string;
  adjustmentId?: string;
  days?: number;
  rate?: number;
};

const HIST_RANK: Record<HistRow['kind'], number> = { wage: 0, bonus: 1, advance: 2, payment: 3 };

type HistEdit = {
  kind: 'wage' | 'advance' | 'bonus' | 'payment';
  pointageId?: string;
  paymentId?: string;
  recordId?: string;
  adjustmentId?: string;
  amount: string;
  date: string;
  mode: string;
  remark: string;
  days: string;
  rate: string;
};

type PayDay = {
  id: string;
  date: string;
  tranche: string;
  task: string;
  remark: string;
  days: number;
  hours: number;
  rate: number;
  brut: number;
  advance: number;
  bonus: number;
  net: number;
  validated?: boolean;
};

type PayPayload = {
  periodYear: number;
  periodMonth: number;
  lines: PayLine[];
  totals: { totalDays: number; advances: number; remaining: number };
};

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStartISO() {
  const d = new Date();
  return localISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function ChantierPaymentPanel({
  chantierId,
  scope = 'workers',
  tranche,
}: {
  chantierId: string;
  scope?: 'workers' | 'drivers';
  tranche?: string;
}) {
  const { t } = useI18n();
  const [dateFrom, setDateFrom] = useState(monthStartISO);
  const [dateTo, setDateTo] = useState(localISO(new Date()));
  const [query, setQuery] = useState('');
  const [data, setData] = useState<PayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<PayLine | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payMode, setPayMode] = useState('especes');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(localISO(new Date()));
  const [payRemark, setPayRemark] = useState('');
  const [payTargets, setPayTargets] = useState<PayLine[]>([]);
  const [payFilter, setPayFilter] = useState<'' | 'a_payer' | 'paye' | 'partiel'>('');
  const [paying, setPaying] = useState(false);
  const [histTab, setHistTab] = useState<HistKind>('in');
  const [histEdit, setHistEdit] = useState<HistEdit | null>(null);
  const [histBusy, setHistBusy] = useState(false);
  const selection = useRowSelection<PayLine>();

  function load() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    if (scope === 'drivers') qs.set('category', CHAUFFEUR_CATEGORY);
    else qs.set('excludeCategory', CHAUFFEUR_CATEGORY);
    api<PayPayload>(`/chantiers/${chantierId}/payroll-lines?${qs}`)
      .then((payload) => {
        setData(payload);
        selection.clear();
        setDetail((cur) => (cur ? payload.lines.find((row) => row.id === cur.id) || null : null));
      })
      .catch(async (err) => {
        setData(null);
        await appAlert(err instanceof Error ? err.message : t('common.error'));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [chantierId, scope, dateFrom, dateTo]);

  const visible = useMemo(() => {
    const rows = (data?.lines || []).filter((row) => {
      if (tranche && row.tranche !== tranche) return false;
      if (payFilter === 'a_payer') return restOf(row) > 0;
      if (payFilter === 'paye') return restOf(row) <= 0.01 && dueOf(row) > 0;
      if (payFilter === 'partiel') return restOf(row) > 0.01 && row.amountPaid > 0;
      return true;
    });
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => (
      `${row.firstName} ${row.lastName} ${row.tranche} ${row.chantierName} ${row.category || ''}`.toLowerCase().includes(needle)
    ));
  }, [data, query, payFilter, tranche]);

  const shownTotals = useMemo(() => visible.reduce(
    (s, row) => ({
      totalDays: s.totalDays + row.totalDays,
      advances: s.advances + row.advances,
      netDue: s.netDue + dueOf(row),
      amountPaid: s.amountPaid + row.amountPaid,
      remaining: s.remaining + restOf(row),
    }),
    { totalDays: 0, advances: 0, netDue: 0, amountPaid: 0, remaining: 0 },
  ), [visible]);

  const payableSelected = selection.rows.filter((row) => payMax(row) > 0);
  const targetRest = payTargets.reduce((s, row) => s + payMax(row), 0);
  const single = payTargets.length === 1 ? payTargets[0] : null;

  function wageSum(row: PayLine) {
    if (!row.monthly && row.days?.length) return money(row.days.reduce((sum, day) => sum + day.days * day.rate, 0));
    return money(row.brut ?? row.netDue);
  }

  function bonusSum(row: PayLine) {
    if (row.bonuses != null) return money(row.bonuses);
    return money((row.days || []).reduce((sum, day) => sum + day.bonus, 0));
  }

  function dueOf(row: PayLine) {
    return money(Math.max(0, wageSum(row) + bonusSum(row) - row.advances));
  }

  function restOf(row: PayLine) {
    return money(Math.max(0, dueOf(row) - row.amountPaid));
  }

  function payMax(row: PayLine) {
    return restOf(row);
  }

  function formulaOf(days: number, price: number) {
    return t('siteOps.payFormula', { days: days.toFixed(2), price: formatMad(price), sum: formatMad(days * price) });
  }

  function placeOf(row: PayLine) {
    const place = row.tranche || t('msg.wholeSite');
    return `${row.chantierName} · ${row.monthly ? t('siteOps.payMonthly') : place}`;
  }

  function lineStatus(row: PayLine) {
    if (row.status === 'paid') return t('rental.paid');
    if (row.status === 'partial') return t('status.partial');
    if (row.status === 'pending') return t('rental.toPay');
    return '—';
  }

  function payHistory(row: PayLine): HistRow[] {
    const events: Array<Omit<HistRow, 'after'>> = [];
    const days = [...(row.days || [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    days.forEach((day) => {
      const wage = money(day.days * day.rate);
      if (wage > 0) {
        events.push({
          key: `w-${day.id}`,
          date: day.date,
          kind: 'wage',
          amount: wage,
          note: day.task || undefined,
          pointageId: day.id,
          days: day.days,
          rate: day.rate,
        });
      }
      if (day.bonus > 0) {
        events.push({
          key: `b-${day.id}`,
          date: day.date,
          kind: 'bonus',
          amount: money(day.bonus),
          note: day.remark || undefined,
          pointageId: day.id,
        });
      }
      if (day.advance > 0) {
        events.push({
          key: `a-${day.id}`,
          date: day.date,
          kind: 'advance',
          amount: money(day.advance),
          note: day.remark || undefined,
          pointageId: day.id,
        });
      }
    });
    if (!days.length) {
      const wage = wageSum(row);
      if (wage > 0) events.push({ key: 'w-total', date: '', kind: 'wage', amount: wage });
    }
    (row.adjustments || []).forEach((adj) => {
      if (adj.kind !== 'bonus' && adj.kind !== 'advance') return;
      events.push({
        key: `x-${adj.id}`,
        date: adj.occurredAt || '',
        kind: adj.kind,
        amount: money(adj.amount),
        note: adj.remark || undefined,
        adjustmentId: adj.id,
      });
    });
    if (!days.length && !(row.adjustments || []).length) {
      if (bonusSum(row) > 0) events.push({ key: 'b-total', date: '', kind: 'bonus', amount: bonusSum(row) });
      if (row.advances > 0) events.push({ key: 'a-total', date: '', kind: 'advance', amount: money(row.advances) });
    }
    const pays = (row.payments || []).length
      ? row.payments!
      : (row.amountPaid > 0 ? [{ amount: row.amountPaid, paidAt: row.paidAt, paymentMode: row.paymentMode, remark: row.remark }] : []);
    pays.forEach((payment, i) => {
      events.push({
        key: `p-${payment.id || payment.paidAt || i}-${i}`,
        date: payment.paidAt || '',
        kind: 'payment',
        amount: money(payment.amount),
        mode: payment.paymentMode,
        note: payment.remark || undefined,
        paymentId: payment.id,
        recordId: payment.recordId,
      });
    });
    events.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      if (da !== db) return da - db;
      return HIST_RANK[a.kind] - HIST_RANK[b.kind];
    });
    let running = 0;
    return events.map((event) => {
      running = money(event.kind === 'advance' || event.kind === 'payment' ? running - event.amount : running + event.amount);
      return { ...event, after: running };
    });
  }

  function histKindLabel(kind: HistRow['kind']) {
    if (kind === 'wage') return t('siteOps.payEventWage');
    if (kind === 'advance') return t('siteOps.payEventAdvance');
    if (kind === 'bonus') return t('siteOps.payEventBonus');
    return t('siteOps.payEventPayment');
  }

  function openHistEdit(row: HistRow) {
    if (row.kind === 'payment' && !row.paymentId && !row.recordId) return;
    if ((row.kind === 'wage' || row.kind === 'advance' || row.kind === 'bonus') && !row.pointageId && !row.adjustmentId) return;
    setHistEdit({
      kind: row.kind,
      pointageId: row.pointageId,
      paymentId: row.paymentId,
      recordId: row.recordId,
      adjustmentId: row.adjustmentId,
      amount: String(row.amount),
      date: row.date ? String(row.date).slice(0, 10) : localISO(new Date()),
      mode: row.mode || 'especes',
      remark: row.note || '',
      days: String(row.days ?? 1),
      rate: String(row.rate ?? row.amount),
    });
  }

  function openHistAdd(kind: 'advance' | 'bonus') {
    if (!detail) return;
    const days = [...(detail.days || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setHistTab(kind);
    setHistEdit({
      kind,
      amount: '',
      date: days[0] ? String(days[0].date).slice(0, 10) : dateTo,
      mode: 'especes',
      remark: '',
      days: '1',
      rate: '0',
    });
  }

  async function saveHist(e: React.FormEvent) {
    e.preventDefault();
    if (!histEdit) return;
    const amount = Number(histEdit.amount);
    if (!Number.isFinite(amount) || amount < 0) return;
    if (histEdit.kind !== 'wage' && amount <= 0) {
      await appAlert(t('common.error'));
      return;
    }
    setHistBusy(true);
    try {
      if (histEdit.kind === 'payment' && histEdit.paymentId) {
        await api(`/chantiers/${chantierId}/payroll-payments/${histEdit.paymentId}`, {
          method: 'PUT',
          body: JSON.stringify({
            amount,
            paidAt: histEdit.date,
            paymentMode: histEdit.mode,
            remark: histEdit.remark.trim() || null,
          }),
        });
      } else if (histEdit.kind === 'payment' && histEdit.recordId) {
        await api(`/chantiers/${chantierId}/payroll-records/${histEdit.recordId}`, {
          method: 'PUT',
          body: JSON.stringify({
            amount,
            paidAt: histEdit.date,
            paymentMode: histEdit.mode,
            remark: histEdit.remark.trim() || null,
          }),
        });
      } else if ((histEdit.kind === 'bonus' || histEdit.kind === 'advance') && histEdit.adjustmentId) {
        await api(`/chantiers/${chantierId}/payroll-adjustments/${histEdit.adjustmentId}`, {
          method: 'PUT',
          body: JSON.stringify({
            amount,
            occurredAt: histEdit.date,
            remark: histEdit.remark.trim() || null,
          }),
        });
      } else if ((histEdit.kind === 'bonus' || histEdit.kind === 'advance') && !histEdit.pointageId && detail) {
        await api(`/chantiers/${chantierId}/payroll-adjustments`, {
          method: 'POST',
          body: JSON.stringify({
            workforceId: detail.workforceId,
            tranche: detail.tranche || '',
            kind: histEdit.kind,
            amount,
            occurredAt: histEdit.date,
            remark: histEdit.remark.trim() || null,
            periodYear: data?.periodYear,
            periodMonth: data?.periodMonth,
          }),
        });
      } else if (histEdit.kind === 'wage' && histEdit.pointageId) {
        const days = Number(histEdit.days);
        const rate = Number(histEdit.rate);
        if (!Number.isFinite(days) || days < 0 || days > 1 || !Number.isFinite(rate) || rate < 0) {
          await appAlert(t('common.error'));
          setHistBusy(false);
          return;
        }
        await api(`/chantiers/pointage/${histEdit.pointageId}`, {
          method: 'PUT',
          body: JSON.stringify({
            correct: true,
            dayValue: days,
            dayRate: rate,
          }),
        });
      } else if (histEdit.pointageId) {
        await api(`/chantiers/pointage/${histEdit.pointageId}`, {
          method: 'PUT',
          body: JSON.stringify({
            correct: true,
            ...(histEdit.kind === 'advance' ? { advance: amount } : { bonus: amount }),
          }),
        });
      }
      setHistEdit(null);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setHistBusy(false);
    }
  }

  async function deleteHist(row: HistRow) {
    const ok = await appConfirm(t('siteOps.payDeleteEvent'), { danger: true, title: t('common.delete') });
    if (!ok) return;
    setHistBusy(true);
    try {
      if (row.kind === 'payment' && row.paymentId) {
        await api(`/chantiers/${chantierId}/payroll-payments/${row.paymentId}`, { method: 'DELETE' });
      } else if (row.kind === 'payment' && row.recordId) {
        await api(`/chantiers/${chantierId}/payroll-records/${row.recordId}`, { method: 'DELETE' });
      } else if (row.adjustmentId && (row.kind === 'advance' || row.kind === 'bonus')) {
        await api(`/chantiers/${chantierId}/payroll-adjustments/${row.adjustmentId}`, { method: 'DELETE' });
      } else if (row.pointageId && (row.kind === 'advance' || row.kind === 'bonus')) {
        await api(`/chantiers/pointage/${row.pointageId}`, {
          method: 'PUT',
          body: JSON.stringify({
            correct: true,
            ...(row.kind === 'advance' ? { advance: 0 } : { bonus: 0 }),
          }),
        });
      }
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setHistBusy(false);
    }
  }

  function canEdit(row: HistRow) {
    if (row.kind === 'payment') return Boolean(row.paymentId || row.recordId);
    if (row.kind === 'wage') return Boolean(row.pointageId);
    if (row.kind === 'advance' || row.kind === 'bonus') return Boolean(row.pointageId || row.adjustmentId);
    return false;
  }

  function canDelete(row: HistRow) {
    if (row.kind === 'payment') return Boolean(row.paymentId || row.recordId);
    if (row.kind === 'advance' || row.kind === 'bonus') return Boolean(row.pointageId || row.adjustmentId);
    return false;
  }

  function modeLabel(mode?: string | null) {
    if (mode === 'virement') return t('fields.modeTransfer');
    if (mode === 'cheque') return t('fields.modeCheck');
    if (mode === 'especes') return t('fields.modeCash');
    return '';
  }

  function openPay(rows: PayLine[]) {
    const picked = rows.filter((row) => payMax(row) > 0);
    if (!picked.length) return;
    setPayTargets(picked);
    setPayMode('especes');
    setPayDate(localISO(new Date()));
    setPayRemark('');
    setPayAmount(String(picked.reduce((s, row) => s + payMax(row), 0)));
    setPayOpen(true);
  }

  async function confirmPay(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !payTargets.length) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const ceiling = payTargets.length === 1 ? payMax(payTargets[0]) : targetRest;
    if (amount > ceiling + 0.01) {
      await appAlert(t('siteOps.payOverSum', { amount: formatMad(ceiling) }));
      return;
    }
    if (payTargets.length > 1 && Math.abs(amount - targetRest) > 0.01) return;
    setPaying(true);
    const failed: string[] = [];
    for (const row of payTargets) {
      const lineAmount = payTargets.length === 1 ? amount : payMax(row);
      try {
        await api(`/chantiers/salaries/${row.workforceId}/pay`, {
          method: 'POST',
          body: JSON.stringify({
            periodYear: data.periodYear,
            periodMonth: data.periodMonth,
            amount: lineAmount,
            paymentMode: payMode,
            paidAt: payDate,
            remark: payRemark.trim() || undefined,
            ...(row.monthly ? {} : { chantierId, tranche: row.tranche }),
          }),
        });
      } catch (err) {
        failed.push(`${row.firstName} ${row.lastName} — ${err instanceof Error ? err.message : t('common.error')}`);
      }
    }
    setPaying(false);
    setPayOpen(false);
    load();
    if (failed.length) await appAlert(failed.join('\n'));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full max-w-sm">
          <MacSearch value={query} onChange={setQuery} placeholder={t('msg.searchWorker')} />
        </div>
        <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0" />
        <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0" />
        <Btn
          className="ml-auto"
          icon={Banknote}
          disabled={!payableSelected.length}
          onClick={() => openPay(payableSelected)}
        >
          {t('actions.pay')}
        </Btn>
      </div>

      <Tabs
        mac
        active={payFilter}
        onChange={(id) => setPayFilter(id as '' | 'a_payer' | 'paye' | 'partiel')}
        tabs={[
          { id: '', label: t('common.all') },
          { id: 'a_payer', label: t('rental.toPay') },
          { id: 'paye', label: t('rental.paid') },
          { id: 'partiel', label: t('status.partial') },
        ]}
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard title={t('siteOps.payDays')} value={shownTotals.totalDays.toFixed(2)} icon={Clock} compact />
        <KpiCard title={t('siteOps.payAdvances')} value={formatMad(shownTotals.advances)} icon={Wallet} compact />
        <KpiCard title={t('columns.paid')} value={formatMad(shownTotals.amountPaid)} icon={Banknote} compact />
        <KpiCard title={t('siteOps.payGlobalRemaining')} value={formatMad(shownTotals.remaining)} icon={Banknote} tone="coral" compact />
      </div>

      {loading ? (
        <p className="py-6 text-center text-[12px] text-gic-muted">{t('common.loading')}</p>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-gic-muted">{t('msg.emptyAttendanceOnSite')}</p>
      ) : (
        <TableWrap mac>
          <thead>
            <tr>
              <SelectAllTh selection={selection} rows={visible.filter((row) => restOf(row) > 0)} />
              <Th mac>{scope === 'drivers' ? t('pages.drivers') : t('columns.worker')}</Th>
              <Th mac>{t('siteOps.payPlace')}</Th>
              <Th mac>{t('siteOps.payDays')}</Th>
              <Th mac>{t('siteOps.payCalc')}</Th>
              <Th mac>{t('siteOps.payAdvances')}</Th>
              <Th mac>{t('columns.netDue')}</Th>
              <Th mac>{t('columns.paid')}</Th>
              <Th mac>{t('siteOps.payRemaining')}</Th>
              <Th mac>{t('columns.status')}</Th>
              <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="cursor-pointer hover:bg-black/[0.02]" onClick={() => setDetail(row)}>
                <SelectTd selection={selection} row={row} />
                <Td mac>
                  <Link to={workforceDetailPathForCategory(row.category, row.workforceId)} className="mac-table-ref">
                    {row.firstName} {row.lastName}
                  </Link>
                  {row.category && <span className="block text-[10px] text-gic-muted">{row.category}</span>}
                </Td>
                <Td mac>{placeOf(row)}</Td>
                <Td mac>{row.monthly ? '—' : row.totalDays.toFixed(2)}</Td>
                <Td mac>{formatMad(wageSum(row))}</Td>
                <Td mac>{formatMad(row.advances)}</Td>
                <Td mac>{formatMad(dueOf(row))}</Td>
                <Td mac>{formatMad(row.amountPaid)}</Td>
                <Td mac className="font-medium">{restOf(row) > 0 ? formatMad(restOf(row)) : '—'}</Td>
                <Td mac>
                  <span className={`mac-chip ${row.status === 'paid' ? 'mac-chip-green' : row.status === 'partial' ? 'mac-chip-orange' : 'mac-chip-blue'}`}>
                    {lineStatus(row)}
                  </span>
                  {row.paidAt && (
                    <span className="mt-0.5 block text-[10px] text-gic-muted">
                      {formatDate(row.paidAt)}{modeLabel(row.paymentMode) ? ` · ${modeLabel(row.paymentMode)}` : ''}
                    </span>
                  )}
                </Td>
                <Td mac className="mac-td-actions">
                  {payMax(row) > 0 && (
                    <Btn
                      variant="secondary"
                      icon={Banknote}
                      className="!py-1 !px-2 !text-[11px] !h-7 !bg-[#e9f8ee] !text-[#248a3d] hover:!bg-[#dff3e6]"
                      onClick={(e) => { e.stopPropagation(); openPay([row]); }}
                    >
                      {t('actions.pay')}
                    </Btn>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="mac-td-select" />
              <Td mac>{t('siteOps.payLineTotal')}</Td>
              <Td mac />
              <Td mac>{shownTotals.totalDays.toFixed(2)}</Td>
              <Td mac>{formatMad(visible.reduce((sum, row) => sum + wageSum(row), 0))}</Td>
              <Td mac>{formatMad(shownTotals.advances)}</Td>
              <Td mac>{formatMad(shownTotals.netDue)}</Td>
              <Td mac>{formatMad(shownTotals.amountPaid)}</Td>
              <Td mac>
                {formatMad(shownTotals.remaining)}
                <span className="mt-0.5 block text-[10px] font-normal text-gic-muted">{t('siteOps.payGlobalRemaining')}</span>
              </Td>
              <Td mac />
              <td className="mac-td-actions" />
            </tr>
          </tfoot>
        </TableWrap>
      )}

      <Modal
        open={!!detail}
        size="xl"
        title={detail ? `${detail.firstName} ${detail.lastName} — ${t('actions.payment')}` : ''}
        onClose={() => { setDetail(null); setHistTab('in'); setHistEdit(null); }}
        footer={
          <>
            <Btn variant="secondary" onClick={() => { setDetail(null); setHistTab('in'); setHistEdit(null); }}>{t('common.close')}</Btn>
            {detail && restOf(detail) > 0.01 && (
              <Btn icon={Banknote} onClick={() => openPay([detail])}>
                {t('actions.pay')}
              </Btn>
            )}
          </>
        }
      >
        {detail && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2">
                <p className="text-[12px]"><span className="text-gic-muted">{t('siteOps.payPlace')} : </span>{placeOf(detail)}</p>
                <p className="text-[12px]"><span className="text-gic-muted">{t('siteOps.payTask')} : </span>{detail.task || detail.category || '—'}</p>
              </div>
              <span className={`mac-chip ${restOf(detail) <= 0.01 && dueOf(detail) > 0 ? 'mac-chip-green' : detail.amountPaid > 0 || detail.advances > 0 ? 'mac-chip-orange' : 'mac-chip-blue'}`}>
                {restOf(detail) <= 0.01 && dueOf(detail) > 0 ? t('rental.paid') : detail.amountPaid > 0 || detail.advances > 0 ? t('status.partial') : t('rental.toPay')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard title={t('siteOps.payDays')} value={detail.monthly ? '—' : detail.totalDays.toFixed(2)} icon={Clock} compact />
              <KpiCard title={t('siteOps.payEventWage')} value={formatMad(wageSum(detail))} icon={Wallet} compact />
              <KpiCard title={t('columns.bonus')} value={formatMad(bonusSum(detail))} icon={Gift} compact />
              <KpiCard title={t('siteOps.payAdvances')} value={formatMad(detail.advances)} icon={Wallet} compact />
              <KpiCard title={t('columns.paid')} value={formatMad(detail.amountPaid)} icon={Banknote} compact />
              <KpiCard title={t('siteOps.payRemaining')} value={formatMad(restOf(detail))} icon={Banknote} tone="coral" compact />
            </div>
            <div className="rounded-xl border border-gic-border bg-[#fbfbfd] px-3 py-2">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gic-muted">{t('siteOps.payHistory')}</p>
              {(() => {
                const hist = payHistory(detail);
                const inKinds = (row: HistRow) => row.kind === 'wage' || row.kind === 'bonus';
                const filtered =
                  histTab === 'in' ? hist.filter(inKinds) : hist.filter((row) => row.kind === histTab);
                const countOf = (kind: HistKind) =>
                  kind === 'in' ? hist.filter(inKinds).length : hist.filter((row) => row.kind === kind).length;
                const tabLabel = (id: HistKind, label: string) => `${label} (${countOf(id)})`;
                const canAdd = true;
                return (
                  <>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <Tabs
                        mac
                        className="mb-0 min-w-0 flex-1"
                        active={histTab}
                        onChange={(id) => setHistTab(id as HistKind)}
                        tabs={[
                          { id: 'in', label: tabLabel('in', t('siteOps.payHistoryIn')) },
                          { id: 'advance', label: tabLabel('advance', t('siteOps.payEventAdvance')) },
                          { id: 'wage', label: tabLabel('wage', t('siteOps.payEventWage')) },
                          { id: 'bonus', label: tabLabel('bonus', t('siteOps.payEventBonus')) },
                          { id: 'payment', label: tabLabel('payment', t('siteOps.payEventPayment')) },
                        ]}
                      />
                      {canAdd && (
                        <div className="flex shrink-0 gap-1">
                          <MacActionBtn icon={Wallet} tone="orange" title={t('siteOps.payAddAdvance')} onClick={() => openHistAdd('advance')} />
                          <MacActionBtn icon={Gift} tone="blue" title={t('siteOps.payAddBonus')} onClick={() => openHistAdd('bonus')} />
                        </div>
                      )}
                    </div>
                    {filtered.length === 0 ? (
                      <p className="text-[12px] text-gic-muted">{t('siteOps.payHistoryEmpty')}</p>
                    ) : (
                      <TableWrap mac>
                        <thead>
                          <tr>
                            <Th mac>{t('columns.date')}</Th>
                            <Th mac>{t('columns.type')}</Th>
                            <Th mac>{t('columns.amount')}</Th>
                            <Th mac>{t('siteOps.payAfter')}</Th>
                            <Th mac>{t('fields.remark')}</Th>
                            <th className="mac-th mac-th-actions" />
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((row) => (
                            <tr key={row.key}>
                              <Td mac>{row.date ? formatDate(row.date) : '—'}</Td>
                              <Td mac>
                                <span className={`mac-chip ${row.kind === 'payment' ? 'mac-chip-green' : row.kind === 'advance' ? 'mac-chip-orange' : row.kind === 'bonus' ? 'mac-chip-blue' : 'mac-chip-gray'}`}>
                                  {histKindLabel(row.kind)}
                                </span>
                              </Td>
                              <Td mac className={row.kind === 'advance' || row.kind === 'payment' ? 'font-medium text-gic-coral' : 'font-medium'}>
                                {row.kind === 'advance' || row.kind === 'payment' ? '− ' : '+ '}{formatMad(row.amount)}
                              </Td>
                              <Td mac className="font-medium">{formatMad(row.after)}</Td>
                              <Td mac className="mac-table-muted">
                                {[row.mode ? modeLabel(row.mode) : '', row.note].filter(Boolean).join(' · ') || '—'}
                              </Td>
                              <Td mac className="mac-td-actions">
                                {(canEdit(row) || canDelete(row)) && (
                                  <div className="flex items-center justify-end gap-1">
                                    {canEdit(row) && (
                                      <MacActionBtn
                                        icon={Pencil}
                                        tone="orange"
                                        title={t('common.edit')}
                                        disabled={histBusy}
                                        onClick={() => openHistEdit(row)}
                                      />
                                    )}
                                    {canDelete(row) && (
                                      <MacActionBtn
                                        icon={Trash2}
                                        tone="red"
                                        title={t('common.delete')}
                                        disabled={histBusy}
                                        onClick={() => { void deleteHist(row); }}
                                      />
                                    )}
                                  </div>
                                )}
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </TableWrap>
                    )}
                  </>
                );
              })()}
            </div>
            {data && data.lines.filter((row) => row.workforceId === detail.workforceId && row.id !== detail.id).length > 0 && (
              <div>
                <p className="mb-1 text-[12px] font-semibold">{t('siteOps.payAlsoHere')}</p>
                <ul className="space-y-1">
                  {data.lines.filter((row) => row.workforceId === detail.workforceId && row.id !== detail.id).map((row) => (
                    <li key={row.id}>
                      <button type="button" className="text-left text-[12px] text-[#007aff] hover:underline" onClick={() => setDetail(row)}>
                        {row.tranche || t('msg.wholeSite')} · {row.task || row.category || '—'} · {row.totalDays.toFixed(2)} j · {t('siteOps.payRemaining')} {formatMad(restOf(row))}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={payOpen}
        title={t('siteOps.payValidateRest')}
        onClose={() => setPayOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPayOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="pay-site-lines" type="submit" disabled={paying}>
              {paying ? t('common.inProgress') : t('actions.confirmPayment')}
            </Btn>
          </>
        }
      >
        <form id="pay-site-lines" onSubmit={confirmPay} className="space-y-3">
          <p className="text-[12px] text-gic-muted">
            {t('siteOps.payValidateOf', {
              count: payTargets.length,
              amount: formatMad(single ? Number(payAmount) || 0 : targetRest),
            })}
          </p>
          <ul className="max-h-40 space-y-1 overflow-auto text-[12px]">
            {payTargets.map((row) => (
              <li key={row.id} className="flex justify-between gap-3">
                <span>
                  {row.firstName} {row.lastName} · {row.tranche || t('msg.wholeSite')}
                </span>
                <span className="shrink-0 font-medium">{formatMad(payMax(row))}</span>
              </li>
            ))}
          </ul>
          <Input
            label={t('fields.amountMad')}
            type="number"
            min="0"
            step="0.01"
            max={single ? payMax(single) : targetRest}
            value={single ? payAmount : String(targetRest)}
            onChange={(e) => {
              if (!single) return;
              const next = Number(e.target.value);
              const cap = payMax(single);
              if (e.target.value === '' || !Number.isFinite(next)) {
                setPayAmount(e.target.value);
                return;
              }
              setPayAmount(next > cap ? String(cap) : e.target.value);
            }}
            disabled={!single}
            required
          />
          <div className="w-40">
            <p className="mb-1 text-[11px] font-medium text-gic-muted">{t('columns.date')}</p>
            <MacDateInput value={payDate} onChange={setPayDate} placeholder={t('columns.date')} />
          </div>
          <Select label={t('fields.mode')} value={payMode} onChange={(e) => setPayMode(e.target.value)}>
            <option value="especes">{t('fields.modeCash')}</option>
            <option value="virement">{t('fields.modeTransfer')}</option>
            <option value="cheque">{t('fields.modeCheck')}</option>
          </Select>
          <Textarea label={t('fields.remark')} value={payRemark} onChange={(e) => setPayRemark(e.target.value)} rows={2} />
          <p className="text-[11px] text-gic-muted">{t('msg.debitBalanceHint')}</p>
        </form>
      </Modal>

      <Modal
        open={!!histEdit}
            title={histEdit ? `${Number(histEdit.amount) > 0 ? t('common.edit') : t('common.add')} — ${histKindLabel(histEdit.kind)}` : ''}
        onClose={() => setHistEdit(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setHistEdit(null)}>{t('common.cancel')}</Btn>
            <Btn form="pay-hist-edit" type="submit" disabled={histBusy}>
              {histBusy ? t('common.inProgress') : t('common.save')}
            </Btn>
          </>
        }
      >
        {histEdit && (
          <form id="pay-hist-edit" onSubmit={saveHist} className="space-y-3">
            {histEdit.kind === 'wage' ? (
              <>
                <Input
                  label={t('siteOps.payDays')}
                  type="number"
                  min="0"
                  max="1"
                  step="0.25"
                  value={histEdit.days}
                  onChange={(e) => setHistEdit({ ...histEdit, days: e.target.value })}
                  required
                />
                <Input
                  label={t('columns.dailyRateMad')}
                  type="number"
                  min="0"
                  step="0.01"
                  value={histEdit.rate}
                  onChange={(e) => setHistEdit({ ...histEdit, rate: e.target.value })}
                  required
                />
                <p className="text-[12px] font-medium">
                  {formulaOf(Number(histEdit.days) || 0, Number(histEdit.rate) || 0)}
                </p>
              </>
            ) : (
              <>
                <Input
                  label={t('fields.amountMad')}
                  type="number"
                  min="0"
                  step="0.01"
                  value={histEdit.amount}
                  onChange={(e) => setHistEdit({ ...histEdit, amount: e.target.value })}
                  required
                />
                {(histEdit.kind === 'bonus' || histEdit.kind === 'advance') && !histEdit.pointageId && (
                  <>
                    <div className="w-40">
                      <p className="mb-1 text-[11px] font-medium text-gic-muted">{t('columns.date')}</p>
                      <MacDateInput value={histEdit.date} onChange={(value) => setHistEdit({ ...histEdit, date: value })} placeholder={t('columns.date')} />
                    </div>
                    <Textarea label={t('fields.remark')} value={histEdit.remark} onChange={(e) => setHistEdit({ ...histEdit, remark: e.target.value })} rows={2} />
                  </>
                )}
              </>
            )}
            {histEdit.kind === 'payment' && (
              <>
                <div className="w-40">
                  <p className="mb-1 text-[11px] font-medium text-gic-muted">{t('columns.date')}</p>
                  <MacDateInput value={histEdit.date} onChange={(value) => setHistEdit({ ...histEdit, date: value })} placeholder={t('columns.date')} />
                </div>
                <Select label={t('fields.mode')} value={histEdit.mode} onChange={(e) => setHistEdit({ ...histEdit, mode: e.target.value })}>
                  <option value="especes">{t('fields.modeCash')}</option>
                  <option value="virement">{t('fields.modeTransfer')}</option>
                  <option value="cheque">{t('fields.modeCheck')}</option>
                </Select>
                <Textarea label={t('fields.remark')} value={histEdit.remark} onChange={(e) => setHistEdit({ ...histEdit, remark: e.target.value })} rows={2} />
              </>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
