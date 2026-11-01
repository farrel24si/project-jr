require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const casesRouter = require('./routes/cases');
const visitsRouter = require('./routes/visits');
const { startWhatsAppBot } = require('./bot/whatsapp');

const app = express();
const port = Number(process.env.PORT) || 5000;
const uploadsDir = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use('/api/cases', casesRouter);
app.use('/api/visits', visitsRouter);

app.use((err, req, res, next) => {
  console.error('[API] Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
});

const server = app.listen(port, () => {
  console.log(`[API] Server berjalan di port ${port}`);
});

startWhatsAppBot().catch((err) => {
  console.error('[WA-BOT] Gagal memulai bot WhatsApp:', err);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { app, server };
