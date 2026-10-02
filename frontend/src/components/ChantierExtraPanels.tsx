import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api, formatDate, formatMad } from '../lib/api';
import { Btn, Input, MacActionBtn, Modal, Select, TableWrap, Td, Th } from './ui';
import { useI18n } from '../i18n/I18nContext';

type Follow = { id: string; label: string; percent: number; validated: boolean };
type Pay = { id: string; amount: number; kind: string; paymentMode?: string | null; date: string; remark?: string | null };
type Task = { id: string; taskName: string; tranche?: string | null; phases?: { label?: string; percent?: number }[] | null };

type Subcontractor = {
  id: string;
  companyName: string;
  corpsEtat?: string | null;
  phone?: string | null;
  amount?: number | null;
  progressPct?: number | null;
  paidAmount?: number | null;
  status: string;
  remark?: string | null;
  scope?: string;
  phaseLabel?: string | null;
  tranche?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  follows?: Follow[];
  payments?: Pay[];
  workProgress?: { id: string; taskName: string; tranche?: string | null } | null;
};

export function ChantierSubcontractorsPanel({ chantierId }: { chantierId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Subcontractor[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ companyName: '', phone: '', amount: '', remark: '', workProgressId: '', scope: 'phase', phaseLabel: '' });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [standardPhases, setStandardPhases] = useState<{ name: string; phases: { label?: string; percent?: number }[] }[]>([]);
  const [detail, setDetail] = useState<Subcontractor | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('especes');
  const [payKind, setPayKind] = useState('avance');

  function load() {
    api<Subcontractor[]>(`/chantiers/${chantierId}/subcontractors`).then(setItems).catch(() => setItems([]));
    api<Task[]>(`/chantiers/${chantierId}/progress`).then(setTasks).catch(() => setTasks([]));
    api<{ name: string; phases: { label?: string; percent?: number }[] }[]>('/chantiers/tasks/standard')
      .then(setStandardPhases)
      .catch(() => setStandardPhases([]));
  }

  useEffect(() => { load(); }, [chantierId]);

  function openCreate() {
    setForm({ companyName: '', phone: '', amount: '', remark: '', workProgressId: '', scope: 'phase', phaseLabel: '' });
    setOpen(true);
  }

  function openEdit(item: Subcontractor) {
    setDetail(item);
    setPayAmount('');
    setPayKind('avance');
    setPayMode('especes');
  }

  async function toggleFollow(follow: Follow) {
    if (!detail) return;
    try {
      const updated = await api<Subcontractor>(`/chantiers/${chantierId}/subcontractors/${detail.id}/follows/${follow.id}`, {
        method: 'PUT',
        body: JSON.stringify({ validated: !follow.validated }),
      });
      setDetail(updated);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    try {
      const updated = await api<Subcontractor>(`/chantiers/${chantierId}/subcontractors/${detail.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(payAmount), kind: payKind, paymentMode: payMode }),
      });
      setDetail(updated);
      setPayAmount('');
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const selectedTask = tasks.find((task) => task.id === form.workProgressId);
  const taskPhases = selectedTask?.phases?.length
    ? selectedTask.phases
    : (standardPhases.find((lot) => lot.name === selectedTask?.taskName)?.phases || []);
  const phaseOptions = taskPhases.map((p) => String(p.label || '')).filter(Boolean);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      companyName: form.companyName,
      phone: form.phone || null,
      amount: form.amount ? Number(form.amount) : null,
      remark: form.remark || null,
      workProgressId: form.workProgressId || null,
      scope: form.scope,
      phaseLabel: form.scope === 'phase' ? form.phaseLabel : null,
    };
    try {
      await api(`/chantiers/${chantierId}/subcontractors`, { method: 'POST', body: JSON.stringify(body) });
      setOpen(false);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function scopeLine(item: Subcontractor) {
    const what = item.scope === 'phase' && item.phaseLabel ? item.phaseLabel : t('detail.subcontractWhole');
    const period = item.startDate || item.endDate
      ? ` · ${item.startDate ? formatDate(item.startDate) : '…'} → ${item.endDate ? formatDate(item.endDate) : '…'}`
      : '';
    return `${item.tranche || t('msg.wholeSite')} · ${what}${period}`;
  }

  function isOpen(item: Subcontractor) {
    const workOpen = item.status !== 'termine' && Number(item.progressPct || 0) < 100;
    const moneyOpen = Number(item.amount || 0) > Number(item.paidAmount || 0) + 0.01;
    return workOpen || moneyOpen;
  }

  const ordered = [...items].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)));

  async function openOnTask(item: Subcontractor) {
    const progressId = item.workProgress?.id;
    const trancheName = item.tranche || item.workProgress?.tranche;
    if (!progressId || !trancheName) {
      openEdit(item);
      return;
    }
    try {
      const tranches = await api<{ id: string; name: string }[]>(`/chantiers/${chantierId}/tranches`);
      const tranche = (Array.isArray(tranches) ? tranches : []).find((row) => row.name === trancheName);
      if (!tranche) {
        openEdit(item);
        return;
      }
      navigate(`/chantiers/${chantierId}/tranches/${tranche.id}`, {
        state: {
          focusTaskId: progressId,
          focusPhase: item.scope === 'phase' ? item.phaseLabel || null : null,
        },
      });
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function remove(id: string) {
    if (!await appConfirm(t('msg.confirmDeleteSubcontractor'))) return;
    try {
      await api(`/chantiers/${chantierId}/subcontractors/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <div className="mt-2 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-gic-ink">{t('detail.subcontractorsTitle')}</p>
        <Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-3 text-[12px]">
          <span className="mac-chip mac-chip-gray">{t('fields.amount')} {formatMad(items.reduce((s, i) => s + Number(i.amount || 0), 0))}</span>
          <span className="mac-chip mac-chip-emerald">{t('siteOps.paid')} {formatMad(items.reduce((s, i) => s + Number(i.paidAmount || 0), 0))}</span>
          <span className="mac-chip mac-chip-blue">{t('siteOps.moneyLeft')} {formatMad(items.reduce((s, i) => s + Math.max(0, Number(i.amount || 0) - Number(i.paidAmount || 0)), 0))}</span>
        </div>
      )}
      {items.length === 0 ? (
        <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptySubcontractors')}</p>
      ) : (
        <TableWrap mac>
          <thead>
            <tr>
              <Th mac>{t('fields.company')}</Th>
              <Th mac>{t('fields.corpsEtat')}</Th>
              <Th mac>{t('fields.amount')}</Th>
              <Th mac>{t('siteOps.progress')}</Th>
              <Th mac>{t('siteOps.paid')}</Th>
              <Th mac>{t('siteOps.moneyLeft')}</Th>
              <Th mac>{t('fields.status')}</Th>
              <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
            </tr>
          </thead>
          <tbody>
            {ordered.map((item) => (
              <tr key={item.id} className="cursor-pointer" onClick={() => openOnTask(item)}>
                <Td mac>
                  <span className="font-medium">{item.companyName}</span>
                  {item.phone && <span className="block text-[10px] text-gic-muted">{item.phone}</span>}
                </Td>
                <Td mac className="mac-table-muted">
                  {item.corpsEtat || '—'}
                  <span className="block text-[10px]">{scopeLine(item)}</span>
                </Td>
                <Td mac>{item.amount != null ? formatMad(item.amount) : '—'}</Td>
                <Td mac>{Math.round(Number(item.progressPct || 0))} %</Td>
                <Td mac>{formatMad(item.paidAmount || 0)}</Td>
                <Td mac>{formatMad(Math.max(0, Number(item.amount || 0) - Number(item.paidAmount || 0)))}</Td>
                <Td mac>
                  <span className={`mac-chip ${isOpen(item) ? 'mac-chip-orange' : 'mac-chip-green'}`}>
                    {isOpen(item) ? t('detail.stOpen') : t('detail.stDone')}
                  </span>
                </Td>
                <Td mac className="mac-td-actions">
                  <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                    <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openOnTask(item)} />
                    <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => remove(item.id)} />
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <Modal
        open={open}
        title={t('actions.newSubcontractor')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="sub-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="sub-form" onSubmit={save} className="grid gap-3">
          <p className="text-[12px] text-gic-muted">{t('detail.subcontractHint')}</p>
          <Select required label={t('detail.subcontractTask')} value={form.workProgressId} onChange={(e) => setForm({ ...form, workProgressId: e.target.value, phaseLabel: '' })}>
            <option value="">{t('common.choose')}</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>{task.tranche || t('msg.wholeSite')} · {task.taskName}</option>
            ))}
          </Select>
          <Select label={t('detail.subcontractScope')} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value, phaseLabel: '' })}>
            <option value="phase">{t('detail.subcontractOnePhase')}</option>
            <option value="task">{t('detail.subcontractWhole')}</option>
          </Select>
          {form.scope === 'phase' && (
            <Select label={t('detail.subcontractPhase')} value={form.phaseLabel} onChange={(e) => setForm({ ...form, phaseLabel: e.target.value })}>
              <option value="">{t('common.choose')}</option>
              {phaseOptions.map((label) => <option key={label} value={label}>{label}</option>)}
            </Select>
          )}
          <Input label={t('fields.companyRequired')} required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          <Input label={t('fields.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label={t('fields.contractAmountMad')} type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Input label={t('fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
        </form>
      </Modal>
      <Modal
        open={!!detail}
        size="lg"
        title={detail ? `${detail.companyName} — ${detail.corpsEtat || ''}` : ''}
        onClose={() => setDetail(null)}
        footer={<Btn variant="secondary" onClick={() => setDetail(null)}>{t('common.close')}</Btn>}
      >
        {detail && (
          <div className="space-y-4">
            <p className="text-[12px] text-gic-muted">
              <span className={`mac-chip mr-2 ${isOpen(detail) ? 'mac-chip-orange' : 'mac-chip-green'}`}>{isOpen(detail) ? t('detail.stOpen') : t('detail.stDone')}</span>
              {detail.corpsEtat || '—'} · {scopeLine(detail)}
              {' · '}{formatMad(detail.amount || 0)} · {t('siteOps.paid')} {formatMad(detail.paidAmount || 0)} · {t('siteOps.moneyLeft')} {formatMad(Math.max(0, Number(detail.amount || 0) - Number(detail.paidAmount || 0)))}
            </p>
            <div>
              <p className="mb-2 text-[13px] font-medium">{t('detail.subcontractFollow')}</p>
              {(detail.follows || []).length === 0 ? (
                <p className="text-[12px] text-gic-muted">{t('common.empty')}</p>
              ) : (
                <ul className="space-y-2">
                  {(detail.follows || []).map((follow) => (
                    <li key={follow.id} className="flex items-center justify-between gap-2 rounded-lg border border-black/[0.06] px-3 py-2">
                      <span className="text-[12px]">
                        {follow.label}
                        <span className={`ml-2 mac-chip ${follow.validated ? 'mac-chip-green' : 'mac-chip-gray'}`}>{follow.validated ? t('pointageMgmt.validated') : t('pointageMgmt.draft')}</span>
                      </span>
                      <Btn variant="secondary" className="!py-1 !text-[11px]" onClick={() => toggleFollow(follow)}>{follow.validated ? t('detail.unvalidatePhase') : t('detail.validatePhase')}</Btn>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium">{t('detail.paymentsTitle')}</p>
              <ul className="mb-3 space-y-1 text-[12px]">
                {(detail.payments || []).map((pay) => (
                  <li key={pay.id} className="flex justify-between gap-2">
                    <span>{formatDate(pay.date)} · {pay.kind}</span>
                    <span className="font-medium">{formatMad(pay.amount)}</span>
                  </li>
                ))}
                {(detail.payments || []).length === 0 && <li className="text-gic-muted">{t('common.empty')}</li>}
              </ul>
              <form onSubmit={addPayment} className="grid gap-2 sm:grid-cols-3">
                <Input label={t('fields.amountMad')} type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
                <Select label={t('fields.mode')} value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                  <option value="especes">{t('fields.modeCash')}</option>
                  <option value="virement">{t('fields.modeTransfer')}</option>
                  <option value="cheque">{t('fields.modeCheck')}</option>
                </Select>
                <Select label={t('fields.operationType')} value={payKind} onChange={(e) => setPayKind(e.target.value)}>
                  <option value="avance">{t('columns.advance')}</option>
                  <option value="situation">{t('siteOps.progress')}</option>
                  <option value="solde">{t('siteOps.moneyLeft')}</option>
                </Select>
                <Btn type="submit">{t('detail.addAdvance')}</Btn>
              </form>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

