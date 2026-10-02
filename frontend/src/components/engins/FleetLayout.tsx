import { Suspense } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Truck, CalendarRange, Wrench, FolderOpen,
  PieChart, Calculator, Package, Landmark, KeyRound, GanttChartSquare,
  Gauge, Undo2, Cog, Hammer, Fuel, Receipt, FileText, History, Warehouse,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';

type FleetSection = { to: string; label: string; icon: LucideIcon };
type FleetGroup = { id: string; icon: LucideIcon; items: FleetSection[] };

const FLEET_GROUPS: FleetGroup[] = [
  {
    id: 'pilotage',
    icon: LayoutDashboard,
    items: [
      { to: '/engins/tableau-de-bord', label: 'dashboard', icon: PieChart },
      { to: '/engins/couts', label: 'couts', icon: Calculator },
    ],
  },
  {
    id: 'parc',
    icon: Truck,
    items: [
      { to: '/engins?kind=engin', label: 'referentielEngins', icon: Truck },
      { to: '/engins?view=acquisitions', label: 'acquisitions', icon: Landmark },
      { to: '/engins?view=locations', label: 'locations', icon: KeyRound },
    ],
  },
  {
    id: 'materiel',
    icon: Package,
    items: [
      { to: '/engins?kind=materiel', label: 'referentielMateriels', icon: Package },
      { to: '/engins/stock', label: 'stock', icon: Warehouse },
    ],
  },
  {
    id: 'exploitation',
    icon: CalendarRange,
    items: [
      { to: '/engins/affectations', label: 'affectations', icon: CalendarRange },
      { to: '/engins/planning', label: 'planning', icon: GanttChartSquare },
      { to: '/engins/utilisation', label: 'utilisation', icon: Gauge },
      { to: '/engins/retours', label: 'retours', icon: Undo2 },
    ],
  },
  {
    id: 'maintenance',
    icon: Wrench,
    items: [
      { to: '/engins/entretien', label: 'entretien', icon: Cog },
      { to: '/engins/reparations', label: 'reparations', icon: Hammer },
      { to: '/engins/carburant', label: 'carburant', icon: Fuel },
      { to: '/engins/depenses', label: 'depenses', icon: Receipt },
    ],
  },
  {
    id: 'suivi',
    icon: FolderOpen,
    items: [
      { to: '/engins/documents', label: 'documents', icon: FileText },
      { to: '/engins/historique', label: 'historique', icon: History },
    ],
  },
];

function currentSection(pathname: string, search: string) {
  if (pathname !== '/engins') return pathname;
  const params = new URLSearchParams(search);
  const view = params.get('view');
  if (view) return `/engins?view=${view}`;
  return `/engins?kind=${params.get('kind') === 'materiel' ? 'materiel' : 'engin'}`;
}

/** Barre de navigation du module Engins, avec une rubrique Matériel séparée. */
export default function FleetLayout() {
  const { t } = useI18n();
  const location = useLocation();
  const active = currentSection(location.pathname, location.search);
  const activeGroup = FLEET_GROUPS.find((g) => g.items.some((i) => i.to === active)) || FLEET_GROUPS[0];

  return (
    <div>
      <nav className="fleet-nav" aria-label={t('fleet.nav.group')}>
        <div className="fleet-nav-groups">
          {FLEET_GROUPS.map((g) => {
            const Icon = g.icon;
            const isActive = g.id === activeGroup.id;
            return (
              <Link
                key={g.id}
                to={g.items[0].to}
                className={`fleet-nav-group${isActive ? ' fleet-nav-group-active' : ''}`}
                aria-current={isActive ? 'true' : undefined}
              >
                <Icon size={16} strokeWidth={2} />
                {t(`fleet.navGroups.${g.id}`)}
              </Link>
            );
          })}
        </div>
        <div className="fleet-nav-items">
          {activeGroup.items.map((item) => {
            const Icon = item.icon;
            const isActive = item.to === active;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`fleet-nav-item${isActive ? ' fleet-nav-item-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={14} strokeWidth={2} />
                {t(`fleet.nav.${item.label}`)}
              </Link>
            );
          })}
        </div>
      </nav>
      <Suspense fallback={<div className="py-16 text-center text-[12px] text-gic-muted">{t('common.loading')}</div>}>
        <Outlet />
      </Suspense>
    </div>
  );
}
