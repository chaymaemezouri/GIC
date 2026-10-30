import { formatDate, formatMad } from './api';
import { escHtml, printWithCompany } from './companyPrint';
import { paymentModeLabel } from './paymentMode';

export async function printPaymentReceipt(payment: Record<string, unknown>) {
  const sale = payment.sale as { reference?: string; client?: { firstName: string; lastName: string } } | null;
  const rental = payment.rental as { reference?: string; client?: { firstName: string; lastName: string } } | null;
  const isSale = !!sale;
  const client = isSale ? sale?.client : rental?.client;
  const txRef = isSale ? sale?.reference : rental?.reference;
  const txType = isSale ? 'Vente' : 'Location';

  const nature = String(payment.nature || '');
  const natureLabel = /^loyer/i.test(nature) ? 'Mois payé' : 'Nature';
  const bodyHtml = `<div class="grid">
    <p><span class="k">N° reçu :</span> <strong>${escHtml(payment.receiptNo || '—')}</strong></p>
    <p><span class="k">Date :</span> ${escHtml(formatDate(String(payment.date || '')))}</p>
    <p><span class="k">Montant :</span> <strong>${escHtml(formatMad(Number(payment.amount || 0)))}</strong></p>
    <p><span class="k">Mode :</span> ${escHtml(paymentModeLabel(String(payment.operationType || '')))}</p>
    <p><span class="k">${escHtml(txType)} :</span> ${escHtml(txRef || '—')}</p>
    <p><span class="k">Client :</span> ${escHtml(client ? `${client.firstName} ${client.lastName}` : '—')}</p>
    ${payment.scheduleLabel ? `<p><span class="k">Échéance :</span> ${escHtml(payment.scheduleLabel)}</p>` : ''}
    ${payment.payerName ? `<p><span class="k">Payeur :</span> ${escHtml(payment.payerName)}</p>` : ''}
    ${payment.bank ? `<p><span class="k">Banque :</span> ${escHtml(payment.bank)}</p>` : ''}
    ${payment.operationNo ? `<p><span class="k">N° d'opération :</span> ${escHtml(payment.operationNo)}</p>` : ''}
    ${payment.internalRef ? `<p><span class="k">Réf. interne :</span> ${escHtml(payment.internalRef)}</p>` : ''}
    ${nature ? `<p><span class="k">${natureLabel} :</span> ${escHtml(nature)}</p>` : ''}
    ${payment.propertyName ? `<p><span class="k">Bien :</span> ${escHtml(payment.propertyName)}</p>` : ''}
  </div>`;
  return printWithCompany({
    title: (settings) => settings.receiptTitle || 'Reçu de paiement',
    bodyHtml,
    metaRight: String(payment.receiptNo || ''),
  });
}

export type ReceiptLine = {
  receiptNo?: string | null;
  date?: string | null;
  amount?: number | null;
  operationType?: string | null;
  nature?: string | null;
  ref?: string | null;
  propertyName?: string | null;
  type?: string | null;
};

/** Un seul document qui liste tous les paiements, en plus du reçu unitaire. */
export async function printPaymentsReceipt(input: {
  clientName?: string;
  reference?: string;
  propertyName?: string;
  lines: ReceiptLine[];
}) {
  const lines = [...input.lines].sort(
    (a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime(),
  );
  const total = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const rows = lines.map((line) => `<tr>
    <td>${escHtml(formatDate(String(line.date || '')))}</td>
    <td>${escHtml(line.type || '—')}</td>
    <td>${escHtml(line.nature || '—')}</td>
    <td>${escHtml(line.ref || '—')}${line.propertyName ? `<div class="muted">${escHtml(line.propertyName)}</div>` : ''}</td>
    <td class="mono">${escHtml(line.receiptNo || '—')}</td>
    <td>${escHtml(paymentModeLabel(line.operationType))}</td>
    <td class="r">${escHtml(formatMad(Number(line.amount || 0)))}</td>
  </tr>`).join('');
  const bodyHtml = `<div class="grid">
    ${input.clientName ? `<p><span class="k">Client :</span> <strong>${escHtml(input.clientName)}</strong></p>` : ''}
    ${input.reference ? `<p><span class="k">Dossier :</span> ${escHtml(input.reference)}</p>` : ''}
    ${input.propertyName ? `<p><span class="k">Bien :</span> ${escHtml(input.propertyName)}</p>` : ''}
    <p><span class="k">Nombre de paiements :</span> ${lines.length}</p>
  </div>
  <table>
    <thead><tr>
      <th>Date</th><th>Type</th><th>Mois payé</th><th>Référence</th><th>Reçu</th><th>Mode</th><th class="r">Montant</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="6">Total</td><td class="r">${escHtml(formatMad(total))}</td></tr></tfoot>
  </table>`;
  return printWithCompany({
    title: (settings) => settings.receiptTitle || 'Reçu des paiements',
    bodyHtml,
    metaRight: input.reference || '',
  });
}
