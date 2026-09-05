import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye, TrendingDown, ShoppingCart, HardHat, Shield, Wallet, Cog, Fuel, Car,
} from 'lucide-react';
import { api, formatMad, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacDateInput, MacSearch,
  PageHeader, Pagination, StatusPill, TableWrap, Tabs, Td, Th,
} from '../components/ui';
import { useI18n } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';

export type DecaissementCategory =
  | 'all'
  | 'main_oeuvre'
  | 'chauffeurs'
  | 'equipe_interne'
  | 'achat'
  | 'maintenance'
  | 'carburant';

type Decaissement = {
  id: string;
  date: string;
  category: DecaissementCategory;
  reference: string;
  label: string;
  amount: number;
  remaining?: number;
  mode?: string | null;
  status: string;
  entityType: string;
  entityId: string;
  brut?: number;
  advances?: number;
  bonuses?: number;
  netDue?: number;
  amountPaid?: number;
  baseSalary?: number;
  advance?: number;
  netSalary?: number;
  period?: string;
  supplier?: string;
  engin?: string;
};

type Stats = {
  totalDebit: number;
  achats: number;
  achatsCount: number;
  mainOeuvre: number;
  mainOeuvreDue: number;
  mainOeuvreRemaining: number;
  mainOeuvreCount: number;
  chauffeurs: number;
  chauffeursDue: number;
  chauffeursRemaining: number;
  chauffeursCount: number;
  equipeInterne: number;
  equipeInterneCount: number;
  maintenance: number;
  maintenanceCount: number;
  carburant: number;
  carburantCount: number;
};

type ListResponse = PaginatedResponse<Decaissement> & { totals: { amount: number; remaining: number } };

const PAGE_SIZE = 30;

const TAB_IDS: DecaissementCategory[] = [
  'all', 'main_oeuvre', 'chauffeurs', 'equipe_interne', 'achat', 'maintenance', 'carburant',
];

function categoryLabel(cat: DecaissementCategory, t: TranslateFn): string {
  switch (cat) {
    case 'all': return t('common.all');
    case 'main_oeuvre': return t('nav.workforce');
    case 'chauffeurs': return t('nav.drivers');
    case 'equipe_interne': return t('nav.internalTeam');
    case 'achat': return t('create.purchase');
    case 'maintenance': return t('nav.maintenance');
    case 'carburant': return t('columns.fuel');
    default: return cat;
  }
}

function tabLabel(cat: DecaissementCategory, t: TranslateFn): string {
  if (cat === 'achat') return t('pages.purchases');
  return categoryLabel(cat, t);
}

