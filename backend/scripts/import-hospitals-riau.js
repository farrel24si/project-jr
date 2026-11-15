/*
 * Import daftar rumah sakit Riau yang sudah direview.
 * Run: node scripts/import-hospitals-riau.js --dry-run
 * Run: node scripts/import-hospitals-riau.js
 *
 * Tidak membuat officers. Plotting hanya diproses bila nama officer target sudah ada.
 */
const pool = require('../src/config/db');

const RADIUS_METER = 200;
const dryRun = process.argv.includes('--dry-run');

function normalizeNamaRs(value) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

const activeHospitals = [
  ['RS AWAL BROS - PEKANBARU', 'Jl. Jend. Sudirman No.117, Tengkerang Sel., Bukit Raya, Kota Pekanbaru, Riau 28128', 0.4950, 101.4552],
  ['RS SYAFIRA - PEKANBARU', 'Jl. Jend. Sudirman No.134, Tangkerang Tengah, Marpoyan Damai, Kota Pekanbaru, Riau 28282', 0.4924, 101.4542],
  ['RS EKA HOSPITAL - PEKANBARU', 'Jl. Soekarno - Hatta No.6, Tengkerang Bar., Marpoyan Damai, Kota Pekanbaru, Riau 28292', 0.4828, 101.4206],
  ['RS AWAL BROS HANGTUAH', 'Jl. Hangtuah No.121, Kelurahan Sialang Sakti, Tenayan Raya, Kota Pekanbaru, Riau 28285', 0.5097, 101.4886],
  ['RS BHAYANGKARA POLDA - RIAU', 'Jalan RA Kartini No.14, Simpang Empat, Pekanbaru Kota, Kota Pekanbaru, Riau 28156', 0.5187, 101.4497],
  ['RS PEKANBARU MEDICAL CENTRE', 'Jl. Lembaga Permasyarakatan No.25, Suka Maju, Sail, Kota Pekanbaru, Riau 28126', 0.5113, 101.4619],
  ['RS AWAL BROS AHMAD YANI PEKANBARU', 'Jl. Jend. Ahmad Yani No.73, Tanah Datar, Pekanbaru Kota, Kota Pekanbaru, Riau 28156', 0.5255, 101.4419],
  ['RSUD ARIFIN ACHMAD - PEKANBARU', 'Jl. Diponegoro No.2, Sumahilang, Pekanbaru Kota, Kota Pekanbaru, Riau 28156', 0.5218, 101.4502],
  ['RS PROF. Dr. TABRANI - PEKANBARU', 'Jl. Jend. Sudirman No.410, Wonorejo, Marpoyan Damai, Kota Pekanbaru, Riau 27511', 0.5042, 101.4491],
  ['RS UMUM HERMINA PEKANBARU', 'Jl. Tuanku Tambusai, Delima, Binawidya, Kota Pekanbaru, Riau 28292', 0.4851, 101.4034],
  ['RS AWAL BROS PANAM - PEKANBARU', 'Jl. HR. Soebrantas No.88, Sialang Munggu, Tuah Madani, Kota Pekanbaru, Riau 28293', 0.4635, 101.3769],
  ['RS AULIA HOSPITAL - PEKANBARU', 'Jl. HR. Soebrantas No.63, Tuah Karya, Tuah Madani, Kota Pekanbaru, Riau 28291', 0.4674, 101.3853],
  ['RS MURNI TEGUH ERIA', 'Jl. KH. Ahmad Dahlan No.163, Kp. Tengah, Sukajadi, Kota Pekanbaru, Riau 28122', 0.5181, 101.4375],
  // Reaktivasi RS Prima Pekanbaru dengan data lama yang dikonfirmasi user.
  // Nama kanonis existing dipertahankan (importer update berdasarkan nama ter-normalisasi).
  ['RS Prima Pekanbaru', 'Jl. Bima No.1, Delima, Kec. Binawidya, Kota Pekanbaru, Riau 28292', 0.49070000, 101.39950000]
].map(([nama_rs, alamat, latitude, longitude]) => ({ nama_rs, alamat, latitude, longitude, is_active: 1 }));

