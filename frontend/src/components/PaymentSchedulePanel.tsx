import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Calendar, Check, Circle, Plus, Trash2, Wand2 } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { api, formatDate, formatMad } from '../lib/api';
import { Btn, Card, Input, MacActionBtn, Modal, Select, StatusPill, TableWrap, Td, Th } from './ui';

type SchedulePayment = {
  id: string;
  amount: number;
  date: string;
  operationType?: string | null;
  receiptNo?: string;
};

type Schedule = {
  id: string;
  dueDate: string;
  amount: number;
  label?: string | null;
  status: string;
  paidAt?: string | null;
  remark?: string | null;
  payments?: SchedulePayment[];
};

type Props = {
  entityType: 'sales' | 'rentals';
  entityId: string;
  schedules: Schedule[];
  onReload: () => void;
  canEdit?: boolean;
  title?: string;
};

function roundMad(n: number) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function paidOf(s: Schedule) {
  if (s.payments?.length) return roundMad(s.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0));
  return s.status === 'paid' ? roundMad(s.amount) : 0;
}

function resteOf(s: Schedule) {
  return roundMad(Math.max(0, Number(s.amount || 0) - paidOf(s)));
}

function isOverdue(s: Schedule) {
  if (s.status === 'paid' || resteOf(s) <= 0) return false;
  if (s.status === 'overdue') return true;
  const due = new Date(s.dueDate);
  const now = new Date();
  return due.getFullYear() < now.getFullYear()
    || (due.getFullYear() === now.getFullYear() && due.getMonth() < now.getMonth())
    || (due < now && s.status !== 'paid');
}

