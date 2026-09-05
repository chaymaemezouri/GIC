import { useI18n } from '../i18n/I18nContext';
import { Input, Select, Textarea } from './ui';
import { SALARY_PERIOD_LABELS, SALARY_PERIODS, salaryPeriodUnitLabel } from '../lib/staffSalaryPeriod';
import { MAROC_BANKS } from '../lib/marocBanks';



export type InternalStaffFormData = {

  firstName: string;

  lastName: string;

  email: string;

  password: string;

  role: string;

  isActive: string;

  cin: string;

  birthDate: string;

  address: string;

  phone1: string;

  phone2: string;

  jobTitle: string;

  department: string;

  hireDate: string;

  contractType: string;

  monthlySalary: string;

  salaryPeriod: string;

  declared: string;

  cnssNumber: string;

  bankName: string;

  rib: string;

  emergencyContact: string;

  remark: string;

};



export const JOB_TITLES = [

  'Secrétaire',

  'Assistant(e) de direction',

  'Comptable',

  'Commercial',

  'Chef de chantier',

  'Responsable RH',

  'Informaticien',

  'Autre',

];



export const DEPARTMENTS = [

  'Direction',

  'Administration',

  'Commercial',

  'Comptabilité',

  'Chantier',

  'Ressources humaines',

  'Informatique',

];



export function emptyInternalStaffForm(): InternalStaffFormData {

  return {

    firstName: '',

    lastName: '',

    email: '',

    password: '',

    role: 'COMMERCIAL',

    isActive: 'true',

    cin: '',

    birthDate: '',

    address: '',

    phone1: '',

    phone2: '',

    jobTitle: '',

    department: '',

    hireDate: '',

    contractType: 'CDI',

    monthlySalary: '',

    salaryPeriod: 'mensuel',

    declared: 'false',

    cnssNumber: '',

    bankName: '',

    rib: '',

    emergencyContact: '',

    remark: '',

  };

}



export function staffToForm(u: Record<string, unknown>): InternalStaffFormData {

  const linkedUser = u.user as Record<string, unknown> | null | undefined;

  return {

    firstName: String(u.firstName || ''),

    lastName: String(u.lastName || ''),

    email: String(u.email || linkedUser?.email || ''),

    password: '',

    role: String(linkedUser?.role || 'COMMERCIAL'),

    isActive: u.isActive === false ? 'false' : 'true',

    cin: String(u.cin || ''),

    birthDate: u.birthDate ? String(u.birthDate).slice(0, 10) : '',

    address: String(u.address || ''),

    phone1: String(u.phone1 || ''),

    phone2: String(u.phone2 || ''),

    jobTitle: String(u.jobTitle || ''),

    department: String(u.department || ''),

    hireDate: u.hireDate ? String(u.hireDate).slice(0, 10) : '',

    contractType: String(u.contractType || 'CDI'),

    monthlySalary: u.monthlySalary != null ? String(u.monthlySalary) : '',

    salaryPeriod: String(u.salaryPeriod || 'mensuel'),

    declared: u.declared ? 'true' : 'false',

    cnssNumber: String(u.cnssNumber || ''),

    bankName: String(u.bankName || ''),

    rib: String(u.rib || u.bankAccount || ''),

    emergencyContact: String(u.emergencyContact || ''),

    remark: String(u.remark || ''),

  };

}



export function staffFormToBody(f: InternalStaffFormData) {

  return {

    firstName: f.firstName,

    lastName: f.lastName,

    email: f.email || null,

    isActive: f.isActive === 'true',

    cin: f.cin || null,

    birthDate: f.birthDate || null,

    address: f.address || null,

    phone1: f.phone1 || null,

    phone2: f.phone2 || null,

    jobTitle: f.jobTitle || null,

    department: f.department || null,

    hireDate: f.hireDate || null,

    contractType: f.contractType || null,

    monthlySalary: f.monthlySalary ? Number(f.monthlySalary) : 0,

    salaryPeriod: f.salaryPeriod || 'mensuel',

    declared: f.declared === 'true',

    cnssNumber: f.cnssNumber || null,

    bankName: f.bankName || null,

    rib: f.rib || null,

    bankAccount: f.rib || null,

    emergencyContact: f.emergencyContact || null,

    remark: f.remark || null,

  };

}



