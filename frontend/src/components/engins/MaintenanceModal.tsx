import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { appAlert } from '../../lib/dialog';
import { MAINTENANCE_KINDS, MAINTENANCE_TYPES, errorMessage, formatMad2, isoDate, num, todayISO } from '../../lib/engins';
import { useI18n } from '../../i18n/I18nContext';
import { Btn, Input, Modal, Select, Textarea } from '../ui';
import { AllocationFields, EnginSelect, FormGrid, useFleetRefs, type AllocationValue } from './FleetCommon';

export type MaintenanceRecord = {
  id: string;
  enginId: string;
  kind?: string | null;
  date: string;
  designation: string;
  maintenanceType?: string | null;
  breakdownNature?: string | null;
  description?: string | null;
  repairer?: string | null;
  partsCost?: number | null;
  laborCost?: number | null;
  budget?: number | null;
  downtimeDays?: number | null;
  counterValue?: number | null;
  responsible?: string | null;
  supervisor?: string | null;
  invoiceRef?: string | null;
  allocation?: string | null;
  chantierId?: string | null;
  tranche?: string | null;
  remark?: string | null;
};

type Form = {
  enginId: string;
  kind: string;
  date: string;
  designation: string;
  maintenanceType: string;
  breakdownNature: string;
  description: string;
  repairer: string;
  partsCost: string;
  laborCost: string;
  budget: string;
  downtimeDays: string;
  counterValue: string;
  responsible: string;
  supervisor: string;
  invoiceRef: string;
  remark: string;
};

const s = (v: number | string | null | undefined) => (v == null ? '' : String(v));

