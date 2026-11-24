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
  // 1. RS Prima Pekanbaru
  ['RS Prima', 'RS Prima Pekanbaru'],
  ['Prima Pekanbaru', 'RS Prima Pekanbaru'],
  ['Prima', 'RS Prima Pekanbaru'],

  // 2. RS SYAFIRA - PEKANBARU
  ['RS Syafira', 'RS Syafira Pekanbaru'],
  ['Syafira Pekanbaru', 'RS Syafira Pekanbaru'],
  ['Syafira', 'RS Syafira Pekanbaru'],

  // 3. RS EKA HOSPITAL - PEKANBARU
  ['RS Eka Hospital', 'RS EKA HOSPITAL - PEKANBARU'],
  ['Eka Hospital Pekanbaru', 'RS EKA HOSPITAL - PEKANBARU'],
  ['Eka Hospital', 'RS EKA HOSPITAL - PEKANBARU'],
  ['RS Eka Pekanbaru', 'RS EKA HOSPITAL - PEKANBARU'],
  ['RS Eka', 'RS EKA HOSPITAL - PEKANBARU'],
  ['Eka', 'RS EKA HOSPITAL - PEKANBARU'],

  // 4. RS AWAL BROS - PEKANBARU (Jl. Jend. Sudirman)
  ['RS Awal Bros Sudirman', 'RS AWAL BROS - PEKANBARU'],
  ['Awal Bros Sudirman', 'RS AWAL BROS - PEKANBARU'],
  ['RS AB Sudirman', 'RS AWAL BROS - PEKANBARU'],
  ['AB Sudirman', 'RS AWAL BROS - PEKANBARU'],
  ['Awal Bros Pekanbaru', 'RS AWAL BROS - PEKANBARU'],
  ['RS AB Pekanbaru', 'RS AWAL BROS - PEKANBARU'],
  ['AB Pekanbaru', 'RS AWAL BROS - PEKANBARU'],

  // 5. RS AWAL BROS PANAM - PEKANBARU
  ['RS Awal Bros Panam', 'RS AWAL BROS PANAM - PEKANBARU'],
  ['Awal Bros Panam', 'RS AWAL BROS PANAM - PEKANBARU'],
  ['RS AB Panam', 'RS AWAL BROS PANAM - PEKANBARU'],
  ['AB Panam', 'RS AWAL BROS PANAM - PEKANBARU'],

  // 6. RS AWAL BROS AHMAD YANI PEKANBARU
  ['RS Awal Bros Ahmad Yani', 'RS AWAL BROS AHMAD YANI PEKANBARU'],
  ['Awal Bros Ahmad Yani', 'RS AWAL BROS AHMAD YANI PEKANBARU'],
  ['RS Awal Bros A Yani', 'RS AWAL BROS AHMAD YANI PEKANBARU'],
  ['Awal Bros A Yani', 'RS AWAL BROS AHMAD YANI PEKANBARU'],
  ['RS AB A Yani', 'RS AWAL BROS AHMAD YANI PEKANBARU'],
  ['AB A Yani', 'RS AWAL BROS AHMAD YANI PEKANBARU'],
  ['RS AB Ahmad Yani', 'RS AWAL BROS AHMAD YANI PEKANBARU'],
  ['AB Ahmad Yani', 'RS AWAL BROS AHMAD YANI PEKANBARU'],

  // 7. RS AWAL BROS HANGTUAH
  ['Awal Bros Hangtuah', 'RS AWAL BROS HANGTUAH'],
  ['RS Awal Bros Hang Tuah', 'RS AWAL BROS HANGTUAH'],
  ['Awal Bros Hang Tuah', 'RS AWAL BROS HANGTUAH'],
  ['RS AB Hangtuah', 'RS AWAL BROS HANGTUAH'],
  ['AB Hangtuah', 'RS AWAL BROS HANGTUAH'],
  ['RS AB Hang Tuah', 'RS AWAL BROS HANGTUAH'],
  ['AB Hang Tuah', 'RS AWAL BROS HANGTUAH'],
  ['RS Hangtuah', 'RS AWAL BROS HANGTUAH'],

  // 8. RS BHAYANGKARA POLDA - RIAU
  ['RS Bhayangkara', 'RS BHAYANGKARA POLDA - RIAU'],
  ['RS Bhayangkara Pekanbaru', 'RS BHAYANGKARA POLDA - RIAU'],
  ['RS Bhayangkara Polda', 'RS BHAYANGKARA POLDA - RIAU'],
  ['Bhayangkara Polda Riau', 'RS BHAYANGKARA POLDA - RIAU'],
  ['Bhayangkara Pekanbaru', 'RS BHAYANGKARA POLDA - RIAU'],
  ['Bhayangkara', 'RS BHAYANGKARA POLDA - RIAU'],

  // 9. RS PEKANBARU MEDICAL CENTRE
  ['Pekanbaru Medical Centre', 'RS PEKANBARU MEDICAL CENTRE'],
  ['RS Pekanbaru Medical Center', 'RS PEKANBARU MEDICAL CENTRE'],
  ['Pekanbaru Medical Center', 'RS PEKANBARU MEDICAL CENTRE'],
  ['RS PMC', 'RS PEKANBARU MEDICAL CENTRE'],
  ['RS PMC Pekanbaru', 'RS PEKANBARU MEDICAL CENTRE'],
  ['PMC Pekanbaru', 'RS PEKANBARU MEDICAL CENTRE'],
  ['PMC', 'RS PEKANBARU MEDICAL CENTRE'],

  // 10. RS PROF. Dr. TABRANI - PEKANBARU
  ['RS Prof Dr Tabrani', 'RS PROF. Dr. TABRANI - PEKANBARU'],
  ['RS Prof Tabrani', 'RS PROF. Dr. TABRANI - PEKANBARU'],
  ['Prof Dr Tabrani', 'RS PROF. Dr. TABRANI - PEKANBARU'],
  ['Prof Tabrani', 'RS PROF. Dr. TABRANI - PEKANBARU'],
  ['RS Tabrani', 'RS PROF. Dr. TABRANI - PEKANBARU'],
  ['RS Tabrani Rab', 'RS PROF. Dr. TABRANI - PEKANBARU'],
  ['Tabrani Rab', 'RS PROF. Dr. TABRANI - PEKANBARU'],
  ['Tabrani', 'RS PROF. Dr. TABRANI - PEKANBARU'],

  // 11. RS UMUM HERMINA PEKANBARU
  ['RS Umum Hermina', 'RS UMUM HERMINA PEKANBARU'],
  ['RSU Hermina Pekanbaru', 'RS UMUM HERMINA PEKANBARU'],
  ['RSU Hermina', 'RS UMUM HERMINA PEKANBARU'],
  ['RS Hermina', 'RS UMUM HERMINA PEKANBARU'],
  ['Hermina Pekanbaru', 'RS UMUM HERMINA PEKANBARU'],
  ['Hermina', 'RS UMUM HERMINA PEKANBARU'],

  // 12. RS AULIA HOSPITAL - PEKANBARU
  ['RS Aulia', 'RS AULIA HOSPITAL - PEKANBARU'],
  ['RS Aulia Hospital', 'RS AULIA HOSPITAL - PEKANBARU'],
  ['Aulia Hospital', 'RS AULIA HOSPITAL - PEKANBARU'],
  ['Aulia Soebrantas', 'RS AULIA HOSPITAL - PEKANBARU'],
  ['RS Aulia Soebrantas', 'RS AULIA HOSPITAL - PEKANBARU'],
  ['Aulia', 'RS AULIA HOSPITAL - PEKANBARU'],

  // 13. RS MURNI TEGUH ERIA
  ['Murni Teguh Eria', 'RS MURNI TEGUH ERIA'],
  ['RS Murni Teguh', 'RS MURNI TEGUH ERIA'],
  ['Murni Teguh', 'RS MURNI TEGUH ERIA'],
  ['RS Eria', 'RS MURNI TEGUH ERIA'],
  ['RS Eria Bunda', 'RS MURNI TEGUH ERIA'],
  ['Eria Bunda', 'RS MURNI TEGUH ERIA'],

  // 14. RSUD ARIFIN ACHMAD - PEKANBARU
  ['RSUD Arifin Achmad', 'RSUD ARIFIN ACHMAD - PEKANBARU'],
  ['RS Arifin Achmad', 'RSUD ARIFIN ACHMAD - PEKANBARU'],
  ['Arifin Achmad', 'RSUD ARIFIN ACHMAD - PEKANBARU'],
  ['RSUD Arifin Ahmad', 'RSUD ARIFIN ACHMAD - PEKANBARU'],
  ['RS Arifin Ahmad', 'RSUD ARIFIN ACHMAD - PEKANBARU'],
  ['Arifin Ahmad', 'RSUD ARIFIN ACHMAD - PEKANBARU'],
  ['RSUD Arifin', 'RSUD ARIFIN ACHMAD - PEKANBARU']
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
