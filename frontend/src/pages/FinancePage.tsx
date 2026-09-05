import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Download, Eye, Printer, Paperclip, Plus, Pencil, Trash2,
  Wallet, TrendingDown, TrendingUp, FileCheck, SlidersHorizontal, Check, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api, downloadCsv, downloadExcel, formatMad, uploadForm, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, Input, KpiCard, MacActionBtn, MacDateInput, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, Select, TableWrap, Td, Th,
} from '../components/ui';
import { printMovementList, printMovementReceipt } from '../lib/printMovement';
import {
  CashMovementFormFields, emptyCashMovementForm, movementToForm, accountLabel,
  type CashMovementFormData, type CashAccountOption,
} from '../components/CashMovementFormFields';
import { FilePieceLinks } from '../lib/documentDisplay';
import { appAlert, appConfirm } from '../lib/dialog';
import { useI18n } from '../i18n/I18nContext';

type Movement = {
  id: string;
  date: string;
  designation: string;
  mode: string;
  debit: number;
  credit: number;
  remark?: string;
  proofFile?: string;
  invoiceFile?: string;
  deliveryNoteFile?: string;
  receptionPvFile?: string;
  accountId: string;
  account: CashAccountOption;
  sourceType?: string | null;
  isAutomatic?: boolean;
};

type UserOption = { id: string; firstName: string; lastName: string; email: string };

const SOURCE_LABEL_KEYS: Record<string, string> = {
  encaissement: 'msg.sourceReceipt',
  achat: 'msg.sourcePurchase',
  main_oeuvre: 'msg.sourceWorkforce',
  equipe_interne: 'msg.sourceInternalTeam',
  manuel: 'msg.sourceManual',
};

type Stats = { total: number; withProof: number; accounts: number; debit: number; credit: number; solde: number };
type MovementListResponse = PaginatedResponse<Movement> & { totals: { debit: number; credit: number; solde: number } };

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

type FilterOverrides = Partial<{
  q: string;
  type: string;
  accountId: string;
  mode: string;
  holderUserId: string;
  dateFrom: string;
  dateTo: string;
  sort: string;
  order: SortOrder;
}>;

type AccountForm = {
  name: string;
  type: string;
  holderUserId: string;
  rib: string;
  bankName: string;
};

function emptyAccountForm(): AccountForm {
  return { name: '', type: 'caisse', holderUserId: '', rib: '', bankName: '' };
}

