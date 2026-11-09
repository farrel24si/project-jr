const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pool = require('../config/db');
const { haversine } = require('../utils/geo');
const { VALID_STATUSES } = require('../bot/parser');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const uploadDir = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // Ekstensi diturunkan dari MIME yang sudah lolos whitelist, bukan dari nama file klien.
    const ext = ALLOWED_IMAGE_TYPES[file.mimetype] || '.bin';
    cb(null, `VISIT_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES[file.mimetype]) return cb(null, true);
    cb(new Error('File foto_bukti harus berupa JPG, PNG, atau WebP.'));
  }
});

function parseBoolean(value) {
  return String(value).toLowerCase() === 'true';
}

function deleteUploadedFile(file) {
  if (file?.path) {
    fs.unlink(file.path, () => {});
  }
}

router.post('/:visitId/submit', authenticate, upload.single('foto_bukti'), async (req, res) => {
  const { visitId } = req.params;
  const body = req.body;
  let conn;

  try {
    if (req.user.role !== 'petugas' || !req.user.officerId) {
      deleteUploadedFile(req.file);
      return res.status(403).json({
        success: false,
        message: 'Hanya akun petugas yang terhubung ke data petugas dapat submit kunjungan.'
      });
    }
    const lat = Number(body.lat_petugas);
    const lng = Number(body.lng_petugas);

    if (!body.case_id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      deleteUploadedFile(req.file);
      return res.status(400).json({
        success: false,
        message: 'case_id, lat_petugas, dan lng_petugas wajib diisi dengan nilai valid.'
      });
    }

    if (
      body.status_kondisi_terbaru &&
      !VALID_STATUSES.includes(body.status_kondisi_terbaru)
    ) {
      deleteUploadedFile(req.file);
      return res.status(422).json({
        success: false,
        message: 'status_kondisi_terbaru tidak valid.'
      });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [[visit]] = await conn.execute(
      'SELECT * FROM visits WHERE id = ? FOR UPDATE',
      [visitId]
    );

    if (!visit) {
      await conn.rollback();
      deleteUploadedFile(req.file);
      return res.status(404).json({ success: false, message: 'Kunjungan tidak ditemukan.' });
    }

    if (String(visit.case_id) !== String(body.case_id)) {
      await conn.rollback();
      deleteUploadedFile(req.file);
      return res.status(400).json({ success: false, message: 'case_id tidak cocok dengan kunjungan.' });
    }

    if (visit.status_kunjungan !== 'Menunggu') {
      await conn.rollback();
      deleteUploadedFile(req.file);
      return res.status(409).json({ success: false, message: 'Kunjungan ini sudah selesai.' });
    }

    const [[caseData]] = await conn.execute(
      'SELECT * FROM cases WHERE id = ? FOR UPDATE',
      [visit.case_id]
    );

    if (!caseData) {
      await conn.rollback();
      deleteUploadedFile(req.file);
      return res.status(404).json({ success: false, message: 'Kasus tidak ditemukan.' });
    }

    if (String(caseData.assigned_officer_id) !== String(req.user.officerId)) {
      await conn.rollback();
      deleteUploadedFile(req.file);
      return res.status(403).json({ success: false, message: 'Kasus ini tidak ditugaskan kepada Anda.' });
    }

    const [[hospital]] = caseData.hospital_id
      ? await conn.execute('SELECT * FROM hospitals WHERE id = ? AND is_active = 1 LIMIT 1', [caseData.hospital_id])
      : [null];

    if (!hospital) {
      await conn.rollback();
      deleteUploadedFile(req.file);
      return res.status(422).json({ success: false, message: 'Master rumah sakit kasus belum valid/aktif; kunjungan tidak dapat disubmit.' });
    }

    // Hospital sudah divalidasi aktif di atas — hitung jarak selalu.
    const jarakDariRs = Math.round(
      haversine(lat, lng, Number(hospital.latitude), Number(hospital.longitude))
    );

    const isOutsideHospitalRadius = jarakDariRs > hospital.radius_meter;

    // GPS dapat meleset di dalam gedung; catat penyimpangan sebagai alert, bukan blokir submit.
    const verificationAlert = isOutsideHospitalRadius
      ? `Lokasi GPS berada di luar radius RS (jarak ${jarakDariRs} meter, batas ${hospital.radius_meter} meter). Perlu verifikasi manual.`
      : null;

    const isReferral = body.status_kondisi_terbaru === 'Dirujuk ke RS Lain';
    let targetHospital = null;
    let targetOfficer = null;
    const targetHospitalId = Number(body.rujukan_hospital_id);
    if (isReferral) {
      if (!Number.isInteger(targetHospitalId) || targetHospitalId <= 0) {
        await conn.rollback();
        deleteUploadedFile(req.file);
        return res.status(422).json({ success: false, message: 'rujukan_hospital_id wajib untuk rujukan.' });
      }
      if (targetHospitalId === Number(caseData.hospital_id)) {
        await conn.rollback();
        deleteUploadedFile(req.file);
        return res.status(422).json({ success: false, message: 'Rumah sakit rujukan harus berbeda.' });
      }
      [[targetHospital]] = await conn.execute(
        'SELECT id, nama_rs FROM hospitals WHERE id = ? AND is_active = 1 FOR UPDATE', [targetHospitalId]
      );
      if (!targetHospital) {
        await conn.rollback();
        deleteUploadedFile(req.file);
        return res.status(422).json({ success: false, message: 'Rumah sakit rujukan tidak ditemukan atau tidak aktif.' });
      }
      [[targetOfficer]] = await conn.execute(
        `SELECT o.id, o.nama FROM officer_hospitals oh
         JOIN officers o ON o.id = oh.officer_id
         WHERE oh.hospital_id = ? AND oh.is_active = 1 AND o.is_active = 1
         ORDER BY oh.is_primary DESC,
           (SELECT COUNT(*) FROM cases c WHERE c.assigned_officer_id = o.id) ASC,
           o.id ASC LIMIT 1`, [targetHospitalId]
      );
    }

    const now = new Date();
    const statusSla = now <= new Date(visit.jadwal_kunjungan)
      ? 'Selesai Tepat Waktu'
      : 'Selesai Terlambat';
    const fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    await conn.execute(
      `UPDATE visits SET
        officer_id = ?,
        waktu_aktual_kunjungan = ?,
        cek_komunikasi_keluarga = ?,
        cek_edukasi_santunan = ?,
        cek_arahan_lp = ?,
        catatan_kondisi = ?,
        foto_bukti_url = ?,
        lat_petugas = ?,
        lng_petugas = ?,
        jarak_dari_rs_meter = ?,
        status_kunjungan = ?
      WHERE id = ?`,
      [
        req.user.officerId,
        now,
        parseBoolean(body.cek_komunikasi_keluarga),
        parseBoolean(body.cek_edukasi_santunan),
        parseBoolean(body.cek_arahan_lp),
        body.catatan_kondisi || null,
        fotoUrl,
        lat,
        lng,
        jarakDariRs,
        statusSla,
        visitId
      ]
    );

    const statusTerbaru = body.status_kondisi_terbaru || caseData.status_kondisi;
    if (isReferral) {
      await conn.execute(
        `UPDATE cases SET hospital_id = ?, rumah_sakit = ?, status_kondisi = ?, assigned_officer_id = ? WHERE id = ?`,
        [targetHospital.id, targetHospital.nama_rs, statusTerbaru, targetOfficer?.id || null, caseData.id]
      );
      const [history] = await conn.execute(
        `INSERT INTO case_referrals
         (case_id, source_hospital_id, target_hospital_id, previous_officer_id, new_officer_id,
          referred_by_officer_id, alasan_rujukan, catatan_rujukan)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [caseData.id, caseData.hospital_id, targetHospital.id, caseData.assigned_officer_id,
          targetOfficer?.id || null, req.user.officerId, body.alasan_rujukan || null, body.catatan_rujukan || null]
      );
      if (!['Meninggal Dunia', 'Sudah Pulang', 'Selesai'].includes(statusTerbaru)) {
        await conn.execute(
          `INSERT INTO visits (case_id, kunjungan_ke, jadwal_kunjungan, status_kunjungan)
           VALUES (?, ?, DATE_ADD(?, INTERVAL 72 HOUR), 'Menunggu')`,
          [caseData.id, visit.kunjungan_ke + 1, now]
        );
      }
      caseData.referralId = history.insertId;
    } else {
      if (body.status_kondisi_terbaru) {
        await conn.execute('UPDATE cases SET status_kondisi = ? WHERE id = ?', [statusTerbaru, caseData.id]);
      }
      if (!['Selesai', 'Meninggal Dunia'].includes(statusTerbaru)) {
        await conn.execute(
          `INSERT INTO visits (case_id, kunjungan_ke, jadwal_kunjungan, status_kunjungan)
           VALUES (?, ?, DATE_ADD(?, INTERVAL 3 DAY), 'Menunggu')`,
          [caseData.id, visit.kunjungan_ke + 1, now]
        );
      }
    }

    await conn.commit();
    res.json({
      success: true,
      message: isOutsideHospitalRadius
        ? 'Kunjungan berhasil disubmit dengan catatan lokasi di luar radius RS.'
        : 'Kunjungan berhasil disubmit.',
      status_sla: statusSla,
      jarak_dari_rs_meter: jarakDariRs,
      hospital_radius_meter: hospital.radius_meter,
      is_outside_hospital_radius: isOutsideHospitalRadius,
      verification_alert: verificationAlert,
      ...(isReferral ? { referral: {
        id: caseData.referralId,
        target_hospital_id: targetHospital.id,
        assigned_officer: targetOfficer ? { id: targetOfficer.id, nama: targetOfficer.nama } : null,
        unassigned: !targetOfficer
      } } : {})
    });
  } catch (err) {
    if (conn) await conn.rollback();
    deleteUploadedFile(req.file);
    console.error('[API] POST /visits/:visitId/submit error:', err);
    res.status(500).json({ success: false, message: 'Gagal menyimpan kunjungan.' });
  } finally {
    if (conn) conn.release();
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'Ukuran foto maksimal 5 MB.' });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
});

module.exports = router;
