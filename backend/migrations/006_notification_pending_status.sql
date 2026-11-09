-- Migration 006: reservation state untuk mencegah notifikasi WhatsApp ganda.
-- Database baru sudah mendapatkan ENUM PENDING dari migration 005 terbaru.
-- Database yang sudah menjalankan 005 versi awal perlu menjalankan migration ini.

USE db_monitoring_jr;

ALTER TABLE notification_logs
  MODIFY COLUMN delivery_status ENUM('PENDING', 'SENT', 'FAILED') NOT NULL;
