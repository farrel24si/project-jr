-- Migration 004: plotting petugas JR ke rumah sakit (MVP)
-- Satu akun petugas dapat menangani beberapa RS.
-- Target: MySQL 8 / MariaDB. Aman dijalankan berulang.
-- Jalankan: mysql -u root -p db_monitoring_jr < migrations/004_officer_hospitals.sql

USE db_monitoring_jr;

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