export function InternalStaffFormFields({
  form,
  setForm,
}: {
  form: InternalStaffFormData;
  setForm: (f: InternalStaffFormData) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide">{t('fields.sectionIdentity')}</p>
      <Input label={`${t('fields.firstName')} *`} required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
      <Input label={`${t('fields.lastName')} *`} required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
      <Input label={t('fields.emailContact')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <Select label={t('fields.hrStatus')} value={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.value })}>
        <option value="true">{t('status.active')}</option>
        <option value="false">{t('status.inactive')}</option>
      </Select>

      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide">{t('fields.sectionContact')}</p>
      <Input label={t('fields.cin')} value={form.cin} onChange={(e) => setForm({ ...form, cin: e.target.value })} />
      <Input label={t('fields.birthDate')} type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
      <Input label={t('fields.phone')} value={form.phone1} onChange={(e) => setForm({ ...form, phone1: e.target.value })} />
      <Input label={t('fields.phone2')} value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} />
      <Input label={t('fields.emergencyContact')} value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} className="sm:col-span-2" />
      <Textarea label={t('fields.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} className="sm:col-span-2" />

      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide">{t('fields.sectionJobContract')}</p>
      <Select label={t('fields.function')} value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}>
        <option value="">—</option>
        {JOB_TITLES.map((title) => <option key={title} value={title}>{title}</option>)}
      </Select>
      <Select label={t('fields.service')} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
        <option value="">—</option>
        {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
      </Select>
      <Input label={t('fields.hireDate')} type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
      <Select label={t('fields.contractType')} value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })}>
        <option value="CDI">CDI</option>
        <option value="CDD">CDD</option>
        <option value="Stage">Stage</option>
        <option value="Freelance">Freelance</option>
      </Select>

      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide">{t('fields.sectionRemuneration')}</p>
      <Select label={t('fields.payPeriod')} value={form.salaryPeriod} onChange={(e) => setForm({ ...form, salaryPeriod: e.target.value })}>
        {SALARY_PERIODS.map((p) => <option key={p} value={p}>{SALARY_PERIOD_LABELS[p]}</option>)}
      </Select>
      <Input
        label={t('fields.referenceSalary')}
        type="number"
        min={0}
        step={100}
        value={form.monthlySalary}
        onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })}
      />
      <p className="sm:col-span-2 text-[10px] text-gic-muted">
        {t('msg.salaryCalcByUnit', { unit: salaryPeriodUnitLabel(form.salaryPeriod) })}
      </p>
      <Select label={t('fields.declaredCnss')} value={form.declared} onChange={(e) => setForm({ ...form, declared: e.target.value })}>
        <option value="false">{t('fields.notDeclared')}</option>
        <option value="true">{t('fields.declared')}</option>
      </Select>
      <Input label={t('fields.cnss')} value={form.cnssNumber} onChange={(e) => setForm({ ...form, cnssNumber: e.target.value })} />
      <p className="sm:col-span-2 text-[11px] font-semibold text-gic-violet uppercase tracking-wide pt-1">{t('fields.sectionBankDetails')}</p>
      <Select label={`${t('fields.bankName')} *`} value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} required>
        <option value="">{t('fields.chooseBank')}</option>
        {MAROC_BANKS.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
        {form.bankName && !(MAROC_BANKS as readonly string[]).includes(form.bankName) && (
          <option value={form.bankName}>{form.bankName}</option>
        )}
      </Select>
      <Input label={`${t('fields.rib')} *`} required value={form.rib} onChange={(e) => setForm({ ...form, rib: e.target.value })} placeholder={t('fields.ribDigitsPlaceholder')} />
      <Textarea label={t('fields.hrRemark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} rows={2} className="sm:col-span-2" />
    </div>
  );
}


