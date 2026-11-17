const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const OFFICER_FIELDS = ['nama', 'nip', 'jabatan', 'wilayah', 'telepon', 'email'];

function pickOfficerPayload(body) {
  const payload = {};
  if (!body || typeof body !== 'object') return payload;
  for (const field of OFFICER_FIELDS) {
    if (body[field] !== undefined) {
      if (body[field] !== null && typeof body[field] !== 'string') {
        payload[field] = String(body[field]).trim();
      } else {
        const value = typeof body[field] === 'string' ? body[field].trim() : body[field];
        payload[field] = value === '' ? null : value;
      }
    }
  }
  return payload;
}

// Semua role boleh melihat daftar petugas aktif (dibutuhkan untuk assignment).
// Hanya kabag yang boleh melihat yang nonaktif.
router.get('/', authenticate, async (req, res) => {
  try {
    const includeInactive = req.user.role === 'kabag' && req.query.include_inactive === 'true';
    const [officers] = await pool.execute(
      `SELECT o.*, u.username, u.role, u.is_active AS akun_aktif
       FROM officers o
       LEFT JOIN users u ON u.officer_id = o.id
       ${includeInactive ? '' : 'WHERE o.is_active = 1'}
       ORDER BY o.nama ASC`
    );
    res.json({ success: true, data: officers });
  } catch (err) {
    console.error('[API] GET /officers error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data petugas.' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const [[officer]] = await pool.execute(
      `SELECT o.*, u.username, u.role, u.is_active AS akun_aktif
       FROM officers o
       LEFT JOIN users u ON u.officer_id = o.id
       WHERE o.id = ?`,
      [req.params.id]
    );
    if (!officer) return res.status(404).json({ success: false, message: 'Petugas tidak ditemukan.' });
    res.json({ success: true, data: officer });
  } catch (err) {
    console.error('[API] GET /officers/:id error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data petugas.' });
  }
});

router.post('/', authenticate, authorize('kabag'), async (req, res) => {
  try {
    const payload = pickOfficerPayload(req.body);
    if (!payload.nama) {
      return res.status(400).json({ success: false, message: 'nama petugas wajib diisi.' });
    }
    const [result] = await pool.execute(
      'INSERT INTO officers (nama, nip, jabatan, wilayah, telepon, email) VALUES (?, ?, ?, ?, ?, ?)',
      [payload.nama, payload.nip || null, payload.jabatan || null, payload.wilayah || null,
        payload.telepon || null, payload.email || null]
    );
    const [[officer]] = await pool.execute('SELECT * FROM officers WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: officer });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'NIP atau email petugas sudah terdaftar.' });
    }
    console.error('[API] POST /officers error:', err);
    res.status(500).json({ success: false, message: 'Gagal menambah petugas.' });
  }
});

router.put('/:id', authenticate, authorize('kabag', 'petugas'), async (req, res) => {
  let conn;
  try {
    const body = req.body || {};
    const isKabag = req.user.role === 'kabag';

    // Petugas hanya boleh memperbarui data kontak/profil dirinya sendiri, tidak boleh mengubah status aktif
    if (!isKabag) {
      if (!req.user.officerId || String(req.user.officerId) !== String(req.params.id) || body.is_active !== undefined) {
        return res.status(403).json({ success: false, message: 'Akses ditolak.' });
      }
    }

    const payload = pickOfficerPayload(body);
    if (Object.keys(payload).length === 0 && typeof body.is_active !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Tidak ada field yang diubah.' });
    }
    if (payload.nama !== undefined && !payload.nama) {
      return res.status(400).json({ success: false, message: 'nama petugas tidak boleh kosong.' });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [[existing]] = await conn.execute('SELECT id FROM officers WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Petugas tidak ditemukan.' });
    }

    const setClauses = [];
    const values = [];
    for (const [field, value] of Object.entries(payload)) {
      setClauses.push(`${field} = ?`);
      values.push(value);
    }
    if (typeof body.is_active === 'boolean') {
      setClauses.push('is_active = ?');
      values.push(body.is_active ? 1 : 0);
    }
    values.push(req.params.id);

    await conn.execute(`UPDATE officers SET ${setClauses.join(', ')} WHERE id = ?`, values);

    // Petugas dinonaktifkan -> akun login-nya ikut dinonaktifkan secara atomik.
    if (body.is_active === false) {
      await conn.execute('UPDATE users SET is_active = 0 WHERE officer_id = ?', [req.params.id]);
    }

    const [[officer]] = await conn.execute('SELECT * FROM officers WHERE id = ?', [req.params.id]);
    await conn.commit();
    res.json({ success: true, data: officer });
  } catch (err) {
    if (conn) await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'NIP atau email petugas sudah terdaftar.' });
    }
    console.error('[API] PUT /officers error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengubah data petugas.' });
  } finally {
    if (conn) conn.release();
  }
});

