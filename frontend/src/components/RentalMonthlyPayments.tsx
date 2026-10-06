import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Circle, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { api, formatDate, formatMad } from '../lib/api';
import { Btn, Input, MacActionBtn, Modal, Select } from './ui';
import { useI18n } from '../i18n/I18nContext';

export type MonthPayment = {
  id: string;
  amount: number;
  date: string;
  operationType?: string | null;
  receiptNo?: string;
};

export type MonthSchedule = {
  id: string;
  dueDate: string;
  amount: number;
  label?: string | null;
  status: string;
  paidAt?: string | null;
  payments?: MonthPayment[];
};

type Props = {
  rentalId: string;
  monthlyRent: number;
  startDate?: string | null;
  endDate?: string | null;
  schedules: MonthSchedule[];
  onReload: () => void;
  canEdit?: boolean;
};

function roundMad(n: number) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function paidOf(s: MonthSchedule) {
  if (s.payments?.length) return roundMad(s.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0));
  return s.status === 'paid' ? roundMad(s.amount) : 0;
}

function resteOf(s: MonthSchedule) {
  return roundMad(Math.max(0, Number(s.amount || 0) - paidOf(s)));
}

function isOverdue(s: MonthSchedule) {
  if (s.status === 'paid' || resteOf(s) <= 0) return false;
  const due = new Date(s.dueDate);
  const now = new Date();
  return due.getFullYear() < now.getFullYear()
    || (due.getFullYear() === now.getFullYear() && due.getMonth() < now.getMonth());
}

