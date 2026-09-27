import { extractLegacyPrintBody, printWithCompany } from '../lib/companyPrint';
import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Pencil, Trash2, Printer, Wrench, AlertTriangle, ExternalLink, MapPin, Fuel, ClipboardList, FileText,
  Upload, Info, History, Bell, UserRound, Landmark, CalendarRange, Gauge, Receipt, Calculator, Hammer, RotateCcw, Clock, Wallet,
} from 'lucide-react';
import { api, formatDate, formatMad, uploadDocument, uploadForm } from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacDateInput, Modal, TableWrap, Td, Th, PageBackLink, SectionTitle,
} from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';
import { EnginFormFields, emptyEnginForm, enginFormToBody, enginToForm, type EnginFormData } from '../components/EnginFormFields';
import MacProfilePhoto from '../components/MacProfilePhoto';
import DriverVehiclePanel from '../components/DriverVehiclePanel';
import { fileUrl, printDocumentFiche } from '../lib/documentDisplay';
import { AssignmentsPanel } from '../components/engins/Assignments';
import { ExpensePanel, FuelPanel, UsagePanel } from '../components/engins/Logs';
import { MaintenanceModal } from '../components/engins/MaintenanceModal';
import { CostChips, DeleteMotifModal, FleetStatusPill, InfoRow, invalidateFleetRefs } from '../components/engins/FleetCommon';
import {
  chantierTrancheLabel, enginLabel, errorMessage, fleetStatusLabel, formatMad2, kindLabel, ownershipLabel, queryString,
  todayISO, yearStartISO, type CostBucket,
} from '../lib/engins';

type Tab =
  | 'infos' | 'acquisition' | 'affectations' | 'utilisation' | 'chauffeurs' | 'missions' | 'gps'
  | 'maintenance' | 'carburant' | 'depenses' | 'couts' | 'documents' | 'rappels' | 'historique';

type EnginCosts = {
  period: { from: string; to: string };
  analytics: CostBucket & { hours: number; km: number; costPerHour: number | null; availableDays: number; assignedDays: number; utilizationRate: number; downtimeDays: number };
  imputed: {
    totals: CostBucket & { imputed: number; unallocated: number };
    byChantier: (CostBucket & { chantierId: string; chantierName: string })[];
    byTranche: (CostBucket & { chantierId: string; chantierName: string; tranche: string })[];
  };
  depreciation: { annual: number; daily: number; netBookValue: number; schedule: { year: number; from: string; annuity: number; daily: number; cumulated: number; netValue: number }[] } | null;
  rental: { dailyRate: number | null; contract: { days: number; base: number; extras: number; total: number }; tvaAmount: number } | null;
  assignments: {
    id: string; chantierId: string | null; chantierName: string | null; projectName: string | null; tranche: string | null;
    startDate: string; endDate: string | null; status: string; days: number; hours: number; dailyCost: number;
    plannedCost: number; actualCost: number; expensesShare: number; totalCost: number;
  }[];
};

function paperAlertClass(date?: string | null) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);
  if (d < now) return 'text-gic-coral';
  if (d <= in30) return 'text-gic-amber';
  return '';
}

