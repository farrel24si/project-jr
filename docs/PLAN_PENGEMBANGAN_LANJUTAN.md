# PLAN PENGEMBANGAN BACKEND & INTEGRASI PROJECTREAL
Target: Menyelesaikan kekurangan pasca-MVP menuju Full System Ready
Dokumen ini dibuat pada: 8 November 2026

================================================================================
FASE 1: NOTIFIKASI OTOMATIS WHATSAPP (BOT ALERTS & REMINDERS)
Fokus: Petugas mendapatkan notifikasi langsung di nomor pribadinya tanpa cek web terus-menerus.
================================================================================

1.1 Migration Tabel `notification_logs`
- Tujuan: Mencegah bot mengirim pesan yang sama berkali-kali (anti-spam / deduplikasi).
- Struktur kolom:
  * id (INT PK AI)
  * case_id (INT FK cases)
  * visit_id (INT NULL FK visits)
  * officer_id (INT FK officers)
  * notification_type (ENUM: 'NEW_ASSIGNMENT', 'REMINDER_24H', 'REMINDER_12H', 'REMINDER_3H', 'OVERDUE')
  * phone_number (VARCHAR 30)
  * message_preview (TEXT)
  * sent_at (DATETIME)
  * delivery_status (ENUM: 'SENT', 'FAILED')
- File: migrations/005_notification_logs.sql

1.2 Trigger DM WhatsApp Saat Kasus Baru Di-Assign
- Lokasi: backend/src/bot/whatsapp.js (setelah auto-assignment berhasil).
- Logika:
  * Ambil nomor telepon petugas dari tabel `officers` (format: 628xxx).
  * Format template pesan DM:
    --------------------------------------------------
    *Pemberitahuan Tugas Baru Jasa Raharja*
    
    Yth. Petugas: {nama_petugas}
    Terdapat laporan korban baru yang perlu diverifikasi:
    
    - No Tiket: {nomor_tiket}
    - Korban: {nama_korban}
    - RS: {nama_rs}
    - Kondisi: {status_kondisi}
    - Batas Kunjungan ke-1: 72 Jam ({jadwal_kunjungan})
    
    Silakan lakukan kunjungan fisik dan submit laporan melalui sistem.
    --------------------------------------------------
  * Kirim via Baileys: sock.sendMessage(`${phone}@s.whatsapp.net`, { text })
  * Catat riwayat pengiriman ke `notification_logs`.

1.3 Background Scheduler (Pengingat SLA 24h, 12h, 3h)
- Komponen: Background worker (bisa pakai `node-cron` atau timer interval teratur di backend).
- Frekuensi scan: Setiap 10 atau 15 menit sekali.
- Logika scan:
  * Query tabel `visits` yang statusnya masih 'Menunggu'.
  * Hitung selisih waktu sekarang dengan `jadwal_kunjungan`:
    - Rentang <= 24 jam & > 12 jam -> kirim tipe 'REMINDER_24H' (jika belum tercatat di logs).
    - Rentang <= 12 jam & > 3 jam  -> kirim tipe 'REMINDER_12H' (jika belum tercatat di logs).
    - Rentang <= 3 jam & > 0 jam   -> kirim tipe 'REMINDER_3H' (jika belum tercatat di logs).
  * Catatan: Jika sudah lewat (overdue), dashboard web otomatis menandai merah (`is_overdue = 1`), tidak perlu spam WA ke Kabag.

================================================================================
FASE 2: ENDPOINT KASUS MANUAL & FLEKSIBILITAS INPUT
Fokus: Mengakomodasi laporan yang masuk di luar grup WhatsApp resmi.
================================================================================

2.1 Endpoint Input Kasus Manual (`POST /api/cases`)
- Akses: Kabag dan Petugas yang sedang login.
- Payload body:
  * hospital_id (INT Wajib)
  * nama_korban (VARCHAR Wajib)
  * jenis_laka (Tunggal / Tidak Tunggal / Belum Diketahui)
  * nik (opsional)
  * umur, jenis_kelamin, alamat, telepon_korban (opsional)
  * tgl_laka, tgl_masuk, kronologi, status_kondisi (opsional)
- Alur:
  * Generate tiket `JR-XXXXXX`.
  * Auto-assign petugas berdasarkan RS (atau Kabag bisa assign manual).
  * Buat kunjungan ke-1 (SLA 72 jam).
  * Kirim notifikasi DM ke petugas terkait.

================================================================================
FASE 3: DOKUMENTASI KONTRAK API UNTUK TIM FRONTEND
Fokus: Memberikan spesifikasi jelas agar teman tim frontend bisa menyambungkan UI ke backend.
================================================================================

3.1 Buat File `docs/API_CONTRACT_FRONTEND.md`
- Base URL: http://localhost:5000/api
- Header standar: `Authorization: Bearer <token>`
- Rincian endpoint yang siap dikonsumsi frontend:
  1. Auth:
     - POST `/auth/login` (body: username, password) -> dapat token & role.
     - GET `/auth/me` -> cek sesi & data diri.
  2. Master Data (Role Kabag):
     - GET / POST / PUT / DELETE `/hospitals`
     - GET / POST / PUT / DELETE `/officers`
     - GET / POST / DELETE `/officers/:id/hospitals` (Plotting RS)
     - GET / POST / PUT / DELETE `/users`
  3. Monitoring & Kasus (Kabag & Petugas):
     - GET `/cases` (Kabag lihat semua + is_overdue, Petugas lihat miliknya saja).
     - GET `/cases/:id` (Detail kasus, koordinat RS, riwayat kunjungan).
  4. Pelaporan Kunjungan (Role Petugas):
     - POST `/visits/:visitId/submit` (Multipart/form-data: lokasi GPS, checklist edukasi/LP/keluarga, foto bukti).
     - Aturan radius anti-fraud dan auto-jadwal kunjungan ke-2 dijelaskan transparan.

