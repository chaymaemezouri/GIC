import { fileUrl } from './documentDisplay';

export type BankTransferPerson = {
  id: string;
  source: 'ouvrier' | 'equipe';
  firstName: string;
  lastName: string;
  cin?: string | null;
  bankName?: string | null;
  rib?: string | null;
  category?: string | null;
};

export type CompanyPrintSettings = {
  companyName?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  ice?: string | null;
  rc?: string | null;
  logoPath?: string | null;
  bankLetterTitle?: string | null;
  bankLetterIntro?: string | null;
  bankLetterFooter?: string | null;
};

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(s: string) {
  return esc(s).replace(/\n/g, '<br/>');
}

/** Impression pro — lettre banque + liste Nom / CIN / Banque / RIB */
export function printBankTransferList(
  people: BankTransferPerson[],
  settings: CompanyPrintSettings,
  opts?: { periodLabel?: string; bankFilter?: string },
) {
  const w = window.open('', '_blank');
  if (!w) return;

  const title = settings.bankLetterTitle || 'Demande de virement de salaires';
  const intro =
    settings.bankLetterIntro ||
    'Madame, Monsieur,\n\nNous vous prions de bien vouloir procéder au virement des salaires au profit des bénéficiaires dont la liste figure ci-après.';
  const footer = settings.bankLetterFooter || '';
  const company = settings.companyName || 'GIC — Expertise & Consulting';
  const today = new Intl.DateTimeFormat('fr-MA', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const logoSrc = settings.logoPath ? fileUrl(settings.logoPath) : '';
  const metaParts = [
    settings.address,
    settings.city,
    settings.phone ? `Tél. ${settings.phone}` : '',
    settings.email,
    settings.ice ? `ICE ${settings.ice}` : '',
    settings.rc ? `RC ${settings.rc}` : '',
  ].filter(Boolean);

  const rows = people
    .map(
      (p, i) => `<tr>
      <td class="n">${i + 1}</td>
      <td><strong>${esc(p.lastName || '')}</strong> ${esc(p.firstName || '')}</td>
      <td class="mono">${esc(p.cin || '—')}</td>
      <td>${esc(p.bankName || '—')}</td>
      <td class="mono rib">${esc(p.rib || '—')}</td>
      <td class="muted">${esc(p.source === 'equipe' ? 'Équipe' : 'Ouvrier')}${p.category ? ` · ${esc(p.category)}` : ''}</td>
    </tr>`,
    )
    .join('');

  w.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: #1d1d1f;
      font-size: 11.5px;
      line-height: 1.45;
      margin: 0;
    }
    .sheet { max-width: 190mm; margin: 0 auto; }
    .header {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      border-bottom: 2px solid #1d1d1f;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .logo {
      width: 72px; height: 72px;
      object-fit: contain;
      border-radius: 8px;
      background: #f5f5f7;
      flex-shrink: 0;
    }
    .logo-ph {
      width: 72px; height: 72px;
      border-radius: 8px;
      background: #f5f5f7;
      border: 1px dashed #d2d2d7;
      display: flex; align-items: center; justify-content: center;
      color: #86868b; font-size: 10px; font-weight: 600;
      flex-shrink: 0;
    }
    .brand h1 {
      margin: 0 0 4px;
      font-size: 18px;
      letter-spacing: -0.02em;
      font-weight: 700;
    }
    .brand .meta { color: #636366; font-size: 10.5px; }
    .doc-meta {
      margin-left: auto;
      text-align: right;
      font-size: 10.5px;
      color: #636366;
      min-width: 140px;
    }
    .doc-meta strong { display: block; color: #1d1d1f; font-size: 12px; margin-bottom: 4px; }
    h2 {
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: 650;
      letter-spacing: -0.01em;
    }
    .intro {
      margin: 0 0 18px;
      white-space: pre-wrap;
      font-size: 11.5px;
      color: #3a3a3c;
    }
    .filters {
      margin: -8px 0 14px;
      font-size: 10.5px;
      color: #86868b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
    }
    thead th {
      text-align: left;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #636366;
      border-bottom: 1.5px solid #d2d2d7;
      padding: 8px 6px;
      background: #fafafa;
    }
    tbody td {
      padding: 8px 6px;
      border-bottom: 1px solid #e8e8ed;
      vertical-align: top;
    }
    tbody tr:nth-child(even) td { background: #fcfcfd; }
    .n { width: 28px; color: #86868b; }
    .mono { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 10.5px; letter-spacing: 0.02em; }
    .rib { font-weight: 600; }
    .muted { color: #86868b; font-size: 10px; }
    .footer {
      margin-top: 22px;
      padding-top: 12px;
      border-top: 1px solid #d2d2d7;
      font-size: 10.5px;
      color: #636366;
      white-space: pre-wrap;
    }
    .sign {
      margin-top: 28px;
      display: flex;
      justify-content: flex-end;
    }
    .sign-box {
      width: 220px;
      text-align: center;
      font-size: 10.5px;
      color: #636366;
    }
    .sign-box .line {
      margin-top: 48px;
      border-top: 1px solid #1d1d1f;
      padding-top: 6px;
    }
    .count {
      margin-top: 10px;
      font-size: 10.5px;
      color: #636366;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      ${logoSrc ? `<img class="logo" src="${esc(logoSrc)}" alt="Logo"/>` : `<div class="logo-ph">LOGO</div>`}
      <div class="brand">
        <h1>${esc(company)}</h1>
        <div class="meta">${metaParts.map(esc).join(' · ') || '—'}</div>
      </div>
      <div class="doc-meta">
        <strong>${esc(title)}</strong>
        ${esc(today)}
        ${opts?.periodLabel ? `<div>Période : ${esc(opts.periodLabel)}</div>` : ''}
      </div>
    </div>

    <h2>${esc(title)}</h2>
    ${opts?.bankFilter ? `<p class="filters">Banque filtrée : <strong>${esc(opts.bankFilter)}</strong></p>` : ''}
    <div class="intro">${nl2br(intro)}</div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Nom &amp; prénom</th>
          <th>CIN</th>
          <th>Banque</th>
          <th>RIB</th>
          <th>Type</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="6" class="muted">Aucun bénéficiaire sélectionné</td></tr>`}
      </tbody>
    </table>
    <p class="count">${people.length} bénéficiaire${people.length > 1 ? 's' : ''} — document destiné à l’établissement bancaire</p>

    ${footer ? `<div class="footer">${nl2br(footer)}</div>` : ''}

    <div class="sign">
      <div class="sign-box">
        Cachet &amp; signature du promoteur
        <div class="line">${esc(company)}</div>
      </div>
    </div>
  </div>
  <script>window.onload = function(){ window.print(); }</script>
</body>
</html>`);
  w.document.close();
}
