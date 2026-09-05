import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, Download, Printer, List, Layers, CheckCircle, XCircle, RotateCcw,
  SlidersHorizontal, Check, ArrowUp, ArrowDown, BookOpen,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';

type DropdownItem = {
  id: string;
  category: string;
  label: string;
  value: string;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
};

type Stats = {
  total: number;
  actifs: number;
  inactifs: number;
  categoriesCount: number;
  categories: { id: string; label: string; count: number }[];
};

const PREDEFINED_CATEGORY_IDS = [
  'identity_type',
  'payment_mode',
  'payment_nature',
  'property_status',
  'contract_type',
  'work_category',
  'chantier_status',
  'purchase_status',
  'purchase_unit',
  'engin_status',
] as const;

function predefinedCategories(t: TranslateFn) {
  return [
    { id: 'identity_type', label: t('ref.identityTypes') },
    { id: 'payment_mode', label: t('ref.paymentModes') },
    { id: 'payment_nature', label: t('ref.paymentNatures') },
    { id: 'property_status', label: t('ref.propertyStatuses') },
    { id: 'contract_type', label: t('ref.contractTypes') },
    { id: 'work_category', label: t('ref.workCategories') },
    { id: 'chantier_status', label: t('ref.siteStatuses') },
    { id: 'purchase_status', label: t('ref.purchaseStatuses') },
    { id: 'purchase_unit', label: t('ref.purchaseUnits') },
    { id: 'engin_status', label: t('ref.equipmentStatuses') },
  ];
}

const PAGE_SIZE = 20;
type SortOrder = 'asc' | 'desc';

function categoryLabel(
  id: string,
  predefined: { id: string; label: string }[],
  statsCategories?: Stats['categories'],
) {
  const fromStats = statsCategories?.find((c) => c.id === id);
  if (fromStats?.label) return fromStats.label;
  return predefined.find((c) => c.id === id)?.label || id.replace(/_/g, ' ');
}

