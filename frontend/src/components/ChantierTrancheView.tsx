import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Users, Truck, HardHat, UserMinus, Layers, ShoppingCart, Pencil, Trash2, Clock, ChevronRight, Package,
} from 'lucide-react';
import { api, fetchWorkforceList, fetchSupplierList, formatDate, formatMad } from '../lib/api';
import {
  Btn, Input, MacActionBtn, Modal, PageBackLink, Select, StatusPill, TableWrap, Td, Th,
} from './ui';
import ProgressSteps from './ProgressSteps';
import { TaskPhaseFields } from './TaskPhaseFields';
import { emptyPhaseForm, validatePhaseForm, type TaskPhaseInput } from '../lib/progressPhases';
import { workforceDetailPathForCategory } from '../lib/workforceScope';
import { PurchaseFormFields, emptyPurchaseForm, type PurchaseFormData } from './PurchaseFormFields';
import { EntityPickerPanel, enginToPickerItem, workforceToPickerItem } from './EntityPickerPanel';
import { ChantierStockPanel } from './ChantierExtraPanels';
import { useI18n } from '../i18n/I18nContext';

export type TrancheListItem = {
  id: string;
  name: string;
  remark?: string | null;
  percent: number;
  workersCount: number;
  missionsCount: number;
  tasksCount: number;
  purchasesCount: number;
  purchasesTotal: number;
  stockCount?: number;
  groupes: { name: string; percent: number; etages: string[] }[];
};

export type TrancheDetail = TrancheListItem & {
  progress: Array<{
    id: string;
    taskName: string;
    tranche: string | null;
    groupe: string | null;
    etage: string | null;
    percent: number;
    remark?: string | null;
    phases?: TaskPhaseInput[] | null;
    updatedAt?: string;
  }>;
  assignments: Array<{
    id: string;
    functionRole: string | null;
    tranche: string | null;
    workforce: {
      id?: string;
      firstName: string;
      lastName: string;
      category?: string | null;
      phone1?: string | null;
      groupe?: string | null;
    };
  }>;
  missions: Array<{
    id: string;
    mission: string;
    driverName?: string | null;
    createdAt: string;
    engin?: { brand?: string; matricule?: string } | null;
  }>;
  purchases: Array<{
    id: string;
    reference: string;
    designation: string;
    totalPrice: number;
    status: string;
    date: string;
    supplier?: { companyName?: string } | null;
  }>;
};

type TrancheTab = 'avancement' | 'personnel' | 'engins' | 'achats' | 'stock' | 'pointage';

