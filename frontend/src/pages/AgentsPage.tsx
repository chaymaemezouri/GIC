import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, Download, Upload, Eye, Users, UserCheck, Phone, Printer,
  SlidersHorizontal, Check, Mail,
} from 'lucide-react';
import { api, downloadCsv, uploadForm, type PaginatedResponse } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacSearch, MacSelect,
  Modal, PageHeader, Pagination, StatusPill, TableWrap, Td, Th,
} from '../components/ui';
import { AgentFormFields, emptyAgentForm, agentToForm, type AgentFormData } from '../components/AgentFormFields';
import MacAvatar from '../components/MacAvatar';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';

type Agent = {
  id: string;
  reference?: string;
  photo?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone1?: string;
  isActive?: boolean;
  _count?: { clients: number };
};

type Stats = { total: number; active: number; withEmail: number; withPhone: number; linked: number; unlinked: number };

const PAGE_SIZE = 20;

export default function AgentsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Agent[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, withEmail: 0, withPhone: 0, linked: 0, unlinked: 0 });
  const [q, setQ] = useState('');
  const [linkedFilter, setLinkedFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [sort, setSort] = useState('lastName');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'csv' | 'xlsx'>('csv');
  const [importCsv, setImportCsv] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [form, setForm] = useState<AgentFormData>(emptyAgentForm());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildQuery(pageNum = page) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (linkedFilter) qs.set('linked', linkedFilter);
    if (activeFilter) qs.set('active', activeFilter);
    qs.set('sort', sort);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs;
  }

  function load(pageNum = page, overrides?: { linked?: string; active?: string }) {
    setLoading(true);
    setError('');
    const linked = overrides?.linked ?? linkedFilter;
    const active = overrides?.active ?? activeFilter;
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (linked) qs.set('linked', linked);
    if (active) qs.set('active', active);
    qs.set('sort', sort);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));

    Promise.all([
      api<PaginatedResponse<Agent>>(`/agents?${qs}`),
      api<Stats>('/agents/stats'),
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
    setForm(emptyAgentForm());
    setError('');
    setOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(a: Agent) {
    api(`/agents/${a.id}`).then((full) => {
      setEditId(a.id);
      setForm(agentToForm(full));
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
        email: form.email.trim() || null,
        phone1: form.phone1.trim() || null,
        phone2: form.phone2.trim() || null,
        address: form.address.trim() || null,
        remark: form.remark.trim() || null,
      };
      if (editId) {
        await api(`/agents/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/agents', { method: 'POST', body: JSON.stringify(body) });
      }
      setOpen(false);
      load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function doImport(e: React.FormEvent) {
    e.preventDefault();
    try {
      let res: { created: number; skipped: number; errors: string[] };
      if (importMode === 'xlsx') {
        if (!importFile) return;
        const fd = new FormData();
        fd.append('file', importFile);
        res = await uploadForm('/agents/import/xlsx', fd);
        setImportFile(null);
      } else {
        res = await api('/agents/import/csv', { method: 'POST', body: JSON.stringify({ csv: importCsv }) });
        setImportCsv('');
      }
      setImportResult(t('msg.createdSkipped', { created: res.created, skipped: res.skipped }));
      load(1);
      setPage(1);
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : t('msg.importError'));
    }
  }

  async function confirmDelete() {
    if (!deleteId || !deleteMotif.trim()) return;
    try {
      await api(`/agents/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
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
    w.document.write(`<html><head><title>${t('pages.agents')} — GIC</title></head><body>
      <h1>${t('pages.agents')} — GIC</h1>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.ref')}</th><th>${t('columns.name')}</th><th>${t('columns.email')}</th><th>${t('columns.phoneFull')}</th><th>${t('columns.clients')}</th><th>${t('columns.status')}</th></tr>
        ${items.map((a) => `<tr>
          <td>${a.reference || '—'}</td>
          <td>${a.firstName} ${a.lastName}</td>
          <td>${a.email || '—'}</td>
          <td>${a.phone1 || '—'}</td>
          <td>${a._count?.clients ?? 0}</td>
          <td>${a.isActive === false ? 'Inactif' : 'Actif'}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const linkedFilters = [
    { id: '', label: t('common.all') },
    { id: 'true', label: t('common.withClients') },
    { id: 'false', label: t('common.withoutClients') },
  ];

  const activeFilters = [
    { id: '', label: t('common.allStatuses') },
    { id: 'true', label: t('kpi.active') },
    { id: 'false', label: t('common.inactivePlural') },
  ];

  const hasActiveFilters = !!linkedFilter || !!activeFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.agents')}
        subtitle={t('pages.agentsSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/agents/export/csv?${buildQuery(1)}`, 'agents-gic.csv')}>{t('common.export')}</Btn>
            <Btn variant="secondary" icon={Upload} onClick={() => { setImportOpen(true); setImportResult(null); }}>{t('actions.import')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newAgent')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('pages.agents')} value={stats.total} icon={Users} tone="violet" delta={`${stats.active} actifs`} deltaTone="muted" />
        <KpiCard title={t('columns.clients')} value={stats.linked} icon={UserCheck} tone="emerald" />
        <KpiCard title={t('common.email')} value={stats.withEmail} icon={Mail} tone="amber" />
        <KpiCard title={t('columns.phoneFull')} value={stats.withPhone} icon={Phone} tone="coral" />
      </div>

      <div className={`mac-filters-panel${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchNameRefEmail')}
            />
            <MacSelect
              value={sort}
              onChange={setSort}
              options={[
                { value: 'lastName', label: t('msg.nameAZ') },
                { value: 'reference', label: t('fields.reference') },
                { value: 'clients', label: t('msg.moreClients') },
                { value: 'createdAt', label: t('msg.newestFirst') },
              ]}
              className="w-44 shrink-0"
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
                  <p className="mac-filter-menu-section">Portefeuille</p>
                  {linkedFilters.map((f) => (
                    <button
                      key={f.id || 'all-linked'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${linkedFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setLinkedFilter(f.id);
                        setPage(1);
                        load(1, { linked: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {linkedFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  <div className="mac-filter-menu-sep" />
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
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setLinkedFilter('');
                          setActiveFilter('');
                          setPage(1);
                          load(1, { linked: '', active: '' });
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
          <EmptyState title={t('msg.emptyAgents')} action={<Btn icon={Plus} onClick={openCreate}>{t('actions.newAgent')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.photo')}</Th>
                <Th mac>{t('columns.ref')}</Th>
                <Th mac>{t('columns.agent')}</Th>
                <Th mac>{t('columns.email')}</Th>
                <Th mac>{t('columns.phoneFull')}</Th>
                <Th mac>{t('columns.clients')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="cursor-pointer" onClick={() => navigate(`/agents/${a.id}`)}>
                  <Td mac>
                    <MacAvatar photo={a.photo} firstName={a.firstName} lastName={a.lastName} />
                  </Td>
                  <Td mac>
                    <Link to={`/agents/${a.id}`} className="mac-table-ref font-medium" onClick={(e) => e.stopPropagation()}>
                      {a.reference || '—'}
                    </Link>
                  </Td>
                  <Td mac className="font-medium">
                    <Link to={`/agents/${a.id}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>
                      {a.firstName} {a.lastName}
                    </Link>
                  </Td>
                  <Td mac className="mac-table-muted" onClick={(e) => e.stopPropagation()}>
                    {a.email ? <a href={`mailto:${a.email}`} className="hover:text-[#007aff]">{a.email}</a> : '—'}
                  </Td>
                  <Td mac onClick={(e) => e.stopPropagation()}>
                    {a.phone1 ? <a href={`tel:${a.phone1}`} className="hover:text-[#007aff]">{a.phone1}</a> : '—'}
                  </Td>
                  <Td mac>
                    <span className="mac-chip mac-chip-blue">{a._count?.clients ?? 0}</span>
                  </Td>
                  <Td mac>
                    <StatusPill status={a.isActive === false ? 'inactif' : 'actif'} quiet />
                  </Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <Link to={`/agents/${a.id}`} className="mac-action-btn mac-action-btn-blue" title={t('actions.ficheAgent')}>
                        <Eye size={14} strokeWidth={2.15} />
                      </Link>
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(a)} />
                      <MacActionBtn
                        icon={Trash2}
                        tone="red"
                        title={t('common.delete')}
                        onClick={() => { setDeleteId(a.id); setDeleteMotif(''); }}
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
        title={editId ? t('actions.editAgent') : t('actions.newAgent')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="agent-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="agent-form" onSubmit={save}>
          <AgentFormFields form={form} setForm={setForm} />
          {error && <p className="mt-3 text-[11px] text-gic-coral">{error}</p>}
        </form>
      </Modal>

      <Modal
        open={!!deleteId}
        title={t('actions.deleteAgent')}
        onClose={() => setDeleteId(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">
          Un agent avec des clients assignés ne peut pas être supprimé — réaffectez d&apos;abord les clients (RG-AGT-001).
        </p>
        <textarea
          className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]"
          placeholder={t('msg.motifDeletePlaceholder')}
          value={deleteMotif}
          onChange={(e) => setDeleteMotif(e.target.value)}
        />
      </Modal>

      <Modal open={importOpen} title={t('actions.importAgents')} onClose={() => setImportOpen(false)} footer={<Btn form="agent-import-form" type="submit">{t('actions.import')}</Btn>}>
        <form id="agent-import-form" onSubmit={doImport} className="space-y-3">
          <div className="flex gap-2">
            <Btn type="button" variant={importMode === 'csv' ? 'primary' : 'secondary'} onClick={() => setImportMode('csv')}>{t('common.csv')}</Btn>
            <Btn type="button" variant={importMode === 'xlsx' ? 'primary' : 'secondary'} onClick={() => setImportMode('xlsx')}>{t('common.excelXlsx')}</Btn>
          </div>
          {importMode === 'csv' ? (
            <>
              <p className="text-[11px] text-gic-muted">{t('msg.importFormatAgent')}</p>
              <textarea className="w-full h-32 rounded-xl border border-gic-border p-3 text-[12px]" value={importCsv} onChange={(e) => setImportCsv(e.target.value)} placeholder="Karim;Benali;karim@gic.ma;0612345678;;Casablanca" />
            </>
          ) : (
            <>
              <p className="text-[11px] text-gic-muted">{t('msg.importColumnsAgent')}</p>
              <input type="file" accept=".xlsx,.xls" className="text-[12px]" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
            </>
          )}
          {importResult && <p className="text-[11px] text-gic-emerald">{importResult}</p>}
        </form>
      </Modal>
    </div>
  );
}
