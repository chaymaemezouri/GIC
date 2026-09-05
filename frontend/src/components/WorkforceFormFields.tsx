import { useI18n } from '../i18n/I18nContext';
import { Input, Select } from './ui';
import { MAROC_BANKS } from '../lib/marocBanks';

export type WorkforceFormData = {
  firstName: string;
  lastName: string;
  cin: string;
  birthDate: string;
  address: string;
  phone1: string;
  phone2: string;
  email: string;
  category: string;
  groupe: string;
  workPassport: string;
  hireDate: string;
  contractType: string;
  /** jour = pointage ; mois = salaires mensuels */
  salaryPeriod: string;
  cnssNumber: string;
  dailySalary: string;
  monthlySalary: string;
  bankName: string;
  rib: string;
  declared: string;
  isActive: string;
};

export function emptyWorkforceForm(): WorkforceFormData {
  return {
    firstName: '',
    lastName: '',
    cin: '',
    birthDate: '',
    address: '',
    phone1: '',
    phone2: '',
    email: '',
    category: '',
    groupe: '',
    workPassport: '',
    hireDate: '',
    contractType: 'Journalier',
    salaryPeriod: 'jour',
    cnssNumber: '',
    dailySalary: '',
    monthlySalary: '',
    bankName: '',
    rib: '',
    declared: 'false',
    isActive: 'true',
  };
}

export function workforceToForm(w: Record<string, unknown>): WorkforceFormData {
  const period = String(w.salaryPeriod || '').toLowerCase() === 'mois' ? 'mois' : 'jour';
  return {
    firstName: String(w.firstName || ''),
    lastName: String(w.lastName || ''),
    cin: String(w.cin || ''),
    birthDate: w.birthDate ? String(w.birthDate).slice(0, 10) : '',
    address: String(w.address || ''),
    phone1: String(w.phone1 || ''),
    phone2: String(w.phone2 || ''),
    email: String(w.email || ''),
    category: String(w.category || ''),
    groupe: String(w.groupe || ''),
    workPassport: String(w.workPassport || ''),
    hireDate: w.hireDate ? String(w.hireDate).slice(0, 10) : '',
    contractType: period === 'mois' ? 'Mensuel' : String(w.contractType || 'Journalier'),
    salaryPeriod: period,
    cnssNumber: String(w.cnssNumber || ''),
    dailySalary: String(w.dailySalary ?? ''),
    monthlySalary: String(w.monthlySalary ?? ''),
    bankName: String(w.bankName || ''),
    rib: String(w.rib || ''),
    declared: w.declared ? 'true' : 'false',
    isActive: w.isActive === false ? 'false' : 'true',
  };
}

export function WorkforceFormFields({
  form,
  setForm,
  categories = [],
  hideCategory = false,
}: {
  form: WorkforceFormData;
  setForm: (f: WorkforceFormData) => void;
  categories?: string[];
  hideCategory?: boolean;
}) {
  const { t } = useI18n();
  const isMois = form.salaryPeriod === 'mois';

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide">{t('fields.sectionIdentity')}</p>
      <Input label={`${t('fields.firstName')} *`} required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
      <Input label={`${t('fields.lastName')} *`} required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
      <Input label={t('fields.cin')} value={form.cin} onChange={(e) => setForm({ ...form, cin: e.target.value })} />
      <Input label={t('fields.birthDate')} type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
      <Input className="sm:col-span-2" label={t('fields.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />

      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide pt-1">{t('fields.sectionContact')}</p>
      <Input label={t('fields.phone1')} value={form.phone1} onChange={(e) => setForm({ ...form, phone1: e.target.value })} />
      <Input label={t('fields.phone2')} value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} />
      <Input label={t('fields.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide pt-1">{t('fields.sectionEmployment')}</p>
      {!hideCategory && (
        <>
          <Input label={t('fields.category')} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t('fields.categoryPlaceholder')} list={categories.length ? 'workforce-categories' : undefined} />
          {categories.length > 0 && (
            <datalist id="workforce-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          )}
        </>
      )}
      <Input label={t('fields.group')} value={form.groupe} onChange={(e) => setForm({ ...form, groupe: e.target.value })} />
      <Input label={t('fields.workPassport')} value={form.workPassport} onChange={(e) => setForm({ ...form, workPassport: e.target.value })} />
      <Select
        label={`${t('fields.payMode')} *`}
        required
        value={form.salaryPeriod}
        onChange={(e) => {
          const salaryPeriod = e.target.value;
          const isMoisNext = salaryPeriod === 'mois';
          setForm({
            ...form,
            salaryPeriod,
            contractType: isMoisNext ? 'Mensuel' : (form.contractType === 'Mensuel' ? 'Journalier' : form.contractType),
            bankName: isMoisNext ? form.bankName : '',
            rib: isMoisNext ? form.rib : '',
          });
        }}
      >
        <option value="jour">{t('fields.payDaily')}</option>
        <option value="mois">{t('fields.payMonthly')}</option>
      </Select>
      <Select
        label={t('fields.contractType')}
        value={form.contractType}
        onChange={(e) => setForm({ ...form, contractType: e.target.value })}
        disabled={isMois}
      >
        <option value="Journalier">{t('fields.contractDaily')}</option>
        <option value="Mensuel">{t('fields.contractMonthly')}</option>
        <option value="Saisonnier">{t('fields.contractSeasonal')}</option>
      </Select>
      <Input label={t('fields.hireDate')} type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
      {isMois ? (
        <Input
          label={`${t('fields.monthlySalaryMad')} *`}
          required
          type="number"
          min="0"
          step="0.01"
          value={form.monthlySalary}
          onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })}
        />
      ) : (
        <Input
          label={`${t('fields.dailySalaryMad')} *`}
          required
          type="number"
          min="0"
          step="0.01"
          value={form.dailySalary}
          onChange={(e) => setForm({ ...form, dailySalary: e.target.value })}
        />
      )}
      <Input label={t('fields.cnss')} value={form.cnssNumber} onChange={(e) => setForm({ ...form, cnssNumber: e.target.value })} />
      <Select label={t('fields.declaredCnss')} value={form.declared} onChange={(e) => setForm({ ...form, declared: e.target.value })}>
        <option value="false">{t('fields.no')}</option>
        <option value="true">{t('fields.yes')}</option>
      </Select>
      <Select label={t('fields.status')} value={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.value })}>
        <option value="true">{t('status.active')}</option>
        <option value="false">{t('status.inactive')}</option>
      </Select>

      {isMois && (
        <>
          <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide pt-1">
            {t('fields.sectionBankDetailsMonthly')}
          </p>
          <Select
            label={`${t('fields.bankName')} *`}
            required
            value={form.bankName}
            onChange={(e) => setForm({ ...form, bankName: e.target.value })}
          >
            <option value="">{t('fields.chooseBank')}</option>
            {MAROC_BANKS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
            {form.bankName && !(MAROC_BANKS as readonly string[]).includes(form.bankName) && (
              <option value={form.bankName}>{form.bankName}</option>
            )}
          </Select>
          <Input
            label={`${t('fields.rib')} *`}
            required
            value={form.rib}
            onChange={(e) => setForm({ ...form, rib: e.target.value })}
            placeholder={t('fields.ribDigitsPlaceholder')}
          />
          <p className="sm:col-span-2 text-[11px] text-gic-muted">
            {t('msg.workforceMonthlyOnlyHint')}
          </p>
        </>
      )}
    </div>
  );
}
