import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api, formatMad } from '../lib/api';
import { Btn, Input, MacActionBtn, Modal, Select, TableWrap, Td, Th } from './ui';
import { useI18n } from '../i18n/I18nContext';

type Subcontractor = {
  id: string;
  companyName: string;
  corpsEtat?: string | null;
  phone?: string | null;
  amount?: number | null;
  status: string;
  remark?: string | null;
};

export function ChantierSubcontractorsPanel({ chantierId }: { chantierId: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<Subcontractor[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ companyName: '', corpsEtat: '', phone: '', amount: '', status: 'actif', remark: '' });

  function load() {
    api<Subcontractor[]>(`/chantiers/${chantierId}/subcontractors`).then(setItems).catch(() => setItems([]));
  }

  useEffect(() => { load(); }, [chantierId]);

  function openCreate() {
    setEditId(null);
    setForm({ companyName: '', corpsEtat: '', phone: '', amount: '', status: 'actif', remark: '' });
    setOpen(true);
  }

  function openEdit(item: Subcontractor) {
    setEditId(item.id);
    setForm({
      companyName: item.companyName,
      corpsEtat: item.corpsEtat || '',
      phone: item.phone || '',
      amount: item.amount != null ? String(item.amount) : '',
      status: item.status,
      remark: item.remark || '',
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      companyName: form.companyName,
      corpsEtat: form.corpsEtat || null,
      phone: form.phone || null,
      amount: form.amount ? Number(form.amount) : null,
      status: form.status,
      remark: form.remark || null,
    };
    try {
      if (editId) {
        await api(`/chantiers/${chantierId}/subcontractors/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api(`/chantiers/${chantierId}/subcontractors`, { method: 'POST', body: JSON.stringify(body) });
      }
      setOpen(false);
      load();
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
      {items.length === 0 ? (
        <p className="py-6 text-[12px] text-gic-muted text-center">{t('msg.emptySubcontractors')}</p>
      ) : (
        <TableWrap mac>
          <thead>
            <tr>
              <Th mac>{t('fields.company')}</Th>
              <Th mac>{t('fields.corpsEtat')}</Th>
              <Th mac>{t('fields.amount')}</Th>
              <Th mac>{t('fields.status')}</Th>
              <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <Td mac>
                  <span className="font-medium">{item.companyName}</span>
                  {item.phone && <span className="block text-[10px] text-gic-muted">{item.phone}</span>}
                </Td>
                <Td mac className="mac-table-muted">{item.corpsEtat || '—'}</Td>
                <Td mac>{item.amount != null ? formatMad(item.amount) : '—'}</Td>
                <Td mac>{item.status}</Td>
                <Td mac className="mac-td-actions">
                  <div className="mac-actions">
                    <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => openEdit(item)} />
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
        title={editId ? t('actions.editSubcontractor') : t('actions.newSubcontractor')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="sub-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="sub-form" onSubmit={save} className="grid gap-3">
          <Input label={t('fields.companyRequired')} required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          <Input label={t('fields.corpsEtat')} value={form.corpsEtat} onChange={(e) => setForm({ ...form, corpsEtat: e.target.value })} placeholder={t('fields.corpsEtatPlaceholder')} />
          <Input label={t('fields.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label={t('fields.contractAmountMad')} type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Select label={t('fields.status')} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="actif">{t('status.active')}</option>
            <option value="termine">{t('fields.statusFinishedShort')}</option>
            <option value="suspendu">{t('fields.statusSuspendedShort')}</option>
          </Select>
          <Input label={t('fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
        </form>
      </Modal>
    </div>
  );
}
