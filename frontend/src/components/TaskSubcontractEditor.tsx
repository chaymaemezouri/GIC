import { useEffect, useState } from 'react';
import { api, formatDate, formatMad } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { useI18n } from '../i18n/I18nContext';
import { Btn, Input, Select } from './ui';

export type SubPayment = { id: string; amount: number; kind: string; paymentMode?: string | null; date: string; remark?: string | null };
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

const PHASE_TAG = /^\[phase:(.*?)\]\s*/;

export function paymentPhaseOf(pay: { remark?: string | null }) {
  const match = String(pay.remark || '').match(PHASE_TAG);
  return match ? match[1] : null;
}

export function withPhaseRemark(phaseLabel?: string | null, remark?: string | null) {
  const rest = String(remark || '').replace(PHASE_TAG, '').trim();
  if (!phaseLabel) return rest || null;
  return rest ? `[phase:${phaseLabel}] ${rest}` : `[phase:${phaseLabel}]`;
}

function day(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

export function emptyPhaseRow() {
  return { on: false, companyName: '', phone: '', amount: '', startDate: '', endDate: '' };
}

export function subcontractTotals(contracts: Array<{ amount?: number | null; paidAmount?: number | null }>) {
  const prix = contracts.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const avance = contracts.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0);
  return { prix, avance, reste: Math.max(0, prix - avance) };
}

