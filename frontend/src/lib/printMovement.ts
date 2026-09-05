import { formatDate, formatMad } from './api';

export function printMovementReceipt(m: Record<string, unknown>) {
  const account = m.account as { name?: string } | undefined;
  const html = `<html><body style="font-family:sans-serif;padding:24px;font-size:12px">
    <h2>GIC — Pièce de balance</h2>
    <p><b>Date:</b> ${formatDate(m.date as string)}</p>
    <p><b>Désignation:</b> ${m.designation}</p>
    <p><b>Compte:</b> ${account?.name || '—'}</p>
    <p><b>Mode:</b> ${m.mode || '—'}</p>
    <p><b>Débit:</b> ${Number(m.debit) ? formatMad(Number(m.debit)) : '—'}</p>
    <p><b>Crédit:</b> ${Number(m.credit) ? formatMad(Number(m.credit)) : '—'}</p>
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

export function printMovementList(
  items: Array<Record<string, unknown>>,
  totals: { debit: number; credit: number; solde: number }
) {
  const rows = items.map((m) => {
    const account = m.account as { name?: string } | undefined;
    return `<tr>
      <td>${formatDate(m.date as string)}</td>
      <td>${m.designation}</td>
      <td>${account?.name || '—'}</td>
      <td>${m.mode || '—'}</td>
      <td>${Number(m.debit) ? formatMad(Number(m.debit)) : '—'}</td>
      <td>${Number(m.credit) ? formatMad(Number(m.credit)) : '—'}</td>
    </tr>`;
  }).join('');
  const html = `<html><body style="font-family:sans-serif;padding:24px;font-size:12px">
    <h1>Balance & finance — GIC</h1>
    <p>Débit: ${formatMad(totals.debit)} · Crédit: ${formatMad(totals.credit)} · Solde: ${formatMad(totals.solde)}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
      <tr><th>Date</th><th>Désignation</th><th>Compte</th><th>Mode</th><th>Débit</th><th>Crédit</th></tr>
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