export function MaintenanceModal({
  open,
  onClose,
  onSaved,
  record,
  defaultKind = 'entretien',
  enginId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id?: string) => void;
  record?: MaintenanceRecord | null;
  defaultKind?: string;
  enginId?: string;
}) {
  const { t } = useI18n();
  const { engins, chantiers } = useFleetRefs();
  const [form, setForm] = useState<Form>(() => blank());
  const [alloc, setAlloc] = useState<AllocationValue>({ allocation: 'reparti', chantierId: '', tranche: '' });
  const [setStatus, setSetStatus] = useState(true);
  const [saving, setSaving] = useState(false);

  function blank(): Form {
    return {
      enginId: enginId || '', kind: defaultKind, date: todayISO(), designation: '', maintenanceType: defaultKind === 'entretien' ? 'vidange' : '',
      breakdownNature: '', description: '', repairer: '', partsCost: '', laborCost: '', budget: '', downtimeDays: '', counterValue: '',
      responsible: '', supervisor: '', invoiceRef: '', remark: '',
    };
  }

  useEffect(() => {
    if (!open) return;
    if (record) {
      setForm({
        enginId: record.enginId, kind: record.kind || 'entretien', date: isoDate(record.date), designation: record.designation,
        maintenanceType: record.maintenanceType || '', breakdownNature: record.breakdownNature || '', description: record.description || '',
        repairer: record.repairer || '', partsCost: s(record.partsCost), laborCost: s(record.laborCost), budget: s(record.budget),
        downtimeDays: s(record.downtimeDays), counterValue: s(record.counterValue), responsible: record.responsible || '',
        supervisor: record.supervisor || '', invoiceRef: record.invoiceRef || '', remark: record.remark || '',
      });
      setAlloc({ allocation: record.allocation === 'direct' ? 'direct' : 'reparti', chantierId: record.chantierId || '', tranche: record.tranche || '' });
    } else {
      setForm(blank());
      setAlloc({ allocation: 'reparti', chantierId: '', tranche: '' });
      setSetStatus(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record]);

  const isRepair = form.kind === 'reparation';
  const computed = num(form.partsCost) + num(form.laborCost);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const n = (v: string) => (v === '' ? null : Number(v));
    const designation = form.designation.trim() || (isRepair ? form.breakdownNature.trim() : t(`fleet.maintType.${form.maintenanceType || 'autre'}`));
    const body = {
      kind: form.kind,
      date: form.date,
      designation,
      maintenanceType: isRepair ? null : form.maintenanceType || null,
      breakdownNature: isRepair ? form.breakdownNature || null : null,
      description: form.description || null,
      repairer: form.repairer || null,
      partsCost: n(form.partsCost),
      laborCost: n(form.laborCost),
      budget: form.budget === '' ? (computed > 0 ? computed : null) : Number(form.budget),
      downtimeDays: n(form.downtimeDays),
      counterValue: n(form.counterValue),
      responsible: form.responsible || null,
      supervisor: form.supervisor || null,
      invoiceRef: form.invoiceRef || null,
      remark: form.remark || null,
      ...alloc,
      chantierId: alloc.chantierId || null,
      tranche: alloc.tranche || null,
      ...(record ? {} : { setStatus }),
    };
    try {
      const saved = record
        ? await api<{ id: string }>(`/engins/maintenances/${record.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await api<{ id: string }>(`/engins/${form.enginId}/maintenances`, { method: 'POST', body: JSON.stringify(body) });
      onSaved(saved?.id);
      onClose();
    } catch (err) {
      await appAlert(errorMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      size="lg"
      title={record ? t(isRepair ? 'fleet.actions.editRepair' : 'fleet.actions.editMaintenance') : t(isRepair ? 'fleet.actions.newRepair' : 'fleet.actions.newMaintenance')}
      onClose={onClose}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn form="fleet-maint-form" type="submit" disabled={saving}>{t('common.save')}</Btn>
        </>
      }
    >
      <form id="fleet-maint-form" onSubmit={submit}>
        <FormGrid>
          <div className="sm:col-span-2">
            <EnginSelect engins={engins} value={form.enginId} disabled={!!enginId || !!record} onChange={(id) => setForm({ ...form, enginId: id })} />
          </div>
          <Select label={t('fleet.fields.maintKind')} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value, maintenanceType: e.target.value === 'entretien' ? form.maintenanceType || 'vidange' : '' })}>
            {MAINTENANCE_KINDS.map((k) => <option key={k} value={k}>{t(`fleet.maintKind.${k}`)}</option>)}
          </Select>
          <Input label={`${t('fleet.fields.date')} *`} type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          {isRepair ? (
            <Input label={`${t('fleet.fields.breakdownNature')} *`} required value={form.breakdownNature} onChange={(e) => setForm({ ...form, breakdownNature: e.target.value })} />
          ) : (
            <Select label={t('fleet.fields.maintenanceType')} value={form.maintenanceType} onChange={(e) => setForm({ ...form, maintenanceType: e.target.value })}>
              {MAINTENANCE_TYPES.map((m) => <option key={m} value={m}>{t(`fleet.maintType.${m}`)}</option>)}
            </Select>
          )}
          <Input label={t('fleet.fields.designation')} placeholder={isRepair ? form.breakdownNature : t(`fleet.maintType.${form.maintenanceType || 'autre'}`)} value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          <div className="sm:col-span-2">
            <Textarea label={t('fleet.fields.description')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <Input label={isRepair ? t('fleet.fields.repairer') : t('fleet.fields.provider')} value={form.repairer} onChange={(e) => setForm({ ...form, repairer: e.target.value })} />
          <Input label={t('fleet.fields.invoiceRef')} value={form.invoiceRef} onChange={(e) => setForm({ ...form, invoiceRef: e.target.value })} />
          <Input label={t('fleet.fields.partsCost')} type="number" min="0" step="0.01" value={form.partsCost} onChange={(e) => setForm({ ...form, partsCost: e.target.value })} />
          <Input label={t('fleet.fields.laborCost')} type="number" min="0" step="0.01" value={form.laborCost} onChange={(e) => setForm({ ...form, laborCost: e.target.value })} />
          <Input
            label={t('fleet.fields.totalCostMaint')}
            type="number"
            min="0"
            step="0.01"
            placeholder={computed > 0 ? String(computed) : ''}
            value={form.budget}
            onChange={(e) => setForm({ ...form, budget: e.target.value })}
          />
          <p className="self-end pb-2 text-[11px] text-gic-muted">{form.budget === '' && computed > 0 ? t('fleet.hints.partsPlusLabor', { amount: formatMad2(computed) }) : ''}</p>
          <Input label={t('fleet.fields.downtimeDays')} type="number" min="0" step="0.5" value={form.downtimeDays} onChange={(e) => setForm({ ...form, downtimeDays: e.target.value })} />
          <Input label={t('fleet.fields.counter')} type="number" min="0" value={form.counterValue} onChange={(e) => setForm({ ...form, counterValue: e.target.value })} />
          <Input label={t('fleet.fields.responsible')} value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
          <Input label={t('fields.supervisor')} value={form.supervisor} onChange={(e) => setForm({ ...form, supervisor: e.target.value })} />
          <AllocationFields value={alloc} onChange={setAlloc} chantiers={chantiers} />
          <div className="sm:col-span-2">
            <Textarea label={t('fleet.fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </div>
          {!record && (
            <label className="sm:col-span-2 flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={setStatus} onChange={(e) => setSetStatus(e.target.checked)} />
              {t(isRepair ? 'fleet.hints.setRepairStatus' : 'fleet.hints.setMaintStatus')}
            </label>
          )}
        </FormGrid>
      </form>
    </Modal>
  );
}
