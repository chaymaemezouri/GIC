import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, Clock, KeyRound, Package, Printer, Truck, Wrench } from 'lucide-react';
import { api, formatDate, formatMad } from '../../lib/api';
import { escHtml, printWithCompany } from '../../lib/companyPrint';
import { fleetStatusLabel, queryString, todayISO, yearStartISO, type CostBucket } from '../../lib/engins';
import { buildFiltersHtml, buildRowsTableHtml, type PrintColumn } from '../../lib/listPrint';
import { useI18n } from '../../i18n/I18nContext';
import { Btn, Card, EmptyState, KpiCard, MacDateInput, PageHeader, SectionTitle, TableWrap, Td, Th } from '../../components/ui';
import { CostChips, FleetStatusPill } from '../../components/engins/FleetCommon';
import { SynthesisTable, bucketPrintHtml, costCategoriesPrintHtml, synthesisPrintHtml, type CostsResponse } from '../../components/engins/CostTables';

type Dashboard = {
  counts: { engins: number; materiels: number; total: number; disponibles: number; affectes: number; enMaintenance: number; enReparation: number; horsService: number; loues: number; restitues: number; proprietes: number; activeAssignments: number };
  costs: CostBucket & { imputed: number; unallocated: number; idle?: number; hours: number; costPerHour: number | null };
  utilization: { assignedDays: number; availableDays: number; rate: number; downtimeDays: number };
  byChantier: (CostBucket & { chantierId: string; chantierName: string })[];
  byTranche: (CostBucket & { chantierId: string; chantierName: string; tranche: string })[];
  byEngin: (CostBucket & { enginId: string; enginLabel: string; kind: string; status: string; hours: number; costPerHour: number | null; utilizationRate: number; downtimeDays: number; assignedDays: number; availableDays: number })[];
};

function Bars({ rows, empty }: { rows: { key: string; label: React.ReactNode; value: number; sub?: string }[]; empty: string }) {
  if (rows.length === 0) return <EmptyState title={empty} />;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2 p-3">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="truncate">{r.label}</span>
            <span className="tabular-nums font-semibold shrink-0">{formatMad(r.value)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-black/[0.05] mt-1 overflow-hidden">
            <div className="h-full rounded-full bg-gic-violet" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
          {r.sub && <p className="text-[10px] text-gic-muted mt-0.5">{r.sub}</p>}
        </div>
      ))}
    </div>
  );
}

