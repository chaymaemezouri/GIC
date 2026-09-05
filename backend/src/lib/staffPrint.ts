export function staffDocHtml(
  docType: string,
  data: {
    reference?: string | null;
    firstName: string;
    lastName: string;
    email?: string;
    cin?: string | null;
    jobTitle?: string | null;
    department?: string | null;
    contractType?: string | null;
    monthlySalary?: number;
    declared?: boolean;
    cnssNumber?: string | null;
    hireDate?: string;
    bankAccount?: string | null;
    periodLabel?: string;
    baseSalary?: number;
    bonus?: number;
    deduction?: number;
    advance?: number;
    net?: number;
    remark?: string | null;
  }
) {
  const titles: Record<string, string> = {
    attestation: "Attestation de travail",
    fiche_paie: 'Bulletin de paie',
  };
  const title = titles[docType] || docType;
  const fullName = `${data.firstName} ${data.lastName}`;

  if (docType === 'fiche_paie') {
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;padding:32px;color:#111;max-width:800px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}.muted{color:#666;font-size:12px}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5;width:40%}
.totals{margin-top:16px;font-size:13px}.totals p{margin:4px 0}
.footer{margin-top:32px;font-size:11px;color:#666}
</style></head><body>
<h1>${title}</h1>
<p class="muted">GIC — Expertise & Consulting Company</p>
<p><strong>Collaborateur :</strong> ${fullName}${data.reference ? ` (${data.reference})` : ''}</p>
<p><strong>Fonction :</strong> ${data.jobTitle || '—'} · ${data.department || '—'}</p>
<p><strong>Date :</strong> ${new Date().toLocaleDateString('fr-MA')}</p>
${data.periodLabel ? `<p><strong>Période :</strong> ${data.periodLabel}</p>` : ''}
<table>
<tr><th>Salaire de base</th><td>${(data.baseSalary ?? data.monthlySalary ?? 0).toLocaleString('fr-MA')} MAD</td></tr>
<tr><th>Primes</th><td>+${(data.bonus ?? 0).toLocaleString('fr-MA')} MAD</td></tr>
<tr><th>Retenues</th><td>−${(data.deduction ?? 0).toLocaleString('fr-MA')} MAD</td></tr>
<tr><th>Avances</th><td>−${(data.advance ?? 0).toLocaleString('fr-MA')} MAD</td></tr>
<tr><th><strong>Net à payer</strong></th><td><strong>${(data.net ?? 0).toLocaleString('fr-MA')} MAD</strong></td></tr>
</table>
${data.bankAccount ? `<p><strong>Compte bancaire :</strong> ${data.bankAccount}</p>` : ''}
${data.remark ? `<p><strong>Remarque :</strong> ${data.remark}</p>` : ''}
<p class="footer">Document généré par GIC — équipe interne / paie</p>
</body></html>`;
  }

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#111;max-width:720px;margin:0 auto;line-height:1.5}
h1{font-size:20px}p{margin:8px 0}.footer{margin-top:32px;font-size:11px;color:#666}
</style></head><body>
<h1>${title}</h1>
<p class="footer">GIC — Expertise & Consulting Company</p>
<p>Nous soussignés, <strong>Expertise & Consulting Company</strong>, certifions que :</p>
<p><strong>${fullName}</strong>${data.reference ? ` (${data.reference})` : ''}${data.cin ? `, CIN ${data.cin}` : ''},</p>
<p>occupe le poste de <strong>${data.jobTitle || 'collaborateur'}</strong>${data.department ? ` au sein du service ${data.department}` : ''},</p>
<p>en contrat <strong>${data.contractType || '—'}</strong>${data.hireDate ? ` depuis le ${data.hireDate}` : ''}.</p>
${data.declared && data.cnssNumber ? `<p>Immatriculation CNSS : ${data.cnssNumber}.</p>` : ''}
<p>La présente attestation est délivrée pour servir et valoir ce que de droit.</p>
<p>Fait à Casablanca, le ${new Date().toLocaleDateString('fr-MA')}.</p>
<p class="footer">Document généré par GIC</p>
</body></html>`;
}

export function computeStaffNet(base: number, bonus = 0, deduction = 0, advance = 0) {
  const net = Math.max(0, base + bonus - deduction - advance);
  return { base, bonus, deduction, advance, net };
}

export function monthLabel(year: number, month: number) {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' });
}
