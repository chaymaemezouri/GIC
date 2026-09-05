import { formatDate } from './api';
import { useI18n, tStatic } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';
export { fileUrl } from './photoUrl';
import { fileUrl } from './photoUrl';

export type DocEntity = {
  id: string;
  name: string;
  category?: string | null;
  mimeType?: string | null;
  size?: number | null;
  path: string;
  entityType?: string | null;
  entityId?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  client?: { id: string; firstName: string; lastName: string; reference: string } | null;
  property?: { id: string; name: string; reference: string } | null;
  chantier?: { id: string; name: string } | null;
  supplier?: { id: string; companyName: string; reference: string } | null;
  sale?: { id: string; reference: string } | null;
  rental?: { id: string; reference: string } | null;
  engin?: { id: string; matricule: string; brand?: string } | null;
};

export function formatSize(bytes?: number | null, t: TranslateFn = tStatic) {
  if (!bytes) return '—';
  if (bytes < 1024) return t('docs.sizeBytes', { n: bytes });
  if (bytes < 1024 * 1024) return t('docs.sizeKb', { n: (bytes / 1024).toFixed(1) });
  return t('docs.sizeMb', { n: (bytes / (1024 * 1024)).toFixed(1) });
}

export function expiryClass(date?: string | null) {
  if (!date) return 'mac-table-muted';
  const d = new Date(date);
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);
  if (d < now) return 'text-gic-coral font-medium';
  if (d <= in30) return 'text-[#c93400] font-medium';
  return 'mac-table-muted';
}

export function expiryLabel(date?: string | null, t: TranslateFn = tStatic) {
  if (!date) return '—';
  const d = new Date(date);
  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);
  if (d < now) return t('docs.expired');
  if (d <= in30) return t('docs.expiresSoon');
  return t('docs.valid');
}

export function entityLink(doc: DocEntity): { to: string; label: string } | null {
  if (doc.client) return { to: `/clients/${doc.client.id}`, label: `${doc.client.reference} — ${doc.client.firstName} ${doc.client.lastName}` };
  if (doc.property) return { to: `/biens/${doc.property.id}`, label: `${doc.property.reference} — ${doc.property.name}` };
  if (doc.chantier) return { to: `/chantiers/${doc.chantier.id}`, label: doc.chantier.name };
  if (doc.supplier) return { to: `/fournisseurs/${doc.supplier.id}`, label: doc.supplier.companyName };
  if (doc.sale) return { to: `/ventes/${doc.sale.id}`, label: doc.sale.reference };
  if (doc.rental) return { to: `/locations/${doc.rental.id}`, label: doc.rental.reference };
  if (doc.engin) return { to: `/engins/${doc.engin.id}`, label: `${doc.engin.matricule} — ${doc.engin.brand || ''}` };
  return null;
}

export function printDocumentFiche(doc: DocEntity, t: TranslateFn = tStatic) {
  const link = entityLink(doc);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<html><head><title>${doc.name}</title></head><body style="font-family:sans-serif;padding:24px;font-size:12px">
    <h1>${t('docs.printTitle')}</h1>
    <p><b>${t('docs.printName')}</b> ${doc.name}</p>
    <p><b>${t('docs.printCategory')}</b> ${doc.category || '—'}</p>
    <p><b>${t('docs.printSize')}</b> ${formatSize(doc.size, t)}</p>
    <p><b>${t('docs.printExpiry')}</b> ${formatDate(doc.expiresAt)}</p>
    <p><b>${t('docs.printLinked')}</b> ${link?.label || doc.entityType || '—'}</p>
    <p><b>${t('docs.printAdded')}</b> ${formatDate(doc.createdAt)}</p>
  </body></html>`);
  w.document.close();
  w.print();
}

/** View / download / print links for an attachment */
export function FilePieceLinks({ path, label }: { path?: string | null; label?: string }) {
  const { t } = useI18n();
  if (!path) return <span className="mac-table-muted">—</span>;
  const url = fileUrl(path);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px]">
      {label && <span className="text-gic-muted">{label}</span>}
      <a href={url} target="_blank" rel="noreferrer" className="text-[#007aff] hover:opacity-70">{t('common.view')}</a>
      <span className="text-[#c7c7cc]">·</span>
      <a href={url} download target="_blank" rel="noreferrer" className="text-[#007aff] hover:opacity-70">{t('common.download')}</a>
      <span className="text-[#c7c7cc]">·</span>
      <button
        type="button"
        className="text-[#007aff] hover:opacity-70"
        onClick={() => {
          const w = window.open(url, '_blank');
          if (w) setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 500);
        }}
      >
        {t('common.print')}
      </button>
    </span>
  );
}
