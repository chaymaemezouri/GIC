import { appAlert } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Pencil, Trash2, Printer, Phone, MapPin, Wallet, TrendingDown, TrendingUp, Hash,
  Info,
} from 'lucide-react';
import { api, formatDate, formatMad } from '../lib/api';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, Modal, StatusPill, TableWrap, Td, Th,
  PageBackLink,
} from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';
import { ReconnuFormFields, emptyReconnuForm, reconnuToForm, type ReconnuFormData } from '../components/ReconnuFormFields';
import { officePurposeLabel } from '../components/OfficeCashFormFields';
import { printOfficeCashReceipt } from '../lib/printOfficeCash';

type Tab = 'infos' | 'mouvements';

type Movement = {
  id: string;
  date: string;
  direction: string;
  amount: number;
  purpose: string;
  designation: string;
  remark?: string;
  proofFile?: string;
  chantier?: { id: string; name: string };
};

export default function ReconnuDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [reconnu, setReconnu] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('mouvements');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [form, setForm] = useState<ReconnuFormData>(emptyReconnuForm());

  function load() {
    if (!id) return;
    setError('');
    api(`/reconnus/${id}`)
      .then(setReconnu)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  useEffect(() => { load(); }, [id]);

  function openEdit() {
    if (!reconnu) return;
    setForm(reconnuToForm(reconnu));
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/reconnus/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          phone1: form.phone1.trim() || null,
          phone2: form.phone2.trim() || null,
          address: form.address.trim() || null,
          relation: form.relation.trim() || null,
          remark: form.remark.trim() || null,
        }),
      });
      setEditOpen(false);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function confirmDelete() {
    if (!deleteMotif.trim()) return;
    try {
      await api(`/reconnus/${id}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      navigate('/reconnus');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printFiche() {
    if (!reconnu) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const movements: Movement[] = reconnu.movements || [];
    w.document.write(`<html><head><title>Reconnu ${reconnu.firstName} ${reconnu.lastName}</title></head><body style="font-family:sans-serif;padding:24px">
      <h1>Fiche reconnu — GIC</h1>
      <h2>${reconnu.reference || ''} — ${reconnu.firstName} ${reconnu.lastName}</h2>
      <p><b>Relation :</b> ${reconnu.relation || '—'}</p>
      <p><b>Téléphone :</b> ${reconnu.phone1 || '—'} ${reconnu.phone2 ? '/ ' + reconnu.phone2 : ''}</p>
      <p><b>Adresse :</b> ${reconnu.address || '—'}</p>
      <p><b>Remarque :</b> ${reconnu.remark || '—'}</p>
      <p><b>Statut :</b> ${reconnu.isActive ? 'Actif' : 'Inactif'}</p>
      <h3>Mouvements récents (${movements.length})</h3>
      <ul>${movements.map((m) => `<li>${formatDate(m.date)} — ${m.designation} — ${m.direction === 'sortie' ? '−' : '+'}${formatMad(m.amount)}</li>`).join('')}</ul>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (!reconnu && !error) return <p className="text-[12px] text-gic-muted p-6">{t('common.loading')}</p>;

  if (error && !reconnu) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/reconnus" className="mt-2" />
      </Card>
    );
  }

  const movements: Movement[] = reconnu.movements || [];

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/reconnus" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            <div className="mac-detail-photo-fallback">
              {reconnu.firstName[0]}{reconnu.lastName[0]}
            </div>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.reconnuCash')}</p>
            <h1 className="mac-detail-name truncate">{reconnu.firstName} {reconnu.lastName}</h1>
            <p className="mac-detail-meta">
              {reconnu.reference || '—'}
              {reconnu.relation ? ` · ${reconnu.relation}` : ''}
              {!reconnu.isActive && t('msg.inactiveSuffix')}
              {t('msg.sinceDate', { date: formatDate(reconnu.createdAt) })}
            </p>
            <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-gic-muted">
              {reconnu.phone1 && (
                <a href={`tel:${reconnu.phone1}`} className="flex items-center gap-1 hover:text-[#007aff]">
                  <Phone size={12} /> {reconnu.phone1}
                </a>
              )}
              {reconnu.address && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} /> {reconnu.address}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          <Btn variant="secondary" icon={Printer} onClick={printFiche}>{t('common.print')}</Btn>
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteOpen(true); setDeleteMotif(''); }} />
          </div>
        </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-4 mb-4">
        <KpiCard title={t('tabs.movements')} value={reconnu._count?.movements ?? movements.length} icon={Wallet} tone="violet" />
        <KpiCard title={t('kpi.entries')} value={formatMad(reconnu.stats?.totalEntrees ?? 0)} icon={TrendingUp} tone="emerald" compact />
        <KpiCard title={t('fields.cashOut')} value={formatMad(reconnu.stats?.totalSorties ?? 0)} icon={TrendingDown} tone="coral" compact />
        <KpiCard title={t('common.status')} value={reconnu.isActive === false ? t('status.inactive') : t('status.active')} icon={Hash} tone="amber" />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsRecognizedAria')}
            items={[
              { id: 'mouvements', label: t('tabs.movements'), icon: Wallet, badge: movements.length },
              { id: 'infos', label: t('tabs.informations'), icon: Info },
            ]}
          />
        }
      >
      {tab === 'infos' && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 text-[12px]">
            <div className="flex items-start gap-2">
              <Hash size={14} className="text-gic-muted mt-0.5" />
              <div>
                <p className="mac-info-label">{t('fields.reference')}</p>
                <p className="mac-info-value">{reconnu.reference || '—'}</p>
              </div>
            </div>
            <div>
              <p className="mac-info-label">{t('fields.status')}</p>
              <StatusPill status={reconnu.isActive === false ? 'inactif' : 'actif'} quiet />
            </div>
            <div>
              <p className="mac-info-label">{t('fields.relation')}</p>
              <p className="mac-info-value">{reconnu.relation || '—'}</p>
            </div>
            <div>
              <p className="mac-info-label">{t('fields.phones')}</p>
              <p className="mac-info-value">{[reconnu.phone1, reconnu.phone2].filter(Boolean).join(' / ') || '—'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="mac-info-label">{t('fields.address')}</p>
              <p className="mac-info-value">{reconnu.address || '—'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="mac-info-label">{t('fields.remark')}</p>
              <p className="mac-info-value">{reconnu.remark || '—'}</p>
            </div>
          </div>
        </Card>
      )}

      {tab === 'mouvements' && (
        <Card padding={false}>
          {movements.length === 0 ? (
            <EmptyState title={t('msg.emptyCash')} />
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('columns.date')}</Th>
                  <Th mac>{t('columns.designation')}</Th>
                  <Th mac>{t('columns.motif')}</Th>
                  <Th mac>{t('columns.debit')}</Th>
                  <Th mac>{t('columns.credit')}</Th>
                  <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <Td mac className="mac-table-muted">{formatDate(m.date)}</Td>
                    <Td mac>
                      <Link to="/caisse" className="mac-table-ref">{m.designation}</Link>
                      {m.chantier && (
                        <span className="block text-[10px] text-gic-muted">{m.chantier.name}</span>
                      )}
                    </Td>
                    <Td mac>
                      <span className="mac-chip mac-chip-blue">{officePurposeLabel(m.purpose, t)}</span>
                    </Td>
                    <Td mac className="text-gic-coral font-medium">
                      {m.direction === 'sortie' ? formatMad(m.amount) : '—'}
                    </Td>
                    <Td mac className="text-gic-emerald font-medium">
                      {m.direction === 'entree' ? formatMad(m.amount) : '—'}
                    </Td>
                    <Td mac className="mac-td-actions">
                      <div className="mac-actions">
                        <MacActionBtn
                          icon={Printer}
                          tone="gray"
                          title={t('common.print')}
                          onClick={() => printOfficeCashReceipt({ ...m, reconnu })}
                        />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      </DetailShell>

      <Modal
        open={editOpen}
        size="lg"
        title={t('actions.editRecognized')}
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="reconnu-edit-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="reconnu-edit-form" onSubmit={save}>
          <ReconnuFormFields form={form} setForm={setForm} />
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        title={t('actions.deleteRecognized')}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn>
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
