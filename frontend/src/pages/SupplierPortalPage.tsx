import { useEffect, useState, Fragment } from 'react';

import { Link } from 'react-router-dom';

import { LogOut, Upload, FileText, ChevronDown, ChevronUp } from 'lucide-react';

import { supplierApi, supplierUploadForm, formatMad, clearSupplierToken, getSupplierToken } from '../lib/api';

import { Btn, Card, PageHeader, Select, StatusPill, TableWrap, Td, Th } from '../components/ui';
import { useI18n } from '../i18n/I18nContext';



type Doc = { id: string; name: string; category: string; path: string; createdAt: string };



export default function SupplierPortalPage() {
  const { t } = useI18n();

  const [profile, setProfile] = useState<any>(null);

  const [data, setData] = useState<{ purchases: any[]; total: number }>({ purchases: [], total: 0 });

  const [expanded, setExpanded] = useState<string | null>(null);

  const [docs, setDocs] = useState<Record<string, Doc[]>>({});

  const [uploadCat, setUploadCat] = useState('devis');

  const [uploadFile, setUploadFile] = useState<File | null>(null);

  function docLabel(category: string) {
    const map: Record<string, string> = {
      devis: t('fields.quote'),
      facture: t('fields.invoice'),
      bon_livraison: t('fields.deliveryNote'),
    };
    return map[category] || category;
  }

  function loadPurchases() {

    supplierApi<{ purchases: any[]; total: number }>('/portal/purchases').then(setData);

  }



  useEffect(() => {

    if (!getSupplierToken()) return;

    supplierApi('/portal/profile').then(setProfile);

    loadPurchases();

  }, []);



  async function togglePurchase(id: string) {

    if (expanded === id) {

      setExpanded(null);

      return;

    }

    setExpanded(id);

    if (!docs[id]) {

      const list = await supplierApi<Doc[]>(`/portal/purchases/${id}/documents`);

      setDocs((d) => ({ ...d, [id]: list }));

    }

  }



  async function uploadDoc(purchaseId: string) {

    if (!uploadFile) return;

    const form = new FormData();

    form.append('file', uploadFile);

    form.append('category', uploadCat);

    await supplierUploadForm(`/portal/purchases/${purchaseId}/documents`, form);

    setUploadFile(null);

    const list = await supplierApi<Doc[]>(`/portal/purchases/${purchaseId}/documents`);

    setDocs((d) => ({ ...d, [purchaseId]: list }));

    loadPurchases();

  }



  if (!getSupplierToken()) {

    return (

      <div className="min-h-screen flex items-center justify-center">

        <Link to="/portal/login" className="text-gic-violet">{t('msg.connectPlease')}</Link>

      </div>

    );

  }



  function logout() {

    clearSupplierToken();

    window.location.href = '/portal/login';

  }



  return (

    <div className="min-h-screen bg-gic-bg p-4 lg:p-6">

      <PageHeader

        title={profile?.companyName || t('pages.supplierPortal')}

        subtitle={profile?.reference}

        actions={

          <Btn variant="secondary" icon={LogOut} onClick={logout}>{t('auth.logout')}</Btn>

        }

      />

      <Card className="mb-4">

        <p className="text-[12px] text-gic-muted">{t('msg.emailPhoneMeta', { email: profile?.email, phone: profile?.phone1 || '—' })}</p>

        <p className="text-[11px] text-gic-muted mt-1">{t('msg.supplierPortalHint')}</p>

      </Card>

      <Card padding={false}>

        <div className="px-4 py-3 border-b border-gic-border">

          <h2 className="text-sm font-semibold">{t('detail.myPurchases', { count: data.purchases.length })}</h2>

        </div>

        <TableWrap>

          <thead>

            <tr>

              <Th> </Th>

              <Th>{t('columns.ref')}</Th>

              <Th>{t('columns.date')}</Th>

              <Th>{t('columns.designation')}</Th>

              <Th>{t('columns.chantier')}</Th>

              <Th>{t('columns.amount')}</Th>

              <Th>{t('columns.status')}</Th>

              <Th>{t('columns.docs')}</Th>

            </tr>

          </thead>

          <tbody>

            {data.purchases.map((p) => (
              <Fragment key={p.id}>
                <tr className="cursor-pointer hover:bg-gray-50/80" onClick={() => togglePurchase(p.id)}>

                  <Td>{expanded === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Td>

                  <Td className="font-medium">{p.reference}</Td>

                  <Td>{new Date(p.date).toLocaleDateString('fr-MA')}</Td>

                  <Td>{p.designation}</Td>

                  <Td>{p.chantier?.name || '—'}</Td>

                  <Td>{formatMad(p.totalPrice)}</Td>

                  <Td><StatusPill status={p.status} /></Td>

                  <Td className="text-gic-muted">{p.docCount || 0}</Td>

                </tr>

                {expanded === p.id && (

                  <tr>
                    <td colSpan={8} className="bg-gray-50/50 px-4 py-3">

                      <div className="py-3 px-2 space-y-3">

                        <div className="flex flex-wrap gap-2 items-end">

                          <Select label={t('common.type')} value={uploadCat} onChange={(e) => setUploadCat(e.target.value)}>

                            <option value="devis">{t('fields.quote')}</option>

                            <option value="facture">{t('fields.invoice')}</option>

                            <option value="bon_livraison">{t('fields.deliveryNote')}</option>

                          </Select>

                          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" className="text-[11px]" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />

                          <Btn icon={Upload} onClick={() => uploadDoc(p.id)} disabled={!uploadFile}>{t('actions.deposit')}</Btn>

                        </div>

                        {(docs[p.id] || []).length === 0 ? (

                          <p className="text-[11px] text-gic-muted">{t('msg.emptyUploadedDocs')}</p>

                        ) : (

                          <ul className="space-y-1">

                            {(docs[p.id] || []).map((d) => (

                              <li key={d.id} className="flex items-center gap-2 text-[11px]">

                                <FileText size={14} className="text-gic-violet" />

                                <span className="font-medium">{docLabel(d.category)}</span>

                                <span className="text-gic-muted truncate">{d.name}</span>

                                <a href={d.path} target="_blank" rel="noreferrer" className="text-gic-violet hover:underline ml-auto">{t('actions.open')}</a>

                              </li>

                            ))}

                          </ul>

                        )}

                      </div>

                    </td>
                  </tr>

                )}

              </Fragment>
            ))}

          </tbody>

        </TableWrap>

        <div className="px-4 py-3 border-t border-gic-border text-[12px] font-semibold text-right">

          {t('msg.totalColon', { amount: formatMad(data.total) })}

        </div>

      </Card>

    </div>

  );

}
