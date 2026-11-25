/**
 * Koleksi foto asli dokumentasi kunjungan rumah sakit Mobile Service Jasa Raharja
 * Menggantikan seluruh placeholder/vektor buatan dengan dokumentasi fisik asli lapangan.
 */

export const REAL_VISIT_PHOTOS = [
  '/img/visits/visit-1.jpg',
  '/img/visits/visit-2.jpg',
  '/img/visits/visit-3.jpg',
  '/img/visits/visit-4.jpg',
  '/img/visits/visit-5.jpg',
  '/img/visits/visit-6.jpg'
];

/**
 * Mengambil foto kunjungan asli berdasarkan seed identitas (id korban, nomor kunjungan, atau nama faskes)
 * agar foto konsisten untuk setiap kasus / kunjungan tanpa menggunakan placeholder vektor.
 */
export function getRealVisitPhoto(seed = 0) {
  if (!seed && seed !== 0) return REAL_VISIT_PHOTOS[0];
  let num = 0;
  if (typeof seed === 'number') {
    num = Math.abs(seed);
  } else {
    const s = String(seed);
    for (let i = 0; i < s.length; i++) {
      num = (num * 31 + s.charCodeAt(i)) & 0x7fffffff;
    }
  }
  return REAL_VISIT_PHOTOS[num % REAL_VISIT_PHOTOS.length];
}