// Soft delete: riwayat kunjungan tetap valid.
router.delete('/:id', authenticate, authorize('kabag'), async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [result] = await conn.execute('UPDATE officers SET is_active = 0 WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Petugas tidak ditemukan.' });
    }
    await conn.execute('UPDATE users SET is_active = 0 WHERE officer_id = ?', [req.params.id]);
    await conn.commit();
    res.json({ success: true, message: 'Petugas dinonaktifkan.' });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('[API] DELETE /officers error:', err);
    res.status(500).json({ success: false, message: 'Gagal menonaktifkan petugas.' });
  } finally {
    if (conn) conn.release();
  }
});

// ---------------------------------------------------------------------------
// Plotting petugas ke rumah sakit (MVP)
// ---------------------------------------------------------------------------

// GET /api/officers/:id/hospitals — daftar RS tanggung jawab petugas
router.get('/:id/hospitals', authenticate, async (req, res) => {
  try {
    const [[officer]] = await pool.execute(
      'SELECT id, is_active FROM officers WHERE id = ?',
      [req.params.id]
    );
    if (!officer) {
      return res.status(404).json({ success: false, message: 'Petugas tidak ditemukan.' });
    }

    const [rows] = await pool.execute(
      `SELECT oh.hospital_id, oh.is_primary, oh.assigned_at, oh.is_active,
              h.nama_rs, h.alamat
       FROM officer_hospitals oh
       JOIN hospitals h ON h.id = oh.hospital_id
       WHERE oh.officer_id = ? AND oh.is_active = 1
       ORDER BY oh.is_primary DESC, h.nama_rs ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[API] GET /officers/:id/hospitals error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil daftar rumah sakit petugas.' });
  }
});

// POST /api/officers/:officerId/hospitals — hubungkan petugas ke RS
router.post('/:officerId/hospitals', authenticate, authorize('kabag'), async (req, res) => {
  try {
    const { hospital_id, is_primary = false } = req.body || {};
    const officerId = req.params.officerId;
    const parsedHospitalId =
      hospital_id !== '' && hospital_id !== null && typeof hospital_id !== 'boolean' && !Array.isArray(hospital_id)
        ? Number(hospital_id)
        : NaN;

    if (!Number.isInteger(parsedHospitalId) || parsedHospitalId <= 0) {
      return res.status(400).json({ success: false, message: 'hospital_id wajib diisi dengan angka.' });
    }

    const [[officer]] = await pool.execute(
      'SELECT id, is_active FROM officers WHERE id = ?',
      [officerId]
    );
    if (!officer || !officer.is_active) {
      return res.status(404).json({ success: false, message: 'Petugas tidak ditemukan atau nonaktif.' });
    }

    const [[hospital]] = await pool.execute(
      'SELECT id, is_active FROM hospitals WHERE id = ?',
      [parsedHospitalId]
    );
    if (!hospital || !hospital.is_active) {
      return res.status(404).json({ success: false, message: 'Rumah sakit tidak ditemukan atau nonaktif.' });
    }

    // Re-aktifkan relasi lama bila pernah ada, selain itu buat baru.
    const [result] = await pool.execute(
      `INSERT INTO officer_hospitals (officer_id, hospital_id, is_primary, is_active)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         is_primary = VALUES(is_primary),
         is_active = 1,
         ended_at = NULL,
         assigned_at = NOW()`,
      [officerId, parsedHospitalId, is_primary ? 1 : 0]
    );

    const [[row]] = await pool.execute(
      `SELECT oh.*, h.nama_rs
       FROM officer_hospitals oh
       JOIN hospitals h ON h.id = oh.hospital_id
       WHERE oh.officer_id = ? AND oh.hospital_id = ?`,
      [officerId, parsedHospitalId]
    );
    res.status(result.affectedRows === 1 ? 201 : 200).json({ success: true, data: row });
  } catch (err) {
    console.error('[API] POST /officers/:officerId/hospitals error:', err);
    res.status(500).json({ success: false, message: 'Gagal menghubungkan petugas ke rumah sakit.' });
  }
});

// DELETE /api/officers/:officerId/hospitals/:hospitalId — nonaktifkan relasi
router.delete('/:officerId/hospitals/:hospitalId', authenticate, authorize('kabag'), async (req, res) => {
  try {
    const [result] = await pool.execute(
      `UPDATE officer_hospitals
       SET is_active = 0, ended_at = NOW()
       WHERE officer_id = ? AND hospital_id = ? AND is_active = 1`,
      [req.params.officerId, req.params.hospitalId]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Relasi petugas-rumah sakit tidak ditemukan.' });
    }
    res.json({ success: true, message: 'Petugas dilepas dari rumah sakit.' });
  } catch (err) {
    console.error('[API] DELETE /officers/:officerId/hospitals error:', err);
    res.status(500).json({ success: false, message: 'Gagal melepas petugas dari rumah sakit.' });
  }
});

module.exports = router;
