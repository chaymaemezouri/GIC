import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Printer, Upload } from 'lucide-react';
import { api, formatDate, uploadDocument, type PaginatedResponse } from '../../lib/api';
import { appAlert } from '../../lib/dialog';
import { FilePieceLinks, formatSize } from '../../lib/documentDisplay';
import { ActionBadge, auditActionLabel, auditEntityLabel, formatAuditDateTime } from '../../lib/auditDisplay';
import { enginLabel, errorMessage, queryString } from '../../lib/engins';
import { fetchAllRows, printRows } from '../../lib/listPrint';
import { useRowSelection } from '../../hooks/useRowSelection';
import { useI18n } from '../../i18n/I18nContext';
import { Btn, Card, EmptyState, Input, MacDateInput, MacSearch, MacSelect, Modal, PageHeader, Pagination, Select, TableWrap, Td, Th } from '../../components/ui';
import { SelectAllTh, SelectTd, SelectionBar } from '../../components/RowSelection';
import { AssignmentsPanel } from '../../components/engins/Assignments';
import { ExpensePanel, FuelPanel, UsagePanel } from '../../components/engins/Logs';
import { useFleetRefs } from '../../components/engins/FleetCommon';

export type FleetSection = 'affectations' | 'retours' | 'utilisation' | 'carburant' | 'depenses' | 'documents' | 'historique';

export default function FleetModulePage({ section }: { section: FleetSection }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <PageHeader mac title={t(`fleet.nav.${section}`)} subtitle={t(`fleet.pages.${section}Subtitle`)} backTo={false} />
      {section === 'affectations' && <AssignmentsPanel toolbar showKpis />}
      {section === 'retours' && <AssignmentsPanel toolbar showKpis initialStatus="actifs" returnFocus />}
      {section === 'utilisation' && <UsagePanel toolbar showKpis />}
      {section === 'carburant' && <FuelPanel toolbar showKpis />}
      {section === 'depenses' && <ExpensePanel toolbar showKpis />}
      {section === 'documents' && <FleetDocuments />}
      {section === 'historique' && <FleetHistory />}
    </div>
  );
}

// ─── Documents ──────────────────────────────────────────────────────

type FleetDoc = {
  id: string;
  name: string;
  category: string;
  path: string;
  size?: number | null;
  expiresAt?: string | null;
  createdAt: string;
  enginId: string | null;
  enginLabel: string | null;
  maintenance: { id: string; designation: string; kind: string } | null;
};

const DOC_CATEGORIES = ['carte_grise', 'assurance', 'contrat_location', 'facture', 'controle_technique', 'photo', 'autre'];

