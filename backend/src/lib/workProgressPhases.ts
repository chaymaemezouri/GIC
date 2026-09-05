export const PROGRESS_STAGE_PERCENTS = [20, 40, 60, 80, 100] as const;

export type WorkProgressPhase = {
  percent: number;
  label: string;
  description?: string;
  deliverables?: string[];
};

export function parseWorkProgressPhases(raw: unknown): WorkProgressPhase[] | null {
  if (!raw || !Array.isArray(raw)) return null;
  const result: WorkProgressPhase[] = [];
  for (const item of raw) {
    const percent = Number(item?.percent);
    if (!PROGRESS_STAGE_PERCENTS.includes(percent as typeof PROGRESS_STAGE_PERCENTS[number])) continue;
    const label = String(item?.label || '').trim();
    if (!label) continue;
    const description = item?.description != null ? String(item.description).trim() : '';
    const deliverables = Array.isArray(item?.deliverables)
      ? item.deliverables.map((d: unknown) => String(d).trim()).filter(Boolean)
      : [];
    result.push({
      percent,
      label,
      description: description || undefined,
      deliverables: deliverables.length ? deliverables : undefined,
    });
  }
  return result.length ? result : null;
}

export function validateWorkProgressPhases(raw: unknown): WorkProgressPhase[] | { message: string } {
  const parsed = parseWorkProgressPhases(raw);
  if (!parsed) return { message: 'Les phases du lot sont obligatoires (20, 40, 60, 80, 100 %)' };
  const missing = PROGRESS_STAGE_PERCENTS.filter((s) => !parsed.some((p) => p.percent === s));
  if (missing.length) {
    return { message: `Phases manquantes : ${missing.join(', ')} %` };
  }
  return parsed;
}
