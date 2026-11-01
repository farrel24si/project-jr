const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { parseLaporanRS, generateNomorTiket } = require('./parser');

const SESSION_DIR = path.resolve(process.cwd(), 'session_jr_bot');

const TEMPLATE_FORMAT = `#LAPORLAKA
RS: RS Syafira
Nama: 
NIK: 
Umur: 
Alamat: 
Tgl Laka: 
Tgl Masuk: 
Kronologi: 
Status: Rawat Inap`;

function extractText(message) {
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    ''
  );
}

async function insertCaseWithRetry(payload, maxRetry = 5) {
  let attempt = 0;
  while (attempt < maxRetry) {
    attempt += 1;
    const tiket = generateNomorTiket();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [caseResult] = await conn.execute(
        `INSERT INTO cases (
          nomor_tiket, rumah_sakit, nama_korban, nik, umur, alamat,
          tgl_laka, tgl_masuk, kronologi, status_kondisi, no_pelapor_wa, waktu_lapor_wa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tiket,
          payload.rumah_sakit,
          payload.nama_korban,
          payload.nik,
          payload.umur,
          payload.alamat,
          payload.tgl_laka,
          payload.tgl_masuk,
          payload.kronologi,
          payload.status_kondisi,
          payload.no_pelapor_wa,
          payload.waktu_lapor_wa
        ]
      );

      const caseId = caseResult.insertId;

      await conn.execute(
        `INSERT INTO visits (
          case_id, kunjungan_ke, jadwal_kunjungan, status_kunjungan
        ) VALUES (?, 1, DATE_ADD(?, INTERVAL 24 HOUR), 'Menunggu')`,
        [caseId, payload.waktu_lapor_wa]
      );

      await conn.commit();
      return { tiket, caseId };
    } catch (err) {
      await conn.rollback();
      if (err && err.code === 'ER_DUP_ENTRY' && attempt < maxRetry) {
        continue;
      }
      throw err;
    } finally {
      conn.release();
    }
  }
  throw new Error('Gagal membuat tiket unik setelah beberapa percobaan.');
}

async function handleMessage(sock, msg) {
  if (!msg.message || msg.key.fromMe) return;

  const jid = msg.key.remoteJid;
  const text = extractText(msg.message).trim();
  if (!text) return;

  const lowerText = text.toLowerCase();

  if (lowerText === '#format') {
    await sock.sendMessage(jid, { text: TEMPLATE_FORMAT }, { quoted: msg });
    return;
  }

  if (lowerText.includes('#laporlaka')) {
    const parsed = parseLaporanRS(text);

    if (!parsed || !parsed.isValid) {
      const errText =
        'Format Belum Lengkap.\n' +
        'Nama wajib diisi dan NIK harus tepat 16 digit.\n' +
        'Ketik #FORMAT untuk melihat format pengisian yang benar.';
      await sock.sendMessage(jid, { text: errText }, { quoted: msg });
      return;
    }

    const sender = msg.key.participant || msg.key.remoteJid;
    const now = new Date();

    try {
      const { tiket } = await insertCaseWithRetry({
        ...parsed.data,
        no_pelapor_wa: sender,
        waktu_lapor_wa: now
      });

      const replySuccess =
        `Laporan berhasil diterima!\n\n` +
        `Nomor Tiket: ${tiket}\n` +
        `Nama Korban: ${parsed.data.nama_korban}\n` +
        `RS: ${parsed.data.rumah_sakit}\n` +
        `Status: ${parsed.data.status_kondisi}\n` +
        `Batas Waktu Kunjungan ke-1: 24 jam ke depan.\n\n` +
        `Petugas akan segera ditugaskan untuk melakukan verifikasi.`;

      await sock.sendMessage(jid, { text: replySuccess }, { quoted: msg });
    } catch (dbErr) {
      console.error('[WA-BOT] Gagal menyimpan laporan:', dbErr);
      const replyError =
        'Mohon maaf, terjadi kendala saat memproses laporan Anda ke sistem. ' +
        'Silakan coba beberapa saat lagi atau hubungi administrator.';
      await sock.sendMessage(jid, { text: replyError }, { quoted: msg });
    }
  }
}

function clearSession() {
  try {
    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      console.log('[WA-BOT] Folder sesi lama dihapus otomatis.');
    }
  } catch (err) {
    console.error('[WA-BOT] Gagal hapus folder sesi:', err);
  }
}

async function startWhatsAppBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n[WA-BOT] Scan QR code berikut untuk login WhatsApp:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(
        `[WA-BOT] Koneksi terputus (status: ${statusCode}). Reconnect: ${shouldReconnect}`
      );
      if (shouldReconnect) {
        startWhatsAppBot();
      } else {
        clearSession();
        console.log('[WA-BOT] Sesi WhatsApp sudah logout. Jalankan ulang server untuk tampilkan QR baru.');
      }
    } else if (connection === 'open') {
      console.log('[WA-BOT] WhatsApp bot berhasil terhubung.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await handleMessage(sock, msg);
      } catch (err) {
        console.error('[WA-BOT] Error saat menangani pesan:', err);
      }
    }
  });

  return sock;
}

module.exports = { startWhatsAppBot, handleMessage };
