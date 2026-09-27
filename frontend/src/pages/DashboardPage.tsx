import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  RefreshCw, RotateCcw, ChevronRight, Calendar, Printer,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, fetchProjectList, fetchChantierList, formatDate, formatMad } from '../lib/api';
import { escHtml, printWithCompany } from '../lib/companyPrint';
import { buildFiltersHtml, buildRowsTableHtml } from '../lib/listPrint';
import { useAuth } from '../context/AuthContext';
import { canAccessRoute } from '../lib/permissions';
import { Btn, Card, MacDateInput, MacSelect, SectionTitle, StatCell, StatusPill } from '../components/ui';
import { useI18n } from '../i18n/I18nContext';
type DashboardData = {
  immobilier: Record<string, number>;
  finance: Record<string, number>;
  chantier: Record<string, number>;
  alertes: Record<string, number>;
  trends: { clientsLast30: number; clientsDeltaPct: number };
  recent: {
    sales: {
      id: string;
      reference: string;
      status: string;
      remaining: number;
      client: { id: string; firstName: string; lastName: string };
      property?: { name: string };
    }[];
    clients: {
      id: string;
      reference: string;
      firstName: string;
      lastName: string;
      email: string;
      isBuyer: boolean;
      isProspect: boolean;
      isTenant: boolean;
    }[];
  };
};

const EMPTY_FILTERS = { projectId: '', chantierId: '', dateFrom: '', dateTo: '' };

