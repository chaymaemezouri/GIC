import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Printer, Clock, Wallet, ExternalLink, Camera, Mail, Phone, Calendar, MapPin, Hash, FileText, User, BadgeCheck, Upload, Plus, Info as InfoIcon, History, MessageCircle, Users } from 'lucide-react';
import { api, fetchChantierList, formatDate, formatMad, openPrintUrl, uploadDocument, uploadForm } from '../lib/api';
import { Btn, Card, Input, KpiCard, MacActionBtn, MacDateInput, MacSelect, Modal, StatusPill, TableWrap, Td, Th, PageBackLink } from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';


import { WorkforceFormFields, emptyWorkforceForm, workforceToForm, type WorkforceFormData } from '../components/WorkforceFormFields';
import ConversationsPanel from '../components/ConversationsPanel';
import { EntityPickerPanel, chantierToPickerItem } from '../components/EntityPickerPanel';
import {
  CHAUFFEUR_CATEGORY,
  workforceListPath,
  workforceDetailPathForCategory,
  type WorkforceScope,
} from '../lib/workforceScope';

type Tab = 'infos' | 'affectations' | 'pointages' | 'salaire' | 'documents' | 'echanges' | 'historique';

type WorkforceDocBundle = {
  uploaded: Array<{ id: string; name: string; category?: string | null; path: string; createdAt: string }>;
  generated: Array<{ id: string; docType: string; reference?: string | null; createdAt: string; data?: string | null }>;
};

const DOC_TYPE_KEYS: Record<string, string> = {
  attestation: 'msg.workAttestation',
  fiche_paie: 'msg.paySlip',
};

