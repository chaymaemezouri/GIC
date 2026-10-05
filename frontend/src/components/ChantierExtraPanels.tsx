import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, formatDate, formatMad } from '../lib/api';
import { Btn, Input, MacActionBtn, Modal, Select, TableWrap, Td, Th } from './ui';
import { useI18n } from '../i18n/I18nContext';
import { paymentPhaseOf } from './TaskSubcontractEditor';

export type StFollow = { id: string; label: string; percent: number; validated: boolean };
export type StPay = { id: string; amount: number; kind: string; paymentMode?: string | null; date: string; remark?: string | null };
type Task = { id: string; taskName: string; tranche?: string | null; phases?: { label?: string; percent?: number }[] | null };

export type Subcontractor = {
  id: string;
  chantierId?: string;
  companyName: string;
  entrepriseId?: string | null;
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
  follows?: StFollow[];
  payments?: StPay[];
  workProgress?: { id: string; taskName: string; tranche?: string | null } | null;
  chantier?: { id: string; name: string } | null;
};

export function isStOpen(item: Subcontractor) {
  const workOpen = item.status !== 'termine' && Number(item.progressPct || 0) < 100;
  const moneyOpen = Number(item.amount || 0) > Number(item.paidAmount || 0) + 0.01;
  return workOpen || moneyOpen;
}

export function stScopeLine(item: Subcontractor, wholeSite: string, wholeTask: string) {
  const what = item.scope === 'phase' && item.phaseLabel ? item.phaseLabel : wholeTask;
  const period = item.startDate || item.endDate
    ? ` · ${item.startDate ? formatDate(item.startDate) : '…'} → ${item.endDate ? formatDate(item.endDate) : '…'}`
    : '';
  return `${item.tranche || wholeSite} · ${what}${period}`;
}

