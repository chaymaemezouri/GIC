export type WorkProgressPhase = {
  percent: number;
  label: string;
  description?: string;
  deliverables?: string[];
};

const MIN_WORK_PHASES = 1;
const MAX_WORK_PHASES = 19;
const VALIDATION_LABEL = 'Validation';

function clampWorkPercent(n: number) {
  return Math.max(1, Math.min(99, Math.round(n)));
}

function isValidationLabel(label?: string | null) {
  return String(label || '').trim().toLowerCase() === 'validation';
}

function distributeWorkPercents(workCount: number): number[] {
  if (workCount <= 0) return [];
  const denom = workCount + 1;
  const result: number[] = [];
  for (let i = 1; i <= workCount; i++) {
    result.push(Math.max(1, Math.min(99, Math.round((i / denom) * 100))));
  }
  for (let i = 1; i < result.length; i++) {
    if (result[i] <= result[i - 1]) result[i] = Math.min(99, result[i - 1] + 1);
  }
  if (result[result.length - 1] >= 100) result[result.length - 1] = 99;
  return result;
}

function normalizeToAnchored(phases: WorkProgressPhase[]): WorkProgressPhase[] {
  const work = phases
    .filter((p) => !(p.percent === 100 && isValidationLabel(p.label)))
    .map((p) => ({
      ...p,
      percent: p.percent >= 100 ? 99 : clampWorkPercent(p.percent),
    }));
  if (!work.length) {
    return [{ percent: 50, label: 'Travaux', description: undefined }, { percent: 100, label: VALIDATION_LABEL }];
  }
  const percents = distributeWorkPercents(work.length);
  return [
    ...work.map((p, i) => ({ ...p, percent: percents[i] })),
    { percent: 100, label: VALIDATION_LABEL },
  ];
}

export function parseWorkProgressPhases(raw: unknown): WorkProgressPhase[] | null {
  if (!raw || !Array.isArray(raw)) return null;
  const result: WorkProgressPhase[] = [];
  for (const item of raw) {
    const percent = Number(item?.percent);
    if (!Number.isFinite(percent)) continue;
    const label = String(item?.label || '').trim();
    if (!label) continue;
    const description = item?.description != null ? String(item.description).trim() : '';
    const deliverables = Array.isArray(item?.deliverables)
      ? item.deliverables.map((d: unknown) => String(d).trim()).filter(Boolean)
      : [];
    result.push({
      percent: Math.max(1, Math.min(100, Math.round(percent))),
      label,
      description: description || undefined,
      deliverables: deliverables.length ? deliverables : undefined,
    });
  }
  result.sort((a, b) => a.percent - b.percent);
  return result.length ? normalizeToAnchored(result) : null;
}

export function validateWorkProgressPhases(raw: unknown): WorkProgressPhase[] | { message: string } {
  if (!raw || !Array.isArray(raw) || raw.length < 1) {
    return { message: 'Au moins une phase de travail est requise' };
  }

  const parsed: WorkProgressPhase[] = [];
  for (const item of raw) {
    const label = String(item?.label || '').trim();
    if (!label) return { message: 'Chaque phase doit avoir un libellé' };
    const percent = Number(item?.percent);
    if (!Number.isFinite(percent) || percent < 1 || percent > 100) {
      return { message: 'Chaque phase doit avoir un pourcentage entre 1 et 100' };
    }
    const description = item?.description != null ? String(item.description).trim() : '';
    const deliverables = Array.isArray(item?.deliverables)
      ? item.deliverables.map((d: unknown) => String(d).trim()).filter(Boolean)
      : [];
    parsed.push({
      percent: Math.round(percent),
      label,
      description: description || undefined,
      deliverables: deliverables.length ? deliverables : undefined,
    });
  }

  const anchored = normalizeToAnchored(parsed);
  const work = anchored.filter((p) => p.percent < 100);
  if (work.length < MIN_WORK_PHASES) {
    return { message: `Au moins ${MIN_WORK_PHASES} phase de travail est requise` };
  }
  if (work.length > MAX_WORK_PHASES) {
    return { message: `Maximum ${MAX_WORK_PHASES} phases de travail (+ validation à 100 %)` };
  }
  for (const phase of work) {
    if (!phase.label?.trim()) return { message: 'Chaque phase de travail doit avoir un libellé' };
  }
  const last = anchored[anchored.length - 1];
  if (!last || last.percent !== 100 || !isValidationLabel(last.label)) {
    return { message: 'La dernière étape doit être la Validation à 100 %' };
  }
  return anchored;
}
