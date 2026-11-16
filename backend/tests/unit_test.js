const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { parseLaporanRS, normalizeStatus, normalizeDateDDMMYYYY, generateNomorTiket } = require('../src/bot/parser');
const { detectHospitalFromGroup, resolveHospitalFromGroup, handleMessage } = require('../src/bot/whatsapp');
const { mapKeterjaminanFromJenisLaka } = require('../src/services/caseCreation');
const { haversine } = require('../src/utils/geo');
const {
  normalizeWhatsAppNumber,
  buildWhatsAppJid,
  buildNewAssignmentMessage,
  determineReminderType,
  buildReminderMessage,
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
  // Tidak ada timestamp absolut di DM tugas (tanggal detail hanya di pesan pengingat)
  assert.doesNotMatch(message, /\d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(message, /\d{2}:\d{2}:\d{2}/);
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
  assert.doesNotMatch(msg, /sisa waktu/i);
  assert.doesNotMatch(msg, /kunjungan pertama/i);
  assert.match(msg, /Batas Kunjungan: 2026-11-09 19:00:00 WIB/);
  assert.match(msg, /Segera lakukan kunjungan fisik/);
  console.log('PASS testBuildReminderMessage');
}

async function testHandleMessageRejectsDmReportUnlessAllowed() {
  const pool = require('../src/config/db');
  const originalExecute = pool.execute;
  const prevAllowDm = process.env.ALLOW_DM_REPORTS;
  delete process.env.ALLOW_DM_REPORTS;

  pool.execute = async () => {
    throw new Error('DB must not be touched when DM #LAPORLAKA is rejected');
  };

  const records = [];
  const sock = {
    sendMessage: async (jid, payload) => { records.push({ jid, payload }); }
  };

  try {
    await handleMessage(sock, {
      key: { remoteJid: '6281234567890@s.whatsapp.net', fromMe: false },
      message: { conversation: '#LAPORLAKA\nRS: RS Syafira Pekanbaru\nNama: Korban DM' }
    });
    assert.strictEqual(records.length, 1);
    assert.match(records[0].payload.text, /Grup WhatsApp Rumah Sakit/i);
  } finally {
    pool.execute = originalExecute;
    if (prevAllowDm !== undefined) process.env.ALLOW_DM_REPORTS = prevAllowDm;
    else delete process.env.ALLOW_DM_REPORTS;
  }
  console.log('PASS testHandleMessageRejectsDmReportUnlessAllowed');
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

function testNormalizeDateDDMMYYYY() {
  // Contract: canonical DD/MM/YYYY, four-digit year, slash separators only.
  assert.strictEqual(normalizeDateDDMMYYYY('29/10/2026'), '29/10/2026');
  assert.strictEqual(normalizeDateDDMMYYYY('01/05/2026'), '01/05/2026');

  // Single-digit day/month accepted and padded to canonical form.
  assert.strictEqual(normalizeDateDDMMYYYY('1/1/2026'), '01/01/2026');
  assert.strictEqual(normalizeDateDDMMYYYY('9/12/2026'), '09/12/2026');

  // Two-digit year and hyphen separators are not canonical -> rejected.
  assert.strictEqual(normalizeDateDDMMYYYY('29/10/26'), null);
  assert.strictEqual(normalizeDateDDMMYYYY('01/02/05'), null);
  assert.strictEqual(normalizeDateDDMMYYYY('29-10-2026'), null);

  // Rejected MM/DD/YYYY (e.g. month > 12 in 2nd slot or ambiguity)
  assert.strictEqual(normalizeDateDDMMYYYY('10/29/2026'), null);
  assert.strictEqual(normalizeDateDDMMYYYY('12/31/2026'), null);

  // Impossible dates
  assert.strictEqual(normalizeDateDDMMYYYY('31/04/2026'), null);
  assert.strictEqual(normalizeDateDDMMYYYY('29/02/2025'), null);
  assert.strictEqual(normalizeDateDDMMYYYY('29/02/2024'), '29/02/2024'); // leap year valid
  assert.strictEqual(normalizeDateDDMMYYYY('00/10/2026'), null);
  assert.strictEqual(normalizeDateDDMMYYYY('15/13/2026'), null);
  assert.strictEqual(normalizeDateDDMMYYYY('invalid-date'), null);

  // Optional empty values
  assert.strictEqual(normalizeDateDDMMYYYY(''), '');
  assert.strictEqual(normalizeDateDDMMYYYY(null), null);
  assert.strictEqual(normalizeDateDDMMYYYY(undefined), undefined);

  console.log('PASS testNormalizeDateDDMMYYYY');
}

function testParseLaporanRSDateHandling() {
  // Canonical four-digit DD/MM/YYYY; single-digit day/month padded.
  const valid = parseLaporanRS(`#LAPORLAKA
RS: RS Syafira
Nama: Budi
Tgl Laka: 29/10/2026
Tgl Masuk: 1/1/2026`);
  assert.strictEqual(valid.isValid, true);
  assert.strictEqual(valid.data.tgl_laka, '29/10/2026');
  assert.strictEqual(valid.data.tgl_masuk, '01/01/2026');

  // Two-digit year and hyphen separators rejected in bot reports too.
  const shortYear = parseLaporanRS(`#LAPORLAKA
RS: RS Syafira
Nama: Budi
Tgl Laka: 29/10/26`);
  assert.strictEqual(shortYear.isValid, false);
  assert.match(shortYear.error, /DD\/MM\/YYYY/);

  const hyphenDate = parseLaporanRS(`#LAPORLAKA
RS: RS Syafira
Nama: Budi
Tgl Laka: 29-10-2026`);
  assert.strictEqual(hyphenDate.isValid, false);
  assert.match(hyphenDate.error, /DD\/MM\/YYYY/);

  // Optional empty dates
  const emptyDates = parseLaporanRS(`#LAPORLAKA
RS: RS Syafira
Nama: Budi
Tgl Laka:
Tgl Masuk:`);
  assert.strictEqual(emptyDates.isValid, true);
  assert.strictEqual(emptyDates.data.tgl_laka, '');
  assert.strictEqual(emptyDates.data.tgl_masuk, '');

  // Invalid date format (MM/DD/YYYY or impossible date) in report -> invalid format error
  const invalidDate = parseLaporanRS(`#LAPORLAKA
RS: RS Syafira
Nama: Budi
Tgl Laka: 10/29/2026`);
  assert.strictEqual(invalidDate.isValid, false);
  assert.match(invalidDate.error, /DD\/MM\/YYYY/);

  const impossibleDate = parseLaporanRS(`#LAPORLAKA
RS: RS Syafira
Nama: Budi
Tgl Masuk: 31/04/2026`);
  assert.strictEqual(impossibleDate.isValid, false);
  assert.match(impossibleDate.error, /DD\/MM\/YYYY/);

  console.log('PASS testParseLaporanRSDateHandling');
}

function testParseLaporanRSTemplatePlaceholderTglMasuk() {
  // Template placeholder "DD/MM/YYYY" pada Tgl Masuk -> dianggap kosong, laporan valid.
  const text = `#LAPORLAKA
RS: RS Syafira
Nama: Budi
Tgl Masuk: DD/MM/YYYY`;
  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.data.tgl_masuk, '');
  console.log('PASS testParseLaporanRSTemplatePlaceholderTglMasuk');
}

function testParseLaporanRSTemplatePlaceholderTglLakaCaseInsensitive() {
  // Case-insensitive: "tgl laka: dd/mm/yyyy" juga dianggap kosong.
  const text = `#LAPORLAKA
RS: RS Syafira
Nama: Budi
tgl laka: dd/mm/yyyy`;
  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.data.tgl_laka, '');
  console.log('PASS testParseLaporanRSTemplatePlaceholderTglLakaCaseInsensitive');
}

