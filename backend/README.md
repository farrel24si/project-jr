# Monitoring JR Backend

Aplikasi Node.js terpadu: Bot WhatsApp (Baileys) + REST API (Express) + MySQL dalam satu proses (`node server.js`). Sistem untuk monitoring kunjungan petugas Jasa Raharja ke korban kecelakaan lalu lintas (laka) di rumah sakit.

## Prasyarat

- Node.js >= 18
- MySQL / MariaDB (via Laragon, XAMPP, atau server lain)
- Nomor WhatsApp aktif untuk bot (dibutuhkan scan QR sekali)

## Setup

```bash
# 1. Clone/download proyek, lalu masuk ke folder backend
cd backend

# 2. Install dependencies
npm install

# 3. Copy env template lalu isi kredensial DB
cp .env.example .env
```

`.env`:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=db_monitoring_jr
PORT=5000
JWT_SECRET=ganti-dengan-string-acak-panjang
JWT_EXPIRES_IN=8h
```

`JWT_SECRET` wajib diisi pada `.env`. Server menolak start jika variabel ini kosong.

### Import schema

Database baru:

```bash
mysql -u root -p < schema.sql
```

Database lama (dibuat sebelum NIK opsional / jenis laka / auth+master data), jalankan migrasi berurutan:

```bash
mysql -u root -p < migrations/001_nik_opsional_jenis_laka.sql
mysql -u root -p < migrations/002_auth_role_masterdata.sql
mysql -u root -p < migrations/003_case_monitoring_details.sql
mysql -u root -p < migrations/004_officer_hospitals.sql
mysql -u root -p < migrations/005_notification_logs.sql
mysql -u root -p < migrations/006_notification_pending_status.sql
mysql -u root -p < migrations/007_notification_lease.sql
mysql -u root -p < migrations/008_case_referrals.sql
mysql -u root -p < migrations/009_hospitals_staging.sql
mysql -u root -p < migrations/010_hospital_aliases_groups.sql
mysql -u root -p < migrations/011_case_guarantee.sql
# 012–014 pernah dipakai internal lalu dihapus karena fitur biaya dibatalkan.
# Jangan jalankan ulang; lanjutkan langsung ke migration aktif berikutnya.
mysql -u root -p < migrations/015_archive_single_vehicle_cases.sql
mysql -u root -p < migrations/016_indexes_and_optimizations.sql
```

Semua migration aktif yang tercantum di atas dirancang idempotent (aman dijalankan berulang).
- 001: NIK opsional & normalisasi jenis laka.
- 002: Master data `officers`/`users`, auth, relasi `hospital_id` dan `assigned_officer_id`.
- 003: Kolom detail kasus, status pemantauan, dan tabel `monitorings`.
- 004: Relasi plotting penugasan `officer_hospitals`.
- 005: Tabel anti-duplikasi `notification_logs` (unique key penugasan & reminder).
- 006: Status ENUM reservation `PENDING` pada notifikasi.
- 007: Kolom `reserved_at` untuk pemulihan deadlock/lease timeout 10 menit saat crash.
- 008: Tabel riwayat handoff rujukan lintas rumah sakit (`case_referrals`).
- 009: `hospitals.latitude`/`longitude` jadi nullable untuk data staging yang koordinatnya belum terverifikasi.
- 010: Tabel `hospital_aliases` (alias ter-normalisasi global unik) dan `hospital_whatsapp_groups` (binding JID grup global unik) untuk routing grup WhatsApp. Seed alias RS Pekanbaru aktif lewat `node scripts/seed-hospital-aliases.js`; binding JID dilakukan Kabag setelah JID grup terlihat dari metadata bot.
- 011: Fase 1 Keterjaminan & GL (`cases.status_keterjaminan`, `cases.no_gl`, `cases.tgl_gl`). Mapping otomatis jenis laka saat lapor (Tidak Tunggal -> Terjamin JR, selain itu -> Belum Dikonfirmasi; tanpa status BPJS), endpoint koreksi `PATCH /api/cases/:id/keterjaminan`.
- 015: Laka tunggal disimpan sebagai arsip `status_pemantauan = Diarsipkan` tanpa petugas, visit, SLA, atau notifikasi. Migrasi juga menghapus tugas `Menunggu` lama untuk kasus tunggal; riwayat kunjungan selesai tetap tersimpan.
- 016: Index optimasi pada `visits(status_kunjungan, jadwal_kunjungan)` untuk scheduler pengingat SLA dan `visits(foto_bukti_url)` untuk akses bukti foto.

> Catatan: perhitungan biaya/plafon TIDAK dikelola sistem ini — monitoring biaya ditangani aplikasi/web lain (JR-Care). Aplikasi ini hanya mencatat status keterjaminan, nomor GL, dan tanggal GL tanpa nominal rupiah.

Tabel `officers` dan `users` dipisah secara arsitektur (profil vs kredensial login). Kolom koordinat resmi rumah sakit:

| RS | Latitude | Longitude |
|---|---|---|
| RS Prima Pekanbaru | 0.49070000 | 101.39950000 |
| RS Syafira Pekanbaru | 0.49830000 | 101.45480000 |

### Seed akun Kabag pertama

```bash
node scripts/seed-kabag.js
```

Script menanyakan username & password (min. 8 karakter), lalu menyimpan password sebagai hash bcrypt. Bisa juga non-interaktif:

```bash
KABAG_USERNAME=admin KABAG_PASSWORD=rahasia123 node scripts/seed-kabag.js
```

### Jalankan

```bash
node server.js
```

- API berjalan di `http://localhost:5000`.
- Saat pertama kali, terminal menampilkan QR code. Buka WhatsApp di ponsel: **Settings → Linked Devices → Link a Device**, lalu scan QR. Sesi tersimpan di folder `session_jr_bot/` sehingga hanya perlu scan sekali.

