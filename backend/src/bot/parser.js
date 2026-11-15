const crypto = require('crypto');

const VALID_STATUSES = [
  'Rawat Inap',
  'Luka Ringan',
  'Luka Berat',
  'Meninggal Dunia',
  'Selesai',
  'Masih Dirawat',
  'Sudah Pulang',
  'Belum Dapat Dikonfirmasi',
  'Dirujuk ke RS Lain'
];

function normalizeStatus(statusRaw) {
  if (!statusRaw) return 'Rawat Inap';
  const trimmed = String(statusRaw).trim().toLowerCase();
  const matched = VALID_STATUSES.find(
    (s) => s.toLowerCase() === trimmed
  );
  return matched || 'Rawat Inap';
}

function normalizeJenisLaka(jenisLakaRaw) {
  if (!jenisLakaRaw) return 'Belum Diketahui';
  const normalized = String(jenisLakaRaw).trim().toLowerCase();
  if (normalized === 'tunggal') return 'Tunggal';
  if (normalized === 'tidak tunggal' || normalized === 'tidak_tunggal') {
    return 'Tidak Tunggal';
  }
  return 'Belum Diketahui';
}

function normalizeKey(rawKey) {
  return rawKey
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeDateDDMMYYYY(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const trimmed = String(value).trim();
  if (!trimmed) return '';

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;

  const [, dayRaw, monthRaw, yearRaw] = match;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);

  if (month < 1 || month > 12 || day < 1 || year < 2000 || year > 2099) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function treatPlaceholderAsEmpty(value) {
  if (value === undefined || value === null) return '';
  const trimmed = String(value).trim();
  return trimmed.toLowerCase() === 'dd/mm/yyyy' ? '' : trimmed;
}

function parseLaporanRS(text, options = {}) {
  const { requireRumahSakit = true } = options;
  if (!text || typeof text !== 'string') return null;

  const lines = text.split(/\r?\n/);
  const data = {};

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const rawKey = line.slice(0, colonIdx);
    const rawVal = line.slice(colonIdx + 1).trim();
    const key = normalizeKey(rawKey);

    if (key === 'rs' || key === 'rumah_sakit') {
      data.rumah_sakit = rawVal;
    } else if (key === 'nama' || key === 'nama_korban') {
      data.nama_korban = rawVal;
    } else if (key === 'nik' || key.startsWith('nik_')) {
      data.nik = rawVal.replace(/\D/g, '');
    } else if (key === 'umur') {
      const parsed = parseInt(rawVal, 10);
      data.umur = Number.isNaN(parsed) ? null : parsed;
    } else if (key === 'alamat') {
      data.alamat = rawVal;
    } else if (key === 'tgl_laka' || key === 'tanggal_laka') {
      data.tgl_laka = rawVal;
    } else if (key === 'tgl_masuk' || key === 'tanggal_masuk') {
      data.tgl_masuk = rawVal;
    } else if (key === 'kronologi') {
      data.kronologi = rawVal;
    } else if (key === 'jenis_laka') {
      data.jenis_laka_raw = rawVal;
    } else if (key === 'status') {
      data.status_raw = rawVal;
    }
  }

  const isNamaValid = Boolean(data.nama_korban && data.nama_korban.trim());
  const isRumahSakitValid = Boolean(data.rumah_sakit && data.rumah_sakit.trim());
  const isValid = isNamaValid && (!requireRumahSakit || isRumahSakitValid);

  if (!isValid) {
    return {
      isValid: false,
      data: null,
      error: requireRumahSakit
        ? 'Format Belum Lengkap: RS dan Nama wajib diisi.'
        : 'Format Belum Lengkap: Nama wajib diisi.'
    };
  }

  const tglLaka = normalizeDateDDMMYYYY(treatPlaceholderAsEmpty(data.tgl_laka));
  const tglMasuk = normalizeDateDDMMYYYY(treatPlaceholderAsEmpty(data.tgl_masuk));
  if (tglLaka === null || tglMasuk === null) {
    return {
      isValid: false,
      data: null,
      error: 'Format tanggal tidak valid. Gunakan format DD/MM/YYYY.'
    };
  }

  const nik = data.nik && data.nik.length === 16 ? data.nik : null;

  return {
    isValid: true,
    data: {
      rumah_sakit: data.rumah_sakit ? data.rumah_sakit.trim() : null,
      nama_korban: data.nama_korban.trim(),
      nik,
      umur: data.umur !== undefined ? data.umur : null,
      alamat: data.alamat || '',
      tgl_laka: tglLaka,
      tgl_masuk: tglMasuk,
      kronologi: data.kronologi || '',
      jenis_laka: normalizeJenisLaka(data.jenis_laka_raw),
      status_kondisi: normalizeStatus(data.status_raw)
    }
  };
}

function generateNomorTiket() {
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `JR-${randomHex}`;
}

module.exports = {
  parseLaporanRS,
  normalizeStatus,
  normalizeDateDDMMYYYY,
  generateNomorTiket,
  VALID_STATUSES
};
