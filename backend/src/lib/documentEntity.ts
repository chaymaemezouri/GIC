/** Anciens libellés encore enregistrés pour la même fiche. */
const ENTITY_ALIASES: Record<string, string[]> = {
  staff: ['InternalStaff', 'internalstaff'],
  internalstaff: ['staff', 'Staff', 'InternalStaff'],
  agent: ['Agent'],
  mandant: ['Mandant'],
  supplier: ['Supplier'],
  workforce: ['Workforce'],
  chantier: ['Chantier'],
  engin: ['Engin'],
  sale: ['Sale'],
  rental: ['Rental'],
  project: ['Project'],
  property: ['Property'],
  client: ['Client'],
  purchase: ['Purchase'],
  mission: ['Mission'],
  maintenance: ['Maintenance'],
};

/** Variantes de casse et d'anciens noms pour une même fiche. */
export function entityTypeVariants(entityType: string): string[] {
  const raw = entityType.trim();
  const lower = raw.toLowerCase();
  const titled = lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : '';
  const aliases = ENTITY_ALIASES[lower] || [];
  return [...new Set([raw, lower, titled, ...aliases].filter(Boolean))];
}

/** Lien direct fiche → document, indépendant de la casse de entityType. */
export function entityForeignKey(entityType: string, entityId: string): Record<string, string> | null {
  switch (entityType.trim().toLowerCase()) {
    case 'client':
      return { clientId: entityId };
    case 'supplier':
      return { supplierId: entityId };
    case 'property':
      return { propertyId: entityId };
    case 'chantier':
      return { chantierId: entityId };
    case 'rental':
      return { rentalId: entityId };
    case 'sale':
      return { saleId: entityId };
    case 'engin':
      return { enginId: entityId };
    default:
      return null;
  }
}
