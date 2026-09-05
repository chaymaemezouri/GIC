/** Filtres d'action partagés (alignés avec le frontend). */
export const AUDIT_ACTION_GROUPS: Record<string, string[]> = {
  création: ['création', 'création_auto'],
  modification: ['modification'],
  suppression: ['suppression', 'suppression_image'],
  connexion: ['connexion', 'connexion_2fa'],
  upload: ['upload', 'photo', 'document', 'images'],
  import: ['import_csv', 'import_xlsx'],
  paie: ['paie'],
  workflow: ['workflow'],
  archivage: ['archivage', 'désarchivage'],
  résiliation: ['résiliation'],
  affectation: ['affectation', 'liaison', 'déliaison'],
  pointage: ['pointage'],
  sécurité: ['activation_2fa', 'désactivation_2fa', 'changement_mot_de_passe'],
};

/** Alias d'entité pour le filtre (libellé UI → valeurs stockées). */
export const AUDIT_ENTITY_ALIASES: Record<string, string[]> = {
  Caisse: ['Caisse', 'OfficeCashMovement'],
  Balance: ['CashMovement', 'Balance'],
  CashMovement: ['CashMovement', 'Balance'],
  OfficeCashMovement: ['Caisse', 'OfficeCashMovement'],
};

export function actionFilterClause(action: string): Record<string, unknown> {
  const key = String(action || '').trim();
  if (!key) return {};
  if (key === 'notification' || key.startsWith('notification_')) {
    return { action: { startsWith: 'notification_' } };
  }
  const group = AUDIT_ACTION_GROUPS[key];
  if (group?.length) return { action: { in: group } };
  return { action: key };
}

export function entityFilterClause(entity: string): Record<string, unknown> {
  const key = String(entity || '').trim();
  if (!key) return {};
  const aliases = AUDIT_ENTITY_ALIASES[key];
  if (aliases?.length) return { entity: { in: aliases } };
  return { entity: key };
}
