import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Eye, Printer, Paperclip, Plus, Pencil, Trash2,
  Wallet, TrendingDown, TrendingUp, SlidersHorizontal, Check,
} from 'lucide-react';
import { api, formatDate, formatMad, uploadForm, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, TableWrap, Td, Th,
} from '../components/ui';
import {
  OfficeCashFormFields, emptyOfficeCashForm, officeCashToForm,
  officePurposeLabel, type OfficeCashFormData,
} from '../components/OfficeCashFormFields';
import { printOfficeCashList, printOfficeCashReceipt } from '../lib/printOfficeCash';
import { appAlert } from '../lib/dialog';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';

type Movement = {
  id: string;
  date: string;
  direction: string;
  amount: number;
  purpose: string;
  designation: string;
  workLabel?: string;
  remark?: string;
  proofFile?: string;
  reconnuId?: string;
  reconnuName?: string | null;
  chantierId?: string;
  reconnu?: { id: string; reference?: string; firstName: string; lastName: string } | null;
  chantier?: { id: string; name: string } | null;
};

type Stats = { count: number; totalEntrees: number; totalSorties: number; solde: number };
type ListResponse = PaginatedResponse<Movement> & {
  totals: { entrees: number; sorties: number; solde: number };
};

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

type FilterOverrides = Partial<{
  q: string;
  reconnuId: string;
  purpose: string;
  direction: string;
  remark: string;
  createdBy: string;
  dateFrom: string;
  dateTo: string;
}>;

