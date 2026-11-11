/** Le site en ligne ne transmet au serveur que /api. Les fichiers passent donc par /api/uploads. */
function routeUploadPath(pathname: string) {
  if (pathname.startsWith('/api/uploads')) return pathname;
  if (pathname === '/uploads' || pathname.startsWith('/uploads/')) return `/api${pathname}`;
  return pathname;
}

/** URL affichable pour une photo / fichier uploadé (même origine → proxy Vite / Apache). */
export function fileUrl(path: string) {
  if (!path) return '';
  if (path.startsWith('data:') || path.startsWith('blob:')) return path;

  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const u = new URL(path);
      // Réécrit les anciennes URL absolues API → chemin relatif (évite mauvais port)
      if (u.pathname.startsWith('/uploads') || u.pathname.startsWith('/api')) {
        return `${routeUploadPath(u.pathname)}${u.search}`;
      }
    } catch {
      /* ignore */
    }
    return path;
  }

  const normalized = routeUploadPath(path.startsWith('/') ? path : `/${path}`);
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
