import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Building2, Pencil, Trash2, Printer, Home, Layers, History,
  TrendingUp, KeyRound, FileText, ExternalLink, Upload, MapPin, Image, HardHat, Camera,
  Images, LayoutGrid, PanelTop, Info, MessageCircle,
} from 'lucide-react';
import { api, formatDate, formatMad, uploadForm, uploadDocument } from '../lib/api';
import { googleMapsSearchUrl, projectLocationQuery } from '../lib/googleMaps';
import { Btn, PageBackLink, Card, Input, KpiCard, MacActionBtn, Modal, StatusPill, TableWrap, Td, Th } from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';
import { photoSrc } from '../lib/photoUrl';

import {
  ProjectFormFields, emptyProjectForm, projectToForm, projectFormToBody,
  projectOwnershipLabel, clientOptionLabel, type ProjectFormData,
} from '../components/ProjectFormFields';
import {
  BienFormFields, emptyBienForm, bienToForm, flattenProjectFloors,
  type BienFormData, type FloorOption,
} from '../components/BienFormFields';
import { ChantierFormFields, emptyChantierForm, type ChantierFormData, type ChefOption } from '../components/ChantierFormFields';
import ConversationsPanel from '../components/ConversationsPanel';

type Tab = 'infos' | 'galerie' | 'structure' | 'biens' | 'chantiers' | 'ventes' | 'locations' | 'documents' | 'echanges' | 'historique';

