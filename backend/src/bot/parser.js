const crypto = require('crypto');

const VALID_STATUSES = [
  'Rawat Inap',
  'Luka Ringan',
  'Luka Berat',
  'Meninggal Dunia',
  'Selesai'
];

function normalizeStatus(statusRaw) {
  if (!statusRaw) return 'Rawat Inap';
  const trimmed = String(statusRaw).trim().toLowerCase();
  const matched = VALID_STATUSES.find(
    (s) => s.toLowerCase() === trimmed
  );
  return matched || 'Rawat Inap';
}

function normalizeKey(rawKey) {
  return rawKey
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseLaporanRS(text) {
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
    } else if (key === 'nik') {
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
    } else if (key === 'status') {
      data.status_raw = rawVal;
    }
  }

  const isValid =
    Boolean(data.nama_korban && data.nama_korban.trim()) &&
    Boolean(data.nik && data.nik.length === 16);

  if (!isValid) {
    return {
      isValid: false,
      data: null,
      error: 'Format Belum Lengkap: Nama wajib diisi dan NIK harus tepat 16 digit.'
    };
  }

  return {
    isValid: true,
    data: {
      rumah_sakit: data.rumah_sakit || '-',
      nama_korban: data.nama_korban.trim(),
      nik: data.nik,
      umur: data.umur !== undefined ? data.umur : null,
      alamat: data.alamat || '',
      tgl_laka: data.tgl_laka || '',
      tgl_masuk: data.tgl_masuk || '',
      kronologi: data.kronologi || '',
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
  generateNomorTiket,
  VALID_STATUSES
};
