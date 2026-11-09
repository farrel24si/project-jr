CREATE DATABASE IF NOT EXISTS db_monitoring_jr;
USE db_monitoring_jr;

-- Master Rumah Sakit
CREATE TABLE IF NOT EXISTS hospitals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama_rs VARCHAR(100) NOT NULL,
  alamat VARCHAR(255) NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  radius_meter INT DEFAULT 200,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hospitals_nama_rs (nama_rs)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO hospitals (nama_rs, alamat, latitude, longitude, radius_meter) VALUES
('RS Prima Pekanbaru', 'Jl. Bima No.1, Delima, Kec. Binawidya, Kota Pekanbaru, Riau 28292', 0.49070000, 101.39950000, 200),
('RS Syafira Pekanbaru', 'Jl. Jend. Sudirman No.134, Tangkerang Tengah, Kec. Marpoyan Damai, Kota Pekanbaru, Riau 28282', 0.49830000, 101.45480000, 200);

-- Master Petugas Lapangan Jasa Raharja
CREATE TABLE IF NOT EXISTS officers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(150) NOT NULL,
  nip VARCHAR(30) NULL,
  jabatan VARCHAR(100) NULL,
  wilayah VARCHAR(100) NULL,
  telepon VARCHAR(30) NULL,
  email VARCHAR(150) NULL,
  max_active_cases INT NOT NULL DEFAULT 10,
  operational_status ENUM('Aktif Lapangan','Verifikasi Berkas','Perlu Perhatian','Nonaktif') NOT NULL DEFAULT 'Aktif Lapangan',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_officers_nip (nip),
  UNIQUE KEY uq_officers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Akun Pengguna / Autentikasi
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  officer_id INT NULL,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('kabag','petugas') NOT NULL DEFAULT 'petugas',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_officer_id (officer_id),
  CONSTRAINT fk_users_officer FOREIGN KEY (officer_id) REFERENCES officers(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Data Kasus Korban Kecelakaan; status ringkasan mempercepat list/dashboard
CREATE TABLE IF NOT EXISTS cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nomor_tiket VARCHAR(30) UNIQUE NOT NULL,
  nomor_laporan VARCHAR(100) NULL,
  rumah_sakit VARCHAR(100) NOT NULL,
  hospital_id INT NULL,
  ruangan_rs VARCHAR(150) NULL,
  assigned_officer_id INT NULL,
  nama_korban VARCHAR(150) NOT NULL,
  nik VARCHAR(16) NULL,
  umur INT NULL,
  jenis_kelamin ENUM('Laki-laki','Perempuan') NULL,
  alamat TEXT NULL,
  telepon_korban VARCHAR(30) NULL,
  tgl_laka VARCHAR(50) NULL,
  lokasi_kejadian VARCHAR(255) NULL,
  tgl_masuk VARCHAR(50) NULL,
  kronologi TEXT NULL,
  keterangan_tambahan TEXT NULL,
  jenis_laka ENUM('Tunggal','Tidak Tunggal','Belum Diketahui') NOT NULL DEFAULT 'Belum Diketahui',
  status_kondisi VARCHAR(50) NOT NULL DEFAULT 'Rawat Inap',
  status_pemantauan ENUM('Belum Dikunjungi','Pemantauan Aktif','Menunggu Konfirmasi Kondisi','Selesai Dipantau') NOT NULL DEFAULT 'Belum Dikunjungi',
  status_konfirmasi_kondisi VARCHAR(50) NULL,
  waktu_pemantauan_terakhir DATETIME NULL,
  jadwal_pemantauan_berikutnya DATETIME NULL,
  tindak_lanjut_terakhir TEXT NULL,
  santunan_selesai TINYINT(1) NOT NULL DEFAULT 0,
  no_pelapor_wa VARCHAR(30) NULL,
  sumber_informasi VARCHAR(150) NULL,
  waktu_lapor_wa DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cases_hospital_id (hospital_id),
  KEY idx_cases_assigned_officer_id (assigned_officer_id),
  KEY idx_cases_officer_monitoring (assigned_officer_id, status_pemantauan),
  KEY idx_cases_hospital_reported (hospital_id, waktu_lapor_wa),
  CONSTRAINT fk_cases_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_cases_assigned_officer FOREIGN KEY (assigned_officer_id) REFERENCES officers(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Log Kunjungan Fisik Petugas ke Korban di Rumah Sakit
CREATE TABLE IF NOT EXISTS visits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  officer_id INT NULL,
  kunjungan_ke INT NOT NULL,
  jadwal_kunjungan DATETIME NOT NULL,
  waktu_aktual_kunjungan DATETIME NULL,
  kondisi_korban VARCHAR(50) NULL,
  cek_komunikasi_keluarga BOOLEAN DEFAULT FALSE,
  cek_edukasi_santunan BOOLEAN DEFAULT FALSE,
  cek_arahan_lp BOOLEAN DEFAULT FALSE,
  catatan_kondisi TEXT NULL,
  hasil_kunjungan TEXT NULL,
  komunikasi_keluarga TEXT NULL,
  penyampaian_hak TEXT NULL,
  arahan_lp TEXT NULL,
  tindak_lanjut TEXT NULL,
  foto_bukti_url VARCHAR(255) NULL,
  waktu_foto DATETIME NULL,
  lat_petugas DECIMAL(10,8) NULL,
  lng_petugas DECIMAL(11,8) NULL,
  akurasi_lokasi_meter DECIMAL(8,2) NULL,
  jarak_dari_rs_meter INT NULL,
  status_kunjungan ENUM('Menunggu','Selesai Tepat Waktu','Selesai Terlambat') DEFAULT 'Menunggu',
  KEY idx_visits_officer_id (officer_id),
  KEY idx_visits_case_sequence (case_id, kunjungan_ke, status_kunjungan),
  KEY idx_visits_officer_actual (officer_id, waktu_aktual_kunjungan),
  CONSTRAINT fk_visits_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_visits_officer FOREIGN KEY (officer_id) REFERENCES officers(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Riwayat handoff rujukan lintas rumah sakit
CREATE TABLE IF NOT EXISTS case_referrals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  source_hospital_id INT NOT NULL,
  target_hospital_id INT NOT NULL,
  previous_officer_id INT NULL,
  new_officer_id INT NULL,
  referred_by_officer_id INT NOT NULL,
  alasan_rujukan TEXT NULL,
  catatan_rujukan TEXT NULL,
  status_rujukan ENUM('Aktif', 'Dibatalkan', 'Selesai') NOT NULL DEFAULT 'Aktif',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_referrals_case (case_id),
  KEY idx_referrals_target_hospital (target_hospital_id),
  KEY idx_referrals_new_officer (new_officer_id),
  CONSTRAINT fk_referrals_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_referrals_source_hospital FOREIGN KEY (source_hospital_id) REFERENCES hospitals(id) ON UPDATE CASCADE,
  CONSTRAINT fk_referrals_target_hospital FOREIGN KEY (target_hospital_id) REFERENCES hospitals(id) ON UPDATE CASCADE,
  CONSTRAINT fk_referrals_prev_officer FOREIGN KEY (previous_officer_id) REFERENCES officers(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_referrals_new_officer FOREIGN KEY (new_officer_id) REFERENCES officers(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_referrals_referred_by FOREIGN KEY (referred_by_officer_id) REFERENCES officers(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Riwayat Pemantauan Berkala
CREATE TABLE IF NOT EXISTS monitorings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  officer_id INT NULL,
  kondisi_korban VARCHAR(50) NOT NULL,
  status_konfirmasi VARCHAR(50) NOT NULL DEFAULT 'Terkonfirmasi',
  sumber_info VARCHAR(255) NULL,
  waktu_pemantauan DATETIME NOT NULL,
  hasil_pemantauan TEXT NOT NULL,
  informasi_hak TEXT NULL,
  tindak_lanjut TEXT NULL,
  hospital_referral_id INT NULL,
  tanggal_kejadian_kondisi DATETIME NULL,
  keterangan_konfirmasi TEXT NULL,
  foto_bukti_url VARCHAR(255) NULL,
  lat_petugas DECIMAL(10,8) NULL,
  lng_petugas DECIMAL(11,8) NULL,
  akurasi_lokasi_meter DECIMAL(8,2) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_monitorings_case_time (case_id, waktu_pemantauan),
  KEY idx_monitorings_officer_time (officer_id, waktu_pemantauan),
  KEY idx_monitorings_referral_hospital (hospital_referral_id),
  CONSTRAINT fk_monitorings_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitorings_officer FOREIGN KEY (officer_id) REFERENCES officers(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_monitorings_referral_hospital FOREIGN KEY (hospital_referral_id) REFERENCES hospitals(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Plotting RS per petugas
CREATE TABLE IF NOT EXISTS officer_hospitals (
  officer_id INT NOT NULL,
  hospital_id INT NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (officer_id, hospital_id),
  KEY idx_officer_hospitals_hospital_active (hospital_id, is_active),
  CONSTRAINT fk_officer_hospitals_officer FOREIGN KEY (officer_id) REFERENCES officers(id) ON DELETE CASCADE,
  CONSTRAINT fk_officer_hospitals_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Riwayat penugasan kasus
CREATE TABLE IF NOT EXISTS case_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  officer_id INT NOT NULL,
  assigned_by_user_id INT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  reason VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_case_assignments_case_active (case_id, is_active),
  KEY idx_case_assignments_officer_active (officer_id, is_active),
  CONSTRAINT fk_case_assignments_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_assignments_officer FOREIGN KEY (officer_id) REFERENCES officers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_case_assignments_user FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Proses Santunan
CREATE TABLE IF NOT EXISTS compensations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  jenis_santunan VARCHAR(100) NOT NULL,
  status ENUM('Draft','Berkas Dilengkapi','Diajukan','Disetujui','Dibayarkan','Ditolak','Dibatalkan') NOT NULL DEFAULT 'Draft',
  nominal DECIMAL(15,2) NULL,
  beneficiary_name VARCHAR(150) NULL,
  beneficiary_relation VARCHAR(100) NULL,
  submitted_at DATETIME NULL,
  approved_at DATETIME NULL,
  paid_at DATETIME NULL,
  reference_number VARCHAR(100) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_compensations_case_status (case_id, status),
  CONSTRAINT fk_compensations_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Jejak koreksi aktivitas
CREATE TABLE IF NOT EXISTS activity_corrections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  activity_type ENUM('visit','monitoring') NOT NULL,
  activity_id INT NOT NULL,
  before_data JSON NOT NULL,
  after_data JSON NOT NULL,
  reason VARCHAR(500) NOT NULL,
  corrected_by_user_id INT NULL,
  corrected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_activity_corrections_activity (activity_type, activity_id),
  KEY idx_activity_corrections_case_time (case_id, corrected_at),
  CONSTRAINT fk_activity_corrections_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_corrections_user FOREIGN KEY (corrected_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Log Notifikasi WhatsApp Petugas (SLA / Penugasan)
CREATE TABLE IF NOT EXISTS notification_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  visit_id INT NOT NULL,
  officer_id INT NOT NULL,
  notification_type ENUM('NEW_ASSIGNMENT', 'REMINDER_24H', 'REMINDER_12H', 'REMINDER_3H') NOT NULL,
  phone_number VARCHAR(30) NOT NULL,
  message_preview TEXT NOT NULL,
  sent_at DATETIME NULL,
  delivery_status ENUM('PENDING', 'SENT', 'FAILED') NOT NULL,
  reserved_at DATETIME NULL,
  error_message VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notification_once (case_id, visit_id, officer_id, notification_type),
  KEY idx_notification_logs_visit_type (visit_id, notification_type),
  KEY idx_notification_logs_officer_sent (officer_id, sent_at),
  CONSTRAINT fk_notification_logs_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_logs_visit FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_logs_officer FOREIGN KEY (officer_id) REFERENCES officers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
