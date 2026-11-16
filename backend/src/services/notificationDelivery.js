const pool = require('../config/db');
const {
  normalizeWhatsAppNumber,
  buildWhatsAppJid,
  buildNewAssignmentMessage,
  determineReminderType,
  buildReminderMessage
} = require('./notifications');

async function reserveNotification({ caseId, visitId, officerId, type, phone, text }) {
  const leaseTimeoutMinutes = 10;
  try {
    const [result] = await pool.query(
      `INSERT INTO notification_logs (
        case_id, visit_id, officer_id, notification_type, phone_number,
        message_preview, delivery_status, reserved_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NOW())`,
      [caseId, visitId, officerId, type, phone, text.slice(0, 500)]
    );
    return result.affectedRows === 1;
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
    // Boleh klaim ulang HANYA jika:
    // 1. Status sebelumnya FAILED, ATAU
    // 2. Status PENDING tapi lease sudah kedaluwarsa (> 10 menit, tanda crash/hung)
    const [result] = await pool.query(
      `UPDATE notification_logs
       SET delivery_status = 'PENDING',
           phone_number = ?,
           message_preview = ?,
           error_message = NULL,
           reserved_at = NOW()
       WHERE case_id = ? AND visit_id = ? AND officer_id = ? AND notification_type = ?
         AND (
           delivery_status = 'FAILED'
           OR (delivery_status = 'PENDING' AND (reserved_at IS NULL OR reserved_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)))
         )`,
      [phone, text.slice(0, 500), caseId, visitId, officerId, type, leaseTimeoutMinutes]
    );
    return result.affectedRows === 1;
  }
}

async function finishNotification({ caseId, visitId, officerId, type, status, error }) {
  await pool.query(
    `UPDATE notification_logs
     SET delivery_status = ?, sent_at = ?, error_message = ?
     WHERE case_id = ? AND visit_id = ? AND officer_id = ? AND notification_type = ?
       AND delivery_status = 'PENDING'`,
    [status, status === 'SENT' ? new Date() : null, error ? error.slice(0, 450) : null,
      caseId, visitId, officerId, type]
  );
}

/**
 * Kirim pesan WhatsApp melalui Baileys socket atau client custom.
 * @param {object} sock Baileys socket (punya sendMessage)
 * @param {string} jid
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function sendWhatsAppText(sock, jid, text) {
  if (!sock || typeof sock.sendMessage !== 'function') {
    throw new Error('WhatsApp socket tidak tersedia atau belum terhubung.');
  }
  await sock.sendMessage(jid, { text });
  return true;
}

/**
 * Kirim DM notifikasi penugasan baru ke petugas, catat ke notification_logs.
 * Idempotent berdasarkan unique key (case_id, visit_id, officer_id, notification_type).
 *
 * @param {object} sock Baileys socket (opsional, jika null hanya catat / skip kirim)
 * @param {object} payload
 * @param {number} payload.caseId
 * @param {number} payload.visitId
 * @param {number} payload.officerId
 * @param {string} payload.officerName
 * @param {string} payload.officerPhone
 * @param {string} payload.ticket
 * @param {string} payload.victimName
 * @param {string} payload.hospitalName
 * @param {string} payload.condition
 * @param {Date|string} payload.scheduledAt
 * @param {object} options
 * @param {boolean} options.dryRun jika true, tidak benar-benar kirim ke WA (untuk test)
 * @returns {Promise<{delivered: boolean, skipped: boolean, reason?: string}>}
 */
async function notifyNewAssignment(sock, payload, options = {}) {
  const dryRun = options.dryRun === true;

  if (!payload.caseId || !payload.visitId || !payload.officerId) {
    return { delivered: false, skipped: true, reason: 'caseId, visitId, dan officerId wajib ada.' };
  }

  const phone = normalizeWhatsAppNumber(payload.officerPhone);
  if (!phone) {
    try {
      await pool.query(
        `INSERT INTO notification_logs (
          case_id, visit_id, officer_id, notification_type, phone_number,
          message_preview, delivery_status, reserved_at, error_message, sent_at
        ) VALUES (?, ?, ?, 'NEW_ASSIGNMENT', ?, ?, 'FAILED', NULL, 'Nomor telepon petugas tidak valid', NULL)
        ON DUPLICATE KEY UPDATE
          phone_number = VALUES(phone_number),
          message_preview = VALUES(message_preview),
          delivery_status = 'FAILED',
          reserved_at = NULL,
          error_message = VALUES(error_message),
          sent_at = NULL`,
        [
          payload.caseId,
          payload.visitId,
          payload.officerId,
          payload.officerPhone || '-',
          `Tugas baru: ${payload.ticket} - ${payload.victimName}`
        ]
      );
    } catch (e) {
      console.error('[NOTIFICATION] Gagal catat nomor petugas tidak valid:', e.message);
    }
    return { delivered: false, skipped: true, reason: 'Nomor WhatsApp petugas tidak valid.' };
  }

  const text = buildNewAssignmentMessage({
    officerName: payload.officerName,
    ticket: payload.ticket,
    victimName: payload.victimName,
    hospitalName: payload.hospitalName,
    condition: payload.condition,
    scheduledAt: payload.scheduledAt
  });

  if (!dryRun && process.env.ENABLE_WHATSAPP_NOTIFICATIONS !== 'true') {
    return { delivered: false, skipped: true, reason: 'Notifikasi WhatsApp dinonaktifkan.' };
  }

  const reserved = await reserveNotification({
    caseId: payload.caseId,
    visitId: payload.visitId,
    officerId: payload.officerId,
    type: 'NEW_ASSIGNMENT',
    phone,
    text
  });

  if (!reserved) {
    return { delivered: true, skipped: true, reason: 'Sudah pernah terkirim atau sedang diproses proses lain.' };
  }

  if (dryRun) {
    await finishNotification({
      caseId: payload.caseId,
      visitId: payload.visitId,
      officerId: payload.officerId,
      type: 'NEW_ASSIGNMENT',
      status: 'SENT'
    });
    return { delivered: true, skipped: false, dryRun: true };
  }

  const jid = buildWhatsAppJid(phone);
  try {
    await sendWhatsAppText(sock, jid, text);
    await finishNotification({
      caseId: payload.caseId,
      visitId: payload.visitId,
      officerId: payload.officerId,
      type: 'NEW_ASSIGNMENT',
      status: 'SENT'
    });
    return { delivered: true, skipped: false };
  } catch (err) {
    await finishNotification({
      caseId: payload.caseId,
      visitId: payload.visitId,
      officerId: payload.officerId,
      type: 'NEW_ASSIGNMENT',
      status: 'FAILED',
      error: err.message
    });
    return { delivered: false, skipped: false, reason: err.message };
  }
}