## Alur WA → DB

1. Kirim `#FORMAT` di grup → bot membalas template tanpa baris `RS` (RS dideteksi dari nama grup). Di DM, template tetap memuat baris `RS:`.
2. Resolusi RS dari grup mengikuti urutan deterministik (tidak pernah fuzzy/LIKE):
   - Binding JID grup aktif yang persis di `hospital_whatsapp_groups` (exact `group_jid`).
   - Alias aktif unik di `hospital_aliases` yang cocok pada judul grup ter-normalisasi (mis. alias `RS Prima` cocok pada judul `JR - RS Prima`).
   - Fallback nama kanonis `hospitals.nama_rs` dari judul grup — hanya bila tepat satu yang cocok.
   Nol atau lebih dari satu hasil → `null`; laporan tidak dibuat otomatis sampai ada `RS:` valid di pesan.
3. Kirim `#LAPORLAKA`:

```
#LAPORLAKA
Nama: Budi Setiawan
Umur: 34
Jenis Laka: Tunggal
NIK: 1471012345678901
```

- Hanya `Nama` yang wajib. `RS` diambil otomatis dari grup; baris `RS:` hanya diperlukan bila resolusi grup tidak menghasilkan tepat satu RS (atau untuk DM).
- Pencocokan nama/alias RS: exact, case-insensitive, tanda baca dan spasi berulang dinormalisasi. Tidak ada fuzzy match — typo tidak diarahkan ke RS lain.
- Bila 0 RS cocok di nama grup dan tidak ada `RS:` valid di pesan → laporan ditolak, bot membalas daftar RS terdaftar (dibaca dari tabel, bukan hardcode).
- Bila >1 RS cocok di nama grup (mis. dua RS dalam judul, atau satu alias menunjuk dua RS) → ditolak, minta tulis `RS:` manual yang valid.
- Bila `RS:` di pesan berbeda dengan RS hasil grup → ditolak.
- `Jenis Laka` menerima `Tunggal` atau `Tidak Tunggal`; nilai kosong/tidak dikenali menjadi `Belum Diketahui`.
- NIK kosong atau bukan 16 digit disimpan `NULL` untuk dilengkapi petugas JR saat kunjungan.
- Kalau valid: 1 transaksi INSERT `cases` (termasuk `hospital_id`) + INSERT `visits` ke-1 (SLA = waktu lapor + 72 jam). Bot membalas nomor tiket (`JR-XXXXXX`), nama korban, dan RS.

