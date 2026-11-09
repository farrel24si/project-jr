const express = require('express');
const path = require('path');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const uploadsDir = path.resolve(process.cwd(), 'uploads');

router.get('/:filename', authenticate, async (req, res) => {
  const filename = path.basename(req.params.filename);
  if (filename !== req.params.filename) {
    return res.status(400).json({ success: false, message: 'Nama file tidak valid.' });
  }

  try {
    const [[visit]] = await pool.execute(
      `SELECT v.foto_bukti_url, c.assigned_officer_id
       FROM visits v
       JOIN cases c ON c.id = v.case_id
       WHERE v.foto_bukti_url = ?
       LIMIT 1`,
      [`/uploads/${filename}`]
    );

    if (!visit) {
      return res.status(404).json({ success: false, message: 'Bukti foto tidak ditemukan.' });
    }
    if (req.user.role !== 'kabag' && String(visit.assigned_officer_id) !== String(req.user.officerId)) {
      return res.status(403).json({ success: false, message: 'Akses bukti foto ditolak.' });
    }

    res.set('X-Content-Type-Options', 'nosniff');
    return res.sendFile(filename, { root: uploadsDir }, (err) => {
      if (err && !res.headersSent) {
        if (err.code === 'ENOENT') return res.status(404).json({ success: false, message: 'Bukti foto tidak ditemukan.' });
        console.error('[API] GET /uploads/:filename error:', err);
        return res.status(500).json({ success: false, message: 'Gagal membuka bukti foto.' });
      }
    });
  } catch (err) {
    console.error('[API] GET /uploads/:filename error:', err);
    return res.status(500).json({ success: false, message: 'Gagal membuka bukti foto.' });
  }
});

module.exports = router;
