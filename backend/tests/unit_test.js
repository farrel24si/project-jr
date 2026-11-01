const assert = require('assert');
const { parseLaporanRS, normalizeStatus, generateNomorTiket } = require('../src/bot/parser');
const { haversine } = require('../src/utils/geo');

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
Nama: Dodi
NIK: 3201-0123-4567-8901`;

  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.data.nik, '3201012345678901');
  console.log('PASS testParseNikNonDigits');
}

function testParseMissingNama() {
  const text = `#LAPORLAKA
RS: RS Syafira
NIK: 1471012345678901`;

  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, false);
  console.log('PASS testParseMissingNama');
}

function testParseNikWrongLength() {
  const text = `#LAPORLAKA
Nama: Eko
NIK: 12345`;

  const result = parseLaporanRS(text);
  assert.strictEqual(result.isValid, false);
  console.log('PASS testParseNikWrongLength');
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

const tests = [
  testParseValid,
  testParseValueWithColon,
  testParseKeyNormalization,
  testParseNikNonDigits,
  testParseMissingNama,
  testParseNikWrongLength,
  testStatusFallback,
  testNomorTiketFormat,
  testHaversine
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
