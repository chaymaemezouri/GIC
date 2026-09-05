export function workforceDocHtml(
  docType: string,
  data: {
    reference?: string;
    firstName: string;
    lastName: string;
    cin?: string;
    category?: string;
    groupe?: string;
    phone1?: string;
    contractType?: string;
    dailySalary?: number;
    declared?: boolean;
    cnssNumber?: string;
    hireDate?: string;
    workPassport?: string;
    assignments?: Array<{ chantier: string; functionRole?: string; tranche?: string; startDate?: string }>;
    dateFrom?: string;
    dateTo?: string;
    totalDays?: number;
    brut?: number;
    advances?: number;
    bonuses?: number;
    net?: number;
    pointages?: Array<{ date: string; chantier?: string; totalDay: number; advance: number; bonus: number }>;
  }
) {
  const titles: Record<string, string> = {
    attestation: "Attestation de travail",
    fiche_paie: 'Fiche de paie',
  };
  const title = titles[docType] || docType;
  const fullName = `${data.firstName} ${data.lastName}`;
  const period =
    data.dateFrom && data.dateTo
      ? `Période : ${data.dateFrom} → ${data.dateTo}`
      : data.dateFrom || data.dateTo
        ? `Période : ${data.dateFrom || '…'} → ${data.dateTo || '…'}`
        : '';

  if (docType === 'fiche_paie') {
    const rows =
      (data.pointages || [])
        .map(
          (p) =>
            `<tr><td>${p.date}</td><td>${p.chantier || '—'}</td><td>${p.totalDay.toFixed(2)}</td><td>${p.advance}</td><td>${p.bonus}</td></tr>`
        )
        .join('') ||
      '<tr><td colspan="5">Aucun pointage validé sur la période</td></tr>';

    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;padding:32px;color:#111;max-width:800px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}.muted{color:#666;font-size:12px}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}
.totals{margin-top:16px;font-size:13px}.totals p{margin:4px 0}
.footer{margin-top:32px;font-size:11px;color:#666}
</style></head><body>
<h1>${title}</h1>
<p class="muted">GIC — Expertise & Consulting Company</p>
<p><strong>Ouvrier :</strong> ${fullName}${data.reference ? ` (${data.reference})` : ''}</p>
<p><strong>Date :</strong> ${new Date().toLocaleDateString('fr-MA')}</p>
${period ? `<p>${period}</p>` : ''}
<p><strong>Salaire / jour :</strong> ${data.dailySalary != null ? Number(data.dailySalary).toLocaleString('fr-MA') : '—'} MAD</p>
<table>
<tr><th>Date</th><th>Chantier</th><th>Journées eq.</th><th>Avance</th><th>Prime</th></tr>
${rows}
</table>
<div class="totals">
<p><strong>Journées équivalentes :</strong> ${(data.totalDays ?? 0).toFixed(2)}</p>
<p><strong>Brut :</strong> ${(data.brut ?? 0).toLocaleString('fr-MA')} MAD</p>
<p><strong>Primes :</strong> +${(data.bonuses ?? 0).toLocaleString('fr-MA')} MAD</p>
<p><strong>Avances :</strong> −${(data.advances ?? 0).toLocaleString('fr-MA')} MAD</p>
<p><strong>Net à payer :</strong> ${(data.net ?? 0).toLocaleString('fr-MA')} MAD</p>
</div>
<p class="footer">Document généré par GIC — main-d'œuvre / pointage / salaires</p>
</body></html>`;
  }

  const assignRows =
    (data.assignments || [])
      .map(
        (a) =>
          `<tr><td>${a.chantier}</td><td>${a.functionRole || '—'}</td><td>${a.tranche || '—'}</td><td>${a.startDate || '—'}</td></tr>`
      )
      .join('') || '<tr><td colspan="4">Aucune affectation enregistrée</td></tr>';

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;padding:32px;color:#111;max-width:720px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}.muted{color:#666;font-size:12px}
.info{margin:12px 0;font-size:13px;line-height:1.6}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}
.footer{margin-top:32px;font-size:11px;color:#666}
</style></head><body>
<h1>${title}</h1>
<p class="muted">GIC — Expertise & Consulting Company</p>
<div class="info">
<p><strong>Nom :</strong> ${fullName}</p>
<p><strong>Référence :</strong> ${data.reference || '—'}</p>
<p><strong>CIN :</strong> ${data.cin || '—'}</p>
<p><strong>Catégorie :</strong> ${data.category || '—'}</p>
<p><strong>Groupe :</strong> ${data.groupe || '—'}</p>
<p><strong>Contrat :</strong> ${data.contractType || '—'}</p>
<p><strong>Salaire / jour :</strong> ${data.dailySalary != null ? Number(data.dailySalary).toLocaleString('fr-MA') : '—'} MAD</p>
<p><strong>CNSS :</strong> ${data.declared ? 'Déclaré' : 'Non déclaré'}${data.cnssNumber ? ` (${data.cnssNumber})` : ''}</p>
<p><strong>Date embauche :</strong> ${data.hireDate || '—'}</p>
<p><strong>Passeport d'œuvre :</strong> ${data.workPassport || '—'}</p>
</div>
<h2 style="font-size:14px;margin-top:24px">Chantiers affectés</h2>
<table>
<tr><th>Chantier</th><th>Fonction</th><th>Tranche</th><th>Depuis</th></tr>
${assignRows}
</table>
<p class="footer">Document généré par GIC — atteste que l'ouvrier est enregistré dans le système GIC.</p>
</body></html>`;
}
