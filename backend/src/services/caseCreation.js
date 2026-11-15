const pool = require('../config/db');
const { generateNomorTiket } = require('../bot/parser');

/**
 * Mapping otomatis status keterjaminan dari jenis laka (aturan Jasa Raharja):
 *   'Tidak Tunggal' -> 'Terjamin JR'
 *   'Tunggal'       -> 'Dialihkan ke BPJS'
 *   selain itu      -> 'Belum Dikonfirmasi'
 * @param {string|null|undefined} jenisLaka
 * @returns {string}
 */
function mapKeterjaminanFromJenisLaka(jenisLaka) {
  if (jenisLaka === 'Tidak Tunggal') return 'Terjamin JR';
  if (jenisLaka === 'Tunggal') return 'Dialihkan ke BPJS';
  return 'Belum Dikonfirmasi';
}

async function findOfficerForHospital(conn, hospitalId) {
  if (!hospitalId) return null;
  const [[officer]] = await conn.execute(
    `SELECT oh.officer_id, o.nama, o.telepon
     FROM officer_hospitals oh
     JOIN officers o ON o.id = oh.officer_id
     WHERE oh.hospital_id = ? AND oh.is_active = 1 AND o.is_active = 1
     ORDER BY oh.is_primary DESC,
       (SELECT COUNT(*) FROM cases c WHERE c.assigned_officer_id = o.id) ASC,
       o.id ASC
     LIMIT 1`,
    [hospitalId]
  );
  return officer || null;
}

async function insertCaseWithRetry(payload, options = {}, maxRetry = 5) {
  let attempt = 0;
  while (attempt < maxRetry) {
    attempt += 1;
    const tiket = generateNomorTiket();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let officer = null;
      if (options.assignedOfficer) {
        officer = options.assignedOfficer;
      } else if (options.autoAssign) {
        officer = await findOfficerForHospital(conn, payload.hospital_id);
      }

      const assignedOfficerId = officer ? (officer.officer_id || officer.id) : null;

      const [caseResult] = await conn.execute(
        `INSERT INTO cases (
          nomor_tiket, nomor_laporan, rumah_sakit, hospital_id, ruangan_rs,
          nama_korban, nik, umur, jenis_kelamin, alamat, telepon_korban,
          tgl_laka, tgl_masuk, kronologi, jenis_laka, status_kondisi,
          status_keterjaminan, no_gl, tgl_gl,
          no_pelapor_wa, waktu_lapor_wa, assigned_officer_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tiket,
          payload.nomor_laporan || null,
          payload.rumah_sakit,
          payload.hospital_id || null,
          payload.ruangan_rs || null,
          payload.nama_korban,
          payload.nik || null,
          payload.umur !== undefined && payload.umur !== null ? payload.umur : null,
          payload.jenis_kelamin || null,
          payload.alamat || null,
          payload.telepon_korban || null,
          payload.tgl_laka || null,
          payload.tgl_masuk || null,
          payload.kronologi || null,
          payload.jenis_laka || 'Belum Diketahui',
          payload.status_kondisi || 'Rawat Inap',
          payload.status_keterjaminan || mapKeterjaminanFromJenisLaka(payload.jenis_laka || 'Belum Diketahui'),
          payload.no_gl || null,
          payload.tgl_gl || null,
          payload.no_pelapor_wa || null,
          payload.waktu_lapor_wa,
          assignedOfficerId
        ]
      );

      const caseId = caseResult.insertId;

      const [visitResult] = await conn.execute(
        `INSERT INTO visits (
          case_id, kunjungan_ke, jadwal_kunjungan, status_kunjungan
        ) VALUES (?, 1, DATE_ADD(?, INTERVAL 72 HOUR), 'Menunggu')`,
        [caseId, payload.waktu_lapor_wa]
      );
      const visitId = visitResult.insertId;

      const [[caseRow]] = await conn.execute('SELECT * FROM cases WHERE id = ?', [caseId]);
      const [[visitRow]] = await conn.execute('SELECT * FROM visits WHERE id = ?', [visitId]);

      await conn.commit();
      return {
        tiket,
        caseId,
        visitId,
        assignedOfficer: officer ? {
          id: officer.officer_id || officer.id,
          officer_id: officer.officer_id || officer.id,
          nama: officer.nama,
          telepon: officer.telepon || null
        } : null,
        case: caseRow,
        visit: visitRow
      };
    } catch (err) {
      await conn.rollback();
      if (err && err.code === 'ER_DUP_ENTRY' && attempt < maxRetry) {
        continue;
      }
      throw err;
    } finally {
      conn.release();
    }
  }
  throw new Error('Gagal membuat tiket unik setelah beberapa percobaan.');
}

module.exports = {
  mapKeterjaminanFromJenisLaka,
  findOfficerForHospital,
  insertCaseWithRetry
};