export default function FinancePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Movement[]>([]);
  const [totals, setTotals] = useState({ debit: 0, credit: 0, solde: 0 });
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, withProof: 0, accounts: 0, debit: 0, credit: 0, solde: 0 });
  const [accounts, setAccounts] = useState<CashAccountOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [accountFilter, setAccountFilter] = useState(searchParams.get('accountId') || '');
  const [holderFilter, setHolderFilter] = useState(searchParams.get('holderUserId') || '');
  const [modeFilter, setModeFilter] = useState(searchParams.get('mode') || '');
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'date');
  const [order, setOrder] = useState<SortOrder>(
    (searchParams.get('order') as SortOrder) || defaultOrderForSort(searchParams.get('sort') || 'date'),
  );
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CashMovementFormData>(emptyCashMovementForm());
  const [formError, setFormError] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountEditId, setAccountEditId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccountForm());
  const [accountError, setAccountError] = useState('');

  function buildStatsQuery(overrides?: FilterOverrides) {
    const qs = new URLSearchParams();
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const type = overrides?.type !== undefined ? overrides.type : typeFilter;
    const accountId = overrides?.accountId !== undefined ? overrides.accountId : accountFilter;
    const holderUserId = overrides?.holderUserId !== undefined ? overrides.holderUserId : holderFilter;
    const mode = overrides?.mode !== undefined ? overrides.mode : modeFilter;
    const from = overrides?.dateFrom !== undefined ? overrides.dateFrom : dateFrom;
    const to = overrides?.dateTo !== undefined ? overrides.dateTo : dateTo;
    if (qVal) qs.set('q', qVal);
    if (accountId) qs.set('accountId', accountId);
    if (holderUserId) qs.set('holderUserId', holderUserId);
    if (mode) qs.set('mode', mode);
    if (type) qs.set('type', type);
    if (from) qs.set('dateFrom', from);
    if (to) qs.set('dateTo', to);
    return qs.toString();
  }

  function buildListQuery(pageNum = page, overrides?: FilterOverrides) {
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const type = overrides?.type !== undefined ? overrides.type : typeFilter;
    const accountId = overrides?.accountId !== undefined ? overrides.accountId : accountFilter;
    const holderUserId = overrides?.holderUserId !== undefined ? overrides.holderUserId : holderFilter;
    const mode = overrides?.mode !== undefined ? overrides.mode : modeFilter;
    const from = overrides?.dateFrom !== undefined ? overrides.dateFrom : dateFrom;
    const to = overrides?.dateTo !== undefined ? overrides.dateTo : dateTo;
    const sortVal = overrides?.sort !== undefined ? overrides.sort : sort;
    const orderVal = overrides?.order !== undefined ? overrides.order : order;
    const qs = new URLSearchParams();
    if (qVal) qs.set('q', qVal);
    if (accountId) qs.set('accountId', accountId);
    if (holderUserId) qs.set('holderUserId', holderUserId);
    if (mode) qs.set('mode', mode);
    if (type) qs.set('type', type);
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
    if (q) qs.set('q', q);
    if (accountFilter) qs.set('accountId', accountFilter);
    if (holderFilter) qs.set('holderUserId', holderFilter);
    if (modeFilter) qs.set('mode', modeFilter);
    if (typeFilter) qs.set('type', typeFilter);
    if (dateFrom) qs.set('dateFrom', dateFrom);
    if (dateTo) qs.set('dateTo', dateTo);
    if (sort !== 'date') qs.set('sort', sort);
    if (order !== defaultOrderForSort(sort)) qs.set('order', order);
    if (pageNum > 1) qs.set('page', String(pageNum));
    setSearchParams(qs, { replace: true });
  }

  function loadAccounts() {
    api<CashAccountOption[]>('/finance/accounts').then(setAccounts).catch(() => {});
  }

  function load(pageNum = page, overrides?: FilterOverrides) {
    setLoading(true);
    setError('');
    const statsQs = buildStatsQuery({
      q: overrides?.q,
      type: overrides?.type,
      accountId: overrides?.accountId,
      holderUserId: overrides?.holderUserId,
      mode: overrides?.mode,
      dateFrom: overrides?.dateFrom,
      dateTo: overrides?.dateTo,
    });
    Promise.all([
      api<MovementListResponse>(`/finance/movements?${buildListQuery(pageNum, overrides)}`),
      api<Stats>(`/finance/movements/stats?${statsQs}`),
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
  }, []);

  useEffect(() => {
    loadAccounts();
    api<PaginatedResponse<UserOption>>('/auth/users?limit=100&sort=lastName&order=asc&active=true')
      .then((r) => setUsers(r.items))
      .catch(() => setUsers([]));
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

  const typeFilters = [
    { id: '', label: t('common.all') },
    { id: 'debit', label: t('common.debits') },
    { id: 'credit', label: t('common.credits') },
  ];

  const hasActiveFilters = !!typeFilter || !!modeFilter || !!accountFilter || !!holderFilter || !!dateFrom || !!dateTo || !!q;

  function openCreate() {
    setEditId(null);
    setForm(emptyCashMovementForm());
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(m: Movement) {
    if (m.isAutomatic) return;
    setEditId(m.id);
    setForm(movementToForm(m));
    setFormError('');
    setFormOpen(true);
  }

  function openAccountCreate() {
    setAccountEditId(null);
    setAccountForm(emptyAccountForm());
    setAccountError('');
    setAccountOpen(true);
  }

  function openAccountEdit(a: CashAccountOption) {
    setAccountEditId(a.id);
    setAccountForm({
      name: a.name,
      type: a.type || 'caisse',
      holderUserId: a.holderUser?.id || '',
      rib: a.rib || '',
      bankName: a.bankName || '',
    });
    setAccountError('');
    setAccountOpen(true);
  }

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault();
    setAccountError('');
    if (!accountForm.name.trim()) {
      setAccountError('Nom obligatoire.');
      return;
    }
    try {
      const body = {
        name: accountForm.name.trim(),
        type: accountForm.type,
        holderUserId: accountForm.holderUserId || null,
        rib: accountForm.rib || null,
        bankName: accountForm.bankName || null,
      };
      if (accountEditId) {
        await api(`/finance/accounts/${accountEditId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/finance/accounts', { method: 'POST', body: JSON.stringify(body) });
      }
      setAccountOpen(false);
      loadAccounts();
      load(page);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function saveMovement(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.designation.trim() || !form.accountId) {
      setFormError(t('msg.designationAccountRequired'));
      return;
    }
    if (!form.debit && !form.credit) {
      setFormError(t('msg.debitOrCreditRequired'));
      return;
    }
    try {
      const fd = new FormData();
      fd.append('designation', form.designation);
      fd.append('accountId', form.accountId);
      fd.append('mode', form.mode);
      fd.append('debit', form.debit || '0');
      fd.append('credit', form.credit || '0');
      if (form.remark) fd.append('remark', form.remark);
      if (form.date) fd.append('date', form.date);
      if (form.invoiceFileObj) fd.append('invoice', form.invoiceFileObj);
      if (form.deliveryNoteFileObj) fd.append('deliveryNote', form.deliveryNoteFileObj);
      if (form.receptionPvFileObj) fd.append('receptionPv', form.receptionPvFileObj);
      if (form.proofFileObj) fd.append('proof', form.proofFileObj);
      if (editId) {
        await uploadForm(`/finance/movements/${editId}`, fd, 'PUT');
      } else {
        await uploadForm('/finance/movements', fd, 'POST');
      }
      setFormOpen(false);
      load(page);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function deleteMovement(m: Movement) {
    if (m.isAutomatic) return;
    if (!await appConfirm(t('msg.deleteMovementConfirm', { name: m.designation }))) return;
    try {
      await api(`/finance/movements/${m.id}`, { method: 'DELETE' });
      load(page);
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function piecesCell(m: Movement) {
    const pieces = [
      { path: m.invoiceFile, label: t('common.facture') },
      { path: m.deliveryNoteFile, label: t('common.bl') },
      { path: m.receptionPvFile, label: t('common.pv') },
      { path: m.proofFile, label: t('common.pieceShort') },
    ].filter((p) => p.path);
    if (pieces.length === 0) return <span className="mac-table-muted">—</span>;
    return (
      <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
        {pieces.map((p) => (
          <FilePieceLinks key={p.label} path={p.path} label={p.label} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.balance')}
        subtitle={t('pages.financeSubtitle')}
        actions={
          <>
            <Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>
            <Btn variant="secondary" icon={Wallet} onClick={openAccountCreate}>{t('fields.account')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/finance/movements/export/csv?${buildStatsQuery()}`, 'balance-gic.csv')}>{t('common.csv')}</Btn>
            <Btn variant="secondary" icon={Download} onClick={() => downloadExcel(`/finance/movements/export/xlsx?${buildStatsQuery()}`, 'balance-gic.xlsx')}>{t('common.excel')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={() => printMovementList(items, totals)} />
            </div>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('columns.movements')} value={stats.total} icon={Wallet} tone="violet" />
        <KpiCard
          title={t('kpi.withProof')}
          value={stats.withProof}
          icon={FileCheck}
          tone="emerald"
          delta={t('msg.withoutProof', { count: stats.total - stats.withProof })}
          deltaTone="muted"
        />
        <KpiCard title={t('columns.debit')} value={formatMadCompact(stats.debit)} icon={TrendingDown} tone="coral" compact />
        <KpiCard
          title={t('kpi.solde')}
          value={formatMadCompact(stats.solde)}
          icon={TrendingUp}
          tone="amber"
          compact
          delta={t('msg.creditPrefix', { amount: formatMadCompact(stats.credit) })}
          deltaTone="muted"
        />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="mac-mini-stat">
          <p className="mac-mini-stat-label">{t('msg.debitFilter')}</p>
          <p className="mac-mini-stat-value text-[#d70015]">{formatMadCompact(totals.debit)}</p>
        </div>
        <div className="mac-mini-stat">
          <p className="mac-mini-stat-label">{t('msg.creditFilter')}</p>
          <p className="mac-mini-stat-value text-[#248a3d]">{formatMadCompact(totals.credit)}</p>
        </div>
        <div className="mac-mini-stat">
          <p className="mac-mini-stat-label">Solde (filtre)</p>
          <p className="mac-mini-stat-value">{formatMadCompact(totals.solde)}</p>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              className="text-[11px] px-2.5 py-1 rounded-lg border border-gic-border bg-white hover:bg-gic-soft text-left"
              onClick={() => openAccountEdit(a)}
              title={t('actions.editCashAccount')}
            >
              <span className="font-medium">{a.name}</span>
              {a.holderUser && (
                <span className="text-gic-muted"> · {a.holderUser.firstName} {a.holderUser.lastName}</span>
              )}
              {a.rib && <span className="text-gic-muted"> · RIB {a.rib}</span>}
            </button>
          ))}
        </div>
      )}

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchDesignationRemark')}
            />
            <MacSelect
              value={accountFilter}
              onChange={(v) => {
                setAccountFilter(v);
                setPage(1);
                load(1, { accountId: v });
              }}
              options={[
                { value: '', label: t('common.allAccounts') },
                ...accounts.map((a) => ({ value: a.id, label: accountLabel(a) })),
              ]}
              className="w-48 shrink-0"
            />
            <MacSelect
              value={holderFilter}
              onChange={(v) => {
                setHolderFilter(v);
                setPage(1);
                load(1, { holderUserId: v });
              }}
              options={[
                { value: '', label: t('common.allHolders') },
                ...users.map((u) => ({
                  value: u.id,
                  label: `${u.firstName} ${u.lastName}`,
                })),
              ]}
              className="w-44 shrink-0"
            />
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
                { value: 'date', label: t('common.date') },
                { value: 'designation', label: t('fields.designation') },
                { value: 'debit', label: t('fields.debit') },
                { value: 'credit', label: t('fields.credit') },
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
            <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('fields.from')} className="w-36 shrink-0" />
            <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('fields.to')} className="w-36 shrink-0" />
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
                  {[
                    { id: '', label: t('common.allModes') },
                    { id: 'especes', label: t('fields.modeCash') },
                    { id: 'virement', label: t('fields.modeTransfer') },
                    { id: 'cheque', label: t('fields.modeCheck') },
                    { id: 'carte', label: t('common.cardShort') },
                  ].map((f) => (
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
                          setAccountFilter('');
                          setHolderFilter('');
                          setDateFrom('');
                          setDateTo('');
                          setQ('');
                          setPage(1);
                          load(1, { q: '', type: '', accountId: '', holderUserId: '', mode: '', dateFrom: '', dateTo: '' });
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
          <EmptyState title={t('msg.emptyFinance')} subtitle={t('pages.financeEmptyHint')} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.date')}</Th>
                <Th mac>{t('columns.source')}</Th>
                <Th mac>{t('columns.designation')}</Th>
                <Th mac>{t('columns.account')}</Th>
                <Th mac>{t('columns.mode')}</Th>
                <Th mac>{t('columns.debit')}</Th>
                <Th mac>{t('columns.credit')}</Th>
                <Th mac>{t('columns.pieces')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr
                  key={m.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/balance/${m.id}`)}
                >
                  <Td mac className="mac-table-muted">
                    {new Date(m.date).toLocaleDateString('fr-MA')}
                  </Td>
                  <Td mac>
                    {m.sourceType ? (
                      <span className="mac-chip mac-chip-blue text-[10px]">{SOURCE_LABEL_KEYS[m.sourceType] ? t(SOURCE_LABEL_KEYS[m.sourceType]) : m.sourceType}</span>
                    ) : (
                      <span className="mac-table-muted">—</span>
                    )}
                  </Td>
                  <Td mac>
                    <Link to={`/balance/${m.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{m.designation}</Link>
                    {(m.proofFile || m.invoiceFile || m.deliveryNoteFile || m.receptionPvFile) && (
                      <Paperclip size={12} className="inline ml-1 text-gic-muted" />
                    )}
                  </Td>
                  <Td mac className="mac-table-muted">
                    <div>{m.account?.name}</div>
                    {m.account?.holderUser && (
                      <div className="text-[10px] text-gic-muted">
                        {m.account.holderUser.firstName} {m.account.holderUser.lastName}
                        {m.account.rib ? ` · ${m.account.rib}` : ''}
                      </div>
                    )}
                  </Td>
                  <Td mac className="capitalize mac-table-muted">{m.mode || '—'}</Td>
                  <Td mac className="text-gic-coral">
                    {Number(m.debit) ? formatMad(Number(m.debit)) : '—'}
                  </Td>
                  <Td mac className="text-gic-emerald">
                    {Number(m.credit) ? formatMad(Number(m.credit)) : '—'}
                  </Td>
                  <Td mac>{piecesCell(m)}</Td>
                  <Td mac className="mac-td-actions">
                    <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                      <MacActionBtn icon={Eye} tone="blue" title={t('actions.detailShort')} onClick={() => navigate(`/balance/${m.id}`)} />
                      <MacActionBtn
                        icon={Printer}
                        tone="gray"
                        title={t('common.print')}
                        onClick={() => api(`/finance/movements/${m.id}`).then(printMovementReceipt)}
                      />
                      {!m.isAutomatic && (
                        <>
                          <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(m)} />
                          <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => deleteMovement(m)} />
                        </>
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
        open={formOpen}
        title={editId ? t('actions.editMovement') : t('actions.manualMovement')}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setFormOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="cash-movement-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="cash-movement-form" onSubmit={saveMovement} className="space-y-3">
          <CashMovementFormFields form={form} setForm={setForm} accounts={accounts} />
          {formError && <p className="text-[11px] text-gic-coral">{formError}</p>}
        </form>
      </Modal>

      <Modal
        open={accountOpen}
        title={accountEditId ? t('actions.editCashAccount') : t('actions.newCashAccount')}
        onClose={() => setAccountOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setAccountOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="cash-account-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="cash-account-form" onSubmit={saveAccount} className="grid gap-3 sm:grid-cols-2">
          <Input className="sm:col-span-2" label={t('fields.nameRequired')} required value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} />
          <Select label={t('common.type')} value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}>
            <option value="caisse">{t('nav.cash')}</option>
            <option value="banque">{t('fields.bank')}</option>
            <option value="autre">{t('common.other')}</option>
          </Select>
          <Select label={t('fields.accountHolder')} value={accountForm.holderUserId} onChange={(e) => setAccountForm({ ...accountForm, holderUserId: e.target.value })}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>
            ))}
          </Select>
          <Input label={t('fields.rib')} value={accountForm.rib} onChange={(e) => setAccountForm({ ...accountForm, rib: e.target.value })} />
          <Input label={t('fields.bankName')} value={accountForm.bankName} onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })} />
          {accountError && <p className="sm:col-span-2 text-[11px] text-gic-coral">{accountError}</p>}
        </form>
      </Modal>
    </div>
  );
}
