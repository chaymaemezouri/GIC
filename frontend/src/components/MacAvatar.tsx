import { useEffect, useState, type ReactNode } from 'react';
import { photoSrc } from '../lib/photoUrl';
import { PhotoLightbox } from './PhotoLightbox';
import { useI18n } from '../i18n/I18nContext';

type MacAvatarProps = {
  photo?: string | null;
  firstName?: string;
  lastName?: string;
  name?: string;
  className?: string;
  fallbackClassName?: string;
  bust?: number | string;
  fallback?: ReactNode;
};

/** Avatar liste / fiche : photo ou initiales, jamais d’icône « image cassée ». */
export default function MacAvatar({
  photo,
  firstName = '',
  lastName = '',
  name,
  className = 'mac-avatar',
  fallbackClassName = 'mac-avatar-fallback',
  bust,
  fallback,
}: MacAvatarProps) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const src = photo && !failed ? photoSrc(photo, bust) : undefined;

  const initials = (() => {
    if (firstName || lastName) return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
    if (name) {
      const parts = name.trim().split(/\s+/);
      return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase() || '?';
    }
    return '?';
  })();

  useEffect(() => {
    setFailed(false);
  }, [photo, bust]);

  if (src) {
    const label = [firstName, lastName].filter(Boolean).join(' ') || name || t('fields.photo');
    return (
      <>
        <button
          type="button"
          className={className}
          title={t('common.view')}
          aria-label={t('common.view')}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <img src={src} alt={label} onError={() => setFailed(true)} />
        </button>
        {open && <PhotoLightbox src={src} title={label} onClose={() => setOpen(false)} />}
      </>
    );
  }

  if (fallback != null) {
    if (fallbackClassName) {
      return <span className={fallbackClassName}>{fallback}</span>;
    }
    return <>{fallback}</>;
  }

  return <span className={fallbackClassName || 'mac-avatar-fallback'}>{initials}</span>;
}