export default function FleetDashboardPage() {
  const { t } = useI18n();
  const [dateFrom, setDateFrom] = useState(yearStartISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [data, setData] = useState<Dashboard | null>(null);
  const [costs, setCosts] = useState<CostsResponse | null>(null);

  useEffect(() => {
    const qs = queryString({ dateFrom, dateTo });
    setData(null);
    api<Dashboard>(`/engins/dashboard?${qs}`).then(setData).catch(() => setData(null));
    api<CostsResponse>(`/engins/costs?${qs}`).then(setCosts).catch(() => setCosts(null));
  }, [dateFrom, dateTo]);

  function printDashboard() {
    if (!data) return;
    const { counts, utilization, costs: c } = data;
    const section = (title: string, html: string) => `<h2>${escHtml(title)}</h2>${html}`;
    const pairColumns: PrintColumn<[string, string]>[] = [
      { label: t('fleet.fields.label'), value: (r) => r[0] },
      { label: t('fields.value'), value: (r) => r[1], align: 'right' },
    ];
    const kpis: [string, string][] = [
      [t('fleet.kpi.engins'), `${counts.engins} (${t('fleet.kpi.totalDelta', { count: counts.total })})`],
      [t('fleet.kpi.materiels'), String(counts.materiels)],
      [t('fleet.kpi.available'), String(counts.disponibles)],
      [t('fleet.kpi.assigned'), `${counts.affectes} (${t('fleet.kpi.activeAssignmentsDelta', { count: counts.activeAssignments })})`],
      [t('fleet.kpi.inRepair'), `${counts.enReparation + counts.enMaintenance} (${t('fleet.kpi.repairDelta', { repair: counts.enReparation, maint: counts.enMaintenance })})`],
      [t('fleet.kpi.rented'), `${counts.loues} (${t('fleet.kpi.returnedDelta', { count: counts.restitues })})`],
      [t('fleet.kpi.utilization'), `${utilization.rate} % (${t('fleet.kpi.utilizationDelta', { assigned: utilization.assignedDays, available: utilization.availableDays })})`],
      [t('fleet.kpi.downtime'), `${t('fleet.hints.daysShort', { days: utilization.downtimeDays })}${counts.horsService ? ` (${t('fleet.kpi.outOfServiceDelta', { count: counts.horsService })})` : ''}`],
    ];
    const costSummary: [string, string][] = [
      [t('fleet.kpi.imputed'), formatMad(c.imputed)],
      [t('fleet.kpi.unallocated'), formatMad(c.unallocated)],
      ...((c.idle ?? 0) > 0 ? [[t('fleet.kpi.idle'), formatMad(c.idle ?? 0)] as [string, string]] : []),
      [t('fleet.kpi.hours'), `${c.hours} h`],
      [t('fleet.kpi.costPerHour'), c.costPerHour != null ? formatMad(c.costPerHour) : '—'],
    ];
    type EnginRow = Dashboard['byEngin'][number];
    const sumMad = (key: keyof CostBucket) => (rows: EnginRow[]) => formatMad(rows.reduce((s, r) => s + r[key], 0));
    const enginColumns: PrintColumn<EnginRow>[] = [
      { label: t('fleet.fields.engin'), value: (e) => e.enginLabel },
      { label: t('fleet.fields.status'), value: (e) => fleetStatusLabel(e.status, t) },
      ...(['amortissement', 'location', 'entretien', 'reparation', 'carburant', 'total'] as const).map((k): PrintColumn<EnginRow> => ({
        label: t(`fleet.costCat.${k}`), value: (e) => formatMad(e[k]), align: 'right', total: sumMad(k),
      })),
      { label: t('fleet.fields.hours'), value: (e) => `${e.hours} h`, align: 'right', total: (rows) => `${Math.round(rows.reduce((s, e) => s + e.hours, 0) * 100) / 100} h` },
      { label: t('fleet.kpi.costPerHour'), value: (e) => (e.costPerHour != null ? formatMad(e.costPerHour) : '—'), align: 'right' },
      { label: t('fleet.kpi.utilization'), value: (e) => `${e.utilizationRate} %`, align: 'right' },
      { label: t('fleet.kpi.downtime'), value: (e) => (e.downtimeDays ? t('fleet.hints.daysShort', { days: e.downtimeDays }) : '—'), align: 'right' },
    ];
    printWithCompany({
      title: t('fleet.nav.dashboard'),
      landscape: true,
      bodyHtml: [
        buildFiltersHtml([[t('listPrint.period'), `${dateFrom ? formatDate(dateFrom) : '…'} → ${dateTo ? formatDate(dateTo) : '…'}`]]),
        section(t('fleet.navGroups.parc'), buildRowsTableHtml(pairColumns, kpis)),
        section(t('fleet.sections.costs'), `${costCategoriesPrintHtml(c, t)}${buildRowsTableHtml(pairColumns, costSummary)}`),
        section(t('fleet.tabs.byChantier'), bucketPrintHtml(data.byChantier, t, t('fleet.fields.chantier'), (r) => r.chantierName)),
        section(t('fleet.tabs.byTranche'), bucketPrintHtml(data.byTranche, t, t('fleet.fields.chantierTranche'), (r) => `${r.chantierName} — ${r.tranche || t('fleet.hints.wholeChantier')}`)),
        section(t('fleet.sections.perEngin'), data.byEngin.length ? buildRowsTableHtml(enginColumns, data.byEngin) : `<p class="muted">${escHtml(t('fleet.empty.engins'))}</p>`),
        costs ? section(t('fleet.sections.synthesis'), synthesisPrintHtml(costs.synthesis, t)) : '',
      ].join(''),
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        mac
        title={t('fleet.nav.dashboard')}
        subtitle={t('fleet.pages.dashboardSubtitle')}
        backTo={false}
        actions={
          <div className="flex items-center gap-2">
            <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('fields.from')} className="w-36" />
            <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('fields.to')} className="w-36" />
            <Btn variant="secondary" icon={Printer} onClick={printDashboard} disabled={!data}>{t('common.print')}</Btn>
          </div>
        }
      />
      {!data ? (
        <Card><p className="text-[12px] text-gic-muted text-center py-4">{t('common.loading')}</p></Card>
      ) : (
        <>
          <div className="mac-kpi-grid mac-kpi-grid-4">
            <KpiCard title={t('fleet.kpi.engins')} value={data.counts.engins} icon={Truck} tone="violet" delta={t('fleet.kpi.totalDelta', { count: data.counts.total })} deltaTone="muted" />
            <KpiCard title={t('fleet.kpi.materiels')} value={data.counts.materiels} icon={Package} tone="teal" />
            <KpiCard title={t('fleet.kpi.available')} value={data.counts.disponibles} icon={CheckCircle2} tone="emerald" />
            <KpiCard title={t('fleet.kpi.assigned')} value={data.counts.affectes} icon={Activity} tone="amber" delta={t('fleet.kpi.activeAssignmentsDelta', { count: data.counts.activeAssignments })} deltaTone="muted" />
            <KpiCard title={t('fleet.kpi.inRepair')} value={data.counts.enReparation + data.counts.enMaintenance} icon={Wrench} tone="coral" delta={t('fleet.kpi.repairDelta', { repair: data.counts.enReparation, maint: data.counts.enMaintenance })} deltaTone="muted" />
            <KpiCard title={t('fleet.kpi.rented')} value={data.counts.loues} icon={KeyRound} tone="orange" delta={t('fleet.kpi.returnedDelta', { count: data.counts.restitues })} deltaTone="muted" />
            <KpiCard title={t('fleet.kpi.utilization')} value={`${data.utilization.rate} %`} icon={Clock} tone="purple" delta={t('fleet.kpi.utilizationDelta', { assigned: data.utilization.assignedDays, available: data.utilization.availableDays })} deltaTone="muted" />
            <KpiCard title={t('fleet.kpi.downtime')} value={t('fleet.hints.daysShort', { days: data.utilization.downtimeDays })} icon={AlertTriangle} tone="coral" delta={data.counts.horsService ? t('fleet.kpi.outOfServiceDelta', { count: data.counts.horsService }) : undefined} deltaTone="muted" />
          </div>

          <div>
            <SectionTitle>{t('fleet.sections.costs')}</SectionTitle>
            <CostChips bucket={data.costs} />
            <div className="flex flex-wrap gap-4 mt-2 text-[11px] text-gic-muted">
              <span>{t('fleet.kpi.imputed')} : <strong className="text-gic-ink">{formatMad(data.costs.imputed)}</strong></span>
              <span>{t('fleet.kpi.unallocated')} : <strong className={data.costs.unallocated > 0 ? 'text-gic-coral' : 'text-gic-ink'}>{formatMad(data.costs.unallocated)}</strong></span>
              {(data.costs.idle ?? 0) > 0 && <span title={t('fleet.hints.idleCost')}>{t('fleet.kpi.idle')} : <strong className="text-gic-ink">{formatMad(data.costs.idle ?? 0)}</strong></span>}
              <span>{t('fleet.kpi.hours')} : <strong className="text-gic-ink">{data.costs.hours} h</strong></span>
              <span>{t('fleet.kpi.costPerHour')} : <strong className="text-gic-ink">{data.costs.costPerHour != null ? formatMad(data.costs.costPerHour) : '—'}</strong></span>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card padding={false}>
              <div className="px-3 pt-3"><SectionTitle>{t('fleet.tabs.byChantier')}</SectionTitle></div>
              <Bars
                empty={t('fleet.empty.costs')}
                rows={data.byChantier.slice(0, 8).map((r) => ({ key: r.chantierId, label: <Link to={`/chantiers/${r.chantierId}?tab=engins`} className="hover:text-[#007aff]">{r.chantierName}</Link>, value: r.total }))}
              />
            </Card>
            <Card padding={false}>
              <div className="px-3 pt-3"><SectionTitle>{t('fleet.tabs.byTranche')}</SectionTitle></div>
              <Bars
                empty={t('fleet.empty.costs')}
                rows={data.byTranche.slice(0, 8).map((r) => ({ key: `${r.chantierId}-${r.tranche}`, label: `${r.chantierName} — ${r.tranche || t('fleet.hints.wholeChantier')}`, value: r.total }))}
              />
            </Card>
            <Card padding={false}>
              <div className="px-3 pt-3"><SectionTitle>{t('fleet.tabs.byEngin')}</SectionTitle></div>
              <Bars
                empty={t('fleet.empty.costs')}
                rows={data.byEngin.filter((e) => e.total > 0).slice(0, 8).map((r) => ({
                  key: r.enginId,
                  label: <Link to={`/engins/${r.enginId}`} className="hover:text-[#007aff]">{r.enginLabel}</Link>,
                  value: r.total,
                  sub: r.costPerHour != null ? t('fleet.hints.costPerHourSub', { amount: formatMad(r.costPerHour), hours: r.hours }) : undefined,
                }))}
              />
            </Card>
          </div>

          <Card padding={false}>
            <div className="px-3 pt-3"><SectionTitle>{t('fleet.sections.perEngin')}</SectionTitle></div>
            {data.byEngin.length === 0 ? (
              <EmptyState title={t('fleet.empty.engins')} />
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('fleet.fields.engin')}</Th>
                    <Th mac>{t('fleet.fields.status')}</Th>
                    <Th mac className="text-right">{t('fleet.costCat.amortissement')}</Th>
                    <Th mac className="text-right">{t('fleet.costCat.location')}</Th>
                    <Th mac className="text-right">{t('fleet.costCat.entretien')}</Th>
                    <Th mac className="text-right">{t('fleet.costCat.reparation')}</Th>
                    <Th mac className="text-right">{t('fleet.costCat.carburant')}</Th>
                    <Th mac className="text-right">{t('fleet.costCat.total')}</Th>
                    <Th mac className="text-right">{t('fleet.fields.hours')}</Th>
                    <Th mac className="text-right">{t('fleet.kpi.costPerHour')}</Th>
                    <Th mac className="text-right">{t('fleet.kpi.utilization')}</Th>
                    <Th mac className="text-right">{t('fleet.kpi.downtime')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.byEngin.map((e) => (
                    <tr key={e.enginId}>
                      <Td mac><Link to={`/engins/${e.enginId}`} className="mac-table-ref">{e.enginLabel}</Link></Td>
                      <Td mac><FleetStatusPill status={e.status} /></Td>
                      <Td mac className="text-right tabular-nums">{formatMad(e.amortissement)}</Td>
                      <Td mac className="text-right tabular-nums">{formatMad(e.location)}</Td>
                      <Td mac className="text-right tabular-nums">{formatMad(e.entretien)}</Td>
                      <Td mac className="text-right tabular-nums">{formatMad(e.reparation)}</Td>
                      <Td mac className="text-right tabular-nums">{formatMad(e.carburant)}</Td>
                      <Td mac className="text-right tabular-nums font-semibold">{formatMad(e.total)}</Td>
                      <Td mac className="text-right tabular-nums">{e.hours} h</Td>
                      <Td mac className="text-right tabular-nums">{e.costPerHour != null ? formatMad(e.costPerHour) : '—'}</Td>
                      <Td mac className="text-right tabular-nums">{e.utilizationRate} %</Td>
                      <Td mac className="text-right tabular-nums">{e.downtimeDays ? t('fleet.hints.daysShort', { days: e.downtimeDays }) : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>

          <Card padding={false}>
            <div className="px-3 pt-3"><SectionTitle>{t('fleet.sections.synthesis')}</SectionTitle></div>
            {costs ? <SynthesisTable lines={costs.synthesis} /> : <p className="p-4 text-[12px] text-gic-muted">{t('common.loading')}</p>}
          </Card>
        </>
      )}
    </div>
  );
}