================================================================================
FASE 4: PERSIAPAN HOSTING & PRODUCTION READINESS
Fokus: Menjamin aplikasi stabil saat dipindahkan dari laptop ke server online.
================================================================================

4.1 Konfigurasi Environment & Keamanan
- Amankan `.env` (ganti JWT_SECRET panjang dan acak).
- Pastikan folder `uploads/` dan `session_jr_bot/` masuk ke `.gitignore` (sudah aman).
- Konfigurasi CORS jika domain frontend dan backend berbeda di production.

4.2 Setup Persistence WhatsApp Session
- Pastikan folder auth Baileys (`session_jr_bot`) tetap tersimpan di server hosting agar bot tidak perlu scan ulang setiap server restart.

================================================================================
FASE 5: KUALITAS, KEAMANAN, DAN KESIAPAN OPERASIONAL
Fokus: Menutup risiko sebelum demo final dan hosting.
================================================================================

5.1 Rapikan Migration Database
- Perbaiki migration lama agar database baru dan database lama menghasilkan struktur yang sama.
- Semua perubahan schema harus lewat file migration; jangan ada lagi `ALTER TABLE` manual di terminal.
- Audit migration 001-004 terhadap `schema.sql` dan kode backend.

5.2 Lengkapi Test Otomatis
- Test laporan WA membuat kasus, visit pertama, dan auto-assignment.
- Test petugas tidak dapat membaca kasus petugas lain.
- Test submit visit di dalam dan di luar radius RS.
- Test pengingat WA tidak terkirim dua kali untuk visit dan tahap SLA sama.

5.3 Tambah Health Check
- Endpoint `GET /health`.
- Response minimal: status API, waktu server, dan status koneksi DB.
- Dipakai hosting/platform monitor untuk mendeteksi backend mati atau DB terputus.

5.4 Logging Production
- Error API dan bot WA tidak cukup hanya `console.error`.
- Simpan log terstruktur ke file/service log: waktu, sumber error, pesan, stack trace, case_id/visit_id bila ada.
- Jangan simpan password, JWT, atau data sensitif penuh di log.

5.5 Backup dan Storage Persistent
- Jadwalkan backup MySQL sebelum dan sesudah deploy.
- Folder `uploads/` wajib persistent agar foto bukti tidak hilang.
- Folder `session_jr_bot/` wajib persistent agar WhatsApp tidak minta scan QR setelah restart/deploy.
- Uji prosedur restore backup sebelum production.

5.6 Keamanan Production
- Ganti password akun demo `kabag` dan `andi`; nonaktifkan/hapus akun demo setelah akun final dibuat.
- Ganti `JWT_SECRET` dengan string acak panjang di environment production.
- Gunakan HTTPS.
- Batasi CORS hanya ke domain frontend production.
- Tambah rate limit khusus endpoint login.
- Jangan buat endpoint registrasi publik; akun Kabag pertama dibuat lewat proses bootstrap terkontrol, lalu Pak Andi mengganti password sendiri.

5.7 Integrasi Frontend (Pekerjaan Tim Frontend)
- Ganti mock/localStorage dengan API backend.
- Login menyimpan JWT dan role.
- Kabag melihat semua kasus; petugas hanya melihat kasus yang ditugaskan.
- Form submit visit memakai multipart/form-data untuk foto dan GPS.
- Tampilkan SLA, `is_overdue`, status kunjungan, dan petugas penanggung jawab.
- Frontend harus mengikuti `docs/API_CONTRACT_FRONTEND.md` setelah Fase 3 selesai.

5.8 Pilihan Hosting
- Jangan gunakan shared hosting biasa untuk bot Node.js + Baileys.
- Gunakan VPS atau container hosting yang mendukung process berjalan terus, MySQL, HTTPS, dan storage/volume persistent.
- Gunakan process manager (misalnya PM2) atau container restart policy.

================================================================================
URUTAN KERJA REKOMENDASI SETELAH MVP
================================================================================
1. Fase 1: notifikasi tugas + reminder WA.
2. Fase 3: kontrak API frontend.
3. Fase 2: input kasus manual.
4. Fase 5.1-5.3: migration rapi, test, health check (SELESAI - endpoint `GET /api/health`, test suite unit+health+integrasi pass, audit migrasi 001-007).
5. Integrasi frontend oleh tim frontend (Fase 3 & 5.7 - gunakan `docs/API_CONTRACT_FRONTEND.md`).
6. Fase 4 + Fase 5.4-5.8: keamanan, backup, log, dan hosting.

Catatan status pada 8 November 2026:
- MVP backend berjalan: laporan WA -> cases + visit SLA 72 jam -> auto-assignment -> akses petugas -> submit visit.
- Yang belum aktif: DM WA petugas, reminder SLA, input manual, frontend API integration, dan deployment production.
- Jangan menambah modul monitoring/santunan/audit sebelum alur MVP + frontend stabil.
