import { useEffect, useState } from 'react';
import { Check, Flag, Play, ShieldCheck } from 'lucide-react';
import { api, formatDate } from '../lib/api';
import { appAlert } from '../lib/dialog';
import {
  getPhaseDefinition,
  nearestStage,
  phaseStatus,
  progressStatus,
  resolveTrackSteps,
  type TaskPhaseContext,
  type TrackStep,
} from '../lib/progressPhases';
import { Btn, Input, Modal, Select } from './ui';
import { PaymentBox, type TaskSubcontract } from './TaskSubcontractEditor';
import { useI18n } from '../i18n/I18nContext';

export { resolveStages, nearestStage, progressStatus, DEFAULT_PROGRESS_STAGES as PROGRESS_STAGES } from '../lib/progressPhases';

type Props = {
  percent: number;
  onChange?: (percent: number) => void;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  task?: TaskPhaseContext;
  onTaskUpdated?: () => void;
};

const STATUS_LABEL = {
  done: 'Terminée',
  current: 'En cours',
  pending: 'À faire',
} as const;

function stepTitle(step: TrackStep) {
  if (step.kind === 'start') return '0 % — Début';
  if (step.kind === 'validation') return '100 % — Validation finale';
  return `${step.percent} % — ${step.label}`;
}

export default function ProgressSteps({ percent, onChange, size = 'md', showLabel = true, task, onTaskUpdated }: Props) {
  const { t } = useI18n();
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const status = progressStatus(p);
  const interactive = typeof onChange === 'function';
  const sm = size === 'sm';
  const [popupStage, setPopupStage] = useState<number | null>(null);
  const customPhases = task?.phases;
  const track = resolveTrackSteps(customPhases);
  const stages = track.filter((s) => s.percent > 0).map((s) => s.percent);
  const validated = p >= 100;

  function openPhasePopup(stage: number) {
    if (!task) return;
    setPopupStage(stage);
  }

  const selectedPhase = popupStage != null ? getPhaseDefinition(popupStage, customPhases) : null;
  const selectedStep = popupStage != null ? track.find((s) => s.percent === popupStage) : null;
  const selectedStatus = popupStage != null ? phaseStatus(p, popupStage, [0, ...stages]) : null;
  const selectedIsValidation = selectedStep?.kind === 'validation';
  const selectedIsStart = selectedStep?.kind === 'start';

  return (
    <>
      <div className={`mac-steps${sm ? ' mac-steps-sm' : ''}`}>
        <div className="mac-steps-track" role="group" aria-label={`Avancement ${p} %`}>
          {track.map((step, i) => {
            const stage = step.percent;
            const isStart = step.kind === 'start';
            const isValidation = step.kind === 'validation';
            const reached = isStart ? true : p >= stage;
            const isCurrent = isStart
              ? p <= 0
              : isValidation
                ? p >= 100
                : nearestStage(p, stages) === stage && p > 0 && p < 100;
            const lineOn = i > 0 && p > track[i - 1].percent;
            return (
              <div key={`${step.kind}-${stage}`} className="mac-steps-item">
                {i > 0 && (
                  <button
                    type="button"
                    className={`mac-steps-line-btn${task ? ' mac-steps-line-interactive' : ''}`}
                    aria-label={task ? `Voir ${stepTitle(step)}` : undefined}
                    title={task ? stepTitle(step) : undefined}
                    onClick={() => task && openPhasePopup(stage)}
                    disabled={!task}
                  >
                    <span
                      className={`mac-steps-line${lineOn ? ` mac-steps-line-${validated ? 'done' : 'progress'}` : ''}`}
                      aria-hidden
                    />
                  </button>
                )}
                <div className="flex flex-col items-center shrink-0">
                <button
                  type="button"
                  disabled={!interactive && !task}
                  title={interactive ? `${stepTitle(step)} — cliquer pour fixer` : stepTitle(step)}
                  aria-label={stepTitle(step)}
                  aria-pressed={isStart ? p <= 0 : p >= stage}
                  className={[
                    'mac-steps-dot',
                    isValidation ? 'mac-steps-dot-validation' : '',
                    isStart && p <= 0 ? 'mac-steps-dot-current' : '',
                    isStart && p > 0 ? 'mac-steps-dot-done' : '',
                    isValidation && validated ? 'mac-steps-dot-validation-done' : '',
                    isValidation && !validated && isCurrent ? 'mac-steps-dot-validation-pending' : '',
                    !isStart && !isValidation && reached && status === 'done' ? 'mac-steps-dot-done' : '',
                    !isStart && !isValidation && reached && status !== 'done' ? 'mac-steps-dot-progress' : '',
                    !isStart && !isValidation && isCurrent && p < 100 ? 'mac-steps-dot-current' : '',
                    interactive || task ? 'mac-steps-dot-interactive' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => {
                    if (task && step.kind === 'phase') {
                      openPhasePopup(stage);
                      return;
                    }
                    if (interactive && onChange) {
                      if (isStart) {
                        onChange(0);
                        return;
                      }
                      if (nearestStage(p, stages) === stage && p >= stage) {
                        onChange(track[i - 1]?.percent ?? 0);
                      } else {
                        onChange(stage);
                      }
                    } else if (task) {
                      openPhasePopup(stage);
                    }
                  }}
                >
                  {isValidation ? (
                    validated ? <ShieldCheck size={sm ? 10 : 12} strokeWidth={2.5} /> : <Flag size={sm ? 9 : 11} strokeWidth={2.5} />
                  ) : (isStart && p > 0) || (!isStart && reached) ? (
                    <Check size={sm ? 9 : 11} strokeWidth={3} />
                  ) : null}
                </button>
                {step.kind === 'phase' && (() => {
                  const phaseSt = task?.subcontracts?.find((item) => item.scope === 'phase' && item.phaseLabel === step.label);
                  const taskSt = task?.subcontracts?.find((item) => item.scope !== 'phase');
                  if (!phaseSt && !taskSt) return null;
                  return <span className="mac-steps-st">{t('detail.stBadge')}</span>;
                })()}
                </div>
              </div>
            );
          })}
        </div>
        {showLabel && (
          <span className={`mac-steps-label mac-steps-label-${status}`}>
            {validated ? 'Validé 100 %' : status === 'progress' ? `${p} %` : '0 % — Début'}
          </span>
        )}
      </div>

      {task && popupStage != null && selectedPhase && (
        <Modal
          open
          size="lg"
          title={selectedStep?.kind === 'phase' ? `${selectedPhase.label}` : task.taskName}
          onClose={() => setPopupStage(null)}
          footer={<Btn variant="secondary" onClick={() => setPopupStage(null)}>Fermer</Btn>}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {task.tranche && <span className="mac-chip">{task.tranche}</span>}
              <span className="mac-chip mac-chip-gray">{task.taskName}</span>
              <span className={`mac-chip ${validated ? 'mac-chip-green' : 'mac-chip-orange'}`}>
                {selectedPhase.percent} %
              </span>
            </div>

            {/* Résumé sélection */}
            <div
              className={[
                'rounded-xl border p-4',
                selectedIsValidation
                  ? validated
                    ? 'border-[#34c759]/45 bg-[rgba(52,199,89,0.12)]'
                    : 'border-[#34c759]/30 bg-[rgba(52,199,89,0.06)]'
                  : selectedIsStart
                    ? 'border-black/[0.08] bg-black/[0.02]'
                    : 'border-[#007aff]/25 bg-[rgba(0,122,255,0.05)]',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gic-muted mb-1">
                    {selectedIsStart ? 'Point de départ' : selectedIsValidation ? 'Étape finale' : 'Phase de travail'}
                  </p>
                  <p className="text-[14px] font-semibold text-gic-ink flex items-center gap-2">
                    {selectedIsValidation && <ShieldCheck size={16} className="text-[#248a3d] shrink-0" />}
                    {selectedIsStart && <Play size={14} className="text-gic-muted shrink-0" />}
                    {selectedPhase.label}
                  </p>
                  <p className="text-[12px] text-gic-muted mt-0.5">
                    {selectedIsStart
                      ? 'Le lot commence ici — aucune phase validée'
                      : selectedIsValidation
                        ? 'Confirme que toutes les phases de travail sont terminées'
                        : `Étape intermédiaire · ${selectedPhase.percent} % du lot`}
                  </p>
                </div>
                {selectedStatus && (
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                    selectedIsValidation && validated
                      ? 'text-[#248a3d] bg-[rgba(52,199,89,0.18)]'
                      : selectedStatus === 'done'
                        ? 'text-[#248a3d] bg-[rgba(52,199,89,0.1)]'
                        : selectedStatus === 'current'
                          ? 'text-[#c93400] bg-[rgba(255,149,0,0.12)]'
                          : 'text-[#86868b] bg-black/[0.04]'
                  }`}>
                    {selectedIsValidation && validated ? 'Validé' : STATUS_LABEL[selectedStatus]}
                  </span>
                )}
              </div>
              {selectedPhase.description && (
                <p className="text-[12px] text-gic-muted leading-relaxed mt-2">{selectedPhase.description}</p>
              )}
              {selectedStatus && onChange && !selectedIsStart && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedStatus !== 'done' && (
                    <Btn type="button" onClick={() => onChange(popupStage!)}>Marquer la phase</Btn>
                  )}
                  {selectedStatus === 'done' && (
                    <Btn type="button" variant="secondary" onClick={() => {
                      const i = track.findIndex((s) => s.percent === popupStage);
                      onChange(track[i - 1]?.percent ?? 0);
                    }}>Revenir en arrière</Btn>
                  )}
                </div>
              )}
              {selectedStep?.kind === 'phase' && (
                <PhaseSubcontractPanel
                  task={task}
                  phaseLabel={selectedPhase.label}
                  onSaved={onTaskUpdated}
                />
              )}
              {selectedStatus === 'done' && task.updatedAt && (
                <p className="text-[10px] text-gic-muted mt-3 pt-3 border-t border-black/[0.06]">
                  Dernière mise à jour : {formatDate(task.updatedAt)}
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function toContract(item: NonNullable<TaskPhaseContext['subcontracts']>[number], chantierId?: string): TaskSubcontract {
  return {
    id: item.id || '',
    chantierId: item.chantierId || chantierId,
    companyName: item.companyName,
    phone: item.phone,
    amount: item.amount,
    paidAmount: item.paidAmount,
    progressPct: item.progressPct,
    scope: item.scope,
    phaseLabel: item.phaseLabel,
    startDate: item.startDate,
    endDate: item.endDate,
    payments: item.payments,
    follows: item.follows,
  };
}

function followForPhase(contract: TaskSubcontract, phaseLabel: string) {
  const follows = contract.follows || [];
  if (!follows.length) return null;
  return follows.find((f) => f.label === phaseLabel)
    || (contract.scope === 'phase' ? follows[0] : null);
}

function PhaseSubcontractPanel({
  task,
  phaseLabel,
  onSaved,
}: {
  task: TaskPhaseContext;
  phaseLabel: string;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const NEW = '__new__';
  const NONE = '__none__';
  const existing = task.subcontracts || [];
  const phaseContract = existing.find((item) => item.scope === 'phase' && item.phaseLabel === phaseLabel);
  const wholeContract = existing.find((item) => item.scope !== 'phase');
  const current = phaseContract || null;
  const [companies, setCompanies] = useState<string[]>([]);
  const [choice, setChoice] = useState(current ? current.companyName : wholeContract ? wholeContract.companyName : NONE);
  const [newName, setNewName] = useState('');
  const [amount, setAmount] = useState(current?.amount != null ? String(current.amount) : '');
  const [phone, setPhone] = useState(current?.phone || '');
  const [startDate, setStartDate] = useState(current?.startDate ? String(current.startDate).slice(0, 10) : '');
  const [endDate, setEndDate] = useState(current?.endDate ? String(current.endDate).slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [contract, setContract] = useState<TaskSubcontract | null>((current || wholeContract)?.id ? toContract((current || wholeContract)!, task.chantierId) : null);
  const [savingProgress, setSavingProgress] = useState(false);

  useEffect(() => {
    if (!task.chantierId) return;
    api<{ companyName: string }[]>(`/chantiers/${task.chantierId}/subcontractors`)
      .then((rows) => {
        const names = [...new Set([
          ...rows.map((row) => row.companyName),
          ...existing.map((row) => row.companyName),
        ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
        setCompanies(names);
      })
      .catch(() => setCompanies([...new Set(existing.map((row) => row.companyName).filter(Boolean))]));
  }, [task.chantierId, phaseLabel]);

  useEffect(() => {
    const found = existing.find((item) => item.scope === 'phase' && item.phaseLabel === phaseLabel);
    const whole = existing.find((item) => item.scope !== 'phase');
    setChoice(found ? found.companyName : whole ? whole.companyName : NONE);
    setNewName('');
    setAmount(found?.amount != null ? String(found.amount) : '');
    setPhone(found?.phone || whole?.phone || '');
    setStartDate(found?.startDate ? String(found.startDate).slice(0, 10) : '');
    setEndDate(found?.endDate ? String(found.endDate).slice(0, 10) : '');
    const bound = found || whole;
    setContract(bound?.id ? toContract(bound, task.chantierId) : null);
  }, [phaseLabel, task.progressId]);

  const optionNames = [...new Set([
    ...companies,
    ...existing.map((row) => row.companyName),
    current?.companyName || '',
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const stOn = choice !== NONE;
  const companyName = choice === NEW ? newName.trim() : choice === NONE ? '' : choice;
  const stFollow = contract ? followForPhase(contract, phaseLabel) : null;
  const stProgress = Math.max(0, Math.min(100, Math.round(Number(
    stFollow?.percent ?? (contract?.scope === 'phase' ? contract?.progressPct : 0) ?? 0,
  ))));

  async function setStProgress(percent: number) {
    if (!contract?.id || !contract.chantierId) return;
    setSavingProgress(true);
    try {
      const updated = stFollow
        ? await api<TaskSubcontract>(`/chantiers/${contract.chantierId}/subcontractors/${contract.id}/follows/${stFollow.id}`, {
          method: 'PUT',
          body: JSON.stringify({ percent }),
        })
        : await api<TaskSubcontract>(`/chantiers/${contract.chantierId}/subcontractors/${contract.id}`, {
          method: 'PUT',
          body: JSON.stringify({ progressPct: percent, status: percent >= 100 ? 'termine' : 'actif' }),
        });
      setContract(toContract({ ...updated, chantierId: contract.chantierId }, contract.chantierId));
      onSaved?.();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingProgress(false);
    }
  }

  async function save() {
    if (!task.progressId) return;
    if (stOn && !companyName) {
      await appAlert(t('fields.companyRequired'));
      return;
    }
    setSaving(true);
    try {
      const whole = existing.find((item) => item.scope !== 'phase');
      const otherPhases = existing.filter((item) => item.scope === 'phase' && item.phaseLabel !== phaseLabel);
      const allLabels = (task.phases || []).map((phase) => String(phase.label || '').trim()).filter(Boolean);
      const shareOf = (label: string, total: number) => {
        const pct = Number((task.phases || []).find((phase) => phase.label === label)?.percent || 0);
        const weight = allLabels.reduce((sum, name) => sum + Number((task.phases || []).find((phase) => phase.label === name)?.percent || 0), 0);
        if (weight > 0 && pct > 0) return Math.round((total * pct) / weight * 100) / 100;
        return allLabels.length ? Math.round((total / allLabels.length) * 100) / 100 : total;
      };
      const phases = otherPhases.map((item) => ({
        label: String(item.phaseLabel || ''),
        companyName: item.companyName,
        phone: item.phone || '',
        amount: Number(item.amount || 0),
        startDate: item.startDate || null,
        endDate: item.endDate || null,
      }));
      if (whole && Number(whole.paidAmount || 0) > 0 && otherPhases.length === 0) {
        if (!stOn) {
          await appAlert(t('detail.stCannotDropPaidTask'));
          return;
        }
        const updated = await api<TaskSubcontract[]>(`/chantiers/progress/${task.progressId}/subcontract`, {
          method: 'PUT',
          body: JSON.stringify({
            mode: 'task',
            task: { companyName, phone, amount: Number(amount || 0), startDate: startDate || null, endDate: endDate || null },
          }),
        });
        const saved = updated.find((item) => item.scope !== 'phase') || updated[0];
        setContract(saved ? toContract(saved, task.chantierId) : null);
        onSaved?.();
        return;
      }
      if (whole && otherPhases.length === 0) {
        for (const label of allLabels) {
          if (label === phaseLabel) continue;
          phases.push({
            label,
            companyName: whole.companyName,
            phone: whole.phone || '',
            amount: shareOf(label, Number(whole.amount || 0)),
            startDate: whole.startDate || null,
            endDate: whole.endDate || null,
          });
        }
      }
      if (stOn) {
        phases.push({
          label: phaseLabel,
          companyName,
          phone,
          amount: Number(amount || 0),
          startDate: startDate || null,
          endDate: endDate || null,
        });
      }
      const updated = await api<TaskSubcontract[]>(`/chantiers/progress/${task.progressId}/subcontract`, {
        method: 'PUT',
        body: JSON.stringify(phases.length ? { mode: 'phases', phases } : { mode: 'none' }),
      });
      const saved = updated.find((item) => item.scope === 'phase' && item.phaseLabel === phaseLabel)
        || updated.find((item) => item.scope !== 'phase');
      setContract(saved ? toContract(saved, task.chantierId) : null);
      onSaved?.();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-[#6d28d9]/20 bg-[rgba(124,58,237,0.06)] p-3 space-y-2">
      <p className="text-[12px] font-semibold text-[#6d28d9]">{t('detail.stPickCompany')}</p>
      <Select
        label={t('detail.stExistingCompany')}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value={NONE}>{t('detail.stStandard')}</option>
        {optionNames.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
        <option value={NEW}>{t('detail.stNewCompany')}</option>
      </Select>
      {choice === NEW && (
        <Input
          label={t('fields.companyRequired')}
          required
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
      )}
      {stOn && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input label={t('fields.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label={t('detail.stAmount')} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label={t('detail.stFrom')} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label={t('detail.stTo')} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      )}
      {task.progressId && (
        <Btn type="button" onClick={save} disabled={saving}>{t('detail.stSaveContract')}</Btn>
      )}
      {contract?.id && contract.chantierId && (
        <div className={`rounded-md bg-white/70 p-2 space-y-2${savingProgress ? ' opacity-60' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-gic-ink">{t('detail.stPhaseRealization')}</p>
            <span className={`mac-chip ${stProgress >= 100 ? 'mac-chip-green' : 'mac-chip-gray'}`}>
              {stProgress >= 100 ? t('pointageMgmt.validated') : t('pointageMgmt.draft')}
            </span>
          </div>
          <ProgressSteps percent={stProgress} onChange={setStProgress} size="sm" />
          <div className="h-2 overflow-hidden rounded-full bg-black/[0.06]">
            <div
              className={`h-full rounded-full transition-all ${stProgress >= 100 ? 'bg-[#34c759]' : 'bg-[#007aff]'}`}
              style={{ width: `${stProgress}%` }}
            />
          </div>
        </div>
      )}
      {contract?.id && contract.chantierId && (
        <PaymentBox
          contract={contract}
          phaseLabel={contract.scope === 'phase' ? undefined : phaseLabel}
          onPaid={(updated) => { setContract(toContract({ ...updated, chantierId: contract.chantierId }, contract.chantierId)); onSaved?.(); }}
        />
      )}
    </div>
  );
}