function FleetDocuments() {
  const { t } = useI18n();
  const { engins } = useFleetRefs();
  const [docs, setDocs] = useState<FleetDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [enginId, setEnginId] = useState('');
  const [category, setCategory] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [upload, setUpload] = useState({ enginId: '', name: '', category: 'carte_grise', expiresAt: '', file: null as File | null });
  const selection = useRowSelection<FleetDoc>();

  function load() {
    setLoading(true);
    api<FleetDoc[]>(`/engins/documents-all?${queryString({ q, enginId, category })}`)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    const id = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, enginId, category]);

  async function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!upload.file || !upload.enginId) return;
    try {
      await uploadDocument(upload.file, {
        name: upload.name || upload.file.name,
        category: upload.category,
        entityType: 'Engin',
        entityId: upload.enginId,
        enginId: upload.enginId,
        ...(upload.expiresAt ? { expiresAt: upload.expiresAt } : {}),
      });
      setUploadOpen(false);
      load();
    } catch (err) {
      await appAlert(errorMessage(err, t('common.error')));
    }
  }

  const catLabel = (c: string) => {
    const key = `fleet.docCat.${c}`;
    const label = t(key);
    return label === key ? c : label;
  };

  function printList() {
    printRows<FleetDoc>({
      title: t('fleet.nav.documents'),
      filters: [
        [t('listPrint.search'), q],
        [t('fleet.fields.engin'), enginId && enginLabel(engins.find((e) => e.id === enginId))],
        [t('fleet.fields.category'), category && catLabel(category)],
      ],
      columns: [
        { label: t('fleet.fields.document'), value: (d) => (d.size ? `${d.name} (${formatSize(d.size, t)})` : d.name) },
        { label: t('fleet.fields.engin'), value: (d) => d.enginLabel },
        { label: t('fleet.fields.category'), value: (d) => catLabel(d.category) },
        {
          label: t('fleet.fields.linkedTo'),
          value: (d) => (d.maintenance
            ? `${t(`fleet.maintKind.${d.maintenance.kind || 'entretien'}`)} — ${d.maintenance.designation}`
            : t('fleet.hints.enginRecord')),
        },
        { label: t('fleet.fields.expiry'), value: (d) => formatDate(d.expiresAt) },
        { label: t('fleet.fields.addedOn'), value: (d) => formatDate(d.createdAt) },
      ],
      rows: selection.count ? selection.rows : docs,
      selectedCount: selection.count,
    });
  }

  return (
    <>
      <SelectionBar selection={selection} onPrint={printList} />
      <Card padding={false} className="overflow-visible">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-black/[0.05]">
          <MacSearch value={q} onChange={setQ} placeholder={t('fleet.hints.searchDocs')} />
          <MacSelect
            value={enginId}
            onChange={setEnginId}
            className="w-48 shrink-0"
            options={[{ value: '', label: t('fleet.filters.allEngins') }, ...engins.map((e) => ({ value: e.id, label: [e.code, e.designation || e.brand].filter(Boolean).join(' — ') }))]}
          />
          <MacSelect
            value={category}
            onChange={setCategory}
            className="w-44 shrink-0"
            options={[{ value: '', label: t('fleet.filters.allCategories') }, ...DOC_CATEGORIES.map((c) => ({ value: c, label: catLabel(c) }))]}
          />
          <div className="ml-auto flex items-center gap-2">
            <Btn variant="secondary" icon={Printer} onClick={printList}>{t('common.print')}</Btn>
            <Btn icon={Upload} onClick={() => { setUpload({ enginId, name: '', category: 'carte_grise', expiresAt: '', file: null }); setUploadOpen(true); }}>
              {t('fleet.actions.addDocument')}
            </Btn>
          </div>
        </div>
        {loading ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : docs.length === 0 ? (
          <EmptyState title={t('fleet.empty.documents')} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <SelectAllTh selection={selection} rows={docs} />
                <Th mac>{t('fleet.fields.document')}</Th>
                <Th mac>{t('fleet.fields.engin')}</Th>
                <Th mac>{t('fleet.fields.category')}</Th>
                <Th mac>{t('fleet.fields.linkedTo')}</Th>
                <Th mac>{t('fleet.fields.expiry')}</Th>
                <Th mac>{t('fleet.fields.addedOn')}</Th>
                <Th mac>{t('fleet.fields.file')}</Th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <SelectTd selection={selection} row={d} />
                  <Td mac>
                    <span className="inline-flex items-center gap-1.5"><FileText size={13} className="text-gic-muted" />{d.name}</span>
                    {d.size ? <span className="block text-[10px] mac-table-muted">{formatSize(d.size, t)}</span> : null}
                  </Td>
                  <Td mac>{d.enginId ? <Link to={`/engins/${d.enginId}`} className="mac-table-ref">{d.enginLabel || '—'}</Link> : '—'}</Td>
                  <Td mac><span className="mac-chip mac-chip-gray">{catLabel(d.category)}</span></Td>
                  <Td mac>
                    {d.maintenance ? (
                      <Link to={`/maintenance/${d.maintenance.id}`} className="hover:text-[#007aff]">
                        {t(`fleet.maintKind.${d.maintenance.kind || 'entretien'}`)} — {d.maintenance.designation}
                      </Link>
                    ) : (
                      <span className="mac-table-muted">{t('fleet.hints.enginRecord')}</span>
                    )}
                  </Td>
                  <Td mac className="text-[11px]">{formatDate(d.expiresAt)}</Td>
                  <Td mac className="text-[11px]">{formatDate(d.createdAt)}</Td>
                  <Td mac><FilePieceLinks path={d.path} /></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      <Modal
        open={uploadOpen}
        title={t('fleet.actions.addDocument')}
        onClose={() => setUploadOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setUploadOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="fleet-doc-form" type="submit" disabled={!upload.file || !upload.enginId}>{t('common.save')}</Btn>
          </>
        }
      >
        <form id="fleet-doc-form" onSubmit={submitUpload} className="grid gap-3">
          <Select label={`${t('fleet.fields.engin')} *`} required value={upload.enginId} onChange={(e) => setUpload({ ...upload, enginId: e.target.value })}>
            <option value="">—</option>
            {engins.map((e) => <option key={e.id} value={e.id}>{[e.code, e.designation || e.brand].filter(Boolean).join(' — ')}</option>)}
          </Select>
          <Select label={t('fleet.fields.category')} value={upload.category} onChange={(e) => setUpload({ ...upload, category: e.target.value })}>
            {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
          </Select>
          <Input label={t('fleet.fields.documentName')} value={upload.name} onChange={(e) => setUpload({ ...upload, name: e.target.value })} />
          <Input label={t('fleet.fields.expiry')} type="date" value={upload.expiresAt} onChange={(e) => setUpload({ ...upload, expiresAt: e.target.value })} />
          <Input label={`${t('fleet.fields.file')} *`} type="file" required onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] || null })} />
        </form>
      </Modal>
    </>
  );
}

