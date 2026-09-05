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
  }
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
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;padding:32px;color:#111;max-width:720px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}.muted{color:#666;font-size:12px}
table{width:100%;border-collapse:collapse;margin-top:20px;font-size:13px}
th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}
.total{font-weight:700;text-align:right;margin-top:12px}
.footer{margin-top:32px;font-size:11px;color:#666}
</style></head><body>
<h1>${title}</h1>
<p class="muted">GIC — Expertise & Consulting Company</p>
<p><strong>Fournisseur :</strong> ${data.supplierName}${data.supplierRef ? ` (${data.supplierRef})` : ''}</p>
<p><strong>Date :</strong> ${data.date || new Date().toLocaleDateString('fr-MA')}</p>
${data.purchaseRef ? `<p><strong>Réf. achat :</strong> ${data.purchaseRef}</p>` : ''}
${data.chantier ? `<p><strong>Chantier :</strong> ${data.chantier}</p>` : ''}
<table>
<tr><th>Désignation</th><th>Qté</th><th>PU (MAD)</th><th>Total (MAD)</th></tr>
<tr><td>${data.designation || '—'}</td><td>${data.quantity ?? '—'}</td><td>${data.unitPrice ?? '—'}</td><td>${data.totalPrice ?? '—'}</td></tr>
</table>
${data.totalPrice != null ? `<p class="total">Total : ${Number(data.totalPrice).toLocaleString('fr-MA')} MAD</p>` : ''}
${data.remark ? `<p><strong>Remarque :</strong> ${data.remark}</p>` : ''}
<p class="footer">Document généré par GIC — relation fournisseur / achats / chantier / finance</p>
</body></html>`;
}