### Grup `JR - RS Prima` (RS Prima Pekanbaru)

- RS Prima Pekanbaru aktif lagi dengan data lama yang dikonfirmasi user: `Jl. Bima No.1, Delima, Kec. Binawidya, Kota Pekanbaru, Riau 28292`, `0.49070000, 101.39950000`, radius 200.
- Binding JID grup `JR - RS Prima` masih harus ditambahkan Kabag setelah bot melihat JID grup (tabel `hospital_whatsapp_groups`; JID tidak di-seed). Sampai binding ada, alias `RS Prima` (jika diaktifkan Kabag) menjadi fallback untuk judul grup tersebut.

### Notifikasi WhatsApp Petugas (SLA & Penugasan)

1. DM tugas dan reminder SLA hanya terkirim bila environment `ENABLE_WHATSAPP_NOTIFICATIONS=true`; default mati. Test `dryRun` tidak mengirim pesan.
2. Scheduler memeriksa visit berstatus `Menunggu` tiap 15 menit; jendela reminder: <=24 jam, <=12 jam, <=3 jam sebelum jatuh tempo. Tidak ada eskalasi WA untuk visit overdue.
3. Tabel `notification_logs` memakai unique key, status reservation `PENDING`, dan lease 10 menit untuk deduplikasi concurrent serta pemulihan proses crash.

## Autentikasi

Semua endpoint kecuali `POST /api/auth/login` wajib header:

```
Authorization: Bearer <token>
```

Role: `kabag` (super admin) dan `petugas`.

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/auth/login` | publik | Body `{ username, password }` → `{ token, user }` |
| GET | `/api/auth/me` | login | Data user dari token |

Contoh login:

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"kabag","password":"rahasia123"}'
```

## REST API

Semua response JSON berbentuk `{ success: boolean, ... }`. CORS terbuka untuk semua origin (dev).

### Master data

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/hospitals` | login | RS aktif; `?include_inactive=true` (kabag) tampilkan nonaktif |
| POST | `/api/hospitals` | kabag | Body: `nama_rs`, `alamat`, `latitude`, `longitude`, `radius_meter` |
| PUT | `/api/hospitals/:id` | kabag | Update penuh + `is_active` |
| DELETE | `/api/hospitals/:id` | kabag | Soft delete (`is_active = 0`) |
| GET | `/api/officers` | login | Petugas aktif + akun terkait |
| GET | `/api/officers/:id` | login | Detail 1 petugas |
| POST | `/api/officers` | kabag | Body: `nama`, `nip`, `jabatan`, `wilayah`, `telepon`, `email` |
| PUT | `/api/officers/:id` | kabag | Update; `is_active: false` menonaktifkan akun loginnya juga |
| DELETE | `/api/officers/:id` | kabag | Soft delete + nonaktifkan akun |
| GET | `/api/officers/:id/hospitals` | login | Daftar RS tanggung jawab petugas |
| POST | `/api/officers/:officerId/hospitals` | kabag | Body: `hospital_id`, `is_primary` (opsional) |
| DELETE | `/api/officers/:officerId/hospitals/:hospitalId` | kabag | Nonaktifkan plotting petugas ke RS |
| GET | `/api/users` | kabag | Semua akun |
| POST | `/api/users` | kabag | Body: `username`, `password`, `role`, `officer_id` (wajib bila petugas) |
| PUT | `/api/users/:id` | kabag | Ganti password / role / `officer_id` / `is_active` |
| DELETE | `/api/users/:id` | kabag | Soft delete; tidak bisa menonaktifkan akun sendiri |

Soft delete dipakai untuk semua master data: riwayat `cases`/`visits` tetap valid.

### Kasus & kunjungan

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/health` | Health check publik tanpa token: status service, database connected, server time, uptime |
| GET | `/api/cases` | Kabag: semua kasus. Petugas: hanya yang `assigned_officer_id` = dirinya. Memuat `tugas_menunggu`, `jadwal_berikutnya`, `is_overdue`, koordinat RS |
| GET | `/api/cases/:id` | Detail kasus + objek `hospital` (koordinat & radius) + `assigned_officer` + `visits` dengan `is_overdue` |
| POST | `/api/cases` | Input kasus manual (Role `kabag` atau `petugas`): validasi plotting RS, generate tiket `JR-XXXXXX`, auto-assign + visit #1 untuk selain laka tunggal. Laka tunggal diarsipkan tanpa petugas, visit, SLA, atau notifikasi. |
| POST | `/api/visits/:visitId/submit` | Submit checklist kunjungan (multipart/form-data, file `foto_bukti`). Hanya role `petugas`; status `Dirujuk ke RS Lain` memindahkan kasus ke RS tujuan aktif. |
| PATCH | `/api/cases/:caseId/referrals/:referralId/assignee` | Kabag-only. Body `{ "officer_id" }`; petugas harus plotting aktif di RS tujuan. |
| PATCH | `/api/cases/:id/keterjaminan` | Update `status_keterjaminan` (`Belum Dikonfirmasi`/`Terjamin JR`), `no_gl`, `tgl_gl` (partial). Kabag semua kasus; petugas hanya kasus miliknya. Tanpa nominal biaya. |

