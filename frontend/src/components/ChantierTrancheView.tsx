import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Plus, Users, Truck, HardHat, Layers, ShoppingCart, Pencil, Trash2, Clock, ChevronRight, FileText, Package,
} from 'lucide-react';
import { api, fetchSupplierList, formatDate, formatMad } from '../lib/api';
import { chantierDateError } from './ChantierFormFields';
import {
  Btn, Input, MacActionBtn, Modal, PageBackLink, TableWrap, Td, Th,
} from './ui';
import ProgressSteps from './ProgressSteps';
import { TaskPhaseFields } from './TaskPhaseFields';
import { emptyPhaseForm, ensureAnchoredPhases, extractWorkPhases, validatePhaseForm, workPhaseLabels, type TaskPhaseInput } from '../lib/progressPhases';
import { workforceDetailPathForCategory } from '../lib/workforceScope';
import { PurchaseFormFields, emptyPurchaseForm, purchaseFormToBody, validatePurchaseForm, type PurchaseFormData } from './PurchaseFormFields';
import { PurchaseDeliveryPill, PurchasePaymentPill, PurchaseStatusPill } from './PurchaseBadges';
import { EntityPickerPanel, enginToPickerItem } from './EntityPickerPanel';
import { SiteEnginsPanel, type SiteEnginCosts } from './engins/SiteEngins';
import { SiteMaterielPanel } from './engins/SiteMaterielPanel';
import { useI18n } from '../i18n/I18nContext';
import { ChantierWorkersPanel } from './ChantierWorkersPanel';
import { EntityDocChecklist } from './EntityDocChecklist';
import { PaymentBox, TaskSubcontractEditor, draftFromContracts, subcontractTotals, type SubDraft, type TaskSubcontract } from './TaskSubcontractEditor';

export type TrancheListItem = {
  id: string;
  name: string;
  remark?: string | null;
  estimatedStartDate?: string | null;
  estimatedEndDate?: string | null;
  percent: number;
  workersCount: number;
  missionsCount: number;
  tasksCount: number;
  purchasesCount: number;
  purchasesTotal: number;
  enginsCost?: number;
  groupes: { name: string; percent: number; etages: string[] }[];
};

export type TrancheDetail = TrancheListItem & {
  enginCosts?: SiteEnginCosts;
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
    subcontractors?: TaskSubcontract[];
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
    paymentStatus?: string;
    deliveryStatus?: string;
    date: string;
    supplier?: { companyName?: string } | null;
  }>;
};

