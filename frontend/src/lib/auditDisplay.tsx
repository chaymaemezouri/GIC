export const AUDIT_ENTITY_PATHS: Record<string, (id: string) => string> = {
  Client: (id) => `/clients/${id}`,
  Agent: (id) => `/agents/${id}`,
  Mandant: (id) => `/mandants/${id}`,
  Reconnu: (id) => `/reconnus/${id}`,
  Property: (id) => `/biens/${id}`,
  Project: (id) => `/projets/${id}`,
  Sale: (id) => `/ventes/${id}`,
  Rental: (id) => `/locations/${id}`,
  Payment: (id) => `/encaissements/${id}`,
  Supplier: (id) => `/fournisseurs/${id}`,
  Purchase: (id) => `/achats/${id}`,
  CashMovement: (id) => `/balance/${id}`,
  OfficeCashMovement: () => `/caisse`,
  Caisse: () => `/caisse`,
  Chantier: (id) => `/chantiers/${id}`,
  Workforce: (id) => `/main-oeuvre/${id}`,
  Engin: (id) => `/engins/${id}`,
  Maintenance: (id) => `/maintenance/${id}`,
  Mission: (id) => `/missions/${id}`,
  User: (id) => `/utilisateurs/${id}`,
  InternalStaff: (id) => `/equipe-interne/${id}`,
  DropdownOption: () => '/referentiels',
};

/** Libellés FR pour le journal (évite les noms techniques Prisma). */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  Client: 'Client',
  Agent: 'Agent',
  Mandant: 'Mandant',
  Reconnu: 'Reconnu',
  Property: 'Bien',
  Project: 'Projet',
  Sale: 'Vente',
  Rental: 'Location',
  Payment: 'Encaissement',
  Supplier: 'Fournisseur',
  Purchase: 'Achat',
  CashMovement: 'Balance',
  OfficeCashMovement: 'Caisse',
  Caisse: 'Caisse',
  Chantier: 'Chantier',
  Workforce: "Main-d'œuvre",
  Engin: 'Engin',
  Maintenance: 'Maintenance',
  Mission: 'Mission',
  User: 'Utilisateur',
  InternalStaff: 'Équipe interne',
  DropdownOption: 'Référentiel',
  Document: 'Document',
};

export function auditEntityLabel(entity: string) {
  return AUDIT_ENTITY_LABELS[entity] || entity;
}

export function auditEntityLink(entity: string, entityId?: string | null) {
  if (!entityId) return null;
  const pathFn = AUDIT_ENTITY_PATHS[entity];
  return pathFn ? pathFn(entityId) : null;
}

/** Libellés FR des actions dans le journal. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  création: 'Ajout',
  création_auto: 'Ajout auto',
  modification: 'Modification',
  suppression: 'Suppression',
  suppression_image: 'Suppression image',
  connexion: 'Connexion',
  connexion_2fa: 'Connexion 2FA',
  activation_2fa: 'Activation 2FA',
  désactivation_2fa: 'Désactivation 2FA',
  changement_mot_de_passe: 'Mot de passe',
  upload: 'Upload',
  photo: 'Photo',
  document: 'Document',
  images: 'Images',
  import_csv: 'Import CSV',
  import_xlsx: 'Import Excel',
  paie: 'Paie',
  workflow: 'Workflow',
  archivage: 'Archivage',
  désarchivage: 'Désarchivage',
  résiliation: 'Résiliation',
  affectation: 'Affectation',
  liaison: 'Liaison',
  déliaison: 'Déliaison',
  pointage: 'Pointage',
  caisse_auto: 'Caisse auto',
  carburant: 'Carburant',
  gps: 'GPS',
  note: 'Note',
  portail_fournisseur: 'Portail fournisseur',
};

/** Filtres d’action (id = clé API, regroupe les variantes). */
export const AUDIT_ACTION_FILTERS: { id: string; label: string }[] = [
  { id: '', label: 'Toutes actions' },
  { id: 'création', label: 'Ajout' },
  { id: 'modification', label: 'Modification' },
  { id: 'suppression', label: 'Suppression' },
  { id: 'connexion', label: 'Connexion' },
  { id: 'upload', label: 'Upload / pièce' },
  { id: 'import', label: 'Import' },
  { id: 'paie', label: 'Paie' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'archivage', label: 'Archivage' },
  { id: 'résiliation', label: 'Résiliation' },
  { id: 'affectation', label: 'Affectation / liaison' },
  { id: 'pointage', label: 'Pointage' },
  { id: 'sécurité', label: 'Sécurité (2FA / MDP)' },
  { id: 'notification', label: 'Notifications' },
];

/** Filtres d’entité pour Mon activité. */
export const AUDIT_ENTITY_FILTERS: { id: string; label: string }[] = [
  { id: '', label: 'Toutes entités' },
  { id: 'Caisse', label: 'Caisse' },
  { id: 'CashMovement', label: 'Balance' },
  { id: 'Client', label: 'Client' },
  { id: 'Reconnu', label: 'Reconnu' },
  { id: 'Payment', label: 'Encaissement' },
  { id: 'Sale', label: 'Vente' },
  { id: 'Rental', label: 'Location' },
  { id: 'Purchase', label: 'Achat' },
  { id: 'Supplier', label: 'Fournisseur' },
  { id: 'Chantier', label: 'Chantier' },
  { id: 'Workforce', label: "Main-d'œuvre" },
  { id: 'Engin', label: 'Engin' },
  { id: 'InternalStaff', label: 'Équipe interne' },
  { id: 'User', label: 'Utilisateur' },
  { id: 'Document', label: 'Document' },
];

export function auditActionLabel(action: string) {
  if (AUDIT_ACTION_LABELS[action]) return AUDIT_ACTION_LABELS[action];
  if (action.startsWith('notification_')) return `Notification ${action.slice('notification_'.length)}`;
  return action.replace(/_/g, ' ');
}

export function actionTone(action: string): 'emerald' | 'coral' | 'amber' | 'violet' | 'muted' {
  if (['création', 'connexion', 'connexion_2fa', 'activation_2fa', 'upload', 'import_csv', 'import_xlsx', 'création_auto'].includes(action)) return 'emerald';
  if (['suppression', 'suppression_image', 'résiliation', 'désactivation_2fa', 'archivage'].includes(action)) return 'coral';
  if (['modification', 'workflow', 'changement_mot_de_passe', 'pointage', 'affectation', 'liaison', 'paie'].includes(action)) return 'amber';
  if (action.startsWith('notification_') || action === 'portail_fournisseur') return 'violet';
  return 'muted';
}

export function formatAuditDateTime(d?: string) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-MA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d));
}

export function ActionBadge({ action }: { action: string }) {
  const tone = actionTone(action);
  const cls = {
    emerald: 'bg-gic-emerald-soft text-gic-emerald',
    coral: 'bg-gic-coral-soft text-gic-coral',
    amber: 'bg-gic-amber-soft text-gic-amber',
    violet: 'bg-gic-violet-soft text-gic-violet',
    muted: 'bg-gray-100 text-gic-muted',
  }[tone];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {auditActionLabel(action)}
    </span>
  );
}