export default function ProjectDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [rentals, setRentals] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [docUploading, setDocUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ type: string; parentId?: string; editId?: string; editName?: string } | null>(null);
  const [name, setName] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<ProjectFormData>(emptyProjectForm());
  const [bienOpen, setBienOpen] = useState(false);
  const [editBienId, setEditBienId] = useState<string | null>(null);
  const [bienForm, setBienForm] = useState<BienFormData>(emptyBienForm());
  const [bienError, setBienError] = useState('');
  const [bienFloors, setBienFloors] = useState<FloorOption[]>([]);
  const [bienFloorLock, setBienFloorLock] = useState<{ id: string; label: string } | null>(null);
  const [chantierOpen, setChantierOpen] = useState(false);
  const [chantierForm, setChantierForm] = useState<ChantierFormData>(emptyChantierForm());
  const [chefs, setChefs] = useState<ChefOption[]>([]);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleDetail, setSaleDetail] = useState<any>(null);
  const [saleDetailLoading, setSaleDetailLoading] = useState(false);
  const [rentalModalOpen, setRentalModalOpen] = useState(false);
  const [rentalDetail, setRentalDetail] = useState<any>(null);
  const [rentalDetailLoading, setRentalDetailLoading] = useState(false);

  function load() {
    if (!id) return;
    setError('');
    api(`/immobilier/projects/${id}/tree`)
      .then(setProject)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/immobilier/projects/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  useEffect(() => {
    load();
    api('/immobilier/locations').then(setLocations);
    api<ChefOption[]>('/chantiers/chefs').then(setChefs).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) return;
    api(`/immobilier/projects/${id}/sales`).then(setSales).catch(() => setSales([]));
    api(`/immobilier/projects/${id}/rentals`).then(setRentals).catch(() => setRentals([]));
    api(`/immobilier/projects/${id}/documents`).then(setDocuments).catch(() => setDocuments([]));
  }, [id]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
    if (tab === 'documents' && id) {
      api(`/immobilier/projects/${id}/documents`).then(setDocuments).catch(() => setDocuments([]));
    }
  }, [tab, id]);

  async function onGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length || !id) return;
    setGalleryUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      await uploadForm(`/immobilier/projects/${id}/images`, fd);
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
      await api(`/immobilier/projects/${id}/images/${imageId}`, { method: 'DELETE' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function setCoverImage(imageId: string) {
    if (!id) return;
    try {
      await api(`/immobilier/projects/${id}/images/${imageId}/cover`, { method: 'POST' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function onDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setDocUploading(true);
    try {
      await uploadDocument(file, {
        name: file.name,
        category: 'projet',
        entityType: 'Project',
        entityId: id,
      });
      api(`/immobilier/projects/${id}/documents`).then(setDocuments).catch(() => setDocuments([]));
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.uploadError'));
    } finally {
      setDocUploading(false);
      e.target.value = '';
    }
  }

  useEffect(() => {
    if (!id) return;
    setBienFloors(flattenProjectFloors(project || {}, t));
  }, [project, id, t]);

  function openCreateChantier() {
    if (!id || !project) return;
    setChantierForm({
      ...emptyChantierForm(),
      name: project.name,
      address: project.address || project.city || '',
      projectId: id,
      status: 'actif',
    });
    setChantierOpen(true);
  }

  async function saveChantier(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    try {
      const body = {
        name: chantierForm.name,
        address: chantierForm.address || null,
        startDate: chantierForm.startDate || null,
        endDate: chantierForm.endDate || null,
        managerName: chantierForm.managerName || null,
        managerUserId: chantierForm.managerUserId || null,
        workerCount: Number(chantierForm.workerCount || 0),
        remark: chantierForm.remark || null,
        status: chantierForm.status,
        projectId: id,
        budgetAchats: chantierForm.budgetAchats ? Number(chantierForm.budgetAchats) : null,
      };
      const created = await api<{ id: string }>('/chantiers', { method: 'POST', body: JSON.stringify(body) });
      setChantierOpen(false);
      load();
      navigate(`/chantiers/${created.id}`);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openCreateBien() {
    if (!id) return;
    setEditBienId(null);
    setBienFloorLock(null);
    setBienForm({ ...emptyBienForm(), projectId: id, city: project?.city || '' });
    setBienError('');
    setBienOpen(true);
    setTab('biens');
  }

  function openCreateBienOnFloor(floorId: string, floorLabel: string) {
    if (!id) return;
    setEditBienId(null);
    setBienFloorLock({ id: floorId, label: floorLabel });
    setBienForm({ ...emptyBienForm(), projectId: id, floorId, city: project?.city || '' });
    setBienError('');
    setBienOpen(true);
  }

  function openEditBien(propertyId: string, options?: { keepTab?: boolean }) {
    api(`/immobilier/properties/${propertyId}`).then((full) => {
      setEditBienId(propertyId);
      setBienFloorLock(null);
      setBienForm(bienToForm(full));
      setBienError('');
      setBienOpen(true);
      if (!options?.keepTab) setTab('biens');
    });
  }

  async function saveBien(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setBienError('');
    try {
      const body = {
        ...bienForm,
        projectId: id,
        surface: bienForm.surface ? Number(bienForm.surface) : null,
        rooms: bienForm.rooms ? Number(bienForm.rooms) : null,
        price: bienForm.price ? Number(bienForm.price) : null,
        floorId: bienForm.floorId || null,
      };
      if (editBienId) {
        await api(`/immobilier/properties/${editBienId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/immobilier/properties', { method: 'POST', body: JSON.stringify(body) });
      }
      setBienOpen(false);
      setEditBienId(null);
      setBienFloorLock(null);
      load();
    } catch (err) {
      setBienError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function addOrEditLevel(e: React.FormEvent) {
    e.preventDefault();
    if (!modal || !name.trim()) return;
    try {
      if (modal.editId) {
        const paths: Record<string, string> = {
          tranche: `/immobilier/tranches/${modal.editId}`,
          bloc: `/immobilier/blocs/${modal.editId}`,
          lot: `/immobilier/lots/${modal.editId}`,
          floor: `/immobilier/floors/${modal.editId}`,
        };
        await api(paths[modal.type], { method: 'PUT', body: JSON.stringify({ name }) });
      } else {
        const paths: Record<string, string> = {
          tranche: `/immobilier/projects/${id}/tranches`,
          bloc: `/immobilier/tranches/${modal.parentId}/blocs`,
          lot: `/immobilier/blocs/${modal.parentId}/lots`,
          floor: `/immobilier/lots/${modal.parentId}/floors`,
        };
        await api(paths[modal.type], { method: 'POST', body: JSON.stringify({ name }) });
      }
      setModal(null);
      setName('');
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function deleteLevel(type: string, levelId: string) {
    if (!await appConfirm(t('msg.confirmDeleteElement'))) return;
    const paths: Record<string, string> = {
      tranche: `/immobilier/tranches/${levelId}`,
      bloc: `/immobilier/blocs/${levelId}`,
      lot: `/immobilier/lots/${levelId}`,
      floor: `/immobilier/floors/${levelId}`,
    };
    try {
      await api(paths[type], { method: 'DELETE' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openEditProject() {
    if (!project) return;
    setForm(projectToForm(project));
    setEditOpen(true);
  }

  async function saveProject(e: React.FormEvent) {
    e.preventDefault();
    if (form.ownershipType === 'client' && !form.clientId) {
      await appAlert(`${t('fields.selectClient')}.`);
      return;
    }
    try {
      await api(`/immobilier/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify(projectFormToBody(form)),
      });
      setEditOpen(false);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDeleteProject() {
    if (!deleteMotif.trim()) return;
    try {
      await api(`/immobilier/projects/${id}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      navigate('/projets');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function openSaleDetail(saleId: string) {
    setSaleModalOpen(true);
    setSaleDetailLoading(true);
    setSaleDetail(null);
    try {
      const s = await api(`/transactions/sales/${saleId}`);
      setSaleDetail(s);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
      setSaleModalOpen(false);
    } finally {
      setSaleDetailLoading(false);
    }
  }

  async function openRentalDetail(rentalId: string) {
    setRentalModalOpen(true);
    setRentalDetailLoading(true);
    setRentalDetail(null);
    try {
      const r = await api(`/transactions/rentals/${rentalId}`);
      setRentalDetail(r);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
      setRentalModalOpen(false);
    } finally {
      setRentalDetailLoading(false);
    }
  }

  function printStructure() {
    const w = window.open('', '_blank');
    if (!w || !project) return;
    let html = `<h1>${project.name} — Structure</h1>`;
    for (const t of project.tranches || []) {
      html += `<h3>Tranche ${t.name}</h3>`;
      for (const b of t.blocs || []) {
        html += `<p style="margin-left:16px"><b>Bloc ${b.name}</b></p>`;
        for (const l of b.lots || []) {
          html += `<p style="margin-left:32px">Lot ${l.name}</p>`;
          for (const f of l.floors || []) {
            html += `<p style="margin-left:48px;font-size:12px">Étage ${f.name}</p>`;
          }
        }
      }
    }
    w.document.write(`<html><head><title>${project.name}</title></head><body style="font-family:sans-serif">${html}</body></html>`);
    w.document.close();
    w.print();
  }

  function printFiche() {
    if (!project) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const totalVal = (project.properties || []).reduce((s: number, p: any) => s + Number(p.price || 0), 0);
    const chantiersN = project.chantiers?.length ?? 0;
    const photosN = project.images?.length ?? 0;
    const ownership = projectOwnershipLabel(project.ownershipType, t);
    const clientLine = project.client
      ? `${project.client.reference} — ${project.client.firstName} ${project.client.lastName}`
      : '—';
    const biensRows = (project.properties || []).map((p: any) =>
      `<tr><td>${p.reference || '—'}</td><td>${p.name}</td><td>${p.status}</td><td>${formatMad(p.price)}</td></tr>`
    ).join('');
    const chantierRows = (project.chantiers || []).map((ch: any) =>
      `<tr><td>${ch.name}</td><td>${ch.address || '—'}</td><td>${ch.managerName || '—'}</td><td>${Math.round(ch.progressPct || 0)}%</td></tr>`
    ).join('');
    const venteRows = sales.map((s) =>
      `<tr><td>${s.reference}</td><td>${s.client.firstName} ${s.client.lastName}</td><td>${s.property.reference} — ${s.property.name}</td><td>${formatMad(s.netPrice)}</td><td>${s.status}</td></tr>`
    ).join('');
    const locationRows = rentals.map((r) =>
      `<tr><td>${r.reference}</td><td>${r.client.firstName} ${r.client.lastName}</td><td>${r.property.reference} — ${r.property.name}</td><td>${formatMad(r.monthlyRent)}</td><td>${r.status}</td></tr>`
    ).join('');
    let structureHtml = '';
    for (const t of project.tranches || []) {
      structureHtml += `<h4>Tranche ${t.name}</h4>`;
      for (const b of t.blocs || []) {
        structureHtml += `<p style="margin-left:12px"><b>Bloc ${b.name}</b></p>`;
        for (const l of b.lots || []) {
          structureHtml += `<p style="margin-left:24px">Lot ${l.name}</p>`;
          for (const f of l.floors || []) {
            const apps = (f.properties || []).map((p: any) => `${p.reference} ${p.name}`).join(', ');
            structureHtml += `<p style="margin-left:36px;font-size:11px">Étage ${f.name}${apps ? ` — ${apps}` : ''}</p>`;
          }
        }
      }
    }
    w.document.write(`<html><head><title>Projet ${project.name}</title>
      <style>body{font-family:sans-serif;padding:24px;font-size:12px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #ccc;padding:6px;text-align:left}h1,h2,h3{margin:12px 0 6px}</style>
      </head><body>
      <h1>Fiche projet immobilier 360 — GIC</h1>
      <h2>${project.reference || '—'} — ${project.name}</h2>
      <p><b>Type :</b> ${ownership} · <b>Statut :</b> ${project.status}</p>
      <p><b>Client :</b> ${clientLine}</p>
      <p><b>Ville :</b> ${project.city || '—'} · <b>Zone catalogue :</b> ${project.location?.name || '—'}</p>
      <p><b>Adresse :</b> ${project.address || '—'}</p>
      <p><b>Description :</b> ${project.description || '—'}</p>
      <p><b>Remarque :</b> ${project.remark || '—'}</p>
      <h3>Synthèse</h3>
      <p>Tranches : ${project.tranches?.length ?? 0} · Biens : ${project.properties?.length ?? 0} · Valeur patrimoniale : ${formatMad(totalVal)} · Chantiers : ${chantiersN} · Photos : ${photosN}</p>
      <h3>Biens (${project.properties?.length ?? 0})</h3>
      <table><tr><th>Réf.</th><th>Nom</th><th>Statut</th><th>Prix</th></tr>${biensRows || '<tr><td colspan="4">Aucun</td></tr>'}</table>
      <h3>Chantiers (${chantiersN})</h3>
      <table><tr><th>Nom</th><th>Adresse</th><th>Chef</th><th>Avancement</th></tr>${chantierRows || '<tr><td colspan="4">Aucun</td></tr>'}</table>
      <h3>Ventes (${sales.length})</h3>
      <table><tr><th>Réf.</th><th>Client</th><th>Bien</th><th>Montant</th><th>Statut</th></tr>${venteRows || '<tr><td colspan="5">Aucune</td></tr>'}</table>
      <h3>Locations (${rentals.length})</h3>
      <table><tr><th>Réf.</th><th>Locataire</th><th>Bien</th><th>Loyer/mois</th><th>Statut</th></tr>${locationRows || '<tr><td colspan="5">Aucune</td></tr>'}</table>
      <h3>{t('detail.patrimonialStructure')}</h3>
      ${structureHtml || '<p>Aucune tranche</p>'}
      <p style="margin-top:24px;font-size:10px;color:#666">Imprimé le ${new Date().toLocaleString('fr-FR')}</p>
    </body></html>`);
    w.document.close();
    w.print();
  }

  const imageCount = project?.images?.length ?? project?._count?.images ?? 0;
  const chantierCount = project?.chantiers?.length ?? 0;
  const mapsQuery = project ? projectLocationQuery(project) : '';
  const mapsUrl = mapsQuery ? googleMapsSearchUrl(mapsQuery) : '';

  const chipLabels: Partial<Record<Tab, string>> = {
    biens: `${t('tabs.properties')} (${project?.properties?.length ?? 0})`,
    galerie: `${t('tabs.gallery')} (${imageCount})`,
    chantiers: `${t('nav.sites')} (${chantierCount})`,
    ventes: `${t('tabs.sales')} (${sales.length})`,
    locations: `${t('tabs.rentals')} (${rentals.length})`,
  };

  if (!project && !error) return <p className="text-[12px] text-gic-muted p-6">{t('common.loading')}</p>;

  if (error && !project) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/projets" className="mt-2" />
      </Card>
    );
  }

  const byStatus: Record<string, number> = {};
  for (const p of project.properties || []) {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  }

  const totalValue = (project.properties || []).reduce((s: number, p: any) => s + Number(p.price || 0), 0);

  const dispoCount = (project.properties || []).filter((p: { status: string }) => p.status === 'disponible').length;
  const unassignedProperties = (project.properties || []).filter((p: { floorId?: string | null }) => !p.floorId);
  const linkedChantier = (project.chantiers || [])[0] as { id: string; name: string } | undefined;

  function goToProjectChantier() {
    if (linkedChantier) {
      navigate(`/chantiers/${linkedChantier.id}`);
    } else {
      openCreateChantier();
    }
  }

  function handleQuickChip(t: Tab) {
    if (t === 'chantiers') {
      goToProjectChantier();
      return;
    }
    setTab(t);
  }

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/projets" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo mac-project-cover">
            {project.photo ? (
              <img
                src={photoSrc(project.photo)}
                alt=""
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                  const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
                  if (fb) fb.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="mac-detail-photo-fallback"
              style={project.photo ? { display: 'none' } : undefined}
            >
              <Building2 size={28} />
            </div>
            <label className="mac-detail-photo-cam" title={t('actions.addImages')}>
              <Camera size={12} strokeWidth={2} />
              <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" multiple onChange={onGalleryUpload} disabled={galleryUploading} />
            </label>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.project360')}</p>
            <h1 className="mac-detail-name truncate">{project.name}</h1>
            <p className="mac-detail-meta">
              {project.reference || '—'} · {project.city || '—'} · {project.location?.name || 'Sans zone catalogue'}
            </p>
            {project.address && (
              <p className="text-[11px] text-gic-muted mt-1 flex items-start gap-1">
                <MapPin size={12} className="shrink-0 mt-0.5" />
                <span className="truncate">{project.address}</span>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-[#007aff] hover:underline shrink-0 inline-flex items-center gap-0.5 ml-1">
                    Maps <ExternalLink size={10} />
                  </a>
                )}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <StatusPill status={project.status} />
              <span className={`mac-chip ${project.ownershipType === 'client' ? 'mac-chip-orange' : 'mac-chip-blue'}`}>
                {projectOwnershipLabel(project.ownershipType, t)}
              </span>
              {project.client && (
                <Link to={`/clients/${project.client.id}`} className="mac-chip mac-chip-gray hover:opacity-80">
                  {clientOptionLabel(project.client)}
                </Link>
              )}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {(['biens', 'galerie', 'chantiers', 'ventes', 'locations'] as Tab[]).map((tabId) => (
                <button
                  key={tabId}
                  type="button"
                  className={`mac-chip hover:opacity-90 ${
                    tabId === 'chantiers' && chantierCount > 0 ? 'mac-chip-orange' : 'mac-chip-gray hover:bg-gray-200/80'
                  }`}
                  onClick={() => handleQuickChip(tabId)}
                >
                  {tabId === 'chantiers'
                    ? linkedChantier
                      ? `${t('nav.sites')} — ${linkedChantier.name}`
                      : `${t('nav.sites')} (0)`
                    : chipLabels[tabId]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          <Btn variant="secondary" icon={Printer} onClick={printFiche}>{t('common.print')}</Btn>
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEditProject} />
            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteOpen(true); setDeleteMotif(''); }} />
          </div>
                 </div>
      </div>

      <div className="mac-kpi-grid mb-4">
        <KpiCard title={t('fields.tranche')} value={project.tranches?.length ?? 0} icon={Layers} tone="violet" />
        <KpiCard title={t('tabs.properties')} value={project.properties?.length ?? 0} icon={Home} tone="emerald" delta={`${dispoCount} ${t('status.available').toLowerCase()}.`} deltaTone="muted" />
        <KpiCard title={t('detail.patrimonialStructure')} value={formatMad(totalValue)} icon={TrendingUp} tone="amber" />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsProjectAria')}
            groups={[
              {
                id: 'pilotage',
                label: t('tabs.pilotage'),
                items: [
                  { id: 'infos', label: t('tabs.informations'), icon: Info },
                ],
              },
              {
                id: 'immobilier',
                label: t('tabs.realEstate'),
                items: [
                  { id: 'structure', label: t('tabs.structure'), icon: Layers },
                  { id: 'biens', label: t('tabs.properties'), icon: Home, badge: project.properties?.length ?? 0 },
                  { id: 'ventes', label: t('tabs.sales'), icon: Building2, badge: sales.length },
                  { id: 'locations', label: t('tabs.rentals'), icon: KeyRound, badge: rentals.length },
                ],
              },
              {
                id: 'medias',
                label: t('tabs.media'),
                items: [
                  { id: 'galerie', label: t('tabs.gallery'), icon: Images, badge: imageCount },
                  { id: 'documents', label: t('tabs.documents'), icon: FileText, badge: documents.length },
                  { id: 'echanges', label: t('tabs.exchanges'), icon: MessageCircle },
                ],
              },
              {
                id: 'suivi',
                label: t('tabs.followUp'),
                items: [
                  { id: 'historique', label: t('tabs.history'), icon: History },
                ],
              },
            ]}
          />
        }
      >
        {tab === 'infos' && (
          <div className="mt-1">
            <div className="grid sm:grid-cols-2 gap-4 text-[12px]">
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.reference')}</p>
                <p className="font-medium">{project.reference || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.projectType')}</p>
                <p className="font-medium">{projectOwnershipLabel(project.ownershipType, t)}</p>
              </div>
              {project.ownershipType === 'client' && (
                <div>
                  <p className="text-[10px] text-gic-muted uppercase">{t('fields.client')}</p>
                  {project.client ? (
                    <Link to={`/clients/${project.client.id}`} className="font-medium text-gic-violet hover:underline">
                      {clientOptionLabel(project.client)}
                    </Link>
                  ) : (
                    <p>—</p>
                  )}
                </div>
              )}
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.city')}</p>
                <p className="font-medium">{project.city || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.geoZone')}</p>
                <p className="font-medium">{project.location?.name || '—'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.projectAddress')}</p>
                <p className="font-medium">{project.address || '—'}</p>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-[11px] text-[#007aff] hover:underline inline-flex items-center gap-1 mt-1">
                    <MapPin size={12} /> {t('fields.openInMaps')} <ExternalLink size={10} />
                  </a>
                )}
              </div>
              <div className="sm:col-span-2">
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.description')}</p>
                <p className="text-gic-muted">{project.description || '—'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.remark')}</p>
                <p className="text-gic-muted">{project.remark || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.createdAt')}</p>
                <p>{formatDate(project.createdAt)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('tabs.properties')}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Object.entries(byStatus).map(([st, n]) => (
                    <span key={st} className="text-[11px]"><StatusPill status={st} /> × {n}</span>
                  ))}
                  {!Object.keys(byStatus).length && <span className="text-gic-muted">{t('msg.emptyProperties')}</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'galerie' && (
          <div className="mt-1">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <p className="text-[12px] text-gic-muted flex items-center gap-1.5">
                <Images size={14} /> {imageCount} image(s) — plans, vues, photos du site
              </p>
              <label className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium bg-white border border-gic-border cursor-pointer hover:bg-gray-50">
                <Upload size={14} />
                {galleryUploading ? t('auth.sending') : t('actions.addImages')}
                <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" multiple onChange={onGalleryUpload} disabled={galleryUploading} />
              </label>
            </div>
            {(project.images || []).length === 0 ? (
              <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptySitePhotos')}</p>
            ) : (
              <div className="mac-project-gallery">
                {(project.images || []).map((img: { id: string; path: string }) => (
                  <div key={img.id} className={`mac-project-gallery-item${project.photo === img.path ? ' mac-project-gallery-cover' : ''}`}>
                    {img.path.endsWith('.pdf') ? (
                      <a href={img.path} target="_blank" rel="noreferrer" className="mac-project-gallery-pdf">
                        <FileText size={24} />
                        <span>PDF</span>
                      </a>
                    ) : (
                      <img src={img.path} alt="" />
                    )}
                    <div className="mac-project-gallery-actions">
                      {project.photo !== img.path && (
                        <button type="button" className="mac-project-gallery-btn" onClick={() => setCoverImage(img.id)} title={t('common.view')}>
                          <Image size={12} />
                        </button>
                      )}
                      <button type="button" className="mac-project-gallery-btn mac-project-gallery-btn-danger" onClick={() => deleteGalleryImage(img.id)} title={t('common.delete')}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {project.photo === img.path && <span className="mac-project-gallery-badge">{t('fields.cover')}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      {tab === 'structure' && (
        <div className="mt-1">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Building2 size={16} /> {t('detail.patrimonialStructure')}
            </h2>
            <div className="flex flex-wrap gap-2">
              <Btn icon={Plus} onClick={() => setModal({ type: 'tranche' })}>{t('actions.addTranche')}</Btn>
              <Btn variant="secondary" icon={Printer} onClick={printStructure}>{t('actions.printStructure')}</Btn>
            </div>
          </div>

          <div className="mac-structure-tree">
            {(project.tranches || []).map((tranche: any) => (
              <div key={tranche.id} className="mac-structure-node mac-structure-node-tranche">
                <div className="mac-structure-row">
                  <div className="mac-structure-label">
                    <span className="mac-structure-badge mac-structure-badge-violet">
                      <Layers size={11} /> {t('fields.tranche')}
                    </span>
                    <span className="mac-structure-name">{tranche.name}</span>
                  </div>
                  <div className="mac-structure-actions">
                    <button type="button" className="mac-structure-add" onClick={() => setModal({ type: 'bloc', parentId: tranche.id })}>
                      <Plus size={12} strokeWidth={2.5} /> {t('fields.bloc')}
                    </button>
                    <MacActionBtn icon={Pencil} tone="orange" title={t('actions.rename')} onClick={() => { setModal({ type: 'tranche', editId: tranche.id }); setName(tranche.name); }} />
                    <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteLevel('tranche', tranche.id)} />
                  </div>
                </div>

                <div className="mac-structure-children">
                  {(tranche.blocs || []).map((b: any) => (
                    <div key={b.id} className="mac-structure-node mac-structure-node-bloc">
                      <div className="mac-structure-row">
                        <div className="mac-structure-label">
                          <span className="mac-structure-badge mac-structure-badge-gray">
                            <Building2 size={11} /> {t('fields.bloc')}
                          </span>
                          <span className="mac-structure-name">{b.name}</span>
                        </div>
                        <div className="mac-structure-actions">
                          <button type="button" className="mac-structure-add" onClick={() => setModal({ type: 'lot', parentId: b.id })}>
                            <Plus size={12} strokeWidth={2.5} /> {t('fields.lot')}
                          </button>
                          <MacActionBtn icon={Pencil} tone="orange" title={t('actions.rename')} onClick={() => { setModal({ type: 'bloc', editId: b.id }); setName(b.name); }} />
                          <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteLevel('bloc', b.id)} />
                        </div>
                      </div>

                      <div className="mac-structure-children">
                        {(b.lots || []).map((l: any) => (
                          <div key={l.id} className="mac-structure-node mac-structure-node-lot">
                            <div className="mac-structure-row">
                              <div className="mac-structure-label">
                                <span className="mac-structure-badge mac-structure-badge-gray">
                                  <LayoutGrid size={11} /> {t('fields.lot')}
                                </span>
                                <span className="mac-structure-name">{l.name}</span>
                              </div>
                              <div className="mac-structure-actions">
                                <button type="button" className="mac-structure-add" onClick={() => setModal({ type: 'floor', parentId: l.id })}>
                                  <Plus size={12} strokeWidth={2.5} /> {t('fields.floor')}
                                </button>
                                <MacActionBtn icon={Pencil} tone="orange" title={t('actions.rename')} onClick={() => { setModal({ type: 'lot', editId: l.id }); setName(l.name); }} />
                                <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteLevel('lot', l.id)} />
                              </div>
                            </div>

                            <div className="mac-structure-children">
                              {(l.floors || []).map((f: any) => {
                                const floorLabel = `Tr.${tranche.name} › Bl.${b.name} › Lot ${l.name} › Étranche.${f.name}`;
                                const propCount = f._count?.properties ?? (f.properties || []).length;
                                return (
                                  <div key={f.id} className="mac-structure-node mac-structure-node-floor">
                                    <div className="mac-structure-row">
                                      <div className="mac-structure-label">
                                        <span className="mac-structure-badge mac-structure-badge-gray">
                                          <PanelTop size={11} /> {t('fields.floor')}
                                        </span>
                                        <span className="mac-structure-name">{f.name}</span>
                                        {propCount > 0 && (
                                          <span className="mac-structure-count">{propCount} appart.</span>
                                        )}
                                      </div>
                                      <div className="mac-structure-actions">
                                        <button type="button" className="mac-structure-add mac-structure-add-emerald" onClick={() => openCreateBienOnFloor(f.id, floorLabel)}>
                                          <Plus size={12} strokeWidth={2.5} /> {t('actions.newApartment')}
                                        </button>
                                        <MacActionBtn icon={Pencil} tone="orange" title={t('actions.rename')} onClick={() => { setModal({ type: 'floor', editId: f.id }); setName(f.name); }} />
                                        <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteLevel('floor', f.id)} />
                                      </div>
                                    </div>

                                    {(f.properties || []).length > 0 && (
                                      <div className="mac-structure-units">
                                        {(f.properties || []).map((p: { id: string; reference: string; name: string; status: string }) => (
                                          <button
                                            key={p.id}
                                            type="button"
                                            className="mac-structure-unit"
                                            onClick={() => openEditBien(p.id, { keepTab: true })}
                                          >
                                            <Home size={12} className="shrink-0 text-emerald-600" />
                                            <span className="mac-structure-unit-ref">{p.reference}</span>
                                            <span className="mac-structure-unit-name truncate">{p.name}</span>
                                            <StatusPill status={p.status} quiet />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!project.tranches?.length && (
              <div className="mac-structure-empty">
                <Layers size={28} className="text-gic-muted opacity-40" />
                <p className="text-[12px] text-gic-muted mt-2">{t('msg.emptyTranchesHint')}</p>
                <Btn icon={Plus} className="mt-3" onClick={() => setModal({ type: 'tranche' })}>{t('actions.addTranche')}</Btn>
              </div>
            )}
          </div>

          {unassignedProperties.length > 0 && (
            <div className="mac-structure-unassigned mt-4">
              <div className="mac-structure-unassigned-head">
                <div>
                  <p className="text-[11px] font-semibold text-gic-ink flex items-center gap-1.5">
                    <Home size={14} className="text-amber-600" />
                    Biens sans étage ({unassignedProperties.length})
                  </p>
                  <p className="text-[10px] text-gic-muted mt-0.5">
                    Non rattachés à la hiérarchie — assignez un étage ou gérez-les ici
                  </p>
                </div>
                <Btn icon={Plus} variant="secondary" onClick={openCreateBien}>{t('actions.newProperty')}</Btn>
              </div>
              <div className="mac-structure-units mac-structure-unassigned-list">
                {unassignedProperties.map((p: { id: string; reference: string; name: string; status: string }) => (
                  <button
                    key={p.id}
                    type="button"
                    className="mac-structure-unit"
                    onClick={() => openEditBien(p.id, { keepTab: true })}
                  >
                    <Home size={12} className="shrink-0 text-amber-600" />
                    <span className="mac-structure-unit-ref">{p.reference}</span>
                    <span className="mac-structure-unit-name truncate">{p.name}</span>
                    <StatusPill status={p.status} quiet />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'biens' && (
        <div className="mt-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">{t('detail.projectProperties')}</h2>
            <Btn icon={Plus} onClick={openCreateBien}>{t('actions.newProperty')}</Btn>
          </div>
          {(project.properties || []).length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-[12px] text-gic-muted mb-3">{t('msg.emptyProperties')}</p>
              <Btn icon={Plus} onClick={openCreateBien}>{t('actions.newProperty')}</Btn>
            </div>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.reference')}</Th>
                  <Th mac>{t('columns.designation')}</Th>
                  <Th mac>{t('columns.status')}</Th>
                  <Th mac>{t('columns.price')}</Th>
                  <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {(project.properties || []).map((p: any) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-gray-50/60" onClick={() => openEditBien(p.id)}>
                    <Td mac className="font-medium text-gic-violet">{p.reference}</Td>
                    <Td mac>{p.name}</Td>
                    <Td mac><StatusPill status={p.status} quiet /></Td>
                    <Td mac>{formatMad(p.price)}</Td>
                    <Td mac className="mac-td-actions">
                      <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                        <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEditBien(p.id)} />
                        <Link to={`/biens/${p.id}`} title={t('actions.openFiche')} className="mac-action-btn mac-action-btn-blue">
                          <ExternalLink size={14} strokeWidth={2.15} />
                        </Link>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}

      {tab === 'ventes' && (
        <div className="mt-1">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <TrendingUp size={16} /> {t('tabs.sales')}
          </h2>
          {sales.length === 0 ? (
            <p className="text-[12px] text-gic-muted py-4">{t('msg.emptySales')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.ref')}</Th>
                  <Th mac>{t('columns.client')}</Th>
                  <Th mac>{t('columns.property')}</Th>
                  <Th mac>{t('columns.amount')}</Th>
                  <Th mac>{t('columns.status')}</Th>
                  <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} className="cursor-pointer hover:bg-gray-50/60" onClick={() => openSaleDetail(s.id)}>
                    <Td mac className="font-medium text-gic-violet">{s.reference}</Td>
                    <Td mac>
                      <Link to={`/clients/${s.client.id}`} className="hover:text-gic-violet" onClick={(e) => e.stopPropagation()}>
                        {s.client.firstName} {s.client.lastName}
                      </Link>
                    </Td>
                    <Td mac className="text-[11px]">{s.property.reference} — {s.property.name}</Td>
                    <Td mac>{formatMad(s.netPrice)}</Td>
                    <Td mac><StatusPill status={s.status} quiet /></Td>
                    <Td mac className="mac-td-actions">
                      <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                        <MacActionBtn icon={ExternalLink} tone="blue" title={t('common.preview')} onClick={() => openSaleDetail(s.id)} />
                        <Link to={`/ventes/${s.id}`} className="mac-action-btn mac-action-btn-gray" title={t('actions.openFiche')}>
                          <ExternalLink size={14} strokeWidth={2.15} />
                        </Link>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}

      {tab === 'locations' && (
        <div className="mt-1">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <KeyRound size={16} /> {t('tabs.rentals')}
          </h2>
          {rentals.length === 0 ? (
            <p className="text-[12px] text-gic-muted py-4">{t('msg.emptyRentals')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.ref')}</Th>
                  <Th mac>{t('columns.tenant')}</Th>
                  <Th mac>{t('columns.property')}</Th>
                  <Th mac>{t('columns.rentMonth')}</Th>
                  <Th mac>{t('columns.status')}</Th>
                  <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {rentals.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-gray-50/60" onClick={() => openRentalDetail(r.id)}>
                    <Td mac className="font-medium text-gic-violet">{r.reference}</Td>
                    <Td mac>
                      <Link to={`/clients/${r.client.id}`} className="hover:text-gic-violet" onClick={(e) => e.stopPropagation()}>
                        {r.client.firstName} {r.client.lastName}
                      </Link>
                    </Td>
                    <Td mac className="text-[11px]">{r.property.reference} — {r.property.name}</Td>
                    <Td mac>{formatMad(r.monthlyRent)}</Td>
                    <Td mac><StatusPill status={r.status} quiet /></Td>
                    <Td mac className="mac-td-actions">
                      <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                        <MacActionBtn icon={ExternalLink} tone="blue" title={t('common.preview')} onClick={() => openRentalDetail(r.id)} />
                        <Link to={`/locations/${r.id}`} className="mac-action-btn mac-action-btn-gray" title={t('actions.openFiche')}>
                          <ExternalLink size={14} strokeWidth={2.15} />
                        </Link>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div className="mt-1">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <FileText size={16} /> {t('tabs.documents')}
            </h2>
            <label className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium bg-white border border-gic-border cursor-pointer hover:bg-gray-50">
              <Upload size={14} />
              {docUploading ? t('auth.sending') : t('actions.deposit')}
              <input type="file" className="hidden" onChange={onDocUpload} disabled={docUploading} />
            </label>
          </div>
          {documents.length === 0 ? (
            <p className="text-[12px] text-gic-muted py-4">{t('msg.emptyDocuments')}</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-[12px] rounded-xl bg-gray-50 px-3 py-2">
                  <FileText size={14} className="text-gic-violet shrink-0" />
                  <span className="font-medium truncate flex-1">{d.name}</span>
                  <span className="text-[10px] text-gic-muted">{formatDate(d.createdAt)}</span>
                  <a href={d.path} target="_blank" rel="noreferrer" className="text-gic-violet hover:underline shrink-0 inline-flex items-center gap-1">
                    {t('actions.open')} <ExternalLink size={11} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'echanges' && id && (
        <div className="mt-1">
          <ConversationsPanel
            entityType="Project"
            entityId={id}
            defaultEmail={project.client?.email || undefined}
            defaultPhone={project.client?.phone1 || undefined}
          />
        </div>
      )}

      {tab === 'historique' && (
        <div className="mt-1">
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <History size={16} /> {t('detail.auditJournal')}
          </h2>
          {history.length === 0 ? (
            <p className="text-[12px] text-gic-muted py-4">{t('msg.emptyHistory')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.date')}</Th>
                  <Th mac>{t('columns.action')}</Th>
                  <Th mac>{t('columns.user')}</Th>
                  <Th mac>{t('columns.details')}</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <Td mac className="text-[11px]">{formatDate(h.createdAt)}</Td>
                    <Td mac className="capitalize">{h.action}</Td>
                    <Td mac className="text-[11px] text-gic-muted">
                      {h.user ? `${h.user.firstName} ${h.user.lastName}` : '—'}
                    </Td>
                    <Td mac className="text-[11px] text-gic-muted">{h.details || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}
      </DetailShell>

      <Modal
        open={bienOpen}
        size="lg"
        title={editBienId ? t('actions.editProperty') : bienFloorLock ? t('actions.newApartment') : t('actions.newProperty')}
        onClose={() => { setBienOpen(false); setEditBienId(null); setBienFloorLock(null); setBienError(''); }}
        footer={
          <>
            <Btn variant="secondary" onClick={() => { setBienOpen(false); setEditBienId(null); setBienFloorLock(null); setBienError(''); }}>{t('common.cancel')}</Btn>
            <Btn form="bien-proj-form" type="submit">{editBienId ? t('common.save') : t('actions.create')}</Btn>
          </>
        }
      >
        <form id="bien-proj-form" onSubmit={saveBien}>
          <BienFormFields
            form={bienForm}
            setForm={setBienForm}
            projects={project ? [{ id: project.id, name: project.name }] : []}
            floors={bienFloors}
            lockProjectId={id}
            lockedProjectName={project?.name}
            lockFloorId={bienFloorLock?.id}
            lockedFloorLabel={bienFloorLock?.label}
          />
          {bienError && <p className="mt-3 text-[11px] text-gic-coral">{bienError}</p>}
        </form>
      </Modal>

      <Modal
        open={!!modal}
        title={modal?.editId ? t('actions.rename') : t('common.add')}
        onClose={() => { setModal(null); setName(''); }}
        footer={<Btn form="level-form" type="submit">{modal?.editId ? t('common.save') : t('common.add')}</Btn>}
      >
        <form id="level-form" onSubmit={addOrEditLevel}>
          <Input label={t('fields.name')} required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </form>
      </Modal>

      <Modal
        open={editOpen}
        size="lg"
        title={t('actions.editProject')}
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="edit-proj-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="edit-proj-form" onSubmit={saveProject}>
          <ProjectFormFields form={form} setForm={setForm} locations={locations} />
        </form>
      </Modal>

      <Modal open={chantierOpen} size="lg" title={t('actions.createSiteOnProject')} onClose={() => setChantierOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setChantierOpen(false)}>{t('common.cancel')}</Btn><Btn form="proj-chantier-form" type="submit">{t('actions.create')}</Btn></>}
      >
        <form id="proj-chantier-form" onSubmit={saveChantier}>
          <ChantierFormFields
            form={chantierForm}
            setForm={setChantierForm}
            projects={id && project ? [{ id, name: project.name, city: project.city }] : []}
            chefs={chefs}
          />
        </form>
      </Modal>

      <Modal
        open={saleModalOpen}
        size="lg"
        title={saleDetail?.reference ? `${t('fields.sale')} ${saleDetail.reference}` : t('fields.sale')}
        onClose={() => { setSaleModalOpen(false); setSaleDetail(null); }}
        footer={
          <>
            <Btn variant="secondary" onClick={() => { setSaleModalOpen(false); setSaleDetail(null); }}>{t('common.close')}</Btn>
            {saleDetail && (
              <Link to={`/ventes/${saleDetail.id}`}>
                <Btn icon={ExternalLink}>{t('actions.openFiche')}</Btn>
              </Link>
            )}
          </>
        }
      >
        {saleDetailLoading ? (
          <p className="text-[12px] text-gic-muted py-4 text-center">{t('common.loading')}</p>
        ) : saleDetail ? (
          <div className="space-y-4 text-[12px]">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={saleDetail.status} />
              {saleDetail.contractType && <span className="mac-chip mac-chip-blue capitalize">{saleDetail.contractType}</span>}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.client')}</p>
                <Link to={`/clients/${saleDetail.client.id}`} className="font-medium text-gic-violet hover:underline">
                  {saleDetail.client.firstName} {saleDetail.client.lastName}
                </Link>
              </div>
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.property')}</p>
                <p className="font-medium">{saleDetail.property.reference} — {saleDetail.property.name}</p>
              </div>
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.netPrice')}</p>
                <p className="font-medium">{formatMad(saleDetail.netPrice)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.collected')} / {t('fields.remaining')}</p>
                <p className="font-medium">{formatMad(saleDetail.totalPaid)} · {t('fields.remaining').toLowerCase()} {formatMad(saleDetail.remaining)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.contractDate')}</p>
                <p>{formatDate(saleDetail.contractDate)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gic-muted uppercase">Description</p>
                <p className="text-gic-muted">{saleDetail.description || '—'}</p>
              </div>
            </div>
            {(saleDetail.payments || []).length > 0 && (
              <div>
                <p className="text-[11px] font-semibold mb-2">{t('detail.recentPayments')}</p>
                <TableWrap mac>
                  <thead>
                    <tr>
                      <Th mac>{t('columns.date')}</Th>
                      <Th mac>{t('columns.amount')}</Th>
                      <Th mac>{t('columns.mode')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(saleDetail.payments || []).slice(0, 5).map((p: any) => (
                      <tr key={p.id}>
                        <Td mac className="text-[11px]">{formatDate(p.date)}</Td>
                        <Td mac>{formatMad(p.amount)}</Td>
                        <Td mac className="text-[11px] text-gic-muted">{p.operationType || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={rentalModalOpen}
        size="lg"
        title={rentalDetail?.reference ? `${t('fields.rental')} ${rentalDetail.reference}` : t('fields.rental')}
        onClose={() => { setRentalModalOpen(false); setRentalDetail(null); }}
        footer={
          <>
            <Btn variant="secondary" onClick={() => { setRentalModalOpen(false); setRentalDetail(null); }}>{t('common.close')}</Btn>
            {rentalDetail && (
              <Link to={`/locations/${rentalDetail.id}`}>
                <Btn icon={ExternalLink}>{t('actions.openFiche')}</Btn>
              </Link>
            )}
          </>
        }
      >
        {rentalDetailLoading ? (
          <p className="text-[12px] text-gic-muted py-4 text-center">{t('common.loading')}</p>
        ) : rentalDetail ? (
          <div className="space-y-4 text-[12px]">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={rentalDetail.status} />
              {rentalDetail.contractType && <span className="mac-chip mac-chip-blue capitalize">{rentalDetail.contractType}</span>}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.tenant')}</p>
                <Link to={`/clients/${rentalDetail.client.id}`} className="font-medium text-gic-violet hover:underline">
                  {rentalDetail.client.firstName} {rentalDetail.client.lastName}
                </Link>
              </div>
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.property')}</p>
                <p className="font-medium">{rentalDetail.property.reference} — {rentalDetail.property.name}</p>
              </div>
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('rental.monthlyAmount')}</p>
                <p className="font-medium">{formatMad(rentalDetail.monthlyRent)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.collected')} / {t('fields.remaining')}</p>
                <p className="font-medium">{formatMad(rentalDetail.totalPaid)} · {t('fields.remaining').toLowerCase()} {formatMad(rentalDetail.remaining)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gic-muted uppercase">{t('fields.contractDate')}</p>
                <p>{formatDate(rentalDetail.contractDate)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gic-muted uppercase">Description</p>
                <p className="text-gic-muted">{rentalDetail.description || '—'}</p>
              </div>
            </div>
            {(rentalDetail.payments || []).length > 0 && (
              <div>
                <p className="text-[11px] font-semibold mb-2">{t('detail.recentPayments')}</p>
                <TableWrap mac>
                  <thead>
                    <tr>
                      <Th mac>{t('columns.date')}</Th>
                      <Th mac>{t('columns.amount')}</Th>
                      <Th mac>{t('columns.mode')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rentalDetail.payments || []).slice(0, 5).map((p: any) => (
                      <tr key={p.id}>
                        <Td mac className="text-[11px]">{formatDate(p.date)}</Td>
                        <Td mac>{formatMad(p.amount)}</Td>
                        <Td mac className="text-[11px] text-gic-muted">{p.operationType || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={deleteOpen}
        title={t('actions.deleteProject')}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDeleteProject} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">
          Un projet avec des biens rattachés ne peut pas être supprimé (RG-PRJ-001).
        </p>
        <textarea
          className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]"
          placeholder={t('msg.motifDeletePlaceholder')}
          value={deleteMotif}
          onChange={(e) => setDeleteMotif(e.target.value)}
        />
      </Modal>
    </div>
  );
}
