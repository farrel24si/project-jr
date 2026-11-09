const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { parseLaporanRS, normalizeStatus, generateNomorTiket } = require('../src/bot/parser');
const { detectHospitalFromGroup } = require('../src/bot/whatsapp');
const { haversine } = require('../src/utils/geo');
const {
  normalizeWhatsAppNumber,
  buildWhatsAppJid,
  buildNewAssignmentMessage,
  determineReminderType,
  buildReminderMessage
} = require('../src/services/notifications');

function testAuthRefusesMissingJwtSecret() {
  const script = `
    process.env.JWT_SECRET = '';
    try {
      require(${JSON.stringify(path.resolve(__dirname, '../src/middleware/auth.js'))});
      process.exitCode = 2;
    } catch (error) {
      if (/JWT_SECRET/.test(error.message)) process.exitCode = 0;
      else { console.error(error.message); process.exitCode = 3; }
    }
  `;
  const child = spawnSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, JWT_SECRET: '' },
    encoding: 'utf8'
  });
  assert.equal(child.status, 0, `Missing JWT_SECRET should fail clearly: ${child.stderr}`);
  console.log('PASS testAuthRefusesMissingJwtSecret');
}

function testNormalizeWhatsAppNumber() {
  assert.strictEqual(normalizeWhatsAppNumber('0812-3456-7890'), '6281234567890');
  assert.strictEqual(normalizeWhatsAppNumber('+62 812 3456 7890'), '6281234567890');
  assert.strictEqual(normalizeWhatsAppNumber('6281234567890'), '6281234567890');
  assert.strictEqual(normalizeWhatsAppNumber('12345'), null);
  console.log('PASS testNormalizeWhatsAppNumber');
}

function testBuildWhatsAppJid() {
  assert.strictEqual(buildWhatsAppJid('0812-3456-7890'), '6281234567890@s.whatsapp.net');
  assert.strictEqual(buildWhatsAppJid('12345'), null);
  console.log('PASS testBuildWhatsAppJid');
}

function testBuildNewAssignmentMessage() {
  const message = buildNewAssignmentMessage({
    officerName: 'Andi Pratama',
    ticket: 'JR-ABC123',
    victimName: 'Budi Santoso',
    hospitalName: 'RS Syafira Pekanbaru',
    condition: 'Rawat Inap',
    scheduledAt: new Date('2026-11-11T16:38:01.000Z')
  });
  assert.match(message, /Andi Pratama/);
  assert.match(message, /JR-ABC123/);
  assert.match(message, /Budi Santoso/);
  assert.match(message, /RS Syafira Pekanbaru/);
  assert.match(message, /72 jam/i);
  console.log('PASS testBuildNewAssignmentMessage');
}

function testDetermineReminderType() {
  const now = new Date('2026-11-09T10:00:00.000Z');
  // Sisa 20 jam -> REMINDER_24H
  assert.strictEqual(
    determineReminderType(now, new Date('2026-11-10T06:00:00.000Z')),
    'REMINDER_24H'
  );
  // Sisa 8 jam -> REMINDER_12H
  assert.strictEqual(
    determineReminderType(now, new Date('2026-11-09T18:00:00.000Z')),
    'REMINDER_12H'
  );
  // Sisa 2 jam -> REMINDER_3H
  assert.strictEqual(
    determineReminderType(now, new Date('2026-11-09T12:00:00.000Z')),
    'REMINDER_3H'
  );
  // Sisa 30 jam -> null (belum waktunya)
  assert.strictEqual(
    determineReminderType(now, new Date('2026-11-10T16:00:00.000Z')),
    null
  );
  // Sudah lewat -> null (tidak kirim reminder, dashboard yang handle overdue)
  assert.strictEqual(
    determineReminderType(now, new Date('2026-11-09T09:00:00.000Z')),
    null
  );
  console.log('PASS testDetermineReminderType');
}

function testBuildReminderMessage() {
  const msg = buildReminderMessage({
    officerName: 'Andi',
    ticket: 'JR-XYZ',
    victimName: 'Siti',
    hospitalName: 'RS Prima',
    reminderType: 'REMINDER_3H',
    scheduledAt: new Date('2026-11-09T12:00:00.000Z')
  });
  assert.match(msg, /PENGINGAT BATAS WAKTU KUNJUNGAN/i);
  assert.match(msg, /3 Jam/);
  console.log('PASS testBuildReminderMessage');
}

