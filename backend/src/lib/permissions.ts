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

const ALL_MODULES: PermissionModule[] = [
  'dashboard', 'crm', 'immo', 'transactions', 'finance', 'achats', 'ops',
  'logistique', 'documents', 'notifications', 'system', 'shared', 'rh_interne',
];

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

export function roleLabel(role: string) {
  return ROLE_LABELS[role] || role.replace(/_/g, ' ');
}

function hasModule(role: string, module: PermissionModule): boolean {
  const allowed = ROLE_MODULES[role];
  if (!allowed) return false;
  if (allowed === '*') return true;
  return allowed.includes(module);
}

export function apiPathToModule(path: string, method = 'GET'): PermissionModule {
  const p = path.split('?')[0];

  if (p.startsWith('/api/auth/users')) return 'system';
  if (p.startsWith('/api/equipe-interne')) return 'rh_interne';
  if (p.startsWith('/api/auth')) return 'shared';
  if (p.startsWith('/api/portal')) return 'shared';

  if (p.startsWith('/api/clients') || p.startsWith('/api/agents') || p.startsWith('/api/mandants') || p.startsWith('/api/reconnus')) {
    return 'crm';
  }
  if (p.startsWith('/api/immobilier')) return 'immo';
  if (p.startsWith('/api/transactions')) return 'transactions';
  if (p.startsWith('/api/finance') || p.startsWith('/api/caisse-bureau') || p.startsWith('/api/salaires')) {
    return 'finance';
  }
  if (p.startsWith('/api/settings')) return 'shared';
  if (p.startsWith('/api/achats')) return 'achats';
  if (p.startsWith('/api/engins')) return 'logistique';
  if (p.startsWith('/api/documents')) return 'documents';
  if (p.startsWith('/api/dashboard')) return 'dashboard';
  if (p.startsWith('/api/notifications') || p.includes('/notifications')) return 'notifications';

  if (p.startsWith('/api/chantiers')) {
    if (p.includes('/salaries')) return 'finance';
    return 'ops';
  }

  if (p.startsWith('/api/audit')) return 'system';
  if (p.startsWith('/api/dropdowns')) {
    return method === 'GET' ? 'shared' : 'system';
  }
  if (p.startsWith('/api/search')) return 'shared';
  if (p.startsWith('/api/users')) return 'system';

  return 'shared';
}

export function canAccessApi(role: string, method: string, path: string): boolean {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return true;

  const module = apiPathToModule(path, method);
  if (module === 'shared') return true;

  return hasModule(role, module);
}

export function canManageUsers(role: string) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

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
  { prefix: '/pointage', module: 'ops' },
  { prefix: '/engins', module: 'logistique' },
  { prefix: '/maintenance', module: 'logistique' },
  { prefix: '/missions', module: 'logistique' },
  { prefix: '/documents', module: 'documents' },
  { prefix: '/notifications', module: 'notifications' },
  { prefix: '/parametres', module: 'shared' },
];

export const NAV_ROUTE_PATHS = [
  '/',
  '/clients',
  '/mandants',
  '/agents',
  '/reconnus',
  '/biens',
  '/projets',
  '/ventes',
  '/locations',
  '/encaissements',
  '/decaissements',
  '/paiements',
  '/balance',
  '/caisse',
  '/comptabilite',
  '/salaires',
  '/chantiers',
  '/fournisseurs',
  '/achats',
  '/main-oeuvre',
  '/pointage',
  '/avancement',
  '/engins',
  '/maintenance',
  '/missions',
  '/referentiels',
  '/equipe-interne',
  '/utilisateurs',
  '/audit',
  '/documents',
  '/notifications',
] as const;

export function pathnameToModule(pathname: string): PermissionModule {
  if (pathname === '/' || pathname === '') return 'dashboard';
  for (const { prefix, module } of PATH_RULES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return module;
  }
  return 'shared';
}

export function canAccessRoute(role: string, pathname: string): boolean {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return true;
  const module = pathnameToModule(pathname);
  if (module === 'shared') return true;
  return hasModule(role, module);
}
