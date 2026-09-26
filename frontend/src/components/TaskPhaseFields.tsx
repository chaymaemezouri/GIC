import { Plus, Trash2 } from 'lucide-react';
import { Btn, Input } from './ui';
import {
  END_PERCENT,
  START_PERCENT,
  VALIDATION_LABEL,
  ensureAnchoredPhases,
  extractWorkPhases,
  redistributePhases,
  type TaskPhaseInput,
} from '../lib/progressPhases';
import { useI18n } from '../i18n/I18nContext';

export function TaskPhaseFields({
  phases,
  onChange,
}: {
  phases: TaskPhaseInput[];
  onChange: (phases: TaskPhaseInput[]) => void;
}) {
  const { t } = useI18n();
  const anchored = ensureAnchoredPhases(phases);
  const workPhases = extractWorkPhases(anchored);

  function commitWork(nextWork: TaskPhaseInput[]) {
    onChange(ensureAnchoredPhases(nextWork));
  }

  function updateWork(index: number, field: 'label' | 'description', value: string) {
    commitWork(
      workPhases.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  }

  function addPhase() {
    if (workPhases.length >= 19) return;
    commitWork(redistributePhases([...workPhases, { percent: 50, label: '', description: '' }]));
  }

  function removePhase(index: number) {
    if (workPhases.length <= 1) return;
    commitWork(workPhases.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold text-gic-ink">{t('fields.lotPhasesRequired')}</p>
          <p className="text-[11px] text-gic-muted">{t('fields.lotPhasesHint')}</p>
        </div>
        <Btn type="button" variant="secondary" onClick={addPhase} disabled={workPhases.length >= 19}>
          <Plus size={14} /> {t('fields.addPhase')}
        </Btn>
      </div>

      <div className="rounded-lg border border-black/[0.08] divide-y divide-black/[0.06]">
        <div className="grid sm:grid-cols-[72px_1fr] gap-2 p-2.5 items-center bg-black/[0.02]">
          <span className="text-[12px] font-semibold text-gic-muted tabular-nums">{START_PERCENT} %</span>
          <p className="text-[12px] font-medium text-gic-ink">{t('fields.phaseStart')}</p>
        </div>

        {workPhases.map((phase, index) => (
          <div key={`work-${index}`} className="grid sm:grid-cols-[72px_1fr_1fr_auto] gap-2 p-2.5 items-start">
            <div className="pt-2">
              <span className="text-[12px] font-semibold text-[#007aff] tabular-nums">{phase.percent} %</span>
              <p className="text-[10px] text-gic-muted mt-0.5">{t('fields.phaseMid')}</p>
            </div>
            <Input
              label={t('fields.step')}
              required
              value={phase.label}
              onChange={(e) => updateWork(index, 'label', e.target.value)}
              placeholder={t('fields.shortDescription')}
            />
            <Input
              label={t('fields.detailOptional')}
              value={phase.description || ''}
              onChange={(e) => updateWork(index, 'description', e.target.value)}
              placeholder={t('fields.phaseDetailPlaceholder')}
            />
            <button
              type="button"
              className="mt-6 p-2 rounded-lg text-gic-muted hover:text-[#ff3b30] hover:bg-[rgba(255,59,48,0.08)] disabled:opacity-30"
              disabled={workPhases.length <= 1}
              onClick={() => removePhase(index)}
              title={t('common.delete')}
              aria-label={t('common.delete')}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}

        <div className="grid sm:grid-cols-[72px_1fr] gap-2 p-2.5 items-center bg-[rgba(52,199,89,0.06)]">
          <span className="text-[12px] font-semibold text-[#248a3d] tabular-nums">{END_PERCENT} %</span>
          <div>
            <p className="text-[12px] font-medium text-gic-ink">{VALIDATION_LABEL}</p>
            <p className="text-[10px] text-gic-muted">{t('fields.phaseValidationHint')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
