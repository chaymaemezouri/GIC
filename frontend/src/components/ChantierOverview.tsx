import { Link } from 'react-router-dom';
import {
  AlertTriangle, ChevronRight, HardHat, Layers, ShoppingCart, Users,
} from 'lucide-react';
import { formatMad } from '../lib/api';
import { Btn, StatusPill } from './ui';
import ProgressSteps from './ProgressSteps';
import { useI18n } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';

export type ChantierOverview = {
  synthèse: {
    personnel: number;
    personnelDeclare: number;
    budgetAchats: number;
    depense: number;
    achatsOuverts: number;
    alertes: number;
    costMO?: number;
    cnssNonDeclare?: number;
    budgetTotal?: number;
  };
  structure: {
    tranche: string;
    percent: number;
    groupes: { name: string; percent: number; etages: string[] }[];
  }[];
  taskBars: { taskName: string; percent: number; tone: 'done' | 'progress' | 'late' }[];
  taskSummary: { done: number; inProgress: number; late: number; total: number };
  alerts: { tone: 'coral' | 'amber' | 'violet'; title: string; detail: string }[];
  activity: { date: string; label: string; detail: string; tone?: string }[];
};

type PurchaseRow = {
  id: string;
  reference: string;
  designation: string;
  totalPrice: number;
  status: string;
  date: string;
};

type Props = {
  overview: ChantierOverview;
  chantierId: string;
  chantierName?: string;
  tranchesCount: number;
  recentPurchases: PurchaseRow[];
  onGoTranches: () => void;
  onGoAchats: () => void;
};

function MetricChip({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  tone?: 'neutral' | 'warn' | 'accent';
}) {
  return (
    <div className={`overview-metric overview-metric-${tone}`}>
      <Icon size={14} className="overview-metric-icon" aria-hidden />
      <div className="overview-metric-body">
        <span className="overview-metric-value">{value}</span>
        <span className="overview-metric-label">{label}</span>
      </div>
    </div>
  );
}

