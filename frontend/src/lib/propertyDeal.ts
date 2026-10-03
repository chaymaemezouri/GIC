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
