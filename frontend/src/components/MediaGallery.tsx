import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Star, Trash2, X,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { formatDate } from '../lib/api';

export type MediaItem = {
  id: string;
  url: string;
  name?: string | null;
  date?: string | null;
  subtitle?: string | null;
  isCover?: boolean;
};

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'];

function extOf(item: MediaItem) {
  const source = (item.name || item.url || '').split('?')[0];
  const m = source.match(/\.([a-z0-9]+)$/i);
  if (m) return m[1].toLowerCase();
  const fromUrl = (item.url || '').split('?')[0].match(/\.([a-z0-9]+)$/i);
  return fromUrl ? fromUrl[1].toLowerCase() : '';
}

export function isImageItem(item: MediaItem) {
  return IMAGE_EXT.includes(extOf(item));
}

type Filter = 'all' | 'images' | 'documents';

export function MediaGallery({
  items,
  emptyLabel,
  onDelete,
  onSetCover,
  showFilter = true,
}: {
  items: MediaItem[];
  emptyLabel?: string;
  onDelete?: (item: MediaItem) => void;
  onSetCover?: (item: MediaItem) => void;
  showFilter?: boolean;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const imageCount = useMemo(() => items.filter(isImageItem).length, [items]);
  const docCount = items.length - imageCount;
  const visible = useMemo(
    () =>
      items.filter((i) =>
        filter === 'all' ? true : filter === 'images' ? isImageItem(i) : !isImageItem(i),
      ),
    [items, filter],
  );

  useEffect(() => {
    if (openIndex != null && openIndex >= visible.length) setOpenIndex(visible.length ? visible.length - 1 : null);
  }, [visible.length, openIndex]);

  if (!items.length) {
    return <p className="text-[12px] text-gic-muted py-6 text-center">{emptyLabel || t('gallery.empty')}</p>;
  }

  return (
    <div>
      {showFilter && imageCount > 0 && docCount > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(
            [
              ['all', t('gallery.all'), items.length],
              ['images', t('gallery.images'), imageCount],
              ['documents', t('gallery.documents'), docCount],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              className={`mac-chip cursor-pointer ${filter === key ? 'mac-chip-blue' : 'mac-chip-gray'}`}
              onClick={() => setFilter(key)}
            >
              {label} · {count}
            </button>
          ))}
        </div>
      )}
      <div className="mac-project-gallery">
        {visible.map((item, idx) => {
          const image = isImageItem(item);
          const ext = extOf(item);
          return (
            <div
              key={item.id}
              className={`mac-project-gallery-item mac-media-thumb${item.isCover ? ' mac-project-gallery-cover' : ''}`}
              role="button"
              tabIndex={0}
              title={item.name || undefined}
              onClick={() => setOpenIndex(idx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenIndex(idx);
                }
              }}
            >
              {image ? (
                <img src={item.url} alt={item.name || ''} loading="lazy" />
              ) : (
                <div className="mac-media-doc">
                  <FileText size={28} strokeWidth={1.6} />
                  <span className="mac-media-ext">{ext ? ext.toUpperCase() : 'DOC'}</span>
                </div>
              )}
              {(item.name || item.date) && (
                <div className="mac-media-caption">
                  <span className="truncate">{item.name || ''}</span>
                  {item.date && <span className="mac-media-caption-date">{formatDate(item.date)}</span>}
                </div>
              )}
              {(onDelete || (onSetCover && image)) && (
                <div className="mac-project-gallery-actions" onClick={(e) => e.stopPropagation()}>
                  {onSetCover && image && !item.isCover && (
                    <button
                      type="button"
                      className="mac-project-gallery-btn"
                      onClick={() => onSetCover(item)}
                      title={t('gallery.setCover')}
                    >
                      <Star size={12} />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      className="mac-project-gallery-btn mac-project-gallery-btn-danger"
                      onClick={() => onDelete(item)}
                      title={t('common.delete')}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )}
              {item.isCover && <span className="mac-project-gallery-badge">{t('fields.cover')}</span>}
            </div>
          );
        })}
      </div>
      {openIndex != null && visible[openIndex] && (
        <MediaLightbox
          items={visible}
          index={openIndex}
          onIndex={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </div>
  );
}

function MediaLightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: MediaItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const item = items[index];
  const image = isImageItem(item);
  const ext = extOf(item);
  const prev = useCallback(() => onIndex((index - 1 + items.length) % items.length), [index, items.length, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % items.length), [index, items.length, onIndex]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  return createPortal(
    <div className="mac-lightbox" onClick={onClose}>
      <div className="mac-lightbox-top" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="mac-lightbox-title truncate">{item.name || (image ? t('gallery.image') : t('gallery.document'))}</p>
          <p className="mac-lightbox-sub">
            {index + 1} / {items.length}
            {item.date ? ` · ${formatDate(item.date)}` : ''}
            {item.subtitle ? ` · ${item.subtitle}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <a href={item.url} target="_blank" rel="noreferrer" className="mac-lightbox-btn" title={t('actions.open')}>
            <ExternalLink size={16} />
          </a>
          <a href={item.url} download className="mac-lightbox-btn" title={t('gallery.download')}>
            <Download size={16} />
          </a>
          <button type="button" className="mac-lightbox-btn" onClick={onClose} title={t('common.close')}>
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="mac-lightbox-stage" onClick={(e) => e.stopPropagation()}>
        {image ? (
          <img src={item.url} alt={item.name || ''} className="mac-lightbox-img" />
        ) : ext === 'pdf' ? (
          <iframe src={item.url} title={item.name || 'PDF'} className="mac-lightbox-frame" />
        ) : (
          <div className="mac-lightbox-doc">
            <FileText size={56} strokeWidth={1.4} />
            <p className="text-[13px] font-medium mt-2">{item.name || t('gallery.document')}</p>
            <p className="text-[11px] opacity-70 mt-1">{t('gallery.noPreview')}</p>
            <a href={item.url} target="_blank" rel="noreferrer" className="mac-lightbox-open">
              <ExternalLink size={13} /> {t('actions.open')}
            </a>
          </div>
        )}
      </div>
      {items.length > 1 && (
        <>
          <button
            type="button"
            className="mac-lightbox-nav mac-lightbox-nav-prev"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            aria-label={t('gallery.previous')}
          >
            <ChevronLeft size={26} />
          </button>
          <button
            type="button"
            className="mac-lightbox-nav mac-lightbox-nav-next"
            onClick={(e) => { e.stopPropagation(); next(); }}
            aria-label={t('gallery.next')}
          >
            <ChevronRight size={26} />
          </button>
          <div className="mac-lightbox-strip" onClick={(e) => e.stopPropagation()}>
            {items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                className={`mac-lightbox-strip-item${i === index ? ' is-active' : ''}`}
                onClick={() => onIndex(i)}
                title={it.name || undefined}
              >
                {isImageItem(it) ? <img src={it.url} alt="" /> : <FileText size={16} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}