export default function PaymentSchedulePanel({ entityType, entityId, schedules, onReload, canEdit = true, title }: Props) {
  const { t, lang } = useI18n();
  const [addOpen, setAddOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Schedule | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [payMode, setPayMode] = useState('especes');
  const [form, setForm] = useState({ dueDate: '', amount: '', label: '', remark: '' });
  const [genForm, setGenForm] = useState({ count: '12', startDate: new Date().toISOString().slice(0, 10) });

  const base = `/transactions/${entityType}/${entityId}/schedules`;
  const cardMode = entityType === 'sales';
  const heading = title || (entityType === 'sales' ? t('tabs.paymentBySchedule') : t('fields.paymentSchedule'));

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
  const paidTotal = sorted.reduce((a, s) => a + paidOf(s), 0);
  const totalPending = sorted.reduce((a, s) => a + resteOf(s), 0);

  function monthTitle(dueDate: string, label?: string | null) {
    if (label && label.trim()) return label.trim();
    const d = new Date(dueDate);
    const locale = lang === 'ar' ? 'ar-MA' : 'fr-MA';
    const s = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function previousUnpaid(s: Schedule) {
    const idx = sorted.findIndex((row) => row.id === s.id);
    if (idx <= 0) return null;
    return sorted.slice(0, idx).find((row) => row.status !== 'paid' && resteOf(row) > 0) || null;
  }

  function laterOpen(s: Schedule) {
    const idx = sorted.findIndex((row) => row.id === s.id);
    if (idx < 0) return null;
    return sorted.slice(idx + 1).find((row) => row.status === 'paid' || paidOf(row) > 0) || null;
  }

  function canPaySchedule(s: Schedule) {
    return !previousUnpaid(s);
  }

  function canCancelSchedule(s: Schedule) {
    return !laterOpen(s);
  }

  async function addSchedule(e: FormEvent) {
    e.preventDefault();
    try {
      await api(base, { method: 'POST', body: JSON.stringify(form) });
      setAddOpen(false);
      setForm({ dueDate: '', amount: '', label: '', remark: '' });
      onReload();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function generate(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`${base}/generate`, {
        method: 'POST',
        body: JSON.stringify({ count: Number(genForm.count), startDate: genForm.startDate }),
      });
      setGenOpen(false);
      onReload();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function markPaid(id: string) {
    await api(`/transactions/schedules/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'paid' }) });
    onReload();
  }

  function openSchedule(s: Schedule) {
    if (!canEdit) return;
    const fullyPaid = s.status === 'paid' || resteOf(s) <= 0;
    if (!fullyPaid && !canPaySchedule(s)) {
      const blocker = previousUnpaid(s);
      setError(t('rental.mustPayEarlierFirst', { month: blocker ? monthTitle(blocker.dueDate, blocker.label) : '' }));
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
    if (!canPaySchedule(selectedLive)) return;
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
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  async function payRemaining() {
    if (!selectedLive || busyId || selectedReste <= 0) return;
    if (!canPaySchedule(selectedLive)) return;
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

  async function clearSchedule() {
    if (!selectedLive || busyId) return;
    if (!canCancelSchedule(selectedLive)) {
      const blocker = laterOpen(selectedLive);
      setError(t('rental.mustUnpayLaterFirst', { month: blocker ? monthTitle(blocker.dueDate, blocker.label) : '' }));
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
    if (!canCancelSchedule(selectedLive)) {
      const blocker = laterOpen(selectedLive);
      setError(t('rental.mustUnpayLaterFirst', { month: blocker ? monthTitle(blocker.dueDate, blocker.label) : '' }));
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

  async function remove(id: string) {
    if (!await appConfirm(t('msg.confirmDeleteSchedule'))) return;
    await api(`/transactions/schedules/${id}`, { method: 'DELETE' });
    onReload();
  }

  const setupModals = (
    <>
      <Modal open={addOpen} title={t('fields.newInstallment')} onClose={() => setAddOpen(false)}
        footer={<Btn form="sched-add" type="submit">{t('common.save')}</Btn>}
      >
        <form id="sched-add" onSubmit={addSchedule} className="grid gap-3">
          <Input label={`${t('fields.dueDate')} *`} type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <Input label={`${t('fields.amountMad')} *`} type="number" required min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Input label={t('fields.label')} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <Input label={t('fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
        </form>
      </Modal>

      <Modal open={genOpen} title={t('fields.generateSchedule')} onClose={() => setGenOpen(false)}
        footer={<Btn form="sched-gen" type="submit">{t('actions.generate')}</Btn>}
      >
        <form id="sched-gen" onSubmit={generate} className="grid gap-3">
          <p className="text-[12px] text-gic-muted">
            {entityType === 'sales'
              ? t('msg.scheduleGenSalesHint')
              : t('msg.scheduleGenRentalHint')}
          </p>
          <Input label={t('fields.installmentCount')} type="number" min="1" max="60" value={genForm.count} onChange={(e) => setGenForm({ ...genForm, count: e.target.value })} />
          <Input label={t('fields.startDate')} type="date" value={genForm.startDate} onChange={(e) => setGenForm({ ...genForm, startDate: e.target.value })} />
        </form>
      </Modal>
    </>
  );

  if (cardMode) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-gic-ink tracking-tight">{heading}</h2>
            <p className="text-[12px] text-gic-muted mt-0.5">{t('msg.scheduleSalesOptionalHint')}</p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-1.5">
              <Btn variant="secondary" icon={Wand2} onClick={() => setGenOpen(true)}>{t('actions.generate')}</Btn>
              <Btn icon={Plus} onClick={() => setAddOpen(true)}>{t('common.add')}</Btn>
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
            <p className="text-[11px] text-gic-muted">{formatMad(totalPending)}</p>
          </div>
          <div className="rounded-xl border border-gic-border bg-white px-3 py-2.5">
            <p className="text-[10px] uppercase text-gic-muted tracking-wide">{t('rental.overdue')}</p>
            <p className="text-[15px] font-semibold text-gic-coral">{overdueCount}</p>
          </div>
          <div className="rounded-xl border border-gic-border bg-white px-3 py-2.5">
            <p className="text-[10px] uppercase text-gic-muted tracking-wide">{t('fields.scheduleRemaining')}</p>
            <p className="text-[15px] font-semibold text-gic-ink">{formatMad(totalPending)}</p>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gic-border py-10 text-center px-4">
            <p className="text-[12px] text-gic-muted mb-3">{t('msg.noSchedulesSales')}</p>
            {canEdit && (
              <div className="flex flex-wrap justify-center gap-2">
                <Btn icon={Wand2} onClick={() => setGenOpen(true)}>{t('actions.generate')}</Btn>
                <Btn variant="secondary" icon={Plus} onClick={() => setAddOpen(true)}>{t('common.add')}</Btn>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {sorted.map((s) => {
              const fullyPaid = s.status === 'paid' || resteOf(s) <= 0;
              const partial = !fullyPaid && paidOf(s) > 0;
              const overdueRow = isOverdue(s);
              const busy = busyId === s.id;
              const locked = !fullyPaid && !canPaySchedule(s);
              const tip = !canEdit
                ? undefined
                : locked
                  ? t('rental.mustPayEarlierFirst', { month: previousUnpaid(s) ? monthTitle(previousUnpaid(s)!.dueDate, previousUnpaid(s)!.label) : '' })
                  : t('rental.openMonthDetail');
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!canEdit || busy || locked}
                  onClick={() => openSchedule(s)}
                  className={[
                    'relative text-left rounded-xl border px-3 py-3 transition-all',
                    fullyPaid
                      ? 'border-gic-emerald/40 bg-gic-emerald-soft/40'
                      : partial
                        ? 'border-[#007aff]/35 bg-[#007aff]/[0.06]'
                        : overdueRow
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
                    {overdueRow && !fullyPaid && (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-gic-coral">{t('rental.overdueShort')}</span>
                    )}
                    {partial && (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-[#007aff]">{t('rental.advanceShort')}</span>
                    )}
                    {canEdit && (
                      <span
                        role="button"
                        tabIndex={0}
                        className="text-gic-muted hover:text-gic-coral"
                        title={t('common.delete')}
                        onClick={(e) => { e.stopPropagation(); remove(s.id); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); remove(s.id); } }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] font-semibold text-gic-ink leading-tight">{monthTitle(s.dueDate, s.label)}</p>
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
          title={selectedLive ? monthTitle(selectedLive.dueDate, selectedLive.label) : ''}
          onClose={() => setSelected(null)}
          footer={
            <>
              <Btn variant="secondary" onClick={() => setSelected(null)}>{t('common.close')}</Btn>
              {selectedLive && canEdit && paidOf(selectedLive) > 0 && canCancelSchedule(selectedLive) && (
                <Btn variant="secondary" onClick={clearSchedule} disabled={!!busyId}>{t('rental.clearMonthPayments')}</Btn>
              )}
              {selectedLive && canEdit && selectedReste > 0 && canPaySchedule(selectedLive) && (
                <Btn onClick={payRemaining} disabled={!!busyId}>{t('rental.payRemaining')}</Btn>
              )}
            </>
          }
        >
          {selectedLive && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-gic-border px-3 py-2">
                  <p className="text-[10px] uppercase text-gic-muted">{t('fields.amount')}</p>
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
                          {canEdit && canCancelSchedule(selectedLive) && (
                            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => removePayment(pay.id)} />
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {canEdit && selectedReste > 0 && canPaySchedule(selectedLive) && (
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

        {setupModals}
      </div>
    );
  }

  return (
    <Card padding={false}>
      <div className="px-4 py-3 border-b border-gic-border flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-gic-violet" />
          <h2 className="text-sm font-semibold">{heading}</h2>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Btn variant="secondary" icon={Wand2} onClick={() => setGenOpen(true)}>{t('actions.generate')}</Btn>
            <Btn icon={Plus} onClick={() => setAddOpen(true)}>{t('common.add')}</Btn>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-4 gap-3 p-4 border-b border-gic-border/60 bg-gray-50/50">
        <div><p className="text-[10px] text-gic-muted uppercase">{t('status.pending')}</p><p className="font-semibold">{pendingCount}</p></div>
        <div><p className="text-[10px] text-gic-muted uppercase">{t('status.overdue')}</p><p className="font-semibold text-gic-coral">{overdueCount}</p></div>
        <div><p className="text-[10px] text-gic-muted uppercase">{t('fields.paidFeminine')}</p><p className="font-semibold text-gic-emerald">{paidCount}</p></div>
        <div><p className="text-[10px] text-gic-muted uppercase">{t('fields.scheduleRemaining')}</p><p className="font-semibold">{formatMad(totalPending)}</p></div>
      </div>

      {schedules.length === 0 ? (
        <p className="p-6 text-[12px] text-gic-muted">{t('msg.noSchedules')}</p>
      ) : (
        <TableWrap>
          <thead>
            <tr><Th>{t('fields.date')}</Th><Th>{t('fields.label')}</Th><Th>{t('fields.amount')}</Th><Th>{t('fields.status')}</Th>{canEdit && <Th>{t('common.actions')}</Th>}</tr>
          </thead>
          <tbody>
            {schedules.map((s) => {
              const overdueRow = isOverdue(s);
              const status = overdueRow ? 'overdue' : s.status;
              return (
                <tr key={s.id}>
                  <Td className="text-[11px]">{formatDate(s.dueDate)}</Td>
                  <Td>{s.label || '—'}</Td>
                  <Td className="font-medium">{formatMad(s.amount)}</Td>
                  <Td><StatusPill status={status === 'paid' ? 'soldée' : status === 'overdue' ? 'retard' : 'en_cours'} /></Td>
                  {canEdit && (
                    <Td>
                      <div className="flex gap-1">
                        {s.status !== 'paid' && (
                          <Btn variant="ghost" onClick={() => markPaid(s.id)} title={t('fields.markPaidFeminine')}>{t('fields.paidFeminineShort')}</Btn>
                        )}
                        <Btn variant="ghost" icon={Trash2} onClick={() => remove(s.id)} title={t('common.delete')} />
                      </div>
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      {setupModals}
    </Card>
  );
}
