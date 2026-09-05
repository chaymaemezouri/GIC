export function googleMapsSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function projectLocationQuery(parts: {
  address?: string | null;
  city?: string | null;
  name?: string | null;
}) {
  return [parts.address, parts.city, parts.name].filter(Boolean).join(', ');
}
