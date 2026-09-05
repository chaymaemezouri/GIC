export const CHAUFFEUR_CATEGORY = 'Chauffeur';

export type WorkforceScope = 'main_oeuvre' | 'chauffeur' | 'all';

export function workforceListPath(scope: WorkforceScope): string {
  if (scope === 'chauffeur') return '/chauffeurs';
  if (scope === 'all') return '/main-oeuvre';
  return '/main-oeuvre';
}

export function workforceDetailPath(scope: WorkforceScope, id: string): string {
  return `${workforceListPath(scope)}/${id}`;
}

export function workforceDetailPathForCategory(category: string | null | undefined, id: string): string {
  return category === CHAUFFEUR_CATEGORY ? `/chauffeurs/${id}` : `/main-oeuvre/${id}`;
}

export function scopeQueryParams(scope: WorkforceScope): Record<string, string> {
  if (scope === 'chauffeur') return { category: CHAUFFEUR_CATEGORY };
  if (scope === 'all') return {};
  return { excludeCategory: CHAUFFEUR_CATEGORY };
}
