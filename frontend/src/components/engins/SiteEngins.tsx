import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, Truck } from 'lucide-react';
import { formatMad } from '../../lib/api';
import { queryString, type CostBucket, type CostLine } from '../../lib/engins';
import { useI18n } from '../../i18n/I18nContext';
import { Btn, Card, Tabs } from '../ui';
import { AssignmentsPanel } from './Assignments';
import { BucketTable, CostLinesTable } from './CostTables';
import { CostChips } from './FleetCommon';

export type SiteEnginCosts = {
  total: number;
  totals: CostBucket;
  byEngin?: (CostBucket & { enginId: string; enginLabel: string; days: number; hours: number })[];
  byTranche?: (CostBucket & { chantierId: string; chantierName: string; tranche: string })[];
  lines?: CostLine[];
};

type Tab = 'affectations' | 'engins' | 'tranches' | 'detail' | 'missions';

/** Onglet « Engins & Matériels » d’un chantier ou d’une tranche : affectations et coût réel imputé. */
export function SiteEnginsPanel({
  chantierId,
  tranche,
  costs,
  onChanged,
  missions,
  missionsCount = 0,
}: {
  chantierId: string;
  tranche?: string;
  costs?: SiteEnginCosts | null;
  onChanged?: () => void;
  missions?: ReactNode;
  missionsCount?: number;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('affectations');
  const [reloadKey, setReloadKey] = useState(0);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'affectations', label: t('fleet.nav.affectations') },
    { id: 'engins', label: t('fleet.tabs.byEngin') },
    ...(!tranche ? [{ id: 'tranches' as Tab, label: t('fleet.tabs.byTranche') }] : []),
    ...(costs?.lines ? [{ id: 'detail' as Tab, label: t('fleet.tabs.detail') }] : []),
    ...(missions ? [{ id: 'missions' as Tab, label: `${t('nav.missions')}${missionsCount ? ` (${missionsCount})` : ''}` }] : []),
  ];

  return (
    <div className="space-y-3 mt-2">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <p className="text-[13px] font-medium text-gic-ink tracking-tight inline-flex items-center gap-1.5">
              <Truck size={15} /> {t('fleet.sections.siteCost')}
            </p>
            <p className="text-[11px] text-gic-muted mt-0.5">{t('fleet.hints.siteCostHint')}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[18px] font-bold tabular-nums text-gic-violet">{formatMad(costs?.total || 0)}</span>
            <Link to={`/engins/couts?${queryString({ chantierId, tranche })}`}>
              <Btn variant="secondary" icon={Calculator}>{t('fleet.nav.couts')}</Btn>
            </Link>
          </div>
        </div>
        <CostChips bucket={costs?.totals} compact />
      </Card>

      <Card padding={false}>
        <div className="px-3 pt-3">
          <Tabs mac active={tab} onChange={(id) => setTab(id as Tab)} tabs={tabs} />
        </div>
        {tab === 'affectations' && (
          <div className="p-3">
            <AssignmentsPanel
              fixed={{ chantierId, tranche }}
              defaults={{ chantierId, tranche: tranche || '' }}
              lock={{ chantier: true, tranche: !!tranche }}
              reloadKey={reloadKey}
              onChanged={() => { setReloadKey((k) => k + 1); onChanged?.(); }}
            />
          </div>
        )}
        {tab === 'engins' && (
          <BucketTable
            rows={costs?.byEngin || []}
            label={t('fleet.fields.engin')}
            render={(r) => (
              <>
                <Link to={`/engins/${r.enginId}`} className="mac-table-ref">{r.enginLabel}</Link>
                <span className="block text-[10px] mac-table-muted">{t('fleet.hints.daysHours', { days: r.days, hours: r.hours })}</span>
              </>
            )}
          />
        )}
        {tab === 'tranches' && (
          <BucketTable
            rows={costs?.byTranche || []}
            label={t('fleet.fields.tranche')}
            render={(r) => r.tranche || <span className="mac-table-muted">{t('fleet.hints.wholeChantier')}</span>}
          />
        )}
        {tab === 'detail' && <CostLinesTable lines={costs?.lines || []} />}
        {tab === 'missions' && missions}
      </Card>
    </div>
  );
}
