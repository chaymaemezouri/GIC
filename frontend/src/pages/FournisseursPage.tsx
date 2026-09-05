import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, Download, Eye, Printer, Key,
  Truck, ShieldCheck, ShoppingCart, SlidersHorizontal, Check, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, formatMad, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { SupplierFormFields, emptySupplierForm, supplierToForm, type SupplierFormData } from '../components/SupplierFormFields';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';

type Supplier = {
  id: string;
  reference: string;
  companyName: string;
  contactName?: string;
  phone1?: string;
  phone2?: string;
  email?: string;
  cin?: string;
  source?: string;
  isActive: boolean;
  passwordHash?: string | null;
  _count?: { purchases: number };
};

type SortOrder = 'asc' | 'desc';

type Stats = { total: number; active: number; withEmail: number; withPortal: number; linked: number; purchaseTotal: number };

const PAGE_SIZE = 20;

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

export default function FournisseursPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Supplier[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, withEmail: 0, withPortal: 0, linked: 0, purchaseTotal: 0 });
  const [q, setQ] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [portalFilter, setPortalFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [sort, setSort] = useState('companyName');
  const [order, setOrder] = useState<SortOrder>('asc');
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [portalOpen, setPortalOpen] = useState<string | null>(null);
  const [portalPwd, setPortalPwd] = useState('');
  const [form, setForm] = useState<SupplierFormData>(emptySupplierForm());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildQuery(pageNum = page, overrides?: { active?: string; withPortal?: string; source?: string }) {
    const qs = new URLSearchParams();
    const active = overrides?.active ?? activeFilter;
    const withPortal = overrides?.withPortal ?? portalFilter;
    const source = overrides?.source ?? sourceFilter;
    if (q) qs.set('q', q);
    if (active) qs.set('active', active);
    if (withPortal) qs.set('withPortal', withPortal);
    if (source) qs.set('source', source);
    qs.set('sort', sort);
    qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs;
  }

  function load(pageNum = page, overrides?: { active?: string; withPortal?: string; source?: string }) {
    setLoading(true);
    setError('');
    const qs = buildQuery(pageNum, overrides);
    Promise.all([
      api<PaginatedResponse<Supplier>>(`/achats/suppliers?${qs}`),
      api<Stats>('/achats/suppliers/stats'),
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

  useEffect(() => {
    api<Supplier[]>('/achats/suppliers?limit=100&sort=source&order=asc')
      .then((res) => {
        const data = Array.isArray(res) ? res : (res as PaginatedResponse<Supplier>).items;
        const sources = [...new Set(data.map((s) => s.source).filter(Boolean))] as string[];
        setSourceOptions(sources.sort());
      })
      .catch(() => {});
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
    setForm(emptySupplierForm());
    setError('');
    setOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(s: Supplier) {
    api(`/achats/suppliers/${s.id}`).then((full) => {
      setEditId(s.id);
      setForm(supplierToForm(full));
      setError('');
      setOpen(true);
    });
  }

  function toBody(f: SupplierFormData) {
    return {
      companyName: f.companyName,
      contactName: f.contactName || null,
      phone1: f.phone1 || null,
      phone2: f.phone2 || null,
      email: f.email || null,
      cin: f.cin || null,
      source: f.source || null,
      address: f.address || null,
      bankName: f.bankName || null,
      rib: f.rib || null,
      remark: f.remark || null,
      isActive: f.isActive === 'true',
    };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const body = toBody(form);
      if (editId) {
        await api(`/achats/suppliers/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/achats/suppliers', { method: 'POST', body: JSON.stringify(body) });
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
      await api(`/achats/suppliers/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      setDeleteId(null);
      setDeleteMotif('');
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function setPortalPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!portalOpen) return;
    try {
      await api(`/achats/suppliers/${portalOpen}/portal-password`, {
        method: 'POST',
        body: JSON.stringify({ password: portalPwd }),
      });
      setPortalOpen(null);
      setPortalPwd('');
      load(page);
      await appAlert('Accès portail activé pour ce fournisseur');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${t('pages.suppliers')} — GIC</title></head><body>
      <h1>${t('pages.suppliers')} — GIC</h1>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.ref')}</th><th>${t('columns.companyName')}</th><th>${t('columns.contact')}</th><th>${t('columns.phoneFull')}</th><th>${t('columns.email')}</th><th>${t('columns.purchases')}</th><th>${t('columns.status')}</th></tr>
        ${items.map((s) => `<tr>
          <td>${s.reference}</td>
          <td>${s.companyName}</td>
          <td>${s.contactName || '—'}</td>
          <td>${s.phone1 || '—'}${s.phone2 ? ' / ' + s.phone2 : ''}</td>
          <td>${s.email || '—'}</td>
          <td>${s._count?.purchases ?? 0}</td>
          <td>${s.isActive ? t('status.active') : t('status.inactive')}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  function exportCsv() {
    downloadCsv(`/achats/suppliers/export/csv?${buildQuery(1)}`, 'fournisseurs-gic.csv');
  }

  function exportExcel() {
    downloadExcel(`/achats/suppliers/export/xlsx?${buildQuery(1)}`, 'fournisseurs-gic.xlsx');
  }

  const statusFilters = [
    { id: '', label: t('common.all') },
    { id: 'true', label: t('kpi.active') },
    { id: 'false', label: t('common.inactivePlural') },
  ];

  const portalFilters = [
    { id: '', label: t('common.all') },
    { id: 'true', label: t('common.withAccess') },
    { id: 'false', label: t('common.withoutAccess') },
  ];

  const hasActiveFilters = !!activeFilter || !!portalFilter || !!sourceFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.suppliers')}
        subtitle={t('pages.suppliersSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={exportCsv}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={exportExcel}>{t('common.excel')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newSupplier')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('kpi.totalSuppliers')} value={stats.total} icon={Truck} tone="violet" />
        <KpiCard title={t('kpi.active')} value={stats.active} icon={ShieldCheck} tone="emerald" />
        <KpiCard title={t('kpi.withPortal')} value={stats.withPortal} icon={Key} tone="amber" delta={t('msg.withEmailDelta', { count: stats.withEmail })} deltaTone="muted" />
        <KpiCard
          title={t('kpi.purchaseVolume')}
          value={formatMadCompact(stats.purchaseTotal)}
          icon={ShoppingCart}
          tone="coral"
          compact
          delta={`${stats.linked} avec achats`}
          deltaTone="muted"
        />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchCompanyRefCin')}
            />
            <MacSelect
              value={sort}
              onChange={setSort}
              options={[
                { value: 'companyName', label: t('fields.companyName') },
                { value: 'reference', label: t('fields.reference') },
                { value: 'source', label: t('fields.source') },
                { value: 'createdAt', label: t('msg.newestFirst') },
              ]}
              className="w-44 shrink-0"
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
                      key={f.id || 'all-status'}
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
                  <p className="mac-filter-menu-section">Portail</p>
                  {portalFilters.map((f) => (
                    <button
                      key={f.id || 'all-portal'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${portalFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setPortalFilter(f.id);
                        setPage(1);
                        load(1, { withPortal: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {portalFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  <div className="mac-filter-menu-sep" />
                  <p className="mac-filter-menu-section">{t('fields.source')}</p>
                  <button
                    type="button"
                    role="menuitem"
                    className={`mac-filter-menu-item${!sourceFilter ? ' mac-filter-menu-item-active' : ''}`}
                    onClick={() => {
                      setSourceFilter('');
                      setPage(1);
                      load(1, { source: '' });
                    }}
                  >
                    <span>Toutes</span>
                    {!sourceFilter && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                  </button>
                  {sourceOptions.map((src) => (
                    <button
                      key={src}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${sourceFilter === src ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setSourceFilter(src);
                        setPage(1);
                        load(1, { source: src });
                      }}
                    >
                      <span>{src}</span>
                      {sourceFilter === src && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setActiveFilter('');
                          setPortalFilter('');
                          setSourceFilter('');
                          setPage(1);
                          load(1, { active: '', withPortal: '', source: '' });
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
          <EmptyState title={t('msg.emptySuppliers')} action={<Btn icon={Plus} onClick={openCreate}>{t('actions.newSupplier')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.ref')}</Th>
                <Th mac>{t('columns.companyName')}</Th>
                <Th mac>{t('columns.contact')}</Th>
                <Th mac>{t('columns.cin')}</Th>
                <Th mac>{t('columns.source')}</Th>
                <Th mac>{t('columns.phoneFull')}</Th>
                <Th mac>{t('columns.email')}</Th>
                <Th mac>{t('columns.purchases')}</Th>
                <Th mac>{t('columns.portal')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="cursor-pointer" onClick={() => navigate(`/fournisseurs/${s.id}`)}>
                  <Td mac>
                    <Link to={`/fournisseurs/${s.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{s.reference}</Link>
                  </Td>
                  <Td mac className="font-medium">{s.companyName}</Td>
                  <Td mac className="mac-table-muted">{s.contactName || '—'}</Td>
                  <Td mac className="text-[11px] mac-table-muted">{s.cin || '—'}</Td>
                  <Td mac className="text-[11px] mac-table-muted">{s.source || '—'}</Td>
                  <Td mac className="text-[11px]">
                    {s.phone1 || '—'}
                    {s.phone2 ? ` / ${s.phone2}` : ''}
                  </Td>
                  <Td mac className="text-[11px] mac-table-muted">{s.email || '—'}</Td>
                  <Td mac>
                    <span className="mac-chip mac-chip-blue">{s._count?.purchases ?? 0}</span>
                  </Td>
                  <Td mac>
                    {s.passwordHash ? (
                      <span className="mac-chip mac-chip-green">{t('status.activated')}</span>
                    ) : s.email ? (
                      <span className="mac-chip">Sans accès</span>
                    ) : (
                      <span className="text-[11px] text-gic-muted">—</span>
                    )}
                  </Td>
                  <Td mac><StatusPill status={s.isActive ? 'actif' : 'inactif'} quiet /></Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <Link to={`/fournisseurs/${s.id}`} className="mac-action-btn mac-action-btn-blue" title={t('actions.ficheDetail')}>
                        <Eye size={14} strokeWidth={2.15} />
                      </Link>
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(s)} />
                      {s.email && (
                        <MacActionBtn
                          icon={Key}
                          tone="green"
                          title={t('msg.portalPassword')}
                          onClick={() => { setPortalOpen(s.id); setPortalPwd(''); }}
                        />
                      )}
                      <MacActionBtn
                        icon={Trash2}
                        tone="red"
                        title={t('common.delete')}
                        onClick={() => { setDeleteId(s.id); setDeleteMotif(''); }}
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
        title={editId ? t('actions.editSupplier') : t('actions.newSupplier')}
        onClose={() => setOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn><Btn form="frn-form" type="submit">{editId ? t('common.save') : t('common.create')}</Btn></>}
      >
        <form id="frn-form" onSubmit={save}>
          <SupplierFormFields form={form} setForm={setForm} sourceOptions={sourceOptions} />
          {error && <p className="mt-3 text-[11px] text-gic-coral">{error}</p>}
        </form>
      </Modal>

      <Modal
        open={!!portalOpen}
        title={t('actions.supplierPortalAccess')}
        onClose={() => setPortalOpen(null)}
        footer={<><Btn variant="secondary" onClick={() => setPortalOpen(null)}>{t('common.cancel')}</Btn><Btn form="portal-pwd-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="portal-pwd-form" onSubmit={setPortalPassword}>
          <p className="text-[12px] text-gic-muted mb-3">{t('msg.supplierPortalLoginHint')}</p>
          <Input label={t('msg.portalPasswordMin6')} type="password" required minLength={6} value={portalPwd} onChange={(e) => setPortalPwd(e.target.value)} />
        </form>
      </Modal>

      <Modal
        open={!!deleteId}
        title={t('actions.deleteSupplier')}
        onClose={() => setDeleteId(null)}
        footer={<><Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn></>}
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.supplierDeleteBlocked')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.motifPlaceholder')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>
    </div>
  );
}
