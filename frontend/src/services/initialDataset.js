// Baseline operational dataset for Jasa Raharja Cabang Riau
export const INITIAL_OFFICERS = [
  {
    "id": "PET-01",
    "backendId": 1,
    "backendOfficerId": 1,
    "username": "petugas",
    "nama": "Petugas",
    "nip": "19930512 201902 1 004",
    "jabatan": "Mobile Service Officer",
    "wilayah": "Pekanbaru Kota",
    "telepon": "0812-3456-7890",
    "email": "petugas@jasaraharja.co.id",
    "avatar": "PT",
    "status": "Aktif Lapangan",
    "kapasitas": "5/10 Kasus",
    "plottingRs": [
      "RS Prima Pekanbaru",
      "RS Syafira Pekanbaru",
      "RSUD Arifin Achmad"
    ],
    "bebanKasusPct": 50
  },
  {
    "id": "PET-02",
    "backendId": 2,
    "backendOfficerId": 2,
    "username": "petugas2",
    "nama": "Petugas 2",
    "nip": "19950820 202012 1 007",
    "jabatan": "Mobile Service Officer",
    "wilayah": "Pekanbaru",
    "telepon": "0813-9876-5432",
    "email": "petugas2@jasaraharja.co.id",
    "avatar": "P2",
    "status": "Aktif Lapangan",
    "kapasitas": "3/10 Kasus",
    "plottingRs": [
      "RS Awal Bros Panam",
      "RSUD Kota Dumai"
    ],
    "bebanKasusPct": 30
  },
  {
    "id": "PET-04",
    "backendId": 4,
    "backendOfficerId": 4,
    "username": "petugas3",
    "nama": "Petugas 3",
    "nip": "1998920-192",
    "jabatan": "Mobile Service Officer",
    "wilayah": "Pekanbaru Kota",
    "telepon": "08123456789",
    "email": "petugas3@jasaraharja.co.id",
    "avatar": "P3",
    "status": "Aktif Lapangan",
    "kapasitas": "2/10 Kasus",
    "plottingRs": [
      "RS Bhayangkara Pekanbaru",
      "RS Tabrani Rab",
      "RSUD Petala Bumi"
    ],
    "bebanKasusPct": 20
  }
];

export const INITIAL_KABAG = {
  "id": "KABAG-01",
  "nama": "Kabag",
  "nip": "197803152003121001",
  "jabatan": "Kepala Bagian Operasional & Pelayanan",
  "cabang": "Cabang Utama Riau",
  "telepon": "0811-9988-7766",
  "email": "kabag@jasaraharja.co.id",
  "avatar": "KB"
};

export const INITIAL_HOSPITALS = [
  "RS Prima Pekanbaru",
  "RS Syafira Pekanbaru",
  "RSUD Arifin Achmad",
  "RS Awal Bros Sudirman",
  "RS Awal Bros Panam",
  "RS Santa Maria Pekanbaru",
  "RS Sansani Pekanbaru",
  "RS Tabrani Rab",
  "RS Bhayangkara Pekanbaru",
  "RSUD Petala Bumi",
  "RSUD Kota Dumai",
  "RSUD Mandau Duri",
  "RSUD Puri Husada Tembilahan"
];

// Data korban murni diperoleh dari sinkronisasi database backend MySQL (tanpa data mock/dummy)
export const INITIAL_VICTIMS = [];