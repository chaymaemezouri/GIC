import { useI18n } from '../i18n/I18nContext';
import { occupancyForDeal, propertyDealOf } from '../lib/propertyDeal';
import { isBankPaymentMode } from '../lib/paymentMode';
import { uploadDocument, uploadForm } from '../lib/api';
import { Input, Select } from './ui';
import { ClientFormPicker } from './ClientFormPicker';

export type SaleFormData = {
  clientId: string;
  propertyId: string;
  salePrice: string;
  discount: string;
  advance: string;
  contractType: string;
  description: string;
  contractDate: string;
  status: string;
  sellerSignatureDate: string;
  sellerLegalizationNo: string;
  buyerSignatureDate: string;
  buyerLegalizationNo: string;
  propertyStatus: string;
  advanceMode: string;
  advanceBank: string;
  advanceProof: File | null;
  documents: File[];
};

export function emptySaleForm(): SaleFormData {
  return {
    clientId: '',
    propertyId: '',
    salePrice: '',
    discount: '0',
    advance: '0',
    contractType: 'compromis',
    description: '',
    contractDate: new Date().toISOString().slice(0, 10),
    status: 'en_cours',
    sellerSignatureDate: '',
    sellerLegalizationNo: '',
    buyerSignatureDate: '',
    buyerLegalizationNo: '',
    propertyStatus: 'vendu',
    advanceMode: 'especes',
    advanceBank: '',
    advanceProof: null,
    documents: [],
  };
}

function dateField(v: unknown) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

export function saleToForm(s: Record<string, unknown>): SaleFormData {
  const payments = Array.isArray(s.payments)
    ? (s.payments as Array<{ nature?: string; operationType?: string; bank?: string }>)
    : [];
  const acompte = payments.find((p) => p.nature === 'acompte') || payments[0];
  return {
    clientId: String(s.clientId || ''),
    propertyId: String(s.propertyId || ''),
    salePrice: s.salePrice != null ? String(s.salePrice) : '',
    discount: s.discount != null ? String(s.discount) : '0',
    advance: s.advance != null ? String(s.advance) : '0',
    contractType: String(s.contractType || 'compromis'),
    description: String(s.description || ''),
    contractDate: dateField(s.contractDate) || new Date().toISOString().slice(0, 10),
    status: String(s.status || 'en_cours'),
    sellerSignatureDate: dateField(s.sellerSignatureDate),
    sellerLegalizationNo: String(s.sellerLegalizationNo || ''),
    buyerSignatureDate: dateField(s.buyerSignatureDate),
    buyerLegalizationNo: String(s.buyerLegalizationNo || ''),
    propertyStatus: occupancyForDeal('vente', (s.property as { status?: string } | undefined)?.status || 'vendu'),
    advanceMode: String(acompte?.operationType || 'especes'),
    advanceBank: String(acompte?.bank || ''),
    advanceProof: null,
    documents: [],
  };
}

export function saleFormToCreateBody(f: SaleFormData) {
  return {
    clientId: f.clientId,
    propertyId: f.propertyId,
    salePrice: f.salePrice,
    discount: f.discount,
    advance: f.advance,
    advanceMode: f.advanceMode || 'especes',
    advanceBank: f.advanceBank || null,
    contractType: f.contractType,
    description: f.description || null,
    contractDate: f.contractDate || null,
    sellerSignatureDate: f.sellerSignatureDate || null,
    sellerLegalizationNo: f.sellerLegalizationNo || null,
    buyerSignatureDate: f.buyerSignatureDate || null,
    buyerLegalizationNo: f.buyerLegalizationNo || null,
    propertyStatus: occupancyForDeal('vente', f.propertyStatus || 'vendu'),
  };
}

export function saleFormToUpdateBody(f: SaleFormData) {
  return {
    description: f.description || null,
    contractType: f.contractType,
    contractDate: f.contractDate || null,
    status: f.status,
    sellerSignatureDate: f.sellerSignatureDate || null,
    sellerLegalizationNo: f.sellerLegalizationNo || null,
    buyerSignatureDate: f.buyerSignatureDate || null,
    buyerLegalizationNo: f.buyerLegalizationNo || null,
    propertyStatus: occupancyForDeal('vente', f.propertyStatus || 'vendu'),
  };
}

export async function attachSaleCreateFiles(
  saleId: string,
  advancePaymentId: string | null | undefined,
  f: SaleFormData,
) {
  for (const file of f.documents) {
    await uploadDocument(file, {
      name: file.name,
      category: 'vente',
      entityType: 'Sale',
      entityId: saleId,
      saleId,
    });
  }
  if (f.advanceProof && advancePaymentId) {
    const fd = new FormData();
    fd.append('proof', f.advanceProof);
    await uploadForm(`/transactions/payments/${advancePaymentId}`, fd, 'PUT');
  }
}

