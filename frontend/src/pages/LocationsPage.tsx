import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Eye, Download, Printer, Ban, Wallet, Home, Key, TrendingUp,
  SlidersHorizontal, Check, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, downloadPdf, fetchClientList, fetchPropertyList, formatMad, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { RentalFormFields, emptyRentalForm, rentalToForm, rentalFormToBody, type RentalFormData } from '../components/RentalFormFields';
import { printRentalReceipt } from '../lib/printRental';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';

type Rental = {
  id: string;
  reference: string;
  status: string;
  monthlyRent: number;
  totalPaid: number;
  remaining: number;
  client: { id: string; firstName: string; lastName: string; reference: string };
  property: { id: string; name: string; reference: string };
};

type Stats = { total: number; actives: number; terminees: number; encaisse: number; reste: number; mensualites: number };

const PAGE_SIZE = 20;

type SortOrder = 'asc' | 'desc';

function defaultOrderForSort(sort: string): SortOrder {
  return sort === 'createdAt' ? 'desc' : 'asc';
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

export default function LocationsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Rental[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, actives: 0, terminees: 0, encaisse: 0, reste: 0, mensualites: 0 });
  const [clients, setClients] = useState<{ id: string; reference: string; firstName: string; lastName: string }[]>([]);
  const [properties, setProperties] = useState<{ id: string; reference: string; name: string; status: string }[]>([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [terminateId, setTerminateId] = useState<string | null>(null);
  const [terminateMotif, setTerminateMotif] = useState('');
  const [form, setForm] = useState<RentalFormData>(emptyRentalForm());
  const [payForm, setPayForm] = useState({ amount: '', operationType: 'especes', payerName: '', bank: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildExportQuery() {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (statusFilter) qs.set('status', statusFilter);
    if (clientFilter) qs.set('clientId', clientFilter);
    return qs.toString();
  }

  function load(pageNum = page, overrides?: { status?: string; clientId?: string }) {
    setLoading(true);
    setError('');
    const status = overrides?.status ?? statusFilter;
    const clientId = overrides?.clientId ?? clientFilter;
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (status) qs.set('status', status);
    if (clientId) qs.set('clientId', clientId);
    qs.set('sort', sort);
    qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    Promise.all([
      api<PaginatedResponse<Rental>>(`/transactions/rentals?${qs}`),
      api<Stats>('/transactions/rentals/stats'),
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
    fetchClientList<{ id: string; reference: string; firstName: string; lastName: string }>().then(setClients);
    fetchPropertyList<{ id: string; reference: string; name: string; status: string }>().then(setProperties);
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
    setForm(emptyRentalForm());
    setError('');
    setOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(r: Rental) {
    api(`/transactions/rentals/${r.id}`).then((full) => {
      setEditId(r.id);
      setForm(rentalToForm(full));
      setError('');
      setOpen(true);
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editId) {
        await api(`/transactions/rentals/${editId}`, {
          method: 'PUT',
          body: JSON.stringify(rentalFormToBody(form, true)),
        });
      } else {
        await api('/transactions/rentals', {
          method: 'POST',
          body: JSON.stringify(rentalFormToBody(form, false)),
        });
      }
      setOpen(false);
      load(page);
      fetchPropertyList<{ id: string; reference: string; name: string; status: string }>().then(setProperties);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payOpen) return;
    try {
      await api('/transactions/payments', {
        method: 'POST',
        body: JSON.stringify({ rentalId: payOpen, ...payForm }),
      });
      setPayOpen(null);
      setPayForm({ amount: '', operationType: 'especes', payerName: '', bank: '' });
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmTerminate() {
    if (!terminateId || !terminateMotif.trim()) return;
    try {
      await api(`/transactions/rentals/${terminateId}/terminate`, {
        method: 'POST',
        body: JSON.stringify({ motif: terminateMotif }),
      });
      setTerminateId(null);
      setTerminateMotif('');
      load(page);
      fetchPropertyList<{ id: string; reference: string; name: string; status: string }>().then(setProperties);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>${t('pages.rentals')} — GIC</title></head><body>
      <h1>${t('pages.rentals')} — GIC</h1>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.ref')}</th><th>${t('columns.tenant')}</th><th>${t('columns.property')}</th><th>${t('columns.monthly')}</th><th>${t('columns.paid')}</th><th>${t('columns.status')}</th></tr>
        ${items.map((r) => `<tr>
          <td>${r.reference}</td>
          <td>${r.client.firstName} ${r.client.lastName}</td>
          <td>${r.property.name}</td>
          <td>${r.monthlyRent}</td>
          <td>${r.totalPaid}</td>
          <td>${r.status}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const statusFilters = [
    { id: '', label: t('common.allFeminine') },
    { id: 'active', label: t('common.activeFemininePlural') },
    { id: 'suspendue', label: t('common.suspendedPlural') },
    { id: 'terminée', label: t('common.endedPlural') },
  ];

  const hasActiveFilters = !!statusFilter || !!clientFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.rentals')}
        subtitle={t('pages.rentalsSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/transactions/rentals/export/csv?${buildExportQuery()}`, 'locations-gic.csv')}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadExcel(`/transactions/rentals/export/xlsx?${buildExportQuery()}`, 'locations-gic.xlsx')}>{t('common.excel')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadPdf(`/transactions/rentals/export/pdf?${buildExportQuery()}`, 'locations-gic.pdf')}>PDF</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newRental')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('pages.rentals')} value={stats.total} icon={Key} tone="violet" />
        <KpiCard title={t('status.active')} value={stats.actives} icon={Home} tone="emerald" delta={t('msg.endedCount', { count: stats.terminees })} deltaTone="muted" />
        <KpiCard
          title={t('fields.collected')}
          value={formatMadCompact(stats.encaisse)}
          icon={Wallet}
          tone="coral"
          compact
          delta={stats.reste ? `Reste ${formatMadCompact(stats.reste)}` : undefined}
          deltaTone="muted"
        />
        <KpiCard
          title={t('kpi.activeMonthlyRents')}
          value={formatMadCompact(stats.mensualites)}
          icon={TrendingUp}
          tone="amber"
          compact
        />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchRefTenantProperty')}
            />
            <div className="flex items-center gap-1 shrink-0">
              <MacSelect
                value={sort}
                onChange={onSortChange}
                options={[
                  { value: 'createdAt', label: t('msg.dateCreated') },
                  { value: 'reference', label: t('fields.reference') },
                  { value: 'monthlyRent', label: t('columns.monthly') },
                ]}
                className="w-36"
              />
              <MacActionBtn
                icon={order === 'asc' ? ArrowUp : ArrowDown}
                tone="gray"
                title={order === 'asc' ? t('msg.ascending') : t('msg.descending')}
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
                  <p className="mac-filter-menu-section">{t('fields.tenant')}</p>
                  <button
                    type="button"
                    role="menuitem"
                    className={`mac-filter-menu-item${clientFilter === '' ? ' mac-filter-menu-item-active' : ''}`}
                    onClick={() => {
                      setClientFilter('');
                      setPage(1);
                      load(1, { clientId: '' });
                    }}
                  >
                    <span>Tous</span>
                    {clientFilter === '' && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                  </button>
                  {clients.slice(0, 40).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${clientFilter === c.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setClientFilter(c.id);
                        setPage(1);
                        load(1, { clientId: c.id });
                      }}
                    >
                      <span className="truncate">{c.reference} — {c.lastName}</span>
                      {clientFilter === c.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
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
                          setClientFilter('');
                          setPage(1);
                          load(1, { status: '', clientId: '' });
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
          <EmptyState title={t('msg.emptyRentals')} action={<Btn icon={Plus} onClick={openCreate}>{t('actions.newRental')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.ref')}</Th>
                <Th mac>{t('columns.tenant')}</Th>
                <Th mac>{t('columns.property')}</Th>
                <Th mac>{t('columns.monthly')}</Th>
                <Th mac>{t('columns.paid')}</Th>
                <Th mac>{t('columns.remaining')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/locations/${r.id}`)}>
                  <Td mac>
                    <Link to={`/locations/${r.id}`} className="mac-table-ref">{r.reference}</Link>
                  </Td>
                  <Td mac>
                    <Link to={`/clients/${r.client.id}`} className="hover:text-[#007aff]">
                      {r.client.firstName} {r.client.lastName}
                    </Link>
                  </Td>
                  <Td mac className="mac-table-muted">
                    <Link to={`/biens/${r.property.id}`} className="hover:text-[#007aff]">{r.property.name}</Link>
                  </Td>
                  <Td mac>{formatMad(r.monthlyRent)}</Td>
                  <Td mac>{formatMad(r.totalPaid)}</Td>
                  <Td mac className={r.remaining > 0 ? 'text-gic-coral font-medium' : ''}>{formatMad(r.remaining)}</Td>
                  <Td mac>
                    <StatusPill status={r.status} quiet />
                  </Td>
                  <Td mac className="mac-td-actions">
                    <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                      <Link to={`/locations/${r.id}`} className="mac-action-btn mac-action-btn-blue" title={t('actions.ficheDetail')}>
                        <Eye size={14} strokeWidth={2.15} />
                      </Link>
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(r)} />
                      {r.status === 'active' && (
                        <MacActionBtn icon={Wallet} tone="green" title={t('actions.payment')} onClick={() => setPayOpen(r.id)} />
                      )}
                      <MacActionBtn
                        icon={Printer}
                        tone="gray"
                        title={t('common.print')}
                        onClick={() => api(`/transactions/rentals/${r.id}`).then(printRentalReceipt)}
                      />
                      {r.status === 'active' && (
                        <MacActionBtn
                          icon={Ban}
                          tone="red"
                          title={t('actions.resiliate')}
                          onClick={() => { setTerminateId(r.id); setTerminateMotif(''); }}
                        />
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

      <Modal
        open={open}
        size="lg"
        title={editId ? t('actions.editRental') : t('actions.newRental')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="rental-form" type="submit">{editId ? t('common.save') : t('common.add')}</Btn>
          </>
        }
      >
        <form id="rental-form" onSubmit={save}>
          <RentalFormFields form={form} setForm={setForm} clients={clients} properties={properties} editMode={!!editId} />
          {error && <p className="mt-3 text-[11px] text-gic-coral">{error}</p>}
        </form>
      </Modal>

      <Modal
        open={!!payOpen}
        title={t('actions.paymentRental')}
        onClose={() => setPayOpen(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPayOpen(null)}>{t('common.cancel')}</Btn>
            <Btn form="rental-pay-form" type="submit">{t('common.validate')}</Btn>
          </>
        }
      >
        <form id="rental-pay-form" onSubmit={addPayment} className="grid gap-3">
          <Input label={t('fields.amountMadRequired')} required type="number" min="0" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
          <Select label={t('fields.mode')} value={payForm.operationType} onChange={(e) => setPayForm({ ...payForm, operationType: e.target.value })}>
            <option value="especes">{t('fields.modeCash')}</option>
            <option value="virement">{t('fields.modeTransfer')}</option>
            <option value="cheque">{t('fields.modeCheck')}</option>
            <option value="carte">{t('fields.modeCard')}</option>
          </Select>
          <Input label={t('fields.payerNameShort')} value={payForm.payerName} onChange={(e) => setPayForm({ ...payForm, payerName: e.target.value })} />
          <Input label={t('fields.bankRef')} value={payForm.bank} onChange={(e) => setPayForm({ ...payForm, bank: e.target.value })} />
        </form>
      </Modal>

      <Modal
        open={!!terminateId}
        title={t('actions.resiliateLease')}
        onClose={() => setTerminateId(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setTerminateId(null)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmTerminate} disabled={!terminateMotif.trim()}>{t('actions.resiliate')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.rentalTerminateHint')}</p>
        <textarea
          className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]"
          placeholder={t('msg.motifPlaceholder')}
          value={terminateMotif}
          onChange={(e) => setTerminateMotif(e.target.value)}
        />
      </Modal>
    </div>
  );
}
