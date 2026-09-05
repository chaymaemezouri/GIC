import { formatDate, formatMad } from './api';

export function printPaymentReceipt(payment: Record<string, unknown>) {
  const sale = payment.sale as { reference?: string; client?: { firstName: string; lastName: string } } | null;
  const rental = payment.rental as { reference?: string; client?: { firstName: string; lastName: string } } | null;
  const isSale = !!sale;
  const client = isSale ? sale?.client : rental?.client;
  const txRef = isSale ? sale?.reference : rental?.reference;
  const txType = isSale ? 'Vente' : 'Location';

  const html = `<html><body style="font-family:sans-serif;padding:24px;font-size:12px">
    <h2>GIC — Reçu de paiement</h2>
    <p><b>N° reçu :</b> ${payment.receiptNo}</p>
    <p><b>Date :</b> ${formatDate(String(payment.date || ''))}</p>
    <p><b>Montant :</b> ${formatMad(Number(payment.amount || 0))}</p>
    <p><b>Mode :</b> ${payment.operationType || '—'}</p>
    <p><b>${txType} :</b> ${txRef || '—'}</p>
    <p><b>Client :</b> ${client ? `${client.firstName} ${client.lastName}` : '—'}</p>
    ${payment.payerName ? `<p><b>Payeur :</b> ${payment.payerName}</p>` : ''}
    ${payment.bank ? `<p><b>Banque / réf. :</b> ${payment.bank}</p>` : ''}
    ${payment.nature ? `<p><b>Nature :</b> ${payment.nature}</p>` : ''}
    <p style="margin-top:24px;font-size:11px;color:#666">Expertise & Consulting — GIC</p>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.print();
  }
}
