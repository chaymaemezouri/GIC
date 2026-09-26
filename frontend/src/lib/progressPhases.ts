/** Phases d'avancement d'un lot : 0 % Début → phases → 100 % Validation. */

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

export type TrackStepKind = 'start' | 'phase' | 'validation';

export type TrackStep = {
  percent: number;
  kind: TrackStepKind;
  label: string;
};

export const START_PERCENT = 0;
export const END_PERCENT = 100;
export const VALIDATION_LABEL = 'Validation';
export const START_LABEL = 'Début';

/** Fallback historique si aucune phase personnalisée. */
export const DEFAULT_PROGRESS_STAGES = [20, 40, 60, 80, 100] as const;

/** @deprecated Utiliser resolveStages(phases) — conservé pour compat. */
export const PROGRESS_STAGES = DEFAULT_PROGRESS_STAGES;

function isValidationLabel(label?: string | null) {
  return String(label || '').trim().toLowerCase() === 'validation';
}

/** Répartit les phases de travail strictement entre 0 et 100 (exclus). */
export function distributeWorkPercents(workCount: number): number[] {
  if (workCount <= 0) return [];
  const denom = workCount + 1;
  const result: number[] = [];
  for (let i = 1; i <= workCount; i++) {
    result.push(Math.max(1, Math.min(99, Math.round((i / denom) * 100))));
  }
  for (let i = 1; i < result.length; i++) {
    if (result[i] <= result[i - 1]) result[i] = Math.min(99, result[i - 1] + 1);
  }
  if (result[result.length - 1] >= 100) {
    result[result.length - 1] = 99;
  }
  return result;
}

/** @deprecated Préférer distributeWorkPercents + Validation à 100. */
export function distributePhasePercents(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [100];
  const work = distributeWorkPercents(count - 1);
  return [...work, 100];
}

export function extractWorkPhases(phases: TaskPhaseInput[]): TaskPhaseInput[] {
  const sorted = [...phases].sort((a, b) => a.percent - b.percent);
  return sorted.filter((p) => !(Math.round(Number(p.percent) || 0) === 100 && isValidationLabel(p.label)));
}

/** Garantit : phases milieu + dernière = Validation 100 %. */
export function ensureAnchoredPhases(phases: TaskPhaseInput[]): TaskPhaseInput[] {
  const work = extractWorkPhases(phases).map((p) => ({
    percent: p.percent,
    label: p.label,
    description: p.description || '',
    deliverables: p.deliverables,
  }));
  if (!work.length) {
    return [
      { percent: 50, label: '', description: '' },
      { percent: END_PERCENT, label: VALIDATION_LABEL, description: '' },
    ];
  }
  const percents = distributeWorkPercents(work.length);
  return [
    ...work.map((p, i) => ({ ...p, percent: percents[i] })),
    { percent: END_PERCENT, label: VALIDATION_LABEL, description: '' },
  ];
}

export function redistributePhases(phases: TaskPhaseInput[]): TaskPhaseInput[] {
  return ensureAnchoredPhases(phases);
}

export function emptyPhaseForm(workCount = 1): TaskPhaseInput[] {
  const n = Math.max(1, Math.min(19, workCount));
  const blanks = Array.from({ length: n }, () => ({ percent: 50, label: '', description: '' }));
  return ensureAnchoredPhases(blanks);
}

export function phasesFromLabels(labels: string[]): TaskPhaseInput[] {
  const cleaned = labels
    .map((l) => String(l || '').trim())
    .filter(Boolean)
    .filter((l) => !isValidationLabel(l));
  if (!cleaned.length) return emptyPhaseForm(1);
  return ensureAnchoredPhases(cleaned.map((label) => ({ percent: 50, label, description: '' })));
}

export function resolveStages(customPhases?: TaskPhaseInput[] | null): number[] {
  return resolveTrackSteps(customPhases).map((s) => s.percent).filter((p) => p > 0);
}

