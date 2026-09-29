import { appAlert } from '../lib/dialog';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { uploadDocument, uploadForm } from '../lib/api';
import { Btn, Input, Modal, Select } from './ui';
import { useI18n } from '../i18n/I18nContext';

const DOC_CATEGORIES = ['general', 'contrat', 'facture', 'devis', 'photo', 'archive', 'juridique', 'technique'];

export type DocumentAddValues = {
  name: string;
  category: string;
  expiresAt: string;
  feeAmount: string;
  estimatedStartDate: string;
  estimatedEndDate: string;
};

const emptyValues = (category = 'general'): DocumentAddValues => ({
  name: '',
  category,
  expiresAt: '',
  feeAmount: '',
  estimatedStartDate: '',
  estimatedEndDate: '',
});

export function DocumentAddButton({
  entityType,
  entityId,
  extra = {},
  defaultCategory = 'general',
  categories,
  uploadPath,
  onUploaded,
  labelKey = 'common.add',
}: {
  entityType: string;
  entityId: string;
  extra?: Record<string, string>;
  defaultCategory?: string;
  categories?: string[];
  /** Autre route d'upload (mission, maintenance). Sinon /documents/upload */
  uploadPath?: string;
  onUploaded?: () => void;
  labelKey?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<DocumentAddValues>(emptyValues(defaultCategory));
  const [saving, setSaving] = useState(false);
  const options = [...new Set([...(categories || []), ...DOC_CATEGORIES, defaultCategory])];

  function close() {
    setOpen(false);
    setFile(null);
    setForm(emptyValues(defaultCategory));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || saving) return;
    setSaving(true);
    const fields: Record<string, string> = {
      name: form.name || file.name,
      category: form.category || defaultCategory,
      entityType,
      entityId,
      ...extra,
    };
    if (form.expiresAt) fields.expiresAt = form.expiresAt;
    if (form.feeAmount) fields.feeAmount = form.feeAmount;
    if (form.estimatedStartDate) fields.estimatedStartDate = form.estimatedStartDate;
    if (form.estimatedEndDate) fields.estimatedEndDate = form.estimatedEndDate;
    try {
      if (uploadPath) {
        const body = new FormData();
        body.append('file', file);
        Object.entries(fields).forEach(([k, v]) => body.append(k, v));
        await uploadForm(uploadPath, body);
      } else {
        await uploadDocument(file, fields);
      }
      onUploaded?.();
      close();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Btn icon={Plus} onClick={() => { setForm(emptyValues(defaultCategory)); setOpen(true); }}>{t(labelKey)}</Btn>
      <Modal
        open={open}
        title={t('actions.uploadDocument')}
        onClose={close}
        footer={<Btn form="doc-add-form" type="submit" disabled={!file || saving}>{saving ? t('auth.sending') : t('actions.send')}</Btn>}
      >
        <form id="doc-add-form" onSubmit={submit} className="grid gap-3">
          <label className="block">
            <span className="text-[11px] font-medium text-gic-muted">{t('fields.fileRequired')}</span>
            <input
              type="file"
              required
              accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.doc,.xls"
              className="mt-1 block w-full text-[12px]"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setFile(f);
                if (f && !form.name) setForm((prev) => ({ ...prev, name: f.name }));
              }}
            />
          </label>
          <Input label={t('fields.displayName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label={t('fields.category')} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {options.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input label={t('fields.deadlineOptional')} type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          <Input
            label={t('docs.feeOptional')}
            type="number"
            min={0}
            step="0.01"
            value={form.feeAmount}
            onChange={(e) => setForm({ ...form, feeAmount: e.target.value })}
            placeholder={t('docs.feePlaceholder')}
          />
          <Input label={t('docs.estimatedStart')} type="date" value={form.estimatedStartDate} onChange={(e) => setForm({ ...form, estimatedStartDate: e.target.value })} />
          <Input label={t('docs.estimatedEnd')} type="date" value={form.estimatedEndDate} onChange={(e) => setForm({ ...form, estimatedEndDate: e.target.value })} />
          <p className="text-[10px] text-gic-muted">{t('docs.estimateHint')}</p>
        </form>
      </Modal>
    </>
  );
}
