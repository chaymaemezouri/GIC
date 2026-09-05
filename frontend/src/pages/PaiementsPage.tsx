import { appAlert } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Download, Printer, CreditCard, TrendingUp, Wallet, FileText, Eye, Plus, Pencil, Trash2,
  SlidersHorizontal, Check, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, downloadPdf, formatDate, formatMad, uploadForm, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, TableWrap, Td, Th,
} from '../components/ui';
import {
  PaymentFormFields, emptyPaymentForm, paymentToForm, paymentFormToCreateBody, paymentFormToUpdateBody,
  paymentFormToFormData, type PaymentFormData,
} from '../components/PaymentFormFields';
import { printPaymentReceipt } from '../lib/printPayment';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';

type Payment = {
  id: string;
  receiptNo: string;
  date: string;
  amount: number;
  nature?: string;
  operationType?: string;
  payerName?: string;
  proofFile?: string | null;
  sale?: { id: string; reference: string; client?: { id: string; firstName: string; lastName: string } } | null;
  rental?: { id: string; reference: string; client?: { id: string; firstName: string; lastName: string } } | null;
};

type Stats = { total: number; ventes: number; locations: number; montantTotal: number };
type ListResponse = PaginatedResponse<Payment> & { montantTotal: number };

const PAGE_SIZE = 20;

type SortOrder = 'asc' | 'desc';

