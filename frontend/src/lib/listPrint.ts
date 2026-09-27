import { api } from './api';
import { escHtml, printWithCompany } from './companyPrint';
import { tStatic } from '../i18n/I18nContext';

export type PrintColumn<T> = {
  label: string;
  value: (row: T) => unknown;
  align?: 'right' | 'center';
  /** Valeur affichée en pied de colonne (ex. somme formatée). */
  total?: (rows: T[]) => string;
};

export type PrintFilter = [label: string, value: unknown];

const MAX_PAGES = 500;

/**
 * Charge toutes les lignes d'une liste paginée avec les mêmes filtres que l'écran
 * (les paramètres `page` / `limit` fournis sont remplacés).
 */
export async function fetchAllRows<T>(path: string, params?: URLSearchParams | string, pageSize = 100): Promise<T[]> {
  const base = new URLSearchParams(params ?? '');
  base.delete('page');
  base.delete('limit');
  const rows: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    base.set('page', String(page));
    base.set('limit', String(pageSize));
    const sep = path.includes('?') ? '&' : '?';
    const res = await api<{ items?: T[]; pages?: number } | T[]>(`${path}${sep}${base}`);
    if (Array.isArray(res)) return res;
    const items = res.items || [];
    rows.push(...items);
    if (items.length === 0 || page >= (res.pages || 1)) break;
  }
  return rows;
}

function cell(value: unknown) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? tStatic('common.yes') : tStatic('common.no');
  return String(value);
}

function alignClass(align?: 'right' | 'center') {
  return align === 'right' ? ' class="r"' : align === 'center' ? ' class="c"' : '';
}

export function buildRowsTableHtml<T>(columns: PrintColumn<T>[], rows: T[]) {
  const hasTotals = columns.some((c) => c.total);
  const head = columns.map((c) => `<th${alignClass(c.align)}>${escHtml(c.label)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${columns.map((c) => `<td${alignClass(c.align)}>${escHtml(cell(c.value(row)))}</td>`).join('')}</tr>`)
    .join('');
  const foot = hasTotals
    ? `<tfoot><tr>${columns.map((c, i) => `<td${alignClass(c.align)}>${escHtml(c.total ? c.total(rows) : i === 0 ? tStatic('listPrint.total') : '')}</td>`).join('')}</tr></tfoot>`
    : '';
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`;
}

export function buildFiltersHtml(filters: PrintFilter[] = []) {
  const active = filters.filter(([, v]) => v != null && v !== '' && v !== false);
  if (active.length === 0) return '';
  return `<div class="print-filters"><span class="k">${escHtml(tStatic('listPrint.filters'))}</span>${active
    .map(([label, v]) => `<span><span class="k">${escHtml(label)} :</span> ${escHtml(String(v))}</span>`)
    .join('')}</div>`;
}

/**
 * Imprime une liste : la sélection si des lignes sont cochées, sinon toutes les lignes
 * correspondant aux filtres actifs (pas seulement la page affichée).
 */
export function printRows<T>({
  title,
  subtitle,
  filters,
  columns,
  rows,
  selectedCount = 0,
  landscape,
  extraHtml,
}: {
  title: string;
  subtitle?: string;
  filters?: PrintFilter[];
  columns: PrintColumn<T>[];
  rows: T[] | (() => Promise<T[]>);
  selectedCount?: number;
  landscape?: boolean;
  /** HTML ajouté avant le tableau (synthèse, totaux…), calculé sur les lignes imprimées. */
  extraHtml?: (rows: T[]) => string;
}) {
  return printWithCompany({
    title,
    subtitle,
    landscape: landscape ?? columns.length > 7,
    bodyHtml: async () => {
      const data = typeof rows === 'function' ? await rows() : rows;
      const count = selectedCount > 0
        ? tStatic('listPrint.selectedCount', { count: data.length })
        : tStatic('listPrint.rowCount', { count: data.length });
      return `${selectedCount > 0 ? '' : buildFiltersHtml(filters)}${extraHtml ? extraHtml(data) : ''}<p class="print-count">${escHtml(count)}</p>${
        data.length === 0 ? `<p class="muted">${escHtml(tStatic('listPrint.empty'))}</p>` : buildRowsTableHtml(columns, data)
      }`;
    },
  });
}
