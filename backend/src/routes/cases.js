const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { VALID_STATUSES } = require('../bot/parser');
const { insertCaseWithRetry } = require('../services/caseCreation');

const OPTIONAL_FIELDS = [
  'nomor_laporan', 'ruangan_rs', 'nik', 'umur', 'jenis_kelamin', 'alamat',
  'telepon_korban', 'tgl_laka', 'tgl_masuk', 'kronologi',
  'jenis_laka', 'status_kondisi'
];

function validOptionalFields(body) {
  if (body.umur !== undefined && (!Number.isInteger(body.umur) || body.umur < 0)) return false;
  if (body.nik !== undefined && body.nik !== null && !/^\d{16}$/.test(String(body.nik))) return false;
  if (body.jenis_kelamin !== undefined && body.jenis_kelamin !== null && !['Laki-laki', 'Perempuan'].includes(body.jenis_kelamin)) return false;
  if (body.jenis_laka !== undefined && !['Tunggal', 'Tidak Tunggal', 'Belum Diketahui'].includes(body.jenis_laka)) return false;
  if (body.status_kondisi !== undefined && !VALID_STATUSES.includes(body.status_kondisi)) return false;
  return true;
}

// POST /api/cases — input kasus manual, tanpa notifikasi WhatsApp.
router.post('/', authenticate, authorize('kabag', 'petugas'), async (req, res) => {
  try {
    const body = req.body || {};
    const hospitalId = Number(body.hospital_id);
    if (!Number.isInteger(hospitalId) || hospitalId <= 0 || !String(body.nama_korban || '').trim()) {
      return res.status(400).json({ success: false, message: 'hospital_id dan nama_korban wajib diisi.' });
    }
    if (!validOptionalFields(body)) {
      return res.status(422).json({ success: false, message: 'Data kasus tidak sesuai schema.' });
    }

    const [[hospital]] = await pool.execute(
      'SELECT id, nama_rs FROM hospitals WHERE id = ? AND is_active = 1', [hospitalId]
    );
    if (!hospital) {
      return res.status(404).json({ success: false, message: 'Rumah sakit tidak ditemukan atau tidak aktif.' });
    }

    let assignedOfficer = null;
    if (req.user.role === 'petugas') {
      if (!req.user.officerId) {
        return res.status(403).json({ success: false, message: 'Akun petugas tidak terhubung ke data petugas.' });
      }
      const [[plot]] = await pool.execute(
        `SELECT o.id, o.nama, o.telepon
         FROM officer_hospitals oh JOIN officers o ON o.id = oh.officer_id
         WHERE oh.hospital_id = ? AND oh.officer_id = ? AND oh.is_active = 1 AND o.is_active = 1`,
        [hospitalId, req.user.officerId]
      );
      if (!plot) return res.status(403).json({ success: false, message: 'Rumah sakit tidak diplot ke petugas ini.' });
      assignedOfficer = plot;
    }

    const result = await insertCaseWithRetry({
      ...OPTIONAL_FIELDS.reduce((values, field) => ({ ...values, [field]: body[field] }), {}),
      hospital_id: hospital.id,
      rumah_sakit: hospital.nama_rs,
      nama_korban: String(body.nama_korban).trim(),
      waktu_lapor_wa: new Date()
    }, req.user.role === 'kabag' ? { autoAssign: true } : { assignedOfficer });

    res.status(201).json({
      success: true,
      data: { case: result.case, visit: result.visit, assigned_officer: result.assignedOfficer }
    });
  } catch (err) {
    console.error('[API] POST /cases error:', err);
    res.status(500).json({ success: false, message: 'Gagal membuat kasus.' });
  }
});


