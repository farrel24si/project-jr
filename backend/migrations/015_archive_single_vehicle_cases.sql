-- Migration 015: arsip kasus laka tunggal (tanpa kunjungan, SLA, atau penugasan JR).
-- Tunggal tetap disimpan sebagai rekam laporan, namun tidak ditindaklanjuti.
-- Target: MySQL 8 / MariaDB. Aman dijalankan berulang.
-- Jalankan: mysql -u root -p db_monitoring_jr < migrations/015_archive_single_vehicle_cases.sql

USE db_monitoring_jr;

-- Tambahkan status arsip untuk membedakan laporan yang tidak perlu ditindaklanjuti.
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cases'
    AND COLUMN_NAME = 'status_pemantauan'
);
SET @has_archived_status = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cases'
    AND COLUMN_NAME = 'status_pemantauan'
    AND COLUMN_TYPE LIKE '%Diarsipkan%'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE cases ADD COLUMN status_pemantauan ENUM(''Belum Dikunjungi'',''Pemantauan Aktif'',''Menunggu Konfirmasi Kondisi'',''Selesai Dipantau'',''Diarsipkan'') NOT NULL DEFAULT ''Belum Dikunjungi'' AFTER status_kondisi;',
  IF(@has_archived_status = 0,
    'ALTER TABLE cases MODIFY COLUMN status_pemantauan ENUM(''Belum Dikunjungi'',''Pemantauan Aktif'',''Menunggu Konfirmasi Kondisi'',''Selesai Dipantau'',''Diarsipkan'') NOT NULL DEFAULT ''Belum Dikunjungi'';',
    'SELECT 1;'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Bersihkan hanya tugas yang belum dikerjakan. Riwayat kunjungan yang sudah selesai tetap utuh.
DELETE nl
FROM notification_logs nl
JOIN visits v ON v.id = nl.visit_id
JOIN cases c ON c.id = v.case_id
WHERE c.jenis_laka = 'Tunggal'
  AND v.status_kunjungan = 'Menunggu';

DELETE v
FROM visits v
JOIN cases c ON c.id = v.case_id
WHERE c.jenis_laka = 'Tunggal'
  AND v.status_kunjungan = 'Menunggu';

-- Laka tunggal menjadi arsip tanpa assignee agar tidak memunculkan tugas petugas.
UPDATE cases
SET status_pemantauan = 'Diarsipkan',
    assigned_officer_id = NULL
WHERE jenis_laka = 'Tunggal';
