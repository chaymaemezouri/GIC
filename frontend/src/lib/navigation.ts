/** Indique si l'historique React Router permet un retour arrière dans la session. */
export function canGoBackInApp(): boolean {
  const idx = window.history.state?.idx;
  return typeof idx === 'number' && idx > 0;
}

/** Retourne vers la page précédente, ou vers fallbackTo si l'historique est vide. */
export function goBackOrFallback(
  navigate: (delta: number) => void,
  fallbackNavigate: (path: string) => void,
  fallbackTo?: string,
) {
  if (canGoBackInApp()) {
    navigate(-1);
    return;
  }
  if (fallbackTo) {
    fallbackNavigate(fallbackTo);
    return;
  }
  navigate(-1);
}
