import { formatDate, formatMad } from './api';
import { escHtml, printSimpleTable, printWithCompany } from './companyPrint';

export async function printMovementReceipt(m: Record<string, unknown>) {
  const account = m.account as { name?: string } | undefined;
  const bodyHtml = `<div class="grid">
    <p><span class="k">Date :</span> ${escHtml(formatDate(m.date as string))}</p>
    <p><span class="k">Compte :</span> ${escHtml(account?.name || '—')}</p>
    <p><span class="k">Désignation :</span> ${escHtml(m.designation || '—')}</p>
    <p><span class="k">Mode :</span> ${escHtml(m.mode || '—')}</p>
    <p><span class="k">Débit :</span> ${escHtml(Number(m.debit) ? formatMad(Number(m.debit)) : '—')}</p>
    <p><span class="k">Crédit :</span> ${escHtml(Number(m.credit) ? formatMad(Number(m.credit)) : '—')}</p>
    ${m.remark ? `<p><span class="k">Remarque :</span> ${escHtml(m.remark)}</p>` : ''}
    <p><span class="k">Pièce jointe :</span> ${m.proofFile ? 'Oui' : 'Non'}</p>
  </div>`;
  return printWithCompany({ title: 'Pièce de balance', bodyHtml });
}

export async function printMovementList(
  items: Array<Record<string, unknown>>,
  totals: { debit: number; credit: number; solde: number }
) {
  const rows = items.map((m) => {
    const account = m.account as { name?: string } | undefined;
    return [
      formatDate(m.date as string), m.designation || '—', account?.name || '—', m.mode || '—',
      Number(m.debit) ? formatMad(Number(m.debit)) : '—',
      Number(m.credit) ? formatMad(Number(m.credit)) : '—',
    ];
  });
  return printSimpleTable({
    title: 'Balance & finance',
    subtitle: `Débit : ${formatMad(totals.debit)} · Crédit : ${formatMad(totals.credit)} · Solde : ${formatMad(totals.solde)}`,
    columns: ['Date', 'Désignation', 'Compte', 'Mode', 'Débit', 'Crédit'],
    rows,
  });
}