function testParseValid() {
  const text = `#LAPORLAKA
RS: RS Syafira
Nama: Budi Setiawan
NIK: 1471012345678901
Umur: 34
Alamat: Jl. Sudirman No. 12
Tgl Laka: 29/10/2026
Tgl Masuk: 30/10/2026
Kronologi: Kecelakaan di persimpangan
Status: Rawat Inap`;

  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.data.nama_korban, 'Budi Setiawan');
  assert.strictEqual(result.data.nik, '1471012345678901');
  assert.strictEqual(result.data.umur, 34);
  assert.strictEqual(result.data.rumah_sakit, 'RS Syafira');
  assert.strictEqual(result.data.status_kondisi, 'Rawat Inap');
  assert.strictEqual(result.data.tgl_laka, '29/10/2026');
  console.log('PASS testParseValid');
}

function testParseValueWithColon() {
  const text = `#LAPORLAKA
RS: RS Prima
Nama: Ani
NIK: 3201012345678901
Alamat: Jl. Melati 5
Kronologi: Kecelakaan: ditabrak dari belakang saat berhenti`;

  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.data.kronologi, 'Kecelakaan: ditabrak dari belakang saat berhenti');
  console.log('PASS testParseValueWithColon');
}

function testParseKeyNormalization() {
  const text = `#LAPORLAKA
rumah_sakit: RS Syafira
nama_korban: Cici
nik: 3201012345678901
tanggal_laka: 28/10/2026
tanggal_masuk: 01/11/2026`;

  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.data.rumah_sakit, 'RS Syafira');
  assert.strictEqual(result.data.nama_korban, 'Cici');
  assert.strictEqual(result.data.tgl_masuk, '01/11/2026');
  assert.strictEqual(result.data.tgl_laka, '28/10/2026');
  console.log('PASS testParseKeyNormalization');
}

function testParseNikNonDigits() {
  const text = `#LAPORLAKA
RS: RS Syafira
Nama: Dodi
NIK: 3201-0123-4567-8901`;

  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.data.nik, '3201012345678901');
  console.log('PASS testParseNikNonDigits');
}

function testParseMinimalReport() {
  const text = `#LAPORLAKA
RS: RS Syafira Pekanbaru
Nama: Budi Setiawan`;

  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.data.nama_korban, 'Budi Setiawan');
  assert.strictEqual(result.data.nik, null);
  assert.strictEqual(result.data.jenis_laka, 'Belum Diketahui');
  assert.strictEqual(result.data.status_kondisi, 'Rawat Inap');
  console.log('PASS testParseMinimalReport');
}

function testParseNikEmptyIsOptional() {
  const text = `#LAPORLAKA
RS: RS Prima Pekanbaru
Nama: Siti
NIK:
Umur: 22`;

  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.data.nik, null);
  assert.strictEqual(result.data.umur, 22);
  console.log('PASS testParseNikEmptyIsOptional');
}

function testParseMissingRs() {
  const text = `#LAPORLAKA
Nama: Joko
NIK: 1471012345678901`;

  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, false);
  console.log('PASS testParseMissingRs');
}

function testParseJenisLaka() {
  const tunggal = parseLaporanRS(`#LAPORLAKA
RS: RS Syafira Pekanbaru
Nama: A
Jenis Laka: Tunggal`);
  assert.strictEqual(tunggal.data.jenis_laka, 'Tunggal');

  const tidakTunggal = parseLaporanRS(`#LAPORLAKA
RS: RS Syafira Pekanbaru
Nama: B
jenis_laka: tidak tunggal`);
  assert.strictEqual(tidakTunggal.data.jenis_laka, 'Tidak Tunggal');

  const asing = parseLaporanRS(`#LAPORLAKA
RS: RS Syafira Pekanbaru
Nama: C
Jenis Laka: entah`);
  assert.strictEqual(asing.data.jenis_laka, 'Belum Diketahui');

  console.log('PASS testParseJenisLaka');
}


function testParseMissingNama() {
  const text = `#LAPORLAKA
RS: RS Syafira
NIK: 1471012345678901`;

  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, false);
  console.log('PASS testParseMissingNama');
}

function testParseNikWrongLengthIsStoredAsNull() {
  const text = `#LAPORLAKA
RS: RS Prima Pekanbaru
Nama: Eko
NIK: 12345`;

  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.data.nik, null);
  console.log('PASS testParseNikWrongLengthIsStoredAsNull');
}

function testStatusFallback() {
  assert.strictEqual(normalizeStatus('Pulang Paksa'), 'Rawat Inap');
  assert.strictEqual(normalizeStatus('meninggal dunia'), 'Meninggal Dunia');
  assert.strictEqual(normalizeStatus(''), 'Rawat Inap');
  assert.strictEqual(normalizeStatus(undefined), 'Rawat Inap');
  console.log('PASS testStatusFallback');
}

