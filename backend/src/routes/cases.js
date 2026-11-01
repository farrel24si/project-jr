const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
  try {
    const [cases] = await pool.execute(`
      SELECT
        c.*,
        COUNT(v.id) AS tugas_menunggu,
        MIN(v.jadwal_kunjungan) AS jadwal_berikutnya
      FROM cases c
      LEFT JOIN visits v ON v.case_id = c.id AND v.status_kunjungan = 'Menunggu'
      GROUP BY c.id
      ORDER BY c.waktu_lapor_wa DESC
    `);

    res.json({ success: true, data: cases });
  } catch (err) {
    console.error('[API] GET /cases error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data kasus.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [[caseData]] = await pool.execute(
      'SELECT * FROM cases WHERE id = ?',
      [id]
    );

    if (!caseData) {
      return res.status(404).json({ success: false, message: 'Kasus tidak ditemukan.' });
    }

    const [visits] = await pool.execute(
      'SELECT * FROM visits WHERE case_id = ? ORDER BY kunjungan_ke ASC',
      [id]
    );

    res.json({ success: true, data: { case: caseData, visits } });
  } catch (err) {
    console.error('[API] GET /cases/:id error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil detail kasus.' });
  }
});

module.exports = router;
