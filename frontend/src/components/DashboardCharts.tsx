import { formatMad } from '../lib/api';
import { useI18n } from '../i18n/I18nContext';

export type ChartMonth = {
  key: string;
  label: string;
  ventes: number;
  encaissements: number;
};

type Props = {
  months: ChartMonth[];
  loading?: boolean;
};

export default function DashboardCharts({ months, loading }: Props) {
  const { t } = useI18n();
  const max = Math.max(1, ...months.flatMap((m) => [m.ventes, m.encaissements]));
  const totalVentes = months.reduce((s, m) => s + m.ventes, 0);
  const totalEncaisse = months.reduce((s, m) => s + m.encaissements, 0);

  if (loading) {
    return (
      <div className="h-48 flex items-center justify-center text-[12px] text-gic-muted">
        {t('dashboard.loadingCharts')}
      </div>
    );
  }

  if (!months.length || (totalVentes === 0 && totalEncaisse === 0)) {
    return (
      <div className="h-40 flex items-center justify-center text-[12px] text-gic-muted rounded-xl bg-gray-50/80">
        {t('dashboard.noChartData12m')}
      </div>
    );
  }

  const W = 640;
  const H = 180;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = months.length;
  const step = n > 1 ? plotW / (n - 1) : plotW;

  function y(v: number) {
    return padT + plotH - (v / max) * plotH;
  }
  function x(i: number) {
    return padL + i * step;
  }

  function path(values: number[]) {
    return values
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(' ');
  }

  function area(values: number[]) {
    const line = path(values);
    const last = x(n - 1);
    const first = x(0);
    return `${line} L ${last.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${first.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;
  }

  const ventes = months.map((m) => m.ventes);
  const encaisse = months.map((m) => m.encaissements);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-3 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-gic-violet" />
          {t('dashboard.contractedSales')}
          <span className="font-semibold text-gic-ink ml-1">{formatMad(totalVentes)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-gic-coral" />
          {t('dashboard.receiptsLegend')}
          <span className="font-semibold text-gic-ink ml-1">{formatMad(totalEncaisse)}</span>
        </span>
      </div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px] h-auto" role="img" aria-label={t('dashboard.chartsAria')}>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1={padL}
              x2={W - padR}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="#e5e7eb"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ))}
          <path d={area(ventes)} fill="rgba(124, 58, 237, 0.08)" />
          <path d={path(ventes)} fill="none" stroke="#7c3aed" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={path(encaisse)} fill="none" stroke="#f43f5e" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          {months.map((m, i) => (
            <g key={m.key}>
              <circle cx={x(i)} cy={y(m.ventes)} r={3} fill="#7c3aed" />
              <circle cx={x(i)} cy={y(m.encaissements)} r={3} fill="#f43f5e" />
              <title>{`${m.label}\n${t('dashboard.chartPointTitle', { sales: formatMad(m.ventes), receipts: formatMad(m.encaissements) })}`}</title>
              <text
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                className="fill-gic-muted"
                style={{ fontSize: 9 }}
              >
                {m.label.split(' ')[0]}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
