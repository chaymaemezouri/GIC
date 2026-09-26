import { escHtml, printWithCompany } from './companyPrint';

const esc = (value: unknown) => escHtml(value ?? '—');

function mad(n: unknown) {
  const v = Number(n || 0);
  return `${v.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

function dateFr(v: unknown) {
  if (!v) return '—';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('fr-MA');
}

/** Dossier complet vente : client + contrat + produit + paiements. preview=true = aperçu avant impression. */
export async function printSaleReceipt(sale: Record<string, unknown>, _opts?: { preview?: boolean }) {
  const payments = (sale.payments as Array<Record<string, unknown>>) || [];
  const client = (sale.client || {}) as Record<string, unknown>;
  const property = (sale.property || {}) as Record<string, unknown>;
  const floor = (property.floor || {}) as Record<string, unknown>;
  const lot = (floor.lot || {}) as Record<string, unknown>;
  const bloc = (lot.bloc || {}) as Record<string, unknown>;
  const tranche = (bloc.tranche || {}) as Record<string, unknown>;
  const project = (property.project || tranche.project || {}) as Record<string, unknown>;

  const paymentRows = payments.length
    ? payments
        .map(
          (p) => `<tr>
      <td>${esc(dateFr(p.date))}</td>
      <td>${esc(mad(p.amount))}</td>
      <td>${esc(p.nature)}</td>
      <td>${esc(p.internalRef || p.receiptNo)}</td>
      <td>${esc(p.operationType)}</td>
      <td>${esc(p.operationNo)}</td>
      <td>${esc(p.bank)}</td>
      <td>${esc(p.payerName)}</td>
      <td>${p.proofFile ? 'Oui' : '—'}</td>
    </tr>`,
        )
        .join('')
    : '<tr><td colspan="9">Aucun paiement</td></tr>';

  const bodyHtml = `
  <h2>1. Client</h2>
  <div class="grid">
    <div><span class="k">Nom :</span> ${esc(client.lastName)}</div>
    <div><span class="k">Prénom :</span> ${esc(client.firstName)}</div>
    <div><span class="k">Identité :</span> ${esc(client.identityType)} ${esc(client.identityNumber)}</div>
    <div><span class="k">Tél :</span> ${esc(client.phone1)}${client.phone2 ? ` / ${esc(client.phone2)}` : ''}</div>
    <div><span class="k">Email :</span> ${esc(client.email)}</div>
    <div><span class="k">Adresse :</span> ${esc(client.address)}</div>
    <div><span class="k">Référence :</span> ${esc(client.reference)}</div>
    <div><span class="k">NB :</span> ${esc(client.nb)}</div>
  </div>

  <h2>2. Contrat / vente</h2>
  <div class="grid">
    <div><span class="k">Date contrat :</span> ${esc(dateFr(sale.contractDate))}</div>
    <div><span class="k">Type :</span> ${esc(sale.contractType)}</div>
    <div><span class="k">Sign. vendeur :</span> ${esc(dateFr(sale.sellerSignatureDate))}</div>
    <div><span class="k">N° égal. vendeur :</span> ${esc(sale.sellerLegalizationNo)}</div>
    <div><span class="k">Sign. acheteur :</span> ${esc(dateFr(sale.buyerSignatureDate))}</div>
    <div><span class="k">N° égal. acheteur :</span> ${esc(sale.buyerLegalizationNo)}</div>
    <div><span class="k">Prix :</span> ${esc(mad(sale.salePrice))}</div>
    <div><span class="k">Remise :</span> ${esc(mad(sale.discount))}</div>
    <div><span class="k">Avance :</span> ${esc(mad(sale.advance))}</div>
    <div><span class="k">Net / Payé / Reste :</span> ${esc(mad(sale.netPrice))} / ${esc(mad(sale.totalPaid))} / ${esc(mad(sale.remaining))}</div>
  </div>
  ${sale.description ? `<p><span class="k">Description :</span> ${esc(sale.description)}</p>` : ''}

  <h2>3. Produit / bien</h2>
  <div class="grid">
    <div><span class="k">Désignation :</span> ${esc(property.name)}</div>
    <div><span class="k">Réf. / Titre :</span> ${esc(property.reference)} / ${esc(property.titleNumber)}</div>
    <div><span class="k">Ville :</span> ${esc(property.city)}</div>
    <div><span class="k">Projet :</span> ${esc(project.name)}</div>
    <div><span class="k">Tranche / Bloc :</span> ${esc(tranche.name)} / ${esc(bloc.name)}</div>
    <div><span class="k">Lot / Étage :</span> ${esc(lot.name)} / ${esc(floor.name)}</div>
    <div><span class="k">Surface / Pièces :</span> ${esc(property.surface)} m² / ${esc(property.rooms)}</div>
    <div><span class="k">État :</span> ${esc(property.status)}</div>
  </div>

  <h2>4. Paiements (${payments.length})</h2>
  <p><b>Total payé :</b> ${esc(mad(sale.totalPaid))} · <b>Reste :</b> ${esc(mad(sale.remaining))}</p>
  <table>
    <thead><tr>
      <th>Date</th><th>Montant</th><th>Nature</th><th>Réf. interne</th>
      <th>Type ope.</th><th>N° ope.</th><th>Banque</th><th>Versant</th><th>Preuve</th>
    </tr></thead>
    <tbody>${paymentRows}</tbody>
  </table>`;
  return printWithCompany({
    title: 'Dossier vente',
    subtitle: `Réf. ${String(sale.reference || '—')}`,
    bodyHtml,
  });
}