const inactiveNames = [
  'RS 3M PLUS', 'KLINIK HORPINTA MEDICAL CENTER', 'KLINIK UTAMA KUANTAN MEDIKA, KAB. KUANSING', 'RS AMALIA MEDIKA', 'RS AWAL BROS BAGAN BATU', 'RS AWAL BROS DUMAI', 'RS AWAL BROS UJUNG BATU - KAB. ROHUL', 'RS AZ-ZAHRA', 'RS BINA KASIH PEKANBARU', 'RS CAHAYA UJUNG TANJUNG', 'RS EFARINA - PELALAWAN', 'RS GRAHA YASMINE', 'RS IA ATHAYA MEDIKA', 'RS IBNU SINA PEKANBARU', 'RS IBU DAN ANAK ZAINAB - PEKANBARU', 'RS IBUNDA - BAGAN BATU', 'RS KASIH IBU RENGAT', 'RS Mata Pekanbaru Eye Center (PBEC)', 'RS MATA SMEC', 'RS MEDICARE SOREK', 'RS MESRA SIAK HULU KAMPAR - PEKANBARU', 'RS MUIZZAH', 'RS NARAY HOSPITAL', 'RS NURLIMA', 'RS PELITA', 'RS PERMATA HATI DURI', 'RS PERTAMINA DUMAI', 'RS SANSANI - PEKANBARU', 'RS SANTA MARIA - PEKANBARU', 'RS SURYA INSANI - PASIR PANGARAIAN', 'RS TANDUN', 'RS TK IV 01.07.04 PEKANBARU', 'RS UNIV RIAU (UNRI)', 'RSAU dr. Sukirman Lanud Roesmin Nurjadin', 'RSD MADANI KOTA PEKANBARU', 'RBIA ANDINI PEKANBARU', 'RSU INDAH BAGAN BATU', 'RSU MUTIA SARI DURI', 'RSU THURSINA DURI', 'RSUD BANGKINANG', 'RSUD BENGKALIS', 'RSUD DR. RM PRATOMO BAGAN SIAPI API', 'RSUD INDRASARI RENGAT', 'RSUD Kelas D TUALANG', 'RSUD KOTA DUMAI', 'RSUD PETALA BUMI', 'RSUD RAJA MUSA SEI GUNTUNG', 'RSUD ROKAN HULU', 'RSUD SELASIH KABUPATEN PELALAWAN', 'RSUD T. RAFIAN SIAK', 'RSUD TELUK KUANTAN', 'RSUD TENGKU SULUNG', 'UPT BK RSUD KEC. MANDAU D', 'UPT RSUD PEMERINTAH KAF', 'UPTD RSUD PURI HUSADA'
];
// Catatan: entri generik `RS AB HANGTUAH` sengaja tidak diimpor karena `Hangtuah`
// sudah dikonfirmasi sebagai `RS AWAL BROS HANGTUAH` (Jl. Hangtuah No.121).
const inactiveHospitals = inactiveNames.map((nama_rs) => ({ nama_rs, alamat: null, latitude: null, longitude: null, is_active: 0 }));
const hospitals = [...activeHospitals, ...inactiveHospitals];

