import { Upload } from 'lucide-react';
import { useI18n, tStatic } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';
import { Input, Select, Textarea } from './ui';

export const OFFICE_PURPOSE_KEYS: Record<string, string> = {
  chantier: 'fields.purposeChantier',
  travail: 'fields.purposeTravail',
  aleatoire: 'fields.purposeAleatoire',
  alimentation: 'fields.purposeAlimentation',
};

export function officePurposeLabel(purpose: string | null | undefined, t: TranslateFn = tStatic): string {
  if (!purpose) return '—';
  const key = OFFICE_PURPOSE_KEYS[purpose];
  return key ? t(key) : purpose;
}

/** @deprecated Prefer officePurposeLabel(purpose, t) */
export const OFFICE_PURPOSE_LABELS: Record<string, string> = {
  get chantier() { return tStatic('fields.purposeChantier'); },
  get travail() { return tStatic('fields.purposeTravail'); },
  get aleatoire() { return tStatic('fields.purposeAleatoire'); },
  get alimentation() { return tStatic('fields.purposeAlimentation'); },
};

export type OfficeCashFormData = {
  direction: 'entree' | 'sortie';
  amount: string;
  purpose: string;
  designation: string;
  workLabel: string;
  reconnuId: string;
  /** Nom libre si la personne n'est pas dans la liste */
  reconnuName: string;
  chantierId: string;
  remark: string;
  date: string;
  proof: File | null;
};

export function emptyOfficeCashForm(): OfficeCashFormData {
  return {
    direction: 'sortie',
    amount: '',
    purpose: 'travail',
    designation: '',
    workLabel: '',
    reconnuId: '',
    reconnuName: '',
    chantierId: '',
    remark: '',
    date: new Date().toISOString().slice(0, 10),
    proof: null,
  };
}

export function officeCashToForm(m: Record<string, unknown>): OfficeCashFormData {
  return {
    direction: (m.direction === 'entree' ? 'entree' : 'sortie') as 'entree' | 'sortie',
    amount: m.amount != null ? String(m.amount) : '',
    purpose: String(m.purpose || 'travail'),
    designation: String(m.designation || ''),
    workLabel: String(m.workLabel || ''),
    reconnuId: String(m.reconnuId || ''),
    reconnuName: String(m.reconnuName || ''),
    chantierId: String(m.chantierId || ''),
    remark: String(m.remark || ''),
    date: m.date ? String(m.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
    proof: null,
  };
}

export function OfficeCashFormFields({
  form,
  setForm,
  reconnus,
  chantiers,
}: {
  form: OfficeCashFormData;
  setForm: (f: OfficeCashFormData) => void;
  reconnus: { id: string; reference?: string | null; firstName: string; lastName: string }[];
  chantiers: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const showChantier = form.purpose === 'chantier';
  const showWork = form.purpose === 'travail';
  const purposeLabels: Record<string, string> = {
    chantier: t('fields.purposeChantier'),
    travail: t('fields.purposeTravail'),
    aleatoire: t('fields.purposeAleatoire'),
    alimentation: t('fields.purposeAlimentation'),
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        label={`${t('fields.direction')} *`}
        required
        value={form.direction}
        onChange={(e) => {
          const direction = e.target.value as 'entree' | 'sortie';
          setForm({
            ...form,
            direction,
            purpose: direction === 'entree' && form.purpose === 'travail' ? 'alimentation' : form.purpose,
          });
        }}
      >
        <option value="sortie">{t('fields.cashOut')}</option>
        <option value="entree">{t('fields.cashIn')}</option>
      </Select>
      <Input
        label={`${t('fields.amountMad')} *`}
        required
        type="number"
        min="0.01"
        step="0.01"
        value={form.amount}
        onChange={(e) => setForm({ ...form, amount: e.target.value })}
      />
      <Select
        label={`${t('fields.purpose')} *`}
        required
        value={form.purpose}
        onChange={(e) => setForm({ ...form, purpose: e.target.value })}
      >
        {Object.entries(purposeLabels).map(([id, label]) => (
          <option key={id} value={id}>{label}</option>
        ))}
      </Select>
      <Input
        label={t('fields.date')}
        type="date"
        value={form.date}
        onChange={(e) => setForm({ ...form, date: e.target.value })}
      />
      <div className="sm:col-span-2">
        <Input
          label={`${t('fields.designation')} *`}
          required
          value={form.designation}
          onChange={(e) => setForm({ ...form, designation: e.target.value })}
        />
      </div>
      {showWork && (
        <div className="sm:col-span-2">
          <Input
            label={t('fields.workLabel')}
            value={form.workLabel}
            onChange={(e) => setForm({ ...form, workLabel: e.target.value })}
            placeholder={t('fields.workLabelPlaceholder')}
          />
        </div>
      )}
      <Select
        label={t('fields.recognizedList')}
        value={form.reconnuId}
        onChange={(e) => setForm({
          ...form,
          reconnuId: e.target.value,
          reconnuName: e.target.value ? '' : form.reconnuName,
        })}
      >
        <option value="">{t('fields.noneManualEntry')}</option>
        {reconnus.map((r) => (
          <option key={r.id} value={r.id}>
            {r.reference ? `${r.reference} — ` : ''}{r.firstName} {r.lastName}
          </option>
        ))}
      </Select>
      <Input
        label={t('fields.manualName')}
        value={form.reconnuName}
        onChange={(e) => setForm({
          ...form,
          reconnuName: e.target.value,
          reconnuId: e.target.value.trim() ? '' : form.reconnuId,
        })}
        placeholder={t('fields.manualNamePlaceholder')}
        disabled={!!form.reconnuId}
      />
      {showChantier && (
        <div className="sm:col-span-2">
          <Select
            label={t('fields.chantier')}
            value={form.chantierId}
            onChange={(e) => setForm({ ...form, chantierId: e.target.value })}
          >
            <option value="">—</option>
            {chantiers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
      )}
      <div className="sm:col-span-2">
        <Textarea
          label={t('fields.remark')}
          rows={2}
          value={form.remark}
          onChange={(e) => setForm({ ...form, remark: e.target.value })}
        />
      </div>
      <div className="sm:col-span-2">
        <p className="block text-[11px] font-medium text-gic-muted mb-1">{t('fields.proofOptional')}</p>
        <label className="mac-upload-btn cursor-pointer">
          <Upload size={14} />
          {form.proof ? t('fields.changeFile') : t('fields.addProof')}
          <input
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => setForm({ ...form, proof: e.target.files?.[0] || null })}
          />
        </label>
        {form.proof ? (
          <p className="mt-1 text-[11px] text-gic-ink truncate">{form.proof.name}</p>
        ) : (
          <p className="mt-1 text-[11px] text-gic-muted">{t('fields.proofHint')}</p>
        )}
      </div>
    </div>
  );
}
