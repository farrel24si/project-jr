CREATE DATABASE IF NOT EXISTS db_monitoring_jr;
USE db_monitoring_jr;

CREATE TABLE IF NOT EXISTS hospitals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama_rs VARCHAR(100) NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  radius_meter INT DEFAULT 200,
  UNIQUE KEY uq_hospitals_nama_rs (nama_rs)
);

INSERT IGNORE INTO hospitals (nama_rs, latitude, longitude) VALUES
('RS Syafira', 0.49968000, 101.45475000),
('RS Prima', 0.48231000, 101.41892000);

CREATE TABLE IF NOT EXISTS cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nomor_tiket VARCHAR(30) UNIQUE NOT NULL,
  rumah_sakit VARCHAR(100) NOT NULL,
  nama_korban VARCHAR(150) NOT NULL,
  nik VARCHAR(16) NOT NULL,
  umur INT,
  alamat TEXT,
  tgl_laka VARCHAR(50),
  tgl_masuk VARCHAR(50),
  kronologi TEXT,
  status_kondisi ENUM('Rawat Inap','Luka Ringan','Luka Berat','Meninggal Dunia','Selesai') DEFAULT 'Rawat Inap',
  no_pelapor_wa VARCHAR(30),
  waktu_lapor_wa DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS visits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id INT NOT NULL,
  kunjungan_ke INT NOT NULL,
  jadwal_kunjungan DATETIME NOT NULL,
  waktu_aktual_kunjungan DATETIME NULL,
  cek_komunikasi_keluarga BOOLEAN DEFAULT FALSE,
  cek_edukasi_santunan BOOLEAN DEFAULT FALSE,
  cek_arahan_lp BOOLEAN DEFAULT FALSE,
  catatan_kondisi TEXT NULL,
  foto_bukti_url VARCHAR(255) NULL,
  lat_petugas DECIMAL(10,8) NULL,
  lng_petugas DECIMAL(11,8) NULL,
  jarak_dari_rs_meter INT NULL,
  status_kunjungan ENUM('Menunggu','Selesai Tepat Waktu','Selesai Terlambat') DEFAULT 'Menunggu',
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);
