import { api } from './api';
import { fileUrl } from './photoUrl';

export type CompanyPrintSettings = {
  companyName?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  ice?: string | null;
  rc?: string | null;
  logoPath?: string | null;
  printDocSubtitle?: string | null;
  printFooterText?: string | null;
  printLegalMentions?: string | null;
  printPrimaryColor?: string | null;
  printShowLogo?: boolean | null;
  receiptTitle?: string | null;
  bankLetterTitle?: string | null;
  bankLetterIntro?: string | null;
  bankLetterFooter?: string | null;
};

let settingsCache: CompanyPrintSettings | null = null;
let settingsRequest: Promise<CompanyPrintSettings> | null = null;

export async function fetchCompanySettings(): Promise<CompanyPrintSettings> {
  if (settingsCache) return settingsCache;
  if (!settingsRequest) {
    settingsRequest = api<CompanyPrintSettings>('/settings/company')
      .then((settings) => (settingsCache = settings))
      .finally(() => { settingsRequest = null; });
  }
  return settingsRequest;
}

export function invalidateCompanySettings() {
  settingsCache = null;
  settingsRequest = null;
}

export function escHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Normalizes the body from older inline print templates while pages migrate to
 * the shared company print shell.
 */
export function extractLegacyPrintBody(html: string, options: { grid?: boolean } = {}): string {
  let body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  body = body
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/i, options.grid ? '<h2>$1</h2>' : '');
  if (options.grid) {
    body = body
      .replace(/<(?:b|strong)>/gi, '<span class="k">')
      .replace(/<\/(?:b|strong)>/gi, '</span>');
  }
  return options.grid ? `<div class="grid">${body}</div>` : body;
}

export function formatPrintDate(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-MA', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function lineBreaks(value?: string | null) {
  return escHtml(value || '').replace(/\r?\n/g, '<br/>');
}