export function ChantierTranchesList({
  chantierId,
  chantierName,
  tranches,
  loading,
  onSelect,
  onAdd,
}: {
  chantierId: string;
  chantierName?: string;
  tranches: TrancheListItem[];
  loading: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  if (loading) {
    return <p className="py-8 text-[12px] text-gic-muted text-center">{t('msg.loadingTranches')}</p>;
  }

  if (tranches.length === 0) {
    return (
      <div className="py-10 text-center">
        <Layers size={32} className="mx-auto text-[#c7c7cc] mb-3" />
        <p className="text-[13px] font-medium text-gic-ink">{t('msg.emptyTranches')}</p>
        <p className="text-[12px] text-gic-muted mt-1 mb-4">{t('msg.emptyTranchesHint')}</p>
        <Btn icon={Plus} onClick={onAdd}>{t('actions.addTranche')}</Btn>
      </div>
    );
  }

  return (
    <div className="tranche-list-page">
      <div className="tranche-list-head">
        <p className="tranche-list-count">
          {t('msg.tranchesAttached', { count: tranches.length })}
        </p>
        <Btn variant="secondary" icon={Plus} onClick={onAdd}>{t('actions.newTranche')}</Btn>
      </div>

      <div className="tranche-tree tranche-tree-page">
        <div className="tranche-tree-root">
          <span className="tranche-tree-root-icon">
            <Layers size={14} />
          </span>
          <span className="tranche-tree-root-label">{chantierName || t('fields.chantier')}</span>
        </div>

        <ul className="tranche-tree-branches">
          {tranches.map((tr) => {
            const meta = [
              tr.workersCount > 0 ? t('msg.workersCount', { count: tr.workersCount }) : null,
              tr.missionsCount > 0 ? t('msg.equipmentCount', { count: tr.missionsCount }) : null,
              tr.tasksCount > 0 ? t('msg.tasksCount', { count: tr.tasksCount }) : null,
              tr.purchasesCount > 0 ? t('msg.purchasesCount', { count: tr.purchasesCount }) : null,
            ].filter(Boolean).join(' · ');

            return (
              <li key={tr.id} className="tranche-tree-item">
                <div className="tranche-tree-connector" aria-hidden />
                <button type="button" onClick={() => onSelect(tr.id)} className="tranche-tree-card tranche-tree-card-clickable">
                  <div className="tranche-tree-card-head">
                    <div className="min-w-0">
                      <h3 className="tranche-tree-card-name">{tr.name}</h3>
                      {tr.remark && <p className="tranche-tree-card-remark">{tr.remark}</p>}
                    </div>
                    <span className="tranche-tree-card-pct">{tr.percent}%</span>
                  </div>
                  <ProgressSteps percent={tr.percent} size="sm" showLabel={false} />
                  {tr.groupes.length > 0 && (
                    <ul className="tranche-groupe-list">
                      {tr.groupes.map((g) => (
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
                  {meta && <p className="tranche-tree-card-meta">{meta}</p>}
                  <span className="tranche-tree-card-action">
                    {t('actions.openTranche')}
                    <ChevronRight size={13} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="tranche-list-foot">
        <Link to={`/pointage?chantierId=${chantierId}`} className="text-[#007aff] hover:underline">{t('tabs.attendance')}</Link>
      </p>
    </div>
  );
}

export function ChantierTrancheView({
  chantierId,
  trancheId,
  chantierName,
  engins,
  onBack,
  onRefresh,
}: {
  chantierId: string;
  trancheId: string;
  chantierName: string;
  engins: Array<{ id: string; brand?: string; matricule?: string; genre?: string; status?: string; photo?: string | null }>;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<TrancheDetail | null>(null);
  const [tab, setTab] = useState<TrancheTab>('avancement');
  const [error, setError] = useState('');
  const [savingProgress, setSavingProgress] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [missionOpen, setMissionOpen] = useState(false);
  const [workforce, setWorkforce] = useState<any[]>([]);
  const [assignForm, setAssignForm] = useState({ workforceId: '', functionRole: '' });
  const [assignSelectedIds, setAssignSelectedIds] = useState<string[]>([]);
  const [assignMissionFilter, setAssignMissionFilter] = useState<'all' | 'mission' | 'free'>('all');
  const [assignPickerQuery, setAssignPickerQuery] = useState('');
  const [missionPickerQuery, setMissionPickerQuery] = useState('');
  const [missionForm, setMissionForm] = useState({ enginId: '', mission: '', driverName: '', usage: '' });
  const [initForm, setInitForm] = useState({ groupe: '', etage: '' });
  const [addTaskForm, setAddTaskForm] = useState({
    groupe: '',
    etage: '',
    taskName: '',
    percent: '0',
    phases: emptyPhaseForm(),
  });
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [editPhasesOpen, setEditPhasesOpen] = useState(false);
  const [editPhasesItem, setEditPhasesItem] = useState<TrancheDetail['progress'][number] | null>(null);
  const [editPhasesForm, setEditPhasesForm] = useState<TaskPhaseInput[]>(emptyPhaseForm());
  const [initOpen, setInitOpen] = useState(false);
  const [taskRef, setTaskRef] = useState<string[]>([]);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormData>(emptyPurchaseForm());
  const [suppliers, setSuppliers] = useState<{ id: string; reference: string; companyName: string }[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', remark: '' });
  const [pointages, setPointages] = useState<any[]>([]);
  const [pointageLoading, setPointageLoading] = useState(false);

  function load() {
    setError('');
    api<TrancheDetail>(`/chantiers/${chantierId}/tranches/${trancheId}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  useEffect(() => {
    load();
    fetchWorkforceList().then(setWorkforce).catch(() => {});
    fetchSupplierList().then(setSuppliers).catch(() => {});
    api('/achats/families').then(setFamilies).catch(() => {});
    api<string[]>('/chantiers/tasks/reference').then(setTaskRef).catch(() => {});
  }, [chantierId, trancheId]);

  useEffect(() => {
    if (tab !== 'pointage' || !detail) return;
    loadTranchePointages();
  }, [tab, detail?.id]);

  function loadTranchePointages() {
    if (!detail) return;
    const workerIds = new Set(
      detail.assignments.map((a) => a.workforce.id).filter(Boolean) as string[],
    );
    if (workerIds.size === 0) {
      setPointages([]);
      return;
    }
    setPointageLoading(true);
    const qs = new URLSearchParams({
      chantierId,
      limit: '50',
      sort: 'date',
      order: 'desc',
      tranche: detail.name,
    });
    api<{ items: any[] }>(`/chantiers/pointage?${qs}`)
      .then((r) => {
        setPointages(r.items);
      })
      .catch(() => setPointages([]))
      .finally(() => setPointageLoading(false));
  }

  async function savePercent(progressId: string, percent: number) {
    setSavingProgress(progressId);
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        progress: prev.progress.map((p) => (p.id === progressId ? { ...p, percent } : p)),
      };
    });
    try {
      await api(`/chantiers/progress/${progressId}`, { method: 'PUT', body: JSON.stringify({ percent }) });
      load();
      onRefresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
      load();
    } finally {
      setSavingProgress(null);
    }
  }

  async function initTasks() {
    try {
      await api(`/chantiers/${chantierId}/progress/init`, {
        method: 'POST',
        body: JSON.stringify({ trancheId, groupe: initForm.groupe, etage: initForm.etage }),
      });
      load();
      onRefresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
      throw err;
    }
  }

  async function deleteProgress(progressId: string) {
    if (!await appConfirm(t('msg.confirmDeleteTask'))) return;
    try {
      await api(`/chantiers/progress/${progressId}`, { method: 'DELETE' });
      load();
      onRefresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function saveTrancheEdit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/chantiers/${chantierId}/tranches/${trancheId}`, {
        method: 'PUT',
        body: JSON.stringify(editForm),
      });
      setEditOpen(false);
      load();
      onRefresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function deleteTranche() {
    if (!await appConfirm(t('msg.confirmDeleteTranche'))) return;
    try {
      await api(`/chantiers/${chantierId}/tranches/${trancheId}`, { method: 'DELETE' });
      onBack();
      onRefresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openEditTranche() {
    if (!detail) return;
    setEditForm({ name: detail.name, remark: detail.remark || '' });
    setEditOpen(true);
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!detail || !addTaskForm.taskName.trim()) return;
    const phaseError = validatePhaseForm(addTaskForm.phases);
    if (phaseError) {
      await appAlert(phaseError);
      return;
    }
    try {
      await api(`/chantiers/${chantierId}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          tranche: detail.name,
          groupe: addTaskForm.groupe.trim() || null,
          etage: addTaskForm.etage.trim() || null,
          taskName: addTaskForm.taskName.trim(),
          percent: Number(addTaskForm.percent) || 0,
          phases: addTaskForm.phases.map((p) => ({
            percent: p.percent,
            label: p.label.trim(),
            description: p.description?.trim() || undefined,
          })),
        }),
      });
      setAddTaskForm({ groupe: '', etage: '', taskName: '', percent: '0', phases: emptyPhaseForm() });
      setAddTaskOpen(false);
      load();
      onRefresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function submitInitTasks(e: React.FormEvent) {
    e.preventDefault();
    try {
      await initTasks();
      setInitOpen(false);
      setInitForm({ groupe: '', etage: '' });
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openAddTask() {
    setAddTaskForm({ groupe: '', etage: '', taskName: '', percent: '0', phases: emptyPhaseForm() });
    setAddTaskOpen(true);
  }

  function openEditPhases(item: TrancheDetail['progress'][number]) {
    const phases = item.phases?.length
      ? emptyPhaseForm().map((empty) => {
          const existing = item.phases?.find((p) => p.percent === empty.percent);
          return existing
            ? { percent: empty.percent, label: existing.label || '', description: existing.description || '' }
            : empty;
        })
      : emptyPhaseForm();
    setEditPhasesItem(item);
    setEditPhasesForm(phases);
    setEditPhasesOpen(true);
  }

  async function saveEditPhases(e: React.FormEvent) {
    e.preventDefault();
    if (!editPhasesItem) return;
    const phaseError = validatePhaseForm(editPhasesForm);
    if (phaseError) {
      await appAlert(phaseError);
      return;
    }
    try {
      await api(`/chantiers/progress/${editPhasesItem.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          phases: editPhasesForm.map((p) => ({
            percent: p.percent,
            label: p.label.trim(),
            description: p.description?.trim() || undefined,
          })),
        }),
      });
      setEditPhasesOpen(false);
      setEditPhasesItem(null);
      load();
      onRefresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openInitTasks() {
    setInitForm({ groupe: '', etage: '' });
    setInitOpen(true);
  }

  function openAssign() {
    setAssignForm({ workforceId: '', functionRole: '' });
    setAssignSelectedIds([]);
    setAssignMissionFilter('all');
    setAssignPickerQuery('');
    setAssignOpen(true);
  }

  function toggleAssignSelect(workforceId: string) {
    setAssignSelectedIds((prev) => (
      prev.includes(workforceId) ? prev.filter((id) => id !== workforceId) : [...prev, workforceId]
    ));
  }

  function openMission() {
    setMissionForm({ enginId: '', mission: '', driverName: '', usage: '' });
    setMissionPickerQuery('');
    setMissionOpen(true);
  }

  async function assignWorker(e: React.FormEvent) {
    e.preventDefault();
    if (!detail || assignSelectedIds.length === 0) return;
    const failures: string[] = [];
    for (const workforceId of assignSelectedIds) {
      const worker = workforce.find((w) => w.id === workforceId);
      try {
        await api(`/chantiers/${chantierId}/assign`, {
          method: 'POST',
          body: JSON.stringify({
            workforceId,
            functionRole: assignForm.functionRole || worker?.category || null,
            tranche: detail.name,
          }),
        });
      } catch (err) {
        const name = worker ? `${worker.firstName} ${worker.lastName}` : workforceId;
        failures.push(`${name}: ${err instanceof Error ? err.message : t('common.error')}`);
      }
    }
    if (failures.length === assignSelectedIds.length) {
      await appAlert(failures.join('\n'));
      return;
    }
    if (failures.length > 0) {
      await appAlert(t('msg.someAssignmentsFailed', { failures: failures.join('\n') }));
    }
    setAssignOpen(false);
    setAssignForm({ workforceId: '', functionRole: '' });
    setAssignSelectedIds([]);
    load();
    onRefresh();
  }

  async function unassignWorker(assignmentId: string) {
    if (!await appConfirm(t('msg.confirmUnassignWorker'))) return;
    try {
      await api(`/chantiers/${chantierId}/assign/${assignmentId}`, { method: 'DELETE' });
      load();
      onRefresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function createMission(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    try {
      await api('/engins/missions', {
        method: 'POST',
        body: JSON.stringify({
          ...missionForm,
          chantierId,
          tranche: detail.name,
        }),
      });
      setMissionOpen(false);
      setMissionForm({ enginId: '', mission: '', driverName: '', usage: '' });
      load();
      onRefresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openPurchase() {
    setPurchaseForm({
      ...emptyPurchaseForm(),
      chantierId,
      tranche: detail?.name || '',
    });
    setPurchaseOpen(true);
  }

  async function savePurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    try {
      await api('/achats/purchases', {
        method: 'POST',
        body: JSON.stringify({
          designation: purchaseForm.designation,
          family: purchaseForm.family || null,
          unit: purchaseForm.unit || null,
          quantity: purchaseForm.quantity,
          unitPrice: purchaseForm.unitPrice,
          tvaRate: purchaseForm.tvaRate || '20',
          supplierId: purchaseForm.supplierId || null,
          chantierId,
          tranche: detail.name,
          paymentMode: purchaseForm.paymentMode,
          author: purchaseForm.author || null,
          remark: purchaseForm.remark || null,
          date: purchaseForm.date,
          invoiced: purchaseForm.invoiced === 'true',
        }),
      });
      setPurchaseOpen(false);
      setPurchaseForm(emptyPurchaseForm());
      load();
      onRefresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  if (error && !detail) {
    return (
      <div className="mt-4">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink onClick={onBack} className="mt-2" label={t('detail.backToTranches')} />
      </div>
    );
  }

  if (!detail) {
    return <p className="py-8 text-[12px] text-gic-muted text-center">{t('msg.loadingTranche')}</p>;
  }

  const tabs: { id: TrancheTab; label: string; icon: typeof HardHat; badge?: number }[] = [
    { id: 'avancement', label: t('tabs.progress'), icon: HardHat, badge: detail.tasksCount },
    { id: 'personnel', label: t('tabs.workers'), icon: Users, badge: detail.workersCount },
    { id: 'pointage', label: t('tabs.attendance'), icon: Clock },
    { id: 'engins', label: t('tabs.equipment'), icon: Truck, badge: detail.missionsCount },
    { id: 'achats', label: t('tabs.purchases'), icon: ShoppingCart, badge: detail.purchasesCount },
    { id: 'stock', label: t('tabs.stock'), icon: Package, badge: detail.stockCount || undefined },
  ];

  const groupeOptions = [...new Set([
    ...detail.groupes.map((g) => g.name),
    ...detail.progress.map((p) => p.groupe).filter(Boolean) as string[],
  ])].sort();

  const etageOptions = [...new Set([
    ...detail.groupes.flatMap((g) => g.etages),
    ...detail.progress.map((p) => p.etage).filter(Boolean) as string[],
  ])].sort();

  return (
    <div className="tranche-detail">
      <div className="tranche-detail-toolbar">
        <PageBackLink
          onClick={onBack}
          label={t('detail.backToTranches')}
          iconOnly={false}
          className="mac-page-back-labeled"
        />
        <div className="tranche-detail-toolbar-actions">
          <MacActionBtn icon={Pencil} tone="orange" title={t('actions.editTranche')} onClick={openEditTranche} />
          <MacActionBtn icon={Trash2} tone="red" title={t('actions.deleteTranche')} onClick={deleteTranche} />
        </div>
      </div>

      <div className="tranche-detail-panel">
        <div className="tranche-detail-head">
          <div className="min-w-0">
            <p className="tranche-detail-eyebrow">{chantierName}</p>
            <h1 className="tranche-detail-title">{detail.name}</h1>
            {detail.remark && <p className="tranche-detail-remark">{detail.remark}</p>}
          </div>
          <span className="tranche-detail-pct">{detail.percent}%</span>
        </div>

        <ProgressSteps percent={detail.percent} size="sm" showLabel={false} />

        {detail.groupes.length > 0 && (
          <ul className="tranche-detail-groupes">
            {detail.groupes.map((g) => (
              <li key={g.name} className="tranche-detail-groupe">
                <span className="tranche-detail-groupe-name">{g.name}</span>
                <span className="tranche-detail-groupe-pct">{g.percent}%</span>
                {g.etages.length > 0 && (
                  <span className="tranche-detail-groupe-etages">{g.etages.join(' · ')}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="tranche-detail-metrics">
          <div className="tranche-detail-metric">
            <HardHat size={14} aria-hidden />
            <span>{t('msg.tasksCount', { count: detail.tasksCount })}</span>
          </div>
          <div className="tranche-detail-metric">
            <Users size={14} aria-hidden />
            <span>{t('msg.workersCount', { count: detail.workersCount })}</span>
          </div>
          <div className="tranche-detail-metric">
            <Truck size={14} aria-hidden />
            <span>{t('msg.equipmentCount', { count: detail.missionsCount })}</span>
          </div>
          <div className="tranche-detail-metric">
            <ShoppingCart size={14} aria-hidden />
            <span>{t('msg.purchasesCountAmount', { count: detail.purchasesCount, amount: formatMad(detail.purchasesTotal) })}</span>
          </div>
        </div>
      </div>

      <div className="tranche-detail-shell">
        <nav className="tranche-detail-nav" aria-label={t('detail.trancheSectionsAria')}>
          <ul className="chantier-detail-nav-list">
            {tabs.map((item) => {
              const Icon = item.icon;
              const isActive = tab === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`chantier-detail-nav-item${isActive ? ' chantier-detail-nav-item-active' : ''}`}
                    onClick={() => setTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon size={15} strokeWidth={2} className="chantier-detail-nav-icon" />
                    <span className="chantier-detail-nav-label">{item.label}</span>
                    {item.badge != null && item.badge > 0 && (
                      <span className="chantier-detail-nav-badge">{item.badge}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="tranche-detail-content">
      {tab === 'avancement' && (
        <div className="space-y-4">
          <div className="mac-section-card border-[#007aff]/20 bg-[rgba(0,122,255,0.03)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-gic-muted">{t('detail.tranchePhasesTitle')}</p>
                {detail.remark ? (
                  <p className="text-[13px] text-gic-ink mt-1 leading-relaxed">{detail.remark}</p>
                ) : (
                  <p className="text-[12px] text-gic-muted mt-1">{t('msg.noPhaseDefined')}</p>
                )}
              </div>
              <Btn variant="secondary" size="sm" icon={Pencil} onClick={openEditTranche}>
                {detail.remark ? t('actions.editPhases') : t('actions.definePhases')}
              </Btn>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-gic-ink">{t('detail.taskTrackingTitle')}</p>
              <p className="text-[11px] text-gic-muted mt-0.5">{t('detail.taskTrackingHint')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn icon={Plus} size="sm" onClick={openAddTask}>{t('actions.addTask')}</Btn>
              <Btn variant="secondary" size="sm" onClick={openInitTasks}>{t('actions.init19Tasks')}</Btn>
            </div>
          </div>

          {detail.progress.length === 0 ? (
            <div className="mac-section-card text-center py-10">
              <HardHat size={28} className="mx-auto text-gic-muted opacity-40 mb-2" />
              <p className="text-[13px] font-medium text-gic-ink">{t('msg.emptyTasksOnTranche')}</p>
              <p className="text-[12px] text-gic-muted mt-1">{t('msg.emptyTasksHint')}</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                <Btn icon={Plus} size="sm" onClick={openAddTask}>{t('actions.addTask')}</Btn>
                <Btn variant="secondary" size="sm" onClick={openInitTasks}>{t('actions.init19Tasks')}</Btn>
              </div>
            </div>
          ) : (
            <div className="mac-section-card !py-2">
              {detail.progress.map((p) => (
                <div key={p.id} className="mac-task-row items-center">
                  <div className="mac-task-meta !w-[180px]">
                    <p className="mac-task-name truncate">{p.taskName}</p>
                    <p className="mac-task-sub truncate">
                      {[p.groupe, p.etage].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className={`flex-1 min-w-0${savingProgress === p.id ? ' opacity-60' : ''}`}>
                    <ProgressSteps
                      percent={p.percent}
                      onChange={(pct) => savePercent(p.id, pct)}
                      task={{
                        taskName: p.taskName,
                        tranche: p.tranche,
                        groupe: p.groupe,
                        etage: p.etage,
                        remark: p.remark,
                        updatedAt: p.updatedAt,
                        phases: p.phases,
                      }}
                    />
                  </div>
                  <MacActionBtn icon={Pencil} tone="orange" title={t('actions.editLotPhases')} onClick={() => openEditPhases(p)} />
                  <MacActionBtn icon={Trash2} tone="red" title={t('actions.deleteTask')} onClick={() => deleteProgress(p.id)} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'personnel' && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[13px] font-medium text-gic-ink">{t('detail.workersOnTranche')}</p>
            <div className="flex items-center gap-2">
              <Link to={`/pointage?chantierId=${chantierId}&tranche=${encodeURIComponent(detail.name)}`} className="mac-chip mac-chip-blue !gap-1">
                <Clock size={11} /> {t('tabs.attendance')}
              </Link>
              <Btn icon={Plus} onClick={openAssign}>{t('common.assign')}</Btn>
            </div>
          </div>
          {detail.assignments.length === 0 ? (
            <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyWorkersOnTranche')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.name')}</Th>
                  <Th mac>{t('columns.category')}</Th>
                  <Th mac>{t('columns.function')}</Th>
                  <Th mac>{t('columns.group')}</Th>
                  <Th mac>{t('columns.phoneFull')}</Th>
                  <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {detail.assignments.map((a) => (
                  <tr key={a.id}>
                    <Td mac>
                      <Link to={workforceDetailPathForCategory(a.workforce.category, a.workforce.id)} className="mac-table-ref font-medium">
                        {a.workforce.firstName} {a.workforce.lastName}
                      </Link>
                    </Td>
                    <Td mac className="mac-table-muted capitalize">{a.workforce.category || '—'}</Td>
                    <Td mac>{a.functionRole || '—'}</Td>
                    <Td mac className="mac-table-muted">{a.workforce.groupe || '—'}</Td>
                    <Td mac className="mac-table-muted">{a.workforce.phone1 || '—'}</Td>
                    <Td mac className="mac-td-actions">
                      <MacActionBtn icon={UserMinus} tone="red" title={t('common.remove')} onClick={() => unassignWorker(a.id)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}

      {tab === 'engins' && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[13px] font-medium text-gic-ink inline-flex items-center gap-1.5">
              <Truck size={15} className="text-[#007aff]" /> {t('detail.equipmentMissionsOnTranche')}
            </p>
            <Btn icon={Plus} onClick={openMission}>{t('actions.newMission')}</Btn>
          </div>
          {detail.missions.length === 0 ? (
            <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyEquipmentOnTranche')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.engin')}</Th>
                  <Th mac>{t('columns.mission')}</Th>
                  <Th mac>{t('columns.chauffeur')}</Th>
                  <Th mac>{t('columns.date')}</Th>
                </tr>
              </thead>
              <tbody>
                {detail.missions.map((m) => (
                  <tr key={m.id}>
                    <Td mac>{m.engin ? `${m.engin.brand} — ${m.engin.matricule}` : '—'}</Td>
                    <Td mac>{m.mission || '—'}</Td>
                    <Td mac className="mac-table-muted">{m.driverName || '—'}</Td>
                    <Td mac className="mac-table-muted">{formatDate(m.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}

      {tab === 'achats' && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[13px] font-medium text-gic-ink inline-flex items-center gap-1.5">
              <ShoppingCart size={15} className="text-[#007aff]" /> {t('detail.purchasesOnTranche', { amount: formatMad(detail.purchasesTotal) })}
            </p>
            <Btn icon={Plus} onClick={openPurchase}>{t('actions.newPurchase')}</Btn>
          </div>
          {detail.purchases.length === 0 ? (
            <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyPurchasesOnTranche')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.ref')}</Th>
                  <Th mac>{t('columns.date')}</Th>
                  <Th mac>{t('columns.designation')}</Th>
                  <Th mac>{t('columns.supplier')}</Th>
                  <Th mac>{t('columns.amount')}</Th>
                  <Th mac>{t('columns.status')}</Th>
                </tr>
              </thead>
              <tbody>
                {detail.purchases.map((p) => (
                  <tr key={p.id}>
                    <Td mac>
                      <Link to={`/achats/${p.id}`} className="mac-table-ref">{p.reference}</Link>
                    </Td>
                    <Td mac className="mac-table-muted">{formatDate(p.date)}</Td>
                    <Td mac>{p.designation}</Td>
                    <Td mac className="mac-table-muted">{p.supplier?.companyName || '—'}</Td>
                    <Td mac>{formatMad(p.totalPrice)}</Td>
                    <Td mac><StatusPill status={p.status} quiet /></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}

      {tab === 'stock' && (
        <ChantierStockPanel
          chantierId={chantierId}
          tranches={[detail.name]}
          filterTranche={detail.name}
          lockTranche
        />
      )}

      {tab === 'pointage' && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[13px] font-medium text-gic-ink">{t('detail.attendanceOnTranche')}</p>
            <Link to={`/pointage?chantierId=${chantierId}&tranche=${encodeURIComponent(detail.name)}`}>
              <Btn variant="secondary" icon={Clock}>{t('actions.enterAttendance')}</Btn>
            </Link>
          </div>
          {detail.workersCount === 0 ? (
            <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.assignWorkersForAttendance')}</p>
          ) : pointageLoading ? (
            <p className="py-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
          ) : pointages.length === 0 ? (
            <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyAttendanceOnTranche')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.date')}</Th>
                  <Th mac>{t('columns.worker')}</Th>
                  <Th mac>{t('columns.days')}</Th>
                  <Th mac>{t('columns.validated')}</Th>
                </tr>
              </thead>
              <tbody>
                {pointages.map((p) => (
                  <tr key={p.id}>
                    <Td mac className="mac-table-muted">{formatDate(p.date)}</Td>
                    <Td mac>
                      {p.workforce ? (
                        <Link to={workforceDetailPathForCategory(p.workforce.category, p.workforce.id)} className="mac-table-ref">
                          {p.workforce.firstName} {p.workforce.lastName}
                        </Link>
                      ) : '—'}
                    </Td>
                    <Td mac>{p.totalDay}</Td>
                    <Td mac>{p.validated ? t('common.yes') : t('common.no')}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}
        </div>
      </div>

      <Modal open={assignOpen} title={t('detail.assignFor', { name: detail.name })} onClose={() => setAssignOpen(false)} size="lg"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setAssignOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="tranche-assign-form" type="submit" disabled={assignSelectedIds.length === 0}>
              {assignSelectedIds.length > 0 ? t('actions.assignWithCount', { count: assignSelectedIds.length }) : t('common.assign')}
            </Btn>
          </>
        }
      >
        <form id="tranche-assign-form" onSubmit={assignWorker} className="grid gap-3">
          <p className="text-[11px] text-gic-muted">{t('detail.trancheLabel')} <strong>{detail.name}</strong></p>
          <EntityPickerPanel
            items={workforce.filter((w) => w.isActive !== false).map(workforceToPickerItem)}
            excludeIds={workforce
              .filter((w) => (w.assignments as any[])?.some((a) => a.chantierId === chantierId || a.chantier?.id === chantierId))
              .map((w) => w.id)}
            multiple
            selectedIds={assignSelectedIds}
            onToggleSelect={toggleAssignSelect}
            query={assignPickerQuery}
            onQueryChange={setAssignPickerQuery}
            open={assignOpen}
            showMissionFilter
            missionFilter={assignMissionFilter}
            onMissionFilterChange={setAssignMissionFilter}
            searchPlaceholder={t('fields.filterNameRefCinCat')}
            emptyMessage={t('msg.emptyWorkersAvailable')}
            countLabel={(n) => t('msg.workersAvailableCount', { count: n })}
            ariaLabel={t('tabs.workers')}
          />
          <Input label={t('fields.functionOnTranche')} value={assignForm.functionRole} onChange={(e) => setAssignForm({ ...assignForm, functionRole: e.target.value })} placeholder={t('fields.functionOnTranchePlaceholder')} />
        </form>
      </Modal>

      <Modal open={missionOpen} title={t('detail.missionEquipmentFor', { name: detail.name })} onClose={() => setMissionOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setMissionOpen(false)}>{t('common.cancel')}</Btn><Btn form="tranche-mission-form" type="submit">{t('actions.create')}</Btn></>}
      >
        <form id="tranche-mission-form" onSubmit={createMission} className="grid gap-3">
          <p className="text-[11px] text-gic-muted">{t('detail.trancheLabel')} <strong>{detail.name}</strong></p>
          <EntityPickerPanel
            items={engins.map(enginToPickerItem)}
            selectedId={missionForm.enginId || null}
            onSelect={(enginId) => setMissionForm({ ...missionForm, enginId })}
            query={missionPickerQuery}
            onQueryChange={setMissionPickerQuery}
            open={missionOpen}
            searchPlaceholder={t('fields.filterBrandMatricule')}
            emptyMessage={t('msg.emptyEquipmentAvailable')}
            countLabel={(n) => t('msg.equipmentAvailableCount', { count: n })}
            ariaLabel={t('tabs.equipment')}
          />
          <Input label={t('fields.missionRequired')} required value={missionForm.mission} onChange={(e) => setMissionForm({ ...missionForm, mission: e.target.value })} />
          <Input label={t('fields.chauffeur')} value={missionForm.driverName} onChange={(e) => setMissionForm({ ...missionForm, driverName: e.target.value })} />
          <Input label={t('fields.usage')} value={missionForm.usage} onChange={(e) => setMissionForm({ ...missionForm, usage: e.target.value })} />
        </form>
      </Modal>

      <Modal open={purchaseOpen} title={t('detail.newPurchaseFor', { name: detail.name })} onClose={() => setPurchaseOpen(false)} size="lg"
        footer={<><Btn variant="secondary" onClick={() => setPurchaseOpen(false)}>{t('common.cancel')}</Btn><Btn form="tranche-purchase-form" type="submit">{t('actions.create')}</Btn></>}
      >
        <form id="tranche-purchase-form" onSubmit={savePurchase}>
          <PurchaseFormFields
            form={purchaseForm}
            setForm={setPurchaseForm}
            suppliers={suppliers}
            chantiers={[{ id: chantierId, name: chantierName }]}
            families={families}
            lockTranche={detail.name}
            lockedTrancheName={detail.name}
          />
        </form>
      </Modal>

      <Modal open={addTaskOpen} title={t('actions.addTask')} onClose={() => setAddTaskOpen(false)} size="lg"
        footer={<><Btn variant="secondary" onClick={() => setAddTaskOpen(false)}>{t('common.cancel')}</Btn><Btn form="add-task-form" type="submit">{t('common.add')}</Btn></>}
      >
        <form id="add-task-form" onSubmit={addTask} className="grid gap-3">
          <Select label={t('fields.lotTaskRequired')} required value={addTaskForm.taskName} onChange={(e) => setAddTaskForm({ ...addTaskForm, taskName: e.target.value })}>
            <option value="">{t('fields.selectOption')}</option>
            {taskRef.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <Input
            label={t('fields.group')}
            value={addTaskForm.groupe}
            onChange={(e) => setAddTaskForm({ ...addTaskForm, groupe: e.target.value })}
            placeholder={t('fields.groupePlaceholder')}
            list="tranche-groupe-list"
          />
          <datalist id="tranche-groupe-list">
            {groupeOptions.map((g) => <option key={g} value={g} />)}
          </datalist>
          <Input
            label={t('fields.floor')}
            value={addTaskForm.etage}
            onChange={(e) => setAddTaskForm({ ...addTaskForm, etage: e.target.value })}
            placeholder={t('fields.etagePlaceholder')}
            list="tranche-etage-list"
          />
          <datalist id="tranche-etage-list">
            {etageOptions.map((e) => <option key={e} value={e} />)}
          </datalist>
          <TaskPhaseFields
            phases={addTaskForm.phases}
            onChange={(phases) => setAddTaskForm({ ...addTaskForm, phases })}
          />
          <Input
            label={t('fields.initialProgressPct')}
            type="number"
            min="0"
            max="100"
            value={addTaskForm.percent}
            onChange={(e) => setAddTaskForm({ ...addTaskForm, percent: e.target.value })}
          />
          <p className="text-[10px] text-gic-muted">{t('detail.trancheLabel')} <strong>{detail.name}</strong></p>
        </form>
      </Modal>

      <Modal
        open={editPhasesOpen}
        title={editPhasesItem ? t('detail.phasesForTask', { name: editPhasesItem.taskName }) : t('detail.lotPhasesTitle')}
        onClose={() => setEditPhasesOpen(false)}
        size="lg"
        footer={<><Btn variant="secondary" onClick={() => setEditPhasesOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-phases-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="edit-phases-form" onSubmit={saveEditPhases} className="grid gap-3">
          {editPhasesItem && (
            <p className="text-[12px] text-gic-muted">
              {[editPhasesItem.groupe, editPhasesItem.etage].filter(Boolean).join(' · ') || detail.name}
            </p>
          )}
          <TaskPhaseFields phases={editPhasesForm} onChange={setEditPhasesForm} />
        </form>
      </Modal>

      <Modal open={initOpen} title={t('actions.initStandardTasks')} onClose={() => setInitOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setInitOpen(false)}>{t('common.cancel')}</Btn><Btn form="init-tasks-form" type="submit">{t('common.initialize')}</Btn></>}
      >
        <form id="init-tasks-form" onSubmit={submitInitTasks} className="grid gap-3">
          <p className="text-[12px] text-gic-muted">
            {t('msg.init19TasksHint')}
          </p>
          <Input
            label={t('fields.group')}
            value={initForm.groupe}
            onChange={(e) => setInitForm({ ...initForm, groupe: e.target.value })}
            placeholder={t('fields.groupePlaceholderShort')}
          />
          <Input
            label={t('fields.floor')}
            value={initForm.etage}
            onChange={(e) => setInitForm({ ...initForm, etage: e.target.value })}
            placeholder={t('fields.etagePlaceholderShort')}
          />
        </form>
      </Modal>

      <Modal open={editOpen} title={t('detail.trancheInfoTitle')} onClose={() => setEditOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-tranche-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="edit-tranche-form" onSubmit={saveTrancheEdit} className="grid gap-3">
          <Input label={t('fields.nameRequired')} required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <Input
            label={t('fields.phasesDescription')}
            value={editForm.remark}
            onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })}
            placeholder={t('fields.tranchePhasesPlaceholder')}
          />
          <p className="text-[10px] text-gic-muted">{t('msg.trancheRenameHint')}</p>
        </form>
      </Modal>
    </div>
  );
}
