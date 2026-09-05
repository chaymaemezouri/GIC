import { useI18n } from '../i18n/I18nContext';
import { Input, Select } from './ui';
import { fileUrl } from '../lib/documentDisplay';

export type CashAccountOption = {
  id: string;
  name: string;
  type?: string;
  rib?: string | null;
  bankName?: string | null;
  holderUser?: { id: string; firstName: string; lastName: string; email: string } | null;
};

export type CashMovementFormData = {
  designation: string;
  accountId: string;
  mode: string;
  debit: string;
  credit: string;
  remark: string;
  date: string;
  proofFile?: string | null;
  invoiceFile?: string | null;
  deliveryNoteFile?: string | null;
  receptionPvFile?: string | null;
  invoiceFileObj: File | null;
  deliveryNoteFileObj: File | null;
  receptionPvFileObj: File | null;
  proofFileObj: File | null;
};

export function emptyCashMovementForm(): CashMovementFormData {
  return {
    designation: '',
    accountId: '',
    mode: 'especes',
    debit: '',
    credit: '',
    remark: '',
    date: new Date().toISOString().slice(0, 10),
    proofFile: null,
    invoiceFile: null,
    deliveryNoteFile: null,
    receptionPvFile: null,
    invoiceFileObj: null,
    deliveryNoteFileObj: null,
    receptionPvFileObj: null,
    proofFileObj: null,
  };
}

export function movementToForm(m: Record<string, unknown>): CashMovementFormData {
  return {
    designation: String(m.designation || ''),
    accountId: String(m.accountId || ''),
    mode: String(m.mode || 'especes'),
    debit: Number(m.debit) > 0 ? String(m.debit) : '',
    credit: Number(m.credit) > 0 ? String(m.credit) : '',
    remark: String(m.remark || ''),
    date: m.date ? String(m.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    proofFile: (m.proofFile as string) || null,
    invoiceFile: (m.invoiceFile as string) || null,
    deliveryNoteFile: (m.deliveryNoteFile as string) || null,
    receptionPvFile: (m.receptionPvFile as string) || null,
    invoiceFileObj: null,
    deliveryNoteFileObj: null,
    receptionPvFileObj: null,
    proofFileObj: null,
  };
}

export function accountLabel(a: CashAccountOption) {
  const holder = a.holderUser
    ? `${a.holderUser.firstName} ${a.holderUser.lastName}`
    : null;
  const parts = [a.name];
  if (holder) parts.push(holder);
  if (a.rib) parts.push(`RIB ${a.rib}`);
  return parts.join(' — ');
}

function FileField({
  label,
  existing,
  onChange,
  currentFileLabel,
  viewDownloadLabel,
}: {
  label: string;
  existing?: string | null;
  onChange: (f: File | null) => void;
  currentFileLabel: string;
  viewDownloadLabel: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gic-muted mb-1">{label}</label>
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
        className="block w-full text-[12px] file:mr-3 file:rounded-lg file:border-0 file:bg-gic-violet/10 file:px-3 file:py-1.5 file:text-[11px] file:font-medium file:text-gic-violet"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
      {existing && (
        <p className="mt-1 text-[11px] text-gic-muted">
          {currentFileLabel}{' '}
          <a href={fileUrl(existing)} target="_blank" rel="noreferrer" className="text-[#007aff] hover:opacity-70">
            {viewDownloadLabel}
          </a>
        </p>
      )}
    </div>
  );
}

export function CashMovementFormFields({
  form,
  setForm,
  accounts,
}: {
  form: CashMovementFormData;
  setForm: (f: CashMovementFormData) => void;
  accounts: CashAccountOption[];
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input className="sm:col-span-2" label={`${t('fields.designation')} *`} required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
      <Select label={`${t('fields.account')} *`} required value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
        <option value="">—</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{accountLabel(a)}</option>
        ))}
      </Select>
      <Select label={t('fields.paymentMode')} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
        <option value="especes">{t('fields.modeCash')}</option>
        <option value="virement">{t('fields.modeTransfer')}</option>
        <option value="cheque">{t('fields.modeCheck')}</option>
        <option value="carte">{t('fields.modeCard')}</option>
      </Select>
      <Input label={t('fields.date')} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      <Input label={t('fields.debitMad')} type="number" min="0" step="0.01" value={form.debit} onChange={(e) => setForm({ ...form, debit: e.target.value, credit: e.target.value ? '' : form.credit })} />
      <Input label={t('fields.creditMad')} type="number" min="0" step="0.01" value={form.credit} onChange={(e) => setForm({ ...form, credit: e.target.value, debit: e.target.value ? '' : form.debit })} />
      <Input className="sm:col-span-2" label={t('fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
      <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
        <FileField label={t('fields.invoice')} existing={form.invoiceFile} onChange={(f) => setForm({ ...form, invoiceFileObj: f })} currentFileLabel={t('fields.currentFile')} viewDownloadLabel={t('fields.viewDownload')} />
        <FileField label={t('fields.deliveryNote')} existing={form.deliveryNoteFile} onChange={(f) => setForm({ ...form, deliveryNoteFileObj: f })} currentFileLabel={t('fields.currentFile')} viewDownloadLabel={t('fields.viewDownload')} />
        <FileField label={t('fields.receptionPv')} existing={form.receptionPvFile} onChange={(f) => setForm({ ...form, receptionPvFileObj: f })} currentFileLabel={t('fields.currentFile')} viewDownloadLabel={t('fields.viewDownload')} />
        <FileField label={t('fields.otherProof')} existing={form.proofFile} onChange={(f) => setForm({ ...form, proofFileObj: f })} currentFileLabel={t('fields.currentFile')} viewDownloadLabel={t('fields.viewDownload')} />
      </div>
    </div>
  );
}