function safeColor(value?: string | null) {
  const color = (value || '').trim();
  return /^(#[0-9a-f]{3,8}|rgb\([\d\s,.%]+\)|hsl\([\d\s,.%]+\))$/i.test(color) ? color : '#007aff';
}

export type BuildPrintDocumentOptions = {
  title: string;
  subtitle?: string;
  bodyHtml: string;
  metaRight?: string;
  settings?: CompanyPrintSettings;
  landscape?: boolean;
};

export function buildPrintDocumentHtml({
  title,
  subtitle,
  bodyHtml,
  metaRight,
  settings = {},
  landscape = false,
}: BuildPrintDocumentOptions): string {
  const company = settings.companyName || 'GIC — Expertise & Consulting';
  const accent = safeColor(settings.printPrimaryColor);
  const identity = [
    [settings.address, settings.city].filter(Boolean).join(', '),
    settings.phone ? `Tél. ${settings.phone}` : '',
    settings.email,
    settings.ice ? `ICE ${settings.ice}` : '',
    settings.rc ? `RC ${settings.rc}` : '',
  ].filter(Boolean);
  const showLogo = settings.printShowLogo !== false && Boolean(settings.logoPath);
  const logo = showLogo
    ? `<img class="company-logo" src="${escHtml(fileUrl(settings.logoPath!))}" alt="Logo"/>`
    : '';
  const effectiveSubtitle = subtitle || settings.printDocSubtitle || '';

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<title>${escHtml(title)}</title>
<style>
  @page{size:A4${landscape ? ' landscape' : ''};margin:14mm 13mm 16mm}
  *{box-sizing:border-box}
  :root{--accent:${accent};--ink:#1d1d1f;--muted:#666;--line:#d9d9de;--soft:#f7f7f9}
  body{margin:0;color:var(--ink);font:11px/1.45 "Segoe UI",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .print-sheet{max-width:${landscape ? '271mm' : '184mm'};margin:0 auto}
  .print-filters{display:flex;flex-wrap:wrap;gap:4px 14px;padding:8px 10px;margin:0 0 6px;background:var(--soft);border:1px solid var(--line);border-radius:8px;font-size:10px}
  .print-filters .k{font-weight:600}.print-count{color:var(--muted);font-size:10px;margin:6px 0 0}
  tfoot td{font-weight:700;background:var(--soft);border-top:1.5px solid var(--accent)}.r{text-align:right;white-space:nowrap}.c{text-align:center}
  .accent{height:4px;background:var(--accent);border-radius:4px;margin-bottom:13px}
  .company-header{display:flex;align-items:flex-start;gap:13px;padding-bottom:12px;border-bottom:1px solid var(--line)}
  .company-logo{width:62px;height:62px;object-fit:contain;flex:0 0 auto}
  .company-brand{min-width:0;flex:1}.company-name{font-size:18px;font-weight:700;letter-spacing:-.02em;margin:0 0 3px}
  .company-details{color:var(--muted);font-size:9.5px}.company-details span+span:before{content:" · "}
  .header-meta{text-align:right;color:var(--muted);font-size:10px;max-width:35%;white-space:pre-line}
  .document-heading{padding:15px 0 12px}.document-heading h1{font-size:20px;line-height:1.2;margin:0;color:var(--ink)}
  .document-subtitle{margin:4px 0 0;color:var(--muted);font-size:11px}
  h2{font-size:13px;margin:18px 0 7px;padding-bottom:4px;border-bottom:1px solid var(--line)}
  p{margin:6px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:5px 16px}.grid>h2,.grid>h3,.grid>h4,.grid>table,.grid>ul{grid-column:1/-1}.k{color:var(--muted)}
  table{width:100%;border-collapse:collapse;margin-top:8px;font-size:9.5px}
  th{text-align:left;text-transform:uppercase;letter-spacing:.025em;color:#555;background:var(--soft);border-bottom:1.5px solid var(--accent);padding:6px}
  td{padding:6px;border-bottom:1px solid #e8e8ec;vertical-align:top}tbody tr:nth-child(even){background:#fcfcfd}
  .mono{font-family:Consolas,monospace}.muted{color:var(--muted)}.intro{white-space:pre-wrap;margin-bottom:16px}
  .print-footer{margin-top:20px;padding-top:9px;border-top:1px solid var(--line);display:flex;gap:12px;justify-content:space-between;color:var(--muted);font-size:9px}
  .footer-copy{max-width:72%}.legal{margin-top:3px}.printed-at{white-space:nowrap;text-align:right}
  .sign{margin:26px 0 8px;text-align:right}.sign-box{display:inline-block;width:210px;text-align:center;color:var(--muted)}.sign-line{margin-top:45px;border-top:1px solid var(--ink);padding-top:5px}
  .sign-slots{display:flex;justify-content:space-between;gap:16px;margin-top:28px}.sign-slot{flex:1;max-width:200px;text-align:center;color:var(--muted);font-size:10px}
  .toolbar{display:flex;gap:8px;margin:0 0 12px}.toolbar button{border:1px solid var(--line);background:white;border-radius:7px;padding:7px 12px;cursor:pointer}
  @media print{.toolbar{display:none}.print-sheet{max-width:none}tr{break-inside:avoid}h2{break-after:avoid}}
</style></head><body><main class="print-sheet">
  <div class="toolbar"><button onclick="window.print()">Imprimer / PDF</button><button onclick="window.close()">Fermer</button></div>
  <div class="accent"></div>
  <header class="company-header">${logo}<div class="company-brand"><div class="company-name">${escHtml(company)}</div><div class="company-details">${identity.map((item) => `<span>${escHtml(item)}</span>`).join('')}</div></div>
    <div class="header-meta">${metaRight ? escHtml(metaRight) : escHtml(formatPrintDate())}</div>
  </header>
  <section class="document-heading"><h1>${escHtml(title)}</h1>${effectiveSubtitle ? `<p class="document-subtitle">${escHtml(effectiveSubtitle)}</p>` : ''}</section>
  <section class="document-body">${bodyHtml}</section>
  <footer class="print-footer"><div class="footer-copy">${settings.printFooterText ? `<div>${lineBreaks(settings.printFooterText)}</div>` : ''}${settings.printLegalMentions ? `<div class="legal">${lineBreaks(settings.printLegalMentions)}</div>` : ''}</div><div class="printed-at">Imprimé le ${escHtml(formatPrintDate())}</div></footer>
</main></body></html>`;
}

export function openPrintWindow(html: string): Window | null {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return null;
  writePrintWindow(printWindow, html);
  return printWindow;
}

function writePrintWindow(printWindow: Window, html: string) {
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.addEventListener('load', () => {
    printWindow.focus();
    printWindow.print();
  }, { once: true });
}

export async function printWithCompany(
  opts: Omit<BuildPrintDocumentOptions, 'settings' | 'title' | 'bodyHtml'> & {
    title: string | ((settings: CompanyPrintSettings) => string);
    /** A loader lets the popup open synchronously while rows are fetched. */
    bodyHtml: string | (() => Promise<string>);
  },
) {
  // Open synchronously from the click handler so browsers do not block the popup
  // while company settings are being fetched.
  const printWindow = window.open('', '_blank');
  if (!printWindow) return null;
  printWindow.document.write('<p style="font:13px Segoe UI,sans-serif;padding:24px">Préparation du document…</p>');
  try {
    const [settings, bodyHtml] = await Promise.all([
      fetchCompanySettings(),
      typeof opts.bodyHtml === 'function' ? opts.bodyHtml() : Promise.resolve(opts.bodyHtml),
    ]);
    const title = typeof opts.title === 'function' ? opts.title(settings) : opts.title;
    writePrintWindow(printWindow, buildPrintDocumentHtml({ ...opts, bodyHtml, title, settings }));
    return printWindow;
  } catch (error) {
    printWindow.close();
    throw error;
  }
}

export async function printSimpleTable({
  title,
  columns,
  rows,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: Array<Array<unknown>>;
}) {
  const bodyHtml = `<table><thead><tr>${columns.map((column) => `<th>${escHtml(column)}</th>`).join('')}</tr></thead><tbody>${
    rows.map((row) => `<tr>${row.map((cell) => `<td>${escHtml(cell ?? '—')}</td>`).join('')}</tr>`).join('')
  }</tbody></table>`;
  return printWithCompany({ title, subtitle, bodyHtml });
}
