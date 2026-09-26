import { formatDate } from './api';
import { useI18n, tStatic } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';
export { fileUrl } from './photoUrl';
import { fileUrl } from './photoUrl';
import { escHtml, printWithCompany } from './companyPrint';

export type DocEntity = {
  id: string;
  name: string;
  category?: string | null;
  status?: string | null;
  mimeType?: string | null;
  size?: number | null;
  path: string;
  entityType?: string | null;
  entityId?: string | null;
  feeAmount?: number | null;
  estimatedStartDate?: string | null;
  estimatedEndDate?: string | null;
  lateNotifiedAt?: string | null;
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

export type DocStatus = 'pending' | 'valid' | 'invalid';

export function normalizeDocStatus(status?: string | null): DocStatus {
  if (status === 'valid' || status === 'invalid') return status;
  return 'pending';
}

export function isPreviewable(mimeType?: string | null, path?: string | null) {
  const mime = String(mimeType || '').toLowerCase();
  const p = String(path || '').toLowerCase();
  if (mime.startsWith('image/') || mime === 'application/pdf') return true;
  return /\.(png|jpe?g|gif|webp|bmp|pdf)$/i.test(p);
}

export function isImageDoc(mimeType?: string | null, path?: string | null) {
  const mime = String(mimeType || '').toLowerCase();
  const p = String(path || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(p);
}

export function isPdfDoc(mimeType?: string | null, path?: string | null) {
  const mime = String(mimeType || '').toLowerCase();
  const p = String(path || '').toLowerCase();
  return mime === 'application/pdf' || p.endsWith('.pdf');
}

export function daysUntilExpiry(date?: string | null): number | null {
  if (!date) return null;
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Dossier en retard : date estimée de fin dépassée et non validé. */
export function isDocumentLate(doc: { estimatedEndDate?: string | null; status?: string | null }) {
  if (!doc.estimatedEndDate || normalizeDocStatus(doc.status) === 'valid') return false;
  const end = new Date(doc.estimatedEndDate);
  end.setHours(0, 0, 0, 0);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return end.getTime() < startOfToday.getTime();
}

export function fileExtension(name?: string | null, path?: string | null) {
  const src = String(name || path || '');
  const m = src.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toUpperCase() : '—';
}

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

export async function printDocumentFiche(doc: DocEntity, t: TranslateFn = tStatic) {
  const link = entityLink(doc);
  const bodyHtml = `<div class="grid">
    <p><span class="k">${escHtml(t('docs.printName'))}</span> ${escHtml(doc.name)}</p>
    <p><span class="k">${escHtml(t('docs.printCategory'))}</span> ${escHtml(doc.category || '—')}</p>
    <p><span class="k">${escHtml(t('docs.printStatus'))}</span> ${escHtml(doc.status || 'pending')}</p>
    <p><span class="k">${escHtml(t('docs.printSize'))}</span> ${escHtml(formatSize(doc.size, t))}</p>
    <p><span class="k">${escHtml(t('docs.printExpiry'))}</span> ${escHtml(formatDate(doc.expiresAt))}</p>
    <p><span class="k">${escHtml(t('docs.printLinked'))}</span> ${escHtml(link?.label || doc.entityType || '—')}</p>
    <p><span class="k">${escHtml(t('docs.printAdded'))}</span> ${escHtml(formatDate(doc.createdAt))}</p>
  </div>`;
  return printWithCompany({ title: t('docs.printTitle'), subtitle: doc.name, bodyHtml });
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
