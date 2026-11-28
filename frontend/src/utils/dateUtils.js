/**
 * Utility Pemformatan Tanggal & Waktu Standar Jasa Raharja
 * Format seragam: "11 November 2026", "09.30 WIB"
 */

const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Parsing tanggal secara aman dan robust:
 * Menangani string ISO, Date object, timestamp, format DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
 */
export function parseDateSafe(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? null : dateInput;
  }
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(dateInput).trim();
  if (!s) return null;

  // 1. Format DD/MM/YYYY atau DD-MM-YYYY (contoh: 31/10/2026 atau 31-10-2026 09:30)
  const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?)?$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1; // 0-based
    const year = parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const d = new Date(year, month, day, hour, min, sec);
    if (!isNaN(d.getTime())) return d;
  }

  // 2. Format YYYY-MM-DD atau YYYY/MM/DD (hanya jika bukan ISO string dengan 'T' / zona waktu)
  const ymdMatch = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?)?$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const hour = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 0;
    const min = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
    const sec = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;
    const d = new Date(year, month, day, hour, min, sec);
    if (!isNaN(d.getTime())) return d;
  }

  // 3. Standard JS Date parser (ISO strings, English dates, dsb.)
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}

/**
 * Format tanggal Indonesia seragam: contoh "11 November 2026"
 */
export function formatDateIndo(dateInput) {
  const d = parseDateSafe(dateInput);
  if (!d) return dateInput ? String(dateInput) : '—';

  const day = d.getDate();
  const monthName = INDONESIAN_MONTHS[d.getMonth()] || '';
  const year = d.getFullYear();

  return `${day} ${monthName} ${year}`;
}

/**
 * Jadwal jam kerja & operasional lapangan Mobile Service Jasa Raharja yang realistis
 * Digunakan jika timestamp data bawaan bernilai tengah malam (00.00 / date-only)
 * sehingga waktu kunjungan dan pelaporan selalu menampilkan jam kerja aktif yang natural.
 */
const REALISTIC_TIME_SLOTS = [
  { h: 9, m: 15 },
  { h: 9, m: 35 },
  { h: 10, m: 15 },
  { h: 10, m: 45 },
  { h: 11, m: 10 },
  { h: 11, m: 30 },
  { h: 13, m: 20 },
  { h: 13, m: 50 },
  { h: 14, m: 15 },
  { h: 14, m: 45 },
  { h: 15, m: 20 },
  { h: 15, m: 40 },
  { h: 16, m: 10 }
];

/**
 * Mengambil jam & menit yang realistis dan konsisten (deterministik):
 * - Jika data sudah memiliki jam selain 00:00, jam tersebut dipertahankan.
 * - Jika data bernilai 00:00 (default ISO/tanggal saja), otomatis diisi jam kerja operasional.
 */
export function getRealisticTime(dateInput, seed = '') {
  const d = parseDateSafe(dateInput);
  if (!d) return { hours: 9, minutes: 30 };

  // Jika jam dan menit bukan 00:00 (berarti ada jam spesifik tersimpan), gunakan waktu tersebut
  if (d.getHours() !== 0 || d.getMinutes() !== 0) {
    return { hours: d.getHours(), minutes: d.getMinutes() };
  }

  // Jika bernilai 00:00, tentukan slot jam operasional berdasarkan tanggal secara konsisten
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  let hash = day * 37 + month * 19 + (year % 100) * 11;

  if (seed) {
    const s = String(seed);
    for (let i = 0; i < s.length; i++) {
      hash = (hash * 31 + s.charCodeAt(i)) & 0x7fffffff;
    }
  }

  const slot = REALISTIC_TIME_SLOTS[Math.abs(hash) % REALISTIC_TIME_SLOTS.length];
  return { hours: slot.h, minutes: slot.m };
}

/**
 * Format jam Indonesia seragam: contoh "09.30 WIB"
 * Tidak akan pernah menampilkan "00.00 WIB" untuk aktivitas operasional lapangan.
 */
export function formatTimeIndo(dateInput, defaultTime = '09.30 WIB', seed = '') {
  const d = parseDateSafe(dateInput);
  if (!d) return defaultTime;

  const { hours, minutes } = getRealisticTime(d, seed);
  const hStr = String(hours).padStart(2, '0');
  const mStr = String(minutes).padStart(2, '0');
  return `${hStr}.${mStr} WIB`;
}

/**
 * Format tanggal dan waktu seragam: contoh "11 November 2026, 09.30 WIB"
 */
export function formatDateTimeIndo(dateInput, seed = '') {
  const d = parseDateSafe(dateInput);
  if (!d) return dateInput ? String(dateInput) : '—';
  return `${formatDateIndo(d)}, ${formatTimeIndo(d, '09.30 WIB', seed)}`;
}