function testParseLaporanRSNikOpsionalFullTemplateKey() {
  // Key template penuh "NIK (opsional, 16 digit):" -> nik tertangkap, tidak di-drop.
  const text = `#LAPORLAKA
RS: RS Syafira
Nama: Budi
NIK (opsional, 16 digit): 1627893678456398`;
  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.data.nik, '1627893678456398');
  console.log('PASS testParseLaporanRSNikOpsionalFullTemplateKey');
}

function testParseLaporanRSInvalidDateStillRejected() {
  // Tanggal tidak mungkin tetap ditolak dengan pesan format DD/MM/YYYY.
  const text = `#LAPORLAKA
RS: RS Syafira
Nama: Budi
Tgl Masuk: 31/04/2026`;
  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, false);
  assert.match(result.error, /DD\/MM\/YYYY/);
  console.log('PASS testParseLaporanRSInvalidDateStillRejected');
}

async function testHandleMessageInvalidParseShowsRealError() {
  const pool = require('../src/config/db');
  const originalExecute = pool.execute;
  // Path invalid tidak boleh menyentuh DB sama sekali.
  pool.execute = async () => {
    throw new Error('DB must not be touched on invalid parse path');
  };

  const records = [];
  const sock = {
    sendMessage: async (jid, payload) => { records.push({ jid, payload }); }
  };
  const msg = {
    key: { remoteJid: '123@g.us', participant: 'x@s.whatsapp.net', fromMe: false },
    message: { conversation: '#LAPORLAKA\nNama: X\nTgl Masuk: 31/04/2026' }
  };

  try {
    await handleMessage(sock, msg);

    assert.ok(records.length >= 1, 'Harus ada balasan');
    const textReply = records[0].payload.text;
    assert.match(textReply, /Format tanggal tidak valid/);
    assert.ok(!/nama wajib/i.test(textReply), 'Tidak boleh menyalahkan nama korban');
    assert.match(textReply, /#FORMAT/);
  } finally {
    pool.execute = originalExecute;
  }
  console.log('PASS testHandleMessageInvalidParseShowsRealError');
}

async function testFormatTemplateIsClean() {
  const pool = require('../src/config/db');
  const originalExecute = pool.execute;
  // Path #FORMAT tidak boleh menyentuh DB.
  pool.execute = async () => {
    throw new Error('DB must not be touched on #FORMAT path');
  };

  const records = [];
  const sock = {
    sendMessage: async (jid, payload) => { records.push({ jid, payload }); }
  };

  try {
    // Grup: template tanpa baris RS
    await handleMessage(sock, {
      key: { remoteJid: '123@g.us', participant: 'x@s.whatsapp.net', fromMe: false },
      message: { conversation: '#FORMAT' }
    });
    assert.strictEqual(records.length, 1);
    const grupText = records[0].payload.text;
    assert.match(grupText, /^#LAPORLAKA/);
    assert.match(grupText, /Jenis Laka:\n/);
    assert.match(grupText, /Tgl Laka:\n/);
    assert.match(grupText, /Tgl Masuk:\n/);
    assert.match(grupText, /Status: Rawat Inap \/ Luka Ringan \/ Luka Berat \/ Meninggal Dunia$/);
    assert.doesNotMatch(grupText, /Tunggal \/ Tidak Tunggal/);
    assert.doesNotMatch(grupText, /DD\/MM\/YYYY/);
    assert.doesNotMatch(grupText, /Selesai/);
    assert.doesNotMatch(grupText, /^RS:/m);

    // DM: template wajib ada baris RS
    records.length = 0;
    await handleMessage(sock, {
      key: { remoteJid: '6281111111111@s.whatsapp.net', fromMe: false },
      message: { conversation: '#format' }
    });
    assert.strictEqual(records.length, 1);
    const dmText = records[0].payload.text;
    assert.match(dmText, /^#LAPORLAKA\nRS: /);
    assert.match(dmText, /Jenis Laka:\n/);
    assert.doesNotMatch(dmText, /DD\/MM\/YYYY/);
    assert.doesNotMatch(dmText, /Selesai/);
  } finally {
    pool.execute = originalExecute;
  }
  console.log('PASS testFormatTemplateIsClean');
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

function testResolveHospitalFromGroup() {
  const hospitals = [
    { id: 1, nama_rs: 'RS Prima Pekanbaru' },
    { id: 2, nama_rs: 'RS Syafira Pekanbaru' }
  ];

  // 1. Binding JID grup aktif yang persis diprioritaskan.
  const bindings = [
    { group_jid: '123456789@g.us', hospital_id: 2 }
  ];
  const viaJid = resolveHospitalFromGroup('JR - RS Prima', '123456789@g.us', hospitals, [], bindings);
  assert.ok(viaJid, 'Binding JID harus menang');
  assert.strictEqual(viaJid.id, 2);

  // 2. Alias aktif unik menang atas canonical name.
  const aliases = [
    { alias_normalized: 'rs prima', alias_display: 'RS Prima', hospital_id: 1, is_active: 1 }
  ];
  const viaAlias = resolveHospitalFromGroup('JR - RS Prima', '999999999@g.us', hospitals, aliases, []);
  assert.ok(viaAlias, 'Alias harus menghasilkan RS');
  assert.strictEqual(viaAlias.id, 1, 'Alias RS Prima harus menunjuk RS Prima Pekanbaru');

  // 3. Alias tidak dikenal -> null (canonical fallback tidak cocok juga).
  const unknown = resolveHospitalFromGroup('JR - RS Tak Dikenal', '999999999@g.us', hospitals, aliases, []);
  assert.strictEqual(unknown, null, 'Alias tidak dikenal harus null');

  // 4. Alias sama dipetakan ke dua RS -> ambigu, null.
  const ambiguousAliases = aliases.concat([
    { alias_normalized: 'rs prima', alias_display: 'RS Prima', hospital_id: 2, is_active: 1 }
  ]);
  const ambiguous = resolveHospitalFromGroup('JR - RS Prima', '999999999@g.us', hospitals, ambiguousAliases, []);
  assert.strictEqual(ambiguous, null, 'Alias ambigu harus null');

  // 5. Normalisasi alias: lowercase, trim, spasi berulang, tanda baca.
  const messy = resolveHospitalFromGroup('JR - RS  Prima!!!', '999999999@g.us', hospitals, aliases, []);
  assert.ok(messy, 'Normalisasi harus tetap cocok');
  assert.strictEqual(messy.id, 1);

  // 6. Canonical fallback hanya bila hasil tepat satu.
  const canonical = resolveHospitalFromGroup('Jasa Raharja - RS Syafira Pekanbaru', '999999999@g.us', hospitals, [], []);
  assert.ok(canonical, 'Fallback canonical harus cocok');
  assert.strictEqual(canonical.id, 2);

  const twoCanonical = resolveHospitalFromGroup('RS Syafira Pekanbaru dan RS Prima Pekanbaru', '999999999@g.us', hospitals, [], []);
  assert.strictEqual(twoCanonical, null, 'Dua RS cocok harus null');

  // 7. Alias diaktifkan untuk RS non-aktif -> tidak dipakai.
  const inactiveHospital = resolveHospitalFromGroup('JR - RS Prima', '999999999@g.us', [hospitals[1]], aliases, []);
  assert.strictEqual(inactiveHospital, null, 'Alias menunjuk RS non-aktif harus null');

  // 8. Binding JID menunjuk RS non-aktif -> tidak dipakai, lanjut ke alias.
  const jidToInactive = resolveHospitalFromGroup('JR - RS Prima', '123456789@g.us', [hospitals[0]], aliases, bindings);
  assert.ok(jidToInactive, 'Binding JID ke RS non-aktif harus lanjut ke alias');
  assert.strictEqual(jidToInactive.id, 1);

  console.log('PASS testResolveHospitalFromGroup');
}


function testMapKeterjaminanFromJenisLaka() {
  assert.strictEqual(mapKeterjaminanFromJenisLaka('Tidak Tunggal'), 'Terjamin JR');
  assert.strictEqual(mapKeterjaminanFromJenisLaka('Tunggal'), 'Belum Dikonfirmasi');
  assert.strictEqual(mapKeterjaminanFromJenisLaka('Belum Diketahui'), 'Belum Dikonfirmasi');
  assert.strictEqual(mapKeterjaminanFromJenisLaka(null), 'Belum Dikonfirmasi');
  assert.strictEqual(mapKeterjaminanFromJenisLaka(undefined), 'Belum Dikonfirmasi');
  assert.strictEqual(mapKeterjaminanFromJenisLaka(''), 'Belum Dikonfirmasi');
  assert.strictEqual(mapKeterjaminanFromJenisLaka('Nilai Tidak Dikenal'), 'Belum Dikonfirmasi');
  console.log('PASS testMapKeterjaminanFromJenisLaka');
}

// --------- Guarantee Letter Service unit tests (Fase 2) -----------

// --------- Guarantee Letter billing item unit tests (Fase 3) -----------

const tests = [
  testAuthRefusesMissingJwtSecret,
  testNormalizeWhatsAppNumber,
  testBuildWhatsAppJid,
  testBuildNewAssignmentMessage,
  testDetermineReminderType,
  testBuildReminderMessage,
  testHandleMessageRejectsDmReportUnlessAllowed,
  testParseValid,
  testNormalizeDateDDMMYYYY,
  testParseLaporanRSDateHandling,
  testParseLaporanRSTemplatePlaceholderTglMasuk,
  testParseLaporanRSTemplatePlaceholderTglLakaCaseInsensitive,
  testParseLaporanRSNikOpsionalFullTemplateKey,
  testParseLaporanRSInvalidDateStillRejected,
  testHandleMessageInvalidParseShowsRealError,
  testFormatTemplateIsClean,
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
  testDetectHospitalLongestFirst,
  testResolveHospitalFromGroup,
  testMapKeterjaminanFromJenisLaka
];

let failed = 0;
(async () => {
  for (const test of tests) {
    try {
      await test();
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${test.name}:`, err.message);
    }
  }

  if (failed > 0) {
    console.error(`${failed} test gagal`);
    process.exitCode = 1;
    return;
  }
  console.log(`Semua ${tests.length} test lulus`);
})();
