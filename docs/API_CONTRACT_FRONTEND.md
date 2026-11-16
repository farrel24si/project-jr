# Kontrak API Frontend - Jasa Raharja Monitoring (ProjectReal)

Dokumen acuan integrasi untuk tim pengembang Frontend. Menggantikan mock `localStorage` menjadi panggilan HTTP REST API nyata.

---

## 1. Informasi Umum

- **Base URL Pengembangan**: `http://localhost:5000/api`
- **Header Standar**:
  ```http
  Authorization: Bearer <TOKEN_JWT>
  Content-Type: application/json
  ```
  *(Kecuali endpoint upload file yang menggunakan `multipart/form-data` tanpa manual `Content-Type`).*

### Format Standar Response

**Sukses (`200 OK` / `201 Created`):**
```json
{
  "success": true,
  "data": { ... }
}
```

**Gagal / Error (`400`, `401`, `403`, `404`, `409`, `422`, `500`):**
```json
{
  "success": false,
  "message": "Pesan deskripsi kendala / validasi"
}
```

---

## 1.1 Health Check (`/health`)
- **Method / Endpoint**: `GET /health`
- **Auth**: Publik (tanpa token), khusus probe load balancer/hosting.
- **Response 200 OK**:
  ```json
  {
    "success": true,
    "data": {
      "status": "ok",
      "database": "connected",
      "server_time": "2026-11-09T12:00:00.000Z",
      "uptime_seconds": 3600
    }
  }
  ```
- **Response 503 Service Unavailable**: API hidup, tetapi koneksi database gagal.
  ```json
  {
    "success": false,
    "data": {
      "status": "unhealthy",
      "database": "disconnected",
      "server_time": "2026-11-09T12:00:00.000Z",
      "uptime_seconds": 3600
    }
  }
  ```

---

## 2. Autentikasi (`/auth`)

### 2.1 Login Akun
- **Method / Endpoint**: `POST /auth/login`
- **Auth**: Publik (tanpa token)
- **Request Body**:
  ```json
  {
    "username": "andi",
    "password": "password123"
  }
  ```
- **Response 200 OK**:
  ```json
  {
    "success": true,
    "token": "<TOKEN_JWT>",
    "user": {
      "userId": 2,
      "officerId": 1,
      "username": "andi",
      "role": "petugas",
      "nama": "Andi Pratama"
    }
  }
  ```
- **Catatan Frontend**:
  - Simpan `token` di Secure Storage / Cookie / Memory state.
  - Role yang tersedia: `'kabag'` (akses seluruh fitur & master data) dan `'petugas'` (akses terbatas tugas lapangan).

### 2.2 Cek Sesi Akun Aktif
- **Method / Endpoint**: `GET /auth/me`
- **Auth**: Bearer Token
- **Response 200 OK**:
  ```json
  {
    "success": true,
    "data": {
      "id": 2,
      "username": "andi",
      "role": "petugas",
      "last_login_at": "2026-11-09T10:00:00.000Z",
      "officer_id": 1,
      "nama": "Andi Pratama",
      "jabatan": "Petugas",
      "wilayah": "Pekanbaru"
    }
  }
  ```

---

## 3. Data Kasus & Monitoring (`/cases`)

### 3.1 Ambil Daftar Kasus
- **Method / Endpoint**: `GET /cases`
- **Auth**: Bearer Token
- **Query Parameter**: Belum didukung pada route aktif. Daftar mengembalikan seluruh kasus yang diizinkan role; frontend lakukan filter tampilan lokal bila diperlukan.
- **Behavior Role**:
  - Role `kabag`: Mengembalikan seluruh laporan kasus di database.
  - Role `petugas`: Otomatis difilter hanya menampilkan kasus yang ditugaskan ke dirinya (`assigned_officer_id = req.user.officerId`).