function defaultOrderForSort(sort: string): SortOrder {
  return sort === 'date' ? 'desc' : 'asc';
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

export default function PaiementsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Payment[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [montantTotal, setMontantTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, ventes: 0, locations: 0, montantTotal: 0 });
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('date');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<PaymentFormData>(emptyPaymentForm());
  const [formError, setFormError] = useState('');
  const [sales, setSales] = useState<{ id: string; reference: string; remaining: number; client?: { firstName: string; lastName: string } }[]>([]);
  const [rentals, setRentals] = useState<{ id: string; reference: string; remaining: number; client?: { firstName: string; lastName: string } }[]>([]);

  function buildQuery(pageNum = page, overrides?: { type?: string; mode?: string }) {
    const qs = new URLSearchParams();
    const type = overrides?.type ?? typeFilter;
    const mode = overrides?.mode ?? modeFilter;
    if (q) qs.set('q', q);
    if (type) qs.set('type', type);
    if (mode) qs.set('mode', mode);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    qs.set('sort', sort);
    qs.set('order', order);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function load(pageNum = page, overrides?: { type?: string; mode?: string }) {
    setLoading(true);
    setError('');
    const type = overrides?.type ?? typeFilter;
    const mode = overrides?.mode ?? modeFilter;
    Promise.all([
      api<ListResponse>(`/transactions/payments?${buildQuery(pageNum, { type, mode })}`),
      api<Stats>(`/transactions/payments/stats${dateFrom || dateTo ? `?${new URLSearchParams({ ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}) }).toString()}` : ''}`),
    ])
      .then(([res, st]) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        setMontantTotal(res.montantTotal);
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
    type SaleOpt = { id: string; reference: string; remaining: number; client?: { firstName: string; lastName: string } };
    type RentalOpt = SaleOpt;
    api<PaginatedResponse<SaleOpt>>('/transactions/sales?limit=200&sort=reference&order=asc')
      .then((r) => setSales(r.items || []))
      .catch(() => setSales([]));
    api<PaginatedResponse<RentalOpt>>('/transactions/rentals?limit=200&status=active&sort=reference&order=asc')
      .then((r) => setRentals(r.items || []))
      .catch(() => setRentals([]));
  }, []);

  function openCreate() {
    setEditId(null);
    setForm(emptyPaymentForm());
    setFormError('');
    setFormOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(p: Payment) {
    api(`/transactions/payments/${p.id}`).then((full) => {
      setEditId(p.id);
      setForm(paymentToForm(full));
      setFormError('');
      setFormOpen(true);
    });
  }

  async function savePayment(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!editId) {
      if (form.txType === 'vente' && !form.saleId) {
        setFormError(t('msg.selectSale'));
        return;
      }
      if (form.txType === 'location' && !form.rentalId) {
        setFormError(t('msg.selectRental'));
        return;
      }
    }
    try {
      if (editId) {
        if (form.proofFileObj) {
          await uploadForm(`/transactions/payments/${editId}`, paymentFormToFormData(form, true), 'PUT');
        } else {
          await api(`/transactions/payments/${editId}`, {
            method: 'PUT',
            body: JSON.stringify(paymentFormToUpdateBody(form)),
          });
        }
      } else if (form.proofFileObj) {
        await uploadForm('/transactions/payments', paymentFormToFormData(form, false));
      } else {
        await api('/transactions/payments', {
          method: 'POST',
          body: JSON.stringify(paymentFormToCreateBody(form)),
        });
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
      await api(`/transactions/payments/${deleteId}`, {
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

  function onSortChange(nextSort: string) {
    setSort(nextSort);
    setOrder(defaultOrderForSort(nextSort));
  }

  function toggleOrder() {
    setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Paiements GIC</title><style>body{font-family:sans-serif;padding:24px;font-size:12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px}</style></head><body>
      <h1>Paiements GIC</h1><table><tr><th>Date</th><th>Reçu</th><th>Type</th><th>Client</th><th>Montant</th><th>Mode</th></tr>
      ${items.map((p) => {
        const isSale = !!p.sale;
        const client = isSale ? p.sale?.client : p.rental?.client;
        return `<tr><td>${formatDate(p.date)}</td><td>${p.receiptNo}</td><td>${isSale ? 'Vente' : 'Location'}</td><td>${client ? `${client.firstName} ${client.lastName}` : ''}</td><td>${p.amount}</td><td>${p.operationType || ''}</td></tr>`;
      }).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const typeFilters = [
    { id: '', label: t('common.all') },
    { id: 'vente', label: t('fields.salesPlural') },
    { id: 'location', label: t('fields.rentalsPlural') },
  ];

  const modeFilters = [
    { id: '', label: t('common.all') },
    { id: 'especes', label: t('fields.modeCash') },
    { id: 'virement', label: t('fields.modeTransfer') },
    { id: 'cheque', label: t('fields.modeCheck') },
    { id: 'carte', label: t('fields.modeCard') },
  ];

  const hasActiveFilters = !!typeFilter || !!modeFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.receipts')}
        subtitle={t('pages.receiptsSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/transactions/payments/export/csv?${buildQuery()}`, 'paiements-gic.csv')}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadExcel(`/transactions/payments/export/xlsx?${buildQuery()}`, 'paiements-gic.xlsx')}>{t('common.excel')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadPdf(`/transactions/payments/export/pdf?${buildQuery()}`, 'paiements-gic.pdf')}>{t('common.pdf')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newPayment')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('pages.receipts')} value={stats.total} icon={CreditCard} tone="violet" />
        <KpiCard title={t('kpi.amountCollected')} value={formatMadCompact(stats.montantTotal)} icon={TrendingUp} tone="emerald" compact />
        <KpiCard title={t('pages.sales')} value={stats.ventes} icon={FileText} tone="amber" delta={t('kpi.rentalsCount', { count: stats.locations })} deltaTone="muted" />
        <KpiCard title={t('kpi.filteredPeriod')} value={dateFrom || dateTo ? formatMadCompact(montantTotal) : '—'} icon={Wallet} tone="coral" compact />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchReceiptClient')}
            />
            <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('msg.fromDate')} className="w-36 shrink-0" />
            <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('msg.toDate')} className="w-36 shrink-0" />
            <div className="flex items-center gap-1 shrink-0">
              <MacSelect
                value={sort}
                onChange={onSortChange}
                options={[
                  { value: 'date', label: t('fields.date') },
                  { value: 'amount', label: t('fields.amount') },
                  { value: 'receiptNo', label: t('fields.receiptNo') },
                ]}
                className="w-32"
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
                  <p className="mac-filter-menu-section">{t('common.type')}</p>
                  {typeFilters.map((f) => (
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
                  <p className="mac-filter-menu-section">{t('fields.mode')}</p>
                  {modeFilters.map((f) => (
                    <button
                      key={f.id || 'all-mode'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${modeFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setModeFilter(f.id);
                        setPage(1);
                        load(1, { mode: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {modeFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
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
                          setModeFilter('');
                          setPage(1);
                          load(1, { type: '', mode: '' });
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
        ) : items.length === 0 ? (
          <EmptyState title={t('msg.emptyPayments')} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.date')}</Th>
                <Th mac>{t('columns.receipt')}</Th>
                <Th mac>{t('columns.type')}</Th>
                <Th mac>{t('columns.transactionRef')}</Th>
                <Th mac>{t('columns.client')}</Th>
                <Th mac>{t('columns.amount')}</Th>
                <Th mac>{t('columns.mode')}</Th>
                <Th mac>{t('fields.payer')}</Th>
                <Th mac>{t('columns.nature')}</Th>
                <Th mac>{t('columns.piece')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const isSale = !!p.sale;
                const ref = isSale ? p.sale?.reference : p.rental?.reference;
                const client = isSale ? p.sale?.client : p.rental?.client;
                const txLink = isSale ? `/ventes/${p.sale?.id}` : `/locations/${p.rental?.id}`;
                return (
                  <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/encaissements/${p.id}`)}>
                    <Td mac>{formatDate(p.date)}</Td>
                    <Td mac className="font-medium text-gic-violet">{p.receiptNo}</Td>
                    <Td mac>
                      <span className={`mac-chip ${isSale ? 'mac-chip-blue' : 'mac-chip-orange'}`}>
                        {isSale ? t('fields.sale') : t('fields.rental')}
                      </span>
                    </Td>
                    <Td mac>
                      <Link to={txLink} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{ref}</Link>
                    </Td>
                    <Td mac className="mac-table-muted">
                      {client ? (
                        <Link to={`/clients/${client.id}`} className="hover:text-[#007aff]" onClick={(e) => e.stopPropagation()}>
                          {client.firstName} {client.lastName}
                        </Link>
                      ) : '—'}
                    </Td>
                    <Td mac className="font-medium">{formatMad(p.amount)}</Td>
                    <Td mac className="capitalize mac-table-muted">{p.operationType || '—'}</Td>
                    <Td mac className="mac-table-muted">{p.payerName || '—'}</Td>
                    <Td mac className="mac-table-muted">{p.nature || '—'}</Td>
                    <Td mac className="mac-table-muted" onClick={(e) => e.stopPropagation()}>
                      {p.proofFile ? (
                        <a href={p.proofFile} target="_blank" rel="noreferrer" className="text-[#007aff] hover:opacity-70">{t('common.view')}</a>
                      ) : '—'}
                    </Td>
                    <Td mac className="mac-td-actions">
                      <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                        <Link to={`/encaissements/${p.id}`} className="mac-action-btn mac-action-btn-blue" title={t('actions.viewPaymentSheet')}>
                          <Eye size={14} strokeWidth={2.15} />
                        </Link>
                        <MacActionBtn icon={Printer} tone="gray" title={t('actions.printReceipt')} onClick={() => printPaymentReceipt(p)} />
                        <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(p)} />
                        <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteId(p.id); setDeleteMotif(''); }} />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => { setPage(p); load(p); }} mac />
      </Card>

      <Modal
        open={formOpen}
        size="lg"
        title={editId ? t('common.edit') : t('actions.newPayment')}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setFormOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="payment-form" type="submit">{editId ? t('common.save') : t('actions.savePayment')}</Btn>
          </>
        }
      >
        <form id="payment-form" onSubmit={savePayment}>
          <PaymentFormFields
            form={form}
            setForm={setForm}
            sales={sales}
            rentals={rentals}
            editMode={!!editId}
          />
          {formError && <p className="mt-3 text-[11px] text-gic-coral">{formError}</p>}
        </form>
      </Modal>

      <Modal
        open={!!deleteId}
        title={t('actions.deletePayment')}
        onClose={() => setDeleteId(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">
          {t('msg.deletePaymentHint')}
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