function testNomorTiketFormat() {
  const tiket = generateNomorTiket();
  assert.ok(/^JR-[0-9A-F]{6}$/.test(tiket), `Format tiket salah: ${tiket}`);
  console.log('PASS testNomorTiketFormat');
}

function testHaversine() {
  const d0 = haversine(0.49968, 101.45475, 0.49968, 101.45475);
  assert.ok(d0 < 1, 'Jarak titik sama harus ~0');
  const d = haversine(0.49968, 101.45475, 0.48231, 101.41892);
  assert.ok(d > 3000 && d < 5000, `Jarak RS Syafira -> RS Prima aneh: ${d}`);
  console.log('PASS testHaversine');
}

// --------- Test parser tanpa RS (requireRumahSakit: false) -----------
function testParseWithoutRs() {
  const text = `#LAPORLAKA
Nama: Budi Setiawan
Umur: 34`;
  const result = parseLaporanRS(text, { requireRumahSakit: false });
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.data.nama_korban, 'Budi Setiawan');
  assert.strictEqual(result.data.rumah_sakit, null);
  console.log('PASS testParseWithoutRs');
}

function testParseWithoutRsStillRequiresNama() {
  const text = `#LAPORLAKA
Umur: 34`;
  const result = parseLaporanRS(text, { requireRumahSakit: false });
  assert.strictEqual(result.isValid, false);
  console.log('PASS testParseWithoutRsStillRequiresNama');
}

// --------- Test deteksi RS dari nama grup WhatsApp -----------
function testDetectHospitalFromGroup() {
  const hospitals = [
    { id: 1, nama_rs: 'RS Prima Pekanbaru' },
    { id: 2, nama_rs: 'RS Syafira Pekanbaru' }
  ];

  // Nama standar
  const h1 = detectHospitalFromGroup('Jasa Raharja - RS Syafira Pekanbaru', hospitals);
  assert.ok(h1, 'Harus cocok RS Syafira');
  assert.strictEqual(h1.id, 2);

  // Format tidak standar
  const h2 = detectHospitalFromGroup('Grup Laka RS Prima Pekanbaru - JR Riau', hospitals);
  assert.ok(h2, 'Harus cocok RS Prima');
  assert.strictEqual(h2.id, 1);

  // Tanpa nama RS
  const h3 = detectHospitalFromGroup('Koordinasi JR Riau 2026', hospitals);
  assert.strictEqual(h3, null, 'Tidak boleh cocok');

  // Lebih dari satu RS dalam judul
  const h4 = detectHospitalFromGroup('RS Syafira Pekanbaru dan RS Prima Pekanbaru', hospitals);
  assert.strictEqual(h4, null, 'Dua RS cocok harus return null');

  console.log('PASS testDetectHospitalFromGroup');
}

function testDetectHospitalLongestFirst() {
  // Cek substring safety: RS Prima vs RS Prima Pekanbaru
  const hospitals = [
    { id: 1, nama_rs: 'RS Prima' },
    { id: 2, nama_rs: 'RS Prima Pekanbaru' }
  ];
  const h = detectHospitalFromGroup('Jasa Raharja RS Prima Pekanbaru', hospitals);
  // Keduanya match — harus null (ambigu: dua RS cocok)
  // Kecuali "RS Prima" sebagai frasa utuh juga ada terpisah oleh batas kata,
  // maka memang ambigu. Deteksi mengembalikan null.
  assert.strictEqual(h, null, 'Ambigu — dua RS cocok');
  console.log('PASS testDetectHospitalLongestFirst');
}

const tests = [
  testAuthRefusesMissingJwtSecret,
  testNormalizeWhatsAppNumber,
  testBuildWhatsAppJid,
  testBuildNewAssignmentMessage,
  testDetermineReminderType,
  testBuildReminderMessage,
  testParseValid,
  testParseValueWithColon,
  testParseKeyNormalization,
  testParseNikNonDigits,
  testParseMinimalReport,
  testParseNikEmptyIsOptional,
  testParseMissingRs,
  testParseJenisLaka,
  testParseMissingNama,
  testParseNikWrongLengthIsStoredAsNull,
  testStatusFallback,
  testNomorTiketFormat,
  testHaversine,
  testParseWithoutRs,
  testParseWithoutRsStillRequiresNama,
  testDetectHospitalFromGroup,
  testDetectHospitalLongestFirst
];

let failed = 0;
for (const test of tests) {
  try {
    test();
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${test.name}:`, err.message);
  }
}

if (failed > 0) {
  console.error(`${failed} test gagal`);
  process.exit(1);
}
console.log(`Semua ${tests.length} test lulus`);