- **Response 200 OK**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 10,
        "nomor_tiket": "JR-495DF7",
        "rumah_sakit": "RS Syafira Pekanbaru",
        "hospital_id": 1,
        "assigned_officer_id": 1,
        "assigned_officer_nama": "Andi Pratama",
        "nama_korban": "Budi Setiawan",
        "nik": "1471012345678901",
        "umur": 34,
        "jenis_laka": "Tidak Tunggal",
        "status_kondisi": "Rawat Inap",
        "status_pemantauan": "Pemantauan Aktif",
        "status_keterjaminan": "Terjamin JR",
        "no_gl": null,
        "tgl_gl": null,
        "waktu_lapor_wa": "2026-11-08T15:20:00.000Z",
        "created_at": "2026-11-08T15:20:00.000Z",
        "hospital_nama": "RS Syafira Pekanbaru",
        "hospital_lat": 0.49830000,
        "hospital_lng": 101.45480000,
        "hospital_radius": 200,
        "tugas_menunggu": 1,
        "jadwal_berikutnya": "2026-11-11T15:20:00.000Z",
        "is_overdue": 0
      }
    ]
  }
  ```
- **Catatan Frontend**:
  - `is_overdue` bernilai `1` jika ada visit berstatus `Menunggu` yang jadwalnya sudah lewat dari waktu server saat query dijalankan. Gunakan badge merah di dashboard jika bernilai `1`.

### 3.2 Detail Kasus & Riwayat Kunjungan
- **Method / Endpoint**: `GET /cases/:id`
- **Auth**: Bearer Token
- **Response 200 OK**:
  ```json
  {
    "success": true,
    "data": {
      "case": {
        "id": 10,
        "nomor_tiket": "JR-495DF7",
        "rumah_sakit": "RS Syafira Pekanbaru",
        "hospital_id": 1,
        "nama_korban": "Budi Setiawan",
        "nik": "1471012345678901",
        "umur": 34,
        "jenis_laka": "Tunggal",
        "alamat": "Jl. Sudirman No. 12",
        "tgl_laka": "29/10/2026",
        "tgl_masuk": "30/10/2026",
        "kronologi": "Kecelakaan tunggal",
        "status_kondisi": "Rawat Inap",
        "waktu_lapor_wa": "2026-11-08T15:20:00.000Z",
        "assigned_officer_id": 1,
        "created_at": "2026-11-08T15:20:00.000Z"
      },
      "hospital": {
        "id": 1,
        "nama_rs": "RS Syafira Pekanbaru",
        "alamat": "Jl. Jend. Sudirman No.134",
        "latitude": 0.49830000,
        "longitude": 101.45480000,
        "radius_meter": 200
      },
      "assigned_officer": {
        "id": 1,
        "nama": "Andi Pratama"
      },
      "visits": [
        {
          "id": 15,
          "case_id": 10,
          "officer_id": null,
          "kunjungan_ke": 1,
          "jadwal_kunjungan": "2026-11-11T15:20:00.000Z",
          "waktu_aktual_kunjungan": null,
          "status_kunjungan": "Menunggu",
          "is_overdue": 0
        }
      ],
      "referrals": [
        {
          "id": 4,
          "case_id": 10,
          "source_hospital_id": 1,
          "source_hospital_nama": "RS Syafira Pekanbaru",
          "target_hospital_id": 2,
          "target_hospital_nama": "RS Prima Pekanbaru",
          "previous_officer_id": 1,
          "previous_officer_nama": "Andi Pratama",
          "new_officer_id": 2,
          "new_officer_nama": "Budi Petugas",
          "referred_by_officer_id": 1,
          "referred_by_officer_nama": "Andi Pratama",
          "alasan_rujukan": "Memerlukan fasilitas lanjutan.",
          "catatan_rujukan": "Pasien stabil.",
          "status_rujukan": "Aktif",
          "created_at": "2026-11-09T18:00:00.000Z"
        }
      ]
    }
  }
  ```

### 3.3 Input Kasus Manual (`POST /cases`)
- **Method / Endpoint**: `POST /cases`
- **Auth**: Bearer Token (Role `kabag` atau `petugas`)
- **Request Body**:
  ```json
  {
    "hospital_id": 1,
    "nama_korban": "Siti Aminah",
    "nik": "1471012345678901",
    "umur": 28,
    "jenis_kelamin": "Perempuan",
    "alamat": "Jl. Tuanku Tambusai No. 45",
    "telepon_korban": "081234567890",
    "tgl_laka": "08/11/2026",
    "tgl_masuk": "09/11/2026",
    "kronologi": "Tabrakan roda dua di persimpangan",
    "jenis_laka": "Tidak Tunggal",
    "status_kondisi": "Rawat Inap",
    "ruangan_rs": "Kamar Mawar 03",
    "nomor_laporan": "LP/123/XI/2026",
    "status_keterjaminan": "Terjamin JR",
    "no_gl": "GL/001/XII/2026",
    "tgl_gl": "12/11/2026"
  }
  ```
  Field baru (Fase 1 GL, semuanya opsional):
  - `status_keterjaminan`: `'Belum Dikonfirmasi'` / `'Terjamin JR'`.
    Bila dikosongkan, backend memetakan otomatis dari `jenis_laka`:
    `Tidak Tunggal` → `Terjamin JR`; lainnya (termasuk `Tunggal`) → `Belum Dikonfirmasi` (Kabag yang mengonfirmasi). Sistem ini khusus Jasa Raharja — tidak ada status BPJS.
  - `no_gl` (maks 50 karakter), `tgl_gl` (format `DD/MM/YYYY`, tersimpan kanonis).
- **Aturan Bisnis & Validasi**:
  1. `hospital_id` dan `nama_korban` wajib diisi (`400 Bad Request` bila kosong).
  2. `hospital_id` harus ada dan berstatus aktif (`404 Not Found` bila tidak aktif/tidak ada).
  3. Field opsional divalidasi: `nik` 16 digit angka, `jenis_kelamin` (`'Laki-laki'` / `'Perempuan'`), `jenis_laka` (`'Tunggal'` / `'Tidak Tunggal'` / `'Belum Diketahui'`), `status_kondisi` sesuai daftar status valid (`422 Unprocessable Entity` bila tidak cocok).
  4. Role `kabag`: Sistem otomatis memilih petugas yang di-plotting untuk RS tersebut (prioritas `is_primary`, lalu beban kasus aktif terkecil). Jika RS belum di-plotting, kasus tetap dibuat dengan `assigned_officer_id = null`.
  5. **Khusus `jenis_laka: 'Tunggal'`:** laporan disimpan sebagai arsip dengan `status_pemantauan: 'Diarsipkan'`, `assigned_officer_id: null`, dan `visit: null`. Backend tidak menjadwalkan kunjungan, SLA, atau notifikasi tugas. Arsip hanya terlihat untuk Kabag, bukan daftar tugas petugas.
  6. Role `petugas`: Petugas HANYA boleh menginput untuk RS yang aktif di-plotting ke dirinya (`403 Forbidden` jika RS di luar plotting tugasnya). Untuk selain laka tunggal, kasus otomatis di-assign ke petugas penginput.
  7. Field `assigned_officer_id` atau `officer_id` pada request body diabaikan untuk mencegah eskalasi wewenang.
  8. Untuk selain laka tunggal, backend otomatis membuat nomor tiket unik `JR-XXXXXX` dan menjadwalkan visit ke-1 dengan batas SLA 72 jam ke depan dalam 1 transaksi database.
- **Response 201 Created**:
  ```json
  {
    "success": true,
    "data": {
      "case": {
        "id": 18,
        "nomor_tiket": "JR-58B241",
        "rumah_sakit": "RS Syafira Pekanbaru",
        "hospital_id": 1,
        "nama_korban": "Siti Aminah",
        "nik": "1471012345678901",
        "umur": 28,
        "jenis_kelamin": "Perempuan",
        "alamat": "Jl. Tuanku Tambusai No. 45",
        "telepon_korban": "081234567890",
        "tgl_laka": "08/11/2026",
        "tgl_masuk": "09/11/2026",
        "kronologi": "Tabrakan roda dua di persimpangan",
        "jenis_laka": "Tidak Tunggal",
        "status_kondisi": "Rawat Inap",
        "status_keterjaminan": "Terjamin JR",
        "no_gl": null,
        "tgl_gl": null,
        "ruangan_rs": "Kamar Mawar 03",
        "nomor_laporan": "LP/123/XI/2026",
        "assigned_officer_id": 1,
        "waktu_lapor_wa": "2026-11-09T18:00:00.000Z",
        "created_at": "2026-11-09T18:00:00.000Z"
      },
      "visit": {
        "id": 22,
        "case_id": 18,
        "kunjungan_ke": 1,
        "jadwal_kunjungan": "2026-11-12T18:00:00.000Z",
        "status_kunjungan": "Menunggu"
      },
      "assigned_officer": {
        "id": 1,
        "nama": "Andi Pratama"
      }
    }
  }
  ```

---

### 3.4 Update Keterjaminan & GL Kasus
- **Method / Endpoint**: `PATCH /cases/:id/keterjaminan`
- **Auth**: Bearer Token (Role `kabag` atau `petugas`)
- **Request Body**:
  ```json
  {
    "status_keterjaminan": "Terjamin JR",
    "no_gl": "GL/001/XII/2026",
    "tgl_gl": "12/11/2026"
  }
  ```
- **Aturan**:
  1. `status_keterjaminan` wajib dan harus salah satu: `'Belum Dikonfirmasi'`, `'Terjamin JR'` (`422` bila tidak; `'Dialihkan ke BPJS'` sudah tidak valid).
  2. `no_gl` opsional, maks 50 karakter; kirim `null` untuk mengosongkan. `tgl_gl` opsional format `DD/MM/YYYY` (tersimpan kanonis); format salah `422`.
  3. Field yang tidak dikirim tidak berubah (partial update).
  4. Petugas hanya boleh update kasus miliknya (`403` bila bukan assignee); Kabag bebas. Kasus tidak ada `404`.
- **Response 200 OK**:
  ```json
  {
    "success": true,
    "data": {
      "id": 18,
      "status_keterjaminan": "Terjamin JR",
      "no_gl": "GL/001/XII/2026",
      "tgl_gl": "12/11/2026"
    }
  }
  ```

---

## 4. Eksekusi Kunjungan Petugas (`/visits`)

### 4.1 Submit Laporan Kunjungan Fisik (Anti-Fraud GPS)
- **Method / Endpoint**: `POST /visits/:visitId/submit`
- **Auth**: Bearer Token (Role `petugas`)
- **Content-Type**: `multipart/form-data`
- **Form Data Fields**:
  - `case_id` (number/string, Wajib): ID kasus yang bersangkutan.
  - `lat_petugas` (string/number, Wajib): Koordinat latitude saat petugas submit di RS.
  - `lng_petugas` (string/number, Wajib): Koordinat longitude saat petugas submit di RS.
  - `catatan_kondisi` (string, Opsional): catatan hasil kunjungan fisik korban.
  - `status_kondisi_terbaru` (string, Opsional): bila dikirim harus salah satu status berikut; bila kosong status kasus sebelumnya dipakai:
    - `'Rawat Inap'`, `'Luka Ringan'`, `'Luka Berat'` (legacy)
    - `'Masih Dirawat'`
    - `'Sudah Pulang'` (status terminal; tidak membuat visit lanjutan)
    - `'Meninggal Dunia'` (status terminal; tidak membuat visit lanjutan)
    - `'Belum Dapat Dikonfirmasi'`
    - `'Dirujuk ke RS Lain'` (wajib sertakan field rujukan berikut)
    - `'Selesai'` (status terminal legacy) 
  - `rujukan_hospital_id` (number/string, Wajib jika status `Dirujuk ke RS Lain`): ID RS tujuan aktif, harus berbeda dari RS kasus saat ini.
  - `alasan_rujukan` (string, opsional): alasan perpindahan.
  - `catatan_rujukan` (string, opsional): catatan rujukan.
  - `cek_komunikasi_keluarga` (boolean: `'true'` / `'false'`, Opsional; bila kosong tersimpan `false`)
  - `cek_edukasi_santunan` (boolean: `'true'` / `'false'`, Opsional; bila kosong tersimpan `false`)
  - `cek_arahan_lp` (boolean: `'true'` / `'false'`, Opsional; bila kosong tersimpan `false`)
  - `foto_bukti` (File binary image: `.jpg`, `.jpeg`, `.png`, atau `.webp`, Opsional; maksimal 5 MB). SVG dan format lain ditolak.
- **Aturan Bisnis Backend**:
  1. Petugas hanya boleh submit kunjungan yang ter-assign ke akunnya (`403 Forbidden` bila bukan).
  2. GPS diperiksa terhadap koordinat RS menggunakan formula Haversine. Bila jarak > `radius_meter` RS, submit tetap diterima dan foto tetap disimpan; respons mengembalikan `is_outside_hospital_radius: true`, `jarak_dari_rs_meter`, `hospital_radius_meter`, dan `verification_alert` untuk verifikasi manual.
  3. Evaluasi SLA otomatis:
     - Waktu submit <= jadwal: `status_sla = 'Selesai Tepat Waktu'`
     - Waktu submit > jadwal: `status_sla = 'Selesai Terlambat'`
  4. Auto-Next Visit: Bila `status_kondisi_terbaru` BUKAN status terminal (`'Selesai'`, `'Meninggal Dunia'`, `'Sudah Pulang'`), backend otomatis menjadwalkan kunjungan lanjutan ke-N+1 (`jadwal_kunjungan = waktu_submit + 72 Jam / 3 Hari`).
  5. Khusus `'Dirujuk ke RS Lain'`:
     - `rujukan_hospital_id` wajib; ditolak `422` bila kosong, sama dengan RS kasus, atau RS tujuan tidak aktif.
     - Dalam satu transaksi: visit sumber dicatat selesai, `cases.hospital_id`/`rumah_sakit`/`status_kondisi` pindah ke RS tujuan, petugas RS tujuan ter-assign otomatis (prioritas `is_primary`, beban kasus aktif terendah) dan menerima notifikasi DM WhatsApp otomatis. Bila RS tujuan tidak punya plotting aktif, kasus tetap pindah dengan `assigned_officer_id = null` (respons `referral.unassigned = true`; Kabag dapat override).
     - Visit baru ke-N+1 dibuat dengan SLA 72 jam sejak waktu rujukan, kecuali status terminal.
     - Tiket kasus `nomor_tiket` tidak berubah; riwayat tersimpan di tabel `case_referrals` (tampil di `GET /cases/:id`).
     - Follow-up kunjungan di RS asal otomatis berhenti.
- **Response 200 OK (Dalam Radius)**:
  ```json
  {
    "success": true,
    "message": "Kunjungan berhasil disubmit.",
    "status_sla": "Selesai Tepat Waktu",
    "jarak_dari_rs_meter": 42,
    "hospital_radius_meter": 200,
    "is_outside_hospital_radius": false,
    "verification_alert": null
  }
  ```
- **Response 200 OK (Di Luar Radius - Soft Geofence Alert)**:
  ```json
  {
    "success": true,
    "message": "Kunjungan berhasil disubmit dengan catatan lokasi di luar radius RS.",
    "status_sla": "Selesai Tepat Waktu",
    "jarak_dari_rs_meter": 850,
    "hospital_radius_meter": 200,
    "is_outside_hospital_radius": true,
    "verification_alert": "Lokasi GPS berada di luar radius RS (jarak 850 meter, batas 200 meter). Perlu verifikasi manual."
  }
  ```
- **Response 200 OK (Rujukan ke RS Lain)**:
  ```json
  {
    "success": true,
    "message": "Kunjungan berhasil disubmit.",
    "status_sla": "Selesai Tepat Waktu",
    "jarak_dari_rs_meter": 42,
    "hospital_radius_meter": 200,
    "is_outside_hospital_radius": false,
    "verification_alert": null,
    "referral": {
      "id": 4,
      "target_hospital_id": 2,
      "assigned_officer": { "id": 2, "nama": "Budi Petugas" },
      "unassigned": false
    }
  }
  ```

### 4.2 Override Petugas Rujukan (Khusus Kabag)
- **Method / Endpoint**: `PATCH /cases/:caseId/referrals/:referralId/assignee`
- **Auth**: Bearer Token (Role `kabag` saja)
- **Request Body**:
  ```json
  { "officer_id": 3 }
  ```
- **Aturan**:
  1. Hanya mengubah `cases.assigned_officer_id` dan `case_referrals.new_officer_id`; field lain diabaikan.
  2. `officer_id` wajib berupa ID valid dan petugas harus punya plotting aktif (`officer_hospitals.is_active = 1`) di RS tujuan rujukan (`422` bila tidak).
  3. `previous_officer_id` di riwayat tetap menyimpan petugas asal. Petugas baru yang dipilih akan menerima notifikasi DM WhatsApp otomatis untuk kunjungan aktif pada RS tujuan.
- **Response 200 OK**:
  ```json
  {
    "success": true,
    "message": "Petugas rujukan berhasil diperbarui.",
    "data": {
      "case_id": 10,
      "referral_id": 4,
      "assigned_officer": { "id": 3, "nama": "Citra Petugas" }
    }
  }
  ```
- **Error**: `401` tanpa token, `403` bukan kabag, `404` kasus/rujukan tidak ada, `422` plotting tidak valid.

### 4.3 Ambil Foto Bukti Kunjungan
- **Method / Endpoint**: `GET /uploads/:filename` (nilai `foto_bukti_url` dari detail visit)
- **Auth**: Bearer Token. Kabag boleh membuka semua bukti; petugas hanya bukti pada kasus yang saat ini ter-assign kepadanya.
- **Frontend**: Fetch sebagai `blob` dengan header `Authorization`, lalu gunakan object URL untuk pratinjau. URL tidak dapat langsung dipakai pada atribut `<img>` karena browser tidak mengirim Bearer token secara otomatis.
- **Error**: `401` tanpa token, `403` bukan pemilik tugas/kabag, `404` data atau file bukti tidak ada.

---

## 5. Master Data (tulis khusus role `kabag`)

Semua endpoint berikut memerlukan Bearer Token. Endpoint GET rumah sakit/petugas dan plotting memerlukan login (keduanya boleh dibaca petugas dan Kabag); semua perubahan rumah sakit/petugas/plotting/user hanya role `kabag`.

### 5.1 Rumah Sakit (`/hospitals`)
- `GET /hospitals` -> Default hanya RS aktif. Kabag dapat meminta `?include_inactive=true` untuk menyertakan RS nonaktif. Respons `{ success, data: Hospital[] }`.
- `POST /hospitals` -> Body wajib `nama_rs`, `latitude`, `longitude`, `radius_meter`; `alamat` opsional. `201` dengan objek `data`; `409` bila nama duplikat.
- `PUT /hospitals/:id` -> Update penuh: `nama_rs`, `latitude`, `longitude`, `radius_meter` wajib; `alamat` opsional (kosong mengosongkan alamat), `is_active` boolean opsional. `200` objek `data`; `404` tidak ada; `409` nama duplikat.
- `DELETE /hospitals/:id` -> Soft-delete (set `is_active=0`), bukan hapus fisik. `200` atau `404`.

### 5.2 Petugas Jasa Raharja (`/officers`)
- `GET /officers` -> Default petugas aktif; Kabag dapat memakai `?include_inactive=true`. Respons berisi data petugas ditambah `username`, `role`, `akun_aktif` bila akun tertaut.
- `GET /officers/:id` -> Detail petugas (login; dapat membaca data petugas nonaktif), `404` bila tidak ada.
- `POST /officers` -> Kabag. Body wajib `nama`; opsional `nip`, `jabatan`, `telepon`, `email`, `wilayah`. `201`; `409` NIP/email duplikat.
- `PUT /officers/:id` -> Kabag. Partial update field petugas dan/atau boolean `is_active`. Menonaktifkan petugas juga menonaktifkan akun tertaut. `200` atau `404`.
- `DELETE /officers/:id` -> Soft-delete petugas dan menonaktifkan akun tertaut. `200` atau `404`.

### 5.3 Plotting Penugasan Petugas ke RS (`/officers/:id/hospitals`)
- `GET /officers/:id/hospitals` -> Login; daftar plotting aktif. `404` jika petugas tidak ada.
- `POST /officers/:officerId/hospitals` -> Kabag. Body `hospital_id` wajib, `is_primary` opsional (default `false`). `201` untuk relasi baru, `200` untuk reaktivasi/update; respons memuat `data` plotting.
- `DELETE /officers/:officerId/hospitals/:hospitalId` -> Kabag; menonaktifkan relasi (`ended_at` diisi, riwayat dipertahankan), `200` atau `404`.

### 5.4 Manajemen User Akun (`/users`)
Semua endpoint memerlukan role `kabag`.
- `GET /users` -> Daftar akun, termasuk field petugas tertaut; password hash tidak dikirim.
- `POST /users` -> Body wajib `username`, `password`; `role` opsional (default `petugas`). Untuk `role: 'petugas'`, `officer_id` wajib dan harus petugas aktif; untuk Kabag boleh `null`. `201`; `409` username duplikat.
- `PUT /users/:id` -> Update parsial `password`, `role`, `officer_id`, `is_active`. Tidak bisa menonaktifkan akun Kabag sendiri. `200`/`404`.
- `DELETE /users/:id` -> Soft-disable akun (`is_active=0`), tidak menghapus fisik; tidak bisa menonaktifkan akun sendiri. `200`/`404`.

---

## 6. Penanganan Notifikasi & SLA (Sisi Background)
- Ketika laporan masuk dari WhatsApp grup RS, sistem backend otomatis menugaskan petugas sesuai plotting RS dan mengirim pesan notifikasi ke WhatsApp nomor petugas (`62...`) — **kecuali laka tunggal**. Laka tunggal disimpan sebagai `Diarsipkan`, tanpa penugasan, kunjungan, SLA, atau notifikasi tugas.
- Petugas akan menerima pesan pengingat otomatis di WhatsApp saat sisa waktu SLA kunjungan berada di batas:
  - 24 Jam sebelum batas waktu.
  - 12 Jam sebelum batas waktu.
  - 3 Jam sebelum batas waktu.
- Frontend tidak perlu memicu push notifikasi; cukup mengonsumsi status kunjungan dan flag `is_overdue` dari API `/cases`.

---

## 7. Panduan Cepat & Aturan UI Frontend (Cheatsheet Penting)

Bagian ini merangkum aturan bisnis & validasi wajib untuk komponen UI frontend agar tidak kena error backend.

> **Penting:** Aplikasi ini TIDAK mengelola perhitungan biaya/plafon. Monitoring biaya ditangani aplikasi lain (JR-Care). Sistem ini hanya menyimpan status keterjaminan, nomor GL, dan tanggal GL — tanpa nominal rupiah. Jangan buat form input biaya/kuitansi di frontend.

### 7.1 Keterjaminan & Data GL (hanya teks, tanpa angka biaya)
1. `cases.status_keterjaminan` bernilai salah satu dari: `'Belum Dikonfirmasi'`, `'Terjamin JR'`. Tidak ada status BPJS — sistem ini khusus Jasa Raharja.
2. Ubah status + data GL lewat `PATCH /cases/:id/keterjaminan` (partial update, field yang tidak dikirim tidak berubah).
3. Field yang boleh diisi di UI:
   - `status_keterjaminan` (dropdown 2 nilai di atas)
   - `no_gl` (input teks, maks 50 karakter; kirim `null` untuk mengosongkan)
   - `tgl_gl` (input tanggal `DD/MM/YYYY`; format salah ditolak `422`)
4. Tampilkan badge keterjaminan di list & detail kasus. Contoh warna yang disarankan:
   - `Terjamin JR` — hijau
   - `Belum Dikonfirmasi` — abu-abu/kuning
5. Tombol/label "GL sudah terbit" cukup dicek dari `no_gl` tidak null. Tidak ada plafon, sisa saldo, atau status habis plafon di sistem ini.
6. **Laka tunggal:** backend mengembalikan `status_pemantauan: 'Diarsipkan'`, `assigned_officer_id: null`, dan tidak ada visit/SLA. Tampilkan badge abu-abu `Diarsipkan — tidak ditindaklanjuti JR`; jangan tampilkan sebagai tugas aktif atau form kunjungan. Arsip hanya muncul pada daftar Kabag.

### 7.2 Tampilan Gambar Bukti Kunjungan (`/uploads/:filename`)
- Jangan pakai `<img src="/uploads/..." />` langsung — endpoint butuh header `Authorization: Bearer <token>`.
- Ambil sebagai blob:

```javascript
const res = await fetch(`${API_BASE_URL}/uploads/${filename}`, {
  headers: { Authorization: `Bearer ${token}` }
});
const blob = await res.blob();
const imageUrl = URL.createObjectURL(blob);
// pasang ke <img src={imageUrl} /> lalu URL.revokeObjectURL saat unmount
```

### 7.3 Format Tanggal & Angka
- Semua tanggal dari API berupa string `DD/MM/YYYY` (bukan ISO). Kirim balik dengan format sama; `YYYY-MM-DD` dari datepicker browser wajib dikonversi dulu.
- Nominal uang tidak lagi ada di kontrak API. Kalau butuh menampilkan angka lain (misal statistik jumlah kasus), gunakan angka murni dari respons.
