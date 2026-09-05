import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { photoSrc } from '../lib/photoUrl';

type MacProfilePhotoProps = {
  photo?: string | null;
  firstName?: string;
  lastName?: string;
  bust?: number | string;
  onFileChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  editable?: boolean;
  className?: string;
};

export default function MacProfilePhoto({
  photo,
  firstName,
  lastName,
  bust,
  onFileChange,
  editable = false,
  className = '',
}: MacProfilePhotoProps) {
  const { t } = useI18n();
  const [imgError, setImgError] = useState(false);
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`;
  const src = photo && !imgError ? photoSrc(photo, bust) : undefined;

  useEffect(() => {
    setImgError(false);
  }, [photo, bust]);

  return (
    <div className={`mac-detail-photo${className ? ` ${className}` : ''}`}>
      {src ? (
        <img
          src={src}
          alt=""
          onError={() => setImgError(true)}
          onLoad={() => setImgError(false)}
        />
      ) : (
        <div className="mac-detail-photo-fallback text-lg font-bold">
          {initials || '?'}
        </div>
      )}
      {editable && onFileChange && (
        <label className="mac-detail-photo-cam" title={t('actions.changePhoto')}>
          <Camera size={12} strokeWidth={2} />
          <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp" onChange={onFileChange} />
        </label>
      )}
    </div>
  );
}
