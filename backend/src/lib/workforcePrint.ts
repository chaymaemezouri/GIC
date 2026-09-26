import { wrapCompanyPrintHtml } from './companyPrintShell.js';
import type { CompanyPrintSettings } from './companySettings.js';

export function workforceDocHtml(
  docType: string,
  data: {
    reference?: string | null;
    firstName: string;
    lastName: string;
    cin?: string | null;
    category?: string | null;
    groupe?: string | null;
    phone1?: string | null;
    contractType?: string | null;
    dailySalary?: number | null;
    declared?: boolean;
    cnssNumber?: string | null;
    hireDate?: string | null;
    workPassport?: string | null;
    assignments?: Array<{
      chantier: string;
      functionRole?: string | null;
      tranche?: string | null;
      startDate?: string | null;
    }>;
    dateFrom?: string;
    dateTo?: string;
    totalDays?: number;
    brut?: number;
    advances?: number;
    bonuses?: number;
    net?: number;
    pointages?: Array<{ date: string; chantier?: string; totalDay: number; advance: number; bonus: number }>;
  },
  settings: CompanyPrintSettings,
) {
  const titles: Record<string, string> = {
    attestation: 'Attestation de travail',
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
            `<tr><td>${p.date}</td><td>${p.chantier || '—'}</td><td>${p.totalDay.toFixed(2)}</td><td>${p.advance}</td><td>${p.bonus}</td></tr>`,
        )
        .join('') ||
      '<tr><td colspan="5">Aucun pointage validé sur la période</td></tr>';

    const bodyHtml = `
<p><strong>Ouvrier :</strong> ${fullName}${data.reference ? ` (${data.reference})` : ''}</p>
${period ? `<p>${period}</p>` : ''}
<p><strong>Salaire / jour :</strong> ${data.dailySalary != null ? Number(data.dailySalary).toLocaleString('fr-MA') : '—'} MAD</p>
<table>
<thead><tr><th>Date</th><th>Chantier</th><th>Journées eq.</th><th>Avance</th><th>Prime</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<div class="totals">
<p><strong>Journées équivalentes :</strong> ${(data.totalDays ?? 0).toFixed(2)}</p>
<p><strong>Brut :</strong> ${(data.brut ?? 0).toLocaleString('fr-MA')} MAD</p>
<p><strong>Primes :</strong> +${(data.bonuses ?? 0).toLocaleString('fr-MA')} MAD</p>
<p><strong>Avances :</strong> −${(data.advances ?? 0).toLocaleString('fr-MA')} MAD</p>
<p><strong>Net à payer :</strong> ${(data.net ?? 0).toLocaleString('fr-MA')} MAD</p>
</div>
<p class="muted">Document main-d'œuvre / pointage / salaires</p>`;

    return wrapCompanyPrintHtml({
      title,
      bodyHtml,
      metaRight: period || undefined,
      settings,
    });
  }

  const assignRows =
    (data.assignments || [])
      .map(
        (a) =>
          `<tr><td>${a.chantier}</td><td>${a.functionRole || '—'}</td><td>${a.tranche || '—'}</td><td>${a.startDate || '—'}</td></tr>`,
      )
      .join('') || '<tr><td colspan="4">Aucune affectation enregistrée</td></tr>';

  const company = settings.companyName || 'GIC — Expertise & Consulting';
  const bodyHtml = `
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
<h2>Chantiers affectés</h2>
<table>
<thead><tr><th>Chantier</th><th>Fonction</th><th>Tranche</th><th>Depuis</th></tr></thead>
<tbody>${assignRows}</tbody>
</table>
<p class="muted">${company} atteste que l'ouvrier est enregistré dans le système.</p>
<div class="sign"><div class="sign-box">Cachet &amp; signature<div class="sign-line">${company}</div></div></div>`;

  return wrapCompanyPrintHtml({ title, bodyHtml, settings });
}
