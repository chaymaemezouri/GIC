import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Shield, Key, User as UserIcon, Activity, Bell, Download, Printer, CheckCircle, XCircle,
  SlidersHorizontal, Check, ArrowUp, ArrowDown, Plus, X, Eye, ChevronRight, Settings, Building2,
  Languages,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, uploadForm, type PaginatedResponse } from '../lib/api';
import { useAuth, type User } from '../context/AuthContext';
import MacProfilePhoto from '../components/MacProfilePhoto';
import { roleLabel, canAccessRoute } from '../lib/permissions';
import { ActionBadge, AUDIT_ACTION_FILTERS, AUDIT_ENTITY_FILTERS, auditEntityLabel, auditEntityLink, formatAuditDateTime } from '../lib/auditDisplay';
import { DEFAULT_RAIL_PATHS, buildNavCatalog, settingsAdminItems } from '../lib/navConfig';
import {
  getCatalogForRole,
  normalizeSidebarPrefs,
} from '../lib/sidebarPrefs';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  PageHeader, Pagination, Select, TableWrap, Td, Th,
} from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import EccBrandFooter from '../components/EccBrandFooter';
import { fileUrl } from '../lib/documentDisplay';
import { printBankTransferList } from '../lib/printBankTransferList';
import { useI18n } from '../i18n/I18nContext';
import type { Lang } from '../i18n/types';

type Tab = 'profil' | 'securite' | 'activite' | 'navigation' | 'systeme' | 'liste_banque' | 'langue';

type CompanyForm = {
  companyName: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  ice: string;
  rc: string;
  logoPath: string;
  bankLetterTitle: string;
  bankLetterIntro: string;
  bankLetterFooter: string;
};
type SortOrder = 'asc' | 'desc';

type Stats = {
  twoFactorEnabled: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  actionsMonth: number;
  actionsTotal: number;
  actionsFiltered?: number;
  unreadNotifications: number;
  role: string;
};

type ActivityLog = {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  createdAt: string;
};

const PAGE_SIZE = 20;

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function formatDate(d?: string | null) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(d));
}

function formatDateTimeShort(d?: string | null) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-MA', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(d));
}

type ActivityOverrides = Partial<{
  q: string;
  action: string;
  entity: string;
  dateFrom: string;
  dateTo: string;
  sort: string;
  order: SortOrder;
}>;

