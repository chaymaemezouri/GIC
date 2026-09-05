import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Upload, Pencil, Trash2, Printer, History, Camera, ExternalLink,
  Building2, Home, MapPin, FileText, TrendingUp, User, Info as InfoIcon, CreditCard,
} from 'lucide-react';
import { api, fetchProjectList, formatDate, formatMad, uploadDocument, uploadForm } from '../lib/api';
import {
  Btn, Card, KpiCard, MacActionBtn, Modal, Select, StatusPill, TableWrap, Td, Th,
  PageBackLink,
} from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';
import { isBankPaymentMode, paymentModeLabel } from '../lib/paymentMode';
import { fileUrl } from '../lib/documentDisplay';

import {
  BienFormFields, bienToForm, flattenProjectFloors,
  type BienFormData, type FloorOption,
} from '../components/BienFormFields';

type Tab = 'info' | 'transactions' | 'documents' | 'historique';

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

export default function BienDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [bien, setBien] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [floors, setFloors] = useState<FloorOption[]>([]);
  const [loadingFloors, setLoadingFloors] = useState(false);
  const [tab, setTab] = useState<Tab>('info');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<BienFormData>({
    name: '', city: '', status: 'disponible', surface: '', rooms: '', price: '',
    projectId: '', floorId: '', titleNumber: '', description: '', contractualDesc: '',
  });

  function load() {
    if (!id) return;
    setError('');
    api(`/immobilier/properties/${id}`)
      .then(setBien)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/immobilier/properties/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  useEffect(() => {
    load();
    fetchProjectList<{ id: string; name: string }>().then(setProjects);
  }, [id]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
  }, [tab, id]);

  useEffect(() => {
    if (bien && (location.state as { edit?: boolean } | null)?.edit) {
      setForm(bienToForm(bien));
      setEditOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [bien, location.state, location.pathname, navigate]);

  useEffect(() => {
    if (!form.projectId) {
      setFloors([]);
      return;
    }
    setLoadingFloors(true);
    api(`/immobilier/projects/${form.projectId}/tree`)
      .then((tree) => setFloors(flattenProjectFloors(tree, t)))
      .catch(() => setFloors([]))
      .finally(() => setLoadingFloors(false));
  }, [form.projectId, t]);

  async function onUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    await uploadDocument(file, { name: file.name, category: 'bien', propertyId: id, entityType: 'property', entityId: id });
    load();
    e.target.value = '';
  }

  async function onUploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const fd = new FormData();
    fd.append('file', file);
    await uploadForm(`/immobilier/properties/${id}/photo`, fd);
    load();
    e.target.value = '';
  }

  async function updateStatus(status: string) {
    await api(`/immobilier/properties/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    load();
  }

  function openEdit() {
    if (!bien) return;
    setForm(bienToForm(bien));
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/immobilier/properties/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          surface: form.surface ? Number(form.surface) : null,
          rooms: form.rooms ? Number(form.rooms) : null,
          price: form.price ? Number(form.price) : null,
          projectId: form.projectId || null,
          floorId: form.floorId || null,
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
      await api(`/immobilier/properties/${id}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      navigate('/biens');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printFiche() {
    if (!bien) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${bien.reference}</title></head><body style="font-family:sans-serif;padding:24px;font-size:12px">
      <h1>Fiche bien — GIC</h1>
      <h2>${bien.name} (${bien.reference})</h2>
      <p><b>Projet :</b> ${bien.project?.name || '—'}</p>
      <p><b>Statut :</b> ${bien.status}</p>
      <p><b>Surface :</b> ${bien.surface ? bien.surface + ' m²' : '—'}</p>
      <p><b>Prix :</b> ${bien.price ? bien.price + ' MAD' : '—'}</p>
      <p><b>Titre foncier :</b> ${bien.titleNumber || '—'}</p>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (!bien && !error) {
    return <p className="text-[12px] text-gic-muted p-6 text-center">{t('msg.loadingProperty')}</p>;
  }

  if (error && !bien) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/biens" className="mt-2" />
      </Card>
    );
  }

  const sales = bien.sales || [];
  const rentals = bien.rentals || [];
  const docs = bien.documents || [];
  const activeSale = sales.find((s: any) => s.status !== 'résiliée' && s.client) || sales.find((s: any) => s.client);
  const activeRental = rentals.find((r: any) => r.status !== 'résiliée' && r.client) || rentals.find((r: any) => r.client);
  const buyer = activeSale?.client || null;
  const tenant = activeRental?.client || null;
  const isSold = bien.status === 'vendu' || !!buyer;
  const isRented = bien.status === 'loué' || (!buyer && !!tenant);
  const hierarchy = bien.floor
    ? `${bien.floor.lot?.bloc?.tranche?.name ? 'Tranche ' + bien.floor.lot.bloc.tranche.name + ' › ' : ''}${bien.floor.lot?.bloc?.name ? 'Bloc ' + bien.floor.lot.bloc.name + ' › ' : ''}${bien.floor.lot?.name ? 'Lot ' + bien.floor.lot.name + ' › ' : ''}Étage ${bien.floor.name}`
    : '—';

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/biens" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            {bien.photo ? (
              <img src={bien.photo} alt="" />
            ) : (
              <div className="mac-detail-photo-fallback">
                <Building2 size={22} strokeWidth={1.75} />
              </div>
            )}
            <label className="mac-detail-photo-cam" title={t('actions.changePhoto')}>
              <Camera size={12} strokeWidth={2} />
              <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" onChange={onUploadPhoto} />
            </label>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.property360')}</p>
            <h1 className="mac-detail-name truncate">{bien.name}</h1>
            <p className="mac-detail-meta">
              {bien.reference}
              {bien.city ? ` · ${bien.city}` : ''}
              {bien.project?.name ? ` · ${bien.project.name}` : ''}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <StatusPill status={bien.status} quiet />
              {bien.surface && <span className="mac-chip mac-chip-gray">{bien.surface} m²</span>}
              {bien.rooms && <span className="mac-chip mac-chip-gray">{bien.rooms} {t('fields.rooms').toLowerCase()}</span>}
              {bien.titleNumber && <span className="mac-chip mac-chip-blue">TF {bien.titleNumber}</span>}
            </div>
            {isSold && buyer && (
              <p className="mac-detail-meta mt-2">
                Acheté par{' '}
                <Link to={`/clients/${buyer.id}`} className="text-[#007aff] hover:opacity-70 font-medium inline-flex items-center gap-1">
                  {buyer.firstName} {buyer.lastName}
                  {buyer.reference ? ` (${buyer.reference})` : ''}
                  <ExternalLink size={10} />
                </Link>
                {activeSale?.reference && (
                  <>
                    {' · '}
                    <Link to={`/ventes/${activeSale.id}`} className="text-[#007aff] hover:opacity-70">
                      {activeSale.reference}
                    </Link>
                  </>
                )}
              </p>
            )}
            {isRented && tenant && (
              <p className="mac-detail-meta mt-2">
                Loué à{' '}
                <Link to={`/clients/${tenant.id}`} className="text-[#007aff] hover:opacity-70 font-medium inline-flex items-center gap-1">
                  {tenant.firstName} {tenant.lastName}
                  <ExternalLink size={10} />
                </Link>
              </p>
            )}
            {bien.project?.id && (
              <p className="mac-detail-meta mt-2">
                <Link to={`/projets/${bien.project.id}`} className="text-[#007aff] hover:opacity-70 inline-flex items-center gap-1">
                  {bien.project.name}
                  <ExternalLink size={10} />
                </Link>
              </p>
            )}
          </div>
        </div>
        <div className="mac-page-actions">
          {buyer && (
            <Link to={`/clients/${buyer.id}`}><Btn variant="secondary" icon={User}>{t('actions.buyerFiche')}</Btn></Link>
          )}
          {!buyer && tenant && (
            <Link to={`/clients/${tenant.id}`}><Btn variant="secondary" icon={User}>{t('actions.tenantFiche')}</Btn></Link>
          )}
          {bien.project?.id && (
            <Link to={`/projets/${bien.project.id}`}><Btn variant="secondary" icon={MapPin}>{t('fields.project')}</Btn></Link>
          )}
          <Btn variant="secondary" icon={Printer} onClick={printFiche}>{t('common.print')}</Btn>
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteOpen(true); setDeleteMotif(''); }} />
          </div>
                 </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-4 mb-4">
        <KpiCard title={t('fields.price')} value={bien.price ? formatMadCompact(bien.price) : '—'} icon={TrendingUp} tone="violet" compact />
        <KpiCard title={t('fields.surface')} value={bien.surface ? `${bien.surface} m²` : '—'} icon={Home} tone="emerald" compact />
        <KpiCard title={t('tabs.sales')} value={sales.length} icon={FileText} tone="coral" />
        <KpiCard title={t('tabs.rentals')} value={rentals.length} icon={Building2} tone="amber" />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsPropertyAria')}
            items={[
              { id: 'info', label: t('tabs.informations'), icon: InfoIcon },
              { id: 'transactions', label: t('tabs.transactions'), icon: CreditCard, badge: sales.length + rentals.length },
              { id: 'documents', label: t('tabs.documents'), icon: FileText, badge: docs.length },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >
        {tab === 'info' && (
          <div className="space-y-4 mt-1">
            {isSold && buyer && (
              <div className="mac-section-card">
                <p className="mac-info-label mb-2">{t('fields.buyer')}</p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/clients/${buyer.id}`} className="mac-table-ref text-[14px] font-semibold">
                      {buyer.firstName} {buyer.lastName}
                    </Link>
                    <p className="text-[11px] text-gic-muted mt-0.5">
                      {buyer.reference || '—'}
                      {buyer.phone1 ? ` · ${buyer.phone1}` : ''}
                      {buyer.email ? ` · ${buyer.email}` : ''}
                    </p>
                    {activeSale && (
                      <p className="text-[11px] text-gic-muted mt-1">
                        Vente{' '}
                        <Link to={`/ventes/${activeSale.id}`} className="text-[#007aff]">
                          {activeSale.reference}
                        </Link>
                        {' · '}Net {formatMad(activeSale.netPrice)} · Payé {formatMad(activeSale.totalPaid)}
                        {activeSale.remaining > 0 ? ` · Reste ${formatMad(activeSale.remaining)}` : ''}
                      </p>
                    )}
                  </div>
                  <Link to={`/clients/${buyer.id}`}>
                    <Btn variant="secondary" icon={ExternalLink}>{t('actions.viewClientFiche')}</Btn>
                  </Link>
                </div>
              </div>
            )}
            {isRented && tenant && (
              <div className="mac-section-card">
                <p className="mac-info-label mb-2">{t('fields.tenant')}</p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/clients/${tenant.id}`} className="mac-table-ref text-[14px] font-semibold">
                      {tenant.firstName} {tenant.lastName}
                    </Link>
                    <p className="text-[11px] text-gic-muted mt-0.5">
                      {tenant.reference || '—'}
                      {tenant.phone1 ? ` · ${tenant.phone1}` : ''}
                    </p>
                  </div>
                  <Link to={`/clients/${tenant.id}`}>
                    <Btn variant="secondary" icon={ExternalLink}>{t('actions.viewClientFiche')}</Btn>
                  </Link>
                </div>
              </div>
            )}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-[12px]">
              <Info label={t('fields.project')} value={bien.project?.name || '—'} />
              <Info label={t('fields.city')} value={bien.city || '—'} />
              <Info label={t('fields.hierarchy')} value={hierarchy} />
              <Info label={t('fields.rooms')} value={bien.rooms ?? '—'} />
              <Info label={t('fields.titleDeedShort')} value={bien.titleNumber || '—'} />
              <Info label={t('fields.createdAt')} value={formatDate(bien.createdAt)} />
              <div>
                <p className="text-[10px] text-gic-muted uppercase mb-1">{t('actions.changeStatus')}</p>
                <Select value={bien.status} onChange={(e) => updateStatus(e.target.value)}>
                  <option value="disponible">{t('status.available')}</option>
                  <option value="réservé">{t('status.reserved')}</option>
                  <option value="vendu">{t('status.sold')}</option>
                  <option value="loué">{t('status.rented')}</option>
                  <option value="indisponible">{t('fields.unavailable')}</option>
                </Select>
              </div>
            </div>
            {bien.description && (
              <div className="mac-section-card">
                <p className="mac-info-label">{t('fields.description')}</p>
                <p className="text-[12px] leading-relaxed">{bien.description}</p>
              </div>
            )}
            {bien.contractualDesc && (
              <div className="mac-section-card">
                <p className="mac-info-label">{t('fields.contractualDescription')}</p>
                <p className="text-[12px] leading-relaxed">{bien.contractualDesc}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'transactions' && (
          <div className="space-y-4 mt-1 text-[12px]">
            <div className="flex flex-wrap gap-2">
              <Link to="/ventes"><Btn variant="secondary" icon={TrendingUp}>{t('pages.sales')}</Btn></Link>
              <Link to="/locations"><Btn variant="secondary" icon={Home}>{t('pages.rentals')}</Btn></Link>
            </div>
            <div>
              <h3 className="font-semibold mb-2">{t('tabs.sales')}</h3>
              {sales.length === 0 ? (
                <p className="text-gic-muted">{t('msg.emptySalesShort')}</p>
              ) : (
                <div className="space-y-4">
                  {sales.map((s: any) => (
                    <div key={s.id} className="mac-section-card !p-0 overflow-hidden">
                      <div
                        className="mac-row cursor-pointer"
                        onClick={() => navigate(`/ventes/${s.id}`)}
                      >
                        <div className="min-w-0">
                          <p className="mac-row-title">
                            <Link to={`/ventes/${s.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>
                              {s.reference}
                            </Link>
                          </p>
                          <p className="mac-row-subtitle">
                            {s.client ? (
                              <Link to={`/clients/${s.client.id}`} className="text-[#007aff]" onClick={(e) => e.stopPropagation()}>
                                {s.client.firstName} {s.client.lastName}
                              </Link>
                            ) : '—'}
                            {' · '}Net {formatMad(s.netPrice)} · Payé {formatMad(s.totalPaid)} · Reste {formatMad(s.remaining)}
                          </p>
                        </div>
                        <StatusPill status={s.status} quiet />
                      </div>
                      {(s.payments || []).length > 0 && (
                        <div className="px-3 pb-3">
                          <p className="text-[10px] uppercase text-gic-muted mb-1.5">{t('tabs.payments')}</p>
                          <TableWrap mac>
                            <thead>
                              <tr>
                                <Th mac>{t('columns.date')}</Th>
                                <Th mac>{t('columns.amount')}</Th>
                                <Th mac>{t('columns.mode')}</Th>
                                <Th mac>{t('columns.bank')}</Th>
                                <Th mac>{t('columns.proof')}</Th>
                                <Th mac>{t('columns.receipt')}</Th>
                              </tr>
                            </thead>
                            <tbody>
                              {(s.payments as any[]).map((p) => (
                                <tr
                                  key={p.id}
                                  className="cursor-pointer"
                                  onClick={() => navigate(`/encaissements/${p.id}`)}
                                >
                                  <Td mac className="mac-table-muted whitespace-nowrap">{formatDate(p.date)}</Td>
                                  <Td mac className="font-medium">{formatMad(p.amount)}</Td>
                                  <Td mac>{paymentModeLabel(p.operationType)}</Td>
                                  <Td mac className="mac-table-muted">
                                    {isBankPaymentMode(p.operationType) ? (p.bank || '—') : '—'}
                                  </Td>
                                  <Td mac onClick={(e) => e.stopPropagation()}>
                                    {p.proofFile ? (
                                      <a
                                        href={fileUrl(p.proofFile)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[#007aff] hover:opacity-70"
                                      >
                                        {t('common.view')}
                                      </a>
                                    ) : (
                                      <span className="mac-table-muted">—</span>
                                    )}
                                  </Td>
                                  <Td mac className="mac-table-muted">{p.receiptNo || '—'}</Td>
                                </tr>
                              ))}
                            </tbody>
                          </TableWrap>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="font-semibold mb-2">{t('tabs.rentals')}</h3>
              {rentals.length === 0 ? (
                <p className="text-gic-muted">{t('msg.emptyRentalsShort')}</p>
              ) : (
                <div className="space-y-4">
                  {rentals.map((r: any) => (
                    <div key={r.id} className="mac-section-card !p-0 overflow-hidden">
                      <div
                        className="mac-row cursor-pointer"
                        onClick={() => navigate(`/locations/${r.id}`)}
                      >
                        <div className="min-w-0">
                          <p className="mac-row-title">
                            <Link to={`/locations/${r.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>
                              {r.reference}
                            </Link>
                          </p>
                          <p className="mac-row-subtitle">
                            {r.client ? (
                              <Link to={`/clients/${r.client.id}`} className="text-[#007aff]" onClick={(e) => e.stopPropagation()}>
                                {r.client.firstName} {r.client.lastName}
                              </Link>
                            ) : '—'}
                            {' · '}Payé {formatMad(r.totalPaid)}
                          </p>
                        </div>
                        <StatusPill status={r.status} quiet />
                      </div>
                      {(r.payments || []).length > 0 && (
                        <div className="px-3 pb-3">
                          <p className="text-[10px] uppercase text-gic-muted mb-1.5">{t('tabs.payments')}</p>
                          <TableWrap mac>
                            <thead>
                              <tr>
                                <Th mac>{t('columns.date')}</Th>
                                <Th mac>{t('columns.amount')}</Th>
                                <Th mac>{t('columns.mode')}</Th>
                                <Th mac>{t('columns.bank')}</Th>
                                <Th mac>{t('columns.proof')}</Th>
                                <Th mac>{t('columns.receipt')}</Th>
                              </tr>
                            </thead>
                            <tbody>
                              {(r.payments as any[]).map((p) => (
                                <tr
                                  key={p.id}
                                  className="cursor-pointer"
                                  onClick={() => navigate(`/encaissements/${p.id}`)}
                                >
                                  <Td mac className="mac-table-muted whitespace-nowrap">{formatDate(p.date)}</Td>
                                  <Td mac className="font-medium">{formatMad(p.amount)}</Td>
                                  <Td mac>{paymentModeLabel(p.operationType)}</Td>
                                  <Td mac className="mac-table-muted">
                                    {isBankPaymentMode(p.operationType) ? (p.bank || '—') : '—'}
                                  </Td>
                                  <Td mac onClick={(e) => e.stopPropagation()}>
                                    {p.proofFile ? (
                                      <a
                                        href={fileUrl(p.proofFile)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[#007aff] hover:opacity-70"
                                      >
                                        {t('common.view')}
                                      </a>
                                    ) : (
                                      <span className="mac-table-muted">—</span>
                                    )}
                                  </Td>
                                  <Td mac className="mac-table-muted">{p.receiptNo || '—'}</Td>
                                </tr>
                              ))}
                            </tbody>
                          </TableWrap>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'documents' && (
          <div className="space-y-4 mt-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] text-gic-muted">Titres fonciers, plans, photos, contrats…</p>
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-2 rounded-lg border border-gic-border px-3 py-2 text-[12px] font-medium hover:bg-black/[0.03]">
                  <Upload size={14} /> {t('actions.addFile')}
                </span>
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={onUploadDoc} />
              </label>
            </div>
            {docs.length === 0 ? (
              <p className="text-[12px] text-gic-muted">{t('msg.emptyDocuments')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('fields.file')}</Th>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d: any) => (
                    <tr key={d.id}>
                      <Td mac className="font-medium">{d.name}</Td>
                      <Td mac className="mac-table-muted">{formatDate(d.createdAt)}</Td>
                      <Td mac className="mac-td-actions">
                        <a href={d.path} target="_blank" rel="noreferrer" className="mac-action-btn mac-action-btn-blue" title={t('common.view')}>
                          <ExternalLink size={14} strokeWidth={2.15} />
                        </a>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}

        {tab === 'historique' && (
          <div className="mt-1">
            {history.length === 0 ? (
              <p className="text-[12px] text-gic-muted py-2">{t('msg.emptyHistory')}</p>
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
                      <Td mac className="mac-table-muted">{formatDate(h.createdAt)}</Td>
                      <Td mac className="capitalize">{h.action}</Td>
                      <Td mac className="mac-table-muted">
                        {h.user ? `${h.user.firstName} ${h.user.lastName}` : '—'}
                      </Td>
                      <Td mac className="mac-table-muted">{h.details || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}
      </DetailShell>

      <Modal open={editOpen} size="lg" title={t('actions.editProperty')} onClose={() => setEditOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-bien-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="edit-bien-form" onSubmit={save}>
          <BienFormFields form={form} setForm={setForm} projects={projects} floors={floors} loadingFloors={loadingFloors} />
        </form>
      </Modal>

      <Modal open={deleteOpen} title={t('actions.deleteProperty')} onClose={() => setDeleteOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn></>}
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.propertyDeleteBlocked')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.motifDeletePlaceholder')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] text-gic-muted uppercase">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
