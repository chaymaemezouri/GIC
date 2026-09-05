import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Users, UserCircle, Building2, MapPin, Handshake, Home,
  Wallet, CreditCard, Calculator, Truck, ShoppingCart, HardHat, Cog,
  ClipboardList, Clock, Banknote, TrendingUp, TrendingDown, FolderOpen, Settings, Shield,
  BookOpen, UserCog, FileSearch, Bell, Car, Coins, Contact,
} from 'lucide-react';
import { isNavPathVisible } from './featureFlags';

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

export type NavGroup = { id: string; label: string; description: string; icon: LucideIcon; items: NavItem[] };

/** Rail — 7 raccourcis essentiels (défaut). `label` = i18n key. */
export const sidebarRail: NavItem[] = [
  { to: '/', label: 'nav.home', icon: LayoutDashboard, end: true },
  { to: '/clients', label: 'nav.clients', icon: Users },
  { to: '/biens', label: 'nav.properties', icon: Building2 },
  { to: '/ventes', label: 'nav.sales', icon: Handshake },
  { to: '/balance', label: 'nav.balance', icon: Wallet },
  { to: '/documents', label: 'nav.documents', icon: FolderOpen },
];

export const DEFAULT_RAIL_PATHS = sidebarRail.map((item) => item.to);

/** Modules hors rail par défaut — catalogue sidebar (doublons ignorés) */
export const optionalNavItems: NavItem[] = [];

export const navbarGroups: NavGroup[] = [
  {
    id: 'intervenants',
    label: 'nav.group.stakeholders',
    description: 'nav.group.stakeholdersDesc',
    icon: Users,
    items: [
      { to: '/clients', label: 'nav.clients', icon: Users },
      { to: '/mandants', label: 'nav.mandants', icon: UserCircle },
      { to: '/agents', label: 'nav.agents', icon: UserCog },
      { to: '/reconnus', label: 'nav.reconnus', icon: Contact },
      { to: '/equipe-interne', label: 'nav.internalTeam', icon: Shield },
      { to: '/main-oeuvre', label: 'nav.workforce', icon: HardHat },
      { to: '/chauffeurs', label: 'nav.drivers', icon: Car },
      { to: '/pointage', label: 'nav.attendance', icon: Clock },
    ],
  },
  {
    id: 'immo',
    label: 'nav.group.realEstate',
    description: 'nav.group.realEstateDesc',
    icon: Building2,
    items: [
      { to: '/biens', label: 'nav.properties', icon: Building2 },
      { to: '/projets', label: 'nav.projects', icon: MapPin },
      { to: '/ventes', label: 'nav.sales', icon: Handshake },
      { to: '/locations', label: 'nav.rentals', icon: Home },
    ],
  },
  {
    id: 'finance',
    label: 'nav.group.finance',
    description: 'nav.group.financeDesc',
    icon: Wallet,
    items: [
      { to: '/balance', label: 'nav.balance', icon: Wallet },
      { to: '/caisse', label: 'nav.cash', icon: Coins },
      { to: '/encaissements', label: 'nav.receipts', icon: CreditCard },
      { to: '/decaissements', label: 'nav.disbursements', icon: TrendingDown },
      { to: '/comptabilite', label: 'nav.accounting', icon: Calculator },
      { to: '/salaires', label: 'nav.salaries', icon: Banknote },
    ].filter((item) => isNavPathVisible(item.to)),
  },
  {
    id: 'ops',
    label: 'nav.group.operations',
    description: 'nav.group.operationsDesc',
    icon: ShoppingCart,
    items: [
      { to: '/achats', label: 'nav.purchases', icon: ShoppingCart },
      { to: '/fournisseurs', label: 'nav.suppliers', icon: Truck },
      { to: '/avancement', label: 'nav.progress', icon: TrendingUp },
    ],
  },
  {
    id: 'log',
    label: 'nav.group.logistics',
    description: 'nav.group.logisticsDesc',
    icon: Truck,
    items: [
      { to: '/engins', label: 'nav.equipment', icon: Truck },
      { to: '/maintenance', label: 'nav.maintenance', icon: Cog },
      { to: '/missions', label: 'nav.missions', icon: ClipboardList },
    ],
  },
  {
    id: 'docs',
    label: 'nav.group.documents',
    description: 'nav.group.documentsDesc',
    icon: FolderOpen,
    items: [
      { to: '/documents', label: 'nav.documents', icon: FolderOpen },
      { to: '/notifications', label: 'nav.notifications', icon: Bell },
    ],
  },
];

export function buildNavCatalog(): Map<string, NavItem> {
  const map = new Map<string, NavItem>();
  for (const item of sidebarRail) {
    if (isNavPathVisible(item.to)) map.set(item.to, item);
  }
  for (const item of navbarDirectLinks) {
    if (isNavPathVisible(item.to)) map.set(item.to, item);
  }
  for (const g of navbarGroups) {
    for (const item of g.items) {
      if (isNavPathVisible(item.to)) map.set(item.to, item);
    }
  }
  for (const item of settingsAdminItems) map.set(item.to, item);
  for (const item of optionalNavItems) map.set(item.to, item);
  return map;
}

export const settingsNavItem: NavItem = { to: '/parametres', label: 'nav.settings', icon: Settings };

/** Modules admin — accessibles depuis Réglages (hors navbar) */
export const settingsAdminItems: NavItem[] = [
  { to: '/referentiels', label: 'nav.referentials', icon: BookOpen },
  { to: '/audit', label: 'nav.audit', icon: FileSearch },
  { to: '/utilisateurs', label: 'nav.users', icon: Users },
];

/** Groupe navbar affiché avant les liens directs (ex. Chantiers) */
export const navbarPrimaryGroupId = 'intervenants';

export function splitNavbarGroups(groups: NavGroup[]) {
  const primary = groups.find((g) => g.id === navbarPrimaryGroupId) ?? null;
  const rest = groups.filter((g) => g.id !== navbarPrimaryGroupId);
  return { primary, rest };
}

/** Liens directs navbar — hors menus déroulants (à côté d'Accueil) */
export const navbarDirectLinks: NavItem[] = [
  { to: '/chantiers', label: 'nav.sites', icon: HardHat },
];
