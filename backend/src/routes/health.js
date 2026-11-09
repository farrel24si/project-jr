const express = require('express');
const defaultPool = require('../config/db');

function createHealthRouter({ pool = defaultPool, getUptimeSeconds = () => process.uptime(), now = () => new Date() } = {}) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const serverTime = now().toISOString();
    const uptimeSeconds = Math.floor(getUptimeSeconds());

    try {
      await pool.execute('SELECT 1 AS connected');
      return res.status(200).json({
        success: true,
        data: {
          status: 'ok',
          database: 'connected',
          server_time: serverTime,
          uptime_seconds: uptimeSeconds
        }
      });
    } catch (err) {
      console.error('[API] Health check database error:', err.message);
      return res.status(503).json({
        success: false,
        data: {
          status: 'unhealthy',
          database: 'disconnected',
          server_time: serverTime,
          uptime_seconds: uptimeSeconds
        }
      });
    }
  });

  return router;
}

module.exports = { createHealthRouter };
