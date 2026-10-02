import { useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { Btn, Modal, Tabs } from '../ui';
import { MaterielStockPanel } from './MaterielStockPanel';
import { SiteTransferPanel } from './SiteTransferPanel';

type Section = 'stock' | 'transfer';

export function SiteMaterielPanel({
  chantierId,
  tranche,
  onChanged,
}: {
  chantierId: string;
  tranche?: string;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>('stock');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailLabel, setDetailLabel] = useState('');

  return (
    <div className="mt-2 space-y-3">
      <Tabs
        mac
        active={section}
        onChange={(id) => setSection(id as Section)}
        tabs={[
          { id: 'stock', label: t('fleet.stock.title') },
          { id: 'transfer', label: t('siteOps.transfer') },
        ]}
      />

      {section === 'stock' && (
        <MaterielStockPanel
          chantierId={chantierId}
          tranche={tranche}
          onOpenDetail={(id, label) => { setDetailId(id); setDetailLabel(label); }}
        />
      )}

      {section === 'transfer' && (
        <SiteTransferPanel kind="materiel" chantierId={chantierId} tranche={tranche} onChanged={onChanged} />
      )}

      <Modal
        open={!!detailId}
        size="xl"
        title={detailLabel || t('fleet.stock.title')}
        onClose={() => setDetailId(null)}
        footer={<Btn variant="secondary" onClick={() => setDetailId(null)}>{t('common.close')}</Btn>}
      >
        {detailId && <MaterielStockPanel enginId={detailId} />}
      </Modal>
    </div>
  );
}
