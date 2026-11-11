export const RIB_MAX_DIGITS = 24;

/** Chiffres seulement, 24 au maximum. */
export function clampRib(value: string) {
  return value.replace(/\D/g, '').slice(0, RIB_MAX_DIGITS);
}
