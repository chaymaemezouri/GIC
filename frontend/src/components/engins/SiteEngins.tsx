import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Truck, Wallet } from 'lucide-react';
import { api, formatDate, formatMad } from '../../lib/api';
import { COST_CATEGORIES, type CostBucket, type CostLine } from '../../lib/engins';
import { useI18n } from '../../i18n/I18nContext';
import { Btn, KpiCard, MacSearch, Modal, TableWrap, Tabs, Td, Th } from '../ui';
import { AssignmentsPanel } from './Assignments';
import { UsagePanel } from './Logs';
import { SiteTransferPanel } from './SiteTransferPanel';

export type SiteEnginCosts = {
  total: number;
  totals: CostBucket;
  byEngin?: (CostBucket & { enginId: string; enginLabel: string; days: number; hours: number })[];
  byTranche?: (CostBucket & { chantierId: string; chantierName: string; tranche: string })[];
  lines?: CostLine[];
};

type CostsPayload = {
  totals: CostBucket;
  byEngin: (CostBucket & { enginId: string; enginLabel: string; enginKind: string; days: number; hours: number })[];
  lines: CostLine[];
};

type Section = 'affectation' | 'transfer' | 'retours' | 'utilisation' | 'missions' | 'synthese';

/** Onglet chantier : affectation, missions et synthèse des coûts des engins uniquement. */
export function SiteEnginsPanel({
  chantierId,
  tranche,
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
  const [section, setSection] = useState<Section>('affectation');
  const [reloadKey, setReloadKey] = useState(0);
  const [costs, setCosts] = useState<CostsPayload | null>(null);
  const [openEnginId, setOpenEnginId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (section !== 'synthese') return;
    const qs = new URLSearchParams({ chantierId });
    if (tranche) qs.set('tranche', tranche);
    api<CostsPayload>(`/engins/costs?${qs}`)
      .then(setCosts)
      .catch(() => setCosts(null));
  }, [section, chantierId, tranche, reloadKey]);

  const synthesisRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (costs?.byEngin || []).filter((row) => {
      if (row.enginKind === 'materiel') return false;
      if (needle && !row.enginLabel.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [costs, query]);
  const openEngin = costs?.byEngin.find((row) => row.enginId === openEnginId) || null;
  const openLines = useMemo(
    () => (costs?.lines || []).filter((line) => line.enginId === openEnginId),
    [costs, openEnginId],
  );

  return (
    <div className="mt-2 space-y-3">
      <Tabs
        mac
        active={section}
        onChange={(id) => setSection(id as Section)}
        tabs={[
          { id: 'affectation', label: t('siteOps.affectation') },
          { id: 'transfer', label: t('siteOps.transfer') },
          { id: 'retours', label: t('fleet.nav.retours') },
          { id: 'utilisation', label: t('fleet.nav.utilisation') },
          { id: 'missions', label: missionsCount ? `${t('msg.equipmentMissionsTitle')} (${missionsCount})` : t('msg.equipmentMissionsTitle') },
          { id: 'synthese', label: t('siteOps.synthesis') },
        ]}
      />

      {section === 'affectation' && (
        <AssignmentsPanel
          site
          lockKind="engin"
          initialStatus="actifs"
          fixed={{ chantierId, tranche }}
          defaults={{ chantierId, tranche: tranche || '' }}
          lock={{ chantier: true, tranche: !!tranche }}
          reloadKey={reloadKey}
          onChanged={() => { setReloadKey((k) => k + 1); onChanged?.(); }}
        />
      )}

      {section === 'transfer' && (
        <SiteTransferPanel
          kind="engin"
          chantierId={chantierId}
          tranche={tranche}
          onChanged={() => { setReloadKey((k) => k + 1); onChanged?.(); }}
        />
      )}

      {section === 'retours' && (
        <AssignmentsPanel
          site
          lockKind="engin"
          initialStatus="actifs"
          returnFocus
          fixed={{ chantierId, tranche }}
          defaults={{ chantierId, tranche: tranche || '' }}
          lock={{ chantier: true, tranche: !!tranche }}
          reloadKey={reloadKey}
          onChanged={() => { setReloadKey((k) => k + 1); onChanged?.(); }}
        />
      )}

      {section === 'utilisation' && (
        <UsagePanel
          toolbar
          showKpis
          fixed={{ chantierId, tranche }}
          reloadKey={reloadKey}
          onChanged={() => { setReloadKey((k) => k + 1); onChanged?.(); }}
        />
      )}

      {section === 'missions' && missions}

      {section === 'synthese' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <MacSearch value={query} onChange={setQuery} placeholder={t('fleet.filters.searchEngin')} className="w-56" />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <KpiCard title={t('fleet.fields.engin')} value={synthesisRows.length} icon={Truck} compact />
            <KpiCard title={t('columns.hours')} value={synthesisRows.reduce((s, row) => s + row.hours, 0).toFixed(1)} icon={Clock} compact />
            <KpiCard title={t('fleet.costCat.total')} value={formatMad(synthesisRows.reduce((s, row) => s + row.total, 0))} icon={Wallet} compact />
          </div>
          {!costs || synthesisRows.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-gic-muted">{t('fleet.empty.costs')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('fleet.fields.engin')}</Th>
                  <Th mac>{t('columns.workDays')}</Th>
                  <Th mac>{t('columns.hours')}</Th>
                  {COST_CATEGORIES.map((cat) => <Th mac key={cat} className="text-right">{t(`fleet.costCat.${cat}`)}</Th>)}
                  <Th mac className="text-right">{t('fleet.costCat.total')}</Th>
                </tr>
              </thead>
              <tbody>
                {synthesisRows.map((row) => (
                  <tr key={row.enginId} className="cursor-pointer hover:bg-black/[0.02]" onClick={() => setOpenEnginId(row.enginId)}>
                    <Td mac><span className="mac-table-ref">{row.enginLabel}</span></Td>
                    <Td mac>{row.days.toFixed(1)}</Td>
                    <Td mac>{row.hours.toFixed(1)} h</Td>
                    {COST_CATEGORIES.map((cat) => <Td mac key={cat} className="text-right">{row[cat] ? formatMad(row[cat]) : '—'}</Td>)}
                    <Td mac className="text-right font-medium">{formatMad(row.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <Modal
            open={!!openEnginId}
            size="xl"
            title={openEngin?.enginLabel || t('siteOps.synthesis')}
            onClose={() => setOpenEnginId(null)}
            footer={<Btn variant="secondary" onClick={() => setOpenEnginId(null)}>{t('common.close')}</Btn>}
          >
            {openLines.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-gic-muted">{t('fleet.empty.costs')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('fleet.fields.tranche')}</Th>
                    <Th mac>{t('columns.designation')}</Th>
                    <Th mac>{t('columns.workDays')}</Th>
                    <Th mac>{t('columns.hours')}</Th>
                    <Th mac>{t('columns.amount')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {openLines.map((line) => (
                    <tr key={`${line.source}-${line.sourceId}`}>
                      <Td mac>{line.periodStart ? `${formatDate(line.periodStart)} → ${formatDate(line.periodEnd)}` : formatDate(line.date)}</Td>
                      <Td mac className="mac-table-muted">{line.tranche || t('fleet.hints.wholeChantier')}</Td>
                      <Td mac>
                        <Link to={`/engins/${line.enginId}`} className="mac-table-ref">{line.label}</Link>
                      </Td>
                      <Td mac>{line.days ? line.days.toFixed(1) : '—'}</Td>
                      <Td mac>{line.hours ? `${line.hours.toFixed(1)} h` : '—'}</Td>
                      <Td mac className="font-medium">{formatMad(line.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Modal>
        </div>
      )}
    </div>
  );
}
