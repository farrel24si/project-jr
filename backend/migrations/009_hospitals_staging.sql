-- Migration 009: Rumah sakit staging belum punya koordinat terverifikasi.
-- Ubah hospitals.latitude dan hospitals.longitude menjadi NULLABLE,
-- sambil menjaga pola idempotent migrations 001-008.
-- Target: MySQL 8 / MariaDB. Aman dijalankan berulang.
-- Jalankan: mysql -u root -p db_monitoring_jr < migrations/009_hospitals_staging.sql

USE db_monitoring_jr;

-- Helper: ubah kolom hanya jika masih NOT NULL.
DROP PROCEDURE IF EXISTS jr_modify_column_nullable;

DELIMITER $$

CREATE PROCEDURE jr_modify_column_nullable(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_type VARCHAR(255))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
      AND IS_NULLABLE = 'NO'
  ) THEN
    SET @ddl := CONCAT(
      'ALTER TABLE `', p_table, '` MODIFY COLUMN `', p_column, '` ', p_type, ' NULL'
    );
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

CALL jr_modify_column_nullable('hospitals', 'latitude', 'DECIMAL(10,8)');
CALL jr_modify_column_nullable('hospitals', 'longitude', 'DECIMAL(11,8)');

DROP PROCEDURE IF EXISTS jr_modify_column_nullable;
