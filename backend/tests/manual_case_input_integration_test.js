/**
 * HTTP integration test for manual case input. Uses real MySQL fixtures.
 * Run: node tests/manual_case_input_integration_test.js
 */
const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const casesRouter = require('../src/routes/cases');
const { JWT_SECRET } = require('../src/middleware/auth');

const stamp = `${Date.now()}_${process.pid}`;
let server;
let baseUrl;
let fixture = {};

function token(user) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
}

async function request(method, path, body, authToken) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let parsedBody;
  try {
    parsedBody = JSON.parse(text);
  } catch {
    parsedBody = text;
  }
  return { status: response.status, body: parsedBody };
}

async function setup() {
  const [hospitalResult] = await pool.execute(
    `INSERT INTO hospitals (nama_rs, alamat, latitude, longitude, is_active)
     VALUES (?, 'fixture', 0, 0, 1)`,
    [`RS Manual ${stamp}`]
  );
  fixture.hospitalId = hospitalResult.insertId;
  fixture.hospitalName = `RS Manual ${stamp}`;

  const [unplottedResult] = await pool.execute(
    `INSERT INTO hospitals (nama_rs, alamat, latitude, longitude, is_active)
     VALUES (?, 'fixture unplotted', 0, 0, 1)`,
    [`RS Unplotted ${stamp}`]
  );
  fixture.unplottedHospitalId = unplottedResult.insertId;

  const [inactiveResult] = await pool.execute(
    `INSERT INTO hospitals (nama_rs, alamat, latitude, longitude, is_active)
     VALUES (?, 'fixture inactive', 0, 0, 0)`,
    [`RS Inactive ${stamp}`]
  );
  fixture.inactiveHospitalId = inactiveResult.insertId;

  const officerRows = [];
  for (const name of ['Primary', 'Other']) {
    const [result] = await pool.execute(
      'INSERT INTO officers (nama, is_active) VALUES (?, 1)',
      [`${name} ${stamp}`]
    );
    officerRows.push(result.insertId);
  }
  [fixture.primaryOfficerId, fixture.otherOfficerId] = officerRows;
  await pool.execute(
    `INSERT INTO officer_hospitals (officer_id, hospital_id, is_primary, is_active)
     VALUES (?, ?, 1, 1)`,
    [fixture.primaryOfficerId, fixture.hospitalId]
  );

  const users = [];
  for (const [username, role, officerId] of [
    [`kabag_manual_${stamp}`, 'kabag', null],
    [`petugas_manual_${stamp}`, 'petugas', fixture.primaryOfficerId],
    [`petugas_other_${stamp}`, 'petugas', fixture.otherOfficerId]
  ]) {
    const [result] = await pool.execute(
      'INSERT INTO users (officer_id, username, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
      [officerId, username, 'not-used', role]
    );
    users.push({ id: result.insertId, username, role, officerId });
  }
  [fixture.kabag, fixture.petugas, fixture.otherPetugas] = users;

  const app = express();
  app.use(express.json());
  app.use('/api/cases', casesRouter);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function cleanup() {
  if (server) await new Promise((resolve) => server.close(resolve));
  const hospitalIds = [fixture.hospitalId, fixture.unplottedHospitalId, fixture.inactiveHospitalId].filter(Boolean);
  if (hospitalIds.length > 0) {
    const placeholders = hospitalIds.map(() => '?').join(', ');
    await pool.execute(`DELETE FROM cases WHERE hospital_id IN (${placeholders})`, hospitalIds);
    await pool.execute(`DELETE FROM officer_hospitals WHERE hospital_id IN (${placeholders})`, hospitalIds);
    await pool.execute('DELETE FROM users WHERE id IN (?, ?, ?)', [fixture.kabag.id, fixture.petugas.id, fixture.otherPetugas.id]);
    await pool.execute('DELETE FROM officers WHERE id IN (?, ?)', [fixture.primaryOfficerId, fixture.otherOfficerId]);
    await pool.execute(`DELETE FROM hospitals WHERE id IN (${placeholders})`, hospitalIds);
  }
  await pool.end();
}

async function main() {
  try {
    await setup();
    const kabagToken = token({ userId: fixture.kabag.id, role: 'kabag', officerId: null });
    const petugasToken = token({ userId: fixture.petugas.id, role: 'petugas', officerId: fixture.primaryOfficerId });
    const otherPetugasToken = token({ userId: fixture.otherPetugas.id, role: 'petugas', officerId: fixture.otherOfficerId });

    // 1. Unauthenticated -> 401
    const noAuth = await request('POST', '/api/cases', { hospital_id: fixture.hospitalId, nama_korban: 'Anon' });
    assert.equal(noAuth.status, 401);

    // 2. Kabag creates case: ignores request body officer_id, auto-assigns primary plotted officer
    const payload = {
      hospital_id: fixture.hospitalId,
      nama_korban: 'Korban Manual',
      nik: '1234567890123456', umur: 32, jenis_kelamin: 'Perempuan',
      alamat: 'Alamat uji', telepon_korban: '08123456789', tgl_laka: '1/1/2026',
      tgl_masuk: '2/1/2026', kronologi: 'Uji HTTP',
      jenis_laka: 'Tidak Tunggal', status_kondisi: 'Rawat Inap',
      assigned_officer_id: fixture.otherOfficerId,
      officer_id: fixture.otherOfficerId
    };

    const kabagCreate = await request('POST', '/api/cases', payload, kabagToken);
    assert.equal(kabagCreate.status, 201, JSON.stringify(kabagCreate.body));
    assert.equal(kabagCreate.body.success, true);
    assert.match(kabagCreate.body.data.case.nomor_tiket, /^JR-/);
    assert.equal(kabagCreate.body.data.case.assigned_officer_id, fixture.primaryOfficerId);
    assert.equal(kabagCreate.body.data.assigned_officer.id, fixture.primaryOfficerId);
    assert.equal(kabagCreate.body.data.case.tgl_laka, '01/01/2026');
    assert.equal(kabagCreate.body.data.case.tgl_masuk, '02/01/2026');
    assert.equal(kabagCreate.body.data.visit.kunjungan_ke, 1);
    assert.equal(kabagCreate.body.data.visit.status_kunjungan, 'Menunggu');
    const diffHours = (new Date(kabagCreate.body.data.visit.jadwal_kunjungan).getTime() - new Date(kabagCreate.body.data.case.waktu_lapor_wa).getTime()) / (60 * 60 * 1000);
    assert.equal(Math.round(diffHours), 72);

    // 3. Laka tunggal dicatat sebagai arsip: tanpa assignment atau kunjungan/SLA.
    const tunggalArchive = await request('POST', '/api/cases', {
      hospital_id: fixture.hospitalId,
      nama_korban: 'Korban Tunggal Arsip',
      jenis_laka: 'Tunggal',
      status_kondisi: 'Luka Ringan'
    }, kabagToken);
    assert.equal(tunggalArchive.status, 201, JSON.stringify(tunggalArchive.body));
    assert.equal(tunggalArchive.body.data.case.status_keterjaminan, 'Belum Dikonfirmasi');
    assert.equal(tunggalArchive.body.data.case.status_pemantauan, 'Diarsipkan');
    assert.equal(tunggalArchive.body.data.case.assigned_officer_id, null);
    assert.equal(tunggalArchive.body.data.assigned_officer, null);
    assert.equal(tunggalArchive.body.data.visit, null);
    const [[archiveVisitCount]] = await pool.execute(
      'SELECT COUNT(*) AS n FROM visits WHERE case_id = ?', [tunggalArchive.body.data.case.id]
    );
    assert.equal(archiveVisitCount.n, 0);

    // 4. Kabag creates case for unplotted hospital: remains unassigned
    const unplottedCreate = await request('POST', '/api/cases', {
      hospital_id: fixture.unplottedHospitalId,
      nama_korban: 'Korban Tanpa Plotting'
    }, kabagToken);
    assert.equal(unplottedCreate.status, 201, JSON.stringify(unplottedCreate.body));
    assert.equal(unplottedCreate.body.data.case.assigned_officer_id, null);
    assert.equal(unplottedCreate.body.data.assigned_officer, null);

    // 4. Petugas creates case for plotted hospital: assigns submitting petugas
    const petugasCreate = await request('POST', '/api/cases', {
      hospital_id: fixture.hospitalId,
      nama_korban: 'Korban Petugas',
      assigned_officer_id: fixture.otherOfficerId
    }, petugasToken);
    assert.equal(petugasCreate.status, 201, JSON.stringify(petugasCreate.body));
    assert.equal(petugasCreate.body.data.case.assigned_officer_id, fixture.primaryOfficerId);
    assert.equal(petugasCreate.body.data.assigned_officer.id, fixture.primaryOfficerId);

    // 5. Petugas creates case for hospital not actively plotted to them -> 403
    const forbidden = await request('POST', '/api/cases', {
      hospital_id: fixture.hospitalId,
      nama_korban: 'Korban Salah Plot'
    }, otherPetugasToken);
    assert.equal(forbidden.status, 403);

    // 6. Missing required fields -> 400
    const missingNama = await request('POST', '/api/cases', { hospital_id: fixture.hospitalId }, kabagToken);
    assert.equal(missingNama.status, 400);
    const missingHospital = await request('POST', '/api/cases', { nama_korban: 'Nama Saja' }, kabagToken);
    assert.equal(missingHospital.status, 400);

    // 7. Inactive hospital or non-existent hospital -> 404
    const inactiveRs = await request('POST', '/api/cases', { hospital_id: fixture.inactiveHospitalId, nama_korban: 'Tes' }, kabagToken);
    assert.equal(inactiveRs.status, 404);
    const notFoundRs = await request('POST', '/api/cases', { hospital_id: 99999999, nama_korban: 'Tes' }, kabagToken);
    assert.equal(notFoundRs.status, 404);

    // 8. Invalid optional fields schema -> 422
    const invalidStatus = await request('POST', '/api/cases', {
      hospital_id: fixture.hospitalId,
      nama_korban: 'Tes',
      status_kondisi: 'BukanStatusValid'
    }, kabagToken);
    assert.equal(invalidStatus.status, 422);

    // 9. Dates must use Indonesian DD/MM/YYYY and must be possible calendar dates.
    const invalidMmDdYyyy = await request('POST', '/api/cases', {
      hospital_id: fixture.hospitalId,
      nama_korban: 'Tanggal MM DD',
      tgl_laka: '10/29/2026'
    }, kabagToken);
    assert.equal(invalidMmDdYyyy.status, 422, JSON.stringify(invalidMmDdYyyy.body));
    assert.match(invalidMmDdYyyy.body.message, /DD\/MM\/YYYY/);

    const invalidShortYear = await request('POST', '/api/cases', {
      hospital_id: fixture.hospitalId,
      nama_korban: 'Tahun Dua Digit',
      tgl_laka: '29/10/26'
    }, kabagToken);
    assert.equal(invalidShortYear.status, 422, JSON.stringify(invalidShortYear.body));
    assert.match(invalidShortYear.body.message, /DD\/MM\/YYYY/);

    const impossibleDate = await request('POST', '/api/cases', {
      hospital_id: fixture.hospitalId,
      nama_korban: 'Tanggal Mustahil',
      tgl_masuk: '31/04/2026'
    }, kabagToken);
    assert.equal(impossibleDate.status, 422, JSON.stringify(impossibleDate.body));
    assert.match(impossibleDate.body.message, /DD\/MM\/YYYY/);

    console.log('PASS manual case input HTTP integration');
  } finally {
    await cleanup();
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
