import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api, formatMad } from '../lib/api';
import { Btn, Input, MacActionBtn, Modal, Select, TableWrap, Td, Th } from './ui';
import { useI18n } from '../i18n/I18nContext';

type StockItem = {
  id: string;
  name: string;
  quantity: number;
  unit?: string | null;
  tranche?: string | null;
  remark?: string | null;
};

type Subcontractor = {
  id: string;
  companyName: string;
  corpsEtat?: string | null;
  phone?: string | null;
  amount?: number | null;
  status: string;
  remark?: string | null;
};

export function ChantierStockPanel({
  chantierId,
  tranches,
  filterTranche,
  lockTranche = false,
}: {
  chantierId: string;
  tranches: string[];
  filterTranche?: string;
  lockTranche?: boolean;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<StockItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', quantity: '0', unit: '', tranche: '', remark: '' });

  function load() {
    api<StockItem[]>(`/chantiers/${chantierId}/stock`).then(setItems).catch(() => setItems([]));
  }

  useEffect(() => { load(); }, [chantierId]);

  function openCreate() {
    setEditId(null);
    setForm({ name: '', quantity: '0', unit: '', tranche: lockTranche && filterTranche ? filterTranche : '', remark: '' });
    setOpen(true);
  }

  function openEdit(item: StockItem) {
    setEditId(item.id);
    setForm({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit || '',
      tranche: item.tranche || '',
      remark: item.remark || '',
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name,
      quantity: Number(form.quantity || 0),
      unit: form.unit || null,
      tranche: form.tranche || null,
      remark: form.remark || null,
    };
    try {
      if (editId) {
        await api(`/chantiers/${chantierId}/stock/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api(`/chantiers/${chantierId}/stock`, { method: 'POST', body: JSON.stringify(body) });
      }
      setOpen(false);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function remove(id: string) {
    if (!await appConfirm(t('msg.confirmDeleteArticle'))) return;
    try {
      await api(`/chantiers/${chantierId}/stock/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const visibleItems = filterTranche
    ? items.filter((item) => item.tranche === filterTranche)
    : items;

  return (
    <div className="mt-2 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-gic-ink">
          {filterTranche
            ? t('detail.stockTrancheTitle', { name: filterTranche })
            : t('detail.stockSiteTitle')}
        </p>
        <Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>
      </div>
      {visibleItems.length === 0 ? (
        <p className="py-6 text-[12px] text-gic-muted text-center">
          {filterTranche ? t('msg.emptyStockOnTranche') : t('msg.emptyStock')}
        </p>
      ) : (
        <TableWrap mac>
          <thead>
            <tr>
              <Th mac>{t('fields.article')}</Th>
              <Th mac>{t('columns.qty')}</Th>
              {!filterTranche && <Th mac>{t('fields.tranche')}</Th>}
              <Th mac>{t('fields.remark')}</Th>
              <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id}>
                <Td mac>{item.name}</Td>
                <Td mac>{item.quantity} {item.unit || ''}</Td>
                {!filterTranche && <Td mac className="mac-table-muted">{item.tranche || '—'}</Td>}
                <Td mac className="mac-table-muted truncate max-w-[120px]">{item.remark || '—'}</Td>
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
        title={editId ? t('actions.editArticle') : t('actions.newArticle')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
            <Btn form="stock-form" type="submit">{t('common.save')}</Btn>
          </>
        }
      >
        <form id="stock-form" onSubmit={save} className="grid gap-3">
          <Input label={t('fields.nameRequired')} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label={t('fields.quantity')} type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <Input label={t('fields.unit')} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder={t('fields.unitPlaceholder')} />
          {lockTranche && filterTranche ? (
            <div>
              <label className="block text-[11px] font-medium text-gic-muted mb-1">{t('fields.tranche')}</label>
              <p className="rounded-xl border border-gic-border bg-gray-50/80 px-3 py-2 text-[12px] font-medium text-gic-ink">{filterTranche}</p>
            </div>
          ) : (
            <Select label={t('fields.tranche')} value={form.tranche} onChange={(e) => setForm({ ...form, tranche: e.target.value })}>
              <option value="">{t('fields.allTranches')}</option>
              {tranches.map((tr) => <option key={tr} value={tr}>{tr}</option>)}
            </Select>
          )}
          <Input label={t('fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
        </form>
      </Modal>
    </div>
  );
}

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
