-- Migration 010: Tabel alias RS dan binding grup WhatsApp untuk routing.
-- - hospital_aliases: alias ter-normalisasi global unik (aktif) agar ambiguitas
--   tidak bisa masuk di DB.
-- - hospital_whatsapp_groups: binding JID grup global unik; JID tidak di-seed
--   karena JID aktual belum diketahui bot.
-- - Seed alias `RS Prima` untuk RS Prima Pekanbaru hanya bila hospital ada.
--   Seed TIDAK mengaktifkan alias (is_active = 0); aktivasi dilakukan Kabag.
-- Target: MySQL 8 / MariaDB. Idempotent, aman dijalankan berulang.
-- Jalankan: mysql -u root -p db_monitoring_jr < migrations/010_hospital_aliases_groups.sql

USE db_monitoring_jr;

CREATE TABLE IF NOT EXISTS hospital_aliases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hospital_id INT NOT NULL,
  alias_normalized VARCHAR(150) NOT NULL,
  alias_display VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hospital_aliases_normalized (alias_normalized),
  KEY idx_hospital_aliases_hospital_active (hospital_id, is_active),
  CONSTRAINT fk_hospital_aliases_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hospital_whatsapp_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hospital_id INT NOT NULL,
  group_jid VARCHAR(100) NOT NULL,
  group_subject_last_seen VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hospital_whatsapp_groups_jid (group_jid),
  KEY idx_hospital_whatsapp_groups_hospital_active (hospital_id, is_active),
  CONSTRAINT fk_hospital_whatsapp_groups_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed alias idempotent untuk RS aktif Pekanbaru.
-- Idempotent: dijalankan berulang tidak membuat duplikat (uq_hospital_aliases_normalized).
INSERT IGNORE INTO hospital_aliases (hospital_id, alias_normalized, alias_display, is_active)
SELECT h.id, a.alias_normalized, a.alias_display, 1
FROM (
  SELECT 'rs prima' AS alias_normalized, 'RS Prima' AS alias_display, 'RS Prima Pekanbaru' AS nama_rs UNION ALL
  SELECT 'rs syafira', 'RS Syafira', 'RS Syafira Pekanbaru' UNION ALL
  SELECT 'rs eka hospital', 'RS Eka Hospital', 'RS EKA HOSPITAL - PEKANBARU' UNION ALL
  SELECT 'rs ab sudirman', 'RS AB Sudirman', 'RS AWAL BROS - PEKANBARU' UNION ALL
  SELECT 'rs ab panam', 'RS AB Panam', 'RS AWAL BROS PANAM - PEKANBARU' UNION ALL
  SELECT 'rs ab a yani', 'RS AB A Yani', 'RS AWAL BROS AHMAD YANI PEKANBARU' UNION ALL
  SELECT 'rs ab ahmad yani', 'RS AB Ahmad Yani', 'RS AWAL BROS AHMAD YANI PEKANBARU' UNION ALL
  SELECT 'rs ab hangtuah', 'RS AB Hangtuah', 'RS AWAL BROS HANGTUAH' UNION ALL
  SELECT 'rs bhayangkara', 'RS Bhayangkara', 'RS BHAYANGKARA POLDA - RIAU' UNION ALL
  SELECT 'rs pmc', 'RS PMC', 'RS PEKANBARU MEDICAL CENTRE' UNION ALL
  SELECT 'rs tabrani', 'RS Tabrani', 'RS PROF. Dr. TABRANI - PEKANBARU' UNION ALL
  SELECT 'rs hermina', 'RS Hermina', 'RS UMUM HERMINA PEKANBARU' UNION ALL
  SELECT 'rs aulia', 'RS Aulia', 'RS AULIA HOSPITAL - PEKANBARU' UNION ALL
  SELECT 'rs aulia hospital', 'RS Aulia Hospital', 'RS AULIA HOSPITAL - PEKANBARU' UNION ALL
  SELECT 'aulia soebrantas', 'Aulia Soebrantas', 'RS AULIA HOSPITAL - PEKANBARU' UNION ALL
  SELECT 'rs aulia soebrantas', 'RS Aulia Soebrantas', 'RS AULIA HOSPITAL - PEKANBARU' UNION ALL
  SELECT 'rs murni teguh', 'RS Murni Teguh', 'RS MURNI TEGUH ERIA' UNION ALL
  SELECT 'rsud arifin achmad', 'RSUD Arifin Achmad', 'RSUD ARIFIN ACHMAD - PEKANBARU' UNION ALL
  SELECT 'rs arifin achmad', 'RS Arifin Achmad', 'RSUD ARIFIN ACHMAD - PEKANBARU'
) a
JOIN hospitals h ON h.nama_rs = a.nama_rs;
