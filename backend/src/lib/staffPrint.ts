import { wrapCompanyPrintHtml } from './companyPrintShell.js';
import type { CompanyPrintSettings } from './companySettings.js';

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
    bankName?: string | null;
    rib?: string | null;
    periodLabel?: string;
    baseSalary?: number;
    bonus?: number;
    deduction?: number;
    advance?: number;
    net?: number;
    remark?: string | null;
  },
  settings: CompanyPrintSettings,
) {
  const titles: Record<string, string> = {
    attestation: 'Attestation de travail',
    fiche_paie: 'Bulletin de paie',
  };
  const title = titles[docType] || docType;
  const fullName = `${data.firstName} ${data.lastName}`;
  const company = settings.companyName || 'GIC — Expertise & Consulting';
  const city = settings.city || 'Casablanca';

  if (docType === 'fiche_paie') {
    const bodyHtml = `
<p><strong>Collaborateur :</strong> ${fullName}${data.reference ? ` (${data.reference})` : ''}</p>
<p><strong>Fonction :</strong> ${data.jobTitle || '—'} · ${data.department || '—'}</p>
${data.periodLabel ? `<p><strong>Période :</strong> ${data.periodLabel}</p>` : ''}
<table>
<tbody>
<tr><th>Salaire de base</th><td>${(data.baseSalary ?? data.monthlySalary ?? 0).toLocaleString('fr-MA')} MAD</td></tr>
<tr><th>Primes</th><td>+${(data.bonus ?? 0).toLocaleString('fr-MA')} MAD</td></tr>
<tr><th>Retenues</th><td>−${(data.deduction ?? 0).toLocaleString('fr-MA')} MAD</td></tr>
<tr><th>Avances</th><td>−${(data.advance ?? 0).toLocaleString('fr-MA')} MAD</td></tr>
<tr><th><strong>Net à payer</strong></th><td><strong>${(data.net ?? 0).toLocaleString('fr-MA')} MAD</strong></td></tr>
</tbody>
</table>
${data.bankName || data.rib || data.bankAccount ? `<p><strong>Compte bancaire :</strong> ${[data.bankName, data.rib || data.bankAccount].filter(Boolean).join(' · ')}</p>` : ''}
${data.remark ? `<p><strong>Remarque :</strong> ${data.remark}</p>` : ''}
<p class="muted">Document équipe interne / paie</p>`;

    return wrapCompanyPrintHtml({
      title,
      bodyHtml,
      metaRight: data.periodLabel ? `Période : ${data.periodLabel}` : undefined,
      settings,
    });
  }

  const bodyHtml = `
<p>Nous soussignés, <strong>${company}</strong>, certifions que :</p>
<p><strong>${fullName}</strong>${data.reference ? ` (${data.reference})` : ''}${data.cin ? `, CIN ${data.cin}` : ''},</p>
<p>occupe le poste de <strong>${data.jobTitle || 'collaborateur'}</strong>${data.department ? ` au sein du service ${data.department}` : ''},</p>
<p>en contrat <strong>${data.contractType || '—'}</strong>${data.hireDate ? ` depuis le ${data.hireDate}` : ''}.</p>
${data.declared && data.cnssNumber ? `<p>Immatriculation CNSS : ${data.cnssNumber}.</p>` : ''}
<p>La présente attestation est délivrée pour servir et valoir ce que de droit.</p>
<p>Fait à ${city}, le ${new Date().toLocaleDateString('fr-MA')}.</p>
<div class="sign"><div class="sign-box">Cachet &amp; signature<div class="sign-line">${company}</div></div></div>`;

  return wrapCompanyPrintHtml({ title, bodyHtml, settings });
}

export function computeStaffNet(base: number, bonus = 0, deduction = 0, advance = 0) {
  const net = Math.max(0, base + bonus - deduction - advance);
  return { base, bonus, deduction, advance, net };
}

export function monthLabel(year: number, month: number) {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' });
}
