import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Pencil, Eye, Download, Printer, Trash2, Users, UserCheck, HardHat, Wallet,
  SlidersHorizontal, Check, ArrowUp, ArrowDown, Upload,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, fetchChantierList, formatMad, uploadForm, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { WorkforceFormFields, emptyWorkforceForm, workforceToForm, type WorkforceFormData } from '../components/WorkforceFormFields';
import { useCreateQuery } from '../hooks/useCreateQuery';
import {
  CHAUFFEUR_CATEGORY,
  scopeQueryParams,
  workforceDetailPath,
  type WorkforceScope,
} from '../lib/workforceScope';
import { useI18n } from '../i18n/I18nContext';

type Worker = {
  id: string;
  reference?: string;
  firstName: string;
  lastName: string;
  cin?: string;
  phone1?: string;
  category?: string;
  groupe?: string;
  dailySalary: number;
  monthlySalary?: number;
  salaryPeriod?: string;
  bankName?: string | null;
  rib?: string | null;
  declared: boolean;
  isActive: boolean;
  contractType?: string;
  assignments?: { chantier: { id: string; name: string } }[];
  _count?: { pointages: number; assignments: number };
};

type Stats = { total: number; actifs: number; inactifs: number; declared: number; assigned: number; avgSalary: number; categories: string[]; groupes: string[] };

const PAGE_SIZE = 20;
type SortOrder = 'asc' | 'desc';

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

