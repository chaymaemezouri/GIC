import { canAccessRoute, filterByRole } from './permissions';
import {
  DEFAULT_RAIL_PATHS,
  buildNavCatalog,
  sidebarRail,
  type NavItem,
} from './navConfig';

export type SidebarPrefs = { rail: string[] };

export function getCatalogForRole(role: string): NavItem[] {
  const catalog = buildNavCatalog();
  return [...catalog.values()].filter((item) => canAccessRoute(role, item.to));
}

export function resolveRail(role: string, prefs?: SidebarPrefs | null): NavItem[] {
  const catalog = buildNavCatalog();
  const paths = prefs?.rail?.length ? prefs.rail : DEFAULT_RAIL_PATHS;
  const items: NavItem[] = [];

  for (const path of paths) {
    const item = catalog.get(path);
    if (item && canAccessRoute(role, path)) items.push(item);
  }

  if (items.length === 0) return filterByRole(role, sidebarRail);
  return items;
}

export function normalizeSidebarPrefs(prefs: unknown): SidebarPrefs | null {
  if (!prefs || typeof prefs !== 'object') return null;
  const rail = (prefs as { rail?: unknown }).rail;
  if (!Array.isArray(rail)) return null;
  const paths = rail
    .filter((p): p is string => typeof p === 'string' && p.startsWith('/'));
  return paths.length ? { rail: paths } : null;
}