export default function RentalMonthlyPayments({
  rentalId,
  monthlyRent,
  startDate,
  endDate,
  schedules,
  onReload,
  canEdit = true,
}: Props) {
  const { t, lang } = useI18n();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [selected, setSelected] = useState<MonthSchedule | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [payMode, setPayMode] = useState('especes');
  const [genForm, setGenForm] = useState({
    startDate: startDate ? String(startDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
    endDate: endDate ? String(endDate).slice(0, 10) : '',
    count: '12',
  });
  const [error, setError] = useState('');

  const sorted = useMemo(
    () => [...schedules].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [schedules],
  );

  const selectedLive = selected ? sorted.find((row) => row.id === selected.id) || selected : null;
  const selectedPaid = selectedLive ? paidOf(selectedLive) : 0;
  const selectedReste = selectedLive ? resteOf(selectedLive) : 0;

  useEffect(() => {
    if (!selectedLive) return;
    setAdvanceAmount(selectedReste > 0 ? String(selectedReste) : '');
  }, [selectedLive?.id, selectedReste]);

  const paidCount = sorted.filter((s) => s.status === 'paid' || resteOf(s) <= 0).length;
  const pendingCount = sorted.length - paidCount;
  const overdueCount = sorted.filter(isOverdue).length;
  const unpaidTotal = sorted.reduce((a, s) => a + resteOf(s), 0);
  const paidTotal = sorted.reduce((a, s) => a + paidOf(s), 0);

  function monthTitle(dueDate: string) {
    const d = new Date(dueDate);
    const locale = lang === 'ar' ? 'ar-MA' : 'fr-MA';
    const s = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function previousUnpaid(s: MonthSchedule) {
    const idx = sorted.findIndex((row) => row.id === s.id);
    if (idx <= 0) return null;
    return sorted.slice(0, idx).find((row) => row.status !== 'paid' && resteOf(row) > 0) || null;
  }

  function laterOpen(s: MonthSchedule) {
    const idx = sorted.findIndex((row) => row.id === s.id);
    if (idx < 0) return null;
    return sorted.slice(idx + 1).find((row) => row.status === 'paid' || paidOf(row) > 0) || null;
  }

  function canPayMonth(s: MonthSchedule) {
    return !previousUnpaid(s);
  }

  function canCancelMonth(s: MonthSchedule) {
    return !laterOpen(s);
  }

  function openMonth(s: MonthSchedule) {
    if (!canEdit) return;
    const fullyPaid = s.status === 'paid' || resteOf(s) <= 0;
    if (!fullyPaid && !canPayMonth(s)) {
      const blocker = previousUnpaid(s);
      setError(t('rental.mustPayEarlierFirst', { month: blocker ? monthTitle(blocker.dueDate) : '' }));
      return;
    }
    setError('');
    setSelected(s);
    setPayMode('especes');
    setAdvanceAmount(resteOf(s) > 0 ? String(resteOf(s)) : '');
  }

  async function addAdvance(e: FormEvent) {
    e.preventDefault();
    if (!selectedLive || busyId) return;
    if (!canPayMonth(selectedLive)) return;
    const amount = roundMad(Number(advanceAmount));
    if (!(amount > 0)) return;
    setBusyId(selectedLive.id);
    setError('');
    try {
      await api(`/transactions/schedules/${selectedLive.id}/advance`, {
        method: 'POST',
        body: JSON.stringify({ amount, operationType: payMode }),
      });
      onReload();
      setAdvanceAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  async function payRemaining() {
    if (!selectedLive || busyId || selectedReste <= 0) return;
    if (!canPayMonth(selectedLive)) return;
    setBusyId(selectedLive.id);
    setError('');
    try {
      await api(`/transactions/schedules/${selectedLive.id}/advance`, {
        method: 'POST',
        body: JSON.stringify({ amount: selectedReste, operationType: payMode }),
      });
      onReload();
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  async function clearMonth() {
    if (!selectedLive || busyId) return;
    if (!canCancelMonth(selectedLive)) {
      const blocker = laterOpen(selectedLive);
      setError(t('rental.mustUnpayLaterFirst', { month: blocker ? monthTitle(blocker.dueDate) : '' }));
      return;
    }
    setBusyId(selectedLive.id);
    setError('');
    try {
      await api(`/transactions/schedules/${selectedLive.id}/toggle-paid`, {
        method: 'PUT',
        body: JSON.stringify({ cancel: true }),
      });
      onReload();
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  async function removePayment(payId: string) {
    if (!selectedLive || busyId) return;
    if (!canCancelMonth(selectedLive)) {
      const blocker = laterOpen(selectedLive);
      setError(t('rental.mustUnpayLaterFirst', { month: blocker ? monthTitle(blocker.dueDate) : '' }));
      return;
    }
    setBusyId(selectedLive.id);
    setError('');
    try {
      await api(`/transactions/schedules/${selectedLive.id}/payments/${payId}`, { method: 'DELETE' });
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  async function syncMonths() {
    if (!canEdit || syncing) return;
    setSyncing(true);
    setError('');
    try {
      await api(`/transactions/rentals/${rentalId}/schedules/sync`, { method: 'POST' });
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSyncing(false);
    }
  }

  async function generate(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api(`/transactions/rentals/${rentalId}/schedules/generate`, {
        method: 'POST',
        body: JSON.stringify({
          startDate: genForm.startDate,
          endDate: genForm.endDate || undefined,
          count: genForm.endDate ? undefined : Number(genForm.count) || 12,
        }),
      });
      setGenOpen(false);
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-gic-ink tracking-tight">{t('rental.trackingTitle')}</h2>
          <p className="text-[12px] text-gic-muted mt-0.5">
            {t('rental.trackingHint')}
            {endDate ? '' : t('rental.trackingHintOpenEnded')}.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-1.5">
            <Btn variant="secondary" icon={RefreshCw} onClick={syncMonths} disabled={syncing}>
              {syncing ? t('rental.syncing') : t('rental.syncMonths')}
            </Btn>
            <Btn variant="secondary" icon={Wand2} onClick={() => setGenOpen(true)}>
              {t('rental.generatePeriod')}
            </Btn>
          </div>
        )}
      </div>

      {error && <p className="text-[12px] text-gic-coral">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl border border-gic-border bg-white px-3 py-2.5">
          <p className="text-[10px] uppercase text-gic-muted tracking-wide">{t('rental.paidPlural')}</p>
          <p className="text-[15px] font-semibold text-gic-emerald">{paidCount}</p>
          <p className="text-[11px] text-gic-muted">{formatMad(paidTotal)}</p>
        </div>
        <div className="rounded-xl border border-gic-border bg-white px-3 py-2.5">
          <p className="text-[10px] uppercase text-gic-muted tracking-wide">{t('rental.toPay')}</p>
          <p className="text-[15px] font-semibold text-gic-coral">{pendingCount}</p>
          <p className="text-[11px] text-gic-muted">{formatMad(unpaidTotal)}</p>
        </div>
        <div className="rounded-xl border border-gic-border bg-white px-3 py-2.5">
          <p className="text-[10px] uppercase text-gic-muted tracking-wide">{t('rental.overdue')}</p>
          <p className="text-[15px] font-semibold text-gic-coral">{overdueCount}</p>
        </div>
        <div className="rounded-xl border border-gic-border bg-white px-3 py-2.5">
          <p className="text-[10px] uppercase text-gic-muted tracking-wide">{t('rental.monthlyAmount')}</p>
          <p className="text-[15px] font-semibold text-gic-ink">{formatMad(monthlyRent)}</p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gic-border py-10 text-center">
          <p className="text-[12px] text-gic-muted mb-3">{t('rental.noMonths')}</p>
          {canEdit && (
            <Btn icon={Wand2} onClick={() => setGenOpen(true)}>{t('rental.generateMonths')}</Btn>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {sorted.map((s) => {
            const fullyPaid = s.status === 'paid' || resteOf(s) <= 0;
            const partial = !fullyPaid && paidOf(s) > 0;
            const overdue = isOverdue(s);
            const busy = busyId === s.id;
            const locked = !fullyPaid && !canPayMonth(s);
            const tip = !canEdit
              ? undefined
              : locked
                ? t('rental.mustPayEarlierFirst', { month: previousUnpaid(s) ? monthTitle(previousUnpaid(s)!.dueDate) : '' })
                : t('rental.openMonthDetail');
            return (
              <button
                key={s.id}
                type="button"
                disabled={!canEdit || busy || locked}
                onClick={() => openMonth(s)}
                className={[
                  'relative text-left rounded-xl border px-3 py-3 transition-all',
                  fullyPaid
                    ? 'border-gic-emerald/40 bg-gic-emerald-soft/40'
                    : partial
                      ? 'border-[#007aff]/35 bg-[#007aff]/[0.06]'
                      : overdue
                        ? 'border-gic-coral/35 bg-gic-coral-soft/25'
                        : 'border-gic-border bg-white hover:border-[#007aff]/40 hover:bg-[#007aff]/[0.04]',
                  canEdit && !locked ? 'cursor-pointer' : 'cursor-not-allowed',
                  busy || locked ? 'opacity-60' : '',
                ].join(' ')}
                title={tip}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span
                    className={[
                      'inline-flex h-6 w-6 items-center justify-center rounded-full border',
                      fullyPaid
                        ? 'border-gic-emerald bg-gic-emerald text-white'
                        : partial
                          ? 'border-[#007aff] bg-[#007aff] text-white'
                          : 'border-gic-border bg-white text-gic-muted',
                    ].join(' ')}
                  >
                    {fullyPaid || partial ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                  </span>
                  {overdue && !fullyPaid && (
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-gic-coral">{t('rental.overdueShort')}</span>
                  )}
                  {partial && (
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-[#007aff]">{t('rental.advanceShort')}</span>
                  )}
                </div>
                <p className="text-[12px] font-semibold text-gic-ink leading-tight">{monthTitle(s.dueDate)}</p>
                <p className={`text-[11px] mt-1 tabular-nums ${fullyPaid ? 'text-gic-emerald' : partial ? 'text-[#007aff]' : 'text-gic-muted'}`}>
                  {fullyPaid ? formatMad(s.amount) : partial ? `${t('rental.remaining')} ${formatMad(resteOf(s))}` : formatMad(s.amount)}
                </p>
                <p className="text-[10px] mt-0.5 text-gic-muted">
                  {fullyPaid
                    ? t('rental.paid')
                    : partial
                      ? `${t('rental.paid')} ${formatMad(paidOf(s))}`
                      : t('rental.unpaidLabel')}
                </p>
              </button>
            );
          })}
        </div>
      )}

      <Modal
        open={!!selectedLive}
        title={selectedLive ? monthTitle(selectedLive.dueDate) : ''}
        onClose={() => setSelected(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setSelected(null)}>{t('common.close')}</Btn>
            {selectedLive && canEdit && (selectedLive.status === 'paid' || paidOf(selectedLive) > 0) && canCancelMonth(selectedLive) && (
              <Btn variant="secondary" onClick={clearMonth} disabled={!!busyId}>{t('rental.clearMonthPayments')}</Btn>
            )}
            {selectedLive && canEdit && selectedReste > 0 && canPayMonth(selectedLive) && (
              <Btn onClick={payRemaining} disabled={!!busyId}>{t('rental.payRemaining')}</Btn>
            )}
          </>
        }
      >
        {selectedLive && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-gic-border px-3 py-2">
                <p className="text-[10px] uppercase text-gic-muted">{t('rental.monthlyAmount')}</p>
                <p className="text-[13px] font-semibold">{formatMad(selectedLive.amount)}</p>
              </div>
              <div className="rounded-lg border border-gic-border px-3 py-2">
                <p className="text-[10px] uppercase text-gic-muted">{t('rental.paid')}</p>
                <p className="text-[13px] font-semibold text-gic-emerald">{formatMad(selectedPaid)}</p>
              </div>
              <div className="rounded-lg border border-gic-border px-3 py-2">
                <p className="text-[10px] uppercase text-gic-muted">{t('rental.remaining')}</p>
                <p className="text-[13px] font-semibold text-gic-coral">{formatMad(selectedReste)}</p>
              </div>
            </div>

            <div>
              <p className="text-[12px] font-semibold text-gic-ink mb-2">{t('rental.monthHistory')}</p>
              {(selectedLive.payments || []).length === 0 ? (
                <p className="text-[12px] text-gic-muted">{t('rental.noAdvanceYet')}</p>
              ) : (
                <ul className="space-y-1.5 text-[12px]">
                  {(selectedLive.payments || []).map((pay) => (
                    <li key={pay.id} className="flex items-center justify-between gap-2 border-b border-black/[0.04] pb-1.5 last:border-0">
                      <span className="text-gic-muted">
                        {formatDate(pay.date)}
                        {pay.operationType ? ` · ${pay.operationType}` : ''}
                        {pay.receiptNo ? ` · ${pay.receiptNo}` : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="font-medium">{formatMad(pay.amount)}</span>
                        {canEdit && canCancelMonth(selectedLive) && (
                          <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => removePayment(pay.id)} />
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {canEdit && selectedReste > 0 && canPayMonth(selectedLive) && (
              <form onSubmit={addAdvance} className="grid gap-2 sm:grid-cols-3">
                <Input
                  label={t('rental.advanceAmount')}
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={selectedReste}
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  required
                />
                <Select label={t('fields.mode')} value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                  <option value="especes">{t('fields.modeCash')}</option>
                  <option value="virement">{t('fields.modeTransfer')}</option>
                  <option value="cheque">{t('fields.modeCheck')}</option>
                </Select>
                <div className="flex items-end">
                  <Btn type="submit" disabled={!!busyId} className="w-full">{t('rental.addAdvance')}</Btn>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={genOpen}
        title={t('rental.generateTitle')}
        onClose={() => setGenOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setGenOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="rent-gen-form" type="submit">{t('rental.generate')}</Btn>
          </>
        }
      >
        <form id="rent-gen-form" onSubmit={generate} className="grid gap-3">
          <p className="text-[12px] text-gic-muted">
            {t('rental.generateHint')}
          </p>
          <Input
            label={t('rental.startDateRequired')}
            type="date"
            required
            value={genForm.startDate}
            onChange={(e) => setGenForm({ ...genForm, startDate: e.target.value })}
          />
          <Input
            label={t('rental.endDateOptional')}
            type="date"
            value={genForm.endDate}
            onChange={(e) => setGenForm({ ...genForm, endDate: e.target.value })}
          />
          {!genForm.endDate && (
            <Input
              label={t('rental.monthCount')}
              type="number"
              min="1"
              max="60"
              value={genForm.count}
              onChange={(e) => setGenForm({ ...genForm, count: e.target.value })}
            />
          )}
        </form>
      </Modal>
    </div>
  );
}