function formatMadCompact(n: number | null | undefined) {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M MAD`;
  if (v >= 10_000) return `${Math.round(v / 1_000).toLocaleString('fr-FR')} k MAD`;
  return formatMad(v);
}

function entityLink(item: Decaissement) {
  if (item.entityType === 'purchase') return `/achats/${item.entityId}`;
  if (item.category === 'chauffeurs') {
    if (item.entityType === 'workforce_payroll' || item.entityType === 'workforce') {
      return `/chauffeurs/${item.entityId}`;
    }
  }
  if (item.entityType === 'workforce_payroll' || item.entityType === 'workforce') return `/salaires/${item.entityId}`;
  if (item.entityType === 'staff_salary') return `/equipe-interne/${item.entityId}`;
  if (item.entityType === 'maintenance') return `/maintenance/${item.entityId}`;
  if (item.entityType === 'fuel_log') return `/engins/${item.entityId}`;
  return null;
}

function CategoryKpis({ category, stats }: { category: DecaissementCategory; stats: Stats }) {
  const { t } = useI18n();
  switch (category) {
    case 'all':
      return (
        <>
          <KpiCard title={t('kpi.totalDisbursed')} value={formatMadCompact(stats.totalDebit)} icon={TrendingDown} tone="coral" compact />
          <KpiCard title={t('nav.workforce')} value={formatMadCompact(stats.mainOeuvre)} icon={HardHat} tone="emerald" compact />
          <KpiCard title={t('nav.drivers')} value={formatMadCompact(stats.chauffeurs)} icon={Car} tone="violet" compact />
          <KpiCard title={t('kpi.purchasesAndMisc')} value={formatMadCompact(stats.achats + stats.maintenance + stats.carburant + stats.equipeInterne)} icon={Wallet} tone="amber" compact />
        </>
      );
    case 'main_oeuvre':
      return (
        <>
          <KpiCard title={t('columns.paid')} value={formatMadCompact(stats.mainOeuvre)} icon={HardHat} tone="emerald" compact />
          <KpiCard title={t('columns.netDue')} value={formatMadCompact(stats.mainOeuvreDue)} icon={TrendingDown} tone="amber" compact />
          <KpiCard title={t('kpi.remainingToPay')} value={formatMadCompact(stats.mainOeuvreRemaining)} icon={Wallet} tone="coral" compact />
          <KpiCard title={t('kpi.payslips')} value={stats.mainOeuvreCount} icon={HardHat} tone="violet" delta={t('kpi.workersPaid')} deltaTone="muted" />
        </>
      );
    case 'chauffeurs':
      return (
        <>
          <KpiCard title={t('columns.paid')} value={formatMadCompact(stats.chauffeurs)} icon={Car} tone="emerald" compact />
          <KpiCard title={t('columns.netDue')} value={formatMadCompact(stats.chauffeursDue)} icon={TrendingDown} tone="amber" compact />
          <KpiCard title={t('kpi.remainingToPay')} value={formatMadCompact(stats.chauffeursRemaining)} icon={Wallet} tone="coral" compact />
          <KpiCard title={t('kpi.payslips')} value={stats.chauffeursCount} icon={Car} tone="violet" delta={t('kpi.driversPaid')} deltaTone="muted" />
        </>
      );
    case 'equipe_interne':
      return (
        <>
          <KpiCard title={t('kpi.salariesPaid')} value={formatMadCompact(stats.equipeInterne)} icon={Shield} tone="emerald" compact />
          <KpiCard title={t('kpi.payslipsPaid')} value={stats.equipeInterneCount} icon={Shield} tone="violet" compact />
        </>
      );
    case 'achat':
      return (
        <>
          <KpiCard title={t('kpi.controlledPurchases')} value={formatMadCompact(stats.achats)} icon={ShoppingCart} tone="violet" compact />
          <KpiCard title={t('kpi.purchaseCount')} value={stats.achatsCount} icon={ShoppingCart} tone="amber" compact />
        </>
      );
    case 'maintenance':
      return (
        <>
          <KpiCard title={t('kpi.equipmentMaintenance')} value={formatMadCompact(stats.maintenance)} icon={Cog} tone="coral" compact />
          <KpiCard title={t('columns.intervention')} value={stats.maintenanceCount} icon={Cog} tone="violet" compact />
        </>
      );
    case 'carburant':
      return (
        <>
          <KpiCard title={t('columns.fuel')} value={formatMadCompact(stats.carburant)} icon={Fuel} tone="coral" compact />
          <KpiCard title={t('kpi.fuelFills')} value={stats.carburantCount} icon={Fuel} tone="violet" compact />
        </>
      );
    default:
      return null;
  }
}

function DecaissementTable({
  category,
  items,
  navigate,
}: {
  category: DecaissementCategory;
  items: Decaissement[];
  navigate: (path: string) => void;
}) {
  const { t } = useI18n();
  if (category === 'all') {
    return (
      <TableWrap mac>
        <thead>
          <tr>
            <Th mac>{t('columns.date')}</Th>
            <Th mac>{t('columns.type')}</Th>
            <Th mac>{t('columns.label')}</Th>
            <Th mac>{t('columns.ref')}</Th>
            <Th mac>{t('columns.amount')}</Th>
            <Th mac>{t('columns.mode')}</Th>
            <Th mac>{t('columns.status')}</Th>
            <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
          </tr>
        </thead>
        <tbody>
          {items.map((d) => {
            const link = entityLink(d);
            return (
              <tr key={d.id} className={link ? 'cursor-pointer' : undefined} onClick={() => link && navigate(link)}>
                <Td mac className="mac-table-muted">{new Date(d.date).toLocaleDateString('fr-MA')}</Td>
                <Td mac>
                  <span className="mac-chip mac-chip-gray">{categoryLabel(d.category, t)}</span>
                </Td>
                <Td mac className="font-medium">{d.label}</Td>
                <Td mac className="mac-table-muted">{d.reference}</Td>
                <Td mac className="text-gic-coral font-medium">{formatMad(d.amount)}</Td>
                <Td mac className="capitalize mac-table-muted">{d.mode || '—'}</Td>
                <Td mac><StatusPill status={d.status} quiet /></Td>
                <Td mac className="mac-td-actions">
                  {link && <MacActionBtn icon={Eye} tone="blue" title={t('common.view')} onClick={(e) => { e.stopPropagation(); navigate(link); }} />}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
    );
  }

  if (category === 'main_oeuvre' || category === 'chauffeurs') {
    const personLabel = category === 'chauffeurs' ? t('columns.chauffeur') : t('columns.worker');
    return (
      <TableWrap mac>
        <thead>
          <tr>
            <Th mac>{personLabel}</Th>
            <Th mac>{t('columns.period')}</Th>
            <Th mac>{t('columns.brut')}</Th>
            <Th mac>{t('columns.bonuses')}</Th>
            <Th mac>{t('columns.advances')}</Th>
            <Th mac>{t('columns.netDue')}</Th>
            <Th mac>{t('columns.paid')}</Th>
            <Th mac>{t('columns.remaining')}</Th>
            <Th mac>{t('columns.status')}</Th>
            <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
          </tr>
        </thead>
        <tbody>
          {items.map((d) => {
            const link = entityLink(d);
            return (
              <tr key={d.id} className={link ? 'cursor-pointer' : undefined} onClick={() => link && navigate(link)}>
                <Td mac className="font-medium">{d.label}</Td>
                <Td mac className="mac-table-muted">{d.period || '—'}</Td>
                <Td mac>{formatMad(d.brut || 0)}</Td>
                <Td mac>{formatMad(d.bonuses || 0)}</Td>
                <Td mac className="text-gic-coral">{formatMad(d.advances || 0)}</Td>
                <Td mac className="font-semibold">{formatMad(d.netDue || 0)}</Td>
                <Td mac className="text-gic-emerald">{formatMad(d.amountPaid || 0)}</Td>
                <Td mac>{(d.remaining || 0) > 0 ? formatMad(d.remaining!) : '—'}</Td>
                <Td mac><StatusPill status={d.status} quiet /></Td>
                <Td mac className="mac-td-actions">
                  {link && <MacActionBtn icon={Eye} tone="blue" title={t('common.view')} onClick={(e) => { e.stopPropagation(); navigate(link); }} />}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
    );
  }

  if (category === 'equipe_interne') {
    return (
      <TableWrap mac>
        <thead>
          <tr>
            <Th mac>{t('columns.collaborator')}</Th>
            <Th mac>{t('columns.period')}</Th>
            <Th mac>{t('columns.base')}</Th>
            <Th mac>{t('columns.bonuses')}</Th>
            <Th mac>{t('columns.advances')}</Th>
            <Th mac>{t('columns.net')}</Th>
            <Th mac>{t('columns.paid')}</Th>
            <Th mac>{t('columns.status')}</Th>
            <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
          </tr>
        </thead>
        <tbody>
          {items.map((d) => {
            const link = entityLink(d);
            return (
              <tr key={d.id} className={link ? 'cursor-pointer' : undefined} onClick={() => link && navigate(link)}>
                <Td mac className="font-medium">{d.label}</Td>
                <Td mac className="mac-table-muted">{d.period || '—'}</Td>
                <Td mac>{formatMad(d.baseSalary || 0)}</Td>
                <Td mac>{formatMad(d.bonuses || 0)}</Td>
                <Td mac className="text-gic-coral">{formatMad(d.advance || 0)}</Td>
                <Td mac className="font-semibold">{formatMad(d.netSalary || 0)}</Td>
                <Td mac className="text-gic-emerald">{formatMad(d.amount)}</Td>
                <Td mac><StatusPill status={d.status} quiet /></Td>
                <Td mac className="mac-td-actions">
                  {link && <MacActionBtn icon={Eye} tone="blue" title={t('common.view')} onClick={(e) => { e.stopPropagation(); navigate(link); }} />}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
    );
  }

  if (category === 'achat') {
    return (
      <TableWrap mac>
        <thead>
          <tr>
            <Th mac>{t('columns.date')}</Th>
            <Th mac>{t('columns.ref')}</Th>
            <Th mac>{t('columns.designation')}</Th>
            <Th mac>{t('columns.supplier')}</Th>
            <Th mac>{t('columns.mode')}</Th>
            <Th mac>{t('columns.amount')}</Th>
            <Th mac>{t('columns.status')}</Th>
            <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
          </tr>
        </thead>
        <tbody>
          {items.map((d) => {
            const link = entityLink(d);
            return (
              <tr key={d.id} className={link ? 'cursor-pointer' : undefined} onClick={() => link && navigate(link)}>
                <Td mac className="mac-table-muted">{new Date(d.date).toLocaleDateString('fr-MA')}</Td>
                <Td mac className="mac-table-muted">{d.reference}</Td>
                <Td mac>{d.label}</Td>
                <Td mac>{d.supplier || '—'}</Td>
                <Td mac className="capitalize mac-table-muted">{d.mode || '—'}</Td>
                <Td mac className="text-gic-coral font-medium">{formatMad(d.amount)}</Td>
                <Td mac><StatusPill status={d.status} quiet /></Td>
                <Td mac className="mac-td-actions">
                  {link && <MacActionBtn icon={Eye} tone="blue" title={t('common.view')} onClick={(e) => { e.stopPropagation(); navigate(link); }} />}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
    );
  }

  if (category === 'maintenance') {
    return (
      <TableWrap mac>
        <thead>
          <tr>
            <Th mac>{t('columns.date')}</Th>
            <Th mac>{t('columns.engin')}</Th>
            <Th mac>{t('columns.intervention')}</Th>
            <Th mac>{t('columns.budget')}</Th>
            <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
          </tr>
        </thead>
        <tbody>
          {items.map((d) => {
            const link = entityLink(d);
            return (
              <tr key={d.id} className={link ? 'cursor-pointer' : undefined} onClick={() => link && navigate(link)}>
                <Td mac className="mac-table-muted">{new Date(d.date).toLocaleDateString('fr-MA')}</Td>
                <Td mac>{d.engin || '—'}</Td>
                <Td mac>{d.label}</Td>
                <Td mac className="text-gic-coral font-medium">{formatMad(d.amount)}</Td>
                <Td mac className="mac-td-actions">
                  {link && <MacActionBtn icon={Eye} tone="blue" title={t('common.view')} onClick={(e) => { e.stopPropagation(); navigate(link); }} />}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
    );
  }

  return (
    <TableWrap mac>
      <thead>
        <tr>
          <Th mac>{t('columns.date')}</Th>
          <Th mac>{t('columns.engin')}</Th>
          <Th mac>{t('columns.detail')}</Th>
          <Th mac>{t('columns.cost')}</Th>
          <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
        </tr>
      </thead>
      <tbody>
        {items.map((d) => {
          const link = entityLink(d);
          return (
            <tr key={d.id} className={link ? 'cursor-pointer' : undefined} onClick={() => link && navigate(link)}>
              <Td mac className="mac-table-muted">{new Date(d.date).toLocaleDateString('fr-MA')}</Td>
              <Td mac>{d.engin || '—'}</Td>
              <Td mac>{d.label}</Td>
              <Td mac className="text-gic-coral font-medium">{formatMad(d.amount)}</Td>
              <Td mac className="mac-td-actions">
                {link && <MacActionBtn icon={Eye} tone="blue" title={t('common.view')} onClick={(e) => { e.stopPropagation(); navigate(link); }} />}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}

export default function DecaissementsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCategory = (searchParams.get('category') as DecaissementCategory) || 'all';
  const [category, setCategory] = useState<DecaissementCategory>(
    TAB_IDS.includes(initialCategory) ? initialCategory : 'all',
  );
  const [items, setItems] = useState<Decaissement[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({
    totalDebit: 0, achats: 0, achatsCount: 0, mainOeuvre: 0, mainOeuvreDue: 0,
    mainOeuvreRemaining: 0, mainOeuvreCount: 0,
    chauffeurs: 0, chauffeursDue: 0, chauffeursRemaining: 0, chauffeursCount: 0,
    equipeInterne: 0, equipeInterneCount: 0,
    maintenance: 0, maintenanceCount: 0, carburant: 0, carburantCount: 0,
  });
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const tabs = useMemo(
    () => TAB_IDS.map((id) => ({ id, label: tabLabel(id, t) })),
    [t],
  );

  function buildQuery(pageNum = page, cat = category) {
    const qs = new URLSearchParams();
    qs.set('category', cat);
    if (q) qs.set('q', q);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function load(pageNum = page, cat = category) {
    setLoading(true);
    setError('');
    const filterQs = buildQuery(pageNum, cat).replace(/&?page=\d+/, '').replace(/&?limit=\d+/, '');
    Promise.all([
      api<ListResponse>(`/finance/decaissements?${buildQuery(pageNum, cat)}`),
      api<Stats>(`/finance/decaissements/stats?${filterQs}`),
    ])
      .then(([res, st]) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        setStats(st);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('msg.serverError')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(1, category);
    setPage(1);
  }, [category]);

  useEffect(() => {
    function onFocus() {
      load(page, category);
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [page, category, q, dateFrom, dateTo]);

  function switchCategory(cat: DecaissementCategory) {
    setCategory(cat);
    setPage(1);
    const qs = new URLSearchParams(searchParams);
    qs.set('category', cat);
    setSearchParams(qs, { replace: true });
  }

  const emptyMessages: Record<DecaissementCategory, string> = {
    all: t('msg.emptyDisbursementsAll'),
    main_oeuvre: t('msg.emptyDisbursementsWorkforce'),
    chauffeurs: t('msg.emptyDisbursementsDrivers'),
    equipe_interne: t('msg.emptyDisbursementsInternal'),
    achat: t('msg.emptyDisbursementsPurchases'),
    maintenance: t('msg.emptyDisbursementsMaintenance'),
    carburant: t('msg.emptyDisbursementsFuel'),
  };

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.disbursements')}
        subtitle={t('pages.disbursementsSubtitle')}
        actions={
          <Btn variant="secondary" icon={Wallet} onClick={() => navigate('/balance')}>{t('actions.viewBalance')}</Btn>
        }
      />

      <Card className="mb-4">
        <Tabs
          mac
          active={category}
          onChange={(id) => switchCategory(id as DecaissementCategory)}
          tabs={tabs}
        />
      </Card>

      <div className={`mac-kpi-grid mac-kpi-grid-${category === 'all' || category === 'equipe_interne' || category === 'achat' || category === 'maintenance' || category === 'carburant' ? '4' : '4'}`}>
        <CategoryKpis category={category} stats={stats} />
      </div>

      <div className="mac-filters-panel mac-filters-panel-open mb-4">
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('common.searchEllipsis')}
            />
            <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0" />
            <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0" />
            <Btn variant="secondary" onClick={() => { setPage(1); load(1); }}>{t('common.filter')}</Btn>
            {category === 'main_oeuvre' && (
              <Btn variant="secondary" onClick={() => navigate('/salaires?type=main_oeuvre')}>{t('actions.manageWorkforcePayroll')}</Btn>
            )}
            {category === 'chauffeurs' && (
              <Btn variant="secondary" onClick={() => navigate('/salaires?type=chauffeur')}>{t('actions.manageDriverSalaries')}</Btn>
            )}
            {category === 'equipe_interne' && (
              <Btn variant="secondary" onClick={() => navigate('/salaires?type=equipe_interne')}>{t('actions.manageInternalSalaries')}</Btn>
            )}
            {category === 'achat' && (
              <Btn variant="secondary" onClick={() => navigate('/achats')}>{t('actions.viewPurchases')}</Btn>
            )}
            {category === 'maintenance' && (
              <Btn variant="secondary" onClick={() => navigate('/maintenance')}>{t('actions.viewMaintenance')}</Btn>
            )}
          </div>
        </div>
      </div>

      {error && (
        <Card className="mb-4 border-gic-coral/40 bg-gic-coral-soft/30">
          <p className="text-[12px] text-gic-coral font-medium">{error}</p>
        </Card>
      )}

      <Card padding={false}>
        {loading ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState title={emptyMessages[category] || t('msg.emptyDisbursements')} />
        ) : (
          <DecaissementTable category={category} items={items} navigate={navigate} />
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => load(p)} mac />
      </Card>
    </div>
  );
}
