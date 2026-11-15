require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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
const uploadsDir = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// Socket WA aktif diakses rute via req.app.get('waSocket'); getter dipanggil
// per request agar reconnect memakai socket terbaru.
app.set('waSocket', getActiveWhatsAppSocket);

app.use(cors());
app.use(express.json());
app.use('/uploads', evidenceRouter);
app.use('/api/health', createHealthRouter());
app.use('/api/auth', authRouter);
app.use('/api/hospitals', hospitalsRouter);
app.use('/api/officers', officersRouter);
app.use('/api/users', usersRouter);
app.use('/api/cases', casesRouter);
app.use('/api/visits', visitsRouter);

app.use((err, req, res, next) => {
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
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { app, server };
