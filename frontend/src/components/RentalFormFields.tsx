import { useI18n } from '../i18n/I18nContext';
import { Input, Select } from './ui';
import { ClientFormPicker } from './ClientFormPicker';

export type RentalFormData = {
  clientId: string;
  propertyId: string;
  monthlyRent: string;
  discount: string;
  contractType: string;
  description: string;
  contractDate: string;
  startDate: string;
  endDate: string;
  status: string;
  landlordSignatureDate: string;
  landlordLegalizationNo: string;
  tenantSignatureDate: string;
  tenantLegalizationNo: string;
};

export function emptyRentalForm(): RentalFormData {
  const today = new Date().toISOString().slice(0, 10);
  return {
    clientId: '',
    propertyId: '',
    monthlyRent: '',
    discount: '0',
    contractType: 'bail_habitation',
    description: '',
    contractDate: today,
    startDate: today,
    endDate: '',
    status: 'active',
    landlordSignatureDate: '',
    landlordLegalizationNo: '',
    tenantSignatureDate: '',
    tenantLegalizationNo: '',
  };
}

function dateField(v: unknown) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

export function rentalToForm(r: Record<string, unknown>): RentalFormData {
  return {
    clientId: String(r.clientId || ''),
    propertyId: String(r.propertyId || ''),
    monthlyRent: r.monthlyRent != null ? String(r.monthlyRent) : '',
    discount: r.discount != null ? String(r.discount) : '0',
    contractType: String(r.contractType || 'bail_habitation'),
    description: String(r.description || ''),
    contractDate: dateField(r.contractDate) || new Date().toISOString().slice(0, 10),
    startDate: dateField(r.startDate) || dateField(r.contractDate) || new Date().toISOString().slice(0, 10),
    endDate: dateField(r.endDate),
    status: String(r.status || 'active'),
    landlordSignatureDate: dateField(r.landlordSignatureDate),
    landlordLegalizationNo: String(r.landlordLegalizationNo || ''),
    tenantSignatureDate: dateField(r.tenantSignatureDate),
    tenantLegalizationNo: String(r.tenantLegalizationNo || ''),
  };
}

export function rentalFormToBody(f: RentalFormData, editMode = false) {
  const bail = {
    landlordSignatureDate: f.landlordSignatureDate || null,
    landlordLegalizationNo: f.landlordLegalizationNo || null,
    tenantSignatureDate: f.tenantSignatureDate || null,
    tenantLegalizationNo: f.tenantLegalizationNo || null,
  };
  const common = {
    description: f.description || null,
    contractType: f.contractType,
    contractDate: f.contractDate || null,
    startDate: f.startDate || f.contractDate || null,
    endDate: f.endDate || null,
    monthlyRent: f.monthlyRent,
    discount: f.discount,
    ...bail,
  };
  if (editMode) {
    return { ...common, status: f.status };
  }
  return {
    ...common,
    clientId: f.clientId,
    propertyId: f.propertyId,
  };
}

export function RentalFormFields({
  form,
  setForm,
  properties,
  editMode,
}: {
  form: RentalFormData;
  setForm: (f: RentalFormData) => void;
  clients?: { id: string; reference: string; firstName: string; lastName: string }[];
  properties: { id: string; reference: string; name: string; status: string }[];
  editMode?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {!editMode && (
        <>
          <div className="sm:col-span-2">
            <ClientFormPicker
              label={`${t('fields.tenant')} *`}
              required
              value={form.clientId}
              onChange={(clientId) => setForm({ ...form, clientId })}
            />
          </div>
          <Select className="sm:col-span-2" label={`${t('fields.property')} *`} required value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
            <option value="">{t('fields.selectProperty')}</option>
            {properties.filter((p) => ['disponible', 'réservé'].includes(p.status) || p.id === form.propertyId).map((p) => (
              <option key={p.id} value={p.id}>{p.reference} — {p.name}</option>
            ))}
          </Select>
        </>
      )}
      <Input label={`${t('fields.monthlyRentMad')} *`} required type="number" min="0" value={form.monthlyRent} onChange={(e) => setForm({ ...form, monthlyRent: e.target.value })} />
      <Input label={t('fields.discountMad')} type="number" min="0" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
      <Input
        label={`${t('fields.rentalStart')} *`}
        type="date"
        required
        value={form.startDate}
        onChange={(e) => setForm({
          ...form,
          startDate: e.target.value,
          contractDate: form.contractDate || e.target.value,
        })}
      />
      <Input
        label={t('fields.rentalEndOptional')}
        type="date"
        value={form.endDate}
        onChange={(e) => setForm({ ...form, endDate: e.target.value })}
      />
      <Input label={t('fields.contractDate')} type="date" value={form.contractDate} onChange={(e) => setForm({ ...form, contractDate: e.target.value })} />
      <Select label={t('fields.leaseType')} value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })}>
        <option value="bail_habitation">{t('fields.bailHabitation')}</option>
        <option value="bail_commercial">{t('fields.bailCommercial')}</option>
        <option value="bail_professionnel">{t('fields.bailProfessionnel')}</option>
      </Select>
      <p className="sm:col-span-2 text-[11px] text-gic-muted -mt-1">
        {t('msg.rentalOpenEndedHint')}
      </p>
      {editMode && (
        <Select label={t('fields.status')} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="active">{t('fields.statusActiveRental')}</option>
          <option value="suspendue">{t('fields.statusSuspendedRental')}</option>
          <option value="terminée">{t('fields.statusEndedRental')}</option>
        </Select>
      )}
      <p className="sm:col-span-2 text-[10px] font-semibold uppercase text-gic-muted tracking-wide pt-1">{t('fields.sectionSignatures')}</p>
      <Input label={t('fields.landlordSignatureDate')} type="date" value={form.landlordSignatureDate} onChange={(e) => setForm({ ...form, landlordSignatureDate: e.target.value })} />
      <Input label={t('fields.landlordLegalizationNo')} value={form.landlordLegalizationNo} onChange={(e) => setForm({ ...form, landlordLegalizationNo: e.target.value })} />
      <Input label={t('fields.tenantSignatureDate')} type="date" value={form.tenantSignatureDate} onChange={(e) => setForm({ ...form, tenantSignatureDate: e.target.value })} />
      <Input label={t('fields.tenantLegalizationNo')} value={form.tenantLegalizationNo} onChange={(e) => setForm({ ...form, tenantLegalizationNo: e.target.value })} />
      <Input className="sm:col-span-2" label={t('fields.descriptionRemark')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
    </div>
  );
}
