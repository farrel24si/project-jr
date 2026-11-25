/**
 * Photo Utilities with Official Jasa Raharja Watermark Stamp
 * Imprints Officer Name, Timestamp, Hospital Location, and GPS Coordinates
 * directly onto the photo canvas before compression.
 */

/**
 * Safely converts an uploaded or camera image File to a downscaled JPEG Data URL
 * using createImageBitmap or URL.createObjectURL to avoid huge memory allocations
 * and prevent browser tab crashes on mobile devices (Android / iOS).
 */
export async function fileToSafeDataUrl(file, maxWidth = 1024, maxHeight = 768, quality = 0.8) {
  if (!file) return null;

  // 1. Try createImageBitmap with resize (fastest, memory safe)
  if (typeof window !== 'undefined' && typeof window.createImageBitmap === 'function') {
    try {
      const bitmap = await window.createImageBitmap(file, {
        resizeWidth: maxWidth,
        resizeQuality: 'medium'
      });
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        if (typeof bitmap.close === 'function') bitmap.close();
        return canvas.toDataURL('image/jpeg', quality);
      }
    } catch (e) {
      // Fallback if browser doesn't support options or throws
    }
  }

  // 2. Fallback: URL.createObjectURL (doesn't load huge string into JS memory)
  if (typeof window !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      const objectUrl = URL.createObjectURL(file);
      const dataUrl = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            URL.revokeObjectURL(objectUrl);
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              }
            } else {
              if (height > maxHeight) {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              return resolve(null);
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Gagal memuat gambar dari file'));
        };
        img.src = objectUrl;
      });
      if (dataUrl) return dataUrl;
    } catch (e) {
      // Fallback to FileReader
    }
  }

  // 3. Fallback: FileReader
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const compressed = await compressImage(e.target.result, maxWidth, maxHeight, quality);
        resolve(compressed);
      } catch (err) {
        resolve(e.target.result);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function compressImage(imageDataUrl, maxWidth = 640, maxHeight = 480, quality = 0.6) {
  return new Promise((resolve) => {
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return resolve(imageDataUrl);
    }

    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return resolve(imageDataUrl);
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(imageDataUrl);
    img.src = imageDataUrl;
  });
}

/**
 * Stamp official tamper-evident forensic metadata watermark onto photo canvas
 * Includes Jasa Raharja logo in the top-left corner and realtime timestamp
 */
