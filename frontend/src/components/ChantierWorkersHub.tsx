import { appAlert } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Users, Wallet } from 'lucide-react';
import { api, formatDate, formatMad } from '../lib/api';
import { workforceDetailPathForCategory } from '../lib/workforceScope';
import { Btn, KpiCard, MacDateInput, Select, TableWrap, Tabs, Td, Th } from './ui';
import { ChantierWorkersPanel, type SiteAssignment } from './ChantierWorkersPanel';
import { useI18n } from '../i18n/I18nContext';

type Section = 'affectation' | 'transfer' | 'pointage' | 'synthese';

type ChantierOption = { id: string; name: string };
type TrancheOption = { id: string; name: string };

type SummaryItem = {
  workforceId: string;
  workforce: { id: string; firstName: string; lastName: string; category?: string | null; dailySalary?: number };
  totalDays: number;
  brut: number;
  bonuses: number;
  advances: number;
  remaining: number;
  validatedLines: number;
};

export function ChantierWorkersHub({
  chantierId,
  assignments,
  tranches,
  onChanged,
}: {
  chantierId: string;
  assignments: SiteAssignment[];
  tranches: string[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>('affectation');
  const [chantiers, setChantiers] = useState<ChantierOption[]>([]);
  const [destTranches, setDestTranches] = useState<string[]>([]);
  const [assignmentId, setAssignmentId] = useState('');
  const [destId, setDestId] = useState(chantierId);
  const [destTranche, setDestTranche] = useState('');
  const [saving, setSaving] = useState(false);
  const [filterTranche, setFilterTranche] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pointages, setPointages] = useState<any[]>([]);
  const [summary, setSummary] = useState<{ items: SummaryItem[]; totals: { workers: number; totalDays: number; remaining: number } } | null>(null);

  useEffect(() => {
    api<{ items: ChantierOption[] }>('/chantiers?limit=100&sort=name&order=asc')
      .then((r) => setChantiers(r.items || []))
      .catch(() => setChantiers([]));
  }, []);

  useEffect(() => {
    if (!destId) return;
    if (destId === chantierId) {
      setDestTranches(tranches);
      return;
    }
    api<TrancheOption[]>(`/chantiers/${destId}/tranches`)
      .then((rows) => setDestTranches(rows.map((tr) => tr.name)))
      .catch(() => setDestTranches([]));
  }, [destId, chantierId, tranches]);

  useEffect(() => {
    if (section !== 'pointage' && section !== 'synthese') return;
    const qs = new URLSearchParams({ chantierId, limit: '100', sort: 'date', order: 'desc' });
    if (filterTranche) qs.set('tranche', filterTranche);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    if (section === 'pointage') {
      api<{ items: any[] }>(`/chantiers/pointage?${qs}`).then((r) => setPointages(r.items)).catch(() => setPointages([]));
    } else {
      const sumQs = new URLSearchParams({ chantierId });
      if (filterTranche) sumQs.set('tranche', filterTranche);
      if (dateFrom) sumQs.set('dateFrom', dateFrom);
      if (dateTo) sumQs.set('dateTo', dateTo);
      api<{ items: SummaryItem[]; totals: { workers: number; totalDays: number; remaining: number } }>(`/chantiers/pointage/by-worker?${sumQs}`)
        .then(setSummary)
        .catch(() => setSummary(null));
    }
  }, [section, chantierId, filterTranche, dateFrom, dateTo]);

  async function transfer(e: React.FormEvent) {
    e.preventDefault();
    if (!assignmentId || saving) return;
    setSaving(true);
    try {
      await api(`/chantiers/${chantierId}/assign/${assignmentId}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ chantierId: destId, tranche: destTranche || null }),
      });
      setAssignmentId('');
      onChanged();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { id: 'affectation', label: t('siteOps.affectation') },
    { id: 'transfer', label: t('siteOps.transfer') },
    { id: 'pointage', label: t('siteOps.attendance') },
    { id: 'synthese', label: t('siteOps.synthesis') },
  ];

  return (
    <div className="mt-2 space-y-3">
      <Tabs mac active={section} onChange={(id) => setSection(id as Section)} tabs={tabs} />

      {section === 'affectation' && (
        <ChantierWorkersPanel chantierId={chantierId} assignments={assignments} tranches={tranches} onChanged={onChanged} />
      )}

      {section === 'transfer' && (
        <form onSubmit={transfer} className="grid gap-3 max-w-xl">
          <p className="text-[12px] text-gic-muted">{t('siteOps.transferHint')}</p>
          <Select label={t('columns.worker')} value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)} required>
            <option value="">—</option>
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.workforce.firstName} {a.workforce.lastName} — {a.tranche || t('msg.wholeSite')}
              </option>
            ))}
          </Select>
          <Select label={t('siteOps.destination')} value={destId} onChange={(e) => { setDestId(e.target.value); setDestTranche(''); }}>
            {chantiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            {!chantiers.some((c) => c.id === chantierId) && <option value={chantierId}>{chantierId}</option>}
          </Select>
          <Select label={t('columns.tranche')} value={destTranche} onChange={(e) => setDestTranche(e.target.value)}>
            <option value="">{t('msg.wholeSite')}</option>
            {destTranches.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
          <div>
            <Btn type="submit" disabled={saving || !assignmentId}>{saving ? t('auth.sending') : t('siteOps.transferWorker')}</Btn>
          </div>
        </form>
      )}

      {(section === 'pointage' || section === 'synthese') && (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-56">
              <Select label={t('columns.tranche')} value={filterTranche} onChange={(e) => setFilterTranche(e.target.value)}>
                <option value="">{t('common.all')}</option>
                {tranches.map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
            </div>
            <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0" />
            <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0" />
            <MacDateInput
              value={dateFrom && dateFrom === dateTo ? dateFrom : ''}
              onChange={(value) => { setDateFrom(value); setDateTo(value); }}
              placeholder={t('pointageMgmt.preciseDate')}
              className="w-36 shrink-0"
            />
          </div>
          {section === 'pointage' && (
            <Link to={`/pointage?chantierId=${chantierId}&tab=gestion`}>
              <Btn icon={Clock}>{t('actions.enterAttendance')}</Btn>
            </Link>
          )}
        </div>
      )}

      {section === 'pointage' && (
        pointages.length === 0 ? (
          <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyAttendanceOnSite')}</p>
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.date')}</Th>
                <Th mac>{t('columns.worker')}</Th>
                <Th mac>{t('columns.tranche')}</Th>
                <Th mac>{t('columns.workDays')}</Th>
                <Th mac>{t('columns.advance')}</Th>
                <Th mac>{t('columns.bonus')}</Th>
              </tr>
            </thead>
            <tbody>
              {pointages.map((p) => (
                <tr key={p.id}>
                  <Td mac>{formatDate(p.date)}</Td>
                  <Td mac>
                    {p.workforce ? (
                      <Link to={workforceDetailPathForCategory(p.workforce.category, p.workforce.id)} className="mac-table-ref">
                        {p.workforce.firstName} {p.workforce.lastName}
                      </Link>
                    ) : '—'}
                  </Td>
                  <Td mac className="mac-table-muted">{p.tranche || '—'}</Td>
                  <Td mac>{Number(p.totalDay || 0).toFixed(2)}</Td>
                  <Td mac>{formatMad(p.advance)}</Td>
                  <Td mac>{formatMad(p.bonus)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )
      )}

      {section === 'synthese' && summary && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <KpiCard title={t('tabs.workers')} value={summary.totals.workers} icon={Users} compact />
            <KpiCard title={t('columns.workDays')} value={summary.totals.totalDays.toFixed(1)} icon={Clock} compact />
            <KpiCard title={t('columns.remaining')} value={formatMad(summary.totals.remaining)} icon={Wallet} compact />
          </div>
          {summary.items.length === 0 ? (
            <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyAttendanceOnSite')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.worker')}</Th>
                  <Th mac>{t('columns.category')}</Th>
                  <Th mac>{t('columns.workDays')}</Th>
                  <Th mac>{t('columns.amount')}</Th>
                  <Th mac>{t('columns.remaining')}</Th>
                </tr>
              </thead>
              <tbody>
                {summary.items.map((item) => (
                  <tr key={item.workforceId}>
                    <Td mac>
                      <Link to={workforceDetailPathForCategory(item.workforce.category, item.workforce.id)} className="mac-table-ref">
                        {item.workforce.firstName} {item.workforce.lastName}
                      </Link>
                    </Td>
                    <Td mac className="mac-table-muted">{item.workforce.category || '—'}</Td>
                    <Td mac>{item.totalDays.toFixed(2)}</Td>
                    <Td mac>{formatMad(item.brut + item.bonuses)}</Td>
                    <Td mac>{formatMad(item.remaining)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}
    </div>
  );
}
