import { INITIAL_VICTIMS, INITIAL_OFFICERS, INITIAL_KABAG } from '../data/mockData.js';

const STORAGE_KEY_VICTIMS = 'jr_monitoring_victims_v3';
const STORAGE_KEY_OFFICERS = 'jr_monitoring_officers_v2';
const STORAGE_KEY_CURRENT_USER = 'jr_monitoring_current_user_v2';

// In-memory fallback in case localStorage quota is exceeded or unavailable
const memoryStore = new Map();

/**
 * Clean up legacy keys or free up space if localStorage quota is exceeded
 */
function attemptStorageCleanup(preserveKey) {
  if (typeof localStorage === 'undefined') return;
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k !== preserveKey &&
        (k.includes('_v1') ||
          k.startsWith('jr_temp_') ||
          k.includes('old_') ||
          k.includes('test_'))
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch (_) {}
    });
  } catch (err) {
    console.warn('[storageService] Cleanup warning:', err);
  }
}

/**
 * Safe localStorage getItem with in-memory fallback
 */
function safeGetItem(key) {
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch (err) {
    console.warn(`[storageService] Error reading localStorage key "${key}":`, err);
  }
  return memoryStore.get(key) || null;
}

/**
 * Safe localStorage setItem with quota error recovery and in-memory fallback
 */
function safeSetItem(key, value) {
  memoryStore.set(key, value);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return true;
    }
  } catch (err) {
    console.warn(`[storageService] localStorage.setItem failed for "${key}". Attempting cleanup...`, err);
    try {
      attemptStorageCleanup(key);
      localStorage.setItem(key, value);
      return true;
    } catch (retryErr) {
      console.warn(`[storageService] Storage quota exceeded. Using in-memory store for "${key}":`, retryErr);
      return false;
    }
  }
  return true;
}

/**
 * Safe localStorage removeItem
 */
function safeRemoveItem(key) {
  memoryStore.delete(key);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn(`[storageService] Error removing localStorage key "${key}":`, err);
  }
}

/**
 * Normalize and ensure victim data follows the 1-to-many continuous monitoring structure
 */
