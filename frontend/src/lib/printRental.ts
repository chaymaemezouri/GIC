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

/** Dossier complet location : client + contrat + produit + paiements. */
export async function printRentalReceipt(rental: Record<string, unknown>, _opts?: { preview?: boolean }) {
  const payments = (rental.payments as Array<Record<string, unknown>>) || [];
  const client = (rental.client || {}) as Record<string, unknown>;
  const property = (rental.property || {}) as Record<string, unknown>;
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
  <h2>1. Client / locataire</h2>
  <div class="grid">
    <div><span class="k">Nom :</span> ${esc(client.lastName)}</div>
    <div><span class="k">Prénom :</span> ${esc(client.firstName)}</div>
    <div><span class="k">Identité :</span> ${esc(client.identityType)} ${esc(client.identityNumber)}</div>
    <div><span class="k">Tél :</span> ${esc(client.phone1)}${client.phone2 ? ` / ${esc(client.phone2)}` : ''}</div>
    <div><span class="k">Email :</span> ${esc(client.email)}</div>
    <div><span class="k">Adresse :</span> ${esc(client.address)}</div>
  </div>

  <h2>2. Contrat / loyer</h2>
  <div class="grid">
    <div><span class="k">Date contrat :</span> ${esc(dateFr(rental.contractDate))}</div>
    <div><span class="k">Type :</span> ${esc(rental.contractType)}</div>
    <div><span class="k">Sign. bailleur :</span> ${esc(dateFr(rental.landlordSignatureDate))}</div>
    <div><span class="k">N° égal. bailleur :</span> ${esc(rental.landlordLegalizationNo)}</div>
    <div><span class="k">Sign. locataire :</span> ${esc(dateFr(rental.tenantSignatureDate))}</div>
    <div><span class="k">N° égal. locataire :</span> ${esc(rental.tenantLegalizationNo)}</div>
    <div><span class="k">Mensualité :</span> ${esc(mad(rental.monthlyRent))}</div>
    <div><span class="k">Remise :</span> ${esc(mad(rental.discount))}</div>
    <div><span class="k">Payé / Reste :</span> ${esc(mad(rental.totalPaid))} / ${esc(mad(rental.remaining))}</div>
  </div>
  ${rental.description ? `<p><span class="k">Description :</span> ${esc(rental.description)}</p>` : ''}

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

  <h2>4. Paiements / mensualités (${payments.length})</h2>
  <p><b>Total payé :</b> ${esc(mad(rental.totalPaid))} · <b>Reste :</b> ${esc(mad(rental.remaining))}</p>
  <table>
    <thead><tr>
      <th>Date</th><th>Montant</th><th>Nature</th><th>Réf. interne</th>
      <th>Type ope.</th><th>N° ope.</th><th>Banque</th><th>Versant</th><th>Preuve</th>
    </tr></thead>
    <tbody>${paymentRows}</tbody>
  </table>`;
  return printWithCompany({
    title: 'Dossier location',
    subtitle: `Réf. ${String(rental.reference || '—')}`,
    bodyHtml,
  });
}
