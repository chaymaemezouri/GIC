import {
  buildPrintDocumentHtml,
  escHtml,
  openPrintWindow,
  type CompanyPrintSettings,
} from './companyPrint';

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

export type { CompanyPrintSettings } from './companyPrint';

function nl2br(s: string) {
  return escHtml(s).replace(/\n/g, '<br/>');
}

/** Impression pro — lettre banque + liste Nom / CIN / Banque / RIB */
export function printBankTransferList(
  people: BankTransferPerson[],
  settings: CompanyPrintSettings,
  opts?: { periodLabel?: string; bankFilter?: string },
) {
  const title = settings.bankLetterTitle || 'Demande de virement de salaires';
  const intro =
    settings.bankLetterIntro ||
    'Madame, Monsieur,\n\nNous vous prions de bien vouloir procéder au virement des salaires au profit des bénéficiaires dont la liste figure ci-après.';
  const footer = settings.bankLetterFooter || '';
  const rows = people
    .map(
      (p, i) => `<tr>
      <td class="n">${i + 1}</td>
      <td><strong>${escHtml(p.lastName || '')}</strong> ${escHtml(p.firstName || '')}</td>
      <td class="mono">${escHtml(p.cin || '—')}</td>
      <td>${escHtml(p.bankName || '—')}</td>
      <td class="mono"><strong>${escHtml(p.rib || '—')}</strong></td>
      <td class="muted">${escHtml(p.source === 'equipe' ? 'Équipe' : 'Ouvrier')}${p.category ? ` · ${escHtml(p.category)}` : ''}</td>
    </tr>`,
    )
    .join('');

  const bodyHtml = `
    ${opts?.bankFilter ? `<p class="muted">Banque filtrée : <strong>${escHtml(opts.bankFilter)}</strong></p>` : ''}
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
    <p class="muted">${people.length} bénéficiaire${people.length > 1 ? 's' : ''} — document destiné à l’établissement bancaire</p>

    ${footer ? `<div class="muted">${nl2br(footer)}</div>` : ''}

    <div class="sign">
      <div class="sign-box">
        Cachet &amp; signature du promoteur
        <div class="sign-line">${escHtml(settings.companyName || 'GIC — Expertise & Consulting')}</div>
      </div>
    </div>`;
  return openPrintWindow(buildPrintDocumentHtml({
    title,
    bodyHtml,
    metaRight: opts?.periodLabel ? `Période : ${opts.periodLabel}` : undefined,
    settings,
  }));
}
