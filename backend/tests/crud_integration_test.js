/**
 * End-to-end integration test for Master Data CRUD & Plotting:
 * - /api/hospitals (GET, POST, PUT, DELETE soft-delete)
 * - /api/officers (GET, POST, PUT, DELETE soft-delete)
 * - /api/officers/:id/hospitals (POST plotting, GET, DELETE plotting)
 * - /api/users (GET, POST, PUT, DELETE)
 *
 * Run: node tests/crud_integration_test.js
 */
const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const hospitalsRouter = require('../src/routes/hospitals');
const officersRouter = require('../src/routes/officers');
const usersRouter = require('../src/routes/users');
const { JWT_SECRET } = require('../src/middleware/auth');

const stamp = `${Date.now()}_${process.pid}`;
let server;
let baseUrl;
const created = {
  hospitals: [],
  officers: [],
  users: []
};
let kabagUserId;
let petugasUserId;

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

async function request(method, path, body, token) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function setup() {
  const app = express();
  app.use(express.json());
  app.use('/api/hospitals', hospitalsRouter);
  app.use('/api/officers', officersRouter);
  app.use('/api/users', usersRouter);

  const [kabag] = await pool.execute(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES (?, 'not-used', 'kabag', 1)`,
    [`kabag_crud_${stamp}`]
  );
  const [petugas] = await pool.execute(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES (?, 'not-used', 'petugas', 1)`,
    [`petugas_crud_${stamp}`]
  );
  created.users.push(kabag.insertId, petugas.insertId);
  kabagUserId = kabag.insertId;
  petugasUserId = petugas.insertId;

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function cleanup() {
  if (server) await new Promise((resolve) => server.close(resolve));

  if (created.users.length) {
    const ph = created.users.map(() => '?').join(',');
    await pool.execute(`DELETE FROM users WHERE id IN (${ph})`, created.users);
  }
  if (created.officers.length) {
    const ph = created.officers.map(() => '?').join(',');
    await pool.execute(`DELETE FROM officer_hospitals WHERE officer_id IN (${ph})`, created.officers);
    await pool.execute(`DELETE FROM officers WHERE id IN (${ph})`, created.officers);
  }
  if (created.hospitals.length) {
    const ph = created.hospitals.map(() => '?').join(',');
    await pool.execute(`DELETE FROM officer_hospitals WHERE hospital_id IN (${ph})`, created.hospitals);
    await pool.execute(`DELETE FROM hospitals WHERE id IN (${ph})`, created.hospitals);
  }

  await pool.end();
}

async function main() {
  try {
    await setup();

    const kabagToken = signToken({ userId: kabagUserId, role: 'kabag', officerId: null });
    const petugasToken = signToken({ userId: petugasUserId, role: 'petugas', officerId: 99992 });

    // =========================================================================
    // 1. CRUD HOSPITALS
    // =========================================================================
    // Unauthorized access
    const noAuthHospital = await request('GET', '/api/hospitals');
    assert.equal(noAuthHospital.status, 401);

    // Petugas cannot POST hospital (forbidden)
    const petugasPostRs = await request('POST', '/api/hospitals', {
      nama_rs: `RS Tes ${stamp}`,
      latitude: 0.5,
      longitude: 101.4,
      radius_meter: 200
    }, petugasToken);
    assert.equal(petugasPostRs.status, 403);

    // Kabag CREATE hospital
    const createRs = await request('POST', '/api/hospitals', {
      nama_rs: `RS Uji CRUD ${stamp}`,
      alamat: 'Jl. Sudirman No 10',
      latitude: 0.51234,
      longitude: 101.45123,
      radius_meter: 250
    }, kabagToken);
    assert.equal(createRs.status, 201);
    assert.equal(createRs.body.success, true);
    const hospitalId = createRs.body.data.id;
    created.hospitals.push(hospitalId);

    // Kabag READ hospitals
    const listRs = await request('GET', '/api/hospitals', null, kabagToken);
    assert.equal(listRs.status, 200);
    assert.ok(listRs.body.data.some((h) => h.id === hospitalId));

    // Kabag UPDATE hospital
    const updateRs = await request('PUT', `/api/hospitals/${hospitalId}`, {
      nama_rs: `RS Uji CRUD Updated ${stamp}`,
      alamat: 'Jl. Baru No 20',
      latitude: 0.52000,
      longitude: 101.46000,
      radius_meter: 300
    }, kabagToken);
    assert.equal(updateRs.status, 200);
    assert.equal(updateRs.body.data.nama_rs, `RS Uji CRUD Updated ${stamp}`);
    assert.equal(updateRs.body.data.radius_meter, 300);

    // Kabag DELETE (soft-delete) hospital
    const deleteRs = await request('DELETE', `/api/hospitals/${hospitalId}`, null, kabagToken);
    assert.equal(deleteRs.status, 200);
    assert.equal(deleteRs.body.success, true);

    // Hospital inactive should NOT appear in standard GET list
    const listRsActive = await request('GET', '/api/hospitals', null, kabagToken);
    assert.ok(!listRsActive.body.data.some((h) => h.id === hospitalId));

    // Hospital inactive should appear if include_inactive=true
    const listRsAll = await request('GET', '/api/hospitals?include_inactive=true', null, kabagToken);
    assert.ok(listRsAll.body.data.some((h) => h.id === hospitalId && h.is_active === 0));

    // Reactivate hospital for plotting test
    await pool.execute('UPDATE hospitals SET is_active = 1 WHERE id = ?', [hospitalId]);

    // =========================================================================
    // 2. CRUD OFFICERS
    // =========================================================================
    // Kabag CREATE officer
    const createOff = await request('POST', '/api/officers', {
      nama: `Petugas CRUD ${stamp}`,
      nip: `NIP_${stamp}`.slice(0, 30),
      jabatan: 'Petugas Monitoring',
      wilayah: 'Pekanbaru Kota',
      telepon: '6281122334455',
      email: `petugas_${stamp}@example.com`.slice(0, 150)
    }, kabagToken);
    assert.equal(createOff.status, 201);
    const officerId = createOff.body.data.id;
    created.officers.push(officerId);

    // Both kabag and petugas can READ officers list
    const listOff = await request('GET', '/api/officers', null, petugasToken);
    assert.equal(listOff.status, 200);
    assert.ok(listOff.body.data.some((o) => o.id === officerId));

    // READ single officer detail
    const getOff = await request('GET', `/api/officers/${officerId}`, null, kabagToken);
    assert.equal(getOff.status, 200);
    assert.equal(getOff.body.data.nama, `Petugas CRUD ${stamp}`);

    // Kabag UPDATE officer
    const updateOff = await request('PUT', `/api/officers/${officerId}`, {
      nama: `Petugas CRUD Edit ${stamp}`,
      wilayah: 'Rumbai'
    }, kabagToken);
    assert.equal(updateOff.status, 200);
    assert.equal(updateOff.body.data.nama, `Petugas CRUD Edit ${stamp}`);
    assert.equal(updateOff.body.data.wilayah, 'Rumbai');

    // =========================================================================
    // 3. PLOTTING OFFICERS <-> HOSPITALS
    // =========================================================================
    // Kabag plots officer to hospital
    const plotRs = await request('POST', `/api/officers/${officerId}/hospitals`, {
      hospital_id: hospitalId,
      is_primary: true
    }, kabagToken);
    assert.equal(plotRs.status, 201);
    assert.equal(plotRs.body.success, true);

    // Read plotting list
    const getPlot = await request('GET', `/api/officers/${officerId}/hospitals`, null, kabagToken);
    assert.equal(getPlot.status, 200);
    assert.ok(getPlot.body.data.some((p) => p.hospital_id === hospitalId && p.is_primary === 1));

    // Delete plotting
    const delPlot = await request('DELETE', `/api/officers/${officerId}/hospitals/${hospitalId}`, null, kabagToken);
    assert.equal(delPlot.status, 200);
    assert.equal(delPlot.body.success, true);

    // Verify plotting deleted
    const getPlotAfter = await request('GET', `/api/officers/${officerId}/hospitals`, null, kabagToken);
    assert.ok(!getPlotAfter.body.data.some((p) => p.hospital_id === hospitalId));

    // =========================================================================
    // 4. CRUD USERS
    // =========================================================================
    // Petugas cannot access /api/users
    const petugasGetUsers = await request('GET', '/api/users', null, petugasToken);
    assert.equal(petugasGetUsers.status, 403);

    // Kabag CREATE user linked to officer
    const createUser = await request('POST', '/api/users', {
      username: `user_${stamp}`.slice(0, 64),
      password: 'passwordRahasia123',
      role: 'petugas',
      officer_id: officerId
    }, kabagToken);
    assert.equal(createUser.status, 201);
    const userId = createUser.body.data.id;
    created.users.push(userId);

    // Duplicate username -> 409
    const dupUser = await request('POST', '/api/users', {
      username: `user_${stamp}`.slice(0, 64),
      password: 'passwordRahasia123',
      role: 'petugas',
      officer_id: officerId
    }, kabagToken);
    assert.equal(dupUser.status, 409);

    // Kabag READ users
    const listUsers = await request('GET', '/api/users', null, kabagToken);
    assert.equal(listUsers.status, 200);
    assert.ok(listUsers.body.data.some((u) => u.id === userId));

    // Kabag UPDATE user
    const updateUser = await request('PUT', `/api/users/${userId}`, {
      role: 'petugas',
      is_active: false
    }, kabagToken);
    assert.equal(updateUser.status, 200);
    assert.equal(updateUser.body.data.is_active, 0);

    // Kabag DELETE user
    const deleteUser = await request('DELETE', `/api/users/${userId}`, null, kabagToken);
    assert.equal(deleteUser.status, 200);
    assert.equal(deleteUser.body.success, true);

    // Soft delete officer
    const deleteOff = await request('DELETE', `/api/officers/${officerId}`, null, kabagToken);
    assert.equal(deleteOff.status, 200);

    console.log('PASS all Master Data CRUD & Plotting operations (Hospitals, Officers, Users)');
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
