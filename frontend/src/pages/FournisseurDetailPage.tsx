import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, History, Key, Printer, ShoppingCart, Truck, Plus, Mail, Phone, Upload, FileText, Hash, Calendar, MapPin, Building2, CreditCard, Info as InfoIcon, MessageCircle } from 'lucide-react';
import { api, fetchChantierList, formatDate, formatMad, openPrintUrl, uploadDocument } from '../lib/api';
import { Btn, Card, Input, KpiCard, MacActionBtn, Modal, StatusPill, TableWrap, Td, Th, PageBackLink } from '../components/ui';
import DetailSectionNav, { DetailShell } from '../components/DetailSectionNav';
import { useI18n } from '../i18n/I18nContext';


import { SupplierFormFields, supplierToForm, type SupplierFormData } from '../components/SupplierFormFields';
import { PurchaseFormFields, emptyPurchaseForm, type PurchaseFormData } from '../components/PurchaseFormFields';
import ConversationsPanel from '../components/ConversationsPanel';

type Tab = 'achats' | 'infos' | 'documents' | 'echanges' | 'historique';

type SupplierDocBundle = {
  uploaded: Array<{ id: string; name: string; category?: string | null; path: string; createdAt: string }>;
  generated: Array<{ id: string; docType: string; reference?: string | null; createdAt: string; purchaseId?: string | null }>;
  purchaseFiles: Array<{ id: string; name: string; category?: string | null; path: string; entityId?: string | null; createdAt: string }>;
};

const PORTAL_DOC_LABELS_KEYS: Record<string, string> = {
  devis: 'fields.quote',
  facture: 'fields.invoice',
  bon_livraison: 'fields.deliveryNote',
};

const DOC_TYPE_LABEL_KEYS: Record<string, string> = {
  devis: 'fields.quote',
  facture: 'fields.invoice',
  recu: 'fields.receiptShort',
  bon_commande: 'fields.purchaseOrderShort',
  bon_livraison: 'fields.deliveryNote',
  bon_caisse: 'fields.cashVoucher',
};

