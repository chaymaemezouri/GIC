import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Printer, ExternalLink, Wallet, Clock, Users, TrendingUp, HardHat,
} from 'lucide-react';
import { api, formatDate, formatMad } from '../lib/api';
import {
  Btn, Card, KpiCard, MacActionBtn, StatusPill, TableWrap, Td, Th,
  PageBackLink,
} from '../components/ui';
import { useI18n } from '../i18n/I18nContext';
import { workforceDetailPathForCategory } from '../lib/workforceScope';
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

export default function SalaireDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const dateFrom = searchParams.get('dateFrom') || monthStartISO();
  const dateTo = searchParams.get('dateTo') || new Date().toISOString().slice(0, 10);

  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    if (!id) return;
    setLoading(true);
    setError('');
    const qs = new URLSearchParams();
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    api(`/chantiers/salaries/${id}?${qs}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [id, dateFrom, dateTo]);

  function printFiche() {
    if (!detail) return;
    const worker = detail.worker;
    const s = detail.salary;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><body style="font-family:sans-serif;padding:24px;font-size:12px">
      <h1>Fiche salaire — GIC</h1>
      <h2>${worker.firstName} ${worker.lastName}</h2>
      <p>Période : ${dateFrom} → ${dateTo}</p>
      <p>Journées : ${s.totalDays.toFixed(2)} · Salaire/j : ${formatMad(s.dailySalary)}</p>
      <p>Brut : ${formatMad(s.brut)} · Primes : ${formatMad(s.bonuses)} · Avances : −${formatMad(s.advances)}</p>
      <p><b>Net : ${formatMad(s.net)}</b></p>
      <h3>Pointages validés (${detail.pointages?.length || 0})</h3>
      <table border="1" cellpadding="4" style="border-collapse:collapse;width:100%">
        <tr><th>Date</th><th>Chantier</th><th>Total j.</th><th>Avance</th><th>Prime</th></tr>
        ${(detail.pointages || []).map((p: { date: string; chantier?: { name: string }; totalDay: number; advance: number; bonus: number }) => `<tr>
          <td>${formatDate(p.date)}</td><td>${p.chantier?.name || '—'}</td><td>${p.totalDay}</td><td>${p.advance}</td><td>${p.bonus}</td>
        </tr>`).join('')}
      </table>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (loading && !detail) {
    return <p className="text-[12px] text-gic-muted p-6 text-center">{t('msg.loadingSalary')}</p>;
  }

  if (error && !detail) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/salaires?type=main_oeuvre" className="mt-2" />
      </Card>
    );
  }

  if (!detail) return null;

  const worker = detail.worker;
  const s = detail.salary;

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/salaires?type=main_oeuvre" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            <div className="mac-detail-photo-fallback">
              <Wallet size={22} strokeWidth={1.75} />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.internalSalary')}</p>
            <h1 className="mac-detail-name truncate">{worker.firstName} {worker.lastName}</h1>
            <p className="mac-detail-meta">
              {worker.category || '—'}
              <span className="text-[#c7c7cc]"> · </span>
              {formatMad(s.dailySalary)}/jour
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <span className="mac-chip mac-chip-violet font-semibold">{t('msg.netPrefix', { amount: formatMad(s.net) })}</span>
              {worker.isActive ? (
                <StatusPill status="actif" quiet />
              ) : (
                <StatusPill status="inactif" quiet />
              )}
              {worker.declared && <span className="mac-chip mac-chip-blue">{t('fields.declaredCnss')}</span>}
            </div>
            <p className="text-[10px] text-gic-muted mt-2">
              {t('msg.periodRange', { from: dateFrom, to: dateTo })}
            </p>
          </div>
        </div>
        <div className="mac-page-actions">
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Printer} tone="gray" title={t('actions.printSheet')} onClick={printFiche} />
          </div>
          <Link to={workforceDetailPathForCategory(worker.category, worker.id)}>
            <Btn variant="secondary" icon={Users}>{t('actions.workerFiche')}</Btn>
          </Link>
                 </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('fields.daysCount')} value={s.totalDays.toFixed(2)} icon={Clock} tone="amber" delta={t('msg.attendanceDelta', { count: s.pointageCount })} deltaTone="muted" />
        <KpiCard title={t('columns.brut')} value={formatMadCompact(s.brut)} icon={TrendingUp} tone="emerald" compact />
        <KpiCard title={t('fields.bonusesAdvances')} value={`+${formatMadCompact(s.bonuses)}`} icon={Wallet} tone="violet" compact delta={`−${formatMadCompact(s.advances)}`} deltaTone="muted" />
        <KpiCard title={t('fields.netToPay')} value={formatMadCompact(s.net)} icon={Wallet} tone="coral" compact />
      </div>

      <Card>
        <div className="mac-section-card !shadow-none !border-0 !p-0">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <HardHat size={16} />
              {t('detail.validatedAttendance', { count: detail.pointages?.length || 0 })}
            </h2>
            <Link to="/pointage"><Btn variant="secondary" size="sm" icon={Clock}>{t('tabs.attendance')}</Btn></Link>
          </div>

          {(detail.pointages || []).length === 0 ? (
            <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyValidatedAttendance')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.date')}</Th>
                  <Th mac>{t('columns.chantier')}</Th>
                  <Th mac>{t('columns.totalDays')}</Th>
                  <Th mac>{t('columns.advance')}</Th>
                  <Th mac>{t('columns.bonus')}</Th>
                  <Th mac>{t('columns.contributionBrut')}</Th>
                </tr>
              </thead>
              <tbody>
                {detail.pointages.map((p: {
                  id: string;
                  date: string;
                  totalDay: number;
                  advance: number;
                  bonus: number;
                  chantier?: { id: string; name: string };
                }) => (
                  <tr key={p.id}>
                    <Td mac className="text-[11px]">{formatDate(p.date)}</Td>
                    <Td mac>
                      {p.chantier?.id ? (
                        <Link to={`/chantiers/${p.chantier.id}`} className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1">
                          {p.chantier.name}
                          <ExternalLink size={10} />
                        </Link>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td mac>{p.totalDay.toFixed(2)}</Td>
                    <Td mac className="text-gic-coral">{formatMad(p.advance)}</Td>
                    <Td mac className="text-gic-emerald">{formatMad(p.bonus)}</Td>
                    <Td mac className="font-medium">{formatMad(p.totalDay * s.dailySalary)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      </Card>
    </div>
  );
}
