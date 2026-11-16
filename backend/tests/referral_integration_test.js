/**
 * HTTP integration test for cross-hospital referral handoff.
 * Run: node tests/referral_integration_test.js
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const casesRouter = require('../src/routes/cases');
const visitsRouter = require('../src/routes/visits');
const { JWT_SECRET } = require('../src/middleware/auth');

const stamp = `${Date.now()}_${process.pid}`;
const fixture = {};
let server;
let baseUrl;

function token(user) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
}

async function createHospital(label) {
  const [result] = await pool.execute(
    `INSERT INTO hospitals (nama_rs, alamat, latitude, longitude, radius_meter, is_active)
     VALUES (?, 'fixture rujukan', ?, ?, 200, 1)`,
    [`RS ${label} ${stamp}`, label === 'Asal' ? 0 : 0.01, 101.4]
  );
  return result.insertId;
}

async function createOfficer(label, phone = null) {
  const [officer] = await pool.execute(
    'INSERT INTO officers (nama, telepon, is_active) VALUES (?, ?, 1)',
    [`Petugas ${label} ${stamp}`, phone]
  );
  const [user] = await pool.execute(
    `INSERT INTO users (officer_id, username, password_hash, role, is_active)
     VALUES (?, ?, 'not-used', 'petugas', 1)`,
    [officer.insertId, `referral_${label}_${stamp}`]
  );
  return { officerId: officer.insertId, userId: user.insertId };
}

async function setup() {
  fixture.prevNotifEnv = process.env.ENABLE_WHATSAPP_NOTIFICATIONS;
  process.env.ENABLE_WHATSAPP_NOTIFICATIONS = 'true';
  fixture.sentMessages = [];

  fixture.sourceHospitalId = await createHospital('Asal');
  fixture.targetHospitalId = await createHospital('Tujuan');
  fixture.source = await createOfficer('Asal', '081211112222');
  fixture.target = await createOfficer('Tujuan', '081233334444');
  fixture.override = await createOfficer('Override', '081255556666');
  fixture.inactiveHospitalId = await createHospital('Nonaktif');
  await pool.execute('UPDATE hospitals SET is_active = 0 WHERE id = ?', [fixture.inactiveHospitalId]);
  fixture.noPlotHospitalId = await createHospital('Tanpa Plot');

  const [kabag] = await pool.execute(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES (?, 'not-used', 'kabag', 1)`,
    [`kabag_referral_${stamp}`]
  );
  fixture.kabagUserId = kabag.insertId;

  await pool.execute(
    `INSERT INTO officer_hospitals (officer_id, hospital_id, is_primary, is_active)
     VALUES (?, ?, 1, 1), (?, ?, 0, 1)`,
    [fixture.target.officerId, fixture.targetHospitalId, fixture.override.officerId, fixture.targetHospitalId]
  );

  const sourceName = `RS Asal ${stamp}`;
  const [caseResult] = await pool.execute(
    `INSERT INTO cases (
      nomor_tiket, rumah_sakit, hospital_id, assigned_officer_id,
      nama_korban, jenis_laka, status_kondisi, waktu_lapor_wa
    ) VALUES (?, ?, ?, ?, 'Korban Rujukan', 'Tunggal', 'Rawat Inap', NOW())`,
    [`JR-REF${Date.now()}`, sourceName, fixture.sourceHospitalId, fixture.source.officerId]
  );
  fixture.caseId = caseResult.insertId;

  const [visit] = await pool.execute(
    `INSERT INTO visits (case_id, kunjungan_ke, jadwal_kunjungan, status_kunjungan)
     VALUES (?, 1, DATE_ADD(NOW(), INTERVAL 1 HOUR), 'Menunggu')`,
    [fixture.caseId]
  );
  fixture.sourceVisitId = visit.insertId;

  const app = express();
  app.set('waSocket', () => ({
    sendMessage: async (jid, payload) => {
      fixture.sentMessages.push({ jid, payload });
    }
  }));
  app.use(express.json());
  app.use('/api/cases', casesRouter);
  app.use('/api/visits', visitsRouter);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function cleanup() {
  if (fixture.prevNotifEnv !== undefined) {
    process.env.ENABLE_WHATSAPP_NOTIFICATIONS = fixture.prevNotifEnv;
  } else {
    delete process.env.ENABLE_WHATSAPP_NOTIFICATIONS;
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  if (fixture.photoUrl) await fs.promises.unlink(path.resolve(__dirname, '..', `.${fixture.photoUrl}`)).catch(() => {});
  if (fixture.caseId) await pool.execute('DELETE FROM cases WHERE id = ?', [fixture.caseId]);
  if (fixture.noAssigneeCaseId) await pool.execute('DELETE FROM cases WHERE id = ?', [fixture.noAssigneeCaseId]);
  if (fixture.kabagUserId) await pool.execute('DELETE FROM users WHERE id = ?', [fixture.kabagUserId]);
  for (const person of [fixture.source, fixture.target, fixture.override]) {
    if (!person) continue;
    await pool.execute('DELETE FROM users WHERE id = ?', [person.userId]);
    await pool.execute('DELETE FROM officers WHERE id = ?', [person.officerId]);
  }
  for (const id of [fixture.sourceHospitalId, fixture.targetHospitalId, fixture.inactiveHospitalId, fixture.noPlotHospitalId]) {
    if (id) await pool.execute('DELETE FROM hospitals WHERE id = ?', [id]);
  }
  await pool.end();
}

async function submitReferral() {
  const form = new FormData();
  form.set('case_id', String(fixture.caseId));
  form.set('lat_petugas', '0');
  form.set('lng_petugas', '101.4');
  form.set('status_kondisi_terbaru', 'Dirujuk ke RS Lain');
  form.set('rujukan_hospital_id', String(fixture.targetHospitalId));
  form.set('alasan_rujukan', 'Memerlukan fasilitas lanjutan.');
  form.set('catatan_rujukan', 'Pasien dipindahkan dalam kondisi stabil.');
  form.set('cek_komunikasi_keluarga', 'true');
  form.set('cek_edukasi_santunan', 'true');
  form.set('cek_arahan_lp', 'true');
  form.set('foto_bukti', new Blob(['bukti-rujukan'], { type: 'image/jpeg' }), 'rujukan.jpg');

  const response = await fetch(`${baseUrl}/api/visits/${fixture.sourceVisitId}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token({ userId: fixture.source.userId, role: 'petugas', officerId: fixture.source.officerId })}` },
    body: form
  });
  return { response, body: await response.json() };
}

async function main() {
  try {
    await setup();

    // Auth and referral-target validation fail before source visit is written.
    const unauthenticated = await fetch(`${baseUrl}/api/visits/${fixture.sourceVisitId}/submit`, { method: 'POST' });
    assert.equal(unauthenticated.status, 401);
    const kabagSubmit = await fetch(`${baseUrl}/api/visits/${fixture.sourceVisitId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token({ userId: fixture.kabagUserId, role: 'kabag' })}` }
    });
    assert.equal(kabagSubmit.status, 403);

    async function invalidReferral(targetId) {
      const form = new FormData();
      form.set('case_id', String(fixture.caseId));
      form.set('lat_petugas', '0');
      form.set('lng_petugas', '101.4');
      form.set('status_kondisi_terbaru', 'Dirujuk ke RS Lain');
      if (targetId !== undefined) form.set('rujukan_hospital_id', String(targetId));
      return fetch(`${baseUrl}/api/visits/${fixture.sourceVisitId}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token({ userId: fixture.source.userId, role: 'petugas', officerId: fixture.source.officerId })}` },
        body: form
      });
    }
    assert.equal((await invalidReferral()).status, 422);
    assert.equal((await invalidReferral(fixture.inactiveHospitalId)).status, 422);
    assert.equal((await invalidReferral(fixture.sourceHospitalId)).status, 422);

    const referral = await submitReferral();
    assert.equal(referral.response.status, 200, JSON.stringify(referral.body));
    assert.equal(referral.body.success, true);
    assert.equal(referral.body.referral.target_hospital_id, fixture.targetHospitalId);
    assert.equal(referral.body.referral.assigned_officer.id, fixture.target.officerId);
    assert.equal(referral.body.referral.unassigned, false);
    assert.ok(referral.body.referral.id);
    fixture.referralId = referral.body.referral.id;

    const [[savedCase]] = await pool.execute(
      'SELECT hospital_id, assigned_officer_id, rumah_sakit, status_kondisi FROM cases WHERE id = ?',
      [fixture.caseId]
    );
    assert.equal(savedCase.hospital_id, fixture.targetHospitalId);
    assert.equal(savedCase.assigned_officer_id, fixture.target.officerId);
    assert.equal(savedCase.status_kondisi, 'Dirujuk ke RS Lain');
    assert.equal(savedCase.rumah_sakit, `RS Tujuan ${stamp}`);

    const [[sourceVisit]] = await pool.execute(
      'SELECT status_kunjungan, foto_bukti_url FROM visits WHERE id = ?', [fixture.sourceVisitId]
    );
    assert.match(sourceVisit.status_kunjungan, /^Selesai/);
    assert.ok(sourceVisit.foto_bukti_url);
    fixture.photoUrl = sourceVisit.foto_bukti_url;

    const [[targetVisit]] = await pool.execute(
      `SELECT kunjungan_ke, status_kunjungan, jadwal_kunjungan FROM visits
       WHERE case_id = ? AND id <> ? ORDER BY kunjungan_ke DESC LIMIT 1`,
      [fixture.caseId, fixture.sourceVisitId]
    );
    assert.equal(targetVisit.kunjungan_ke, 2);
    assert.equal(targetVisit.status_kunjungan, 'Menunggu');
    const dueInHours = (new Date(targetVisit.jadwal_kunjungan).getTime() - Date.now()) / (60 * 60 * 1000);
    assert.equal(Math.round(dueInHours), 72, `target visit due ${dueInHours}h after referral`);

    const [[history]] = await pool.execute(
      `SELECT source_hospital_id, target_hospital_id, previous_officer_id, new_officer_id,
        referred_by_officer_id, alasan_rujukan, catatan_rujukan
       FROM case_referrals WHERE id = ?`,
      [fixture.referralId]
    );
    assert.equal(history.source_hospital_id, fixture.sourceHospitalId);
    assert.equal(history.target_hospital_id, fixture.targetHospitalId);
    assert.equal(history.previous_officer_id, fixture.source.officerId);
    assert.equal(history.new_officer_id, fixture.target.officerId);
    assert.equal(history.referred_by_officer_id, fixture.source.officerId);
    assert.match(history.alasan_rujukan, /fasilitas lanjutan/i);

    // Case detail includes referral history
    const detailResponse = await fetch(`${baseUrl}/api/cases/${fixture.caseId}`, {
      headers: { Authorization: `Bearer ${token({ userId: fixture.kabagUserId, role: 'kabag' })}` }
    });
    const detailBody = await detailResponse.json();
    assert.equal(detailResponse.status, 200);
    assert.ok(Array.isArray(detailBody.data.referrals));
    assert.equal(detailBody.data.referrals.length, 1);
    assert.equal(detailBody.data.referrals[0].id, fixture.referralId);
    assert.equal(detailBody.data.referrals[0].source_hospital_id, fixture.sourceHospitalId);
    assert.equal(detailBody.data.referrals[0].target_hospital_id, fixture.targetHospitalId);

    // Kabag override auth and plotting validations
    const overrideNoAuth = await fetch(
      `${baseUrl}/api/cases/${fixture.caseId}/referrals/${fixture.referralId}/assignee`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officer_id: fixture.override.officerId })
      }
    );
    assert.equal(overrideNoAuth.status, 401);

    const overridePetugas = await fetch(
      `${baseUrl}/api/cases/${fixture.caseId}/referrals/${fixture.referralId}/assignee`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token({ userId: fixture.source.userId, role: 'petugas', officerId: fixture.source.officerId })}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ officer_id: fixture.override.officerId })
      }
    );
    assert.equal(overridePetugas.status, 403);

    const overrideInvalidPlot = await fetch(
      `${baseUrl}/api/cases/${fixture.caseId}/referrals/${fixture.referralId}/assignee`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token({ userId: fixture.kabagUserId, role: 'kabag' })}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ officer_id: fixture.source.officerId })
      }
    );
    assert.equal(overrideInvalidPlot.status, 422);

    const overrideNotFound = await fetch(
      `${baseUrl}/api/cases/999999/referrals/${fixture.referralId}/assignee`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token({ userId: fixture.kabagUserId, role: 'kabag' })}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ officer_id: fixture.override.officerId })
      }
    );
    assert.equal(overrideNotFound.status, 404);

    const overrideResponse = await fetch(
      `${baseUrl}/api/cases/${fixture.caseId}/referrals/${fixture.referralId}/assignee`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token({ userId: fixture.kabagUserId, role: 'kabag' })}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ officer_id: fixture.override.officerId })
      }
    );
    const overrideBody = await overrideResponse.json();
    assert.equal(overrideResponse.status, 200, JSON.stringify(overrideBody));
    assert.equal(overrideBody.data.assigned_officer.id, fixture.override.officerId);

    const [[overriddenCase]] = await pool.execute(
      'SELECT assigned_officer_id FROM cases WHERE id = ?', [fixture.caseId]
    );
    assert.equal(overriddenCase.assigned_officer_id, fixture.override.officerId);
    const [[overriddenHistory]] = await pool.execute(
      `SELECT new_officer_id, previous_officer_id FROM case_referrals WHERE id = ?`,
      [fixture.referralId]
    );
    assert.equal(overriddenHistory.new_officer_id, fixture.override.officerId);
    assert.equal(overriddenHistory.previous_officer_id, fixture.source.officerId);
    assert.ok(detailBody.data.referrals[0].new_officer_id);

    // Pastikan petugas tujuan rujukan (target) & petugas hasil override Kabag (override)
    // keduanya menerima DM WhatsApp otomatis dan tercatat SENT di notification_logs.
    assert.equal(fixture.sentMessages.length, 2, 'Harus ada 2 DM WA terkirim (saat rujukan & saat override)');
    assert.equal(fixture.sentMessages[0].jid, '6281233334444@s.whatsapp.net');
    assert.equal(fixture.sentMessages[1].jid, '6281255556666@s.whatsapp.net');

    const [notifLogs] = await pool.execute(
      `SELECT officer_id, delivery_status FROM notification_logs
       WHERE case_id = ? AND notification_type = 'NEW_ASSIGNMENT'
       ORDER BY id ASC`,
      [fixture.caseId]
    );
    assert.equal(notifLogs.length, 2);
    assert.equal(notifLogs[0].officer_id, fixture.target.officerId);
    assert.equal(notifLogs[0].delivery_status, 'SENT');
    assert.equal(notifLogs[1].officer_id, fixture.override.officerId);
    assert.equal(notifLogs[1].delivery_status, 'SENT');

    // Submit visit di RS tujuan dengan status 'Sudah Pulang' (status terminal):
    // tidak boleh menjadwalkan visit ke-3 dan status_pemantauan menjadi 'Selesai Dipantau'.
    const pulangForm = new FormData();
    pulangForm.set('case_id', String(fixture.caseId));
    pulangForm.set('lat_petugas', '0.01');
    pulangForm.set('lng_petugas', '101.4');
    pulangForm.set('status_kondisi_terbaru', 'Sudah Pulang');
    pulangForm.set('cek_komunikasi_keluarga', 'true');
    const [[pendingTargetVisit]] = await pool.execute(
      `SELECT id FROM visits WHERE case_id = ? AND status_kunjungan = 'Menunggu' LIMIT 1`,
      [fixture.caseId]
    );
    const pulangRes = await fetch(`${baseUrl}/api/visits/${pendingTargetVisit.id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token({ userId: fixture.override.userId, role: 'petugas', officerId: fixture.override.officerId })}` },
      body: pulangForm
    });
    assert.equal(pulangRes.status, 200);
    const [[caseAfterPulang]] = await pool.execute(
      'SELECT status_kondisi, status_pemantauan FROM cases WHERE id = ?',
      [fixture.caseId]
    );
    assert.equal(caseAfterPulang.status_kondisi, 'Sudah Pulang');
    assert.equal(caseAfterPulang.status_pemantauan, 'Selesai Dipantau');

    // Target hospital without any active plotting: transfer succeeds, case unassigned.
    const [noPlotCaseResult] = await pool.execute(
      `INSERT INTO cases (nomor_tiket, rumah_sakit, hospital_id, assigned_officer_id, nama_korban, waktu_lapor_wa)
       VALUES (?, ?, ?, ?, 'Korban Tanpa Plot', NOW())`,
      [`JR-NOPLOT${Date.now()}`, `RS Asal ${stamp}`, fixture.sourceHospitalId, fixture.source.officerId]
    );
    fixture.noAssigneeCaseId = noPlotCaseResult.insertId;
    const [noPlotVisit] = await pool.execute(
      `INSERT INTO visits (case_id, kunjungan_ke, jadwal_kunjungan, status_kunjungan)
       VALUES (?, 1, DATE_ADD(NOW(), INTERVAL 1 HOUR), 'Menunggu')`,
      [fixture.noAssigneeCaseId]
    );
    const noPlotForm = new FormData();
    noPlotForm.set('case_id', String(fixture.noAssigneeCaseId));
    noPlotForm.set('lat_petugas', '0');
    noPlotForm.set('lng_petugas', '101.4');
    noPlotForm.set('status_kondisi_terbaru', 'Dirujuk ke RS Lain');
    noPlotForm.set('rujukan_hospital_id', String(fixture.noPlotHospitalId));
    noPlotForm.set('alasan_rujukan', 'Tidak ada petugas di tujuan.');
    const noPlotResponse = await fetch(`${baseUrl}/api/visits/${noPlotVisit.insertId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token({ userId: fixture.source.userId, role: 'petugas', officerId: fixture.source.officerId })}` },
      body: noPlotForm
    });
    const noPlotBody = await noPlotResponse.json();
    assert.equal(noPlotResponse.status, 200, JSON.stringify(noPlotBody));
    assert.equal(noPlotBody.referral.assigned_officer, null);
    assert.equal(noPlotBody.referral.unassigned, true);

    const [[noAssigneeCase]] = await pool.execute(
      'SELECT hospital_id, assigned_officer_id FROM cases WHERE id = ?',
      [fixture.noAssigneeCaseId]
    );
    assert.equal(noAssigneeCase.hospital_id, fixture.noPlotHospitalId);
    assert.equal(noAssigneeCase.assigned_officer_id, null);
    const [[noAssigneeTargetVisit]] = await pool.execute(
      `SELECT status_kunjungan FROM visits WHERE case_id = ? AND id <> ?
       ORDER BY kunjungan_ke DESC LIMIT 1`,
      [fixture.noAssigneeCaseId, noPlotVisit.insertId]
    );
    assert.equal(noAssigneeTargetVisit.status_kunjungan, 'Menunggu');

    // Referral stops follow-up scheduling at source hospital: no extra source visit.
    const [[caseVisitCount]] = await pool.execute(
      'SELECT COUNT(*) AS total FROM visits WHERE case_id = ?', [fixture.caseId]
    );
    assert.equal(caseVisitCount.total, 2);

    console.log('PASS referral moves case and visit to target hospital officer, then kabag override');
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
