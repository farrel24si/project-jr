/**
 * HTTP integration test: GPS outside hospital radius remains submittable,
 * stores photo/location, and returns a verification alert.
 * Run: node tests/soft_geofence_integration_test.js
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const visitsRouter = require('../src/routes/visits');
const { JWT_SECRET } = require('../src/middleware/auth');

const stamp = `${Date.now()}_${process.pid}`;
const fixture = {};
let server;
let baseUrl;

function token(user) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
}

async function setup() {
  const [hospital] = await pool.execute(
    `INSERT INTO hospitals (nama_rs, alamat, latitude, longitude, radius_meter, is_active)
     VALUES (?, 'fixture soft geofence', 0, 0, 1, 1)`,
    [`RS Soft Geofence ${stamp}`]
  );
  fixture.hospitalId = hospital.insertId;

  const [officer] = await pool.execute(
    'INSERT INTO officers (nama, is_active) VALUES (?, 1)',
    [`Petugas Soft Geofence ${stamp}`]
  );
  fixture.officerId = officer.insertId;

  const [user] = await pool.execute(
    `INSERT INTO users (officer_id, username, password_hash, role, is_active)
     VALUES (?, ?, 'not-used', 'petugas', 1)`,
    [fixture.officerId, `soft_geofence_${stamp}`]
  );
  fixture.userId = user.insertId;

  const [caseResult] = await pool.execute(
    `INSERT INTO cases (
      nomor_tiket, rumah_sakit, hospital_id, assigned_officer_id,
      nama_korban, jenis_laka, status_kondisi, waktu_lapor_wa
    ) VALUES (?, ?, ?, ?, 'Korban Soft Geofence', 'Tunggal', 'Selesai', NOW())`,
    [`JR-SG${Date.now()}`, `RS Soft Geofence ${stamp}`, fixture.hospitalId, fixture.officerId]
  );
  fixture.caseId = caseResult.insertId;

  const [visit] = await pool.execute(
    `INSERT INTO visits (case_id, kunjungan_ke, jadwal_kunjungan, status_kunjungan)
     VALUES (?, 1, DATE_ADD(NOW(), INTERVAL 1 HOUR), 'Menunggu')`,
    [fixture.caseId]
  );
  fixture.visitId = visit.insertId;

  const app = express();
  app.use(express.json());
  app.use('/api/visits', visitsRouter);
  app.use('/uploads', require('../src/routes/evidence'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function cleanup() {
  if (server) await new Promise((resolve) => server.close(resolve));

  if (fixture.photoUrl) {
    await fs.promises.unlink(path.resolve(process.cwd(), `.${fixture.photoUrl}`)).catch(() => {});
  }
  if (fixture.caseId) await pool.execute('DELETE FROM cases WHERE id = ?', [fixture.caseId]);
  if (fixture.userId) await pool.execute('DELETE FROM users WHERE id = ?', [fixture.userId]);
  if (fixture.officerId) await pool.execute('DELETE FROM officers WHERE id = ?', [fixture.officerId]);
  if (fixture.hospitalId) await pool.execute('DELETE FROM hospitals WHERE id = ?', [fixture.hospitalId]);
  await pool.end();
}

async function main() {
  try {
    await setup();
    const form = new FormData();
    form.set('case_id', String(fixture.caseId));
    form.set('lat_petugas', '0.010000');
    form.set('lng_petugas', '0.000000');
    form.set('catatan_kondisi', 'GPS indoor meleset, tetap kunjungan fisik.');
    form.set('status_kondisi_terbaru', 'Selesai');
    form.set('cek_komunikasi_keluarga', 'true');
    form.set('cek_edukasi_santunan', 'true');
    form.set('cek_arahan_lp', 'true');
    // Nama file HTML dengan MIME JPEG harus tetap disimpan ber-ekstensi JPEG.
    form.set('foto_bukti', new Blob(['fixture-image'], { type: 'image/jpeg' }), 'bukti.html');

    const response = await fetch(`${baseUrl}/api/visits/${fixture.visitId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token({ userId: fixture.userId, role: 'petugas', officerId: fixture.officerId })}` },
      body: form
    });
    const body = await response.json();

    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.success, true);
    assert.equal(body.is_outside_hospital_radius, true);
    assert.equal(body.hospital_radius_meter, 1);
    assert.ok(body.jarak_dari_rs_meter > body.hospital_radius_meter);
    assert.match(body.verification_alert, /luar radius/i);

    const [[savedVisit]] = await pool.execute(
      `SELECT status_kunjungan, foto_bukti_url, lat_petugas, lng_petugas, jarak_dari_rs_meter
       FROM visits WHERE id = ?`,
      [fixture.visitId]
    );
    assert.match(savedVisit.status_kunjungan, /^Selesai/);
    assert.match(savedVisit.foto_bukti_url, /^\/uploads\/VISIT_\d+\.jpg$/);
    assert.equal(Number(savedVisit.lat_petugas), 0.01);
    assert.ok(Number(savedVisit.jarak_dari_rs_meter) > 1);
    fixture.photoUrl = savedVisit.foto_bukti_url;
    assert.equal(fs.existsSync(path.resolve(process.cwd(), `.${fixture.photoUrl}`)), true);

    // Keamanan: bukti foto hanya boleh dibuka pemilik kasus/kabag, bukan publik.
    const noAuth = await fetch(`${baseUrl}${fixture.photoUrl}`);
    assert.equal(noAuth.status, 401, 'Foto bukti tanpa token harus 401');

    const ownerPhoto = await fetch(`${baseUrl}${fixture.photoUrl}`, {
      headers: { Authorization: `Bearer ${token({ userId: fixture.userId, role: 'petugas', officerId: fixture.officerId })}` }
    });
    assert.equal(ownerPhoto.status, 200, 'Pemilik kasus boleh membuka bukti foto');

    // Test upload SVG ditolak (anti-XSS)
    const svgForm = new FormData();
    svgForm.set('case_id', String(fixture.caseId));
    svgForm.set('lat_petugas', '0.000000');
    svgForm.set('lng_petugas', '0.000000');
    svgForm.set('catatan_kondisi', 'Uji upload SVG');
    svgForm.set('status_kondisi_terbaru', 'Selesai');
    svgForm.set('cek_komunikasi_keluarga', 'true');
    svgForm.set('cek_edukasi_santunan', 'true');
    svgForm.set('cek_arahan_lp', 'true');
    svgForm.set('foto_bukti', new Blob(['<svg><script>alert(1)</script></svg>'], { type: 'image/svg+xml' }), 'xss.svg');

    const svgRes = await fetch(`${baseUrl}/api/visits/${fixture.visitId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token({ userId: fixture.userId, role: 'petugas', officerId: fixture.officerId })}` },
      body: svgForm
    });
    assert.equal(svgRes.status, 400, 'Upload SVG harus ditolak 400');
    const svgBody = await svgRes.json();
    assert.match(svgBody.message, /JPG, PNG, atau WebP/i);

    console.log('PASS reject dangerous SVG uploads');

    console.log('PASS soft geofence accepts outside-radius visit with photo and alert');
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
