import { escHtml, printWithCompany } from './companyPrint';

export function standardTableHtml(intro: string, headers: string[], rows: string[][]) {
  const head = headers.map((h) => `<th>${escHtml(h)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')
    || '<tr><td colspan="6">—</td></tr>';
  return `<p style="margin:0 0 12px">${escHtml(intro)}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${signatureSlotsHtml()}`;
}

export function signatureSlotsHtml() {
  return `<div class="sign-slots"><div class="sign-slot">Établi par<div class="sign-line"></div></div><div class="sign-slot">Cachet et signature<div class="sign-line"></div></div><div class="sign-slot">Reçu par<div class="sign-line"></div></div></div>`;
}

export function printStandardTable(title: string, intro: string, headers: string[], rows: string[][]) {
  return printWithCompany({ title, bodyHtml: standardTableHtml(intro, headers, rows) });
}
