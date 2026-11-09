-- Migration 007: kolom reserved_at untuk timeout lease PENDING (mencegah deadlock)
-- Aman jika kolom sudah ada.

USE db_monitoring_jr;

SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notification_logs'
    AND COLUMN_NAME = 'reserved_at'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE notification_logs ADD COLUMN reserved_at DATETIME NULL AFTER delivery_status;',
  'SELECT 1;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
