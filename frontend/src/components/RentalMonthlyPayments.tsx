import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Circle, Pencil, Printer, Trash2 } from 'lucide-react';
import { api, formatDate, formatMad, uploadForm } from '../lib/api';
import { fileUrl } from '../lib/photoUrl';
import { DocumentFileActions } from './DocumentScanner';
import { printPaymentReceipt, printPaymentsReceipt } from '../lib/printPayment';
import { Btn, Input, MacActionBtn, Modal, Select } from './ui';
import { useI18n } from '../i18n/I18nContext';

export type MonthPayment = {
  id: string;
  amount: number;
  date: string;
  operationType?: string | null;
  receiptNo?: string;
  proofFile?: string | null;
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
  receipt?: { reference?: string; firstName?: string; lastName?: string };
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
  monthlyRent,
  endDate,
  schedules,
  onReload,
  canEdit = true,
  receipt,
}: Props) {
  const { t, lang } = useI18n();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MonthSchedule | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [payMode, setPayMode] = useState('especes');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [editPayId, setEditPayId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editMode, setEditMode] = useState('especes');
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
    const locale = lang === 'ar' ? 'ar-MA' : lang === 'en' ? 'en-GB' : 'fr-MA';
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

  async function postMonthPayment(scheduleId: string, amount: number) {
    if (proofFile) {
      const fd = new FormData();
      fd.append('amount', String(amount));
      fd.append('operationType', payMode);
      fd.append('proof', proofFile);
      await uploadForm(`/transactions/schedules/${scheduleId}/advance`, fd);
      setProofFile(null);
      return;
    }
    await api(`/transactions/schedules/${scheduleId}/advance`, {
      method: 'POST',
      body: JSON.stringify({ amount, operationType: payMode }),
    });
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
      await postMonthPayment(selectedLive.id, amount);
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
      await postMonthPayment(selectedLive.id, selectedReste);
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

  function startEditPayment(pay: MonthPayment) {
    setEditPayId(pay.id);
    setEditAmount(String(pay.amount));
    setEditMode(pay.operationType || 'especes');
    setError('');
  }

  async function saveEditPayment(e: FormEvent) {
    e.preventDefault();
    if (!selectedLive || !editPayId || busyId) return;
    if (!canCancelMonth(selectedLive)) {
      const blocker = laterOpen(selectedLive);
      setError(t('rental.mustUnpayLaterFirst', { month: blocker ? monthTitle(blocker.dueDate) : '' }));
      return;
    }
    const current = (selectedLive.payments || []).find((p) => p.id === editPayId);
    if (!current) return;
    const amount = roundMad(Number(editAmount));
    const max = roundMad(Number(current.amount) + selectedReste);
    if (!(amount > 0) || amount > max + 0.01) {
      setError(`${t('rental.remaining')}: ${formatMad(max)}`);
      return;
    }
    setBusyId(selectedLive.id);
    setError('');
    try {
      await api(`/transactions/payments/${editPayId}`, {
        method: 'PUT',
        body: JSON.stringify({ amount, operationType: editMode }),
      });
      setEditPayId(null);
      onReload();
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

  const current = sorted.find((s) => s.status !== 'paid' && resteOf(s) > 0) || null;
  const paidMonths = sorted.filter((s) => s.id !== current?.id && (s.status === 'paid' || resteOf(s) <= 0));

  function printMonthReceipt(month: MonthSchedule, pay: MonthPayment) {
    return printPaymentReceipt({
      receiptNo: pay.receiptNo,
      date: pay.date,
      amount: pay.amount,
      operationType: pay.operationType,
      nature: month.label || monthTitle(month.dueDate),
      rental: {
        reference: receipt?.reference,
        client: { firstName: receipt?.firstName || '', lastName: receipt?.lastName || '' },
      },
    });
  }

  async function validateMonth(s: MonthSchedule) {
    if (!canEdit || busyId || resteOf(s) <= 0) return;
    if (!canPayMonth(s)) return;
    setBusyId(s.id);
    setError('');
    try {
      await postMonthPayment(s.id, resteOf(s));
      setSelected(null);
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-gic-ink tracking-tight">{t('rental.trackingTitle')}</h2>
          <p className="text-[12px] text-gic-muted mt-0.5">
            {t('rental.trackingHint')}
            {endDate ? '' : ` ${t('rental.trackingHintOpenEnded')}`}
          </p>
        </div>
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

      {!current ? (
        <div className="rounded-xl border border-dashed border-gic-border py-10 text-center">
          <p className="text-[12px] text-gic-muted">
            {sorted.length ? t('rental.monthsDone') : t('rental.noMonths')}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gic-border bg-white px-4 py-4 sm:max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gic-muted">{t('rental.currentMonth')}</p>
              <p className="text-[18px] font-semibold text-gic-ink mt-0.5">{monthTitle(current.dueDate)}</p>
              <p className="text-[13px] mt-1 tabular-nums text-gic-ink">{formatMad(current.amount)}</p>
              <p className="text-[12px] mt-0.5 text-gic-muted">
                {paidOf(current) > 0
                  ? `${t('rental.paid')} ${formatMad(paidOf(current))} · ${t('rental.remaining')} ${formatMad(resteOf(current))}`
                  : t('rental.unpaidLabel')}
                {isOverdue(current) ? ` · ${t('rental.overdueShort')}` : ''}
              </p>
            </div>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gic-border text-gic-muted">
              {paidOf(current) > 0 ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
            </span>
          </div>
          {canEdit && (
            <div className="mt-4 space-y-2">
              <div>
                <p className="mb-1 text-[11px] font-medium text-gic-muted">{t('fields.proofDocument')}</p>
                <DocumentFileActions
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                />
                {proofFile && <p className="mt-1 text-[11px] text-gic-ink">{proofFile.name}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
              <Btn onClick={() => validateMonth(current)} disabled={busyId === current.id}>
                {t('rental.validateMonth')}
              </Btn>
              <Btn variant="secondary" onClick={() => openMonth(current)}>
                {t('rental.openMonthDetail')}
              </Btn>
              </div>
            </div>
          )}
          <p className="mt-3 text-[11px] text-gic-muted">{t('rental.nextMonthHint')}</p>
        </div>
      )}

      <div className="rounded-xl border border-gic-border bg-white px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <p className="text-[13px] font-semibold text-gic-ink">{t('rental.paidReceipts')}</p>
            <p className="text-[11px] text-gic-muted mt-0.5">{t('rental.paidReceiptsHint')}</p>
          </div>
          {paidMonths.some((month) => (month.payments || []).some((pay) => pay.receiptNo)) && (
            <Btn
              variant="secondary"
              icon={Printer}
              onClick={() => printPaymentsReceipt({
                clientName: `${receipt?.firstName || ''} ${receipt?.lastName || ''}`.trim(),
                reference: receipt?.reference,
                lines: paidMonths.flatMap((month) =>
                  (month.payments || []).filter((pay) => pay.receiptNo).map((pay) => ({
                    receiptNo: pay.receiptNo,
                    date: pay.date,
                    amount: pay.amount,
                    operationType: pay.operationType,
                    nature: month.label || monthTitle(month.dueDate),
                    ref: receipt?.reference,
                    type: 'location',
                  })),
                ),
              })}
            >
              {t('actions.printAllReceipts')}
            </Btn>
          )}
        </div>
        {paidMonths.length === 0 ? (
          <p className="text-[12px] text-gic-muted">{t('rental.noPaidReceipts')}</p>
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {paidMonths.map((month) => {
              const receipts = (month.payments || []).filter((pay) => pay.receiptNo);
              return (
                <li key={month.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="text-[13px] font-medium text-gic-ink">{month.label || monthTitle(month.dueDate)}</p>
                    <p className="text-[11px] text-gic-muted">
                      {formatMad(month.amount)}
                      {receipts.length === 0 ? '' : ` · ${receipts.map((pay) => pay.receiptNo).join(', ')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(month.payments || []).filter((pay) => pay.proofFile).map((pay) => (
                      <a key={`proof-${pay.id}`} href={fileUrl(pay.proofFile || '')} className="text-[11px] text-[#007aff] hover:opacity-70">
                        {t('common.view')}
                      </a>
                    ))}
                    {receipts.map((pay) => (
                      <MacActionBtn
                        key={pay.id}
                        icon={Printer}
                        tone="gray"
                        title={t('actions.printReceipt')}
                        onClick={() => printMonthReceipt(month, pay)}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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
                    <li key={pay.id} className="border-b border-black/[0.04] pb-1.5 last:border-0">
                      {editPayId === pay.id ? (
                        <form onSubmit={saveEditPayment} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
                          <Input
                            label={t('rental.advanceAmount')}
                            type="number"
                            min="0.01"
                            step="0.01"
                            max={roundMad(Number(pay.amount) + selectedReste)}
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            required
                          />
                          <Select label={t('fields.mode')} value={editMode} onChange={(e) => setEditMode(e.target.value)}>
                            <option value="especes">{t('fields.modeCash')}</option>
                            <option value="virement">{t('fields.modeTransfer')}</option>
                            <option value="cheque">{t('fields.modeCheck')}</option>
                          </Select>
                          <div className="flex gap-1 pb-0.5">
                            <Btn type="submit" disabled={!!busyId}>{t('common.save')}</Btn>
                            <Btn type="button" variant="secondary" onClick={() => setEditPayId(null)}>{t('common.cancel')}</Btn>
                          </div>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-gic-muted">
                            {formatDate(pay.date)}
                            {pay.operationType ? ` · ${pay.operationType}` : ''}
                            {pay.receiptNo ? ` · ${pay.receiptNo}` : ''}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="font-medium">{formatMad(pay.amount)}</span>
                            {pay.proofFile && (
                              <a href={fileUrl(pay.proofFile)} className="text-[11px] text-[#007aff] hover:opacity-70">{t('common.view')}</a>
                            )}
                            {pay.receiptNo && (
                              <MacActionBtn icon={Printer} tone="gray" title={t('actions.printReceipt')} onClick={() => printMonthReceipt(selectedLive, pay)} />
                            )}
                            {canEdit && canCancelMonth(selectedLive) && (
                              <>
                                <MacActionBtn icon={Pencil} tone="orange" title={t('rental.editAdvance')} onClick={() => startEditPayment(pay)} />
                                <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => removePayment(pay.id)} />
                              </>
                            )}
                          </span>
                        </div>
                      )}
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
                <div className="sm:col-span-3">
                  <p className="mb-1 text-[11px] font-medium text-gic-muted">{t('fields.proofDocument')}</p>
                  <DocumentFileActions
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  />
                  {proofFile && <p className="mt-1 text-[11px] text-gic-ink">{proofFile.name}</p>}
                </div>
                <div className="flex items-end">
                  <Btn type="submit" disabled={!!busyId} className="w-full">{t('rental.addAdvance')}</Btn>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>

    </div>
  );
}
