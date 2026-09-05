/** Banques marocaines — liste commune (équipe interne, ouvriers mensuels, etc.) */
export const MAROC_BANKS = [
  'Attijariwafa Bank',
  'Banque Populaire',
  'Bank of Africa (BOA)',
  'CIH Bank',
  'Crédit Agricole du Maroc',
  'Crédit du Maroc',
  'BMCI',
  'Al Barid Bank',
  'Saham Bank',
  'CFG Bank',
] as const;

export type MarocBank = (typeof MAROC_BANKS)[number];

/** Options pour Select / MacSelect (valeur vide = non renseigné). */
export function marocBankSelectOptions(includeEmpty = true) {
  const opts = MAROC_BANKS.map((b) => ({ value: b, label: b }));
  return includeEmpty ? [{ value: '', label: '— Choisir une banque —' }, ...opts] : opts;
}
