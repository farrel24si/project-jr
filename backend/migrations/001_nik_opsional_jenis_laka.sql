-- Migration 001: NIK opsional + kolom jenis_laka + nama RS Pekanbaru
-- Target: MySQL 8 / MariaDB. Aman dijalankan berulang.
-- Jalankan: mysql -u root -p < migrations/001_nik_opsional_jenis_laka.sql

USE db_monitoring_jr;

-- 1. NIK boleh kosong (idempotent: MODIFY selalu aman diulang)
ALTER TABLE cases
  MODIFY nik VARCHAR(16) NULL;

-- 2. Tambah kolom jenis_laka hanya jika belum ada
SET @has_jenis_laka := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cases'
    AND COLUMN_NAME = 'jenis_laka'
);

SET @sql := IF(
  @has_jenis_laka = 0,
  'ALTER TABLE cases ADD COLUMN jenis_laka ENUM(''Tunggal'',''Tidak Tunggal'',''Belum Diketahui'') NOT NULL DEFAULT ''Belum Diketahui'' AFTER kronologi',
  'SELECT ''kolom jenis_laka sudah ada'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Samakan nama RS dengan data acuan (hanya jika nama lama masih ada dan nama baru belum ada)
UPDATE hospitals
SET nama_rs = 'RS Syafira Pekanbaru'
WHERE nama_rs = 'RS Syafira'
  AND NOT EXISTS (SELECT 1 FROM (SELECT nama_rs FROM hospitals) h WHERE h.nama_rs = 'RS Syafira Pekanbaru');

UPDATE hospitals
SET nama_rs = 'RS Prima Pekanbaru'
WHERE nama_rs = 'RS Prima'
  AND NOT EXISTS (SELECT 1 FROM (SELECT nama_rs FROM hospitals) h WHERE h.nama_rs = 'RS Prima Pekanbaru');
