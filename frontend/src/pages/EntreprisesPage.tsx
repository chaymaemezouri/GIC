import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type PaginatedResponse } from '../lib/api';
import { appAlert, appConfirm } from '../lib/dialog';
import { useCreateQuery } from '../hooks/useCreateQuery';
import { useI18n } from '../i18n/I18nContext';
import { Btn, EmptyState, Input, MacActionBtn, Modal, PageHeader, TableWrap, Td, Textarea, Th } from '../components/ui';

type Entreprise = {
  id: string;
  reference: string;
  companyName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  ice?: string | null;
  remark?: string | null;
  isActive?: boolean;
};

const emptyForm = () => ({ companyName: '', phone: '', email: '', address: '', ice: '', remark: '' });

export default function EntreprisesPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Entreprise[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [q, setQ] = useState('');

  function load() {
    setLoading(true);
    api<PaginatedResponse<Entreprise>>(`/entreprises?q=${encodeURIComponent(q)}`)
      .then((res) => setItems(res.items || []))
      .catch((err) => appAlert(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setOpen(true);
  }

  useCreateQuery(openCreate);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(editId ? `/entreprises/${editId}` : '/entreprises', {
        method: editId ? 'PUT' : 'POST',
        body: JSON.stringify(form),
      });
      setOpen(false);
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function remove(id: string) {
    if (!await appConfirm(t('msg.confirmDelete'))) return;
    try {
      await api(`/entreprises/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('nav.companies')}
        subtitle={t('pages.entreprisesHint')}
        actions={<Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>}
      />
      <div className="flex gap-2">
        <Input className="max-w-xs" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(); }} />
        <Btn variant="secondary" onClick={load}>{t('common.search')}</Btn>
      </div>
      {loading ? (
        <p className="text-[12px] text-gic-muted">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <EmptyState title={t('pages.entreprisesEmpty')} action={<Btn icon={Plus} onClick={openCreate}>{t('common.add')}</Btn>} />
      ) : (
        <TableWrap mac>
          <thead>
            <tr>
              <Th mac>{t('columns.reference')}</Th>
              <Th mac>{t('columns.companyName')}</Th>
              <Th mac>{t('fields.phone')}</Th>
              <Th mac>{t('fields.email')}</Th>
              <Th mac className="mac-th-actions" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <Td mac className="mac-table-ref">{item.reference}</Td>
                <Td mac className="font-medium">{item.companyName}</Td>
                <Td mac>{item.phone || '—'}</Td>
                <Td mac>{item.email || '—'}</Td>
                <Td mac className="mac-td-actions">
                  <div className="mac-actions">
                    <MacActionBtn icon={Pencil} tone="orange" title={t('common.edit')} onClick={() => {
                      setEditId(item.id);
                      setForm({
                        companyName: item.companyName,
                        phone: item.phone || '',
                        email: item.email || '',
                        address: item.address || '',
                        ice: item.ice || '',
                        remark: item.remark || '',
                      });
                      setOpen(true);
                    }} />
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
        title={editId ? t('pages.editEntreprise') : t('pages.newEntreprise')}
        onClose={() => setOpen(false)}
        footer={<><Btn variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn><Btn form="entreprise-form" type="submit">{t('common.save')}</Btn></>}
      >
        <form id="entreprise-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <Input className="sm:col-span-2" label={t('fields.companyRequired')} required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          <Input label={t('fields.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label={t('fields.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input className="sm:col-span-2" label={t('fields.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label={t('fields.ice')} value={form.ice} onChange={(e) => setForm({ ...form, ice: e.target.value })} />
          <Textarea className="sm:col-span-2" label={t('fields.remark')} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
        </form>
      </Modal>
    </div>
  );
}
