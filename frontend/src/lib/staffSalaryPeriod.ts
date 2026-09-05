export const SALARY_PERIODS = ['mensuel', 'hebdomadaire', 'journalier', 'trimestriel', 'bihebdomadaire'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const SALARY_PERIOD_LABELS: Record<SalaryPeriod, string> = {
  mensuel: 'Mensuel',
  hebdomadaire: 'Hebdomadaire',
  journalier: 'Journalier',
  trimestriel: 'Trimestriel',
  bihebdomadaire: 'Bi-mensuel (2×/mois)',
};

export function salaryPeriodUnitLabel(period: string): string {
  switch (period) {
    case 'hebdomadaire':
      return 'semaine';
    case 'journalier':
      return 'jour';
    case 'trimestriel':
      return 'trimestre';
    case 'bihebdomadaire':
      return 'quinzaine';
    default:
      return 'mois';
  }
}

export function baseSalaryForPeriod(monthlyReference: number, period: string): number {
  switch (period) {
    case 'hebdomadaire':
      return Math.round((monthlyReference / 4.33) * 100) / 100;
    case 'journalier':
      return Math.round((monthlyReference / 22) * 100) / 100;
    case 'trimestriel':
      return Math.round(monthlyReference * 3 * 100) / 100;
    case 'bihebdomadaire':
      return Math.round((monthlyReference / 2) * 100) / 100;
    default:
      return monthlyReference;
  }
}

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export function periodDisplayLabel(
  year: number,
  month: number,
  week: number,
  period: string,
): string {
  const mm = String(month).padStart(2, '0');
  if (period === 'hebdomadaire' && week > 0) return `Semaine ${week} — ${mm}/${year}`;
  if (period === 'journalier' && week > 0) return `Jour ${week} — ${mm}/${year}`;
  if (period === 'bihebdomadaire' && week > 0) return `${week === 1 ? '1ère' : '2e'} quinzaine — ${mm}/${year}`;
  if (period === 'trimestriel') return `T${Math.ceil(month / 3)} — ${year}`;
  return `${MONTHS_FR[month - 1] || mm} ${year}`;
}

export function currentWeekOfMonth(d = new Date()): number {
  return Math.min(5, Math.ceil(d.getDate() / 7));
}

export function computeStaffNet(base: number, bonus = 0, deduction = 0, advance = 0) {
  const net = base + bonus - deduction - advance;
  return { net: Math.round(net * 100) / 100, brut: base + bonus };
}
