import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Send, Inbox, Info as InfoIcon, History
} from 'lucide-react';
import { api, formatDate, uploadForm } from '../lib/api';
import { Btn, Card, Input, KpiCard, MacActionBtn, Modal, TableWrap, Td, Th, PageBackLink } from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';
import { FilePieceLinks } from '../lib/documentDisplay';

type Archive = {
  id: string;
  registerNo?: string | null;
  date: string;
  subject: string;
  sender?: string | null;
  recipient?: string | null;
  category?: string | null;
  direction?: string | null;
  remark?: string | null;
  filePath?: string | null;
};

type Tab = 'infos' | 'historique';

export default function ArchiveDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [entry, setEntry] = useState<Archive | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [form, setForm] = useState({
    registerNo: '', subject: '', sender: '', recipient: '', category: '', direction: 'entrant',
    date: new Date().toISOString().slice(0, 10), remark: '',
  });
  const [editFile, setEditFile] = useState<File | null>(null);

  function load() {
    if (!id) return;
    setError('');
    api<Archive>(`/documents/archives/${id}`).then(setEntry).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/documents/archives/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
  }, [tab, id]);

  useEffect(() => {
    if (entry && (location.state as { edit?: boolean } | null)?.edit) {
      setForm({
        registerNo: entry.registerNo || '',
        subject: entry.subject,
        sender: entry.sender || '',
        recipient: entry.recipient || '',
        category: entry.category || '',
        direction: entry.direction || 'entrant',
        date: entry.date.slice(0, 10),
        remark: entry.remark || '',
      });
      setEditOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [entry, location.state, location.pathname, navigate]);

  function openEdit() {
    if (!entry) return;
    setForm({
      registerNo: entry.registerNo || '',
      subject: entry.subject,
      sender: entry.sender || '',
      recipient: entry.recipient || '',
      category: entry.category || '',
      direction: entry.direction || 'entrant',
      date: entry.date.slice(0, 10),
      remark: entry.remark || '',
    });
    setEditFile(null);
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editFile) {
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => {
          if (v) fd.append(k, v);
        });
        fd.append('file', editFile);
        await uploadForm(`/documents/archives/${id}`, fd, 'PUT');
      } else {
        await api(`/documents/archives/${id}`, { method: 'PUT', body: JSON.stringify(form) });
      }
      setEditOpen(false);
      setEditFile(null);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!await appConfirm(t('msg.confirmDeleteArchive'))) return;
    try {
      await api(`/documents/archives/${id}`, { method: 'DELETE' });
      navigate('/documents?tab=bureau');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function sendEmail() {
    try {
      await api(`/documents/archives/${id}/send-email`, {
        method: 'POST',
        body: JSON.stringify({ to: emailTo, message: emailBody }),
      });
      setEmailOpen(false);
      await appAlert(t('msg.emailSent'));
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  if (!entry && !error) {
    return <p className="text-[12px] text-gic-muted p-6 text-center">{t('msg.loadingBureau')}</p>;
  }

  if (error && !entry) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/documents" className="mt-2" />
      </Card>
    );
  }

  const isSortant = entry!.direction === 'sortant';

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/documents?tab=bureau" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            <div className="mac-detail-photo-fallback">
              {isSortant ? <Send size={22} strokeWidth={1.75} /> : <Inbox size={22} strokeWidth={1.75} />}
            </div>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.bureau360')}</p>
            <h1 className="mac-detail-name truncate">{entry!.subject}</h1>
            <p className="mac-detail-meta">
              {entry!.registerNo ? `N° ${entry!.registerNo}` : t('msg.withoutRegisterNo')}
              <span className="text-[#c7c7cc]"> · </span>
              {formatDate(entry!.date)}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <span className={`mac-chip capitalize ${isSortant ? 'mac-chip-orange' : 'mac-chip-green'}`}>
                {entry!.direction || '—'}
              </span>
              {entry!.category && <span className="mac-chip mac-chip-gray">{entry!.category}</span>}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          <Btn icon={Send} onClick={() => { setEmailOpen(true); setEmailTo(entry!.recipient || ''); setEmailBody(''); }}>{t('fields.email')}</Btn>
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={confirmDelete} />
          </div>
                 </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-3 mb-4">
        <KpiCard title={t('fields.direction')} value={entry!.direction || '—'} icon={isSortant ? Send : Inbox} tone={isSortant ? 'coral' : 'emerald'} compact />
        <KpiCard title={t('fields.sender')} value={entry!.sender || '—'} icon={Inbox} tone="violet" compact />
        <KpiCard title={t('fields.recipient')} value={entry!.recipient || '—'} icon={Send} tone="amber" compact />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsArchiveAria')}
            items={[
              { id: 'infos', label: t('tabs.informations'), icon: InfoIcon },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >

        {tab === 'infos' && (
          <div className="space-y-4 mt-1 text-[12px]">
            <div className="grid sm:grid-cols-2 gap-4">
              <Info label={t('fields.registerNo')} value={entry!.registerNo || '—'} />
              <Info label={t('fields.date')} value={formatDate(entry!.date)} />
              <Info label={t('fields.sender')} value={entry!.sender || '—'} />
              <Info label={t('fields.recipient')} value={entry!.recipient || '—'} />
              <Info label={t('fields.category')} value={entry!.category || '—'} />
              <Info label={t('fields.direction')} value={entry!.direction || '—'} />
            </div>
            {entry!.remark && (
              <div className="mac-section-card">
                <p className="mac-info-label">{t('fields.remark')}</p>
                <p className="text-gic-muted whitespace-pre-wrap">{entry!.remark}</p>
              </div>
            )}
            {entry!.filePath && (
              <div className="mac-section-card">
                <p className="mac-info-label">{t('fields.file')}</p>
                <FilePieceLinks path={entry!.filePath} />
              </div>
            )}
          </div>
        )}

        {tab === 'historique' && (
          <div className="mt-1">
            {history.length === 0 ? (
              <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptyHistory')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('columns.action')}</Th>
                    <Th mac>{t('columns.user')}</Th>
                    <Th mac>{t('columns.details')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <Td mac className="mac-table-muted">{formatDate(h.createdAt)}</Td>
                      <Td mac className="capitalize">{h.action}</Td>
                      <Td mac className="mac-table-muted">
                        {h.user ? `${h.user.firstName} ${h.user.lastName}` : '—'}
                      </Td>
                      <Td mac className="mac-table-muted">{h.details || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}
            </DetailShell>

      <Modal open={editOpen} title={t('actions.editArchive')} onClose={() => setEditOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-archive-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="edit-archive-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <Input label={t('fields.registerNo')} value={form.registerNo} onChange={(e) => setForm({ ...form, registerNo: e.target.value })} />
          <Input label={t('fields.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-medium text-gic-muted">{t('fields.direction')}</span>
            <select className="mt-1 w-full rounded-lg border border-gic-border px-3 py-2 text-[12px]" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
              <option value="entrant">{t('fields.incoming')}</option>
              <option value="sortant">{t('fields.outgoing')}</option>
            </select>
          </label>
          <Input label={t('fields.category')} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Input className="sm:col-span-2" label={t('fields.subject') + ' *'} required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <Input label={t('fields.sender')} value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} />
          <Input label={t('fields.recipient')} value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} />
          <Input className="sm:col-span-2" label={t('fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-medium text-gic-muted">{t('fields.scanFile')}</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
              className="mt-1 block w-full text-[12px] file:mr-3 file:rounded-lg file:border-0 file:bg-gic-violet/10 file:px-3 file:py-1.5 file:text-[11px] file:font-medium file:text-gic-violet"
              onChange={(e) => setEditFile(e.target.files?.[0] || null)}
            />
            {entry?.filePath && !editFile && (
              <p className="mt-1 text-[11px] text-gic-muted">
                {t('fields.currentFile')}: <FilePieceLinks path={entry.filePath} />
              </p>
            )}
          </label>
        </form>
      </Modal>

      <Modal open={emailOpen} title={t('actions.sendEmail')} onClose={() => setEmailOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setEmailOpen(false)}>{t('common.cancel')}</Btn><Btn icon={Send} onClick={sendEmail}>{t('actions.send')}</Btn></>}
      >
        <div className="space-y-3">
          <Input label={t('fields.recipientEmail')} value={emailTo} onChange={(e) => setEmailTo(e.target.value)} type="email" />
          <label className="block text-[11px] font-medium text-gic-muted">{t('fields.message')}</label>
          <textarea className="w-full rounded-lg border border-gic-border bg-white px-3 py-2 text-[12px]" value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={4} />
        </div>
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-gic-muted uppercase">{label}</p>
      <div className="font-medium">{value}</div>
    </div>
  );
}
