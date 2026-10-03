import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate, formatMad, type PaginatedResponse } from '../lib/api';
import { Card, MacToolbarTabs, PageHeader, Pagination, TableWrap, Td, Th } from '../components/ui';
import { PurchasePaymentPill, PurchaseStatusPill } from '../components/PurchaseBadges';
import SalairesPage from './SalairesPage';
import SalairesEquipeInternePage from './SalairesEquipeInternePage';
import { useI18n } from '../i18n/I18nContext';

type Tab = 'achats' | 'main_oeuvre' | 'chauffeur' | 'equipe_interne';
type Purchase = {
  id: string;
  reference: string;
  date: string;
  designation: string;
  totalPrice: number;
  paidAmount: number;
  remaining: number;
  status: string;
  paymentStatus: string;
  supplier?: { companyName: string };
  chantier?: { name: string } | null;
};

export default function OperationsPaiementsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('achats');
  const [items, setItems] = useState<Purchase[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tab !== 'achats') return;
    setLoading(true);
    api<PaginatedResponse<Purchase> & { totals?: { remaining: number } }>(`/achats/purchases?paymentStatus=a_payer&sort=date&order=desc&page=${page}&limit=20`)
      .then((res) => {
        setItems(res.items || []);
        setPages(res.pages || 1);
        setTotal(res.total || 0);
      })
      .catch(() => { setItems([]); setPages(1); setTotal(0); })
      .finally(() => setLoading(false));
  }, [tab, page]);

  return (
    <div className="space-y-0">
      <PageHeader mac title={t('nav.opsPayments')} subtitle={t('pages.opsPaymentsSubtitle')} />
      <Card className="mb-4 !pb-0">
        <MacToolbarTabs
          scopeLabel={t('fields.type')}
          scopeTabs={[
            { id: 'achats', label: t('nav.purchases') },
            { id: 'main_oeuvre', label: t('nav.workforce') },
            { id: 'chauffeur', label: t('nav.drivers') },
            { id: 'equipe_interne', label: t('nav.internalTeam') },
          ]}
          scope={tab}
          onScopeChange={(id) => { setTab(id as Tab); setPage(1); }}
        />
      </Card>

      {tab === 'achats' && (
        <Card padding={false}>
          {loading ? (
            <p className="p-6 text-center text-[12px] text-gic-muted">{t('common.loading')}</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-[12px] text-gic-muted">{t('msg.noData')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('fields.reference')}</Th>
                  <Th mac>{t('common.date')}</Th>
                  <Th mac>{t('fields.designation')}</Th>
                  <Th mac>{t('fields.supplier')}</Th>
                  <Th mac>{t('fields.chantier')}</Th>
                  <Th mac>{t('common.amount')}</Th>
                  <Th mac>{t('siteOps.payRemaining')}</Th>
                  <Th mac>{t('common.status')}</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <Td mac><Link to={`/achats/${p.id}`} className="mac-table-ref">{p.reference}</Link></Td>
                    <Td mac>{formatDate(p.date)}</Td>
                    <Td mac>{p.designation}</Td>
                    <Td mac>{p.supplier?.companyName || '—'}</Td>
                    <Td mac>{p.chantier?.name || '—'}</Td>
                    <Td mac>{formatMad(p.totalPrice)}</Td>
                    <Td mac className="font-medium">{formatMad(p.remaining)}</Td>
                    <Td mac>
                      <PurchaseStatusPill status={p.status} />
                      <span className="ml-1"><PurchasePaymentPill status={p.paymentStatus} /></span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <Pagination page={page} pages={pages} total={total} limit={20} onPage={setPage} mac />
        </Card>
      )}

      {tab === 'main_oeuvre' && <SalairesPage embedded mode="main_oeuvre" />}
      {tab === 'chauffeur' && <SalairesPage embedded mode="chauffeur" />}
      {tab === 'equipe_interne' && <SalairesEquipeInternePage embedded />}
    </div>
  );
}
