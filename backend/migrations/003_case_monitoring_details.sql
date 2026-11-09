-- Migration 003: detail korban, pemantauan berkala, audit, penugasan, dan santunan
-- Target: MySQL 8 / MariaDB. Aman dijalankan berulang.
-- Jalankan: mysql -u root -p < migrations/003_case_monitoring_details.sql

USE db_monitoring_jr;

DROP PROCEDURE IF EXISTS jr3_add_column;
DROP PROCEDURE IF EXISTS jr3_add_index;
DROP PROCEDURE IF EXISTS jr3_add_fk;

DELIMITER $$

CREATE PROCEDURE jr3_add_column(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_ddl TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
  ) THEN
    SET @ddl := CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN ', p_ddl);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

CREATE PROCEDURE jr3_add_index(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_ddl TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
  ) THEN
    SET @ddl := CONCAT('ALTER TABLE `', p_table, '` ADD ', p_ddl);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

CREATE PROCEDURE jr3_add_fk(IN p_table VARCHAR(64), IN p_constraint VARCHAR(64), IN p_ddl TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table
      AND CONSTRAINT_NAME = p_constraint AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    SET @ddl := CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_constraint, '` ', p_ddl);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------------
-- 1. Detail korban dan ringkasan pemantauan pada kasus
-- status_kondisi tetap VARCHAR agar selaras dengan pilihan UI tanpa migrasi ENUM
-- ---------------------------------------------------------------------------
ALTER TABLE cases MODIFY COLUMN status_kondisi VARCHAR(50) NOT NULL DEFAULT 'Rawat Inap';

CALL jr3_add_column('cases', 'nomor_laporan', '`nomor_laporan` VARCHAR(100) NULL AFTER `nomor_tiket`');
CALL jr3_add_column('cases', 'jenis_kelamin', '`jenis_kelamin` ENUM(\'Laki-laki\',\'Perempuan\') NULL AFTER `umur`');
CALL jr3_add_column('cases', 'telepon_korban', '`telepon_korban` VARCHAR(30) NULL AFTER `alamat`');
CALL jr3_add_column('cases', 'ruangan_rs', '`ruangan_rs` VARCHAR(150) NULL AFTER `hospital_id`');
CALL jr3_add_column('cases', 'lokasi_kejadian', '`lokasi_kejadian` VARCHAR(255) NULL AFTER `tgl_laka`');
CALL jr3_add_column('cases', 'sumber_informasi', '`sumber_informasi` VARCHAR(150) NULL AFTER `no_pelapor_wa`');
CALL jr3_add_column('cases', 'keterangan_tambahan', '`keterangan_tambahan` TEXT NULL AFTER `kronologi`');
CALL jr3_add_column('cases', 'status_pemantauan', '`status_pemantauan` ENUM(\'Belum Dikunjungi\',\'Pemantauan Aktif\',\'Menunggu Konfirmasi Kondisi\',\'Selesai Dipantau\') NOT NULL DEFAULT \'Belum Dikunjungi\' AFTER `status_kondisi`');
CALL jr3_add_column('cases', 'status_konfirmasi_kondisi', '`status_konfirmasi_kondisi` VARCHAR(50) NULL AFTER `status_pemantauan`');
CALL jr3_add_column('cases', 'waktu_pemantauan_terakhir', '`waktu_pemantauan_terakhir` DATETIME NULL AFTER `status_konfirmasi_kondisi`');
CALL jr3_add_column('cases', 'jadwal_pemantauan_berikutnya', '`jadwal_pemantauan_berikutnya` DATETIME NULL AFTER `waktu_pemantauan_terakhir`');
CALL jr3_add_column('cases', 'tindak_lanjut_terakhir', '`tindak_lanjut_terakhir` TEXT NULL AFTER `jadwal_pemantauan_berikutnya`');
CALL jr3_add_column('cases', 'santunan_selesai', '`santunan_selesai` TINYINT(1) NOT NULL DEFAULT 0 AFTER `tindak_lanjut_terakhir`');
CALL jr3_add_index('cases', 'idx_cases_officer_monitoring', 'KEY `idx_cases_officer_monitoring` (`assigned_officer_id`, `status_pemantauan`)');
CALL jr3_add_index('cases', 'idx_cases_hospital_reported', 'KEY `idx_cases_hospital_reported` (`hospital_id`, `waktu_lapor_wa`)');

-- ---------------------------------------------------------------------------
-- 2. Detail hasil kunjungan fisik RS
-- ---------------------------------------------------------------------------
CALL jr3_add_column('visits', 'kondisi_korban', '`kondisi_korban` VARCHAR(50) NULL AFTER `waktu_aktual_kunjungan`');
CALL jr3_add_column('visits', 'hasil_kunjungan', '`hasil_kunjungan` TEXT NULL AFTER `catatan_kondisi`');
CALL jr3_add_column('visits', 'komunikasi_keluarga', '`komunikasi_keluarga` TEXT NULL AFTER `hasil_kunjungan`');
CALL jr3_add_column('visits', 'penyampaian_hak', '`penyampaian_hak` TEXT NULL AFTER `komunikasi_keluarga`');
CALL jr3_add_column('visits', 'arahan_lp', '`arahan_lp` TEXT NULL AFTER `penyampaian_hak`');
CALL jr3_add_column('visits', 'tindak_lanjut', '`tindak_lanjut` TEXT NULL AFTER `arahan_lp`');
CALL jr3_add_column('visits', 'akurasi_lokasi_meter', '`akurasi_lokasi_meter` DECIMAL(8,2) NULL AFTER `lng_petugas`');
CALL jr3_add_column('visits', 'waktu_foto', '`waktu_foto` DATETIME NULL AFTER `foto_bukti_url`');
CALL jr3_add_index('visits', 'idx_visits_case_sequence', 'KEY `idx_visits_case_sequence` (`case_id`, `kunjungan_ke`, `status_kunjungan`)');
CALL jr3_add_index('visits', 'idx_visits_officer_actual', 'KEY `idx_visits_officer_actual` (`officer_id`, `waktu_aktual_kunjungan`)');

-- ---------------------------------------------------------------------------
-- 3. Riwayat pemantauan lanjutan; satu aktivitas = satu baris
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4. Plotting RS dan riwayat penugasan kasus
-- ---------------------------------------------------------------------------
CALL jr3_add_column('officers', 'max_active_cases', '`max_active_cases` INT NOT NULL DEFAULT 10 AFTER `email`');
CALL jr3_add_column('officers', 'operational_status', '`operational_status` ENUM(\'Aktif Lapangan\',\'Verifikasi Berkas\',\'Perlu Perhatian\',\'Nonaktif\') NOT NULL DEFAULT \'Aktif Lapangan\' AFTER `max_active_cases`');

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

-- ---------------------------------------------------------------------------
-- 5. Proses santunan per kasus
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compensations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  jenis_santunan VARCHAR(100) NOT NULL,
  status ENUM('Draft', 'Berkas Dilengkapi', 'Diajukan', 'Disetujui', 'Dibayarkan', 'Ditolak', 'Dibatalkan') NOT NULL DEFAULT 'Draft',
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

-- ---------------------------------------------------------------------------
-- 6. Jejak koreksi catatan aktivitas; catatan asli tidak hilang
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_corrections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  activity_type ENUM('visit', 'monitoring') NOT NULL,
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

DROP PROCEDURE IF EXISTS jr3_add_column;
DROP PROCEDURE IF EXISTS jr3_add_index;
DROP PROCEDURE IF EXISTS jr3_add_fk;