export default function ReferentielsPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const predefined = useMemo(() => predefinedCategories(t), [t]);

  const [items, setItems] = useState<DropdownItem[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, actifs: 0, inactifs: 0, categoriesCount: 0, categories: [] });
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '');
  const [activeFilter, setActiveFilter] = useState(searchParams.get('active') || 'true');
  const [sort, setSort] = useState(searchParams.get('sort') || 'category');
  const [order, setOrder] = useState<SortOrder>((searchParams.get('order') as SortOrder) || 'asc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    category: 'payment_mode',
    customCategory: '',
    label: '',
    value: '',
    sortOrder: '',
    isActive: 'true',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildStatsQuery() {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (categoryFilter) qs.set('category', categoryFilter);
    if (activeFilter) qs.set('active', activeFilter);
    return qs.toString();
  }

  function buildQuery(
    pageNum = page,
    overrides?: { category?: string; active?: string; sort?: string; order?: SortOrder },
  ) {
    const qs = new URLSearchParams();
    const cat = overrides?.category !== undefined ? overrides.category : categoryFilter;
    const act = overrides?.active !== undefined ? overrides.active : activeFilter;
    const sortVal = overrides?.sort !== undefined ? overrides.sort : sort;
    const orderVal = overrides?.order !== undefined ? overrides.order : order;
    if (q) qs.set('q', q);
    if (cat) qs.set('category', cat);
    if (act) qs.set('active', act);
    qs.set('sort', sortVal);
    qs.set('order', orderVal);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function syncUrl(pageNum = page) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (categoryFilter) qs.set('category', categoryFilter);
    if (activeFilter && activeFilter !== 'true') qs.set('active', activeFilter);
    if (sort !== 'category') qs.set('sort', sort);
    if (order !== 'asc') qs.set('order', order);
    if (pageNum > 1) qs.set('page', String(pageNum));
    setSearchParams(qs, { replace: true });
  }

  function load(
    pageNum = page,
    overrides?: { category?: string; active?: string; sort?: string; order?: SortOrder },
  ) {
    setLoading(true);
    setError('');
    const statsQs = buildStatsQuery();
    Promise.all([
      api<PaginatedResponse<DropdownItem>>(`/dropdowns?${buildQuery(pageNum, overrides)}`),
      api<Stats>(`/dropdowns/stats?${statsQs}`),
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

  function resolvedCategory() {
    return form.category === '__custom__' ? form.customCategory.trim() : form.category;
  }

  function openCreate() {
    setEditId(null);
    setForm({
      category: categoryFilter || 'payment_mode',
      customCategory: '',
      label: '',
      value: '',
      sortOrder: '',
      isActive: 'true',
    });
    setOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(item: DropdownItem) {
    setEditId(item.id);
    const known = PREDEFINED_CATEGORY_IDS.includes(item.category as typeof PREDEFINED_CATEGORY_IDS[number]);
    setForm({
      category: known ? item.category : '__custom__',
      customCategory: known ? '' : item.category,
      label: item.label,
      value: item.value,
      sortOrder: String(item.sortOrder),
      isActive: item.isActive ? 'true' : 'false',
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const category = resolvedCategory();
    if (!category) {
      await appAlert(t('ref.categoryRequired'));
      return;
    }
    try {
      const body = {
        category,
        label: form.label,
        value: form.value,
        sortOrder: form.sortOrder ? Number(form.sortOrder) : undefined,
        isActive: form.isActive === 'true',
      };
      if (editId) {
        await api(`/dropdowns/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/dropdowns', { method: 'POST', body: JSON.stringify(body) });
      }
      setOpen(false);
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function deactivate(id: string) {
    if (!await appConfirm(t('ref.deactivateConfirm'))) return;
    try {
      await api(`/dropdowns/${id}`, { method: 'DELETE' });
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function reactivate(item: DropdownItem) {
    try {
      await api(`/dropdowns/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: true }),
      });
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function exportCsv() {
    downloadCsv(`/dropdowns/export/csv?${buildStatsQuery()}`, 'referentiels-gic.csv');
  }

  function exportExcel() {
    downloadExcel(`/dropdowns/export/xlsx?${buildStatsQuery()}`, 'referentiels-gic.xlsx');
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><body style="font-family:sans-serif;padding:24px;font-size:12px">
      <h1>${t('pages.referentials')} — GIC</h1>
      <p>${t('msg.referentialsPrintSummary', { categories: stats.categoriesCount, active: stats.actifs, total: stats.total })}</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
        <tr><th>${t('columns.category')}</th><th>${t('columns.displayLabel')}</th><th>${t('columns.technicalValue')}</th><th>${t('columns.sortOrder')}</th><th>${t('fields.active')}</th></tr>
        ${items.map((i) => `<tr>
          <td>${categoryLabel(i.category, predefined, stats.categories)}</td>
          <td>${i.label}</td>
          <td>${i.value}</td>
          <td>${i.sortOrder}</td>
          <td>${i.isActive ? t('fields.yes') : t('fields.no')}</td>
        </tr>`).join('')}
      </table>
    </body></html>`);
    w.document.close();
    w.print();
  }

  const allCategories = [
    ...predefined,
    ...stats.categories
      .filter((c) => !predefined.some((p) => p.id === c.id))
      .map((c) => ({ id: c.id, label: c.label })),
  ];

  const hasActiveFilters = !!categoryFilter || activeFilter !== 'true';

  const activeFilters = [
    { id: 'true', label: t('ref.activePlural') },
    { id: 'false', label: t('ref.inactivePlural') },
    { id: '', label: t('common.allFeminine') },
  ];

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.referentials')}
        subtitle={t('pages.referentialsSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={exportExcel}>{t('common.excel')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.addOption')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('kpi.options')} value={stats.total} icon={List} tone="violet" delta={t('kpi.categoriesCount', { count: stats.categoriesCount })} deltaTone="muted" />
        <KpiCard title={t('status.active')} value={stats.actifs} icon={CheckCircle} tone="emerald" />
        <KpiCard title={t('kpi.inactiveFeminine')} value={stats.inactifs} icon={XCircle} tone="coral" />
        <KpiCard title={t('columns.category')} value={stats.categoriesCount} icon={Layers} tone="amber" />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('pages.referentialsSearchPlaceholder')}
            />
            <MacSelect
              value={sort}
              onChange={(v) => {
                setSort(v);
                setPage(1);
                load(1, { sort: v });
              }}
              options={[
                { value: 'category', label: t('columns.category') },
                { value: 'label', label: t('columns.displayLabel') },
                { value: 'value', label: t('columns.technicalValue') },
                { value: 'sortOrder', label: t('columns.sortOrder') },
                { value: 'createdAt', label: t('columns.createdAtSort') },
              ]}
              className="w-36 shrink-0"
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
                  {activeFilters.map((f) => (
                    <button
                      key={f.id || 'all-active'}
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
                  <p className="mac-filter-menu-section">{t('columns.category')}</p>
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
                    <span>{t('common.allFeminine')}</span>
                    {categoryFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                  </button>
                  {allCategories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${categoryFilter === c.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setCategoryFilter(c.id);
                        setPage(1);
                        load(1, { category: c.id });
                      }}
                    >
                      <span className="truncate">{c.label}</span>
                      {categoryFilter === c.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setCategoryFilter('');
                          setActiveFilter('true');
                          setPage(1);
                          load(1, { category: '', active: 'true' });
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
          <EmptyState title={t('msg.emptyReferentials')} action={<Btn icon={Plus} onClick={openCreate}>{t('actions.addOption')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.category')}</Th>
                <Th mac>{t('columns.displayLabel')}</Th>
                <Th mac>{t('columns.technicalValue')}</Th>
                <Th mac>{t('columns.sortOrder')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr
                  key={i.id}
                  className="cursor-pointer"
                  onClick={() => openEdit(i)}
                >
                  <Td mac>
                    <span className="font-medium">{categoryLabel(i.category, predefined, stats.categories)}</span>
                    <span className="block text-[10px] text-gic-muted font-mono">{i.category}</span>
                  </Td>
                  <Td mac>{i.label}</Td>
                  <Td mac className="font-mono text-[11px] text-gic-muted">{i.value}</Td>
                  <Td mac className="text-[11px]">{i.sortOrder}</Td>
                  <Td mac>
                    {i.isActive ? <StatusPill status="actif" quiet /> : <StatusPill status="inactif" quiet />}
                  </Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(i)} />
                      {i.isActive ? (
                        <MacActionBtn icon={Trash2} tone="red" title={t('ref.deactivate')} onClick={() => deactivate(i.id)} />
                      ) : (
                        <MacActionBtn icon={RotateCcw} tone="blue" title={t('ref.reactivate')} onClick={() => reactivate(i)} />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => load(p)} mac />
      </Card>

      <Card className="mt-4">
        <div className="flex items-start gap-3">
          <BookOpen size={18} className="text-gic-muted shrink-0 mt-0.5" strokeWidth={1.5} />
          <div>
            <h3 className="text-sm font-semibold mb-1">{t('ref.usageTitle')}</h3>
            <p className="text-[12px] text-gic-muted leading-relaxed">
              {t('ref.usageBody')}
            </p>
          </div>
        </div>
      </Card>

      <Modal
        open={open}
        title={editId ? t('common.edit') : t('common.add')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="ref-form" type="submit">{editId ? t('common.save') : t('actions.create')}</Btn>
          </>
        }
      >
        <form id="ref-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <Select
            className="sm:col-span-2"
            label={t('ref.categoryRequiredLabel')}
            required
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            disabled={!!editId}
          >
            {allCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
            <option value="__custom__">{t('ref.otherCategory')}</option>
          </Select>
          {form.category === '__custom__' && !editId && (
            <Input
              className="sm:col-span-2"
              label={t('ref.categoryCode')}
              required
              placeholder={t('ref.categoryCodePlaceholder')}
              value={form.customCategory}
              onChange={(e) => setForm({ ...form, customCategory: e.target.value.replace(/\s+/g, '_').toLowerCase() })}
            />
          )}
          <Input label={t('ref.displayLabelRequired')} required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <Input label={t('ref.technicalValueRequired')} required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          <Input label={t('ref.sortOrderLabel')} type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
          {editId && (
            <Select label={t('fields.status')} value={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.value })}>
              <option value="true">{t('status.activeFeminine')}</option>
              <option value="false">{t('status.inactiveFeminine')}</option>
            </Select>
          )}
        </form>
      </Modal>
    </div>
  );
}
