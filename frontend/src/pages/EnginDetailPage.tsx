import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';

import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  ArrowLeft, Pencil, Trash2, Printer, Wrench, AlertTriangle, ExternalLink, Camera,
  Truck, MapPin, Fuel, ClipboardList, FileText, Upload, Info, History, Bell,
} from 'lucide-react';

import { api, formatDate, formatMad, uploadDocument, uploadForm } from '../lib/api';

import {
  Btn, Card, Input, KpiCard, MacActionBtn, Modal, StatusPill, TableWrap, Td, Th, PageBackLink,
} from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';



import { EnginFormFields, emptyEnginForm, enginFormToBody, enginToForm, type EnginFormData } from '../components/EnginFormFields';
import { fileUrl, printDocumentFiche } from '../lib/documentDisplay';



type Tab = 'infos' | 'missions' | 'maintenance' | 'carburant' | 'gps' | 'documents' | 'rappels' | 'historique';



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

  const [engin, setEngin] = useState<any>(null);

  const [history, setHistory] = useState<any[]>([]);

  const [tab, setTab] = useState<Tab>('infos');

  const [error, setError] = useState('');

  const [editOpen, setEditOpen] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);

  const [deleteMotif, setDeleteMotif] = useState('');

  const [maintOpen, setMaintOpen] = useState(false);

  const [maintForm, setMaintForm] = useState({ designation: '', budget: '', responsible: '', date: new Date().toISOString().slice(0, 10) });

  const [fuelLogs, setFuelLogs] = useState<any[]>([]);

  const [gpsData, setGpsData] = useState<{ latest: any; history: any[] }>({ latest: null, history: [] });

  const [fuelForm, setFuelForm] = useState({ date: new Date().toISOString().slice(0, 10), liters: '', cost: '', station: '', counterValue: '' });

  const [gpsForm, setGpsForm] = useState({ lat: '', lng: '', source: 'manual' });

  const [form, setForm] = useState<EnginFormData>(emptyEnginForm());



  function load() {

    if (!id) return;

    setError('');

    api(`/engins/${id}`).then(setEngin).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));

  }



  function loadHistory() {

    if (!id) return;

    api(`/engins/${id}/history`).then(setHistory).catch(() => setHistory([]));

  }



  useEffect(() => {

    load();

  }, [id]);



  function loadFuel() {

    if (!id) return;

    api<{ items: any[] }>(`/engins/${id}/fuel`).then((r) => setFuelLogs(r.items || [])).catch(() => setFuelLogs([]));

  }



  function loadGps() {

    if (!id) return;

    api(`/engins/${id}/gps`).then(setGpsData).catch(() => setGpsData({ latest: null, history: [] }));

  }



  useEffect(() => {

    if (tab === 'historique') loadHistory();

    if (tab === 'carburant') loadFuel();

    if (tab === 'gps') {

      loadGps();

      const t = setInterval(loadGps, 30000);

      return () => clearInterval(t);

    }

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

      await appAlert(err instanceof Error ? err.message : t('msg.uploadError'));

    }

    e.target.value = '';

  }

  async function onUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      await uploadDocument(file, {
        name: file.name,
        category: 'engin',
        enginId: id,
        entityType: 'Engin',
        entityId: id,
      });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.uploadError'));
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

      load();

    } catch (err) {

      await appAlert(err instanceof Error ? err.message : t('common.error'));

    }

  }



  async function confirmDelete() {

    if (!deleteMotif.trim()) return;

    try {

      await api(`/engins/${id}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });

      navigate('/engins');

    } catch (err) {

      await appAlert(err instanceof Error ? err.message : t('common.error'));

    }

  }



  async function createMaint(e: React.FormEvent) {

    e.preventDefault();

    try {

      await api(`/engins/${id}/maintenances`, { method: 'POST', body: JSON.stringify(maintForm) });

      setMaintOpen(false);

      setMaintForm({ designation: '', budget: '', responsible: '', date: new Date().toISOString().slice(0, 10) });

      load();

    } catch (err) {

      await appAlert(err instanceof Error ? err.message : t('common.error'));

    }

  }



  async function addFuel(e: React.FormEvent) {

    e.preventDefault();

    try {

      await api(`/engins/${id}/fuel`, {

        method: 'POST',

        body: JSON.stringify({

          date: fuelForm.date,

          liters: fuelForm.liters,

          cost: fuelForm.cost || null,

          remark: fuelForm.station || null,

          counterValue: fuelForm.counterValue || null,

        }),

      });

      setFuelForm({ date: new Date().toISOString().slice(0, 10), liters: '', cost: '', station: '', counterValue: '' });

      loadFuel();

      load();

    } catch (err) {

      await appAlert(err instanceof Error ? err.message : t('common.error'));

    }

  }



  async function addGps(e: React.FormEvent) {

    e.preventDefault();

    try {

      await api(`/engins/${id}/gps`, {

        method: 'POST',

        body: JSON.stringify({ lat: gpsForm.lat, lng: gpsForm.lng, source: gpsForm.source }),

      });

      setGpsForm({ lat: '', lng: '', source: 'manual' });

      loadGps();

    } catch (err) {

      await appAlert(err instanceof Error ? err.message : t('common.error'));

    }

  }



  function printFiche() {

    if (!engin) return;

    const w = window.open('', '_blank');

    if (!w) return;

    w.document.write(`<html><body style="font-family:sans-serif;padding:24px;font-size:12px">

      <h1>Fiche engin — GIC</h1>

      <h2>${engin.matricule || '—'} — ${engin.brand || ''} ${engin.genre || ''}</h2>

      <p><b>Statut :</b> ${engin.status}</p>

      <p><b>GPS :</b> ${engin.gpsNumber || '—'} · <b>GSM :</b> ${engin.gsmNumber || '—'}</p>

      <p><b>Compteur :</b> ${engin.counterValue ?? '—'} ${engin.counterUnit || ''}</p>

      <p><b>Carburant :</b> ${engin.fuelLevel != null ? engin.fuelLevel + '%' : '—'}</p>

    </body></html>`);

    w.document.close();

    w.print();

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



  const missionCount = engin._count?.missions ?? engin.missions?.length ?? 0;

  const maintCount = engin._count?.maintenances ?? engin.maintenances?.length ?? 0;
  const docs = engin.documents || [];
  const docCount = engin._count?.documents ?? docs.length;

  const maintTotal = (engin.maintenances || []).reduce((s: number, m: any) => s + Number(m.budget || 0), 0);

  const papers = [
    { label: t('columns.assurance'), date: engin.insuranceExpiry },
    { label: t('columns.vignette'), date: engin.vignetteExpiry },
    { label: t('fields.technicalInspection'), date: engin.visitExpiry },
    { label: t('columns.autorisation'), date: engin.authExpiry },
  ];

  const ownershipKey = engin.ownershipType === 'loue' ? 'loue' : 'personnel';

  const photoLabel = engin.matricule || engin.brand || t('msg.enginFallback');



  return (

    <div className="space-y-0">

      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/engins" />
        <div className="mac-detail-hero-main">

          <div className="mac-detail-photo">

            {engin.photo ? (

              <img src={engin.photo} alt="" />

            ) : (

              <div className="mac-detail-photo-fallback">{photoLabel.slice(0, 2).toUpperCase()}</div>

            )}

            <label className="mac-detail-photo-cam" title={t('actions.changePhoto')}>

              <Camera size={12} strokeWidth={2} />

              <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" onChange={onPhoto} />

            </label>

          </div>

          <div className="min-w-0">

            <p className="mac-detail-eyebrow">{t('detail.equipment360')}</p>

            <h1 className="mac-detail-name truncate">

              {engin.matricule || t('msg.enginFallback')} — {engin.brand || ''}

            </h1>

            <p className="mac-detail-meta">

              {engin.genre || t('msg.typeNotProvided')}

              {' · '}{ownershipKey === 'loue' ? t('fields.ownershipRented') : t('fields.ownershipPersonal')}

              {engin.groupe ? ` · ${engin.groupe}` : ''}

              {' · '}{t('msg.gpsNumberPrefix', { number: engin.gpsNumber || '—' })}

            </p>

            <div className="flex flex-wrap items-center gap-2 mt-2">

              <StatusPill status={engin.status} quiet />

              {engin.fuelLevel != null && (

                <span className="mac-chip mac-chip-orange">{t('msg.fuelPercentDisplay', { level: engin.fuelLevel })}</span>

              )}

            </div>

          </div>

        </div>

        <div className="mac-page-actions">

          <Link to="/missions"><Btn variant="secondary" icon={ClipboardList}>{t('pages.missions')}</Btn></Link>

          <Btn variant="secondary" icon={Printer} onClick={printFiche}>{t('common.print')}</Btn>

          <Btn variant="secondary" icon={Wrench} onClick={() => setMaintOpen(true)}>{t('pages.maintenance')}</Btn>

          <div className="mac-action-group ml-0.5">

            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />

            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteOpen(true); setDeleteMotif(''); }} />

          </div>
        </div>

      </div>



      <div className="mac-kpi-grid mac-kpi-grid-4 mb-4">

        <KpiCard title={t('columns.counter')} value={engin.counterValue ?? '—'} icon={Truck} tone="violet" delta={engin.counterUnit || ''} deltaTone="muted" />

        <KpiCard title={t('columns.fuel')} value={engin.fuelLevel != null ? `${engin.fuelLevel}%` : '—'} icon={Fuel} tone="amber" />

        <KpiCard title={t('columns.missions')} value={missionCount} icon={MapPin} tone="emerald" />

        <KpiCard title={t('pages.maintenance')} value={formatMad(maintTotal)} icon={Wrench} tone="coral" compact delta={t('msg.operationsCount', { count: maintCount })} deltaTone="muted" />

      </div>



      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsEquipmentAria')}
            groups={[
              {
                id: 'identite',
                label: t('tabs.identity'),
                items: [
                  { id: 'infos', label: t('tabs.informations'), icon: Info },
                ],
              },
              {
                id: 'exploitation',
                label: t('tabs.exploitation'),
                items: [
                  { id: 'missions', label: t('tabs.missions'), icon: ClipboardList, badge: missionCount },
                  { id: 'maintenance', label: t('tabs.maintenance'), icon: Wrench, badge: maintCount },
                  { id: 'carburant', label: t('tabs.fuel'), icon: Fuel },
                  { id: 'gps', label: t('tabs.gps'), icon: MapPin },
                ],
              },
              {
                id: 'docs',
                label: t('tabs.documents'),
                items: [
                  { id: 'documents', label: t('tabs.documents'), icon: FileText, badge: docCount },
                  { id: 'rappels', label: t('tabs.paperReminders'), icon: Bell },
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

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-[12px] mt-1">

            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.ownershipLabel')}</p><p className="font-medium">{ownershipKey === 'loue' ? t('fields.ownershipRented') : t('fields.ownershipPersonal')}</p></div>

            {engin.ownershipType === 'loue' ? (

              <>

                <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.lessor')}</p><p>{engin.rentalSupplier || '—'}</p></div>

                <div><p className="text-gic-muted text-[10px] uppercase">{t('msg.monthlyRental')}</p><p>{engin.rentalMonthly ? formatMad(engin.rentalMonthly) : '—'}</p></div>

              </>

            ) : (

              <div><p className="text-gic-muted text-[10px] uppercase">{t('msg.purchasePriceLabel')}</p><p>{engin.purchasePrice ? formatMad(engin.purchasePrice) : '—'}</p></div>

            )}

            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.brand')}</p><p className="font-medium">{engin.brand || '—'}</p></div>

            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.genre')}</p><p>{engin.genre || '—'}</p></div>

            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.group')}</p><p>{engin.groupe || '—'}</p></div>

            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.workPassport')}</p><p>{engin.workPassport || '—'}</p></div>

            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.matricule')}</p><p>{engin.matricule || '—'}</p></div>

            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.chassisNo')}</p><p>{engin.chassisNo || '—'}</p></div>

            <div><p className="text-gic-muted text-[10px] uppercase">{t('msg.gpsGsm')}</p><p>{engin.gpsNumber || '—'} / {engin.gsmNumber || '—'}</p></div>

            <div><p className="text-gic-muted text-[10px] uppercase">{t('msg.gpsMount')}</p><p>{formatDate(engin.gpsMountDate)}</p></div>

            <div><p className="text-gic-muted text-[10px] uppercase">{t('msg.transfer')}</p><p>{formatDate(engin.transferDate)}</p></div>

            <div><p className="text-gic-muted text-[10px] uppercase">{t('msg.weightEmptyPtac')}</p><p>{engin.emptyWeight ?? '—'} / {engin.totalWeight ?? '—'} kg</p></div>

          </div>

        )}



        {tab === 'missions' && (

          (engin.missions || []).length === 0 ? (

            <p className="text-[12px] text-gic-muted mt-1">{t('msg.emptyMissionRecorded')}</p>

          ) : (

            <TableWrap mac className="mt-1">

              <thead><tr><Th mac>{t('columns.date')}</Th><Th mac>{t('columns.mission')}</Th><Th mac>{t('columns.chauffeur')}</Th><Th mac>{t('columns.chantier')}</Th></tr></thead>

              <tbody>

                {engin.missions.map((m: any) => (

                  <tr

                    key={m.id}

                    className="cursor-pointer"

                    onClick={() => navigate(`/missions/${m.id}`)}

                  >

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

          <>

            <div className="flex justify-end mb-2 mt-1">

              <Btn icon={Wrench} size="sm" onClick={() => setMaintOpen(true)}>{t('msg.newMaintenance')}</Btn>

            </div>

            {(engin.maintenances || []).length === 0 ? (

              <p className="text-[12px] text-gic-muted">{t('msg.emptyMaintenanceRecorded')}</p>

            ) : (

              <TableWrap mac>

                <thead><tr><Th mac>{t('columns.date')}</Th><Th mac>{t('columns.designation')}</Th><Th mac>{t('columns.manager')}</Th><Th mac>{t('columns.budget')}</Th></tr></thead>

                <tbody>

                  {engin.maintenances.map((m: any) => (

                    <tr

                      key={m.id}

                      className="cursor-pointer"

                      onClick={() => navigate(`/maintenance/${m.id}`)}

                    >

                      <Td mac className="text-[11px]">{formatDate(m.date)}</Td>

                      <Td mac>{m.designation}</Td>

                      <Td mac>{m.responsible || '—'}</Td>

                      <Td mac>{m.budget ? formatMad(m.budget) : '—'}</Td>

                    </tr>

                  ))}

                </tbody>

              </TableWrap>

            )}

          </>

        )}



        {tab === 'carburant' && (

          <div className="space-y-4 mt-1">

            <form onSubmit={addFuel} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">

              <Input label={t('fields.date')} type="date" value={fuelForm.date} onChange={(e) => setFuelForm({ ...fuelForm, date: e.target.value })} />

              <Input label={t('fields.litersRequired')} type="number" required value={fuelForm.liters} onChange={(e) => setFuelForm({ ...fuelForm, liters: e.target.value })} />

              <Input label={t('fields.costMad')} type="number" value={fuelForm.cost} onChange={(e) => setFuelForm({ ...fuelForm, cost: e.target.value })} />

              <Input label={t('fields.stationRemark')} value={fuelForm.station} onChange={(e) => setFuelForm({ ...fuelForm, station: e.target.value })} />

              <Btn type="submit">{t('actions.addFuelFill')}</Btn>

            </form>

            {fuelLogs.length === 0 ? (

              <p className="text-[12px] text-gic-muted">{t('msg.emptyFuelFills')}</p>

            ) : (

              <TableWrap mac>

                <thead><tr><Th mac>{t('columns.date')}</Th><Th mac>{t('fields.liters')}</Th><Th mac>{t('columns.cost')}</Th><Th mac>{t('columns.station')}</Th><Th mac>{t('columns.counter')}</Th></tr></thead>

                <tbody>

                  {fuelLogs.map((f) => (

                    <tr key={f.id}>

                      <Td mac className="text-[11px]">{formatDate(f.date)}</Td>

                      <Td mac>{f.liters} L</Td>

                      <Td mac>{f.cost ? formatMad(f.cost) : '—'}</Td>

                      <Td mac>{f.remark || '—'}</Td>

                      <Td mac>{f.counterValue ?? '—'}</Td>

                    </tr>

                  ))}

                </tbody>

              </TableWrap>

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

                  <a

                    href={`https://www.google.com/maps?q=${gpsData.latest.lat},${gpsData.latest.lng}`}

                    target="_blank"

                    rel="noreferrer"

                    className="text-[10px] text-gic-violet hover:underline mt-2 inline-block"

                  >

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
              {docs.map((d: any) => (
                <div key={d.id} className="mac-row">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-[#007aff] shrink-0" />
                    <div className="min-w-0">
                      <p className="mac-row-title truncate">{d.name}</p>
                      <p className="mac-row-subtitle capitalize">{d.category || 'doc'} · {formatDate(d.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a href={fileUrl(d.path)} target="_blank" rel="noreferrer" className="mac-table-action px-2">{t('msg.viewDocShort')}</a>
                    <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={() => printDocumentFiche(d)} />
                    <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteDoc(d.id)} />
                  </div>
                </div>
              ))}
              {docs.length === 0 && (
                <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyEquipmentDocs')}</p>
              )}
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

                    <p className={`text-[12px] ${paperAlertClass(p.date) || 'text-gic-muted'}`}>

                      {p.date ? formatDate(p.date) : t('fields.notProvided')}

                    </p>

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



      <Modal open={editOpen} size="lg" title={t('actions.editEquipment')} onClose={() => setEditOpen(false)}

        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-engin" type="submit">{t('common.save')}</Btn></>}

      >

        <form id="edit-engin" onSubmit={save}><EnginFormFields form={form} setForm={setForm} /></form>

      </Modal>



      <Modal open={deleteOpen} title={t('actions.deleteEquipment')} onClose={() => setDeleteOpen(false)}

        footer={<><Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.confirm')}</Btn></>}

      >

        <p className="text-[12px] text-gic-muted mb-3">{t('msg.deletionBlockedEquipment')}</p>

        <Input label={t('fields.motif') + ' *'} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />

      </Modal>



      <Modal open={maintOpen} title={t('pages.maintenance')} onClose={() => setMaintOpen(false)}

        footer={<><Btn variant="secondary" onClick={() => setMaintOpen(false)}>{t('common.cancel')}</Btn><Btn form="maint-detail" type="submit">{t('common.save')}</Btn></>}

      >

        <form id="maint-detail" onSubmit={createMaint} className="grid gap-3">

          <Input label={t('fields.date')} type="date" value={maintForm.date} onChange={(e) => setMaintForm({ ...maintForm, date: e.target.value })} />

          <Input label={t('fields.designationRequired')} required value={maintForm.designation} onChange={(e) => setMaintForm({ ...maintForm, designation: e.target.value })} />

          <Input label={t('fields.budgetMad')} value={maintForm.budget} onChange={(e) => setMaintForm({ ...maintForm, budget: e.target.value })} />

          <Input label={t('fields.responsible')} value={maintForm.responsible} onChange={(e) => setMaintForm({ ...maintForm, responsible: e.target.value })} />

        </form>

      </Modal>

    </div>

  );

}


