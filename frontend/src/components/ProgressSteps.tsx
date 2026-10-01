import { useState } from 'react';
import { Check, Circle, Flag, Play, ShieldCheck } from 'lucide-react';
import { formatDate, formatMad } from '../lib/api';
import {
  getPhaseDefinition,
  nearestStage,
  phaseStatus,
  progressStatus,
  resolveTrackSteps,
  type TaskPhaseContext,
  type TrackStep,
} from '../lib/progressPhases';
import { Btn, Modal } from './ui';

export { resolveStages, nearestStage, progressStatus, DEFAULT_PROGRESS_STAGES as PROGRESS_STAGES } from '../lib/progressPhases';

type Props = {
  percent: number;
  onChange?: (percent: number) => void;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  task?: TaskPhaseContext;
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

function workDoneCount(percent: number, workSteps: TrackStep[]) {
  return workSteps.filter((s) => percent >= s.percent).length;
}

export default function ProgressSteps({ percent, onChange, size = 'md', showLabel = true, task }: Props) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const status = progressStatus(p);
  const interactive = typeof onChange === 'function';
  const sm = size === 'sm';
  const [popupStage, setPopupStage] = useState<number | null>(null);
  const customPhases = task?.phases;
  const track = resolveTrackSteps(customPhases);
  const stages = track.filter((s) => s.percent > 0).map((s) => s.percent);
  const workSteps = track.filter((s) => s.kind === 'phase');
  const startStep = track.find((s) => s.kind === 'start');
  const validationStep = track.find((s) => s.kind === 'validation');
  const workDone = workDoneCount(p, workSteps);
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
                {step.kind === 'phase' && task?.subcontracts?.some((item) => item.scope !== 'phase' || item.phaseLabel === step.label) && (
                  <span className="mac-steps-st">ST</span>
                )}
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
          title={task.taskName}
          onClose={() => setPopupStage(null)}
          footer={<Btn variant="secondary" onClick={() => setPopupStage(null)}>Fermer</Btn>}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {task.tranche && <span className="mac-chip">{task.tranche}</span>}
              <span className={`mac-chip ${validated ? 'mac-chip-green' : 'mac-chip-orange'}`}>
                Avancement {p} %
              </span>
              <span className="mac-chip mac-chip-gray">
                Phases {workDone}/{workSteps.length}
              </span>
              {validated && (
                <span className="mac-chip mac-chip-green inline-flex items-center gap-1">
                  <ShieldCheck size={11} /> Lot validé
                </span>
              )}
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
              {task.subcontracts?.filter((item) => item.scope !== 'phase' || item.phaseLabel === selectedPhase.label).map((item) => (
                <div key={`${item.companyName}-${item.phaseLabel || 'task'}`} className="mt-3 rounded-lg border border-[#6d28d9]/20 bg-[rgba(124,58,237,0.06)] p-3 text-[12px]">
                  <p className="font-semibold text-[#6d28d9]">ST · {item.scope === 'phase' ? item.phaseLabel : 'Tâche entière'}</p>
                  <p className="mt-1">{item.companyName} · {formatMad(item.amount || 0)}</p>
                  <p className="text-gic-muted">Payé {formatMad(item.paidAmount || 0)} · Reste {formatMad(Math.max(0, Number(item.amount || 0) - Number(item.paidAmount || 0)))}</p>
                  {(item.startDate || item.endDate) && (
                    <p className="text-gic-muted">{item.startDate ? formatDate(item.startDate) : '…'} → {item.endDate ? formatDate(item.endDate) : '…'}</p>
                  )}
                </div>
              ))}
              {selectedStatus === 'done' && task.updatedAt && (
                <p className="text-[10px] text-gic-muted mt-3 pt-3 border-t border-black/[0.06]">
                  Dernière mise à jour : {formatDate(task.updatedAt)}
                </p>
              )}
            </div>

            {/* Parcours organisé */}
            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-0.5">
              {/* 1. Début */}
              {startStep && (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gic-muted mb-1.5 px-0.5">
                    1 · Début
                  </p>
                  <StepRow
                    step={startStep}
                    status={phaseStatus(p, 0, [0, ...stages])}
                    selected={popupStage === 0}
                    onSelect={() => setPopupStage(0)}
                    icon={<Play size={12} />}
                  />
                </section>
              )}

              {/* 2. Phases */}
              <section>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gic-muted mb-1.5 px-0.5">
                  2 · Phases de travail ({workDone}/{workSteps.length})
                </p>
                <div className="space-y-1 rounded-xl border border-black/[0.06] overflow-hidden divide-y divide-black/[0.05]">
                  {workSteps.length === 0 ? (
                    <p className="text-[12px] text-gic-muted p-3">Aucune phase définie</p>
                  ) : (
                    workSteps.map((step, idx) => (
                      <StepRow
                        key={`work-${step.percent}`}
                        step={step}
                        index={idx + 1}
                        status={phaseStatus(p, step.percent, [0, ...stages])}
                        selected={popupStage === step.percent}
                        onSelect={() => setPopupStage(step.percent)}
                        flat
                      />
                    ))
                  )}
                </div>
              </section>

              {/* 3. Validation — mise en avant */}
              {validationStep && (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#248a3d] mb-1.5 px-0.5">
                    3 · Validation finale
                  </p>
                  <button
                    type="button"
                    onClick={() => setPopupStage(100)}
                    className={[
                      'w-full text-left rounded-xl border-2 px-3.5 py-3 transition-colors',
                      validated
                        ? 'border-[#34c759] bg-[rgba(52,199,89,0.14)] shadow-[0_0_0_3px_rgba(52,199,89,0.12)]'
                        : popupStage === 100
                          ? 'border-[#34c759]/50 bg-[rgba(52,199,89,0.08)]'
                          : 'border-[#34c759]/35 bg-[rgba(52,199,89,0.04)] hover:bg-[rgba(52,199,89,0.08)]',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={[
                          'shrink-0 h-9 w-9 rounded-full flex items-center justify-center',
                          validated ? 'bg-[#34c759] text-white' : 'bg-[rgba(52,199,89,0.18)] text-[#248a3d]',
                        ].join(' ')}
                      >
                        <ShieldCheck size={18} strokeWidth={2.25} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-gic-ink">
                          Validation — 100 %
                        </p>
                        <p className="text-[11px] text-gic-muted mt-0.5">
                          {validated
                            ? 'Toutes les phases sont terminées et validées'
                            : workDone < workSteps.length
                              ? `Encore ${workSteps.length - workDone} phase(s) à terminer avant validation`
                              : 'Prêt à valider — cliquez la pastille 100 % sur le rail'}
                        </p>
                      </div>
                      <span
                        className={[
                          'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                          validated
                            ? 'bg-[#34c759] text-white'
                            : 'bg-black/[0.05] text-gic-muted',
                        ].join(' ')}
                      >
                        {validated ? 'Validé' : 'En attente'}
                      </span>
                    </div>
                  </button>
                </section>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function StepRow({
  step,
  status,
  selected,
  onSelect,
  index,
  icon,
  flat,
}: {
  step: TrackStep;
  status: 'done' | 'current' | 'pending';
  selected: boolean;
  onSelect: () => void;
  index?: number;
  icon?: React.ReactNode;
  flat?: boolean;
}) {
  const label =
    step.kind === 'start'
      ? 'Début'
      : step.label && step.label !== `${step.percent} %`
        ? step.label
        : `Phase ${index ?? ''}`.trim();

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
        flat ? '' : 'rounded-xl border border-black/[0.06]',
        selected ? 'bg-[rgba(0,122,255,0.08)]' : 'hover:bg-black/[0.03]',
        flat && selected ? 'bg-[rgba(0,122,255,0.08)]' : '',
      ].join(' ')}
    >
      <span
        className={[
          'shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-[11px]',
          status === 'done' ? 'bg-[#34c759] text-white' : status === 'current' ? 'bg-[#ff9500] text-white' : 'bg-black/[0.06] text-gic-muted',
        ].join(' ')}
      >
        {status === 'done' ? <Check size={12} strokeWidth={3} /> : icon || (index != null ? <span className="font-semibold">{index}</span> : <Circle size={10} />)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-gic-ink truncate">
          {label}
          <span className="text-gic-muted font-normal"> · {step.percent} %</span>
        </p>
        <p className="text-[10px] text-gic-muted">{STATUS_LABEL[status]}</p>
      </div>
    </button>
  );
}
