import { formatDate, formatMad } from './api';
import { escHtml, printWithCompany } from './companyPrint';

export async function printPaymentReceipt(payment: Record<string, unknown>) {
  const sale = payment.sale as { reference?: string; client?: { firstName: string; lastName: string } } | null;
  const rental = payment.rental as { reference?: string; client?: { firstName: string; lastName: string } } | null;
  const isSale = !!sale;
  const client = isSale ? sale?.client : rental?.client;
  const txRef = isSale ? sale?.reference : rental?.reference;
  const txType = isSale ? 'Vente' : 'Location';

  const bodyHtml = `<div class="grid">
    <p><span class="k">N° reçu :</span> <strong>${escHtml(payment.receiptNo || '—')}</strong></p>
    <p><span class="k">Date :</span> ${escHtml(formatDate(String(payment.date || '')))}</p>
    <p><span class="k">Montant :</span> <strong>${escHtml(formatMad(Number(payment.amount || 0)))}</strong></p>
    <p><span class="k">Mode :</span> ${escHtml(payment.operationType || '—')}</p>
    <p><span class="k">${escHtml(txType)} :</span> ${escHtml(txRef || '—')}</p>
    <p><span class="k">Client :</span> ${escHtml(client ? `${client.firstName} ${client.lastName}` : '—')}</p>
    ${payment.payerName ? `<p><span class="k">Payeur :</span> ${escHtml(payment.payerName)}</p>` : ''}
    ${payment.bank ? `<p><span class="k">Banque / réf. :</span> ${escHtml(payment.bank)}</p>` : ''}
    ${payment.nature ? `<p><span class="k">Nature :</span> ${escHtml(payment.nature)}</p>` : ''}
  </div>`;
  return printWithCompany({
    title: (settings) => settings.receiptTitle || 'Reçu de paiement',
    bodyHtml,
    metaRight: String(payment.receiptNo || ''),
  });
}