/** Rail complet : 0 Début → phases → 100 Validation. */
export function resolveTrackSteps(customPhases?: TaskPhaseInput[] | null): TrackStep[] {
  const anchored = customPhases?.length
    ? ensureAnchoredPhases(customPhases)
    : ensureAnchoredPhases(
        DEFAULT_PROGRESS_STAGES.filter((p) => p < 100).map((percent) => ({
          percent,
          label: `${percent} %`,
          description: '',
        })),
      );

  const steps: TrackStep[] = [
    { percent: START_PERCENT, kind: 'start', label: START_LABEL },
  ];

  for (const phase of anchored) {
    const pct = Math.round(Number(phase.percent) || 0);
    if (pct <= 0) continue;
    if (pct >= 100 || isValidationLabel(phase.label)) {
      steps.push({
        percent: END_PERCENT,
        kind: 'validation',
        label: VALIDATION_LABEL,
      });
    } else {
      steps.push({
        percent: pct,
        kind: 'phase',
        label: phase.label.trim() || `${pct} %`,
      });
    }
  }

  if (!steps.some((s) => s.kind === 'validation')) {
    steps.push({ percent: END_PERCENT, kind: 'validation', label: VALIDATION_LABEL });
  }

  // Dédupliquer 100
  const seen = new Set<number>();
  return steps.filter((s) => {
    if (seen.has(s.percent)) return false;
    seen.add(s.percent);
    return true;
  });
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
    shortLabel: shortLabelFrom(label) || `${input.percent} %`,
    description,
    deliverables,
  };
}

export function getPhaseDefinition(
  stagePercent: number,
  customPhases?: TaskPhaseInput[] | null,
): PhaseDefinition {
  if (stagePercent <= 0) {
    return {
      percent: 0,
      label: START_LABEL,
      shortLabel: START_LABEL,
      description: 'Point de départ du lot — aucune tâche validée.',
      deliverables: [],
    };
  }
  if (stagePercent >= 100) {
    return {
      percent: 100,
      label: VALIDATION_LABEL,
      shortLabel: VALIDATION_LABEL,
      description: 'Toutes les phases du lot sont terminées et validées.',
      deliverables: [],
    };
  }
  const anchored = customPhases?.length ? ensureAnchoredPhases(customPhases) : null;
  const custom = anchored?.find((p) => p.percent === stagePercent);
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

export function phaseStatus(
  currentPercent: number,
  stagePercent: number,
  stages?: number[],
): 'done' | 'current' | 'pending' {
  const p = Math.round(Number(currentPercent) || 0);
  if (stagePercent <= 0) return p <= 0 ? 'current' : 'done';
  if (p >= stagePercent) return 'done';
  const list = stages?.length ? stages : resolveStages(null);
  const nextStage = list.find((s) => s > p) ?? 100;
  if (stagePercent === nextStage) return 'current';
  return 'pending';
}

export function completedPhases(currentPercent: number, stages?: number[]): number[] {
  const p = Math.round(Number(currentPercent) || 0);
  const list = stages?.length ? stages : resolveStages(null);
  return list.filter((s) => p >= s);
}

export function nearestStage(percent: number, stages?: number[]) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  if (p <= 0) return 0;
  const list = stages?.length ? stages : resolveStages(null);
  return list.reduce((best, s) => (s <= p ? s : best), 0);
}

export function progressStatus(percent: number): 'todo' | 'progress' | 'done' {
  const p = Number(percent) || 0;
  if (p >= 100) return 'done';
  if (p > 0) return 'progress';
  return 'todo';
}

export function validatePhaseForm(phases: TaskPhaseInput[]): string | null {
  const anchored = ensureAnchoredPhases(phases);
  const work = extractWorkPhases(anchored);
  if (!work.length) return 'Ajoutez au moins une phase de travail';
  if (work.length > 19) return 'Maximum 19 phases de travail (plus la validation)';
  for (const phase of work) {
    if (!phase.label?.trim()) return 'Décrivez chaque phase de travail';
  }
  const last = anchored[anchored.length - 1];
  if (!last || last.percent !== 100) {
    return 'La validation finale doit être à 100 %';
  }
  return null;
}
