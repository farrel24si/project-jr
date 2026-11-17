const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', authorize('kabag'), async (req, res) => {
  try {
    const [users] = await pool.execute(`
      SELECT
        u.id, u.username, u.role, u.is_active, u.last_login_at, u.created_at,
        u.officer_id, o.nama AS nama_petugas, o.nip, o.jabatan
      FROM users u
      LEFT JOIN officers o ON o.id = u.officer_id
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, data: users });
  } catch (err) {
    console.error('[API] GET /users error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data user.' });
  }
});

router.post('/', authorize('kabag'), async (req, res) => {
  try {
    const { username, password, role = 'petugas', officer_id = null } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ success: false, message: 'username dan password wajib diisi.' });
    }

    if (!['kabag', 'petugas'].includes(role)) {
      return res.status(400).json({ success: false, message: 'role harus kabag atau petugas.' });
    }

    if (role === 'petugas' && !officer_id) {
      return res.status(400).json({ success: false, message: 'Akun petugas wajib dihubungkan ke officer_id.' });
    }

    if (officer_id) {
      const [[officer]] = await pool.execute('SELECT id, is_active FROM officers WHERE id = ?', [officer_id]);
      if (!officer || !officer.is_active) {
        return res.status(400).json({ success: false, message: 'Petugas tidak ditemukan atau nonaktif.' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (username, password_hash, role, officer_id) VALUES (?, ?, ?, ?)',
      [username.trim(), passwordHash, role, officer_id || null]
    );

    res.status(201).json({
      success: true,
      data: { id: result.insertId, username: username.trim(), role, officer_id: officer_id || null }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Username sudah digunakan.' });
    }
    console.error('[API] POST /users error:', err);
    res.status(500).json({ success: false, message: 'Gagal membuat user.' });
  }
});

router.put('/:id', authorize('kabag', 'petugas'), async (req, res) => {
  try {
    const { password, role, officer_id, is_active } = req.body || {};
    const userId = req.params.id;
    const isKabag = req.user.role === 'kabag';

    // Petugas hanya boleh mengubah kata sandi akun miliknya sendiri
    if (!isKabag) {
      if (String(req.user.userId) !== String(userId)) {
        return res.status(403).json({ success: false, message: 'Akses ditolak.' });
      }
      if (role !== undefined || officer_id !== undefined || is_active !== undefined) {
        return res.status(403).json({ success: false, message: 'Petugas hanya diizinkan mengubah kata sandi akun sendiri.' });
      }
    }

    const [[existing]] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
    if (!existing) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });

    // Jangan izinkan kabag menonaktifkan akun sendiri
    if (String(req.user.userId) === String(userId) && is_active === false) {
      return res.status(400).json({ success: false, message: 'Tidak dapat menonaktifkan akun sendiri.' });
    }

    if (role !== undefined && !['kabag', 'petugas'].includes(role)) {
      return res.status(400).json({ success: false, message: 'role harus kabag atau petugas.' });
    }

    if (password !== undefined && (typeof password !== 'string' || !password)) {
      return res.status(400).json({ success: false, message: 'password tidak valid.' });
    }

    const effectiveRole = role !== undefined ? role : existing.role;
    const effectiveOfficerId = officer_id !== undefined ? (officer_id || null) : existing.officer_id;

    if (effectiveRole === 'petugas' && !effectiveOfficerId) {
      return res.status(400).json({ success: false, message: 'Akun petugas wajib dihubungkan ke officer_id.' });
    }

    if (officer_id !== undefined && officer_id !== null) {
      const [[officer]] = await pool.execute('SELECT id, is_active FROM officers WHERE id = ?', [officer_id]);
      if (!officer || !officer.is_active) {
        return res.status(400).json({ success: false, message: 'Petugas tidak ditemukan atau nonaktif.' });
      }
    }

    const sets = [];
    const values = [];

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sets.push('password_hash = ?');
      values.push(hash);
    }
    if (role && ['kabag', 'petugas'].includes(role)) {
      sets.push('role = ?');
      values.push(role);
    }
    if (officer_id !== undefined) {
      sets.push('officer_id = ?');
      values.push(officer_id || null);
    }
    if (typeof is_active === 'boolean') {
      sets.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada data yang diubah.' });
    }

    values.push(userId);
    await pool.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, values);

    const [[updated]] = await pool.execute(
      `SELECT u.id, u.username, u.role, u.is_active, u.officer_id, o.nama AS nama_petugas
       FROM users u
       LEFT JOIN officers o ON o.id = u.officer_id
       WHERE u.id = ?`,
      [userId]
    );

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[API] PUT /users/:id error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengubah user.' });
  }
});

// Soft delete
router.delete('/:id', authorize('kabag'), async (req, res) => {
  const userId = req.params.id;
  if (String(req.user.userId) === String(userId)) {
    return res.status(400).json({ success: false, message: 'Tidak dapat menonaktifkan akun sendiri.' });
  }
  try {
    const [result] = await pool.execute('UPDATE users SET is_active = 0 WHERE id = ?', [userId]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    res.json({ success: true, message: 'User dinonaktifkan.' });
  } catch (err) {
    console.error('[API] DELETE /users/:id error:', err);
    res.status(500).json({ success: false, message: 'Gagal menonaktifkan user.' });
  }
});

module.exports = router;
