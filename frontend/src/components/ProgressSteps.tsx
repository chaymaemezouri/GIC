import { useState } from 'react';
import { Check, Circle } from 'lucide-react';
import { formatDate } from '../lib/api';
import {
  completedPhases,
  getPhaseDefinition,
  nearestStage,
  phaseStatus,
  progressStatus,
  PROGRESS_STAGES,
  type TaskPhaseContext,
} from '../lib/progressPhases';
import { Btn, Modal } from './ui';

export { PROGRESS_STAGES, nearestStage, progressStatus } from '../lib/progressPhases';

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
  pending: 'Non commencée',
} as const;

const STATUS_CLASS = {
  done: 'text-[#248a3d] bg-[rgba(52,199,89,0.1)]',
  current: 'text-[#c93400] bg-[rgba(255,149,0,0.12)]',
  pending: 'text-[#86868b] bg-black/[0.04]',
} as const;

export default function ProgressSteps({ percent, onChange, size = 'md', showLabel = true, task }: Props) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const status = progressStatus(p);
  const interactive = typeof onChange === 'function';
  const sm = size === 'sm';
  const [popupStage, setPopupStage] = useState<number | null>(null);
  const customPhases = task?.phases;

  function openPhasePopup(stage: number) {
    if (!task) return;
    setPopupStage(stage);
  }

  const selectedPhase = popupStage != null ? getPhaseDefinition(popupStage, customPhases) : null;
  const selectedStatus = popupStage != null ? phaseStatus(p, popupStage) : null;

  return (
    <>
      <div className={`mac-steps${sm ? ' mac-steps-sm' : ''}`}>
        <div className="mac-steps-track" role="group" aria-label={`Avancement ${p} %`}>
          {PROGRESS_STAGES.map((stage, i) => {
            const filled = p >= stage;
            const isCurrent = nearestStage(p) === stage && p > 0 && p < 100;
            const lineFilled = p >= stage;
            return (
              <div key={stage} className="mac-steps-item">
                {i > 0 && (
                  <button
                    type="button"
                    className={`mac-steps-line-btn${task ? ' mac-steps-line-interactive' : ''}`}
                    aria-label={task ? `Voir phase ${stage} %` : undefined}
                    title={task ? `Phase ${stage} % — voir le détail` : undefined}
                    onClick={() => task && openPhasePopup(stage)}
                    disabled={!task}
                  >
                    <span
                      className={`mac-steps-line${lineFilled ? ` mac-steps-line-${status === 'done' ? 'done' : 'progress'}` : ''}`}
                      aria-hidden
                    />
                  </button>
                )}
                <button
                  type="button"
                  disabled={!interactive && !task}
                  title={
                    interactive
                      ? `${stage} % — cliquer pour fixer`
                      : task
                        ? `${stage} % — voir la phase`
                        : `${stage} %`
                  }
                  aria-label={`${stage} pour cent`}
                  aria-pressed={filled}
                  className={[
                    'mac-steps-dot',
                    filled ? (status === 'done' ? 'mac-steps-dot-done' : 'mac-steps-dot-progress') : '',
                    isCurrent ? 'mac-steps-dot-current' : '',
                    interactive || task ? 'mac-steps-dot-interactive' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => {
                    if (interactive && onChange) {
                      if (nearestStage(p) === stage && p >= stage) {
                        onChange(i === 0 ? 0 : PROGRESS_STAGES[i - 1]);
                      } else {
                        onChange(stage);
                      }
                    } else if (task) {
                      openPhasePopup(stage);
                    }
                  }}
                >
                  {filled && status === 'done' ? <Check size={sm ? 9 : 11} strokeWidth={3} /> : null}
                </button>
              </div>
            );
          })}
        </div>
        {showLabel && (
          <span className={`mac-steps-label mac-steps-label-${status}`}>
            {status === 'done' ? 'Terminé' : status === 'progress' ? `${p} %` : 'À faire'}
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
            <div className="flex flex-wrap gap-2 text-[11px]">
              {task.tranche && <span className="mac-chip">{task.tranche}</span>}
              {task.groupe && <span className="mac-chip mac-chip-blue">{task.groupe}</span>}
              {task.etage && <span className="mac-chip mac-chip-gray">{task.etage}</span>}
              <span className="mac-chip mac-chip-orange">Global {p} %</span>
            </div>

            <div className="rounded-xl border border-[#007aff]/25 bg-[rgba(0,122,255,0.05)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-[13px] font-semibold text-gic-ink">{selectedPhase.label}</p>
                  <p className="text-[12px] text-gic-muted mt-0.5">{selectedPhase.percent} % du lot</p>
                </div>
                {selectedStatus && (
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_CLASS[selectedStatus]}`}>
                    {STATUS_LABEL[selectedStatus]}
                  </span>
                )}
              </div>
              {selectedPhase.description && (
                <p className="text-[12px] text-gic-muted leading-relaxed">{selectedPhase.description}</p>
              )}
              {selectedPhase.deliverables.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {selectedPhase.deliverables.map((d) => (
                    <li key={d} className="text-[11px] text-gic-muted flex items-center gap-1.5">
                      <Check size={12} className="text-[#34c759] shrink-0" />
                      {d}
                    </li>
                  ))}
                </ul>
              )}
              {selectedStatus === 'done' && task.updatedAt && (
                <p className="text-[10px] text-gic-muted mt-3 pt-3 border-t border-black/[0.06]">
                  Dernière mise à jour : {formatDate(task.updatedAt)}
                </p>
              )}
              {task.remark && (
                <p className="text-[11px] text-gic-muted mt-2 pt-2 border-t border-black/[0.06]">
                  <span className="font-medium text-gic-ink">Remarque : </span>{task.remark}
                </p>
              )}
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gic-muted mb-2">
                Phases du lot ({completedPhases(p).length}/{PROGRESS_STAGES.length} terminées)
              </p>
              <div className="space-y-1.5">
                {PROGRESS_STAGES.map((stage) => {
                  const st = phaseStatus(p, stage);
                  const def = getPhaseDefinition(stage, customPhases);
                  return (
                    <button
                      key={stage}
                      type="button"
                      onClick={() => setPopupStage(stage)}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/[0.03]${popupStage === stage ? ' bg-[rgba(0,122,255,0.08)] ring-1 ring-[#007aff]/20' : ''}`}
                    >
                      <span className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${st === 'done' ? 'bg-[#34c759] text-white' : st === 'current' ? 'bg-[#ff9500] text-white' : 'bg-black/[0.06] text-gic-muted'}`}>
                        {st === 'done' ? <Check size={12} strokeWidth={3} /> : <Circle size={10} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-gic-ink truncate">{def.shortLabel} — {stage} %</p>
                        <p className="text-[10px] text-gic-muted truncate">{STATUS_LABEL[st]}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
