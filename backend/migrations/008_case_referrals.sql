-- Migration 008: Menambahkan tabel case_referrals dan riwayat rujukan
-- Idempotent script untuk MySQL 8 / MariaDB

USE db_monitoring_jr;

CREATE TABLE IF NOT EXISTS case_referrals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  source_hospital_id INT NOT NULL,
  target_hospital_id INT NOT NULL,
  previous_officer_id INT NULL,
  new_officer_id INT NULL,
  referred_by_officer_id INT NOT NULL,
  alasan_rujukan TEXT NULL,
  catatan_rujukan TEXT NULL,
  status_rujukan ENUM('Aktif', 'Dibatalkan', 'Selesai') NOT NULL DEFAULT 'Aktif',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_referrals_case (case_id),
  KEY idx_referrals_target_hospital (target_hospital_id),
  KEY idx_referrals_new_officer (new_officer_id),
  CONSTRAINT fk_referrals_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_referrals_source_hospital FOREIGN KEY (source_hospital_id) REFERENCES hospitals(id) ON UPDATE CASCADE,
  CONSTRAINT fk_referrals_target_hospital FOREIGN KEY (target_hospital_id) REFERENCES hospitals(id) ON UPDATE CASCADE,
  CONSTRAINT fk_referrals_prev_officer FOREIGN KEY (previous_officer_id) REFERENCES officers(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_referrals_new_officer FOREIGN KEY (new_officer_id) REFERENCES officers(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_referrals_referred_by FOREIGN KEY (referred_by_officer_id) REFERENCES officers(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
