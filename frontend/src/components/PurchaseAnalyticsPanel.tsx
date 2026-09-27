import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, FileWarning, PiggyBank, ShoppingCart, Truck, Wallet, Receipt } from 'lucide-react';
import { api, formatMad } from '../lib/api';
import { useI18n } from '../i18n/I18nContext';
import { Card, EmptyState, KpiCard, TableWrap, Td, Th } from './ui';
import { PurchaseDeliveryPill, PurchaseStatusPill } from './PurchaseBadges';

type Bucket = { key: string; label: string; count: number; engaged: number; paid: number; remaining: number };
type ChantierBucket = Bucket & { budget: number | null; budgetUsedPct: number | null; budgetRemaining: number | null };
type MiniPurchase = {
  id: string;
  reference: string;
  date: string;
  designation: string;
  status: string;
  supplier: string | null;
  chantier: string | null;
  tranche: string | null;
  totalPrice: number;
  paidAmount: number;
  remaining: number;
  deliveryStatus: string;
  expectedDeliveryDate: string | null;
};

export type PurchaseAnalytics = {
  totals: {
    count: number;
    engagedCount: number;
    engaged: number;
    draft: number;
    paid: number;
    advances: number;
    remaining: number;
    budget: number | null;
    budgetUsedPct: number | null;
    openCount: number;
    openAmount: number;
    notDeliveredCount: number;
    notDeliveredAmount: number;
    unpaidInvoicesCount: number;
    unpaidInvoicesAmount: number;
  };
  byChantier: ChantierBucket[];
  byTranche: Bucket[];
  bySupplier: Bucket[];
  byFamily: Bucket[];
  byMonth: Bucket[];
  notDelivered: MiniPurchase[];
  unpaidInvoices: MiniPurchase[];
  open: MiniPurchase[];
};

export type PurchaseAnalyticsFilters = {
  chantierId?: string;
  tranche?: string;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
};

function BarList({ title, rows, emptyLabel }: { title: string; rows: Bucket[]; emptyLabel: string }) {
  const { t } = useI18n();
  const max = Math.max(1, ...rows.map((r) => r.engaged));
  return (
    <Card>
      <p className="text-[12px] font-semibold text-gic-ink mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-gic-muted py-3 text-center">{emptyLabel}</p>
      ) : (
        rows.slice(0, 10).map((r) => (
          <div key={r.key} className="purchase-bar-row">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.label}</p>
              <p className="text-[10px] text-gic-muted">{t('purchase.analytics.countPurchases', { count: r.count })}</p>
            </div>
            <div>
              <div className="purchase-progress">
                <span style={{ width: `${Math.max(2, (r.engaged / max) * 100)}%` }} />
              </div>
              <p className="text-[10px] text-gic-muted mt-0.5">
                {t('purchase.analytics.paidShort')} {formatMad(r.paid)} · {t('purchase.analytics.remainingShort')} {formatMad(r.remaining)}
              </p>
            </div>
            <p className="font-semibold whitespace-nowrap">{formatMad(r.engaged)}</p>
          </div>
        ))
      )}
    </Card>
  );
}

