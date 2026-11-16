require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pool = require('./config/db');
const casesRouter = require('./routes/cases');
const visitsRouter = require('./routes/visits');
const authRouter = require('./routes/auth');
const hospitalsRouter = require('./routes/hospitals');
const officersRouter = require('./routes/officers');
const usersRouter = require('./routes/users');
const evidenceRouter = require('./routes/evidence');
const { createHealthRouter } = require('./routes/health');
const { startWhatsAppBot, getActiveWhatsAppSocket } = require('./bot/whatsapp');
const { startNotificationScheduler } = require('./services/notificationScheduler');

const app = express();
const port = Number(process.env.PORT) || 5000;
const uploadsDir = path.resolve(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// Socket WA aktif diakses rute via req.app.get('waSocket'); getter dipanggil
// per request agar reconnect memakai socket terbaru.
app.set('waSocket', getActiveWhatsAppSocket);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : '*';
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '100kb' }));
app.use('/uploads', evidenceRouter);
app.use('/api/health', createHealthRouter());
app.use('/api/auth', authRouter);
app.use('/api/hospitals', hospitalsRouter);
app.use('/api/officers', officersRouter);
app.use('/api/users', usersRouter);
app.use('/api/cases', casesRouter);
app.use('/api/visits', visitsRouter);

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Format JSON pada request body tidak valid.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Ukuran payload request terlalu besar.' });
  }
  console.error('[API] Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
});

const server = app.listen(port, () => {
  console.log(`[API] Server berjalan di port ${port}`);
});

let reminderScheduler = null;

startWhatsAppBot()
  .then(() => {
    // Getter dipanggil tiap scan agar reconnect WhatsApp memakai socket terbaru.
    reminderScheduler = startNotificationScheduler(getActiveWhatsAppSocket, {
      intervalMs: 15 * 60 * 1000,
      runImmediately: true
    });
  })
  .catch((err) => {
    console.error('[WA-BOT] Gagal memulai bot WhatsApp:', err);
  });

function shutdown() {
  if (reminderScheduler && typeof reminderScheduler.stop === 'function') {
    reminderScheduler.stop();
  }
  server.close(async () => {
    try {
      await pool.end();
    } catch (_) {}
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { app, server };
