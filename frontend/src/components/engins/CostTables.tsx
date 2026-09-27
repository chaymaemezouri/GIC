import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, formatMad } from '../../lib/api';
import { escHtml } from '../../lib/companyPrint';
import { COST_CATEGORIES, type CostBucket, type CostCategory, type CostLine } from '../../lib/engins';
import { buildRowsTableHtml, type PrintColumn } from '../../lib/listPrint';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslateFn } from '../../i18n/types';
import { EmptyState, TableWrap, Td, Th } from '../ui';

type Bucket = CostBucket;
export type CostsResponse = {
  lines: CostLine[];
  synthesis: CostLine[];
  totals: Bucket & { imputed: number; unallocated: number };
  byChantier: (Bucket & { chantierId: string; chantierName: string; projectName: string | null })[];
  byTranche: (Bucket & { chantierId: string; chantierName: string; tranche: string })[];
  byProject: (Bucket & { projectId: string; projectName: string })[];
  byEngin: (Bucket & { enginId: string; enginLabel: string; enginKind: string; days: number; hours: number })[];
};

export function BucketTable<T extends Bucket>({ rows, label, render }: { rows: T[]; label: string; render: (r: T) => React.ReactNode }) {
  const { t } = useI18n();
  if (rows.length === 0) return <EmptyState title={t('fleet.empty.costs')} />;
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <TableWrap mac>
      <thead>
        <tr>
          <Th mac>{label}</Th>
          {COST_CATEGORIES.map((c) => <Th mac key={c} className="text-right">{t(`fleet.costCat.${c}`)}</Th>)}
          <Th mac className="text-right">{t('fleet.costCat.total')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <Td mac>{render(r)}</Td>
            {COST_CATEGORIES.map((c) => <Td mac key={c} className="text-right tabular-nums">{r[c] ? formatMad(r[c]) : <span className="mac-table-muted">—</span>}</Td>)}
            <Td mac className="text-right tabular-nums font-semibold">{formatMad(r.total)}</Td>
          </tr>
        ))}
      </tbody>
      {rows.length > 1 && (
        <tfoot>
          <tr className="font-semibold">
            <Td mac>{t('fleet.costCat.total')}</Td>
            {COST_CATEGORIES.map((c) => <Td mac key={c} className="text-right tabular-nums">{formatMad(rows.reduce((s, r) => s + r[c], 0))}</Td>)}
            <Td mac className="text-right tabular-nums">{formatMad(total)}</Td>
          </tr>
        </tfoot>
      )}
    </TableWrap>
  );
}

