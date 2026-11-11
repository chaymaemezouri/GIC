import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Download, Printer, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

GlobalWorkerOptions.workerSrc = workerUrl;

const EVENT = 'gic-pdf-preview';

const PREVIEW_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|svg)$/i;
const SHEET_EXT = /\.(xlsx|xls|csv)$/i;
const WORD_EXT = /\.docx$/i;
const OFFICE_EXT = /\.(xlsx|xls|csv|docx|doc|pptx|ppt)$/i;

export function uploadPathname(href: string) {
  if (!href || href.startsWith('blob:') || href.startsWith('data:') || href.startsWith('#')) return null;
  try {
    const url = new URL(href, window.location.origin);
    if (!url.pathname.includes('/uploads/')) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

export function previewFilePath(href: string) {
  const pathname = uploadPathname(href);
  if (!pathname || !PREVIEW_EXT.test(pathname)) return null;
  return pathname;
}

export function isSheetFile(src: string) {
  return SHEET_EXT.test(src.split('?')[0]);
}

export function isWordFile(src: string) {
  return WORD_EXT.test(src.split('?')[0]);
}

export function displayFileName(name?: string | null) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const base = raw.split(/[/\\]/).pop() || raw;
  const scan = base.match(/(scan-[A-Za-z0-9._-]+\.[A-Za-z0-9]{2,5})$/i);
  return scan ? scan[1] : base;
}

function shownName(src: string, title?: string) {
  const file = displayFileName(decodeURIComponent(src.split('?')[0].split('/').pop() || 'document'));
  const ext = file.includes('.') ? file.slice(file.lastIndexOf('.')) : '';
  const label = displayFileName(title).replace(/[\\/:*?"<>|]/g, ' ').trim();
  if (!label) return file;
  if (/\.[a-z0-9]{2,5}$/i.test(label)) return label;
  return `${label}${ext}`;
}

async function saveNamed(src: string, filename: string) {
  const res = await fetch(src);
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

export function requestPdfPreview(src: string, print = false, title?: string) {
  const uploaded = uploadPathname(src);
  const path = previewFilePath(src) || (uploaded && OFFICE_EXT.test(uploaded) ? uploaded : null) || src;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { src: path, print, title } }));
}

type SheetData = { name: string; rows: string[][] };

/** Tableau d’un classeur Excel ou CSV, lu par le serveur. */
export function SheetView({ url }: { url: string }) {
  const { t } = useI18n();
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSheets(null);
    const view = `${url.split('?')[0]}?view=1`;
    fetch(view)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('preview'))))
      .then((data: { sheets?: SheetData[] }) => {
        if (cancelled) return;
        setSheets(data.sheets || []);
        setActive(0);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [url]);

  if (failed) {
    return <p className="py-10 text-center text-[13px] text-gic-coral">{t('docs.noPreview')}</p>;
  }
  if (!sheets) {
    return <p className="py-10 text-center text-[13px] text-gic-muted">{t('common.loading')}</p>;
  }
  const sheet = sheets[active];
  if (!sheet || sheet.rows.length === 0) {
    return <p className="py-10 text-center text-[13px] text-gic-muted">{t('docs.noPreview')}</p>;
  }
  const width = Math.max(...sheet.rows.map((row) => row.length), 1);
  return (
    <div className="mx-auto max-w-[1100px] overflow-hidden rounded-xl bg-white shadow-lg">
      {sheets.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-black/10 px-3 py-2">
          {sheets.map((item, index) => (
            <button
              key={item.name}
              type="button"
              className={`shrink-0 rounded-full px-3 py-1 text-[12px] ${index === active ? 'bg-gic-violet text-white' : 'bg-black/[0.04] text-gic-ink'}`}
              onClick={() => setActive(index)}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-[75vh] overflow-auto">
        <table className="w-full border-collapse text-left text-[12px]">
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex === 0 ? 'bg-[#f5f5f7] font-medium' : 'odd:bg-white even:bg-[#fafafa]'}>
                {Array.from({ length: width }, (_, col) => (
                  <td key={col} className="whitespace-nowrap border border-black/[0.06] px-2 py-1.5 text-gic-ink">
                    {row[col] || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Texte d’un document Word, converti par le serveur. */
export function DocView({ url }: { url: string }) {
  const { t } = useI18n();
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setHtml(null);
    fetch(`${url.split('?')[0]}?view=1`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('preview'))))
      .then((data: { html?: string }) => {
        if (!cancelled) setHtml(data.html || '');
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [url]);

  if (failed) return <p className="py-10 text-center text-[13px] text-gic-coral">{t('docs.noPreview')}</p>;
  if (html == null) return <p className="py-10 text-center text-[13px] text-gic-muted">{t('common.loading')}</p>;
  if (!html.trim()) return <p className="py-10 text-center text-[13px] text-gic-muted">{t('docs.noPreview')}</p>;
  return (
    <div
      className="prose-doc mx-auto max-w-[900px] rounded-xl bg-white p-6 text-[13px] leading-6 text-gic-ink shadow-lg [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-black/10 [&_td]:px-2 [&_td]:py-1 [&_p]:mb-2"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function OfficeOpen({ path }: { path: string }) {
  const { t } = useI18n();
  return (
    <button type="button" className="text-[12px] text-[#007aff] hover:opacity-70" onClick={() => requestPdfPreview(path)}>
      {t('common.view')}
    </button>
  );
}

/** Aperçu intégré : PDF rendu dans la page, image affichée telle quelle. */
export function FileInlinePreview({ src }: { src: string }) {
  const path = previewFilePath(src) || (uploadPathname(src) && (isSheetFile(src) || isWordFile(src)) ? uploadPathname(src) : null);
  if (!path) return null;
  if (isSheetFile(path) || isWordFile(path)) {
    return <OfficeOpen path={path} />;
  }
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
        task = getDocument({
          url: rawPdfUrl(url),
          wasmUrl: `${import.meta.env.BASE_URL}pdfjs/`,
          useSystemFonts: true,
        });
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
        if (cancelled || !host) return;
        try {
          const res = await fetch(rawPdfUrl(url));
          if (!res.ok) throw new Error('missing');
          const buffer = await res.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
          const png = bytes[0] === 0x89 && bytes[1] === 0x50;
          if (jpeg || png) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(new Blob([buffer], { type: jpeg ? 'image/jpeg' : 'image/png' }));
            img.alt = '';
            img.style.display = 'block';
            img.style.margin = '0 auto';
            img.style.maxWidth = '920px';
            img.style.background = '#fff';
            host.replaceChildren(img);
            setState('ready');
            return;
          }
        } catch { /* le message d’échec suffit */ }
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
  const [item, setItem] = useState<{ src: string; print: boolean; title?: string } | null>(null);

  useEffect(() => {
    function onPreview(e: Event) {
      const detail = (e as CustomEvent<{ src: string; print?: boolean; title?: string }>).detail;
      if (!detail?.src) return;
      setItem({ src: detail.src, print: Boolean(detail.print), title: detail.title });
    }
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      const anchor = (e.target as Element | null)?.closest?.('a');
      if (!anchor || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href') || '';
      const path = previewFilePath(href) || uploadPathname(href);
      if (!path || (!previewFilePath(href) && !OFFICE_EXT.test(path))) return;
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
  const name = shownName(item.src, item.title);
  const downloadUrl = isPdfFile(item.src) ? rawPdfUrl(item.src) : item.src.split('?')[0];
  const sheet = isSheetFile(item.src);
  const word = isWordFile(item.src);
  const previewable = isPdfFile(item.src) || sheet || word || PREVIEW_EXT.test(item.src.split('?')[0]);

  return createPortal(
    <div className="pdf-preview-root fixed inset-0 z-[1400] flex flex-col bg-[#1d1d1f]/88" onClick={() => setItem(null)}>
      <style>{`@media print {
        body.pdf-preview-open > *:not(.pdf-preview-root) { display: none !important; }
        body.pdf-preview-open .pdf-preview-root { position: static; display: block !important; background: #fff; }
        body.pdf-preview-open .pdf-preview-bar { display: none !important; }
      }`}</style>
      <div className="pdf-preview-bar flex items-center gap-2 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{name}</p>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12px] hover:bg-white/20" onClick={() => { void saveNamed(downloadUrl, name); }}>
          <Download size={14} /> {t('common.download')}
        </button>
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
        ) : sheet ? (
          <SheetView url={item.src} />
        ) : word ? (
          <DocView url={item.src} />
        ) : previewable ? (
          <img
            src={item.src}
            alt={name}
            className="mx-auto block max-h-[85vh] max-w-full bg-white shadow-lg"
            onLoad={item.print ? () => window.print() : undefined}
            onError={(e) => { (e.currentTarget as HTMLImageElement).replaceWith(Object.assign(document.createElement('p'), { className: 'py-16 text-center text-[13px] text-white', textContent: t('docs.noPreview') })); }}
          />
        ) : (
          <p className="py-16 text-center text-[13px] text-white">{t('docs.noPreviewHint')}</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
