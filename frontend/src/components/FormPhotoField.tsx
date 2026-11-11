import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { uploadForm } from '../lib/api';
import { photoSrc } from '../lib/photoUrl';
import { ZoomImage } from './PhotoLightbox';

export type PhotoFields = {
  photoFile: File | null;
  photoUrl: string;
};

export function emptyPhotoFields(): PhotoFields {
  return { photoFile: null, photoUrl: '' };
}

export function photoFieldsFrom(row?: { photo?: string | null } | null): PhotoFields {
  return { photoFile: null, photoUrl: row?.photo || '' };
}

export function omitPhotoFields<T extends PhotoFields>(form: T): Omit<T, keyof PhotoFields> {
  const { photoFile: _file, photoUrl: _url, ...rest } = form;
  return rest;
}

export async function uploadEntityPhoto(path: string, file: File | null | undefined) {
  if (!file) return null;
  const fd = new FormData();
  fd.append('file', file);
  return uploadForm(path, fd) as Promise<{ photo?: string | null }>;
}

export function FormPhotoField({
  file,
  photoUrl,
  onFile,
}: {
  file: File | null;
  photoUrl?: string;
  onFile: (file: File | null) => void;
}) {
  const { t } = useI18n();
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setLocalUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const src = localUrl || (photoUrl ? photoSrc(photoUrl) : '');

  return (
    <div className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-dashed border-gic-border bg-[#f5f5f7] px-3 py-2">
      <div className="mac-detail-photo">
        {src ? (
          <ZoomImage src={src} alt={t('fields.photo')} />
        ) : (
          <div className="mac-detail-photo-fallback">
            <Camera size={18} />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-gic-ink">{t('fields.photo')}</p>
        <p className="truncate text-[11px] text-gic-muted">{file ? file.name : t('fields.photoHint')}</p>
        <label className="mt-1 inline-flex cursor-pointer text-[12px] font-medium text-[#007aff]">
          {src ? t('actions.changePhoto') : t('actions.upload')}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0] || null);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}
