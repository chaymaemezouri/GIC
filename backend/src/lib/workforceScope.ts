/** Catégorie workforce réservée aux chauffeurs (hors main-d'œuvre chantier). */
export const CHAUFFEUR_CATEGORY = 'Chauffeur';

export function workforceScopeFilters(category: string, excludeCategory: string) {
  return {
    AND: [
      category ? { category } : {},
      excludeCategory ? { NOT: { category: excludeCategory } } : {},
    ],
  };
}
