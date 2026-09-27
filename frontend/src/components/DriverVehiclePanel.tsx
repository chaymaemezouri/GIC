import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, CalendarCheck, ExternalLink, Plus, Trash2, Truck, User } from 'lucide-react';
import { api, fetchEnginList, fetchWorkforceList, formatDate } from '../lib/api';
import { appAlert, appConfirm } from '../lib/dialog';
import { CHAUFFEUR_CATEGORY, workforceDetailPathForCategory } from '../lib/workforceScope';
import { photoSrc } from '../lib/photoUrl';
import { Btn, Card, Input, KpiCard, MacActionBtn, MacDateInput, Modal, TableWrap, Td, Th } from './ui';
import { EntityPickerPanel, enginToPickerItem, workforceToPickerItem, type EntityPickerItem } from './EntityPickerPanel';
import { useI18n } from '../i18n/I18nContext';

type EnginRef = { id: string; brand?: string | null; genre?: string | null; matricule?: string | null; status?: string | null; photo?: string | null };
type DriverRef = { id: string; reference?: string | null; firstName: string; lastName: string; phone1?: string | null; photo?: string | null; category?: string | null };

export type DriverAssignment = {
  id: string;
  workforceId: string;
  enginId: string;
  startDate: string;
  endDate?: string | null;
  remark?: string | null;
  workforce?: DriverRef;
  engin?: EnginRef;
};

type Props = {
  /** `driver` : fiche chauffeur (liste des véhicules) — `engin` : fiche véhicule (liste des chauffeurs) */
  mode: 'driver' | 'engin';
  entityId: string;
  initial?: DriverAssignment[];
  onChanged?: () => void;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function enginTitle(e?: EnginRef | null) {
  if (!e) return '—';
  return [e.brand, e.genre].filter(Boolean).join(' ') || e.matricule || 'Engin';
}

function daysBetween(start: string, end?: string | null) {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, Math.floor((e - s) / 86_400_000));
}

