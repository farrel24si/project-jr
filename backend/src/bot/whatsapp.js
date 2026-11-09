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
const { parseLaporanRS } = require('./parser');
const { insertCaseWithRetry } = require('../services/caseCreation');
const { notifyNewAssignment } = require('../services/notificationDelivery');

const SESSION_DIR = path.resolve(process.cwd(), 'session_jr_bot');
let activeSocket = null;
let whatsappConnected = false;

// Template #FORMAT dasar — tanpa baris RS karena RS dideteksi dari nama grup.
// Versi dengan baris RS dipakai untuk pesan DM/grup tidak dikenali.
const TEMPLATE_FORMAT_GRUP = `#LAPORLAKA
Nama:
NIK (opsional, 16 digit):
Umur:
Jenis Laka: Tunggal / Tidak Tunggal / Belum Diketahui
Alamat:
Tgl Laka: DD/MM/YYYY
Tgl Masuk: DD/MM/YYYY
Kronologi:
Status: Rawat Inap / Luka Ringan / Luka Berat / Meninggal Dunia / Selesai`;

const TEMPLATE_FORMAT_DM = `#LAPORLAKA
RS: (nama rumah sakit sesuai daftar)
Nama:
NIK (opsional, 16 digit):
Umur:
Jenis Laka: Tunggal / Tidak Tunggal / Belum Diketahui
Alamat:
Tgl Laka: DD/MM/YYYY
Tgl Masuk: DD/MM/YYYY
Kronologi:
Status: Rawat Inap / Luka Ringan / Luka Berat / Meninggal Dunia / Selesai`;

function extractText(message) {
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    ''
  );
}

/**
 * Muat seluruh RS aktif dari DB, urutkan nama terpanjang ke terpendek
 * untuk menghindari substring match yang terlalu pendek.
 * @returns {Promise<Array<{id, nama_rs, latitude, longitude, radius_meter}>>}
 */
async function loadActiveHospitals() {
  const [rows] = await pool.execute(
    'SELECT id, nama_rs, alamat, latitude, longitude, radius_meter FROM hospitals WHERE is_active = 1'
  );
  return rows.sort((a, b) => b.nama_rs.length - a.nama_rs.length);
}

/**
 * Cocokkan nama RS dari judul grup.
 * @param {string} groupSubject  judul grup WhatsApp
 * @param {Array}  hospitals     hasil loadActiveHospitals()
 * @returns {object|null}  RS yang cocok (tepat satu), atau null
 */