function MiniTable({ rows, mode }: { rows: MiniPurchase[]; mode: 'delivery' | 'invoice' }) {
  const { t } = useI18n();
  if (!rows.length) return <p className="text-[11px] text-gic-muted py-3 text-center">{t('purchase.analytics.emptyList')}</p>;
  return (
    <TableWrap mac>
      <thead>
        <tr>
          <Th mac>{t('columns.ref')}</Th>
          <Th mac>{t('columns.supplier')}</Th>
          <Th mac>{t('columns.chantier')}</Th>
          <Th mac>{mode === 'delivery' ? t('purchase.fields.expectedDelivery') : t('purchase.fields.remaining')}</Th>
          <Th mac>{t('columns.status')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const late = mode === 'delivery' && p.expectedDeliveryDate && new Date(p.expectedDeliveryDate) < new Date();
          return (
            <tr key={p.id}>
              <Td mac>
                <Link to={`/achats/${p.id}`} className="mac-table-ref">{p.reference}</Link>
                <p className="text-[10px] text-gic-muted truncate max-w-[160px]">{p.designation}</p>
              </Td>
              <Td mac className="mac-table-muted">{p.supplier || '—'}</Td>
              <Td mac className="mac-table-muted">{p.chantier || '—'}{p.tranche ? ` · ${p.tranche}` : ''}</Td>
              <Td mac className={late ? 'text-gic-coral font-medium' : ''}>
                {mode === 'delivery'
                  ? p.expectedDeliveryDate ? new Date(p.expectedDeliveryDate).toLocaleDateString('fr-MA') : '—'
                  : formatMad(p.remaining)}
              </Td>
              <Td mac>{mode === 'delivery' ? <PurchaseDeliveryPill status={p.deliveryStatus} /> : <PurchaseStatusPill status={p.status} />}</Td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}

export default function PurchaseAnalyticsPanel({ filters }: { filters: PurchaseAnalyticsFilters }) {
  const { t } = useI18n();
  const [data, setData] = useState<PurchaseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => !!v) as [string, string][]).toString();

  useEffect(() => {
    setLoading(true);
    setError('');
    api<PurchaseAnalytics>(`/achats/purchases/analytics${qs ? `?${qs}` : ''}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [qs]);

  if (loading && !data) return <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>;
  if (error) return <Card className="border-gic-coral/40"><p className="text-[12px] text-gic-coral">{error}</p></Card>;
  if (!data) return null;
  const { totals } = data;
  if (totals.count === 0) return <Card><EmptyState title={t('purchase.analytics.empty')} /></Card>;

  const budgetTone = totals.budgetUsedPct == null ? '' : totals.budgetUsedPct > 100 ? 'purchase-progress-danger' : totals.budgetUsedPct > 85 ? 'purchase-progress-warn' : '';

  return (
    <div className="space-y-4">
      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard
          title={t('purchase.analytics.engaged')}
          value={formatMad(totals.engaged)}
          icon={ShoppingCart}
          tone="violet"
          compact
          delta={t('purchase.analytics.countPurchases', { count: totals.engagedCount })}
          deltaTone="muted"
        />
        <KpiCard title={t('purchase.analytics.paid')} value={formatMad(totals.paid)} icon={Wallet} tone="emerald" compact
          delta={`${t('purchase.analytics.advances')} ${formatMad(totals.advances)}`} deltaTone="muted" />
        <KpiCard title={t('purchase.fields.remaining')} value={formatMad(totals.remaining)} icon={Receipt} tone="coral" compact />
        <KpiCard
          title={t('purchase.analytics.budget')}
          value={totals.budget != null ? formatMad(totals.budget) : '—'}
          icon={PiggyBank}
          tone="teal"
          compact
          delta={totals.budgetUsedPct != null ? t('purchase.analytics.budgetUsed', { pct: totals.budgetUsedPct }) : t('purchase.analytics.noBudget')}
          deltaTone={totals.budgetUsedPct != null && totals.budgetUsedPct > 100 ? 'coral' : 'muted'}
        />
        <KpiCard title={t('purchase.analytics.open')} value={totals.openCount} icon={Clock} tone="amber" compact
          delta={formatMad(totals.openAmount)} deltaTone="muted" />
        <KpiCard title={t('purchase.analytics.notDelivered')} value={totals.notDeliveredCount} icon={Truck} tone="orange" compact
          delta={formatMad(totals.notDeliveredAmount)} deltaTone="muted" />
        <KpiCard title={t('purchase.analytics.unpaidInvoices')} value={totals.unpaidInvoicesCount} icon={FileWarning} tone="coral" compact
          delta={formatMad(totals.unpaidInvoicesAmount)} deltaTone="muted" />
        <KpiCard title={t('purchase.analytics.drafts')} value={formatMad(totals.draft)} icon={AlertTriangle} tone="purple" compact />
      </div>

      {totals.budget != null && (
        <Card>
          <div className="flex items-center justify-between text-[12px] mb-1.5">
            <p className="font-semibold">{t('purchase.analytics.budgetVsActual')}</p>
            <p className="text-gic-muted">
              {formatMad(totals.engaged)} / {formatMad(totals.budget)}
            </p>
          </div>
          <div className={`purchase-progress ${budgetTone}`}>
            <span style={{ width: `${Math.min(100, totals.budgetUsedPct || 0)}%` }} />
          </div>
        </Card>
      )}

      <Card padding={false}>
        <p className="text-[12px] font-semibold text-gic-ink px-4 pt-3 pb-2">{t('purchase.analytics.byChantier')}</p>
        <TableWrap mac>
          <thead>
            <tr>
              <Th mac>{t('columns.chantier')}</Th>
              <Th mac>{t('purchase.analytics.budget')}</Th>
              <Th mac>{t('purchase.analytics.engaged')}</Th>
              <Th mac>{t('purchase.analytics.budgetUsedCol')}</Th>
              <Th mac>{t('purchase.analytics.paid')}</Th>
              <Th mac>{t('purchase.fields.remaining')}</Th>
            </tr>
          </thead>
          <tbody>
            {data.byChantier.map((c) => (
              <tr key={c.key}>
                <Td mac>
                  {c.key !== '__none__' ? <Link to={`/chantiers/${c.key}`} className="mac-table-ref">{c.label}</Link> : c.label}
                  <p className="text-[10px] text-gic-muted">{t('purchase.analytics.countPurchases', { count: c.count })}</p>
                </Td>
                <Td mac className="mac-table-muted">{c.budget != null ? formatMad(c.budget) : '—'}</Td>
                <Td mac className="font-medium">{formatMad(c.engaged)}</Td>
                <Td mac className="min-w-[120px]">
                  {c.budgetUsedPct != null ? (
                    <>
                      <div className={`purchase-progress ${c.budgetUsedPct > 100 ? 'purchase-progress-danger' : c.budgetUsedPct > 85 ? 'purchase-progress-warn' : ''}`}>
                        <span style={{ width: `${Math.min(100, c.budgetUsedPct)}%` }} />
                      </div>
                      <p className="text-[10px] text-gic-muted mt-0.5">{c.budgetUsedPct} %</p>
                    </>
                  ) : '—'}
                </Td>
                <Td mac>{formatMad(c.paid)}</Td>
                <Td mac className={c.remaining > 0 ? 'text-gic-coral font-medium' : ''}>{formatMad(c.remaining)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {filters.chantierId && (
          <BarList title={t('purchase.analytics.byTranche')} rows={data.byTranche} emptyLabel={t('purchase.analytics.emptyList')} />
        )}
        <BarList title={t('purchase.analytics.bySupplier')} rows={data.bySupplier} emptyLabel={t('purchase.analytics.emptyList')} />
        <BarList title={t('purchase.analytics.byFamily')} rows={data.byFamily} emptyLabel={t('purchase.analytics.emptyList')} />
        <BarList title={t('purchase.analytics.byMonth')} rows={data.byMonth} emptyLabel={t('purchase.analytics.emptyList')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding={false}>
          <p className="text-[12px] font-semibold text-gic-ink px-4 pt-3 pb-2 flex items-center gap-1.5">
            <Truck size={14} className="text-[#ff9500]" /> {t('purchase.analytics.notDelivered')} ({totals.notDeliveredCount})
          </p>
          <MiniTable rows={data.notDelivered} mode="delivery" />
        </Card>
        <Card padding={false}>
          <p className="text-[12px] font-semibold text-gic-ink px-4 pt-3 pb-2 flex items-center gap-1.5">
            <FileWarning size={14} className="text-[#ff3b30]" /> {t('purchase.analytics.unpaidInvoices')} ({totals.unpaidInvoicesCount})
          </p>
          <MiniTable rows={data.unpaidInvoices} mode="invoice" />
        </Card>
      </div>
    </div>
  );
}
