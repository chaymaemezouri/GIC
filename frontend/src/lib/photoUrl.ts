/** URL affichable pour une photo / fichier uploadé (même origine → proxy Vite / Apache). */
export function fileUrl(path: string) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const rawBase = import.meta.env.VITE_API_URL as string | undefined;
  if (!rawBase) return normalized;
  const base = rawBase.replace(/\/api\/?$/, '').replace(/\/$/, '');
  return `${base}${normalized}`;
}

/** URL affichable pour une photo stockée en /uploads (cache-bust optionnel). */
export function photoSrc(photo?: string | null, bust?: number | string) {
  if (!photo) return undefined;
  const url = fileUrl(photo);
  if (!bust) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${bust}`;
}
