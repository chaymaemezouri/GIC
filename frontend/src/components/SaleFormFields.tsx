import { useI18n } from '../i18n/I18nContext';
import { Input, Select } from './ui';

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
  };
}

function dateField(v: unknown) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

export function saleToForm(s: Record<string, unknown>): SaleFormData {
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
  };
}

export function saleFormToCreateBody(f: SaleFormData) {
  return {
    clientId: f.clientId,
    propertyId: f.propertyId,
    salePrice: f.salePrice,
    discount: f.discount,
    advance: f.advance,
    contractType: f.contractType,
    description: f.description || null,
    contractDate: f.contractDate || null,
    sellerSignatureDate: f.sellerSignatureDate || null,
    sellerLegalizationNo: f.sellerLegalizationNo || null,
    buyerSignatureDate: f.buyerSignatureDate || null,
    buyerLegalizationNo: f.buyerLegalizationNo || null,
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
  };
}

export function SaleFormFields({
  form,
  setForm,
  clients,
  properties,
  editMode,
}: {
  form: SaleFormData;
  setForm: (f: SaleFormData) => void;
  clients: { id: string; reference: string; firstName: string; lastName: string }[];
  properties: { id: string; reference: string; name: string; status: string }[];
  editMode?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {!editMode && (
        <>
          <Select className="sm:col-span-2" label={`${t('fields.client')} *`} required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
            <option value="">{t('fields.selectClient')}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.reference} — {c.firstName} {c.lastName}</option>
            ))}
          </Select>
          <Select className="sm:col-span-2" label={`${t('fields.property')} *`} required value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
            <option value="">{t('fields.selectProperty')}</option>
            {properties.filter((p) => p.status === 'disponible' || p.id === form.propertyId).map((p) => (
              <option key={p.id} value={p.id}>{p.reference} — {p.name}</option>
            ))}
          </Select>
        </>
      )}
      <Input label={`${t('fields.salePriceMad')} *`} required type="number" min="0" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} disabled={editMode} />
      <Input label={t('fields.discountMad')} type="number" min="0" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} disabled={editMode} />
      <Input label={t('fields.advanceMad')} type="number" min="0" value={form.advance} onChange={(e) => setForm({ ...form, advance: e.target.value })} disabled={editMode} />
      <Input label={t('fields.contractDate')} type="date" value={form.contractDate} onChange={(e) => setForm({ ...form, contractDate: e.target.value })} />
      <Select label={t('fields.contractType')} value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })}>
        <option value="compromis">{t('fields.compromis')}</option>
        <option value="promesse">{t('fields.promesse')}</option>
        <option value="acte">{t('fields.acteAuthentique')}</option>
      </Select>
      {editMode && (
        <Select label={t('fields.status')} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
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