/**
 * Scan visits berstatus 'Menunggu', periksa apakah masuk jendela reminder 24h, 12h, atau 3h.
 * Kirim jika belum pernah dikirim untuk visit dan tipe reminder tersebut.
 *
 * @param {object} sock Baileys socket
 * @param {object} options
 * @param {Date} [options.now] simulasi waktu sekarang (default: new Date())
 * @param {boolean} [options.dryRun]
 * @returns {Promise<{scanned: number, sent: number, skipped: number, errors: number}>}
 */
async function scanAndSendReminders(sock, options = {}) {
  const { now = new Date(), dryRun = false } = options;

  if (!dryRun && process.env.ENABLE_WHATSAPP_NOTIFICATIONS !== 'true') {
    return { scanned: 0, sent: 0, skipped: 0, errors: 0, reason: 'Notifikasi WhatsApp dinonaktifkan.' };
  }

  // Cek apakah tipe ini sudah pernah terkirim untuk visit_id dan officer_id ini
  const [visits] = await pool.query(
    `SELECT
      v.id AS visit_id,
      v.case_id,
      v.kunjungan_ke,
      v.jadwal_kunjungan,
      c.nomor_tiket,
      c.nama_korban,
      c.rumah_sakit,
      c.assigned_officer_id,
      o.nama AS officer_nama,
      o.telepon AS officer_telepon,
      o.is_active AS officer_active
    FROM visits v
    JOIN cases c ON c.id = v.case_id
    JOIN officers o ON o.id = c.assigned_officer_id
    WHERE v.status_kunjungan = 'Menunggu'
      AND c.assigned_officer_id IS NOT NULL
      AND o.is_active = 1
      AND v.jadwal_kunjungan > ?
      AND v.jadwal_kunjungan <= DATE_ADD(?, INTERVAL 24 HOUR)`,
    [now, now]
  );

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const v of visits) {
    const reminderType = determineReminderType(now, v.jadwal_kunjungan);
    if (!reminderType) {
      skipped += 1;
      continue;
    }

    const phone = normalizeWhatsAppNumber(v.officer_telepon);
    if (!phone) {
      skipped += 1;
      continue;
    }

    const text = buildReminderMessage({
      officerName: v.officer_nama,
      ticket: v.nomor_tiket,
      victimName: v.nama_korban,
      hospitalName: v.rumah_sakit,
      reminderType,
      scheduledAt: v.jadwal_kunjungan
    });

    // reserveNotification menangani deduplikasi secara atomik berdasarkan unique key
    const reserved = await reserveNotification({
      caseId: v.case_id,
      visitId: v.visit_id,
      officerId: v.assigned_officer_id,
      type: reminderType,
      phone,
      text
    });

    if (!reserved) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      await finishNotification({
        caseId: v.case_id,
        visitId: v.visit_id,
        officerId: v.assigned_officer_id,
        type: reminderType,
        status: 'SENT'
      });
      sent += 1;
      continue;
    }

    const jid = buildWhatsAppJid(phone);
    try {
      await sendWhatsAppText(sock, jid, text);
      await finishNotification({
        caseId: v.case_id,
        visitId: v.visit_id,
        officerId: v.assigned_officer_id,
        type: reminderType,
        status: 'SENT'
      });
      sent += 1;
    } catch (err) {
      errors += 1;
      await finishNotification({
        caseId: v.case_id,
        visitId: v.visit_id,
        officerId: v.assigned_officer_id,
        type: reminderType,
        status: 'FAILED',
        error: err.message
      });
    }
  }

  return { scanned: visits.length, sent, skipped, errors };
}

module.exports = {
  sendWhatsAppText,
  notifyNewAssignment,
  scanAndSendReminders
};