export default function DriverVehiclePanel({ mode, entityId, initial, onChanged }: Props) {
  const { t } = useI18n();
  const isDriver = mode === 'driver';
  const [items, setItems] = useState<DriverAssignment[]>(initial || []);
  const [loading, setLoading] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [candidates, setCandidates] = useState<EntityPickerItem[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [assignForm, setAssignForm] = useState({ targetId: '', startDate: todayIso(), remark: '' });
  const [endOpen, setEndOpen] = useState(false);
  const [endDate, setEndDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    const qs = new URLSearchParams(isDriver ? { workforceId: entityId } : { enginId: entityId });
    api<DriverAssignment[]>(`/engins/driver-assignments?${qs}`)
      .then(setItems)
      .catch(() => setItems(initial || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [entityId, mode]);

  const current = items.find((a) => !a.endDate) || null;
  const distinctCount = useMemo(
    () => new Set(items.map((a) => (isDriver ? a.enginId : a.workforceId))).size,
    [items, isDriver],
  );

  async function openAssign() {
    setAssignForm({ targetId: '', startDate: todayIso(), remark: '' });
    setPickerQuery('');
    setAssignOpen(true);
    setCandidatesLoading(true);
    try {
      const openAssignments = await api<DriverAssignment[]>('/engins/driver-assignments?current=true').catch(() => []);
      if (isDriver) {
        const engins = await fetchEnginList<EnginRef>();
        const byEngin = new Map(openAssignments.map((a) => [a.enginId, a.workforce]));
        setCandidates(engins.map((e) => {
          const item = enginToPickerItem(e);
          const driver = byEngin.get(e.id);
          return driver
            ? { ...item, subtitle: `${item.subtitle ? `${item.subtitle} · ` : ''}${t('driverMgmt.drivenBy', { name: `${driver.firstName} ${driver.lastName}` })}` }
            : item;
        }));
      } else {
        const drivers = await fetchWorkforceList<DriverRef>({ category: CHAUFFEUR_CATEGORY });
        const byDriver = new Map(openAssignments.map((a) => [a.workforceId, a.engin]));
        setCandidates(drivers.map((d) => {
          const item = workforceToPickerItem(d);
          const engin = byDriver.get(d.id);
          return {
            ...item,
            badge: engin ? 'en_mission' : 'disponible',
            subtitle: engin
              ? `${item.subtitle ? `${item.subtitle} · ` : ''}${t('driverMgmt.currentlyOn', { vehicle: engin.matricule || enginTitle(engin) })}`
              : item.subtitle,
          };
        }));
      }
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setCandidatesLoading(false);
    }
  }

  async function submitAssign(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!assignForm.targetId || busy) return;
    setBusy(true);
    try {
      await api('/engins/driver-assignments', {
        method: 'POST',
        body: JSON.stringify({
          workforceId: isDriver ? entityId : assignForm.targetId,
          enginId: isDriver ? assignForm.targetId : entityId,
          startDate: assignForm.startDate || undefined,
          remark: assignForm.remark.trim() || undefined,
        }),
      });
      setAssignOpen(false);
      load();
      onChanged?.();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function submitEnd() {
    if (!current || busy) return;
    setBusy(true);
    try {
      await api(`/engins/driver-assignments/${current.id}/end`, {
        method: 'PUT',
        body: JSON.stringify({ endDate: endDate || undefined }),
      });
      setEndOpen(false);
      load();
      onChanged?.();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: DriverAssignment) {
    if (!(await appConfirm(t('driverMgmt.deleteConfirm')))) return;
    try {
      await api(`/engins/driver-assignments/${a.id}`, { method: 'DELETE' });
      load();
      onChanged?.();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function counterpartLink(a: DriverAssignment) {
    if (isDriver) {
      return a.engin ? (
        <Link to={`/engins/${a.engin.id}`} className="mac-table-ref inline-flex items-center gap-1">
          {enginTitle(a.engin)} <ExternalLink size={11} />
        </Link>
      ) : '—';
    }
    return a.workforce ? (
      <Link
        to={workforceDetailPathForCategory(a.workforce.category || CHAUFFEUR_CATEGORY, a.workforce.id)}
        className="mac-table-ref inline-flex items-center gap-1"
      >
        {a.workforce.firstName} {a.workforce.lastName} <ExternalLink size={11} />
      </Link>
    ) : '—';
  }

  const currentPhoto = current ? (isDriver ? current.engin?.photo : current.workforce?.photo) : null;
  const CurrentIcon = isDriver ? Truck : User;

  return (
    <div className="mt-1 space-y-4">
      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard
          title={isDriver ? t('driverMgmt.currentVehicle') : t('driverMgmt.currentDriver')}
          value={current ? (isDriver ? (current.engin?.matricule || enginTitle(current.engin)) : `${current.workforce?.firstName ?? ''} ${current.workforce?.lastName ?? ''}`) : '—'}
          icon={CurrentIcon}
          tone="violet"
          compact
        />
        <KpiCard
          title={t('driverMgmt.since')}
          value={current ? formatDate(current.startDate) : '—'}
          icon={CalendarCheck}
          tone="emerald"
          delta={current ? t('driverMgmt.daysCount', { count: daysBetween(current.startDate) }) : undefined}
          deltaTone="muted"
          compact
        />
        <KpiCard title={t('driverMgmt.assignmentsCount')} value={items.length} icon={ArrowLeftRight} tone="amber" />
        <KpiCard
          title={isDriver ? t('driverMgmt.vehiclesUsed') : t('driverMgmt.driversCount')}
          value={distinctCount}
          icon={isDriver ? Truck : User}
          tone="teal"
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-black/[0.04] flex items-center justify-center overflow-hidden shrink-0">
              {currentPhoto ? (
                <img src={photoSrc(currentPhoto)} alt="" className="w-full h-full object-cover" />
              ) : (
                <CurrentIcon size={20} className="text-gic-muted" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase text-gic-muted">
                {isDriver ? t('driverMgmt.currentVehicle') : t('driverMgmt.currentDriver')}
              </p>
              {current ? (
                <>
                  <p className="text-[13px] font-semibold truncate">{counterpartLink(current)}</p>
                  <p className="text-[11px] text-gic-muted">
                    {isDriver && current.engin?.matricule ? `${current.engin.matricule} · ` : ''}
                    {t('driverMgmt.sinceDate', { date: formatDate(current.startDate) })}
                    {current.remark ? ` · ${current.remark}` : ''}
                  </p>
                </>
              ) : (
                <p className="text-[12px] text-gic-muted">
                  {isDriver ? t('driverMgmt.noCurrentVehicle') : t('driverMgmt.noCurrentDriver')}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {current && (
              <Btn variant="secondary" icon={CalendarCheck} onClick={() => { setEndDate(todayIso()); setEndOpen(true); }}>
                {t('driverMgmt.endAssignment')}
              </Btn>
            )}
            <Btn icon={current ? ArrowLeftRight : Plus} onClick={openAssign}>
              {current
                ? (isDriver ? t('driverMgmt.changeVehicle') : t('driverMgmt.changeDriver'))
                : (isDriver ? t('driverMgmt.assignVehicle') : t('driverMgmt.assignDriver'))}
            </Btn>
          </div>
        </div>
      </Card>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gic-muted mb-2">{t('driverMgmt.history')}</p>
        {loading && items.length === 0 ? (
          <p className="text-[12px] text-gic-muted py-4">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="text-[12px] text-gic-muted py-4">{t('driverMgmt.emptyHistory')}</p>
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{isDriver ? t('driverMgmt.vehicle') : t('driverMgmt.driver')}</Th>
                {isDriver && <Th mac>{t('driverMgmt.plate')}</Th>}
                <Th mac>{t('driverMgmt.startDate')}</Th>
                <Th mac>{t('driverMgmt.endDate')}</Th>
                <Th mac>{t('driverMgmt.duration')}</Th>
                <Th mac>{t('driverMgmt.remark')}</Th>
                <Th mac>{t('driverMgmt.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <Td mac>{counterpartLink(a)}</Td>
                  {isDriver && <Td mac className="mac-table-muted">{a.engin?.matricule || '—'}</Td>}
                  <Td mac className="mac-table-muted">{formatDate(a.startDate)}</Td>
                  <Td mac className="mac-table-muted">{a.endDate ? formatDate(a.endDate) : '—'}</Td>
                  <Td mac className="mac-table-muted">{t('driverMgmt.daysCount', { count: daysBetween(a.startDate, a.endDate) })}</Td>
                  <Td mac className="mac-table-muted">{a.remark || '—'}</Td>
                  <Td mac>
                    {a.endDate
                      ? <span className="mac-chip">{t('driverMgmt.ended')}</span>
                      : <span className="mac-chip mac-chip-emerald">{t('driverMgmt.ongoing')}</span>}
                  </Td>
                  <Td mac className="mac-td-actions">
                    <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => remove(a)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </div>

      <Modal
        open={assignOpen}
        size="lg"
        title={isDriver ? t('driverMgmt.assignVehicle') : t('driverMgmt.assignDriver')}
        onClose={() => setAssignOpen(false)}
        footer={(
          <>
            <Btn variant="secondary" onClick={() => setAssignOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="driver-assign-form" type="submit" disabled={!assignForm.targetId || busy}>
              {busy ? t('inline.saving') : t('driverMgmt.confirmAssign')}
            </Btn>
          </>
        )}
      >
        <form id="driver-assign-form" onSubmit={submitAssign} className="grid gap-3">
          {current && (
            <p className="text-[11px] text-gic-muted rounded-lg bg-black/[0.03] px-3 py-2">
              {t('driverMgmt.autoCloseHint')}
            </p>
          )}
          <EntityPickerPanel
            items={candidates}
            excludeIds={current ? [isDriver ? current.enginId : current.workforceId] : []}
            selectedId={assignForm.targetId || null}
            onSelect={(targetId) => setAssignForm((f) => ({ ...f, targetId }))}
            query={pickerQuery}
            onQueryChange={setPickerQuery}
            loading={candidatesLoading}
            open={assignOpen}
            searchPlaceholder={isDriver ? t('driverMgmt.searchVehicle') : t('driverMgmt.searchDriver')}
            emptyMessage={isDriver ? t('driverMgmt.emptyVehicles') : t('driverMgmt.emptyDrivers')}
            countLabel={(n) => t('driverMgmt.availableCount', { count: n })}
            ariaLabel={isDriver ? t('driverMgmt.vehicle') : t('driverMgmt.driver')}
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <MacDateInput
              label={t('driverMgmt.startDate')}
              value={assignForm.startDate}
              onChange={(v) => setAssignForm((f) => ({ ...f, startDate: v }))}
            />
            <Input
              label={t('driverMgmt.remark')}
              value={assignForm.remark}
              onChange={(e) => setAssignForm((f) => ({ ...f, remark: e.target.value }))}
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={endOpen}
        title={t('driverMgmt.endAssignment')}
        onClose={() => setEndOpen(false)}
        footer={(
          <>
            <Btn variant="secondary" onClick={() => setEndOpen(false)}>{t('common.cancel')}</Btn>
            <Btn onClick={submitEnd} disabled={busy}>{busy ? t('inline.saving') : t('driverMgmt.endAssignment')}</Btn>
          </>
        )}
      >
        <div className="grid gap-3">
          <p className="text-[12px] text-gic-muted">
            {current && (isDriver
              ? t('driverMgmt.endVehicleHint', { vehicle: current.engin?.matricule || enginTitle(current.engin) })
              : t('driverMgmt.endDriverHint', { name: `${current.workforce?.firstName ?? ''} ${current.workforce?.lastName ?? ''}` }))}
          </p>
          <MacDateInput label={t('driverMgmt.endDate')} value={endDate} onChange={setEndDate} />
        </div>
      </Modal>
    </div>
  );
}
