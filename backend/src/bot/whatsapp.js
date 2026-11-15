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
NIK:
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
NIK:
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
 * Normalisasi judul/alias: lowercase, trim, tanda baca/spasi berulang
 * menjadi satu spasi. Dipakai konsisten untuk alias dan canonical name.
 * @param {string} value
 * @returns {string}
 */
function normalizeSubjectTerm(value) {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
 * Muat alias RS aktif dari tabel hospital_aliases.
 * Tabel mungkin belum ada (migration 010 belum diterapkan) -> hasil kosong.
 * @returns {Promise<Array<{hospital_id, alias_normalized, alias_display}>>}
 */
async function loadActiveAliases() {
  try {
    const [rows] = await pool.execute(
      'SELECT hospital_id, alias_normalized, alias_display, is_active FROM hospital_aliases WHERE is_active = 1'
    );
    return rows;
  } catch (err) {
    return [];
  }
}

/**
 * Muat binding JID grup WhatsApp aktif dari tabel hospital_whatsapp_groups.
 * Tabel mungkin belum ada (migration 010 belum diterapkan) -> hasil kosong.
 * @returns {Promise<Array<{hospital_id, group_jid, is_active}>>}
 */
async function loadActiveGroupBindings() {
  try {
    const [rows] = await pool.execute(
      'SELECT hospital_id, group_jid, is_active FROM hospital_whatsapp_groups WHERE is_active = 1'
    );
    return rows;
  } catch (err) {
    return [];
  }
}

async function loadGroupRoutingRules() {
  const [aliases, groupBindings] = await Promise.all([
    loadActiveAliases(),
    loadActiveGroupBindings()
  ]);
  return { aliases, groupBindings };
}

/**
 * Cocokkan nama RS dari judul grup (canonical name, batas kata eksak).
 * Fallback terakhir; nol atau lebih dari satu hasil -> null.
 * @param {string} groupSubject  judul grup WhatsApp
 * @param {Array}  hospitals     hasil loadActiveHospitals()
 * @returns {object|null}  RS yang cocok (tepat satu), atau null
 */
function detectHospitalFromGroup(groupSubject, hospitals) {
  if (!groupSubject) return null;

  const subjectNorm = normalizeSubjectTerm(groupSubject);
  if (!subjectNorm) return null;

  const matches = hospitals.filter((h) => {
    const nameNorm = normalizeSubjectTerm(h.nama_rs);
    if (!nameNorm) return false;
    // Exact substring; pastikan bukan bagian dari kata lain dengan batas spasi/awal/akhir
    const regex = new RegExp(`(?:^|\\s)${nameNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i');
    return regex.test(subjectNorm);
  });

  return matches.length === 1 ? matches[0] : null;
}

/**
 * Resolver RS dari grup WhatsApp dengan urutan deterministik:
 *   1. Binding JID grup aktif yang persis (exact).
 *   2. Alias aktif unik (ter-normalisasi) cocok di judul grup.
 *   3. Fallback canonical group-name existing, hanya bila tepat satu.
 * Nol/ambigu -> null. Tidak pernah fuzzy/LIKE.
 *
 * Alias direpresentasikan sebagai kemunculan alias_normalized dengan batas kata
 * di judul grup ter-normalisasi. Group subject normal: alias `RS Prima` cocok
 * pada judul `JR - RS Prima`.
 *
 * @param {string} groupSubject judul grup WhatsApp
 * @param {string} groupJid     JID grup (mis. 123456789@g.us); opsional
 * @param {Array}  hospitals    hasil loadActiveHospitals()
 * @param {Array}  aliases      [{hospital_id, alias_normalized, is_active}]
 * @param {Array}  groupBindings [{hospital_id, group_jid, is_active}]
 * @returns {object|null} hospital yang ter-resolve, atau null
 */
function resolveHospitalFromGroup(groupSubject, groupJid, hospitals, aliases = [], groupBindings = []) {
  const byId = new Map(hospitals.map((h) => [h.id, h]));
  const activeByHospital = (hospitalId) => byId.get(hospitalId) || null;

  // 1. Binding JID grup aktif yang persis.
  if (groupJid) {
    const jidMatches = groupBindings.filter(
      (b) => b.group_jid === groupJid && b.is_active !== 0
    );
    if (jidMatches.length === 1) {
      const hospital = activeByHospital(jidMatches[0].hospital_id);
      if (hospital) return hospital;
    }
    if (jidMatches.length > 1) return null; // JID unik global; defensif
  }

  // 2. Alias aktif unik pada judul grup ter-normalisasi.
  if (groupSubject) {
    const subjectNorm = normalizeSubjectTerm(groupSubject);
    if (subjectNorm) {
      const aliasMatches = aliases.filter((alias) => {
        if (!alias.alias_normalized || alias.is_active === 0) return false;
        if (!activeByHospital(alias.hospital_id)) return false;
        const aliasNorm = normalizeSubjectTerm(alias.alias_normalized);
        if (!aliasNorm) return false;
        const regex = new RegExp(
          `(?:^|\\s)${aliasNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`,
          'i'
        );
        return regex.test(subjectNorm);
      });
      const uniqueHospitalIds = [...new Set(aliasMatches.map((m) => m.hospital_id))];
      if (uniqueHospitalIds.length === 1) return activeByHospital(uniqueHospitalIds[0]);
      if (uniqueHospitalIds.length > 1) return null; // ambigu, jangan pernah menebak
    }
  }

  // 3. Fallback canonical group-name existing, hanya bila tepat satu.
  return detectHospitalFromGroup(groupSubject, hospitals);
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

  // Parse isi pesan lebih dulu — RS tidak wajib ada di teks karena bisa dari nama grup.
  // Parsing tidak menyentuh DB, jadi pesan invalid langsung ditolak tanpa query.
  const parsed = parseLaporanRS(text, { requireRumahSakit: false });

  if (!parsed || !parsed.isValid) {
    const errorText = parsed && parsed.error
      ? parsed.error
      : 'Format Belum Lengkap.\nNama korban wajib diisi.';
    await sock.sendMessage(jid, {
      text: `${errorText}\nKetik #FORMAT untuk melihat format laporan yang benar.`
    }, { quoted: msg });
    return;
  }

  const hospitals = await loadActiveHospitals();

  // ------------------------------------------------------------- resolve RS
  let resolvedHospital = null;

  // 1. Coba deteksi dari grup: binding JID aktif -> alias unik -> canonical.
  if (isGroup) {
    try {
      const meta = await sock.groupMetadata(jid);
      const { aliases, groupBindings } = await loadGroupRoutingRules();
      resolvedHospital = resolveHospitalFromGroup(
        meta.subject,
        jid,
        hospitals,
        aliases,
        groupBindings
      );
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
    const result = await insertCaseWithRetry({
      ...parsed.data,
      rumah_sakit: resolvedHospital.nama_rs,
      hospital_id: resolvedHospital.id,
      no_pelapor_wa: sender,
      waktu_lapor_wa: now
    }, { autoAssign: true });

    const { tiket, caseId, visitId, assignedOfficer } = result;

    const replySuccess =
      `Laporan berhasil diterima!\n\n` +
      `Nomor Tiket: ${tiket}\n` +
      `Keterjaminan: ${result.case.status_keterjaminan}\n` +
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
  resolveHospitalFromGroup,
  normalizeSubjectTerm,
  loadActiveHospitals,
  loadActiveAliases,
  loadActiveGroupBindings,
  loadGroupRoutingRules,
  getActiveWhatsAppSocket
};