function groupSynthesis(lines: CostLine[], noneLabel: string) {
  const map = new Map<string, { name: string; chantierId: string | null; lines: CostLine[]; total: number }>();
  for (const l of lines) {
    const key = l.chantierId || '__none';
    const g = map.get(key) || { name: l.chantierName || noneLabel, chantierId: l.chantierId, lines: [], total: 0 };
    g.lines.push(l);
    g.total += l.amount;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function linePeriod(l: CostLine) {
  return l.periodStart ? `${formatDate(l.periodStart)} → ${formatDate(l.periodEnd)}` : formatDate(l.date);
}

/** Tableau de synthèse : Chantier | Tranche | Engin | Mode | Période | Coût, avec total par chantier. */
export function SynthesisTable({ lines }: { lines: CostLine[] }) {
  const { t } = useI18n();
  const groups = useMemo(() => groupSynthesis(lines, t('fleet.allocationShort.non_impute')), [lines, t]);
  if (lines.length === 0) return <EmptyState title={t('fleet.empty.costs')} />;
  const grand = groups.reduce((s, g) => s + g.total, 0);
  return (
    <TableWrap mac>
      <thead>
        <tr>
          <Th mac>{t('fleet.fields.chantier')}</Th>
          <Th mac>{t('fleet.fields.tranche')}</Th>
          <Th mac>{t('fleet.fields.engin')}</Th>
          <Th mac>{t('fleet.fields.mode')}</Th>
          <Th mac>{t('fleet.fields.period')}</Th>
          <Th mac className="text-right">{t('fleet.fields.days')}</Th>
          <Th mac className="text-right">{t('fleet.fields.cost')}</Th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <Fragment key={g.chantierId || 'none'}>
            {g.lines.map((l, i) => (
              <tr key={`${l.sourceId}-${i}`}>
                <Td mac>{i === 0 ? (g.chantierId ? <Link to={`/chantiers/${g.chantierId}?tab=engins`} className="mac-table-ref">{g.name}</Link> : g.name) : ''}</Td>
                <Td mac>{l.tranche || <span className="mac-table-muted">—</span>}</Td>
                <Td mac><Link to={`/engins/${l.enginId}`} className="hover:text-[#007aff]">{l.enginLabel}</Link></Td>
                <Td mac><span className={`mac-chip ${l.mode === 'location' ? 'mac-chip-orange' : 'mac-chip-blue'}`}>{t(`fleet.mode.${l.mode}`)}</span></Td>
                <Td mac className="text-[11px] whitespace-nowrap">{linePeriod(l)}</Td>
                <Td mac className="text-right tabular-nums">{l.days || '—'}</Td>
                <Td mac className="text-right tabular-nums">{formatMad(l.amount)}</Td>
              </tr>
            ))}
            <tr className="bg-black/[0.025] font-semibold">
              <Td mac colSpan={6}>{t('fleet.hints.totalChantier', { name: g.name })}</Td>
              <Td mac className="text-right tabular-nums">{formatMad(g.total)}</Td>
            </tr>
          </Fragment>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-bold">
          <Td mac colSpan={6}>{t('fleet.hints.grandTotal')}</Td>
          <Td mac className="text-right tabular-nums">{formatMad(grand)}</Td>
        </tr>
      </tfoot>
    </TableWrap>
  );
}

export function CostLinesTable({ lines }: { lines: CostLine[] }) {
  const { t } = useI18n();
  if (lines.length === 0) return <EmptyState title={t('fleet.empty.costs')} />;
  return (
    <TableWrap mac>
      <thead>
        <tr>
          <Th mac>{t('fleet.fields.date')}</Th>
          <Th mac>{t('fleet.fields.engin')}</Th>
          <Th mac>{t('fleet.fields.source')}</Th>
          <Th mac>{t('fleet.fields.label')}</Th>
          <Th mac>{t('fleet.fields.chantierTranche')}</Th>
          <Th mac>{t('fleet.fields.allocation')}</Th>
          <Th mac className="text-right">{t('fleet.fields.amount')}</Th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={`${l.sourceId}-${i}`}>
            <Td mac className="text-[11px] whitespace-nowrap">{linePeriod(l)}</Td>
            <Td mac><Link to={`/engins/${l.enginId}`} className="hover:text-[#007aff]">{l.enginLabel}</Link></Td>
            <Td mac><span className="mac-chip mac-chip-gray">{t(`fleet.costCat.${l.category}`)}</span></Td>
            <Td mac className="text-[12px]">{l.label}</Td>
            <Td mac>{l.chantierName ? `${l.chantierName}${l.tranche ? ` — ${l.tranche}` : ''}` : <span className="text-gic-coral">{t('fleet.allocationShort.non_impute')}</span>}</Td>
            <Td mac className="text-[11px] mac-table-muted">{t(`fleet.allocationShort.${l.allocation}`)}</Td>
            <Td mac className="text-right tabular-nums">{formatMad(l.amount)}</Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

function emptyCostsHtml(t: TranslateFn) {
  return `<p class="muted">${escHtml(t('fleet.empty.costs'))}</p>`;
}

export function costCategoriesPrintHtml(bucket: Bucket, t: TranslateFn) {
  type Row = { category: CostCategory; amount: number };
  return buildRowsTableHtml<Row>(
    [
      { label: t('fleet.fields.category'), value: (r) => t(`fleet.costCat.${r.category}`) },
      { label: t('fleet.fields.amount'), value: (r) => formatMad(r.amount), align: 'right', total: () => formatMad(bucket.total) },
    ],
    COST_CATEGORIES.map((category) => ({ category, amount: bucket[category] })),
  );
}

export function bucketPrintHtml<T extends Bucket>(rows: T[], t: TranslateFn, label: string, value: (r: T) => unknown) {
  if (rows.length === 0) return emptyCostsHtml(t);
  const sum = (list: T[], key: CostCategory | 'total') => formatMad(list.reduce((s, r) => s + r[key], 0));
  const columns: PrintColumn<T>[] = [
    { label, value },
    ...COST_CATEGORIES.map((c): PrintColumn<T> => ({ label: t(`fleet.costCat.${c}`), value: (r) => (r[c] ? formatMad(r[c]) : ''), align: 'right', total: (list) => sum(list, c) })),
    { label: t('fleet.costCat.total'), value: (r) => formatMad(r.total), align: 'right', total: (list) => sum(list, 'total') },
  ];
  return buildRowsTableHtml(columns, rows);
}

export function synthesisPrintHtml(lines: CostLine[], t: TranslateFn) {
  if (lines.length === 0) return emptyCostsHtml(t);
  const groups = groupSynthesis(lines, t('fleet.allocationShort.non_impute'));
  const grand = groups.reduce((s, g) => s + g.total, 0);
  const td = (v: unknown, right = false) => `<td${right ? ' class="r"' : ''}>${escHtml(v)}</td>`;
  const head = [t('fleet.fields.chantier'), t('fleet.fields.tranche'), t('fleet.fields.engin'), t('fleet.fields.mode'), t('fleet.fields.period'), t('fleet.fields.days'), t('fleet.fields.cost')]
    .map((h, i) => `<th${i >= 5 ? ' class="r"' : ''}>${escHtml(h)}</th>`)
    .join('');
  const body = groups
    .map((g) =>
      g.lines
        .map((l, i) => `<tr>${td(i === 0 ? g.name : '')}${td(l.tranche || '—')}${td(l.enginLabel)}${td(t(`fleet.mode.${l.mode}`))}${td(linePeriod(l))}${td(l.days || '—', true)}${td(formatMad(l.amount), true)}</tr>`)
        .join('') +
      `<tr><td colspan="6"><strong>${escHtml(t('fleet.hints.totalChantier', { name: g.name }))}</strong></td><td class="r"><strong>${escHtml(formatMad(g.total))}</strong></td></tr>`,
    )
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="6">${escHtml(t('fleet.hints.grandTotal'))}</td><td class="r">${escHtml(formatMad(grand))}</td></tr></tfoot></table>`;
}

export function costLinesPrintColumns(t: TranslateFn): PrintColumn<CostLine>[] {
  return [
    { label: t('fleet.fields.date'), value: linePeriod },
    { label: t('fleet.fields.engin'), value: (l) => l.enginLabel },
    { label: t('fleet.fields.source'), value: (l) => t(`fleet.costCat.${l.category}`) },
    { label: t('fleet.fields.label'), value: (l) => l.label },
    { label: t('fleet.fields.chantierTranche'), value: (l) => (l.chantierName ? `${l.chantierName}${l.tranche ? ` — ${l.tranche}` : ''}` : t('fleet.allocationShort.non_impute')) },
    { label: t('fleet.fields.allocation'), value: (l) => t(`fleet.allocationShort.${l.allocation}`) },
    { label: t('fleet.fields.amount'), value: (l) => formatMad(l.amount), align: 'right', total: (rows) => formatMad(rows.reduce((s, l) => s + l.amount, 0)) },
  ];
}

/** Rapport complet des coûts : totaux par catégorie, synthèse, ventilations et lignes détaillées. */
export function costsReportHtml(data: CostsResponse, t: TranslateFn) {
  const section = (title: string, html: string) => `<h2>${escHtml(title)}</h2>${html}`;
  return [
    section(
      t('fleet.sections.costs'),
      `${costCategoriesPrintHtml(data.totals, t)}<p><span class="k">${escHtml(t('fleet.kpi.imputed'))} :</span> ${escHtml(formatMad(data.totals.imputed))} · <span class="k">${escHtml(t('fleet.kpi.unallocated'))} :</span> ${escHtml(formatMad(data.totals.unallocated))}</p>`,
    ),
    section(t('fleet.sections.synthesis'), synthesisPrintHtml(data.synthesis, t)),
    section(t('fleet.tabs.byChantier'), bucketPrintHtml(data.byChantier, t, t('fleet.fields.chantier'), (r) => (r.projectName ? `${r.chantierName} (${r.projectName})` : r.chantierName))),
    section(t('fleet.tabs.byTranche'), bucketPrintHtml(data.byTranche, t, t('fleet.fields.chantierTranche'), (r) => `${r.chantierName} — ${r.tranche || t('fleet.hints.wholeChantier')}`)),
    section(
      t('fleet.tabs.byEngin'),
      bucketPrintHtml(data.byEngin, t, t('fleet.fields.engin'), (r) => `${r.enginLabel} (${t('fleet.hints.daysHours', { days: r.days, hours: r.hours })}${r.hours > 0 ? ` · ${formatMad(r.total / r.hours)} / h` : ''})`),
    ),
    section(t('fleet.tabs.detail'), data.lines.length ? buildRowsTableHtml(costLinesPrintColumns(t), data.lines) : emptyCostsHtml(t)),
  ].join('');
}