export function SaleFormFields({
  form,
  setForm,
  clients,
  properties,
  editMode,
  lockPropertyId,
  lockedPropertyLabel,
}: {
  form: SaleFormData;
  setForm: (f: SaleFormData) => void;
  clients: { id: string; reference: string; firstName: string; lastName: string }[];
  properties: { id: string; reference: string; name: string; status: string; type?: string }[];
  editMode?: boolean;
  lockPropertyId?: string;
  lockedPropertyLabel?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {!editMode && (
        <>
          <div className="sm:col-span-2">
            <ClientFormPicker
              label={`${t('fields.buyer')} *`}
              required
              value={form.clientId}
              onChange={(clientId) => setForm({ ...form, clientId })}
            />
          </div>
          {lockPropertyId ? (
            <div className="sm:col-span-2">
              <p className="mb-1 text-[11px] font-medium text-gic-muted">{t('fields.property')}</p>
              <p className="rounded-xl border border-gic-border bg-gray-50/80 px-3 py-2 text-[12px] font-medium">{lockedPropertyLabel || '—'}</p>
            </div>
          ) : (
            <Select className="sm:col-span-2" label={`${t('fields.property')} *`} required value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
              <option value="">{t('fields.selectProperty')}</option>
              {properties.filter((p) => {
                if (!(p.status === 'disponible' || p.status === 'réservé' || p.id === form.propertyId)) return false;
                return propertyDealOf(p) === 'vente';
              }).map((p) => (
                <option key={p.id} value={p.id}>{p.reference} — {p.name}</option>
              ))}
            </Select>
          )}
        </>
      )}
      <Input label={`${t('fields.salePriceMad')} *`} required type="number" min="0" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} disabled={editMode} />
      <Input label={t('fields.discountMad')} type="number" min="0" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} disabled={editMode} />
      <Input label={t('fields.advanceMad')} type="number" min="0" value={form.advance} onChange={(e) => setForm({ ...form, advance: e.target.value })} disabled={editMode} />
      {(Number(form.advance) > 0 || editMode) && (
        <>
          <Select
            label={t('fields.advancePaymentMode')}
            value={form.advanceMode}
            onChange={(e) => setForm({ ...form, advanceMode: e.target.value, advanceBank: isBankPaymentMode(e.target.value) ? form.advanceBank : '' })}
            disabled={editMode}
          >
            <option value="especes">{t('fields.modeCash')}</option>
            <option value="cheque">{t('fields.modeCheck')}</option>
            <option value="virement">{t('fields.modeTransfer')}</option>
            <option value="carte">{t('fields.modeCard')}</option>
          </Select>
          {isBankPaymentMode(form.advanceMode) && (
            <Input
              label={t('fields.bankRef')}
              value={form.advanceBank}
              onChange={(e) => setForm({ ...form, advanceBank: e.target.value })}
              disabled={editMode}
            />
          )}
          {!editMode && (
            <div className={isBankPaymentMode(form.advanceMode) ? '' : 'sm:col-span-2'}>
              <label className="mb-1 block text-[11px] font-medium text-gic-muted">{t('fields.advanceProof')}</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="block w-full text-[12px] file:mr-2 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:border file:border-gic-border"
                onChange={(e) => setForm({ ...form, advanceProof: e.target.files?.[0] || null })}
              />
            </div>
          )}
        </>
      )}
      {!editMode && (
        <div className="sm:col-span-2">
          <label className="mb-1 block text-[11px] font-medium text-gic-muted">{t('fields.saleDocuments')}</label>
          <p className="mb-1.5 text-[11px] text-gic-muted">{t('fields.saleDocumentsHint')}</p>
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
            className="block w-full text-[12px] file:mr-2 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:border file:border-gic-border"
            onChange={(e) => setForm({ ...form, documents: Array.from(e.target.files || []) })}
          />
          {form.documents.length > 0 && (
            <p className="mt-1 text-[11px] text-gic-muted">{form.documents.map((f) => f.name).join(', ')}</p>
          )}
        </div>
      )}
      <Input label={t('fields.contractDate')} type="date" value={form.contractDate} onChange={(e) => setForm({ ...form, contractDate: e.target.value })} />
      <Select label={t('fields.contractType')} value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })}>
        <option value="compromis">{t('fields.compromis')}</option>
        <option value="promesse">{t('fields.promesse')}</option>
        <option value="acte">{t('fields.acteAuthentique')}</option>
      </Select>
      <Select label={t('fields.propertyStatus')} value={form.propertyStatus === 'loué' ? 'vendu' : form.propertyStatus} onChange={(e) => setForm({ ...form, propertyStatus: e.target.value })}>
        <option value="disponible">{t('status.available')}</option>
        <option value="réservé">{t('status.reserved')}</option>
        <option value="vendu">{t('status.sold')}</option>
      </Select>
      {editMode && (
        <Select label={t('fields.contractStatus')} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="brouillon">{t('status.draft')}</option>
          <option value="signée">{t('fields.statusSigned')}</option>
          <option value="en_cours">{t('fields.statusInProgress')}</option>
          <option value="en_cours_paiement">{t('fields.statusPaymentInProgress')}</option>
          <option value="soldée">{t('fields.statusSettled')}</option>
          <option value="résiliée">{t('fields.statusResiliated')}</option>
          <option value="annulée">{t('fields.statusCancelled')}</option>
        </Select>
      )}
      <p className="sm:col-span-2 text-[10px] font-semibold uppercase text-gic-muted tracking-wide pt-1">{t('fields.sectionSignatures')}</p>
      <Input label={t('fields.sellerSignatureDate')} type="date" value={form.sellerSignatureDate} onChange={(e) => setForm({ ...form, sellerSignatureDate: e.target.value })} />
      <Input label={t('fields.sellerLegalizationNo')} value={form.sellerLegalizationNo} onChange={(e) => setForm({ ...form, sellerLegalizationNo: e.target.value })} />
      <Input label={t('fields.buyerSignatureDate')} type="date" value={form.buyerSignatureDate} onChange={(e) => setForm({ ...form, buyerSignatureDate: e.target.value })} />
      <Input label={t('fields.buyerLegalizationNo')} value={form.buyerLegalizationNo} onChange={(e) => setForm({ ...form, buyerLegalizationNo: e.target.value })} />
      <Input className="sm:col-span-2" label={t('fields.descriptionRemark')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
    </div>
  );
}
