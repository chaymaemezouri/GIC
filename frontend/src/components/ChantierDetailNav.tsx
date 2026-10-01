import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Info, Layers, ShoppingCart, Briefcase,
  Images, FileText, Video, History, Truck, Users, Car,
} from 'lucide-react';
import DetailSectionNav, { type DetailNavGroup } from './DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';

export type ChantierTab =
  | 'vue' | 'infos' | 'tranches' | 'galerie' | 'engins' | 'ouvriers' | 'chauffeurs' | 'pointage'
  | 'achats' | 'subcontractors' | 'documents' | 'cameras' | 'historique';

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
    workers: number;
    drivers: number;
    galerie: number;
    engins: number;
    achats: number;
    documents: number;
    cameras: number;
    subcontractors: number;
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
        { id: 'ouvriers', label: t('tabs.workers'), icon: Users, badge: counts.workers || undefined },
        { id: 'chauffeurs', label: t('pages.drivers'), icon: Car, badge: counts.drivers || undefined },
        { id: 'engins', label: t('tabs.equipment'), icon: Truck, badge: counts.engins || undefined },
      ],
    },
    {
      id: 'appro',
      label: t('tabs.supply'),
      items: [
        { id: 'achats', label: t('tabs.purchases'), icon: ShoppingCart, badge: counts.achats || undefined },
        { id: 'subcontractors', label: t('tabs.subcontractors'), icon: Briefcase, badge: counts.subcontractors || undefined },
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