export function stampPhotoWatermark(
  imageDataUrl,
  {
    petugasNama = 'Petugas Jasa Raharja',
    waktu = null,
    lokasi = 'Rumah Sakit',
    latitude = null,
    longitude = null,
    akurasiLokasi = null,
    sumberKoordinat = null,
    isSimulated = false,
    korbanNama = null
  } = {},
  maxWidth = 720,
  maxHeight = 540,
  quality = 0.75
) {
  return new Promise((resolve) => {
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return resolve(imageDataUrl);
    }

    // Waktu realtime saat foto diambil / distempel
    const actualTime = waktu ? new Date(waktu) : new Date();

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return resolve(imageDataUrl);
      }

      // 1. Draw base photo
      ctx.drawImage(img, 0, 0, width, height);

      // Helper function to draw top-left logo and bottom watermark
      const finishWatermark = (logoImg = null) => {
        // ── 2. LOGO RESMI JASA RAHARJA DI KIRI ATAS (Transparan Murni Tanpa Background Putih) ──
        if (logoImg && logoImg.naturalWidth > 0) {
          const logoMargin = Math.max(12, Math.round(width * 0.025));
          // Rasio asli logo Jasa Raharja: 3840 / 989 ≈ 3.8827
          const logoAspect = logoImg.naturalWidth / logoImg.naturalHeight || 3.8827;
          const targetLogoWidth = Math.max(150, Math.round(width * 0.28));
          const targetLogoHeight = Math.round(targetLogoWidth / logoAspect);

          ctx.save();
          // Bayangan halus agar logo transparan tetap terbaca jelas di foto terang maupun gelap
          ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;

          // Gambar foto logo asli secara transparan tanpa kotak putih
          ctx.drawImage(
            logoImg,
            logoMargin,
            logoMargin,
            targetLogoWidth,
            targetLogoHeight
          );
          ctx.restore();
        }

        // ── 3. FORMAT WAKTU REALTIME (WIB) ──
        const dateStr = actualTime.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
        const timeStr = actualTime.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }).replace(/:/g, '.') + ' WIB';

        // ── 4. BANNER WATERMARK FORENSIK DI BAGIAN BAWAH ──
        const stampHeight = Math.max(105, Math.round(height * 0.27));
        const stampY = height - stampHeight;

        // Dark semi-transparent background banner with gradient
        const gradient = ctx.createLinearGradient(0, stampY - 10, 0, height);
        gradient.addColorStop(0, 'rgba(15, 23, 42, 0)');
        gradient.addColorStop(0.2, 'rgba(15, 23, 42, 0.85)');
        gradient.addColorStop(1, 'rgba(15, 23, 42, 0.96)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, stampY - 10, width, stampHeight + 10);

        // Blue accent line on top of banner
        ctx.fillStyle = '#145DA0';
        ctx.fillRect(0, stampY + 4, width, 3);

        const paddingLeft = Math.max(12, Math.round(width * 0.03));
        let currentY = stampY + 20;
        const fontSize = Math.max(11, Math.round(width * 0.024));

        // 1. Header: PT Jasa Raharja Badge
        ctx.font = `bold ${Math.round(fontSize * 1.05)}px sans-serif`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('PT JASA RAHARJA • DOKUMENTASI MONITORING KORBAN', paddingLeft, currentY);

        // 2. Petugas & Pasien
        currentY += fontSize + 5;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = '#93C5FD'; // light blue
        ctx.fillText('Petugas: ', paddingLeft, currentY);
        const petugasTextWidth = ctx.measureText('Petugas: ').width;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`${petugasNama}${korbanNama ? ` | Pasien: ${korbanNama}` : ''}`, paddingLeft + petugasTextWidth, currentY);

        // 3. Waktu Foto (Waktu Realtime Aktual)
        currentY += fontSize + 4;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = '#93C5FD';
        ctx.fillText('Waktu: ', paddingLeft, currentY);
        const waktuTextWidth = ctx.measureText('Waktu: ').width;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`${dateStr}, ${timeStr}`, paddingLeft + waktuTextWidth, currentY);

        // 4. Lokasi / Rumah Sakit
        currentY += fontSize + 4;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = '#93C5FD';
        ctx.fillText('Lokasi: ', paddingLeft, currentY);
        const lokasiTextWidth = ctx.measureText('Lokasi: ').width;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`${lokasi}`, paddingLeft + lokasiTextWidth, currentY);

        // 5. Titik Koordinat GPS
        currentY += fontSize + 4;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = '#4ADE80'; // emerald green
        ctx.fillText('Titik GPS: ', paddingLeft, currentY);
        const gpsTextWidth = ctx.measureText('Titik GPS: ').width;
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.fillStyle = '#4ADE80';
        const hasCoords = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
        let gpsString = 'GPS Sedang Dikalibrasi';
        if (hasCoords) {
          const latStr = Number(latitude).toFixed(6);
          const lngStr = Number(longitude).toFixed(6);
          const isFallback = Boolean(isSimulated) || sumberKoordinat === 'Koordinat Rumah Sakit';
          if (isFallback) {
            gpsString = `${latStr}, ${lngStr} [Titik Acuan RS]`;
          } else {
            const accStr = Number.isFinite(Number(akurasiLokasi)) ? ` (Akurasi: ±${Math.round(akurasiLokasi)}m)` : '';
            gpsString = `${latStr}, ${lngStr}${accStr} [GPS Perangkat]`;
          }
        }
        ctx.fillText(gpsString, paddingLeft + gpsTextWidth, currentY);

        resolve(canvas.toDataURL('image/jpeg', quality));
      };

      // Muat logo Jasa Raharja untuk disematkan di kiri atas
      const logo = new Image();
      logo.crossOrigin = 'anonymous';
      logo.onload = () => finishWatermark(logo);
      logo.onerror = () => finishWatermark(null);
      logo.src = '/img/logo-jasa-raharja.png';
    };

    img.onerror = () => resolve(imageDataUrl);
    img.src = imageDataUrl;
  });
}
