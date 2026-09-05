/** 5 étapes : 20 → 40 → 60 → 80 → 100 % */
export const PROGRESS_STAGES = [20, 40, 60, 80, 100] as const;

export type PhaseDefinition = {
  percent: number;
  label: string;
  shortLabel: string;
  description: string;
  deliverables: string[];
};

export type TaskPhaseInput = {
  percent: number;
  label: string;
  description?: string;
  deliverables?: string[];
};

export type TaskPhaseContext = {
  taskName: string;
  tranche?: string | null;
  groupe?: string | null;
  etage?: string | null;
  remark?: string | null;
  updatedAt?: string | null;
  phases?: TaskPhaseInput[] | null;
};

export function emptyPhaseForm(): TaskPhaseInput[] {
  return PROGRESS_STAGES.map((percent) => ({ percent, label: '', description: '' }));
}

function shortLabelFrom(label: string) {
  const parts = label.split('—');
  return parts.length > 1 ? parts[parts.length - 1].trim() : label.trim();
}

function toPhaseDefinition(input: TaskPhaseInput): PhaseDefinition {
  const label = input.label.trim();
  const description = (input.description || '').trim();
  const deliverables = (input.deliverables || []).map((d) => d.trim()).filter(Boolean);
  return {
    percent: input.percent,
    label,
    shortLabel: shortLabelFrom(label),
    description,
    deliverables,
  };
}

export function getPhaseDefinition(
  stagePercent: number,
  customPhases?: TaskPhaseInput[] | null,
): PhaseDefinition {
  const custom = customPhases?.find((p) => p.percent === stagePercent);
  if (custom?.label?.trim()) {
    return toPhaseDefinition(custom);
  }
  return {
    percent: stagePercent,
    label: `${stagePercent} %`,
    shortLabel: `${stagePercent} %`,
    description: 'Phase non définie — modifiez la tâche pour décrire cette étape.',
    deliverables: [],
  };
}

export function phaseStatus(currentPercent: number, stagePercent: number): 'done' | 'current' | 'pending' {
  const p = Math.round(Number(currentPercent) || 0);
  if (p >= stagePercent) return 'done';
  const stages = [...PROGRESS_STAGES];
  const nextStage = stages.find((s) => s > p) ?? 100;
  if (stagePercent === nextStage) return 'current';
  return 'pending';
}

export function completedPhases(currentPercent: number): number[] {
  const p = Math.round(Number(currentPercent) || 0);
  return PROGRESS_STAGES.filter((s) => p >= s);
}

export function nearestStage(percent: number) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  if (p <= 0) return 0;
  return PROGRESS_STAGES.reduce((best, s) => (s <= p ? s : best), 0);
}

export function progressStatus(percent: number): 'todo' | 'progress' | 'done' {
  const p = Number(percent) || 0;
  if (p >= 100) return 'done';
  if (p > 0) return 'progress';
  return 'todo';
}

export function validatePhaseForm(phases: TaskPhaseInput[]): string | null {
  for (const stage of PROGRESS_STAGES) {
    const phase = phases.find((p) => p.percent === stage);
    if (!phase?.label?.trim()) {
      return `Décrivez la phase à ${stage} %`;
    }
  }
  return null;
}
