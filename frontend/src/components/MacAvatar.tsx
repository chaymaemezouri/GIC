import { useEffect, useState, type ReactNode } from 'react';
import { photoSrc } from '../lib/photoUrl';

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
  const [failed, setFailed] = useState(false);
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
    return (
      <img
        src={src}
        alt=""
        className={className}
        onError={() => setFailed(true)}
      />
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
