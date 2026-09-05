import { appAlert } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, Eye, Users, UserCheck, Phone, Printer,
  SlidersHorizontal, Check, Wallet,
} from 'lucide-react';
import { api, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { ReconnuFormFields, emptyReconnuForm, reconnuToForm, type ReconnuFormData } from '../components/ReconnuFormFields';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';

type Reconnu = {
  id: string;
  reference?: string;
  firstName: string;
  lastName: string;
  phone1?: string;
  relation?: string;
  isActive?: boolean;
  _count?: { movements: number };
};

type Stats = { total: number; active: number; withPhone: number; withMovements: number };

const PAGE_SIZE = 20;

export default function ReconnusPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Reconnu[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, withPhone: 0, withMovements: 0 });
  const [q, setQ] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [sort, setSort] = useState('lastName');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<ReconnuFormData>(emptyReconnuForm());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load(pageNum = page, overrides?: { active?: string }) {
    setLoading(true);
    setError('');
    const active = overrides?.active ?? activeFilter;
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (active) qs.set('active', active);
    qs.set('sort', sort);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));

    Promise.all([
      api<PaginatedResponse<Reconnu>>(`/reconnus?${qs}`),
      api<Stats>('/reconnus/stats'),
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
  }, [sort]);

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
    setForm(emptyReconnuForm());
    setError('');
    setOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(r: Reconnu) {
    api(`/reconnus/${r.id}`).then((full) => {
      setEditId(r.id);
      setForm(reconnuToForm(full));
      setError('');
      setOpen(true);
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const body = {
        ...form,
        phone1: form.phone1.trim() || null,
        phone2: form.phone2.trim() || null,
        address: form.address.trim() || null,
        relation: form.relation.trim() || null,
        remark: form.remark.trim() || null,
      };
      if (editId) {
        await api(`/reconnus/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/reconnus', { method: 'POST', body: JSON.stringify(body) });
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
      await api(`/reconnus/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
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
    w.document.write(`<html><head><title>${t('pages.reconnus')} — GIC</title></head><body>
      <h1>${t('pages.reconnus')} — GIC</h1>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.ref')}</th><th>${t('columns.name')}</th><th>${t('columns.relation')}</th><th>${t('columns.phoneFull')}</th><th>${t('columns.movements')}</th><th>${t('columns.status')}</th></tr>
        ${items.map((r) => `<tr>
          <td>${r.reference || '—'}</td>
          <td>${r.firstName} ${r.lastName}</td>
          <td>${r.relation || '—'}</td>
          <td>${r.phone1 || '—'}</td>
          <td>${r._count?.movements ?? 0}</td>
          <td>${r.isActive === false ? 'Inactif' : 'Actif'}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const activeFilters = [
    { id: '', label: t('common.allStatuses') },
    { id: 'true', label: t('kpi.active') },
    { id: 'false', label: t('common.inactivePlural') },
  ];

  const hasActiveFilters = !!activeFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.reconnus')}
        subtitle={t('pages.reconnusSubtitle')}
        actions={
          <>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newRecognized')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('pages.reconnus')} value={stats.total} icon={Users} tone="violet" delta={`${stats.active} actifs`} deltaTone="muted" />
        <KpiCard title={t('kpi.active')} value={stats.active} icon={UserCheck} tone="emerald" />
        <KpiCard title={t('columns.phoneFull')} value={stats.withPhone} icon={Phone} tone="amber" />
        <KpiCard title={t('kpi.withMovements')} value={stats.withMovements} icon={Wallet} tone="coral" />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchNameRefPhone')}
            />
            <MacSelect
              value={sort}
              onChange={(v) => setSort(v)}
              options={[
                { value: 'lastName', label: t('common.name') },
                { value: 'reference', label: t('fields.reference') },
                { value: 'createdAt', label: t('msg.creationSort') },
              ]}
              className="w-36 shrink-0"
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
                </div>
              )}
            </div>
            <Btn variant="secondary" onClick={() => { setPage(1); load(1); }}>{t('common.filter')}</Btn>
          </div>
        </div>
      </div>

      {error && !open && (
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
            title={t('msg.emptyRecognized')}
            action={<Btn icon={Plus} onClick={openCreate}>{t('actions.newRecognized')}</Btn>}
          />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.ref')}</Th>
                <Th mac>{t('columns.name')}</Th>
                <Th mac>{t('columns.relation')}</Th>
                <Th mac>{t('columns.phoneFull')}</Th>
                <Th mac>{t('columns.movements')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/reconnus/${r.id}`)}>
                  <Td mac className="mac-table-muted">{r.reference || '—'}</Td>
                  <Td mac>
                    <Link to={`/reconnus/${r.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>
                      {r.firstName} {r.lastName}
                    </Link>
                  </Td>
                  <Td mac className="mac-table-muted">{r.relation || '—'}</Td>
                  <Td mac className="mac-table-muted">{r.phone1 || '—'}</Td>
                  <Td mac>
                    <span className="mac-chip mac-chip-blue">{r._count?.movements ?? 0}</span>
                  </Td>
                  <Td mac>
                    <StatusPill status={r.isActive === false ? 'inactif' : 'actif'} quiet />
                  </Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <Link to={`/reconnus/${r.id}`} className="mac-action-btn mac-action-btn-blue" title={t('actions.ficheRecognized')}>
                        <Eye size={14} strokeWidth={2.15} />
                      </Link>
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(r)} />
                      <MacActionBtn
                        icon={Trash2}
                        tone="red"
                        title={t('common.delete')}
                        onClick={() => { setDeleteId(r.id); setDeleteMotif(''); }}
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
        title={editId ? t('common.edit') : t('actions.newRecognized')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="reconnu-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="reconnu-form" onSubmit={save}>
          <ReconnuFormFields form={form} setForm={setForm} />
          {error && <p className="mt-3 text-[11px] text-gic-coral">{error}</p>}
        </form>
      </Modal>

      <Modal
        open={!!deleteId}
        title={t('actions.deleteRecognized')}
        onClose={() => setDeleteId(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">
          Un reconnu lié à des mouvements de caisse ne peut pas être supprimé.
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
