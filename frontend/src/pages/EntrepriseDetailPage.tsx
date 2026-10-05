import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Building2, Hash, Mail, MapPin, Pencil, Phone, Trash2, Wallet } from 'lucide-react';
import { api, formatMad } from '../lib/api';
import { appAlert, appConfirm } from '../lib/dialog';
import {
  Btn, Card, Input, KpiCard, MacActionBtn, Modal, PageBackLink, TableWrap, Td, Textarea, Th,
} from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import {
  isStOpen, stScopeLine, SubcontractContractView,
  type StFollow, type Subcontractor,
} from '../components/ChantierExtraPanels';
import { useI18n } from '../i18n/I18nContext';

type EntrepriseDetail = {
  id: string;
  reference: string;
  companyName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  ice?: string | null;
  remark?: string | null;
  isActive?: boolean;
  subcontractors?: Subcontractor[];
  totals?: { count: number; amount: number; paid: number; remaining: number; sites?: number };
};

const emptyForm = () => ({ companyName: '', phone: '', email: '', address: '', ice: '', remark: '' });

export default function EntrepriseDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<EntrepriseDetail | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'contrats' | 'infos'>('contrats');
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [detail, setDetail] = useState<Subcontractor | null>(null);

  function load() {
    if (!id) return;
    setError('');
    api<EntrepriseDetail>(`/entreprises/${id}`)
      .then((next) => {
        setItem(next);
        setDetail((current) => {
          if (!current) return null;
          return (next.subcontractors || []).find((row) => row.id === current.id) || current;
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  useEffect(() => {
    setItem(null);
    setDetail(null);
    load();
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    try {
      await api(`/entreprises/${id}`, { method: 'PUT', body: JSON.stringify(form) });
      setEditOpen(false);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function remove() {
    if (!id || !await appConfirm(t('msg.confirmDelete'))) return;
    try {
      await api(`/entreprises/${id}`, { method: 'DELETE' });
      navigate('/entreprises');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function toggleFollow(follow: StFollow) {
    if (!detail?.chantierId && !detail?.chantier?.id) return;
    const chantierId = detail.chantierId || detail.chantier?.id;
    try {
      const updated = await api<Subcontractor>(`/chantiers/${chantierId}/subcontractors/${detail.id}/follows/${follow.id}`, {
        method: 'PUT',
        body: JSON.stringify({ validated: !follow.validated }),
      });
      setDetail({ ...updated, chantierId, chantier: detail.chantier });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function addPayment(payload: { amount: number; kind: string; paymentMode: string; phaseLabel: string | null }) {
    if (!detail) return;
    const chantierId = detail.chantierId || detail.chantier?.id;
    if (!chantierId) return;
    try {
      const updated = await api<Subcontractor>(`/chantiers/${chantierId}/subcontractors/${detail.id}/payments`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setDetail({ ...updated, chantierId, chantier: detail.chantier });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const sites = useMemo(() => {
    const rows = item?.subcontractors || [];
    const map = new Map<string, { chantierId: string; name: string; items: Subcontractor[] }>();
    for (const row of rows) {
      const chantierId = row.chantierId || row.chantier?.id || '';
      const group = map.get(chantierId) || {
        chantierId,
        name: row.chantier?.name || chantierId,
        items: [],
      };
      group.items.push({ ...row, chantierId });
      map.set(chantierId, group);
    }
    return [...map.values()];
  }, [item]);

  if (error && !item) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/entreprises" className="mt-2" />
      </Card>
    );
  }

  if (!item) {
    return <p className="p-6 text-[12px] text-gic-muted">{t('common.loading')}</p>;
  }

  const rows = item.subcontractors || [];
  const totals = item.totals || {
    count: rows.length,
    amount: 0,
    paid: 0,
    remaining: 0,
    sites: sites.length,
  };

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/entreprises" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            <div className="mac-detail-photo-fallback text-[#007aff]">
              <Building2 size={28} strokeWidth={1.5} />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.entreprise360')}</p>
            <h1 className="mac-detail-name truncate">{item.companyName}</h1>
            <p className="mac-detail-meta">
              {item.reference}
              {item.ice ? ` · ICE ${item.ice}` : ''}
              {!item.isActive ? t('msg.inactiveSuffix') : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gic-muted">
              {item.phone && (
                <a href={`tel:${item.phone}`} className="flex items-center gap-1 hover:text-[#007aff]">
                  <Phone size={12} /> {item.phone}
                </a>
              )}
              {item.email && (
                <a href={`mailto:${item.email}`} className="flex items-center gap-1 hover:text-[#007aff]">
                  <Mail size={12} /> {item.email}
                </a>
              )}
              {item.address && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} /> {item.address}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          <div className="mac-action-group ml-0.5">
            <MacActionBtn
              icon={Pencil}
              tone="orange"
              title={t('common.edit')}
              onClick={() => {
                setForm({
                  companyName: item.companyName,
                  phone: item.phone || '',
                  email: item.email || '',
                  address: item.address || '',
                  ice: item.ice || '',
                  remark: item.remark || '',
                });
                setEditOpen(true);
              }}
            />
            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={remove} />
          </div>
        </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-4 mb-4">
        <KpiCard title={t('pages.entrepriseSites')} value={String(totals.sites ?? sites.length)} icon={Building2} tone="teal" compact />
        <KpiCard title={t('pages.entrepriseSubcontracts')} value={String(totals.count)} icon={Building2} tone="violet" compact />
        <KpiCard title={t('siteOps.paid')} value={formatMad(totals.paid)} icon={Wallet} tone="emerald" compact />
        <KpiCard title={t('siteOps.moneyLeft')} value={formatMad(totals.remaining)} icon={Wallet} tone="coral" compact />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(next) => setTab(next as 'contrats' | 'infos')}
            ariaLabel={t('detail.sectionsEntrepriseAria')}
            items={[
              { id: 'contrats', label: t('pages.entrepriseSubcontracts'), icon: Building2, badge: totals.count },
              { id: 'infos', label: t('tabs.informations'), icon: Hash },
            ]}
          />
        }
      >
        {tab === 'infos' && (
          <div className="mac-section-card grid gap-4 text-[12px] sm:grid-cols-2">
            <div><p className="text-gic-muted">{t('columns.reference')}</p><p className="font-medium">{item.reference}</p></div>
            <div><p className="text-gic-muted">{t('fields.companyName')}</p><p className="font-medium">{item.companyName}</p></div>
            <div><p className="text-gic-muted">{t('fields.ice')}</p><p className="font-medium">{item.ice || '—'}</p></div>
            <div><p className="text-gic-muted">{t('fields.phone')}</p><p className="font-medium">{item.phone || '—'}</p></div>
            <div><p className="text-gic-muted">{t('fields.email')}</p><p className="font-medium">{item.email || '—'}</p></div>
            <div className="sm:col-span-2"><p className="text-gic-muted">{t('fields.address')}</p><p className="font-medium">{item.address || '—'}</p></div>
            <div className="sm:col-span-2"><p className="text-gic-muted">{t('fields.remark')}</p><p className="font-medium">{item.remark || '—'}</p></div>
          </div>
        )}

        {tab === 'contrats' && (
          <div className="space-y-3">
            {detail ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Btn variant="secondary" onClick={() => setDetail(null)}>{t('detail.stBackToList')}</Btn>
                  {(detail.chantierId || detail.chantier?.id) && (
                    <Link
                      to={`/chantiers/${detail.chantierId || detail.chantier?.id}?tab=subcontractors`}
                      className="text-[12px] font-medium text-[#007aff] hover:underline"
                    >
                      {t('detail.stOpenSite')}
                    </Link>
                  )}
                </div>
                <div className="mac-section-card">
                  <p className="text-[16px] font-semibold">{detail.companyName}</p>
                  <p className="text-[12px] text-gic-muted">
                    {detail.chantier?.name || '—'} · {stScopeLine(detail, t('msg.wholeSite'), t('detail.subcontractWhole'))}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-4 text-[12px]">
                    <div><span className="text-gic-muted">{t('fields.amount')}</span><p className="font-medium">{formatMad(detail.amount || 0)}</p></div>
                    <div><span className="text-gic-muted">{t('siteOps.paid')}</span><p className="font-medium">{formatMad(detail.paidAmount || 0)}</p></div>
                    <div><span className="text-gic-muted">{t('siteOps.progress')}</span><p className="font-medium">{Math.round(Number(detail.progressPct || 0))} %</p></div>
                    <div>
                      <span className={`mac-chip ${isStOpen(detail) ? 'mac-chip-orange' : 'mac-chip-green'}`}>
                        {isStOpen(detail) ? t('detail.stOpen') : t('detail.stDone')}
                      </span>
                    </div>
                  </div>
                </div>
                <SubcontractContractView item={detail} onToggleFollow={toggleFollow} onAddPayment={addPayment} />
              </>
            ) : rows.length === 0 ? (
              <div className="mac-section-card py-10 text-center text-[12px] text-gic-muted">
                {t('msg.emptySubcontractors')}
              </div>
            ) : sites.map((site) => {
              const amount = site.items.reduce((s, i) => s + Number(i.amount || 0), 0);
              const paid = site.items.reduce((s, i) => s + Number(i.paidAmount || 0), 0);
              return (
                <div key={site.chantierId} className="mac-section-card !p-0 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] px-4 py-3">
                    <Link to={`/chantiers/${site.chantierId}?tab=subcontractors`} className="text-[14px] font-semibold text-[#007aff] hover:underline">
                      {site.name}
                    </Link>
                    <div className="flex gap-1.5 text-[11px]">
                      <span className="mac-chip mac-chip-gray">{formatMad(amount)}</span>
                      <span className="mac-chip mac-chip-emerald">{formatMad(paid)}</span>
                    </div>
                  </div>
                  <TableWrap mac>
                    <thead>
                      <tr>
                        <Th mac>{t('detail.stContract')}</Th>
                        <Th mac>{t('fields.amount')}</Th>
                        <Th mac>{t('siteOps.progress')}</Th>
                        <Th mac>{t('siteOps.paid')}</Th>
                        <Th mac>{t('fields.status')}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {site.items.map((row) => (
                        <tr key={row.id} className="cursor-pointer" onClick={() => setDetail(row)}>
                          <Td mac>
                            <span className="font-medium">{row.corpsEtat || row.phaseLabel || t('detail.stContract')}</span>
                            <span className="block text-[10px] text-gic-muted">
                              {stScopeLine(row, t('msg.wholeSite'), t('detail.subcontractWhole'))}
                            </span>
                          </Td>
                          <Td mac>{row.amount != null ? formatMad(row.amount) : '—'}</Td>
                          <Td mac>{Math.round(Number(row.progressPct || 0))} %</Td>
                          <Td mac>{formatMad(row.paidAmount || 0)}</Td>
                          <Td mac>
                            <span className={`mac-chip ${isStOpen(row) ? 'mac-chip-orange' : 'mac-chip-green'}`}>
                              {isStOpen(row) ? t('detail.stOpen') : t('detail.stDone')}
                            </span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                </div>
              );
            })}
          </div>
        )}
      </DetailShell>

      <Modal
        open={editOpen}
        title={t('pages.editEntreprise')}
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="ent-edit-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="ent-edit-form" onSubmit={save} className="grid gap-3">
          <Input label={t('fields.companyRequired')} required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          <Input label={t('fields.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label={t('fields.email')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label={t('fields.ice')} value={form.ice} onChange={(e) => setForm({ ...form, ice: e.target.value })} />
          <Input label={t('fields.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Textarea label={t('fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
        </form>
      </Modal>
    </div>
  );
}
