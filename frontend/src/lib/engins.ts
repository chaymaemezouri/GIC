import type { TranslateFn } from '../i18n/types';

export const ENGIN_KINDS = ['engin', 'materiel'] as const;
export const ENGIN_STATUSES = [
  'disponible',
  'affecte',
  'en_utilisation',
  'en_exploitation',
  'en_instance',
  'en_panne',
  'en_maintenance',
  'en_reparation',
  'hors_service',
  'restitue',
] as const;
export const COSTING_SITE_STATUSES = ['en_exploitation', 'en_utilisation'] as const;
export const SITE_TOOL_STATUSES = ['en_exploitation', 'en_instance', 'en_panne', 'en_reparation', 'en_maintenance', 'disponible'] as const;
export const ASSIGNMENT_STATUSES = ['planifie', 'en_cours', 'a_retourner', 'termine'] as const;
export const RENTAL_UNITS = ['jour', 'semaine', 'mois', 'projet', 'tranche'] as const;
export const COST_METHODS = ['journalier', 'horaire', 'forfait'] as const;
export const DEPRECIATION_METHODS = ['lineaire', 'degressif'] as const;
export const MAINTENANCE_KINDS = ['entretien', 'reparation'] as const;
export const MAINTENANCE_TYPES = [
  'vidange',
  'filtres',
  'pneus',
  'graissage',
  'preventive',
  'controle_technique',
  'revision',
  'pieces',
  'autre',
] as const;
export const EXPENSE_CATEGORIES = [
  'carburant',
  'transport',
  'assurance',
  'taxes',
  'pneumatiques',
  'pieces',
  'main_oeuvre',
  'lavage',
  'gardiennage',
  'frais_admin',
  'autres',
] as const;
export const COST_CATEGORIES = ['amortissement', 'location', 'entretien', 'reparation', 'carburant', 'autres'] as const;
export const RETURN_CONDITIONS = ['bon', 'usure', 'a_reparer', 'hors_service'] as const;
export const PAYMENT_MODES = ['especes', 'virement', 'cheque', 'carte'] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number];

export type EnginRef = {
  id: string;
  code?: string | null;
  designation?: string | null;
  kind?: string | null;
  ownershipType?: string | null;
  brand?: string | null;
  genre?: string | null;
  model?: string | null;
  matricule?: string | null;
  status: string;
  counterUnit?: string | null;
  counterValue?: number | null;
};

export type ChantierRef = { id: string; name: string; projectId?: string | null };
export type TrancheRef = { id: string; name: string };

export type CostBucket = Record<CostCategory | 'total', number>;

export type Assignment = {
  id: string;
  enginId: string;
  enginLabel: string;
  engin?: EnginRef;
  chantierId: string | null;
  chantier?: { id: string; name: string } | null;
  projectId: string | null;
  project?: { id: string; name: string } | null;
  tranche: string | null;
  responsible: string | null;
  startDate: string;
  endDate: string | null;
  mode: string;
  costMethod: string;
  dailyCost: number;
  hourlyCost: number | null;
  flatAmount: number | null;
  extraCost: number;
  plannedCost: number;
  remark: string | null;
  suspendedFrom?: string | null;
  suspendedUntil?: string | null;
  returnedAt: string | null;
  returnCondition: string | null;
  returnCounter: number | null;
  returnRemark: string | null;
  status: string;
  plannedDays: number | null;
  elapsedDays: number;
  hours: number;
  actualCost: number;
  expensesShare: number;
  totalCost: number;
};

export type CostLine = {
  source: 'affectation' | 'entretien' | 'reparation' | 'carburant' | 'depense';
  sourceId: string;
  category: CostCategory;
  enginId: string;
  enginLabel: string;
  enginKind: string;
  mode: string;
  assignmentId: string | null;
  chantierId: string | null;
  chantierName: string | null;
  projectId: string | null;
  projectName: string | null;
  tranche: string | null;
  date: string;
  periodStart: string | null;
  periodEnd: string | null;
  days: number;
  hours: number;
  amount: number;
  allocation: 'affectation' | 'direct' | 'reparti' | 'non_impute';
  label: string;
};

export function enginLabel(e?: Partial<EnginRef> | null) {
  if (!e) return '—';
  const name = e.designation || [e.genre, e.brand].filter(Boolean).join(' ') || e.matricule || '—';
  return e.code ? `${e.code} — ${name}` : name;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function yearStartISO() {
  return `${new Date().getFullYear()}-01-01`;
}

export function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function isoDate(v?: string | null) {
  return v ? String(v).slice(0, 10) : '';
}

/** Jours calendaires inclusifs (01/10 → 20/10 = 20 j). */
export function inclusiveDays(from?: string | null, to?: string | null) {
  if (!from || !to) return 0;
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function num(v: string | number | null | undefined) {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Montant MAD avec 2 décimales (coûts journaliers, horaires). */
export function formatMad2(n: number | null | undefined) {
  return new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));
}

const STATUS_TONES: Record<string, string> = {
  disponible: 'mac-status mac-status-ok',
  affecte: 'mac-status mac-status-info',
  en_utilisation: 'mac-status mac-status-warn',
  en_exploitation: 'mac-status mac-status-warn',
  en_instance: 'mac-status mac-status-info',
  en_panne: 'mac-status mac-status-danger',
  en_maintenance: 'mac-status mac-status-danger',
  en_reparation: 'mac-status mac-status-danger',
  hors_service: 'mac-status',
  restitue: 'mac-status',
  planifie: 'mac-status mac-status-info',
  en_cours: 'mac-status mac-status-warn',
  a_retourner: 'mac-status mac-status-danger',
  termine: 'mac-status mac-status-ok',
};

export function fleetStatusClass(status?: string | null) {
  return STATUS_TONES[status || ''] || 'mac-status';
}

export function fleetStatusLabel(status: string | null | undefined, t: TranslateFn) {
  if (!status) return '—';
  const s = status === 'en_mission' ? 'en_utilisation' : status;
  const key = (ASSIGNMENT_STATUSES as readonly string[]).includes(s) ? `fleet.assignmentStatus.${s}` : `fleet.status.${s}`;
  const label = t(key);
  return label === key ? s.replace(/_/g, ' ') : label;
}

export function kindLabel(kind: string | null | undefined, t: TranslateFn) {
  return t(kind === 'materiel' ? 'fleet.kind.materiel' : 'fleet.kind.engin');
}

export function ownershipLabel(ownership: string | null | undefined, t: TranslateFn) {
  return t(ownership === 'loue' ? 'fleet.ownership.loue' : 'fleet.ownership.personnel');
}

export function chantierTrancheLabel(chantierName?: string | null, tranche?: string | null) {
  if (!chantierName) return '—';
  return tranche ? `${chantierName} — ${tranche}` : chantierName;
}

export function optionList<T extends string>(values: readonly T[], t: TranslateFn, prefix: string) {
  return values.map((v) => ({ value: v, label: t(`${prefix}.${v}`) }));
}

export function queryString(params: Record<string, string | number | null | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v != null) qs.set(k, String(v));
  }
  return qs.toString();
}

export function downloadRowsCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '\uFEFF' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}
