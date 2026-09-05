/** Modules masqués temporairement — passer à `true` pour réactiver */
export const FEATURE_FLAGS = {
  comptabilite: true,
} as const;

export function isNavPathVisible(path: string): boolean {
  const base = path.split('?')[0];
  if (base === '/comptabilite' || base.startsWith('/comptabilite/')) {
    return FEATURE_FLAGS.comptabilite;
  }
  return true;
}
