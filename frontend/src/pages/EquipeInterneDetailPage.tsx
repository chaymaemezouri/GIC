import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Printer, Shield, Mail, Clock, Wallet, Upload, FileText, BadgeCheck, Phone, MapPin, Link2, Unlink, UserPlus, ExternalLink, Info, History, MessageCircle, User } from 'lucide-react';
import { api, formatDate, formatMad, openPrintUrl, uploadForm } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { roleLabel, canManageUsers } from '../lib/permissions';
import { Btn, Card, Input, KpiCard, MacActionBtn, Modal, StatusPill, Select, PageBackLink } from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';
import MacProfilePhoto from '../components/MacProfilePhoto';
import ConversationsPanel from '../components/ConversationsPanel';
import { InternalStaffFormFields, staffFormToBody, staffToForm } from '../components/InternalStaffFormFields';
import { SALARY_PERIOD_LABELS, baseSalaryForPeriod, salaryPeriodUnitLabel } from '../lib/staffSalaryPeriod';

type Tab = 'infos' | 'compte' | 'salaire' | 'documents' | 'echanges' | 'historique';

type StaffDetail = {
  id: string;
  reference?: string | null;
  firstName: string;
  lastName: string;
  photo?: string | null;
  email?: string | null;
  isActive: boolean;
  cin?: string | null;
  birthDate?: string | null;
  address?: string | null;
  phone1?: string | null;
  phone2?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  hireDate?: string | null;
  contractType?: string | null;
  monthlySalary?: number;
  salaryPeriod?: string;
  declared?: boolean;
  cnssNumber?: string | null;
  bankAccount?: string | null;
  bankName?: string | null;
  rib?: string | null;
  emergencyContact?: string | null;
  remark?: string | null;
  userId?: string | null;
  user?: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
    twoFactorEnabled: boolean;
    lastLoginAt?: string | null;
  } | null;
  _count?: { salaryRecords: number; documents: number };
};

type SalaryRecord = {
  id: string;
  periodYear: number;
  periodMonth: number;
  periodWeek?: number;
  salaryPeriod?: string;
  baseSalary: number;
  bonus: number;
  deduction: number;
  advance: number;
  netSalary: number;
  status: string;
  paidAt?: string | null;
  remark?: string | null;
};

type AvailableUser = { id: string; email: string; firstName: string; lastName: string; role: string };

const ROLES = [
  { value: 'ADMIN' },
  { value: 'COMPTABLE' },
  { value: 'COMMERCIAL' },
  { value: 'CHEF_CHANTIER' },
  { value: 'USER' },
];