function TranchesStructureSection({
  structure,
  taskSummary,
  onGoTranches,
  tranchesCount,
  chantierName,
  t,
}: {
  structure: ChantierOverview['structure'];
  taskSummary: ChantierOverview['taskSummary'];
  onGoTranches: () => void;
  tranchesCount: number;
  chantierName?: string;
  t: TranslateFn;
}) {
  return (
    <section className="overview-card overview-card-tranches">
      <div className="overview-card-head">
        <div>
          <h2 className="overview-card-title">{t('detail.siteTranchesTitle')}</h2>
          <div className="overview-summary-chips">
            <span className="overview-chip">{t('msg.trancheCount', { count: structure.length })}</span>
            <span className="overview-chip">{t('msg.lotsCount', { count: taskSummary.total })}</span>
            {taskSummary.inProgress > 0 && (
              <span className="overview-chip overview-chip-blue">
                {t('msg.inProgressCount', { count: taskSummary.inProgress })}
              </span>
            )}
          </div>
        </div>
        <button type="button" className="overview-card-link" onClick={onGoTranches}>
          {tranchesCount > 0 ? t('common.manage') : t('actions.createTranche')}
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="tranche-tree">
        <div className="tranche-tree-root">
          <span className="tranche-tree-root-icon">
            <Layers size={14} />
          </span>
          <span className="tranche-tree-root-label">{chantierName || t('fields.chantier')}</span>
        </div>

        <ul className="tranche-tree-branches">
          {structure.map((s) => (
            <li key={s.tranche} className="tranche-tree-item">
              <div className="tranche-tree-connector" aria-hidden />
              <div className="tranche-tree-card">
                <div className="tranche-tree-card-head">
                  <h3 className="tranche-tree-card-name">{s.tranche}</h3>
                  <span className="tranche-tree-card-pct">{s.percent}%</span>
                </div>
                <ProgressSteps percent={s.percent} size="sm" showLabel={false} />
                {s.groupes.length > 0 && (
                  <ul className="tranche-groupe-list">
                    {s.groupes.map((g) => (
                      <li key={g.name} className="tranche-groupe-item">
                        <span className="tranche-groupe-dot" aria-hidden />
                        <div className="tranche-groupe-body">
                          <span className="tranche-groupe-name">{g.name}</span>
                          {g.etages.length > 0 && (
                            <span className="tranche-groupe-etages">{g.etages.join(' · ')}</span>
                          )}
                        </div>
                        <span className="tranche-groupe-pct">{g.percent}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function ChantierOverviewPanel({
  overview,
  chantierName,
  tranchesCount,
  recentPurchases,
  onGoTranches,
  onGoAchats,
}: Props) {
  const { t } = useI18n();
  const { taskSummary, alerts, synthèse, structure } = overview;
  const topAlert = alerts[0];
  const purchasesPreview = recentPurchases.slice(0, 3);

  const budgetLabel = synthèse.budgetAchats > 0
    ? `${Math.round((synthèse.depense / synthèse.budgetAchats) * 100)} %`
    : formatMad(synthèse.depense);

  return (
    <div className="chantier-overview">
      {topAlert && (
        <div className="overview-alert">
          <AlertTriangle size={16} className="overview-alert-icon" aria-hidden />
          <div>
            <p className="overview-alert-title">{topAlert.title}</p>
            {topAlert.detail && <p className="overview-alert-detail">{topAlert.detail}</p>}
          </div>
        </div>
      )}

      <div className="overview-metrics">
        {synthèse.achatsOuverts > 0 && (
          <MetricChip
            icon={ShoppingCart}
            label={t('detail.purchasesToProcess')}
            value={synthèse.achatsOuverts}
            tone="warn"
          />
        )}
        <MetricChip icon={Users} label={t('tabs.personnel')} value={synthèse.personnel} />
        <MetricChip icon={ShoppingCart} label={t('detail.purchaseSpend')} value={budgetLabel} tone="accent" />
        {(synthèse.cnssNonDeclare ?? 0) > 0 && (
          <MetricChip
            icon={Users}
            label={t('detail.cnssUndeclared')}
            value={synthèse.cnssNonDeclare!}
            tone="warn"
          />
        )}
      </div>

      <div className="overview-grid">
        {structure.length > 0 ? (
          <TranchesStructureSection
            structure={structure}
            taskSummary={taskSummary}
            onGoTranches={onGoTranches}
            tranchesCount={tranchesCount}
            chantierName={chantierName}
            t={t}
          />
        ) : (
          <section className="overview-card overview-card-empty">
            <HardHat size={28} className="text-gic-muted opacity-35 mb-2" />
            <p className="text-[13px] font-medium text-gic-ink">{t('detail.noProgressTracked')}</p>
            <p className="text-[12px] text-gic-muted mt-1 mb-4">{t('detail.createTrancheHint')}</p>
            <Btn variant="secondary" icon={Layers} onClick={onGoTranches}>
              {t('actions.openTranches')}
            </Btn>
          </section>
        )}

        <aside className="overview-aside">
          {purchasesPreview.length > 0 && (
            <section className="overview-card">
              <div className="overview-card-head">
                <h2 className="overview-card-title">{t('detail.recentPurchases')}</h2>
                <button type="button" className="overview-card-link" onClick={onGoAchats}>
                  {t('common.seeAll')}
                  <ChevronRight size={14} />
                </button>
              </div>
              <ul className="overview-purchase-list">
                {purchasesPreview.map((p) => (
                  <li key={p.id}>
                    <Link to={`/achats/${p.id}`} className="overview-purchase-row">
                      <div className="min-w-0 flex-1">
                        <p className="overview-purchase-ref">{p.reference}</p>
                        <p className="overview-purchase-designation">{p.designation}</p>
                      </div>
                      <div className="overview-purchase-end">
                        <span className="overview-purchase-amount">{formatMad(p.totalPrice)}</span>
                        <StatusPill status={p.status} quiet />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
