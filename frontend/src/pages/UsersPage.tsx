import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Pencil, Users, Download, Eye, SlidersHorizontal, Check,
  ArrowUp, ArrowDown, UserCheck, Shield,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';

type UserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  twoFactorEnabled?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  internalStaff?: { id: string; reference?: string | null } | null;
};

type Stats = { total: number; actifs: number; inactifs: number };

const ROLE_VALUES = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMPTABLE',
  'COMMERCIAL',
  'CHEF_CHANTIER',
  'USER',
] as const;

function roleI18nKey(role: string): string {
  const map: Record<string, string> = {
    SUPER_ADMIN: 'role.superAdmin',
    ADMIN: 'role.admin',
    COMPTABLE: 'role.accountant',
    COMMERCIAL: 'role.commercial',
    CHEF_CHANTIER: 'role.siteManager',
    USER: 'role.user',
  };
  return map[role] || 'role.user';
}

function rolesForSelect(t: TranslateFn, meRole?: string) {
  return ROLE_VALUES
    .filter((value) => meRole === 'SUPER_ADMIN' || value !== 'SUPER_ADMIN')
    .map((value) => ({ value, label: t(roleI18nKey(value)) }));
}

const PAGE_SIZE = 20;
type SortOrder = 'asc' | 'desc';

function emptyUserForm() {
  return {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'COMMERCIAL',
    isActive: 'true',
  };
}

