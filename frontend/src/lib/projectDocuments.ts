/** Documents standards attendus pour un projet immobilier professionnel. */
export const PROJECT_STANDARD_DOCS = [
  { key: 'titre_foncier', required: true, labelKey: 'projectDocs.titreFoncier' },
  { key: 'plan_cadastral', required: true, labelKey: 'projectDocs.planCadastral' },
  { key: 'autorisation_lotir', required: true, labelKey: 'projectDocs.autorisationLotir' },
  { key: 'permis_construire', required: true, labelKey: 'projectDocs.permisConstruire' },
  { key: 'plans_architecte', required: true, labelKey: 'projectDocs.plansArchitecte' },
  { key: 'etude_technique', required: true, labelKey: 'projectDocs.etudeTechnique' },
  { key: 'note_urbanisme', required: false, labelKey: 'projectDocs.noteUrbanisme' },
  { key: 'contrat_commercialisation', required: false, labelKey: 'projectDocs.contratCommercialisation' },
  { key: 'reglement_copropriete', required: false, labelKey: 'projectDocs.reglementCopropriete' },
  { key: 'assurance_chantier', required: true, labelKey: 'projectDocs.assuranceChantier' },
  { key: 'pv_reception', required: false, labelKey: 'projectDocs.pvReception' },
] as const;

export type ProjectDocKey = (typeof PROJECT_STANDARD_DOCS)[number]['key'];
export type ProjectDocStatus = 'missing' | 'pending' | 'valid' | 'invalid';

export type ChecklistCustomItem = {
  key: string;
  label: string;
  required: boolean;
};

export type DocChecklistConfig = {
  custom: ChecklistCustomItem[];
  labels: Record<string, string>;
};

export type ProjectDocumentRow = {
  id: string;
  name: string;
  category?: string | null;
  status?: string | null;
  path: string;
  createdAt: string;
  entityType?: string | null;
  propertyId?: string | null;
};

export const EMPTY_DOC_CHECKLIST: DocChecklistConfig = { custom: [], labels: {} };

export function parseDocChecklist(raw?: string | null): DocChecklistConfig {
  if (!raw) return { ...EMPTY_DOC_CHECKLIST, custom: [], labels: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<DocChecklistConfig>;
    const custom = Array.isArray(parsed.custom)
      ? parsed.custom
          .filter((item): item is ChecklistCustomItem =>
            Boolean(item && typeof item.key === 'string' && typeof item.label === 'string'))
          .map((item) => ({
            key: item.key,
            label: item.label,
            required: item.required === true,
          }))
      : [];
    const labels =
      parsed.labels && typeof parsed.labels === 'object' && !Array.isArray(parsed.labels)
        ? Object.fromEntries(
            Object.entries(parsed.labels).filter(
              ([k, v]) => typeof k === 'string' && typeof v === 'string' && v.trim(),
            ),
          )
        : {};
    return { custom, labels };
  } catch {
    return { custom: [], labels: {} };
  }
}

export function serializeDocChecklist(config: DocChecklistConfig): string {
  return JSON.stringify({
    custom: config.custom,
    labels: config.labels,
  });
}

export function isStandardDocKey(category?: string | null): boolean {
  return PROJECT_STANDARD_DOCS.some((d) => d.key === category);
}

export function isChecklistKey(category: string | null | undefined, config: DocChecklistConfig): boolean {
  if (!category) return false;
  if (isStandardDocKey(category)) return true;
  return config.custom.some((c) => c.key === category);
}

export function newCustomChecklistKey() {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function buildProjectDocChecklist(
  documents: ProjectDocumentRow[],
  config: DocChecklistConfig = EMPTY_DOC_CHECKLIST,
  resolveLabel: (labelKey: string) => string,
) {
  const projectDocs = documents.filter((d) => !d.propertyId || d.entityType === 'Project');
  const byCategory = new Map<string, ProjectDocumentRow>();
  for (const doc of projectDocs) {
    const key = doc.category || '';
    if (!key || byCategory.has(key)) continue;
    byCategory.set(key, doc);
  }

  const standardRows = PROJECT_STANDARD_DOCS.map((item) => {
    const doc = byCategory.get(item.key) || null;
    let state: ProjectDocStatus = 'missing';
    if (doc) {
      if (doc.status === 'valid') state = 'valid';
      else if (doc.status === 'invalid') state = 'invalid';
      else state = 'pending';
    }
    const label = config.labels[item.key]?.trim() || resolveLabel(item.labelKey);
    return {
      key: item.key,
      label,
      labelKey: item.labelKey as string,
      required: item.required,
      custom: false as const,
      document: doc,
      state,
    };
  });

  const customRows = config.custom.map((item) => {
    const doc = byCategory.get(item.key) || null;
    let state: ProjectDocStatus = 'missing';
    if (doc) {
      if (doc.status === 'valid') state = 'valid';
      else if (doc.status === 'invalid') state = 'invalid';
      else state = 'pending';
    }
    return {
      key: item.key,
      label: item.label,
      labelKey: '',
      required: item.required,
      custom: true as const,
      document: doc,
      state,
    };
  });

  const checklist = [...standardRows, ...customRows];
  const extras = documents.filter((d) => !isChecklistKey(d.category, config));
  const required = checklist.filter((c) => c.required);
  const deposited = checklist.filter((c) => c.state !== 'missing').length;
  const valid = checklist.filter((c) => c.state === 'valid').length;
  const invalid = checklist.filter((c) => c.state === 'invalid').length;
  const missingRequired = required.filter((c) => c.state === 'missing' || c.state === 'invalid').length;
  const validRequired = required.filter((c) => c.state === 'valid').length;
  const completionPct = required.length
    ? Math.round((validRequired / required.length) * 100)
    : 100;

  return {
    checklist,
    extras,
    stats: {
      totalStandard: checklist.length,
      required: required.length,
      deposited,
      valid,
      invalid,
      missing: checklist.filter((c) => c.state === 'missing').length,
      missingRequired,
      completionPct,
      extras: extras.length,
      totalFiles: documents.length,
    },
  };
}
