import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Shield, Clock, Link2, Info, History
} from 'lucide-react';
import { api, formatDate } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../lib/permissions';
import { Btn, Card, Input, KpiCard, MacActionBtn, Modal, StatusPill, Select, PageBackLink } from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';

type Tab = 'infos' | 'historique';

type UserDetail = {
  id: string;
  email: string;
  username?: string | null;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  internalStaff?: { id: string; reference?: string | null } | null;
  _count?: { auditLogs: number; notifications: number; managedChantiers: number };
};

const ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super Administrateur' },
  { value: 'ADMIN', label: 'Administrateur' },
  { value: 'COMPTABLE', label: 'Comptable' },
  { value: 'COMMERCIAL', label: 'Commercial' },
  { value: 'CHEF_CHANTIER', label: 'Chef de chantier' },
  { value: 'USER', label: 'Utilisateur' },
];

export default function UserDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: me } = useAuth();
  const [item, setItem] = useState<UserDetail | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    role: 'USER',
    isActive: 'true',
    password: '',
  });

  function load() {
    if (!id) return;
    setError('');
    api<UserDetail>(`/auth/users/${id}`).then(setItem).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/auth/users/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  useEffect(() => { load(); }, [id]);
  useEffect(() => { if (tab === 'historique') loadHistory(); }, [tab, id]);

  function openEdit() {
    if (!item) return;
    setForm({
      firstName: item.firstName,
      lastName: item.lastName,
      role: item.role,
      isActive: item.isActive ? 'true' : 'false',
      password: '',
    });
    setFormError('');
    setEditOpen(true);
  }

  useEffect(() => {
    if (item && (location.state as { edit?: boolean } | null)?.edit) {
      openEdit();
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [item, location.state, location.pathname, navigate]);

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setFormError('');
    try {
      const body: Record<string, unknown> = {
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role,
        isActive: form.isActive === 'true',
      };
      if (form.password) body.password = form.password;
      await api(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      setEditOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  if (!item && !error) return <p className="text-[12px] text-gic-muted p-6">{t('common.loading')}</p>;

  if (error && !item) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/utilisateurs" className="mt-2" />
      </Card>
    );
  }

  const isSelf = me?.id === item!.id;

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/utilisateurs" />
        <div className="mac-detail-hero-main">
          <div className="mac-avatar mac-avatar-lg bg-gic-violet-soft text-gic-violet font-semibold">
            {item!.firstName[0]}{item!.lastName[0]}
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.platformAccount')}</p>
            <h1 className="mac-detail-name truncate">{item!.firstName} {item!.lastName}</h1>
            <p className="mac-detail-meta">{item!.email}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusPill status={item!.isActive ? 'actif' : 'inactif'} quiet />
              <span className="mac-chip mac-chip-violet">{roleLabel(item!.role)}</span>
              {item!.twoFactorEnabled && <span className="mac-chip mac-chip-blue inline-flex items-center gap-1"><Shield size={11} /> 2FA</span>}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
        </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-3 mb-4">
        <KpiCard title={t('fields.lastLogin')} value={item!.lastLoginAt ? formatDate(item!.lastLoginAt) : '—'} icon={Clock} tone="amber" compact />
        <KpiCard title={t('msg.managedSites')} value={item!._count?.managedChantiers ?? 0} icon={Shield} tone="teal" compact />
        <KpiCard title={t('msg.rhLinked')} value={item!.internalStaff ? t('common.yes') : t('common.no')} icon={Link2} tone="violet" compact />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsUserAria')}
            items={[
              { id: 'infos', label: t('tabs.informations'), icon: Info },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >

        {tab === 'infos' && (
          <div className="grid sm:grid-cols-2 gap-4 text-[12px] mt-1">
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.email')}</p><p className="font-medium">{item!.email}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.role')}</p><p>{roleLabel(item!.role)}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.username')}</p><p>{item!.username || '—'}</p></div>
            <div><p className="text-gic-muted text-[10px] uppercase">{t('fields.createdAt')}</p><p>{formatDate(item!.createdAt)}</p></div>
            <div className="sm:col-span-2">
              <p className="text-gic-muted text-[10px] uppercase mb-1">{t('fields.internalTeamFiche')}</p>
              {item!.internalStaff ? (
                <Link to={`/equipe-interne/${item!.internalStaff.id}`} className="text-[#007aff] hover:underline inline-flex items-center gap-1">
                  <Link2 size={12} /> {item!.internalStaff.reference || t('actions.viewRhFiche')}
                </Link>
              ) : (
                <p className="text-gic-muted">{t('msg.noRhLinked')}</p>
              )}
            </div>
          </div>
        )}

        {tab === 'historique' && (
          history.length === 0 ? (
            <p className="text-[12px] text-gic-muted mt-1">{t('msg.emptyHistoryShort')}</p>
          ) : (
            <div className="space-y-2 mt-1">
              {history.map((h) => (
                <div key={h.id} className="rounded-xl border border-gic-border px-3 py-2 text-[11px]">
                  <p className="font-medium capitalize">{h.action} — {h.entity}</p>
                  <p className="text-gic-muted">{h.details || '—'}</p>
                  <p className="text-[10px] text-gic-muted mt-1">{formatDate(h.createdAt)}</p>
                </div>
              ))}
            </div>
          )
        )}
            </DetailShell>

      <Modal open={editOpen} title={t('actions.editAccount')} onClose={() => setEditOpen(false)} size="md"
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-user-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="edit-user-form" onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-2">
          <Input label={t('fields.firstName') + ' *'} required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <Input label={t('fields.lastName') + ' *'} required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          <Select label={t('fields.role')} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.filter((r) => me?.role === 'SUPER_ADMIN' || r.value !== 'SUPER_ADMIN').map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
          <Select label={t('fields.status')} value={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.value })} disabled={isSelf}>
            <option value="true">{t('status.active')}</option>
            <option value="false">{t('status.inactive')}</option>
          </Select>
          <Input label={t('fields.newPassword')} type="password" className="sm:col-span-2" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {isSelf && <p className="sm:col-span-2 text-[11px] text-gic-muted">{t('msg.cannotDisableSelf')}</p>}
          {formError && <p className="sm:col-span-2 text-[11px] text-gic-coral">{formError}</p>}
        </form>
      </Modal>
    </div>
  );
}