export default function UsersPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<UserRow[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, actifs: 0, inactifs: 0 });
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [roleFilter, setRoleFilter] = useState(searchParams.get('role') || '');
  const [activeFilter, setActiveFilter] = useState(searchParams.get('active') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'lastName');
  const [order, setOrder] = useState<SortOrder>((searchParams.get('order') as SortOrder) || 'asc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyUserForm());
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const roleOptions = rolesForSelect(t, me?.role);

  function buildStatsQuery() {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (roleFilter) qs.set('role', roleFilter);
    if (activeFilter) qs.set('active', activeFilter);
    return qs.toString();
  }

  function buildQuery(
    pageNum = page,
    overrides?: { role?: string; active?: string; sort?: string; order?: SortOrder },
  ) {
    const qs = new URLSearchParams();
    const role = overrides?.role !== undefined ? overrides.role : roleFilter;
    const active = overrides?.active !== undefined ? overrides.active : activeFilter;
    const sortVal = overrides?.sort !== undefined ? overrides.sort : sort;
    const orderVal = overrides?.order !== undefined ? overrides.order : order;
    if (q) qs.set('q', q);
    if (role) qs.set('role', role);
    if (active) qs.set('active', active);
    qs.set('sort', sortVal);
    qs.set('order', orderVal);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function syncUrl(pageNum = page) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (roleFilter) qs.set('role', roleFilter);
    if (activeFilter) qs.set('active', activeFilter);
    if (sort !== 'lastName') qs.set('sort', sort);
    if (order !== 'asc') qs.set('order', order);
    if (pageNum > 1) qs.set('page', String(pageNum));
    setSearchParams(qs, { replace: true });
  }

  function load(
    pageNum = page,
    overrides?: { role?: string; active?: string; sort?: string; order?: SortOrder },
  ) {
    setLoading(true);
    setError('');
    const statsQs = buildStatsQuery();
    Promise.all([
      api<PaginatedResponse<UserRow>>(`/auth/users?${buildQuery(pageNum, overrides)}`),
      api<Stats>(`/auth/users/stats?${statsQs}`),
    ])
      .then(([res, st]) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        setStats(st);
        syncUrl(res.page);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('msg.serverError')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(page);
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

  function openCreate() {
    setForm(emptyUserForm());
    setFormError('');
    setOpen(true);
  }

  useCreateQuery(openCreate);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    try {
      await api('/auth/users', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          isActive: form.isActive === 'true',
        }),
      });
      setOpen(false);
      load(1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function exportCsv() {
    downloadCsv(`/auth/users/export/csv?${buildStatsQuery()}`, 'utilisateurs-gic.csv');
  }

  function exportExcel() {
    downloadExcel(`/auth/users/export/xlsx?${buildStatsQuery()}`, 'utilisateurs-gic.xlsx');
  }

  const hasActiveFilters = !!roleFilter || !!activeFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.usersPlatform')}
        subtitle={t('pages.usersSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={exportExcel}>{t('common.excel')}</Btn>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newUser')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-3">
        <KpiCard title={t('kpi.accounts')} value={stats.total} icon={Users} tone="violet" />
        <KpiCard title={t('kpi.active')} value={stats.actifs} icon={UserCheck} tone="emerald" />
        <KpiCard title={t('kpi.inactive')} value={stats.inactifs} icon={Shield} tone="amber" />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('pages.usersSearchPlaceholder')}
            />
            <MacSelect
              value={sort}
              onChange={(v) => {
                setSort(v);
                setPage(1);
                load(1, { sort: v });
              }}
              options={[
                { value: 'lastName', label: t('columns.lastName') },
                { value: 'firstName', label: t('columns.firstName') },
                { value: 'email', label: t('columns.email') },
                { value: 'role', label: t('columns.role') },
                { value: 'lastLoginAt', label: t('columns.lastLogin') },
              ]}
              className="w-40 shrink-0"
            />
            <Btn
              variant="secondary"
              icon={order === 'asc' ? ArrowUp : ArrowDown}
              className="!px-2 !py-2 shrink-0"
              title={order === 'asc' ? t('msg.ascending') : t('msg.descending')}
              onClick={() => {
                const next = order === 'asc' ? 'desc' : 'asc';
                setOrder(next);
                setPage(1);
                load(1, { order: next });
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
                <div className="mac-filter-menu" role="menu">
                  <p className="mac-filter-menu-section">{t('fields.status')}</p>
                  {[
                    { id: '', label: t('common.all') },
                    { id: 'true', label: t('kpi.active') },
                    { id: 'false', label: t('kpi.inactive') },
                  ].map((f) => (
                    <button
                      key={f.id || 'all'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${activeFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setActiveFilter(f.id);
                        setPage(1);
                        load(1, { active: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {activeFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  <div className="mac-filter-menu-sep" />
                  <p className="mac-filter-menu-section">{t('fields.role')}</p>
                  <button type="button" role="menuitem" className={`mac-filter-menu-item${roleFilter === '' ? ' mac-filter-menu-item-active' : ''}`}
                    onClick={() => { setRoleFilter(''); setPage(1); load(1, { role: '' }); }}>
                    <span>{t('common.all')}</span>
                    {roleFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                  </button>
                  {roleOptions.map((r) => (
                    <button key={r.value} type="button" role="menuitem"
                      className={`mac-filter-menu-item${roleFilter === r.value ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => { setRoleFilter(r.value); setPage(1); load(1, { role: r.value }); }}>
                      <span>{r.label}</span>
                      {roleFilter === r.value && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Btn variant="secondary" onClick={() => { setPage(1); load(1); }}>{t('common.filter')}</Btn>
          </div>
        </div>
      </div>

      {error && (
        <Card className="mb-4 border-gic-coral/40 bg-gic-coral-soft/30">
          <p className="text-[12px] text-gic-coral font-medium">{error}</p>
          <Btn variant="secondary" className="mt-2" onClick={() => load(page)}>{t('common.retry')}</Btn>
        </Card>
      )}

      <Card padding={false}>
        {loading ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState title={t('msg.emptyUsers')} action={<Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.user')}</Th>
                <Th mac>{t('columns.email')}</Th>
                <Th mac>{t('columns.role')}</Th>
                <Th mac>{t('columns.hrFile')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="cursor-pointer" onClick={() => navigate(`/utilisateurs/${u.id}`)}>
                  <Td mac className="font-medium">
                    <p>{u.firstName} {u.lastName}</p>
                    {u.twoFactorEnabled && <Shield size={11} className="inline ml-1.5 text-[#007aff]" aria-label="2FA" />}
                  </Td>
                  <Td mac className="text-[11px]">{u.email}</Td>
                  <Td mac className="text-[11px]">{t(roleI18nKey(u.role))}</Td>
                  <Td mac className="text-[11px]">
                    {u.internalStaff ? (
                      <button type="button" className="text-[#007aff] hover:underline" onClick={(e) => { e.stopPropagation(); navigate(`/equipe-interne/${u.internalStaff!.id}`); }}>
                        {u.internalStaff.reference || t('columns.hrFile')}
                      </button>
                    ) : (
                      <span className="text-gic-muted">—</span>
                    )}
                  </Td>
                  <Td mac><StatusPill status={u.isActive ? 'actif' : 'inactif'} quiet /></Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <MacActionBtn icon={Eye} tone="blue" title={t('common.view')} onClick={() => navigate(`/utilisateurs/${u.id}`)} />
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => navigate(`/utilisateurs/${u.id}`, { state: { edit: true } })} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => load(p)} mac />
      </Card>

      <Modal open={open} title={t('actions.newUser')} onClose={() => setOpen(false)} size="md"
        footer={<><Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn><Btn form="user-form" type="submit">{t('common.add')}</Btn></>}
      >
        <form id="user-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <Input label={t('fields.firstNameRequired')} required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <Input label={t('fields.lastNameRequired')} required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          <Input label={t('fields.emailRequired')} type="email" required className="sm:col-span-2" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label={t('fields.passwordRequiredStar')} type="password" required className="sm:col-span-2" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Select label={t('fields.role')} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {roleOptions.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
          <Select label={t('fields.status')} value={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.value })}>
            <option value="true">{t('fields.active')}</option>
            <option value="false">{t('fields.inactive')}</option>
          </Select>
          <p className="sm:col-span-2 text-[11px] text-gic-muted">{t('pages.usersRhHint')}</p>
          {formError && <p className="sm:col-span-2 text-[11px] text-gic-coral">{formError}</p>}
        </form>
      </Modal>
    </div>
  );
}
