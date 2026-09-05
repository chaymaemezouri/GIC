import { appAlert } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Download, Printer, Wrench, Truck, Wallet, Eye, SlidersHorizontal, Check, Plus,
  ClipboardList, ArrowUp, ArrowDown, Pencil, Trash2,
} from 'lucide-react';
import {
  api, downloadCsv, downloadExcel, fetchEnginList, formatDate, formatMad, type PaginatedResponse,
} from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';

type Maintenance = {
  id: string;
  date: string;
  designation: string;
  budget?: number;
  responsible?: string;
  supervisor?: string;
  engin: { id: string; brand?: string; matricule?: string; status: string };
};

type ListResponse = PaginatedResponse<Maintenance> & { budgetTotal: number };
type Stats = { total: number; budgetTotal: number; enginsEnMaintenance: number };

const PAGE_SIZE = 20;
type SortOrder = 'asc' | 'desc';

function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

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

export default function MaintenancePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<Maintenance[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [budgetTotal, setBudgetTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, budgetTotal: 0, enginsEnMaintenance: 0 });
  const [engins, setEngins] = useState<{ id: string; matricule?: string; brand?: string }[]>([]);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [enginFilter, setEnginFilter] = useState(searchParams.get('enginId') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || monthStartISO());
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || new Date().toISOString().slice(0, 10));
  const [sort, setSort] = useState(searchParams.get('sort') || 'date');
  const [order, setOrder] = useState<SortOrder>(searchParams.get('order') === 'asc' ? 'asc' : 'desc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [maintForm, setMaintForm] = useState({
    enginId: searchParams.get('enginId') || '',
    designation: '',
    budget: '',
    responsible: '',
    supervisor: '',
    counterValue: '',
    remark: '',
    date: new Date().toISOString().slice(0, 10),
  });

  function buildQuery(pageNum = page, overrides?: { enginId?: string; q?: string }) {
    const qs = new URLSearchParams();
    const enginId = overrides?.enginId !== undefined ? overrides.enginId : enginFilter;
    const query = overrides?.q !== undefined ? overrides.q : q;
    if (query) qs.set('q', query);
    if (enginId) qs.set('enginId', enginId);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    if (sort !== 'date') qs.set('sort', sort);
    if (order !== 'desc') qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function buildStatsQuery(overrides?: { enginId?: string; q?: string }) {
    const qs = new URLSearchParams();
    const enginId = overrides?.enginId !== undefined ? overrides.enginId : enginFilter;
    const query = overrides?.q !== undefined ? overrides.q : q;
    if (query) qs.set('q', query);
    if (enginId) qs.set('enginId', enginId);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    return qs.toString();
  }

  function load(pageNum = page, overrides?: { enginId?: string; q?: string }) {
    setLoading(true);
    setError('');
    const listQs = buildQuery(pageNum, overrides);
    const statsQs = buildStatsQuery(overrides);
    Promise.all([
      api<ListResponse>(`/engins/maintenances?${listQs}`),
      api<Stats>(`/engins/maintenances/stats?${statsQs}`),
    ])
      .then(([res, st]) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        setBudgetTotal(res.budgetTotal);
        setStats(st);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('msg.serverError')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchEnginList<{ id: string; matricule?: string; brand?: string }>().then(setEngins);
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (enginFilter) qs.set('enginId', enginFilter);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    if (sort !== 'date') qs.set('sort', sort);
    if (order !== 'desc') qs.set('order', order);
    if (page > 1) qs.set('page', String(page));
    setSearchParams(qs, { replace: true });
  }, [q, enginFilter, dateFrom, dateTo, sort, order, page, setSearchParams]);

  useEffect(() => {
    setPage(1);
    load(1);
  }, [sort, order]);

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
    setMaintForm({
      enginId: enginFilter || '',
      designation: '',
      budget: '',
      responsible: '',
      supervisor: '',
      date: new Date().toISOString().slice(0, 10),
      counterValue: '',
      remark: '',
    });
    setCreateOpen(true);
  }

  useCreateQuery(openCreate);

  async function createMaint(e: React.FormEvent) {
    e.preventDefault();
    if (!maintForm.enginId) return;
    try {
      await api(`/engins/${maintForm.enginId}/maintenances`, {
        method: 'POST',
        body: JSON.stringify({
          date: maintForm.date,
          designation: maintForm.designation,
          budget: maintForm.budget || null,
          responsible: maintForm.responsible || null,
          supervisor: maintForm.supervisor || null,
          counterValue: maintForm.counterValue || null,
          remark: maintForm.remark || null,
        }),
      });
      setCreateOpen(false);
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!deleteId || !deleteMotif.trim()) return;
    try {
      await api(`/engins/maintenances/${deleteId}`, {
        method: 'DELETE',
        body: JSON.stringify({ motif: deleteMotif }),
      });
      setDeleteId(null);
      setDeleteMotif('');
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function exportCsv() {
    downloadCsv(`/engins/maintenances/export/csv?${buildStatsQuery()}`, 'maintenances-gic.csv');
  }

  function exportExcel() {
    downloadExcel(`/engins/maintenances/export/xlsx?${buildStatsQuery()}`, 'maintenances-gic.xlsx');
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${t('pages.maintenance')} GIC</title></head><body>
      <h1>${t('pages.maintenancePrintTitle')}</h1>
      <p>${t('fields.period')} : ${dateFrom} → ${dateTo} · ${t('kpi.budgetFiltered')} : ${formatMad(budgetTotal)}</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.date')}</th><th>${t('columns.engin')}</th><th>${t('columns.designation')}</th><th>${t('columns.budget')}</th><th>${t('columns.manager')}</th><th>${t('columns.status')}</th></tr>
        ${items.map((m) => `<tr>
          <td>${formatDate(m.date)}</td>
          <td>${m.engin.matricule || ''} — ${m.engin.brand || ''}</td>
          <td>${m.designation}</td>
          <td>${m.budget ?? ''}</td>
          <td>${m.responsible || '—'}</td>
          <td>${m.engin.status}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const hasActiveFilters = !!enginFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.maintenance')}
        subtitle={t('pages.maintenanceSubtitle')}
        actions={
          <>
            <Link to="/engins"><Btn variant="secondary" icon={Truck}>{t('pages.equipmentPark')}</Btn></Link>
            <Link to="/missions"><Btn variant="secondary" icon={ClipboardList}>{t('pages.missions')}</Btn></Link>
            <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={exportExcel}>{t('common.excel')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('columns.intervention')} value={stats.total} icon={Wrench} tone="violet" />
        <KpiCard title={t('kpi.budgetPeriod')} value={formatMadCompact(stats.budgetTotal)} icon={Wallet} tone="amber" compact />
        <KpiCard
          title={t('kpi.budgetFiltered')}
          value={formatMadCompact(budgetTotal)}
          icon={Wallet}
          tone="emerald"
          compact
          delta={t('kpi.currentList')}
          deltaTone="muted"
        />
        <KpiCard title={t('kpi.equipmentInMaintenance')} value={stats.enginsEnMaintenance} icon={Truck} tone="coral" />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('pages.maintenanceSearchPlaceholder')}
            />
            <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0" />
            <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0" />
            <MacSelect
              value={enginFilter}
              onChange={setEnginFilter}
              options={[
                { value: '', label: t('pages.allEquipment') },
                ...engins.map((e) => ({
                  value: e.id,
                  label: `${e.matricule || ''} — ${e.brand || e.id}`,
                })),
              ]}
              className="w-48 shrink-0"
            />
            <MacSelect
              value={sort}
              onChange={setSort}
              options={[
                { value: 'date', label: t('columns.date') },
                { value: 'designation', label: t('columns.designation') },
                { value: 'budget', label: t('columns.budget') },
              ]}
              className="w-36 shrink-0"
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
                  <p className="mac-filter-menu-section">{t('columns.engin')}</p>
                  <button
                    type="button"
                    role="menuitem"
                    className={`mac-filter-menu-item${enginFilter === '' ? ' mac-filter-menu-item-active' : ''}`}
                    onClick={() => {
                      setEnginFilter('');
                      setPage(1);
                      load(1, { enginId: '' });
                      setShowFilters(false);
                    }}
                  >
                    <span>{t('common.all')}</span>
                    {enginFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                  </button>
                  {engins.slice(0, 40).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${enginFilter === e.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setEnginFilter(e.id);
                        setPage(1);
                        load(1, { enginId: e.id });
                        setShowFilters(false);
                      }}
                    >
                      <span className="truncate">{e.matricule} — {e.brand}</span>
                      {enginFilter === e.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setEnginFilter('');
                          setQ('');
                          setPage(1);
                          load(1, { enginId: '', q: '' });
                          setShowFilters(false);
                        }}
                      >
                        {t('auth.reset')}
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
          <EmptyState title={t('msg.emptyMaintenance')} action={<Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.date')}</Th>
                <Th mac>{t('columns.engin')}</Th>
                <Th mac>{t('columns.designation')}</Th>
                <Th mac>{t('columns.budget')}</Th>
                <Th mac>{t('columns.manager')}</Th>
                <Th mac>{t('columns.supervisor')}</Th>
                <Th mac>{t('columns.enginStatus')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr
                  key={m.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/maintenance/${m.id}`)}
                >
                  <Td mac className="text-[11px]">{formatDate(m.date)}</Td>
                  <Td mac>
                    <Link
                      to={`/engins/${m.engin.id}`}
                      className="mac-table-ref"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {m.engin.matricule || '—'} — {m.engin.brand || ''}
                    </Link>
                  </Td>
                  <Td mac>{m.designation}</Td>
                  <Td mac>{m.budget ? formatMad(m.budget) : '—'}</Td>
                  <Td mac className="mac-table-muted">{m.responsible || '—'}</Td>
                  <Td mac className="mac-table-muted">{m.supervisor || '—'}</Td>
                  <Td mac>
                    <StatusPill status={m.engin.status} quiet />
                  </Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <MacActionBtn icon={Eye} tone="blue" title={t('actions.openFiche')} onClick={() => navigate(`/maintenance/${m.id}`)} />
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => navigate(`/maintenance/${m.id}`, { state: { edit: true } })} />
                      <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteId(m.id); setDeleteMotif(''); }} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => { setPage(p); load(p); }} mac />
      </Card>

      <Modal
        open={createOpen}
        title={t('actions.newMaintenance')}
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="maint-create-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="maint-create-form" onSubmit={createMaint} className="grid gap-3">
          <Select label={t('fields.enginRequiredStar')} required value={maintForm.enginId} onChange={(e) => setMaintForm({ ...maintForm, enginId: e.target.value })}>
            <option value="">—</option>
            {engins.map((e) => (
              <option key={e.id} value={e.id}>{e.matricule || '—'} — {e.brand || ''}</option>
            ))}
          </Select>
          <Input label={t('fields.date')} type="date" value={maintForm.date} onChange={(e) => setMaintForm({ ...maintForm, date: e.target.value })} />
          <Input label={t('fields.designationRequired')} required value={maintForm.designation} onChange={(e) => setMaintForm({ ...maintForm, designation: e.target.value })} />
          <Input label={t('fields.budgetMad')} type="number" min="0" value={maintForm.budget} onChange={(e) => setMaintForm({ ...maintForm, budget: e.target.value })} />
          <Input label={t('fields.counter')} type="number" value={maintForm.counterValue} onChange={(e) => setMaintForm({ ...maintForm, counterValue: e.target.value })} />
          <Input label={t('fields.responsible')} value={maintForm.responsible} onChange={(e) => setMaintForm({ ...maintForm, responsible: e.target.value })} />
          <Input label={t('fields.supervisor')} value={maintForm.supervisor} onChange={(e) => setMaintForm({ ...maintForm, supervisor: e.target.value })} />
          <Input label={t('fields.remark')} value={maintForm.remark} onChange={(e) => setMaintForm({ ...maintForm, remark: e.target.value })} />
        </form>
      </Modal>

      <Modal
        open={!!deleteId}
        title={t('actions.deleteMaintenance')}
        onClose={() => setDeleteId(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.attachmentDeleteHint')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.motifPlaceholder')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>
    </div>
  );
}
