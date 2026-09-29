import { fetchAllRows, printRows } from '../lib/listPrint';
import { appAlert } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Download, Printer, Wrench, Truck, Wallet, Eye, Plus, ArrowUp, ArrowDown, Pencil, Trash2, Hammer, Clock, RotateCcw,
} from 'lucide-react';
import {
  api, downloadCsv, downloadExcel, formatDate, formatMad, type PaginatedResponse,
} from '../lib/api';
import { chantierTrancheLabel, enginLabel, errorMessage, fleetStatusLabel, type EnginRef } from '../lib/engins';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  PageHeader, Pagination, TableWrap, Td, Th,
} from '../components/ui';
import { DeleteMotifModal, FleetStatusPill, invalidateFleetRefs, useFleetRefs } from '../components/engins/FleetCommon';
import { MaintenanceModal, type MaintenanceRecord } from '../components/engins/MaintenanceModal';
import { SelectAllTh, SelectTd, SelectionBar } from '../components/RowSelection';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useRowSelection } from '../hooks/useRowSelection';
import { useI18n } from '../i18n/I18nContext';

type Maintenance = MaintenanceRecord & {
  engin: EnginRef;
  chantier?: { id: string; name: string } | null;
};

type ListResponse = PaginatedResponse<Maintenance> & { budgetTotal: number };
type Stats = {
  total: number;
  budgetTotal: number;
  downtimeDays: number;
  partsCost: number;
  laborCost: number;
  enginsEnMaintenance: number;
  enginsEnReparation: number;
};

const PAGE_SIZE = 20;
type SortOrder = 'asc' | 'desc';
type Kind = '' | 'entretien' | 'reparation';

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function formatMadCompact(n: number | null | undefined) {
  const v = Number(n || 0);
  if (v >= 1_000_000) {
    return `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M MAD`;
  }
  if (v >= 10_000) {
    return `${Math.round(v / 1_000).toLocaleString('fr-FR')} k MAD`;
  }
  return formatMad(v);
}

const EMPTY_STATS: Stats = { total: 0, budgetTotal: 0, downtimeDays: 0, partsCost: 0, laborCost: 0, enginsEnMaintenance: 0, enginsEnReparation: 0 };