export default function FournisseurDetailPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [docBundle, setDocBundle] = useState<SupplierDocBundle>({ uploaded: [], generated: [], purchaseFiles: [] });
  const [tab, setTab] = useState<Tab>('achats');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMotif, setDeleteMotif] = useState('');
  const [portalOpen, setPortalOpen] = useState(false);
  const [portalPwd, setPortalPwd] = useState('');
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormData>(emptyPurchaseForm());
  const [purchaseError, setPurchaseError] = useState('');
  const [chantiers, setChantiers] = useState<{ id: string; name: string }[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [chantierTranches, setChantierTranches] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<SupplierFormData>({
    companyName: '', contactName: '', phone1: '', phone2: '', email: '', cin: '', source: '',
    address: '', bankName: '', rib: '', remark: '', isActive: 'true',
  });

  function load() {
    if (!id) return;
    setError('');
    api(`/achats/suppliers/${id}`).then(setSupplier).catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }

  function loadHistory() {
    if (!id) return;
    api(`/achats/suppliers/${id}/history`).then(setHistory).catch(() => setHistory([]));
  }

  function loadDocuments() {
    if (!id) return;
    api<SupplierDocBundle>(`/achats/suppliers/${id}/documents`).then(setDocBundle).catch(() => setDocBundle({ uploaded: [], generated: [], purchaseFiles: [] }));
  }

  useEffect(() => {
    load();
    loadDocuments();
    fetchChantierList<{ id: string; name: string }>().then(setChantiers).catch(() => {});
    api('/achats/families').then(setFamilies).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!purchaseForm.chantierId) {
      setChantierTranches([]);
      return;
    }
    api<{ id: string; name: string }[]>(`/chantiers/${purchaseForm.chantierId}/tranches`)
      .then(setChantierTranches)
      .catch(() => setChantierTranches([]));
  }, [purchaseForm.chantierId]);

  useEffect(() => {
    if (tab === 'historique') loadHistory();
    if (tab === 'documents') loadDocuments();
  }, [tab, id]);

  function openEdit() {
    if (!supplier) return;
    setForm(supplierToForm(supplier));
    setEditOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/achats/suppliers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          companyName: form.companyName,
          contactName: form.contactName || null,
          phone1: form.phone1 || null,
          phone2: form.phone2 || null,
          email: form.email || null,
          cin: form.cin || null,
          source: form.source || null,
          address: form.address || null,
          bankName: form.bankName || null,
          rib: form.rib || null,
          remark: form.remark || null,
          isActive: form.isActive === 'true',
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
      await api(`/achats/suppliers/${id}`, { method: 'DELETE', body: JSON.stringify({ motif: deleteMotif }) });
      navigate('/fournisseurs');
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function setPortalPassword(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/achats/suppliers/${id}/portal-password`, {
        method: 'POST',
        body: JSON.stringify({ password: portalPwd }),
      });
      setPortalOpen(false);
      setPortalPwd('');
      load();
      await appAlert(t('msg.portalAccessActivated'));
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function onUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      await uploadDocument(file, {
        name: file.name,
        category: 'admin',
        entityType: 'Supplier',
        entityId: id,
        supplierId: id,
      });
      loadDocuments();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('msg.uploadError'));
    } finally {
      e.target.value = '';
    }
  }

  async function deleteDoc(docId: string) {
    if (!await appConfirm(t('msg.confirmDeleteDocument'))) return;
    await api(`/documents/${docId}`, { method: 'DELETE' });
    loadDocuments();
  }

  function openPurchaseCreate() {
    if (!supplier) return;
    setPurchaseForm({ ...emptyPurchaseForm(), supplierId: supplier.id });
    setPurchaseError('');
    setPurchaseOpen(true);
  }

  function purchaseToBody(f: PurchaseFormData) {
    return {
      designation: f.designation,
      family: f.family || null,
      unit: f.unit || null,
      quantity: f.quantity,
      unitPrice: f.unitPrice,
      tvaRate: f.tvaRate || '20',
      supplierId: f.supplierId || null,
      chantierId: f.chantierId || null,
      tranche: f.tranche || null,
      paymentMode: f.paymentMode,
      author: f.author || null,
      remark: f.remark || null,
      date: f.date,
      invoiced: f.invoiced === 'true',
    };
  }

  async function savePurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!supplier) return;
    setPurchaseError('');
    try {
      const created = await api<{ id: string }>('/achats/purchases', {
        method: 'POST',
        body: JSON.stringify(purchaseToBody({ ...purchaseForm, supplierId: supplier.id })),
      });
      setPurchaseOpen(false);
      load();
      navigate(`/achats/${created.id}`);
    } catch (err) {
      setPurchaseError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function printFiche() {
    if (!supplier) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Fournisseur ${supplier.companyName}</title></head><body style="font-family:sans-serif;padding:24px;font-size:12px">
      <h1>Fiche fournisseur — GIC</h1>
      <h2>${supplier.reference} — ${supplier.companyName}</h2>
      <p><b>Contact :</b> ${supplier.contactName || '—'}</p>
      <p><b>Téléphone :</b> ${supplier.phone1 || '—'} ${supplier.phone2 ? '/ ' + supplier.phone2 : ''}</p>
      <p><b>Email :</b> ${supplier.email || '—'}</p>
      <p><b>CIN :</b> ${supplier.cin || '—'}</p>
      <p><b>Source :</b> ${supplier.source || '—'}</p>
      <p><b>Adresse :</b> ${supplier.address || '—'}</p>
      <p><b>Banque :</b> ${supplier.bankName || '—'} — RIB ${supplier.rib || '—'}</p>
      <p><b>Statut :</b> ${supplier.isActive ? 'Actif' : 'Inactif'}</p>
      <p><b>Portail :</b> ${supplier.hasPortal ? 'Activé' : 'Non configuré'}</p>
      <h3>Achats (${supplier.purchases?.length || 0})</h3>
      <ul>${(supplier.purchases || []).map((p: any) => `<li>${p.reference} — ${p.designation} — ${p.totalPrice} MAD</li>`).join('')}</ul>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (!supplier && !error) return <p className="text-[12px] text-gic-muted p-6">{t('common.loading')}</p>;

  if (error && !supplier) {
    return (
      <Card className="border-gic-coral/40">
        <p className="text-[12px] text-gic-coral">{error}</p>
        <PageBackLink fallbackTo="/fournisseurs" className="mt-2" />
      </Card>
    );
  }

  const purchases = supplier.purchases || [];
  const purchaseTotal = purchases.reduce((s: number, p: any) => s + Number(p.totalPrice || 0), 0);
  const docCount = docBundle.uploaded.length + docBundle.generated.length + docBundle.purchaseFiles.length;

  return (
    <div className="space-y-0">
      <div className="mac-detail-hero">
        <PageBackLink fallbackTo="/fournisseurs" />
        <div className="mac-detail-hero-main">
          <div className="mac-detail-photo">
            <div className="mac-detail-photo-fallback text-[#7c3aed]">
              <Truck size={28} strokeWidth={1.5} />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mac-detail-eyebrow">{t('detail.supplier360')}</p>
            <h1 className="mac-detail-name truncate">{supplier.companyName}</h1>
            <p className="mac-detail-meta">
              {supplier.reference}
              {supplier.source ? ` · ${supplier.source}` : ''}
              {!supplier.isActive && t('msg.inactiveSuffix')}
              {t('msg.sinceDate', { date: formatDate(supplier.createdAt) })}
            </p>
            <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-gic-muted">
              {supplier.contactName && (
                <span className="flex items-center gap-1">
                  <Building2 size={12} /> {supplier.contactName}
                </span>
              )}
              {supplier.email && (
                <a href={`mailto:${supplier.email}`} className="flex items-center gap-1 hover:text-[#007aff]">
                  <Mail size={12} /> {supplier.email}
                </a>
              )}
              {supplier.phone1 && (
                <a href={`tel:${supplier.phone1}`} className="flex items-center gap-1 hover:text-[#007aff]">
                  <Phone size={12} /> {supplier.phone1}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="mac-page-actions">
          {supplier.email && (
            <Btn icon={Key} onClick={() => { setPortalOpen(true); setPortalPwd(''); }}>
              {supplier.hasPortal ? t('actions.renewPortal') : t('actions.activatePortal')}
            </Btn>
          )}
          <Btn variant="secondary" icon={Printer} onClick={printFiche}>{t('common.print')}</Btn>
          <div className="mac-action-group ml-0.5">
            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={openEdit} />
            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => { setDeleteOpen(true); setDeleteMotif(''); }} />
          </div>
                 </div>
      </div>

      <div className="mac-kpi-grid mb-4">
        <KpiCard title={t('tabs.purchases')} value={supplier._count?.purchases ?? purchases.length} icon={ShoppingCart} tone="violet" />
        <KpiCard title={t('msg.volumeTotal')} value={formatMad(purchaseTotal)} icon={ShoppingCart} tone="coral" compact />
        <KpiCard
          title={t('fields.portal')}
          value={supplier.hasPortal ? t('msg.portalActive') : t('msg.portalNotConfigured')}
          icon={Key}
          tone={supplier.hasPortal ? 'emerald' : 'amber'}
        />
      </div>

      <DetailShell
        nav={
          <DetailSectionNav
            active={tab}
            onChange={(id) => setTab(id as Tab)}
            ariaLabel={t('detail.sectionsSupplierAria')}
            items={[
              { id: 'achats', label: t('tabs.purchases'), icon: ShoppingCart, badge: purchases.length },
              { id: 'infos', label: t('tabs.informations'), icon: InfoIcon },
              { id: 'documents', label: t('tabs.documents'), icon: FileText, badge: docCount },
              { id: 'echanges', label: t('tabs.exchanges'), icon: MessageCircle },
              { id: 'historique', label: t('tabs.history'), icon: History },
            ]}
          />
        }
      >

        {tab === 'infos' && (
          <div className="grid sm:grid-cols-2 gap-4 text-[12px] mt-1">
            <Info icon={Hash} label={t('fields.reference')} value={supplier.reference} />
            <Info icon={Building2} label={t('fields.companyName')} value={supplier.companyName} />
            <Info icon={Building2} label={t('fields.contactPerson')} value={supplier.contactName || '—'} />
            <Info icon={Mail} label={t('fields.email')} value={supplier.email || '—'} link={supplier.email ? `mailto:${supplier.email}` : undefined} />
            <Info icon={Phone} label={t('fields.phone1')} value={supplier.phone1 || '—'} link={supplier.phone1 ? `tel:${supplier.phone1}` : undefined} />
            <Info icon={Phone} label={t('fields.phone2')} value={supplier.phone2 || '—'} link={supplier.phone2 ? `tel:${supplier.phone2}` : undefined} />
            <Info icon={Hash} label={t('fields.cin')} value={supplier.cin || '—'} />
            <Info icon={Building2} label={t('fields.source')} value={supplier.source || '—'} />
            <Info icon={CreditCard} label={t('fields.bank')} value={supplier.bankName || '—'} />
            <Info icon={CreditCard} label={t('fields.rib')} value={supplier.rib || '—'} />
            <Info icon={MapPin} label={t('fields.address')} value={supplier.address || '—'} className="sm:col-span-2" />
            <Info icon={FileText} label={t('fields.remark')} value={supplier.remark || '—'} className="sm:col-span-2" />
            <Info icon={Building2} label={t('fields.status')} value={supplier.isActive ? t('status.active') : t('status.inactive')} />
            <Info icon={Calendar} label={t('fields.createdAt')} value={formatDate(supplier.createdAt)} />
            <Info icon={Calendar} label={t('fields.updatedAt')} value={formatDate(supplier.updatedAt)} />
          </div>
        )}

        {tab === 'achats' && (
          <div className="mt-1">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <p className="text-[12px] text-gic-muted">
                {t('msg.purchasesCountAmount', { count: purchases.length, amount: formatMad(purchaseTotal) })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Btn icon={Plus} size="sm" onClick={openPurchaseCreate}>{t('actions.newPurchase')}</Btn>
                <Link to={`/achats?supplierId=${supplier.id}`}><Btn variant="secondary" size="sm">{t('actions.viewInPurchases')}</Btn></Link>
              </div>
            </div>
            {purchases.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-[12px] text-gic-muted">{t('msg.emptyPurchasesSupplier')}</p>
                <Btn icon={Plus} size="sm" className="mt-3" onClick={openPurchaseCreate}>{t('actions.newPurchase')}</Btn>
              </div>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.ref')}</Th>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('columns.designation')}</Th>
                    <Th mac>{t('columns.chantier')}</Th>
                    <Th mac>{t('columns.amount')}</Th>
                    <Th mac>{t('columns.status')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p: any) => (
                    <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/achats/${p.id}`)}>
                      <Td mac className="font-medium text-[#007aff]">{p.reference}</Td>
                      <Td mac className="text-[11px] mac-table-muted">{formatDate(p.date)}</Td>
                      <Td mac>{p.designation}</Td>
                      <Td mac className="mac-table-muted">
                        {p.chantier ? (
                          <Link to={`/chantiers/${p.chantier.id}`} className="hover:text-[#007aff]" onClick={(e) => e.stopPropagation()}>
                            {p.chantier.name}
                          </Link>
                        ) : '—'}
                      </Td>
                      <Td mac>{formatMad(p.totalPrice)}</Td>
                      <Td mac><StatusPill status={p.status} quiet /></Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        )}

        {tab === 'documents' && (
          <div className="space-y-5 mt-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] text-gic-muted">{t('msg.documentsSupplierHint')}</p>
              <label className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium bg-white shadow-[var(--shadow-panel)] text-gic-ink hover:bg-black/[0.02] border border-transparent cursor-pointer">
                <Upload size={14} strokeWidth={2} />
                {t('actions.addDocument')}
                <input type="file" className="hidden" onChange={onUploadDoc} />
              </label>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gic-muted mb-2">{t('actions.generateDocument')}</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(DOC_TYPE_LABEL_KEYS).map(([type, key]) => (
                  <Btn key={type} variant="secondary" size="sm" icon={Printer} onClick={() => openPrintUrl(`/achats/suppliers/${id}/print/${type}`)}>
                    {t(key)}
                  </Btn>
                ))}
              </div>
            </div>

            {docBundle.uploaded.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gic-muted mb-2">{t('detail.importedDocs')}</p>
                <div className="space-y-2">
                  {docBundle.uploaded.map((d) => (
                    <DocRow
                      key={d.id}
                      name={d.name}
                      meta={d.category || 'Document'}
                      date={d.createdAt}
                      href={d.path}
                      onDelete={() => deleteDoc(d.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {docBundle.purchaseFiles.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gic-muted mb-2">{t('msg.documentsPortalPurchases')}</p>
                <div className="space-y-2">
                  {docBundle.purchaseFiles.map((d) => (
                    <DocRow
                      key={d.id}
                      name={d.name}
                      meta={PORTAL_DOC_LABELS_KEYS[d.category || ''] ? t(PORTAL_DOC_LABELS_KEYS[d.category || '']) : d.category || t('fields.file')}
                      date={d.createdAt}
                      href={d.path}
                    />
                  ))}
                </div>
              </div>
            )}

            {docBundle.generated.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gic-muted mb-2">{t('detail.generatedDocs')}</p>
                <div className="space-y-2">
                  {docBundle.generated.map((d) => (
                    <DocRow
                      key={d.id}
                      name={DOC_TYPE_LABEL_KEYS[d.docType] ? t(DOC_TYPE_LABEL_KEYS[d.docType]) : d.docType}
                      meta={d.reference || '—'}
                      date={d.createdAt}
                      onOpen={() => openPrintUrl(`/achats/suppliers/${id}/print/${d.docType}${d.purchaseId ? `?purchaseId=${d.purchaseId}` : ''}`)}
                    />
                  ))}
                </div>
              </div>
            )}

            {docCount === 0 && (
              <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.noDocumentsSupplier')}</p>
            )}
          </div>
        )}

        {tab === 'echanges' && (
          <ConversationsPanel
            entityType="Supplier"
            entityId={supplier.id}
            defaultEmail={supplier.email || undefined}
            defaultPhone={supplier.phone1 || undefined}
          />
        )}

        {tab === 'historique' && (
          history.length === 0 ? (
            <p className="text-[12px] text-gic-muted py-6 text-center">{t('msg.emptyHistory')}</p>
          ) : (
            <TableWrap mac className="mt-1">
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
                    <Td mac className="text-[11px]">{formatDate(h.createdAt)}</Td>
                    <Td mac className="capitalize">{h.action}</Td>
                    <Td mac className="mac-table-muted text-[11px]">
                      {h.user ? `${h.user.firstName} ${h.user.lastName}` : '—'}
                    </Td>
                    <Td mac className="mac-table-muted text-[11px]">{h.details || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )
        )}
            </DetailShell>

      <Modal
        open={purchaseOpen}
        size="lg"
        title={t('detail.newPurchaseFor', { name: supplier.companyName })}
        onClose={() => setPurchaseOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPurchaseOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="supplier-purchase-form" type="submit">{t('msg.createPurchase')}</Btn>
          </>
        }
      >
        <form id="supplier-purchase-form" onSubmit={savePurchase}>
          <PurchaseFormFields
            form={purchaseForm}
            setForm={setPurchaseForm}
            suppliers={[{ id: supplier.id, reference: supplier.reference, companyName: supplier.companyName }]}
            chantiers={chantiers}
            families={families}
            tranches={chantierTranches}
            lockSupplier={supplier.id}
            lockedSupplierName={`${supplier.reference} — ${supplier.companyName}`}
          />
          {purchaseError && <p className="mt-3 text-[11px] text-gic-coral">{purchaseError}</p>}
        </form>
      </Modal>

      <Modal open={editOpen} size="lg" title={t('actions.editSupplier')} onClose={() => setEditOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Btn><Btn form="edit-supplier-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="edit-supplier-form" onSubmit={save}>
          <SupplierFormFields form={form} setForm={setForm} />
        </form>
      </Modal>

      <Modal open={portalOpen} title={t('actions.supplierPortalAccess')} onClose={() => setPortalOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setPortalOpen(false)}>{t('common.cancel')}</Btn><Btn form="portal-detail-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="portal-detail-form" onSubmit={setPortalPassword}>
          <p className="text-[12px] text-gic-muted mb-3">{t('msg.portalLoginHint')}</p>
          <Input label={t('fields.passwordMin6')} type="password" required minLength={6} value={portalPwd} onChange={(e) => setPortalPwd(e.target.value)} />
        </form>
      </Modal>

      <Modal open={deleteOpen} title={t('actions.deleteSupplier')} onClose={() => setDeleteOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Btn><Btn variant="danger" onClick={confirmDelete} disabled={!deleteMotif.trim()}>{t('common.delete')}</Btn></>}
      >
        <p className="text-[12px] text-gic-muted mb-3">{t('msg.supplierDeleteBlocked')}</p>
        <textarea className="w-full h-24 rounded-xl border border-gic-border p-3 text-[12px]" placeholder={t('msg.motifShortPlaceholder')} value={deleteMotif} onChange={(e) => setDeleteMotif(e.target.value)} />
      </Modal>
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
  link,
  className = '',
}: {
  icon: typeof Hash;
  label: string;
  value: string;
  link?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] text-gic-muted uppercase flex items-center gap-1 mb-0.5">
        <Icon size={11} className="opacity-60" /> {label}
      </p>
      {link ? (
        <a href={link} className="font-medium text-[#007aff] hover:underline">{value}</a>
      ) : (
        <p className="font-medium text-gic-ink">{value}</p>
      )}
    </div>
  );
}

function DocRow({
  name,
  meta,
  date,
  href,
  onDelete,
  onOpen,
}: {
  name: string;
  meta: string;
  date: string;
  href?: string;
  onDelete?: () => void;
  onOpen?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 rounded-xl bg-black/[0.03] px-3 py-2.5">
      <FileText size={16} className="text-[#007aff] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-gic-ink truncate">{name}</p>
        <p className="text-[10px] text-gic-muted">{meta} · {formatDate(date)}</p>
      </div>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="text-[11px] text-[#007aff] hover:underline shrink-0">
          {t('actions.open')}
        </a>
      )}
      {onOpen && (
        <button type="button" onClick={onOpen} className="text-[11px] text-[#007aff] hover:underline shrink-0">
          {t('actions.open')}
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete} className="text-[11px] text-gic-coral hover:underline shrink-0">
          {t('common.delete')}
        </button>
      )}
    </div>
  );
}
