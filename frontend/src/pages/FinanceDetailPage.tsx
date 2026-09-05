import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Printer, History, Paperclip, Wallet, TrendingDown, TrendingUp, Info as InfoIcon } from 'lucide-react';
import { api, formatDate, formatMad } from '../lib/api';
import { Btn, Card, KpiCard, PageBackLink, TableWrap, Td, Th } from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';
import { printMovementReceipt } from '../lib/printMovement';
import { FilePieceLinks } from '../lib/documentDisplay';

type Tab = 'infos' | 'historique';

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

export default function FinanceDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [movement, setMovement] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('infos');
  const [error, setError] = useState('');

  function load() {
    if (!id) return;
    setError('');
    api(`/finance/movements/${id}`).then(setMovement).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/finance/movements/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
  }, [tab, id]);

  function sourceLink(m: { sourceHref?: string }) {
    return m.sourceHref || null;
  }

  if (!movement && !error) {
    return <p className="text-[12px] text-gic-muted p-6 text-center">{t('msg.loadingFinance')}</p>;
  }

  if (error && !movement) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/balance" className="mt-2" />
      </Card>
    );
  }

  const isDebit = Number(movement.debit) > 0;
  const amount = isDebit ? movement.debit : movement.credit;
  const holder = movement.account?.holderUser;
  const pieces = [
    { path: movement.invoiceFile, label: t('fields.invoice') },
    { path: movement.deliveryNoteFile, label: t('fields.deliveryNote') },
    { path: movement.receptionPvFile, label: t('fields.receptionPv') },
    { path: movement.proofFile, label: t('fields.proof') },
  ].filter((p) => p.path);

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/balance" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            <div className="mac-detail-photo-fallback">
              <Wallet size={22} strokeWidth={1.75} />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.balanceMovement')}</p>
            <h1 className="mac-detail-name truncate">{movement.designation}</h1>
            <p className="mac-detail-meta">
              {movement.account?.name || '—'}
              <span className="text-[#c7c7cc]"> · </span>
              {formatDate(movement.date)}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <span className={`mac-chip ${isDebit ? 'mac-chip-orange' : 'mac-chip-green'}`}>
                {isDebit ? t('fields.debit') : t('fields.credit')}
              </span>
              {movement.mode && (
                <span className="mac-chip mac-chip-gray capitalize">{movement.mode}</span>
              )}
              {movement.isAutomatic && (
                <span className="mac-chip mac-chip-blue">{t('msg.automatic')}</span>
              )}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          <Btn variant="secondary" icon={Printer} onClick={() => printMovementReceipt(movement)}>{t('common.print')}</Btn>
          {sourceLink(movement) && (
            <Btn variant="secondary" onClick={() => navigate(sourceLink(movement)!)}>{t('actions.viewSourceOp')}</Btn>
          )}
        </div>
      </div>

      <div className="mac-kpi-grid mac-kpi-grid-4 mb-4">
        <KpiCard
          title={t('fields.amount')}
          value={formatMadCompact(amount)}
          icon={isDebit ? TrendingDown : TrendingUp}
          tone={isDebit ? 'coral' : 'emerald'}
          compact
        />
        <KpiCard title={t('fields.debit')} value={Number(movement.debit) ? formatMadCompact(movement.debit) : '—'} icon={TrendingDown} tone="coral" compact />
        <KpiCard title={t('fields.credit')} value={Number(movement.credit) ? formatMadCompact(movement.credit) : '—'} icon={TrendingUp} tone="emerald" compact />
        <KpiCard title={t('fields.account')} value={movement.account?.name || '—'} icon={Wallet} tone="violet" compact />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsFinanceAria')}
            items={[
              { id: 'infos', label: t('tabs.informations'), icon: InfoIcon },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >

        {tab === 'infos' && (
          <div className="space-y-4 mt-1">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-[12px]">
              <Info label={t('fields.date')} value={formatDate(movement.date)} />
              <Info label={t('fields.account')} value={movement.account?.name || '—'} />
              <Info
                label={t('fields.accountHolder')}
                value={holder ? `${holder.firstName} ${holder.lastName}` : '—'}
              />
              <Info label={t('fields.rib')} value={movement.account?.rib || '—'} />
              <Info label={t('fields.bank')} value={movement.account?.bankName || '—'} />
              <Info label={t('fields.mode')} value={(movement.mode || '—').replace(/_/g, ' ')} />
              <Info label={t('fields.debit')} value={Number(movement.debit) ? formatMad(Number(movement.debit)) : '—'} />
              <Info label={t('fields.credit')} value={Number(movement.credit) ? formatMad(Number(movement.credit)) : '—'} />
              <Info label={t('fields.createdBy')} value={movement.createdBy || '—'} />
              <Info label={t('fields.createdAt')} value={formatDate(movement.createdAt)} />
            </div>
            {movement.remark && (
              <div className="mac-section-card">
                <p className="mac-info-label">{t('fields.remark')}</p>
                <p className="text-[12px] text-gic-muted whitespace-pre-wrap">{movement.remark}</p>
              </div>
            )}
            {pieces.length > 0 && (
              <div className="mac-section-card space-y-2">
                <p className="mac-info-label">{t('fields.proof')}</p>
                {pieces.map((p) => (
                  <div key={p.label} className="flex items-center gap-2 text-[12px]">
                    <Paperclip size={12} className="text-gic-muted shrink-0" />
                    <FilePieceLinks path={p.path} label={p.label} />
                  </div>
                ))}
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
