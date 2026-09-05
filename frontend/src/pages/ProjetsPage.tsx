import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, Download, Upload, Eye, Building2, MapPin, Layers, Home, Printer,
  SlidersHorizontal, Check, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, downloadCsv, uploadForm, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { ProjectFormFields, emptyProjectForm, projectToForm, projectFormToBody, projectOwnershipLabel, type ProjectFormData } from '../components/ProjectFormFields';
import MacAvatar from '../components/MacAvatar';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';

type Project = {
  id: string;
  reference?: string;
  name: string;
  ownershipType?: string;
  clientId?: string;
  client?: { id: string; firstName: string; lastName: string; reference: string };
  city?: string;
  address?: string;
  photo?: string;
  status: string;
  description?: string;
  remark?: string;
  _count?: { properties: number; tranches: number; images?: number };
  location?: { name: string };
};

type SortOrder = 'asc' | 'desc';

function defaultOrderForSort(sort: string): SortOrder {
  return sort === 'createdAt' ? 'desc' : 'asc';
}

type Stats = { total: number; actifs: number; inactifs: number; personnel: number; clientProjects: number; biens: number; tranches: number };

const PAGE_SIZE = 20;

export default function ProjetsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Project[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, actifs: 0, inactifs: 0, personnel: 0, clientProjects: 0, biens: 0, tranches: 0 });
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'csv' | 'xlsx'>('csv');
  const [importCsv, setImportCsv] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<ProjectFormData>(emptyProjectForm());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildQuery(pageNum = page, overrides?: { status?: string; locationId?: string; ownershipType?: string }) {
    const qs = new URLSearchParams();
    const status = overrides?.status ?? statusFilter;
    const locationId = overrides?.locationId ?? locationFilter;
    const ownershipType = overrides?.ownershipType ?? ownershipFilter;
    if (q) qs.set('q', q);
    if (status) qs.set('status', status);
    if (locationId) qs.set('locationId', locationId);
    if (ownershipType) qs.set('ownershipType', ownershipType);
    qs.set('sort', sort);
    qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs;
  }

  function load(pageNum = page, overrides?: { status?: string; locationId?: string; ownershipType?: string }) {
    setLoading(true);
    setError('');
    const qs = buildQuery(pageNum, overrides);
    Promise.all([
      api<PaginatedResponse<Project>>(`/immobilier/projects?${qs}`),
      api<Stats>('/immobilier/projects/stats'),
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
    load(1);
    setPage(1);
  }, [sort, order]);

  function onSortChange(nextSort: string) {
    setSort(nextSort);
    setOrder(defaultOrderForSort(nextSort));
  }

  function toggleOrder() {
    setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
  }

  useEffect(() => {
    api('/immobilier/locations')
      .then((d) => setLocations(Array.isArray(d) ? d : []))
      .catch(() => setLocations([]));
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
    setForm(emptyProjectForm());
    setError('');
    setOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(p: Project) {
    api(`/immobilier/projects/${p.id}`).then((full) => {
      setEditId(p.id);
      setForm(projectToForm(full));
      setError('');
      setOpen(true);
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (form.ownershipType === 'client' && !form.clientId) {
      setError(t('msg.selectClientForProject'));
      return;
    }
    try {
      const body = projectFormToBody(form);
      if (editId) {
        await api(`/immobilier/projects/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/immobilier/projects', { method: 'POST', body: JSON.stringify(body) });
      }
      setOpen(false);
      load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function doImport(e: React.FormEvent) {
    e.preventDefault();
    setImportResult(null);
    try {
      let res: { created: number; skipped: number; errors?: string[] };
      if (importMode === 'xlsx') {
        if (!importFile) return;
        const fd = new FormData();
        fd.append('file', importFile);
        res = await uploadForm('/immobilier/projects/import/xlsx', fd);
      } else {
        res = await api('/immobilier/projects/import/csv', { method: 'POST', body: JSON.stringify({ csv: importCsv }) });
      }
      setImportResult(`${res.created} projet(s) créé(s), ${res.skipped} ignoré(s)${res.errors?.length ? ` — ${res.errors.length} erreur(s)` : ''}`);
      load(page);
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : t('msg.importError'));
    }
  }

  async function confirmDelete() {
    if (!deleteId || !deleteMotif.trim()) return;
    try {
      await api(`/immobilier/projects/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
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
    w.document.write(`<html><head><title>${t('pages.projects')} — GIC</title></head><body>
      <h1>${t('pages.projects')} — GIC</h1>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.project')}</th><th>${t('columns.type')}</th><th>${t('columns.client')}</th><th>${t('columns.city')}</th><th>${t('columns.localization')}</th><th>${t('columns.remark')}</th><th>${t('columns.tranches')}</th><th>${t('columns.properties')}</th><th>${t('columns.status')}</th></tr>
        ${items.map((p) => `<tr>
          <td>${p.name}</td>
          <td>${projectOwnershipLabel(p.ownershipType, t)}</td>
          <td>${p.client ? `${p.client.firstName} ${p.client.lastName}` : '—'}</td>
          <td>${p.city || '—'}</td>
          <td>${p.location?.name || '—'}</td>
          <td>${p.remark || '—'}</td>
          <td>${p._count?.tranches ?? 0}</td>
          <td>${p._count?.properties ?? 0}</td>
          <td>${p.status}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const statusFilters = [
    { id: '', label: t('common.all') },
    { id: 'actif', label: t('kpi.active') },
    { id: 'en_cours', label: t('fields.statusInProgress') },
    { id: 'termine', label: t('common.finishedPlural') },
    { id: 'inactif', label: t('common.inactivePlural') },
  ];

  const ownershipFilters = [
    { id: '', label: t('common.all') },
    { id: 'personnel', label: t('fields.ownershipPersonal') },
    { id: 'client', label: t('fields.forClientOption') },
  ];

  const hasActiveFilters = !!statusFilter || !!locationFilter || !!ownershipFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.projects')}
        subtitle={t('pages.projectsSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Upload} onClick={() => { setImportOpen(true); setImportResult(null); }}>{t('actions.import')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/immobilier/projects/export/csv?${buildQuery(1)}`, 'projets-gic.csv')}>{t('common.export')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newProject')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('pages.projects')} value={stats.total} icon={Building2} tone="violet" delta={t('msg.persClientsDelta', { pers: stats.personnel, clients: stats.clientProjects })} deltaTone="muted" />
        <KpiCard title={t('kpi.active')} value={stats.actifs} icon={MapPin} tone="emerald" delta={t('msg.inactiveCount', { count: stats.inactifs })} deltaTone="muted" />
        <KpiCard title={t('columns.tranches')} value={stats.tranches} icon={Layers} tone="amber" />
        <KpiCard title={t('columns.properties')} value={stats.biens} icon={Home} tone="coral" />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchRefNameCityAddress')}
            />
            <div className="flex items-center gap-1 shrink-0">
              <MacSelect
                value={sort}
                onChange={onSortChange}
                options={[
                  { value: 'createdAt', label: t('msg.dateCreated') },
                  { value: 'reference', label: t('fields.reference') },
                  { value: 'name', label: t('common.name') },
                  { value: 'city', label: t('fields.city') },
                ]}
                className="w-36"
              />
              <MacActionBtn
                icon={order === 'asc' ? ArrowUp : ArrowDown}
                tone="gray"
                title={order === 'asc' ? t('msg.ascendingLong') : t('msg.descendingLong')}
                onClick={toggleOrder}
              />
            </div>
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
                      key={f.id || 'all-status'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${statusFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setStatusFilter(f.id);
                        setPage(1);
                        load(1, { status: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {statusFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  <div className="mac-filter-menu-sep" />
                  <p className="mac-filter-menu-section">{t('fields.localization')}</p>
                  <button
                    type="button"
                    role="menuitem"
                    className={`mac-filter-menu-item${locationFilter === '' ? ' mac-filter-menu-item-active' : ''}`}
                    onClick={() => {
                      setLocationFilter('');
                      setPage(1);
                      load(1, { locationId: '' });
                    }}
                  >
                    <span>Toutes</span>
                    {locationFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                  </button>
                  {locations.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${locationFilter === l.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setLocationFilter(l.id);
                        setPage(1);
                        load(1, { locationId: l.id });
                      }}
                    >
                      <span>{l.name}</span>
                      {locationFilter === l.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  <div className="mac-filter-menu-sep" />
                  <p className="mac-filter-menu-section">{t('common.type')}</p>
                  {ownershipFilters.map((f) => (
                    <button
                      key={f.id || 'all-ownership'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${ownershipFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setOwnershipFilter(f.id);
                        setPage(1);
                        load(1, { ownershipType: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {ownershipFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setStatusFilter('');
                          setLocationFilter('');
                          setOwnershipFilter('');
                          setPage(1);
                          load(1, { status: '', locationId: '', ownershipType: '' });
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
          <EmptyState title={t('msg.emptyProjects')} action={<Btn icon={Plus} onClick={openCreate}>{t('actions.newProject')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac className="w-12" aria-label={t('fields.photo')} />
                <Th mac>{t('columns.ref')}</Th>
                <Th mac>{t('columns.project')}</Th>
                <Th mac>{t('columns.type')}</Th>
                <Th mac>{t('columns.city')}</Th>
                <Th mac>{t('columns.localization')}</Th>
                <Th mac>{t('columns.remark')}</Th>
                <Th mac>{t('columns.tranches')}</Th>
                <Th mac>{t('columns.properties')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/projets/${p.id}`)}>
                  <Td mac className="w-12">
                    <div onClick={(e) => e.stopPropagation()}>
                    <MacAvatar photo={p.photo} name={p.name} fallback={<Building2 size={14} />} />
                    </div>
                  </Td>
                  <Td mac className="font-medium text-gic-violet">{p.reference || '—'}</Td>
                  <Td mac>
                    <span className="mac-table-ref font-medium">{p.name}</span>
                    {p.client && (
                      <span className="block text-[10px] mac-table-muted">{p.client.firstName} {p.client.lastName}</span>
                    )}
                    {p.address && (
                      <span className="block text-[10px] mac-table-muted truncate max-w-[200px]">{p.address}</span>
                    )}
                  </Td>
                  <Td mac>
                    <span className={`mac-chip ${p.ownershipType === 'client' ? 'mac-chip-orange' : 'mac-chip-blue'}`}>
                      {projectOwnershipLabel(p.ownershipType, t)}
                    </span>
                  </Td>
                  <Td mac>{p.city || '—'}</Td>
                  <Td mac className="mac-table-muted">{p.location?.name || '—'}</Td>
                  <Td mac className="max-w-[160px]">
                    <span className="block text-[11px] mac-table-muted truncate" title={p.remark || undefined}>
                      {p.remark || '—'}
                    </span>
                  </Td>
                  <Td mac>
                    <span className="mac-chip mac-chip-blue">{p._count?.tranches ?? 0}</span>
                  </Td>
                  <Td mac>
                    <span className="mac-chip">{p._count?.properties ?? 0}</span>
                  </Td>
                  <Td mac>
                    <StatusPill status={p.status} quiet />
                  </Td>
                  <Td mac className="mac-td-actions">
                    <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/projets/${p.id}`} className="mac-action-btn mac-action-btn-blue" title={t('actions.fiche360')}>
                        <Eye size={14} strokeWidth={2.15} />
                      </Link>
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(p)} />
                      <MacActionBtn
                        icon={Trash2}
                        tone="red"
                        title={t('common.delete')}
                        onClick={() => { setDeleteId(p.id); setDeleteMotif(''); }}
                      />
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
        title={editId ? t('actions.editProject') : t('actions.newProject')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="proj-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="proj-form" onSubmit={save}>
          <ProjectFormFields form={form} setForm={setForm} locations={locations} />
          {error && <p className="mt-3 text-[11px] text-gic-coral">{error}</p>}
        </form>
      </Modal>

      <Modal open={importOpen} title={t('actions.importProjects')} onClose={() => setImportOpen(false)} footer={<Btn form="proj-import-form" type="submit">{t('actions.import')}</Btn>}>
        <form id="proj-import-form" onSubmit={doImport} className="space-y-3">
          <div className="flex gap-2">
            <Btn type="button" variant={importMode === 'csv' ? 'primary' : 'secondary'} onClick={() => setImportMode('csv')}>{t('common.csv')}</Btn>
            <Btn type="button" variant={importMode === 'xlsx' ? 'primary' : 'secondary'} onClick={() => setImportMode('xlsx')}>{t('common.excelXlsx')}</Btn>
          </div>
          {importMode === 'csv' ? (
            <>
              <p className="text-[11px] text-gic-muted">{t('msg.importFormatProject')}</p>
              <textarea className="w-full h-32 rounded-xl border border-gic-border p-3 text-[12px]" value={importCsv} onChange={(e) => setImportCsv(e.target.value)} placeholder="Résidence Atlas;personnel;Marrakech;Av. Mohammed VI…" />
            </>
          ) : (
            <input type="file" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="text-[12px]" />
          )}
          {importResult && <p className="text-[11px] text-gic-emerald">{importResult}</p>}
        </form>
      </Modal>

      <Modal
        open={!!deleteId}
        title={t('actions.deleteProject')}
        onClose={() => setDeleteId(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">
          Cette action est irréversible. Un projet lié à des biens ne peut pas être supprimé (RG-PRJ-001).
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