// ─── Historique ─────────────────────────────────────────────────────

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
  user?: { firstName: string; lastName: string; email: string } | null;
};

const HISTORY_ENTITIES = ['Engin', 'EnginAssignment', 'EnginUsage', 'EnginExpense', 'Maintenance', 'FuelLog', 'Mission', 'DriverAssignment'];

function FleetHistory() {
  const { t } = useI18n();
  const [data, setData] = useState<PaginatedResponse<AuditRow> | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const selection = useRowSelection<AuditRow>();

  useEffect(() => setPage(1), [q, entity, dateFrom, dateTo]);
  useEffect(() => {
    const id = setTimeout(() => {
      api<PaginatedResponse<AuditRow>>(`/engins/history-all?${queryString({ q, entity, dateFrom, dateTo, page, limit: 50 })}`)
        .then(setData)
        .catch(() => setData(null));
    }, q ? 250 : 0);
    return () => clearTimeout(id);
  }, [q, entity, dateFrom, dateTo, page]);

  const link = (r: AuditRow) => {
    if (!r.entityId) return null;
    if (r.entity === 'Engin') return `/engins/${r.entityId}`;
    if (r.entity === 'Maintenance') return `/maintenance/${r.entityId}`;
    if (r.entity === 'Mission') return `/missions/${r.entityId}`;
    return null;
  };

  function printList() {
    printRows<AuditRow>({
      title: t('fleet.nav.historique'),
      filters: [
        [t('listPrint.search'), q],
        [t('fleet.fields.entity'), entity && auditEntityLabel(entity)],
        [t('listPrint.period'), dateFrom || dateTo ? `${dateFrom ? formatDate(dateFrom) : '…'} → ${dateTo ? formatDate(dateTo) : '…'}` : ''],
      ],
      columns: [
        { label: t('fleet.fields.dateTime'), value: (r) => formatAuditDateTime(r.createdAt) },
        { label: t('fleet.fields.action'), value: (r) => auditActionLabel(r.action) },
        { label: t('fleet.fields.entity'), value: (r) => auditEntityLabel(r.entity) },
        { label: t('fleet.fields.details'), value: (r) => r.details },
        { label: t('fleet.fields.user'), value: (r) => (r.user ? `${r.user.firstName} ${r.user.lastName}` : '') },
      ],
      rows: selection.count
        ? selection.rows
        : () => fetchAllRows<AuditRow>('/engins/history-all', queryString({ q, entity, dateFrom, dateTo })),
      selectedCount: selection.count,
    });
  }

  return (
    <>
      <SelectionBar selection={selection} onPrint={printList} />
      <Card padding={false} className="overflow-visible">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-black/[0.05]">
          <MacSearch value={q} onChange={setQ} placeholder={t('fleet.hints.searchHistory')} />
          <MacSelect
            value={entity}
            onChange={setEntity}
            className="w-48 shrink-0"
            options={[{ value: '', label: t('fleet.filters.allEntities') }, ...HISTORY_ENTITIES.map((e) => ({ value: e, label: auditEntityLabel(e) }))]}
          />
          <MacDateInput value={dateFrom} onChange={setDateFrom} placeholder={t('fields.from')} className="w-36 shrink-0" />
          <MacDateInput value={dateTo} onChange={setDateTo} placeholder={t('fields.to')} className="w-36 shrink-0" />
          <div className="ml-auto">
            <Btn variant="secondary" icon={Printer} onClick={printList}>{t('common.print')}</Btn>
          </div>
        </div>
        {!data ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : data.items.length === 0 ? (
          <EmptyState title={t('fleet.empty.history')} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <SelectAllTh selection={selection} rows={data.items} />
                <Th mac>{t('fleet.fields.dateTime')}</Th>
                <Th mac>{t('fleet.fields.action')}</Th>
                <Th mac>{t('fleet.fields.entity')}</Th>
                <Th mac>{t('fleet.fields.details')}</Th>
                <Th mac>{t('fleet.fields.user')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => {
                const to = link(r);
                return (
                  <tr key={r.id}>
                    <SelectTd selection={selection} row={r} />
                    <Td mac className="text-[11px] whitespace-nowrap">{formatAuditDateTime(r.createdAt)}</Td>
                    <Td mac><ActionBadge action={r.action} /></Td>
                    <Td mac>{to ? <Link to={to} className="mac-table-ref">{auditEntityLabel(r.entity)}</Link> : auditEntityLabel(r.entity)}</Td>
                    <Td mac className="text-[12px]">{r.details || '—'}</Td>
                    <Td mac className="mac-table-muted text-[11px]">{r.user ? `${r.user.firstName} ${r.user.lastName}` : '—'}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        {data && <Pagination page={page} pages={data.pages} total={data.total} limit={50} onPage={setPage} mac />}
      </Card>
    </>
  );
}
