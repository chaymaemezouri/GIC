import { officePurposeLabel } from '../components/OfficeCashFormFields';
import { formatDate, formatMad } from './api';
import { escHtml, printSimpleTable, printWithCompany } from './companyPrint';

type OfficeRow = {
  date?: string;
  designation?: string;
  direction?: string;
  amount?: number;
  purpose?: string;
  remark?: string;
  proofFile?: string | null;
  reconnuName?: string | null;
  reconnu?: { firstName?: string; lastName?: string; reference?: string | null } | null;
  chantier?: { id: string; name: string; reference?: string } | null;
  workLabel?: string | null;
};

function displayReconnu(m: OfficeRow) {
  if (m.reconnu) {
    return `${m.reconnu.reference ? m.reconnu.reference + ' — ' : ''}${m.reconnu.firstName || ''} ${m.reconnu.lastName || ''}`.trim();
  }
  return m.reconnuName?.trim() || '—';
}

export async function printOfficeCashReceipt(m: OfficeRow) {
  const debit = m.direction === 'sortie' ? Number(m.amount || 0) : 0;
  const credit = m.direction === 'entree' ? Number(m.amount || 0) : 0;
  const reconnu = displayReconnu(m);
  const bodyHtml = `<div class="grid">
    <p><span class="k">Date :</span> ${escHtml(formatDate(m.date as string))}</p>
    <p><span class="k">Désignation :</span> ${escHtml(m.designation || '—')}</p>
    <p><span class="k">Reconnu :</span> ${escHtml(reconnu)}</p>
    <p><span class="k">Motif :</span> ${escHtml(officePurposeLabel(m.purpose))}</p>
    ${m.workLabel ? `<p><span class="k">Travail :</span> ${escHtml(m.workLabel)}</p>` : ''}
    ${m.chantier ? `<p><span class="k">Chantier :</span> ${escHtml(m.chantier.name || '')}</p>` : ''}
    <p><span class="k">Débit :</span> ${escHtml(debit ? formatMad(debit) : '—')}</p>
    <p><span class="k">Crédit :</span> ${escHtml(credit ? formatMad(credit) : '—')}</p>
    ${m.remark ? `<p><span class="k">Remarque :</span> ${escHtml(m.remark)}</p>` : ''}
    <p><span class="k">Pièce jointe :</span> ${m.proofFile ? 'Oui' : 'Non'}</p>
  </div>`;
  return printWithCompany({ title: 'Caisse bureau', bodyHtml });
}

export async function printOfficeCashList(
  items: OfficeRow[],
  totals: { sorties: number; entrees: number; solde: number }
) {
  const rows = items.map((m) => {
    const debit = m.direction === 'sortie' ? Number(m.amount || 0) : 0;
    const credit = m.direction === 'entree' ? Number(m.amount || 0) : 0;
    const reconnu = displayReconnu(m);
    return [
      formatDate(m.date as string), m.designation || '—', reconnu, officePurposeLabel(m.purpose),
      debit ? formatMad(debit) : '—', credit ? formatMad(credit) : '—', m.remark || '—',
    ];
  });
  return printSimpleTable({
    title: 'Caisse bureau',
    subtitle: `Débit : ${formatMad(totals.sorties)} · Crédit : ${formatMad(totals.entrees)} · Solde : ${formatMad(totals.solde)}`,
    columns: ['Date', 'Désignation', 'Reconnu', 'Motif', 'Débit', 'Crédit', 'Remarque'],
    rows,
  });
}