export default function WorkforcePage({ mode = 'main_oeuvre' }: { mode?: WorkforceScope }) {
  const { t } = useI18n();
  const isChauffeur = mode === 'chauffeur';
  const scopeParams = scopeQueryParams(mode);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!isChauffeur && searchParams.get('category') === CHAUFFEUR_CATEGORY) {
      navigate('/chauffeurs', { replace: true });
    }
  }, [isChauffeur, navigate, searchParams]);
  const [items, setItems] = useState<Worker[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, actifs: 0, inactifs: 0, declared: 0, assigned: 0, avgSalary: 0, categories: [], groupes: [] });
  const [chantiers, setChantiers] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState(isChauffeur ? CHAUFFEUR_CATEGORY : (searchParams.get('category') || ''));
  const [groupeFilter, setGroupeFilter] = useState(searchParams.get('groupe') || '');
  const [activeFilter, setActiveFilter] = useState(searchParams.get('active') || '');
  const [declaredFilter, setDeclaredFilter] = useState(searchParams.get('declared') || '');
  const [chantierFilter, setChantierFilter] = useState(searchParams.get('chantierId') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'lastName');
  const [order, setOrder] = useState<SortOrder>((searchParams.get('order') === 'desc' ? 'desc' : 'asc'));
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<WorkforceFormData>(emptyWorkforceForm());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'csv' | 'xlsx'>('xlsx');
  const [importCsv, setImportCsv] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  function appendScope(qs: URLSearchParams) {
    if (scopeParams.category) qs.set('category', scopeParams.category);
    if (scopeParams.excludeCategory) qs.set('excludeCategory', scopeParams.excludeCategory);
  }

  function buildQuery(pageNum = page) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (!isChauffeur && categoryFilter) qs.set('category', categoryFilter);
    appendScope(qs);
    if (groupeFilter) qs.set('groupe', groupeFilter);
    if (activeFilter) qs.set('active', activeFilter);
    if (declaredFilter) qs.set('declared', declaredFilter);
    if (chantierFilter) qs.set('chantierId', chantierFilter);
    qs.set('sort', sort);
    qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs;
  }

  function load(pageNum = page, overrides?: { category?: string; groupe?: string; active?: string; declared?: string; chantierId?: string }) {
    setLoading(true);
    setError('');
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    const cat = overrides?.category !== undefined ? overrides.category : (isChauffeur ? CHAUFFEUR_CATEGORY : categoryFilter);
    const grp = overrides?.groupe !== undefined ? overrides.groupe : groupeFilter;
    const act = overrides?.active !== undefined ? overrides.active : activeFilter;
    const decl = overrides?.declared !== undefined ? overrides.declared : declaredFilter;
    const ch = overrides?.chantierId !== undefined ? overrides.chantierId : chantierFilter;
    if (!isChauffeur && cat) qs.set('category', cat);
    appendScope(qs);
    if (grp) qs.set('groupe', grp);
    if (act) qs.set('active', act);
    if (decl) qs.set('declared', decl);
    if (ch) qs.set('chantierId', ch);
    qs.set('sort', sort);
    qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    Promise.all([
      api<PaginatedResponse<Worker>>(`/chantiers/workforce?${qs}`),
      api<Stats>(`/chantiers/workforce/stats?${new URLSearchParams(scopeParams)}`),
    ])
      .then(([res, st]) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        setStats(st);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('msg.serverError')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(page);
  }, [sort, order]);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (!isChauffeur && categoryFilter) qs.set('category', categoryFilter);
    if (groupeFilter) qs.set('groupe', groupeFilter);
    if (activeFilter) qs.set('active', activeFilter);
    if (declaredFilter) qs.set('declared', declaredFilter);
    if (chantierFilter) qs.set('chantierId', chantierFilter);
    if (sort !== 'lastName') qs.set('sort', sort);
    if (order !== 'asc') qs.set('order', order);
    if (page > 1) qs.set('page', String(page));
    setSearchParams(qs, { replace: true });
  }, [q, categoryFilter, groupeFilter, activeFilter, declaredFilter, chantierFilter, sort, order, page, setSearchParams]);

  useEffect(() => {
    fetchChantierList<{ id: string; name: string }>().then(setChantiers);
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
    setEditId(null);
    setForm(isChauffeur ? { ...emptyWorkforceForm(), category: CHAUFFEUR_CATEGORY } : emptyWorkforceForm());
    setError('');
    setOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(w: Worker) {
    api(`/chantiers/workforce/${w.id}`).then((full) => {
      setEditId(w.id);
      setForm(workforceToForm(full));
      setError('');
      setOpen(true);
    });
  }

  function toBody(f: WorkforceFormData) {
    return {
      firstName: f.firstName,
      lastName: f.lastName,
      cin: f.cin || null,
      birthDate: f.birthDate || null,
      address: f.address || null,
      phone1: f.phone1 || null,
      phone2: f.phone2 || null,
      email: f.email || null,
      category: isChauffeur ? CHAUFFEUR_CATEGORY : (f.category || null),
      groupe: f.groupe || null,
      workPassport: f.workPassport || null,
      hireDate: f.hireDate || null,
      contractType: f.contractType || null,
      salaryPeriod: f.salaryPeriod || 'jour',
      cnssNumber: f.cnssNumber || null,
      dailySalary: f.dailySalary || 0,
      monthlySalary: f.monthlySalary || 0,
      bankName: f.bankName || null,
      rib: f.rib || null,
      declared: f.declared === 'true',
      isActive: f.isActive === 'true',
    };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const body = toBody(form);
      if (editId) {
        await api(`/chantiers/workforce/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/chantiers/workforce', { method: 'POST', body: JSON.stringify(body) });
      }
      setOpen(false);
      load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!deleteId || !deleteMotif.trim()) return;
    try {
      await api(`/chantiers/workforce/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      setDeleteId(null);
      setDeleteMotif('');
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function doImport(e: React.FormEvent) {
    e.preventDefault();
    let res: { created: number; skipped: number; errors: string[] };
    if (importMode === 'xlsx') {
      if (!importFile) return;
      const fd = new FormData();
      fd.append('file', importFile);
      res = await uploadForm('/chantiers/workforce/import/xlsx', fd);
      setImportFile(null);
    } else {
      res = await api('/chantiers/workforce/import/csv', { method: 'POST', body: JSON.stringify({ csv: importCsv }) });
      setImportCsv('');
    }
    setImportResult(t('msg.createdSkipped', { created: res.created, skipped: res.skipped }));
    load(1);
    setPage(1);
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${isChauffeur ? 'Chauffeurs' : 'Main-d\'œuvre'} GIC</title></head><body>
      <h1>${isChauffeur ? 'Chauffeurs' : 'Main-d\'œuvre'} — GIC</h1>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.name')}</th><th>${t('columns.cin')}</th><th>${t('columns.category')}</th><th>${t('columns.group')}</th><th>${t('columns.dailyRate')}</th><th>${t('columns.chantier')}</th><th>${t('columns.status')}</th></tr>
        ${items.map((worker) => `<tr>
          <td>${worker.firstName} ${worker.lastName}</td>
          <td>${worker.cin || '—'}</td>
          <td>${worker.category || '—'}</td>
          <td>${worker.groupe || '—'}</td>
          <td>${worker.dailySalary}</td>
          <td>${worker.assignments?.[0]?.chantier?.name || '—'}</td>
          <td>${worker.isActive ? t('status.active') : t('status.inactive')}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const statusFilters = [
    { id: '', label: t('common.all') },
    { id: 'true', label: t('kpi.active') },
    { id: 'false', label: t('common.inactivePlural') },
  ];

  const declaredFilters = [
    { id: '', label: t('common.allCnss') },
    { id: 'true', label: t('common.declaredCnssPlural') },
    { id: 'false', label: t('common.undeclaredPlural') },
  ];

  const hasActiveFilters = !!activeFilter || !!declaredFilter || (!isChauffeur && !!categoryFilter) || !!groupeFilter || !!chantierFilter;
  const exportBase = isChauffeur ? 'chauffeurs-gic' : 'main-oeuvre-gic';

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={isChauffeur ? t('pages.drivers') : t('pages.workforce')}
        subtitle={isChauffeur ? t('pages.driversSubtitle') : t('pages.workforceChantierSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/chantiers/workforce/export/csv?${buildQuery(1)}`, `${exportBase}.csv`)}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadExcel(`/chantiers/workforce/export/xlsx?${buildQuery(1)}`, `${exportBase}.xlsx`)}>{t('common.excel')}</Btn>
            <Btn variant="secondary" icon={Upload} onClick={() => { setImportOpen(true); setImportResult(null); }}>{t('common.importShort')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={isChauffeur ? t('kpi.totalDrivers') : t('kpi.totalPersonnel')} value={stats.total} icon={Users} tone="violet" />
        <KpiCard title={t('kpi.active')} value={stats.actifs} icon={UserCheck} tone="emerald" delta={t('msg.inactiveCount', { count: stats.inactifs })} deltaTone="muted" />
        <KpiCard title={t('kpi.assignedSite')} value={stats.assigned} icon={HardHat} tone="amber" delta={t('msg.declaredCnssDelta', { count: stats.declared })} deltaTone="muted" />
        <KpiCard title={t('kpi.avgDailySalary')} value={formatMadCompact(stats.avgSalary)} icon={Wallet} tone="coral" compact />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={isChauffeur ? t('msg.searchNameCinGroup') : t('msg.searchNameCinCategory')}
            />
            <MacSelect
              value={chantierFilter}
              onChange={(v) => {
                setChantierFilter(v);
                setPage(1);
                load(1, { chantierId: v });
              }}
              options={[
                { value: '', label: t('common.allSites') },
                ...chantiers.map((c) => ({ value: c.id, label: c.name })),
              ]}
              className="w-44 shrink-0"
            />
            <MacSelect
              value={sort}
              onChange={setSort}
              options={[
                { value: 'lastName', label: t('common.name') },
                { value: 'category', label: t('fields.category') },
                { value: 'dailySalary', label: t('fields.salary') },
                { value: 'createdAt', label: t('msg.newestFirst') },
              ]}
              className="w-40 shrink-0"
            />
            <Btn
              variant="secondary"
              icon={order === 'asc' ? ArrowUp : ArrowDown}
              className="!px-2 !py-2 shrink-0"
              title={order === 'asc' ? t('msg.ascending') : t('msg.descending')}
              onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
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
                  <p className="mac-filter-menu-section">{t('common.status')}</p>
                  {statusFilters.map((f) => (
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
                  <p className="mac-filter-menu-section">{t('fields.cnss')}</p>
                  {declaredFilters.map((f) => (
                    <button
                      key={f.id || 'all-cnss'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${declaredFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setDeclaredFilter(f.id);
                        setPage(1);
                        load(1, { declared: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {declaredFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  {stats.categories.length > 0 && !isChauffeur && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <p className="mac-filter-menu-section">{t('fields.category')}</p>
                      <button
                        type="button"
                        role="menuitem"
                        className={`mac-filter-menu-item${categoryFilter === '' ? ' mac-filter-menu-item-active' : ''}`}
                        onClick={() => {
                          setCategoryFilter('');
                          setPage(1);
                          load(1, { category: '' });
                        }}
                      >
                        <span>Toutes</span>
                        {categoryFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                      </button>
                      {stats.categories.map((c) => (
                        <button
                          key={c}
                          type="button"
                          role="menuitem"
                          className={`mac-filter-menu-item${categoryFilter === c ? ' mac-filter-menu-item-active' : ''}`}
                          onClick={() => {
                            setCategoryFilter(c);
                            setPage(1);
                            load(1, { category: c });
                          }}
                        >
                          <span>{c}</span>
                          {categoryFilter === c && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                        </button>
                      ))}
                    </>
                  )}
                  {stats.groupes.length > 0 && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <p className="mac-filter-menu-section">{t('fields.group')}</p>
                      <button
                        type="button"
                        role="menuitem"
                        className={`mac-filter-menu-item${groupeFilter === '' ? ' mac-filter-menu-item-active' : ''}`}
                        onClick={() => {
                          setGroupeFilter('');
                          setPage(1);
                          load(1, { groupe: '' });
                        }}
                      >
                        <span>Tous</span>
                        {groupeFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                      </button>
                      {stats.groupes.map((g) => (
                        <button
                          key={g}
                          type="button"
                          role="menuitem"
                          className={`mac-filter-menu-item${groupeFilter === g ? ' mac-filter-menu-item-active' : ''}`}
                          onClick={() => {
                            setGroupeFilter(g);
                            setPage(1);
                            load(1, { groupe: g });
                          }}
                        >
                          <span>{g}</span>
                          {groupeFilter === g && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                        </button>
                      ))}
                    </>
                  )}
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setActiveFilter('');
                          setDeclaredFilter('');
                          setCategoryFilter('');
                          setGroupeFilter('');
                          setChantierFilter('');
                          setPage(1);
                          load(1, { active: '', declared: '', category: '', groupe: '', chantierId: '' });
                          setShowFilters(false);
                        }}
                      >
                        Réinitialiser
                      </button>
                    </>
                  )}
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
          <EmptyState title={isChauffeur ? t('msg.emptyDrivers') : t('msg.emptyWorkers')} action={<Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.ref')}</Th>
                <Th mac>{t('columns.name')}</Th>
                <Th mac>{t('columns.cin')}</Th>
                {!isChauffeur && <Th mac>{t('columns.category')}</Th>}
                <Th mac>{t('columns.group')}</Th>
                <Th mac>{t('columns.mode')}</Th>
                <Th mac>{t('columns.salary')}</Th>
                <Th mac>{t('columns.chantier')}</Th>
                <Th mac>{t('columns.cnss')}</Th>
                <Th mac>{t('columns.attendanceCount')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((w) => {
                const isMois = w.salaryPeriod === 'mois';
                return (
                <tr key={w.id} className="cursor-pointer" onClick={() => navigate(workforceDetailPath(mode, w.id))}>
                  <Td mac className="mac-table-muted text-[11px]">{w.reference || '—'}</Td>
                  <Td mac>
                    <span className="mac-table-ref">
                      {w.firstName} {w.lastName}
                    </span>
                  </Td>
                  <Td mac className="mac-table-muted">{w.cin || '—'}</Td>
                  {!isChauffeur && <Td mac>{w.category || '—'}</Td>}
                  <Td mac className="mac-table-muted">{w.groupe || '—'}</Td>
                  <Td mac>
                    <span className={`mac-chip ${isMois ? 'mac-chip-violet' : 'mac-chip-blue'}`}>
                      {isMois ? 'Mois' : 'Jour'}
                    </span>
                  </Td>
                  <Td mac>{formatMad(isMois ? (w.monthlySalary || 0) : w.dailySalary)}</Td>
                  <Td mac>
                    {w.assignments?.[0]?.chantier ? (
                      <Link to={`/chantiers/${w.assignments[0].chantier.id}`} className="mac-table-ref">
                        {w.assignments[0].chantier.name}
                      </Link>
                    ) : '—'}
                  </Td>
                  <Td mac>
                    {w.declared ? (
                      <span className="mac-chip mac-chip-emerald">Déclaré</span>
                    ) : (
                      <span className="mac-chip mac-chip-gray">Non décl.</span>
                    )}
                  </Td>
                  <Td mac>
                    <span className="mac-chip mac-chip-blue">{isMois ? '—' : (w._count?.pointages ?? 0)}</span>
                  </Td>
                  <Td mac>
                    <StatusPill status={w.isActive ? 'actif' : 'inactif'} quiet />
                  </Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <Link to={workforceDetailPath(mode, w.id)} className="mac-action-btn mac-action-btn-blue" title={t('actions.ficheDetail')}>
                        <Eye size={14} strokeWidth={2.15} />
                      </Link>
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(w)} />
                      <MacActionBtn
                        icon={Trash2}
                        tone="red"
                        title={t('common.delete')}
                        onClick={() => { setDeleteId(w.id); setDeleteMotif(''); }}
                      />
                    </div>
                  </Td>
                </tr>
              );
              })}
            </tbody>
          </TableWrap>
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => load(p)} mac />
      </Card>

      <Modal
        open={open}
        size="lg"
        title={editId ? (isChauffeur ? t('actions.editDriver') : t('actions.editWorker')) : (isChauffeur ? t('actions.newDriver') : t('actions.newMember'))}
        onClose={() => setOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn><Btn form="workforce-form" type="submit">{editId ? t('common.save') : t('common.add')}</Btn></>}
      >
        <form id="workforce-form" onSubmit={save}>
          <WorkforceFormFields
            form={form}
            setForm={setForm}
            categories={isChauffeur ? [CHAUFFEUR_CATEGORY] : stats.categories}
            hideCategory={isChauffeur}
          />
          {error && <p className="mt-3 text-[11px] text-gic-coral">{error}</p>}
        </form>
      </Modal>

      <Modal
        open={!!deleteId}
        title={isChauffeur ? t('actions.deleteDriver') : t('actions.deleteWorker')}
        onClose={() => setDeleteId(null)}
        footer={<><Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn></>}
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.deletionBlockedWorker')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.motifPlaceholder')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>

      <Modal open={importOpen} title={t('actions.importPersonnel')} onClose={() => setImportOpen(false)} footer={<Btn form="workforce-import-form" type="submit">{t('actions.import')}</Btn>}>
        <form id="workforce-import-form" onSubmit={doImport} className="space-y-3">
          <div className="flex gap-2">
            <Btn type="button" variant={importMode === 'csv' ? 'primary' : 'secondary'} onClick={() => setImportMode('csv')}>{t('common.csv')}</Btn>
            <Btn type="button" variant={importMode === 'xlsx' ? 'primary' : 'secondary'} onClick={() => setImportMode('xlsx')}>{t('common.excelXlsx')}</Btn>
          </div>
          {importMode === 'csv' ? (
            <>
              <p className="text-[11px] text-gic-muted">{t('msg.importFormatWorkforce')}</p>
              <textarea className="w-full h-32 rounded-xl border border-gic-border p-3 text-[12px]" value={importCsv} onChange={(e) => setImportCsv(e.target.value)} placeholder="Ahmed;Alami;AB123456;0612345678;Maçon;Équipe A;250;Oui;Journalier;" />
            </>
          ) : (
            <>
              <p className="text-[11px] text-gic-muted">{t('msg.importColumnsWorkforce')}</p>
              <input type="file" accept=".xlsx,.xls" className="text-[12px]" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
            </>
          )}
          {importResult && <p className="text-[12px] text-gic-emerald">{importResult}</p>}
        </form>
      </Modal>
    </div>
  );
}
