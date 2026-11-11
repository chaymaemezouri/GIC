import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ScanLine, X } from 'lucide-react';
import { Btn } from './ui';
import { useI18n } from '../i18n/I18nContext';

type ScanPage = { bytes: Uint8Array; width: number; height: number; url: string };

function pdfFromJpegs(pages: { bytes: Uint8Array; width: number; height: number }[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let length = 0;
  const offsets: number[] = [];
  const pushStr = (value: string) => {
    const bytes = encoder.encode(value);
    parts.push(bytes);
    length += bytes.length;
  };
  const pushBytes = (bytes: Uint8Array) => {
    parts.push(bytes);
    length += bytes.length;
  };
  const startObj = () => { offsets.push(length); };

  pushStr('%PDF-1.4\n');
  pushBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const pageIds = pages.map((_, i) => 3 + i * 3);
  startObj();
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObj();
  pushStr(`2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>\nendobj\n`);

  pages.forEach((page, i) => {
    const pageId = 3 + i * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const scale = Math.min(595 / page.width, 842 / page.height);
    const w = Math.max(1, Math.round(page.width * scale));
    const h = Math.max(1, Math.round(page.height * scale));
    const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
    startObj();
    pushStr(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${contentId} 0 R /Resources << /XObject << /Im0 ${imageId} 0 R >> >> >>\nendobj\n`);
    startObj();
    pushStr(`${contentId} 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
    startObj();
    pushStr(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`);
    pushBytes(page.bytes);
    pushStr('\nendstream\nendobj\n');
  });

  const xrefAt = length;
  const size = offsets.length + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  pushStr(xref);
  pushStr(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

async function blobToPage(blob: Blob, width: number, height: number): Promise<ScanPage> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, width, height, url: URL.createObjectURL(blob) };
}

function scanFileName() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  return `scan-${stamp}.pdf`;
}

export function applyScannedFile(
  input: HTMLInputElement | null,
  file: File,
  onChange: (e: ChangeEvent<HTMLInputElement>) => void,
) {
  if (!input) return;
  const list = new DataTransfer();
  list.items.add(file);
  input.files = list.files;
  onChange({ target: input, currentTarget: input } as ChangeEvent<HTMLInputElement>);
}

function DocumentScanner({ onClose, onDone }: { onClose: () => void; onDone: (file: File) => void }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [busy, setBusy] = useState(false);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url));
    };
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-camera');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1200 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function addCanvas(canvas: HTMLCanvasElement) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob) return;
    const page = await blobToPage(blob, canvas.width, canvas.height);
    setPages((prev) => [...prev, page]);
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      await addCanvas(canvas);
    } finally {
      setBusy(false);
    }
  }

  function removePage(index: number) {
    setPages((prev) => {
      const next = [...prev];
      const [gone] = next.splice(index, 1);
      if (gone) URL.revokeObjectURL(gone.url);
      return next;
    });
  }

  function finish() {
    if (!pages.length) return;
    const blob = pdfFromJpegs(pages);
    onDone(new File([blob], scanFileName(), { type: 'application/pdf' }));
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-scan-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-black/5 px-4 py-3">
          <h2 id="doc-scan-title" className="text-[15px] font-semibold tracking-tight text-gic-ink">{t('docs.scanTitle')}</h2>
          <button type="button" className="rounded-full p-1 text-gic-muted hover:bg-black/5" onClick={onClose} aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 overflow-auto p-4">
          <p className="text-[12px] text-gic-muted">{t('docs.scanHint')}</p>
          <div className="overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} className="max-h-[46vh] w-full object-contain" playsInline muted autoPlay />
          </div>
          {!ready && !error && <p className="text-[12px] text-gic-muted">{t('common.loading')}</p>}
          {error && <p className="text-[12px] text-gic-coral">{t('docs.scanCameraError')}</p>}
          {pages.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium text-gic-muted">{t('docs.scanPages', { count: pages.length })}</p>
              <div className="flex flex-wrap gap-2">
                {pages.map((page, index) => (
                  <div key={page.url} className="relative">
                    <img src={page.url} alt="" className="h-16 w-12 rounded-md border border-gic-border object-cover" />
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 text-gic-muted shadow"
                      title={t('docs.scanRemove')}
                      aria-label={t('docs.scanRemove')}
                      onClick={() => removePage(index)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/5 px-4 py-3">
          <Btn variant="secondary" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn variant="secondary" onClick={capture} disabled={!ready || busy}>{t('docs.scanCapture')}</Btn>
          <Btn onClick={finish} disabled={!pages.length}>{t('docs.scanUse')}</Btn>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function DocumentScanButton({
  onFile,
  disabled,
  variant = 'text',
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  variant?: 'text' | 'icon';
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const title = t('actions.scanDocument');
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={title}
        aria-label={title}
        onClick={() => setOpen(true)}
        className={variant === 'icon'
          ? 'mac-action-btn mac-action-btn-blue disabled:opacity-40'
          : 'inline-flex items-center gap-1.5 rounded-lg border border-gic-border bg-white px-2.5 py-1.5 text-[12px] font-medium text-gic-ink hover:bg-gray-50 disabled:opacity-40'}
      >
        <ScanLine size={14} strokeWidth={2.15} />
        {variant === 'text' && t('actions.scan')}
      </button>
      {open && (
        <DocumentScanner
          onClose={() => setOpen(false)}
          onDone={(file) => { onFile(file); setOpen(false); }}
        />
      )}
    </>
  );
}

/** Champ fichier : téléversement et scan produisent le même fichier. */
export function DocumentFileActions({
  accept,
  multiple,
  disabled,
  required,
  inputClassName = 'min-w-[12rem] flex-1 text-[12px]',
  labelClassName,
  labelTitle,
  scanVariant = 'text',
  children,
  onChange,
}: {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  required?: boolean;
  inputClassName?: string;
  labelClassName?: string;
  labelTitle?: string;
  scanVariant?: 'text' | 'icon';
  children?: ReactNode;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const lastFile = useRef<{ key: string; at: number } | null>(null);

  function emit(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const key = Array.from(files).map((file) => `${file.name}:${file.size}:${file.lastModified}`).join('|');
    const now = Date.now();
    if (lastFile.current && lastFile.current.key === key && now - lastFile.current.at < 1000) return;
    lastFile.current = { key, at: now };
    onChange(e);
  }

  const input = (
    <input
      id={labelClassName ? inputId : undefined}
      ref={ref}
      type="file"
      accept={accept}
      multiple={multiple}
      required={required}
      disabled={disabled}
      className={labelClassName ? 'hidden' : inputClassName}
      onChange={emit}
    />
  );
  return (
    <div className={labelClassName ? 'inline-flex flex-wrap items-center gap-2' : 'flex w-full flex-wrap items-center gap-2'}>
      {labelClassName ? (
        <label htmlFor={inputId} className={labelClassName} title={labelTitle} aria-label={labelTitle}>{children}</label>
      ) : null}
      {input}
      <DocumentScanButton
        variant={scanVariant}
        disabled={disabled}
        onFile={(file) => applyScannedFile(ref.current, file, emit)}
      />
    </div>
  );
}
