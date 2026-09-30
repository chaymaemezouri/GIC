import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Clock, Wallet } from 'lucide-react';
import { api, formatDate, formatMad } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { CHAUFFEUR_CATEGORY, workforceDetailPathForCategory } from '../lib/workforceScope';
import { useRowSelection } from '../hooks/useRowSelection';
import { SelectAllTh, SelectTd } from './RowSelection';
import { Btn, Input, KpiCard, MacDateInput, MacSearch, Modal, Select, TableWrap, Tabs, Td, Textarea, Th } from './ui';
import { useI18n } from '../i18n/I18nContext';

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
  netDue: number;
  amountPaid: number;
  remaining: number;
  status: string;
  paymentMode?: string | null;
  paidAt?: string | null;
  task?: string;
  days?: PayDay[];
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
}: {
  chantierId: string;
  scope?: 'workers' | 'drivers';
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
      if (payFilter === 'a_payer') return row.remaining > 0;
      if (payFilter === 'paye') return row.status === 'paid';
      if (payFilter === 'partiel') return row.status === 'partial';
      return true;
    });
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => (
      `${row.firstName} ${row.lastName} ${row.tranche} ${row.chantierName} ${row.category || ''}`.toLowerCase().includes(needle)
    ));
  }, [data, query, payFilter]);

  const shownTotals = useMemo(() => visible.reduce(
    (s, row) => ({
      totalDays: s.totalDays + row.totalDays,
      advances: s.advances + row.advances,
      netDue: s.netDue + row.netDue,
      amountPaid: s.amountPaid + row.amountPaid,
      remaining: s.remaining + row.remaining,
    }),
    { totalDays: 0, advances: 0, netDue: 0, amountPaid: 0, remaining: 0 },
  ), [visible]);

  const payableSelected = selection.rows.filter((row) => row.remaining > 0);
  const targetRest = payTargets.reduce((s, row) => s + row.remaining, 0);
  const single = payTargets.length === 1 ? payTargets[0] : null;

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

  function modeLabel(mode?: string | null) {
    if (mode === 'virement') return t('fields.modeTransfer');
    if (mode === 'cheque') return t('fields.modeCheck');
    if (mode === 'especes') return t('fields.modeCash');
    return '';
  }

  function openPay(rows: PayLine[]) {
    const picked = rows.filter((row) => row.remaining > 0);
    if (!picked.length) return;
    setPayTargets(picked);
    setPayMode('especes');
    setPayDate(localISO(new Date()));
    setPayRemark('');
    setPayAmount(String(picked.reduce((s, row) => s + row.remaining, 0)));
    setPayOpen(true);
  }

  async function confirmPay(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !payTargets.length) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (payTargets.length === 1 && amount > payTargets[0].remaining + 0.01) return;
    if (payTargets.length > 1 && Math.abs(amount - targetRest) > 0.01) return;
    setPaying(true);
    const failed: string[] = [];
    for (const row of payTargets) {
      const lineAmount = payTargets.length === 1 ? amount : row.remaining;
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
              <SelectAllTh selection={selection} rows={visible.filter((row) => row.remaining > 0)} />
              <Th mac>{scope === 'drivers' ? t('pages.drivers') : t('columns.worker')}</Th>
              <Th mac>{t('siteOps.payPlace')}</Th>
              <Th mac>{t('siteOps.payDays')}</Th>
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
                <Td mac>{formatMad(row.advances)}</Td>
                <Td mac>{formatMad(row.netDue)}</Td>
                <Td mac>{formatMad(row.amountPaid)}</Td>
                <Td mac className="font-medium">{row.remaining > 0 ? formatMad(row.remaining) : '—'}</Td>
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
                  {row.remaining > 0 && (
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
        title={detail ? `${detail.firstName} ${detail.lastName} — ${t('siteOps.payWorkDetail')}` : ''}
        onClose={() => setDetail(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDetail(null)}>{t('common.close')}</Btn>
            {detail && detail.remaining > 0 && (
              <Btn icon={Banknote} onClick={() => { const row = detail; setDetail(null); openPay([row]); }}>
                {t('actions.pay')}
              </Btn>
            )}
          </>
        }
      >
        {detail && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <p className="text-[12px]"><span className="text-gic-muted">{t('siteOps.payPlace')} : </span>{placeOf(detail)}</p>
              <p className="text-[12px]"><span className="text-gic-muted">{t('siteOps.payTask')} : </span>{detail.task || detail.category || '—'}</p>
              <p className="text-[12px]"><span className="text-gic-muted">{t('columns.netDue')} : </span>{formatMad(detail.netDue)}</p>
              <p className="text-[12px]"><span className="text-gic-muted">{t('columns.paid')} : </span>{formatMad(detail.amountPaid)}</p>
              <p className="text-[12px] font-medium"><span className="text-gic-muted">{t('siteOps.payRemaining')} : </span>{formatMad(detail.remaining)}</p>
            </div>
            {(detail.days || []).length === 0 ? (
              <p className="py-4 text-center text-[12px] text-gic-muted">{t('pointageMgmt.emptyLines')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('columns.tranche')}</Th>
                    <Th mac>{t('siteOps.payTask')}</Th>
                    <Th mac>{t('siteOps.payDays')}</Th>
                    <Th mac>{t('columns.dailyRateMad')}</Th>
                    <Th mac>{t('columns.brut')}</Th>
                    <Th mac>{t('columns.advance')}</Th>
                    <Th mac>{t('columns.bonus')}</Th>
                    <Th mac>{t('columns.netDue')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.days || []).map((day) => (
                    <tr key={day.id}>
                      <Td mac><span className="mac-table-ref">{formatDate(day.date)}</span></Td>
                      <Td mac>{day.tranche || t('msg.wholeSite')}</Td>
                      <Td mac>
                        {day.task || '—'}
                        {day.remark && <span className="block text-[10px] text-gic-muted">{day.remark}</span>}
                      </Td>
                      <Td mac>{day.days.toFixed(2)}{day.hours ? <span className="block text-[10px] text-gic-muted">{day.hours.toFixed(1)} h</span> : null}</Td>
                      <Td mac>{formatMad(day.rate)}</Td>
                      <Td mac>{formatMad(day.brut)}</Td>
                      <Td mac>{formatMad(day.advance)}</Td>
                      <Td mac>{formatMad(day.bonus)}</Td>
                      <Td mac className="font-medium">{formatMad(day.net)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
            {data && data.lines.filter((row) => row.workforceId === detail.workforceId && row.id !== detail.id).length > 0 && (
              <div>
                <p className="mb-1 text-[12px] font-semibold">{t('siteOps.payAlsoHere')}</p>
                <ul className="space-y-1">
                  {data.lines.filter((row) => row.workforceId === detail.workforceId && row.id !== detail.id).map((row) => (
                    <li key={row.id}>
                      <button type="button" className="text-left text-[12px] text-[#007aff] hover:underline" onClick={() => setDetail(row)}>
                        {row.tranche || t('msg.wholeSite')} · {row.task || row.category || '—'} · {row.totalDays.toFixed(2)} j · {t('siteOps.payRemaining')} {formatMad(row.remaining)}
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
                <span>{row.firstName} {row.lastName} · {row.tranche || t('msg.wholeSite')}</span>
                <span className="shrink-0 font-medium">{formatMad(row.remaining)}</span>
              </li>
            ))}
          </ul>
          <Input
            label={t('fields.amountMad')}
            type="number"
            min="0"
            step="0.01"
            max={single ? single.remaining : undefined}
            value={single ? payAmount : String(targetRest)}
            onChange={(e) => setPayAmount(e.target.value)}
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
    </div>
  );
}