export default function ParametresPage() {
  const { user, refreshUser, patchUser, photoBust } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = (searchParams.get('tab') as Tab) || 'profil';
  const [tab, setTab] = useState<Tab>(
    ['profil', 'securite', 'activite', 'navigation', 'systeme', 'liste_banque', 'langue'].includes(initialTab)
      ? initialTab
      : 'profil',
  );
  const [stats, setStats] = useState<Stats | null>(null);
  const [profile, setProfile] = useState({ firstName: '', lastName: '', username: '' });
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [disablePwd, setDisablePwd] = useState('');
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState<CompanyForm>({
    companyName: '',
    address: '',
    city: '',
    phone: '',
    email: '',
    ice: '',
    rc: '',
    logoPath: '',
    bankLetterTitle: '',
    bankLetterIntro: '',
    bankLetterFooter: '',
  });
  const [companyLoading, setCompanyLoading] = useState(false);

  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [actPage, setActPage] = useState(Number(searchParams.get('page') || 1));
  const [actPages, setActPages] = useState(1);
  const [actTotal, setActTotal] = useState(0);
  const [actQ, setActQ] = useState(searchParams.get('q') || '');
  const [actAction, setActAction] = useState(searchParams.get('action') || '');
  const [actEntity, setActEntity] = useState(searchParams.get('entity') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || monthStartISO());
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || new Date().toISOString().slice(0, 10));
  const [sort, setSort] = useState(searchParams.get('sort') || 'createdAt');
  const [order, setOrder] = useState<SortOrder>((searchParams.get('order') as SortOrder) || 'desc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [actLoading, setActLoading] = useState(false);
  const [railPaths, setRailPaths] = useState<string[]>(DEFAULT_RAIL_PATHS);
  const [sidebarSaving, setSidebarSaving] = useState(false);

  const navCatalog = useMemo(() => buildNavCatalog(), []);
  const catalogForRole = useMemo(
    () => (user ? getCatalogForRole(user.role) : []),
    [user],
  );
  const availableModules = useMemo(
    () => catalogForRole.filter((item) => !railPaths.includes(item.to)),
    [catalogForRole, railPaths],
  );
  const adminModules = useMemo(
    () => (user ? settingsAdminItems.filter((item) => canAccessRoute(user.role, item.to)) : []),
    [user],
  );

  function buildStatsQuery(overrides?: ActivityOverrides) {
    const qs = new URLSearchParams();
    const qVal = overrides?.q !== undefined ? overrides.q : actQ;
    const action = overrides?.action !== undefined ? overrides.action : actAction;
    const entity = overrides?.entity !== undefined ? overrides.entity : actEntity;
    const from = overrides?.dateFrom !== undefined ? overrides.dateFrom : dateFrom;
    const to = overrides?.dateTo !== undefined ? overrides.dateTo : dateTo;
    if (qVal) qs.set('q', qVal);
    if (action) qs.set('action', action);
    if (entity) qs.set('entity', entity);
    if (from) qs.set('dateFrom', from);
    if (to) qs.set('dateTo', to);
    return qs.toString();
  }

  function buildActivityQuery(pageNum = actPage, overrides?: ActivityOverrides) {
    const qVal = overrides?.q !== undefined ? overrides.q : actQ;
    const action = overrides?.action !== undefined ? overrides.action : actAction;
    const entity = overrides?.entity !== undefined ? overrides.entity : actEntity;
    const from = overrides?.dateFrom !== undefined ? overrides.dateFrom : dateFrom;
    const to = overrides?.dateTo !== undefined ? overrides.dateTo : dateTo;
    const sortVal = overrides?.sort !== undefined ? overrides.sort : sort;
    const orderVal = overrides?.order !== undefined ? overrides.order : order;
    const qs = new URLSearchParams();
    if (qVal) qs.set('q', qVal);
    if (action) qs.set('action', action);
    if (entity) qs.set('entity', entity);
    if (from) qs.set('dateFrom', from);
    if (to) qs.set('dateTo', to);
    qs.set('sort', sortVal);
    qs.set('order', orderVal);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function syncUrl(pageNum = actPage) {
    const qs = new URLSearchParams();
    if (tab !== 'profil') qs.set('tab', tab);
    if (tab === 'activite') {
      if (actQ) qs.set('q', actQ);
      if (actAction) qs.set('action', actAction);
      if (actEntity) qs.set('entity', actEntity);
      if (dateFrom !== monthStartISO()) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
      if (sort !== 'createdAt') qs.set('sort', sort);
      if (order !== 'desc') qs.set('order', order);
      if (pageNum > 1) qs.set('page', String(pageNum));
    }
    setSearchParams(qs, { replace: true });
  }

  function loadStats(overrides?: ActivityOverrides) {
    api<Stats>(`/auth/me/stats?${buildStatsQuery(overrides)}`).then(setStats).catch(() => {});
  }

  function loadActivity(pageNum = actPage, overrides?: ActivityOverrides) {
    setActLoading(true);
    api<PaginatedResponse<ActivityLog>>(`/auth/me/activity?${buildActivityQuery(pageNum, overrides)}`)
      .then((res) => {
        setActivity(res.items);
        setActPage(res.page);
        setActPages(res.pages);
        setActTotal(res.total);
        syncUrl(res.page);
      })
      .catch(() => setActivity([]))
      .finally(() => setActLoading(false));
  }

  function loadActivityWithStats(pageNum = actPage, overrides?: ActivityOverrides) {
    loadStats(overrides);
    loadActivity(pageNum, overrides);
  }

  useEffect(() => {
    if (!user) return;
    const prefs = normalizeSidebarPrefs(user.sidebarPrefs);
    setRailPaths(prefs?.rail ?? DEFAULT_RAIL_PATHS);
  }, [user?.id, user?.sidebarPrefs]);

  useEffect(() => {
    loadStats();
    if (user) {
      setProfile({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
      });
    }
  }, [user]);

  useEffect(() => {
    if (tab !== 'liste_banque') return;
    setCompanyLoading(true);
    api<CompanyForm>('/settings/company')
      .then((c) => {
        setCompany({
          companyName: c.companyName || '',
          address: c.address || '',
          city: c.city || '',
          phone: c.phone || '',
          email: c.email || '',
          ice: c.ice || '',
          rc: c.rc || '',
          logoPath: c.logoPath || '',
          bankLetterTitle: c.bankLetterTitle || '',
          bankLetterIntro: c.bankLetterIntro || '',
          bankLetterFooter: c.bankLetterFooter || '',
        });
      })
      .catch(() => setErr(t('settings.companyLoadError')))
      .finally(() => setCompanyLoading(false));
  }, [tab]);

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      const updated = await api<CompanyForm>('/settings/company', {
        method: 'PUT',
        body: JSON.stringify(company),
      });
      setCompany((prev) => ({ ...prev, ...updated, logoPath: updated.logoPath || prev.logoPath }));
      setMsg(t('settings.bankListSaved'));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function onCompanyLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const updated = (await uploadForm('/settings/company/logo', fd)) as CompanyForm;
      setCompany((prev) => ({ ...prev, logoPath: updated.logoPath || '' }));
      setMsg(t('settings.logoUpdated'));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : t('settings.uploadLogoError'));
    } finally {
      setSaving(false);
      e.target.value = '';
    }
  }

  function previewBankLetter() {
    printBankTransferList(
      [
        {
          id: 'demo1',
          source: 'ouvrier',
          firstName: 'Ahmed',
          lastName: 'Benali',
          cin: 'AB123456',
          bankName: 'Attijariwafa Bank',
          rib: '007 780 0001234567890123 45',
          category: 'Exemple',
        },
        {
          id: 'demo2',
          source: 'equipe',
          firstName: 'Sara',
          lastName: 'Alaoui',
          cin: 'CD789012',
          bankName: 'CIH Bank',
          rib: '230 780 0009876543210987 65',
          category: 'Exemple',
        },
      ],
      company,
      { periodLabel: t('settings.previewPrint') },
    );
  }

  useEffect(() => {
    if (tab === 'activite') loadActivityWithStats(actPage);
  }, []);

  useEffect(() => {
    if (!showFilters) return;
    function onClick(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setShowFilters(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowFilters(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [showFilters]);

  function switchTab(t: Tab) {
    setTab(t);
    setShowFilters(false);
    const qs = new URLSearchParams();
    if (t !== 'profil') qs.set('tab', t);
    setSearchParams(qs, { replace: true });
    if (t === 'activite') loadActivityWithStats(1);
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      await uploadForm<User>('/auth/me/photo', fd);
      const u = await refreshUser();
      if (u?.photo) {
        patchUser({ photo: u.photo });
        setMsg(t('settings.photoUpdated'));
      } else {
        setErr(t('settings.photoUploadError'));
      }
    } catch (err) {
      setErr(err instanceof Error ? err.message : t('msg.uploadError'));
    } finally {
      e.target.value = '';
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      await api('/auth/me/profile', {
        method: 'PUT',
        body: JSON.stringify(profile),
      });
      await refreshUser();
      setMsg(t('settings.profileUpdated'));
      loadStats();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  function moveRail(idx: number, dir: -1 | 1) {
    const next = [...railPaths];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setRailPaths(next);
  }

  function addToRail(path: string) {
    if (railPaths.includes(path)) return;
    setRailPaths([...railPaths, path]);
  }

  function removeFromRail(path: string) {
    setRailPaths(railPaths.filter((p) => p !== path));
  }

  async function saveSidebar() {
    if (railPaths.length === 0) {
      setErr(t('settings.sidebarMinOne'));
      return;
    }
    setSidebarSaving(true);
    setErr('');
    setMsg('');
    try {
      const res = await api<{ sidebarPrefs: { rail: string[] } | null }>('/auth/me/sidebar', {
        method: 'PUT',
        body: JSON.stringify({ rail: railPaths }),
      });
      patchUser({ sidebarPrefs: res.sidebarPrefs });
      await refreshUser();
      setMsg(t('settings.sidebarUpdated'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSidebarSaving(false);
    }
  }

  async function resetSidebar() {
    setSidebarSaving(true);
    setErr('');
    setMsg('');
    try {
      const res = await api<{ sidebarPrefs: { rail: string[] } | null }>('/auth/me/sidebar', {
        method: 'PUT',
        body: JSON.stringify({ reset: true }),
      });
      setRailPaths(DEFAULT_RAIL_PATHS);
      patchUser({ sidebarPrefs: res.sidebarPrefs });
      await refreshUser();
      setMsg(t('settings.sidebarReset'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSidebarSaving(false);
    }
  }

  async function start2FA() {
    setErr('');
    setMsg('');
    try {
      const res = await api<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', { method: 'POST' });
      setSetup(res);
      setMsg(t('settings.twoFaScanHint'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function enable2FA(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await api('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code: twoFaCode }) });
      setMsg(t('settings.twoFaEnabled'));
      setSetup(null);
      setTwoFaCode('');
      await refreshUser();
      loadStats();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function disable2FA(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await api('/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ code: twoFaCode, password: disablePwd }),
      });
      setMsg(t('settings.twoFaDisabled'));
      setTwoFaCode('');
      setDisablePwd('');
      await refreshUser();
      loadStats();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (pwd.next.length < 8) {
      setErr(t('settings.passwordMin8'));
      return;
    }
    if (pwd.next !== pwd.confirm) {
      setErr(t('settings.passwordMismatch'));
      return;
    }
    try {
      await api('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: pwd.current, newPassword: pwd.next }),
      });
      setMsg(t('settings.passwordUpdated'));
      setPwd({ current: '', next: '', confirm: '' });
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('common.error'));
    }
  }

  function exportActivityCsv() {
    downloadCsv(`/auth/me/activity/export/csv?${buildActivityQuery()}`, 'mon-activite-gic.csv');
  }

  function exportActivityExcel() {
    downloadExcel(`/auth/me/activity/export/xlsx?${buildActivityQuery()}`, 'mon-activite-gic.xlsx');
  }

  function printActivity() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><body style="font-family:sans-serif;padding:24px;font-size:11px">
      <h1>Mon activité — GIC</h1>
      <p>${user?.firstName} ${user?.lastName} · ${user?.email}</p>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;width:100%">
        <tr><th>Date</th><th>Action</th><th>Entité</th><th>Détails</th></tr>
        ${activity.map((l) => `<tr><td>${formatAuditDateTime(l.createdAt)}</td><td>${l.action}</td><td>${auditEntityLabel(l.entity)}</td><td>${l.details || '—'}</td></tr>`).join('')}
      </table>
    </body></html>`);
    w.document.close();
    w.print();
  }

  const qrUrl = setup ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(setup.otpauthUrl)}` : '';
  const hasActiveFilters = !!actQ || !!actAction || !!actEntity;
  const filteredCount = tab === 'activite' ? (stats?.actionsFiltered ?? actTotal) : stats?.actionsTotal ?? 0;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('settings.title')}
        subtitle={`${user?.firstName} ${user?.lastName} · ${user?.email}`}
      />

      <div className="mac-kpi-grid mac-kpi-grid-4 mb-4">
        <KpiCard
          title="2FA"
          value={stats?.twoFactorEnabled ? t('msg.enabled') : t('msg.disabled')}
          icon={stats?.twoFactorEnabled ? CheckCircle : XCircle}
          tone={stats?.twoFactorEnabled ? 'emerald' : 'coral'}
          compact
        />
        <KpiCard title={t('settings.lastLoginKpi')} value={formatDateTimeShort(stats?.lastLoginAt)} icon={Shield} tone="violet" compact />
        <KpiCard
          title={t('settings.actionsThisMonth')}
          value={stats?.actionsMonth ?? '—'}
          icon={Activity}
          tone="amber"
          delta={t('settings.totalCount', { count: stats?.actionsTotal ?? 0 })}
          deltaTone="muted"
          compact
        />
        <KpiCard
          title={t('pages.notifications')}
          value={stats?.unreadNotifications ?? 0}
          icon={Bell}
          tone="emerald"
          delta={t('kpi.unread')}
          deltaTone="muted"
          compact
        />
      </div>

      {(msg || err) && (
        <Card className={`mb-4 ${err ? 'border-gic-coral/40 bg-gic-coral-soft/30' : 'border-gic-emerald/40 bg-gic-emerald-soft/30'}`}>
          <p className={`text-[12px] font-medium ${err ? 'text-gic-coral' : 'text-gic-emerald'}`}>{err || msg}</p>
        </Card>
      )}

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(t) => switchTab(t as Tab)}
            ariaLabel={t('settings.sectionsAria')}
            groups={[
              {
                id: 'compte',
                label: t('settings.account'),
                items: [
                  { id: 'profil', label: t('settings.profile'), icon: UserIcon },
                  { id: 'langue', label: t('settings.language'), icon: Languages },
                  { id: 'navigation', label: t('settings.navigation'), icon: SlidersHorizontal },
                ],
              },
              {
                id: 'securite',
                label: t('settings.security'),
                items: [
                  { id: 'securite', label: t('settings.security'), icon: Shield },
                ],
              },
              {
                id: 'suivi',
                label: t('settings.follow'),
                items: [
                  { id: 'activite', label: t('settings.activity'), icon: Activity, badge: filteredCount },
                ],
              },
              {
                id: 'docs',
                label: t('settings.documents'),
                items: [
                  { id: 'liste_banque', label: t('settings.bankList'), icon: Building2 },
                ],
              },
              ...(adminModules.length > 0
                ? [{
                    id: 'admin',
                    label: t('settings.administration'),
                    items: [
                      { id: 'systeme', label: t('settings.system'), icon: Settings },
                    ],
                  }]
                : []),
            ]}
          />
        }
      >
      {tab === 'langue' && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Languages size={18} className="text-gic-violet" />
            <h2 className="text-[15px] font-semibold tracking-tight">{t('settings.language')}</h2>
          </div>
          <p className="text-[12px] text-gic-muted mb-1">{t('settings.languageHint')}</p>
          <p className="text-[12px] text-gic-muted mb-4">
            {t('settings.currentLanguage')}:{' '}
            <span className="font-medium text-gic-ink">
              {lang === 'ar' ? t('settings.arabic') : t('settings.french')}
            </span>
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {([
              { id: 'fr' as Lang, title: t('settings.french'), desc: t('settings.frenchDesc'), flag: 'FR' },
              { id: 'ar' as Lang, title: t('settings.arabic'), desc: t('settings.arabicDesc'), flag: 'ع' },
            ]).map((opt) => {
              const active = lang === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setLang(opt.id);
                    setErr('');
                    setMsg(t('settings.languageSaved'));
                  }}
                  className={[
                    'text-start rounded-xl border p-4 transition-all',
                    active
                      ? 'border-gic-violet bg-gic-violet-soft/60 shadow-panel ring-2 ring-gic-violet/25'
                      : 'border-gic-border bg-white hover:border-gic-violet/40 hover:bg-gic-violet-soft/20',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[22px] font-semibold tracking-tight leading-none mb-2">{opt.flag}</p>
                      <p className="text-[14px] font-semibold">{opt.title}</p>
                      <p className="text-[12px] text-gic-muted mt-1">{opt.desc}</p>
                    </div>
                    {active && (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gic-violet text-white shrink-0">
                        <Check size={14} strokeWidth={2.5} />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}
      {tab === 'profil' && (
        <>
          <div className="mac-detail-hero mb-4">
            <div className="mac-detail-hero-main">
              <MacProfilePhoto
                photo={user?.photo}
                firstName={user?.firstName}
                lastName={user?.lastName}
                bust={photoBust}
                editable
                onFileChange={onPhoto}
              />
              <div className="min-w-0">
                <p className="mac-detail-eyebrow">{t('nav.myProfile')}</p>
                <h1 className="mac-detail-name">{user?.firstName} {user?.lastName}</h1>
                <p className="mac-detail-meta">{user?.email}</p>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  <span className="mac-chip mac-chip-violet">{roleLabel(stats?.role || user?.role || '')}</span>
                  <span className={`mac-chip ${stats?.twoFactorEnabled ? 'mac-chip-green' : 'mac-chip-gray'}`}>
                    2FA {stats?.twoFactorEnabled ? 'on' : 'off'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mac-page-actions">
              <Btn variant="secondary" icon={SlidersHorizontal} onClick={() => switchTab('navigation')}>
                {t('settings.navigation')}
              </Btn>
              <Link to="/notifications"><Btn variant="secondary" icon={Bell}>{t('pages.notifications')}</Btn></Link>
              {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && (
                <Link to="/utilisateurs"><Btn variant="secondary" icon={Shield}>{t('pages.users')}</Btn></Link>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <UserIcon size={18} className="text-gic-violet" />
                <h2 className="text-sm font-semibold">{t('settings.editProfile')}</h2>
              </div>
              <form onSubmit={saveProfile} className="grid sm:grid-cols-2 gap-3">
                <Input label={t('fields.firstNameRequired')} required value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} />
                <Input label={t('fields.lastNameRequired')} required value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} />
                <Input label={t('fields.username')} value={profile.username} onChange={(e) => setProfile({ ...profile, username: e.target.value })} placeholder={t('settings.optionalPlaceholder')} />
                <Input label={t('fields.emailReadOnly')} value={user?.email || ''} disabled />
                <div className="sm:col-span-2">
                  <Btn type="submit" disabled={saving}>{saving ? t('auth.saving') : t('settings.saveProfile')}</Btn>
                </div>
              </form>
            </Card>
            <Card>
              <h2 className="text-sm font-semibold mb-4">{t('settings.accountInfo')}</h2>
              <dl className="grid sm:grid-cols-2 gap-4 text-[12px]">
                <Info label={t('fields.systemRole')} value={roleLabel(stats?.role || user?.role || '')} />
                <Info label={t('fields.memberSince')} value={formatDate(stats?.createdAt || user?.createdAt)} />
                <Info label={t('fields.lastLogin')} value={formatDateTimeShort(stats?.lastLoginAt || user?.lastLoginAt)} />
                <Info label="2FA" value={stats?.twoFactorEnabled ? t('msg.enabled') : t('msg.disabled')} />
              </dl>
            </Card>
          </div>
          <Card className="mt-4">
            <EccBrandFooter variant="inline" />
          </Card>
        </>
      )}

      {tab === 'navigation' && user && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <SlidersHorizontal size={18} className="text-gic-violet" />
              <h2 className="text-sm font-semibold">{t('settings.mySidebar')}</h2>
            </div>
            <p className="text-[12px] text-gic-muted mb-4">
              {t('settings.sidebarHint')}
            </p>
            {railPaths.length === 0 ? (
              <p className="text-[12px] text-gic-muted">{t('settings.noModuleSelected')}</p>
            ) : (
              <ul className="space-y-2">
                {railPaths.map((path, idx) => {
                  const item = navCatalog.get(path);
                  if (!item) return null;
                  const Icon = item.icon;
                  return (
                    <li key={path} className="flex items-center gap-2 rounded-xl border border-gic-border px-3 py-2">
                      <Icon size={16} className="text-gic-violet shrink-0" />
                      <span className="flex-1 text-[13px] font-medium">{t(item.label)}</span>
                      <Btn
                        variant="secondary"
                        className="!px-2 !py-1"
                        icon={ArrowUp}
                        disabled={idx === 0}
                        title={t('settings.moveUp')}
                        onClick={() => moveRail(idx, -1)}
                      />
                      <Btn
                        variant="secondary"
                        className="!px-2 !py-1"
                        icon={ArrowDown}
                        disabled={idx === railPaths.length - 1}
                        title={t('settings.moveDown')}
                        onClick={() => moveRail(idx, 1)}
                      />
                      <Btn
                        variant="secondary"
                        className="!px-2 !py-1"
                        icon={X}
                        title={t('common.remove')}
                        onClick={() => removeFromRail(path)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 mt-4">
              <Btn onClick={saveSidebar} disabled={sidebarSaving}>
                {sidebarSaving ? t('auth.saving') : t('common.save')}
              </Btn>
              <Btn variant="secondary" onClick={resetSidebar} disabled={sidebarSaving}>
                {t('settings.resetDefault')}
              </Btn>
            </div>
          </Card>
          <Card>
            <h2 className="text-sm font-semibold mb-4">{t('settings.availableModulesTitle')}</h2>
            {availableModules.length === 0 ? (
              <p className="text-[12px] text-gic-muted">
                {t('settings.allModulesInRail')}
              </p>
            ) : (
              <ul className="space-y-2">
                {availableModules.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
                      <Icon size={16} className="text-gic-muted shrink-0" />
                      <span className="flex-1 text-[13px]">{t(item.label)}</span>
                      <Btn
                        variant="secondary"
                        className="!px-2 !py-1"
                        icon={Plus}
                        onClick={() => addToRail(item.to)}
                      >
                        {t('common.add')}
                      </Btn>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'systeme' && adminModules.length > 0 && (
        <Card padding={false}>
          <div className="mac-panel-header px-4 pt-4 pb-2">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#007aff]/10 text-[#007aff] shrink-0">
                <Shield size={18} strokeWidth={2} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gic-ink">{t('settings.system')}</h2>
                <p className="text-[12px] text-gic-muted mt-0.5">{t('settings.systemDesc')}</p>
              </div>
            </div>
          </div>
          <div className="mac-panel border-0 shadow-none rounded-none">
            {adminModules.map((item, idx) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`mac-row group${idx < adminModules.length - 1 ? '' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black/[0.04] text-gic-muted shrink-0">
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="mac-row-title">{t(item.label)}</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gic-muted group-hover:text-[#007aff]" />
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {tab === 'liste_banque' && (
        <form onSubmit={saveCompany} className="space-y-4">
          <Card className="!p-4">
            <div className="flex items-start gap-3 mb-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#007aff]/10 text-[#007aff] shrink-0">
                <Building2 size={18} strokeWidth={2} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gic-ink">{t('settings.bankListCustomize')}</h2>
                <p className="text-[12px] text-gic-muted mt-0.5">
                  {t('settings.bankListDesc')}
                </p>
              </div>
            </div>

            {companyLoading ? (
              <p className="text-[12px] text-gic-muted py-4">{t('common.loading')}</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  {company.logoPath ? (
                    <img
                      src={fileUrl(company.logoPath)}
                      alt="Logo"
                      className="h-16 w-16 object-contain rounded-xl border border-gic-border bg-white"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-xl border border-dashed border-gic-border flex items-center justify-center text-[10px] text-gic-muted">
                      LOGO
                    </div>
                  )}
                  <label className="mac-upload-btn cursor-pointer">
                    {t('settings.changeLogo')}
                    <input type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={onCompanyLogo} />
                  </label>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <Input
                    label={t('fields.companyName')}
                    value={company.companyName}
                    onChange={(e) => setCompany({ ...company, companyName: e.target.value })}
                    required
                  />
                  <Input
                    label={t('fields.city')}
                    value={company.city}
                    onChange={(e) => setCompany({ ...company, city: e.target.value })}
                  />
                  <Input
                    className="sm:col-span-2"
                    label={t('fields.address')}
                    value={company.address}
                    onChange={(e) => setCompany({ ...company, address: e.target.value })}
                  />
                  <Input
                    label={t('fields.phone')}
                    value={company.phone}
                    onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                  />
                  <Input
                    label={t('fields.email')}
                    type="email"
                    value={company.email}
                    onChange={(e) => setCompany({ ...company, email: e.target.value })}
                  />
                  <Input
                    label={t('fields.ice')}
                    value={company.ice}
                    onChange={(e) => setCompany({ ...company, ice: e.target.value })}
                  />
                  <Input
                    label={t('fields.rc')}
                    value={company.rc}
                    onChange={(e) => setCompany({ ...company, rc: e.target.value })}
                  />
                </div>

                <Input
                  label={t('settings.documentTitle')}
                  value={company.bankLetterTitle}
                  onChange={(e) => setCompany({ ...company, bankLetterTitle: e.target.value })}
                />

                <div>
                  <label className="block text-[11px] font-medium text-gic-muted mb-1">
                    {t('settings.bankParagraph')}
                  </label>
                  <textarea
                    className="w-full min-h-[160px] rounded-xl border border-gic-border p-3 text-[12px] leading-relaxed"
                    value={company.bankLetterIntro}
                    onChange={(e) => setCompany({ ...company, bankLetterIntro: e.target.value })}
                    placeholder={t('settings.bankIntroPlaceholder')}
                  />
                  <p className="text-[10px] text-gic-muted mt-1">
                    {t('settings.bankParagraphHint')}
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gic-muted mb-1">
                    {t('settings.footerOptional')}
                  </label>
                  <textarea
                    className="w-full min-h-[72px] rounded-xl border border-gic-border p-3 text-[12px]"
                    value={company.bankLetterFooter}
                    onChange={(e) => setCompany({ ...company, bankLetterFooter: e.target.value })}
                    placeholder={t('msg.legalMentionsPlaceholder')}
                  />
                </div>

                <div className="flex flex-wrap gap-2 justify-end pt-1">
                  <Btn type="button" variant="secondary" icon={Eye} onClick={previewBankLetter}>
                    {t('settings.previewPrint')}
                  </Btn>
                  <Btn type="submit" disabled={saving}>
                    {saving ? t('auth.saving') : t('common.save')}
                  </Btn>
                </div>
              </div>
            )}
          </Card>

          <p className="text-[11px] text-gic-muted px-1">
            {t('settings.bankUsageHint')}{' '}
            <Link to="/salaires?type=virements" className="text-[#007aff] hover:underline">
              {t('pages.salaries')} → {t('settings.bankList')}
            </Link>
          </p>
        </form>
      )}

      {tab === 'securite' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Shield size={18} className="text-gic-violet" />
              <h2 className="text-sm font-semibold">{t('settings.twoFaTotp')}</h2>
            </div>
            <p className="text-[12px] text-gic-muted mb-3">
              {t('settings.twoFaGoogleHint')}{' '}
              {user?.twoFactorEnabled
                ? <span className="text-gic-emerald font-medium">{t('msg.enabled')}</span>
                : <span className="text-gic-coral font-medium">{t('msg.disabled')}</span>}
            </p>
            {!user?.twoFactorEnabled && !setup && (
              <Btn onClick={start2FA}>{t('settings.configure2fa')}</Btn>
            )}
            {setup && (
              <form onSubmit={enable2FA} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <img src={qrUrl} alt={t('settings.qrCode2fa')} className="rounded-xl border border-gic-border" width={180} height={180} />
                  <div className="rounded-xl bg-gray-50 p-3 text-[11px] break-all flex-1">
                    <p className="font-medium mb-1">{t('settings.manualSecret')}</p>
                    <code className="select-all">{setup.secret}</code>
                  </div>
                </div>
                <Input label={t('fields.verificationCode6')} value={twoFaCode} onChange={(e) => setTwoFaCode(e.target.value)} maxLength={6} required />
                <div className="flex gap-2">
                  <Btn type="submit">{t('settings.enable2fa')}</Btn>
                  <Btn variant="secondary" type="button" onClick={() => setSetup(null)}>{t('common.cancel')}</Btn>
                </div>
              </form>
            )}
            {user?.twoFactorEnabled && (
              <form onSubmit={disable2FA} className="space-y-3 mt-3">
                <p className="text-[11px] text-gic-muted">{t('settings.disable2faHint')}</p>
                <Input label={t('auth.password')} type="password" value={disablePwd} onChange={(e) => setDisablePwd(e.target.value)} required />
                <Input label={t('settings.twoFaCode')} value={twoFaCode} onChange={(e) => setTwoFaCode(e.target.value)} maxLength={6} required />
                <Btn variant="danger" type="submit">{t('actions.disable2fa')}</Btn>
              </form>
            )}
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Key size={18} className="text-gic-violet" />
              <h2 className="text-sm font-semibold">{t('settings.passwordSection')}</h2>
            </div>
            <form onSubmit={changePassword} className="space-y-3">
              <Input label={t('settings.currentPassword')} type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} required autoComplete="current-password" />
              <Input label={t('settings.newPasswordMin8')} type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} required minLength={8} autoComplete="new-password" />
              <Input label={t('auth.confirmPassword')} type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} required autoComplete="new-password" />
              <Btn type="submit">{t('actions.updatePassword')}</Btn>
            </form>
          </Card>
        </div>
      )}

      {tab === 'activite' && (
        <>
          <div className={`mac-filters-panel mb-4${showFilters ? ' mac-filters-panel-open' : ''}`}>
            <div className="mac-filters-row">
              <div className="mac-filters-toolbar">
                <MacSearch
                  value={actQ}
                  onChange={setActQ}
                  onSubmit={() => { setActPage(1); loadActivityWithStats(1); }}
                  placeholder={t('msg.searchActionEntity')}
                />
                <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0" />
                <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0" />
                <MacSelect
                  value={sort}
                  onChange={(v) => {
                    setSort(v);
                    setActPage(1);
                    loadActivityWithStats(1, { sort: v });
                  }}
                  options={[
                    { value: 'createdAt', label: t('columns.date') },
                    { value: 'action', label: t('columns.action') },
                    { value: 'entity', label: t('columns.entity') },
                  ]}
                  className="w-32 shrink-0"
                />
                <Btn
                  variant="secondary"
                  icon={order === 'asc' ? ArrowUp : ArrowDown}
                  className="!px-2 !py-2 shrink-0"
                  title={order === 'asc' ? t('msg.ascending') : t('msg.descending')}
                  onClick={() => {
                    const next = order === 'asc' ? 'desc' : 'asc';
                    setOrder(next);
                    setActPage(1);
                    loadActivityWithStats(1, { order: next });
                  }}
                />
                <div ref={filtersRef} className="relative shrink-0 z-50">
                  <Btn
                    variant="secondary"
                    icon={SlidersHorizontal}
                    title={t('common.filters')}
                    aria-label={t('common.filters')}
                    className={`!px-2 !py-2 relative${hasActiveFilters ? ' ring-1 ring-[#007aff]/40' : ''}`}
                    onClick={() => setShowFilters((v) => !v)}
                  >
                    {hasActiveFilters && <span className="mac-filter-dot" aria-hidden />}
                  </Btn>
                  {showFilters && (
                    <div className="mac-filter-menu max-h-[70vh] overflow-y-auto" role="menu">
                      <p className="mac-filter-menu-section">{t('settings.activityActionType')}</p>
                      {AUDIT_ACTION_FILTERS.map((f) => (
                        <button
                          key={f.id || 'all-action'}
                          type="button"
                          role="menuitem"
                          className={`mac-filter-menu-item${actAction === f.id ? ' mac-filter-menu-item-active' : ''}`}
                          onClick={() => {
                            setActAction(f.id);
                            setActPage(1);
                            loadActivityWithStats(1, { action: f.id });
                            setShowFilters(false);
                          }}
                        >
                          <span>{f.label}</span>
                          {actAction === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                        </button>
                      ))}
                      <div className="mac-filter-menu-sep" />
                      <p className="mac-filter-menu-section">{t('msg.entity')}</p>
                      {AUDIT_ENTITY_FILTERS.map((f) => (
                        <button
                          key={f.id || 'all-entity'}
                          type="button"
                          role="menuitem"
                          className={`mac-filter-menu-item${actEntity === f.id ? ' mac-filter-menu-item-active' : ''}`}
                          onClick={() => {
                            setActEntity(f.id);
                            setActPage(1);
                            loadActivityWithStats(1, { entity: f.id });
                            setShowFilters(false);
                          }}
                        >
                          <span>{f.label}</span>
                          {actEntity === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                        </button>
                      ))}
                      {hasActiveFilters && (
                        <>
                          <div className="mac-filter-menu-sep" />
                          <button
                            type="button"
                            className="mac-filter-menu-item mac-filter-menu-reset"
                            onClick={() => {
                              setActQ('');
                              setActAction('');
                              setActEntity('');
                              setActPage(1);
                              loadActivityWithStats(1, { q: '', action: '', entity: '' });
                              setShowFilters(false);
                            }}
                          >
                            {t('settings.resetFilters')}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <Btn variant="secondary" onClick={() => { setActPage(1); loadActivityWithStats(1); }}>{t('common.filter')}</Btn>
                <Btn variant="secondary" icon={Download} onClick={exportActivityCsv}>CSV</Btn>
                <Btn variant="secondary" icon={Download} onClick={exportActivityExcel}>{t('actions.exportExcel')}</Btn>
                <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printActivity} />
              </div>
            </div>
          </div>

          <Card padding={false}>
            {actLoading ? (
              <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
            ) : activity.length === 0 ? (
              <EmptyState title={t('msg.emptyActivity')} />
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('columns.action')}</Th>
                    <Th mac>{t('columns.entity')}</Th>
                    <Th mac>{t('columns.details')}</Th>
                    <Th mac>{t('columns.ip')}</Th>
                    <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {activity.map((l) => {
                    const entityPath = auditEntityLink(l.entity, l.entityId);
                    return (
                      <tr
                        key={l.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/audit/${l.id}`)}
                      >
                        <Td mac className="mac-table-muted whitespace-nowrap">{formatAuditDateTime(l.createdAt)}</Td>
                        <Td mac><ActionBadge action={l.action} /></Td>
                        <Td mac>
                          {entityPath ? (
                            <Link to={entityPath} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>
                              {auditEntityLabel(l.entity)}
                            </Link>
                          ) : (
                            <span>{auditEntityLabel(l.entity)}{l.entityId ? ` #${l.entityId.slice(0, 6)}` : ''}</span>
                          )}
                        </Td>
                        <Td mac className="mac-table-muted max-w-[200px] truncate">{l.details || '—'}</Td>
                        <Td mac className="text-[10px] font-mono mac-table-muted">{l.ipAddress || '—'}</Td>
                        <Td mac className="mac-td-actions">
                          <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                            <MacActionBtn icon={Eye} tone="blue" title={t('actions.auditDetail')} onClick={() => navigate(`/audit/${l.id}`)} />
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
            <Pagination page={actPage} pages={actPages} total={actTotal} limit={PAGE_SIZE} onPage={(p) => loadActivityWithStats(p)} mac />
          </Card>
        </>
      )}
      </DetailShell>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-gic-muted uppercase">{label}</p>
      <div className="font-medium">{value}</div>
    </div>
  );
}
