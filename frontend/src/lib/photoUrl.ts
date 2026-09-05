/** URL affichable pour une photo stockée en /uploads (cache-bust optionnel). */
export function photoSrc(photo?: string | null, bust?: number | string) {
  if (!photo) return undefined;
  if (!bust) return photo;
  const sep = photo.includes('?') ? '&' : '?';
  return `${photo}${sep}v=${bust}`;
}
