import { useMemo, useState, type FormEvent } from 'react';
import { Check, Circle, RefreshCw, Wand2 } from 'lucide-react';
import { api, formatMad } from '../lib/api';
import { Btn, Input, Modal } from './ui';
import { useI18n } from '../i18n/I18nContext';

export type MonthSchedule = {
  id: string;
  dueDate: string;
  amount: number;
  label?: string | null;
  status: string;
  paidAt?: string | null;
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

function isOverdue(s: MonthSchedule) {
  if (s.status === 'paid') return false;
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

  const paidCount = sorted.filter((s) => s.status === 'paid').length;
  const pendingCount = sorted.length - paidCount;
  const overdueCount = sorted.filter(isOverdue).length;
  const unpaidTotal = sorted.filter((s) => s.status !== 'paid').reduce((a, s) => a + Number(s.amount), 0);
  const paidTotal = sorted.filter((s) => s.status === 'paid').reduce((a, s) => a + Number(s.amount), 0);

  function monthTitle(dueDate: string) {
    const d = new Date(dueDate);
    const locale = lang === 'ar' ? 'ar-MA' : 'fr-MA';
    const s = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  async function toggle(s: MonthSchedule) {
    if (!canEdit || busyId) return;
    setBusyId(s.id);
    setError('');
    try {
      await api(`/transactions/schedules/${s.id}/toggle-paid`, {
        method: 'PUT',
        body: JSON.stringify({ operationType: 'especes' }),
      });
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
            const paid = s.status === 'paid';
            const overdue = isOverdue(s);
            const busy = busyId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                disabled={!canEdit || busy}
                onClick={() => toggle(s)}
                className={[
                  'relative text-left rounded-xl border px-3 py-3 transition-all',
                  paid
                    ? 'border-gic-emerald/40 bg-gic-emerald-soft/40'
                    : overdue
                      ? 'border-gic-coral/35 bg-gic-coral-soft/25'
                      : 'border-gic-border bg-white hover:border-[#007aff]/40 hover:bg-[#007aff]/[0.04]',
                  canEdit ? 'cursor-pointer' : 'cursor-default',
                  busy ? 'opacity-60' : '',
                ].join(' ')}
                title={paid ? t('rental.unmarkPaid') : t('rental.markPaid')}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span
                    className={[
                      'inline-flex h-6 w-6 items-center justify-center rounded-full border',
                      paid
                        ? 'border-gic-emerald bg-gic-emerald text-white'
                        : 'border-gic-border bg-white text-gic-muted',
                    ].join(' ')}
                  >
                    {paid ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                  </span>
                  {overdue && !paid && (
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-gic-coral">{t('rental.overdueShort')}</span>
                  )}
                </div>
                <p className="text-[12px] font-semibold text-gic-ink leading-tight">{monthTitle(s.dueDate)}</p>
                <p className={`text-[11px] mt-1 tabular-nums ${paid ? 'text-gic-emerald' : 'text-gic-muted'}`}>
                  {formatMad(s.amount)}
                </p>
                <p className="text-[10px] mt-0.5 text-gic-muted">
                  {paid ? t('rental.paid') : t('rental.unpaidLabel')}
                </p>
              </button>
            );
          })}
        </div>
      )}

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
