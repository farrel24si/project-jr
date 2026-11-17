# Catatan Update Backend v4 (untuk tim frontend)

Dokumen ini merangkum perubahan backend yang berdampak ke frontend, dan hal yang perlu ditindaklanjuti di sisi frontend. Detail kontrak endpoint ada di `docs/API_CONTRACT_FRONTEND.md`.

## 1. Setup setelah `git pull`

1. Jalankan migrasi terbaru di database lokal (urutan lengkap ada di `backend/README.md`):
   ```bash
   mysql -u root -p db_monitoring_jr < backend/migrations/015_archive_single_vehicle_cases.sql
   mysql -u root -p db_monitoring_jr < backend/migrations/016_indexes_and_optimizations.sql
   ```
   Untuk database baru, cukup import `backend/schema.sql`.
2. Samakan `backend/.env` dengan `backend/.env.example`. Variabel baru:
   - `ALLOW_DM_REPORTS` (default `false`): laporan `#LAPORLAKA` hanya diterima dari grup WhatsApp RS. Isi `true` jika ingin menguji lewat chat pribadi.
   - `CORS_ORIGIN` (opsional): daftar origin dipisah koma. Jika kosong, semua origin diizinkan.
3. Jalankan `npm install` di `frontend/` bila `node_modules` belum memuat `jspdf` dan `jspdf-autotable`.

## 2. Perubahan backend yang menyentuh frontend

| Area | Perubahan |
|---|---|
| Login | `username` menerima username, email kedinasan, atau prefix email. Response `user` kini memuat `email`, `telepon`, `nip`. |
| `GET /api/auth/me` | Kini memuat `nip`, `telepon`, `email`. |
| `POST /api/auth/logout` | Endpoint baru (stateless, hanya mengembalikan sukses). |
| Rate limit login | Lebih dari 15 gagal per 15 menit per IP dibalas `429`. |
| `PUT /api/users/:id` | Petugas boleh, hanya untuk password akunnya sendiri. |
| `PUT /api/officers/:id` | Petugas boleh, hanya untuk profil dirinya sendiri, tanpa `is_active`. |
| `POST /api/cases` | `tgl_laka`, `tgl_masuk`, `tgl_gl` menerima ISO datetime. Disimpan sebagai `DD/MM/YYYY`. |
| `GET /api/cases` | Kini memuat `status_pemantauan` dan kolom detail tambahan. |
| Visibilitas petugas | Petugas lama (pernah berkunjung atau merujuk) bisa membaca kasus dan foto secara read-only. |
| Status terminal | `Sudah Pulang` kini menghentikan visit lanjutan, setara `Selesai` dan `Meninggal Dunia`. |
| Laka tunggal | `status_pemantauan = 'Diarsipkan'`: tanpa petugas, visit, SLA, atau notifikasi. |
| Rujukan | Petugas tujuan (otomatis maupun hasil override Kabag) menerima DM WhatsApp. |
| Keamanan HTTP | Header keamanan dasar, batas body JSON 100 KB, validasi tipe input yang lebih ketat. |

Perubahan di folder `frontend/`: hanya `frontend/src/services/backendMapper.js` (pemetaan `status_pemantauan` untuk `Diarsipkan` dan `Sudah Pulang`).

## 3. Yang perlu ditindaklanjuti di frontend

1. **Keamanan (prioritas tinggi)**
   - `frontend/src/services/api.js`, fungsi `updateUserPassword`, punya fallback yang login sebagai `kabag` dengan menebak password (`123456`, `kabag`, `admin`, dan lainnya) lalu memakai tokennya.
   - `frontend/src/context/AuthContext.jsx` menyimpan password kabag dalam teks biasa di `localStorage['jr_adm_sec']` (di `login` dan `updatePassword`). `api.js` membacanya kembali.
   - Karena petugas kini boleh mengganti password sendiri lewat `PUT /api/users/:id`, fallback dan penyimpanan itu tidak diperlukan. Hapus keduanya dan bersihkan key `jr_adm_sec`.
2. **Pesan 429 tidak terbaca:** `AuthContext.login` memakai `errMsg.includes('terlalu banyak')` (huruf kecil), padahal pesan backend diawali "Terlalu". Akibatnya 429 tampil sebagai "server tidak dapat dihubungi". Gunakan pengecekan case-insensitive atau cek status HTTP 429.
3. **Status `Diarsipkan`:** pastikan daftar, badge, dan halaman detail menangani kasus laka tunggal yang tidak punya petugas, visit, atau SLA.
4. **Notifikasi in-app** (`storageService.addNotification`) hanya disimpan di `localStorage` browser pengirim. Petugas tujuan tidak melihatnya. Kanal yang benar-benar sampai adalah DM WhatsApp dari backend.
5. **Kolom `visits.kondisi_korban`** tidak disimpan oleh backend. Mapper masih menebak kondisi per kunjungan dari `catatan_kondisi`, jadi hasilnya bisa kurang akurat.
6. **Tombol reset** di `Navbar.jsx` masih berlabel "Kembalikan seluruh data simulasi ke kondisi awal?". Padahal tombol itu hanya membersihkan cache lokal dan sinkron ulang dari server. Pertimbangkan mengganti label atau menghapusnya.