export default function CaisseBureauPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Movement[]>([]);
  const [totals, setTotals] = useState({ entrees: 0, sorties: 0, solde: 0 });
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ count: 0, totalEntrees: 0, totalSorties: 0, solde: 0 });
  const [reconnus, setReconnus] = useState<{ id: string; reference?: string; firstName: string; lastName: string }[]>([]);
  const [chantiers, setChantiers] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [reconnuFilter, setReconnuFilter] = useState(searchParams.get('reconnuId') || '');
  const [purposeFilter, setPurposeFilter] = useState(searchParams.get('purpose') || '');
  const [directionFilter, setDirectionFilter] = useState(searchParams.get('direction') || '');
  const [remarkFilter, setRemarkFilter] = useState(searchParams.get('remark') || '');
  const [createdByFilter, setCreatedByFilter] = useState(searchParams.get('createdBy') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '');
  const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string; email: string }[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState<Movement | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<OfficeCashFormData>(emptyOfficeCashForm());
  const [formError, setFormError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');

  function buildFilterQs(overrides?: FilterOverrides) {
    const qs = new URLSearchParams();
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const reconnuId = overrides?.reconnuId !== undefined ? overrides.reconnuId : reconnuFilter;
    const purpose = overrides?.purpose !== undefined ? overrides.purpose : purposeFilter;
    const direction = overrides?.direction !== undefined ? overrides.direction : directionFilter;
    const remark = overrides?.remark !== undefined ? overrides.remark : remarkFilter;
    const createdBy = overrides?.createdBy !== undefined ? overrides.createdBy : createdByFilter;
    const from = overrides?.dateFrom !== undefined ? overrides.dateFrom : dateFrom;
    const to = overrides?.dateTo !== undefined ? overrides.dateTo : dateTo;
    if (qVal) qs.set('q', qVal);
    if (reconnuId) qs.set('reconnuId', reconnuId);
    if (purpose) qs.set('purpose', purpose);
    if (direction) qs.set('direction', direction);
    if (remark) qs.set('remark', remark);
    if (createdBy) qs.set('createdBy', createdBy);
    if (from) qs.set('dateFrom', from);
    if (to) qs.set('dateTo', to);
    return qs;
  }

  function buildListQuery(pageNum = page, overrides?: FilterOverrides) {
    const qs = buildFilterQs(overrides);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function syncUrl(pageNum = page) {
    const qs = buildFilterQs();
    if (pageNum > 1) qs.set('page', String(pageNum));
    setSearchParams(qs, { replace: true });
  }

  function load(pageNum = page, overrides?: FilterOverrides) {
    setLoading(true);
    setError('');
    const filterQs = buildFilterQs(overrides).toString();
    Promise.all([
      api<ListResponse>(`/caisse-bureau?${buildListQuery(pageNum, overrides)}`),
      api<Stats>(`/caisse-bureau/stats?${filterQs}`),
    ])
      .then(([res, st]) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        setTotals(res.totals);
        setStats(st);
        syncUrl(res.page);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('msg.serverError')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(page);
    api<PaginatedResponse<{ id: string; reference?: string; firstName: string; lastName: string }>>(
      '/reconnus?active=true&limit=100&sort=lastName'
    ).then((r) => setReconnus(r.items)).catch(() => {});
    api<PaginatedResponse<{ id: string; name: string }>>(
      '/chantiers?limit=100'
    ).then((r) => setChantiers(r.items)).catch(() => {});
    api<PaginatedResponse<{ id: string; firstName: string; lastName: string; email: string }>>(
      '/auth/users?limit=100&sort=lastName&order=asc&active=true'
    ).then((r) => setUsers(r.items)).catch(() => setUsers([]));
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

  const hasActiveFilters = !!purposeFilter || !!directionFilter || !!reconnuFilter || !!dateFrom || !!dateTo || !!q || !!remarkFilter || !!createdByFilter;

  function openCreate() {
    setEditId(null);
    setForm(emptyOfficeCashForm());
    setFormError('');
    setFormOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(m: Movement) {
    setEditId(m.id);
    setForm(officeCashToForm(m));
    setFormError('');
    setFormOpen(true);
  }

  function openView(m: Movement) {
    setViewItem(m);
    setViewOpen(true);
  }

  async function saveMovement(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.designation.trim() || !form.amount) {
      setFormError(t('msg.designationAmountRequired'));
      return;
    }
    try {
      const fd = new FormData();
      fd.append('direction', form.direction);
      fd.append('amount', form.amount);
      fd.append('purpose', form.purpose);
      fd.append('designation', form.designation.trim());
      fd.append('workLabel', form.workLabel.trim());
      fd.append('reconnuId', form.reconnuId);
      fd.append('reconnuName', form.reconnuName.trim());
      fd.append('chantierId', form.chantierId);
      fd.append('remark', form.remark.trim());
      fd.append('date', form.date);
      if (form.proof) fd.append('proof', form.proof);

      if (editId) {
        await uploadForm(`/caisse-bureau/${editId}`, fd, 'PUT');
      } else {
        await uploadForm('/caisse-bureau', fd, 'POST');
      }
      setFormOpen(false);
      load(page);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!deleteId || !deleteMotif.trim()) return;
    try {
      await api(`/caisse-bureau/${deleteId}`, {
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

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.cash')}
        subtitle={t('pages.cashOfficeSubtitle')}
        actions={
          <>
            <Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn
                icon={Printer}
                tone="gray"
                title={t('common.print')}
                onClick={() => printOfficeCashList(items, totals)}
              />
            </div>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('columns.movements')} value={stats.count} icon={Wallet} tone="violet" />
        <KpiCard title={t('columns.debit')} value={formatMadCompact(stats.totalSorties)} icon={TrendingDown} tone="coral" compact />
        <KpiCard title={t('kpi.entries')} value={formatMadCompact(stats.totalEntrees)} icon={TrendingUp} tone="emerald" compact />
        <KpiCard title={t('kpi.cashRemaining')} value={formatMadCompact(stats.solde)} icon={Wallet} tone="amber" compact />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="mac-mini-stat">
          <p className="mac-mini-stat-label">{t('msg.debitFilter')}</p>
          <p className="mac-mini-stat-value text-[#d70015]">{formatMadCompact(totals.sorties)}</p>
        </div>
        <div className="mac-mini-stat">
          <p className="mac-mini-stat-label">{t('msg.creditFilter')}</p>
          <p className="mac-mini-stat-value text-[#248a3d]">{formatMadCompact(totals.entrees)}</p>
        </div>
        <div className="mac-mini-stat">
          <p className="mac-mini-stat-label">{t('kpi.cashRemaining')}</p>
          <p className="mac-mini-stat-value">{formatMadCompact(totals.solde)}</p>
        </div>
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchDesignationRemarkCash')}
            />
            <MacSelect
              value={reconnuFilter}
              onChange={(v) => {
                setReconnuFilter(v);
                setPage(1);
                load(1, { reconnuId: v });
              }}
              options={[
                { value: '', label: t('common.allRecognized') },
                ...reconnus.map((r) => ({
                  value: r.id,
                  label: `${r.reference ? r.reference + ' — ' : ''}${r.firstName} ${r.lastName}`,
                })),
              ]}
              className="w-44 shrink-0"
            />
            {users.length > 0 ? (
              <MacSelect
                value={createdByFilter}
                onChange={(v) => {
                  setCreatedByFilter(v);
                  setPage(1);
                  load(1, { createdBy: v });
                }}
                options={[
                  { value: '', label: t('fields.holderCreatedBySort') },
                  ...users.map((u) => ({
                    value: u.email,
                    label: `${u.firstName} ${u.lastName}`,
                  })),
                ]}
                className="w-44 shrink-0"
              />
            ) : (
              <input
                className="w-40 shrink-0 rounded-lg border border-gic-border px-2 py-1.5 text-[12px]"
                placeholder={t('msg.createdByEmail')}
                value={createdByFilter}
                onChange={(e) => setCreatedByFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(1);
                    load(1, { createdBy: createdByFilter });
                  }
                }}
              />
            )}
            <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('fields.from')} className="w-36 shrink-0" />
            <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('fields.to')} className="w-36 shrink-0" />
            <Btn
              variant="secondary"
              className="!px-3 shrink-0"
              onClick={() => { setPage(1); load(1); }}
            >
              {t('common.filter')}
            </Btn>
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
                  <p className="mac-filter-menu-section">{t('common.direction')}</p>
                  {[
                    { id: '', label: t('common.allFeminine') },
                    { id: 'sortie', label: t('common.exitsDebit') },
                    { id: 'entree', label: t('common.entriesCredit') },
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
                  <div className="mac-filter-menu-sep" />
                  <p className="mac-filter-menu-section">{t('fields.purpose')}</p>
                  {[
                    { id: '', label: t('common.allMotifs') },
                    { id: 'chantier', label: t('fields.purposeChantier') },
                    { id: 'travail', label: t('fields.purposeTravail') },
                    { id: 'aleatoire', label: t('fields.purposeAleatoire') },
                    { id: 'alimentation', label: t('fields.purposeAlimentation') },
                  ].map((f) => (
                    <button
                      key={f.id || 'all-purpose'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${purposeFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setPurposeFilter(f.id);
                        setPage(1);
                        load(1, { purpose: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {purposeFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  <div className="mac-filter-menu-sep" />
                  <p className="mac-filter-menu-section">Remarque</p>
                  <input
                    className="mx-2 mb-2 w-[calc(100%-1rem)] rounded-lg border border-gic-border px-2 py-1.5 text-[12px]"
                    placeholder={t('common.containsEllipsis')}
                    value={remarkFilter}
                    onChange={(e) => setRemarkFilter(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setPage(1);
                        load(1, { remark: remarkFilter });
                        setShowFilters(false);
                      }
                    }}
                  />
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setPurposeFilter('');
                          setDirectionFilter('');
                          setReconnuFilter('');
                          setRemarkFilter('');
                          setCreatedByFilter('');
                          setDateFrom('');
                          setDateTo('');
                          setQ('');
                          setPage(1);
                          load(1, {
                            purpose: '',
                            direction: '',
                            reconnuId: '',
                            remark: '',
                            createdBy: '',
                            dateFrom: '',
                            dateTo: '',
                            q: '',
                          });
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
          <EmptyState
            title={t('msg.emptyCash')}
            action={<Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>}
          />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.date')}</Th>
                <Th mac>{t('columns.designation')}</Th>
                <Th mac>{t('columns.piece')}</Th>
                <Th mac>{t('columns.recognized')}</Th>
                <Th mac>{t('columns.motif')}</Th>
                <Th mac>{t('columns.debit')}</Th>
                <Th mac>{t('columns.credit')}</Th>
                <Th mac>{t('columns.remark')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="cursor-pointer" onClick={() => openView(m)}>
                  <Td mac className="mac-table-muted">{formatDate(m.date)}</Td>
                  <Td mac>
                    <span className="mac-table-ref">{m.designation}</span>
                    {m.workLabel && <span className="block text-[10px] text-gic-muted">{m.workLabel}</span>}
                    {m.chantier && (
                      <span className="block text-[10px] text-gic-muted">{m.chantier.name}</span>
                    )}
                  </Td>
                  <Td mac>
                    {m.proofFile ? (
                      <a
                        href={m.proofFile}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-[#007aff]"
                        title={t('common.pieceShort')}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Paperclip size={14} />
                      </a>
                    ) : (
                      <span className="mac-table-muted">—</span>
                    )}
                  </Td>
                  <Td mac>
                    {m.reconnu ? (
                      <Link
                        to={`/reconnus/${m.reconnu.id}`}
                        className="mac-table-ref"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {m.reconnu.firstName} {m.reconnu.lastName}
                      </Link>
                    ) : m.reconnuName ? (
                      <span>{m.reconnuName}</span>
                    ) : (
                      <span className="mac-table-muted">—</span>
                    )}
                  </Td>
                  <Td mac>
                    <span className="mac-chip mac-chip-blue">{officePurposeLabel(m.purpose, t)}</span>
                  </Td>
                  <Td mac className="text-gic-coral font-medium tabular-nums">
                    {m.direction === 'sortie' ? formatMad(m.amount) : '—'}
                  </Td>
                  <Td mac className="text-gic-emerald font-medium tabular-nums">
                    {m.direction === 'entree' ? formatMad(m.amount) : '—'}
                  </Td>
                  <Td mac className="mac-table-muted max-w-[140px] truncate">{m.remark || '—'}</Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <MacActionBtn icon={Eye} tone="blue" title={t('common.view')} onClick={() => openView(m)} />
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(m)} />
                      <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={() => printOfficeCashReceipt(m)} />
                      <MacActionBtn
                        icon={Trash2}
                        tone="red"
                        title={t('common.delete')}
                        onClick={() => { setDeleteId(m.id); setDeleteMotif(''); }}
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
        open={formOpen}
        size="lg"
        title={editId ? t('actions.editMovement') : t('actions.newCashMovement')}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setFormOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="office-cash-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="office-cash-form" onSubmit={saveMovement}>
          <OfficeCashFormFields form={form} setForm={setForm} reconnus={reconnus} chantiers={chantiers} />
          {formError && <p className="mt-3 text-[11px] text-gic-coral">{formError}</p>}
        </form>
      </Modal>

      <Modal
        open={viewOpen && !!viewItem}
        title={t('actions.detailMovement')}
        onClose={() => setViewOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setViewOpen(false)}>{t('common.close')}</Btn>
            {viewItem && (
              <Btn variant="secondary" icon={Printer} onClick={() => printOfficeCashReceipt(viewItem)}>{t('common.print')}</Btn>
            )}
          </>
        }
      >
        {viewItem && (
          <div className="space-y-2 text-[12px]">
            <p><span className="text-gic-muted">{t('msg.colonDate')}</span> {formatDate(viewItem.date)}</p>
            <p><span className="text-gic-muted">{t('msg.colonDesignation')}</span> {viewItem.designation}</p>
            <p><span className="text-gic-muted">{t('msg.colonDirection')}</span> {viewItem.direction === 'sortie' ? t('common.exit') : t('common.entry')}</p>
            <p><span className="text-gic-muted">{t('msg.colonAmount')}</span> {formatMad(viewItem.amount)}</p>
            <p><span className="text-gic-muted">{t('msg.colonMotif')}</span> {officePurposeLabel(viewItem.purpose, t)}</p>
            <p>
              <span className="text-gic-muted">{t('msg.colonRecognized')}</span>{' '}
              {viewItem.reconnu
                ? `${viewItem.reconnu.firstName} ${viewItem.reconnu.lastName}`
                : viewItem.reconnuName || '—'}
            </p>
            {viewItem.chantier && (
              <p><span className="text-gic-muted">{t('msg.colonChantier')}</span> {viewItem.chantier.name}</p>
            )}
            {viewItem.workLabel && (
              <p><span className="text-gic-muted">{t('msg.colonWork')}</span> {viewItem.workLabel}</p>
            )}
            <p><span className="text-gic-muted">{t('msg.colonRemark')}</span> {viewItem.remark || '—'}</p>
            {viewItem.proofFile && (
              <p>
                <a href={viewItem.proofFile} target="_blank" rel="noreferrer" className="text-[#007aff]">
                  {t('fields.viewDownload')}
                </a>
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleteId}
        title={t('actions.deleteMovement')}
        onClose={() => setDeleteId(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
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
