import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, PageHeader, Tabs } from '../components/ui';
import SalairesPage from './SalairesPage';
import SalairesEquipeInternePage from './SalairesEquipeInternePage';
import SalairesVirementsPage from './SalairesVirementsPage';
import { useI18n } from '../i18n/I18nContext';

export type SalaireType = 'tous' | 'main_oeuvre' | 'chauffeur' | 'equipe_interne' | 'virements';

const TAB_IDS: SalaireType[] = ['tous', 'main_oeuvre', 'chauffeur', 'equipe_interne', 'virements'];

export default function SalairesHubPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialType = (searchParams.get('type') as SalaireType) || 'tous';
  const [type, setType] = useState<SalaireType>(
    TAB_IDS.includes(initialType) ? initialType : 'tous',
  );

  const tabs = useMemo(
    () => [
      { id: 'tous' as const, label: t('common.all') },
      { id: 'main_oeuvre' as const, label: t('nav.workforce') },
      { id: 'chauffeur' as const, label: t('nav.drivers') },
      { id: 'equipe_interne' as const, label: t('nav.internalTeam') },
      { id: 'virements' as const, label: t('settings.bankList') },
    ],
    [t],
  );

  useEffect(() => {
    const q = searchParams.get('type') as SalaireType | null;
    if (q && TAB_IDS.includes(q) && q !== type) setType(q);
  }, [searchParams]);

  function switchType(next: SalaireType) {
    setType(next);
    setSearchParams({ type: next }, { replace: true });
  }

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.salaries')}
        subtitle={t('pages.salariesSubtitle')}
      />

      <Card className="mb-4">
        <Tabs mac active={type} onChange={(id) => switchType(id as SalaireType)} tabs={tabs} />
      </Card>

      {type === 'virements' ? (
        <SalairesVirementsPage embedded />
      ) : type === 'tous' ? (
        <SalairesPage embedded mode="all" />
      ) : type === 'main_oeuvre' ? (
        <SalairesPage embedded mode="main_oeuvre" />
      ) : type === 'chauffeur' ? (
        <SalairesPage embedded mode="chauffeur" />
      ) : (
        <SalairesEquipeInternePage embedded />
      )}
    </div>
  );
}
