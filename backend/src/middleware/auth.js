const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET wajib dikonfigurasi pada variabel lingkungan (.env).');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

/**
 * Middleware: verifikasi JWT dari header Authorization: Bearer <token>.
 * Attach decoded payload ke req.user. Cek juga user masih aktif di DB,
 * sehingga akun yang dinonaktifkan tidak bisa memakai token lama.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token tidak ditemukan.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const [[user]] = await pool.execute(
      'SELECT id, role, is_active FROM users WHERE id = ?',
      [decoded.userId]
    );
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Akun tidak aktif atau sudah dihapus.' });
    }
    req.user = { ...decoded, role: user.role };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token sudah kedaluwarsa.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Token tidak valid.' });
    }
    console.error('[AUTH] authenticate error:', err);
    return res.status(500).json({ success: false, message: 'Gagal memverifikasi token.' });
  }
}

/**
 * Middleware factory: hanya izinkan role tertentu.
 * Harus dipasang SETELAH authenticate.
 * @param  {...string} allowedRoles  misal 'kabag'
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Akses ditolak.' });
    }
    next();
  };
}

module.exports = { authenticate, authorize, JWT_SECRET, JWT_EXPIRES_IN };
