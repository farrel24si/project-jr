const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
const isNumber = (value) =>
  value !== '' &&
  value !== null &&
  value !== undefined &&
  typeof value !== 'boolean' &&
  !Array.isArray(value) &&
  Number.isFinite(Number(value));

function isValidHospitalCoords(latitude, longitude, radiusMeter) {
  if (!isNumber(latitude) || !isNumber(longitude) || !isNumber(radiusMeter)) return false;
  const lat = Number(latitude);
  const lng = Number(longitude);
  const rad = Number(radiusMeter);
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && rad > 0;
}

router.get('/', authenticate, async (req, res) => {
  try {
    const includeInactive = req.user.role === 'kabag' && req.query.include_inactive === 'true';
    const [hospitals] = await pool.execute(
      `SELECT id, nama_rs, alamat, latitude, longitude, radius_meter, is_active, created_at, updated_at
       FROM hospitals ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY nama_rs ASC`
    );
    res.json({ success: true, data: hospitals });
  } catch (err) {
    console.error('[API] GET /hospitals error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data rumah sakit.' });
  }
});

router.post('/', authenticate, authorize('kabag'), async (req, res) => {
  try {
    const { nama_rs, alamat = null, latitude, longitude, radius_meter = 200 } = req.body || {};
    if (
      typeof nama_rs !== 'string' ||
      !nama_rs.trim() ||
      !isValidHospitalCoords(latitude, longitude, radius_meter)
    ) {
      return res.status(400).json({ success: false, message: 'nama_rs, latitude, longitude, dan radius_meter wajib valid.' });
    }
    const [result] = await pool.execute(
      'INSERT INTO hospitals (nama_rs, alamat, latitude, longitude, radius_meter) VALUES (?, ?, ?, ?, ?)',
      [nama_rs.trim(), alamat || null, Number(latitude), Number(longitude), Math.round(Number(radius_meter))]
    );
    const [[hospital]] = await pool.execute('SELECT * FROM hospitals WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: hospital });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Nama rumah sakit sudah terdaftar.' });
    console.error('[API] POST /hospitals error:', err);
    res.status(500).json({ success: false, message: 'Gagal menambah rumah sakit.' });
  }
});

router.put('/:id', authenticate, authorize('kabag'), async (req, res) => {
  try {
    const { nama_rs, alamat = null, latitude, longitude, radius_meter, is_active } = req.body || {};
    if (
      typeof nama_rs !== 'string' ||
      !nama_rs.trim() ||
      !isValidHospitalCoords(latitude, longitude, radius_meter)
    ) {
      return res.status(400).json({ success: false, message: 'nama_rs, latitude, longitude, dan radius_meter wajib valid.' });
    }
    const [result] = await pool.execute(
      `UPDATE hospitals SET nama_rs = ?, alamat = ?, latitude = ?, longitude = ?, radius_meter = ?,
       is_active = COALESCE(?, is_active) WHERE id = ?`,
      [nama_rs.trim(), alamat || null, Number(latitude), Number(longitude), Math.round(Number(radius_meter)),
        typeof is_active === 'boolean' ? is_active : null, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Rumah sakit tidak ditemukan.' });
    const [[hospital]] = await pool.execute('SELECT * FROM hospitals WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: hospital });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Nama rumah sakit sudah terdaftar.' });
    console.error('[API] PUT /hospitals error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengubah rumah sakit.' });
  }
});

router.delete('/:id', authenticate, authorize('kabag'), async (req, res) => {
  try {
    const [result] = await pool.execute('UPDATE hospitals SET is_active = 0 WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Rumah sakit tidak ditemukan.' });
    res.json({ success: true, message: 'Rumah sakit dinonaktifkan.' });
  } catch (err) {
    console.error('[API] DELETE /hospitals error:', err);
    res.status(500).json({ success: false, message: 'Gagal menonaktifkan rumah sakit.' });
  }
});

module.exports = router;
