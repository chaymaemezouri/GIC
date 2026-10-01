import { useState } from 'react';
import { api, formatDate, formatMad } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { useI18n } from '../i18n/I18nContext';
import { Btn, Input, Select } from './ui';

export type SubPayment = { id: string; amount: number; kind: string; paymentMode?: string | null; date: string };
export type TaskSubcontract = {
  id: string;
  chantierId?: string;
  companyName: string;
  phone?: string | null;
  amount?: number | null;
  paidAmount?: number | null;
  scope?: string;
  phaseLabel?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  payments?: SubPayment[];
};

export type SubDraft = {
  mode: 'none' | 'task' | 'phases';
  companyName: string;
  phone: string;
  amount: string;
  startDate: string;
  endDate: string;
  phases: Record<string, { on: boolean; companyName: string; phone: string; amount: string; startDate: string; endDate: string }>;
};

function day(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

export function draftFromContracts(contracts: TaskSubcontract[], labels: string[]): SubDraft {
  const whole = contracts.find((item) => item.scope !== 'phase');
  const phases: SubDraft['phases'] = {};
  for (const label of labels) {
    const found = contracts.find((item) => item.scope === 'phase' && item.phaseLabel === label);
    phases[label] = {
      on: Boolean(found),
      companyName: found?.companyName || '',
      phone: found?.phone || '',
      amount: found?.amount != null ? String(found.amount) : '',
      startDate: day(found?.startDate),
      endDate: day(found?.endDate),
    };
  }
  if (whole) {
    return {
      mode: 'task',
      companyName: whole.companyName,
      phone: whole.phone || '',
      amount: whole.amount != null ? String(whole.amount) : '',
      startDate: day(whole.startDate),
      endDate: day(whole.endDate),
      phases,
    };
  }
  const anyPhase = contracts.some((item) => item.scope === 'phase');
  return { mode: anyPhase ? 'phases' : 'none', companyName: '', phone: '', amount: '', startDate: '', endDate: '', phases };
}

export function TaskSubcontractEditor({
  draft,
  labels,
  contracts,
  onChange,
  onPaid,
}: {
  draft: SubDraft;
  labels: string[];
  contracts: TaskSubcontract[];
  onChange: (draft: SubDraft) => void;
  onPaid?: (updated: TaskSubcontract) => void;
}) {
  const { t } = useI18n();
  const set = (patch: Partial<SubDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className="space-y-3 rounded-lg border border-black/[0.08] p-3">
      <div>
        <p className="text-[13px] font-medium text-gic-ink">{t('detail.subcontractorsTitle')}</p>
        <p className="text-[11px] text-gic-muted mt-0.5">{t('detail.stModeHint')}</p>
      </div>
      <Select label={t('detail.subcontractScope')} value={draft.mode} onChange={(e) => set({ mode: e.target.value as SubDraft['mode'] })}>
        <option value="none">{t('detail.stStandard')}</option>
        <option value="task">{t('detail.stWholeTask')}</option>
        <option value="phases">{t('detail.stSomePhases')}</option>
      </Select>
      {draft.mode === 'task' && (
        <ContractFields
          companyName={draft.companyName}
          phone={draft.phone}
          amount={draft.amount}
          startDate={draft.startDate}
          endDate={draft.endDate}
          onChange={(patch) => set(patch)}
          contract={contracts.find((item) => item.scope !== 'phase')}
          onPaid={onPaid}
        />
      )}
      {draft.mode === 'phases' && labels.map((label) => {
        const row = draft.phases[label] || { on: false, companyName: '', phone: '', amount: '', startDate: '', endDate: '' };
        return (
          <div key={label} className="rounded-md border border-black/[0.06] p-2 space-y-2">
            <label className="flex items-center gap-2 text-[12px] font-medium">
              <input
                type="checkbox"
                checked={row.on}
                onChange={(e) => set({
                  phases: {
                    ...draft.phases,
                    [label]: { ...row, on: e.target.checked },
                  },
                })}
              />
              {t('detail.stPhaseOn')} · {label}
            </label>
            {row.on && (
              <ContractFields
                companyName={row.companyName}
                phone={row.phone}
                amount={row.amount}
                startDate={row.startDate}
                endDate={row.endDate}
                onChange={(patch) => set({ phases: { ...draft.phases, [label]: { ...row, ...patch } } })}
                contract={contracts.find((item) => item.scope === 'phase' && item.phaseLabel === label)}
                onPaid={onPaid}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContractFields({
  companyName,
  phone,
  amount,
  startDate,
  endDate,
  onChange,
  contract,
  onPaid,
}: {
  companyName: string;
  phone: string;
  amount: string;
  startDate: string;
  endDate: string;
  onChange: (patch: { companyName?: string; phone?: string; amount?: string; startDate?: string; endDate?: string }) => void;
  contract?: TaskSubcontract;
  onPaid?: (updated: TaskSubcontract) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Input label={t('fields.companyRequired')} required value={companyName} onChange={(e) => onChange({ companyName: e.target.value })} />
      <Input label={t('fields.phone')} value={phone} onChange={(e) => onChange({ phone: e.target.value })} />
      <Input label={t('detail.stAmount')} type="number" min="0" step="0.01" required value={amount} onChange={(e) => onChange({ amount: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <Input label={t('detail.stFrom')} type="date" value={startDate} onChange={(e) => onChange({ startDate: e.target.value })} />
        <Input label={t('detail.stTo')} type="date" value={endDate} onChange={(e) => onChange({ endDate: e.target.value })} />
      </div>
      {contract && <PaymentBox contract={contract} onPaid={onPaid} />}
    </div>
  );
}

export function PaymentBox({ contract, onPaid }: { contract: TaskSubcontract; onPaid?: (updated: TaskSubcontract) => void }) {
  const { t } = useI18n();
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState('avance');
  const [mode, setMode] = useState('virement');
  const paid = Number(contract.paidAmount || 0);
  const cap = Number(contract.amount || 0);
  const left = Math.max(0, cap - paid);

  async function pay() {
    if (!contract.chantierId) return;
    try {
      const updated = await api<TaskSubcontract>(`/chantiers/${contract.chantierId}/subcontractors/${contract.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), kind, paymentMode: mode }),
      });
      setAmount('');
      onPaid?.(updated);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <div className="sm:col-span-2 rounded-md bg-black/[0.02] p-2 space-y-2">
      <p className="text-[12px] font-medium">{t('detail.paymentsTitle')}</p>
      <p className="text-[11px] text-gic-muted">
        {t('siteOps.paid')} {formatMad(paid)} · {t('siteOps.moneyLeft')} {formatMad(left)}
        {contract.startDate ? ` · ${formatDate(contract.startDate)}` : ''}
        {contract.endDate ? ` → ${formatDate(contract.endDate)}` : ''}
      </p>
      <ul className="space-y-1 text-[12px]">
        {(contract.payments || []).map((pay) => (
          <li key={pay.id} className="flex justify-between gap-2">
            <span>{formatDate(pay.date)} · {pay.kind}</span>
            <span className="font-medium">{formatMad(pay.amount)}</span>
          </li>
        ))}
      </ul>
      {left > 0 && contract.chantierId && (
        <div className="grid gap-2 sm:grid-cols-4">
          <Input label={t('fields.amountMad')} type="number" min="0.01" max={left} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Select label={t('fields.mode')} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="especes">{t('fields.modeCash')}</option>
            <option value="virement">{t('fields.modeTransfer')}</option>
            <option value="cheque">{t('fields.modeCheck')}</option>
          </Select>
          <Select label={t('fields.operationType')} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="avance">{t('columns.advance')}</option>
            <option value="situation">{t('siteOps.progress')}</option>
            <option value="solde">{t('siteOps.moneyLeft')}</option>
          </Select>
          <div className="flex items-end"><Btn type="button" onClick={pay}>{t('detail.addAdvance')}</Btn></div>
        </div>
      )}
    </div>
  );
}
