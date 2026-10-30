import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Printer, X } from 'lucide-react';
import { PdfPages, isPdfFile, rawPdfUrl } from '../components/PdfPreview';
import { useI18n } from '../i18n/I18nContext';

/** Page pleine pour un PDF ouvert directement (facture, reçu, scan). */
export default function FilePreviewPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const src = params.get('src') || '';
  const print = params.get('print') === '1';

  if (!src) {
    return <p className="p-10 text-center text-[13px] text-gic-muted">{t('docs.noPreview')}</p>;
  }

  const name = decodeURIComponent(src.split('/').pop() || 'document.pdf');

  return (
    <div className="flex min-h-screen flex-col bg-[#2c2c2e]">
      <div className="flex items-center gap-2 px-4 py-3 text-white print:hidden">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{name}</p>
        <a href={isPdfFile(src) ? rawPdfUrl(src) : src} download className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12px] hover:bg-white/20">
          <Download size={14} /> {t('common.download')}
        </a>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12px] hover:bg-white/20" onClick={() => window.print()}>
          <Printer size={14} /> {t('common.print')}
        </button>
        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" onClick={() => navigate(-1)} title={t('common.close')}>
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-8">
        {isPdfFile(src) ? (
          <PdfPages url={src} onReady={print ? () => window.print() : undefined} />
        ) : (
          <img src={src} alt={name} className="mx-auto block max-h-[85vh] max-w-full bg-white shadow-lg" />
        )}
      </div>
    </div>
  );
}
