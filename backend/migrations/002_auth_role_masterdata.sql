-- Migration 002: master data officers/users, auth, relasi hospital_id, soft delete
-- Target: MySQL 8 / MariaDB. Aman dijalankan berulang.
-- Jalankan: mysql -u root -p < migrations/002_auth_role_masterdata.sql

USE db_monitoring_jr;

-- ---------------------------------------------------------------------------
-- Helper: tambah kolom hanya jika belum ada
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS jr_add_column;
DROP PROCEDURE IF EXISTS jr_add_index;
DROP PROCEDURE IF EXISTS jr_add_fk;

DELIMITER $$

CREATE PROCEDURE jr_add_column(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_ddl TEXT)
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

CREATE PROCEDURE jr_add_index(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_ddl TEXT)
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

CREATE PROCEDURE jr_add_fk(IN p_table VARCHAR(64), IN p_constraint VARCHAR(64), IN p_ddl TEXT)
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
-- 1. Tabel officers (biodata petugas lapangan, bisa ada tanpa akun login)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS officers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(150) NOT NULL,
  nip VARCHAR(30) NULL,
  jabatan VARCHAR(100) NULL,
  wilayah VARCHAR(100) NULL,
  telepon VARCHAR(30) NULL,
  email VARCHAR(150) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_officers_nip (nip),
  UNIQUE KEY uq_officers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 2. Tabel users (kredensial login, terpisah dari biodata officers)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. Soft delete hospitals + koordinat resmi RS acuan
-- ---------------------------------------------------------------------------
CALL jr_add_column('hospitals', 'is_active', '`is_active` TINYINT(1) NOT NULL DEFAULT 1');
CALL jr_add_column('hospitals', 'alamat', '`alamat` VARCHAR(255) NULL AFTER `nama_rs`');

UPDATE hospitals SET latitude = 0.49830000, longitude = 101.45480000
WHERE nama_rs = 'RS Syafira Pekanbaru';

UPDATE hospitals SET latitude = 0.49070000, longitude = 101.39950000
WHERE nama_rs = 'RS Prima Pekanbaru';

UPDATE hospitals
SET alamat = 'Jl. Jend. Sudirman No.134, Tangkerang Tengah, Kec. Marpoyan Damai, Kota Pekanbaru, Riau 28282'
WHERE nama_rs = 'RS Syafira Pekanbaru' AND (alamat IS NULL OR alamat = '');

UPDATE hospitals
SET alamat = 'Jl. Bima No.1, Delima, Kec. Binawidya, Kota Pekanbaru, Riau 28292'
WHERE nama_rs = 'RS Prima Pekanbaru' AND (alamat IS NULL OR alamat = '');

-- ---------------------------------------------------------------------------
-- 4. Relasi kasus -> master RS dan petugas yang ditugaskan
-- ---------------------------------------------------------------------------
CALL jr_add_column('cases', 'hospital_id', '`hospital_id` INT NULL AFTER `rumah_sakit`');
CALL jr_add_column('cases', 'assigned_officer_id', '`assigned_officer_id` INT NULL AFTER `hospital_id`');
CALL jr_add_index('cases', 'idx_cases_hospital_id', 'KEY `idx_cases_hospital_id` (`hospital_id`)');
CALL jr_add_index('cases', 'idx_cases_assigned_officer_id', 'KEY `idx_cases_assigned_officer_id` (`assigned_officer_id`)');
CALL jr_add_fk('cases', 'fk_cases_hospital', 'FOREIGN KEY (`hospital_id`) REFERENCES `hospitals`(id) ON DELETE SET NULL ON UPDATE CASCADE');
CALL jr_add_fk('cases', 'fk_cases_assigned_officer', 'FOREIGN KEY (`assigned_officer_id`) REFERENCES `officers`(id) ON DELETE SET NULL ON UPDATE CASCADE');

-- Backfill hospital_id dari nama RS yang sudah persis cocok
UPDATE cases c
JOIN hospitals h ON h.nama_rs = c.rumah_sakit
SET c.hospital_id = h.id
WHERE c.hospital_id IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Petugas pelaksana kunjungan
-- ---------------------------------------------------------------------------
CALL jr_add_column('visits', 'officer_id', '`officer_id` INT NULL AFTER `case_id`');
CALL jr_add_index('visits', 'idx_visits_officer_id', 'KEY `idx_visits_officer_id` (`officer_id`)');
CALL jr_add_fk('visits', 'fk_visits_officer', 'FOREIGN KEY (`officer_id`) REFERENCES `officers`(id) ON DELETE SET NULL ON UPDATE CASCADE');

-- ---------------------------------------------------------------------------
-- Bersihkan helper
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS jr_add_column;
DROP PROCEDURE IF EXISTS jr_add_index;
DROP PROCEDURE IF EXISTS jr_add_fk;
