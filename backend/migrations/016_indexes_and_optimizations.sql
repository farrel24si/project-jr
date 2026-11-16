-- Migration 016: Index optimasi pada tabel visits untuk scheduler SLA & akses bukti foto.
-- Target: MySQL 8 / MariaDB. Idempotent, aman dijalankan berulang.
-- Jalankan: mysql -u root -p db_monitoring_jr < migrations/016_indexes_and_optimizations.sql

USE db_monitoring_jr;

-- 1. Index (status_kunjungan, jadwal_kunjungan) untuk mempercepat scanAndSendReminders
SET @idx1_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'visits'
    AND INDEX_NAME = 'idx_visits_status_schedule'
);

SET @sql1 = IF(@idx1_exists = 0,
  'ALTER TABLE visits ADD KEY idx_visits_status_schedule (status_kunjungan, jadwal_kunjungan);',
  'SELECT 1;'
);

PREPARE stmt1 FROM @sql1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- 2. Index foto_bukti_url untuk mempercepat GET /uploads/:filename
SET @idx2_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'visits'
    AND INDEX_NAME = 'idx_visits_foto_bukti_url'
);

SET @sql2 = IF(@idx2_exists = 0,
  'ALTER TABLE visits ADD KEY idx_visits_foto_bukti_url (foto_bukti_url);',
  'SELECT 1;'
);

PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
