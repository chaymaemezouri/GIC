import { escHtml } from './companyPrint';

export type PrintSection = {
  id: string;
  label: string;
  hint?: string;
  html: string;
};

export function printFieldGrid(rows: Array<[string, unknown]>): string {
  return `<div class="grid">${rows
    .map(([label, value]) => {
      const text = value == null || String(value).trim() === '' ? '—' : String(value);
      return `<p><span class="k">${escHtml(label)} :</span> ${escHtml(text)}</p>`;
    })
    .join('')}</div>`;
}

export function printTable(headers: string[], rows: unknown[][], emptyLabel = '—'): string {
  if (!rows.length) return `<p class="muted">${escHtml(emptyLabel)}</p>`;
  return `<table><thead><tr>${headers.map((header) => `<th>${escHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => {
      const text = cell == null || String(cell).trim() === '' ? '—' : String(cell);
      return `<td>${escHtml(text)}</td>`;
    }).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

/** Chaque section cochée devient une feuille (saut de page). */
export function joinPrintSections(sections: PrintSection[]): string {
  return sections
    .map((section, index) => `<section class="${index ? 'sheet-page' : ''}"><h2>${escHtml(section.label)}</h2>${section.html}</section>`)
    .join('');
}