function normalizeVictim(rawVictim) {
  if (!rawVictim) return null;
  const v = { ...rawVictim };

  // Ensure tanggalMasukRs exists
  if (!v.tanggalMasukRs) {
    v.tanggalMasukRs = v.tanggalInformasiDiterima || v.tanggalKecelakaan || new Date().toISOString();
  }

  // Derive statusPemantauan if missing or invalid
  if (!v.statusPemantauan) {
    if (!v.kunjunganPertama && (!v.riwayatKunjungan || v.riwayatKunjungan.length === 0)) {
      v.statusPemantauan = 'Belum Dikunjungi';
    } else if (v.kondisiTerakhir === 'Sudah Pulang' || v.kondisiTerakhir === 'Pulang' || v.kondisiTerakhir === 'Meninggal Dunia') {
      v.statusPemantauan = v.statusKonfirmasiKondisi === 'Terkonfirmasi' ? 'Selesai Dipantau' : 'Menunggu Konfirmasi Kondisi';
    } else if (v.kondisiTerakhir === 'Belum Dapat Dikonfirmasi') {
      v.statusPemantauan = 'Menunggu Konfirmasi Kondisi';
    } else {
      v.statusPemantauan = 'Pemantauan Aktif';
    }
  }

  // Ensure riwayatAktivitas is populated
  if (!v.riwayatAktivitas || !Array.isArray(v.riwayatAktivitas) || v.riwayatAktivitas.length === 0) {
    const combined = [];

    // Add visits
    const visits = v.riwayatKunjungan?.length > 0 
      ? v.riwayatKunjungan 
      : (v.kunjunganPertama ? [v.kunjunganPertama] : []);

    visits.forEach((vis, idx) => {
      combined.push({
        id: vis.id || `VIS-${idx + 1}`,
        victimId: v.id,
        jenisAktivitas: idx === 0 ? 'Kunjungan Pertama' : 'Pemantauan Lanjutan',
        tanggal: vis.tanggalKunjungan || v.tanggalKunjunganTerakhir || v.tanggalInformasiDiterima,
        tanggalKunjungan: vis.tanggalKunjungan || v.tanggalKunjunganTerakhir || v.tanggalInformasiDiterima,
        kondisiKorban: vis.kondisiKorban || v.kondisiTerakhir || 'Masih Dirawat',
        hasilKomunikasi: vis.hasilKunjungan || 'Kunjungan fisik rumah sakit selesai.',
        hasilKunjungan: vis.hasilKunjungan || 'Kunjungan fisik rumah sakit selesai.',
        komunikasiKeluarga: vis.komunikasiKeluarga || '',
        penyampaianHak: vis.penyampaianHak || '',
        arahanLp: vis.arahanLp || '',
        catatanTindakLanjut: vis.tindakLanjut || vis.catatan || '',
        tindakLanjut: vis.tindakLanjut || vis.catatan || '',
        fotoUrl: vis.fotoUrl || null,
        latitude: vis.latitude || null,
        longitude: vis.longitude || null,
        akurasiLokasi: vis.akurasiLokasi || null,
        waktuFoto: vis.waktuFoto || vis.tanggalKunjungan || null,
        petugasId: v.petugasId,
        petugasNama: vis.petugasNama || v.namaPetugas
      });
    });

    // Add monitoring
    (v.riwayatPemantauan || []).forEach((mon, idx) => {
      combined.push({
        id: mon.id || `MON-${idx + 1}`,
        victimId: v.id,
        jenisAktivitas: 'Pemantauan Lanjutan',
        tanggal: mon.tanggal || v.tanggalPemantauanTerakhir || new Date().toISOString(),
        kondisiKorban: mon.kondisi || v.kondisiTerakhir || 'Masih Dirawat',
        statusKonfirmasi: mon.statusKonfirmasi || 'Terkonfirmasi',
        sumberInfo: mon.sumberInfo || 'Tim Medis RS',
        hasilKomunikasi: mon.hasilPemantauan || 'Pemantauan berkala pasien.',
        hasilPemantauan: mon.hasilPemantauan || 'Pemantauan berkala pasien.',
        informasiHak: mon.informasiHak || null,
        catatanTindakLanjut: mon.tindakLanjut || '',
        tindakLanjut: mon.tindakLanjut || '',
        fotoUrl: mon.fotoUrl || null,
        latitude: mon.latitude || null,
        longitude: mon.longitude || null,
        akurasiLokasi: mon.akurasiLokasi || null,
        petugasId: mon.petugasId || v.petugasId,
        petugasNama: mon.petugasNama || v.namaPetugas
      });
    });

    // Sort chronologically descending
    combined.sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
    v.riwayatAktivitas = combined;
  }

  return v;
}

/**
 * Storage Service - Centralized store for 1-to-many continuous victim monitoring
 */
