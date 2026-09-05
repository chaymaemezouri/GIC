import { appAlert, appConfirm } from '../lib/dialog';
import { useState } from 'react';
import { Calendar, Plus, Trash2, Wand2 } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { api, formatDate, formatMad } from '../lib/api';
import { Btn, Card, Input, Modal, StatusPill, TableWrap, Td, Th } from './ui';

type Schedule = {
  id: string;
  dueDate: string;
  amount: number;
  label?: string | null;
  status: string;
  paidAt?: string | null;
  remark?: string | null;
};

type Props = {
  entityType: 'sales' | 'rentals';
  entityId: string;
  schedules: Schedule[];
  onReload: () => void;
  canEdit?: boolean;
};

export default function PaymentSchedulePanel({ entityType, entityId, schedules, onReload, canEdit = true }: Props) {
  const { t } = useI18n();
  const [addOpen, setAddOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [form, setForm] = useState({ dueDate: '', amount: '', label: '', remark: '' });
  const [genForm, setGenForm] = useState({ count: '12', startDate: new Date().toISOString().slice(0, 10) });

  const base = `/transactions/${entityType}/${entityId}/schedules`;

  async function addSchedule(e: React.FormEvent) {
    e.preventDefault();
    await api(base, { method: 'POST', body: JSON.stringify(form) });
    setAddOpen(false);
    setForm({ dueDate: '', amount: '', label: '', remark: '' });
    onReload();
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    await api(`${base}/generate`, {
      method: 'POST',
      body: JSON.stringify({ count: Number(genForm.count), startDate: genForm.startDate }),
    });
    setGenOpen(false);
    onReload();
  }

  async function markPaid(id: string) {
    await api(`/transactions/schedules/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'paid' }) });
    onReload();
  }

  async function remove(id: string) {
    if (!await appConfirm(t('msg.confirmDeleteSchedule'))) return;
    await api(`/transactions/schedules/${id}`, { method: 'DELETE' });
    onReload();
  }

  const pending = schedules.filter((s) => s.status === 'pending').length;
  const overdue = schedules.filter((s) => s.status === 'overdue').length;
  const paid = schedules.filter((s) => s.status === 'paid').length;
  const totalPending = schedules.filter((s) => s.status !== 'paid').reduce((a, s) => a + s.amount, 0);

  return (
    <Card padding={false}>
      <div className="px-4 py-3 border-b border-gic-border flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-gic-violet" />
          <h2 className="text-sm font-semibold">{t('fields.paymentSchedule')}</h2>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Btn variant="secondary" icon={Wand2} onClick={() => setGenOpen(true)}>{t('actions.generate')}</Btn>
            <Btn icon={Plus} onClick={() => setAddOpen(true)}>{t('common.add')}</Btn>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-4 gap-3 p-4 border-b border-gic-border/60 bg-gray-50/50">
        <div><p className="text-[10px] text-gic-muted uppercase">{t('status.pending')}</p><p className="font-semibold">{pending}</p></div>
        <div><p className="text-[10px] text-gic-muted uppercase">{t('status.overdue')}</p><p className="font-semibold text-gic-coral">{overdue}</p></div>
        <div><p className="text-[10px] text-gic-muted uppercase">{t('fields.paidFeminine')}</p><p className="font-semibold text-gic-emerald">{paid}</p></div>
        <div><p className="text-[10px] text-gic-muted uppercase">{t('fields.scheduleRemaining')}</p><p className="font-semibold">{formatMad(totalPending)}</p></div>
      </div>

      {schedules.length === 0 ? (
        <p className="p-6 text-[12px] text-gic-muted">{t('msg.noSchedules')}</p>
      ) : (
        <TableWrap>
          <thead>
            <tr><Th>{t('fields.date')}</Th><Th>{t('fields.label')}</Th><Th>{t('fields.amount')}</Th><Th>{t('fields.status')}</Th>{canEdit && <Th>{t('common.actions')}</Th>}</tr>
          </thead>
          <tbody>
            {schedules.map((s) => {
              const isOverdue = s.status === 'pending' && new Date(s.dueDate) < new Date();
              const status = isOverdue ? 'overdue' : s.status;
              return (
                <tr key={s.id}>
                  <Td className="text-[11px]">{formatDate(s.dueDate)}</Td>
                  <Td>{s.label || '—'}</Td>
                  <Td className="font-medium">{formatMad(s.amount)}</Td>
                  <Td><StatusPill status={status === 'paid' ? 'soldée' : status === 'overdue' ? 'retard' : 'en_cours'} /></Td>
                  {canEdit && (
                    <Td>
                      <div className="flex gap-1">
                        {s.status !== 'paid' && (
                          <Btn variant="ghost" onClick={() => markPaid(s.id)} title={t('fields.markPaidFeminine')}>{t('fields.paidFeminineShort')}</Btn>
                        )}
                        <Btn variant="ghost" icon={Trash2} onClick={() => remove(s.id)} title={t('common.delete')} />
                      </div>
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      <Modal open={addOpen} title={t('fields.newInstallment')} onClose={() => setAddOpen(false)}
        footer={<Btn form="sched-add" type="submit">{t('common.save')}</Btn>}
      >
        <form id="sched-add" onSubmit={addSchedule} className="grid gap-3">
          <Input label={`${t('fields.dueDate')} *`} type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <Input label={`${t('fields.amountMad')} *`} type="number" required min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Input label={t('fields.label')} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <Input label={t('fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
        </form>
      </Modal>

      <Modal open={genOpen} title={t('fields.generateSchedule')} onClose={() => setGenOpen(false)}
        footer={<Btn form="sched-gen" type="submit">{t('actions.generate')}</Btn>}
      >
        <form id="sched-gen" onSubmit={generate} className="grid gap-3">
          <p className="text-[12px] text-gic-muted">
            {entityType === 'sales'
              ? t('msg.scheduleGenSalesHint')
              : t('msg.scheduleGenRentalHint')}
          </p>
          <Input label={t('fields.installmentCount')} type="number" min="1" max="60" value={genForm.count} onChange={(e) => setGenForm({ ...genForm, count: e.target.value })} />
          <Input label={t('fields.startDate')} type="date" value={genForm.startDate} onChange={(e) => setGenForm({ ...genForm, startDate: e.target.value })} />
        </form>
      </Modal>
    </Card>
  );
}
