const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pool = require('../config/db');
const { haversine } = require('../utils/geo');
const { VALID_STATUSES } = require('../bot/parser');

const router = express.Router();
const uploadDir = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `VISIT_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('File foto_bukti harus berupa gambar.'));
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

router.post('/:visitId/submit', upload.single('foto_bukti'), async (req, res) => {
  const { visitId } = req.params;
  const body = req.body;
  let conn;

  try {
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

    const [[hospital]] = await conn.execute(
      'SELECT * FROM hospitals WHERE nama_rs = ? LIMIT 1',
      [caseData.rumah_sakit]
    );

    let jarakDariRs = null;
    let warning;
    if (hospital) {
      jarakDariRs = Math.round(
        haversine(lat, lng, Number(hospital.latitude), Number(hospital.longitude))
      );
      if (jarakDariRs > hospital.radius_meter) {
        await conn.rollback();
        deleteUploadedFile(req.file);
        return res.status(422).json({
          success: false,
          message: `Lokasi petugas berada di luar radius RS. Jarak ${jarakDariRs} meter, batas ${hospital.radius_meter} meter.`,
          jarak_dari_rs_meter: jarakDariRs
        });
      }
    } else {
      warning = `Data koordinat untuk ${caseData.rumah_sakit} tidak ditemukan. Validasi radius dilewati.`;
    }

    const now = new Date();
    const statusSla = now <= new Date(visit.jadwal_kunjungan)
      ? 'Selesai Tepat Waktu'
      : 'Selesai Terlambat';
    const fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    await conn.execute(
      `UPDATE visits SET
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
    if (body.status_kondisi_terbaru) {
      await conn.execute('UPDATE cases SET status_kondisi = ? WHERE id = ?', [
        statusTerbaru,
        caseData.id
      ]);
    }

    if (!['Selesai', 'Meninggal Dunia'].includes(statusTerbaru)) {
      await conn.execute(
        `INSERT INTO visits (case_id, kunjungan_ke, jadwal_kunjungan, status_kunjungan)
         VALUES (?, ?, DATE_ADD(?, INTERVAL 3 DAY), 'Menunggu')`,
        [caseData.id, visit.kunjungan_ke + 1, now]
      );
    }

    await conn.commit();
    res.json({
      success: true,
      message: 'Kunjungan berhasil disubmit.',
      status_sla: statusSla,
      jarak_dari_rs_meter: jarakDariRs,
      ...(warning ? { warning } : {})
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
