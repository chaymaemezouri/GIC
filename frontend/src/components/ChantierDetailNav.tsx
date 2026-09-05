import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Info, Layers, Users, Clock, ShoppingCart, Package, Briefcase,
  Images, FileText, Video, History, Truck,
} from 'lucide-react';
import DetailSectionNav, { type DetailNavGroup } from './DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';

export type ChantierTab =
  | 'vue' | 'infos' | 'tranches' | 'galerie' | 'personnel' | 'engins' | 'pointage'
  | 'achats' | 'stock' | 'subcontractors' | 'documents' | 'cameras' | 'historique';

export type ChantierNavItem = {
  id: ChantierTab;
  label: string;
  icon: LucideIcon;
  badge?: string | number;
};

export type ChantierNavGroup = {
  id: string;
  label: string;
  items: ChantierNavItem[];
};

export function buildChantierNavGroups(
  t: TranslateFn,
  counts: {
    tranches: number;
    galerie: number;
    personnel: number;
    engins: number;
    achats: number;
    documents: number;
    cameras: number;
  },
): ChantierNavGroup[] {
  return [
    {
      id: 'pilotage',
      label: t('tabs.pilotage'),
      items: [
        { id: 'vue', label: t('tabs.generalView'), icon: LayoutDashboard },
        { id: 'infos', label: t('tabs.informations'), icon: Info },
      ],
    },
    {
      id: 'exploitation',
      label: t('tabs.exploitation'),
      items: [
        { id: 'tranches', label: t('tabs.tranches'), icon: Layers, badge: counts.tranches || undefined },
        { id: 'personnel', label: t('tabs.workers'), icon: Users, badge: counts.personnel || undefined },
        { id: 'engins', label: t('tabs.equipment'), icon: Truck, badge: counts.engins || undefined },
        { id: 'pointage', label: t('tabs.attendance'), icon: Clock },
      ],
    },
    {
      id: 'appro',
      label: t('tabs.supply'),
      items: [
        { id: 'achats', label: t('tabs.purchases'), icon: ShoppingCart, badge: counts.achats || undefined },
        { id: 'stock', label: t('tabs.stock'), icon: Package },
        { id: 'subcontractors', label: t('tabs.subcontractors'), icon: Briefcase },
      ],
    },
    {
      id: 'ressources',
      label: t('tabs.mediaDocs'),
      items: [
        { id: 'galerie', label: t('tabs.gallery'), icon: Images, badge: counts.galerie || undefined },
        { id: 'documents', label: t('tabs.documents'), icon: FileText, badge: counts.documents || undefined },
        { id: 'cameras', label: t('tabs.cameras'), icon: Video, badge: counts.cameras || undefined },
      ],
    },
    {
      id: 'suivi',
      label: t('tabs.followUp'),
      items: [
        { id: 'historique', label: t('tabs.history'), icon: History },
      ],
    },
  ];
}

type Props = {
  active: ChantierTab;
  onChange: (tab: ChantierTab) => void;
  groups: ChantierNavGroup[];
};

export default function ChantierDetailNav({ active, onChange, groups }: Props) {
  const { t } = useI18n();
  return (
    <DetailSectionNav
      active={active}
      onChange={(id) => onChange(id as ChantierTab)}
      groups={groups as DetailNavGroup[]}
      ariaLabel={t('detail.siteSectionsAria')}
    />
  );
}
