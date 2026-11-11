import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

export function PhotoLightbox({ src, title, onClose }: { src: string; title?: string; onClose: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="mac-lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={title || t('common.view')}>
      <div className="mac-lightbox-top" onClick={(e) => e.stopPropagation()}>
        <p className="mac-lightbox-title truncate">{title || t('fields.photo')}</p>
        <button type="button" className="mac-lightbox-btn" onClick={onClose} title={t('common.close')} aria-label={t('common.close')}>
          <X size={18} />
        </button>
      </div>
      <div className="mac-lightbox-stage" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={title || ''} className="mac-lightbox-img" />
      </div>
    </div>,
    document.body,
  );
}

/** Image cliquable : ouvre l’aperçu en grand. */
export function ZoomImage({
  src,
  alt = '',
  className,
  onError,
}: {
  src: string;
  alt?: string;
  className?: string;
  onError?: ImgHTMLAttributes<HTMLImageElement>['onError'];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`mac-photo-zoom${className ? ` ${className}` : ''}`}
        title={t('common.view')}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        onError={onError}
      />
      {open && <PhotoLightbox src={src} title={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
