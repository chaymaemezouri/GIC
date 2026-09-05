import { canAccessRoute, NAV_ROUTE_PATHS } from './permissions.js';

export type SidebarPrefs = { rail: string[] };

const NAV_SET = new Set<string>(NAV_ROUTE_PATHS);

export function sanitizeSidebarPrefs(role: string, raw: unknown): SidebarPrefs | null {
  if (!raw || typeof raw !== 'object') return null;
  const rail = (raw as { rail?: unknown }).rail;
  if (!Array.isArray(rail)) return null;

  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of rail) {
    if (typeof entry !== 'string') continue;
    const path = entry.startsWith('/') ? entry : `/${entry}`;
    if (!NAV_SET.has(path)) continue;
    if (!canAccessRoute(role, path)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    result.push(path);
    if (result.length >= 15) break;
  }

  return result.length ? { rail: result } : null;
}

export function parseSidebarPrefs(role: string, raw: unknown): SidebarPrefs | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return sanitizeSidebarPrefs(role, JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return sanitizeSidebarPrefs(role, raw);
}
