export type ChecklistItem = { key: string; required: boolean; labelKey: string };

/** Documents attendus dès la création de la fiche. L'utilisateur peut ensuite renommer, retirer ou ajouter. */
export const ENTITY_CHECKLISTS: Record<string, ChecklistItem[]> = {
  client: [
    { key: 'cin', required: true, labelKey: 'checklists.cin' },
    { key: 'justificatif_domicile', required: false, labelKey: 'checklists.proofAddress' },
    { key: 'rib', required: false, labelKey: 'checklists.rib' },
    { key: 'contrat', required: false, labelKey: 'checklists.contract' },
  ],
  mandant: [
    { key: 'cin', required: true, labelKey: 'checklists.cin' },
    { key: 'procuration', required: true, labelKey: 'checklists.proxy' },
    { key: 'cin_mandant', required: false, labelKey: 'checklists.mandantId' },
  ],
  agent: [
    { key: 'cin', required: true, labelKey: 'checklists.cin' },
    { key: 'contrat', required: true, labelKey: 'checklists.contract' },
    { key: 'rib', required: false, labelKey: 'checklists.rib' },
  ],
  property: [
    { key: 'titre', required: true, labelKey: 'checklists.titleDeed' },
    { key: 'plan', required: false, labelKey: 'checklists.plan' },
    { key: 'photos', required: false, labelKey: 'checklists.photos' },
  ],
  sale: [
    { key: 'compromis', required: true, labelKey: 'checklists.preliminaryContract' },
    { key: 'cin_acheteur', required: true, labelKey: 'checklists.buyerId' },
    { key: 'echeancier', required: false, labelKey: 'checklists.schedule' },
  ],
  rental: [
    { key: 'bail', required: true, labelKey: 'checklists.lease' },
    { key: 'cin_locataire', required: true, labelKey: 'checklists.tenantId' },
    { key: 'etat_lieux', required: false, labelKey: 'checklists.inventory' },
  ],
  chantier: [
    { key: 'ordre_service', required: true, labelKey: 'checklists.serviceOrder' },
    { key: 'plans', required: true, labelKey: 'checklists.plans' },
    { key: 'autorisation', required: false, labelKey: 'checklists.permit' },
    { key: 'assurance', required: true, labelKey: 'checklists.insurance' },
    { key: 'pv_reception', required: false, labelKey: 'checklists.acceptance' },
  ],
  'chantier-tranche': [
    { key: 'plans', required: true, labelKey: 'checklists.plans' },
    { key: 'autorisation', required: false, labelKey: 'checklists.permit' },
    { key: 'assurance', required: false, labelKey: 'checklists.insurance' },
    { key: 'pv_reception', required: false, labelKey: 'checklists.acceptance' },
    { key: 'situation', required: false, labelKey: 'checklists.situation' },
  ],
  workforce: [
    { key: 'cin', required: true, labelKey: 'checklists.cin' },
    { key: 'contrat', required: true, labelKey: 'checklists.contract' },
    { key: 'cnss', required: false, labelKey: 'checklists.cnss' },
    { key: 'rib', required: false, labelKey: 'checklists.rib' },
  ],
  staff: [
    { key: 'cin', required: true, labelKey: 'checklists.cin' },
    { key: 'contrat', required: true, labelKey: 'checklists.contract' },
    { key: 'rib', required: false, labelKey: 'checklists.rib' },
  ],
  engin: [
    { key: 'carte_grise', required: true, labelKey: 'checklists.registration' },
    { key: 'assurance', required: true, labelKey: 'checklists.insurance' },
    { key: 'visite', required: true, labelKey: 'checklists.inspection' },
    { key: 'contrat_location', required: false, labelKey: 'checklists.rentalContract' },
  ],
  supplier: [
    { key: 'rc', required: true, labelKey: 'checklists.tradeRegister' },
    { key: 'ice', required: true, labelKey: 'checklists.ice' },
    { key: 'rib', required: false, labelKey: 'checklists.rib' },
  ],
  purchase: [
    { key: 'devis', required: false, labelKey: 'checklists.quote' },
    { key: 'bon_commande', required: true, labelKey: 'checklists.purchaseOrder' },
    { key: 'bon_livraison', required: false, labelKey: 'checklists.deliveryNote' },
    { key: 'facture', required: true, labelKey: 'checklists.invoice' },
  ],
};

export type ChecklistConfig = {
  custom: { key: string; label: string; required: boolean }[];
  labels: Record<string, string>;
  hidden: string[];
  required: Record<string, boolean>;
};

export function parseChecklistConfig(raw?: string | null): ChecklistConfig {
  const empty = { custom: [], labels: {}, hidden: [], required: {} };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<ChecklistConfig>;
    const required =
      parsed.required && typeof parsed.required === 'object' && !Array.isArray(parsed.required)
        ? Object.fromEntries(Object.entries(parsed.required).filter(([, v]) => typeof v === 'boolean'))
        : {};
    return {
      custom: Array.isArray(parsed.custom) ? parsed.custom.filter((i) => i && i.key && i.label) : [],
      labels: parsed.labels && typeof parsed.labels === 'object' ? parsed.labels : {},
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((k) => typeof k === 'string') : [],
      required,
    };
  } catch {
    return empty;
  }
}
