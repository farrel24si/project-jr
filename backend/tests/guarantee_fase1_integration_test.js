/**
 * HTTP and Service integration test for Fase 1 Keterjaminan & GL.
 * Uses real MySQL fixtures + isolated Express router.
 * Run: node tests/guarantee_fase1_integration_test.js
 */
const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const casesRouter = require('../src/routes/cases');
const { JWT_SECRET } = require('../src/middleware/auth');
const { insertCaseWithRetry, mapKeterjaminanFromJenisLaka } = require('../src/services/caseCreation');

const stamp = `${Date.now()}_${process.pid}`;
let server;
let baseUrl;
const fixture = {};

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
     VALUES (?, 'fixture guarantee', 0, 0, 1)`,
    [`RS Guarantee ${stamp}`]
  );
  fixture.hospitalId = hospitalResult.insertId;
  fixture.hospitalName = `RS Guarantee ${stamp}`;

  const officerRows = [];
  for (const name of ['Assignee', 'Other']) {
    const [result] = await pool.execute(
      'INSERT INTO officers (nama, is_active) VALUES (?, 1)',
      [`${name} ${stamp}`]
    );
    officerRows.push(result.insertId);
  }
  [fixture.assigneeOfficerId, fixture.otherOfficerId] = officerRows;

  await pool.execute(
    `INSERT INTO officer_hospitals (officer_id, hospital_id, is_primary, is_active)
     VALUES (?, ?, 1, 1)`,
    [fixture.assigneeOfficerId, fixture.hospitalId]
  );

  const users = [];
  for (const [username, role, officerId] of [
    [`kabag_guarantee_${stamp}`, 'kabag', null],
    [`petugas_assignee_${stamp}`, 'petugas', fixture.assigneeOfficerId],
    [`petugas_other_${stamp}`, 'petugas', fixture.otherOfficerId]
  ]) {
    const [result] = await pool.execute(
      'INSERT INTO users (officer_id, username, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
      [officerId, username, 'not-used', role]
    );
    users.push({ id: result.insertId, username, role, officerId });
  }
  [fixture.kabag, fixture.assigneePetugas, fixture.otherPetugas] = users;

  const app = express();
  app.use(express.json());
  app.use('/api/cases', casesRouter);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function cleanup() {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (fixture.hospitalId) {
    await pool.execute('DELETE FROM cases WHERE hospital_id = ?', [fixture.hospitalId]);
    await pool.execute('DELETE FROM officer_hospitals WHERE hospital_id = ?', [fixture.hospitalId]);
    await pool.execute('DELETE FROM users WHERE id IN (?, ?, ?)', [
      fixture.kabag.id,
      fixture.assigneePetugas.id,
      fixture.otherPetugas.id
    ]);
    await pool.execute('DELETE FROM officers WHERE id IN (?, ?)', [
      fixture.assigneeOfficerId,
      fixture.otherOfficerId
    ]);
    await pool.execute('DELETE FROM hospitals WHERE id = ?', [fixture.hospitalId]);
  }
  await pool.end();
}

async function main() {
  try {
    await setup();
    const kabagToken = token({ userId: fixture.kabag.id, role: 'kabag', officerId: null });
    const assigneeToken = token({
      userId: fixture.assigneePetugas.id,
      role: 'petugas',
      officerId: fixture.assigneeOfficerId
    });
    const otherToken = token({
      userId: fixture.otherPetugas.id,
      role: 'petugas',
      officerId: fixture.otherOfficerId
    });

    // 1. Service test: insertCaseWithRetry default mapping
    const caseTidakTunggal = await insertCaseWithRetry({
      hospital_id: fixture.hospitalId,
      rumah_sakit: fixture.hospitalName,
      nama_korban: 'Korban Tidak Tunggal',
      jenis_laka: 'Tidak Tunggal',
      waktu_lapor_wa: new Date()
    });
    assert.strictEqual(caseTidakTunggal.case.status_keterjaminan, 'Terjamin JR');
    assert.strictEqual(caseTidakTunggal.case.no_gl, null);
    assert.strictEqual(caseTidakTunggal.case.tgl_gl, null);

    const caseTunggal = await insertCaseWithRetry({
      hospital_id: fixture.hospitalId,
      rumah_sakit: fixture.hospitalName,
      nama_korban: 'Korban Tunggal',
      jenis_laka: 'Tunggal',
      waktu_lapor_wa: new Date()
    });
    assert.strictEqual(caseTunggal.case.status_keterjaminan, 'Dialihkan ke BPJS');

    const caseDefault = await insertCaseWithRetry({
      hospital_id: fixture.hospitalId,
      rumah_sakit: fixture.hospitalName,
      nama_korban: 'Korban Kosong',
      waktu_lapor_wa: new Date()
    });
    assert.strictEqual(caseDefault.case.status_keterjaminan, 'Belum Dikonfirmasi');

    const caseExplicitStatus = await insertCaseWithRetry({
      hospital_id: fixture.hospitalId,
      rumah_sakit: fixture.hospitalName,
      nama_korban: 'Korban Explicit',
      jenis_laka: 'Tunggal',
      status_keterjaminan: 'Terjamin JR',
      no_gl: 'GL-12345',
      tgl_gl: '12/11/2026',
      waktu_lapor_wa: new Date()
    });
    assert.strictEqual(caseExplicitStatus.case.status_keterjaminan, 'Terjamin JR');
    assert.strictEqual(caseExplicitStatus.case.no_gl, 'GL-12345');
    assert.strictEqual(caseExplicitStatus.case.tgl_gl, '12/11/2026');

    // Setup an assigned case for HTTP PATCH tests
    const assignedCase = await insertCaseWithRetry({
      hospital_id: fixture.hospitalId,
      rumah_sakit: fixture.hospitalName,
      nama_korban: 'Target Patch',
      jenis_laka: 'Belum Diketahui',
      waktu_lapor_wa: new Date()
    }, { assignedOfficer: { id: fixture.assigneeOfficerId, nama: 'Assignee' } });
    const targetCaseId = assignedCase.caseId;

    // 2. HTTP PATCH: unauthenticated -> 401
    const noAuth = await request('PATCH', `/api/cases/${targetCaseId}/keterjaminan`, {
      status_keterjaminan: 'Terjamin JR'
    });
    assert.strictEqual(noAuth.status, 401);

    // 3. HTTP PATCH: other petugas (non-assignee) -> 403
    const forbidden = await request('PATCH', `/api/cases/${targetCaseId}/keterjaminan`, {
      status_keterjaminan: 'Terjamin JR'
    }, otherToken);
    assert.strictEqual(forbidden.status, 403);

    // 4. HTTP PATCH: non-existent case -> 404
    const notFound = await request('PATCH', `/api/cases/9999999/keterjaminan`, {
      status_keterjaminan: 'Terjamin JR'
    }, kabagToken);
    assert.strictEqual(notFound.status, 404);

    // 5. HTTP PATCH: invalid status enum -> 422
    const invalidStatus = await request('PATCH', `/api/cases/${targetCaseId}/keterjaminan`, {
      status_keterjaminan: 'Status Ngawur'
    }, assigneeToken);
    assert.strictEqual(invalidStatus.status, 422);

    // 6. HTTP PATCH: invalid tgl_gl format -> 422
    const invalidDate = await request('PATCH', `/api/cases/${targetCaseId}/keterjaminan`, {
      status_keterjaminan: 'Terjamin JR',
      tgl_gl: '2026-11-12'
    }, assigneeToken);
    assert.strictEqual(invalidDate.status, 422);

    const impossibleDate = await request('PATCH', `/api/cases/${targetCaseId}/keterjaminan`, {
      status_keterjaminan: 'Terjamin JR',
      tgl_gl: '31/04/2026'
    }, assigneeToken);
    assert.strictEqual(impossibleDate.status, 422);

    // 7. HTTP PATCH: assignee petugas 200 with canonical date normalization
    const assigneePatch = await request('PATCH', `/api/cases/${targetCaseId}/keterjaminan`, {
      status_keterjaminan: 'Terjamin JR',
      no_gl: 'GL/JR/001',
      tgl_gl: '1/11/2026' // single digits should normalize to 01/11/2026
    }, assigneeToken);
    assert.strictEqual(assigneePatch.status, 200, JSON.stringify(assigneePatch.body));
    assert.strictEqual(assigneePatch.body.success, true);
    assert.strictEqual(assigneePatch.body.data.id, targetCaseId);
    assert.strictEqual(assigneePatch.body.data.status_keterjaminan, 'Terjamin JR');
    assert.strictEqual(assigneePatch.body.data.no_gl, 'GL/JR/001');
    assert.strictEqual(assigneePatch.body.data.tgl_gl, '01/11/2026');

    // Verify in DB
    const [[rowInDb]] = await pool.execute('SELECT status_keterjaminan, no_gl, tgl_gl FROM cases WHERE id = ?', [targetCaseId]);
    assert.strictEqual(rowInDb.status_keterjaminan, 'Terjamin JR');
    assert.strictEqual(rowInDb.no_gl, 'GL/JR/001');
    assert.strictEqual(rowInDb.tgl_gl, '01/11/2026');

    // 8. HTTP PATCH: kabag 200, update status to Dialihkan ke BPJS and clear GL fields
    const kabagPatch = await request('PATCH', `/api/cases/${targetCaseId}/keterjaminan`, {
      status_keterjaminan: 'Dialihkan ke BPJS',
      no_gl: null,
      tgl_gl: null
    }, kabagToken);
    assert.strictEqual(kabagPatch.status, 200, JSON.stringify(kabagPatch.body));
    assert.strictEqual(kabagPatch.body.data.status_keterjaminan, 'Dialihkan ke BPJS');
    assert.strictEqual(kabagPatch.body.data.no_gl, null);
    assert.strictEqual(kabagPatch.body.data.tgl_gl, null);

    // 9. HTTP PATCH: partial update (keep old no_gl / tgl_gl when not provided)
    // First set no_gl again
    await request('PATCH', `/api/cases/${targetCaseId}/keterjaminan`, {
      status_keterjaminan: 'Terjamin JR',
      no_gl: 'GL/KEEP/999',
      tgl_gl: '15/11/2026'
    }, kabagToken);
    // Then patch only status
    const partialPatch = await request('PATCH', `/api/cases/${targetCaseId}/keterjaminan`, {
      status_keterjaminan: 'Belum Dikonfirmasi'
    }, kabagToken);
    assert.strictEqual(partialPatch.status, 200);
    assert.strictEqual(partialPatch.body.data.status_keterjaminan, 'Belum Dikonfirmasi');
    assert.strictEqual(partialPatch.body.data.no_gl, 'GL/KEEP/999');
    assert.strictEqual(partialPatch.body.data.tgl_gl, '15/11/2026');

    console.log('PASS guarantee_fase1_integration_test');
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
