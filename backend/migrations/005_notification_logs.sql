-- Migration 005: jejak dan deduplikasi notifikasi WhatsApp petugas
-- Target: MySQL 8 / MariaDB. Aman dijalankan berulang.
-- Jalankan: mysql -u root -p db_monitoring_jr < migrations/005_notification_logs.sql

USE db_monitoring_jr;

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
