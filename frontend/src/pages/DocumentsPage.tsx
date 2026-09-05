import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Upload, Download, Printer, Eye, Trash2, Pencil, FileText, FolderOpen,
  AlertTriangle, Inbox, Send, SlidersHorizontal, Check, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, uploadDocument, uploadForm, formatDate, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, Tabs, TableWrap, Td, Th,
} from '../components/ui';
import {
  entityLink, expiryClass, formatSize, fileUrl, type DocEntity,
} from '../lib/documentDisplay';
import { useI18n } from '../i18n/I18nContext';

type Doc = DocEntity;

type Archive = {
  id: string;
  registerNo?: string | null;
  date: string;
  subject: string;
  sender?: string | null;
  recipient?: string | null;
  category?: string | null;
  direction?: string | null;
  remark?: string | null;
  filePath?: string | null;
};

type Stats = {
  total: number;
  expiring: number;
  expired: number;
  totalSize: number;
  categories: string[];
  archivesTotal: number;
  archivesEntrant: number;
  archivesSortant: number;
};

const PAGE_SIZE = 20;
const DOC_CATEGORIES = ['general', 'contrat', 'facture', 'devis', 'photo', 'archive', 'juridique', 'technique'];
type SortOrder = 'asc' | 'desc';
type TabId = 'documents' | 'bureau';

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function defaultOrderForSort(sort: string): SortOrder {
  return sort === 'createdAt' || sort === 'date' ? 'desc' : 'asc';
}

type DocOverrides = Partial<{ q: string; category: string; alert: string; sort: string; order: SortOrder }>;
type ArchiveOverrides = Partial<{ q: string; direction: string; dateFrom: string; dateTo: string; sort: string; order: SortOrder }>;

