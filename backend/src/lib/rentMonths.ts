/** Helpers mois de loyer (location) */

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Libellé FR : « Juin 2026 » */
export function monthLabelFr(d: Date): string {
  const s = new Intl.DateTimeFormat('fr-MA', { month: 'long', year: 'numeric' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Liste des 1ers du mois de start → end inclus.
 * Si end est null : jusqu'à currentMonth + horizonMonths (défaut 6), min 1 mois.
 */
export function iterRentMonths(
  start: Date,
  end: Date | null | undefined,
  horizonMonths = 6,
  maxMonths = 60,
): Date[] {
  const from = startOfMonth(start);
  let to: Date;
  if (end) {
    to = startOfMonth(end);
  } else {
    const horizon = addMonths(startOfMonth(new Date()), horizonMonths);
    to = horizon < from ? from : horizon;
  }
  if (to < from) to = from;

  const out: Date[] = [];
  let cur = from;
  while (cur <= to && out.length < maxMonths) {
    out.push(new Date(cur));
    cur = addMonths(cur, 1);
  }
  return out;
}
