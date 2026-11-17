const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authenticate, JWT_SECRET, JWT_EXPIRES_IN } = require('../middleware/auth');

const router = express.Router();

// Rate limiter sederhana per IP untuk mencegah brute-force login (maks 15 gagal / 15 menit)
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 15;
const failedLoginMap = new Map();

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function checkLoginRateLimit(ip, now = Date.now()) {
  const entry = failedLoginMap.get(ip);
  if (!entry) return { blocked: false };
  if (now - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
    failedLoginMap.delete(ip);
    return { blocked: false };
  }
  return { blocked: entry.count >= MAX_FAILED_ATTEMPTS };
}

function recordFailedLogin(ip, now = Date.now()) {
  if (failedLoginMap.size > 5000) {
    for (const [k, v] of failedLoginMap.entries()) {
      if (now - v.firstAttemptAt > LOGIN_WINDOW_MS) failedLoginMap.delete(k);
    }
  }
  const entry = failedLoginMap.get(ip);
  if (!entry || now - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
    failedLoginMap.set(ip, { count: 1, firstAttemptAt: now });
  } else {
    entry.count += 1;
  }
}

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const rateStatus = checkLoginRateLimit(ip);
    if (rateStatus.blocked) {
      return res.status(429).json({
        success: false,
        message: 'Terlalu banyak percobaan login gagal. Silakan coba lagi beberapa saat.'
      });
    }

    const { username, password } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ success: false, message: 'username dan password wajib diisi.' });
    }

    const cleanInput = username.trim();
    const emailPrefix = cleanInput.toLowerCase().endsWith('@jasaraharja.co.id')
      ? cleanInput.split('@')[0]
      : cleanInput;

    const [[user]] = await pool.execute(
      `SELECT u.*, o.nama AS nama_petugas, o.email AS officer_email, o.telepon AS officer_telepon, o.nip AS officer_nip
       FROM users u
       LEFT JOIN officers o ON o.id = u.officer_id
       WHERE (u.username = ? OR u.username = ? OR LOWER(o.email) = LOWER(?))
         AND u.is_active = 1
       ORDER BY (u.username = ?) DESC, u.id ASC
       LIMIT 1`,
      [cleanInput, emailPrefix, cleanInput, cleanInput]
    );

    if (!user) {
      recordFailedLogin(ip);
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      recordFailedLogin(ip);
      return res.status(401).json({ success: false, message: 'Username atau password salah.' });
    }

    failedLoginMap.delete(ip);

    // Catat waktu login terakhir (non-blocking)
    pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]).catch(() => {});

    const payload = {
      userId: user.id,
      officerId: user.officer_id || null,
      username: user.username,
      role: user.role,
      nama: user.nama_petugas || user.username,
      email: user.officer_email || null,
      telepon: user.officer_telepon || null,
      nip: user.officer_nip || null
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
 * POST /api/auth/logout
 * Endpoint logout untuk kompatibilitas frontend (stateless JWT)
 */
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logout berhasil.' });
});

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const [[user]] = await pool.execute(
      `SELECT u.id, u.username, u.role, u.last_login_at,
              o.id AS officer_id, o.nama, o.nip, o.jabatan, o.wilayah, o.telepon, o.email
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