function formatDateLocalized(lang: string) {
  return new Date().toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [chantiers, setChantiers] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    const qs = new URLSearchParams();
    if (filters.projectId) qs.set('projectId', filters.projectId);
    if (filters.chantierId) qs.set('chantierId', filters.chantierId);
    if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) qs.set('dateTo', filters.dateTo);
    try {
      const res = await api<DashboardData>(`/dashboard?${qs}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('msg.serverError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters, t]);

  useEffect(() => {
    fetchProjectList<{ id: string; name: string }>().then(setProjects).catch(() => {});
    fetchChantierList<{ id: string; name: string }>().then(setChantiers).catch(() => {});
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const clientDelta = data?.trends
    ? data.trends.clientsDeltaPct > 0
      ? `+${data.trends.clientsDeltaPct}%`
      : data.trends.clientsDeltaPct < 0
        ? `${data.trends.clientsDeltaPct}%`
        : `${data.trends.clientsLast30} ${t('dashboard.thisMonth')}`
    : undefined;

  const clientDeltaTone =
    data?.trends && data.trends.clientsDeltaPct < 0 ? 'coral' : data?.trends?.clientsLast30 ? 'emerald' : 'muted';

  const recentSales = data?.recent.sales ?? [];
  const recentClients = data?.recent.clients ?? [];
  const hasActiveFilters =
    !!filters.projectId || !!filters.chantierId || !!filters.dateFrom || !!filters.dateTo;
  const alertItems = [
    { label: t('nav.receipts'), value: data?.alertes.paiementsASuivre, to: '/ventes' },
    { label: t('nav.purchases'), value: data?.alertes.achatsAction, to: '/achats' },
    { label: t('nav.maintenance'), value: data?.alertes.enginsMaintenance, to: '/engins' },
    { label: t('nav.documents'), value: data?.alertes.documentsExpirant, to: '/documents?alert=expiring' },
    { label: t('docs.lateDossiers'), value: data?.alertes.documentsEnRetard, to: '/documents?alert=late' },
  ].filter((a) => (a.value ?? 0) > 0 && (!user || canAccessRoute(user.role, a.to.split('?')[0])));

  function printDashboard() {
    if (!data) return;
    const grid = (rows: [string, unknown][]) => `<div class="grid">${rows
      .map(([k, v]) => `<p><span class="k">${escHtml(k)} :</span> ${escHtml(v ?? '—')}</p>`)
      .join('')}</div>`;
    const period = filters.dateFrom || filters.dateTo
      ? `${filters.dateFrom ? formatDate(filters.dateFrom) : '…'} → ${filters.dateTo ? formatDate(filters.dateTo) : '…'}`
      : '';
    const bodyHtml = `${buildFiltersHtml([
      [t('fields.project'), filters.projectId && projects.find((p) => p.id === filters.projectId)?.name],
      [t('fields.chantier'), filters.chantierId && chantiers.find((c) => c.id === filters.chantierId)?.name],
      [t('listPrint.period'), period],
    ])}
      ${grid([
        [t('nav.clients'), `${data.immobilier.clients ?? 0}${clientDelta ? ` (${clientDelta})` : ''}`],
        [t('dashboard.availableProperties'), `${data.immobilier.disponibles ?? 0} (${data.immobilier.reserves ?? 0} ${t('dashboard.reserved')})`],
        [t('dashboard.activeProjects'), `${data.immobilier.projectsEncore ?? 0} (${data.immobilier.projectsValides ?? 0} ${t('dashboard.validated')})`],
        [t('dashboard.activeSites'), `${data.chantier.actifs ?? 0} (${data.chantier.avancement ?? 0}% ${t('dashboard.progressPct')})`],
      ])}
      <h2>${escHtml(t('dashboard.alerts'))}</h2>
      ${alertItems.length ? grid(alertItems.map((a) => [a.label, a.value])) : `<p class="muted">${escHtml(t('dashboard.noAlerts'))}</p>`}
      <h2>${escHtml(`${t('dashboard.summary')} — ${t('nav.group.finance')}`)}</h2>
      ${grid([
        [t('dashboard.totalSales'), formatMad(data.finance.ventesTotal)],
        [t('dashboard.toCollect'), formatMad(data.finance.reste)],
        [t('dashboard.balanceSolde'), formatMad(data.finance.solde)],
        [t('dashboard.sitePurchases'), formatMad(data.finance.achats)],
      ])}
      <h2>${escHtml(`${t('dashboard.summary')} — ${t('nav.group.realEstate')}`)}</h2>
      ${grid([
        [t('nav.projects'), data.immobilier.projects],
        [t('dashboard.soldProperties'), data.immobilier.vendus],
        [t('dashboard.activeRentals'), data.immobilier.rentals],
        [t('dashboard.prospects'), data.immobilier.prospects],
      ])}
      <h2>${escHtml(`${t('dashboard.summary')} — ${t('nav.sites')}`)}</h2>
      ${grid([
        [t('dashboard.workers'), data.chantier.ouvriers],
        [t('dashboard.avgProgress'), `${data.chantier.avancement ?? 0} %`],
        [t('nav.equipment'), data.chantier.engins],
        [t('dashboard.inMaintenance'), data.chantier.enginsMaintenance],
      ])}
      <h2>${escHtml(t('dashboard.lastSales'))}</h2>
      ${recentSales.length ? buildRowsTableHtml<DashboardData['recent']['sales'][number]>([
        { label: t('common.reference'), value: (s) => s.reference },
        { label: t('fields.client'), value: (s) => `${s.client.firstName} ${s.client.lastName}` },
        { label: t('fields.property'), value: (s) => s.property?.name },
        { label: t('common.status'), value: (s) => (s.status || '').replace(/_/g, ' ') },
        { label: t('dashboard.remaining'), value: (s) => formatMad(s.remaining), align: 'right' },
      ], recentSales) : `<p class="muted">${escHtml(t('dashboard.noSales'))}</p>`}
      <h2>${escHtml(t('dashboard.lastClients'))}</h2>
      ${recentClients.length ? buildRowsTableHtml<DashboardData['recent']['clients'][number]>([
        { label: t('common.reference'), value: (c) => c.reference },
        { label: t('common.name'), value: (c) => `${c.firstName} ${c.lastName}` },
        { label: t('common.email'), value: (c) => c.email },
        { label: t('common.type'), value: (c) => [c.isProspect && t('fields.prospect'), c.isBuyer && t('fields.buyer'), c.isTenant && t('fields.tenant')].filter(Boolean).join(', ') },
      ], recentClients) : `<p class="muted">${escHtml(t('dashboard.noClients'))}</p>`}`;
    void printWithCompany({ title: t('pages.dashboard'), subtitle: formatDateLocalized(lang), bodyHtml });
  }

  return (
    <div className="space-y-6 w-full">
      <div className="mac-dash-toolbar">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight text-gic-ink mb-0.5">{t('pages.dashboard')}</h1>
          <p className="mac-dash-date">{formatDateLocalized(lang)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 relative z-[1]">
          <Btn
            variant="secondary"
            icon={Calendar}
            title={t('common.filters')}
            aria-label={t('common.filters')}
            className="!px-2 !py-2"
            onClick={() => setShowFilters((v) => !v)}
          />
          <Btn
            variant="secondary"
            icon={RefreshCw}
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
            className={`!px-2 !py-2 ${refreshing ? '[&_svg]:animate-spin' : ''}`}
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
          />
          <Btn
            variant="secondary"
            icon={Printer}
            title={t('common.print')}
            aria-label={t('common.print')}
            className="!px-2 !py-2"
            onClick={printDashboard}
            disabled={!data}
          />
        </div>
      </div>
      {showFilters && (
        <div className="mac-toolbar">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1 min-w-0">
            <MacSelect
              label={t('fields.project')}
              value={filters.projectId}
              onChange={(projectId) => setFilters({ ...filters, projectId })}
              options={[
                { value: '', label: t('fields.allProjects') },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <MacSelect
              label={t('fields.chantier')}
              value={filters.chantierId}
              onChange={(chantierId) => setFilters({ ...filters, chantierId })}
              options={[
                { value: '', label: t('fields.allSites') },
                ...chantiers.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <MacDateInput
              label={t('fields.startDate')}
              value={filters.dateFrom}
              onChange={(dateFrom) => setFilters({ ...filters, dateFrom })}
            />
            <MacDateInput
              label={t('fields.endDate')}
              value={filters.dateTo}
              onChange={(dateTo) => setFilters({ ...filters, dateTo })}
            />
          </div>
          <Btn
            variant="secondary"
            icon={RotateCcw}
            title={t('common.resetFilters')}
            aria-label={t('common.resetFilters')}
            className="!px-2 !py-2 shrink-0"
            onClick={() => setFilters(EMPTY_FILTERS)}
            disabled={!hasActiveFilters}
          />
        </div>
      )}

      {error && (
        <Card className="border-gic-coral/30 bg-gic-coral-soft/20 !p-4">
          <p className="text-[12px] text-gic-coral font-medium">{error}</p>
          <Btn variant="secondary" className="mt-2" onClick={() => loadDashboard()}>{t('common.retry')}</Btn>
        </Card>
      )}

      <section>
        <div className="mac-stat-bar">
          <Link to="/clients">
            <StatCell
              title={t('nav.clients')}
              value={loading ? '…' : (data?.immobilier.clients ?? '—')}
              delta={clientDelta}
              deltaTone={clientDeltaTone}
            />
          </Link>
          <Link to="/biens">
            <StatCell
              title={t('dashboard.availableProperties')}
              value={loading ? '…' : (data?.immobilier.disponibles ?? '—')}
              delta={data ? `${data.immobilier.reserves ?? 0} ${t('dashboard.reserved')}` : undefined}
              deltaTone="muted"
            />
          </Link>
          <Link to="/projets">
            <StatCell
              title={t('dashboard.activeProjects')}
              value={loading ? '…' : (data?.immobilier.projectsEncore ?? '—')}
              delta={data ? `${data.immobilier.projectsValides ?? 0} ${t('dashboard.validated')}` : undefined}
              deltaTone="muted"
            />
          </Link>
          <Link to="/chantiers">
            <StatCell
              title={t('dashboard.activeSites')}
              value={loading ? '…' : (data?.chantier.actifs ?? '—')}
              delta={data ? `${data.chantier.avancement ?? 0}% ${t('dashboard.progressPct')}` : undefined}
              deltaTone="muted"
            />
          </Link>
        </div>
      </section>

      <section>
        <SectionTitle>{t('dashboard.recentActivity')}</SectionTitle>
        <div className="grid lg:grid-cols-3 gap-4">
          <Card padding={false} className="lg:col-span-2">
            <div className="mac-panel-header">
              <h3 className="mac-panel-title">{t('dashboard.lastSales')}</h3>
              <Link to="/ventes" className="mac-panel-action">{t('common.seeAll')}</Link>
            </div>
            {loading && <p className="text-[12px] text-gic-muted py-8 text-center">{t('common.loading')}</p>}
            {!loading && recentSales.length === 0 && (
              <p className="text-[12px] text-gic-muted py-8 text-center">{t('dashboard.noSales')}</p>
            )}
            {recentSales.map((s) => (
              <Link key={s.id} to={`/clients/${s.client.id}`} className="mac-row group">
                <div className="min-w-0">
                  <p className="mac-row-title truncate">{s.reference}</p>
                  <p className="mac-row-subtitle truncate">
                    {s.client.firstName} {s.client.lastName}
                    {s.property?.name ? ` — ${s.property.name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="mac-row-meta hidden sm:block">
                    <StatusPill status={s.status} quiet />
                    <p className="mac-row-meta-value">{t('dashboard.remaining')} {formatMad(s.remaining)}</p>
                  </div>
                  <ChevronRight size={14} strokeWidth={2} className="mac-row-chevron" />
                </div>
              </Link>
            ))}
          </Card>

          <Card padding={false}>
            <div className="mac-panel-header">
              <h3 className="mac-panel-title mac-panel-title-amber">{t('dashboard.alerts')}</h3>
            </div>
            {loading && <p className="text-[12px] text-gic-muted py-6 text-center">{t('common.loading')}</p>}
            {!loading && (() => {
              if (alertItems.length === 0) {
                return <p className="text-[12px] text-gic-muted py-6 text-center">{t('dashboard.noAlerts')}</p>;
              }
              return alertItems.map((a) => (
                <Link key={a.label} to={a.to} className="mac-row">
                  <span className="mac-row-title">{a.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="mac-row-count">{a.value}</span>
                    <ChevronRight size={14} strokeWidth={2} className="mac-row-chevron" />
                  </div>
                </Link>
              ));
            })()}
          </Card>
        </div>
      </section>

      {/* Synthèse */}
      <section>
        <SectionTitle>{t('dashboard.summary')}</SectionTitle>
        <div className="grid lg:grid-cols-3 gap-4">
          <SynthGroup title={t('nav.group.finance')} to="/balance" tone="green">
            <SynthRow label={t('dashboard.totalSales')} value={formatMad(data?.finance.ventesTotal)} />
            <SynthRow label={t('dashboard.toCollect')} value={formatMad(data?.finance.reste)} highlight={!!data?.finance.reste} />
            <SynthRow label={t('dashboard.balanceSolde')} value={formatMad(data?.finance.solde)} />
            <SynthRow label={t('dashboard.sitePurchases')} value={formatMad(data?.finance.achats)} />
          </SynthGroup>
          <SynthGroup title={t('nav.group.realEstate')} to="/projets" tone="teal">
            <SynthRow label={t('nav.projects')} value={data?.immobilier.projects ?? '—'} />
            <SynthRow label={t('dashboard.soldProperties')} value={data?.immobilier.vendus ?? '—'} />
            <SynthRow label={t('dashboard.activeRentals')} value={data?.immobilier.rentals ?? '—'} />
            <SynthRow label={t('dashboard.prospects')} value={data?.immobilier.prospects ?? '—'} />
          </SynthGroup>
          <SynthGroup title={t('nav.sites')} to="/chantiers" tone="orange">
            <SynthRow label={t('dashboard.workers')} value={data?.chantier.ouvriers ?? '—'} />
            <SynthRow label={t('dashboard.avgProgress')} value={`${data?.chantier.avancement ?? 0} %`} />
            <SynthRow label={t('nav.equipment')} value={data?.chantier.engins ?? '—'} />
            <SynthRow label={t('dashboard.inMaintenance')} value={data?.chantier.enginsMaintenance ?? '—'} highlight={!!data?.chantier.enginsMaintenance} />
          </SynthGroup>
        </div>
      </section>

      <section>
        <SectionTitle>{t('dashboard.lastClients')}</SectionTitle>
        <Card padding={false}>
          <table className="mac-table">
            <thead>
              <tr>
                <th>{t('common.reference')}</th>
                <th>{t('common.name')}</th>
                <th className="hidden md:table-cell">{t('common.email')}</th>
                <th>{t('common.type')}</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="!text-center mac-table-muted !py-8">{t('common.loading')}</td></tr>
              )}
              {!loading && recentClients.length === 0 && (
                <tr><td colSpan={5} className="!text-center mac-table-muted !py-8">{t('dashboard.noClients')}</td></tr>
              )}
              {recentClients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/clients/${c.id}`} className="mac-table-ref">{c.reference}</Link>
                  </td>
                  <td className="font-medium">{c.firstName} {c.lastName}</td>
                  <td className="mac-table-muted hidden md:table-cell">{c.email || '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                      {c.isProspect && <StatusPill status="brouillon" quiet />}
                      {c.isBuyer && <StatusPill status="actif" quiet />}
                      {c.isTenant && <StatusPill status="loué" quiet />}
                    </div>
                  </td>
                  <td className="text-right">
                    <Link to={`/clients/${c.id}`} className="mac-table-action">{t('common.sheet')}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}

function SynthGroup({
  title,
  to,
  children,
  tone,
}: {
  title: string;
  to: string;
  children: ReactNode;
  tone?: 'amber' | 'green' | 'teal' | 'orange';
}) {
  const { t } = useI18n();
  return (
    <Card padding={false}>
      <div className="mac-panel-header">
        <h3 className={`mac-panel-title${tone ? ` mac-panel-title-${tone}` : ''}`}>{title}</h3>
        <Link to={to} className="mac-panel-action">{t('actions.open')}</Link>
      </div>
      <div>{children}</div>
    </Card>
  );
}

function SynthRow({ label, value, highlight }: { label: string; value: string | number | undefined; highlight?: boolean }) {
  return (
    <div className="mac-row">
      <span className="mac-row-subtitle !mt-0 !text-[13px]">{label}</span>
      <span className={`text-[13px] tabular-nums ${highlight ? 'mac-status-danger' : 'text-gic-ink'}`}>{value ?? '—'}</span>
    </div>
  );
}