function defaultPeriodFrom() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function WorkforceDetailPage({ mode = 'main_oeuvre' }: { mode?: WorkforceScope }) {
  const { t } = useI18n();
  const isChauffeur = mode === 'chauffeur';
  const listPath = workforceListPath(mode);
  const { id } = useParams();
  const navigate = useNavigate();
  const [worker, setWorker] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [docBundle, setDocBundle] = useState<WorkforceDocBundle>({ uploaded: [], generated: [] });
  const [salary, setSalary] = useState<any>(null);
  const [pointages, setPointages] = useState<any[]>([]);
  const [pointageFrom, setPointageFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [pointageTo, setPointageTo] = useState(new Date().toISOString().slice(0, 10));
  const [pointageLoading, setPointageLoading] = useState(false);
  const [docPeriodFrom, setDocPeriodFrom] = useState(defaultPeriodFrom);
  const [docPeriodTo, setDocPeriodTo] = useState(new Date().toISOString().slice(0, 10));
  const [chantiers, setChantiers] = useState<Array<{
    id: string;
    name: string;
    reference?: string | null;
    address?: string | null;
    status?: string | null;
    progressPct?: number | null;
    project?: { name?: string } | null;
  }>>([]);
  const [assignPickerQuery, setAssignPickerQuery] = useState('');
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ chantierId: '', functionRole: '', tranche: '' });
  const [assignError, setAssignError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<WorkforceFormData>(emptyWorkforceForm());

  function load() {
    if (!id) return;
    setError('');
    api(`/chantiers/workforce/${id}`).then(setWorker).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/chantiers/workforce/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  function loadDocuments() {
    if (!id) return;
    api<WorkforceDocBundle>(`/chantiers/workforce/${id}/documents`)
      .then(setDocBundle)
      .catch(() => setDocBundle({ uploaded: [], generated: [] }));
  }

  function loadPointages() {
    if (!id) return;
    setPointageLoading(true);
    const qs = new URLSearchParams({
      workforceId: id,
      dateFrom: pointageFrom,
      dateTo: pointageTo,
      limit: '100',
      order: 'desc',
    });
    api<{ items: any[] }>(`/chantiers/pointage?${qs}`)
      .then((res) => setPointages(res.items))
      .catch(() => setPointages([]))
      .finally(() => setPointageLoading(false));
  }

  function loadSalary() {
    if (!id) return;
    api(`/chantiers/pointage/salary-summary?workforceId=${id}`).then(setSalary).catch(() => setSalary(null));
  }

  useEffect(() => {
    load();
    loadDocuments();
    fetchChantierList().then(setChantiers);
  }, [id]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
    if (tab === 'salaire') loadSalary();
    if (tab === 'documents') loadDocuments();
    if (tab === 'pointages') loadPointages();
  }, [tab, id, pointageFrom, pointageTo]);

  useEffect(() => {
    if (!worker || !id) return;
    const workerIsChauffeur = worker.category === CHAUFFEUR_CATEGORY;
    if (isChauffeur && !workerIsChauffeur) {
      navigate(workforceDetailPathForCategory(worker.category, id), { replace: true });
    } else if (!isChauffeur && workerIsChauffeur) {
      navigate(workforceDetailPathForCategory(worker.category, id), { replace: true });
    }
  }, [worker, id, isChauffeur, navigate]);

  function openEdit() {
    if (!worker) return;
    setForm(workforceToForm(worker));
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/chantiers/workforce/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          cin: form.cin || null,
          birthDate: form.birthDate || null,
          address: form.address || null,
          phone1: form.phone1 || null,
          phone2: form.phone2 || null,
          email: form.email || null,
          category: isChauffeur ? CHAUFFEUR_CATEGORY : (form.category || null),
          groupe: form.groupe || null,
          workPassport: form.workPassport || null,
          hireDate: form.hireDate || null,
          contractType: form.contractType || null,
          salaryPeriod: form.salaryPeriod || 'jour',
          cnssNumber: form.cnssNumber || null,
          dailySalary: form.dailySalary || 0,
          monthlySalary: form.monthlySalary || 0,
          bankName: form.bankName || null,
          rib: form.rib || null,
          declared: form.declared === 'true',
          isActive: form.isActive === 'true',
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
      await api(`/chantiers/workforce/${id}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      navigate(listPath);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      await uploadForm(`/chantiers/workforce/${id}/photo`, fd);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.uploadError'));
    } finally {
      e.target.value = '';
    }
  }

  async function onUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      await uploadDocument(file, {
        name: file.name,
        category: 'admin',
        entityType: 'Workforce',
        entityId: id,
      });
      loadDocuments();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.uploadError'));
    } finally {
      e.target.value = '';
    }
  }

  async function deleteDoc(docId: string) {
    if (!await appConfirm(t('msg.confirmDeleteDocument'))) return;
    await api(`/documents/${docId}`, { method: 'DELETE' });
    loadDocuments();
  }

  async function saveAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !assignForm.chantierId) return;
    setAssignError('');
    try {
      await api(`/chantiers/workforce/${id}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          chantierId: assignForm.chantierId,
          functionRole: assignForm.functionRole.trim() || null,
          tranche: assignForm.tranche.trim() || null,
        }),
      });
      setAssignOpen(false);
      setAssignForm({ chantierId: '', functionRole: '', tranche: '' });
      load();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function unassign(assignmentId: string) {
    if (!id || !await appConfirm(t('msg.confirmRemoveAssignment'))) return;
    try {
      await api(`/chantiers/workforce/${id}/assign/${assignmentId}`, { method: 'DELETE' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printFiche() {
    if (!worker) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${worker.firstName} ${worker.lastName}</title></head><body style="font-family:sans-serif;padding:24px;font-size:12px">
      <h1>Fiche ouvrier — GIC</h1>
      <h2>${worker.firstName} ${worker.lastName}</h2>
      <p><b>CIN :</b> ${worker.cin || '—'}</p>
      <p><b>Catégorie :</b> ${worker.category || '—'}</p>
      <p><b>Groupe :</b> ${worker.groupe || '—'}</p>
      <p><b>Salaire/j :</b> ${worker.dailySalary} MAD</p>
      <p><b>Contrat :</b> ${worker.contractType || '—'}</p>
      <p><b>CNSS :</b> ${worker.declared ? 'Déclaré' : 'Non déclaré'}</p>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (!worker && !error) return <p className="text-[12px] text-gic-muted p-6">{t('common.loading')}</p>;

  if (error && !worker) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo={listPath} className="mt-2" />
      </Card>
    );
  }

  const pointageCount = worker._count?.pointages ?? worker.pointages?.length ?? 0;
  const assignmentCount = worker._count?.assignments ?? worker.assignments?.length ?? 0;
  const docCount = docBundle.uploaded.length + docBundle.generated.length;

  function printFichePaie() {
    if (!id) return;
    const qs = new URLSearchParams({ dateFrom: docPeriodFrom, dateTo: docPeriodTo });
    openPrintUrl(`/chantiers/workforce/${id}/print/fiche_paie?${qs}`);
    setTimeout(loadDocuments, 500);
  }

  function openGeneratedDoc(d: WorkforceDocBundle['generated'][0]) {
    if (!id) return;
    let qs = '';
    if (d.docType === 'fiche_paie' && d.data) {
      try {
        const parsed = JSON.parse(d.data);
        const p = new URLSearchParams();
        if (parsed.dateFrom) p.set('dateFrom', parsed.dateFrom);
        if (parsed.dateTo) p.set('dateTo', parsed.dateTo);
        if (p.toString()) qs = `?${p}`;
      } catch {
        /* ignore */
      }
    }
    openPrintUrl(`/chantiers/workforce/${id}/print/${d.docType}${qs}`);
  }

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo={listPath} />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            {worker.photo ? (
              <img src={worker.photo} alt="" />
            ) : (
              <div className="mac-detail-photo-fallback">
                {worker.firstName[0]}{worker.lastName[0]}
              </div>
            )}
            <label className="mac-detail-photo-cam" title={t('actions.changePhoto')}>
              <Camera size={12} strokeWidth={2} />
              <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" onChange={onPhoto} />
            </label>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.workforce360')}</p>
            <h1 className="mac-detail-name truncate">{worker.firstName} {worker.lastName}</h1>
            <p className="mac-detail-meta">
              {worker.reference || '—'}
              {' · '}{worker.category || (isChauffeur ? t('msg.driverCategory') : t('msg.workerCategory'))}
              {worker.groupe ? ` · ${worker.groupe}` : ''}
              {!worker.isActive && t('msg.inactiveSuffix')}
              {worker.declared && t('msg.cnssDeclaredMeta')}
              {t('msg.sinceDate', { date: formatDate(worker.createdAt) })}
            </p>
            <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-gic-muted">
              {worker.phone1 && (
                <a href={`tel:${worker.phone1}`} className="flex items-center gap-1 hover:text-[#007aff]">
                  <Phone size={12} /> {worker.phone1}
                </a>
              )}
              {worker.email && (
                <a href={`mailto:${worker.email}`} className="flex items-center gap-1 hover:text-[#007aff]">
                  <Mail size={12} /> {worker.email}
                </a>
              )}
              {worker.cin && (
                <span className="flex items-center gap-1">
                  <Hash size={12} /> {worker.cin}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          {worker.salaryPeriod !== 'mois' && (
            <Link to={`/pointage?workforceId=${id}`}>
              <Btn variant="secondary" icon={Clock}>{t('tabs.attendance')}</Btn>
            </Link>
          )}
          <Btn variant="secondary" icon={Printer} onClick={printFiche}>{t('common.print')}</Btn>
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteOpen(true); setDeleteMotif(''); }} />
          </div>
                 </div>
      </div>

      <div className="mac-kpi-grid mb-4">
        <KpiCard
          title={worker.salaryPeriod === 'mois' ? t('fields.monthlySalaryMad') : t('fields.dailySalaryMad')}
          value={formatMad(worker.salaryPeriod === 'mois' ? (worker.monthlySalary || 0) : worker.dailySalary)}
          icon={Wallet}
          tone="coral"
          compact
        />
        <KpiCard title={t('fields.payMode')} value={worker.salaryPeriod === 'mois' ? t('fields.payMonthly') : t('fields.payDaily')} icon={FileText} tone="violet" />
        <KpiCard title={t('tabs.attendances')} value={pointageCount} icon={Clock} tone="emerald" />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsWorkforceAria')}
            groups={[
              {
                id: 'identite',
                label: t('tabs.identity'),
                items: [
                  { id: 'infos', label: t('tabs.informations'), icon: InfoIcon },
                ],
              },
              {
                id: 'activite',
                label: t('tabs.activity'),
                items: [
                  { id: 'affectations', label: t('tabs.assignments'), icon: Users, badge: assignmentCount },
                  { id: 'pointages', label: t('tabs.attendances'), icon: Clock, badge: pointageCount },
                  { id: 'salaire', label: t('tabs.salary'), icon: Wallet },
                ],
              },
              {
                id: 'docs',
                label: t('tabs.documentsExchanges'),
                items: [
                  { id: 'documents', label: t('tabs.documents'), icon: FileText, badge: docCount },
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-[12px] mt-1">
            <Info icon={Hash} label={t('fields.reference')} value={worker.reference || '—'} />
            <Info icon={Hash} label={t('fields.cin')} value={worker.cin || '—'} />
            <Info icon={Calendar} label={t('fields.birthDate')} value={formatDate(worker.birthDate)} />
            <Info icon={Calendar} label={t('fields.hireDate')} value={formatDate(worker.hireDate)} />
            <Info icon={Phone} label={t('fields.phone1')} value={worker.phone1 || '—'} link={worker.phone1 ? `tel:${worker.phone1}` : undefined} />
            <Info icon={Phone} label={t('fields.phone2')} value={worker.phone2 || '—'} link={worker.phone2 ? `tel:${worker.phone2}` : undefined} />
            <Info icon={Mail} label={t('fields.email')} value={worker.email || '—'} link={worker.email ? `mailto:${worker.email}` : undefined} />
            <Info icon={User} label={t('fields.category')} value={worker.category || '—'} />
            <Info icon={User} label={t('fields.group')} value={worker.groupe || '—'} />
            <Info icon={FileText} label={t('fields.workPassport')} value={worker.workPassport || '—'} />
            <Info icon={Wallet} label={t('fields.payMode')} value={worker.salaryPeriod === 'mois' ? t('fields.payMonthly') : t('fields.payDaily')} />
            <Info
              icon={Wallet}
              label={worker.salaryPeriod === 'mois' ? t('fields.monthlySalary') : t('fields.dailySalaryMad')}
              value={formatMad(worker.salaryPeriod === 'mois' ? (worker.monthlySalary || 0) : worker.dailySalary)}
            />
            {worker.salaryPeriod === 'mois' && (
              <>
                <Info icon={BadgeCheck} label={t('fields.bank')} value={worker.bankName || '—'} />
                <Info icon={BadgeCheck} label={t('fields.rib')} value={worker.rib || '—'} />
              </>
            )}
            <Info icon={BadgeCheck} label={t('fields.cnssNumber')} value={worker.cnssNumber || '—'} />
            <Info icon={BadgeCheck} label={t('fields.cnssDeclaration')} value={worker.declared ? t('msg.declaredShort') : t('msg.notDeclaredShort')} />
            <Info icon={User} label={t('fields.status')} value={<StatusPill status={worker.isActive ? 'actif' : 'inactif'} quiet />} />
            {worker.address && (
              <Info icon={MapPin} label={t('fields.address')} value={worker.address} className="sm:col-span-2 lg:col-span-3" />
            )}
          </div>
        )}

        {tab === 'affectations' && (
          <div className="mt-1">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <p className="text-[12px] text-gic-muted">
                {t('msg.assignmentsRecordedCount', { count: assignmentCount })}
              </p>
              <Btn icon={Plus} onClick={() => {
                setAssignForm({ chantierId: '', functionRole: '', tranche: '' });
                setAssignPickerQuery('');
                setAssignError('');
                setAssignOpen(true);
              }}>
                {t('actions.assignToSite')}
              </Btn>
            </div>
            {(worker.assignments || []).length === 0 ? (
              <p className="text-[12px] text-gic-muted py-4">{t('msg.emptyAssignmentFromSite')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.chantier')}</Th>
                    <Th mac>{t('columns.function')}</Th>
                    <Th mac>{t('columns.tranche')}</Th>
                    <Th mac>{t('columns.since')}</Th>
                    <Th mac>{t('columns.end')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {worker.assignments.map((a: any) => (
                    <tr key={a.id}>
                      <Td mac>
                        <Link to={`/chantiers/${a.chantier.id}`} className="mac-table-ref inline-flex items-center gap-1">
                          {a.chantier.name} <ExternalLink size={11} />
                        </Link>
                      </Td>
                      <Td mac>{a.functionRole || '—'}</Td>
                      <Td mac className="mac-table-muted">{a.tranche || '—'}</Td>
                      <Td mac className="mac-table-muted">{formatDate(a.startDate)}</Td>
                      <Td mac className="mac-table-muted">{formatDate(a.endDate)}</Td>
                      <Td mac className="mac-td-actions">
                        <MacActionBtn icon={Trash2} tone="red" title={t('common.remove')} onClick={() => unassign(a.id)} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}

        {tab === 'pointages' && (
          <div className="mt-1">
            <div className="flex flex-wrap justify-between items-end gap-3 mb-3">
              <div className="flex flex-wrap items-end gap-2">
                <MacDateInput label={t('fields.from')} value={pointageFrom} onChange={setPointageFrom} />
                <MacDateInput label={t('fields.to')} value={pointageTo} onChange={setPointageTo} />
                <Btn variant="secondary" onClick={loadPointages}>{t('common.filter')}</Btn>
              </div>
              <Link to={`/pointage?workforceId=${id}`}>
                <Btn variant="secondary" icon={Clock}>{t('actions.goAttendance')}</Btn>
              </Link>
            </div>
            {pointageLoading ? (
              <p className="text-[12px] text-gic-muted py-4">{t('common.loading')}</p>
            ) : pointages.length === 0 ? (
              <p className="text-[12px] text-gic-muted py-4">{t('msg.emptyPointageOnPeriod')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('columns.chantier')}</Th>
                    <Th mac>{t('columns.days')}</Th>
                    <Th mac>{t('columns.hours')}</Th>
                    <Th mac>{t('columns.totalDays')}</Th>
                    <Th mac>{t('columns.validated')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {pointages.map((p: any) => (
                    <tr key={p.id}>
                      <Td mac className="mac-table-muted">{formatDate(p.date)}</Td>
                      <Td mac>
                        {p.chantier ? (
                          <Link to={`/chantiers/${p.chantier.id}`} className="mac-table-ref">{p.chantier.name}</Link>
                        ) : '—'}
                      </Td>
                      <Td mac>{p.dayValue}</Td>
                      <Td mac>{p.hours}h</Td>
                      <Td mac>{p.totalDay?.toFixed(2)}</Td>
                      <Td mac>
                        {p.validated ? <span className="mac-chip mac-chip-emerald">{t('status.validated')}</span> : '—'}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}

        {tab === 'salaire' && (
          <div className="mt-1">
            <div className="flex items-center gap-2 mb-4">
              <Wallet size={16} />
              <h2 className="text-sm font-semibold">{t('detail.salaryCalc')}</h2>
            </div>
            {!salary ? (
              <p className="text-[12px] text-gic-muted">{t('msg.emptyValidatedAttendance')}</p>
            ) : (
              <>
                <div className="mac-kpi-grid mac-kpi-grid-4 mb-4">
                  <KpiCard title={t('msg.equivalentDays')} value={salary.totalDays.toFixed(2)} icon={Clock} tone="violet" />
                  <KpiCard title={t('columns.brut')} value={formatMad(salary.brut)} icon={Wallet} tone="emerald" />
                  <KpiCard title={t('columns.bonuses')} value={formatMad(salary.bonuses)} icon={Wallet} tone="amber" />
                  <KpiCard title={t('columns.net')} value={formatMad(salary.net)} icon={Wallet} tone="coral" compact />
                </div>
                <p className="text-[12px] text-gic-muted">
                  {t('msg.brutFormula', {
                    days: salary.totalDays.toFixed(2),
                    daily: formatMad(salary.dailySalary),
                    brut: formatMad(salary.brut),
                    advances: formatMad(salary.advances),
                  })}
                </p>
              </>
            )}
            <Link to="/salaires" className="inline-block mt-3 text-[11px] text-gic-violet hover:underline">
              {t('msg.seeSalariesModule')}
            </Link>
          </div>
        )}

        {tab === 'historique' && (
          <div className="mt-1">
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

        {tab === 'documents' && (
          <div className="space-y-5 mt-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] text-gic-muted">{t('msg.documentsInternalGenerated')}</p>
              <label className="mac-upload-btn">
                <Upload size={14} /> {t('actions.addDocument')}
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={onUploadDoc} />
              </label>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gic-muted mb-2">{t('actions.generateDocument')}</p>
              <div className="flex flex-wrap items-end gap-2">
                <Btn variant="secondary" size="sm" icon={Printer} onClick={() => { openPrintUrl(`/chantiers/workforce/${id}/print/attestation`); setTimeout(loadDocuments, 500); }}>
                  {t('msg.workAttestation')}
                </Btn>
                <MacDateInput label={t('fields.from')} value={docPeriodFrom} onChange={setDocPeriodFrom} />
                <MacDateInput label={t('fields.to')} value={docPeriodTo} onChange={setDocPeriodTo} />
                <Btn variant="secondary" size="sm" icon={Printer} onClick={printFichePaie}>
                  {t('msg.paySlip')}
                </Btn>
              </div>
            </div>

            {docBundle.uploaded.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gic-muted mb-2">{t('detail.importedDocs')}</p>
                <div className="space-y-2">
                  {docBundle.uploaded.map((d) => (
                    <DocRow key={d.id} name={d.name} meta={d.category || t('tabs.documents')} date={d.createdAt} href={d.path} onDelete={() => deleteDoc(d.id)} />
                  ))}
                </div>
              </div>
            )}

            {docBundle.generated.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gic-muted mb-2">{t('detail.generatedDocs')}</p>
                <div className="space-y-2">
                  {docBundle.generated.map((d) => (
                    <DocRow
                      key={d.id}
                      name={DOC_TYPE_KEYS[d.docType] ? t(DOC_TYPE_KEYS[d.docType]) : d.docType}
                      meta={d.reference || '—'}
                      date={d.createdAt}
                      onOpen={() => openGeneratedDoc(d)}
                    />
                  ))}
                </div>
              </div>
            )}

            {docCount === 0 && (
              <p className="text-[12px] text-gic-muted py-4 text-center">{t('msg.emptyDocuments')}</p>
            )}
          </div>
        )}

        {tab === 'echanges' && (
          <ConversationsPanel
            entityType="Workforce"
            entityId={worker.id}
            defaultEmail={worker.email || undefined}
            defaultPhone={worker.phone1 || undefined}
          />
        )}

            </DetailShell>

      <Modal open={assignOpen} title={t('actions.assignToSite')} onClose={() => setAssignOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setAssignOpen(false)}>{t('common.cancel')}</Btn><Btn form="assign-worker-form" type="submit" disabled={!assignForm.chantierId}>{t('actions.assignWorker')}</Btn></>}
      >
        <form id="assign-worker-form" onSubmit={saveAssign} className="grid gap-3">
          <EntityPickerPanel
            items={chantiers.map(chantierToPickerItem)}
            excludeIds={(worker?.assignments || []).map((a: { chantier?: { id?: string } }) => a.chantier?.id).filter(Boolean) as string[]}
            selectedId={assignForm.chantierId || null}
            onSelect={(chantierId) => setAssignForm({ ...assignForm, chantierId })}
            query={assignPickerQuery}
            onQueryChange={setAssignPickerQuery}
            open={assignOpen}
            searchPlaceholder={t('msg.filterSitePicker')}
            emptyMessage={t('msg.emptySitesAvailable')}
            countLabel={(n) => t('msg.sitesAvailableCount', { count: n })}
            ariaLabel={t('msg.ariaSelectChantier')}
          />
          <Input label={t('fields.function')} value={assignForm.functionRole} onChange={(e) => setAssignForm({ ...assignForm, functionRole: e.target.value })} placeholder={t('fields.categoryPlaceholder')} />
          <Input label={t('fields.tranche')} value={assignForm.tranche} onChange={(e) => setAssignForm({ ...assignForm, tranche: e.target.value })} placeholder={t('settings.optionalPlaceholder')} />
          {assignError && <p className="text-[11px] text-gic-coral">{assignError}</p>}
        </form>
      </Modal>

      <Modal open={editOpen} size="lg" title={t('actions.editWorker')} onClose={() => setEditOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-worker-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="edit-worker-form" onSubmit={save}>
          <WorkforceFormFields form={form} setForm={setForm} categories={isChauffeur ? [CHAUFFEUR_CATEGORY] : undefined} hideCategory={isChauffeur} />
        </form>
      </Modal>

      <Modal open={deleteOpen} title={t('actions.deleteWorker')} onClose={() => setDeleteOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn></>}
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.deletionBlockedWorker')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.motifPlaceholder')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>
    </div>
  );
}

function DocRow({
  name,
  meta,
  date,
  href,
  onDelete,
  onOpen,
}: {
  name: string;
  meta: string;
  date: string;
  href?: string;
  onDelete?: () => void;
  onOpen?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 rounded-xl bg-black/[0.03] px-3 py-2.5">
      <FileText size={16} className="text-[#007aff] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-gic-ink truncate">{name}</p>
        <p className="text-[10px] text-gic-muted">{meta} · {formatDate(date)}</p>
      </div>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="text-[11px] text-[#007aff] hover:underline shrink-0">
          {t('actions.open')}
        </a>
      )}
      {onOpen && (
        <button type="button" onClick={onOpen} className="text-[11px] text-[#007aff] hover:underline shrink-0">
          {t('actions.open')}
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete} className="text-[11px] text-gic-coral hover:underline shrink-0">
          {t('common.delete')}
        </button>
      )}
    </div>
  );
}

function Info({
  label,
  value,
  icon: Icon,
  link,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  link?: string;
  className?: string;
}) {
  const content = link ? (
    <a href={link} className="font-medium hover:text-[#007aff]">{value}</a>
  ) : (
    <div className="font-medium">{value}</div>
  );
  return (
    <div className={className}>
      <p className="text-[10px] text-gic-muted uppercase flex items-center gap-1">
        {Icon && <Icon size={11} strokeWidth={2} />}
        {label}
      </p>
      {content}
    </div>
  );
}