export default function EnginDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [engin, setEngin] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [history, setHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [maintOpen, setMaintOpen] = useState<'entretien' | 'reparation' | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [gpsData, setGpsData] = useState<{ latest: any; history: any[] }>({ latest: null, history: [] });
  const [gpsForm, setGpsForm] = useState({ lat: '', lng: '', source: 'manual' });
  const [form, setForm] = useState<EnginFormData>(emptyEnginForm());
  const [costs, setCosts] = useState<EnginCosts | null>(null);
  const [costFrom, setCostFrom] = useState(yearStartISO());
  const [costTo, setCostTo] = useState(todayISO());
  const [reloadKey, setReloadKey] = useState(0);

  function load() {
    if (!id) return;
    setError('');
    api(`/engins/${id}`).then(setEngin).catch((err) => setError(errorMessage(err, t('common.error'))));
  }

  function loadCosts() {
    if (!id) return;
    api<EnginCosts>(`/engins/${id}/costs?${queryString({ dateFrom: costFrom, dateTo: costTo })}`).then(setCosts).catch(() => setCosts(null));
  }

  function refreshAll() {
    load();
    loadCosts();
    invalidateFleetRefs();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadCosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, costFrom, costTo]);

  function loadGps() {
    if (!id) return;
    api(`/engins/${id}/gps`).then(setGpsData).catch(() => setGpsData({ latest: null, history: [] }));
  }

  useEffect(() => {
    if (tab === 'historique' && id) api(`/engins/${id}/history`).then(setHistory).catch(() => setHistory([]));
    if (tab === 'gps') {
      loadGps();
      const timer = setInterval(loadGps, 30000);
      return () => clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      await uploadForm(`/engins/${id}/photo`, fd);
      load();
    } catch (err) {
      await appAlert(errorMessage(err, t('msg.uploadError')));
    }
    e.target.value = '';
  }

  async function onUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      await uploadDocument(file, { name: file.name, category: 'engin', enginId: id, entityType: 'Engin', entityId: id });
      load();
    } catch (err) {
      await appAlert(errorMessage(err, t('msg.uploadError')));
    }
    e.target.value = '';
  }

  async function deleteDoc(docId: string) {
    if (!await appConfirm(t('msg.confirmDeleteDocument'))) return;
    await api(`/documents/${docId}`, { method: 'DELETE' });
    load();
  }

  function openEdit() {
    if (!engin) return;
    setForm(enginToForm(engin));
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/engins/${id}`, { method: 'PUT', body: JSON.stringify(enginFormToBody(form)) });
      setEditOpen(false);
      refreshAll();
    } catch (err) {
      await appAlert(errorMessage(err, t('common.error')));
    }
  }

  async function confirmDelete(motif: string) {
    try {
      await api(`/engins/${id}`, { method: 'DELETE', body: JSON.stringify({ motif }) });
      invalidateFleetRefs();
      navigate('/engins');
    } catch (err) {
      await appAlert(errorMessage(err, t('common.error')));
    }
  }

  async function release() {
    try {
      await api(`/engins/${id}/release`, { method: 'POST', body: JSON.stringify({}) });
      refreshAll();
    } catch (err) {
      await appAlert(errorMessage(err, t('common.error')));
    }
  }

  async function addGps(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/engins/${id}/gps`, { method: 'POST', body: JSON.stringify({ lat: gpsForm.lat, lng: gpsForm.lng, source: gpsForm.source }) });
      setGpsForm({ lat: '', lng: '', source: 'manual' });
      loadGps();
    } catch (err) {
      await appAlert(errorMessage(err, t('common.error')));
    }
  }

  async function printFiche() {
    if (!engin) return;
    const a = costs?.analytics;
    const dep = costs?.depreciation;
    await printWithCompany({
      title: `${kindLabel(engin.kind, t)} — ${enginLabel(engin)}`,
      bodyHtml: extractLegacyPrintBody(`<html><body style="font-family:sans-serif;padding:24px;font-size:12px">
      <h1>${t('fleet.print.fiche')} — GIC</h1>
      <h2>${enginLabel(engin)}</h2>
      <p><b>${t('fleet.fields.kind')} :</b> ${kindLabel(engin.kind, t)} · <b>${t('fleet.fields.mode')} :</b> ${ownershipLabel(engin.ownershipType, t)} · <b>${t('fleet.fields.status')} :</b> ${fleetStatusLabel(engin.status, t)}</p>
      <p><b>${t('fleet.fields.type')} :</b> ${engin.genre || '—'} · <b>${t('fleet.fields.brand')} :</b> ${engin.brand || '—'} · <b>${t('fleet.fields.model')} :</b> ${engin.model || '—'}</p>
      <p><b>${t('fleet.fields.serialNumber')} :</b> ${engin.chassisNo || '—'} · <b>${t('fleet.fields.matricule')} :</b> ${engin.matricule || '—'}</p>
      <p><b>${t('fleet.fields.location')} :</b> ${engin.location || '—'} · <b>${t('fleet.fields.counter')} :</b> ${engin.counterValue ?? '—'} ${engin.counterUnit || ''}</p>
      ${dep ? `<p><b>${t('fleet.fields.purchasePrice')} :</b> ${formatMad(engin.purchasePrice || 0)} · <b>${t('fleet.fields.annualDepreciation')} :</b> ${formatMad(dep.annual)} · <b>${t('fleet.fields.dailyDepreciation')} :</b> ${formatMad2(dep.daily)} · <b>${t('fleet.fields.netBookValue')} :</b> ${formatMad(dep.netBookValue)}</p>` : ''}
      ${costs?.rental ? `<p><b>${t('fleet.fields.rentalSupplier')} :</b> ${engin.rentalSupplierRef?.companyName || engin.rentalSupplier || '—'} · <b>${t('fleet.fields.rentalPrice')} :</b> ${engin.rentalPrice ? `${formatMad(engin.rentalPrice)} / ${t(`fleet.rentalUnit.${engin.rentalUnit || 'mois'}`)}` : '—'} · <b>${t('fleet.fields.dailyRate')} :</b> ${costs.rental.dailyRate != null ? formatMad2(costs.rental.dailyRate) : '—'}</p>` : ''}
      ${a ? `<p><b>${t('fleet.sections.costs')} (${formatDate(costs!.period.from)} → ${formatDate(costs!.period.to)}) :</b> ${formatMad(a.total)} · ${t('fleet.kpi.utilization')} ${a.utilizationRate} % · ${t('fleet.kpi.downtime')} ${a.downtimeDays} j</p>` : ''}
    </body></html>`, { grid: true }),
    });
  }

  if (!engin && !error) return <p className="text-[12px] text-gic-muted p-6">{t('common.loading')}</p>;

  if (error && !engin) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/engins" className="mt-2" />
      </Card>
    );
  }

  const isRented = engin.ownershipType === 'loue';
  const missionCount = engin._count?.missions ?? engin.missions?.length ?? 0;
  const maintCount = engin._count?.maintenances ?? engin.maintenances?.length ?? 0;
  const assignmentCount = engin._count?.assignments ?? 0;
  const docs = engin.documents || [];
  const docCount = engin._count?.documents ?? docs.length;
  const inShop = engin.status === 'en_maintenance' || engin.status === 'en_reparation';
  const current = engin.currentAssignment as { chantierName: string | null; tranche: string | null } | null;
  const papers = [
    { label: t('columns.assurance'), date: engin.insuranceExpiry },
    { label: t('columns.vignette'), date: engin.vignetteExpiry },
    { label: t('fields.technicalInspection'), date: engin.visitExpiry },
    { label: t('columns.autorisation'), date: engin.authExpiry },
  ];
  const analytics = costs?.analytics;
  const supplierName = engin.rentalSupplierRef?.companyName || engin.rentalSupplier;

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/engins" />
        <div className="mac-detail-hero-main">
          <MacProfilePhoto photo={engin.photo} firstName={engin.code || engin.matricule || engin.brand || t('msg.enginFallback')} editable onFileChange={onPhoto} />
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{kindLabel(engin.kind, t)} · {engin.code || '—'}</p>
            <h1 className="mac-detail-name truncate">{engin.designation || [engin.genre, engin.brand].filter(Boolean).join(' ') || t('msg.enginFallback')}</h1>
            <p className="mac-detail-meta">
              {[engin.genre, engin.brand, engin.model].filter(Boolean).join(' · ') || t('msg.typeNotProvided')}
              {' · '}{ownershipLabel(engin.ownershipType, t)}
              {engin.matricule ? ` · ${engin.matricule}` : ''}
              {engin.location ? ` · ${engin.location}` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <FleetStatusPill status={engin.status} />
              {current && (
                <button type="button" className="mac-chip mac-chip-blue" onClick={() => setTab('affectations')}>
                  <CalendarRange size={11} /> {chantierTrancheLabel(current.chantierName, current.tranche)}
                </button>
              )}
              {(() => {
                const currentDriver = (engin.driverAssignments || []).find((a: { endDate?: string | null }) => !a.endDate)?.workforce;
                return currentDriver ? (
                  <button type="button" className="mac-chip mac-chip-emerald" onClick={() => setTab('chauffeurs')}>
                    <UserRound size={11} /> {currentDriver.firstName} {currentDriver.lastName}
                  </button>
                ) : null;
              })()}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          {inShop && <Btn variant="secondary" icon={RotateCcw} onClick={release}>{t('fleet.actions.release')}</Btn>}
          <Btn variant="secondary" icon={Printer} onClick={printFiche}>{t('common.print')}</Btn>
          <Btn variant="secondary" icon={Wrench} onClick={() => setMaintOpen('entretien')}>{t('fleet.actions.newMaintenance')}</Btn>
          <Btn variant="secondary" icon={Hammer} onClick={() => setMaintOpen('reparation')}>{t('fleet.actions.newRepair')}</Btn>
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => setDeleteOpen(true)} />
          </div>
        </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-4 mb-4">
        <KpiCard
          title={isRented ? t('fleet.fields.dailyRate') : t('fleet.fields.dailyDepreciation')}
          value={isRented ? (costs?.rental?.dailyRate != null ? formatMad2(costs.rental.dailyRate) : '—') : (costs?.depreciation ? formatMad2(costs.depreciation.daily) : '—')}
          icon={isRented ? Receipt : Landmark}
          tone="violet"
          compact
          delta={!isRented && costs?.depreciation ? t('fleet.hints.nbv', { amount: formatMad(costs.depreciation.netBookValue) }) : undefined}
          deltaTone="muted"
        />
        <KpiCard title={t('fleet.kpi.periodCost')} value={analytics ? formatMad(analytics.total) : '—'} icon={Wallet} tone="amber" compact delta={analytics?.costPerHour != null ? t('fleet.hints.perHour', { amount: formatMad(analytics.costPerHour) }) : undefined} deltaTone="muted" />
        <KpiCard title={t('fleet.kpi.utilization')} value={analytics ? `${analytics.utilizationRate} %` : '—'} icon={Gauge} tone="emerald" delta={analytics ? t('fleet.kpi.utilizationDelta', { assigned: analytics.assignedDays, available: analytics.availableDays }) : undefined} deltaTone="muted" />
        <KpiCard title={t('fleet.kpi.downtime')} value={analytics ? t('fleet.hints.daysShort', { days: analytics.downtimeDays }) : '—'} icon={Clock} tone="coral" delta={t('msg.operationsCount', { count: maintCount })} deltaTone="muted" />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(tid) => setTab(tid as Tab)}
            ariaLabel={t('detail.sectionsEquipmentAria')}
            groups={[
              {
                id: 'identite',
                label: t('tabs.identity'),
                items: [
                  { id: 'infos', label: t('tabs.informations'), icon: Info },
                  { id: 'acquisition', label: isRented ? t('fleet.tabs.rental') : t('fleet.tabs.acquisition'), icon: isRented ? Receipt : Landmark },
                ],
              },
              {
                id: 'exploitation',
                label: t('tabs.exploitation'),
                items: [
                  { id: 'affectations', label: t('fleet.nav.affectations'), icon: CalendarRange, badge: assignmentCount || undefined },
                  { id: 'utilisation', label: t('fleet.tabs.usage'), icon: Gauge },
                  { id: 'chauffeurs', label: t('driverMgmt.driversTab'), icon: UserRound, badge: engin.driverAssignments?.length || undefined },
                  { id: 'missions', label: t('tabs.missions'), icon: ClipboardList, badge: missionCount || undefined },
                  { id: 'gps', label: t('tabs.gps'), icon: MapPin },
                ],
              },
              {
                id: 'entretien',
                label: t('fleet.tabs.upkeep'),
                items: [
                  { id: 'maintenance', label: t('fleet.tabs.maintenance'), icon: Wrench, badge: maintCount || undefined },
                  { id: 'carburant', label: t('fleet.tabs.fuel'), icon: Fuel },
                  { id: 'depenses', label: t('fleet.nav.depenses'), icon: Receipt },
                ],
              },
              {
                id: 'couts',
                label: t('fleet.tabs.costs'),
                items: [{ id: 'couts', label: t('fleet.nav.couts'), icon: Calculator }],
              },
              {
                id: 'docs',
                label: t('tabs.documents'),
                items: [
                  { id: 'documents', label: t('tabs.documents'), icon: FileText, badge: docCount || undefined },
                  { id: 'rappels', label: t('tabs.paperReminders'), icon: Bell },
                ],
              },
              {
                id: 'suivi',
                label: t('tabs.followUp'),
                items: [{ id: 'historique', label: t('tabs.history'), icon: History }],
              },
            ]}
          />
        }
      >
        {tab === 'infos' && (
          <div className="grid gap-4 lg:grid-cols-2 mt-1">
            <Card>
              <SectionTitle>{t('fleet.sections.identity')}</SectionTitle>
              <InfoRow label={t('fleet.fields.code')} value={engin.code} />
              <InfoRow label={t('fleet.fields.designation')} value={engin.designation} />
              <InfoRow label={t('fleet.fields.kind')} value={kindLabel(engin.kind, t)} />
              <InfoRow label={t('fleet.fields.type')} value={engin.genre} />
              <InfoRow label={t('fleet.fields.category')} value={engin.groupe} />
              <InfoRow label={t('fleet.fields.brand')} value={engin.brand} />
              <InfoRow label={t('fleet.fields.model')} value={engin.model} />
              <InfoRow label={t('fleet.fields.serialNumber')} value={engin.chassisNo} />
              <InfoRow label={t('fleet.fields.matricule')} value={engin.matricule} />
            </Card>
            <Card>
              <SectionTitle>{t('fleet.sections.technical')}</SectionTitle>
              <InfoRow label={t('fleet.fields.mode')} value={ownershipLabel(engin.ownershipType, t)} />
              <InfoRow label={t('fleet.fields.status')} value={<FleetStatusPill status={engin.status} />} />
              <InfoRow label={t('fleet.fields.location')} value={engin.location} />
              <InfoRow label={t('fleet.fields.acquisitionYear')} value={engin.acquisitionYear} />
              <InfoRow label={t('fleet.fields.commissioningDate')} value={engin.commissioningDate ? formatDate(engin.commissioningDate) : null} />
              <InfoRow label={t('fleet.fields.counter')} value={engin.counterValue != null ? `${engin.counterValue} ${engin.counterUnit || ''}` : null} />
              <InfoRow label={t('fields.workPassport')} value={engin.workPassport} />
              <InfoRow label={t('msg.gpsGsm')} value={`${engin.gpsNumber || '—'} / ${engin.gsmNumber || '—'}`} />
              <InfoRow label={t('msg.weightEmptyPtac')} value={`${engin.emptyWeight ?? '—'} / ${engin.totalWeight ?? '—'} kg`} />
            </Card>
          </div>
        )}

        {tab === 'acquisition' && (
          <div className="space-y-4 mt-1">
            {isRented ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <SectionTitle>{t('fleet.sections.rental')}</SectionTitle>
                  <InfoRow label={t('fleet.fields.rentalSupplier')} value={engin.rentalSupplierRef ? <Link to={`/fournisseurs/${engin.rentalSupplierRef.id}`} className="hover:text-[#007aff]">{supplierName}</Link> : supplierName} />
                  <InfoRow label={t('fleet.fields.rentalContract')} value={engin.rentalContractRef} />
                  <InfoRow label={t('fleet.fields.rentalPeriod')} value={`${engin.rentalStart ? formatDate(engin.rentalStart) : '—'} → ${engin.rentalEnd ? formatDate(engin.rentalEnd) : '…'}`} />
                  <InfoRow label={t('fleet.fields.rentalPrice')} value={engin.rentalPrice ? `${formatMad(engin.rentalPrice)} / ${t(`fleet.rentalUnit.${engin.rentalUnit || 'mois'}`)}` : null} />
                  <InfoRow label={t('fleet.fields.rentalDeposit')} value={engin.rentalDeposit ? formatMad(engin.rentalDeposit) : null} />
                  <InfoRow label={t('fleet.fields.rentalTransport')} value={engin.rentalTransport ? formatMad(engin.rentalTransport) : null} />
                  <InfoRow label={t('fleet.fields.rentalExtraFees')} value={engin.rentalExtraFees ? formatMad(engin.rentalExtraFees) : null} />
                  <InfoRow label={t('fleet.fields.rentalInsurance')} value={engin.rentalInsurance ? formatMad(engin.rentalInsurance) : null} />
                  <InfoRow label={t('fleet.fields.rentalTvaRate')} value={engin.rentalTvaRate != null ? `${engin.rentalTvaRate} %` : null} />
                  <InfoRow label={t('fleet.fields.rentalPaymentTerms')} value={engin.rentalPaymentTerms} />
                </Card>
                <Card>
                  <SectionTitle>{t('fleet.sections.costing')}</SectionTitle>
                  <InfoRow label={t('fleet.fields.dailyRate')} value={costs?.rental?.dailyRate != null ? formatMad2(costs.rental.dailyRate) : null} />
                  <InfoRow label={t('fleet.calc.daysElapsed')} value={costs?.rental ? t('fleet.hints.daysShort', { days: costs.rental.contract.days }) : null} />
                  <InfoRow label={t('fleet.calc.rentalBase')} value={costs?.rental ? formatMad(costs.rental.contract.base) : null} />
                  <InfoRow label={t('fleet.calc.rentalExtras')} value={costs?.rental ? formatMad(costs.rental.contract.extras) : null} />
                  <InfoRow label={t('fleet.calc.rentalTotalHt')} value={costs?.rental ? <strong>{formatMad(costs.rental.contract.total)}</strong> : null} />
                  <InfoRow label={t('fleet.calc.tva')} value={costs?.rental ? formatMad(costs.rental.tvaAmount) : null} />
                  <InfoRow label={t('fleet.calc.rentalTotalTtc')} value={costs?.rental ? formatMad(costs.rental.contract.total + costs.rental.tvaAmount) : null} />
                  <p className="text-[10px] text-gic-muted mt-2">{t('fleet.hints.rentalCalc')}</p>
                </Card>
              </div>
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <SectionTitle>{t('fleet.sections.acquisition')}</SectionTitle>
                    <InfoRow label={t('fleet.fields.purchasePrice')} value={engin.purchasePrice ? formatMad(engin.purchasePrice) : null} />
                    <InfoRow label={t('fleet.fields.acquisitionDate')} value={engin.acquisitionDate ? formatDate(engin.acquisitionDate) : null} />
                    <InfoRow label={t('fleet.fields.residualValue')} value={engin.residualValue != null ? formatMad(engin.residualValue) : null} />
                    <InfoRow label={t('fleet.fields.depreciationYears')} value={engin.depreciationYears ? t('fleet.hints.years', { years: engin.depreciationYears }) : null} />
                    <InfoRow label={t('fleet.fields.depreciationMethod')} value={engin.depreciationMethod ? t(`fleet.depMethod.${engin.depreciationMethod}`) : null} />
                    <InfoRow label={t('fleet.fields.usageCostPerHour')} value={engin.usageCostPerHour ? formatMad2(engin.usageCostPerHour) : null} />
                  </Card>
                  <Card>
                    <SectionTitle>{t('fleet.sections.costing')}</SectionTitle>
                    <InfoRow label={t('fleet.fields.annualDepreciation')} value={costs?.depreciation ? formatMad(costs.depreciation.annual) : null} />
                    <InfoRow label={t('fleet.fields.dailyDepreciation')} value={costs?.depreciation ? formatMad2(costs.depreciation.daily) : null} />
                    <InfoRow label={t('fleet.fields.netBookValue')} value={costs?.depreciation ? <strong>{formatMad(costs.depreciation.netBookValue)}</strong> : null} />
                    <p className="text-[10px] text-gic-muted mt-2">{t('fleet.hints.depreciationCalc')}</p>
                  </Card>
                </div>
                <Card padding={false}>
                  <div className="px-3 pt-3"><SectionTitle>{t('fleet.sections.schedule')}</SectionTitle></div>
                  {!costs?.depreciation?.schedule.length ? (
                    <EmptyState title={t('fleet.empty.schedule')} />
                  ) : (
                    <TableWrap mac>
                      <thead>
                        <tr>
                          <Th mac>{t('fleet.fields.year')}</Th>
                          <Th mac>{t('fleet.fields.from')}</Th>
                          <Th mac className="text-right">{t('fleet.fields.annuity')}</Th>
                          <Th mac className="text-right">{t('fleet.fields.dailyDepreciation')}</Th>
                          <Th mac className="text-right">{t('fleet.fields.cumulated')}</Th>
                          <Th mac className="text-right">{t('fleet.fields.netBookValue')}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {costs.depreciation.schedule.map((r) => (
                          <tr key={r.year}>
                            <Td mac>{r.year}</Td>
                            <Td mac className="text-[11px]">{formatDate(r.from)}</Td>
                            <Td mac className="text-right tabular-nums">{formatMad(r.annuity)}</Td>
                            <Td mac className="text-right tabular-nums">{formatMad2(r.daily)}</Td>
                            <Td mac className="text-right tabular-nums">{formatMad(r.cumulated)}</Td>
                            <Td mac className="text-right tabular-nums font-medium">{formatMad(r.netValue)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </TableWrap>
                  )}
                </Card>
              </>
            )}
          </div>
        )}

        {tab === 'affectations' && (
          <div className="mt-1">
            <AssignmentsPanel fixed={{ enginId: engin.id }} defaults={{ enginId: engin.id }} lock={{ engin: true }} showKpis onChanged={refreshAll} reloadKey={reloadKey} />
          </div>
        )}

        {tab === 'utilisation' && (
          <div className="mt-1"><UsagePanel fixed={{ enginId: engin.id }} showKpis onChanged={refreshAll} reloadKey={reloadKey} /></div>
        )}

        {tab === 'chauffeurs' && (
          <DriverVehiclePanel mode="engin" entityId={engin.id} initial={engin.driverAssignments} onChanged={load} />
        )}

        {tab === 'missions' && (
          (engin.missions || []).length === 0 ? (
            <p className="text-[12px] text-gic-muted mt-1">{t('msg.emptyMissionRecorded')}</p>
          ) : (
            <TableWrap mac>
              <thead><tr><Th mac>{t('columns.date')}</Th><Th mac>{t('columns.mission')}</Th><Th mac>{t('columns.chauffeur')}</Th><Th mac>{t('columns.chantier')}</Th></tr></thead>
              <tbody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {engin.missions.map((m: any) => (
                  <tr key={m.id} className="cursor-pointer" onClick={() => navigate(`/missions/${m.id}`)}>
                    <Td mac className="text-[11px]">{formatDate(m.date)}</Td>
                    <Td mac>{m.mission}</Td>
                    <Td mac>{m.driverName || '—'}</Td>
                    <Td mac>
                      {m.chantier ? (
                        <Link to={`/chantiers/${m.chantier.id}`} className="mac-table-ref inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {m.chantier.name} <ExternalLink size={10} />
                        </Link>
                      ) : '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )
        )}

        {tab === 'maintenance' && (
          <div className="mt-1">
            <div className="flex justify-end gap-2 mb-2">
              <Btn variant="secondary" icon={Wrench} onClick={() => setMaintOpen('entretien')}>{t('fleet.actions.newMaintenance')}</Btn>
              <Btn icon={Hammer} onClick={() => setMaintOpen('reparation')}>{t('fleet.actions.newRepair')}</Btn>
            </div>
            {(engin.maintenances || []).length === 0 ? (
              <p className="text-[12px] text-gic-muted">{t('msg.emptyMaintenanceRecorded')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('fleet.fields.maintKind')}</Th>
                    <Th mac>{t('columns.designation')}</Th>
                    <Th mac className="text-right">{t('fleet.fields.totalCostMaint')}</Th>
                    <Th mac className="text-right">{t('fleet.fields.downtimeDays')}</Th>
                    <Th mac>{t('fleet.fields.allocation')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {engin.maintenances.map((m: any) => (
                    <tr key={m.id} className="cursor-pointer" onClick={() => navigate(`/maintenance/${m.id}`)}>
                      <Td mac className="text-[11px]">{formatDate(m.date)}</Td>
                      <Td mac>
                        <span className={m.kind === 'reparation' ? 'mac-chip-orange' : 'mac-chip-blue'}>{t(`fleet.maintKind.${m.kind || 'entretien'}`)}</span>
                        <span className="block text-[10px] text-gic-muted mt-0.5">
                          {m.kind === 'reparation' ? m.breakdownNature || '—' : m.maintenanceType ? t(`fleet.maintType.${m.maintenanceType}`) : '—'}
                        </span>
                      </Td>
                      <Td mac>{m.designation}</Td>
                      <Td mac className="text-right tabular-nums">{m.budget != null ? formatMad(m.budget) : '—'}</Td>
                      <Td mac className="text-right tabular-nums">{m.downtimeDays ? t('fleet.hints.daysShort', { days: m.downtimeDays }) : '—'}</Td>
                      <Td mac className="text-[11px] mac-table-muted">
                        {m.allocation === 'direct' ? chantierTrancheLabel(m.chantier?.name, m.tranche) : t('fleet.allocationShort.reparti')}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}

        {tab === 'carburant' && <div className="mt-1"><FuelPanel fixed={{ enginId: engin.id }} showKpis onChanged={refreshAll} reloadKey={reloadKey} /></div>}

        {tab === 'depenses' && <div className="mt-1"><ExpensePanel fixed={{ enginId: engin.id }} showKpis onChanged={refreshAll} reloadKey={reloadKey} /></div>}

        {tab === 'couts' && (
          <div className="space-y-4 mt-1">
            <div className="flex flex-wrap items-center gap-2">
              <MacDateInput value={costFrom} onChange={setCostFrom} placeholder={t('fields.from')} className="w-36" />
              <MacDateInput value={costTo} onChange={setCostTo} placeholder={t('fields.to')} className="w-36" />
              <Link to={`/engins/couts?enginId=${engin.id}`} className="ml-auto text-[12px] text-[#007aff] hover:underline">{t('fleet.actions.openCosts')}</Link>
            </div>
            {!costs ? (
              <p className="text-[12px] text-gic-muted">{t('common.loading')}</p>
            ) : (
              <>
                <CostChips bucket={costs.analytics} />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Card><InfoRow label={t('fleet.kpi.hours')} value={`${costs.analytics.hours} h`} /><InfoRow label={t('fleet.kpi.km')} value={`${costs.analytics.km} km`} /></Card>
                  <Card><InfoRow label={t('fleet.kpi.costPerHour')} value={costs.analytics.costPerHour != null ? formatMad2(costs.analytics.costPerHour) : '—'} /><InfoRow label={t('fleet.kpi.utilization')} value={`${costs.analytics.utilizationRate} %`} /></Card>
                  <Card><InfoRow label={t('fleet.kpi.assignedDays')} value={costs.analytics.assignedDays} /><InfoRow label={t('fleet.kpi.availableDays')} value={costs.analytics.availableDays} /></Card>
                  <Card><InfoRow label={t('fleet.kpi.imputed')} value={formatMad(costs.imputed.totals.imputed)} /><InfoRow label={t('fleet.kpi.unallocated')} value={formatMad(costs.imputed.totals.unallocated)} /></Card>
                </div>
                <Card padding={false}>
                  <div className="px-3 pt-3"><SectionTitle>{t('fleet.sections.perAssignment')}</SectionTitle></div>
                  {costs.assignments.length === 0 ? (
                    <EmptyState title={t('fleet.empty.assignments')} />
                  ) : (
                    <TableWrap mac>
                      <thead>
                        <tr>
                          <Th mac>{t('fleet.fields.chantierTranche')}</Th>
                          <Th mac>{t('fleet.fields.period')}</Th>
                          <Th mac>{t('fleet.fields.status')}</Th>
                          <Th mac className="text-right">{t('fleet.fields.days')}</Th>
                          <Th mac className="text-right">{t('fleet.fields.hours')}</Th>
                          <Th mac className="text-right">{t('fleet.fields.plannedCost')}</Th>
                          <Th mac className="text-right">{t('fleet.fields.actualCost')}</Th>
                          <Th mac className="text-right">{t('fleet.fields.expensesShare')}</Th>
                          <Th mac className="text-right">{t('fleet.costCat.total')}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {costs.assignments.map((a) => (
                          <tr key={a.id}>
                            <Td mac>
                              {a.chantierId ? (
                                <Link to={`/chantiers/${a.chantierId}?tab=engins`} className="mac-table-ref">{chantierTrancheLabel(a.chantierName, a.tranche)}</Link>
                              ) : a.projectName || '—'}
                            </Td>
                            <Td mac className="text-[11px]">{formatDate(a.startDate)} → {a.endDate ? formatDate(a.endDate) : '…'}</Td>
                            <Td mac><FleetStatusPill status={a.status} /></Td>
                            <Td mac className="text-right tabular-nums">{a.days}</Td>
                            <Td mac className="text-right tabular-nums">{a.hours || '—'}</Td>
                            <Td mac className="text-right tabular-nums">{formatMad(a.plannedCost)}</Td>
                            <Td mac className="text-right tabular-nums">{formatMad(a.actualCost)}</Td>
                            <Td mac className="text-right tabular-nums">{formatMad(a.expensesShare)}</Td>
                            <Td mac className="text-right tabular-nums font-semibold">{formatMad(a.totalCost)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </TableWrap>
                  )}
                </Card>
                {costs.imputed.byTranche.length > 0 && (
                  <Card padding={false}>
                    <div className="px-3 pt-3"><SectionTitle>{t('fleet.tabs.byTranche')}</SectionTitle></div>
                    <TableWrap mac>
                      <thead>
                        <tr>
                          <Th mac>{t('fleet.fields.chantierTranche')}</Th>
                          <Th mac className="text-right">{t('fleet.costCat.amortissement')}</Th>
                          <Th mac className="text-right">{t('fleet.costCat.location')}</Th>
                          <Th mac className="text-right">{t('fleet.costCat.entretien')}</Th>
                          <Th mac className="text-right">{t('fleet.costCat.reparation')}</Th>
                          <Th mac className="text-right">{t('fleet.costCat.carburant')}</Th>
                          <Th mac className="text-right">{t('fleet.costCat.autres')}</Th>
                          <Th mac className="text-right">{t('fleet.costCat.total')}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {costs.imputed.byTranche.map((r) => (
                          <tr key={`${r.chantierId}-${r.tranche}`}>
                            <Td mac>{chantierTrancheLabel(r.chantierName, r.tranche || t('fleet.hints.wholeChantier'))}</Td>
                            <Td mac className="text-right tabular-nums">{formatMad(r.amortissement)}</Td>
                            <Td mac className="text-right tabular-nums">{formatMad(r.location)}</Td>
                            <Td mac className="text-right tabular-nums">{formatMad(r.entretien)}</Td>
                            <Td mac className="text-right tabular-nums">{formatMad(r.reparation)}</Td>
                            <Td mac className="text-right tabular-nums">{formatMad(r.carburant)}</Td>
                            <Td mac className="text-right tabular-nums">{formatMad(r.autres)}</Td>
                            <Td mac className="text-right tabular-nums font-semibold">{formatMad(r.total)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </TableWrap>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'gps' && (
          <div className="space-y-4 mt-1">
            <Card className="border-dashed border-gic-violet/40 bg-gic-violet-soft/20">
              <p className="text-[11px] font-medium text-gic-violet mb-1">{t('msg.gpsRealtimeTracker')}</p>
              <p className="text-[10px] text-gic-muted">
                POST <code className="bg-white px-1 rounded">/api/engins/gps/webhook</code> · Header <code className="bg-white px-1 rounded">x-gps-token</code>
              </p>
              <p className="text-[10px] text-gic-muted mt-1">{t('msg.gpsNumberEngin', { number: engin.gpsNumber || '—' })}</p>
            </Card>
            {gpsData.latest && (() => {
              const live = Date.now() - new Date(gpsData.latest.recordedAt).getTime() < 15 * 60 * 1000;
              return (
                <Card className="bg-gic-violet-soft/30">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[10px] text-gic-muted uppercase">{t('msg.lastPosition')}</p>
                    {live && gpsData.latest.source === 'tracker' && (
                      <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-medium">{t('msg.liveDirect')}</span>
                    )}
                  </div>
                  <p className="text-[12px] font-medium">{gpsData.latest.lat}, {gpsData.latest.lng}</p>
                  <p className="text-[11px] text-gic-muted">{formatDate(gpsData.latest.recordedAt)} · {gpsData.latest.source || 'manual'}</p>
                  <a href={`https://www.google.com/maps?q=${gpsData.latest.lat},${gpsData.latest.lng}`} target="_blank" rel="noreferrer" className="text-[10px] text-gic-violet hover:underline mt-2 inline-block">
                    {t('fields.openInMaps')}
                  </a>
                </Card>
              );
            })()}
            <form onSubmit={addGps} className="grid gap-3 sm:grid-cols-4 items-end">
              <Input label={t('fields.latitudeRequired')} required value={gpsForm.lat} onChange={(e) => setGpsForm({ ...gpsForm, lat: e.target.value })} />
              <Input label={t('fields.longitudeRequired')} required value={gpsForm.lng} onChange={(e) => setGpsForm({ ...gpsForm, lng: e.target.value })} />
              <Input label={t('fields.source')} value={gpsForm.source} onChange={(e) => setGpsForm({ ...gpsForm, source: e.target.value })} />
              <Btn type="submit">{t('actions.saveGpsPosition')}</Btn>
            </form>
            {(gpsData.history || []).length === 0 ? (
              <p className="text-[12px] text-gic-muted">{t('msg.emptyGps')}</p>
            ) : (
              <TableWrap mac>
                <thead><tr><Th mac>{t('columns.date')}</Th><Th mac>{t('fields.latitude')}</Th><Th mac>{t('fields.longitude')}</Th><Th mac>{t('columns.source')}</Th></tr></thead>
                <tbody>
                  {gpsData.history.map((g) => (
                    <tr key={g.id}>
                      <Td mac className="text-[11px]">{formatDate(g.recordedAt)}</Td>
                      <Td mac>{g.lat}</Td>
                      <Td mac>{g.lng}</Td>
                      <Td mac>{g.source || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}

        {tab === 'documents' && (
          <div className="space-y-3 mt-1">
            <label className="mac-upload-btn">
              <Upload size={14} /> {t('msg.uploadDocumentLabel')}
              <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={onUploadDoc} />
            </label>
            <div className="mac-section-card !p-0 overflow-hidden">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {docs.map((d: any) => (
                <div key={d.id} className="mac-row">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-[#007aff] shrink-0" />
                    <div className="min-w-0">
                      <p className="mac-row-title truncate">{d.name}</p>
                      <p className="mac-row-subtitle">
                        {t(`fleet.docCat.${d.category}`) === `fleet.docCat.${d.category}` ? d.category || 'doc' : t(`fleet.docCat.${d.category}`)} · {formatDate(d.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a href={fileUrl(d.path)} target="_blank" rel="noreferrer" className="mac-table-action px-2">{t('msg.viewDocShort')}</a>
                    <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={() => printDocumentFiche(d)} />
                    <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteDoc(d.id)} />
                  </div>
                </div>
              ))}
              {docs.length === 0 && <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyEquipmentDocs')}</p>}
            </div>
          </div>
        )}

        {tab === 'rappels' && (
          <div className="grid sm:grid-cols-2 gap-3 mt-1">
            {papers.map((p) => (
              <Card key={p.label} className={paperAlertClass(p.date) ? 'border-gic-amber/40' : ''}>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className={paperAlertClass(p.date) || 'text-gic-muted'} />
                  <div>
                    <p className="text-[11px] font-medium">{p.label}</p>
                    <p className={`text-[12px] ${paperAlertClass(p.date) || 'text-gic-muted'}`}>{p.date ? formatDate(p.date) : t('fields.notProvided')}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {tab === 'historique' && (
          history.length === 0 ? (
            <p className="text-[12px] text-gic-muted mt-1">{t('msg.emptyHistoryShort')}</p>
          ) : (
            <div className="space-y-2 mt-1">
              {history.map((h) => (
                <div key={h.id} className="rounded-xl border border-gic-border px-3 py-2 text-[11px]">
                  <p className="font-medium capitalize">{h.action} — {h.entity}</p>
                  <p className="text-gic-muted">{h.details || '—'}</p>
                  <p className="text-[10px] text-gic-muted mt-1">
                    {formatDate(h.createdAt)} · {h.user ? `${h.user.firstName} ${h.user.lastName}` : t('common.system')}
                  </p>
                </div>
              ))}
            </div>
          )
        )}
      </DetailShell>

      <Modal
        open={editOpen}
        size="xl"
        title={t('actions.editEquipment')}
        onClose={() => setEditOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-engin" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="edit-engin" onSubmit={save}><EnginFormFields form={form} setForm={setForm} isEdit /></form>
      </Modal>

      <DeleteMotifModal open={deleteOpen} title={t('actions.deleteEquipment')} onClose={() => setDeleteOpen(false)} onConfirm={confirmDelete} />

      <MaintenanceModal
        open={!!maintOpen}
        defaultKind={maintOpen || 'entretien'}
        enginId={engin.id}
        onClose={() => setMaintOpen(null)}
        onSaved={() => { refreshAll(); setReloadKey((k) => k + 1); }}
      />
    </div>
  );
}
