/*
 * Seed alias nama grup WhatsApp -> rumah sakit kanonis.
 * Run: node scripts/seed-hospital-aliases.js --dry-run
 * Run: node scripts/seed-hospital-aliases.js
 *
 * Idempotent: alias yang sudah ada dan menunjuk RS yang sama diaktifkan lagi;
 * alias yang menunjuk RS berbeda ditolak (ambigu) dan tidak diubah.
 * Alias dijamin unik global oleh UNIQUE KEY (alias_normalized).
 */
const pool = require('../src/config/db');

const dryRun = process.argv.includes('--dry-run');

function normalizeTerm(value) {
  return value
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIASES = [
  ['RS Prima', 'RS Prima Pekanbaru'],
  ['RS Syafira', 'RS Syafira Pekanbaru'],
  ['RS Eka Hospital', 'RS EKA HOSPITAL - PEKANBARU'],
  ['RS AB Sudirman', 'RS AWAL BROS - PEKANBARU'],
  ['RS AB Panam', 'RS AWAL BROS PANAM - PEKANBARU'],
  ['RS AB A Yani', 'RS AWAL BROS AHMAD YANI PEKANBARU'],
  ['RS AB Ahmad Yani', 'RS AWAL BROS AHMAD YANI PEKANBARU'],
  ['RS AB Hangtuah', 'RS AWAL BROS HANGTUAH'],
  ['RS Bhayangkara', 'RS BHAYANGKARA POLDA - RIAU'],
  ['RS PMC', 'RS PEKANBARU MEDICAL CENTRE'],
  ['RS Tabrani', 'RS PROF. Dr. TABRANI - PEKANBARU'],
  ['RS Hermina', 'RS UMUM HERMINA PEKANBARU'],
  ['RS Aulia', 'RS AULIA HOSPITAL - PEKANBARU'],
  ['RS Aulia Hospital', 'RS AULIA HOSPITAL - PEKANBARU'],
  ['Aulia Soebrantas', 'RS AULIA HOSPITAL - PEKANBARU'],
  ['RS Aulia Soebrantas', 'RS AULIA HOSPITAL - PEKANBARU'],
  ['RS Murni Teguh', 'RS MURNI TEGUH ERIA'],
  ['RSUD Arifin Achmad', 'RSUD ARIFIN ACHMAD - PEKANBARU'],
  ['RS Arifin Achmad', 'RSUD ARIFIN ACHMAD - PEKANBARU']
];

async function main() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [hospitals] = await conn.query('SELECT id, nama_rs FROM hospitals WHERE is_active = 1');
    const byNormName = new Map(hospitals.map((h) => [normalizeTerm(h.nama_rs), h]));

    const [existing] = await conn.query('SELECT id, hospital_id, alias_normalized, alias_display, is_active FROM hospital_aliases');
    const byNormAlias = new Map(existing.map((a) => [a.alias_normalized, a]));

    let activated = 0;
    let unchanged = 0;
    for (const [aliasDisplay, hospitalName] of ALIASES) {
      const aliasNorm = normalizeTerm(aliasDisplay);
      const hospital = byNormName.get(normalizeTerm(hospitalName));
      if (!hospital) throw new Error(`Hospital tidak ditemukan/aktif: ${hospitalName}`);

      const existingAlias = byNormAlias.get(aliasNorm);
      if (existingAlias && existingAlias.hospital_id !== hospital.id) {
        throw new Error(
          `AMBIGU: alias "${aliasDisplay}" sudah menunjuk hospital_id ${existingAlias.hospital_id}, bukan ${hospital.id}. Jangan tebak.`
        );
      }

      if (!existingAlias) {
        if (!dryRun) {
          const [result] = await conn.execute(
            'INSERT INTO hospital_aliases (hospital_id, alias_normalized, alias_display, is_active) VALUES (?, ?, ?, 1)',
            [hospital.id, aliasNorm, aliasDisplay]
          );
          byNormAlias.set(aliasNorm, { id: result.insertId, hospital_id: hospital.id, alias_normalized: aliasNorm });
        }
        activated += 1;
      } else if (existingAlias.is_active !== 1) {
        if (!dryRun) {
          await conn.execute('UPDATE hospital_aliases SET is_active = 1 WHERE id = ?', [existingAlias.id]);
          existingAlias.is_active = 1;
        }
        activated += 1;
      } else {
        unchanged += 1;
      }
    }

    if (dryRun) await conn.rollback(); else await conn.commit();
    console.log(`${dryRun ? 'DRY RUN' : 'SEED'}: activated=${activated}, unchanged=${unchanged}, total=${ALIASES.length}`);
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { normalizeTerm };
