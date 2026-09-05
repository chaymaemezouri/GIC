import { useEffect, useState } from 'react';
import { photoSrc } from '../lib/photoUrl';

type UserAvatarProps = {
  photo?: string | null;
  firstName?: string;
  lastName?: string;
  className?: string;
  bust?: number | string;
};

export default function UserAvatar({ photo, firstName, lastName, className = 'shell-avatar', bust }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`;
  const src = photo && !imgError ? photoSrc(photo, bust) : undefined;

  useEffect(() => {
    setImgError(false);
  }, [photo, bust]);

  if (src) {
    return (
      <div className={className}>
        <img
          src={src}
          alt=""
          className="shell-avatar-img"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return <div className={className}>{initials}</div>;
}