// PATCH /api/cases/:caseId/referrals/:referralId/assignee — override petugas rujukan oleh Kabag
router.patch('/:caseId/referrals/:referralId/assignee', authenticate, authorize('kabag'), async (req, res) => {
  const caseId = Number(req.params.caseId);
  const referralId = Number(req.params.referralId);
  const officerId = Number(req.body?.officer_id);

  if (!Number.isInteger(caseId) || caseId <= 0 || !Number.isInteger(referralId) || referralId <= 0) {
    return res.status(404).json({ success: false, message: 'Kasus atau rujukan tidak valid.' });
  }

  if (!Number.isInteger(officerId) || officerId <= 0) {
    return res.status(422).json({ success: false, message: 'officer_id wajib dan harus berupa ID valid.' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [[caseData]] = await conn.execute(
      'SELECT id, hospital_id, assigned_officer_id FROM cases WHERE id = ? FOR UPDATE',
      [caseId]
    );
    if (!caseData) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Kasus tidak ditemukan.' });
    }

    const [[referral]] = await conn.execute(
      'SELECT id, case_id, target_hospital_id, previous_officer_id, new_officer_id FROM case_referrals WHERE id = ? AND case_id = ? FOR UPDATE',
      [referralId, caseId]
    );
    if (!referral) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Rujukan tidak ditemukan pada kasus ini.' });
    }

    const [[plot]] = await conn.execute(
      `SELECT o.id, o.nama FROM officer_hospitals oh
       JOIN officers o ON o.id = oh.officer_id
       WHERE oh.hospital_id = ? AND oh.officer_id = ? AND oh.is_active = 1 AND o.is_active = 1`,
      [referral.target_hospital_id, officerId]
    );
    if (!plot) {
      await conn.rollback();
      return res.status(422).json({
        success: false,
        message: 'Petugas tidak memiliki plotting aktif di rumah sakit tujuan rujukan.'
      });
    }

    await conn.execute(
      'UPDATE cases SET assigned_officer_id = ? WHERE id = ?',
      [officerId, caseId]
    );

    await conn.execute(
      'UPDATE case_referrals SET new_officer_id = ? WHERE id = ?',
      [officerId, referralId]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: 'Petugas rujukan berhasil diperbarui.',
      data: {
        case_id: caseId,
        referral_id: referralId,
        assigned_officer: {
          id: plot.id,
          nama: plot.nama
        }
      }
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('[API] PATCH /cases/:caseId/referrals/:referralId/assignee error:', err);
    return res.status(500).json({ success: false, message: 'Gagal memperbarui petugas rujukan.' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/cases — semua kasus (kabag semua, petugas hanya assigned)
router.get('/', authenticate, async (req, res) => {
  try {
    const isKabag = req.user.role === 'kabag';
    const params = [];

    let whereClause = '';
    if (!isKabag) {
      whereClause = 'WHERE c.assigned_officer_id = ?';
      params.push(req.user.officerId);
    }

    const [cases] = await pool.execute(`
      SELECT
        c.id, c.nomor_tiket, c.rumah_sakit, c.hospital_id,
        c.assigned_officer_id, ao.nama AS assigned_officer_nama,
        c.nama_korban, c.nik, c.umur, c.jenis_laka,
        c.status_kondisi, c.waktu_lapor_wa, c.created_at,
        h.nama_rs AS hospital_nama, h.latitude AS hospital_lat, h.longitude AS hospital_lng,
        h.radius_meter AS hospital_radius,
        COUNT(CASE WHEN v.status_kunjungan = 'Menunggu' THEN v.id END) AS tugas_menunggu,
        MIN(CASE WHEN v.status_kunjungan = 'Menunggu' THEN v.jadwal_kunjungan END) AS jadwal_berikutnya,
        CASE
          WHEN MIN(CASE WHEN v.status_kunjungan = 'Menunggu' THEN v.jadwal_kunjungan END) < NOW()
          THEN 1 ELSE 0
        END AS is_overdue
      FROM cases c
      LEFT JOIN hospitals h ON h.id = c.hospital_id
      LEFT JOIN officers ao ON ao.id = c.assigned_officer_id
      LEFT JOIN visits v ON v.case_id = c.id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.waktu_lapor_wa DESC
    `, params);

    res.json({ success: true, data: cases });
  } catch (err) {
    console.error('[API] GET /cases error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data kasus.' });
  }
});

// GET /api/cases/:id — detail satu kasus + visits + hospital + is_overdue
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const isKabag = req.user.role === 'kabag';

    const [[caseData]] = await pool.execute(`
      SELECT c.*,
        h.id AS hospital_db_id, h.nama_rs AS hospital_nama,
        h.alamat AS hospital_alamat,
        h.latitude AS hospital_lat, h.longitude AS hospital_lng,
        h.radius_meter AS hospital_radius,
        ao.nama AS assigned_officer_nama
      FROM cases c
      LEFT JOIN hospitals h ON h.id = c.hospital_id
      LEFT JOIN officers ao ON ao.id = c.assigned_officer_id
      WHERE c.id = ?
    `, [id]);

    if (!caseData) {
      return res.status(404).json({ success: false, message: 'Kasus tidak ditemukan.' });
    }

    // Petugas hanya boleh lihat kasus yang di-assign
    if (!isKabag && String(caseData.assigned_officer_id) !== String(req.user.officerId)) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }

    const [referrals] = await pool.execute(`
      SELECT r.*,
        sh.nama_rs AS source_hospital_nama,
        th.nama_rs AS target_hospital_nama,
        po.nama AS previous_officer_nama,
        no.nama AS new_officer_nama,
        ro.nama AS referred_by_officer_nama
      FROM case_referrals r
      LEFT JOIN hospitals sh ON sh.id = r.source_hospital_id
      LEFT JOIN hospitals th ON th.id = r.target_hospital_id
      LEFT JOIN officers po ON po.id = r.previous_officer_id
      LEFT JOIN officers no ON no.id = r.new_officer_id
      LEFT JOIN officers ro ON ro.id = r.referred_by_officer_id
      WHERE r.case_id = ?
      ORDER BY r.created_at ASC, r.id ASC
    `, [id]);

    const [visits] = await pool.execute(`
      SELECT v.*,
        o.nama AS officer_nama,
        CASE
          WHEN v.status_kunjungan = 'Menunggu' AND v.jadwal_kunjungan < NOW()
          THEN 1 ELSE 0
        END AS is_overdue
      FROM visits v
      LEFT JOIN officers o ON o.id = v.officer_id
      WHERE v.case_id = ?
      ORDER BY v.kunjungan_ke ASC
    `, [id]);

    // Bentuk kontrak hospital sebagai objek terpisah
    const hospital = caseData.hospital_db_id
      ? {
          id: caseData.hospital_db_id,
          nama_rs: caseData.hospital_nama,
          alamat: caseData.hospital_alamat,
          latitude: caseData.hospital_lat,
          longitude: caseData.hospital_lng,
          radius_meter: caseData.hospital_radius
        }
      : null;

    const assignedOfficer = caseData.assigned_officer_id
      ? { id: caseData.assigned_officer_id, nama: caseData.assigned_officer_nama }
      : null;

    // Hapus field duplikat sebelum mengirim objek kasus.
    delete caseData.hospital_db_id;
    delete caseData.hospital_nama;
    delete caseData.hospital_alamat;
    delete caseData.hospital_lat;
    delete caseData.hospital_lng;
    delete caseData.hospital_radius;
    delete caseData.assigned_officer_nama;

    res.json({
      success: true,
      data: { case: caseData, hospital, assigned_officer: assignedOfficer, visits, referrals }
    });
  } catch (err) {
    console.error('[API] GET /cases/:id error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil detail kasus.' });
  }
});

module.exports = router;
