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
  Modal, PageHeader, Pagination, TableWrap, Td, Th,
} from '../components/ui';
import { MandantFormFields, emptyMandantForm, mandantToForm, type MandantFormData } from '../components/MandantFormFields';
import MacAvatar from '../components/MacAvatar';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';

type Mandant = {
  id: string;
  reference?: string;
  photo?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone1?: string;
  identityType?: string;
  identityNumber?: string;
  _count?: { clients: number };
};

type Stats = { total: number; withEmail: number; withPhone: number; linked: number; unlinked: number };

const PAGE_SIZE = 20;

export default function MandantsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Mandant[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, withEmail: 0, withPhone: 0, linked: 0, unlinked: 0 });
  const [identityTypes, setIdentityTypes] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [linkedFilter, setLinkedFilter] = useState('');
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
  const [form, setForm] = useState<MandantFormData>(emptyMandantForm());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildQuery(pageNum = page) {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (typeFilter) qs.set('identityType', typeFilter);
    if (linkedFilter) qs.set('linked', linkedFilter);
    qs.set('sort', sort);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs;
  }

  function load(pageNum = page, overrides?: { identityType?: string; linked?: string }) {
    setLoading(true);
    setError('');
    const identityType = overrides?.identityType ?? typeFilter;
    const linked = overrides?.linked ?? linkedFilter;
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (identityType) qs.set('identityType', identityType);
    if (linked) qs.set('linked', linked);
    qs.set('sort', sort);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));

    Promise.all([
      api<PaginatedResponse<Mandant>>(`/mandants?${qs}`),
      api<Stats>('/mandants/stats'),
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
    api<{ value: string }[]>('/dropdowns/identity_type').then((d) => setIdentityTypes(d.map((x) => x.value))).catch(() => {});
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
    setForm(emptyMandantForm());
    setError('');
    setOpen(true);
  }

  useCreateQuery(openCreate);

  function openEdit(m: Mandant) {
    api(`/mandants/${m.id}`).then((full) => {
      setEditId(m.id);
      setForm(mandantToForm(full));
      setError('');
      setOpen(true);
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const body = { ...form, birthDate: form.birthDate || null };
      if (editId) {
        await api(`/mandants/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/mandants', { method: 'POST', body: JSON.stringify(body) });
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
        res = await uploadForm('/mandants/import/xlsx', fd);
        setImportFile(null);
      } else {
        res = await api('/mandants/import/csv', { method: 'POST', body: JSON.stringify({ csv: importCsv }) });
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
      await api(`/mandants/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
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
    w.document.write(`<html><head><title>${t('pages.mandants')} — GIC</title></head><body>
      <h1>${t('pages.mandants')} — GIC</h1>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:12px">
        <tr><th>${t('columns.ref')}</th><th>${t('columns.name')}</th><th>${t('columns.identity')}</th><th>${t('columns.email')}</th><th>${t('columns.phoneFull')}</th><th>${t('columns.linkedClients')}</th></tr>
        ${items.map((m) => `<tr>
          <td>${m.reference || '—'}</td>
          <td>${m.firstName} ${m.lastName}</td>
          <td>${m.identityType || ''} ${m.identityNumber || '—'}</td>
          <td>${m.email || '—'}</td>
          <td>${m.phone1 || '—'}</td>
          <td>${m._count?.clients ?? 0}</td>
        </tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  }

  const typeFilters = [
    { id: '', label: t('common.allTypes') },
    ...identityTypes.map((t) => ({ id: t, label: t })),
  ];

  const linkedFilters = [
    { id: '', label: t('common.all') },
    { id: 'true', label: t('common.linkedToClient') },
    { id: 'false', label: t('common.withoutLinkedClient') },
  ];

  const hasActiveFilters = !!typeFilter || !!linkedFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.mandants')}
        subtitle={t('pages.mandantsSubtitle')}
        actions={
          <>
            <Btn variant="secondary" icon={Download} onClick={() => downloadCsv(`/mandants/export/csv?${buildQuery(1)}`, 'mandants-gic.csv')}>{t('common.export')}</Btn>
            <Btn variant="secondary" icon={Upload} onClick={() => { setImportOpen(true); setImportResult(null); }}>{t('actions.import')}</Btn>
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
            <Btn icon={Plus} onClick={openCreate}>{t('actions.newMandant')}</Btn>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-4">
        <KpiCard title={t('pages.mandants')} value={stats.total} icon={Users} tone="violet" delta={`${stats.unlinked} sans client`} deltaTone="muted" />
        <KpiCard title={t('common.linkedToClient')} value={stats.linked} icon={UserCheck} tone="emerald" />
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
              placeholder={t('msg.searchNameRefEmailCin')}
            />
            <MacSelect
              value={sort}
              onChange={setSort}
              options={[
                { value: 'lastName', label: t('msg.nameAZ') },
                { value: 'reference', label: t('fields.reference') },
                { value: 'createdAt', label: t('msg.newestFirst') },
              ]}
              className="w-40 shrink-0"
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
                  <p className="mac-filter-menu-section">{t('fields.identityType')}</p>
                  {typeFilters.map((f) => (
                    <button
                      key={f.id || 'all-type'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${typeFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setTypeFilter(f.id);
                        setPage(1);
                        load(1, { identityType: f.id });
                      }}
                    >
                      <span>{f.label}</span>
                      {typeFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  <div className="mac-filter-menu-sep" />
                  <p className="mac-filter-menu-section">{t('common.clientLink')}</p>
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
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setTypeFilter('');
                          setLinkedFilter('');
                          setPage(1);
                          load(1, { identityType: '', linked: '' });
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
          <EmptyState title={t('msg.emptyMandants')} action={<Btn icon={Plus} onClick={openCreate}>{t('actions.newMandant')}</Btn>} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.photo')}</Th>
                <Th mac>{t('columns.ref')}</Th>
                <Th mac>{t('columns.fullName')}</Th>
                <Th mac>{t('columns.identity')}</Th>
                <Th mac>{t('columns.email')}</Th>
                <Th mac>{t('columns.phoneFull')}</Th>
                <Th mac>{t('columns.linkedClients')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="cursor-pointer" onClick={() => navigate(`/mandants/${m.id}`)}>
                  <Td mac>
                    <MacAvatar photo={m.photo} firstName={m.firstName} lastName={m.lastName} />
                  </Td>
                  <Td mac>
                    <Link
                      to={`/mandants/${m.id}`}
                      className="mac-table-ref font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {m.reference || '—'}
                    </Link>
                  </Td>
                  <Td mac className="font-medium">
                    <Link
                      to={`/mandants/${m.id}`}
                      className="mac-table-ref"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {m.firstName} {m.lastName}
                    </Link>
                  </Td>
                  <Td mac className="mac-table-muted text-[11px]">
                    {m.identityType || '—'} {m.identityNumber || ''}
                  </Td>
                  <Td mac className="mac-table-muted" onClick={(e) => e.stopPropagation()}>
                    {m.email ? (
                      <a href={`mailto:${m.email}`} className="hover:text-[#007aff]">{m.email}</a>
                    ) : '—'}
                  </Td>
                  <Td mac onClick={(e) => e.stopPropagation()}>
                    {m.phone1 ? (
                      <a href={`tel:${m.phone1}`} className="hover:text-[#007aff]">{m.phone1}</a>
                    ) : '—'}
                  </Td>
                  <Td mac>
                    <span className="mac-chip mac-chip-blue">{m._count?.clients ?? 0}</span>
                  </Td>
                  <Td mac className="mac-td-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="mac-actions">
                      <Link to={`/mandants/${m.id}`} className="mac-action-btn mac-action-btn-blue" title={t('actions.ficheDetail')}>
                        <Eye size={14} strokeWidth={2.15} />
                      </Link>
                      <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(m)} />
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
        open={open}
        size="lg"
        title={editId ? t('actions.editMandant') : t('actions.newMandant')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="mandant-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="mandant-form" onSubmit={save}>
          <MandantFormFields form={form} setForm={setForm} identityTypes={identityTypes} />
          {error && <p className="mt-3 text-[11px] text-gic-coral">{error}</p>}
        </form>
      </Modal>

      <Modal
        open={!!deleteId}
        title={t('actions.deleteMandant')}
        onClose={() => setDeleteId(null)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn>
          </>
        }
      >
        <p className="text-[12px] text-gic-muted mb-3">
          Un mandant lié à un client ne peut pas être supprimé — retirez d'abord les liaisons (RG-MAN-001).
        </p>
        <textarea
          className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]"
          placeholder={t('msg.motifDeletePlaceholder')}
          value={deleteMotif}
          onChange={(e) => setDeleteMotif(e.target.value)}
        />
      </Modal>

      <Modal open={importOpen} title={t('actions.importMandants')} onClose={() => setImportOpen(false)} footer={<Btn form="mandant-import-form" type="submit">{t('actions.import')}</Btn>}>
        <form id="mandant-import-form" onSubmit={doImport} className="space-y-3">
          <div className="flex gap-2">
            <Btn type="button" variant={importMode === 'csv' ? 'primary' : 'secondary'} onClick={() => setImportMode('csv')}>{t('common.csv')}</Btn>
            <Btn type="button" variant={importMode === 'xlsx' ? 'primary' : 'secondary'} onClick={() => setImportMode('xlsx')}>{t('common.excelXlsx')}</Btn>
          </div>
          {importMode === 'csv' ? (
            <>
              <p className="text-[11px] text-gic-muted">{t('msg.importFormatMandant')}</p>
              <textarea className="w-full h-32 rounded-xl border border-gic-border p-3 text-[12px]" value={importCsv} onChange={(e) => setImportCsv(e.target.value)} placeholder="Karim;Benali;karim@email.ma;0612345678;AB123456;CIN" />
            </>
          ) : (
            <>
              <p className="text-[11px] text-gic-muted">{t('msg.importColumnsMandant')}</p>
              <input type="file" accept=".xlsx,.xls" className="text-[12px]" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
            </>
          )}
          {importResult && <p className="text-[11px] text-gic-emerald">{importResult}</p>}
        </form>
      </Modal>
    </div>
  );
}