export default function MaintenancePage({ kind: fixedKind }: { kind?: Kind } = {}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { engins } = useFleetRefs();

  const [kind, setKind] = useState<Kind>(fixedKind ?? ((searchParams.get('kind') as Kind) || ''));
  const [items, setItems] = useState<Maintenance[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [enginFilter, setEnginFilter] = useState(searchParams.get('enginId') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || monthStartISO());
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || new Date().toISOString().slice(0, 10));
  const [sort, setSort] = useState(searchParams.get('sort') || 'date');
  const [order, setOrder] = useState<SortOrder>(searchParams.get('order') === 'asc' ? 'asc' : 'desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Maintenance | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const selection = useRowSelection<Maintenance>();

  useEffect(() => {
    if (fixedKind !== undefined) setKind(fixedKind);
  }, [fixedKind]);

  function filterParams(overrides?: { enginId?: string; q?: string }) {
    const qs = new URLSearchParams();
    const enginId = overrides?.enginId !== undefined ? overrides.enginId : enginFilter;
    const query = overrides?.q !== undefined ? overrides.q : q;
    if (query) qs.set('q', query);
    if (enginId) qs.set('enginId', enginId);
    if (kind) qs.set('kind', kind);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    return qs;
  }

  function buildQuery(pageNum = page, overrides?: { enginId?: string; q?: string }) {
    const qs = filterParams(overrides);
    if (sort !== 'date') qs.set('sort', sort);
    if (order !== 'desc') qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function load(pageNum = page, overrides?: { enginId?: string; q?: string }) {
    setLoading(true);
    setError('');
    Promise.all([
      api<ListResponse>(`/engins/maintenances?${buildQuery(pageNum, overrides)}`),
      api<Stats>(`/engins/maintenances/stats?${filterParams(overrides).toString()}`),
    ])
      .then(([res, st]) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        setStats({ ...EMPTY_STATS, ...st });
      })
      .catch((err) => setError(errorMessage(err, t('msg.serverError'))))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (enginFilter) qs.set('enginId', enginFilter);
    if (kind && fixedKind === undefined) qs.set('kind', kind);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    if (sort !== 'date') qs.set('sort', sort);
    if (order !== 'desc') qs.set('order', order);
    if (page > 1) qs.set('page', String(page));
    setSearchParams(qs, { replace: true });
  }, [q, enginFilter, kind, fixedKind, dateFrom, dateTo, sort, order, page, setSearchParams]);

  useEffect(() => {
    setPage(1);
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, order, kind, enginFilter, dateFrom, dateTo]);

  function openCreate() {
    setEditRecord(null);
    setCreateOpen(true);
  }

  useCreateQuery(openCreate);

  async function confirmDelete(motif: string) {
    if (!deleteId) return;
    try {
      await api(`/engins/maintenances/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ motif }) });
      setDeleteId(null);
      load(page);
    } catch (err) {
      await appAlert(errorMessage(err, t('common.error')));
    }
  }

  async function releaseEngin(enginId: string) {
    try {
      await api(`/engins/${enginId}/release`, { method: 'POST', body: JSON.stringify({}) });
      invalidateFleetRefs();
      load(page);
    } catch (err) {
      await appAlert(errorMessage(err, t('common.error')));
    }
  }

  const fileBase = kind === 'reparation' ? 'reparations-gic' : kind === 'entretien' ? 'entretiens-gic' : 'maintenances-gic';
  const title = kind === 'reparation' ? t('fleet.nav.reparations') : kind === 'entretien' ? t('fleet.nav.entretien') : t('pages.maintenance');
  const subtitle = kind === 'reparation' ? t('fleet.pages.reparationsSubtitle') : kind === 'entretien' ? t('fleet.pages.entretienSubtitle') : t('pages.maintenanceSubtitle');

  function typeLabel(m: Maintenance) {
    if (m.kind === 'reparation') return m.breakdownNature || t('fleet.maintKind.reparation');
    return m.maintenanceType ? t(`fleet.maintType.${m.maintenanceType}`) : t('fleet.maintKind.entretien');
  }

  function allocationLabel(m: Maintenance) {
    if (m.allocation === 'direct') return chantierTrancheLabel(m.chantier?.name, m.tranche);
    return t('fleet.allocationShort.reparti');
  }

  const sortOptions = [
    { value: 'date', label: t('columns.date') },
    { value: 'designation', label: t('columns.designation') },
    { value: 'budget', label: t('columns.budget') },
  ];

  function printList() {
    printRows<Maintenance>({
      title,
      filters: [
        [t('listPrint.search'), q],
        [t('listPrint.type'), fixedKind === undefined && kind ? t(`fleet.maintKind.${kind}`) : ''],
        [t('listPrint.period'), dateFrom || dateTo ? `${dateFrom ? formatDate(dateFrom) : '…'} → ${dateTo ? formatDate(dateTo) : '…'}` : ''],
        [t('columns.engin'), enginFilter && enginLabel(engins.find((e) => e.id === enginFilter))],
        [t('listPrint.sort'), `${sortOptions.find((o) => o.value === sort)?.label || sort} (${order === 'asc' ? t('msg.ascending') : t('msg.descending')})`],
      ],
      columns: [
        { label: t('columns.date'), value: (m) => formatDate(m.date) },
        { label: t('columns.engin'), value: (m) => enginLabel(m.engin) },
        {
          label: kind === 'reparation' ? t('fleet.fields.breakdownNature') : kind === 'entretien' ? t('fleet.fields.maintenanceType') : t('fleet.fields.maintKind'),
          value: (m) => (kind ? typeLabel(m) : `${t(`fleet.maintKind.${m.kind || 'entretien'}`)} — ${typeLabel(m)}`),
        },
        { label: t('columns.designation'), value: (m) => [m.designation, m.repairer].filter(Boolean).join(' — ') },
        {
          label: t('fleet.fields.totalCostMaint'),
          value: (m) => (m.budget != null ? formatMad(m.budget) : ''),
          align: 'right',
          total: (rows) => formatMad(rows.reduce((s, m) => s + (m.budget || 0), 0)),
        },
        {
          label: t('fleet.fields.downtimeDays'),
          value: (m) => (m.downtimeDays ? t('fleet.hints.daysShort', { days: m.downtimeDays }) : ''),
          align: 'right',
          total: (rows) => t('fleet.hints.daysShort', { days: rows.reduce((s, m) => s + (m.downtimeDays || 0), 0) }),
        },
        { label: t('fleet.fields.allocation'), value: (m) => allocationLabel(m) },
        { label: t('columns.enginStatus'), value: (m) => fleetStatusLabel(m.engin.status, t) },
      ],
      rows: selection.count ? selection.rows : () => fetchAllRows<Maintenance>('/engins/maintenances', buildQuery(1)),
      selectedCount: selection.count,
    });
  }

  const kindTabs: { value: Kind; label: string }[] = [
    { value: '', label: t('common.all') },
    { value: 'entretien', label: t('fleet.nav.entretien') },
    { value: 'reparation', label: t('fleet.nav.reparations') },
  ];

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={title}
        backTo={fixedKind ? false : undefined}
        subtitle={subtitle}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/engins/maintenances/export/csv?${filterParams().toString()}`, `${fileBase}.csv`)}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadExcel(`/engins/maintenances/export/xlsx?${filterParams().toString()}`, `${fileBase}.xlsx`)}>{t('common.excel')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{kind === 'reparation' ? t('fleet.actions.newRepair') : t('fleet.actions.newMaintenance')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard
          title={kind === 'reparation' ? t('fleet.nav.reparations') : kind === 'entretien' ? t('fleet.kpi.maintenances') : t('columns.intervention')}
          value={stats.total}
          icon={kind === 'reparation' ? Hammer : Wrench}
          tone="violet"
        />
        <KpiCard
          title={t('kpi.budgetPeriod')}
          value={formatMadCompact(stats.budgetTotal)}
          icon={Wallet}
          tone="amber"
          compact
          delta={t('fleet.kpi.partsLaborDelta', { parts: formatMadCompact(stats.partsCost), labor: formatMadCompact(stats.laborCost) })}
          deltaTone="muted"
        />
        <KpiCard title={t('fleet.kpi.downtime')} value={t('fleet.hints.daysShort', { days: stats.downtimeDays })} icon={Clock} tone="coral" />
        <KpiCard
          title={t('fleet.kpi.inRepair')}
          value={stats.enginsEnMaintenance + stats.enginsEnReparation}
          icon={Truck}
          tone="teal"
          delta={t('fleet.kpi.repairDelta', { repair: stats.enginsEnReparation, maint: stats.enginsEnMaintenance })}
          deltaTone="muted"
        />
      </div>

      <div className="mac-filters-panel">
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            {fixedKind === undefined && (
              <div className="flex rounded-lg border border-black/[0.08] overflow-hidden shrink-0">
                {kindTabs.map((k) => (
                  <button
                    key={k.value || 'all'}
                    type="button"
                    className={`px-3 py-1.5 text-[12px] ${kind === k.value ? 'bg-[#007aff] text-white' : 'bg-white hover:bg-black/[0.03]'}`}
                    onClick={() => setKind(k.value)}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            )}
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('pages.maintenanceSearchPlaceholder')}
            />
            <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0"  onSubmit={() => { setPage(1); load(1); }}/>
            <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0"  onSubmit={() => { setPage(1); load(1); }}/>
            <MacSelect
              value={enginFilter}
              onChange={setEnginFilter}
              options={[{ value: '', label: t('pages.allEquipment') }, ...engins.map((e) => ({ value: e.id, label: enginLabel(e) }))]}
              className="w-56 shrink-0"
            />
            <MacSelect
              value={sort}
              onChange={setSort}
              options={sortOptions}
              className="w-36 shrink-0"
            />
            <Btn
              variant="secondary"
              icon={order === 'asc' ? ArrowUp : ArrowDown}
              className="!px-2 !py-2 shrink-0"
              title={order === 'asc' ? t('msg.ascending') : t('msg.descending')}
              onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            />
            <Btn variant="secondary" onClick={() => { setPage(1); load(1); }}>{t('common.filter')}</Btn>
          </div>
        </div>
      </div>

      {error && (
        <Card className="mb-4 border-gic-coral/40 bg-gic-coral-soft/30">
          <p className="text-[12px] text-gic-coral font-medium">{error}</p>
          <Btn variant="secondary" className="mt-2" onClick={() => load(page)}>{t('common.retry')}</Btn>
        </Card>
      )}

      <SelectionBar selection={selection} onPrint={printList} />

      <Card padding={false}>
        {loading ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState
            title={kind === 'reparation' ? t('fleet.empty.repairs') : kind === 'entretien' ? t('fleet.empty.maintenances') : t('msg.emptyMaintenance')}
            action={<Btn icon={Plus} onClick={openCreate}>{kind === 'reparation' ? t('fleet.actions.newRepair') : t('fleet.actions.newMaintenance')}</Btn>}
          />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <SelectAllTh selection={selection} rows={items} />
                <Th mac>{t('columns.date')}</Th>
                <Th mac>{t('columns.engin')}</Th>
                <Th mac>{kind === 'reparation' ? t('fleet.fields.breakdownNature') : kind === 'entretien' ? t('fleet.fields.maintenanceType') : t('fleet.fields.maintKind')}</Th>
                <Th mac>{t('columns.designation')}</Th>
                <Th mac className="text-right">{t('fleet.fields.totalCostMaint')}</Th>
                <Th mac className="text-right">{t('fleet.fields.downtimeDays')}</Th>
                <Th mac>{t('fleet.fields.allocation')}</Th>
                <Th mac>{t('columns.enginStatus')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="cursor-pointer" onClick={() => navigate(`/maintenance/${m.id}`)}>
                  <SelectTd selection={selection} row={m} />
                  <Td mac className="text-[11px]">{formatDate(m.date)}</Td>
                  <Td mac>
                    <Link to={`/engins/${m.engin.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>
                      {enginLabel(m.engin)}
                    </Link>
                  </Td>
                  {kind ? (
                    <Td mac className="text-[12px]">{typeLabel(m)}</Td>
                  ) : (
                    <Td mac>
                      <span className={m.kind === 'reparation' ? 'mac-chip-orange' : 'mac-chip-blue'}>{t(`fleet.maintKind.${m.kind || 'entretien'}`)}</span>
                      <span className="block text-[10px] text-gic-muted mt-0.5">{typeLabel(m)}</span>
                    </Td>
                  )}
                  <Td mac>
                    {m.designation}
                    {m.repairer && <span className="block text-[10px] text-gic-muted">{m.repairer}</span>}
                  </Td>
                  <Td mac className="text-right tabular-nums">{m.budget != null ? formatMad(m.budget) : '—'}</Td>
                  <Td mac className="text-right tabular-nums">{m.downtimeDays ? t('fleet.hints.daysShort', { days: m.downtimeDays }) : '—'}</Td>
                  <Td mac className="mac-table-muted text-[11px]">{allocationLabel(m)}</Td>
                  <Td mac><FleetStatusPill status={m.engin.status} /></Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <MacActionBtn icon={Eye} tone="blue" title={t('actions.openFiche')} onClick={() => navigate(`/maintenance/${m.id}`)} />
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => { setEditRecord(m); setCreateOpen(true); }} />
                      {(m.engin.status === 'en_maintenance' || m.engin.status === 'en_reparation') && (
                        <MacActionBtn icon={RotateCcw} tone="green" title={t('fleet.actions.release')} onClick={() => releaseEngin(m.engin.id)} />
                      )}
                      <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => setDeleteId(m.id)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => { setPage(p); load(p); }} mac />
      </Card>

      <MaintenanceModal
        open={createOpen}
        record={editRecord}
        defaultKind={kind || 'entretien'}
        enginId={!editRecord && enginFilter ? enginFilter : undefined}
        onClose={() => { setCreateOpen(false); setEditRecord(null); }}
        onSaved={() => { invalidateFleetRefs(); load(page); }}
      />

      <DeleteMotifModal
        open={!!deleteId}
        title={t('actions.deleteMaintenance')}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
