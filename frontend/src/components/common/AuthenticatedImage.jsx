import React, { useState, useEffect } from 'react';
import { Camera } from 'lucide-react';
import { loadAuthenticatedPhoto, getCachedPhoto, normalizePhotoKey } from '../../services/photoService';

/**
 * Komponen gambar yang otomatis menyertakan header Authorization: Bearer <token>
 * saat memuat foto bukti kunjungan dari endpoint /uploads/:filename backend.
 */
export default function AuthenticatedImage({
  src,
  alt = 'Dokumentasi Kunjungan',
  className = '',
  fallbackSrc = null,
  onClick,
  ...props
}) {
  const isUploadEndpoint = typeof src === 'string' && (src.includes('/uploads/') || src.startsWith('uploads/'));

  const [resolvedSrc, setResolvedSrc] = useState(() => {
    if (!src) return fallbackSrc;
    if (src.startsWith('data:') || src.startsWith('blob:')) return src;
    const cached = getCachedPhoto(src) || getCachedPhoto(normalizePhotoKey(src));
    if (cached && (!isUploadEndpoint || cached.startsWith('blob:'))) {
      return cached;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(!resolvedSrc && Boolean(src));
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (!src) {
      setResolvedSrc(fallbackSrc);
      setIsLoading(false);
      setHasError(!fallbackSrc);
      return;
    }

    if (src.startsWith('data:') || src.startsWith('blob:')) {
      setResolvedSrc(src);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    const cached = getCachedPhoto(src) || getCachedPhoto(normalizePhotoKey(src));
    if (cached && (!isUploadEndpoint || cached.startsWith('blob:'))) {
      setResolvedSrc(cached);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    setResolvedSrc(null);
    setIsLoading(true);
    setHasError(false);

    loadAuthenticatedPhoto(src)
      .then((url) => {
        if (!isMounted) return;
        if (url) {
          setResolvedSrc(url);
          setHasError(false);
        } else {
          const fallbackCached = getCachedPhoto(src) || getCachedPhoto(normalizePhotoKey(src));
          if (fallbackCached) {
            setResolvedSrc(fallbackCached);
            setHasError(false);
          } else {
            setResolvedSrc(fallbackSrc);
            setHasError(!fallbackSrc);
          }
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        const fallbackCached = getCachedPhoto(src) || getCachedPhoto(normalizePhotoKey(src));
        if (fallbackCached) {
          setResolvedSrc(fallbackCached);
          setHasError(false);
        } else {
          setResolvedSrc(fallbackSrc);
          setHasError(!fallbackSrc);
        }
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [src, fallbackSrc, isUploadEndpoint]);

  const activeSrc = resolvedSrc || fallbackSrc;

  return (
    <div className={`relative overflow-hidden ${isLoading ? 'bg-slate-100 animate-pulse' : ''} ${className}`}>
      {activeSrc && !hasError ? (
        <img
          src={activeSrc}
          alt={alt}
          onClick={onClick}
          onError={() => {
            const fallbackCached = getCachedPhoto(src) || getCachedPhoto(normalizePhotoKey(src));
            if (fallbackCached && fallbackCached !== activeSrc) {
              setResolvedSrc(fallbackCached);
            } else {
              setHasError(true);
            }
          }}
          className={`w-full h-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          {...props}
        />
      ) : !isLoading ? (
        <div className="w-full h-full min-h-[120px] flex flex-col items-center justify-center gap-1.5 bg-slate-50 text-slate-400 p-4 text-center">
          <Camera className="w-6 h-6 text-slate-300" />
          <span className="text-[11px] font-medium">Foto bukti tidak tersedia</span>
        </div>
      ) : null}
    </div>
  );
}
