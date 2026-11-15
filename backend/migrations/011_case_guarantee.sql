-- Migration 011: Fase 1 Keterjaminan & GL pada tabel cases.
-- Tambah kolom:
--   status_keterjaminan VARCHAR(50) NOT NULL DEFAULT 'Belum Dikonfirmasi'
--   no_gl               VARCHAR(50) NULL
--   tgl_gl              VARCHAR(50) NULL  (kanonis DD/MM/YYYY, konsisten kolom tanggal lain)
-- Mapping otomatis dari jenis_laka dilakukan di service (caseCreation), bukan di DB.
-- Target: MySQL 8 / MariaDB. Idempotent, aman dijalankan berulang.
-- Jalankan: mysql -u root -p db_monitoring_jr < migrations/011_case_guarantee.sql

USE db_monitoring_jr;

-- status_keterjaminan
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cases'
    AND COLUMN_NAME = 'status_keterjaminan'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE cases ADD COLUMN status_keterjaminan VARCHAR(50) NOT NULL DEFAULT ''Belum Dikonfirmasi'' AFTER jenis_laka;',
  'SELECT 1;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- no_gl
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cases'
    AND COLUMN_NAME = 'no_gl'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE cases ADD COLUMN no_gl VARCHAR(50) NULL AFTER status_keterjaminan;',
  'SELECT 1;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- tgl_gl
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cases'
    AND COLUMN_NAME = 'tgl_gl'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE cases ADD COLUMN tgl_gl VARCHAR(50) NULL AFTER no_gl;',
  'SELECT 1;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
