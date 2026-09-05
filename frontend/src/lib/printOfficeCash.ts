import { officePurposeLabel } from '../components/OfficeCashFormFields';
import { formatDate, formatMad } from './api';

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

export function printOfficeCashReceipt(m: OfficeRow) {
  const debit = m.direction === 'sortie' ? Number(m.amount || 0) : 0;
  const credit = m.direction === 'entree' ? Number(m.amount || 0) : 0;
  const reconnu = displayReconnu(m);
  const html = `<html><body style="font-family:sans-serif;padding:24px;font-size:12px">
    <h2>GIC — Caisse bureau</h2>
    <p><b>Date:</b> ${formatDate(m.date as string)}</p>
    <p><b>Désignation:</b> ${m.designation || '—'}</p>
    <p><b>Reconnu:</b> ${reconnu}</p>
    <p><b>Motif:</b> ${officePurposeLabel(m.purpose)}</p>
    ${m.workLabel ? `<p><b>Travail:</b> ${m.workLabel}</p>` : ''}
    ${m.chantier ? `<p><b>Chantier:</b> ${m.chantier.name || ''}</p>` : ''}
    <p><b>Débit:</b> ${debit ? formatMad(debit) : '—'}</p>
    <p><b>Crédit:</b> ${credit ? formatMad(credit) : '—'}</p>
    ${m.remark ? `<p><b>Remarque:</b> ${m.remark}</p>` : ''}
    <p><b>Pièce jointe:</b> ${m.proofFile ? 'Oui' : 'Non'}</p>
    <p>Imprimé le ${new Date().toLocaleDateString('fr-MA')}</p>
  </body></html>`;
  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.print();
  }
}

export function printOfficeCashList(
  items: OfficeRow[],
  totals: { sorties: number; entrees: number; solde: number }
) {
  const rows = items.map((m) => {
    const debit = m.direction === 'sortie' ? Number(m.amount || 0) : 0;
    const credit = m.direction === 'entree' ? Number(m.amount || 0) : 0;
    const reconnu = displayReconnu(m);
    return `<tr>
      <td>${formatDate(m.date as string)}</td>
      <td>${m.designation || '—'}</td>
      <td>${reconnu}</td>
      <td>${officePurposeLabel(m.purpose)}</td>
      <td>${debit ? formatMad(debit) : '—'}</td>
      <td>${credit ? formatMad(credit) : '—'}</td>
      <td>${m.remark || '—'}</td>
    </tr>`;
  }).join('');
  const html = `<html><body style="font-family:sans-serif;padding:24px;font-size:12px">
    <h1>Caisse bureau — GIC</h1>
    <p>Débit: ${formatMad(totals.sorties)} · Crédit: ${formatMad(totals.entrees)} · Solde: ${formatMad(totals.solde)}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
      <tr><th>Date</th><th>Désignation</th><th>Reconnu</th><th>Motif</th><th>Débit</th><th>Crédit</th><th>Remarque</th></tr>
      ${rows}
    </table>
  </body></html>`;
  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.print();
  }
}