### GET /api/cases/:id — kontrak untuk maps

```json
{
  "success": true,
  "data": {
    "case": { "id": 1, "nomor_tiket": "JR-AB12CD", "nama_korban": "Budi Setiawan", "assigned_officer_id": 3 },
    "hospital": {
      "id": 2,
      "nama_rs": "RS Syafira Pekanbaru",
      "alamat": "Jl. Jend. Sudirman No.134, ...",
      "latitude": "0.49830000",
      "longitude": "101.45480000",
      "radius_meter": 200
    },
    "assigned_officer": { "id": 3, "nama": "Andi" },
    "visits": [
      {
        "id": 10,
        "kunjungan_ke": 1,
        "jadwal_kunjungan": "2026-10-31T09:15:00.000Z",
        "status_kunjungan": "Menunggu",
        "is_overdue": 0,
        "lat_petugas": null,
        "lng_petugas": null,
        "jarak_dari_rs_meter": null
      }
    ],
    "referrals": [
      {
        "id": 5,
        "case_id": 1,
        "source_hospital_id": 1,
        "target_hospital_id": 2,
        "source_hospital_nama": "RS Prima Pekanbaru",
        "target_hospital_nama": "RS Syafira Pekanbaru",
        "previous_officer_id": 3,
        "new_officer_id": 4,
        "referred_by_officer_id": 3,
        "alasan_rujukan": "Memerlukan fasilitas lanjutan.",
        "catatan_rujukan": "Pasien stabil.",
        "status_rujukan": "Aktif"
      }
    ]
  }
}
```

`is_overdue` = `1` bila `status_kunjungan = 'Menunggu'` dan `jadwal_kunjungan < NOW()`. Dihitung backend (server time). `status_kunjungan` TIDAK diubah menjadi terlambat; `is_overdue` hanya field turunan. Label tampilan yang disarankan: `Terlambat — belum dikunjungi`.

### Google Maps deep link (frontend)

Tanpa API key. Sebelum submit (tombol "Navigasi ke RS"):

