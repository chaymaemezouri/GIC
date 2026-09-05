import { Input } from './ui';
import { PROGRESS_STAGES, type TaskPhaseInput } from '../lib/progressPhases';
import { useI18n } from '../i18n/I18nContext';

export function TaskPhaseFields({
  phases,
  onChange,
}: {
  phases: TaskPhaseInput[];
  onChange: (phases: TaskPhaseInput[]) => void;
}) {
  const { t } = useI18n();

  function updatePhase(percent: number, field: 'label' | 'description', value: string) {
    onChange(
      phases.map((p) => (p.percent === percent ? { ...p, [field]: value } : p)),
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] font-semibold text-gic-ink">{t('fields.lotPhasesRequired')}</p>
      <p className="text-[11px] text-gic-muted">
        {t('fields.lotPhasesHint')}
      </p>
      <div className="rounded-lg border border-black/[0.08] divide-y divide-black/[0.06]">
        {PROGRESS_STAGES.map((percent) => {
          const phase = phases.find((p) => p.percent === percent) || { percent, label: '', description: '' };
          return (
            <div key={percent} className="grid sm:grid-cols-[56px_1fr_1fr] gap-2 p-2.5 items-start">
              <span className="text-[12px] font-semibold text-[#007aff] tabular-nums pt-2">{percent} %</span>
              <Input
                label={t('fields.step')}
                required
                value={phase.label}
                onChange={(e) => updatePhase(percent, 'label', e.target.value)}
                placeholder={
                  percent === 20
                    ? t('fields.phasePrep')
                    : percent === 80
                      ? t('fields.phaseFinish')
                      : t('fields.shortDescription')
                }
              />
              <Input
                label={t('fields.detailOptional')}
                value={phase.description || ''}
                onChange={(e) => updatePhase(percent, 'description', e.target.value)}
                placeholder={t('fields.phaseDetailPlaceholder')}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
