import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Trash2, Printer, Plus, Users, ShoppingCart,
  HardHat, FileText, ExternalLink, Upload, Camera, Video,
  Clock, FolderOpen, Layers, Building2, Image, Package,
  MapPin, Images, UserMinus, TrendingUp, Truck,
} from 'lucide-react';
import { api, fetchSupplierList, fetchWorkforceList, formatDate, formatMad, uploadDocument, uploadForm, type PaginatedResponse } from '../lib/api';
import { googleMapsSearchUrl } from '../lib/googleMaps';
import { workforceDetailPathForCategory } from '../lib/workforceScope';
import {
  Btn, Card, Input, KpiCard, MacActionBtn, Modal, PageBackLink, Select, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { useI18n } from '../i18n/I18nContext';
import { photoSrc } from '../lib/photoUrl';

import {
  ChantierFormFields, chantierToForm, emptyChantierForm, type ChantierFormData,
  type ProjectOption, type ChefOption,
} from '../components/ChantierFormFields';
import ChantierOverviewPanel, { type ChantierOverview } from '../components/ChantierOverview';
import ChantierDetailNav, { buildChantierNavGroups, type ChantierTab } from '../components/ChantierDetailNav';
import { ChantierStockPanel, ChantierSubcontractorsPanel } from '../components/ChantierExtraPanels';
import {
  ChantierTranchesList, ChantierTrancheView, type TrancheListItem,
} from '../components/ChantierTrancheView';
import { EntityPickerPanel, enginToPickerItem, workforceToPickerItem } from '../components/EntityPickerPanel';
import { PurchaseFormFields, emptyPurchaseForm, type PurchaseFormData } from '../components/PurchaseFormFields';

type Tab = ChantierTab;

export default function ChantierDetailPage() {
  const { t } = useI18n();
  const { id, trancheId: routeTrancheId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedTrancheId = routeTrancheId || searchParams.get('tranche') || '';
  const [chantier, setChantier] = useState<any>(null);
  const [tranches, setTranches] = useState<TrancheListItem[]>([]);
  const [tranchesLoading, setTranchesLoading] = useState(false);
  const [trancheOpen, setTrancheOpen] = useState(false);
  const [trancheForm, setTrancheForm] = useState({ name: '', remark: '' });
  const [history, setHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('vue');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [engins, setEngins] = useState<any[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraForm, setCameraForm] = useState({ name: '', url: '', zone: '' });
  const [previewCamera, setPreviewCamera] = useState<any>(null);
  const [form, setForm] = useState<ChantierFormData>(emptyChantierForm());
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [chefs, setChefs] = useState<ChefOption[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [pointages, setPointages] = useState<any[]>([]);
  const [pointageStats, setPointageStats] = useState<{ total: number; validated: number } | null>(null);
  const [pointageLoading, setPointageLoading] = useState(false);
  const [editCamera, setEditCamera] = useState<any>(null);
  const [docExpiresAt, setDocExpiresAt] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPickerQuery, setAssignPickerQuery] = useState('');
  const [workforce, setWorkforce] = useState<any[]>([]);
  const [assignForm, setAssignForm] = useState({ workforceId: '', functionRole: '', tranche: '' });
  const [assignSelectedIds, setAssignSelectedIds] = useState<string[]>([]);
  const [assignMissionFilter, setAssignMissionFilter] = useState<'all' | 'mission' | 'free'>('all');
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormData>(emptyPurchaseForm());
  const [suppliers, setSuppliers] = useState<{ id: string; reference: string; companyName: string }[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [missionOpen, setMissionOpen] = useState(false);
  const [missionPickerQuery, setMissionPickerQuery] = useState('');
  const [missionForm, setMissionForm] = useState({ enginId: '', mission: '', driverName: '', usage: '', tranche: '' });

  function load() {
    if (!id) return;
    setError('');
    api(`/chantiers/${id}`).then(setChantier).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
    loadTranches();
  }

  function loadTranches() {
    if (!id) return;
    setTranchesLoading(true);
    api<TrancheListItem[]>(`/chantiers/${id}/tranches`)
      .then(setTranches)
      .catch(() => setTranches([]))
      .finally(() => setTranchesLoading(false));
  }

  function openTranche(trancheId: string) {
    if (id) navigate(`/chantiers/${id}/tranches/${trancheId}`);
  }

  function closeTranche() {
    if (!id) return;
    setTab('tranches');
    navigate(`/chantiers/${id}?tab=tranches`);
    loadTranches();
  }

  async function saveTranche(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !trancheForm.name.trim()) return;
    try {
      await api(`/chantiers/${id}/tranches`, {
        method: 'POST',
        body: JSON.stringify(trancheForm),
      });
      setTrancheOpen(false);
      setTrancheForm({ name: '', remark: '' });
      loadTranches();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function loadHistory() {
    if (!id) return;
    api(`/chantiers/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  useEffect(() => {
    load();
    api<{ items: any[] }>('/engins?limit=100').then((r) => setEngins(r.items)).catch(() => {});
    api<PaginatedResponse<ProjectOption>>('/immobilier/projects?limit=100&sort=name&order=asc')
      .then((r) => setProjects(r.items))
      .catch(() => {});
    api<ChefOption[]>('/chantiers/chefs').then(setChefs).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (selectedTrancheId) return;
    const urlTab = searchParams.get('tab') as Tab | null;
    if (urlTab && urlTab !== tab) setTab(urlTab);
  }, [searchParams, selectedTrancheId]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
    if (tab === 'pointage' && id) loadPointages();
    if (tab === 'personnel') fetchWorkforceList().then(setWorkforce).catch(() => {});
    if (tab === 'achats') {
      fetchSupplierList().then(setSuppliers).catch(() => {});
      api('/achats/families').then(setFamilies).catch(() => {});
    }
  }, [tab, id]);

  function openPurchase() {
    if (!id) return;
    setPurchaseForm({ ...emptyPurchaseForm(), chantierId: id });
    setPurchaseOpen(true);
  }

  async function savePurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
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
          chantierId: id,
          tranche: purchaseForm.tranche || null,
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
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openAssign() {
    setAssignForm({ workforceId: '', functionRole: '', tranche: '' });
    setAssignSelectedIds([]);
    setAssignMissionFilter('all');
    setAssignPickerQuery('');
    fetchWorkforceList().then(setWorkforce).catch(() => {});
    setAssignOpen(true);
  }

  function toggleAssignSelect(workforceId: string) {
    setAssignSelectedIds((prev) => (
      prev.includes(workforceId) ? prev.filter((id) => id !== workforceId) : [...prev, workforceId]
    ));
  }

  function openMission() {
    setMissionForm({ enginId: '', mission: '', driverName: '', usage: '', tranche: '' });
    setMissionPickerQuery('');
    setMissionOpen(true);
  }

  async function createMission(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !missionForm.enginId || !missionForm.mission.trim()) return;
    try {
      await api('/engins/missions', {
        method: 'POST',
        body: JSON.stringify({
          enginId: missionForm.enginId,
          mission: missionForm.mission,
          driverName: missionForm.driverName || null,
          usage: missionForm.usage || null,
          chantierId: id,
          tranche: missionForm.tranche || null,
        }),
      });
      setMissionOpen(false);
      setMissionForm({ enginId: '', mission: '', driverName: '', usage: '', tranche: '' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function assignWorker(e: React.FormEvent) {
    e.preventDefault();
    if (!id || assignSelectedIds.length === 0) return;
    const failures: string[] = [];
    for (const workforceId of assignSelectedIds) {
      const worker = workforce.find((w) => w.id === workforceId);
      try {
        await api(`/chantiers/${id}/assign`, {
          method: 'POST',
          body: JSON.stringify({
            workforceId,
            functionRole: assignForm.functionRole || worker?.category || null,
            tranche: assignForm.tranche || null,
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
    setAssignForm({ workforceId: '', functionRole: '', tranche: '' });
    setAssignSelectedIds([]);
    load();
  }

  async function unassignWorker(assignmentId: string) {
    if (!id || !await appConfirm(t('msg.confirmRemoveWorkerFromSite'))) return;
    try {
      await api(`/chantiers/${id}/assign/${assignmentId}`, { method: 'DELETE' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function loadPointages() {
    if (!id) return;
    setPointageLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const qs = new URLSearchParams({ chantierId: id, limit: '30', sort: 'date', order: 'desc' });
    const statsQs = new URLSearchParams({ chantierId: id, dateFrom: today, dateTo: today });
    Promise.all([
      api<PaginatedResponse<any>>(`/chantiers/pointage?${qs}`),
      api<{ total: number; validated: number }>(`/chantiers/pointage/stats?${statsQs}`),
    ])
      .then(([r, st]) => {
        setPointages(r.items);
        setPointageStats({ total: st.total, validated: st.validated });
      })
      .catch(() => {
        setPointages([]);
        setPointageStats(null);
      })
      .finally(() => setPointageLoading(false));
  }

  async function onGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length || !id) return;
    setGalleryUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append('files', f));
      await uploadForm(`/chantiers/${id}/images`, fd);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.uploadError'));
    } finally {
      setGalleryUploading(false);
      e.target.value = '';
    }
  }

  async function deleteGalleryImage(imageId: string) {
    if (!id || !await appConfirm(t('msg.confirmDeleteImage'))) return;
    try {
      await api(`/chantiers/${id}/images/${imageId}`, { method: 'DELETE' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function setCoverImage(imageId: string) {
    if (!id) return;
    try {
      await api(`/chantiers/${id}/images/${imageId}/cover`, { method: 'POST' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openEdit() {
    if (!chantier) return;
    setForm(chantierToForm(chantier));
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/chantiers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name,
          address: form.address || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          managerName: form.managerName || null,
          managerUserId: form.managerUserId || null,
          workerCount: Number(form.workerCount || 0),
          remark: form.remark || null,
          status: form.status,
          projectId: form.projectId || null,
          budgetAchats: form.budgetAchats ? Number(form.budgetAchats) : null,
        }),
      });
      setEditOpen(false);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!deleteMotif.trim()) return;
    try {
      await api(`/chantiers/${id}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      navigate('/chantiers');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function onPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await uploadForm(`/chantiers/${id}/photo`, fd);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.uploadError'));
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  }

  async function onDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setDocUploading(true);
    try {
      await uploadDocument(file, {
        name: file.name,
        category: 'chantier',
        chantierId: id,
        entityType: 'Chantier',
        entityId: id,
        expiresAt: docExpiresAt || '',
      });
      setDocExpiresAt('');
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.uploadError'));
    } finally {
      setDocUploading(false);
      e.target.value = '';
    }
  }

  async function removeDocument(docId: string) {
    if (!await appConfirm(t('msg.confirmDeleteDocument'))) return;
    try {
      await api(`/documents/${docId}`, { method: 'DELETE' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function saveCameraEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !editCamera) return;
    try {
      await api(`/chantiers/${id}/cameras/${editCamera.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editCamera.name,
          url: editCamera.url,
          zone: editCamera.zone,
          isActive: editCamera.isActive,
        }),
      });
      setEditCamera(null);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function addCamera(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    try {
      await api(`/chantiers/${id}/cameras`, { method: 'POST', body: JSON.stringify(cameraForm) });
      setCameraOpen(false);
      setCameraForm({ name: '', url: '', zone: '' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function removeCamera(cameraId: string) {
    if (!id || !await appConfirm(t('msg.confirmDeleteCamera'))) return;
    try {
      await api(`/chantiers/${id}/cameras/${cameraId}`, { method: 'DELETE' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printFiche() {
    if (!chantier) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Chantier ${chantier.name}</title></head><body style="font-family:sans-serif;padding:24px;font-size:12px">
      <h1>Fiche chantier — GIC</h1>
      <h2>${chantier.name}</h2>
      <p><b>Adresse :</b> ${chantier.address || '—'}</p>
      <p><b>Chef :</b> ${chantier.managerName || '—'}</p>
      <p><b>Avancement :</b> ${Math.round(chantier.progressPct || 0)}%</p>
      <p><b>Statut :</b> ${chantier.status}</p>
      <p><b>Personnel :</b> ${(chantier.assignments || []).length} affectés</p>
      <p><b>Achats :</b> ${(chantier.purchases || []).length}</p>
    </body></html>`);
    w.document.close();
    w.print();
  }

  const navGroups = buildChantierNavGroups(t, {
    tranches: tranches.length,
    galerie: chantier?.images?.length ?? 0,
    personnel: chantier?.assignments?.length ?? 0,
    engins: chantier?.missions?.length ?? 0,
    achats: chantier?.purchases?.length ?? 0,
    documents: chantier?.documents?.length ?? 0,
    cameras: chantier?.cameras?.length ?? 0,
  });

  const linkedProject = chantier?.project;

  if (!chantier && !error) {
    return <p className="text-[12px] text-gic-muted p-6 text-center">{t('msg.loadingSite')}</p>;
  }

  if (error && !chantier) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/chantiers" className="mt-2" />
      </Card>
    );
  }

  const purchases = chantier.purchases || [];
  const assignments = chantier.assignments || [];
  const documents = chantier.documents || [];
  const cameras = chantier.cameras || [];
  const purchaseTotal = purchases.reduce((s: number, p: any) => s + Number(p.totalPrice || 0), 0);
  const recentPurchases = purchases.slice(0, 5).map((p: any) => ({
    id: p.id,
    reference: p.reference,
    designation: p.designation,
    totalPrice: p.totalPrice,
    status: p.status,
    date: p.date,
  }));
  const overview = chantier.overview as ChantierOverview | undefined;
  const progressPct = Math.round(chantier.progressPct || 0);
  const initials = chantier.name.split(/\s+/).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  const alertCount = overview?.synthèse?.alertes ?? 0;
  const budgetAchats = chantier.budgetAchats;
  const missions = chantier.missions || [];
  const images = chantier.images || [];
  const mapsUrl = chantier.address ? googleMapsSearchUrl(chantier.address) : '';
  const budgetDelta = budgetAchats
    ? `${formatMad(purchaseTotal)} / ${formatMad(budgetAchats)}`
    : formatMad(purchaseTotal);

  return (
    <div className="space-y-0">
      {!selectedTrancheId && (
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/chantiers" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            {chantier.photo ? (
              <img
                src={photoSrc(chantier.photo)}
                alt={chantier.name}
                className="h-full w-full object-cover rounded-2xl"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                  const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
                  if (fb) fb.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="mac-detail-photo-fallback !bg-gradient-to-b from-[#ffb340] to-[#ff9500]"
              style={chantier.photo ? { display: 'none' } : undefined}
            >
              {initials.slice(0, 2)}
            </div>
            <label className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-gray-900 text-white flex items-center justify-center cursor-pointer shadow-md">
              <Image size={12} />
              <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" onChange={onPhotoUpload} disabled={photoUploading} />
            </label>
            <div className="absolute -bottom-1 -left-1">
              <ProgressRing percent={progressPct} />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.siteConstruction')}</p>
            <h1 className="mac-detail-name truncate">{chantier.name}</h1>
            <p className="mac-detail-meta">
              {chantier.address || t('msg.noAddress')}
              {chantier.startDate ? t('msg.startedOn', { date: formatDate(chantier.startDate) }) : ''}
            </p>
            <p className="mac-detail-meta mt-1">
              {t('msg.chefLabel')} <span className="text-gic-ink font-medium">{chantier.managerName || '—'}</span>
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <StatusPill status={chantier.status === 'actif' ? 'en_cours' : chantier.status} quiet />
              {linkedProject && (
                <Link to={`/projets/${linkedProject.id}`} className="mac-chip !gap-1 hover:opacity-90 !bg-[rgba(88,86,214,0.12)] !text-[#5856d6]">
                  <Building2 size={11} /> {linkedProject.name}
                </Link>
              )}
              {alertCount > 0 && (
                <button
                  type="button"
                  className="mac-chip mac-chip-orange cursor-pointer hover:opacity-90"
                  onClick={() => setTab('vue')}
                >
                  {t('msg.alertCount', { count: alertCount })}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          <Btn icon={Plus} onClick={() => { setTrancheForm({ name: '', remark: '' }); setTrancheOpen(true); }}>{t('actions.newTranche')}</Btn>
          <div className="relative">
            <Btn variant="secondary" onClick={() => setActionsOpen((o) => !o)}>{t('common.actions')}</Btn>
            {actionsOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 min-w-[180px] rounded-xl bg-white border border-[#d2d2d7] shadow-lg py-1">
                <ActionItem label={t('actions.assignWorker')} onClick={() => { openAssign(); setActionsOpen(false); }} />
                <ActionItem label={t('actions.addCamera')} onClick={() => { setCameraOpen(true); setActionsOpen(false); }} />
                <Link to={`/pointage?chantierId=${id}`} className="block px-3 py-2 text-[12px] hover:bg-black/[0.03]" onClick={() => setActionsOpen(false)}>
                  {t('tabs.attendance')}
                </Link>
                <Link to={`/avancement?chantierId=${id}`} className="block px-3 py-2 text-[12px] hover:bg-black/[0.03]" onClick={() => setActionsOpen(false)}>
                  {t('columns.progress')}
                </Link>
                <ActionItem label={t('tabs.documents')} onClick={() => { setTab('documents'); setActionsOpen(false); }} />
              </div>
            )}
          </div>
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printFiche} />
            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteOpen(true); setDeleteMotif(''); }} />
          </div>
        </div>
      </div>
      )}

      {!selectedTrancheId && tab !== 'vue' && (
        <div className="mac-kpi-grid mac-kpi-grid-4 mb-4">
          <KpiCard title={t('tabs.tranches')} value={tranches.length} icon={Layers} tone="violet" />
          <KpiCard title={t('columns.progress')} value={`${progressPct} %`} icon={HardHat} tone="emerald" />
          <KpiCard title={t('fields.budgetPurchases')} value={budgetDelta} icon={ShoppingCart} tone="amber" compact />
          <KpiCard title={t('tabs.workers')} value={assignments.length} icon={Users} tone="coral" delta={t('msg.equipmentCount', { count: missions.length })} deltaTone="muted" />
        </div>
      )}

      {selectedTrancheId && id ? (
        <ChantierTrancheView
          chantierId={id}
          trancheId={selectedTrancheId}
          chantierName={chantier.name}
          engins={engins}
          onBack={closeTranche}
          onRefresh={load}
        />
      ) : (
        <div className="chantier-detail-shell">
          <ChantierDetailNav active={tab} onChange={setTab} groups={navGroups} />
          <div className="chantier-detail-panel">
        {tab === 'tranches' && id && (
          <ChantierTranchesList
            chantierId={id}
            chantierName={chantier.name}
            tranches={tranches}
            loading={tranchesLoading}
            onSelect={openTranche}
            onAdd={() => { setTrancheForm({ name: '', remark: '' }); setTrancheOpen(true); }}
          />
        )}

        {tab === 'infos' && (
          <div className="mt-2 grid sm:grid-cols-2 gap-4 text-[12px]">
            <div>
              <p className="text-[10px] text-gic-muted uppercase">{t('common.status')}</p>
              <StatusPill status={chantier.status === 'actif' ? 'en_cours' : chantier.status} quiet />
            </div>
            <div>
              <p className="text-[10px] text-gic-muted uppercase">{t('columns.progress')}</p>
              <p className="font-medium">{progressPct} %</p>
            </div>
            <div>
              <p className="text-[10px] text-gic-muted uppercase">{t('fields.startDate')}</p>
              <p className="font-medium">{chantier.startDate ? formatDate(chantier.startDate) : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-gic-muted uppercase">{t('fields.endDatePlanned')}</p>
              <p className="font-medium">{chantier.endDate ? formatDate(chantier.endDate) : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-gic-muted uppercase">{t('fields.siteManagerName')}</p>
              <p className="font-medium">{chantier.managerName || '—'}</p>
              {chantier.managerUser && (
                <p className="text-[11px] text-gic-muted">{chantier.managerUser.email}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-gic-muted uppercase">{t('kpi.declaredStaff')}</p>
              <p className="font-medium">{t('msg.workerCountDeclared', { count: chantier.workerCount })}</p>
            </div>
            <div>
              <p className="text-[10px] text-gic-muted uppercase">{t('fields.budgetPurchases')}</p>
              <p className="font-medium">{budgetAchats ? formatMad(budgetAchats) : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-gic-muted uppercase">{t('detail.purchaseSpend')}</p>
              <p className="font-medium">{formatMad(purchaseTotal)}</p>
            </div>
            {linkedProject && (
              <div className="sm:col-span-2">
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.linkedRealEstateProject')}</p>
                <Link to={`/projets/${linkedProject.id}`} className="font-medium text-[#5856d6] hover:underline inline-flex items-center gap-1">
                  {linkedProject.name} <ExternalLink size={11} />
                </Link>
              </div>
            )}
            <div className="sm:col-span-2">
              <p className="text-[10px] text-gic-muted uppercase">{t('fields.address')}</p>
              <p className="font-medium">{chantier.address || '—'}</p>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-[11px] text-[#007aff] hover:underline inline-flex items-center gap-1 mt-1">
                  <MapPin size={12} /> {t('fields.openInMaps')} <ExternalLink size={10} />
                </a>
              )}
            </div>
            <div className="sm:col-span-2">
              <p className="text-[10px] text-gic-muted uppercase">{t('fields.remark')}</p>
              <p className="text-gic-muted">{chantier.remark || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-gic-muted uppercase">{t('fields.createdAt')}</p>
              <p>{formatDate(chantier.createdAt)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gic-muted uppercase">{t('fields.updatedAt')}</p>
              <p>{formatDate(chantier.updatedAt)}</p>
            </div>
          </div>
        )}

        {tab === 'galerie' && (
          <div className="mt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <p className="text-[12px] text-gic-muted flex items-center gap-1.5">
                <Images size={14} /> {t('msg.sitePhotoCount', { count: images.length })}
              </p>
              <label className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium bg-white border border-gic-border cursor-pointer hover:bg-gray-50">
                <Upload size={14} />
                {galleryUploading ? t('auth.sending') : t('actions.addImages')}
                <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" multiple onChange={onGalleryUpload} disabled={galleryUploading} />
              </label>
            </div>
            {images.length === 0 ? (
              <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptySitePhotos')}</p>
            ) : (
              <div className="mac-project-gallery">
                {images.map((img: { id: string; path: string }) => (
                  <div key={img.id} className={`mac-project-gallery-item${chantier.photo === img.path ? ' mac-project-gallery-cover' : ''}`}>
                    <img src={img.path} alt="" />
                    <div className="mac-project-gallery-actions">
                      {chantier.photo !== img.path && (
                        <button type="button" className="mac-project-gallery-btn" onClick={() => setCoverImage(img.id)} title={t('common.view')}>
                          <Image size={12} />
                        </button>
                      )}
                      <button type="button" className="mac-project-gallery-btn mac-project-gallery-btn-danger" onClick={() => deleteGalleryImage(img.id)} title={t('common.delete')}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {chantier.photo === img.path && <span className="mac-project-gallery-badge">{t('fields.cover')}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'personnel' && (
          <Card padding={false} className="mt-2 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gic-border/80 bg-[#fafafa]">
              <div>
                <p className="text-[13px] font-medium text-gic-ink tracking-tight inline-flex items-center gap-1.5">
                  <Users size={15} /> {t('msg.workersAssignedTitle')}
                </p>
                <p className="text-[11px] text-gic-muted mt-0.5">
                  {t('msg.workersOnSiteCount', { count: assignments.length })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Btn icon={Plus} size="sm" onClick={openAssign}>{t('actions.assignWorker')}</Btn>
              </div>
            </div>
            {assignments.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[12px] text-gic-muted">{t('msg.emptyWorkerOnSite')}</p>
                <Btn icon={Plus} className="mt-3" size="sm" onClick={openAssign}>{t('actions.assignWorker')}</Btn>
              </div>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.worker')}</Th>
                    <Th mac>{t('columns.category')}</Th>
                    <Th mac>{t('columns.function')}</Th>
                    <Th mac>{t('columns.tranche')}</Th>
                    <Th mac>{t('fields.declared')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a: any) => (
                    <tr key={a.id}>
                      <Td mac>
                        <Link to={workforceDetailPathForCategory(a.workforce?.category, a.workforce?.id || '')} className="mac-table-ref">
                          {a.workforce?.firstName} {a.workforce?.lastName}
                        </Link>
                      </Td>
                      <Td mac className="mac-table-muted">{a.workforce?.category || '—'}</Td>
                      <Td mac>{a.functionRole || '—'}</Td>
                      <Td mac className="mac-table-muted">{a.tranche || '—'}</Td>
                      <Td mac>
                        {a.workforce?.declared ? (
                          <span className="mac-chip mac-chip-blue">CNSS</span>
                        ) : (
                          <span className="text-gic-muted">{t('common.no')}</span>
                        )}
                      </Td>
                      <Td mac className="mac-td-actions">
                        <MacActionBtn
                          icon={UserMinus}
                          tone="red"
                          title={t('common.remove')}
                          onClick={() => unassignWorker(a.id)}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        )}

        {tab === 'engins' && (
          <Card padding={false} className="mt-2 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gic-border/80 bg-[#fafafa]">
              <div>
                <p className="text-[13px] font-medium text-gic-ink tracking-tight inline-flex items-center gap-1.5">
                  <Truck size={15} /> {t('msg.equipmentMissionsTitle')}
                </p>
                <p className="text-[11px] text-gic-muted mt-0.5">
                  {t('msg.missionsOnSiteCount', { count: missions.length })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Btn icon={Plus} size="sm" onClick={openMission}>{t('actions.newMission')}</Btn>
                <Link to="/engins"><Btn variant="secondary" size="sm">{t('pages.equipment')}</Btn></Link>
              </div>
            </div>
            {missions.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[12px] text-gic-muted">{t('msg.emptyMissionsOnSite')}</p>
                <Btn icon={Plus} className="mt-3" size="sm" onClick={openMission}>{t('actions.newMission')}</Btn>
              </div>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.engin')}</Th>
                    <Th mac>{t('columns.mission')}</Th>
                    <Th mac>{t('columns.tranche')}</Th>
                    <Th mac>{t('columns.chauffeur')}</Th>
                    <Th mac>{t('columns.date')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {missions.map((m: any) => (
                    <tr key={m.id}>
                      <Td mac>
                        {m.engin ? (
                          <Link to={`/engins/${m.engin.id}`} className="mac-table-ref">
                            {m.engin.brand} — {m.engin.matricule}
                          </Link>
                        ) : '—'}
                      </Td>
                      <Td mac>{m.mission || '—'}</Td>
                      <Td mac className="mac-table-muted">{m.tranche || '—'}</Td>
                      <Td mac className="mac-table-muted">{m.driverName || '—'}</Td>
                      <Td mac className="mac-table-muted">{m.date ? formatDate(m.date) : formatDate(m.createdAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        )}

        {tab === 'pointage' && (
          <div className="mt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <p className="text-[13px] font-medium text-gic-ink tracking-tight inline-flex items-center gap-1.5">
                  <Clock size={15} /> {t('msg.recentAttendances')}
                </p>
                {pointageStats && (
                  <p className="text-[11px] text-gic-muted mt-0.5">
                    {t('msg.todayAttendanceStats', { total: pointageStats.total, validated: pointageStats.validated })}
                  </p>
                )}
              </div>
              <Link to={`/pointage?chantierId=${id}`}>
                <Btn icon={Clock}>{t('actions.enterAttendance')}</Btn>
              </Link>
            </div>
            {pointageLoading ? (
              <p className="py-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
            ) : pointages.length === 0 ? (
              <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyAttendanceOnSite')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('columns.worker')}</Th>
                    <Th mac>{t('columns.workDays')}</Th>
                    <Th mac>{t('columns.advance')}</Th>
                    <Th mac>{t('columns.bonus')}</Th>
                    <Th mac>{t('columns.validated')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {pointages.map((p: any) => (
                    <tr key={p.id}>
                      <Td mac className="text-[11px]">{formatDate(p.date)}</Td>
                      <Td mac>
                        {p.workforce ? (
                          <Link to={workforceDetailPathForCategory(p.workforce.category, p.workforce.id)} className="mac-table-ref">
                            {p.workforce.firstName} {p.workforce.lastName}
                          </Link>
                        ) : '—'}
                      </Td>
                      <Td mac>{Number(p.totalDay || 0).toFixed(2)}</Td>
                      <Td mac className="text-gic-coral">{formatMad(p.advance)}</Td>
                      <Td mac>{formatMad(p.bonus)}</Td>
                      <Td mac>
                        {p.validated ? (
                          <span className="mac-chip mac-chip-emerald">{t('common.yes')}</span>
                        ) : (
                          <span className="mac-chip">{t('status.pending')}</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}

        {tab === 'vue' && overview && (
          <ChantierOverviewPanel
            overview={overview}
            chantierId={id!}
            chantierName={chantier.name}
            tranchesCount={tranches.length}
            recentPurchases={recentPurchases}
            onGoTranches={() => setTab('tranches')}
            onGoAchats={() => setTab('achats')}
          />
        )}

        {tab === 'vue' && !overview && (
          <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.loadingOverview')}</p>
        )}

        {tab === 'achats' && (
          <div className="mt-2">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <p className="text-[13px] font-medium text-gic-ink tracking-tight">
                  {t('msg.allPurchasesOnSite', { amount: formatMad(purchaseTotal) })}
                </p>
                <p className="text-[11px] text-gic-muted mt-0.5">
                  {t('msg.purchasesAttachedToSite', { count: purchases.length })}
                </p>
              </div>
              <Btn icon={Plus} onClick={openPurchase}>{t('actions.addPurchase')}</Btn>
            </div>
            {purchases.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-[12px] text-gic-muted">{t('msg.emptyPurchases')}</p>
                <Btn icon={Plus} className="mt-3" onClick={openPurchase}>{t('actions.addPurchase')}</Btn>
              </div>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.ref')}</Th>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('columns.designation')}</Th>
                    <Th mac>{t('columns.supplier')}</Th>
                    <Th mac>{t('columns.tranche')}</Th>
                    <Th mac>{t('columns.amount')}</Th>
                    <Th mac>{t('columns.status')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p: any) => (
                    <tr key={p.id}>
                      <Td mac><Link to={`/achats/${p.id}`} className="mac-table-ref">{p.reference}</Link></Td>
                      <Td mac className="mac-table-muted">{formatDate(p.date)}</Td>
                      <Td mac>{p.designation}</Td>
                      <Td mac className="mac-table-muted">
                        {p.supplier ? (
                          <Link to={`/fournisseurs/${p.supplier.id}`} className="hover:text-[#007aff]">{p.supplier.companyName}</Link>
                        ) : '—'}
                      </Td>
                      <Td mac className="mac-table-muted">{p.tranche || '—'}</Td>
                      <Td mac>{formatMad(p.totalPrice)}</Td>
                      <Td mac><StatusPill status={p.status} quiet /></Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}

        {tab === 'stock' && id && (
          <ChantierStockPanel chantierId={id} tranches={tranches.map((t) => t.name)} />
        )}

        {tab === 'subcontractors' && id && (
          <ChantierSubcontractorsPanel chantierId={id} />
        )}

        {tab === 'documents' && (
          <div className="mt-2 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-[13px] font-medium text-gic-ink tracking-tight">{t('msg.siteDocumentsTitle')}</p>
              <div className="flex flex-wrap items-end gap-2">
                <Input label={t('fields.expiresOptional')} type="date" value={docExpiresAt} onChange={(e) => setDocExpiresAt(e.target.value)} className="!mb-0 w-40" />
                <label className="mac-upload-btn">
                  <Upload size={14} />
                  {docUploading ? t('auth.sending') : t('actions.deposit')}
                  <input type="file" className="hidden" onChange={onDocUpload} disabled={docUploading} />
                </label>
              </div>
            </div>
            {documents.length === 0 ? (
              <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyDocuments')}</p>
            ) : (
              <div className="mac-section-card !p-0 overflow-hidden">
                {documents.map((d: any) => (
                  <div key={d.id} className="mac-row">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={14} className="text-[#007aff] shrink-0" />
                      <div className="min-w-0">
                        <p className="mac-row-title truncate">{d.name}</p>
                        <p className="mac-row-subtitle">
                          {formatDate(d.createdAt)}
                          {d.expiresAt ? t('msg.expiresOn', { date: formatDate(d.expiresAt) }) : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a href={d.path} target="_blank" rel="noreferrer" className="mac-table-action inline-flex items-center gap-1">
                        {t('actions.open')} <ExternalLink size={11} />
                      </a>
                      <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => removeDocument(d.id)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'cameras' && (
          <div className="mt-2">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-[13px] font-medium text-gic-ink tracking-tight inline-flex items-center gap-1.5">
                <Video size={15} className="text-[#007aff]" /> {t('msg.surveillance')}
              </p>
              <Btn icon={Plus} onClick={() => setCameraOpen(true)}>{t('actions.addCamera')}</Btn>
            </div>
            {cameras.length === 0 ? (
              <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyCameras')}</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {cameras.map((cam: any) => (
                  <div key={cam.id} className={`mac-task-card !p-0 overflow-hidden${!cam.isActive ? ' opacity-60' : ''}`}>
                    <button
                      type="button"
                      className="w-full aspect-video bg-[#f5f5f7] relative group"
                      onClick={() => setPreviewCamera(cam)}
                    >
                      {/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(cam.url) || cam.url.includes('unsplash') ? (
                        <img src={cam.url} alt={cam.name} className="w-full h-full object-cover" />
                      ) : cam.url.includes('youtube.com') || cam.url.includes('youtu.be') ? (
                        <div className="w-full h-full flex items-center justify-center bg-[#1d1d1f] text-white text-[11px]">{t('msg.videoStream')}</div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gic-muted">
                          <Camera size={24} className="opacity-40" />
                        </div>
                      )}
                    </button>
                    <div className="p-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="mac-info-value truncate">{cam.name}</p>
                        <p className="mac-info-label !mb-0">{cam.zone || '—'}</p>
                        {!cam.isActive && <span className="mac-chip text-[10px] !py-0.5 mt-1">{t('status.inactive')}</span>}
                      </div>
                      <div className="mac-action-group shrink-0">
                        <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => setEditCamera({ ...cam })} />
                        <MacActionBtn icon={ExternalLink} tone="blue" title={t('actions.open')} onClick={() => window.open(cam.url, '_blank')} />
                        <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => removeCamera(cam.id)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'historique' && (
          history.length === 0 ? (
            <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyHistory')}</p>
          ) : (
            <div className="mac-section-card !p-0 overflow-hidden mt-2">
              {history.map((h) => (
                <div key={h.id} className="mac-row">
                  <div className="min-w-0">
                    <p className="mac-row-title capitalize">{h.action}</p>
                    {h.details && <p className="mac-row-subtitle">{h.details}</p>}
                  </div>
                  <div className="mac-row-meta shrink-0 text-right">
                    <p className="mac-row-meta-value">{formatDate(h.createdAt)}</p>
                    <p className="mac-row-subtitle !mt-0">
                      {h.user ? `${h.user.firstName} ${h.user.lastName}` : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
          </div>
        </div>
      )}

      <Modal open={trancheOpen} title={t('actions.newTranche')} onClose={() => setTrancheOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setTrancheOpen(false)}>{t('common.cancel')}</Btn><Btn form="tranche-form" type="submit">{t('actions.create')}</Btn></>}
      >
        <form id="tranche-form" onSubmit={saveTranche} className="grid gap-3">
          <Input label={t('fields.nameRequired')} required value={trancheForm.name} onChange={(e) => setTrancheForm({ ...trancheForm, name: e.target.value })} placeholder={t('msg.trancheNamePlaceholder')} />
          <Input
            label={t('fields.phasesDescription')}
            value={trancheForm.remark}
            onChange={(e) => setTrancheForm({ ...trancheForm, remark: e.target.value })}
            placeholder={t('fields.tranchePhasesPlaceholder')}
          />
        </form>
      </Modal>

      <Modal open={editOpen} size="lg" title={t('actions.editSite')} onClose={() => setEditOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-chantier-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="edit-chantier-form" onSubmit={save}>
          <ChantierFormFields form={form} setForm={setForm} projects={projects} chefs={chefs} />
        </form>
      </Modal>

      <Modal open={!!editCamera} title={t('actions.editCamera')} onClose={() => setEditCamera(null)}
        footer={<><Btn variant="secondary" onClick={() => setEditCamera(null)}>{t('common.cancel')}</Btn><Btn form="edit-camera-form" type="submit">{t('common.save')}</Btn></>}
      >
        {editCamera && (
          <form id="edit-camera-form" onSubmit={saveCameraEdit} className="grid gap-3">
            <Input label={t('fields.name')} required value={editCamera.name} onChange={(e) => setEditCamera({ ...editCamera, name: e.target.value })} />
            <Input label={t('fields.url')} required value={editCamera.url} onChange={(e) => setEditCamera({ ...editCamera, url: e.target.value })} />
            <Input label={t('fields.zone')} value={editCamera.zone || ''} onChange={(e) => setEditCamera({ ...editCamera, zone: e.target.value })} />
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={editCamera.isActive} onChange={(e) => setEditCamera({ ...editCamera, isActive: e.target.checked })} />
              {t('msg.cameraActive')}
            </label>
          </form>
        )}
      </Modal>

      <Modal open={cameraOpen} title={t('actions.addCamera')} onClose={() => setCameraOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setCameraOpen(false)}>{t('common.cancel')}</Btn><Btn form="camera-form" type="submit">{t('common.add')}</Btn></>}
      >
        <form id="camera-form" onSubmit={addCamera} className="grid gap-3">
          <Input label={t('fields.nameRequired')} required value={cameraForm.name} onChange={(e) => setCameraForm({ ...cameraForm, name: e.target.value })} placeholder={t('msg.mainEntrancePlaceholder')} />
          <Input label={t('fields.streamUrlRequired')} required value={cameraForm.url} onChange={(e) => setCameraForm({ ...cameraForm, url: e.target.value })} placeholder={t('msg.streamUrlPlaceholder')} />
          <Input label={t('fields.zone')} value={cameraForm.zone} onChange={(e) => setCameraForm({ ...cameraForm, zone: e.target.value })} placeholder={t('msg.zonePlaceholder')} />
          <p className="text-[10px] text-gic-muted">{t('msg.cameraCompatHint')}</p>
        </form>
      </Modal>

      <Modal open={!!previewCamera} title={previewCamera?.name || t('msg.cameraFallback')} onClose={() => setPreviewCamera(null)} size="lg"
        footer={<Btn variant="secondary" onClick={() => setPreviewCamera(null)}>{t('common.close')}</Btn>}
      >
        {previewCamera && (
          <div className="space-y-2">
            {previewCamera.zone && <p className="text-[11px] text-gic-muted">{t('msg.zoneColon', { zone: previewCamera.zone })}</p>}
            {/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(previewCamera.url) || previewCamera.url.includes('unsplash') ? (
              <img src={previewCamera.url} alt={previewCamera.name} className="w-full rounded-xl border border-gic-border" />
            ) : previewCamera.url.includes('youtube.com/embed') ? (
              <iframe title={previewCamera.name} src={previewCamera.url} className="w-full aspect-video rounded-xl border border-gic-border" allowFullScreen />
            ) : (
              <div className="rounded-xl bg-gray-50 p-6 text-center text-[12px] text-gic-muted">
                <p>{t('msg.openExternalStream')}</p>
                <a href={previewCamera.url} target="_blank" rel="noreferrer" className="text-gic-violet hover:underline mt-2 inline-block">{previewCamera.url}</a>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={assignOpen} title={t('actions.assignWorkers')} onClose={() => setAssignOpen(false)} size="lg"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setAssignOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="chantier-assign-form" type="submit" disabled={assignSelectedIds.length === 0}>
              {assignSelectedIds.length > 0
                ? t('actions.assignWithCount', { count: assignSelectedIds.length })
                : t('common.assign')}
            </Btn>
          </>
        }
      >
        <form id="chantier-assign-form" onSubmit={assignWorker} className="grid gap-3">
          <EntityPickerPanel
            items={workforce.filter((w) => w.isActive).map(workforceToPickerItem)}
            excludeIds={assignments.map((a: any) => a.workforce?.id).filter(Boolean)}
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
            ariaLabel={t('msg.ariaSelectWorkers')}
          />
          <Select label={t('fields.trancheOptional')} value={assignForm.tranche} onChange={(e) => setAssignForm({ ...assignForm, tranche: e.target.value })}>
            <option value="">{t('msg.wholeSite')}</option>
            {tranches.map((trancheRow) => (
              <option key={trancheRow.id} value={trancheRow.name}>{trancheRow.name}</option>
            ))}
          </Select>
          <Input
            label={t('fields.functionAppliedAll')}
            value={assignForm.functionRole}
            onChange={(e) => setAssignForm({ ...assignForm, functionRole: e.target.value })}
            placeholder={t('fields.functionOnTranchePlaceholder')}
          />
        </form>
      </Modal>

      <Modal open={missionOpen} title={`${t('actions.newMission')} — ${chantier?.name || t('msg.siteFallback')}`} onClose={() => setMissionOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setMissionOpen(false)}>{t('common.cancel')}</Btn><Btn form="chantier-mission-form" type="submit">{t('actions.create')}</Btn></>}
      >
        <form id="chantier-mission-form" onSubmit={createMission} className="grid gap-3">
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
            ariaLabel={t('msg.ariaSelectEngin')}
          />
          <Select label={t('fields.trancheOptional')} value={missionForm.tranche} onChange={(e) => setMissionForm({ ...missionForm, tranche: e.target.value })}>
            <option value="">{t('msg.wholeSite')}</option>
            {tranches.map((trancheRow) => (
              <option key={trancheRow.id} value={trancheRow.name}>{trancheRow.name}</option>
            ))}
          </Select>
          <Input label={t('fields.missionRequiredStar')} required value={missionForm.mission} onChange={(e) => setMissionForm({ ...missionForm, mission: e.target.value })} />
          <Input label={t('fields.chauffeur')} value={missionForm.driverName} onChange={(e) => setMissionForm({ ...missionForm, driverName: e.target.value })} />
          <Input label={t('fields.usage')} value={missionForm.usage} onChange={(e) => setMissionForm({ ...missionForm, usage: e.target.value })} />
        </form>
      </Modal>

      <Modal
        open={purchaseOpen}
        title={t('detail.newPurchaseFor', { name: chantier?.name || t('msg.siteFallback') })}
        onClose={() => setPurchaseOpen(false)}
        size="lg"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPurchaseOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="chantier-purchase-form" type="submit">{t('actions.create')}</Btn>
          </>
        }
      >
        <form id="chantier-purchase-form" onSubmit={savePurchase}>
          <PurchaseFormFields
            form={purchaseForm}
            setForm={setPurchaseForm}
            suppliers={suppliers}
            chantiers={chantier ? [{ id: chantier.id, name: chantier.name }] : []}
            families={families}
            tranches={tranches.map((t) => ({ id: t.id, name: t.name }))}
            lockChantier={id}
            lockedChantierName={chantier?.name}
          />
        </form>
      </Modal>

      <Modal open={deleteOpen} title={t('actions.deleteSite')} onClose={() => setDeleteOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn></>}
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.siteDeleteBlockedFull')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.motifPlaceholder')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <svg className="h-10 w-10" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={r} fill="white" stroke="#e5e7eb" strokeWidth="3" />
      <circle
        cx="22" cy="22" r={r} fill="none" stroke="#007aff" strokeWidth="3"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="25" textAnchor="middle" fill="#007aff" fontSize="8" fontWeight="700">{percent}%</text>
    </svg>
  );
}

function ActionItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="w-full text-left px-3 py-2 text-[12px] hover:bg-black/[0.03]" onClick={onClick}>
      {label}
    </button>
  );
}
