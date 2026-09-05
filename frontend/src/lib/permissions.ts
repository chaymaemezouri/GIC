import { isNavPathVisible } from './featureFlags';

export type PermissionModule =
  | 'dashboard'
  | 'crm'
  | 'immo'
  | 'transactions'
  | 'finance'
  | 'achats'
  | 'ops'
  | 'logistique'
  | 'documents'
  | 'notifications'
  | 'rh_interne'
  | 'system'
  | 'shared';

export const ROLE_MODULES: Record<string, PermissionModule[] | '*'> = {
  SUPER_ADMIN: '*',
  ADMIN: '*',
  COMPTABLE: [
    'dashboard', 'crm', 'transactions', 'finance', 'achats', 'documents', 'notifications', 'shared', 'rh_interne',
  ],
  COMMERCIAL: [
    'dashboard', 'crm', 'immo', 'transactions', 'documents', 'notifications', 'shared',
  ],
  CHEF_CHANTIER: [
    'dashboard', 'ops', 'achats', 'logistique', 'documents', 'notifications', 'shared',
  ],
  USER: ['dashboard', 'shared'],
};

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Administrateur',
  ADMIN: 'Administrateur',
  COMPTABLE: 'Comptable',
  COMMERCIAL: 'Commercial',
  CHEF_CHANTIER: 'Chef de chantier',
  USER: 'Utilisateur',
};

const PATH_RULES: { prefix: string; module: PermissionModule }[] = [
  { prefix: '/equipe-interne', module: 'rh_interne' },
  { prefix: '/utilisateurs', module: 'system' },
  { prefix: '/audit', module: 'system' },
  { prefix: '/referentiels', module: 'system' },
  { prefix: '/clients', module: 'crm' },
  { prefix: '/agents', module: 'crm' },
  { prefix: '/mandants', module: 'crm' },
  { prefix: '/reconnus', module: 'crm' },
  { prefix: '/biens', module: 'immo' },
  { prefix: '/projets', module: 'immo' },
  { prefix: '/ventes', module: 'transactions' },
  { prefix: '/locations', module: 'transactions' },
  { prefix: '/encaissements', module: 'finance' },
  { prefix: '/decaissements', module: 'finance' },
  { prefix: '/paiements', module: 'finance' },
  { prefix: '/balance', module: 'finance' },
  { prefix: '/caisse', module: 'finance' },
  { prefix: '/finance', module: 'finance' },
  { prefix: '/comptabilite', module: 'finance' },
  { prefix: '/salaires', module: 'finance' },
  { prefix: '/achats', module: 'achats' },
  { prefix: '/fournisseurs', module: 'achats' },
  { prefix: '/chantiers', module: 'ops' },
  { prefix: '/avancement', module: 'ops' },
  { prefix: '/main-oeuvre', module: 'ops' },
  { prefix: '/chauffeurs', module: 'ops' },
  { prefix: '/pointage', module: 'ops' },
  { prefix: '/engins', module: 'logistique' },
  { prefix: '/maintenance', module: 'logistique' },
  { prefix: '/missions', module: 'logistique' },
  { prefix: '/documents', module: 'documents' },
  { prefix: '/notifications', module: 'notifications' },
  { prefix: '/parametres', module: 'shared' },
];

function hasModule(role: string, module: PermissionModule): boolean {
  const allowed = ROLE_MODULES[role];
  if (!allowed) return false;
  if (allowed === '*') return true;
  return allowed.includes(module);
}

export function pathnameToModule(pathname: string): PermissionModule {
  if (pathname === '/' || pathname === '') return 'dashboard';
  for (const { prefix, module } of PATH_RULES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return module;
  }
  return 'shared';
}

export function canAccessRoute(role: string, pathname: string): boolean {
  if (!isNavPathVisible(pathname)) return false;
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return true;
  const module = pathnameToModule(pathname);
  if (module === 'shared') return true;
  return hasModule(role, module);
}

export function roleLabel(role: string) {
  return ROLE_LABELS[role] || role.replace(/_/g, ' ');
}

export function canManageUsers(role: string) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export function canWriteModule(role: string, pathname: string): boolean {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return true;
  const module = pathnameToModule(pathname);
  if (module === 'shared' || module === 'dashboard' || module === 'notifications') return false;
  return hasModule(role, module);
}

export function filterByRole<T extends { to: string }>(role: string, items: T[]): T[] {
  return items.filter((item) => canAccessRoute(role, item.to.split('?')[0]));
}