export function draftFromContracts(contracts: TaskSubcontract[], labels: string[]): SubDraft {
  const whole = contracts.find((item) => item.scope !== 'phase');
  const phases: SubDraft['phases'] = {};
  for (const label of labels) {
    const found = contracts.find((item) => item.scope === 'phase' && item.phaseLabel === label);
    phases[label] = {
      on: Boolean(found) || Boolean(whole),
      companyName: found?.companyName || whole?.companyName || '',
      phone: found?.phone || whole?.phone || '',
      amount: found?.amount != null ? String(found.amount) : whole?.amount != null ? String(whole.amount) : '',
      startDate: day(found?.startDate || whole?.startDate),
      endDate: day(found?.endDate || whole?.endDate),
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
  return {
    mode: anyPhase ? 'phases' : 'none',
    companyName: '',
    phone: '',
    amount: '',
    startDate: '',
    endDate: '',
    phases,
  };
}

export function TaskSubcontractEditor({
  draft,
  labels,
  contracts,
  onChange,
  onPaid,
  hidePayments,
  chantierId: _chantierId,
}: {
  draft: SubDraft;
  labels: string[];
  contracts: TaskSubcontract[];
  onChange: (draft: SubDraft) => void;
  onPaid?: (updated: TaskSubcontract) => void;
  hidePayments?: boolean;
  chantierId?: string;
}) {
  const { t } = useI18n();
  const set = (patch: Partial<SubDraft>) => onChange({ ...draft, ...patch });

  function setMode(mode: SubDraft['mode']) {
    if (mode === 'task') {
      set({
        mode,
        phases: Object.fromEntries(labels.map((label) => {
          const row = draft.phases[label] || emptyPhaseRow();
          return [label, {
            ...row,
            on: true,
            companyName: draft.companyName || row.companyName,
            phone: draft.phone || row.phone,
            amount: row.amount || draft.amount,
            startDate: draft.startDate || row.startDate,
            endDate: draft.endDate || row.endDate,
          }];
        })),
      });
      return;
    }
    set({ mode });
  }

  return (
    <div className="space-y-3 rounded-lg border border-black/[0.08] p-3">
      <div>
        <p className="text-[13px] font-medium text-gic-ink">{t('detail.subcontractorsTitle')}</p>
        <p className="text-[11px] text-gic-muted mt-0.5">{t('detail.stModeHint')}</p>
      </div>
      <Select label={t('detail.subcontractScope')} value={draft.mode} onChange={(e) => setMode(e.target.value as SubDraft['mode'])}>
        <option value="none">{t('detail.stStandard')}</option>
        <option value="task">{t('detail.stWholeTask')}</option>
        <option value="phases">{t('detail.stSomePhases')}</option>
      </Select>
      {draft.mode === 'task' && (
        <div className="space-y-2">
          <ContractFields
            companyName={draft.companyName}
            phone={draft.phone}
            amount={draft.amount}
            startDate={draft.startDate}
            endDate={draft.endDate}
            extraNames={contracts.map((item) => item.companyName)}
            onChange={(patch) => {
              const next = { ...draft, ...patch };
              onChange({
                ...next,
                phases: Object.fromEntries(labels.map((label) => {
                  const row = draft.phases[label] || emptyPhaseRow();
                  return [label, {
                    ...row,
                    on: true,
                    companyName: patch.companyName ?? next.companyName,
                    phone: patch.phone ?? next.phone,
                    startDate: patch.startDate ?? next.startDate,
                    endDate: patch.endDate ?? next.endDate,
                    amount: row.amount || (patch.amount ?? next.amount),
                  }];
                })),
              });
            }}
          />
          {labels.length > 0 && (
            <p className="text-[11px] text-gic-muted">
              {t('detail.stTaskPhasesList')} : {labels.join(' · ')}
            </p>
          )}
        </div>
      )}
      {draft.mode === 'phases' && labels.length === 0 && (
        <p className="text-[12px] text-gic-muted">{t('detail.stNeedPhases')}</p>
      )}
      {draft.mode === 'phases' && labels.map((label) => {
        const row = draft.phases[label] || emptyPhaseRow();
        const phaseContract = contracts.find((item) => item.scope === 'phase' && item.phaseLabel === label);
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
                extraNames={contracts.map((item) => item.companyName)}
                onChange={(patch) => set({ phases: { ...draft.phases, [label]: { ...row, ...patch } } })}
                contract={hidePayments ? undefined : phaseContract}
                onPaid={onPaid}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CompanyPicker({
  companyName,
  phone,
  extraNames,
  onChange,
}: {
  companyName: string;
  phone: string;
  extraNames?: string[];
  onChange: (patch: { companyName?: string; phone?: string }) => void;
}) {
  const { t } = useI18n();
  const NEW = '__new__';
  const [firms, setFirms] = useState<{ companyName: string; phone?: string | null }[]>([]);
  const [choice, setChoice] = useState('');

  useEffect(() => {
    api<{ items: { companyName: string; phone?: string | null }[] }>('/entreprises')
      .then((res) => {
        const names = [...(res.items || [])];
        for (const name of extraNames || []) {
          if (name && !names.some((item) => item.companyName === name)) names.push({ companyName: name });
        }
        names.sort((a, b) => a.companyName.localeCompare(b.companyName, 'fr'));
        setFirms(names);
      })
      .catch(() => {
        const names = [...new Set(extraNames || [])].filter(Boolean).map((name) => ({ companyName: name }));
        setFirms(names);
      });
  }, []);

  useEffect(() => {
    const match = firms.find((item) => item.companyName === companyName);
    setChoice(companyName ? (match ? match.companyName : NEW) : '');
  }, [companyName, firms]);

  async function persistNew(name: string, nextPhone = phone) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const created = await api<{ companyName: string; phone?: string | null }>('/entreprises', {
        method: 'POST',
        body: JSON.stringify({ companyName: trimmed, phone: nextPhone || null }),
      });
      setFirms((prev) => {
        if (prev.some((item) => item.companyName === created.companyName)) return prev;
        return [...prev, created].sort((a, b) => a.companyName.localeCompare(b.companyName, 'fr'));
      });
    } catch {
      /* the name is still used on the contract */
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 sm:col-span-2">
      <Select
        label={t('detail.stPickCompany')}
        value={choice}
        onChange={(e) => {
          const next = e.target.value;
          setChoice(next);
          if (!next) {
            onChange({ companyName: '', phone: '' });
            return;
          }
          if (next === NEW) {
            onChange({ companyName: companyName && !firms.some((item) => item.companyName === companyName) ? companyName : '' });
            return;
          }
          const found = firms.find((item) => item.companyName === next);
          onChange({ companyName: next, phone: found?.phone || phone });
        }}
      >
        <option value="">{t('common.choose')}</option>
        {firms.map((firm) => (
          <option key={firm.companyName} value={firm.companyName}>{firm.companyName}</option>
        ))}
        <option value={NEW}>{t('detail.stNewCompany')}</option>
      </Select>
      {choice === NEW && (
        <Input
          label={t('fields.companyRequired')}
          required
          value={companyName}
          onChange={(e) => onChange({ companyName: e.target.value })}
          onBlur={(e) => persistNew(e.target.value)}
        />
      )}
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
  extraNames,
}: {
  companyName: string;
  phone: string;
  amount: string;
  startDate: string;
  endDate: string;
  onChange: (patch: { companyName?: string; phone?: string; amount?: string; startDate?: string; endDate?: string }) => void;
  contract?: TaskSubcontract;
  onPaid?: (updated: TaskSubcontract) => void;
  extraNames?: string[];
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <CompanyPicker companyName={companyName} phone={phone} extraNames={extraNames} onChange={onChange} />
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

export function PaymentBox({
  contract,
  onPaid,
  phaseLabel,
}: {
  contract: TaskSubcontract;
  onPaid?: (updated: TaskSubcontract) => void;
  phaseLabel?: string;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState('avance');
  const [mode, setMode] = useState('virement');
  const paidAll = Number(contract.paidAmount || 0);
  const cap = Number(contract.amount || 0);
  const left = Math.max(0, cap - paidAll);
  const history = (contract.payments || []).filter((pay) => !phaseLabel || paymentPhaseOf(pay) === phaseLabel || (!paymentPhaseOf(pay) && !phaseLabel));
  const paidOnPhase = history.reduce((sum, pay) => sum + Number(pay.amount || 0), 0);

  function kindText(value: string) {
    if (value === 'situation') return t('siteOps.progress');
    if (value === 'solde') return t('detail.stKindSolde');
    return t('columns.advance');
  }

  async function pay() {
    if (!contract.chantierId) return;
    try {
      const updated = await api<TaskSubcontract>(`/chantiers/${contract.chantierId}/subcontractors/${contract.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amount),
          kind,
          paymentMode: mode,
          phaseLabel: phaseLabel || undefined,
        }),
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
        {phaseLabel
          ? `${t('detail.stPaidOnPhase')} ${formatMad(paidOnPhase)} · ${t('detail.stRemaining')} ${formatMad(left)}`
          : `${t('siteOps.paid')} ${formatMad(paidAll)} · ${t('siteOps.moneyLeft')} ${formatMad(left)}`}
        {contract.startDate ? ` · ${formatDate(contract.startDate)}` : ''}
        {contract.endDate ? ` → ${formatDate(contract.endDate)}` : ''}
      </p>
      <ul className="space-y-1 text-[12px]">
        {history.length === 0 ? (
          <li className="text-gic-muted">{t('detail.stNoAdvanceYet')}</li>
        ) : history.map((pay) => (
          <li key={pay.id} className="flex justify-between gap-2">
            <span>{formatDate(pay.date)} · {kindText(pay.kind)}{pay.paymentMode ? ` · ${pay.paymentMode}` : ''}</span>
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
            <option value="solde">{t('detail.stKindSolde')}</option>
          </Select>
          <div className="flex items-end"><Btn type="button" onClick={pay}>{t('detail.addAdvance')}</Btn></div>
        </div>
      )}
    </div>
  );
}