export function SubcontractContractView({
  item,
  onToggleFollow,
  onAddPayment,
}: {
  item: Subcontractor;
  onToggleFollow: (follow: StFollow) => void;
  onAddPayment: (payload: { amount: number; kind: string; paymentMode: string; phaseLabel: string | null }) => void;
}) {
  const { t } = useI18n();
  const phaseRows: StFollow[] = (item.follows || []).length
    ? item.follows!
    : [{
      id: 'all',
      label: item.phaseLabel || item.corpsEtat || t('detail.subcontractWhole'),
      percent: Number(item.progressPct || 0),
      validated: Number(item.progressPct || 0) >= 100,
    }];
  const [phaseKey, setPhaseKey] = useState<string>(() => phaseRows[0]?.label || '');
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('especes');
  const [payKind, setPayKind] = useState('avance');

  useEffect(() => {
    const first = (item.follows?.[0]?.label)
      || item.phaseLabel
      || item.corpsEtat
      || '';
    setPhaseKey(first);
  }, [item.id]);

  const selectedFollow = phaseRows.find((row) => row.label === phaseKey) || phaseRows[0] || null;
  const phasePays = (item.payments || []).filter((pay) => {
    if (!phaseKey) return true;
    const tagged = paymentPhaseOf(pay);
    if (item.scope === 'phase') return true;
    if (!tagged) return false;
    return tagged === phaseKey;
  });
  const advances = phasePays.filter((pay) => pay.kind === 'avance');
  const otherPays = phasePays.filter((pay) => pay.kind !== 'avance');

  async function submitPay(e: React.FormEvent) {
    e.preventDefault();
    onAddPayment({
      amount: Number(payAmount),
      kind: payKind,
      paymentMode: payMode,
      phaseLabel: phaseKey || null,
    });
    setPayAmount('');
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
      <div className="mac-section-card !p-2 space-y-1">
        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gic-muted">{t('detail.stByPhase')}</p>
        {phaseRows.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-gic-muted">{t('detail.stNoPhase')}</p>
        ) : phaseRows.map((follow) => (
          <button
            key={follow.id}
            type="button"
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] ${
              phaseKey === follow.label ? 'bg-[#007aff]/10 text-[#007aff]' : 'hover:bg-black/[0.04]'
            }`}
            onClick={() => setPhaseKey(follow.label)}
          >
            <span className="min-w-0 truncate font-medium">{follow.label}</span>
            <span className={`mac-chip ml-2 shrink-0 ${follow.validated ? 'mac-chip-green' : 'mac-chip-gray'}`}>
              {Math.round(follow.percent || 0)} %
            </span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="mac-section-card space-y-3">
          <p className="text-[12px] font-semibold text-gic-ink">{t('detail.stPhaseRealization')}</p>
          {selectedFollow ? (
            <>
              <p className="text-[22px] font-semibold tracking-tight">{Math.round(selectedFollow.percent || 0)} %</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                <div className="h-full rounded-full bg-[#34c759]" style={{ width: `${Math.min(100, selectedFollow.percent || 0)}%` }} />
              </div>
              <span className={`mac-chip ${selectedFollow.validated ? 'mac-chip-green' : 'mac-chip-gray'}`}>
                {selectedFollow.validated ? t('pointageMgmt.validated') : t('pointageMgmt.draft')}
              </span>
              {selectedFollow.id !== 'all' && (
                <Btn variant="secondary" className="!py-1.5 !text-[11px]" onClick={() => onToggleFollow(selectedFollow)}>
                  {selectedFollow.validated ? t('detail.unvalidatePhase') : t('detail.validatePhase')}
                </Btn>
              )}
            </>
          ) : (
            <p className="text-[12px] text-gic-muted">{t('detail.stSelectPhase')}</p>
          )}
        </div>
        <div className="mac-section-card space-y-2">
          <p className="text-[12px] font-semibold text-gic-ink">{t('detail.stPhasePayments')}</p>
          <ul className="space-y-1.5 text-[12px]">
            {otherPays.map((pay) => (
              <li key={pay.id} className="flex justify-between gap-2 border-b border-black/[0.04] pb-1.5 last:border-0">
                <span className="text-gic-muted">{formatDate(pay.date)} · {pay.kind}</span>
                <span className="font-medium">{formatMad(pay.amount)}</span>
              </li>
            ))}
            {otherPays.length === 0 && <li className="text-gic-muted">{t('common.empty')}</li>}
          </ul>
        </div>
        <div className="mac-section-card space-y-2">
          <p className="text-[12px] font-semibold text-gic-ink">{t('detail.stPhaseAdvances')}</p>
          <ul className="space-y-1.5 text-[12px]">
            {advances.map((pay) => (
              <li key={pay.id} className="flex justify-between gap-2 border-b border-black/[0.04] pb-1.5 last:border-0">
                <span className="text-gic-muted">{formatDate(pay.date)}</span>
                <span className="font-medium">{formatMad(pay.amount)}</span>
              </li>
            ))}
            {advances.length === 0 && <li className="text-gic-muted">{t('detail.stNoAdvanceYet')}</li>}
          </ul>
          <form onSubmit={submitPay} className="grid gap-2 pt-1">
            <Input label={t('fields.amountMad')} type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
            <Select label={t('fields.mode')} value={payMode} onChange={(e) => setPayMode(e.target.value)}>
              <option value="especes">{t('fields.modeCash')}</option>
              <option value="virement">{t('fields.modeTransfer')}</option>
              <option value="cheque">{t('fields.modeCheck')}</option>
            </Select>
            <Select label={t('fields.operationType')} value={payKind} onChange={(e) => setPayKind(e.target.value)}>
              <option value="avance">{t('columns.advance')}</option>
              <option value="situation">{t('siteOps.progress')}</option>
              <option value="solde">{t('detail.stKindSolde')}</option>
            </Select>
            <Btn type="submit">{t('detail.addAdvance')}</Btn>
          </form>
        </div>
      </div>
    </div>
  );
}

export function ChantierSubcontractorsPanel({ chantierId }: { chantierId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ companyName: '', phone: '', amount: '', remark: '', workProgressId: '', scope: 'phase', phaseLabel: '' });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [standardPhases, setStandardPhases] = useState<{ name: string; phases: { label?: string; percent?: number }[] }[]>([]);
  const [detail, setDetail] = useState<Subcontractor | null>(null);

  function load() {
    setLoading(true);
    api<Subcontractor[]>(`/chantiers/${chantierId}/subcontractors`).then((rows) => {
      setItems(rows);
      setDetail((current) => (current ? rows.find((row) => row.id === current.id) || current : null));
    }).catch(() => setItems([])).finally(() => setLoading(false));
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

  async function toggleFollow(follow: StFollow) {
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

  async function addPayment(payload: { amount: number; kind: string; paymentMode: string; phaseLabel: string | null }) {
    if (!detail) return;
    try {
      const updated = await api<Subcontractor>(`/chantiers/${chantierId}/subcontractors/${detail.id}/payments`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setDetail(updated);
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

  async function openOnTask(item: Subcontractor) {
    const progressId = item.workProgress?.id;
    const trancheName = item.tranche || item.workProgress?.tranche;
    if (!progressId || !trancheName) {
      setDetail(item);
      return;
    }
    try {
      const tranches = await api<{ id: string; name: string }[]>(`/chantiers/${chantierId}/tranches`);
      const tranche = (Array.isArray(tranches) ? tranches : []).find((row) => row.name === trancheName);
      if (!tranche) {
        setDetail(item);
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
      if (detail?.id === id) setDetail(null);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const companies = useMemo(() => {
    const map = new Map<string, { name: string; entrepriseId?: string | null; phone?: string | null; items: Subcontractor[] }>();
    for (const item of items) {
      const key = item.companyName.trim().toLowerCase();
      const group = map.get(key) || { name: item.companyName, entrepriseId: item.entrepriseId, phone: item.phone, items: [] };
      if (!group.entrepriseId && item.entrepriseId) group.entrepriseId = item.entrepriseId;
      if (!group.phone && item.phone) group.phone = item.phone;
      group.items.push(item);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [items]);

  const totals = {
    amount: items.reduce((s, i) => s + Number(i.amount || 0), 0),
    paid: items.reduce((s, i) => s + Number(i.paidAmount || 0), 0),
  };

  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-gic-ink">{t('detail.subcontractorsTitle')}</p>
          <p className="text-[11px] text-gic-muted">{t('detail.stGroupByCompany')}</p>
        </div>
        <Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>
      </div>
      {items.length > 0 && (
        <div className="mac-kpi-grid mac-kpi-grid-4">
          <div className="mac-section-card !py-3">
            <p className="text-[10px] uppercase tracking-wide text-gic-muted">{t('fields.company')}</p>
            <p className="text-[16px] font-semibold">{companies.length}</p>
          </div>
          <div className="mac-section-card !py-3">
            <p className="text-[10px] uppercase tracking-wide text-gic-muted">{t('fields.amount')}</p>
            <p className="text-[16px] font-semibold">{formatMad(totals.amount)}</p>
          </div>
          <div className="mac-section-card !py-3">
            <p className="text-[10px] uppercase tracking-wide text-gic-muted">{t('siteOps.paid')}</p>
            <p className="text-[16px] font-semibold text-[#34c759]">{formatMad(totals.paid)}</p>
          </div>
          <div className="mac-section-card !py-3">
            <p className="text-[10px] uppercase tracking-wide text-gic-muted">{t('siteOps.moneyLeft')}</p>
            <p className="text-[16px] font-semibold text-[#ff3b30]">{formatMad(Math.max(0, totals.amount - totals.paid))}</p>
          </div>
        </div>
      )}

      {detail ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Btn variant="secondary" icon={ChevronLeft} onClick={() => setDetail(null)}>{t('detail.stBackToList')}</Btn>
            {detail.entrepriseId && (
              <Link to={`/entreprises/${detail.entrepriseId}`} className="text-[12px] font-medium text-[#007aff] hover:underline">
                {t('detail.stOpenCompany')}
              </Link>
            )}
          </div>
          <div className="mac-section-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[16px] font-semibold tracking-tight">{detail.companyName}</p>
                <p className="mt-0.5 text-[12px] text-gic-muted">
                  {stScopeLine(detail, t('msg.wholeSite'), t('detail.subcontractWhole'))}
                </p>
              </div>
              <span className={`mac-chip ${isStOpen(detail) ? 'mac-chip-orange' : 'mac-chip-green'}`}>
                {isStOpen(detail) ? t('detail.stOpen') : t('detail.stDone')}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4 text-[12px]">
              <div><span className="text-gic-muted">{t('fields.corpsEtat')}</span><p className="font-medium">{detail.corpsEtat || '—'}</p></div>
              <div><span className="text-gic-muted">{t('fields.amount')}</span><p className="font-medium">{formatMad(detail.amount || 0)}</p></div>
              <div><span className="text-gic-muted">{t('siteOps.paid')}</span><p className="font-medium">{formatMad(detail.paidAmount || 0)}</p></div>
              <div><span className="text-gic-muted">{t('siteOps.progress')}</span><p className="font-medium">{Math.round(Number(detail.progressPct || 0))} %</p></div>
            </div>
          </div>
          <SubcontractContractView item={detail} onToggleFollow={toggleFollow} onAddPayment={addPayment} />
        </div>
      ) : loading ? (
        <p className="py-8 text-center text-[12px] text-gic-muted">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <div className="mac-section-card py-10 text-center">
          <p className="text-[12px] text-gic-muted">{t('msg.emptySubcontractors')}</p>
          <Btn className="mt-3" icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map((company) => {
            const amount = company.items.reduce((s, i) => s + Number(i.amount || 0), 0);
            const paid = company.items.reduce((s, i) => s + Number(i.paidAmount || 0), 0);
            return (
              <div key={company.name} className="mac-section-card !p-0 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] px-4 py-3">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#007aff]/10 text-[#007aff]">
                      <Building2 size={16} />
                    </span>
                    <div className="min-w-0">
                      {company.entrepriseId ? (
                        <Link to={`/entreprises/${company.entrepriseId}`} className="block truncate text-[14px] font-semibold text-[#007aff] hover:underline">
                          {company.name}
                        </Link>
                      ) : (
                        <p className="truncate text-[14px] font-semibold">{company.name}</p>
                      )}
                      <p className="text-[11px] text-gic-muted">
                        {t('detail.stContractsCount', { count: company.items.length })}
                        {company.phone ? ` · ${company.phone}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <span className="mac-chip mac-chip-gray">{formatMad(amount)}</span>
                    <span className="mac-chip mac-chip-emerald">{t('siteOps.paid')} {formatMad(paid)}</span>
                    <span className="mac-chip mac-chip-blue">{t('siteOps.moneyLeft')} {formatMad(Math.max(0, amount - paid))}</span>
                  </div>
                </div>
                <TableWrap mac>
                  <thead>
                    <tr>
                      <Th mac>{t('detail.stContract')}</Th>
                      <Th mac>{t('fields.amount')}</Th>
                      <Th mac>{t('siteOps.progress')}</Th>
                      <Th mac>{t('siteOps.paid')}</Th>
                      <Th mac>{t('fields.status')}</Th>
                      <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                    </tr>
                  </thead>
                  <tbody>
                    {company.items.map((item) => (
                      <tr key={item.id} className="cursor-pointer" onClick={() => setDetail(item)}>
                        <Td mac>
                          <span className="font-medium">{item.corpsEtat || item.phaseLabel || t('detail.stContract')}</span>
                          <span className="block text-[10px] text-gic-muted">
                            {stScopeLine(item, t('msg.wholeSite'), t('detail.subcontractWhole'))}
                          </span>
                        </Td>
                        <Td mac>{item.amount != null ? formatMad(item.amount) : '—'}</Td>
                        <Td mac>{Math.round(Number(item.progressPct || 0))} %</Td>
                        <Td mac>{formatMad(item.paidAmount || 0)}</Td>
                        <Td mac>
                          <span className={`mac-chip ${isStOpen(item) ? 'mac-chip-orange' : 'mac-chip-green'}`}>
                            {isStOpen(item) ? t('detail.stOpen') : t('detail.stDone')}
                          </span>
                        </Td>
                        <Td mac className="mac-td-actions">
                          <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                            <MacActionBtn icon={ChevronRight} tone="blue" title={t('detail.stDetail')} onClick={() => setDetail(item)} />
                            <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openOnTask(item)} />
                            <MacActionBtn icon={Trash2} tone="red" title={t('common.delete')} onClick={() => remove(item.id)} />
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            );
          })}
        </div>
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
    </div>
  );
}
