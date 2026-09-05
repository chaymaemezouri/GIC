import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, Shield, ExternalLink, Users, Layers, Activity } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ActionBadge, auditEntityLabel, auditEntityLink, formatAuditDateTime } from '../lib/auditDisplay';
import { Btn, PageBackLink, Card, KpiCard } from '../components/ui';
import { useI18n } from '../i18n/I18nContext';

type AuditLog = {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string; email?: string } | null;
};

export default function AuditDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const [item, setItem] = useState<AuditLog | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api<AuditLog>(`/audit/${id}`)
      .then(setItem)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  function printFiche() {
    if (!item) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><body style="font-family:sans-serif;padding:24px;font-size:12px">
      <h1>Entrée audit — GIC</h1>
      <p><b>Date :</b> ${formatAuditDateTime(item.createdAt)}</p>
      <p><b>Utilisateur :</b> ${item.user ? `${item.user.firstName} ${item.user.lastName}` : 'Système'}</p>
      <p><b>Action :</b> ${item.action}</p>
      <p><b>Entité :</b> ${auditEntityLabel(item.entity)} ${item.entityId || ''}</p>
      <p><b>Détails :</b> ${item.details || '—'}</p>
      <p><b>IP :</b> ${item.ipAddress || '—'}</p>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (!item && !error) return <p className="text-[12px] text-gic-muted p-6">{t('common.loading')}</p>;

  if (error && !item) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/audit" className="mt-2" />
      </Card>
    );
  }

  const entityPath = auditEntityLink(item!.entity, item!.entityId);
  const userPath = item!.user ? `/utilisateurs/${item!.user.id}` : null;

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/audit" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            <div className="mac-detail-photo-fallback">
              <Shield size={28} strokeWidth={1.5} className="text-gic-muted" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.auditJournal')}</p>
            <h1 className="mac-detail-name truncate capitalize">{item!.action.replace(/_/g, ' ')}</h1>
            <p className="mac-detail-meta">
              {formatAuditDateTime(item!.createdAt)}
              {' · '}{auditEntityLabel(item!.entity)}
              {item!.entityId ? ` #${item!.entityId.slice(0, 8)}…` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <ActionBadge action={item!.action} />
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          <Btn variant="secondary" icon={Printer} onClick={printFiche}>{t('common.print')}</Btn>
                 </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-3 mb-4">
        <KpiCard title={t('columns.user')} value={item!.user ? `${item!.user.firstName} ${item!.user.lastName}` : t('common.system')} icon={Users} tone="violet" compact />
        <KpiCard title={t('columns.entity')} value={auditEntityLabel(item!.entity)} icon={Layers} tone="amber" compact />
        <KpiCard title={t('columns.ip')} value={item!.ipAddress || '—'} icon={Activity} tone="emerald" compact />
      </div>

      <Card>
        <div className="grid sm:grid-cols-2 gap-4 text-[12px]">
          <div>
            <p className="text-gic-muted text-[10px] uppercase">{t('fields.dateTime')}</p>
            <p className="font-medium">{formatAuditDateTime(item!.createdAt)}</p>
          </div>
          <div>
            <p className="text-gic-muted text-[10px] uppercase">{t('columns.action')}</p>
            <div className="mt-0.5"><ActionBadge action={item!.action} /></div>
          </div>
          <div>
            <p className="text-gic-muted text-[10px] uppercase">{t('columns.user')}</p>
            {item!.user ? (
              <Link to={userPath!} className="mac-table-ref inline-flex items-center gap-1">
                {item!.user.firstName} {item!.user.lastName} <ExternalLink size={10} />
              </Link>
            ) : (
              <p>{t('msg.systemUnauthenticated')}</p>
            )}
            {item!.user?.email && <p className="text-gic-muted text-[11px]">{item!.user.email}</p>}
          </div>
          <div>
            <p className="text-gic-muted text-[10px] uppercase">{t('columns.entity')}</p>
            <p className="font-medium">{auditEntityLabel(item!.entity)}</p>
            {item!.entityId && (
              entityPath ? (
                <Link to={entityPath} className="mac-table-ref inline-flex items-center gap-1 text-[11px] font-mono mt-0.5">
                  {item!.entityId} <ExternalLink size={10} />
                </Link>
              ) : (
                <p className="font-mono text-[11px] text-gic-muted mt-0.5">{item!.entityId}</p>
              )
            )}
          </div>
          <div className="sm:col-span-2">
            <p className="text-gic-muted text-[10px] uppercase">{t('columns.details')}</p>
            <p className="whitespace-pre-wrap leading-relaxed mt-0.5">{item!.details || '—'}</p>
          </div>
          <div>
            <p className="text-gic-muted text-[10px] uppercase">{t('fields.ipAddress')}</p>
            <p className="font-mono text-[11px]">{item!.ipAddress || '—'}</p>
          </div>
          <div>
            <p className="text-gic-muted text-[10px] uppercase">{t('fields.entryId')}</p>
            <p className="font-mono text-[11px] text-gic-muted">{item!.id}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