```js
`https://www.google.com/maps/dir/?api=1&destination=${hospital.latitude},${hospital.longitude}&travelmode=driving`
```

Jangan sertakan `origin` — `lat_petugas` masih `null` sebelum submit. Setelah submit (tombol "Lihat lokasi absen"):

```js
`https://www.google.com/maps?q=${visit.lat_petugas},${visit.lng_petugas}`
```

Tampilkan hanya bila kedua koordinat ada dan `status_kunjungan` sudah selesai.

### POST /api/visits/:visitId/submit

Multipart/form-data. Field file: `foto_bukti` (gambar, maks 5 MB, opsional).

| Field | Tipe | Keterangan |
|---|---|---|
| `case_id` | number | Wajib |
| `cek_komunikasi_keluarga` | string `"true"/"false"` | Wajib |
| `cek_edukasi_santunan` | string `"true"/"false"` | Wajib |
| `cek_arahan_lp` | string `"true"/"false"` | Wajib |
| `catatan_kondisi` | string | Opsional |
| `status_kondisi_terbaru` | string | Opsional, salah satu ENUM status |
| `lat_petugas` | number | Wajib |
| `lng_petugas` | number | Wajib |
| `rujukan_hospital_id` | number | Wajib bila `status_kondisi_terbaru = "Dirujuk ke RS Lain"`; harus RS aktif dan bukan RS asal |
| `alasan_rujukan` | string | Opsional, disimpan pada riwayat rujukan |
| `catatan_rujukan` | string | Opsional, disimpan pada riwayat rujukan |

Contoh:

```bash
curl -X POST http://localhost:5000/api/visits/10/submit \
  -H "Authorization: Bearer $TOKEN" \
  -F "case_id=1" \
  -F "cek_komunikasi_keluarga=true" \
  -F "cek_edukasi_santunan=true" \
  -F "cek_arahan_lp=false" \
  -F "catatan_kondisi=Kondisi stabil" \
  -F "status_kondisi_terbaru=Rawat Inap" \
  -F "lat_petugas=0.49830000" \
  -F "lng_petugas=101.45480000" \
  -F "foto_bukti=@C:/path/ke/foto.jpg"
```

Aturan:

- `officer_id` kunjungan diambil dari klaim JWT (`req.user.officerId`), BUKAN dari body.
- Petugas hanya boleh submit untuk kasus yang di-assign ke dirinya (`403` bila bukan).
- `status_sla`: `Selesai Tepat Waktu` bila submit <= `jadwal_kunjungan`, selain itu `Selesai Terlambat`.
- GPS soft geofence: jarak Haversine petugas ke RS dari `cases.hospital_id` disimpan di `jarak_dari_rs_meter`. Jarak > `radius_meter` tetap diterima (`200 OK`), foto dan lokasi tersimpan, respons mengembalikan `is_outside_hospital_radius: true` dan pesan `verification_alert` untuk verifikasi manual Kabag.
- Foto bukti kunjungan dilindungi autentikasi di `GET /uploads/:filename` (hanya dapat diakses oleh petugas pemilik kasus atau role `kabag`). File berbahaya seperti SVG ditolak.
- Kasus tanpa `hospital_id` valid/aktif → `422` (tidak ada lagi fallback "validasi radius dilewati").
- `status_kondisi_terbaru` BUKAN `Selesai`/`Meninggal Dunia`/`Sudah Pulang` → otomatis dibuat kunjungan berikutnya (jadwal = sekarang + 3 hari). Semua dalam 1 transaksi.
- `Dirujuk ke RS Lain` wajib `rujukan_hospital_id`. Dalam transaksi sama, kasus berpindah RS, riwayat rujukan dibuat, petugas tujuan dipilih dari plotting aktif (utama lalu beban kasus aktif paling kecil), dan visit berikutnya jatuh tempo 72 jam. Petugas tujuan yang terpilih otomatis dikirimi DM WhatsApp tugas baru (`NEW_ASSIGNMENT`). Bila tidak ada plotting aktif, kasus tetap berhasil dipindah tanpa petugas.
- `PATCH /api/cases/:caseId/referrals/:referralId/assignee` hanya untuk Kabag. Hanya menerima `officer_id`, divalidasi terhadap plotting aktif RS tujuan, memperbarui assignment kasus + petugas baru pada riwayat secara atomik, dan mengirimkan DM WhatsApp tugas baru ke petugas pengganti.
- `GET /api/cases/:id` juga memuat `referrals`, termasuk RS asal/tujuan dan petugas lama/baru.
- Visit tidak ditemukan → `404`. Visit sudah selesai → `409`.

## Struktur

```
src/
  config/db.js
  middleware/auth.js
  bot/whatsapp.js
  bot/parser.js
  routes/auth.js
  routes/users.js
  routes/hospitals.js
  routes/officers.js
  routes/cases.js
  routes/visits.js
  utils/geo.js
  server.js
scripts/seed-kabag.js
migrations/
  001_nik_opsional_jenis_laka.sql
  002_auth_role_masterdata.sql
  003_case_monitoring_details.sql
  004_officer_hospitals.sql
schema.sql
.env.example
README.md
```
