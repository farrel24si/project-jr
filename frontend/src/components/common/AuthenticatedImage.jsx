import React, { useState, useEffect } from 'react';
import { loadAuthenticatedPhoto, getCachedPhoto, normalizePhotoKey } from '../../services/photoService';
import { getRealVisitPhoto } from '../../utils/realPhotos';

/**
 * Komponen gambar yang otomatis menyertakan header Authorization: Bearer <token>
 * saat memuat foto bukti kunjungan dari endpoint /uploads/:filename backend.
 * Memastikan foto asli lapangan selalu tampil dari persistent cache/IndexedDB
 * dan tidak jatuh ke placeholder jika ada foto tersimpan.
 */
export default function AuthenticatedImage({
  src,
  alt = 'Dokumentasi Kunjungan',
  className = '',
  fallbackSrc = '/img/visits/visit-1.jpg',
  onClick,
  ...props
}) {
  const isUploadEndpoint = typeof src === 'string' && (src.includes('/uploads/') || src.startsWith('uploads/'));

  const [resolvedSrc, setResolvedSrc] = useState(() => {
    if (!src) return fallbackSrc;
    if (src.startsWith('data:') || src.startsWith('blob:')) return src;
    const cached = getCachedPhoto(src) || getCachedPhoto(normalizePhotoKey(src));
    // Jika path mengarah ke file unggahan resmi backend (/uploads/), jangan gunakan cache 'data:' URL yang berisiko basi
    if (cached) {
      if (!isUploadEndpoint || cached.startsWith('blob:')) {
        return cached;
      }
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
      setHasError(false);
      return;
    }

    if (src.startsWith('data:') || src.startsWith('blob:')) {
      setResolvedSrc(src);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    // Periksa cache multi-tier sinkron terlebih dahulu jika bukan data: basi untuk upload endpoint
    const cached = getCachedPhoto(src) || getCachedPhoto(normalizePhotoKey(src));
    if (cached && (!isUploadEndpoint || cached.startsWith('blob:'))) {
      setResolvedSrc(cached);
      setIsLoading(false);
      setHasError(false);
      return;
    }

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
            const realFallback = getRealVisitPhoto(src) || fallbackSrc;
            setResolvedSrc(realFallback);
            setHasError(false);
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
          const realFallback = getRealVisitPhoto(src) || fallbackSrc;
          setResolvedSrc(realFallback);
          setHasError(false);
        }
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [src, fallbackSrc]);

  return (
    <div className={`relative overflow-hidden ${isLoading ? 'bg-slate-100 animate-pulse' : ''} ${className}`}>
      <img
        src={resolvedSrc || fallbackSrc}
        alt={alt}
        onClick={onClick}
        onError={(e) => {
          e.currentTarget.onerror = null;
          const fallbackCached = getCachedPhoto(src) || getCachedPhoto(normalizePhotoKey(src));
          if (fallbackCached && fallbackCached !== resolvedSrc) {
            setResolvedSrc(fallbackCached);
          } else {
            e.currentTarget.src = fallbackSrc;
            setHasError(true);
          }
        }}
        className={`w-full h-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        {...props}
      />
    </div>
  );
}

