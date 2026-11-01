# Monitoring JR Backend

Aplikasi Node.js terpadu: Bot WhatsApp (Baileys) + REST API (Express) + MySQL dalam satu proses (`node server.js`). Sistem untuk monitoring kunjungan petugas Jasa Raharja ke korban kecelakaan lalu lintas (laka) di rumah sakit.

## Prasyarat

- Node.js >= 18
- MySQL / MariaDB (via Laragon, XAMPP, atau server lain)
- Nomor WhatsApp aktif untuk bot (dibutuhkan scan QR sekali)

## Setup

```bash
# 1. Clone/download proyek, lalu masuk ke folder
cd ProjectReal

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
```

### Import schema

```bash
mysql -u root -p < schema.sql
```

(Atau buka `schema.sql` di phpMyAdmin/Laragon lalu jalankan. File idempotent — aman dijalankan berulang, seed RS `RS Syafira` dan `RS Prima` tidak duplikat.)

### Jalankan

```bash
node server.js
```

- API berjalan di `http://localhost:5000`.
- Saat pertama kali, terminal menampilkan QR code. Buka WhatsApp di ponsel: **Settings → Linked Devices → Link a Device**, lalu scan QR. Sesi tersimpan di folder `session_jr_bot/` sehingga hanya perlu scan sekali.

## Alur WA → DB

1. Kirim `#FORMAT` di grup → bot membalas template laporan.
2. Kirim pesan `#LAPORLAKA` (huruf besar/kecil sama saja) berisi:

```
#LAPORLAKA
RS: RS Syafira
Nama: Budi Setiawan
NIK: 1471012345678901
Umur: 34
Alamat: Jl. Sudirman No. 12
Tgl Masuk: 30/10/2026
Kronologi: Kecelakaan di persimpangan
Status: Rawat Inap
```

- Nama wajib diisi dan NIK wajib tepat 16 digit. Kalau tidak, bot membalas "Format Belum Lengkap" (quoted) dan data tidak disimpan.
- Kalau valid: 1 transaksi INSERT `cases` + INSERT `visits` ke-1 (SLA = waktu lapor + 24 jam). Bot membalas nomor tiket (`JR-XXXXXX`, unik anti-collision), nama korban, dan RS.
- Status di luar ENUM (mis. `Pulang Paksa`) otomatis fallback ke `Rawat Inap`.

## REST API

Semua response JSON berbentuk `{ success: boolean, ... }`. CORS terbuka untuk semua origin (dev).

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/cases` | Semua kasus, urut `waktu_lapor_wa DESC`, plus `tugas_menunggu` & `jadwal_berikutnya` |
| GET | `/api/cases/:id` | Detail 1 kasus + daftar visits urut `kunjungan_ke ASC` |
| POST | `/api/visits/:visitId/submit` | Submit checklist kunjungan (multipart/form-data, field file `foto_bukti`) |

### GET /api/cases

```bash
curl http://localhost:5000/api/cases
```

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "nomor_tiket": "JR-AB12CD",
      "rumah_sakit": "RS Syafira",
      "nama_korban": "Budi Setiawan",
      "nik": "1471012345678901",
      "umur": 34,
      "status_kondisi": "Rawat Inap",
      "waktu_lapor_wa": "2026-10-30T09:15:00.000Z",
      "tugas_menunggu": 1,
      "jadwal_berikutnya": "2026-10-31T09:15:00.000Z"
    }
  ]
}
```

### GET /api/cases/:id

```bash
curl http://localhost:5000/api/cases/1
```

Response:

```json
{
  "success": true,
  "data": {
    "case": {
      "id": 1,
      "nomor_tiket": "JR-AB12CD",
      "nama_korban": "Budi Setiawan",
      "status_kondisi": "Rawat Inap"
    },
    "visits": [
      {
        "id": 10,
        "case_id": 1,
        "kunjungan_ke": 1,
        "jadwal_kunjungan": "2026-10-31T09:15:00.000Z",
        "status_kunjungan": "Menunggu"
      }
    ]
  }
}
```

Kasus tidak ada → `404` dengan `{ "success": false, "message": "Kasus tidak ditemukan." }`.

### POST /api/visits/:visitId/submit

Multipart/form-data. Field file: `foto_bukti` (gambar, maks 5 MB, opsional).

Body:

| Field | Tipe | Keterangan |
|---|---|---|
| `case_id` | number | Wajib |
| `cek_komunikasi_keluarga` | string `"true"/"false"` | Wajib diisi |
| `cek_edukasi_santunan` | string `"true"/"false"` | Wajib diisi |
| `cek_arahan_lp` | string `"true"/"false"` | Wajib diisi |
| `catatan_kondisi` | string | Opsional |
| `status_kondisi_terbaru` | string | Opsional, salah satu: `Rawat Inap`, `Luka Ringan`, `Luka Berat`, `Meninggal Dunia`, `Selesai` |
| `lat_petugas` | number | Wajib |
| `lng_petugas` | number | Wajib |

Contoh:

```bash
curl -X POST http://localhost:5000/api/visits/10/submit \
  -F "case_id=1" \
  -F "cek_komunikasi_keluarga=true" \
  -F "cek_edukasi_santunan=true" \
  -F "cek_arahan_lp=false" \
  -F "catatan_kondisi=Kondisi stabil" \
  -F "status_kondisi_terbaru=Rawat Inap" \
  -F "lat_petugas=0.49968000" \
  -F "lng_petugas=101.45475000" \
  -F "foto_bukti=@C:/path/ke/foto.jpg"
```

Response sukses (di dalam radius RS):

```json
{
  "success": true,
  "message": "Kunjungan berhasil disubmit.",
  "status_sla": "Selesai Tepat Waktu",
  "jarak_dari_rs_meter": 0
}
```

Aturan:

- `status_sla`: `Selesai Tepat Waktu` bila submit <= `jadwal_kunjungan`, selain itu `Selesai Terlambat`.
- GPS anti-fraud: jarak Haversine petugas ke RS dihitung dan disimpan di `jarak_dari_rs_meter`. Jarak > `radius_meter` RS → `422` `{ "success": false, "message": "Lokasi petugas berada di luar radius RS..." }`, foto yang sudah ter-upload ikut dihapus.
- RS tidak ada di tabel `hospitals`: tetap tersimpan, `jarak_dari_rs_meter = NULL`, response memuat `warning`.
- `status_kondisi_terbaru` BUKAN `Selesai`/`Meninggal Dunia` → otomatis dibuat kunjungan berikutnya (kunjungan_ke + 1, jadwal = sekarang + 3 hari). Semua dalam 1 transaksi.
- Visit tidak ditemukan → `404`. Visit sudah selesai → `409`.

## Struktur

```
src/
  config/db.js
  bot/whatsapp.js
  bot/parser.js
  routes/cases.js
  routes/visits.js
  utils/geo.js
  server.js
schema.sql
.env.example
README.md
```
