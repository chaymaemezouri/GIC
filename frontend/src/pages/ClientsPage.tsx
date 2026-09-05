import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, Download, Upload, Eye, Users, UserCheck, Home, Printer, Archive, SlidersHorizontal, Check,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, fetchAgentList, uploadForm, type PaginatedClients } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { ClientFormFields, emptyClientForm, clientToForm, type ClientFormData } from '../components/ClientFormFields';
import MacAvatar from '../components/MacAvatar';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';

type Client = {
  id: string;
  reference: string;
  photo?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone1: string;
  identityNumber?: string | null;
  isProspect: boolean;
  isBuyer: boolean;
  isTenant: boolean;
  agent?: { firstName: string; lastName: string } | null;
  _count?: { sales: number; rentals: number };
};

type Stats = { total: number; prospects: number; buyers: number; tenants: number; archived: number };

const PAGE_SIZE = 20;
type SortOrder = 'asc' | 'desc';

export default function ClientsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<Client[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, prospects: 0, buyers: 0, tenants: 0, archived: 0 });
  const [agents, setAgents] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [identityTypes, setIdentityTypes] = useState<string[]>([]);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || '');
  const [archivedFilter, setArchivedFilter] = useState(searchParams.get('archived') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'createdAt');
  const [order, setOrder] = useState<SortOrder>((searchParams.get('order') as SortOrder) || 'desc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'csv' | 'xlsx'>('csv');
  const [importCsv, setImportCsv] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [form, setForm] = useState<ClientFormData>(emptyClientForm());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildStatsQuery() {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (typeFilter) qs.set('type', typeFilter);
    if (archivedFilter) qs.set('archived', archivedFilter);
    return qs.toString();
  }

  function buildListQuery(
    pageNum = page,
    overrides?: { type?: string; archived?: string; sort?: string; order?: SortOrder },
  ) {
    const type = overrides?.type !== undefined ? overrides.type : typeFilter;
    const archived = overrides?.archived !== undefined ? overrides.archived : archivedFilter;
    const sortVal = overrides?.sort !== undefined ? overrides.sort : sort;
    const orderVal = overrides?.order !== undefined ? overrides.order : order;
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (type) qs.set('type', type);
    if (archived) qs.set('archived', archived);
    qs.set('sort', sortVal);
    qs.set('order', orderVal);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function syncUrl(pageNum = page) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (typeFilter) qs.set('type', typeFilter);
    if (archivedFilter) qs.set('archived', archivedFilter);
    if (sort !== 'createdAt') qs.set('sort', sort);
    if (order !== 'desc') qs.set('order', order);
    if (pageNum > 1) qs.set('page', String(pageNum));
    setSearchParams(qs, { replace: true });
  }

  function load(
    pageNum = page,
    overrides?: { type?: string; archived?: string; sort?: string; order?: SortOrder },
  ) {
    setLoading(true);
    setError('');
    const statsQs = buildStatsQuery();
    Promise.all([
      api<PaginatedClients<Client>>(`/clients?${buildListQuery(pageNum, overrides)}`),
      api<Stats>(`/clients/stats?${statsQs}`),
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
    fetchAgentList<{ id: string; firstName: string; lastName: string }>({ active: 'true', limit: 500 }).then(setAgents);
    api<{ value: string }[]>('/dropdowns/identity_type').then((d) => setIdentityTypes(d.map((x) => x.value))).catch(() => {});
    api<{ value: string }[]>('/dropdowns/client_source').then((d) => setSourceOptions(d.map((x) => x.value))).catch(() => {});
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
    setForm(emptyClientForm());
    setError('');
    setOpen(true);
  }

  useCreateQuery(openCreate);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/clients', { method: 'POST', body: JSON.stringify(form) });
      setOpen(false);
      load(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function doImport(e: React.FormEvent) {
    e.preventDefault();
    let res: { created: number; skipped: number; errors: string[] };
    if (importMode === 'xlsx') {
      if (!importFile) return;
      const fd = new FormData();
      fd.append('file', importFile);
      res = await uploadForm('/clients/import/xlsx', fd);
      setImportFile(null);
    } else {
      res = await api('/clients/import/csv', { method: 'POST', body: JSON.stringify({ csv: importCsv }) });
      setImportCsv('');
    }
    setImportResult(t('msg.createdSkipped', { created: res.created, skipped: res.skipped }));
    load(1);
    setPage(1);
  }

  async function confirmDelete() {
    if (!deleteId || !deleteMotif.trim()) return;
    try {
      await api(`/clients/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      setDeleteId(null);
      setDeleteMotif('');
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${t('pages.clients')} — GIC</title></head><body>
      <h1>${t('pages.clients')} — GIC</h1>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.ref')}</th><th>${t('columns.name')}</th><th>${t('columns.email')}</th><th>${t('columns.phone')}</th><th>${t('columns.cin')}</th><th>${t('columns.type')}</th></tr>
        ${items.map((c) => `<tr>
          <td>${c.reference}</td>
          <td>${c.firstName} ${c.lastName}</td>
          <td>${c.email}</td>
          <td>${c.phone1}</td>
          <td>${c.identityNumber || '—'}</td>
          <td>${[c.isProspect && t('fields.prospect'), c.isBuyer && t('fields.buyer'), c.isTenant && t('fields.tenant')].filter(Boolean).join(', ')}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const filters = [
    { id: '', label: t('common.all') },
    { id: 'prospect', label: t('common.prospectsPlural') },
    { id: 'acheteur', label: t('common.buyersPlural') },
    { id: 'locataire', label: t('common.tenantsPlural') },
  ];

  const archivedFilters = [
    { id: '', label: t('kpi.active') },
    { id: 'true', label: t('common.archivedPlural') },
    { id: 'all', label: t('common.all') },
  ];

  const hasActiveFilters = !!typeFilter || !!archivedFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.clients')}
        subtitle={t('pages.clientsSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Printer} onClick={printList}>{t('common.print')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/clients/export/csv?${buildStatsQuery()}`, 'clients-gic.csv')}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadExcel(`/clients/export/xlsx?${buildStatsQuery()}`, 'clients-gic.xlsx')}>{t('common.excel')}</Btn>
            <Btn variant="secondary" icon={Upload} onClick={() => { setImportOpen(true); setImportResult(null); }}>{t('common.importShort')}</Btn>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.addClient')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-5">
        <KpiCard title={t('kpi.active')} value={stats.total} icon={Users} tone="violet" />
        <KpiCard title={t('fields.prospect')} value={stats.prospects} icon={Users} tone="amber" />
        <KpiCard title={t('fields.buyer')} value={stats.buyers} icon={UserCheck} tone="emerald" />
        <KpiCard title={t('fields.tenant')} value={stats.tenants} icon={Home} tone="teal" />
        <KpiCard title={t('status.archived')} value={stats.archived} icon={Archive} tone="purple" delta={t('msg.outsideActiveLists')} deltaTone="muted" />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchNameRefEmailCin')}
            />
            <MacSelect
              value={sort}
              onChange={(v) => {
                setSort(v);
                setPage(1);
                load(1, { sort: v });
              }}
              options={[
                { value: 'createdAt', label: t('msg.newestFirst') },
                { value: 'name', label: t('common.name') },
                { value: 'reference', label: t('fields.reference') },
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
                  <p className="mac-filter-menu-section">{t('common.type')}</p>
                  {filters.map((f) => (
                    <button
                      key={f.id || 'all-type'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${typeFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setTypeFilter(f.id);
                        setPage(1);
                        load(1, { type: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {typeFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  <div className="mac-filter-menu-sep" />
                  <p className="mac-filter-menu-section">{t('common.status')}</p>
                  {archivedFilters.map((f) => (
                    <button
                      key={f.id || 'active'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${archivedFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setArchivedFilter(f.id);
                        setPage(1);
                        load(1, { archived: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {archivedFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setTypeFilter('');
                          setArchivedFilter('');
                          setPage(1);
                          load(1, { type: '', archived: '' });
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
          <p className="text-[11px] text-gic-muted mt-1">{t('msg.backendHint')}</p>
          <Btn variant="secondary" className="mt-2" onClick={() => load(page)}>{t('common.retry')}</Btn>
        </Card>
      )}

      <Card padding={false}>
        {loading ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState title={t('msg.emptyClients')} action={<Btn icon={Plus} onClick={openCreate}>{t('actions.addClient')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.photo')}</Th>
                <Th mac>{t('columns.reference')}</Th>
                <Th mac>{t('columns.fullName')}</Th>
                <Th mac>{t('columns.email')}</Th>
                <Th mac>{t('columns.phoneFull')}</Th>
                <Th mac>{t('columns.cin')}</Th>
                <Th mac>{t('columns.agent')}</Th>
                <Th mac>{t('columns.properties')}</Th>
                <Th mac>{t('columns.classification')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/clients/${c.id}`)}
                >
                  <Td mac>
                    <MacAvatar photo={c.photo} firstName={c.firstName} lastName={c.lastName} />
                  </Td>
                  <Td mac>
                    <Link to={`/clients/${c.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{c.reference}</Link>
                  </Td>
                  <Td mac className="font-medium">{c.firstName} {c.lastName}</Td>
                  <Td mac className="mac-table-muted">{c.email}</Td>
                  <Td mac>{c.phone1}</Td>
                  <Td mac className="text-[12px]">{c.identityNumber || '—'}</Td>
                  <Td mac className="mac-table-muted text-[12px]">
                    {c.agent ? `${c.agent.firstName} ${c.agent.lastName}` : '—'}
                  </Td>
                  <Td mac>
                    {(c._count?.sales || 0) + (c._count?.rentals || 0) > 0 ? (
                      <span className="mac-chip mac-chip-blue">
                        {(c._count?.sales || 0) > 0 && `${c._count!.sales} achat${c._count!.sales > 1 ? 's' : ''}`}
                        {(c._count?.sales || 0) > 0 && (c._count?.rentals || 0) > 0 && ' · '}
                        {(c._count?.rentals || 0) > 0 && `${c._count!.rentals} loc.`}
                      </span>
                    ) : (
                      <span className="mac-table-muted">—</span>
                    )}
                  </Td>
                  <Td mac>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                      {c.isProspect && <StatusPill status="brouillon" quiet />}
                      {c.isBuyer && <StatusPill status="actif" quiet />}
                      {c.isTenant && <StatusPill status="loué" quiet />}
                    </div>
                  </Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <MacActionBtn icon={Eye} tone="blue" title={t('actions.fiche360')} onClick={() => navigate(`/clients/${c.id}`)} />
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => navigate(`/clients/${c.id}`, { state: { edit: true } })} />
                      <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteId(c.id); setDeleteMotif(''); }} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => load(p)} mac />
      </Card>

      <Modal
        open={open}
        size="lg"
        title={t('actions.newClient')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="client-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="client-form" onSubmit={save}>
          <ClientFormFields form={form} setForm={setForm} agents={agents} identityTypes={identityTypes} sourceOptions={sourceOptions} />
          {error && <p className="mt-3 text-[11px] text-gic-coral">{error}</p>}
        </form>
      </Modal>

      <Modal
        open={!!deleteId}
        title={t('actions.deleteClient')}
        onClose={() => setDeleteId(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">
          {t('msg.clientDeleteHint')}
        </p>
        <textarea
          className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]"
          placeholder={t('msg.motifDeletePlaceholder')}
          value={deleteMotif}
          onChange={(e) => setDeleteMotif(e.target.value)}
        />
      </Modal>

      <Modal open={importOpen} title={t('actions.importClients')} onClose={() => setImportOpen(false)} footer={<Btn form="import-form" type="submit">{t('actions.import')}</Btn>}>
        <form id="import-form" onSubmit={doImport} className="space-y-3">
          <div className="flex gap-2">
            <Btn type="button" variant={importMode === 'csv' ? 'primary' : 'secondary'} onClick={() => setImportMode('csv')}>{t('common.csv')}</Btn>
            <Btn type="button" variant={importMode === 'xlsx' ? 'primary' : 'secondary'} onClick={() => setImportMode('xlsx')}>{t('common.excelXlsx')}</Btn>
          </div>
          {importMode === 'csv' ? (
            <>
              <p className="text-[11px] text-gic-muted">{t('msg.importFormatClient')}</p>
              <textarea className="w-full h-32 rounded-xl border border-gic-border p-3 text-[12px]" value={importCsv} onChange={(e) => setImportCsv(e.target.value)} placeholder="Karim;Benali;karim@email.ma;0612345678;AB123456" />
            </>
          ) : (
            <>
              <p className="text-[11px] text-gic-muted">{t('msg.importColumnsClient')}</p>
              <input type="file" accept=".xlsx,.xls" className="text-[12px]" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
            </>
          )}
          {importResult && <p className="text-[11px] text-gic-emerald">{importResult}</p>}
        </form>
      </Modal>
    </div>
  );
}