export const storageService = {
  /**
   * Get all victims (each victim is 1 unique record with many activities)
   */
  getVictims() {
    try {
      const data = safeGetItem(STORAGE_KEY_VICTIMS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(normalizeVictim);
        }
      }

      // Check migration from v2 if available
      const oldV2 = safeGetItem('jr_monitoring_victims_v2');
      if (oldV2) {
        const parsedV2 = JSON.parse(oldV2);
        if (Array.isArray(parsedV2) && parsedV2.length > 0) {
          const normalized = parsedV2.map(normalizeVictim);
          this.saveVictims(normalized);
          return normalized;
        }
      }
    } catch (e) {
      console.error('[storageService] Error parsing victims from storage:', e);
    }

    // Fallback to initial mock data and persist safely
    const normalizedInitial = INITIAL_VICTIMS.map(normalizeVictim);
    safeSetItem(STORAGE_KEY_VICTIMS, JSON.stringify(normalizedInitial));
    return normalizedInitial;
  },

  /**
   * Save all victims
   */
  saveVictims(victims) {
    try {
      safeSetItem(STORAGE_KEY_VICTIMS, JSON.stringify(victims));
      // Dispatch custom event for cross-component sync
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('jr_victims_updated'));
    }
      }
      return true;
    } catch (e) {
      console.error('[storageService] Error saving victims:', e);
      return false;
    }
  },

  /**
   * Get victim by ID
   */
  getVictimById(id) {
    const victims = this.getVictims();
    const found = victims.find((v) => v.id === id);
    return found ? normalizeVictim(found) : null;
  },

  /**
   * Check for potential duplicates before creating new victim
   * Evaluates NIK, or combination of Name + Hospital / Accident Date
   */
  checkPotentialDuplicates({ nik, nama, rumahSakit, tanggalKecelakaan }) {
    const victims = this.getVictims();
    const cleanNik = (nik || '').trim();
    const cleanNama = (nama || '').toLowerCase().trim();

    return victims.filter((v) => {
      // 1. Exact NIK match
      if (cleanNik && cleanNik.length >= 6 && v.nik && v.nik.trim() === cleanNik) {
        return true;
      }
      // 2. Name similarity + same hospital or accident date within 2 days
      if (cleanNama && cleanNama.length >= 3 && v.nama) {
        const vNama = v.nama.toLowerCase().trim();
        const isNameMatch = vNama.includes(cleanNama) || cleanNama.includes(vNama);
        if (isNameMatch) {
          if (rumahSakit && v.rumahSakit && v.rumahSakit.toLowerCase() === rumahSakit.toLowerCase()) {
            return true;
          }
          if (tanggalKecelakaan && v.tanggalKecelakaan) {
            const t1 = new Date(tanggalKecelakaan).getTime();
            const t2 = new Date(v.tanggalKecelakaan).getTime();
            const diffDays = Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);
            if (diffDays <= 2) {
              return true;
            }
          }
        }
      }
      return false;
    });
  },

  /**
   * Add a new unique victim record
   */
  addVictim(victimData, initialVisitData = null) {
    const victims = this.getVictims();

    // Determine highest sequential ID number
    let maxIdNum = 0;
    victims.forEach((v) => {
      const match = v.id && v.id.match(/KOR-\d+-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxIdNum) maxIdNum = num;
      }
    });

    const newNum = maxIdNum + 1;
    const currentYear = new Date().getFullYear();
    const newVictimId = `KOR-${currentYear}-${String(newNum).padStart(3, '0')}`;
    const nowIso = new Date().toISOString();

    let statusPemantauan = 'Belum Dikunjungi';
    let kondisiTerakhir = victimData.kondisiTerakhir || 'Masih Dirawat';
    let statusKonfirmasiKondisi = victimData.statusKonfirmasiKondisi || 'Belum Dikonfirmasi';

    const newVictim = {
      id: newVictimId,
      nama: victimData.nama,
      nik: victimData.nik || '—',
      usia: victimData.usia ? Number(victimData.usia) : 30,
      jenisKelamin: victimData.jenisKelamin || 'Laki-laki',
      alamat: victimData.alamat || '—',
      telepon: victimData.telepon || '—',
      rumahSakit: victimData.rumahSakit,
      lokasiKejadian: victimData.lokasiKejadian || '—',
      tanggalKecelakaan: victimData.tanggalKecelakaan || nowIso,
      tanggalMasukRs: victimData.tanggalMasukRs || victimData.tanggalInformasiDiterima || nowIso,
      tanggalInformasiDiterima: victimData.tanggalInformasiDiterima || nowIso,
      sumberInformasi: victimData.sumberInformasi || 'IRSMS Korlantas Polri',
      petugasId: victimData.petugasId || 'PET-01',
      namaPetugas: victimData.namaPetugas || 'Adi Putra Pratama, S.Tr.Tra',
      kondisiTerakhir,
      statusKonfirmasiKondisi,
      statusPemantauan,
      waktuPemantauanTerakhir: null,
      jadwalPemantauanBerikutnya: null,
      kunjunganPertama: null,
      tanggalKunjunganTerakhir: null,
      tanggalPemantauanTerakhir: null,
      riwayatKunjungan: [],
      riwayatPemantauan: [],
      riwayatAktivitas: [],
      tindakLanjut: victimData.tindakLanjut || 'Kunjungan pertama ke rumah sakit',
      santunanSelesai: false,
      keteranganTambahan: victimData.keteranganTambahan || ''
    };

    // If initial visit is provided, record it directly as the 1st activity
    if (initialVisitData) {
      const actId = `ACT-${Date.now().toString().slice(-6)}`;
      const visitDate = initialVisitData.tanggalKunjungan || nowIso;
      const initialVisit = {
        id: actId,
        victimId: newVictimId,
        jenisAktivitas: 'Kunjungan Pertama',
        tanggal: visitDate,
        tanggalKunjungan: visitDate,
        kondisiKorban: initialVisitData.kondisiKorban || 'Masih Dirawat',
        hasilKomunikasi: initialVisitData.hasilKunjungan || initialVisitData.hasilKomunikasi || 'Kunjungan pertama selesai.',
        hasilKunjungan: initialVisitData.hasilKunjungan || initialVisitData.hasilKomunikasi || 'Kunjungan pertama selesai.',
        komunikasiKeluarga: initialVisitData.komunikasiKeluarga || '',
        penyampaianHak: initialVisitData.penyampaianHak || 'Hak santunan biaya perawatan RS disampaikan.',
        arahanLp: initialVisitData.arahanLp || '',
        catatanTindakLanjut: initialVisitData.tindakLanjut || initialVisitData.catatan || '',
        tindakLanjut: initialVisitData.tindakLanjut || initialVisitData.catatan || '',
        fotoUrl: initialVisitData.fotoUrl || null,
        latitude: initialVisitData.latitude || null,
        longitude: initialVisitData.longitude || null,
        akurasiLokasi: initialVisitData.akurasiLokasi || null,
        waktuFoto: initialVisitData.waktuFoto || visitDate,
        petugasId: newVictim.petugasId,
        petugasNama: initialVisitData.petugasNama || newVictim.namaPetugas
      };

      newVictim.kunjunganPertama = initialVisit;
      newVictim.tanggalKunjunganTerakhir = visitDate;
      newVictim.waktuPemantauanTerakhir = visitDate;
      newVictim.kondisiTerakhir = initialVisit.kondisiKorban;
      newVictim.statusKonfirmasiKondisi = 'Terkonfirmasi';

      if (newVictim.kondisiTerakhir === 'Masih Dirawat' || newVictim.kondisiTerakhir === 'Dirujuk') {
        newVictim.statusPemantauan = 'Pemantauan Aktif';
        newVictim.jadwalPemantauanBerikutnya = new Date(new Date(visitDate).getTime() + 72 * 60 * 60 * 1000).toISOString();
      } else if (newVictim.kondisiTerakhir === 'Sudah Pulang' || newVictim.kondisiTerakhir === 'Meninggal Dunia') {
        newVictim.statusPemantauan = 'Selesai Dipantau';
      } else {
        newVictim.statusPemantauan = 'Menunggu Konfirmasi Kondisi';
      }

      newVictim.riwayatKunjungan = [initialVisit];
      newVictim.riwayatAktivitas = [initialVisit];
    }

    const updatedVictims = [newVictim, ...victims];
    this.saveVictims(updatedVictims);
    return newVictim;
  },

  /**
   * Add a visit activity to an existing victim (attaches to victimId, never creates new victim)
   */
  addVisit(victimId, visitData) {
    const victims = this.getVictims();
    const index = victims.findIndex((v) => v.id === victimId);
    if (index === -1) return null;

    const victim = { ...victims[index] };
    const actId = `ACT-${Date.now().toString().slice(-6)}`;
    const visitDate = visitData.tanggalKunjungan || new Date().toISOString();
    const isFirstVisit = !victim.kunjunganPertama;

    const newVisitActivity = {
      id: actId,
      victimId,
      jenisAktivitas: isFirstVisit ? 'Kunjungan Pertama' : 'Pemantauan Lanjutan',
      tanggal: visitDate,
      tanggalKunjungan: visitDate,
      kondisiKorban: visitData.kondisiKorban || 'Masih Dirawat',
      hasilKomunikasi: visitData.hasilKunjungan || 'Kunjungan lapangan selesai.',
      hasilKunjungan: visitData.hasilKunjungan || 'Kunjungan lapangan selesai.',
      komunikasiKeluarga: visitData.komunikasiKeluarga || '',
      penyampaianHak: visitData.penyampaianHak || '',
      arahanLp: visitData.arahanLp || '',
      catatanTindakLanjut: visitData.tindakLanjut || '',
      tindakLanjut: visitData.tindakLanjut || '',
      fotoUrl: visitData.fotoUrl || null,
      latitude: visitData.latitude || null,
      longitude: visitData.longitude || null,
      akurasiLokasi: visitData.akurasiLokasi || null,
      waktuFoto: visitData.waktuFoto || visitDate,
      petugasId: visitData.petugasId || victim.petugasId,
      petugasNama: visitData.petugasNama || victim.namaPetugas
    };

    if (isFirstVisit) {
      victim.kunjunganPertama = newVisitActivity;
    }

    victim.riwayatKunjungan = [newVisitActivity, ...(victim.riwayatKunjungan || [])];
    victim.riwayatAktivitas = [newVisitActivity, ...(victim.riwayatAktivitas || [])];
    victim.tanggalKunjunganTerakhir = visitDate;
    victim.waktuPemantauanTerakhir = visitDate;

    if (visitData.kondisiKorban) {
      victim.kondisiTerakhir = visitData.kondisiKorban;
      victim.statusKonfirmasiKondisi = 'Terkonfirmasi';
    }

    if (visitData.tindakLanjut) {
      victim.tindakLanjut = visitData.tindakLanjut;
    }

    // Determine status pemantauan
    if (victim.kondisiTerakhir === 'Masih Dirawat' || victim.kondisiTerakhir === 'Dirujuk') {
      victim.statusPemantauan = 'Pemantauan Aktif';
      victim.jadwalPemantauanBerikutnya = new Date(new Date(visitDate).getTime() + 72 * 60 * 60 * 1000).toISOString();
    } else if (victim.kondisiTerakhir === 'Sudah Pulang' || victim.kondisiTerakhir === 'Meninggal Dunia') {
      victim.statusPemantauan = 'Selesai Dipantau';
      victim.jadwalPemantauanBerikutnya = null;
    } else {
      victim.statusPemantauan = 'Menunggu Konfirmasi Kondisi';
    }

    victims[index] = victim;
    this.saveVictims(victims);
    return victim;
  },

  /**
   * Add a continuous monitoring activity to an existing victim (attaches to same victimId)
   */
  addMonitoring(victimId, monitoringData) {
    const victims = this.getVictims();
    const index = victims.findIndex((v) => v.id === victimId);
    if (index === -1) return null;

    const victim = { ...victims[index] };
    const actId = `ACT-${Date.now().toString().slice(-6)}`;
    const monDate = monitoringData.tanggal || new Date().toISOString();
    const rawKondisi = monitoringData.kondisi || monitoringData.kondisiKorban || victim.kondisiTerakhir;
    const kondisi = rawKondisi === 'Pulang' ? 'Sudah Pulang' : rawKondisi;
    const statusKonfirmasi = monitoringData.statusKonfirmasi || 'Terkonfirmasi';
    const isConfirmed =
      statusKonfirmasi === 'Terkonfirmasi' ||
      statusKonfirmasi === 'Terkonfirmasi Medis' ||
      statusKonfirmasi === 'Terkonfirmasi Keluarga' ||
      statusKonfirmasi === 'TERKONFIRMASI' ||
      statusKonfirmasi === true;

    const newMonActivity = {
      id: actId,
      victimId,
      jenisAktivitas: 'Pemantauan Lanjutan',
      tanggal: monDate,
      kondisiKorban: kondisi,
      statusKonfirmasi,
      sumberInfo: monitoringData.sumberInfo || monitoringData.sumberInformasi || 'Tim Medis RS / Petugas Lapangan',
      hasilKomunikasi: monitoringData.hasilPemantauan || monitoringData.catatan || 'Pemantauan lanjutan berkala.',
      hasilPemantauan: monitoringData.hasilPemantauan || monitoringData.catatan || 'Pemantauan lanjutan berkala.',
      informasiHak: monitoringData.informasiHak || null,
      catatanTindakLanjut: monitoringData.tindakLanjut || '',
      tindakLanjut: monitoringData.tindakLanjut || '',
      fotoUrl: monitoringData.fotoUrl || null,
      latitude: monitoringData.latitude || null,
      longitude: monitoringData.longitude || null,
      akurasiLokasi: monitoringData.akurasiLokasi || null,
      petugasId: monitoringData.petugasId || victim.petugasId,
      petugasNama: monitoringData.petugasNama || victim.namaPetugas,
      tanggalKejadian: monitoringData.tanggalKejadian || monitoringData.tanggalKejadianKondisi || null,
      keteranganKonfirmasi: monitoringData.keteranganKonfirmasi || null,
      rumahSakitRujukan: monitoringData.rumahSakitRujukan || null
    };

    // If victim was referred to another hospital, update hospital and keep active monitoring
    if (kondisi === 'Dirujuk' && monitoringData.rumahSakitRujukan) {
      victim.rumahSakit = monitoringData.rumahSakitRujukan;
    }

    victim.riwayatPemantauan = [newMonActivity, ...(victim.riwayatPemantauan || [])];
    victim.riwayatAktivitas = [newMonActivity, ...(victim.riwayatAktivitas || [])];
    victim.tanggalPemantauanTerakhir = monDate;
    victim.waktuPemantauanTerakhir = monDate;
    victim.kondisiTerakhir = kondisi;
    victim.statusKonfirmasiKondisi = statusKonfirmasi;

    if (monitoringData.tindakLanjut) {
      victim.tindakLanjut = monitoringData.tindakLanjut;
    }

    // Determine statusPemantauan & next schedule
    if (kondisi === 'Masih Dirawat' || kondisi === 'Dirujuk') {
      victim.statusPemantauan = 'Pemantauan Aktif';
      victim.jadwalPemantauanBerikutnya = new Date(new Date(monDate).getTime() + 72 * 60 * 60 * 1000).toISOString();
    } else if (kondisi === 'Sudah Pulang' || kondisi === 'Meninggal Dunia') {
      if (isConfirmed) {
        victim.statusPemantauan = 'Selesai Dipantau';
        victim.jadwalPemantauanBerikutnya = null; // stop routine schedule
        if (kondisi === 'Sudah Pulang') {
          victim.santunanSelesai = true;
        }
      } else {
        victim.statusPemantauan = 'Menunggu Konfirmasi Kondisi';
        victim.jadwalPemantauanBerikutnya = new Date(new Date(monDate).getTime() + 24 * 60 * 60 * 1000).toISOString();
      }
    } else {
      victim.statusPemantauan = 'Menunggu Konfirmasi Kondisi';
      victim.jadwalPemantauanBerikutnya = new Date(new Date(monDate).getTime() + 24 * 60 * 60 * 1000).toISOString();
    }

    victims[index] = victim;
    this.saveVictims(victims);
    return victim;
  },

  /**
   * Correct an activity record with audit trail (preserves history, never deletes)
   */
  updateActivity(victimId, activityId, { hasilKomunikasi, catatanTindakLanjut, alasanKoreksi, editedBy }) {
    const victims = this.getVictims();
    const index = victims.findIndex((v) => v.id === victimId);
    if (index === -1) return null;

    const victim = { ...victims[index] };
    const nowIso = new Date().toISOString();

    const auditEntry = {
      isEdited: true,
      editedAt: nowIso,
      editedBy: editedBy || 'Petugas Jasa Raharja',
      alasanKoreksi: alasanKoreksi || 'Perbaikan catatan hasil pemantauan'
    };

    victim.riwayatAktivitas = (victim.riwayatAktivitas || []).map((act) => {
      if (act.id === activityId) {
        return {
          ...act,
          hasilKomunikasi: hasilKomunikasi !== undefined ? hasilKomunikasi : act.hasilKomunikasi,
          hasilKunjungan: hasilKomunikasi !== undefined ? hasilKomunikasi : act.hasilKunjungan,
          hasilPemantauan: hasilKomunikasi !== undefined ? hasilKomunikasi : act.hasilPemantauan,
          catatanTindakLanjut: catatanTindakLanjut !== undefined ? catatanTindakLanjut : act.catatanTindakLanjut,
          tindakLanjut: catatanTindakLanjut !== undefined ? catatanTindakLanjut : act.tindakLanjut,
          ...auditEntry
        };
      }
      return act;
    });

    if (victim.riwayatKunjungan) {
      victim.riwayatKunjungan = victim.riwayatKunjungan.map((vis) => {
        if (vis.id === activityId) {
          return {
            ...vis,
            hasilKunjungan: hasilKomunikasi !== undefined ? hasilKomunikasi : vis.hasilKunjungan,
            tindakLanjut: catatanTindakLanjut !== undefined ? catatanTindakLanjut : vis.tindakLanjut,
            ...auditEntry
          };
        }
        return vis;
      });
    }

    if (victim.riwayatPemantauan) {
      victim.riwayatPemantauan = victim.riwayatPemantauan.map((mon) => {
        if (mon.id === activityId) {
          return {
            ...mon,
            hasilPemantauan: hasilKomunikasi !== undefined ? hasilKomunikasi : mon.hasilPemantauan,
            tindakLanjut: catatanTindakLanjut !== undefined ? catatanTindakLanjut : mon.tindakLanjut,
            ...auditEntry
          };
        }
        return mon;
      });
    }

    victims[index] = victim;
    this.saveVictims(victims);
    return victim;
  },

  /**
   * Reset data to initial mock dataset
   */
  resetData() {
    const normalized = INITIAL_VICTIMS.map(normalizeVictim);
    safeSetItem(STORAGE_KEY_VICTIMS, JSON.stringify(normalized));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('jr_victims_updated'));
    }
    return normalized;
  },

  /**
   * Clear all app storage
   */
  clearAll() {
    safeRemoveItem(STORAGE_KEY_VICTIMS);
    safeRemoveItem(STORAGE_KEY_OFFICERS);
    safeRemoveItem(STORAGE_KEY_CURRENT_USER);
    memoryStore.clear();
  },

  /**
   * Get all officers
   */
  getOfficers() {
    try {
      const data = safeGetItem(STORAGE_KEY_OFFICERS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('[storageService] Error parsing officers:', e);
    }
    safeSetItem(STORAGE_KEY_OFFICERS, JSON.stringify(INITIAL_OFFICERS));
    return INITIAL_OFFICERS;
  },

  /**
   * Get/Set current user role simulation
   */
  getCurrentUser() {
    try {
      const data = safeGetItem(STORAGE_KEY_CURRENT_USER);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed && parsed.role) return parsed;
      }
    } catch (e) {
      console.error('[storageService] Error parsing current user:', e);
    }

    const defaultUser = {
      role: 'petugas',
      profile: INITIAL_OFFICERS[0]
    };
    safeSetItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(defaultUser));
    return defaultUser;
  },

  setCurrentUser(user) {
    safeSetItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(user));
  },

  /**
   * Calculate aggregated metrics distinguishing unique victims from activities
   */
  getAggregatedMetrics(officerId = null) {
    const allVictims = this.getVictims();
    const victims = officerId ? allVictims.filter((v) => v.petugasId === officerId) : allVictims;

    const totalKorbanUnik = victims.length;
    let totalKunjunganPertama = 0;
    let totalPemantauanLanjutan = 0;
    let pemantauanAktif = 0;
    let selesaiDipantau = 0;
    let menungguKonfirmasi = 0;
    let belumDikunjungi = 0;
    let perluTindakLanjut = 0;

    victims.forEach((v) => {
      if (v.kunjunganPertama) {
        totalKunjunganPertama++;
      }

      const monCount = (v.riwayatPemantauan?.length || 0);
      totalPemantauanLanjutan += monCount;

      if (v.statusPemantauan === 'Belum Dikunjungi') {
        belumDikunjungi++;
        perluTindakLanjut++;
      } else if (v.statusPemantauan === 'Pemantauan Aktif') {
        pemantauanAktif++;
        perluTindakLanjut++;
      } else if (v.statusPemantauan === 'Menunggu Konfirmasi Kondisi') {
        menungguKonfirmasi++;
        perluTindakLanjut++;
      } else if (v.statusPemantauan === 'Selesai Dipantau') {
        selesaiDipantau++;
      }
    });

    const totalSeluruhAktivitas = totalKunjunganPertama + totalPemantauanLanjutan;

    return {
      totalKorbanUnik,
      totalKunjunganPertama,
      totalPemantauanLanjutan,
      totalSeluruhAktivitas,
      pemantauanAktif,
      selesaiDipantau,
      menungguKonfirmasi,
      belumDikunjungi,
      perluTindakLanjut
    };
  }
};
