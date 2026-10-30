import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Download, Printer, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

GlobalWorkerOptions.workerSrc = workerUrl;

const EVENT = 'gic-pdf-preview';

const PREVIEW_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|svg)$/i;

export function previewFilePath(href: string) {
  if (!href || href.startsWith('blob:') || href.startsWith('data:') || href.startsWith('#')) return null;
  try {
    const url = new URL(href, window.location.origin);
    if (!PREVIEW_EXT.test(url.pathname)) return null;
    if (!url.pathname.includes('/uploads/')) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

export function pdfFilePath(href: string) {
  const path = previewFilePath(href);
  return path && path.toLowerCase().endsWith('.pdf') ? path : null;
}

export function isPdfFile(src: string) {
  return src.split('?')[0].toLowerCase().endsWith('.pdf');
}

/** Fetches the PDF bytes. `raw=1` skips the HTML viewer redirect. */
export function rawPdfUrl(src: string) {
  const path = pdfFilePath(src) || src.split('?')[0];
  return `${path}${path.includes('?') ? '&' : '?'}raw=1`;
}

export function requestPdfPreview(src: string, print = false) {
  const path = previewFilePath(src) || src;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { src: path, print } }));
}

/** Aperçu intégré : PDF rendu dans la page, image affichée telle quelle. */
export function FileInlinePreview({ src }: { src: string }) {
  const path = previewFilePath(src);
  if (!path) return null;
  if (isPdfFile(path)) {
    return (
      <div className="overflow-hidden rounded-xl bg-[#e8e8ed] p-3">
        <PdfPages url={path} />
      </div>
    );
  }
  return (
    <button type="button" className="block max-w-full" onClick={() => requestPdfPreview(path)}>
      <img src={path} alt="" className="max-h-72 max-w-full rounded-xl border border-black/10 bg-white object-contain" />
    </button>
  );
}

export function PdfPages({
  url,
  onReady,
}: {
  url: string;
  onReady?: () => void;
}) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    setState('loading');
    host.replaceChildren();

    (async () => {
      try {
        task = getDocument({ url: rawPdfUrl(url) });
        const pdf = await task.promise;
        if (cancelled) return;
        const width = Math.max(host.clientWidth - 24, 280);
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const cssWidth = Math.min(width, 920);
          const scale = (cssWidth / base.width) * Math.min(window.devicePixelRatio || 1, 2);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${cssWidth}px`;
          canvas.style.height = `${cssWidth * (base.height / base.width)}px`;
          canvas.style.display = 'block';
          canvas.style.margin = '0 auto 12px';
          canvas.style.background = '#fff';
          canvas.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)';
          host.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
        }
        if (cancelled) return;
        setState('ready');
        onReadyRef.current?.();
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url]);

  return (
    <div>
      {state === 'loading' && (
        <p className="py-10 text-center text-[13px] text-gic-muted">{t('common.loading')}</p>
      )}
      {state === 'error' && (
        <p className="py-10 text-center text-[13px] text-gic-coral">{t('docs.noPreview')}</p>
      )}
      <div ref={hostRef} />
    </div>
  );
}

export function PdfPreviewHost() {
  const { t } = useI18n();
  const [item, setItem] = useState<{ src: string; print: boolean } | null>(null);

  useEffect(() => {
    function onPreview(e: Event) {
      const detail = (e as CustomEvent<{ src: string; print?: boolean }>).detail;
      if (!detail?.src) return;
      setItem({ src: detail.src, print: Boolean(detail.print) });
    }
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      const anchor = (e.target as Element | null)?.closest?.('a');
      if (!anchor || anchor.hasAttribute('download')) return;
      const path = previewFilePath(anchor.getAttribute('href') || '');
      if (!path) return;
      e.preventDefault();
      e.stopPropagation();
      setItem({ src: path, print: false });
    }
    window.addEventListener(EVENT, onPreview);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener(EVENT, onPreview);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  useEffect(() => {
    if (!item) return;
    document.body.classList.add('pdf-preview-open');
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setItem(null);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('pdf-preview-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [item]);

  if (!item) return null;
  const name = decodeURIComponent(item.src.split('/').pop() || 'document.pdf');
  const downloadUrl = isPdfFile(item.src) ? rawPdfUrl(item.src) : item.src;

  return createPortal(
    <div className="pdf-preview-root fixed inset-0 z-[1400] flex flex-col bg-[#1d1d1f]/88" onClick={() => setItem(null)}>
      <style>{`@media print {
        body.pdf-preview-open > *:not(.pdf-preview-root) { display: none !important; }
        body.pdf-preview-open .pdf-preview-root { position: static; display: block !important; background: #fff; }
        body.pdf-preview-open .pdf-preview-bar { display: none !important; }
      }`}</style>
      <div className="pdf-preview-bar flex items-center gap-2 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{name}</p>
        <a href={downloadUrl} download className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12px] hover:bg-white/20">
          <Download size={14} /> {t('common.download')}
        </a>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12px] hover:bg-white/20" onClick={() => window.print()}>
          <Printer size={14} /> {t('common.print')}
        </button>
        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" onClick={() => setItem(null)} title={t('common.close')}>
          <X size={16} />
        </button>
      </div>
      <div className="pdf-preview-sheet min-h-0 flex-1 overflow-auto px-4 pb-8" onClick={(e) => e.stopPropagation()}>
        {isPdfFile(item.src) ? (
          <PdfPages
            url={item.src}
            onReady={item.print ? () => window.print() : undefined}
          />
        ) : (
          <img
            src={item.src}
            alt={name}
            className="mx-auto block max-h-[85vh] max-w-full bg-white shadow-lg"
            onLoad={item.print ? () => window.print() : undefined}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
