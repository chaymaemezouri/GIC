import { appAlert, appConfirm } from '../lib/dialog';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Users } from 'lucide-react';
import { api, formatDate } from '../lib/api';
import { CHAUFFEUR_CATEGORY, workforceDetailPathForCategory } from '../lib/workforceScope';
import { Btn, Input, MacActionBtn, MacSearch, Modal, Select, TableWrap, Td, Th } from './ui';
import { EntityPickerPanel, workforceToPickerItem } from './EntityPickerPanel';
import { useI18n } from '../i18n/I18nContext';

export type SiteAssignment = {
  id: string;
  functionRole?: string | null;
  tranche?: string | null;
  startDate?: string | null;
  workforce: {
    id: string;
    firstName: string;
    lastName: string;
    category?: string | null;
    phone1?: string | null;
    groupe?: string | null;
  };
};

type WorkerOption = {
  id: string;
  reference?: string | null;
  firstName: string;
  lastName: string;
  cin?: string | null;
  category?: string | null;
  phone1?: string | null;
  photo?: string | null;
  assignments?: Array<{ chantier?: { id?: string; name?: string } | null }>;
};

type Props = {
  chantierId: string;
  assignments: SiteAssignment[];
  tranches: string[];
  /** Quand on est sur une tranche : liste déjà filtrée, et les nouveaux ouvriers y sont affectés. */
  fixedTranche?: string;
  onChanged: () => void;
};

