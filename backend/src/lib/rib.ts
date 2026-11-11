/** RIB marocain : 24 chiffres au maximum. Banque à côté du RIB. */
export const RIB_MAX_DIGITS = 24;

export function ribDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

/** Garde les chiffres uniquement. Vide → null. Plus de 24 chiffres → erreur. */
export function parseRib(value: unknown): { rib: string | null; error: string | null } {
  const digits = ribDigits(value);
  if (!digits) return { rib: null, error: null };
  if (digits.length > RIB_MAX_DIGITS) {
    return { rib: null, error: 'Le RIB ne doit pas dépasser 24 chiffres' };
  }
  return { rib: digits, error: null };
}

export function applyBankField(data: Record<string, unknown>) {
  if (!('bankName' in data)) return;
  const name = String(data.bankName ?? '').trim();
  data.bankName = name || null;
}

/** Normalise `data.rib` s'il est présent. Retourne le message d'erreur, sinon null. */
export function applyRibField(data: Record<string, unknown>): string | null {
  if (!('rib' in data)) return null;
  const parsed = parseRib(data.rib);
  if (parsed.error) return parsed.error;
  data.rib = parsed.rib;
  return null;
}
