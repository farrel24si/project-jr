/**
 * Photo Utilities with Official Jasa Raharja Watermark Stamp
 * Imprints Officer Name, Timestamp, Hospital Location, and GPS Coordinates
 * directly onto the photo canvas before compression.
 */

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
 */
export function stampPhotoWatermark(
  imageDataUrl,
  {
    petugasNama = 'Petugas Jasa Raharja',
    waktu = new Date().toISOString(),
    lokasi = 'Rumah Sakit',
    latitude = null,
    longitude = null,
    akurasiLokasi = null,
    korbanNama = null
  } = {},
  maxWidth = 720,
  maxHeight = 540,
  quality = 0.7
) {
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

      // Draw base image
      ctx.drawImage(img, 0, 0, width, height);

      // Format timestamp in WIB
      const d = new Date(waktu);
      const dateStr = d.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      const timeStr = d.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }) + ' WIB';

      // Stamp height calculation (approx 26% of photo height)
      const stampHeight = Math.max(105, Math.round(height * 0.27));
      const stampY = height - stampHeight;

      // Dark semi-transparent background banner with gradient
      const gradient = ctx.createLinearGradient(0, stampY - 10, 0, height);
      gradient.addColorStop(0, 'rgba(15, 23, 42, 0)');
      gradient.addColorStop(0.2, 'rgba(15, 23, 42, 0.82)');
      gradient.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
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

      // 3. Waktu Foto
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
      const gpsString = (latitude !== null && longitude !== null)
        ? `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}${akurasiLokasi ? ` (Akurasi: ±${akurasiLokasi}m)` : ''}`
        : 'GPS Sedang Dikalibrasi';
      ctx.fillText(gpsString, paddingLeft + gpsTextWidth, currentY);

      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(imageDataUrl);
    img.src = imageDataUrl;
  });
}
