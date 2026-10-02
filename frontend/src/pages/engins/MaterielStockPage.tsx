import { PageHeader } from '../../components/ui';
import { MaterielStockPanel } from '../../components/engins/MaterielStockPanel';
import { useI18n } from '../../i18n/I18nContext';

export default function MaterielStockPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <PageHeader mac title={t('fleet.nav.stock')} subtitle={t('fleet.pages.stockSubtitle')} backTo={false} />
      <MaterielStockPanel />
    </div>
  );
}