export function ChantierWorkersPanel({ chantierId, assignments, tranches, fixedTranche, onChanged }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tranche, setTranche] = useState('');
  const [functionRole, setFunctionRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [missionFilter, setMissionFilter] = useState<'all' | 'mission' | 'free'>('all');

  const assignedIds = useMemo(() => {
    const ids = new Set(assignments.map((a) => a.workforce.id));
    for (const w of workers) {
      if (w.assignments?.some((a) => a.chantier?.id === chantierId)) ids.add(w.id);
    }
    return ids;
  }, [assignments, workers, chantierId]);

  const visible = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = [...assignments].sort((a, b) =>
      `${a.workforce.lastName} ${a.workforce.firstName}`.localeCompare(`${b.workforce.lastName} ${b.workforce.firstName}`, 'fr'),
    );
    if (!tokens.length) return rows;
    return rows.filter((a) => {
      const blob = `${a.workforce.firstName} ${a.workforce.lastName} ${a.workforce.category || ''} ${a.workforce.groupe || ''} ${a.functionRole || ''} ${a.tranche || ''}`.toLowerCase();
      return tokens.every((tok) => blob.includes(tok));
    });
  }, [assignments, query]);

  const pickerItems = useMemo(
    () => workers.map((w) => {
      const item = workforceToPickerItem(w);
      const sites = [...new Set((w.assignments || []).map((a) => a.chantier?.name).filter(Boolean) as string[])];
      if (sites.length) item.subtitle = [item.subtitle, sites.join(', ')].filter(Boolean).join(' · ');
      return item;
    }),
    [workers],
  );

  async function openAssign() {
    setSelectedIds([]);
    setPickerQuery('');
    setTranche(fixedTranche || '');
    setFunctionRole('');
    setMissionFilter('all');
    setOpen(true);
    setWorkersLoading(true);
    try {
      const rows = await api<WorkerOption[]>(`/chantiers/workforce/list?excludeCategory=${encodeURIComponent(CHAUFFEUR_CATEGORY)}`);
      setWorkers(rows);
    } catch {
      setWorkers([]);
    } finally {
      setWorkersLoading(false);
    }
  }

  function toggleWorker(id: string) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedIds.length || saving) return;
    setSaving(true);
    const failures: string[] = [];
    for (const workforceId of selectedIds) {
      const worker = workers.find((w) => w.id === workforceId);
      const name = worker ? `${worker.firstName} ${worker.lastName}` : workforceId;
      try {
        await api(`/chantiers/${chantierId}/assign`, {
          method: 'POST',
          body: JSON.stringify({
            workforceId,
            tranche: tranche || null,
            functionRole: functionRole.trim() || null,
          }),
        });
      } catch (err) {
        failures.push(`${name} — ${err instanceof Error ? err.message : t('common.error')}`);
      }
    }
    setSaving(false);
    if (failures.length) {
      await appAlert(t('msg.someAssignmentsFailed', { failures: failures.join('\n') }));
    }
    if (failures.length < selectedIds.length) {
      setOpen(false);
      onChanged();
    }
  }

  async function changeTranche(assignment: SiteAssignment, next: string) {
    try {
      await api(`/chantiers/${chantierId}/assign/${assignment.id}`, {
        method: 'PUT',
        body: JSON.stringify({ tranche: next || null }),
      });
      onChanged();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function remove(assignment: SiteAssignment) {
    if (!await appConfirm(t('msg.confirmRemoveWorkerFromSite'))) return;
    try {
      await api(`/chantiers/${chantierId}/assign/${assignment.id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium text-gic-ink tracking-tight inline-flex items-center gap-1.5">
            <Users size={15} /> {t('msg.workersAssignedTitle')}
          </p>
          <p className="text-[11px] text-gic-muted mt-0.5">{t('msg.workersOnSiteCount', { count: assignments.length })}</p>
        </div>
        <Btn icon={Plus} onClick={openAssign}>{t('actions.assignWorkers')}</Btn>
      </div>

      {assignments.length > 0 && (
        <MacSearch value={query} onChange={setQuery} placeholder={t('fields.filterNameRefEmail')} />
      )}

      {visible.length === 0 ? (
        <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyWorkerOnSite')}</p>
      ) : (
        <TableWrap mac>
          <thead>
            <tr>
              <Th mac>{t('columns.worker')}</Th>
              <Th mac>{t('columns.category')}</Th>
              <Th mac>{t('columns.function')}</Th>
              <Th mac>{t('columns.tranche')}</Th>
              <Th mac>{t('columns.start')}</Th>
              <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.id}>
                <Td mac>
                  <Link to={workforceDetailPathForCategory(a.workforce.category, a.workforce.id)} className="mac-table-ref">
                    {a.workforce.firstName} {a.workforce.lastName}
                  </Link>
                  {a.workforce.phone1 && <span className="block text-[10px] text-gic-muted">{a.workforce.phone1}</span>}
                </Td>
                <Td mac className="mac-table-muted">{a.workforce.category || '—'}</Td>
                <Td mac className="mac-table-muted">{a.functionRole || '—'}</Td>
                <Td mac>
                  {fixedTranche || tranches.length === 0 ? (
                    <span className="mac-table-muted">{a.tranche || fixedTranche || t('msg.wholeSite')}</span>
                  ) : (
                    <select
                      className="w-full max-w-[180px] rounded-md border border-black/[0.1] bg-black/[0.02] px-2 py-1 text-[12px] outline-none focus:border-gic-violet"
                      value={a.tranche || ''}
                      aria-label={t('columns.tranche')}
                      onChange={(e) => changeTranche(a, e.target.value)}
                    >
                      <option value="">{t('msg.wholeSite')}</option>
                      {a.tranche && !tranches.includes(a.tranche) && <option value={a.tranche}>{a.tranche}</option>}
                      {tranches.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  )}
                </Td>
                <Td mac className="mac-table-muted">{a.startDate ? formatDate(a.startDate) : '—'}</Td>
                <Td mac className="mac-td-actions">
                  <div className="mac-actions">
                    <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => remove(a)} />
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal
        open={open}
        title={t('actions.assignWorkers')}
        onClose={() => setOpen(false)}
        size="lg"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="assign-workers-form" type="submit" disabled={saving || selectedIds.length === 0}>
              {saving ? t('auth.sending') : t('common.save')}
            </Btn>
          </>
        }
      >
        <form id="assign-workers-form" onSubmit={assign} className="grid gap-3">
          <p className="text-[12px] text-gic-muted">{t('msg.assignWorkersHint')}</p>
          <EntityPickerPanel
            items={pickerItems}
            excludeIds={assignedIds}
            multiple
            selectedIds={selectedIds}
            onToggleSelect={toggleWorker}
            query={pickerQuery}
            onQueryChange={setPickerQuery}
            loading={workersLoading}
            open={open}
            searchPlaceholder={t('fields.filterNameRefEmail')}
            emptyMessage={t('msg.emptyWorkerOnSite')}
            ariaLabel={t('msg.ariaSelectWorkers')}
            showMissionFilter
            missionFilter={missionFilter}
            onMissionFilterChange={setMissionFilter}
          />
          {fixedTranche ? (
            <p className="text-[12px] text-gic-ink">{t('columns.tranche')} : {fixedTranche}</p>
          ) : tranches.length > 0 && (
            <Select label={t('fields.tranche')} value={tranche} onChange={(e) => setTranche(e.target.value)}>
              <option value="">{t('msg.wholeSite')}</option>
              {tranches.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
          )}
          <Input
            label={t('columns.function')}
            value={functionRole}
            onChange={(e) => setFunctionRole(e.target.value)}
            placeholder={t('columns.function')}
          />
        </form>
      </Modal>
    </div>
  );
}
