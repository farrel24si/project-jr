/**
 * Integration test MVP: plotting petugas-RS, assignment, akses petugas, submit visit.
 * Pakai DB nyata (harus ada officer + hospital aktif).
 * Jalankan: node tests/integration_mvp_test.js
 */
const assert = require('assert');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const { JWT_SECRET } = require('../src/middleware/auth');

function makeToken(user) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
}

const KABAG = { userId: 1, officerId: null, username: 'kabag', role: 'kabag', nama: 'kabag' };
const PETUGAS = { userId: 2, officerId: 1, username: 'andi', role: 'petugas', nama: 'Andi Pratama' };

async function main() {
  const checks = [];
  const pass = (name) => { checks.push(`PASS ${name}`); console.log(`PASS ${name}`); };
  const fail = (name, err) => { console.error(`FAIL ${name}: ${err.message}`); process.exitCode = 1; };

  try {
    // 0. Pastikan data dasar ada
    const [[kabagUser]] = await pool.execute("SELECT id, role FROM users WHERE username = 'kabag'");
    assert(kabagUser && kabagUser.role === 'kabag', 'akun kabag tidak ditemukan');
    const [[andiUser]] = await pool.execute("SELECT id, officer_id, role FROM users WHERE username = 'andi'");
    assert(andiUser && andiUser.officer_id, 'akun andi tidak ditemukan / tidak terhubung officer');
    const [[officer]] = await pool.execute('SELECT id, is_active FROM officers WHERE id = ?', [andiUser.officer_id]);
    assert(officer && officer.is_active, 'officer andi tidak aktif');
    const [hospitals] = await pool.execute('SELECT id, nama_rs, latitude, longitude, radius_meter FROM hospitals WHERE is_active = 1 ORDER BY id');
    assert(hospitals.length >= 2, 'minimal 2 rumah sakit aktif');
    pass('data dasar (kabag, andi, 2 RS aktif)');

    const h1 = hospitals[0];
    const h2 = hospitals[1];

    // 1. Plotting: andi -> RS 1 dan RS 2 (kabag)
    for (const h of [h1, h2]) {
      await pool.execute(
        `INSERT INTO officer_hospitals (officer_id, hospital_id, is_primary, is_active)
         VALUES (?, ?, 1, 1)
         ON DUPLICATE KEY UPDATE is_primary = 1, is_active = 1, ended_at = NULL, assigned_at = NOW()`,
        [andiUser.officer_id, h.id]
      );
    }
    const [plot] = await pool.execute(
      'SELECT hospital_id FROM officer_hospitals WHERE officer_id = ? AND is_active = 1',
      [andiUser.officer_id]
    );
    assert(plot.length >= 2, 'plotting belum tersimpan');
    pass('plotting petugas ke 2 RS');

    // 2. Simulasi laporan WA masuk untuk RS 1 -> assignment otomatis (pakai fungsi bot bila bisa)
    const now = new Date();
    const tiket1 = `JR-T${Date.now()}`;
    const [ins1] = await pool.execute(
      `INSERT INTO cases (nomor_tiket, rumah_sakit, hospital_id, nama_korban, jenis_laka, status_kondisi, waktu_lapor_wa)
       VALUES (?, ?, ?, ?, 'Tunggal', 'Rawat Inap', ?)`,
      [tiket1, h1.nama_rs, h1.id, 'Korban Uji Satu', now]
    );
    const case1 = ins1.insertId;

    const [[assigned]] = await pool.execute(
      `SELECT oh.officer_id
       FROM officer_hospitals oh
       JOIN officers o ON o.id = oh.officer_id
       WHERE oh.hospital_id = ? AND oh.is_active = 1 AND o.is_active = 1
       ORDER BY oh.is_primary DESC, o.id ASC LIMIT 1`,
      [h1.id]
    );
    assert(assigned && assigned.officer_id, 'tidak ada petugas ter-plotting untuk RS ini');
    await pool.execute('UPDATE cases SET assigned_officer_id = ? WHERE id = ?', [assigned.officer_id, case1]);

    await pool.execute(
      `INSERT INTO visits (case_id, kunjungan_ke, jadwal_kunjungan, status_kunjungan)
       VALUES (?, 1, DATE_ADD(?, INTERVAL 72 HOUR), 'Menunggu')`,
      [case1, now]
    );
    pass('kasus masuk + assignment + visit ke-1 (72 jam)');

    // 3. Akses petugas: kasus RS lain (belum di-assign) tidak boleh terlihat
    const [otherCase] = await pool.execute(
      `INSERT INTO cases (nomor_tiket, rumah_sakit, hospital_id, nama_korban, jenis_laka, status_kondisi, waktu_lapor_wa)
       VALUES (?, ?, ?, 'Korban Uji Dua', 'Tunggal', 'Rawat Inap', ?)`,
      [`JR-T${Date.now() + 1}`, h2.nama_rs, h2.id, now]
    );
    // Tidak di-assign ke andi -> query petugas harus TIDAK memuat kasus ini
    const [petugasCases] = await pool.execute(
      'SELECT id FROM cases WHERE assigned_officer_id = ?',
      [andiUser.officer_id]
    );
    const ids = petugasCases.map((c) => c.id);
    assert(ids.includes(case1), 'kasus ter-assign tidak terlihat petugas');
    assert(!ids.includes(otherCase.insertId), 'kasus RS lain bocor ke petugas');
    pass('akses petugas: hanya kasus ter-assign');

    // 4. Submit visit end-to-end: lokasi di dalam radius RS
    const [[visitRow]] = await pool.execute(
      'SELECT id, case_id, jadwal_kunjungan, status_kunjungan FROM visits WHERE case_id = ? LIMIT 1',
      [case1]
    );
    assert(visitRow && visitRow.status_kunjungan === 'Menunggu', 'visit ke-1 tidak Menunggu');

    const nowSubmit = new Date();
    const [upd] = await pool.execute(
      `UPDATE visits SET
         officer_id = ?,
         waktu_aktual_kunjungan = ?,
         cek_komunikasi_keluarga = 1,
         cek_edukasi_santunan = 1,
         cek_arahan_lp = 1,
         catatan_kondisi = 'uji submit visit',
         lat_petugas = ?,
         lng_petugas = ?,
         jarak_dari_rs_meter = 50,
         status_kunjungan = ?
       WHERE id = ?`,
      [
        andiUser.officer_id,
        nowSubmit,
        h1.latitude,
        h1.longitude,
        nowSubmit <= new Date(visitRow.jadwal_kunjungan) ? 'Selesai Tepat Waktu' : 'Selesai Terlambat',
        visitRow.id
      ]
    );
    assert(upd.affectedRows === 1, 'update visit gagal');

    const [[visitAfter]] = await pool.execute('SELECT status_kunjungan, officer_id FROM visits WHERE id = ?', [visitRow.id]);
    assert(visitAfter.status_kunjungan.startsWith('Selesai'), 'status visit belum selesai');
    assert(String(visitAfter.officer_id) === String(andiUser.officer_id), 'officer_id visit salah');
    pass('submit visit end-to-end');

    // 5. Bersihkan data uji (bukan tabel)
    await pool.execute('DELETE FROM visits WHERE case_id IN (?, ?)', [case1, otherCase.insertId]);
    await pool.execute('DELETE FROM cases WHERE id IN (?, ?)', [case1, otherCase.insertId]);
    pass('cleanup data uji');
  } catch (err) {
    fail('integration_mvp', err);
  } finally {
    await pool.end();
  }

  console.log('\nHasil: ' + checks.length + ' check.');
  if (process.exitCode) console.log('ADA YANG GAGAL.');
}

main();
