const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'username dan password wajib diisi.' });
  }

  try {
    const [[user]] = await pool.execute(
      `SELECT u.*, o.nama AS nama_petugas
       FROM users u
       LEFT JOIN officers o ON o.id = u.officer_id
       WHERE u.username = ? AND u.is_active = 1
       LIMIT 1`,
      [username]
    );

    if (!user) {
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }

    // Catat waktu login terakhir (non-blocking)
    pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]).catch(() => {});

    const payload = {
      userId: user.id,
      officerId: user.officer_id || null,
      username: user.username,
      role: user.role,
      nama: user.nama_petugas || user.username
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      success: true,
      token,
      user: payload
    });
  } catch (err) {
    console.error('[AUTH] POST /login error:', err);
    res.status(500).json({ success: false, message: 'Gagal memproses login.' });
  }
});

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 */
const { authenticate } = require('../middleware/auth');

router.get('/me', authenticate, async (req, res) => {
  try {
    const [[user]] = await pool.execute(
      `SELECT u.id, u.username, u.role, u.last_login_at,
              o.id AS officer_id, o.nama, o.jabatan, o.wilayah
       FROM users u
       LEFT JOIN officers o ON o.id = u.officer_id
       WHERE u.id = ? AND u.is_active = 1`,
      [req.user.userId]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    }

    res.json({ success: true, data: user });
  } catch (err) {
    console.error('[AUTH] GET /me error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data user.' });
  }
});

module.exports = router;
