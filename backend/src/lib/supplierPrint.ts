import { wrapCompanyPrintHtml } from './companyPrintShell.js';
import type { CompanyPrintSettings } from './companySettings.js';

export function supplierDocHtml(
  docType: string,
  data: {
    supplierName: string;
    supplierRef?: string;
    purchaseRef?: string;
    date?: string;
    designation?: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice?: number;
    chantier?: string;
    remark?: string;
  },
  settings: CompanyPrintSettings,
) {
  const titles: Record<string, string> = {
    devis: 'Devis',
    facture: 'Facture',
    bon_commande: 'Bon de commande',
    bon_livraison: 'Bon de livraison',
    recu: 'Reçu',
    bon_caisse: 'Bon de caisse',
  };
  const title = titles[docType] || docType;
  const bodyHtml = `
<p><strong>Fournisseur :</strong> ${data.supplierName}${data.supplierRef ? ` (${data.supplierRef})` : ''}</p>
<p><strong>Date :</strong> ${data.date || new Date().toLocaleDateString('fr-MA')}</p>
${data.purchaseRef ? `<p><strong>Réf. achat :</strong> ${data.purchaseRef}</p>` : ''}
${data.chantier ? `<p><strong>Chantier :</strong> ${data.chantier}</p>` : ''}
<table>
<thead><tr><th>Désignation</th><th>Qté</th><th>PU (MAD)</th><th>Total (MAD)</th></tr></thead>
<tbody>
<tr><td>${data.designation || '—'}</td><td>${data.quantity ?? '—'}</td><td>${data.unitPrice ?? '—'}</td><td>${data.totalPrice ?? '—'}</td></tr>
</tbody>
</table>
${data.totalPrice != null ? `<p class="total">Total : ${Number(data.totalPrice).toLocaleString('fr-MA')} MAD</p>` : ''}
${data.remark ? `<p><strong>Remarque :</strong> ${data.remark}</p>` : ''}
<p class="muted">Document relation fournisseur / achats / chantier / finance</p>`;

  return wrapCompanyPrintHtml({ title, bodyHtml, settings });
}