export default function DocumentsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab: TabId = searchParams.get('tab') === 'bureau' ? 'bureau' : 'documents';
  const [tab, setTab] = useState<TabId>(initialTab);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [archives, setArchives] = useState<Archive[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({
    total: 0, expiring: 0, expired: 0, totalSize: 0, categories: [],
    archivesTotal: 0, archivesEntrant: 0, archivesSortant: 0,
  });
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '');
  const [alertFilter, setAlertFilter] = useState(searchParams.get('alert') || '');
  const [directionFilter, setDirectionFilter] = useState(searchParams.get('direction') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || monthStartISO());
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || new Date().toISOString().slice(0, 10));
  const defaultSort = initialTab === 'bureau' ? 'date' : (searchParams.get('sort') || 'createdAt');
  const [sort, setSort] = useState(defaultSort);
  const [order, setOrder] = useState<SortOrder>(
    (searchParams.get('order') as SortOrder) || defaultOrderForSort(defaultSort),
  );
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMeta, setUploadMeta] = useState({ name: '', category: 'general', expiresAt: '' });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveForm, setArchiveForm] = useState({
    registerNo: '', subject: '', sender: '', recipient: '', category: '', direction: 'entrant',
    date: new Date().toISOString().slice(0, 10), remark: '',
  });
  const [archiveFile, setArchiveFile] = useState<File | null>(null);

  function buildStatsQuery(overrides?: DocOverrides & ArchiveOverrides) {
    const qs = new URLSearchParams();
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const category = overrides?.category !== undefined ? overrides.category : categoryFilter;
    const alert = overrides?.alert !== undefined ? overrides.alert : alertFilter;
    const direction = overrides?.direction !== undefined ? overrides.direction : directionFilter;
    const from = overrides?.dateFrom !== undefined ? overrides.dateFrom : dateFrom;
    const to = overrides?.dateTo !== undefined ? overrides.dateTo : dateTo;
    if (qVal) qs.set('q', qVal);
    if (category) qs.set('category', category);
    if (alert) qs.set('alert', alert);
    if (direction) qs.set('direction', direction);
    if (from) qs.set('dateFrom', from);
    if (to) qs.set('dateTo', to);
    return qs.toString();
  }

  function buildDocQuery(pageNum = page, overrides?: DocOverrides) {
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const category = overrides?.category !== undefined ? overrides.category : categoryFilter;
    const alert = overrides?.alert !== undefined ? overrides.alert : alertFilter;
    const sortVal = overrides?.sort !== undefined ? overrides.sort : sort;
    const orderVal = overrides?.order !== undefined ? overrides.order : order;
    const qs = new URLSearchParams();
    if (qVal) qs.set('q', qVal);
    if (category) qs.set('category', category);
    if (alert) qs.set('alert', alert);
    qs.set('sort', sortVal);
    qs.set('order', orderVal);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function buildArchiveQuery(pageNum = page, overrides?: ArchiveOverrides) {
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const direction = overrides?.direction !== undefined ? overrides.direction : directionFilter;
    const from = overrides?.dateFrom !== undefined ? overrides.dateFrom : dateFrom;
    const to = overrides?.dateTo !== undefined ? overrides.dateTo : dateTo;
    const sortVal = overrides?.sort !== undefined ? overrides.sort : sort;
    const orderVal = overrides?.order !== undefined ? overrides.order : order;
    const qs = new URLSearchParams();
    if (qVal) qs.set('q', qVal);
    if (direction) qs.set('direction', direction);
    if (from) qs.set('dateFrom', from);
    if (to) qs.set('dateTo', to);
    qs.set('sort', sortVal);
    qs.set('order', orderVal);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function syncUrl(pageNum = page) {
    const qs = new URLSearchParams();
    if (tab === 'bureau') qs.set('tab', 'bureau');
    if (q) qs.set('q', q);
    if (tab === 'documents') {
      if (categoryFilter) qs.set('category', categoryFilter);
      if (alertFilter) qs.set('alert', alertFilter);
      const docDefaultSort = 'createdAt';
      if (sort !== docDefaultSort) qs.set('sort', sort);
      if (order !== defaultOrderForSort(sort)) qs.set('order', order);
    } else {
      if (directionFilter) qs.set('direction', directionFilter);
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
      const archiveDefaultSort = 'date';
      if (sort !== archiveDefaultSort) qs.set('sort', sort);
      if (order !== defaultOrderForSort(sort)) qs.set('order', order);
    }
    if (pageNum > 1) qs.set('page', String(pageNum));
    setSearchParams(qs, { replace: true });
  }

  function loadStats(overrides?: DocOverrides & ArchiveOverrides) {
    api<Stats>(`/documents/stats?${buildStatsQuery(overrides)}`).then(setStats).catch(() => {});
  }

  function loadDocs(pageNum = page, overrides?: DocOverrides) {
    setLoading(true);
    setError('');
    api<PaginatedResponse<Doc>>(`/documents?${buildDocQuery(pageNum, overrides)}`)
      .then((res) => {
        setDocs(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        syncUrl(res.page);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }

  function loadArchives(pageNum = page, overrides?: ArchiveOverrides) {
    setLoading(true);
    setError('');
    api<PaginatedResponse<Archive>>(`/documents/archives?${buildArchiveQuery(pageNum, overrides)}`)
      .then((res) => {
        setArchives(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        syncUrl(res.page);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }

  function load(
    pageNum = page,
    overrides?: DocOverrides & ArchiveOverrides,
  ) {
    loadStats(overrides);
    if (tab === 'documents') loadDocs(pageNum, overrides);
    else loadArchives(pageNum, overrides);
  }

  useEffect(() => {
    load(page);
  }, []);

  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    if (tab === 'bureau') openArchiveCreate();
    else setUploadOpen(true);
    const qs = new URLSearchParams(searchParams);
    qs.delete('create');
    setSearchParams(qs, { replace: true });
  }, [searchParams]);

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

  async function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile) return;
    try {
      await uploadDocument(uploadFile, {
        name: uploadMeta.name || uploadFile.name,
        category: uploadMeta.category,
        ...(uploadMeta.expiresAt ? { expiresAt: uploadMeta.expiresAt } : {}),
      });
      setUploadOpen(false);
      setUploadFile(null);
      setUploadMeta({ name: '', category: 'general', expiresAt: '' });
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.uploadError'));
    }
  }

  function openArchiveCreate() {
    setArchiveForm({
      registerNo: '', subject: '', sender: '', recipient: '', category: '', direction: 'entrant',
      date: new Date().toISOString().slice(0, 10), remark: '',
    });
    setArchiveFile(null);
    setArchiveOpen(true);
  }

  async function saveArchive(e: React.FormEvent) {
    e.preventDefault();
    try {
      const fd = new FormData();
      Object.entries(archiveForm).forEach(([k, v]) => {
        if (v) fd.append(k, v);
      });
      if (archiveFile) fd.append('file', archiveFile);
      await uploadForm('/documents/archives', fd, 'POST');
      setArchiveOpen(false);
      setArchiveFile(null);
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function deleteDoc(id: string) {
    if (!await appConfirm(t('msg.confirmDeleteDocument'))) return;
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function deleteArchive(id: string) {
    if (!await appConfirm(t('msg.confirmDeleteArchive'))) return;
    try {
      await api(`/documents/archives/${id}`, { method: 'DELETE' });
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function exportCsv() {
    if (tab === 'documents') {
      downloadCsv(`/documents/export/csv?${buildDocQuery()}`, 'documents-gic.csv');
    } else {
      downloadCsv(`/documents/archives/export/csv?${buildArchiveQuery()}`, 'bureau-ordre-gic.csv');
    }
  }

  function exportExcel() {
    if (tab === 'documents') {
      downloadExcel(`/documents/export/xlsx?${buildDocQuery()}`, 'documents-gic.xlsx');
    } else {
      downloadExcel(`/documents/archives/export/xlsx?${buildArchiveQuery()}`, 'bureau-ordre-gic.xlsx');
    }
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    if (tab === 'documents') {
      w.document.write(`<html><body style="font-family:sans-serif;padding:24px;font-size:11px">
        <h1>Documents GIC</h1><table border="1" cellpadding="5" style="border-collapse:collapse;width:100%">
        <tr><th>Nom</th><th>Catégorie</th><th>Taille</th><th>Échéance</th><th>Date</th></tr>
        ${docs.map((d) => `<tr><td>${d.name}</td><td>${d.category || '—'}</td><td>${formatSize(d.size)}</td><td>${formatDate(d.expiresAt)}</td><td>${formatDate(d.createdAt)}</td></tr>`).join('')}
        </table></body></html>`);
    } else {
      w.document.write(`<html><body style="font-family:sans-serif;padding:24px;font-size:11px">
        <h1>Bureau d'ordre GIC</h1><table border="1" cellpadding="5" style="border-collapse:collapse;width:100%">
        <tr><th>N°</th><th>Date</th><th>Objet</th><th>Direction</th></tr>
        ${archives.map((a) => `<tr><td>${a.registerNo || '—'}</td><td>${formatDate(a.date)}</td><td>${a.subject}</td><td>${a.direction}</td></tr>`).join('')}
        </table></body></html>`);
    }
    w.document.close();
    w.print();
  }

  function switchTab(id: TabId) {
    setTab(id);
    setShowFilters(false);
    const nextSort = id === 'bureau' ? 'date' : 'createdAt';
    const nextOrder = defaultOrderForSort(nextSort);
    setSort(nextSort);
    setOrder(nextOrder);
    setPage(1);
    loadStats();
    if (id === 'documents') loadDocs(1, { sort: nextSort, order: nextOrder });
    else loadArchives(1, { sort: nextSort, order: nextOrder });
  }

  const categories = [...new Set([...DOC_CATEGORIES, ...stats.categories])];
  const hasActiveFilters = tab === 'documents'
    ? !!q || !!alertFilter || !!categoryFilter
    : !!q || !!directionFilter;

  function directionLabel(direction?: string | null) {
    if (direction === 'sortant') return t('fields.outgoing');
    if (direction === 'entrant') return t('fields.incoming');
    return direction || '—';
  }

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.documents')}
        subtitle={t('pages.documentsSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={exportExcel}>{t('common.excel')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            {tab === 'documents' ? (
              <Btn icon={Upload} onClick={() => setUploadOpen(true)}>{t('actions.upload')}</Btn>
            ) : (
              <Btn icon={Plus} onClick={openArchiveCreate}>{t('actions.newBureauEntry')}</Btn>
            )}
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('pages.documents')} value={stats.total} icon={FileText} tone="violet" delta={formatSize(stats.totalSize)} deltaTone="muted" />
        <KpiCard title={t('kpi.expiring30d')} value={stats.expiring} icon={AlertTriangle} tone="amber" delta={t('kpi.expiredCount', { count: stats.expired })} deltaTone="muted" />
        <KpiCard title={t('kpi.bureauOrdre')} value={stats.archivesTotal} icon={FolderOpen} tone="emerald" delta={t('kpi.incomingCount', { count: stats.archivesEntrant })} deltaTone="muted" />
        <KpiCard title={t('kpi.outgoingMail')} value={stats.archivesSortant} icon={Send} tone="coral" />
      </div>

      <Card className="mb-4">
        <Tabs
          mac
          active={tab}
          onChange={(id) => switchTab(id as TabId)}
          tabs={[
            { id: 'documents', label: t('msg.tabsDocuments', { count: stats.total }) },
            { id: 'bureau', label: t('msg.tabsBureau', { count: stats.archivesTotal }) },
          ]}
        />
      </Card>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={tab === 'documents' ? t('msg.searchDocument') : t('msg.searchMail')}
            />
            {tab === 'documents' && (
              <MacSelect
                value={sort}
                onChange={(v) => {
                  const nextOrder = defaultOrderForSort(v);
                  setSort(v);
                  setOrder(nextOrder);
                  setPage(1);
                  load(1, { sort: v, order: nextOrder });
                }}
                options={[
                  { value: 'createdAt', label: t('fields.dateAdded') },
                  { value: 'name', label: t('columns.name') },
                  { value: 'category', label: t('columns.category') },
                  { value: 'size', label: t('columns.size') },
                  { value: 'expiresAt', label: t('columns.deadline') },
                ]}
                className="w-36 shrink-0"
              />
            )}
            {tab === 'bureau' && (
              <>
                <MacSelect
                  value={sort}
                  onChange={(v) => {
                    const nextOrder = defaultOrderForSort(v);
                    setSort(v);
                    setOrder(nextOrder);
                    setPage(1);
                    load(1, { sort: v, order: nextOrder });
                  }}
                  options={[
                    { value: 'date', label: t('fields.date') },
                    { value: 'subject', label: t('columns.subject') },
                    { value: 'registerNo', label: t('columns.registerNo') },
                  ]}
                  className="w-36 shrink-0"
                />
                <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0" />
                <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0" />
              </>
            )}
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
                  {tab === 'documents' ? (
                    <>
                      <p className="mac-filter-menu-section">{t('dashboard.alerts')}</p>
                      {[
                        { id: '', label: t('common.all') },
                        { id: 'expiring', label: t('filters.expiring30d') },
                        { id: 'expired', label: t('status.expiredPlural') },
                      ].map((f) => (
                        <button
                          key={f.id || 'all-alert'}
                          type="button"
                          role="menuitem"
                          className={`mac-filter-menu-item${alertFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                          onClick={() => {
                            setAlertFilter(f.id);
                            setPage(1);
                            load(1, { alert: f.id });
                          }}
                        >
                          <span>{f.label}</span>
                          {alertFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                        </button>
                      ))}
                      <div className="mac-filter-menu-sep" />
                      <p className="mac-filter-menu-section">{t('fields.category')}</p>
                      <button
                        type="button"
                        role="menuitem"
                        className={`mac-filter-menu-item${!categoryFilter ? ' mac-filter-menu-item-active' : ''}`}
                        onClick={() => {
                          setCategoryFilter('');
                          setPage(1);
                          load(1, { category: '' });
                        }}
                      >
                        <span>{t('common.allFeminine')}</span>
                        {!categoryFilter && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                      </button>
                      {categories.map((c) => (
                        <button
                          key={c}
                          type="button"
                          role="menuitem"
                          className={`mac-filter-menu-item capitalize${categoryFilter === c ? ' mac-filter-menu-item-active' : ''}`}
                          onClick={() => {
                            const next = categoryFilter === c ? '' : c;
                            setCategoryFilter(next);
                            setPage(1);
                            load(1, { category: next });
                          }}
                        >
                          <span>{c}</span>
                          {categoryFilter === c && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      <p className="mac-filter-menu-section">{t('fields.direction')}</p>
                      {[
                        { id: '', label: t('common.all') },
                        { id: 'entrant', label: t('fields.incomingPlural') },
                        { id: 'sortant', label: t('fields.outgoingPlural') },
                      ].map((f) => (
                        <button
                          key={f.id || 'all-dir'}
                          type="button"
                          role="menuitem"
                          className={`mac-filter-menu-item${directionFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                          onClick={() => {
                            setDirectionFilter(f.id);
                            setPage(1);
                            load(1, { direction: f.id });
                          }}
                        >
                          <span>{f.label}</span>
                          {directionFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
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
                          if (tab === 'documents') {
                            setAlertFilter('');
                            setCategoryFilter('');
                            setQ('');
                            setPage(1);
                            load(1, { q: '', alert: '', category: '' });
                          } else {
                            setDirectionFilter('');
                            setQ('');
                            setPage(1);
                            load(1, { q: '', direction: '' });
                          }
                          setShowFilters(false);
                        }}
                      >
                        {t('common.reset')}
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
        ) : tab === 'documents' ? (
          docs.length === 0 ? (
            <EmptyState title={t('msg.emptyDocuments')} action={<Btn icon={Upload} onClick={() => setUploadOpen(true)}>{t('actions.upload')}</Btn>} />
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.name')}</Th>
                  <Th mac>{t('columns.category')}</Th>
                  <Th mac>{t('columns.size')}</Th>
                  <Th mac>{t('columns.linkedTo')}</Th>
                  <Th mac>{t('columns.deadline')}</Th>
                  <Th mac>{t('columns.date')}</Th>
                  <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const link = entityLink(d);
                  return (
                    <tr
                      key={d.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/documents/${d.id}`)}
                    >
                      <Td mac className="font-medium max-w-[200px] truncate">{d.name}</Td>
                      <Td mac>
                        {d.category ? <span className="mac-chip capitalize">{d.category}</span> : '—'}
                      </Td>
                      <Td mac className="mac-table-muted">{formatSize(d.size)}</Td>
                      <Td mac className="text-[12px]">
                        {link ? (
                          <Link to={link.to} className="mac-table-ref truncate block max-w-[160px]" onClick={(e) => e.stopPropagation()}>{link.label}</Link>
                        ) : d.entityType ? (
                          <span className="mac-table-muted">{d.entityType}</span>
                        ) : '—'}
                      </Td>
                      <Td mac className={expiryClass(d.expiresAt)}>{formatDate(d.expiresAt)}</Td>
                      <Td mac className="mac-table-muted">{formatDate(d.createdAt)}</Td>
                      <Td mac className="mac-td-actions">
                        <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                          <MacActionBtn icon={Eye} tone="blue" title={t('actions.viewSheet')} onClick={() => navigate(`/documents/${d.id}`)} />
                          <a href={fileUrl(d.path)} target="_blank" rel="noreferrer" className="mac-action-btn mac-action-btn-gray" title={t('actions.open')}>
                            <FileText size={14} strokeWidth={2.15} />
                          </a>
                          <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteDoc(d.id)} />
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )
        ) : archives.length === 0 ? (
          <EmptyState title={t('msg.emptyBureau')} action={<Btn icon={Plus} onClick={openArchiveCreate}>{t('common.add')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.registerNo')}</Th>
                <Th mac>{t('columns.date')}</Th>
                <Th mac>{t('columns.subject')}</Th>
                <Th mac>{t('columns.sender')}</Th>
                <Th mac>{t('columns.recipient')}</Th>
                <Th mac>{t('columns.direction')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {archives.map((a) => (
                <tr
                  key={a.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/documents/bureau/${a.id}`)}
                >
                  <Td mac className="font-medium">{a.registerNo || '—'}</Td>
                  <Td mac className="mac-table-muted">{formatDate(a.date)}</Td>
                  <Td mac>{a.subject}</Td>
                  <Td mac className="mac-table-muted">{a.sender || '—'}</Td>
                  <Td mac className="mac-table-muted">{a.recipient || '—'}</Td>
                  <Td mac>
                    <span className={`mac-chip inline-flex items-center gap-1 capitalize ${a.direction === 'sortant' ? 'mac-chip-orange' : 'mac-chip-green'}`}>
                      {a.direction === 'sortant' ? <Send size={10} /> : <Inbox size={10} />}
                      {directionLabel(a.direction)}
                    </span>
                  </Td>
                  <Td mac className="mac-td-actions">
                    <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                      <MacActionBtn icon={Eye} tone="blue" title={t('actions.viewSheet')} onClick={() => navigate(`/documents/bureau/${a.id}`)} />
                      <MacActionBtn
                        icon={Pencil}
                        tone="orange"
                        title={t('common.edit')}
                        onClick={() => navigate(`/documents/bureau/${a.id}`, { state: { edit: true } })}
                      />
                      <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteArchive(a.id)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => load(p)} mac />
      </Card>

      <Modal open={uploadOpen} title={t('actions.uploadDocument')} onClose={() => setUploadOpen(false)}
        footer={<Btn form="upload-form" type="submit" disabled={!uploadFile}>{t('actions.send')}</Btn>}
      >
        <form id="upload-form" onSubmit={submitUpload} className="grid gap-3">
          <label className="block">
            <span className="text-[11px] font-medium text-gic-muted">{t('fields.fileRequired')}</span>
            <input
              type="file"
              required
              accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.doc,.xls"
              className="mt-1 block w-full text-[12px]"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setUploadFile(f);
                if (f && !uploadMeta.name) setUploadMeta({ ...uploadMeta, name: f.name });
              }}
            />
          </label>
          <Input label={t('fields.displayName')} value={uploadMeta.name} onChange={(e) => setUploadMeta({ ...uploadMeta, name: e.target.value })} />
          <Select label={t('fields.category')} value={uploadMeta.category} onChange={(e) => setUploadMeta({ ...uploadMeta, category: e.target.value })}>
            {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input label={t('fields.deadlineOptional')} type="date" value={uploadMeta.expiresAt} onChange={(e) => setUploadMeta({ ...uploadMeta, expiresAt: e.target.value })} />
        </form>
      </Modal>

      <Modal open={archiveOpen} title={t('actions.newBureauOrderEntry')} onClose={() => setArchiveOpen(false)}
        footer={<Btn form="archive-form" type="submit">{t('common.add')}</Btn>}
      >
        <form id="archive-form" onSubmit={saveArchive} className="grid gap-3 sm:grid-cols-2">
          <Input label={t('fields.registerNo')} value={archiveForm.registerNo} onChange={(e) => setArchiveForm({ ...archiveForm, registerNo: e.target.value })} />
          <Input label={t('fields.date')} type="date" value={archiveForm.date} onChange={(e) => setArchiveForm({ ...archiveForm, date: e.target.value })} />
          <Select label={t('fields.direction')} value={archiveForm.direction} onChange={(e) => setArchiveForm({ ...archiveForm, direction: e.target.value })}>
            <option value="entrant">{t('fields.incoming')}</option>
            <option value="sortant">{t('fields.outgoing')}</option>
          </Select>
          <Input label={t('fields.category')} value={archiveForm.category} onChange={(e) => setArchiveForm({ ...archiveForm, category: e.target.value })} />
          <Input className="sm:col-span-2" label={t('fields.subjectRequired')} required value={archiveForm.subject} onChange={(e) => setArchiveForm({ ...archiveForm, subject: e.target.value })} />
          <Input label={t('fields.sender')} value={archiveForm.sender} onChange={(e) => setArchiveForm({ ...archiveForm, sender: e.target.value })} />
          <Input label={t('fields.recipient')} value={archiveForm.recipient} onChange={(e) => setArchiveForm({ ...archiveForm, recipient: e.target.value })} />
          <Input className="sm:col-span-2" label={t('fields.remark')} value={archiveForm.remark} onChange={(e) => setArchiveForm({ ...archiveForm, remark: e.target.value })} />
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-medium text-gic-muted">{t('fields.scanFile')}</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
              className="mt-1 block w-full text-[12px] file:mr-3 file:rounded-lg file:border-0 file:bg-gic-violet/10 file:px-3 file:py-1.5 file:text-[11px] file:font-medium file:text-gic-violet"
              onChange={(e) => setArchiveFile(e.target.files?.[0] || null)}
            />
          </label>
        </form>
      </Modal>
    </div>
  );
}
