export type PropertyDeal = 'vente' | 'location';

function fold(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function propertyDealOf(p: { type?: string | null; status?: string | null }): PropertyDeal {
  const raw = fold(p.type);
  if (raw === 'location' || raw === 'loue' || raw === 'louer' || raw === 'rental') return 'location';
  if (raw === 'vente' || raw === 'vendu' || raw === 'vendre' || raw === 'sale') return 'vente';
  const status = fold(p.status);
  if (status === 'loue') return 'location';
  if (status === 'vendu') return 'vente';
  return 'vente';
}

export function availabilityStatusOf(status: string) {
  const value = fold(status);
  if (value === 'vendu' || value === 'loue') return 'indisponible';
  return status || 'disponible';
}

/** Statut réel du bien, cohérent avec le type (vente ≠ loué, location ≠ vendu). */
export function occupancyForDeal(deal: PropertyDeal | string | null | undefined, status?: string | null) {
  const kind: PropertyDeal = fold(deal) === 'location' || deal === 'location' ? 'location' : 'vente';
  const value = fold(status);
  if (value === 'reserve') return 'réservé';
  if (value === 'disponible') return 'disponible';
  if (kind === 'location') {
    if (value === 'loue' || value === 'indisponible') return 'loué';
    return 'disponible';
  }
  if (value === 'vendu' || value === 'indisponible') return 'vendu';
  return 'disponible';
}

export function occupancyStatusOf(p: { type?: string | null; status?: string | null }) {
  return occupancyForDeal(propertyDealOf(p), p.status);
}
