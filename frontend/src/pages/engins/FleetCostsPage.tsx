import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import { api, downloadCsv, fetchProjectList, formatDate, formatMad } from '../../lib/api';
import { printWithCompany } from '../../lib/companyPrint';
import { enginLabel, queryString, todayISO, yearStartISO } from '../../lib/engins';
import { buildFiltersHtml } from '../../lib/listPrint';
import { useI18n } from '../../i18n/I18nContext';
import { Btn, Card, MacDateInput, MacSelect, PageHeader, Tabs } from '../../components/ui';
import { CostChips, useFleetRefs, useTranches } from '../../components/engins/FleetCommon';
import { BucketTable, CostLinesTable, SynthesisTable, costsReportHtml, type CostsResponse } from '../../components/engins/CostTables';

type Tab = 'synthese' | 'chantier' | 'tranche' | 'engin' | 'detail';

export default function FleetCostsPage() {
  const { t } = useI18n();
  const { engins, chantiers } = useFleetRefs();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState({
    chantierId: searchParams.get('chantierId') || '',
    tranche: searchParams.get('tranche') || '',
    projectId: searchParams.get('projectId') || '',
    enginId: searchParams.get('enginId') || '',
    kind: searchParams.get('kind') || '',
    dateFrom: searchParams.get('dateFrom') || yearStartISO(),
    dateTo: searchParams.get('dateTo') || todayISO(),
  });
  const [tab, setTab] = useState<Tab>('synthese');
  const [data, setData] = useState<CostsResponse | null>(null);
  const tranches = useTranches(filters.chantierId);
  const qs = queryString(filters);

  useEffect(() => {
    fetchProjectList<{ id: string; name: string }>().then(setProjects).catch(() => {});
  }, []);
  useEffect(() => {
    setData(null);
    api<CostsResponse>(`/engins/costs?${qs}`).then(setData).catch(() => setData(null));
  }, [qs]);

  const set = (patch: Partial<typeof filters>) => setFilters((f) => ({ ...f, ...patch }));

  function printReport() {
    if (!data) return;
    printWithCompany({
      title: t('fleet.nav.couts'),
      landscape: true,
      bodyHtml: `${buildFiltersHtml([
        [t('fields.project'), filters.projectId && projects.find((p) => p.id === filters.projectId)?.name],
        [t('fleet.fields.chantier'), filters.chantierId && chantiers.find((c) => c.id === filters.chantierId)?.name],
        [t('fleet.fields.tranche'), filters.tranche],
        [t('fleet.fields.engin'), filters.enginId && enginLabel(engins.find((e) => e.id === filters.enginId))],
        [t('fleet.fields.kind'), filters.kind && t(`fleet.kindPlural.${filters.kind}`)],
        [t('listPrint.period'), (filters.dateFrom || filters.dateTo) && `${filters.dateFrom ? formatDate(filters.dateFrom) : '…'} → ${filters.dateTo ? formatDate(filters.dateTo) : '…'}`],
      ])}${costsReportHtml(data, t)}`,
    });
  }

  return (
    <div className="space-y-3">
      <PageHeader
        mac
        title={t('fleet.nav.couts')}
        subtitle={t('fleet.pages.coutsSubtitle')}
        backTo={false}
        actions={
          <>
            <Btn variant="secondary" icon={Printer} onClick={printReport} disabled={!data}>{t('common.print')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/engins/costs/export/csv?${qs}`, 'couts-engins-materiels.csv')}>{t('common.csv')}</Btn>
          </>
        }
      />
      <Card padding={false} className="overflow-visible">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <MacSelect value={filters.projectId} onChange={(v) => set({ projectId: v })} className="w-44 shrink-0" options={[{ value: '', label: t('fleet.filters.allProjects') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
          <MacSelect value={filters.chantierId} onChange={(v) => set({ chantierId: v, tranche: '' })} className="w-44 shrink-0" options={[{ value: '', label: t('fleet.filters.allChantiers') }, ...chantiers.map((c) => ({ value: c.id, label: c.name }))]} />
          {filters.chantierId && (
            <MacSelect value={filters.tranche} onChange={(v) => set({ tranche: v })} className="w-40 shrink-0" options={[{ value: '', label: t('fleet.filters.allTranches') }, ...tranches.map((tr) => ({ value: tr.name, label: tr.name }))]} />
          )}
          <MacSelect value={filters.enginId} onChange={(v) => set({ enginId: v })} className="w-48 shrink-0" options={[{ value: '', label: t('fleet.filters.allEngins') }, ...engins.map((e) => ({ value: e.id, label: [e.code, e.designation || e.brand].filter(Boolean).join(' — ') }))]} />
          <MacSelect value={filters.kind} onChange={(v) => set({ kind: v })} className="w-36 shrink-0" options={[{ value: '', label: t('fleet.filters.allKinds') }, { value: 'engin', label: t('fleet.kindPlural.engin') }, { value: 'materiel', label: t('fleet.kindPlural.materiel') }]} />
          <MacDateInput value={filters.dateFrom} onChange={(v) => set({ dateFrom: v })} placeholder={t('fields.from')} className="w-36 shrink-0" />
          <MacDateInput value={filters.dateTo} onChange={(v) => set({ dateTo: v })} placeholder={t('fields.to')} className="w-36 shrink-0" />
        </div>
      </Card>

      {!data ? (
        <Card><p className="text-[12px] text-gic-muted text-center py-4">{t('common.loading')}</p></Card>
      ) : (
        <>
          <CostChips bucket={data.totals} />
          <div className="flex flex-wrap gap-3 text-[11px] text-gic-muted">
            <span>{t('fleet.kpi.imputed')} : <strong className="text-gic-ink">{formatMad(data.totals.imputed)}</strong></span>
            <span>{t('fleet.kpi.unallocated')} : <strong className={data.totals.unallocated > 0 ? 'text-gic-coral' : 'text-gic-ink'}>{formatMad(data.totals.unallocated)}</strong></span>
            <span>{t('fleet.hints.costsMethod')}</span>
          </div>
          <Card padding={false}>
            <div className="px-3 pt-3">
              <Tabs
                mac
                active={tab}
                onChange={(id) => setTab(id as Tab)}
                tabs={[
                  { id: 'synthese', label: t('fleet.tabs.synthesis') },
                  { id: 'chantier', label: t('fleet.tabs.byChantier') },
                  { id: 'tranche', label: t('fleet.tabs.byTranche') },
                  { id: 'engin', label: t('fleet.tabs.byEngin') },
                  { id: 'detail', label: t('fleet.tabs.detail') },
                ]}
              />
            </div>
            {tab === 'synthese' && <SynthesisTable lines={data.synthesis} />}
            {tab === 'chantier' && (
              <BucketTable
                rows={data.byChantier}
                label={t('fleet.fields.chantier')}
                render={(r) => (
                  <>
                    <Link to={`/chantiers/${r.chantierId}?tab=engins`} className="mac-table-ref">{r.chantierName}</Link>
                    {r.projectName && <span className="block text-[10px] mac-table-muted">{r.projectName}</span>}
                  </>
                )}
              />
            )}
            {tab === 'tranche' && (
              <BucketTable
                rows={data.byTranche}
                label={t('fleet.fields.chantierTranche')}
                render={(r) => (
                  <>
                    {r.chantierName}
                    <span className="block text-[10px] mac-table-muted">{r.tranche || t('fleet.hints.wholeChantier')}</span>
                  </>
                )}
              />
            )}
            {tab === 'engin' && (
              <BucketTable
                rows={data.byEngin}
                label={t('fleet.fields.engin')}
                render={(r) => (
                  <>
                    <Link to={`/engins/${r.enginId}`} className="mac-table-ref">{r.enginLabel}</Link>
                    <span className="block text-[10px] mac-table-muted">
                      {t('fleet.hints.daysHours', { days: r.days, hours: r.hours })}
                      {r.hours > 0 ? ` · ${formatMad(r.total / r.hours)} / h` : ''}
                    </span>
                  </>
                )}
              />
            )}
            {tab === 'detail' && <CostLinesTable lines={data.lines} />}
          </Card>
        </>
      )}
    </div>
  );
}