const officerTargets = [
  { nama: 'Kak Siti', hospitals: ['RS SYAFIRA - PEKANBARU', 'RS EKA HOSPITAL - PEKANBARU', 'RS AWAL BROS - PEKANBARU'] },
  { nama: 'Bang Dimas', hospitals: ['RS AWAL BROS HANGTUAH', 'RS BHAYANGKARA POLDA - RIAU', 'RS PEKANBARU MEDICAL CENTRE'] },
  { nama: 'Pak Ipul', hospitals: ['RS AWAL BROS AHMAD YANI PEKANBARU', 'RSUD ARIFIN ACHMAD - PEKANBARU', 'RS PROF. Dr. TABRANI - PEKANBARU', 'RS UMUM HERMINA PEKANBARU'] },
  { nama: 'Kak Lina', hospitals: ['RS AWAL BROS PANAM - PEKANBARU', 'RS AULIA HOSPITAL - PEKANBARU', 'RS MURNI TEGUH ERIA'] }
];

async function main() {
  if (hospitals.length !== 69 || activeHospitals.length !== 14 || inactiveHospitals.length !== 55) throw new Error('Daftar RS tidak valid.');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.query('SELECT id, nama_rs FROM hospitals');
    const byNormalizedName = new Map(existing.map((row) => [normalizeNamaRs(row.nama_rs), row]));
    let inserted = 0;
    let updated = 0;
    for (const hospital of hospitals) {
      const matched = byNormalizedName.get(normalizeNamaRs(hospital.nama_rs));
      if (matched) {
        updated += 1;
        if (!dryRun) await conn.execute(
          'UPDATE hospitals SET alamat = ?, latitude = ?, longitude = ?, is_active = ?, radius_meter = ? WHERE id = ?',
          [hospital.alamat, hospital.latitude, hospital.longitude, hospital.is_active, RADIUS_METER, matched.id]
        );
      } else {
        inserted += 1;
        if (!dryRun) {
          const [result] = await conn.execute(
            'INSERT INTO hospitals (nama_rs, alamat, latitude, longitude, is_active, radius_meter) VALUES (?, ?, ?, ?, ?, ?)',
            [hospital.nama_rs, hospital.alamat, hospital.latitude, hospital.longitude, hospital.is_active, RADIUS_METER]
          );
          byNormalizedName.set(normalizeNamaRs(hospital.nama_rs), { id: result.insertId, nama_rs: hospital.nama_rs });
        }
      }
    }

    const [officers] = await conn.query('SELECT id, nama FROM officers WHERE is_active = 1');
    const byOfficerName = new Map(officers.map((officer) => [officer.nama.toLowerCase(), officer]));
    for (const target of officerTargets) {
      const officer = byOfficerName.get(target.nama.toLowerCase());
      if (!officer) {
        console.warn(`WARNING: Target officer absent: ${target.nama}. No hospital plotting created.`);
        continue;
      }
      for (const hospitalName of target.hospitals) {
        const hospital = byNormalizedName.get(normalizeNamaRs(hospitalName));
        if (!hospital) throw new Error(`Target hospital missing: ${hospitalName}`);
        if (!dryRun) await conn.execute(
          `INSERT INTO officer_hospitals (officer_id, hospital_id, is_primary, is_active)
           VALUES (?, ?, 1, 1)
           ON DUPLICATE KEY UPDATE is_primary = 1, is_active = 1, ended_at = NULL, assigned_at = NOW()`,
          [officer.id, hospital.id]
        );
      }
    }

    if (dryRun) await conn.rollback(); else await conn.commit();
    console.log(`${dryRun ? 'DRY RUN' : 'IMPORT'}: inserted=${inserted}, updated=${updated}`);
    console.log('Expected managed hospitals: total=69, active=14, inactive=55');
    if (!dryRun) {
      const [currentHospitals] = await conn.query('SELECT nama_rs, is_active FROM hospitals');
      const managedNames = new Set(hospitals.map((hospital) => normalizeNamaRs(hospital.nama_rs)));
      const managed = currentHospitals.filter((hospital) => managedNames.has(normalizeNamaRs(hospital.nama_rs)));
      const active = managed.filter((hospital) => hospital.is_active === 1).length;
      console.log(`Managed hospitals: total=${managed.length}, active=${active}, inactive=${managed.length - active}`);
    }
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { normalizeNamaRs };
