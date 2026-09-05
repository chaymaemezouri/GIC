import type { LucideIcon } from 'lucide-react';
import {
  Users, UserCircle, UserCog, MapPin, Building2, Handshake, Home,
  HardHat, ShoppingCart, Truck, FolderOpen, CreditCard, ClipboardList, Cog, Shield,
} from 'lucide-react';
import { canAccessRoute } from './permissions';

export type CreateNavItem = { to: string; label: string; icon: LucideIcon };

export type CreateNavGroup = { id: string; label: string; items: CreateNavItem[] };

/** `label` = i18n key */
export const CREATE_GROUPS: CreateNavGroup[] = [
  {
    id: 'intervenants',
    label: 'create.group.stakeholders',
    items: [
      { to: '/clients?create=1', label: 'create.client', icon: Users },
      { to: '/mandants?create=1', label: 'create.mandant', icon: UserCircle },
      { to: '/agents?create=1', label: 'create.agent', icon: UserCog },
      { to: '/reconnus?create=1', label: 'create.reconnu', icon: UserCircle },
      { to: '/equipe-interne?create=1', label: 'create.collaborator', icon: Shield },
      { to: '/main-oeuvre?create=1', label: 'create.workforce', icon: HardHat },
      { to: '/chauffeurs?create=1', label: 'create.driver', icon: HardHat },
    ],
  },
  {
    id: 'immo',
    label: 'create.group.realEstate',
    items: [
      { to: '/projets?create=1', label: 'create.project', icon: MapPin },
      { to: '/biens?create=1', label: 'create.property', icon: Building2 },
      { to: '/ventes?create=1', label: 'create.sale', icon: Handshake },
      { to: '/locations?create=1', label: 'create.rental', icon: Home },
    ],
  },
  {
    id: 'finance',
    label: 'create.group.finance',
    items: [
      { to: '/encaissements?create=1', label: 'create.receipt', icon: CreditCard },
      { to: '/caisse?create=1', label: 'create.officeCash', icon: CreditCard },
    ],
  },
  {
    id: 'ops',
    label: 'create.group.operations',
    items: [
      { to: '/chantiers?create=1', label: 'create.site', icon: HardHat },
      { to: '/achats?create=1', label: 'create.purchase', icon: ShoppingCart },
      { to: '/fournisseurs?create=1', label: 'create.supplier', icon: Truck },
    ],
  },
  {
    id: 'log',
    label: 'create.group.logistics',
    items: [
      { to: '/engins?create=1', label: 'create.equipment', icon: Truck },
      { to: '/missions?create=1', label: 'create.mission', icon: ClipboardList },
      { to: '/maintenance?create=1', label: 'create.maintenance', icon: Cog },
    ],
  },
  {
    id: 'docs',
    label: 'create.group.documents',
    items: [
      { to: '/documents?create=1', label: 'create.document', icon: FolderOpen },
    ],
  },
];

export function filterCreateGroups(role: string): CreateNavGroup[] {
  return CREATE_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessRoute(role, item.to.split('?')[0])),
    }))
    .filter((group) => group.items.length > 0);
}

/** Liste aplatie — menu mobile, compatibilité */
export function flattenCreateGroups(groups: CreateNavGroup[]): CreateNavItem[] {
  return groups.flatMap((group) => group.items);
}

/** @deprecated Utiliser filterCreateGroups */
export const CREATE_ITEMS: CreateNavItem[] = flattenCreateGroups(CREATE_GROUPS);
