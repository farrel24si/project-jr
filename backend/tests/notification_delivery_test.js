const assert = require('assert');
const pool = require('../src/config/db');
const {
  notifyNewAssignment,
  scanAndSendReminders
} = require('../src/services/notificationDelivery');

async function runNotificationDeduplicationTests() {
  console.log('=== TEST SUITE: NOTIFICATION DEDUPLICATION & REMINDERS ===');

  let testCaseId = null;
  let testVisitId = null;
  let testOfficerId = null;
  let testHospitalId = null;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const ticket = `JR-N${suffix.slice(-5).padStart(5, '0')}`;

  try {
    // 1. Setup fixture khusus test dengan nilai unik agar aman saat rerun.
    const [hRes] = await pool.query(
      `INSERT INTO hospitals (nama_rs, alamat, latitude, longitude, radius_meter, is_active)
       VALUES (?, 'Jl. Uji No. 99', 0.4900, 101.4000, 200, 1)`,
      [`RS Uji Notifikasi ${suffix}`]
    );
    testHospitalId = hRes.insertId;

    const [oRes] = await pool.query(
      `INSERT INTO officers (nama, nip, jabatan, wilayah, telepon, email, is_active)
       VALUES (?, ?, 'Petugas', 'Pekanbaru', '0812-9999-8888', ?, 1)`,
      [`Petugas Uji Notif ${suffix}`, `NIP-NOTIF-${suffix}`, `notif.${suffix}@jasaraharja.test`]
    );
    testOfficerId = oRes.insertId;

    const [cRes] = await pool.query(
      `INSERT INTO cases (
        nomor_tiket, rumah_sakit, hospital_id, nama_korban, nik, umur,
        jenis_laka, status_kondisi, waktu_lapor_wa, assigned_officer_id
      ) VALUES (?, ?, ?, 'Korban Uji Notif', '1471000000000099', 25,
        'Tunggal', 'Rawat Inap', NOW(), ?)`,
      [ticket, `RS Uji Notifikasi ${suffix}`, testHospitalId, testOfficerId]
    );
    testCaseId = cRes.insertId;

    const [vRes] = await pool.query(
      `INSERT INTO visits (case_id, kunjungan_ke, jadwal_kunjungan, status_kunjungan)
       VALUES (?, 1, DATE_ADD(NOW(), INTERVAL 72 HOUR), 'Menunggu')`,
      [testCaseId]
    );
    testVisitId = vRes.insertId;

    console.log('PASS fixture setup berhasil');

    // 2. Test kirim notifikasi penugasan baru pertama kali (dryRun)
    const mockPayload = {
      caseId: testCaseId,
      visitId: testVisitId,
      officerId: testOfficerId,
      officerName: `Petugas Uji Notif ${suffix}`,
      officerPhone: '0812-9999-8888',
      ticket,
      victimName: 'Korban Uji Notif',
      hospitalName: `RS Uji Notifikasi ${suffix}`,
      condition: 'Rawat Inap',
      scheduledAt: new Date(Date.now() + 72 * 3600 * 1000)
    };

    const firstSend = await notifyNewAssignment(null, mockPayload, { dryRun: true });
    assert.strictEqual(firstSend.delivered, true);
    assert.strictEqual(firstSend.skipped, false);

    // Cek di tabel notification_logs
    const [logs1] = await pool.query(
      `SELECT * FROM notification_logs WHERE case_id = ? AND visit_id = ? AND notification_type = 'NEW_ASSIGNMENT'`,
      [testCaseId, testVisitId]
    );
    assert.strictEqual(logs1.length, 1);
    assert.strictEqual(logs1[0].phone_number, '6281299998888');
    assert.strictEqual(logs1[0].delivery_status, 'SENT');
    console.log('PASS test notifikasi pertama tersimpan di notification_logs');

    // 3. Test deduplikasi: kirim kedua kali HARUS di-skip, tidak dobel log
    const secondSend = await notifyNewAssignment(null, mockPayload, { dryRun: true });
    assert.strictEqual(secondSend.delivered, true);
    assert.strictEqual(secondSend.skipped, true);
    assert.match(secondSend.reason, /pernah terkirim/i);

    const [logs2] = await pool.query(
      `SELECT COUNT(*) AS total FROM notification_logs WHERE case_id = ? AND visit_id = ? AND notification_type = 'NEW_ASSIGNMENT'`,
      [testCaseId, testVisitId]
    );
    assert.strictEqual(logs2[0].total, 1, 'Harus tetap 1 log, tidak boleh duplikat');
    console.log('PASS test deduplikasi penugasan baru (anti-spam)');

    // 4. Test scan reminder dengan manipulasi jadwal (misal sisa 10 jam -> REMINDER_12H)
    const simulatedNow = new Date('2026-11-09T10:00:00.000Z');
    const scheduled10hAhead = new Date('2026-11-09T20:00:00.000Z'); // sisa 10 jam

    await pool.query(
      `UPDATE visits SET jadwal_kunjungan = ? WHERE id = ?`,
      [scheduled10hAhead, testVisitId]
    );

    const reminderRun1 = await scanAndSendReminders(null, { now: simulatedNow, dryRun: true });
    assert.ok(reminderRun1.sent >= 1, 'Minimal 1 reminder terkirim');

    const [remLogs1] = await pool.query(
      `SELECT * FROM notification_logs WHERE visit_id = ? AND notification_type = 'REMINDER_12H'`,
      [testVisitId]
    );
    assert.strictEqual(remLogs1.length, 1);
    assert.strictEqual(remLogs1[0].delivery_status, 'SENT');
    console.log('PASS test scan reminder 12H otomatis terkirim (dryRun)');

    // 5. Test scan reminder kedua kali di waktu yang sama -> HARUS di-skip
    const reminderRun2 = await scanAndSendReminders(null, { now: simulatedNow, dryRun: true });
    assert.strictEqual(reminderRun2.sent, 0, 'Reminder kedua tidak boleh terkirim ulang');
    assert.ok(reminderRun2.skipped >= 1, 'Reminder kedua harus terdeteksi dan dilewati');
    const [remLogs2] = await pool.query(
      `SELECT COUNT(*) AS total FROM notification_logs WHERE visit_id = ? AND notification_type = 'REMINDER_12H'`,
      [testVisitId]
    );
    assert.strictEqual(remLogs2[0].total, 1, 'Log REMINDER_12H tidak boleh bertambah');
    console.log('PASS test scan reminder kedua kali di-skip (deduplikasi cron)');

    // 6. Test pemulihan deadlock PENDING (stale lease recovery)
    const deadCaseTicket = `JR-D${suffix.slice(-5).padStart(5, '0')}`;
    const [dcRes] = await pool.query(
      `INSERT INTO cases (
        nomor_tiket, rumah_sakit, hospital_id, nama_korban, waktu_lapor_wa, assigned_officer_id
      ) VALUES (?, ?, ?, 'Korban Deadlock', NOW(), ?)`,
      [deadCaseTicket, `RS Uji Notifikasi ${suffix}`, testHospitalId, testOfficerId]
    );
    const deadCaseId = dcRes.insertId;

    const [dvRes] = await pool.query(
      `INSERT INTO visits (case_id, kunjungan_ke, jadwal_kunjungan, status_kunjungan)
       VALUES (?, 1, DATE_ADD(NOW(), INTERVAL 72 HOUR), 'Menunggu')`,
      [deadCaseId]
    );
    const deadVisitId = dvRes.insertId;

    // Pasang baris PENDING macet dengan reserved_at 30 menit lalu
    await pool.query(
      `INSERT INTO notification_logs (
        case_id, visit_id, officer_id, notification_type, phone_number,
        message_preview, delivery_status, reserved_at
      ) VALUES (?, ?, ?, 'NEW_ASSIGNMENT', '6281299998888', 'Pesan macet', 'PENDING', DATE_SUB(NOW(), INTERVAL 30 MINUTE))`,
      [deadCaseId, deadVisitId, testOfficerId]
    );

    const recoveredSend = await notifyNewAssignment(null, {
      caseId: deadCaseId,
      visitId: deadVisitId,
      officerId: testOfficerId,
      officerName: `Petugas Uji Notif ${suffix}`,
      officerPhone: '0812-9999-8888',
      ticket: deadCaseTicket,
      victimName: 'Korban Deadlock',
      hospitalName: `RS Uji Notifikasi ${suffix}`,
      condition: 'Rawat Inap',
      scheduledAt: new Date(Date.now() + 72 * 3600 * 1000)
    }, { dryRun: true });

    assert.strictEqual(recoveredSend.delivered, true);
    assert.strictEqual(recoveredSend.skipped, false);

    const [[recoveredRow]] = await pool.query(
      `SELECT delivery_status FROM notification_logs WHERE case_id = ? AND visit_id = ?`,
      [deadCaseId, deadVisitId]
    );
    assert.strictEqual(recoveredRow.delivery_status, 'SENT');
    console.log('PASS test pemulihan deadlock PENDING (stale lease recovery)');

    // 7. Test kill-switch ENABLE_WHATSAPP_NOTIFICATIONS (default mati -> tidak kirim real)
    const prevEnv = process.env.ENABLE_WHATSAPP_NOTIFICATIONS;
    delete process.env.ENABLE_WHATSAPP_NOTIFICATIONS;
    const guardedSend = await notifyNewAssignment(null, {
      caseId: 999999,
      visitId: 999999,
      officerId: 999999,
      officerPhone: '081234567890'
    }, { dryRun: false });
    assert.strictEqual(guardedSend.delivered, false);
    assert.strictEqual(guardedSend.skipped, true);
    assert.strictEqual(guardedSend.reason, 'Notifikasi WhatsApp dinonaktifkan.');

    const guardedScan = await scanAndSendReminders(null, { dryRun: false });
    assert.strictEqual(guardedScan.sent, 0);
    assert.strictEqual(guardedScan.reason, 'Notifikasi WhatsApp dinonaktifkan.');
    if (prevEnv !== undefined) process.env.ENABLE_WHATSAPP_NOTIFICATIONS = prevEnv;
    console.log('PASS test kill-switch ENABLE_WHATSAPP_NOTIFICATIONS aman');

    await pool.query('DELETE FROM cases WHERE id = ?', [deadCaseId]);

    console.log('\n=== SEMUA TEST NOTIFIKASI & DEDUPLIKASI LULUS ===');
  } finally {
    // Cleanup fixture
    if (testCaseId) {
      await pool.query('DELETE FROM cases WHERE id = ?', [testCaseId]);
    }
    if (testOfficerId) {
      await pool.query('DELETE FROM officers WHERE id = ?', [testOfficerId]);
    }
    if (testHospitalId) {
      await pool.query('DELETE FROM hospitals WHERE id = ?', [testHospitalId]);
    }
    await pool.end();
  }
}

runNotificationDeduplicationTests().catch((err) => {
  console.error('FAIL test suite notifikasi:', err);
  process.exit(1);
});
