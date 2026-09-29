import type { CompanyPrintSettings } from './companySettings.js';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function lineBreaks(value?: string | null) {
  return esc(value || '').replace(/\r?\n/g, '<br/>');
}

function safeColor(value?: string | null) {
  const color = (value || '').trim();
  return /^(#[0-9a-f]{3,8}|rgb\([\d\s,.%]+\)|hsl\([\d\s,.%]+\))$/i.test(color) ? color : '#007aff';
}

function formatPrintDate(value: Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-MA', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(value);
}

export function wrapCompanyPrintHtml(opts: {
  title: string;
  subtitle?: string;
  bodyHtml: string;
  metaRight?: string;
  settings: CompanyPrintSettings;
}): string {
  const { title, bodyHtml, metaRight, settings } = opts;
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
    ? `<img class="company-logo" src="${esc(settings.logoPath)}" alt="Logo"/>`
    : '';
  const effectiveSubtitle = opts.subtitle || settings.printDocSubtitle || '';

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<title>${esc(title)}</title>
<style>
  @page{size:A4;margin:14mm 13mm 16mm}
  *{box-sizing:border-box}
  :root{--accent:${accent};--ink:#1d1d1f;--muted:#666;--line:#d9d9de;--soft:#f7f7f9}
  body{margin:0;color:var(--ink);font:11px/1.45 "Segoe UI",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .print-sheet{max-width:184mm;margin:0 auto;padding:16px}
  .accent{height:4px;background:var(--accent);border-radius:4px;margin-bottom:13px}
  .company-header{display:flex;align-items:flex-start;gap:13px;padding-bottom:12px;border-bottom:1px solid var(--line)}
  .company-logo{width:62px;height:62px;object-fit:contain;flex:0 0 auto}
  .company-brand{min-width:0;flex:1}.company-name{font-size:18px;font-weight:700;letter-spacing:-.02em;margin:0 0 3px}
  .company-details{color:var(--muted);font-size:9.5px}.company-details span+span:before{content:" · "}
  .header-meta{text-align:right;color:var(--muted);font-size:10px;max-width:35%;white-space:pre-line}
  .document-heading{padding:15px 0 12px}.document-heading h1{font-size:20px;line-height:1.2;margin:0;color:var(--ink)}
  .document-subtitle{margin:4px 0 0;color:var(--muted);font-size:11px}
  h2{font-size:13px;margin:18px 0 7px;padding-bottom:4px;border-bottom:1px solid var(--line)}
  p{margin:6px 0}.info p{margin:4px 0}
  table{width:100%;border-collapse:collapse;margin-top:8px;font-size:9.5px}
  th{text-align:left;text-transform:uppercase;letter-spacing:.025em;color:#555;background:var(--soft);border-bottom:1.5px solid var(--accent);padding:6px}
  td{padding:6px;border-bottom:1px solid #e8e8ec;vertical-align:top}tbody tr:nth-child(even){background:#fcfcfd}
  .mono{font-family:Consolas,monospace}.muted{color:var(--muted)}.totals{margin-top:14px}.totals p{margin:4px 0}
  .total{font-weight:700;text-align:right;margin-top:12px}
  .print-footer{margin-top:20px;padding-top:9px;border-top:1px solid var(--line);display:flex;gap:12px;justify-content:space-between;color:var(--muted);font-size:9px}
  .footer-copy{max-width:72%}.legal{margin-top:3px}.printed-at{white-space:nowrap;text-align:right}
  .sign{margin:26px 0 8px;text-align:right}.sign-box{display:inline-block;width:210px;text-align:center;color:var(--muted)}.sign-line{margin-top:45px;border-top:1px solid var(--ink);padding-top:5px}
  .sign-slots{display:flex;justify-content:space-between;gap:16px;margin-top:28px}.sign-slot{flex:1;max-width:200px;text-align:center;color:var(--muted);font-size:10px}
  .toolbar{display:flex;gap:8px;margin:0 0 12px}.toolbar button{border:1px solid var(--line);background:white;border-radius:7px;padding:7px 12px;cursor:pointer}
  @media print{.toolbar{display:none}.print-sheet{max-width:none;padding:0}tr{break-inside:avoid}h2{break-after:avoid}}
</style></head><body><main class="print-sheet">
  <div class="toolbar"><button onclick="window.print()">Imprimer / PDF</button><button onclick="window.close()">Fermer</button></div>
  <div class="accent"></div>
  <header class="company-header">${logo}<div class="company-brand"><div class="company-name">${esc(company)}</div><div class="company-details">${identity.map((item) => `<span>${esc(item)}</span>`).join('')}</div></div>
    <div class="header-meta">${metaRight ? esc(metaRight) : esc(formatPrintDate())}</div>
  </header>
  <section class="document-heading"><h1>${esc(title)}</h1>${effectiveSubtitle ? `<p class="document-subtitle">${esc(effectiveSubtitle)}</p>` : ''}</section>
  <section class="document-body">${bodyHtml}</section>
  <footer class="print-footer"><div class="footer-copy">${settings.printFooterText ? `<div>${lineBreaks(settings.printFooterText)}</div>` : ''}${settings.printLegalMentions ? `<div class="legal">${lineBreaks(settings.printLegalMentions)}</div>` : ''}</div><div class="printed-at">Imprimé le ${esc(formatPrintDate())}</div></footer>
</main></body></html>`;
}