function detectHospitalFromGroup(groupSubject, hospitals) {
  if (!groupSubject) return null;

  const subjectNorm = groupSubject.trim().toLowerCase().replace(/\s+/g, ' ');
  const matches = hospitals.filter((h) => {
    const nameNorm = h.nama_rs.trim().toLowerCase().replace(/\s+/g, ' ');
    // Exact substring; pastikan bukan bagian dari kata lain dengan batas spasi/awal/akhir
    const regex = new RegExp(`(?:^|\\s)${nameNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i');
    return regex.test(subjectNorm);
  });

  return matches.length === 1 ? matches[0] : null;
}

async function handleMessage(sock, msg) {
  if (!msg.message || msg.key.fromMe) return;

  const jid = msg.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  const text = extractText(msg.message).trim();
  if (!text) return;

  const lowerText = text.toLowerCase();

  // ------------------------------------------------------------------ #FORMAT
  if (lowerText === '#format') {
    const template = isGroup ? TEMPLATE_FORMAT_GRUP : TEMPLATE_FORMAT_DM;
    await sock.sendMessage(jid, { text: template }, { quoted: msg });
    return;
  }

  // --------------------------------------------------------------- #LAPORLAKA
  if (!lowerText.includes('#laporlaka')) return;

  const hospitals = await loadActiveHospitals();

  // Parse isi pesan lebih dulu — RS tidak wajib ada di teks karena bisa dari nama grup.
  const parsed = parseLaporanRS(text, { requireRumahSakit: false });

  if (!parsed || !parsed.isValid) {
    await sock.sendMessage(jid, {
      text:
        'Format Belum Lengkap.\n' +
        'Nama korban wajib diisi.\n' +
        'Ketik #FORMAT untuk melihat format laporan yang benar.'
    }, { quoted: msg });
    return;
  }

  // ------------------------------------------------------------- resolve RS
  let resolvedHospital = null;

  // 1. Coba deteksi dari nama grup
  if (isGroup) {
    try {
      const meta = await sock.groupMetadata(jid);
      resolvedHospital = detectHospitalFromGroup(meta.subject, hospitals);
    } catch (metaErr) {
      console.warn('[WA-BOT] Gagal baca metadata grup:', metaErr.message);
    }
  }

  // 2. Baris RS: di pesan dipakai bila grup tidak memberi hasil,
  //    atau sebagai konfirmasi bila hasilnya sama.
  const namaFromMsg = parsed.data.rumah_sakit
    ? parsed.data.rumah_sakit.trim().toLowerCase().replace(/\s+/g, ' ')
    : null;

  if (namaFromMsg) {
    const matchFromMsg = hospitals.find(
      (h) => h.nama_rs.trim().toLowerCase().replace(/\s+/g, ' ') === namaFromMsg
    );

    if (!matchFromMsg) {
      const namaRS = hospitals.map((h) => `• ${h.nama_rs}`).join('\n');
      await sock.sendMessage(jid, {
        text:
          `RS "${parsed.data.rumah_sakit}" tidak terdaftar atau tidak aktif.\n` +
          `RS yang terdaftar:\n${namaRS}`
      }, { quoted: msg });
      return;
    }

    if (resolvedHospital && matchFromMsg.id !== resolvedHospital.id) {
      await sock.sendMessage(jid, {
        text:
          `RS di pesan (${matchFromMsg.nama_rs}) berbeda dengan RS grup (${resolvedHospital.nama_rs}).\n` +
          'Hapus baris RS: dari pesan atau sesuaikan dengan nama grup.'
      }, { quoted: msg });
      return;
    }

    resolvedHospital = matchFromMsg;
  }

  // 3. Tidak ada RS dari grup maupun pesan → tolak, tampilkan daftar RS valid
  if (!resolvedHospital) {
    const namaRS = hospitals.map((h) => `• ${h.nama_rs}`).join('\n');
    await sock.sendMessage(jid, {
      text:
        'RS tidak diketahui. Pastikan nama grup memuat salah satu nama RS berikut,\n' +
        'atau tambahkan baris "RS: <nama rumah sakit>" di dalam laporan:\n' +
        namaRS
    }, { quoted: msg });
    return;
  }

  const sender = msg.key.participant || msg.key.remoteJid;
  const now = new Date();

  try {
    const { tiket, caseId, visitId, assignedOfficer } = await insertCaseWithRetry({
      ...parsed.data,
      rumah_sakit: resolvedHospital.nama_rs,
      hospital_id: resolvedHospital.id,
      no_pelapor_wa: sender,
      waktu_lapor_wa: now
    }, { autoAssign: true });

    const replySuccess =
      `Laporan berhasil diterima!\n\n` +
      `Nomor Tiket: ${tiket}\n` +
      `Nama Korban: ${parsed.data.nama_korban}\n` +
      `RS: ${resolvedHospital.nama_rs}\n` +
      `Status: ${parsed.data.status_kondisi}\n` +
      `Batas Waktu Kunjungan ke-1: 72 jam ke depan.\n\n` +
      (assignedOfficer
        ? `Petugas: ${assignedOfficer.nama}`
        : 'Belum ada petugas yang di-plotting untuk RS ini. Kabag akan menugaskan segera.');

    await sock.sendMessage(jid, { text: replySuccess }, { quoted: msg });

    // Kirim notifikasi DM ke petugas yang ditugaskan (jika ada petugas ter-assign)
    if (assignedOfficer && assignedOfficer.telepon) {
      notifyNewAssignment(sock, {
        caseId,
        visitId,
        officerId: assignedOfficer.officer_id,
        officerName: assignedOfficer.nama,
        officerPhone: assignedOfficer.telepon,
        ticket: tiket,
        victimName: parsed.data.nama_korban,
        hospitalName: resolvedHospital.nama_rs,
        condition: parsed.data.status_kondisi,
        scheduledAt: new Date(now.getTime() + 72 * 3600 * 1000)
      }).catch((notifyErr) => {
        console.error('[WA-BOT] Gagal kirim notifikasi DM ke petugas:', notifyErr.message);
      });
    }
  } catch (dbErr) {
    console.error('[WA-BOT] Gagal menyimpan laporan:', dbErr);
    await sock.sendMessage(jid, {
      text:
        'Mohon maaf, terjadi kendala saat memproses laporan Anda ke sistem. ' +
        'Silakan coba beberapa saat lagi atau hubungi administrator.'
    }, { quoted: msg });
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
  activeSocket = sock;
  whatsappConnected = false;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n[WA-BOT] Scan QR code berikut untuk login WhatsApp:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      if (activeSocket === sock) {
        whatsappConnected = false;
        activeSocket = null;
      }
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(
        `[WA-BOT] Koneksi terputus (status: ${statusCode}). Reconnect: ${shouldReconnect}`
      );
      if (shouldReconnect) {
        startWhatsAppBot().catch((err) => {
          console.error('[WA-BOT] Gagal reconnect:', err.message);
        });
      } else {
        clearSession();
        console.log('[WA-BOT] Sesi WhatsApp sudah logout. Jalankan ulang server untuk tampilkan QR baru.');
      }
    } else if (connection === 'open') {
      if (activeSocket === sock) whatsappConnected = true;
      console.log('[WA-BOT] WhatsApp bot berhasil terhubung.');
    } else if (connection === 'connecting' && activeSocket === sock) {
      whatsappConnected = false;
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

function getActiveWhatsAppSocket() {
  return whatsappConnected && activeSocket ? activeSocket : null;
}

module.exports = {
  startWhatsAppBot,
  handleMessage,
  detectHospitalFromGroup,
  loadActiveHospitals,
  getActiveWhatsAppSocket
};