type TrancheTab = 'avancement' | 'ouvriers' | 'engins' | 'materiel' | 'achats' | 'pointage' | 'documents';

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
              tr.enginsCost ? t('fleet.hints.trancheEnginCost', { amount: formatMad(tr.enginsCost) }) : null,
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
                      {(tr.estimatedStartDate || tr.estimatedEndDate) && (
                        <p className="tranche-tree-card-remark">
                          {[
                            tr.estimatedStartDate ? formatDate(tr.estimatedStartDate) : '…',
                            tr.estimatedEndDate ? formatDate(tr.estimatedEndDate) : '…',
                          ].join(' → ')}
                        </p>
                      )}
                    </div>
                    <span className="tranche-tree-card-pct">{tr.percent}%</span>
                  </div>
                  <ProgressSteps percent={tr.percent} size="sm" showLabel={false} />
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
  tranches = [],
  onSelectTranche,
  onBack,
  onRefresh,
}: {
  chantierId: string;
  trancheId: string;
  chantierName: string;
  engins: Array<{
    id: string;
    brand?: string;
    matricule?: string;
    genre?: string;
    status?: string;
    photo?: string | null;
    driverAssignments?: Array<{ workforce?: { firstName: string; lastName: string } | null }>;
  }>;
  tranches?: TrancheListItem[];
  onSelectTranche?: (trancheId: string) => void;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<TrancheDetail | null>(null);
  const [tab, setTab] = useState<TrancheTab>('avancement');
  const [error, setError] = useState('');
  const [savingProgress, setSavingProgress] = useState<string | null>(null);
  const [missionOpen, setMissionOpen] = useState(false);
  const [missionPickerQuery, setMissionPickerQuery] = useState('');
  const [missionForm, setMissionForm] = useState({ enginId: '', mission: '', driverName: '', usage: '' });
  const [addTaskForm, setAddTaskForm] = useState({
    taskName: '',
    percent: '0',
    phases: emptyPhaseForm(),
  });
  const [addSubDraft, setAddSubDraft] = useState<SubDraft>(draftFromContracts([], []));
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [editPhasesOpen, setEditPhasesOpen] = useState(false);
  const [editPhasesItem, setEditPhasesItem] = useState<TrancheDetail['progress'][number] | null>(null);
  const [editPhasesForm, setEditPhasesForm] = useState<TaskPhaseInput[]>(emptyPhaseForm());
  const [subDraft, setSubDraft] = useState<SubDraft>(draftFromContracts([], []));
  const [subContracts, setSubContracts] = useState<TaskSubcontract[]>([]);
  const [stTask, setStTask] = useState<TrancheDetail['progress'][number] | null>(null);
  const [taskRef, setTaskRef] = useState<string[]>([]);
  const [standardLots, setStandardLots] = useState<{ name: string; phases: TaskPhaseInput[] }[]>([]);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormData>(emptyPurchaseForm());
  const [suppliers, setSuppliers] = useState<{ id: string; reference: string; companyName: string }[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    remark: '',
    estimatedStartDate: '',
    estimatedEndDate: '',
  });
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
    fetchSupplierList().then(setSuppliers).catch(() => {});
    api('/achats/families').then(setFamilies).catch(() => {});
    api<string[]>('/chantiers/tasks/reference').then(setTaskRef).catch(() => {});
    api<{ name: string; phases: TaskPhaseInput[] }[]>('/chantiers/tasks/standard')
      .then(setStandardLots)
      .catch(() => {});
  }, [chantierId, trancheId]);

  useEffect(() => {
    const focus = location.state as { focusTaskId?: string; focusPhase?: string | null } | null;
    if (!detail || !focus?.focusTaskId) return;
    const task = detail.progress.find((row) => row.id === focus.focusTaskId);
    if (!task) return;
    setTab('avancement');
    openEditPhases(task);
    window.setTimeout(() => {
      document.getElementById(`task-${task.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
    navigate(location.pathname, { replace: true, state: null });
  }, [detail, location.state]);

  useEffect(() => {
    if (tab !== 'pointage' || !detail) return;
    loadTranchePointages();
  }, [tab, detail?.id]);

  function loadTranchePointages() {
    if (!detail) return;
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
    if (chantierDateError(editForm.estimatedStartDate, editForm.estimatedEndDate)) {
      await appAlert(t('inline.dateOrderError'));
      return;
    }
    try {
      await api(`/chantiers/${chantierId}/tranches/${trancheId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editForm.name.trim(),
          remark: editForm.remark.trim() || null,
          estimatedStartDate: editForm.estimatedStartDate || null,
          estimatedEndDate: editForm.estimatedEndDate || null,
        }),
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
    setEditForm({
      name: detail.name,
      remark: detail.remark || '',
      estimatedStartDate: detail.estimatedStartDate ? String(detail.estimatedStartDate).slice(0, 10) : '',
      estimatedEndDate: detail.estimatedEndDate ? String(detail.estimatedEndDate).slice(0, 10) : '',
    });
    setEditOpen(true);
  }

  function subcontractPayload(draft: SubDraft, labels: string[]) {
    if (draft.mode === 'none') return { mode: 'none' };
    if (draft.mode === 'task') {
      if (!draft.companyName.trim()) return { mode: 'none' };
      return {
        mode: 'task',
        task: {
          companyName: draft.companyName.trim(),
          phone: draft.phone,
          amount: Number(draft.amount),
          startDate: draft.startDate || null,
          endDate: draft.endDate || null,
        },
      };
    }
    const selected = labels.filter((label) => draft.phases[label]?.on && draft.phases[label].companyName.trim());
    if (!selected.length) return { mode: 'none' };
    return {
      mode: 'phases',
      phases: selected.map((label) => ({
        label,
        companyName: draft.phases[label].companyName,
        phone: draft.phases[label].phone,
        amount: Number(draft.phases[label].amount),
        startDate: draft.phases[label].startDate || null,
        endDate: draft.phases[label].endDate || null,
      })),
    };
  }

  function keepPhaseChoices(draft: SubDraft, labels: string[]): SubDraft {
    return {
      ...draft,
      phases: Object.fromEntries(labels.map((label) => [label, draft.phases[label] || { on: false, companyName: '', phone: '', amount: '', startDate: '', endDate: '' }])),
    };
  }

  function withFallbackPhaseNames(phases: TaskPhaseInput[]): TaskPhaseInput[] {
    const work = extractWorkPhases(phases);
    const labels = workPhaseLabels(phases);
    return ensureAnchoredPhases(work.map((phase, index) => ({ ...phase, label: labels[index] })));
  }

  function withSite(contract: TaskSubcontract): TaskSubcontract {
    return { ...contract, chantierId: contract.chantierId || chantierId };
  }

  function advanceBlocks(contracts: TaskSubcontract[], labels: string[]) {
    const whole = contracts.find((item) => item.scope !== 'phase');
    const phaseOnes = contracts.filter((item) => item.scope === 'phase');
    if (whole) {
      const names = labels.length ? labels : [t('detail.stWholeTask')];
      return names.map((label) => ({
        key: `task-${whole.id}-${label}`,
        title: `${label} · ${whole.companyName}`,
        contract: withSite(whole),
        phaseLabel: labels.length ? label : undefined,
      }));
    }
    return phaseOnes.map((contract) => ({
      key: contract.id,
      title: `${contract.phaseLabel || t('detail.stCompletePhases')} · ${contract.companyName}`,
      contract: withSite(contract),
      phaseLabel: undefined as string | undefined,
    }));
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!detail || !addTaskForm.taskName.trim()) return;
    const phases = withFallbackPhaseNames(ensureAnchoredPhases(addTaskForm.phases));
    const phaseError = validatePhaseForm(phases);
    if (phaseError) {
      await appAlert(phaseError);
      return;
    }
    try {
      const labeled = withFallbackPhaseNames(phases);
      const created = await api<{ id: string }>(`/chantiers/${chantierId}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          tranche: detail.name,
          taskName: addTaskForm.taskName.trim(),
          percent: 0,
          phases: labeled.map((p) => ({
            percent: p.percent,
            label: p.label.trim(),
            description: p.description?.trim() || undefined,
          })),
        }),
      });
      const labels = workPhaseLabels(labeled);
      if (addSubDraft.mode !== 'none') {
        await api(`/chantiers/progress/${created.id}/subcontract`, {
          method: 'PUT',
          body: JSON.stringify(subcontractPayload(addSubDraft, labels)),
        });
      }
      setAddTaskForm({ taskName: '', percent: '0', phases: emptyPhaseForm() });
      setAddSubDraft(draftFromContracts([], []));
      setAddTaskOpen(false);
      load();
      onRefresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openAddTask() {
    setAddTaskForm({ taskName: '', percent: '0', phases: emptyPhaseForm() });
    setAddSubDraft(draftFromContracts([], []));
    setAddTaskOpen(true);
  }

  function openEditPhases(item: TrancheDetail['progress'][number]) {
    const contractPhaseLabels = [...new Set(
      (item.subcontractors || []).map((row) => String(row.phaseLabel || '').trim()).filter(Boolean),
    )];
    const phases =
      item.phases?.length && item.phases.some((p) => p.label?.trim())
        ? ensureAnchoredPhases(
            item.phases.map((p) => ({
              percent: p.percent,
              label: p.label || '',
              description: p.description || '',
            })),
          )
        : contractPhaseLabels.length
          ? ensureAnchoredPhases(contractPhaseLabels.map((label) => ({ percent: 50, label, description: '' })))
          : emptyPhaseForm(1);
    setEditPhasesItem(item);
    setEditPhasesForm(phases);
    const labels = workPhaseLabels(phases);
    setSubContracts(item.subcontractors || []);
    setSubDraft(draftFromContracts(item.subcontractors || [], labels));
    setEditPhasesOpen(true);
  }

  function onAddTaskNameChange(taskName: string) {
    const standard = standardLots.find((l) => l.name === taskName);
    setAddTaskForm((prev) => ({
      ...prev,
      taskName,
      percent: '0',
      phases: standard?.phases?.length
        ? ensureAnchoredPhases(
            standard.phases.map((p) => ({
              percent: p.percent,
              label: p.label,
              description: p.description || '',
            })),
          )
        : prev.phases.some((p) => p.label.trim())
          ? ensureAnchoredPhases(prev.phases)
          : emptyPhaseForm(1),
    }));
  }

  async function persistLot(close: boolean) {
    if (!editPhasesItem) return;
    const phases = withFallbackPhaseNames(ensureAnchoredPhases(editPhasesForm));
    const phaseError = validatePhaseForm(phases);
    if (phaseError) {
      await appAlert(phaseError);
      return;
    }
    try {
      await api(`/chantiers/progress/${editPhasesItem.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          phases: phases.map((p) => ({
            percent: p.percent,
            label: p.label.trim(),
            description: p.description?.trim() || undefined,
          })),
        }),
      });
      const labels = workPhaseLabels(phases);
      const updated = await api<TaskSubcontract[]>(`/chantiers/progress/${editPhasesItem.id}/subcontract`, {
        method: 'PUT',
        body: JSON.stringify(subcontractPayload(subDraft, labels)),
      });
      setSubContracts(updated);
      setSubDraft(draftFromContracts(updated, labels));
      if (close) {
        setEditPhasesOpen(false);
        setEditPhasesItem(null);
      }
      load();
      onRefresh();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function saveEditPhases(e: React.FormEvent) {
    e.preventDefault();
    await persistLot(true);
  }

  function openMission() {
    setMissionForm({ enginId: '', mission: '', driverName: '', usage: '' });
    setMissionPickerQuery('');
    setMissionOpen(true);
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
    const invalid = validatePurchaseForm(purchaseForm, t);
    if (invalid) {
      await appAlert(invalid);
      return;
    }
    try {
      await api('/achats/purchases', {
        method: 'POST',
        body: JSON.stringify({ ...purchaseFormToBody(purchaseForm), chantierId, tranche: detail.name }),
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
        <PageBackLink onClick={onBack} className="mt-2" />
      </div>
    );
  }

  if (!detail) {
    return <p className="py-8 text-[12px] text-gic-muted text-center">{t('msg.loadingTranche')}</p>;
  }

  const tabs: { id: TrancheTab; label: string; icon: typeof HardHat; badge?: number }[] = [
    { id: 'avancement', label: t('tabs.progress'), icon: HardHat, badge: detail.tasksCount },
    { id: 'ouvriers', label: t('tabs.workers'), icon: Users, badge: detail.assignments.length || undefined },
    { id: 'pointage', label: t('tabs.attendance'), icon: Clock, badge: detail.workersCount },
    { id: 'engins', label: t('tabs.equipment'), icon: Truck, badge: detail.enginCosts?.byEngin?.length || detail.missionsCount },
    { id: 'materiel', label: t('tabs.materiel'), icon: Package },
    { id: 'achats', label: t('tabs.purchases'), icon: ShoppingCart, badge: detail.purchasesCount },
    { id: 'documents', label: t('tabs.documents'), icon: FileText },
  ];

  return (
    <div className="tranche-detail">
      <div className="tranche-detail-toolbar">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <PageBackLink
            onClick={onBack}
            iconOnly={false}
            className="mac-page-back-labeled"
          />
          {tranches.length > 1 && onSelectTranche && (
            <label className="tranche-switcher" title={t('trancheNav.switchTranche')}>
              <Layers size={13} aria-hidden />
              <select
                value={trancheId}
                onChange={(e) => {
                  if (e.target.value && e.target.value !== trancheId) onSelectTranche(e.target.value);
                }}
                aria-label={t('trancheNav.switchTranche')}
              >
                {tranches.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name} · {tr.percent}%
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
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
            {(detail.estimatedStartDate || detail.estimatedEndDate) && (
              <p className="tranche-detail-remark">
                {t('fields.estimatedPeriod')} :{' '}
                {[
                  detail.estimatedStartDate ? formatDate(detail.estimatedStartDate) : '…',
                  detail.estimatedEndDate ? formatDate(detail.estimatedEndDate) : '…',
                ].join(' → ')}
              </p>
            )}
          </div>
          <span className="tranche-detail-pct">{detail.percent}%</span>
        </div>

        <ProgressSteps percent={detail.percent} size="sm" showLabel={false} />

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
            <span>
              {detail.enginsCost
                ? t('fleet.hints.trancheEnginCost', { amount: formatMad(detail.enginsCost) })
                : t('msg.equipmentCount', { count: detail.missionsCount })}
            </span>
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
            </div>
          </div>

          {detail.progress.length === 0 ? (
            <div className="mac-section-card text-center py-10">
              <HardHat size={28} className="mx-auto text-gic-muted opacity-40 mb-2" />
              <p className="text-[13px] font-medium text-gic-ink">{t('msg.emptyTasksOnTranche')}</p>
              <p className="text-[12px] text-gic-muted mt-1">{t('msg.emptyTasksHint')}</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                <Btn icon={Plus} size="sm" onClick={openAddTask}>{t('actions.addTask')}</Btn>
              </div>
            </div>
          ) : (
            <div className="mac-section-card !py-2">
              {detail.progress.map((p) => {
                const contracts = p.subcontractors || [];
                const whole = contracts.find((item) => item.scope !== 'phase');
                const phaseOnes = contracts.filter((item) => item.scope === 'phase');
                return (
                <div key={p.id} id={`task-${p.id}`} className="mac-task-row items-center">
                  <div className="mac-task-meta !w-[280px]">
                    <p className="mac-task-name truncate flex items-center gap-1.5">
                      <span className="truncate">{p.taskName}</span>
                      {contracts.length > 0 && (
                        <button type="button" className="mac-chip mac-chip-violet shrink-0" onClick={() => openEditPhases(p)}>{t('detail.stBadge')}</button>
                      )}
                    </p>
                    {contracts.length > 0 && (() => {
                      const money = subcontractTotals(contracts);
                      return (
                        <p className="mac-task-sub leading-snug whitespace-normal">
                          {t('detail.stPrice')} {formatMad(money.prix)}
                          {' · '}{t('detail.stAdvanceTotal')} {formatMad(money.avance)}
                          {' · '}{t('detail.stRemaining')} {formatMad(money.reste)}
                        </p>
                      );
                    })()}
                    <p className="mac-task-sub truncate">
                      {whole
                        ? `${t('detail.stWholeTask')} · ${whole.companyName}`
                        : phaseOnes.length
                          ? `${t('detail.stSomePhases')} · ${phaseOnes.map((item) => item.phaseLabel).filter(Boolean).join(', ')}`
                          : p.phases?.length
                            ? t('detail.phasesCount', { count: p.phases.length })
                            : t('detail.noPhasesShort')}
                    </p>
                  </div>
                  <div className={`flex-1 min-w-0${savingProgress === p.id ? ' opacity-60' : ''}`}>
                    <ProgressSteps
                      percent={p.percent}
                      onChange={(pct) => savePercent(p.id, pct)}
                      task={{
                        progressId: p.id,
                        chantierId,
                        taskName: p.taskName,
                        tranche: p.tranche,
                        remark: p.remark,
                        updatedAt: p.updatedAt,
                        phases: p.phases,
                        subcontracts: contracts,
                      }}
                      onTaskUpdated={load}
                    />
                  </div>
                  <MacActionBtn icon={Pencil} tone="orange" title={t('actions.editLotPhases')} onClick={() => openEditPhases(p)} />
                  <MacActionBtn icon={Trash2} tone="red" title={t('actions.deleteTask')} onClick={() => deleteProgress(p.id)} />
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <EntityDocChecklist
          entityType="chantier-tranche"
          entityId={detail.id}
          extra={{ chantierId }}
        />
      )}

      {tab === 'ouvriers' && (
        <ChantierWorkersPanel
          chantierId={chantierId}
          assignments={detail.assignments}
          tranches={[detail.name]}
          fixedTranche={detail.name}
          onChanged={load}
        />
      )}

      {tab === 'engins' && (
        <SiteEnginsPanel
          chantierId={chantierId}
          tranche={detail.name}
          costs={detail.enginCosts}
          onChanged={() => { load(); onRefresh(); }}
          missionsCount={detail.missions.length}
          missions={
        <div className="p-3">
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
          }
        />
      )}

      {tab === 'materiel' && (
        <SiteMaterielPanel chantierId={chantierId} tranche={detail.name} onChanged={() => { load(); onRefresh(); }} />
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
                  <Th mac>{t('purchase.list.payment')}</Th>
                  <Th mac>{t('purchase.list.delivery')}</Th>
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
                    <Td mac>{p.paymentStatus ? <PurchasePaymentPill status={p.paymentStatus} /> : '—'}</Td>
                    <Td mac>{p.deliveryStatus ? <PurchaseDeliveryPill status={p.deliveryStatus} /> : '—'}</Td>
                    <Td mac><PurchaseStatusPill status={p.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}

      {tab === 'pointage' && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[13px] font-medium text-gic-ink">{t('detail.attendanceOnTranche')}</p>
            <div className="flex flex-wrap gap-2">
              <Link to={`/pointage?chantierId=${chantierId}&tranche=${encodeURIComponent(detail.name)}&tab=synthese`}>
                <Btn variant="secondary" icon={Users}>{t('pointageMgmt.byWorkerTab')}</Btn>
              </Link>
              <Link to={`/pointage?chantierId=${chantierId}&tranche=${encodeURIComponent(detail.name)}&tab=gestion`}>
                <Btn icon={Clock}>{t('actions.enterAttendance')}</Btn>
              </Link>
            </div>
          </div>
          {pointageLoading ? (
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

      <Modal open={missionOpen} title={t('detail.missionEquipmentFor', { name: detail.name })} onClose={() => setMissionOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setMissionOpen(false)}>{t('common.cancel')}</Btn><Btn form="tranche-mission-form" type="submit">{t('actions.create')}</Btn></>}
      >
        <form id="tranche-mission-form" onSubmit={createMission} className="grid gap-3">
          <p className="text-[11px] text-gic-muted">{t('detail.trancheLabel')} <strong>{detail.name}</strong></p>
          <EntityPickerPanel
            items={engins.map(enginToPickerItem)}
            selectedId={missionForm.enginId || null}
            onSelect={(enginId) => {
              const driver = engins.find((e) => e.id === enginId)?.driverAssignments?.[0]?.workforce;
              setMissionForm({
                ...missionForm,
                enginId,
                driverName: missionForm.driverName || (driver ? `${driver.firstName} ${driver.lastName}` : ''),
              });
            }}
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

      <Modal open={purchaseOpen} title={t('detail.newPurchaseFor', { name: detail.name })} onClose={() => setPurchaseOpen(false)} size="xl"
        footer={<><Btn variant="secondary" onClick={() => setPurchaseOpen(false)}>{t('common.cancel')}</Btn><Btn form="tranche-purchase-form" type="submit">{t('msg.createPurchase')}</Btn></>}
      >
        <form id="tranche-purchase-form" onSubmit={savePurchase}>
          <PurchaseFormFields
            form={purchaseForm}
            setForm={setPurchaseForm}
            suppliers={suppliers}
            chantiers={[{ id: chantierId, name: chantierName }]}
            families={families}
            lockChantier={chantierId}
            lockedChantierName={chantierName}
            lockTranche={detail.name}
            lockedTrancheName={detail.name}
          />
        </form>
      </Modal>

      <Modal open={addTaskOpen} title={t('actions.addTask')} onClose={() => setAddTaskOpen(false)} size="xl"
        footer={<><Btn variant="secondary" onClick={() => setAddTaskOpen(false)}>{t('common.cancel')}</Btn><Btn form="add-task-form" type="submit">{t('common.add')}</Btn></>}
      >
        <form id="add-task-form" onSubmit={addTask} className="grid gap-3">
          <Input
            label={t('fields.lotTaskRequired')}
            required
            value={addTaskForm.taskName}
            onChange={(e) => onAddTaskNameChange(e.target.value)}
            list="tranche-task-ref-list"
            placeholder={t('fields.selectOrTypeLot')}
          />
          <datalist id="tranche-task-ref-list">
            {(standardLots.length ? standardLots.map((l) => l.name) : taskRef).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <TaskPhaseFields
            phases={addTaskForm.phases}
            onChange={(phases) => {
              setAddTaskForm({ ...addTaskForm, phases });
              const labels = workPhaseLabels(phases);
              setAddSubDraft((prev) => keepPhaseChoices(prev, labels));
            }}
          />
          <TaskSubcontractEditor
            draft={addSubDraft}
            labels={workPhaseLabels(addTaskForm.phases)}
            chantierId={chantierId}
            contracts={[]}
            onChange={setAddSubDraft}
          />
          <p className="text-[10px] text-gic-muted">{t('detail.trancheLabel')} <strong>{detail.name}</strong> · {t('fields.alwaysStartAtZero')}</p>
        </form>
      </Modal>

      <Modal
        open={editPhasesOpen}
        title={editPhasesItem ? t('detail.stEditTitle', { name: editPhasesItem.taskName }) : t('detail.lotPhasesTitle')}
        onClose={() => setEditPhasesOpen(false)}
        size="xl"
        footer={<><Btn variant="secondary" onClick={() => setEditPhasesOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-phases-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="edit-phases-form" onSubmit={saveEditPhases} className="grid gap-4">
          {editPhasesItem && (
            <p className="text-[12px] text-gic-muted">{detail.name}</p>
          )}
          <section className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-gic-muted">{t('detail.stEditStepPhases')}</p>
            <TaskPhaseFields phases={editPhasesForm} onChange={(phases) => {
              setEditPhasesForm(phases);
              setSubDraft((prev) => keepPhaseChoices(prev, workPhaseLabels(phases)));
            }} />
          </section>
          <section className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-gic-muted">{t('detail.stEditStepContract')}</p>
            <TaskSubcontractEditor
              draft={subDraft}
              labels={workPhaseLabels(editPhasesForm)}
              chantierId={chantierId}
              contracts={subContracts}
              onChange={setSubDraft}
              hidePayments
            />
            <div>
              <Btn type="button" variant="secondary" onClick={() => persistLot(false)}>{t('detail.stSaveContract')}</Btn>
            </div>
          </section>
          <section className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-gic-muted">{t('detail.stEditStepAdvances')}</p>
            {subDraft.mode === 'none' && subContracts.length === 0 ? (
              <p className="text-[12px] text-gic-muted">{t('detail.stEditAdvancesHint')}</p>
            ) : subContracts.length === 0 ? (
              <p className="text-[12px] text-gic-muted">{t('detail.stEditAdvancesHint')}</p>
            ) : (
              advanceBlocks(subContracts, workPhaseLabels(editPhasesForm)).map((block) => (
                <div key={block.key} className="rounded-lg border border-black/[0.08] p-3">
                  <p className="text-[12px] font-medium mb-2">{block.title}</p>
                  <PaymentBox
                    contract={block.contract}
                    phaseLabel={block.phaseLabel}
                    onPaid={(updated) => setSubContracts((rows) => rows.map((row) => row.id === updated.id ? updated : row))}
                  />
                </div>
              ))
            )}
          </section>
        </form>
      </Modal>

      <Modal open={editOpen} title={t('detail.trancheInfoTitle')} onClose={() => setEditOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-tranche-form" type="submit" disabled={chantierDateError(editForm.estimatedStartDate, editForm.estimatedEndDate)}>{t('common.save')}</Btn></>}
      >
        <form id="edit-tranche-form" onSubmit={saveTrancheEdit} className="grid gap-3 sm:grid-cols-2">
          <Input className="sm:col-span-2" label={t('fields.nameRequired')} required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <Input
            className="sm:col-span-2"
            label={t('fields.phasesDescription')}
            value={editForm.remark}
            onChange={(e) => setEditForm({ ...editForm, remark: e.target.value })}
            placeholder={t('fields.tranchePhasesPlaceholder')}
          />
          <Input
            label={t('fields.estimatedStartDate')}
            type="date"
            value={editForm.estimatedStartDate}
            onChange={(e) => setEditForm({ ...editForm, estimatedStartDate: e.target.value })}
          />
          <Input
            label={t('fields.estimatedEndDate')}
            type="date"
            min={editForm.estimatedStartDate || undefined}
            value={editForm.estimatedEndDate}
            onChange={(e) => setEditForm({ ...editForm, estimatedEndDate: e.target.value })}
          />
          {chantierDateError(editForm.estimatedStartDate, editForm.estimatedEndDate) && (
            <p className="sm:col-span-2 text-[11px] text-gic-coral">{t('inline.dateOrderError')}</p>
          )}
          <p className="sm:col-span-2 text-[10px] text-gic-muted">{t('msg.trancheRenameHint')}</p>
        </form>
      </Modal>

      <Modal
        open={!!stTask}
        size="lg"
        title={stTask ? `${t('detail.stDetail')} — ${stTask.taskName}` : ''}
        onClose={() => setStTask(null)}
        footer={<Btn variant="secondary" onClick={() => setStTask(null)}>{t('common.close')}</Btn>}
      >
        {stTask && (
          <div className="space-y-3">
            {(stTask.subcontractors || []).length === 0 && <p className="text-[12px] text-gic-muted">{t('detail.stNone')}</p>}
            {advanceBlocks(stTask.subcontractors || [], (stTask.phases || []).map((phase) => phase.label).filter(Boolean)).map((block) => (
              <div key={block.key} className="rounded-lg border border-black/[0.06] p-3">
                <p className="text-[13px] font-medium">
                  <span className="mac-chip mac-chip-violet mr-2">{t('detail.stBadge')}</span>
                  {block.title}
                </p>
                {(() => {
                  const money = subcontractTotals([block.contract]);
                  return (
                    <p className="text-[12px] text-gic-muted mt-1">
                      {t('detail.stPrice')} {formatMad(money.prix)}
                      {' · '}{t('detail.stAdvanceTotal')} {formatMad(money.avance)}
                      {' · '}{t('detail.stRemaining')} {formatMad(money.reste)}
                    </p>
                  );
                })()}
                <div className="mt-2">
                  <PaymentBox
                    contract={block.contract}
                    phaseLabel={block.phaseLabel}
                    onPaid={(updated) => {
                      setStTask((current) => current ? {
                        ...current,
                        subcontractors: (current.subcontractors || []).map((row) => row.id === updated.id ? updated : row),
                      } : current);
                      load();
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