export default function EquipeInterneDetailPage() {
  const { t, lang } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: me } = useAuth();
  const [item, setItem] = useState<StaffDetail | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  const [docBundle, setDocBundle] = useState<{ uploaded: any[]; generated: any[] }>({ uploaded: [], generated: [] });
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState(staffToForm({}));
  const [payForm, setPayForm] = useState({
    periodYear: String(new Date().getFullYear()),
    periodMonth: String(new Date().getMonth() + 1),
    periodWeek: '0',
    baseSalary: '',
    bonus: '0',
    deduction: '0',
    advance: '0',
    status: 'brouillon',
    remark: '',
  });
  const [savingPay, setSavingPay] = useState(false);
  const [linkUserId, setLinkUserId] = useState('');
  const [createUserForm, setCreateUserForm] = useState({ email: '', password: '', role: 'COMMERCIAL' });
  const [accountError, setAccountError] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);

  function load() {
    if (!id) return;
    setError('');
    api<StaffDetail>(`/equipe-interne/${id}`).then(setItem).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/equipe-interne/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  function loadSalary() {
    if (!id) return;
    api<SalaryRecord[]>(`/equipe-interne/${id}/salary-records`).then(setSalaryRecords).catch(() => setSalaryRecords([]));
  }

  function loadDocuments() {
    if (!id) return;
    api<{ uploaded: any[]; generated: any[] }>(`/equipe-interne/${id}/documents`)
      .then(setDocBundle)
      .catch(() => setDocBundle({ uploaded: [], generated: [] }));
  }

  function loadAvailableUsers() {
    if (!canManageUsers(me?.role || '')) return;
    api<AvailableUser[]>('/equipe-interne/available-users')
      .then(setAvailableUsers)
      .catch(() => setAvailableUsers([]));
  }

  useEffect(() => { load(); }, [id]);
  useEffect(() => { if (tab === 'historique') loadHistory(); }, [tab, id]);
  useEffect(() => { if (tab === 'salaire') loadSalary(); }, [tab, id]);
  useEffect(() => { if (tab === 'documents') loadDocuments(); }, [tab, id]);
  useEffect(() => { if (tab === 'compte') loadAvailableUsers(); }, [tab, id, me?.role]);

  useEffect(() => {
    if (item) {
      const period = item.salaryPeriod || 'mensuel';
      setPayForm((p) => ({
        ...p,
        baseSalary: String(baseSalaryForPeriod(item.monthlySalary ?? 0, period)),
      }));
      setCreateUserForm((f) => ({
        ...f,
        email: item.email || item.user?.email || '',
      }));
    }
  }, [item?.monthlySalary, item?.salaryPeriod, item?.email, item?.user?.email]);

  function openEdit() {
    if (!item) return;
    setForm(staffToForm(item));
    setFormError('');
    setEditOpen(true);
  }

  useEffect(() => {
    if (item && (location.state as { edit?: boolean } | null)?.edit) {
      openEdit();
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [item, location.state, location.pathname, navigate]);

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setFormError('');
    try {
      await api(`/equipe-interne/${id}`, {
        method: 'PUT',
        body: JSON.stringify(staffFormToBody(form)),
      });
      setEditOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const fd = new FormData();
    fd.append('file', file);
    await uploadForm(`/equipe-interne/${id}/photo`, fd);
    load();
    e.target.value = '';
  }

  async function savePayroll(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSavingPay(true);
    try {
      await api(`/equipe-interne/${id}/salary-records`, {
        method: 'POST',
        body: JSON.stringify({
          periodYear: Number(payForm.periodYear),
          periodMonth: Number(payForm.periodMonth),
          periodWeek: Number(payForm.periodWeek) || 0,
          salaryPeriod: item?.salaryPeriod || 'mensuel',
          baseSalary: Number(payForm.baseSalary),
          bonus: Number(payForm.bonus),
          deduction: Number(payForm.deduction),
          advance: Number(payForm.advance),
          status: payForm.status,
          remark: payForm.remark || null,
        }),
      });
      loadSalary();
    } finally {
      setSavingPay(false);
    }
  }

  async function uploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', 'RH');
    await uploadForm(`/equipe-interne/${id}/documents`, fd);
    loadDocuments();
    e.target.value = '';
  }

  async function linkExistingUser(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !linkUserId) return;
    setAccountBusy(true);
    setAccountError('');
    try {
      await api(`/equipe-interne/${id}/link-user`, {
        method: 'POST',
        body: JSON.stringify({ userId: linkUserId }),
      });
      setLinkUserId('');
      load();
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setAccountBusy(false);
    }
  }

  async function createPlatformUser(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setAccountBusy(true);
    setAccountError('');
    try {
      await api(`/equipe-interne/${id}/create-user`, {
        method: 'POST',
        body: JSON.stringify(createUserForm),
      });
      load();
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setAccountBusy(false);
    }
  }

  async function unlinkUser() {
    if (!id || !await appConfirm(t('msg.confirmUnlinkAccount'))) return;
    setAccountBusy(true);
    setAccountError('');
    try {
      await api(`/equipe-interne/${id}/link-user`, { method: 'DELETE' });
      load();
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setAccountBusy(false);
    }
  }

  function printFiche() {
    if (!item) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><body style="font-family:sans-serif;padding:24px;font-size:12px">
      <h1>Fiche collaborateur — GIC</h1>
      <h2>${item.firstName} ${item.lastName}</h2>
      <p><b>Réf. :</b> ${item.reference || '—'}</p>
      <p><b>Fonction :</b> ${item.jobTitle || '—'} · ${item.department || '—'}</p>
      <p><b>Email :</b> ${item.email || item.user?.email || '—'}</p>
      <p><b>Salaire :</b> ${formatMad(item.monthlySalary)} / mois</p>
      <p><b>Contrat :</b> ${item.contractType || '—'}</p>
      <p><b>CNSS :</b> ${item.declared ? 'Déclaré' : 'Non déclaré'}</p>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (!item && !error) return <p className="text-[12px] text-gic-muted p-6">{t('common.loading')}</p>;

  if (error && !item) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/equipe-interne" className="mt-2" />
      </Card>
    );
  }

  const netPreview = Math.max(0,
    (Number(payForm.baseSalary) || 0)
    + (Number(payForm.bonus) || 0)
    - (Number(payForm.deduction) || 0)
    - (Number(payForm.advance) || 0),
  );

  const monthName = (month: number) =>
    new Date(2000, month - 1, 1).toLocaleString(lang === 'ar' ? 'ar-MA' : 'fr-FR', { month: 'long' });

  const canManageAccount = canManageUsers(me?.role || '');

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/equipe-interne" />
        <div className="mac-detail-hero-main">
          <MacProfilePhoto
            photo={item!.photo}
            firstName={item!.firstName}
            lastName={item!.lastName}
            editable
            onFileChange={onPhoto}
          />
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{item!.reference || t('detail.collaboratorInternal')}</p>
            <h1 className="mac-detail-name truncate">{item!.firstName} {item!.lastName}</h1>
            <p className="mac-detail-meta">
              {item!.jobTitle || '—'}
              {item!.department ? ` · ${item!.department}` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusPill status={item!.isActive ? 'actif' : 'inactif'} quiet />
              {item!.declared && <span className="mac-chip mac-chip-green inline-flex items-center gap-1"><BadgeCheck size={11} /> CNSS</span>}
              {item!.user && (
                <span className="mac-chip mac-chip-blue inline-flex items-center gap-1">
                  <Link2 size={11} /> {roleLabel(item!.user.role)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          <Btn variant="secondary" icon={Printer} onClick={printFiche}>{t('common.print')}</Btn>
          <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
        </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-4 mb-4">
        <KpiCard title={t('fields.payPeriod')} value={SALARY_PERIOD_LABELS[(item!.salaryPeriod || 'mensuel') as keyof typeof SALARY_PERIOD_LABELS] || t('msg.monthly')} icon={Wallet} tone="emerald" compact />
        <KpiCard title={t('msg.contractRefMonth')} value={formatMad(item!.monthlySalary)} icon={FileText} tone="violet" compact />
        <KpiCard title={t('columns.platformAccount')} value={item!.user ? t('msg.linked') : t('msg.noneLinked')} icon={Link2} tone="amber" compact />
        <KpiCard title={t('msg.paySlipsCount')} value={item!._count?.salaryRecords ?? 0} icon={FileText} tone="teal" compact />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsCollaboratorAria')}
            groups={[
              {
                id: 'identite',
                label: t('tabs.identity'),
                items: [
                  { id: 'infos', label: t('tabs.informations'), icon: Info },
                  { id: 'compte', label: t('tabs.platformAccount'), icon: User },
                ],
              },
              {
                id: 'paie',
                label: t('tabs.remuneration'),
                items: [
                  { id: 'salaire', label: t('tabs.paySalary'), icon: Wallet },
                ],
              },
              {
                id: 'docs',
                label: t('tabs.documentsExchanges'),
                items: [
                  { id: 'documents', label: t('tabs.documents'), icon: FileText },
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
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.emailContact')}</p><p className="font-medium">{item!.email || '—'}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.function')}</p><p>{item!.jobTitle || '—'}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.service')}</p><p>{item!.department || '—'}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.cin')}</p><p>{item!.cin || '—'}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.hireDate')}</p><p>{item!.hireDate ? formatDate(item!.hireDate) : '—'}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.phone1')}</p><p className="inline-flex items-center gap-1"><Phone size={11} /> {item!.phone1 || '—'}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.emergencyContact')}</p><p>{item!.emergencyContact || '—'}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.cnss')}</p><p>{item!.declared ? item!.cnssNumber || t('msg.declaredShort') : t('msg.notDeclaredShort')}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.bank')}</p><p>{item!.bankName || '—'}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.rib')}</p><p className="font-mono text-[11px]">{item!.rib || item!.bankAccount || '—'}</p></div>
            <div className="sm:col-span-2 lg:col-span-3"><p className="text-gic-muted text-[10px] uppercase">{t('fields.address')}</p><p className="inline-flex items-start gap-1"><MapPin size={11} className="mt-0.5 shrink-0" /> {item!.address || '—'}</p></div>
            {item!.remark && <div className="sm:col-span-2 lg:col-span-3"><p className="text-gic-muted text-[10px] uppercase">{t('fields.remark')}</p><p>{item!.remark}</p></div>}
          </div>
        )}

        {tab === 'compte' && (
          <div className="mt-1 space-y-4">
            {item!.user ? (
              <Card className="!p-4 !shadow-none !border-gic-border">
                <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-2"><Link2 size={16} /> {t('detail.linkedAccount')}</h3>
                <div className="grid sm:grid-cols-2 gap-3 text-[12px]">
                  <div><p className="text-gic-muted text-[10px] uppercase">{t('msg.loginEmailLabel')}</p><p className="font-medium">{item!.user.email}</p></div>
                  <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.role')}</p><p>{roleLabel(item!.user.role)}</p></div>
                  <div><p className="text-gic-muted text-[10px] uppercase">{t('msg.accountStatusLabel')}</p><p>{item!.user.isActive ? t('status.active') : t('status.inactive')}</p></div>
                  <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.lastLogin')}</p><p>{item!.user.lastLoginAt ? formatDate(item!.user.lastLoginAt) : '—'}</p></div>
                  {item!.user.twoFactorEnabled && (
                    <div><p className="text-gic-muted text-[10px] uppercase">{t('settings.security')}</p><p className="inline-flex items-center gap-1"><Shield size={11} /> {t('msg.security2fa')}</p></div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  {canManageAccount && (
                    <Link to={`/utilisateurs/${item!.user.id}`}>
                      <Btn variant="secondary" icon={ExternalLink}>{t('actions.manageAccount')}</Btn>
                    </Link>
                  )}
                  {canManageAccount && (
                    <Btn variant="secondary" icon={Unlink} onClick={unlinkUser} disabled={accountBusy}>{t('actions.unlink')}</Btn>
                  )}
                </div>
              </Card>
            ) : (
              <>
                <p className="text-[12px] text-gic-muted">
                  {t('msg.platformAccountHint')}
                </p>
                {canManageAccount ? (
                  <div className="grid lg:grid-cols-2 gap-4">
                    <Card className="!p-4 !shadow-none !border-gic-border">
                      <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-2"><UserPlus size={16} /> {t('detail.createAccount')}</h3>
                      <form onSubmit={createPlatformUser} className="grid gap-3">
                        <Input label={t('fields.emailLoginRequired')} type="email" required value={createUserForm.email} onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })} />
                        <Input label={t('fields.passwordRequiredStar')} type="password" required value={createUserForm.password} onChange={(e) => setCreateUserForm({ ...createUserForm, password: e.target.value })} />
                        <Select label={t('fields.appRole')} value={createUserForm.role} onChange={(e) => setCreateUserForm({ ...createUserForm, role: e.target.value })}>
                          {ROLES.filter((r) => me?.role === 'SUPER_ADMIN' || r.value !== 'SUPER_ADMIN').map((r) => (
                            <option key={r.value} value={r.value}>{roleLabel(r.value)}</option>
                          ))}
                        </Select>
                        <Btn type="submit" icon={UserPlus} disabled={accountBusy}>{accountBusy ? t('actions.creating') : t('actions.createAndLink')}</Btn>
                      </form>
                    </Card>
                    <Card className="!p-4 !shadow-none !border-gic-border">
                      <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-2"><Link2 size={16} /> {t('detail.linkExistingAccount')}</h3>
                      <form onSubmit={linkExistingUser} className="grid gap-3">
                        <Select label={t('fields.user')} value={linkUserId} onChange={(e) => setLinkUserId(e.target.value)}>
                          <option value="">{t('fields.selectOption')}</option>
                          {availableUsers.map((u) => (
                            <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>
                          ))}
                        </Select>
                        <Btn type="submit" variant="secondary" icon={Link2} disabled={accountBusy || !linkUserId}>
                          {accountBusy ? t('common.linking') : t('common.link')}
                        </Btn>
                      </form>
                    </Card>
                  </div>
                ) : (
                  <p className="text-[12px] text-gic-muted">{t('msg.adminOnlyPlatformAccounts')}</p>
                )}
              </>
            )}
            {accountError && <p className="text-[11px] text-gic-coral">{accountError}</p>}
          </div>
        )}

        {tab === 'salaire' && (
          <div className="grid lg:grid-cols-2 gap-4 mt-1">
            <Card className="!p-4 !shadow-none !border-gic-border">
              <h3 className="text-sm font-semibold mb-3">
                {t('msg.payrollBulletinTitle', {
                  period: SALARY_PERIOD_LABELS[(item!.salaryPeriod || 'mensuel') as keyof typeof SALARY_PERIOD_LABELS],
                  unit: salaryPeriodUnitLabel(item!.salaryPeriod || 'mensuel'),
                })}
              </h3>
              <form onSubmit={savePayroll} className="grid sm:grid-cols-2 gap-3">
                <Select label={t('fields.month')} value={payForm.periodMonth} onChange={(e) => setPayForm({ ...payForm, periodMonth: e.target.value })}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={String(i + 1)}>{monthName(i + 1)}</option>
                  ))}
                </Select>
                <Input label={t('fields.year')} type="number" value={payForm.periodYear} onChange={(e) => setPayForm({ ...payForm, periodYear: e.target.value })} />
                {(item!.salaryPeriod === 'hebdomadaire' || item!.salaryPeriod === 'journalier' || item!.salaryPeriod === 'bihebdomadaire') && (
                  <Select label={t('fields.subPeriod')} value={payForm.periodWeek} onChange={(e) => setPayForm({ ...payForm, periodWeek: e.target.value })} className="sm:col-span-2">
                    {item!.salaryPeriod === 'bihebdomadaire' ? (
                      <>
                        <option value="1">{t('msg.firstFortnight')}</option>
                        <option value="2">{t('msg.secondFortnight')}</option>
                      </>
                    ) : item!.salaryPeriod === 'journalier' ? (
                      Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{t('msg.dayN', { n: i + 1 })}</option>)
                    ) : (
                      [1, 2, 3, 4, 5].map((w) => <option key={w} value={String(w)}>{t('msg.weekN', { n: w })}</option>)
                    )}
                  </Select>
                )}
                <Input label={t('fields.baseSalary')} type="number" value={payForm.baseSalary} onChange={(e) => setPayForm({ ...payForm, baseSalary: e.target.value })} />
                <Input label={t('fields.bonuses')} type="number" value={payForm.bonus} onChange={(e) => setPayForm({ ...payForm, bonus: e.target.value })} />
                <Input label={t('fields.deductions')} type="number" value={payForm.deduction} onChange={(e) => setPayForm({ ...payForm, deduction: e.target.value })} />
                <Input label={t('fields.advances')} type="number" value={payForm.advance} onChange={(e) => setPayForm({ ...payForm, advance: e.target.value })} />
                <Select label={t('fields.status')} value={payForm.status} onChange={(e) => setPayForm({ ...payForm, status: e.target.value })}>
                  <option value="brouillon">{t('status.draft')}</option>
                  <option value="validé">{t('status.validated')}</option>
                  <option value="payé">{t('status.paid')}</option>
                </Select>
                <Input label={t('fields.remark')} value={payForm.remark} onChange={(e) => setPayForm({ ...payForm, remark: e.target.value })} />
                <div className="sm:col-span-2 rounded-xl bg-gray-50 px-3 py-2 text-[12px]">
                  <strong>{t('msg.netToPayLabel')}</strong> {formatMad(netPreview)}
                </div>
                <div className="sm:col-span-2 flex flex-wrap gap-2">
                  <Btn type="submit" disabled={savingPay}>{savingPay ? t('msg.payrollSaving') : t('actions.savePayroll')}</Btn>
                  <Btn
                    type="button"
                    variant="secondary"
                    icon={Printer}
                    onClick={() => openPrintUrl(`/equipe-interne/${id}/print/fiche_paie?periodYear=${payForm.periodYear}&periodMonth=${payForm.periodMonth}`)}
                  >
                    {t('msg.payrollPdf')}
                  </Btn>
                  <Btn
                    type="button"
                    variant="secondary"
                    icon={Printer}
                    onClick={() => openPrintUrl(`/equipe-interne/${id}/print/attestation`)}
                  >
                    {t('msg.attestationShort')}
                  </Btn>
                </div>
              </form>
            </Card>
            <div>
              <h3 className="text-sm font-semibold mb-3">{t('detail.payrollHistory')}</h3>
              {salaryRecords.length === 0 ? (
                <p className="text-[12px] text-gic-muted">{t('msg.noPayrollBulletin')}</p>
              ) : (
                <div className="space-y-2">
                  {salaryRecords.map((r) => (
                    <div key={r.id} className="rounded-xl border border-gic-border px-3 py-2 text-[11px] flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{monthName(r.periodMonth)} {r.periodYear}</p>
                        <p className="text-gic-muted">{t('msg.netPrefix', { amount: formatMad(r.netSalary) })}</p>
                      </div>
                      <StatusPill status={r.status} quiet />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'documents' && (
          <div className="mt-1 space-y-4">
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium bg-white border border-gic-border cursor-pointer hover:bg-black/[0.02]">
                <Upload size={14} /> {t('actions.addDocument')}
                <input type="file" className="hidden" onChange={uploadDoc} />
              </label>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">{t('detail.importedDocs')}</h3>
              {docBundle.uploaded.length === 0 ? (
                <p className="text-[12px] text-gic-muted">{t('msg.emptyDocuments')}</p>
              ) : (
                <ul className="space-y-2">
                  {docBundle.uploaded.map((d) => (
                    <li key={d.id} className="rounded-xl border border-gic-border px-3 py-2 text-[11px] flex justify-between gap-2">
                      <span>{d.name}</span>
                      <a href={d.path} target="_blank" rel="noreferrer" className="text-[#007aff]">{t('actions.open')}</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">{t('detail.generatedDocs')}</h3>
              {docBundle.generated.length === 0 ? (
                <p className="text-[12px] text-gic-muted">{t('msg.noGeneratedDoc')}</p>
              ) : (
                <ul className="space-y-2">
                  {docBundle.generated.map((d) => (
                    <li key={d.id} className="rounded-xl border border-gic-border px-3 py-2 text-[11px]">
                      {d.docType === 'fiche_paie' ? t('msg.paySlipGenerated') : t('msg.attestationGenerated')} · {formatDate(d.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === 'echanges' && (
          <div className="mt-1">
            <ConversationsPanel
              entityType="InternalStaff"
              entityId={item!.id}
              defaultEmail={item!.email || item!.user?.email || ''}
            />
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
                  <p className="text-[10px] text-gic-muted mt-1">{formatDate(h.createdAt)}</p>
                </div>
              ))}
            </div>
          )
        )}
            </DetailShell>

      <Modal open={editOpen} title={t('actions.editCollaborator')} onClose={() => setEditOpen(false)} size="lg"
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-staff-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="edit-staff-form" onSubmit={saveEdit}>
          <InternalStaffFormFields form={form} setForm={setForm} />
          {formError && <p className="text-[11px] text-gic-coral mt-2">{formError}</p>}
        </form>
      </Modal>
    </div>
  );
}
