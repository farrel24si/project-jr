import { api } from './api.js';
import {
  mapBackendCaseToVictim,
  normalizeStatusToBackend,
  dataUrlToFile,
  parseDateToTimestamp,
  resolvePhotoUrl
} from './backendMapper.js';
import { cachePhoto, getCachedPhoto } from './photoService.js';
import { getMonitoringStatus, isVictimFinished as isVictimFinishedUtil, MONITORING_STATUS } from '../utils/monitoringStatus.js';
import {
  INITIAL_OFFICERS,
  INITIAL_VICTIMS,
  INITIAL_KABAG,
  INITIAL_HOSPITALS
} from './initialDataset.js';

const STORAGE_KEY_VICTIMS = 'jr_monitoring_victims_v4';
const STORAGE_KEY_OFFICERS = 'jr_monitoring_officers_v4';
const STORAGE_KEY_CURRENT_USER = 'jr_monitoring_current_user_v2';
const STORAGE_KEY_NOTIFICATIONS = 'jr_monitoring_notifications_v1';
const STORAGE_KEY_DELETED_VICTIM_IDS = 'jr_monitoring_deleted_victim_ids_v1';

// Daftar nama & pola dummy yang dilarang muncul dalam sistem
export const DUMMY_VICTIM_NAMES = [
  'gilang pratama',
  'dewi lestari',
  'hj. mardiah',
  'hj mardiah',
  'mardiah',
  'rina marlina',
  'nurul hidayati',
  'ferry hermawan',
  'slamet riyadi',
  'agus setiawan',
  'anisa maharani',
  'rizky ramadhan',
  'bambang sugeng',
  'wahyu hidayat',
  'hendra wijaya',
  'siti aminah'
];

/**
 * Validasi apakah suatu objek korban adalah data dummy/mock yang harus dihapus
 */
export function isDummyVictim(v) {
  if (!v) return true;
  const idStr = String(v.id || '');
  if (idStr.startsWith('KOR-2026-')) return true;
  const report = String(v.nomorLaporan || v.nomorTiket || '');
  if (report.includes('/LANTAS') && report.startsWith('LP/A/10')) return true;
  const nameLower = String(v.nama || v.nama_korban || '').toLowerCase().trim();
  if (DUMMY_VICTIM_NAMES.some((dn) => nameLower === dn || nameLower.includes(dn))) return true;
  if (/^Pasien (Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des)/i.test(nameLower)) return true;
  return false;
}

// Baseline initialization and legacy cleanup: Hapus semua data dummy dari localStorage browser
if (typeof localStorage !== 'undefined') {
  try {
    const rawOfficers = localStorage.getItem(STORAGE_KEY_OFFICERS);
    if (!rawOfficers || rawOfficers === '[]') {
      localStorage.setItem(STORAGE_KEY_OFFICERS, JSON.stringify(INITIAL_OFFICERS));
    }
    const rawVictims = localStorage.getItem(STORAGE_KEY_VICTIMS);
    if (!rawVictims || rawVictims === '[]') {
      localStorage.setItem(STORAGE_KEY_VICTIMS, JSON.stringify([]));
    } else {
      try {
        const parsed = JSON.parse(rawVictims);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((v) => !isDummyVictim(v));
          localStorage.setItem(STORAGE_KEY_VICTIMS, JSON.stringify(cleaned));
        }
      } catch (_) { }
    }
    const rawUser = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
    if (!rawUser) {
      localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(INITIAL_KABAG));
    }

    ['jr_monitoring_victims_v1', 'jr_monitoring_victims_v2', 'jr_monitoring_victims_v3',
      'jr_monitoring_officers_v1', 'jr_monitoring_officers_v2', 'jr_monitoring_officers_v3',
      'jr_monitoring_mock_data', 'jr_user_credentials_v1'].forEach((k) => {
        try { localStorage.removeItem(k); } catch (_) { }
      });
  } catch (_) { }
}

// In-memory fallback in case localStorage quota is exceeded or unavailable
const memoryStore = new Map();
let isSyncing = false;
let lastSyncTimestamp = 0;

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
      } catch (_) { }
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
 * Sanitize photo URL: ensure external broken/blocked CDN URLs fallback to local verified assets
 */
function sanitizePhotoUrl(url) {
  if (!url) return null;
  if (typeof url === 'string' && (url.includes('images.unsplash.com') || url.includes('unsplash.com') || url.includes('default-visit-photo') || url.includes('.svg') || url.includes('/img/visits/'))) {
    return null;
  }
  return url;
}

/**
 * Konversi nama rumah sakit ke nama resmi canonical dari daftar 69 RS
 */
export function toCanonicalHospitalName(rsName) {
  if (!rsName) return '';
  const clean = String(rsName).trim().toLowerCase().replace(/[\s\-_.]+/g, '');
  const matched = (INITIAL_HOSPITALS || []).find((h) => h.toLowerCase().replace(/[\s\-_.]+/g, '') === clean);
  return matched || String(rsName).trim();
}

/**
 * Cek apakah dua nama rumah sakit merujuk pada faskes yang sama,
 * toleran terhadap variasi spasi, tanda strip, kapitalisasi, dan alias resmi.
 */
export function isHospitalNameMatch(hospA, hospB) {
  if (!hospA || !hospB) return false;
  const aRaw = String(hospA).trim();
  const bRaw = String(hospB).trim();
  if (!aRaw || !bRaw) return false;
  if (aRaw.toLowerCase() === bRaw.toLowerCase()) return true;

  const aClean = aRaw.toLowerCase().replace(/[\s\-_.,/()]+/g, '');
  const bClean = bRaw.toLowerCase().replace(/[\s\-_.,/()]+/g, '');
  if (!aClean || !bClean) return false;
  if (aClean === bClean) return true;

  const canonA = toCanonicalHospitalName(aRaw).toLowerCase().replace(/[\s\-_.,/()]+/g, '');
  const canonB = toCanonicalHospitalName(bRaw).toLowerCase().replace(/[\s\-_.,/()]+/g, '');
  if (canonA && canonB && canonA === canonB) return true;

  const keywords = [
    'syafira',
    'tabrani',
    'ekahospital',
    'arifinachmad',
    'bhayangkara',
    'prima',
    'aulia',
    'ibnusina',
    'hermina',
    'madani',
    'petalabumi',
    'santamaria',
    'sansani',
    'awalbrospanam',
    'awalbrosdumai',
    'awalbros'
  ];

  for (const kw of keywords) {
    if (aClean.includes(kw) && bClean.includes(kw)) {
      return true;
    }
  }

  if (aClean.length >= 6 && (bClean.includes(aClean) || aClean.includes(bClean))) {
    return true;
  }

  return false;
}

/**
 * Normalize and ensure victim data follows the 1-to-many continuous monitoring structure
 */
function normalizeVictim(rawVictim) {
  if (!rawVictim) return null;
  const v = { ...rawVictim };

  // Sinkronkan petugas penanggung jawab korban dengan petugas aktif yang memegang rumah sakit tersebut (Plotting RS)
  const caseRs = v.rumahSakit || v.rumahSakitTujuan || '';
  if (caseRs) {
    const officers = storageService.getOfficers();
    const matched = officers.find(
      (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some((rs) => isHospitalNameMatch(rs, caseRs))
    );

    if (matched) {
      // Periksa apakah petugas saat ini benar-benar memegang RS ini
      const currentOfficer = v.petugasId
        ? officers.find((o) => o.id === v.petugasId || String(o.id) === String(v.petugasId))
        : null;
      const currentOfficerHoldsRs = currentOfficer && Array.isArray(currentOfficer.plottingRs) && currentOfficer.plottingRs.some((rs) => isHospitalNameMatch(rs, caseRs));

      // Jika belum ada petugas, atau petugas saat ini TIDAK memegang RS ini (contoh: Petugas 4 tidak memegang RS Syafira):
      // Otomatis sinkronkan penugasan ke petugas resmi yang memegang RS tersebut!
      if (!v.petugasId || !currentOfficerHoldsRs || v.namaPetugas === 'Belum Ada Petugas Penanggung Jawab' || v.namaPetugas === 'Belum Ditugaskan') {
        v.petugasId = matched.id;
        v.namaPetugas = matched.nama;
        v.backendOfficerId = matched.backendOfficerId || matched.backendId || null;
      }
    } else {
      // Jika RS korban belum diplot ke petugas mana pun
      const currentOfficer = v.petugasId
        ? officers.find((o) => o.id === v.petugasId || String(o.id) === String(v.petugasId))
        : null;
      const currentOfficerHoldsRs = currentOfficer && Array.isArray(currentOfficer.plottingRs) && currentOfficer.plottingRs.some((rs) => isHospitalNameMatch(rs, caseRs));
      if (!currentOfficerHoldsRs) {
        v.petugasId = null;
        v.namaPetugas = 'Belum Ada Petugas Penanggung Jawab';
      }
    }
  }

  // Sinkronkan penugasan petugas tujuan dan asal jika terdapat rujukan antar-rumah sakit
  const allOfficersList = storageService.getOfficers();
  if (v.rumahSakitTujuan) {
    const destMatched = allOfficersList.find(
      (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some((rs) => isHospitalNameMatch(rs, v.rumahSakitTujuan))
    );
    if (destMatched) {
      v.petugasTujuanId = destMatched.id;
      v.petugasTujuanNama = destMatched.nama;
    }
  }
  if (v.rumahSakitAsal) {
    const origMatched = allOfficersList.find(
      (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some((rs) => isHospitalNameMatch(rs, v.rumahSakitAsal))
    );
    if (origMatched) {
      v.petugasAsalId = origMatched.id;
      v.petugasAsalNama = origMatched.nama;
    }
  }

  // Sinkronkan data di dalam riwayatRujukan
  if (Array.isArray(v.riwayatRujukan) && v.riwayatRujukan.length > 0) {
    v.riwayatRujukan = v.riwayatRujukan.map((ref) => {
      const destMatch = ref.keRs ? allOfficersList.find((o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some((rs) => isHospitalNameMatch(rs, ref.keRs))) : null;
      const origMatch = ref.dariRs ? allOfficersList.find((o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some((rs) => isHospitalNameMatch(rs, ref.dariRs))) : null;
      return {
        ...ref,
        petugasTujuanId: destMatch ? destMatch.id : (ref.petugasTujuanId || v.petugasTujuanId || null),
        petugasTujuanNama: destMatch ? destMatch.nama : (ref.petugasTujuanNama || v.petugasTujuanNama || null),
        petugasAsalId: origMatch ? origMatch.id : (ref.petugasAsalId || v.petugasAsalId || null),
        petugasAsalNama: origMatch ? origMatch.nama : (ref.petugasAsalNama || v.petugasAsalNama || null)
      };
    });
  }

  // Ensure tanggalMasukRs exists
  if (!v.tanggalMasukRs) {
    v.tanggalMasukRs = v.tanggalInformasiDiterima || v.tanggalKecelakaan || new Date().toISOString();
  }

  // Evaluasi 5 Kategori Status Pemantauan Resmi secara otomatis
  v.statusPemantauan = getMonitoringStatus(v);

  const isVictimFinished = isVictimFinishedUtil(v);

  if (isVictimFinished) {
    v.jadwalPemantauanBerikutnya = null;
    v.activePendingVisit = null;
    v.activeVisitId = null;
    v.tugasMenunggu = 0;
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
        kondisiKorban: vis.kondisiKorban || v.kondisiTerakhir || 'Rawat Inap',
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
        kondisiKorban: mon.kondisi || v.kondisiTerakhir || 'Rawat Inap',
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

  // Ensure all photos across activities, visits, and initial visit are sanitized
  if (v.kunjunganPertama && v.kunjunganPertama.fotoUrl) {
    v.kunjunganPertama.fotoUrl = sanitizePhotoUrl(v.kunjunganPertama.fotoUrl);
  }
  if (Array.isArray(v.riwayatKunjungan)) {
    v.riwayatKunjungan = v.riwayatKunjungan.map((vis) => ({
      ...vis,
      fotoUrl: sanitizePhotoUrl(vis.fotoUrl)
    }));
  }
  if (Array.isArray(v.riwayatPemantauan)) {
    v.riwayatPemantauan = v.riwayatPemantauan.map((mon) => ({
      ...mon,
      fotoUrl: sanitizePhotoUrl(mon.fotoUrl)
    }));
  }
  if (Array.isArray(v.riwayatAktivitas)) {
    v.riwayatAktivitas = v.riwayatAktivitas.map((act) => ({
      ...act,
      fotoUrl: sanitizePhotoUrl(act.fotoUrl)
    }));
  }

  // Ensure riwayatPerawatan exists and reflects all care milestones
  const isDischarged = v.kondisiTerakhir === 'Sudah Pulang' || v.kondisiTerakhir === 'Pulang' || v.kondisiTerakhir === 'Selesai';
  const isReferred = v.kondisiTerakhir === 'Dirujuk';

  if (!Array.isArray(v.riwayatPerawatan) || v.riwayatPerawatan.length === 0) {
    const admissionDate = v.tanggalMasukRs || v.tanggalInformasiDiterima || v.tanggalKecelakaan || new Date().toISOString();
    const careHistory = [
      {
        id: `CARE-INIT-${v.id}`,
        tanggal: admissionDate,
        rumahSakit: v.rumahSakitAsal || v.rumahSakit,
        jenisPerawatan: 'Rawat Pertama',
        status: isDischarged ? 'Pulang' : (isReferred ? 'Dirujuk' : 'Masih Dirawat'),
        petugasId: v.petugasId,
        petugasNama: v.namaPetugas,
        catatan: v.lokasiKejadian && v.lokasiKejadian !== '—'
          ? `Penerimaan pasien pertama di rumah sakit (Kejadian: ${v.lokasiKejadian}).`
          : 'Penerimaan pasien dan rawat pertama di rumah sakit.'
      }
    ];

    if (Array.isArray(v.riwayatAktivitas)) {
      const sortedAscActs = [...v.riwayatAktivitas].sort(
        (a, b) => new Date(a.tanggal || a.tanggalKunjungan).getTime() - new Date(b.tanggal || b.tanggalKunjungan).getTime()
      );
      sortedAscActs.forEach((act) => {
        if (act.kondisiKorban === 'Dirujuk' && (act.rumahSakitRujukan || v.rumahSakit !== (v.rumahSakitAsal || v.rumahSakit))) {
          const targetRs = act.rumahSakitRujukan || v.rumahSakit;
          careHistory.push({
            id: `CARE-REF-${act.id || Date.now()}`,
            tanggal: act.tanggal || act.tanggalKunjungan,
            rumahSakit: targetRs,
            rumahSakitAsal: v.rumahSakitAsal || v.rumahSakit,
            jenisPerawatan: 'Rujukan',
            status: 'Dirujuk',
            petugasId: act.petugasId || v.petugasId,
            petugasNama: act.petugasNama || v.namaPetugas,
            catatan: `Pasien dirujuk dari ${v.rumahSakitAsal || v.rumahSakit} ke ${targetRs} untuk fasilitas medis lanjutan.`
          });
        }
      });
    }

    if (isDischarged) {
      careHistory.push({
        id: `CARE-DISCHARGE-${v.id}`,
        tanggal: v.tanggalPemantauanTerakhir || v.tanggalKunjunganTerakhir || admissionDate,
        rumahSakit: v.rumahSakit,
        jenisPerawatan: 'Pulang',
        status: 'Pulang',
        petugasId: v.petugasId,
        petugasNama: v.namaPetugas,
        catatan: 'Pasien telah dinyatakan selesai perawatan / pulang oleh pihak rumah sakit.'
      });
    }

    v.riwayatPerawatan = careHistory;
  }

  // Derive statusPerawatan
  if (!v.statusPerawatan) {
    if (isReferred) {
      v.statusPerawatan = 'Rujukan';
    } else if (isDischarged) {
      v.statusPerawatan = 'Pulang';
    } else if (Array.isArray(v.riwayatPerawatan) && v.riwayatPerawatan.some((r) => r.jenisPerawatan === 'Rawat Lanjutan')) {
      v.statusPerawatan = 'Rawat Lanjutan';
    } else if (v.kunjunganPertama || (v.riwayatKunjungan && v.riwayatKunjungan.length > 0)) {
      v.statusPerawatan = 'Monitoring Berjalan';
    } else {
      v.statusPerawatan = 'Rawat Pertama';
    }
  }

  // Pastikan data rujukan konsisten dan rumahSakitAsal tidak tertimpa oleh rumahSakitTujuan
  if (v.rumahSakitTujuan) {
    if (!v.rumahSakitAsal || v.rumahSakitAsal === v.rumahSakitTujuan) {
      const refItem = Array.isArray(v.riwayatRujukan) && v.riwayatRujukan.find((r) => r.dariRs && r.dariRs !== v.rumahSakitTujuan);
      const careInit = Array.isArray(v.riwayatPerawatan) && v.riwayatPerawatan.find((c) => (c.jenisPerawatan === 'Rawat Pertama' || c.id?.includes('INIT')) && c.rumahSakit && c.rumahSakit !== v.rumahSakitTujuan);
      const initMatch = INITIAL_VICTIMS.find((iv) => iv.id === v.id || (iv.nik && v.nik && iv.nik === v.nik));
      const realOrigin = refItem?.dariRs || careInit?.rumahSakit || (initMatch?.rumahSakit && initMatch.rumahSakit !== v.rumahSakitTujuan ? initMatch.rumahSakit : null);
      if (realOrigin) {
        v.rumahSakitAsal = realOrigin;
      }
    }
  }

  const readmissionThreshold = v.tanggalMasukTerbaru
    ? parseDateToTimestamp(v.tanggalMasukTerbaru)
    : (v.tanggalPulangSebelumnya ? parseDateToTimestamp(v.tanggalPulangSebelumnya) : 0);

  const resolveActHospital = (act) => {
    if (act.rumahSakit && act.rumahSakit !== '—') return act.rumahSakit;
    if (act.rumahSakitRujukan) return act.rumahSakitRujukan;

    // Cari berdasarkan caseId pada episode perawatan
    if (act.caseId && Array.isArray(v.careEpisodes)) {
      const matchEp = v.careEpisodes.find((e) => String(e.caseId) === String(act.caseId));
      if (matchEp?.rumahSakit) return matchEp.rumahSakit;
    }

    // Jika ada tanggal pembanding rawat lanjutan
    const actTime = parseDateToTimestamp(act.waktuAktualKunjungan || act.tanggal || act.tanggalKunjungan || 0);
    if (readmissionThreshold > 0 && v.rumahSakitAsal && v.rumahSakit) {
      if (actTime >= readmissionThreshold) {
        return v.rumahSakit; // RS Lanjutan (RS Terkini)
      } else {
        return v.rumahSakitAsal; // RS Asal (RS Sebelumnya)
      }
    }

    return v.rumahSakit || v.rumahSakitAsal || 'Rumah Sakit';
  };

  if (v.isRawatLanjutan || v.statusPerawatan === 'Rawat Lanjutan') {
    v.isRujukanMasuk = false;
    v.rujukanAccepted = false;
    v.rumahSakitTujuan = null;
    v.tanggalRujukan = null;
    if (typeof v.kondisiTerakhir === 'string' && v.kondisiTerakhir.startsWith('Dirujuk')) {
      v.kondisiTerakhir = 'Sedang Dirawat';
    }
    v.statusPemantauan = getMonitoringStatus(v);
  }

  if (Array.isArray(v.riwayatAktivitas)) {
    v.riwayatAktivitas = v.riwayatAktivitas.map((act) => ({
      ...act,
      rumahSakit: resolveActHospital(act)
    }));
  }

  if (Array.isArray(v.riwayatKunjungan)) {
    v.riwayatKunjungan = v.riwayatKunjungan.map((vis) => ({
      ...vis,
      rumahSakit: resolveActHospital(vis)
    }));
  }

  if (v.kunjunganPertama) {
    v.kunjunganPertama = {
      ...v.kunjunganPertama,
      rumahSakit: v.kunjunganPertama.rumahSakit || v.rumahSakitAsal || v.rumahSakit
    };
  }

  return v;
}

/**
 * Normalisasi nama untuk pencocokan cerdas de-duplikasi
 */
function normalizePersonName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/\b(tn|ny|nona|an|anak|sdr|sdri|haji|hj)\b[\.\s]*/gi, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalisasi nama rumah sakit untuk pencocokan
 */
function normalizeHospitalName(rs) {
  if (!rs) return '';
  return String(rs)
    .toLowerCase()
    .replace(/\b(rsud|rs|rumah sakit umum daerah|rumah sakit)\b/gi, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Menghubungkan dan mencegah duplikasi entri korban ketika pasien yang sebelumnya
 * sudah dinyatakan pulang kembali masuk ke rumah sakit beberapa hari kemudian (baik diinput
 * via bot WhatsApp maupun formulir sistem). Seluruh data disambungkan ke kasus awal.
 */
export function linkAndDeduplicateVictims(victimList) {
  if (!Array.isArray(victimList) || victimList.length <= 1) return victimList || [];

  const getRecordTime = (v) => {
    return (
      parseDateToTimestamp(v.waktu_lapor_wa) ||
      parseDateToTimestamp(v.tanggalInformasiDiterima) ||
      parseDateToTimestamp(v.tanggalMasukRs) ||
      parseDateToTimestamp(v.created_at) ||
      parseDateToTimestamp(v.tanggalKecelakaan) ||
      0
    );
  };

  // Urutkan dari kronologis paling awal (tua) ke paling baru
  const sorted = [...victimList].sort((a, b) => {
    const timeA = getRecordTime(a);
    const timeB = getRecordTime(b);
    if (timeA !== timeB) return timeA - timeB;
    return (Number(a.caseId || a.id) || 0) - (Number(b.caseId || b.id) || 0);
  });

  const merged = [];

  for (const item of sorted) {
    if (!item) continue;
    const cleanNik = (item.nik || '').replace(/\D/g, '');
    const cleanName = normalizePersonName(item.nama);

    // Cari apakah ada data korban yang cocok di daftar yang sudah diproses sebelumnya
    const matchIndex = merged.findIndex((existing) => {
      // 1. Kecocokan ID atau Nomor Tiket yang sama persis
      if (
        String(existing.id) === String(item.id) ||
        (existing.nomorTiket && item.nomorTiket && existing.nomorTiket === item.nomorTiket) ||
        (existing.caseId && item.caseId && String(existing.caseId) === String(item.caseId)) ||
        (Array.isArray(existing.secondaryIds) && existing.secondaryIds.map(String).includes(String(item.id)))
      ) {
        return true;
      }

      // 2. Kecocokan NIK Sah (1 NIK = 1 Warga Negara / 1 Korban — lintas RS baik rujukan maupun rawat ulang mandiri)
      const existingNik = (existing.nik || '').replace(/\D/g, '');
      if (cleanNik.length >= 6 && existingNik.length >= 6 && cleanNik === existingNik) {
        return true;
      }

      // 3. Kecocokan Nama Lengkap (Harus Sama Persis)
      const existingName = normalizePersonName(existing.nama);
      if (cleanName && cleanName.length >= 3 && existingName && existingName.length >= 3) {
        const nameMatches = existingName === cleanName;

        if (nameMatches) {
          const sameHospital = normalizeHospitalName(existing.rumahSakit) === normalizeHospitalName(item.rumahSakit);
          const hasReferral = Boolean(
            (Array.isArray(item.riwayatRujukan) && item.riwayatRujukan.length > 0) ||
            (Array.isArray(existing.riwayatRujukan) && existing.riwayatRujukan.length > 0) ||
            (Array.isArray(item.referrals) && item.referrals.length > 0) ||
            (Array.isArray(existing.referrals) && existing.referrals.length > 0) ||
            item.status_kondisi?.startsWith('Dirujuk') ||
            existing.status_kondisi?.startsWith('Dirujuk') ||
            item.statusPerawatan === 'Rujukan' ||
            existing.statusPerawatan === 'Rujukan' ||
            item.statusPerawatan === 'Rujukan Diterima' ||
            existing.statusPerawatan === 'Rujukan Diterima'
          );
          // HANYA satukan jika di rumah sakit yang sama ATAU ada bukti rujukan resmi.
          // JANGAN PERNAH satukan pasien antar faskes berbeda hanya karena nama sama / tanpa NIK!
          if (sameHospital || hasReferral) {
            return true;
          }
        }
      }

      return false;
    });

    if (matchIndex === -1) {
      // Belum ada riwayat kasus serupa sebelumnya, masukkan sebagai entri baru
      merged.push({ ...item });
    } else {
      // DITEMUKAN KECOCOKAN KASUS!
      // Karena sorted urut kronologis (earliest -> latest), target adalah kasus/periode LEBIH AWAL, dan item adalah LEBIH BARU.
      const target = merged[matchIndex];

      const isSameCaseRecord =
        String(target.id) === String(item.id) ||
        (target.nomorTiket && item.nomorTiket && target.nomorTiket === item.nomorTiket) ||
        (target.caseId && item.caseId && String(target.caseId) === String(item.caseId)) ||
        (Array.isArray(target.secondaryIds) && target.secondaryIds.map(String).includes(String(item.id)));

      if (isSameCaseRecord) {
        if (!target.kunjunganPertama?.fotoUrl && item.kunjunganPertama?.fotoUrl) {
          target.kunjunganPertama = item.kunjunganPertama;
        }
        if (item.tanggalMeninggal || target.tanggalMeninggal || item.kondisiTerakhir === 'Meninggal Dunia' || target.kondisiTerakhir === 'Meninggal Dunia') {
          target.tanggalMeninggal = item.tanggalMeninggal || target.tanggalMeninggal;
          target.jamMeninggal = item.jamMeninggal || target.jamMeninggal;
          target.waktuMeninggal = item.waktuMeninggal || target.waktuMeninggal;
          target.dicatatOleh = item.dicatatOleh || target.dicatatOleh;
          target.petugasPencatatId = item.petugasPencatatId || target.petugasPencatatId;
          target.waktuPencatatanMD = item.waktuPencatatanMD || target.waktuPencatatanMD;
          target.kondisiTerakhir = 'Meninggal Dunia';
          target.status_kondisi = 'Meninggal Dunia';
          target.statusPemantauan = 'Selesai Dipantau';
          target.statusPerawatan = 'Meninggal Dunia';
          target.jadwalPemantauanBerikutnya = null;
        }
        continue;
      }

      // ── PASIEN SAMA DI RUMAH SAKIT / PERIODE BERBEDA ──
      const hospitalEarlier = target.rumahSakitAsal || target.rumahSakit;
      const hospitalLater = item.rumahSakit || target.rumahSakit;
      const sameHospital = normalizeHospitalName(hospitalEarlier) === normalizeHospitalName(hospitalLater);

      // Catat seluruh ID keterkaitan
      target.secondaryIds = Array.from(new Set([
        ...(target.secondaryIds || []),
        String(target.id),
        String(target.caseId),
        target.nomorTiket,
        String(item.id),
        String(item.caseId),
        item.nomorTiket
      ].filter(Boolean)));

      const isEarlierDischarged = Boolean(
        target.kondisiTerakhir === 'Sudah Pulang' ||
        target.kondisiTerakhir === 'Pulang' ||
        target.kondisiTerakhir === 'Selesai' ||
        target.status_kondisi === 'Selesai' ||
        target.statusPemantauan === 'Selesai Dipantau' ||
        target.statusPerawatan === 'Pulang' ||
        target.rawatLanjutanDariPulang
      );

      const isItemDischarged = Boolean(
        item.kondisiTerakhir === 'Sudah Pulang' ||
        item.kondisiTerakhir === 'Pulang' ||
        item.kondisiTerakhir === 'Selesai' ||
        item.status_kondisi === 'Selesai' ||
        item.status_kondisi === 'Sudah Pulang' ||
        item.status_kondisi === 'Pulang'
      );

      const admissionDate = item.tanggalMasukRs || item.tanggalInformasiDiterima || new Date().toISOString();

      // Perbarui konteks aktif ke periode perawatan terbaru (item)
      target.id = String(item.id);
      target.caseId = item.caseId || item.id;
      target.nomorTiket = item.nomorTiket || target.nomorTiket;
      target.nomorLaporan = item.nomorLaporan || target.nomorLaporan;
      target.rumahSakitAsal = hospitalEarlier;
      target.rumahSakit = hospitalLater;
      target.hospital_id = item.hospital_id || target.hospital_id;
      target.hospital_lat = item.hospital_lat !== undefined ? item.hospital_lat : target.hospital_lat;
      target.hospital_lng = item.hospital_lng !== undefined ? item.hospital_lng : target.hospital_lng;
      target.hospital_radius = item.hospital_radius !== undefined ? item.hospital_radius : target.hospital_radius;
      target.ruangan = item.ruangan || target.ruangan;
      target.ruangan_rs = item.ruangan_rs || target.ruangan_rs;
      target.petugasId = item.petugasId || target.petugasId;
      target.namaPetugas = item.namaPetugas || target.namaPetugas;

      target.statusPerawatan = 'Rawat Lanjutan';
      target.isRawatLanjutan = true;
      target.isReactivated = !isItemDischarged;
      target.rawatLanjutanDariPulang = isEarlierDischarged;
      target.isRujukanMasuk = false;
      target.rujukanAccepted = false;
      target.rumahSakitTujuan = null;
      target.tanggalRujukan = null;

      // Status pasien utama mengikuti kondisi periode terbaru di rumah sakit kedua (item)
      if (item.kondisiTerakhir === 'Meninggal Dunia' || item.status_kondisi === 'Meninggal Dunia' || target.kondisiTerakhir === 'Meninggal Dunia' || target.status_kondisi === 'Meninggal Dunia' || Boolean(item.tanggalMeninggal) || Boolean(target.tanggalMeninggal)) {
        target.kondisiTerakhir = 'Meninggal Dunia';
        target.status_kondisi = 'Meninggal Dunia';
        target.statusPemantauan = 'Selesai Dipantau';
        target.statusPerawatan = 'Meninggal Dunia';
        target.tanggalMeninggal = item.tanggalMeninggal || target.tanggalMeninggal;
        target.jamMeninggal = item.jamMeninggal || target.jamMeninggal;
        target.waktuMeninggal = item.waktuMeninggal || target.waktuMeninggal;
        target.dicatatOleh = item.dicatatOleh || target.dicatatOleh;
        target.petugasPencatatId = item.petugasPencatatId || target.petugasPencatatId;
        target.waktuPencatatanMD = item.waktuPencatatanMD || target.waktuPencatatanMD;
        target.activePendingVisit = null;
        target.activeVisitId = null;
        target.tugasMenunggu = 0;
        target.jadwalPemantauanBerikutnya = null;
      } else if (isItemDischarged) {
        target.kondisiTerakhir = 'Pulang';
        target.status_kondisi = 'Selesai';
        target.statusPemantauan = 'Selesai Dipantau';
        target.statusTindakLanjut = 'Sudah Selesai';
        target.tindakLanjut = 'Seluruh pemantauan selesai (Pasien Pulang)';
        target.activePendingVisit = null;
        target.activeVisitId = null;
        target.tugasMenunggu = 0;
      } else {
        target.kondisiTerakhir = item.kondisiTerakhir || item.status_kondisi || 'Sedang Dirawat';
        target.status_kondisi = item.status_kondisi || item.kondisiTerakhir || 'Sedang Dirawat';
        target.statusPemantauan = (item.riwayatKunjungan && item.riwayatKunjungan.length > 0)
          ? MONITORING_STATUS.DALAM_PEMANTAUAN
          : MONITORING_STATUS.BELUM_DIPANTAU;
        target.statusTindakLanjut = 'Masih Perlu Ditindaklanjuti';
        target.tindakLanjut = item.tindakLanjut || 'Pemantauan berkala pasien rawat lanjutan';
        target.activePendingVisit = item.activePendingVisit || null;
        target.activeVisitId = item.activeVisitId || (item.activePendingVisit ? item.activePendingVisit.visitId : null);
        target.tugasMenunggu = item.tugasMenunggu !== undefined ? item.tugasMenunggu : (item.activePendingVisit ? 1 : 0);
        target.jadwalPemantauanBerikutnya = item.jadwalPemantauanBerikutnya || null;
      }

      target.tanggalMasukAwal = target.tanggalMasukAwal || target.tanggalMasukRs || target.tanggalInformasiDiterima;
      target.tanggalPulangSebelumnya = target.tanggalPulangSebelumnya || target.tanggalPulang || target.tanggalKunjunganTerakhir || target.waktuPemantauanTerakhir || target.tanggalInformasiDiterima;
      target.tanggalMasukRs = admissionDate;
      target.tanggalMasukTerbaru = admissionDate;
      target.tanggalInformasiDiterima = item.tanggalInformasiDiterima || target.tanggalInformasiDiterima;
      target.sumberInformasi = item.sumberInformasi || 'Bot WhatsApp';

      target.catatanRawatLanjutan = item.kronologi || item.keteranganTambahan ||
        (sameHospital
          ? `Pasien kembali masuk RS untuk rawat lanjutan di RS yang sama (${hospitalLater}) beberapa hari setelah dinyatakan pulang (Laporan Bot WhatsApp).`
          : `Pasien kembali menjalani rawat lanjutan di ${hospitalLater} setelah sebelumnya menyelesaikan perawatan di ${hospitalEarlier} (Laporan Bot WhatsApp).`);

      if (item.statusKeterjaminan) {
        target.statusKeterjaminan = item.statusKeterjaminan;
        target.status_keterjaminan = item.status_keterjaminan;
      }
      if (item.noGl) {
        target.noGl = item.noGl;
        target.no_gl = item.no_gl;
      }
      if (item.tglGl) {
        target.tglGl = item.tglGl;
        target.tgl_gl = item.tgl_gl;
      }

      // Kunjungan Episode 1 (RS Awal / RS Sebelumnya): selalu melekat pada RS Awal dan berstatus Pulang jika telah selesai
      const earlierVisits = (target.riwayatKunjungan || []).map((v) => ({
        ...v,
        rumahSakit: v.rumahSakit || hospitalEarlier,
        caseId: v.caseId || (target.secondaryIds?.[0] || 1),
        kondisiKorban: isEarlierDischarged ? 'Pulang' : (v.kondisiKorban || 'Pulang'),
        isReadOnly: true
      }));

      // Kunjungan Episode 2 (RS Saat Ini / RS Baru): selalu melekat pada RS Baru
      const laterVisits = (item.riwayatKunjungan || []).map((v) => ({
        ...v,
        rumahSakit: v.rumahSakit || hospitalLater,
        caseId: v.caseId || item.caseId,
        kondisiKorban: isItemDischarged ? 'Pulang' : (v.kondisiKorban || target.kondisiTerakhir)
      }));

      // Susun Care Episodes yang terisolasi dan terstruktur
      const episode1Visits = earlierVisits;
      const episode2Visits = laterVisits;

      target.careEpisodes = [
        {
          id: `EPISODE-1-${target.secondaryIds?.[0] || 1}`,
          nomorPeriode: 1,
          caseId: target.secondaryIds?.[0] || 1,
          nomorTiket: target.secondaryIds?.[2] || target.nomorTiket,
          rumahSakit: hospitalEarlier,
          labelPeriode: `Periode 1 (Rawat Awal di ${hospitalEarlier})`,
          tipePerawatan: 'Rawatan Pertama',
          status: isEarlierDischarged ? 'Pulang' : 'Masih Dirawat',
          kondisiTerakhir: isEarlierDischarged ? 'Pulang' : 'Masih Dirawat',
          statusPerawatan: isEarlierDischarged ? 'Selesai / Pulang' : 'Perawatan Selesai',
          statusPemantauan: 'Selesai Dipantau',
          isAktif: false,
          isReadOnly: true,
          tanggalMulai: target.tanggalMasukAwal || target.tanggalMasukRs,
          tanggalSelesai: target.tanggalPulangSebelumnya || target.tanggalPulang || target.waktuPemantauanTerakhir,
          petugasId: target.petugasId,
          petugasNama: target.namaPetugas,
          kunjunganList: episode1Visits
        },
        {
          id: `EPISODE-2-${item.caseId || item.id}`,
          nomorPeriode: 2,
          caseId: item.caseId || item.id,
          nomorTiket: item.nomorTiket,
          rumahSakit: hospitalLater,
          labelPeriode: `Periode 2 (Rawat Lanjutan di ${hospitalLater})`,
          tipePerawatan: 'Rawatan Lanjutan Antar RS',
          status: isItemDischarged ? 'Pulang' : 'Sedang Dipantau',
          kondisiTerakhir: isItemDischarged ? 'Pulang' : (item.kondisiTerakhir || item.status_kondisi || 'Sedang Dirawat'),
          statusPerawatan: isItemDischarged ? 'Perawatan Selesai' : 'Perawatan Aktif',
          statusPemantauan: isItemDischarged ? 'Selesai Dipantau' : 'Pemantauan Aktif',
          isAktif: !isItemDischarged,
          isReadOnly: isItemDischarged,
          tanggalMulai: item.tanggalMasukRs || item.tanggalInformasiDiterima,
          tanggalSelesai: isItemDischarged ? (item.tanggalKunjunganTerakhir || item.waktuPemantauanTerakhir) : null,
          petugasId: item.petugasId,
          petugasNama: item.namaPetugas,
          kunjunganList: episode2Visits,
          activePendingVisit: item.activePendingVisit || null
        }
      ];

      // Gabungkan riwayat kunjungan dan aktivitas
      const combinedVisits = [...earlierVisits, ...laterVisits];
      const visMap = new Map();
      combinedVisits.forEach((vis) => {
        if (vis && (vis.id || vis.visitId) && !visMap.has(vis.id || vis.visitId)) {
          visMap.set(vis.id || vis.visitId, vis);
        }
      });
      target.riwayatKunjungan = Array.from(visMap.values()).sort(
        (a, b) => parseDateToTimestamp(a.tanggal || a.tanggal_kunjungan || 0) - parseDateToTimestamp(b.tanggal || b.tanggal_kunjungan || 0)
      );

      const earlierActs = (target.riwayatAktivitas || []).map((a) => ({
        ...a,
        episodeNumber: a.episodeNumber || 1,
        rumahSakit: a.rumahSakit || hospitalEarlier,
        kondisiKorban: a.kondisiKorban || (isEarlierDischarged ? 'Pulang' : undefined),
        isReadOnly: true
      }));

      const maxEarlierTs = earlierActs.reduce((mx, a) => {
        const ts = parseDateToTimestamp(a.waktuAktualKunjungan || a.tanggalKunjungan || a.tanggal || 0);
        return ts > mx ? ts : mx;
      }, 0);
      const rawLaterStart = item.waktu_lapor_wa || item.tanggalInformasiDiterima || admissionDate;
      const rawLaterTs = parseDateToTimestamp(rawLaterStart);
      const effectiveReactivateIso = (maxEarlierTs > 0 && rawLaterTs <= maxEarlierTs)
        ? new Date(maxEarlierTs + 1000).toISOString()
        : (rawLaterTs > 0 ? new Date(rawLaterTs).toISOString() : new Date().toISOString());

      const nextEpNum = earlierActs.reduce((mx, a) => Math.max(mx, Number(a.episodeNumber) || 1), 1) + 1;
      const reactivateLogId = `ACT-REACTIVATE-${item.caseId || item.id}`;
      const reactivateBoundaryLog = {
        id: reactivateLogId,
        victimId: target.id,
        episodeNumber: nextEpNum,
        jenisAktivitas: 'Aktivasi Pemantauan Kembali (Rawat Lanjutan)',
        isNonVisitConfirmation: true,
        isReactivationLog: true,
        tanggal: effectiveReactivateIso,
        tanggalKunjungan: effectiveReactivateIso,
        waktuAktualKunjungan: effectiveReactivateIso,
        rumahSakit: hospitalLater,
        kondisiKorban: item.kondisiTerakhir || item.status_kondisi || 'Rawat Inap',
        petugasId: item.petugasId,
        petugasNama: item.namaPetugas,
        hasilKomunikasi: target.catatanRawatLanjutan
      };

      const laterActs = (item.riwayatAktivitas || []).map((a) => ({
        ...a,
        episodeNumber: nextEpNum,
        rumahSakit: a.rumahSakit || hospitalLater,
        kondisiKorban: isItemDischarged ? 'Pulang' : (a.kondisiKorban || target.kondisiTerakhir)
      }));

      const combinedActivities = [...laterActs, reactivateBoundaryLog, ...earlierActs];
      const actMap = new Map();
      combinedActivities.forEach((act) => {
        if (act && (act.id || act.visitId) && !actMap.has(act.id || act.visitId)) {
          actMap.set(act.id || act.visitId, act);
        }
      });
      target.riwayatAktivitas = Array.from(actMap.values()).sort(
        (a, b) => parseDateToTimestamp(b.tanggal || b.tanggalKunjungan || 0) - parseDateToTimestamp(a.tanggal || a.tanggalKunjungan || 0)
      );

      // Kunjungan pertama (Episode 1)
      if (target.kunjunganPertama) {
        target.kunjunganPertama = {
          ...target.kunjunganPertama,
          rumahSakit: target.kunjunganPertama.rumahSakit || hospitalEarlier,
          kondisiKorban: isEarlierDischarged ? 'Pulang' : target.kunjunganPertama.kondisiKorban
        };
      }
    }
  }

  // Kembalikan daftar yang sudah bersih tanpa duplikasi, diurutkan menurut update terbaru
  return merged.sort((a, b) => {
    const timeA = parseDateToTimestamp(a.waktu_lapor_wa || a.tanggalMasukRs || a.tanggalInformasiDiterima || 0);
    const timeB = parseDateToTimestamp(b.waktu_lapor_wa || b.tanggalMasukRs || b.tanggalInformasiDiterima || 0);
    if (timeB !== timeA) return timeB - timeA;
    return (Number(b.caseId || b.id) || 0) - (Number(a.caseId || a.id) || 0);
  });
}

/**
 * Storage Service - Terhubung dengan REST API Backend & Sinkronisasi DB MySQL
 */
export const storageService = {
  /**
   * Sinkronisasi data live dari Backend MySQL (tabel cases & visits)
   */
  async syncWithBackend(force = false) {
    if (isSyncing) return this.getVictims();
    if (!force && Date.now() - lastSyncTimestamp < 30000) return this.getVictims();
    isSyncing = true;
    lastSyncTimestamp = Date.now();

    try {
      // Jika pengguna belum terautentikasi (tidak ada auth token), lewati sinkronisasi backend
      if (!api.getAuthToken()) {
        return this.getVictims();
      }

      // 1. Sinkronkan data master petugas dan plotting RS murni dari backend MySQL
      try {
        const backendOfficers = await api.getOfficers(true);
        if (Array.isArray(backendOfficers) && backendOfficers.length > 0) {
          const freshOfficers = [];

          for (const bo of backendOfficers) {
            let plottingRs = [];
            let plotsList = [];
            try {
              const plots = await api.getOfficerHospitals(bo.id);
              if (Array.isArray(plots)) {
                plotsList = plots;
                plottingRs = plots.map((p) => p.nama_rs);
              }
            } catch (_) { }

            const nameParts = (bo.nama || 'Petugas').trim().split(/\s+/);
            const avatar = nameParts.length >= 2
              ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
              : nameParts[0].slice(0, 2).toUpperCase();

            const existingOfficer = this.getOfficers().find((lo) =>
              String(lo.id) === `PET-${String(bo.id).padStart(2, '0')}` ||
              String(lo.backendOfficerId) === String(bo.id)
            );

            const effectiveEmail = (bo.email && bo.email !== '—')
              ? bo.email
              : (existingOfficer?.email && existingOfficer.email !== '—' ? existingOfficer.email : '—');

            const effectivePhone = (bo.telepon && bo.telepon !== '—')
              ? bo.telepon
              : (existingOfficer?.telepon && existingOfficer.telepon !== '—' ? existingOfficer.telepon : '—');

            const effectivePrevEmails = Array.isArray(existingOfficer?.previousEmails)
              ? existingOfficer.previousEmails
              : [];

            freshOfficers.push({
              ...(existingOfficer || {}),
              id: `PET-${String(bo.id).padStart(2, '0')}`,
              backendId: bo.id,
              backendOfficerId: bo.id,
              username: bo.username || existingOfficer?.username || null,
              nama: bo.nama || existingOfficer?.nama,
              nip: bo.nip || existingOfficer?.nip || '—',
              jabatan: bo.jabatan || existingOfficer?.jabatan || 'Mobile Service Officer',
              wilayah: bo.wilayah || existingOfficer?.wilayah || 'Pekanbaru Kota',
              telepon: effectivePhone,
              email: effectiveEmail,
              previousEmails: effectivePrevEmails,
              avatar,
              status: bo.operational_status || (bo.is_active ? 'Aktif Lapangan' : 'Nonaktif'),
              kapasitas: '0/10 Kasus',
              plottingRs: Array.isArray(plotsList) ? plottingRs : (existingOfficer?.plottingRs || []),
              hospitals: Array.isArray(plotsList) ? plotsList : (existingOfficer?.hospitals || []),
              bebanKasusPct: 0
            });
          }

          this.saveOfficers(freshOfficers);
        }
      } catch (offSyncErr) {
        console.warn('[storageService] Officers sync skipped:', offSyncErr.message);
      }

      // 2. Ambil data kasus terbaru murni dari backend MySQL
      const backendCases = await api.getCases();
      if (Array.isArray(backendCases)) {
        const officers = this.getOfficers();

        // Ambil detail riwayat visits untuk setiap case
        const mappedVictims = await Promise.all(
          backendCases.map(async (c) => {
            try {
              const detail = await api.getCaseById(c.id);
              return mapBackendCaseToVictim(detail?.case || c, detail?.visits || [], officers, detail?.referrals || []);
            } catch {
              return mapBackendCaseToVictim(c, [], officers, []);
            }
          })
        );

        // Sinkronkan dan pertahankan foto kunjungan (baik foto live dari backend maupun foto kamera lokal)
        const existingVictims = this.getVictims();
        mappedVictims.forEach((mapped) => {
          const existing = existingVictims.find((ev) => String(ev.id) === String(mapped.id) || String(ev.caseId) === String(mapped.caseId) || ev.nomorTiket === mapped.nomorTiket);
          if (existing) {
            // Jika backend memiliki foto bukti resmi, SELALU utamakan foto resmi backend!
            if (mapped.kunjunganPertama?.foto_bukti_url) {
              mapped.kunjunganPertama.fotoUrl = resolvePhotoUrl(mapped.kunjunganPertama.foto_bukti_url);
            } else if (existing.kunjunganPertama?.fotoUrl && (existing.kunjunganPertama.fotoUrl.startsWith('data:') || existing.kunjunganPertama.fotoUrl.startsWith('blob:'))) {
              mapped.kunjunganPertama.fotoUrl = existing.kunjunganPertama.fotoUrl;
            }

            if (Array.isArray(existing.riwayatAktivitas) && Array.isArray(mapped.riwayatAktivitas)) {
              mapped.riwayatAktivitas.forEach((mAct) => {
                const eAct = existing.riwayatAktivitas.find((a) => a.id === mAct.id || a.visitId === mAct.visitId);
                // Jika backend memiliki foto bukti resmi, SELALU gunakan foto resmi backend!
                if (mAct.foto_bukti_url) {
                  mAct.fotoUrl = resolvePhotoUrl(mAct.foto_bukti_url);
                } else if (eAct && eAct.fotoUrl && (eAct.fotoUrl.startsWith('data:') || eAct.fotoUrl.startsWith('blob:'))) {
                  mAct.fotoUrl = eAct.fotoUrl;
                }
              });
            }
            if (Array.isArray(mapped.riwayatKunjungan) && Array.isArray(mapped.riwayatAktivitas)) {
              mapped.riwayatKunjungan.forEach((rk) => {
                const act = mapped.riwayatAktivitas.find((a) => a.visitId === rk.visitId || a.id === rk.id);
                if (act?.fotoUrl) rk.fotoUrl = act.fotoUrl;
              });
            }
            if (Array.isArray(mapped.riwayatPemantauan) && Array.isArray(mapped.riwayatAktivitas)) {
              mapped.riwayatPemantauan.forEach((rp) => {
                const act = mapped.riwayatAktivitas.find((a) => a.visitId === rp.visitId || a.id === rp.id);
                if (act?.fotoUrl) rp.fotoUrl = act.fotoUrl;
              });
            }
            // Pertahankan dan sinkronkan data status MD (Meninggal Dunia) jika ada di cache lokal atau backend
            const hasMdStatus = existing.kondisiTerakhir === 'Meninggal Dunia' || existing.status_kondisi === 'Meninggal Dunia' || Boolean(existing.tanggalMeninggal) ||
              mapped.kondisiTerakhir === 'Meninggal Dunia' || mapped.status_kondisi === 'Meninggal Dunia' || Boolean(mapped.tanggalMeninggal);
            if (hasMdStatus) {
              mapped.tanggalMeninggal = existing.tanggalMeninggal || mapped.tanggalMeninggal;
              mapped.jamMeninggal = existing.jamMeninggal || mapped.jamMeninggal;
              mapped.waktuMeninggal = existing.waktuMeninggal || mapped.waktuMeninggal;
              mapped.dicatatOleh = existing.dicatatOleh || mapped.dicatatOleh || existing.namaPetugas || mapped.namaPetugas;
              mapped.petugasPencatatId = existing.petugasPencatatId || mapped.petugasPencatatId || existing.petugasId || mapped.petugasId;
              mapped.waktuPencatatanMD = existing.waktuPencatatanMD || mapped.waktuPencatatanMD || new Date().toISOString();
              mapped.kondisiTerakhir = 'Meninggal Dunia';
              mapped.status_kondisi = 'Meninggal Dunia';
              mapped.statusPemantauan = MONITORING_STATUS.SELESAI_MD;
              mapped.statusPerawatan = 'Meninggal Dunia';
              mapped.jadwalPemantauanBerikutnya = null;

              // Pulihkan dari catatan aktivitas jika tanggal masih kosong
              if (!mapped.tanggalMeninggal) {
                const acts = [...(mapped.riwayatAktivitas || []), ...(existing.riwayatAktivitas || [])];
                const mdAct = acts.find((a) => a.catatan_kondisi && (a.catatan_kondisi.includes('[MD]') || a.catatan_kondisi.toLowerCase().includes('meninggal')));
                if (mdAct && mdAct.catatan_kondisi) {
                  const tMatch = mdAct.catatan_kondisi.match(/Tanggal:\s*([^\s|]+(?:\s+[^\s|]+)*?)(?=\s*\||\s*$)/i);
                  const jMatch = mdAct.catatan_kondisi.match(/Jam:\s*([^\s|]+(?:\s+[^\s|]+)*?)(?=\s*\||\s*$)/i);
                  if (tMatch) mapped.tanggalMeninggal = tMatch[1].trim();
                  if (jMatch) mapped.jamMeninggal = jMatch[1].trim().replace(/\s*WIB/i, '');
                }
              }

              // Default cadangan jika belum terekam dari input sebelumnya
              if (!mapped.tanggalMeninggal) {
                mapped.tanggalMeninggal = (mapped.tanggalKunjunganTerakhir || mapped.tanggalInformasiDiterima || new Date().toISOString()).split('T')[0];
              }
              if (!mapped.jamMeninggal) {
                mapped.jamMeninggal = '12:00';
              }
            }

            // Selalu pertahankan aktivitas/kunjungan lokal yang belum ada di backend (MON-, ACT-, CONF-, aktivasi ulang)
            const localOnlyActs = (existing.riwayatAktivitas || []).filter((a) =>
              a?.isReactivationLog ||
              a?.isNonVisitConfirmation ||
              String(a?.id || '').startsWith('MON-') ||
              String(a?.id || '').startsWith('ACT-') ||
              String(a?.id || '').startsWith('CONF-')
            );
            if (localOnlyActs.length > 0) {
              const existingIds = new Set((mapped.riwayatAktivitas || []).map((a) => a.id));
              mapped.riwayatAktivitas = [
                ...localOnlyActs.filter((a) => !existingIds.has(a.id)),
                ...(mapped.riwayatAktivitas || [])
              ];
            }

            // Pertahankan konfirmasi kondisi non-kunjungan (Pulang / Tolak Jaminan JR) atau aktivasi ulang Rawat Lanjutan lokal
            if (existing.isNonVisitConfirmation && !hasMdStatus) {
              mapped.isNonVisitConfirmation = true;
              mapped.kondisiTerakhir = existing.kondisiTerakhir;
              mapped.status_kondisi = existing.status_kondisi;
              mapped.statusPemantauan = existing.statusPemantauan;
              mapped.status_pemantauan = existing.status_pemantauan;
              mapped.statusPerawatan = existing.statusPerawatan;
              if (existing.tanggalPulang) mapped.tanggalPulang = existing.tanggalPulang;
              if (existing.keteranganPulang) mapped.keteranganPulang = existing.keteranganPulang;
              if (existing.isPenolakanJaminanJR) {
                mapped.isPenolakanJaminanJR = true;
                mapped.tanggalPenolakanJaminan = existing.tanggalPenolakanJaminan;
                mapped.keteranganPenolakanJaminan = existing.keteranganPenolakanJaminan;
              }
            } else if (existing.isReactivated && !hasMdStatus) {
              mapped.isReactivated = true;
              mapped.kondisiTerakhir = existing.kondisiTerakhir || 'Rawat Inap';
              mapped.status_kondisi = existing.status_kondisi || 'Rawat Inap';
              mapped.statusPerawatan = existing.statusPerawatan || 'Rawat Lanjutan';
              mapped.statusPemantauan = MONITORING_STATUS.BELUM_DIPANTAU;
              mapped.status_pemantauan = MONITORING_STATUS.BELUM_DIPANTAU;
              if (existing.tanggalPulangSebelumnya) mapped.tanggalPulangSebelumnya = existing.tanggalPulangSebelumnya;
            } else if (existing.tanggalPulang && !mapped.tanggalPulang) {
              mapped.tanggalPulang = existing.tanggalPulang;
            }
          }
        });

        // Hanya gunakan data riil dari backend MySQL (tanpa data mock/dummy dan tanpa data yang sudah dihapus)
        const deletedIds = this.getDeletedVictimIds();
        const validMapped = mappedVictims.filter((v) => {
          if (isDummyVictim(v)) return false;
          if (deletedIds.has(String(v.id))) return false;
          if (deletedIds.has(String(v.caseId))) return false;
          if (deletedIds.has(String(v.nomorTiket))) return false;
          const vNik = String(v.nik || '').replace(/\D/g, '');
          if (vNik && deletedIds.has(vNik)) return false;
          if (Array.isArray(v.secondaryIds) && v.secondaryIds.some((sid) => deletedIds.has(String(sid)))) return false;
          return true;
        });

        const currentUser = this.getCurrentUser();
        const isPetugas = currentUser?.role === 'petugas';

        let targetVictimList = validMapped;
        if (isPetugas) {
          // Petugas hanya menerima subset kasus dari GET /api/cases sesuai penugasannya.
          // Gabungkan dengan data kasus lainnya agar riwayat episode sebelumnya (NIK sama) tetap terbawa!
          const existingList = this.getVictims();
          const validNiks = new Set(
            validMapped
              .map((mv) => String(mv.nik || '').replace(/\D/g, ''))
              .filter((n) => n.length >= 6)
          );
          const mergedMap = new Map();
          existingList.forEach((ev) => {
            const hasBackendId = Boolean(ev.caseId || (typeof ev.id === 'number') || /^\d+$/.test(String(ev.id || '')));
            const evNik = String(ev.nik || '').replace(/\D/g, '');
            const matchesCurrentOfficerNik = evNik.length >= 6 && validNiks.has(evNik);
            const isReferredArchive = Boolean(
              ev.statusPerawatan === 'Rujukan' ||
              (Array.isArray(ev.riwayatRujukan) && ev.riwayatRujukan.length > 0) ||
              (ev.rumahSakitAsal && ev.rumahSakitTujuan && ev.rumahSakitAsal !== ev.rumahSakitTujuan)
            );
            // Buang cache kasus backend yang sudah tidak ditugaskan ke petugas ini (kecuali arsip rujukan atau NIK yang sama dengan kasus petugas ini)
            if (hasBackendId && !isReferredArchive && !matchesCurrentOfficerNik) return;
            const key = String(ev.id || ev.caseId);
            mergedMap.set(key, ev);
          });
          validMapped.forEach((mv) => {
            const key = String(mv.id || mv.caseId);
            const prevMerged = mergedMap.get(key);
            if (prevMerged && (
              prevMerged.isRawatLanjutan ||
              prevMerged.rawatLanjutanDariPulang ||
              (Array.isArray(prevMerged.secondaryIds) && prevMerged.secondaryIds.length > 1) ||
              (Array.isArray(prevMerged.careEpisodes) && prevMerged.careEpisodes.length > 1)
            )) {
              const mvActIds = new Set((mv.riwayatAktivitas || []).map((a) => a.id || a.visitId).filter(Boolean));
              const extraEarlierActs = (prevMerged.riwayatAktivitas || []).filter((a) => {
                const aid = a?.id || a?.visitId;
                return aid && !mvActIds.has(aid);
              });
              mv.riwayatAktivitas = [...(mv.riwayatAktivitas || []), ...extraEarlierActs];
              mv.secondaryIds = Array.from(new Set([...(prevMerged.secondaryIds || []), ...(mv.secondaryIds || []), key]));
              if (prevMerged.rumahSakitAsal && !mv.rumahSakitAsal) mv.rumahSakitAsal = prevMerged.rumahSakitAsal;
              if (prevMerged.tanggalMasukAwal) mv.tanggalMasukAwal = prevMerged.tanggalMasukAwal;
              if (prevMerged.tanggalPulangSebelumnya) mv.tanggalPulangSebelumnya = prevMerged.tanggalPulangSebelumnya;
              if (prevMerged.catatanRawatLanjutan) mv.catatanRawatLanjutan = prevMerged.catatanRawatLanjutan;
              if (prevMerged.isRawatLanjutan) mv.isRawatLanjutan = true;
              if (prevMerged.rawatLanjutanDariPulang) mv.rawatLanjutanDariPulang = true;
              if (prevMerged.isReactivated) mv.isReactivated = true;
              if (prevMerged.statusPerawatan === 'Rawat Lanjutan') mv.statusPerawatan = 'Rawat Lanjutan';
            }
            mergedMap.set(key, mv);
          });
          targetVictimList = Array.from(mergedMap.values());
        }

        const cleanMergedVictims = linkAndDeduplicateVictims(targetVictimList).filter((v) => {
          if (deletedIds.has(String(v.id))) return false;
          if (deletedIds.has(String(v.caseId))) return false;
          if (deletedIds.has(String(v.nomorTiket))) return false;
          const vNik = String(v.nik || '').replace(/\D/g, '');
          if (vNik && deletedIds.has(vNik)) return false;
          if (Array.isArray(v.secondaryIds) && v.secondaryIds.some((sid) => deletedIds.has(String(sid)))) return false;
          return true;
        });

        lastSyncTimestamp = Date.now();
        const currentRaw = safeGetItem(STORAGE_KEY_VICTIMS);
        const newJson = JSON.stringify(cleanMergedVictims);

        if (currentRaw !== newJson) {
          safeSetItem(STORAGE_KEY_VICTIMS, newJson);
          if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new Event('jr_victims_updated'));
          }
        }

        return cleanMergedVictims;
      }
    } catch (err) {
      console.warn('[storageService] Backend sync (server offline / belum jalan):', err.message);
    } finally {
      isSyncing = false;
    }

    return this.getVictims();
  },

  /**
   * Mengambil detail kasus + visits dari backend secara langsung
   */
  async fetchVictimDetail(id) {
    try {
      // Selalu sinkronkan dengan backend agar seluruh riwayat kasus multi-episode dan visits korban lengkap
      await this.syncWithBackend();
      return this.getVictimById(id);
    } catch (err) {
      console.warn('[storageService] Gagal fetch detail dari backend:', err.message);
    }
    return this.getVictimById(id);
  },

  /**
   * Mengambil daftar ID kasus yang telah dihapus petugas (tombstone)
   */
  getDeletedVictimIds() {
    try {
      const raw = safeGetItem(STORAGE_KEY_DELETED_VICTIM_IDS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed.map(String));
      }
    } catch (_) { }
    return new Set();
  },

  /**
   * Get all victims (termasuk kasus live dari backend)
   */
  getVictims() {
    // Sinkronkan otomatis ke backend secara teratur (cooldown 30 detik untuk mencegah lagging & loop)
    if (typeof window !== 'undefined' && Date.now() - lastSyncTimestamp > 30000 && !isSyncing) {
      this.syncWithBackend().catch(() => { });
    }

    try {
      const data = safeGetItem(STORAGE_KEY_VICTIMS);
      if (data) {
        let parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Sanitasi foto: Jangan biarkan data: URL lama menimpa foto bukti resmi dari backend
          parsed.forEach((v) => {
            if (v.kunjunganPertama?.foto_bukti_url && v.kunjunganPertama.fotoUrl?.startsWith('data:')) {
              v.kunjunganPertama.fotoUrl = v.kunjunganPertama.foto_bukti_url;
            }
            if (Array.isArray(v.riwayatAktivitas)) {
              v.riwayatAktivitas.forEach((act) => {
                if (act.foto_bukti_url && act.fotoUrl?.startsWith('data:')) {
                  act.fotoUrl = act.foto_bukti_url;
                }
              });
            }
            if (Array.isArray(v.riwayatKunjungan)) {
              v.riwayatKunjungan.forEach((vk) => {
                if (vk.foto_bukti_url && vk.fotoUrl?.startsWith('data:')) {
                  vk.fotoUrl = vk.foto_bukti_url;
                }
              });
            }
          });

          const deletedIds = this.getDeletedVictimIds();
          const cleaned = parsed.filter((v) => {
            if (isDummyVictim(v)) return false;
            if (deletedIds.has(String(v.id))) return false;
            if (deletedIds.has(String(v.caseId))) return false;
            if (deletedIds.has(String(v.nomorTiket))) return false;
            if (Array.isArray(v.secondaryIds) && v.secondaryIds.some((sid) => deletedIds.has(String(sid)))) return false;
            return true;
          });
          if (cleaned.length !== parsed.length) {
            safeSetItem(STORAGE_KEY_VICTIMS, JSON.stringify(cleaned));
          }
          return linkAndDeduplicateVictims(cleaned.map(normalizeVictim)).filter((v) => {
            if (deletedIds.has(String(v.id))) return false;
            if (deletedIds.has(String(v.caseId))) return false;
            if (deletedIds.has(String(v.nomorTiket))) return false;
            if (Array.isArray(v.secondaryIds) && v.secondaryIds.some((sid) => deletedIds.has(String(sid)))) return false;
            return true;
          });
        }
      }
    } catch (e) {
      console.error('[storageService] Error parsing victims from storage:', e);
    }

    safeSetItem(STORAGE_KEY_VICTIMS, JSON.stringify([]));
    return [];
  },

  /**
   * Save all victims
   */
  saveVictims(victims) {
    try {
      const deletedIds = this.getDeletedVictimIds();
      const cleaned = (victims || []).filter((v) => {
        if (isDummyVictim(v)) return false;
        if (deletedIds.has(String(v.id))) return false;
        if (deletedIds.has(String(v.caseId))) return false;
        if (deletedIds.has(String(v.nomorTiket))) return false;
        if (Array.isArray(v.secondaryIds) && v.secondaryIds.some((sid) => deletedIds.has(String(sid)))) return false;
        return true;
      });
      const deduplicated = linkAndDeduplicateVictims(cleaned).filter((v) => {
        if (deletedIds.has(String(v.id))) return false;
        if (deletedIds.has(String(v.caseId))) return false;
        if (deletedIds.has(String(v.nomorTiket))) return false;
        if (Array.isArray(v.secondaryIds) && v.secondaryIds.some((sid) => deletedIds.has(String(sid)))) return false;
        return true;
      });
      safeSetItem(STORAGE_KEY_VICTIMS, JSON.stringify(deduplicated));
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('jr_victims_updated'));
      }
      return true;
    } catch (e) {
      console.error('[storageService] Error saving victims:', e);
      return false;
    }
  },

  /**
   * Simpan atau perbarui data satu korban ke localStorage
   */
  saveVictim(victim) {
    if (!victim || !victim.id) return null;
    const deletedIds = this.getDeletedVictimIds();
    if (deletedIds.has(String(victim.id)) || deletedIds.has(String(victim.caseId)) || deletedIds.has(String(victim.nomorTiket))) {
      return null;
    }
    try {
      const victims = this.getVictims();
      const idx = victims.findIndex(
        (v) =>
          String(v.id) === String(victim.id) ||
          (v.nomorTiket && victim.nomorTiket && v.nomorTiket === victim.nomorTiket) ||
          (v.caseId && victim.caseId && String(v.caseId) === String(victim.caseId))
      );
      let updatedVictims;
      if (idx !== -1) {
        updatedVictims = [...victims];
        updatedVictims[idx] = { ...updatedVictims[idx], ...victim };
      } else {
        updatedVictims = [victim, ...victims];
      }
      this.saveVictims(updatedVictims);
      return victim;
    } catch (e) {
      console.error('[storageService] Error in saveVictim:', e);
      return null;
    }
  },

  /**
   * Get victim by ID (bisa berupa ID numerik, nomor tiket JR-XXXXXX, atau secondaryIds)
   */
  getVictimById(id) {
    if (!id) return null;
    const deletedIds = this.getDeletedVictimIds();
    if (deletedIds.has(String(id))) return null;

    const victims = this.getVictims();
    const found = victims.find(
      (v) =>
        String(v.id) === String(id) ||
        v.nomorTiket === id ||
        String(v.caseId) === String(id) ||
        (Array.isArray(v.secondaryIds) && v.secondaryIds.map(String).includes(String(id)))
    );
    return found ? normalizeVictim(found) : null;
  },

  /**
   * Hapus korban dari sistem pemantauan (dilakukan dari dalam halaman detail korban)
   */
  deleteVictim(id, victimObj = null) {
    if (!id) return false;
    try {
      const victims = this.getVictims();
      const idStr = String(id).trim();

      const target = victimObj || victims.find(
        (v) =>
          String(v.id) === idStr ||
          v.nomorTiket === idStr ||
          String(v.caseId) === idStr ||
          (Array.isArray(v.secondaryIds) && v.secondaryIds.map(String).includes(idStr))
      );

      const idsToDelete = new Set([idStr]);
      const nicsToDelete = new Set();

      if (target) {
        if (target.id) idsToDelete.add(String(target.id));
        if (target.caseId) idsToDelete.add(String(target.caseId));
        if (target.nomorTiket) idsToDelete.add(String(target.nomorTiket));
        if (Array.isArray(target.secondaryIds)) {
          target.secondaryIds.forEach((sid) => idsToDelete.add(String(sid)));
        }
        if (target.nik) {
          const cleanNik = String(target.nik).replace(/\D/g, '');
          if (cleanNik.length >= 6) {
            nicsToDelete.add(cleanNik);
            idsToDelete.add(cleanNik);
            idsToDelete.add(String(target.nik));
          }
        }
      }

      // Kumpulkan juga seluruh ID dari kasus lain yang ber-NIK sama
      victims.forEach((v) => {
        const vNik = String(v.nik || '').replace(/\D/g, '');
        if ((vNik && nicsToDelete.has(vNik)) || (v.id && idsToDelete.has(String(v.id))) || (v.caseId && idsToDelete.has(String(v.caseId)))) {
          if (v.id) idsToDelete.add(String(v.id));
          if (v.caseId) idsToDelete.add(String(v.caseId));
          if (v.nomorTiket) idsToDelete.add(String(v.nomorTiket));
          if (Array.isArray(v.secondaryIds)) {
            v.secondaryIds.forEach((sid) => idsToDelete.add(String(sid)));
          }
        }
      });

      // Catat ke daftar tombstone permanen agar tidak di-restore saat sync backend
      const deletedSet = this.getDeletedVictimIds();
      idsToDelete.forEach((delId) => deletedSet.add(delId));
      safeSetItem(STORAGE_KEY_DELETED_VICTIM_IDS, JSON.stringify(Array.from(deletedSet)));

      // Buang dari penyimpanan aktif
      const updated = victims.filter((v) => {
        if (idsToDelete.has(String(v.id))) return false;
        if (idsToDelete.has(String(v.caseId))) return false;
        if (idsToDelete.has(String(v.nomorTiket))) return false;
        const vNik = String(v.nik || '').replace(/\D/g, '');
        if (vNik && nicsToDelete.has(vNik)) return false;
        if (Array.isArray(v.secondaryIds) && v.secondaryIds.some((sid) => idsToDelete.has(String(sid)))) return false;
        return true;
      });

      this.saveVictims(updated);
      return true;
    } catch (e) {
      console.error('[storageService] Error deleting victim:', e);
      return false;
    }
  },

  /**
   * Fungsi kanonikal tunggal untuk menentukan apakah seorang petugas menangani / bertanggung jawab atas seorang korban.
   * Digunakan serentak di Direktori Petugas, Detail Petugas, Kinerja Petugas, Dashboard, Daftar Korban, dan Monitoring.
   */
  isOfficerAssignedToVictim(officerIdentifier, victim, allOfficersList = null) {
    if (!officerIdentifier || !victim) return false;

    const allOfficers = allOfficersList || this.getOfficers();
    let officer = null;

    if (typeof officerIdentifier === 'object' && officerIdentifier !== null) {
      officer = officerIdentifier;
    } else {
      const idStr = String(officerIdentifier).trim();
      const numStr = idStr.replace(/\D/g, '');
      officer = allOfficers.find((o) => {
        if (String(o.id) === idStr) return true;
        if (o.backendOfficerId && String(o.backendOfficerId) === idStr) return true;
        if (o.backendId && String(o.backendId) === idStr) return true;
        if (numStr) {
          const oNum = String(o.id || '').replace(/\D/g, '');
          if (oNum && parseInt(oNum, 10) === parseInt(numStr, 10)) return true;
          const oBackNum = String(o.backendOfficerId || o.backendId || '').replace(/\D/g, '');
          if (oBackNum && parseInt(oBackNum, 10) === parseInt(numStr, 10)) return true;
        }
        if (o.nama && o.nama.trim().toLowerCase() === idStr.toLowerCase()) return true;
        if (o.username && o.username.trim().toLowerCase() === idStr.toLowerCase()) return true;
        return false;
      }) || { id: idStr, nama: idStr };
    }

    const offId = String(officer.id || '');
    const offNum = offId.replace(/\D/g, '');
    const offBackendId = String(officer.backendOfficerId || officer.backendId || '');
    const offName = (officer.nama || '').trim().toLowerCase();
    const offUsername = (officer.username || '').trim().toLowerCase();

    // Ambil daftar seluruh RS yang ditugaskan kepada petugas ini
    const offHospitals = (
      Array.isArray(officer.plottingRs) && officer.plottingRs.length > 0
        ? officer.plottingRs
        : Array.isArray(officer.hospitals)
          ? officer.hospitals.map((h) => h.nama_rs)
          : []
    ).map((rs) => (rs || '').toLowerCase().trim()).filter(Boolean);

    const vRs = (victim.rumahSakit || '').toLowerCase().trim();
    const vOriginRs = (victim.rumahSakitAsal || '').toLowerCase().trim();
    const vDestRs = (victim.rumahSakitTujuan || '').toLowerCase().trim();

    const matchesHosp = (hTarget) => {
      if (!hTarget) return false;
      return offHospitals.some((h) => h === hTarget || (hTarget.length >= 4 && (h.includes(hTarget) || hTarget.includes(h))));
    };

    // 1. Pencocokan ID Petugas Penanggung Jawab Langsung (Prioritas Tertinggi)
    const vPId = String(victim.petugasId || '');
    const vPNum = vPId.replace(/\D/g, '');
    const vPBackendId = String(victim.backendOfficerId || '');
    if (vPId && offId && vPId === offId) return true;
    if (offBackendId && vPBackendId && offBackendId === vPBackendId) return true;
    if (offBackendId && vPId && offBackendId === vPId) return true;
    if (offId && vPBackendId && offId === vPBackendId) return true;
    if (vPNum && offNum && parseInt(vPNum, 10) === parseInt(offNum, 10)) return true;

    // 2. Pencocokan Nama Petugas Penanggung Jawab Langsung
    if (victim.namaPetugas && (offName || offUsername)) {
      const vNama = String(victim.namaPetugas).trim().toLowerCase();
      if (offName && vNama === offName) return true;
      if (offUsername && vNama === offUsername) return true;
    }

    // 3. Pencocokan Penugasan Rujukan Masuk (Hanya Petugas Tujuan yang memegang saat ini)
    const vTujuanId = String(victim.petugasTujuanId || '');
    if (vTujuanId && offId && vTujuanId === offId) return true;
    if (victim.petugasTujuanNama && offName && String(victim.petugasTujuanNama).trim().toLowerCase() === offName) return true;

    // 4. Pencocokan Berdasarkan Plotting Rumah Sakit Petugas
    if (offHospitals.length > 0) {
      if (matchesHosp(vRs)) {
        // Jika korban belum ada penugasan atau petugas kosong
        if (!victim.petugasId || victim.namaPetugas === 'Belum Ada Petugas Penanggung Jawab' || victim.namaPetugas === 'Belum Ditugaskan') {
          return true;
        }
        // Jika petugas yang saat ini tercatat di data korban ternyata TIDAK memegang RS ini (misal Petugas 3 di RS Syafira)
        const currentOfficer = allOfficers.find((o) => o.id === victim.petugasId || o.nama === victim.namaPetugas);
        const currentOfficerHoldsRs = currentOfficer && Array.isArray(currentOfficer.plottingRs) && currentOfficer.plottingRs.some((rs) => {
          const clean = (rs || '').toLowerCase().trim();
          return clean === vRs || (vRs.length >= 4 && (clean.includes(vRs) || vRs.includes(clean)));
        });
        if (!currentOfficerHoldsRs) {
          return true;
        }
        // Jika ditugaskan ke petugas non-aktif
        const assignedOfficer = allOfficers.find((o) => o.id === victim.petugasId || o.nama === victim.namaPetugas);
        if (assignedOfficer && assignedOfficer.status === 'Nonaktif') {
          return true;
        }
      }
    }

    return false;
  },

  /**
   * Mengambil semua korban yang ditangani oleh seorang petugas menggunakan logika kanonikal tunggal.
   */
  getVictimsByOfficer(officerIdentifier) {
    const all = this.getVictims();
    const allOfficers = this.getOfficers();
    return all.filter((v) => this.isOfficerAssignedToVictim(officerIdentifier, v, allOfficers));
  },

  /**
   * Menentukan peran hubungan petugas terhadap korban:
   * - 'CURRENT_HOLDER': Petugas yang saat ini bertanggung jawab aktif memantau korban di RS saat ini (atau rujukan masuk ke RS petugas ini)
   * - 'ORIGIN_OFFICER': Petugas RS asal yang pernah menangani korban sebelum dirujuk ke RS lain (arsip riwayat read-only)
   * - 'NONE': Tidak memiliki keterkaitan dengan korban ini
   */
  getOfficerVictimRole(officerIdentifier, victim) {
    if (!victim || !officerIdentifier) return 'NONE';

    const allOfficers = this.getOfficers();
    let officer = officerIdentifier;
    if (typeof officerIdentifier === 'string' || typeof officerIdentifier === 'number') {
      const idStr = String(officerIdentifier).trim();
      officer = allOfficers.find((o) => {
        if (String(o.id) === idStr) return true;
        if (o.backendOfficerId && String(o.backendOfficerId) === idStr) return true;
        if (o.backendId && String(o.backendId) === idStr) return true;
        if (o.nama && o.nama.trim().toLowerCase() === idStr.toLowerCase()) return true;
        if (o.username && o.username.trim().toLowerCase() === idStr.toLowerCase()) return true;
        return false;
      }) || { id: idStr, nama: idStr };
    }

    const offId = String(officer.id || '');
    const offNum = offId.replace(/\D/g, '');
    const offBackendId = String(officer.backendOfficerId || officer.backendId || '');
    const offName = (officer.nama || '').trim().toLowerCase();
    const offHospitals = (
      Array.isArray(officer.plottingRs) && officer.plottingRs.length > 0
        ? officer.plottingRs
        : Array.isArray(officer.hospitals)
          ? officer.hospitals.map((h) => h.nama_rs)
          : []
    ).map((rs) => (rs || '').toLowerCase().trim()).filter(Boolean);

    const matchesHosp = (hTarget) => {
      if (!hTarget) return false;
      const targetClean = (hTarget || '').toLowerCase().trim();
      return offHospitals.some((h) => h === targetClean || (targetClean.length >= 4 && (h.includes(targetClean) || targetClean.includes(h))));
    };

    const vCurrentRs = (victim.rumahSakit || '').toLowerCase().trim();
    const vOriginRs = (victim.rumahSakitAsal || '').toLowerCase().trim();
    const vTargetRs = (victim.rumahSakitTujuan || '').toLowerCase().trim();

    // 1. Cek apakah petugas adalah pemegang saat ini (penugasan langsung atau plotting RS)
    const isDirectlyAssigned = Boolean(
      (offId && victim.petugasId && String(victim.petugasId) === offId) ||
      (offBackendId && victim.backendOfficerId && String(victim.backendOfficerId) === offBackendId) ||
      (offNum && victim.petugasId && String(victim.petugasId).replace(/\D/g, '') === offNum) ||
      (offName && victim.namaPetugas && victim.namaPetugas.toLowerCase().trim() === offName) ||
      (offId && victim.petugasTujuanId && String(victim.petugasTujuanId) === offId)
    );

    const isHospitalMatched = offHospitals.length > 0 && (
      matchesHosp(vCurrentRs) ||
      (vTargetRs && matchesHosp(vTargetRs) && (victim.isRujukanMasuk || victim.petugasTujuanId === offId))
    );

    const isCurrent = isDirectlyAssigned || isHospitalMatched;

    if (isCurrent) return 'CURRENT_HOLDER';

    // 2. Cek apakah petugas adalah petugas RS asal yang pernah menangani sebelum rujukan
    const isOrigin = (
      (offHospitals.length > 0 && vOriginRs && matchesHosp(vOriginRs) && vCurrentRs && !matchesHosp(vCurrentRs)) ||
      (victim.petugasAsalId && String(victim.petugasAsalId) === offId) ||
      (victim.petugasAsalNama && victim.petugasAsalNama.toLowerCase().trim() === offName) ||
      (offNum && victim.petugasAsalId && String(victim.petugasAsalId).replace(/\D/g, '') === offNum) ||
      (Array.isArray(victim.riwayatRujukan) && victim.riwayatRujukan.some((r) =>
        String(r.petugasAsalId) === offId ||
        (offBackendId && String(r.petugasAsalId) === offBackendId) ||
        (offNum && r.petugasAsalId && String(r.petugasAsalId).replace(/\D/g, '') === offNum) ||
        (vOriginRs && matchesHosp(r.dariRs))
      )) ||
      (Array.isArray(victim.riwayatAktivitas) && victim.riwayatAktivitas.some((a) =>
        (a.petugasId && (String(a.petugasId) === offId || (offBackendId && String(a.petugasId) === offBackendId))) ||
        (a.rumahSakit && matchesHosp(a.rumahSakit))
      ))
    );

    if (isOrigin) return 'ORIGIN_OFFICER';

    return 'NONE';
  },

  /**
   * Cek apakah petugas berhak mengakses detail korban (baik sebagai pemegang saat ini maupun petugas asal)
   */
  canOfficerAccessVictim(officerIdentifier, victim) {
    const role = this.getOfficerVictimRole(officerIdentifier, victim);
    return role === 'CURRENT_HOLDER' || role === 'ORIGIN_OFFICER';
  },

  /**
   * Mengambil seluruh portofolio korban untuk Portal Data Korban Petugas
   * (Termasuk korban yang sedang ditangani, korban rujukan masuk, dan korban yang telah dirujuk keluar)
   */
  getOfficerVictimsForPortal(officerIdentifier) {
    const all = this.getVictims();
    return all.filter((v) => this.canOfficerAccessVictim(officerIdentifier, v));
  },

  /**
   * Check for potential duplicates before creating new victim
   * Mendukung identifikasi cerdas:
   * 1. Pasien sudah pulang -> rawat lanjutan di RS yang sama
   * 2. Pasien sudah pulang -> rawat lanjutan di RS berbeda
   * 3. Pasien dirujuk ke RS berbeda (masih dirawat)
   */
  checkPotentialDuplicates({ nik, nama, rumahSakit, tanggalKecelakaan }) {
    const victims = this.getVictims();
    const cleanNik = (nik || '').trim();
    const cleanNama = (nama || '').toLowerCase().trim();
    const targetRs = (rumahSakit || '').trim().toLowerCase();

    const matched = victims.filter((v) => {
      if (cleanNik && cleanNik.length >= 6 && v.nik && v.nik.trim() === cleanNik) {
        return true;
      }
      if (cleanNama && cleanNama.length >= 3 && v.nama) {
        const vNama = v.nama.toLowerCase().trim();
        const isNameMatch = vNama === cleanNama;
        if (isNameMatch) {
          if (targetRs && v.rumahSakit && v.rumahSakit.toLowerCase() === targetRs) {
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

    return matched.map((v) => {
      const vRs = (v.rumahSakit || '').trim().toLowerCase();
      const isSameHospital = targetRs ? (vRs === targetRs) : true;
      const isDischarged =
        v.statusPemantauan === MONITORING_STATUS.SELESAI_PULANG ||
        v.kondisiTerakhir === 'Sudah Pulang' ||
        v.kondisiTerakhir === 'Pulang' ||
        v.kondisiTerakhir === 'Selesai';
      const isReferred = v.kondisiTerakhir === 'Dirujuk';
      const cleanDigits = cleanNik.replace(/\D/g, '');
      const vNikDigits = String(v.nik || '').replace(/\D/g, '');
      const exactNikMatch = Boolean(cleanDigits.length === 16 && vNikDigits === cleanDigits);

      let detectedCondition = 'KASUS_SERUPA';
      let conditionLabel = 'Kasus Pasien Serupa';
      let visualBadge = 'Pasien Memiliki Riwayat Kasus Sebelumnya';
      let transitionType = 'RAWAT_PERTAMA';

      if (isDischarged && isSameHospital) {
        detectedCondition = 'RAWAT_LANJUTAN_RS_SAMA';
        conditionLabel = 'Kemungkinan Rawat Lanjutan di RS yang Sama';
        visualBadge = 'Kemungkinan Rawat Lanjutan (RS Sama)';
        transitionType = 'RAWAT_LANJUTAN';
      } else if (isDischarged && !isSameHospital) {
        detectedCondition = 'RAWAT_LANJUTAN_RS_BEDA';
        conditionLabel = 'Kemungkinan Rawat Lanjutan di RS Berbeda';
        visualBadge = 'Kemungkinan Rawat Lanjutan (RS Berbeda)';
        transitionType = 'RAWAT_LANJUTAN';
      } else if (!isDischarged && !isSameHospital) {
        detectedCondition = 'KEMUNGKINAN_RUJUKAN';
        conditionLabel = 'Kemungkinan Pasien Dirujuk ke RS Berbeda';
        visualBadge = 'Kemungkinan Rujukan';
        transitionType = 'RUJUKAN';
      } else {
        detectedCondition = 'KASUS_SERUPA';
        conditionLabel = 'Pasien Memiliki Riwayat Kasus Sebelumnya';
        visualBadge = 'Pasien Memiliki Riwayat Kasus Sebelumnya';
        transitionType = isReferred ? 'RUJUKAN' : 'RAWAT_PERTAMA';
      }

      return {
        ...v,
        exactNikMatch,
        detectedCondition,
        conditionLabel,
        visualBadge,
        transitionType,
        isSameHospital,
        isDischarged,
        isReferred,
        targetHospital: rumahSakit || v.rumahSakit,
        previousHospital: v.rumahSakit,
        previousStatus: v.kondisiTerakhir || 'Rawat Inap',
        previousAdmissionDate: v.tanggalMasukRs || v.tanggalInformasiDiterima,
        previousCaseId: v.nomorTiket || v.nomorLaporan || v.id,
        previousLp: v.nomorTiket || v.nomorLaporan || '—'
      };
    });
  },

  /**
   * Helper untuk mengambil data master rumah sakit aktif dari backend / cache
   */
  async getOrFetchHospitals() {
    let live = [];
    try {
      live = await api.getHospitals(true);
    } catch (_) { }

    const canonicalMap = new Map();
    (INITIAL_HOSPITALS || []).forEach((hName, idx) => {
      const key = hName.toLowerCase().replace(/[\s\-_.]+/g, '');
      canonicalMap.set(key, {
        id: idx + 1,
        nama_rs: hName,
        alamat: 'Provinsi Riau',
        latitude: 0.5071,
        longitude: 101.4478,
        radius_meter: 200
      });
    });

    if (Array.isArray(live) && live.length > 0) {
      live.forEach((bh) => {
        if (!bh.nama_rs) return;
        const key = bh.nama_rs.toLowerCase().replace(/[\s\-_.]+/g, '');
        if (canonicalMap.has(key)) {
          const existing = canonicalMap.get(key);
          canonicalMap.set(key, {
            ...existing,
            id: bh.id || existing.id,
            alamat: bh.alamat && bh.alamat !== 'Provinsi Riau' ? bh.alamat : existing.alamat,
            latitude: bh.latitude || existing.latitude,
            longitude: bh.longitude || existing.longitude,
            radius_meter: bh.radius_meter || existing.radius_meter
          });
        } else {
          canonicalMap.set(key, {
            id: bh.id,
            nama_rs: bh.nama_rs,
            alamat: bh.alamat || 'Provinsi Riau',
            latitude: bh.latitude || 0.5071,
            longitude: bh.longitude || 101.4478,
            radius_meter: bh.radius_meter || 200
          });
        }
      });
    }

    const merged = Array.from(canonicalMap.values());
    safeSetItem('jr_monitoring_hospitals_v1', JSON.stringify(merged));
    return merged;
  },

  /**
   * Add a new unique victim record
   */
  async addVictim(victimData, initialVisitData = null) {
    // 1. Coba simpan ke Backend MySQL (POST /api/cases) jika backend aktif
    try {
      const hospitals = await this.getOrFetchHospitals();
      const caseRs = (victimData.rumahSakit || '').trim().toLowerCase();
      const matchedHospital = hospitals.find(
        (h) => h.nama_rs.toLowerCase() === caseRs ||
          (caseRs.length >= 4 && (h.nama_rs.toLowerCase().includes(caseRs) || caseRs.includes(h.nama_rs.toLowerCase())))
      );

      if (matchedHospital) {
        const cleanNik = victimData.nik && /^\d{16}$/.test(String(victimData.nik).trim()) ? String(victimData.nik).trim() : null;
        const cleanUmur = victimData.usia && Number.isInteger(Number(victimData.usia)) && Number(victimData.usia) >= 0 ? Number(victimData.usia) : null;
        const cleanJenisKelamin = ['Laki-laki', 'Perempuan'].includes(victimData.jenisKelamin) ? victimData.jenisKelamin : null;
        const cleanJenisLaka = ['Tunggal', 'Tidak Tunggal', 'Belum Diketahui'].includes(victimData.jenisLaka) ? victimData.jenisLaka : 'Belum Diketahui';
        const cleanStatusKondisi = normalizeStatusToBackend(victimData.kondisiTerakhir || 'Rawat Inap');

        const casePayload = {
          hospital_id: matchedHospital.id,
          nama_korban: String(victimData.nama || '').trim(),
          nomor_laporan: victimData.nomorLaporan || victimData.nomor_laporan || null,
          ruangan_rs: victimData.ruangan || victimData.ruangan_rs || 'Rawat Inap',
          nik: cleanNik,
          umur: cleanUmur,
          jenis_kelamin: cleanJenisKelamin,
          alamat: victimData.alamat && victimData.alamat !== '—' ? victimData.alamat : null,
          telepon_korban: victimData.telepon && victimData.telepon !== '—' ? victimData.telepon : null,
          tgl_laka: victimData.tanggalKecelakaan || victimData.tgl_laka || null,
          tgl_masuk: victimData.tanggalMasukRs || victimData.tgl_masuk || null,
          kronologi: victimData.keteranganTambahan || victimData.lokasiKejadian || victimData.kronologi || null,
          jenis_laka: cleanJenisLaka,
          status_kondisi: cleanStatusKondisi,
          status_keterjaminan: victimData.status_keterjaminan || victimData.statusKeterjaminan || (cleanJenisLaka === 'Tidak Tunggal' ? 'Terjamin JR' : 'Belum Dikonfirmasi'),
          no_gl: victimData.no_gl || victimData.noGl || null,
          tgl_gl: victimData.tgl_gl || victimData.tglGl || null
        };

        const res = await api.createCase(casePayload);
        if (res && res.case) {
          const caseId = res.case.id;

          // Jika ada initial visit data (catat kunjungan pertama sekaligus)
          if (initialVisitData && res.visit?.id) {
            try {
              let fotoFile = null;
              if (initialVisitData.fotoUrl && typeof initialVisitData.fotoUrl === 'string' && initialVisitData.fotoUrl.startsWith('data:')) {
                fotoFile = dataUrlToFile(initialVisitData.fotoUrl, `visit_${caseId}_${Date.now()}.jpg`);
              } else if (initialVisitData.fotoFile instanceof File) {
                fotoFile = initialVisitData.fotoFile;
              }

              const formData = new FormData();
              formData.append('case_id', String(caseId));
              formData.append('cek_komunikasi_keluarga', String(Boolean(initialVisitData.cek_komunikasi_keluarga || initialVisitData.komunikasiKeluarga)));
              formData.append('cek_edukasi_santunan', String(Boolean(initialVisitData.cek_edukasi_santunan || initialVisitData.penyampaianHak)));
              formData.append('cek_arahan_lp', String(Boolean(initialVisitData.cek_arahan_lp || initialVisitData.arahanLp)));
              formData.append('catatan_kondisi', initialVisitData.hasilKunjungan || initialVisitData.catatan_kondisi || '');
              formData.append('status_kondisi_terbaru', cleanStatusKondisi);
              formData.append('lat_petugas', String(initialVisitData.lat_petugas ?? initialVisitData.latitude ?? ''));
              formData.append('lng_petugas', String(initialVisitData.lng_petugas ?? initialVisitData.longitude ?? ''));
              if (fotoFile) {
                formData.append('foto_bukti', fotoFile);
              }

              await api.submitVisit(res.visit.id, formData);
            } catch (vErr) {
              console.warn('[storageService] Gagal submit initial visit ke backend:', vErr.message);
            }
          }

          // Segera ambil detail korban mutakhir dari backend
          const freshDetail = await this.fetchVictimDetail(caseId);
          if (freshDetail) {
            return freshDetail;
          }
        }
      }
    } catch (apiErr) {
      console.warn('[storageService] api.createCase gagal / offline, menggunakan penyimpanan lokal:', apiErr.message);
    }

    // 2. Fallback: Penyimpanan lokal jika backend offline
    const victims = this.getVictims();

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
    let kondisiTerakhir = victimData.kondisiTerakhir || 'Rawat Inap';
    let statusKonfirmasiKondisi = victimData.statusKonfirmasiKondisi || 'Belum Dikonfirmasi';

    // Cari penugasan petugas berdasarkan rumah sakit
    let finalPetugasId = victimData.petugasId;
    let finalNamaPetugas = victimData.namaPetugas;

    if (!finalPetugasId || finalNamaPetugas === 'Belum Ditugaskan' || finalNamaPetugas === 'Belum Ada Petugas Penanggung Jawab') {
      const officers = this.getOfficers();
      const matched = officers.find(
        (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some(
          (rs) => isHospitalNameMatch(rs, victimData.rumahSakit)
        )
      );
      if (matched) {
        finalPetugasId = matched.id;
        finalNamaPetugas = matched.nama;
      } else {
        finalPetugasId = null;
        finalNamaPetugas = 'Belum Ada Petugas Penanggung Jawab';
      }
    }

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
      petugasId: finalPetugasId,
      namaPetugas: finalNamaPetugas,
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

    if (initialVisitData) {
      const actId = `ACT-${Date.now().toString().slice(-6)}`;
      const visitDate = initialVisitData.tanggalKunjungan || nowIso;
      const initialVisit = {
        id: actId,
        victimId: newVictimId,
        jenisAktivitas: 'Kunjungan Pertama',
        tanggal: visitDate,
        tanggalKunjungan: visitDate,
        kondisiKorban: initialVisitData.kondisiKorban || 'Rawat Inap',
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

      if (['Rawat Inap', 'Masih Dirawat', 'Luka Berat', 'Luka Ringan', 'Dirujuk'].includes(newVictim.kondisiTerakhir)) {
        newVictim.statusPemantauan = 'Pemantauan Aktif';
        newVictim.jadwalPemantauanBerikutnya = new Date(new Date(visitDate).getTime() + 72 * 60 * 60 * 1000).toISOString();
      } else {
        newVictim.statusPemantauan = 'Selesai Dipantau';
      }

      newVictim.riwayatKunjungan = [initialVisit];
      newVictim.riwayatAktivitas = [initialVisit];
    }

    const updatedVictims = [newVictim, ...victims];
    this.saveVictims(updatedVictims);
    return newVictim;
  },

  /**
   * Submit kunjungan ke backend MySQL (POST /api/visits/:visitId/submit)
   * Menyimpan bukti kunjungan, validasi radius RS (Haversine), dan auto-penjadwalan SLA
   */
  async addVisit(victimId, visitData) {
    const victim = this.getVictimById(victimId);
    if (!victim) throw new Error('Data korban tidak ditemukan.');

    const isVictimFinished =
      victim.statusPemantauan === 'Selesai Dipantau' ||
      victim.statusPemantauan === 'Selesai' ||
      ['Sudah Pulang', 'Pulang', 'Selesai', 'Meninggal Dunia'].includes(victim.kondisiTerakhir) ||
      ['Sudah Pulang', 'Pulang', 'Selesai', 'Meninggal Dunia'].includes(victim.status_kondisi) ||
      Boolean(victim.tanggalMeninggal);
    if (isVictimFinished) {
      throw new Error('Status pemantauan korban ini sudah Selesai. Pencatatan kunjungan baru tidak diperbolehkan.');
    }

    // Jika kasus berasal dari backend atau memiliki caseId
    if (victim.isFromBackend || victim.caseId) {
      const caseId = victim.caseId || victim.id;
      let visitId = visitData.visitId || victim.activeVisitId;

      if (!visitId) {
        const detail = await api.getCaseById(caseId);
        const pending = detail?.visits?.find((vis) => vis.status_kunjungan === 'Menunggu');
        if (pending) {
          visitId = pending.id;
        }
      }

      if (!visitId) {
        throw new Error('Tidak ada jadwal kunjungan dengan status "Menunggu" untuk kasus ini.');
      }

      // Siapkan file foto bukti
      let fotoFile = null;
      if (visitData.fotoUrl && typeof visitData.fotoUrl === 'string' && visitData.fotoUrl.startsWith('data:')) {
        fotoFile = dataUrlToFile(visitData.fotoUrl, `visit_${caseId}_${Date.now()}.jpg`);
        cachePhoto(caseId, visitData.fotoUrl);
        cachePhoto(visitId, visitData.fotoUrl);
        cachePhoto(`VISIT-${visitId}`, visitData.fotoUrl);
        cachePhoto(victim.id, visitData.fotoUrl);
        if (fotoFile?.name) {
          cachePhoto(fotoFile.name, visitData.fotoUrl);
        }
      } else if (visitData.fotoFile instanceof File) {
        fotoFile = visitData.fotoFile;
      }

      const normalizedStatus = normalizeStatusToBackend(visitData.kondisiKorban);

      // Pastikan data status MD disimpan ke victim lokal sebelum memanggil backend
      if (visitData.kondisiKorban === 'Meninggal Dunia' || visitData.tanggalMeninggal || normalizedStatus === 'Meninggal Dunia') {
        victim.tanggalMeninggal = visitData.tanggalMeninggal || victim.tanggalMeninggal;
        victim.jamMeninggal = visitData.jamMeninggal || victim.jamMeninggal;
        victim.waktuMeninggal = visitData.waktuMeninggal || (victim.tanggalMeninggal && victim.jamMeninggal ? `${victim.tanggalMeninggal}T${victim.jamMeninggal}:00` : victim.waktuMeninggal);
        victim.dicatatOleh = visitData.dicatatOleh || visitData.petugasNama || victim.namaPetugas;
        victim.petugasPencatatId = visitData.petugasId || victim.petugasId;
        victim.waktuPencatatanMD = visitData.waktuPencatatanMD || new Date().toISOString();
        victim.kondisiTerakhir = 'Meninggal Dunia';
        victim.status_kondisi = 'Meninggal Dunia';
        victim.statusPemantauan = 'Selesai Dipantau';
        victim.statusPerawatan = 'Meninggal Dunia';
        victim.jadwalPemantauanBerikutnya = null;
        this.saveVictim(victim);
      }

      let catatanKondisi = visitData.hasilKunjungan || visitData.catatan || visitData.tindakLanjut || '';
      if ((normalizedStatus === 'Meninggal Dunia' || visitData.kondisiKorban === 'Meninggal Dunia') && (visitData.tanggalMeninggal || victim.tanggalMeninggal)) {
        const tglMD = visitData.tanggalMeninggal || victim.tanggalMeninggal;
        const jamMD = visitData.jamMeninggal || victim.jamMeninggal || '—';
        const picMD = visitData.petugasNama || victim.namaPetugas;
        catatanKondisi = `[MD] Tanggal: ${tglMD} | Jam: ${jamMD} | Dicatat Oleh: ${picMD}. ${catatanKondisi}`.trim();
      }

      // Siapkan FormData sesuai spesifikasi POST /api/visits/:visitId/submit backend
      const formData = new FormData();
      formData.append('case_id', String(caseId));
      formData.append('cek_komunikasi_keluarga', String(Boolean(visitData.komunikasiKeluarga || visitData.cek_komunikasi_keluarga)));
      formData.append('cek_edukasi_santunan', String(Boolean(visitData.penyampaianHak || visitData.cek_edukasi_santunan)));
      formData.append('cek_arahan_lp', String(Boolean(visitData.arahanLp || visitData.cek_arahan_lp)));
      formData.append('catatan_kondisi', catatanKondisi);
      formData.append('status_kondisi_terbaru', normalizedStatus);
      formData.append('lat_petugas', String(visitData.lat_petugas ?? visitData.latitude ?? '0.49968000'));
      formData.append('lng_petugas', String(visitData.lng_petugas ?? visitData.longitude ?? '101.45475000'));

      // Parameter rujukan jika korban dirujuk ke rumah sakit lain
      if (normalizedStatus === 'Dirujuk ke RS Lain') {
        const rujukanRsRaw = (visitData.rumahSakitRujukan || '').trim();
        const rujukanRsName = rujukanRsRaw.toLowerCase();
        const hospitals = await this.getOrFetchHospitals();
        const targetHospital =
          hospitals.find((h) => (typeof h === 'string' ? h : h?.nama_rs || '').toLowerCase() === rujukanRsName) ||
          hospitals.find((h) => isHospitalNameMatch(typeof h === 'string' ? h : h?.nama_rs || '', rujukanRsRaw));
        const rujukanHospitalId = visitData.rujukan_hospital_id || visitData.targetHospitalId || (targetHospital ? targetHospital.id : null);
        if (rujukanHospitalId) {
          formData.append('rujukan_hospital_id', String(rujukanHospitalId));
        }
        if (visitData.alasanRujukan || visitData.alasan_rujukan) {
          formData.append('alasan_rujukan', visitData.alasanRujukan || visitData.alasan_rujukan);
        }
        if (visitData.catatanRujukan || visitData.catatan_rujukan) {
          formData.append('catatan_rujukan', visitData.catatanRujukan || visitData.catatan_rujukan);
        }

        if (rujukanRsRaw) {
          const originHospital = victim.rumahSakit;
          const destHospital = targetHospital?.nama_rs || rujukanRsRaw;
          const officers = this.getOfficers();
          const matchedOfficer = officers.find(
            (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some(
              (rs) => isHospitalNameMatch(rs, destHospital)
            )
          );
          const statusDirujukTeks = `Dirujuk ke ${destHospital}`;
          victim.rumahSakitAsal = originHospital;
          victim.rumahSakitTujuan = destHospital;
          victim.rumahSakit = destHospital;
          victim.tanggalRujukan = new Date().toISOString();
          victim.petugasAsalId = victim.petugasId;
          victim.petugasAsalNama = victim.namaPetugas;
          if (matchedOfficer) {
            victim.petugasTujuanId = matchedOfficer.id;
            victim.petugasTujuanNama = matchedOfficer.nama;
            victim.petugasId = matchedOfficer.id;
            victim.namaPetugas = matchedOfficer.nama;
          }
          victim.kondisiTerakhir = statusDirujukTeks;
          victim.statusPerawatan = 'Rujukan';
          victim.statusRujukan = statusDirujukTeks;
          victim.statusPemantauan = statusDirujukTeks;
          victim.isRujukanMasuk = true;
          victim.rujukanAccepted = false;
          victim.riwayatRujukan = [
            ...(victim.riwayatRujukan || []),
            {
              id: `REF-${Date.now()}`,
              tanggal: victim.tanggalRujukan,
              dariRs: originHospital,
              keRs: destHospital,
              petugasAsalId: victim.petugasAsalId,
              petugasAsalNama: victim.petugasAsalNama,
              petugasTujuanId: victim.petugasTujuanId,
              petugasTujuanNama: victim.petugasTujuanNama,
              alasan: visitData.alasanRujukan || visitData.catatanRujukan || statusDirujukTeks,
              status: statusDirujukTeks
            }
          ];
          this.saveVictim(victim);
        }
      }

      if (fotoFile) {
        formData.append('foto_bukti', fotoFile);
      }

      // Kirim request ke backend Express
      const submitRes = await api.submitVisit(visitId, formData);

      // Perbarui data live dari backend
      const updated = await this.fetchVictimDetail(caseId);
      const targetToReturn = updated || victim;
      if (targetToReturn) {
        if (submitRes && typeof submitRes === 'object') {
          targetToReturn.last_submit_result = submitRes;
          targetToReturn.status_sla = submitRes.status_sla || targetToReturn.status_sla;
          targetToReturn.jarak_dari_rs_meter = submitRes.jarak_dari_rs_meter ?? targetToReturn.jarak_dari_rs_meter;
          targetToReturn.is_outside_hospital_radius = submitRes.is_outside_hospital_radius ?? targetToReturn.is_outside_hospital_radius;
          targetToReturn.verification_alert = submitRes.verification_alert ?? null;
        }
        if (visitData.kondisiKorban === 'Meninggal Dunia' || visitData.tanggalMeninggal || normalizedStatus === 'Meninggal Dunia') {
          targetToReturn.tanggalMeninggal = visitData.tanggalMeninggal || targetToReturn.tanggalMeninggal || victim.tanggalMeninggal;
          targetToReturn.jamMeninggal = visitData.jamMeninggal || targetToReturn.jamMeninggal || victim.jamMeninggal;
          targetToReturn.waktuMeninggal = visitData.waktuMeninggal || (targetToReturn.tanggalMeninggal && targetToReturn.jamMeninggal ? `${targetToReturn.tanggalMeninggal}T${targetToReturn.jamMeninggal}:00` : targetToReturn.waktuMeninggal);
          targetToReturn.dicatatOleh = visitData.dicatatOleh || visitData.petugasNama || targetToReturn.namaPetugas;
          targetToReturn.petugasPencatatId = visitData.petugasId || targetToReturn.petugasId;
          targetToReturn.waktuPencatatanMD = visitData.waktuPencatatanMD || targetToReturn.waktuPencatatanMD || new Date().toISOString();
          targetToReturn.kondisiTerakhir = 'Meninggal Dunia';
          targetToReturn.status_kondisi = 'Meninggal Dunia';
          targetToReturn.statusPemantauan = 'Selesai Dipantau';
          targetToReturn.statusPerawatan = 'Meninggal Dunia';
          targetToReturn.jadwalPemantauanBerikutnya = null;
        }

        if (visitData.fotoUrl) {
          if (Array.isArray(targetToReturn.riwayatAktivitas)) {
            const targetAct = targetToReturn.riwayatAktivitas.find((a) => a.visitId === visitId || a.id === `VISIT-${visitId}`);
            if (targetAct) {
              targetAct.fotoUrl = visitData.fotoUrl;
              if (targetAct.foto_bukti_url) {
                cachePhoto(targetAct.foto_bukti_url, visitData.fotoUrl);
              }
              if (targetAct.visitId) {
                cachePhoto(targetAct.visitId, visitData.fotoUrl);
              }
            }
          }
          if (targetToReturn.kunjunganPertama && (targetToReturn.kunjunganPertama.visitId === visitId || targetToReturn.kunjunganPertama.id === `VISIT-${visitId}`)) {
            targetToReturn.kunjunganPertama.fotoUrl = visitData.fotoUrl;
            if (targetToReturn.kunjunganPertama.foto_bukti_url) {
              cachePhoto(targetToReturn.kunjunganPertama.foto_bukti_url, visitData.fotoUrl);
            }
          }
        }
        this.saveVictim(targetToReturn);
      }
      return targetToReturn;
    }

    // Fallback penyimpanan lokal untuk mock data
    const victims = this.getVictims();
    const index = victims.findIndex((v) => v.id === victimId);
    if (index === -1) return null;

    const vCopy = { ...victims[index] };
    const actId = `ACT-${Date.now().toString().slice(-6)}`;
    const visitDate = visitData.tanggalKunjungan || new Date().toISOString();
    const isFirstVisit = !vCopy.kunjunganPertama;

    const prevVisitDate = vCopy.tanggalKunjunganTerakhir ||
      vCopy.waktuPemantauanTerakhir ||
      vCopy.kunjunganPertama?.tanggalKunjungan ||
      vCopy.tanggalInformasiDiterima;

    let visitSlaStatus = 'Selesai Tepat Waktu';
    if (prevVisitDate) {
      const diffMs = new Date(visitDate).getTime() - new Date(prevVisitDate).getTime();
      if (diffMs / (1000 * 60 * 60) > 72) {
        visitSlaStatus = 'Selesai Terlambat';
      }
    }

    const newVisitActivity = {
      id: actId,
      victimId,
      jenisAktivitas: isFirstVisit ? 'Kunjungan Pertama' : 'Kunjungan Selanjutnya',
      tanggal: visitDate, // Waktu aktual pelaksanaan kunjungan
      tanggalKunjungan: visitDate,
      waktuAktualKunjungan: visitDate,
      waktuPencatatanSistem: new Date().toISOString(),
      statusKunjungan: visitSlaStatus,
      status_kunjungan: visitSlaStatus,
      kondisiKorban: visitData.kondisiKorban || 'Rawat Inap',
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
      rumahSakit: visitData.rumahSakit || vCopy.rumahSakit,
      petugasId: visitData.petugasId || vCopy.petugasId,
      petugasNama: visitData.petugasNama || vCopy.namaPetugas,
      tanggalMeninggal: visitData.tanggalMeninggal || null,
      jamMeninggal: visitData.jamMeninggal || null,
      waktuMeninggal: visitData.waktuMeninggal || null,
      dicatatOleh: visitData.petugasNama || vCopy.namaPetugas,
      waktuPencatatanMD: visitData.kondisiKorban === 'Meninggal Dunia' ? new Date().toISOString() : null
    };

    if (visitData.fotoUrl) {
      cachePhoto(actId, visitData.fotoUrl);
      cachePhoto(victimId, visitData.fotoUrl);
    }

    if (isFirstVisit) {
      vCopy.kunjunganPertama = newVisitActivity;
    }

    vCopy.riwayatKunjungan = [newVisitActivity, ...(vCopy.riwayatKunjungan || [])];
    vCopy.riwayatAktivitas = [newVisitActivity, ...(vCopy.riwayatAktivitas || [])];
    vCopy.tanggalKunjunganTerakhir = visitDate;
    vCopy.waktuPemantauanTerakhir = visitDate;
    vCopy.tanggalPemantauanTerakhir = visitDate;

    if (visitData.kondisiKorban) {
      vCopy.kondisiTerakhir = visitData.kondisiKorban;
      vCopy.status_kondisi = visitData.kondisiKorban;
      vCopy.statusKonfirmasiKondisi = 'Terkonfirmasi';
    }

    if (visitData.tindakLanjut) {
      vCopy.tindakLanjut = visitData.tindakLanjut;
    }

    if (vCopy.kondisiTerakhir === 'Meninggal Dunia') {
      vCopy.statusPemantauan = 'Selesai Dipantau';
      vCopy.statusPerawatan = 'Meninggal Dunia';
      vCopy.jadwalPemantauanBerikutnya = null;
      vCopy.tanggalMeninggal = visitData.tanggalMeninggal || vCopy.tanggalMeninggal || visitDate.split('T')[0];
      vCopy.jamMeninggal = visitData.jamMeninggal || vCopy.jamMeninggal || '12:00';
      vCopy.waktuMeninggal = visitData.waktuMeninggal || (vCopy.tanggalMeninggal ? new Date(`${vCopy.tanggalMeninggal}T${vCopy.jamMeninggal}`).toISOString() : visitDate);
      vCopy.dicatatOleh = visitData.petugasNama || vCopy.namaPetugas || 'Petugas Jasa Raharja';
      vCopy.petugasPencatatId = visitData.petugasId || vCopy.petugasId;
      vCopy.waktuPencatatanMD = new Date().toISOString();

      const mdCareItem = {
        id: `CARE-MD-${Date.now()}`,
        tanggal: vCopy.waktuMeninggal || visitDate,
        rumahSakit: vCopy.rumahSakit,
        jenisPerawatan: 'Meninggal Dunia',
        status: 'Meninggal Dunia',
        tanggalMeninggal: vCopy.tanggalMeninggal,
        jamMeninggal: vCopy.jamMeninggal,
        dicatatOleh: vCopy.dicatatOleh,
        petugasId: vCopy.petugasPencatatId,
        petugasNama: vCopy.dicatatOleh,
        waktuPencatatanMD: vCopy.waktuPencatatanMD,
        catatan: `Korban dinyatakan Meninggal Dunia pada tanggal ${vCopy.tanggalMeninggal} pukul ${vCopy.jamMeninggal} WIB. Dicatat oleh: ${vCopy.dicatatOleh}.`
      };
      vCopy.riwayatPerawatan = [...(vCopy.riwayatPerawatan || []), mdCareItem];
    } else if (['Rawat Inap', 'Masih Dirawat', 'Luka Berat', 'Luka Ringan', 'Dirujuk'].includes(vCopy.kondisiTerakhir)) {
      vCopy.statusPemantauan = 'Pemantauan Aktif';
      vCopy.jadwalPemantauanBerikutnya = new Date(new Date(visitDate).getTime() + 72 * 60 * 60 * 1000).toISOString();
    } else {
      vCopy.statusPemantauan = 'Selesai Dipantau';
      vCopy.jadwalPemantauanBerikutnya = null;
    }

    victims[index] = vCopy;
    this.saveVictims(victims);
    return vCopy;
  },

  /**
   * Pencatatan Khusus Korban MD (Meninggal Dunia)
   * Menyimpan tanggal kematian, jam kematian, nama petugas pencatat, dan waktu pencatatan sistem secara permanen.
   */
  async recordMeninggalDunia(victimId, { tanggalMeninggal, jamMeninggal, catatan = '', petugasId, petugasNama } = {}) {
    return this.addMonitoring(victimId, {
      kondisi: 'Meninggal Dunia',
      kondisiKorban: 'Meninggal Dunia',
      statusKonfirmasi: 'Terkonfirmasi',
      tanggalMeninggal,
      jamMeninggal,
      waktuMeninggal: tanggalMeninggal && jamMeninggal ? new Date(`${tanggalMeninggal}T${jamMeninggal}`).toISOString() : new Date().toISOString(),
      hasilPemantauan: catatan || `Korban dinyatakan Meninggal Dunia pada tanggal ${tanggalMeninggal} pukul ${jamMeninggal} WIB.`,
      catatanTambahan: catatan,
      petugasId,
      petugasNama,
      checklistTindakan: ['Verifikasi Berkas Medis Kematian', 'Koordinasi Ahli Waris Korban'],
      statusTindakLanjut: 'Sudah Selesai'
    });
  },

  /**
   * Pembaruan Khusus Tanggal & Jam Meninggal Dunia (MD)
   * Menyimpan tanggal kematian, jam kematian, nama petugas pencatat, dan waktu pencatatan sistem secara permanen.
   */
  updateMeninggalDunia(victimId, { tanggalMeninggal, jamMeninggal, catatan = '', dicatatOleh, petugasId } = {}) {
    if (!victimId) return null;
    const victims = this.getVictims();
    const index = victims.findIndex(
      (v) => String(v.id) === String(victimId) || String(v.caseId) === String(victimId) || v.nomorTiket === victimId
    );
    if (index === -1) return null;

    const vCopy = { ...victims[index] };
    if (tanggalMeninggal) vCopy.tanggalMeninggal = tanggalMeninggal;
    if (jamMeninggal) vCopy.jamMeninggal = jamMeninggal.replace(/\s*WIB/i, '').trim();
    if (vCopy.tanggalMeninggal && vCopy.jamMeninggal) {
      vCopy.waktuMeninggal = `${vCopy.tanggalMeninggal}T${vCopy.jamMeninggal}:00`;
    }
    if (dicatatOleh) vCopy.dicatatOleh = dicatatOleh;
    if (petugasId) vCopy.petugasPencatatId = petugasId;
    vCopy.waktuPencatatanMD = vCopy.waktuPencatatanMD || new Date().toISOString();
    vCopy.kondisiTerakhir = 'Meninggal Dunia';
    vCopy.status_kondisi = 'Meninggal Dunia';
    vCopy.statusPemantauan = MONITORING_STATUS.SELESAI_MD;
    vCopy.status_pemantauan = MONITORING_STATUS.SELESAI_MD;
    vCopy.statusPerawatan = 'Meninggal Dunia';
    vCopy.jadwalPemantauanBerikutnya = null;

    if (Array.isArray(vCopy.riwayatPerawatan)) {
      const mdItem = vCopy.riwayatPerawatan.find((r) => r.jenisPerawatan === 'Meninggal Dunia' || r.status === 'Meninggal Dunia');
      if (mdItem) {
        mdItem.tanggalMeninggal = vCopy.tanggalMeninggal;
        mdItem.jamMeninggal = vCopy.jamMeninggal;
        mdItem.dicatatOleh = vCopy.dicatatOleh;
        if (vCopy.waktuMeninggal) mdItem.tanggal = vCopy.waktuMeninggal;
      }
    }

    victims[index] = vCopy;
    this.saveVictims(victims);
    window.dispatchEvent(new CustomEvent('jr_victims_updated'));
    return vCopy;
  },

  /**
   * Add a continuous monitoring activity to an existing victim
   */
  async addMonitoring(victimId, monitoringData) {
    const victim = this.getVictimById(victimId);
    if (!victim) return null;

    const isVictimFinished = isVictimFinishedUtil(victim);
    if (isVictimFinished) {
      throw new Error('Status pemantauan korban ini sudah Selesai. Pencatatan pemantauan baru tidak diperbolehkan.');
    }

    // Jika kasus dari backend dan ada kunjungan yang menunggu, submit ke backend
    if (victim.isFromBackend || victim.caseId) {
      const caseId = victim.caseId || victim.id;
      let visitId = victim.activeVisitId;
      if (!visitId) {
        const detail = await api.getCaseById(caseId);
        const pending = detail?.visits?.find((vis) => vis.status_kunjungan === 'Menunggu');
        if (pending) visitId = pending.id;
      }

      if (visitId) {
        let fotoFile = null;
        if (monitoringData.fotoUrl && typeof monitoringData.fotoUrl === 'string' && monitoringData.fotoUrl.startsWith('data:')) {
          fotoFile = dataUrlToFile(monitoringData.fotoUrl, `mon_${caseId}_${Date.now()}.jpg`);
          cachePhoto(caseId, monitoringData.fotoUrl);
          cachePhoto(visitId, monitoringData.fotoUrl);
          cachePhoto(`VISIT-${visitId}`, monitoringData.fotoUrl);
          cachePhoto(victim.id, monitoringData.fotoUrl);
          if (fotoFile?.name) {
            cachePhoto(fotoFile.name, monitoringData.fotoUrl);
          }
        } else if (monitoringData.fotoFile instanceof File) {
          fotoFile = monitoringData.fotoFile;
        }

        const normalizedStatus = normalizeStatusToBackend(monitoringData.kondisi || monitoringData.kondisiKorban);

        // Pastikan data status MD disimpan ke victim lokal sebelum memanggil backend
        if (monitoringData.kondisi === 'Meninggal Dunia' || monitoringData.kondisiKorban === 'Meninggal Dunia' || monitoringData.tanggalMeninggal || normalizedStatus === 'Meninggal Dunia') {
          victim.tanggalMeninggal = monitoringData.tanggalMeninggal || victim.tanggalMeninggal;
          victim.jamMeninggal = monitoringData.jamMeninggal || victim.jamMeninggal;
          victim.waktuMeninggal = monitoringData.waktuMeninggal || (victim.tanggalMeninggal && victim.jamMeninggal ? `${victim.tanggalMeninggal}T${victim.jamMeninggal}:00` : victim.waktuMeninggal);
          victim.dicatatOleh = monitoringData.dicatatOleh || monitoringData.petugasNama || victim.namaPetugas;
          victim.petugasPencatatId = monitoringData.petugasId || victim.petugasId;
          victim.waktuPencatatanMD = monitoringData.waktuPencatatanMD || new Date().toISOString();
          victim.kondisiTerakhir = 'Meninggal Dunia';
          victim.status_kondisi = 'Meninggal Dunia';
          victim.statusPemantauan = 'Selesai Dipantau';
          victim.statusPerawatan = 'Meninggal Dunia';
          victim.jadwalPemantauanBerikutnya = null;
          this.saveVictim(victim);
        }

        // Pastikan data status Pulang disimpan ke victim lokal sebelum memanggil backend (kecuali penolakan jaminan JR)
        const isPenolakanJR = Boolean(
          monitoringData.isPenolakanJaminanJR ||
          String(monitoringData.kondisi || monitoringData.kondisiKorban || '').toLowerCase().includes('tidak bersedia')
        );

        if (isPenolakanJR) {
          victim.isPenolakanJaminanJR = true;
          victim.tanggalPenolakanJaminan = monitoringData.tanggalPenolakan || new Date().toISOString().split('T')[0];
          victim.keteranganPenolakanJaminan = monitoringData.keteranganPenolakan || monitoringData.catatanTambahan || '';
          victim.kondisiTerakhir = 'Tidak Bersedia Menggunakan Jaminan Jasa Raharja';
          victim.status_kondisi = 'Tidak Bersedia Menggunakan Jaminan Jasa Raharja';
          victim.statusPemantauan = MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA;
          victim.status_pemantauan = MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA;
          victim.statusPerawatan = 'Tidak Bersedia Jaminan JR';
          victim.statusTindakLanjut = 'Sudah Selesai';
          victim.jadwalPemantauanBerikutnya = null;
          this.saveVictim(victim);
        } else if (monitoringData.kondisi === 'Sudah Pulang' || monitoringData.kondisi === 'Pulang' || monitoringData.kondisiKorban === 'Sudah Pulang' || monitoringData.kondisiKorban === 'Pulang' || normalizedStatus === 'Selesai') {
          victim.kondisiTerakhir = 'Sudah Pulang';
          victim.status_kondisi = 'Sudah Pulang';
          victim.statusPemantauan = MONITORING_STATUS.SELESAI_PULANG;
          victim.status_pemantauan = MONITORING_STATUS.SELESAI_PULANG;
          victim.statusPerawatan = 'Pulang';
          victim.statusTindakLanjut = 'Sudah Selesai';
          victim.tanggalPulang = monitoringData.tanggalPulang || (monitoringData.waktuAktualKunjungan || new Date().toISOString()).split('T')[0];
          victim.jadwalPemantauanBerikutnya = null;
          this.saveVictim(victim);
        }

        let catatanKondisi = monitoringData.hasilPemantauan || monitoringData.catatan || '';
        if (isPenolakanJR) {
          const tglTolak = monitoringData.tanggalPenolakan || victim.tanggalPenolakanJaminan || new Date().toISOString().split('T')[0];
          const ketTolak = monitoringData.keteranganPenolakan || victim.keteranganPenolakanJaminan || 'Korban / keluarga menolak menggunakan jaminan Jasa Raharja';
          catatanKondisi = `[TOLAK_JAMINAN_JR] Tanggal: ${tglTolak} | Keterangan: ${ketTolak}. ${catatanKondisi}`.trim();
        } else if ((normalizedStatus === 'Meninggal Dunia' || monitoringData.kondisi === 'Meninggal Dunia') && (monitoringData.tanggalMeninggal || victim.tanggalMeninggal)) {
          const tglMD = monitoringData.tanggalMeninggal || victim.tanggalMeninggal;
          const jamMD = monitoringData.jamMeninggal || victim.jamMeninggal || '—';
          const picMD = monitoringData.petugasNama || victim.namaPetugas;
          catatanKondisi = `[MD] Tanggal: ${tglMD} | Jam: ${jamMD} | Dicatat Oleh: ${picMD}. ${catatanKondisi}`.trim();
        }

        const formData = new FormData();
        formData.append('case_id', String(caseId));
        formData.append('cek_komunikasi_keluarga', 'true');
        formData.append('cek_edukasi_santunan', 'true');
        formData.append('cek_arahan_lp', 'true');
        formData.append('catatan_kondisi', catatanKondisi);
        formData.append('status_kondisi_terbaru', normalizedStatus);
        formData.append('lat_petugas', String(monitoringData.lat_petugas ?? monitoringData.latitude ?? '0.49968000'));
        formData.append('lng_petugas', String(monitoringData.lng_petugas ?? monitoringData.longitude ?? '101.45475000'));

        // Parameter rujukan jika pasien dirujuk ke RS lain
        let pendingReferralSave = null;
        if (normalizedStatus === 'Dirujuk ke RS Lain') {
          const rujukanRsRaw = (monitoringData.rumahSakitRujukan || '').trim();
          const rujukanRsName = rujukanRsRaw.toLowerCase();
          const hospitals = await this.getOrFetchHospitals();
          const targetHospital =
            hospitals.find((h) => (typeof h === 'string' ? h : h?.nama_rs || '').toLowerCase() === rujukanRsName) ||
            hospitals.find((h) => isHospitalNameMatch(typeof h === 'string' ? h : h?.nama_rs || '', rujukanRsRaw));
          const rujukanHospitalId = monitoringData.rujukan_hospital_id || monitoringData.targetHospitalId || (targetHospital ? targetHospital.id : null);
          if (!rujukanHospitalId) {
            throw new Error(`Rumah sakit tujuan "${rujukanRsRaw}" tidak ditemukan di master rumah sakit backend.`);
          }
          formData.append('rujukan_hospital_id', String(rujukanHospitalId));
          if (monitoringData.alasanRujukan || monitoringData.alasan_rujukan) {
            formData.append('alasan_rujukan', monitoringData.alasanRujukan || monitoringData.alasan_rujukan);
          }
          if (monitoringData.catatanRujukan || monitoringData.catatan_rujukan) {
            formData.append('catatan_rujukan', monitoringData.catatanRujukan || monitoringData.catatan_rujukan);
          }

          pendingReferralSave = {
            destHospital: targetHospital?.nama_rs || rujukanRsRaw,
            originHospital: victim.rumahSakit
          };
        }

        if (fotoFile) {
          formData.append('foto_bukti', fotoFile);
        }

        const submitRes = await api.submitVisit(visitId, formData);

        if (pendingReferralSave) {
          const { destHospital, originHospital } = pendingReferralSave;
          const officers = this.getOfficers();
          const matchedOfficer = officers.find(
            (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some(
              (rs) => isHospitalNameMatch(rs, destHospital)
            )
          );
          const backendAssignedOfficer = submitRes?.referral?.assigned_officer;
          const statusDirujukTeks = `Dirujuk ke ${destHospital}`;
          victim.rumahSakitAsal = originHospital;
          victim.rumahSakitTujuan = destHospital;
          victim.rumahSakit = destHospital;
          victim.tanggalRujukan = new Date().toISOString();
          victim.petugasAsalId = victim.petugasId;
          victim.petugasAsalNama = victim.namaPetugas;
          if (backendAssignedOfficer) {
            victim.petugasTujuanId = matchedOfficer?.id || backendAssignedOfficer.id;
            victim.petugasTujuanNama = backendAssignedOfficer.nama;
            victim.petugasId = victim.petugasTujuanId;
            victim.namaPetugas = backendAssignedOfficer.nama;
          } else if (matchedOfficer) {
            victim.petugasTujuanId = matchedOfficer.id;
            victim.petugasTujuanNama = matchedOfficer.nama;
            victim.petugasId = matchedOfficer.id;
            victim.namaPetugas = matchedOfficer.nama;
          }
          victim.kondisiTerakhir = statusDirujukTeks;
          victim.statusPerawatan = 'Rujukan';
          victim.statusRujukan = statusDirujukTeks;
          victim.statusPemantauan = statusDirujukTeks;
          victim.isRujukanMasuk = true;
          victim.rujukanAccepted = false;
          victim.riwayatRujukan = [
            ...(victim.riwayatRujukan || []),
            {
              id: `REF-${Date.now()}`,
              tanggal: victim.tanggalRujukan,
              dariRs: originHospital,
              keRs: destHospital,
              petugasAsalId: victim.petugasAsalId,
              petugasAsalNama: victim.petugasAsalNama,
              petugasTujuanId: victim.petugasTujuanId,
              petugasTujuanNama: victim.petugasTujuanNama,
              alasan: monitoringData.alasanRujukan || monitoringData.catatanRujukan || statusDirujukTeks,
              status: statusDirujukTeks
            }
          ];
          this.saveVictim(victim);

          this.addNotification({
            type: 'RUJUKAN_MASUK',
            title: 'Rujukan Korban Masuk',
            message: `Korban ${victim.nama} telah dirujuk dari ${originHospital} ke ${destHospital}.`,
            victimId: victim.id,
            victimName: victim.nama,
            victimNik: victim.nik,
            rumahSakitAsal: originHospital,
            rumahSakitTujuan: destHospital,
            officerId: victim.petugasTujuanId || null,
            officerName: victim.petugasTujuanNama || 'Petugas RS Tujuan',
            senderOfficerName: monitoringData.petugasNama || victim.namaPetugas || 'Petugas RS Asal'
          });
        }
        const updated = await this.fetchVictimDetail(caseId);
        const targetToReturn = updated || victim;
        if (targetToReturn) {
          if (monitoringData.kondisi === 'Meninggal Dunia' || monitoringData.kondisiKorban === 'Meninggal Dunia' || monitoringData.tanggalMeninggal || normalizedStatus === 'Meninggal Dunia') {
            targetToReturn.tanggalMeninggal = monitoringData.tanggalMeninggal || targetToReturn.tanggalMeninggal || victim.tanggalMeninggal;
            targetToReturn.jamMeninggal = monitoringData.jamMeninggal || targetToReturn.jamMeninggal || victim.jamMeninggal;
            targetToReturn.waktuMeninggal = monitoringData.waktuMeninggal || (targetToReturn.tanggalMeninggal && targetToReturn.jamMeninggal ? `${targetToReturn.tanggalMeninggal}T${targetToReturn.jamMeninggal}:00` : targetToReturn.waktuMeninggal);
            targetToReturn.dicatatOleh = monitoringData.dicatatOleh || monitoringData.petugasNama || targetToReturn.namaPetugas;
            targetToReturn.petugasPencatatId = monitoringData.petugasId || targetToReturn.petugasId;
            targetToReturn.waktuPencatatanMD = monitoringData.waktuPencatatanMD || targetToReturn.waktuPencatatanMD || new Date().toISOString();
            targetToReturn.kondisiTerakhir = 'Meninggal Dunia';
            targetToReturn.status_kondisi = 'Meninggal Dunia';
            targetToReturn.statusPemantauan = 'Selesai Dipantau';
            targetToReturn.statusPerawatan = 'Meninggal Dunia';
            targetToReturn.jadwalPemantauanBerikutnya = null;
          }

          if (monitoringData.kondisi === 'Sudah Pulang' || monitoringData.kondisi === 'Pulang' || monitoringData.kondisiKorban === 'Sudah Pulang' || monitoringData.kondisiKorban === 'Pulang' || normalizedStatus === 'Selesai') {
            targetToReturn.kondisiTerakhir = 'Sudah Pulang';
            targetToReturn.status_kondisi = 'Sudah Pulang';
            targetToReturn.statusPemantauan = 'Selesai';
            targetToReturn.status_pemantauan = 'Selesai';
            targetToReturn.statusPerawatan = 'Pulang';
            targetToReturn.statusTindakLanjut = 'Sudah Selesai';
            targetToReturn.jadwalPemantauanBerikutnya = null;
          }

          if (monitoringData.fotoUrl) {
            if (Array.isArray(targetToReturn.riwayatAktivitas)) {
              const targetAct = targetToReturn.riwayatAktivitas.find((a) => a.visitId === visitId || a.id === `VISIT-${visitId}`);
              if (targetAct) {
                targetAct.fotoUrl = monitoringData.fotoUrl;
                if (targetAct.foto_bukti_url) {
                  cachePhoto(targetAct.foto_bukti_url, monitoringData.fotoUrl);
                }
                if (targetAct.visitId) {
                  cachePhoto(targetAct.visitId, monitoringData.fotoUrl);
                }
              }
            }
            if (Array.isArray(targetToReturn.riwayatPemantauan)) {
              const targetMon = targetToReturn.riwayatPemantauan.find((a) => a.visitId === visitId || a.id === `VISIT-${visitId}`);
              if (targetMon) {
                targetMon.fotoUrl = monitoringData.fotoUrl;
                if (targetMon.foto_bukti_url) {
                  cachePhoto(targetMon.foto_bukti_url, monitoringData.fotoUrl);
                }
              }
            }
            if (targetToReturn.kunjunganPertama && (targetToReturn.kunjunganPertama.visitId === visitId || targetToReturn.kunjunganPertama.id === `VISIT-${visitId}`)) {
              targetToReturn.kunjunganPertama.fotoUrl = monitoringData.fotoUrl;
              if (targetToReturn.kunjunganPertama.foto_bukti_url) {
                cachePhoto(targetToReturn.kunjunganPertama.foto_bukti_url, monitoringData.fotoUrl);
              }
            }
          }

          if (monitoringData.namaKeluarga) targetToReturn.namaKeluarga = monitoringData.namaKeluarga;
          if (monitoringData.hubunganKeluarga) targetToReturn.hubunganKeluarga = monitoringData.hubunganKeluarga;
          if (monitoringData.kontakKeluarga) targetToReturn.kontakKeluarga = monitoringData.kontakKeluarga;
          if (monitoringData.perkembanganLuka) targetToReturn.perkembanganLuka = monitoringData.perkembanganLuka;
          if (monitoringData.biayaPerawatan) targetToReturn.biayaPerawatan = monitoringData.biayaPerawatan;

          this.saveVictim(targetToReturn);
        }
        return targetToReturn;
      }
    }

    // Local storage logic
    const victims = this.getVictims();
    const index = victims.findIndex((v) => v.id === victimId);
    if (index === -1) return null;

    const vCopy = { ...victims[index] };
    const actId = `ACT-${Date.now().toString().slice(-6)}`;
    const monDate = monitoringData.tanggal || new Date().toISOString();
    const rawKondisi = monitoringData.kondisi || monitoringData.kondisiKorban || vCopy.kondisiTerakhir;
    const kondisi = rawKondisi === 'Pulang' ? 'Sudah Pulang' : rawKondisi;
    const statusKonfirmasi = monitoringData.statusKonfirmasi || 'Terkonfirmasi';
    const statusTindakLanjut = monitoringData.statusTindakLanjut || (monitoringData.checklistKebutuhanLanjutan?.length > 0 ? 'Masih Perlu Ditindaklanjuti' : 'Sudah Selesai');
    const visitNumber = monitoringData.nomorKunjungan || ((vCopy.riwayatAktivitas || []).filter((a) => a.statusKunjungan !== 'Menunggu').length + 1);

    const prevDate = vCopy.tanggalKunjunganTerakhir ||
      vCopy.waktuPemantauanTerakhir ||
      vCopy.tanggalPemantauanTerakhir ||
      vCopy.kunjunganPertama?.tanggalKunjungan ||
      vCopy.tanggalInformasiDiterima;

    let monSlaStatus = 'Selesai Tepat Waktu';
    if (prevDate) {
      const diffMs = new Date(monDate).getTime() - new Date(prevDate).getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours > 72) {
        monSlaStatus = 'Selesai Terlambat';
      }
    }

    const newMonActivity = {
      id: actId,
      victimId,
      jenisAktivitas: 'Kunjungan Selanjutnya',
      nomorKunjungan: visitNumber,
      kunjunganKe: visitNumber,
      tanggal: monDate, // Waktu aktual pelaksanaan kunjungan
      tanggalKunjungan: monDate,
      waktuAktualKunjungan: monDate,
      waktuPencatatanSistem: new Date().toISOString(),
      statusKunjungan: monSlaStatus,
      status_kunjungan: monSlaStatus,
      kondisiKorban: kondisi,
      statusKonfirmasi,
      sumberInfo: monitoringData.sumberInfo || monitoringData.sumberInformasi || 'Tim Medis RS / Petugas Lapangan',
      hasilKomunikasi: monitoringData.hasilPemantauan || monitoringData.catatan || 'Pemantauan lanjutan berkala.',
      hasilPemantauan: monitoringData.hasilPemantauan || monitoringData.catatan || 'Pemantauan lanjutan berkala.',
      checklistTindakan: Array.isArray(monitoringData.checklistTindakan) ? monitoringData.checklistTindakan : [],
      statusTindakLanjut,
      checklistKebutuhanLanjutan: Array.isArray(monitoringData.checklistKebutuhanLanjutan) ? monitoringData.checklistKebutuhanLanjutan : [],
      catatanTambahan: monitoringData.catatanTambahan || '',
      informasiHak: monitoringData.informasiHak || null,
      catatanTindakLanjut: monitoringData.tindakLanjut || '',
      tindakLanjut: monitoringData.tindakLanjut || '',
      fotoUrl: monitoringData.fotoUrl || null,
      latitude: monitoringData.latitude || null,
      longitude: monitoringData.longitude || null,
      akurasiLokasi: monitoringData.akurasiLokasi || null,
      waktuDokumentasi: monitoringData.waktuDokumentasi || monDate,
      petugasId: monitoringData.petugasId || vCopy.petugasId,
      petugasNama: monitoringData.petugasNama || vCopy.namaPetugas,
      tanggalKejadian: monitoringData.tanggalKejadian || null,
      keteranganKonfirmasi: monitoringData.keteranganKonfirmasi || null,
      rumahSakitRujukan: monitoringData.rumahSakitRujukan || null,
      rumahSakit: monitoringData.rumahSakit || vCopy.rumahSakit || (vCopy.rumahSakitAsal || 'Rumah Sakit'),
      namaKeluarga: monitoringData.namaKeluarga || vCopy.namaKeluarga || null,
      hubunganKeluarga: monitoringData.hubunganKeluarga || vCopy.hubunganKeluarga || null,
      kontakKeluarga: monitoringData.kontakKeluarga || vCopy.kontakKeluarga || null,
      perkembanganLuka: monitoringData.perkembanganLuka || vCopy.perkembanganLuka || null,
      biayaPerawatan: monitoringData.biayaPerawatan || vCopy.biayaPerawatan || null,
      tanggalMeninggal: monitoringData.tanggalMeninggal || null,
      jamMeninggal: monitoringData.jamMeninggal || null,
      waktuMeninggal: monitoringData.waktuMeninggal || null,
      dicatatOleh: monitoringData.petugasNama || vCopy.namaPetugas,
      waktuPencatatanMD: kondisi === 'Meninggal Dunia' ? new Date().toISOString() : null
    };

    if (monitoringData.fotoUrl) {
      cachePhoto(actId, monitoringData.fotoUrl);
      cachePhoto(victimId, monitoringData.fotoUrl);
    }

    if (kondisi === 'Dirujuk') {
      const destHospital = (monitoringData.rumahSakitRujukan || vCopy.rumahSakitTujuan || '').trim();
      let originHospital = (vCopy.rumahSakitAsal && vCopy.rumahSakitAsal !== destHospital)
        ? vCopy.rumahSakitAsal
        : (vCopy.rumahSakit && vCopy.rumahSakit !== destHospital ? vCopy.rumahSakit : null);

      if (!originHospital) {
        const initMatch = INITIAL_VICTIMS.find((iv) => iv.id === vCopy.id || iv.nik === vCopy.nik);
        originHospital = initMatch?.rumahSakit || vCopy.riwayatPerawatan?.[0]?.rumahSakit || vCopy.rumahSakit || 'Rumah Sakit';
      }

      // 1. Data pasien dialihkan ke faskes tujuan dengan tetap menyimpan faskes asal
      vCopy.rumahSakitAsal = originHospital;
      vCopy.rumahSakitTujuan = destHospital;
      vCopy.rumahSakit = destHospital; // Resmi berpindah faskes aktif ke RS Tujuan
      vCopy.tanggalRujukan = monDate;
      vCopy.petugasAsalId = vCopy.petugasId;
      vCopy.petugasAsalNama = vCopy.namaPetugas;

      const officers = this.getOfficers();
      const matchedOfficer = officers.find(
        (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some(
          (rs) => isHospitalNameMatch(rs, destHospital)
        )
      );

      if (matchedOfficer) {
        vCopy.petugasId = matchedOfficer.id;
        vCopy.namaPetugas = matchedOfficer.nama;
        vCopy.backendOfficerId = matchedOfficer.backendOfficerId || matchedOfficer.backendId || null;
        vCopy.petugasTujuanId = matchedOfficer.id;
        vCopy.petugasTujuanNama = matchedOfficer.nama;
      } else {
        vCopy.petugasTujuanId = null;
        vCopy.petugasTujuanNama = 'Belum Ditugaskan';
      }

      // 2. Status pasien berubah menjadi "Dirujuk ke [Nama RS Tujuan]"
      const statusDirujukTeks = `Dirujuk ke ${destHospital}`;
      vCopy.statusPerawatan = 'Rujukan';
      vCopy.statusRujukan = statusDirujukTeks;
      vCopy.kondisiTerakhir = statusDirujukTeks;
      // 3. Pasien TIDAK LAGI masuk dalam daftar pemantauan aktif rumah sakit asal
      vCopy.statusPemantauan = statusDirujukTeks;
      vCopy.isRujukanMasuk = true; // Muncul di Pasien Rujukan Masuk akun RS Tujuan
      vCopy.rujukanAccepted = false; // Menunggu pemantauan di RS Tujuan

      // Catat di riwayat rujukan
      const refItem = {
        id: `REF-${Date.now()}`,
        tanggal: monDate,
        dariRs: originHospital,
        keRs: destHospital,
        petugasAsalId: vCopy.petugasAsalId,
        petugasAsalNama: vCopy.petugasAsalNama,
        petugasTujuanId: vCopy.petugasTujuanId,
        petugasTujuanNama: vCopy.petugasTujuanNama,
        alasan: monitoringData.catatanTambahan || monitoringData.hasilPemantauan || 'Rujukan fasilitas kesehatan',
        status: statusDirujukTeks
      };
      vCopy.riwayatRujukan = [...(vCopy.riwayatRujukan || []), refItem];

      // Catat perpindahan faskes ke riwayat perawatan
      const refCareItem = {
        id: `CARE-REF-${Date.now()}`,
        tanggal: monDate,
        rumahSakit: destHospital,
        rumahSakitAsal: originHospital,
        jenisPerawatan: 'Rujukan',
        status: statusDirujukTeks,
        petugasId: vCopy.petugasTujuanId,
        petugasNama: vCopy.petugasTujuanNama,
        catatan: `Pasien dirujuk dari ${originHospital} ke ${destHospital}.`
      };
      vCopy.riwayatPerawatan = [...(vCopy.riwayatPerawatan || []), refCareItem];

      // Kirim notifikasi ke petugas penanggung jawab RS Tujuan (RS B)
      this.addNotification({
        type: 'RUJUKAN_MASUK',
        title: 'Rujukan Korban Masuk',
        message: `Korban ${vCopy.nama} telah dirujuk dari ${originHospital} ke ${destHospital}.`,
        victimId: vCopy.id,
        victimName: vCopy.nama,
        victimNik: vCopy.nik,
        rumahSakitAsal: originHospital,
        rumahSakitTujuan: destHospital,
        officerId: vCopy.petugasTujuanId,
        officerName: vCopy.petugasTujuanNama,
        senderOfficerName: monitoringData.petugasNama || vCopy.namaPetugas || 'Petugas RS Asal'
      });
    } else {
      // Jika pasien ini sebelumnya adalah rujukan masuk dan sekarang mulai dipantau di RS Tujuan:
      if (vCopy.isRujukanMasuk && vCopy.rumahSakitTujuan) {
        vCopy.rumahSakit = vCopy.rumahSakitTujuan; // Resmi aktif di RS Tujuan
        vCopy.isRujukanMasuk = false;
        vCopy.rujukanAccepted = true;
        if (monitoringData.petugasId) {
          vCopy.petugasId = monitoringData.petugasId;
          vCopy.namaPetugas = monitoringData.petugasNama || vCopy.namaPetugas;
        }
        if (kondisi !== 'Meninggal Dunia' && kondisi !== 'Sudah Pulang' && kondisi !== 'Pulang') {
          vCopy.statusPemantauan = 'Pemantauan Aktif';
        }
      }
      if (kondisi === 'Sudah Pulang' || kondisi === 'Pulang' || kondisi === 'Selesai') {
        vCopy.statusPerawatan = 'Pulang';
        const dischargeCareItem = {
          id: `CARE-DISCHARGE-${Date.now()}`,
          tanggal: monDate,
          rumahSakit: vCopy.rumahSakit,
          jenisPerawatan: 'Pulang',
          status: 'Pulang',
          petugasId: vCopy.petugasId,
          petugasNama: vCopy.namaPetugas,
          catatan: monitoringData.catatanTambahan || monitoringData.hasilPemantauan || 'Pasien dinyatakan selesai perawatan / pulang oleh pihak rumah sakit.'
        };
        vCopy.riwayatPerawatan = [...(vCopy.riwayatPerawatan || []), dischargeCareItem];
      }
    }

    vCopy.riwayatPemantauan = [newMonActivity, ...(vCopy.riwayatPemantauan || [])];
    vCopy.riwayatKunjungan = [newMonActivity, ...(vCopy.riwayatKunjungan || [])];
    vCopy.riwayatAktivitas = [newMonActivity, ...(vCopy.riwayatAktivitas || [])];
    vCopy.tanggalPemantauanTerakhir = monDate;
    vCopy.waktuPemantauanTerakhir = monDate;
    vCopy.tanggalKunjunganTerakhir = monDate;
    vCopy.kondisiTerakhir = kondisi;
    vCopy.statusKonfirmasiKondisi = statusKonfirmasi;
    vCopy.statusTindakLanjut = statusTindakLanjut;
    vCopy.kebutuhanTindakLanjut = Array.isArray(monitoringData.checklistKebutuhanLanjutan) ? monitoringData.checklistKebutuhanLanjutan : [];
    if (monitoringData.namaKeluarga) vCopy.namaKeluarga = monitoringData.namaKeluarga;
    if (monitoringData.hubunganKeluarga) vCopy.hubunganKeluarga = monitoringData.hubunganKeluarga;
    if (monitoringData.kontakKeluarga) vCopy.kontakKeluarga = monitoringData.kontakKeluarga;
    if (monitoringData.perkembanganLuka) vCopy.perkembanganLuka = monitoringData.perkembanganLuka;
    if (monitoringData.biayaPerawatan) vCopy.biayaPerawatan = monitoringData.biayaPerawatan;

    if (monitoringData.tindakLanjut) {
      vCopy.tindakLanjut = monitoringData.tindakLanjut;
    }

    // Aturan Status Pemantauan Korban:
    if (kondisi === 'Belum Dapat Dikonfirmasi') {
      vCopy.statusPemantauan = 'Menunggu Konfirmasi Kondisi';
      vCopy.jadwalPemantauanBerikutnya = new Date(new Date(monDate).getTime() + 72 * 60 * 60 * 1000).toISOString();
    } else if (kondisi === 'Meninggal Dunia') {
      vCopy.statusPemantauan = 'Selesai Dipantau';
      vCopy.statusPerawatan = 'Meninggal Dunia';
      vCopy.jadwalPemantauanBerikutnya = null;
      vCopy.tanggalMeninggal = monitoringData.tanggalMeninggal || vCopy.tanggalMeninggal || monDate.split('T')[0];
      vCopy.jamMeninggal = monitoringData.jamMeninggal || vCopy.jamMeninggal || '12:00';
      vCopy.waktuMeninggal = monitoringData.waktuMeninggal || (vCopy.tanggalMeninggal ? new Date(`${vCopy.tanggalMeninggal}T${vCopy.jamMeninggal}`).toISOString() : monDate);
      vCopy.dicatatOleh = monitoringData.petugasNama || vCopy.namaPetugas || 'Petugas Jasa Raharja';
      vCopy.petugasPencatatId = monitoringData.petugasId || vCopy.petugasId;
      vCopy.waktuPencatatanMD = new Date().toISOString();

      const mdCareItem = {
        id: `CARE-MD-${Date.now()}`,
        tanggal: vCopy.waktuMeninggal || monDate,
        rumahSakit: vCopy.rumahSakit,
        jenisPerawatan: 'Meninggal Dunia',
        status: 'Meninggal Dunia',
        tanggalMeninggal: vCopy.tanggalMeninggal,
        jamMeninggal: vCopy.jamMeninggal,
        dicatatOleh: vCopy.dicatatOleh,
        petugasId: vCopy.petugasPencatatId,
        petugasNama: vCopy.dicatatOleh,
        waktuPencatatanMD: vCopy.waktuPencatatanMD,
        catatan: `Korban dinyatakan Meninggal Dunia pada tanggal ${vCopy.tanggalMeninggal} pukul ${vCopy.jamMeninggal} WIB. Dicatat oleh: ${vCopy.dicatatOleh}.`
      };
      vCopy.riwayatPerawatan = [...(vCopy.riwayatPerawatan || []), mdCareItem];
    } else if (kondisi === 'Sudah Pulang' || kondisi === 'Pulang' || kondisi === 'Selesai') {
      vCopy.kondisiTerakhir = 'Sudah Pulang';
      vCopy.status_kondisi = 'Sudah Pulang';
      vCopy.statusPemantauan = 'Selesai';
      vCopy.status_pemantauan = 'Selesai';
      vCopy.statusPerawatan = 'Pulang';
      vCopy.statusTindakLanjut = 'Sudah Selesai';
      vCopy.jadwalPemantauanBerikutnya = null;
    } else if (kondisi === 'Dirujuk' || monitoringData.rumahSakitRujukan) {
      const destHospital = (monitoringData.rumahSakitRujukan || '').trim();
      const originHospital = vCopy.rumahSakit;
      const statusDirujukTeks = destHospital ? `Dirujuk ke ${destHospital}` : 'Dirujuk ke RS Lain';

      vCopy.rumahSakitAsal = vCopy.rumahSakitAsal || originHospital;
      vCopy.rumahSakitTujuan = destHospital;
      vCopy.tanggalRujukan = monDate;
      vCopy.petugasAsalId = vCopy.petugasId;
      vCopy.petugasAsalNama = vCopy.namaPetugas;

      // Cari petugas tujuan
      const officers = this.getOfficers();
      const matchedOfficer = officers.find(
        (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some(
          (rs) => isHospitalNameMatch(rs, destHospital)
        )
      );
      if (matchedOfficer) {
        vCopy.petugasTujuanId = matchedOfficer.id;
        vCopy.petugasTujuanNama = matchedOfficer.nama;
      }

      vCopy.statusPemantauan = statusDirujukTeks;
      vCopy.kondisiTerakhir = statusDirujukTeks;
      vCopy.statusPerawatan = 'Rujukan';
      vCopy.isRujukanMasuk = true;
      vCopy.rujukanAccepted = false;
      vCopy.jadwalPemantauanBerikutnya = null;

      // Catat di riwayat rujukan
      const refItem = {
        id: `REF-${Date.now()}`,
        tanggal: monDate,
        dariRs: originHospital,
        keRs: destHospital,
        petugasAsalId: vCopy.petugasAsalId,
        petugasAsalNama: vCopy.petugasAsalNama,
        petugasTujuanId: vCopy.petugasTujuanId,
        petugasTujuanNama: vCopy.petugasTujuanNama,
        alasan: monitoringData.catatanTambahan || `Pasien dirujuk dari ${originHospital} ke ${destHospital}`,
        status: statusDirujukTeks
      };
      vCopy.riwayatRujukan = [...(vCopy.riwayatRujukan || []), refItem];

      // Catat di riwayat perawatan
      const newCareItem = {
        id: `CARE-REF-${Date.now()}`,
        tanggal: monDate,
        rumahSakit: destHospital,
        rumahSakitAsal: originHospital,
        jenisPerawatan: 'Rujukan',
        status: statusDirujukTeks,
        petugasId: vCopy.petugasTujuanId,
        petugasNama: vCopy.petugasTujuanNama,
        catatan: refItem.alasan
      };
      vCopy.riwayatPerawatan = [...(vCopy.riwayatPerawatan || []), newCareItem];
    } else {
      // Masih Dirawat / Rawat Inap / Luka Berat / Luka Ringan
      vCopy.statusPemantauan = 'Pemantauan Aktif';
      vCopy.jadwalPemantauanBerikutnya = new Date(new Date(monDate).getTime() + 72 * 60 * 60 * 1000).toISOString();
    }

    victims[index] = vCopy;
    this.saveVictims(victims);
    return vCopy;
  },

  /**
   * Pencatatan Khusus Korban MD (Meninggal Dunia)
   * Menyimpan tanggal kematian, jam kematian, nama petugas pencatat, dan waktu pencatatan sistem secara permanen.
   */
  async recordMeninggalDunia(victimId, { tanggalMeninggal, jamMeninggal, catatan = '', petugasId, petugasNama } = {}) {
    return this.addMonitoring(victimId, {
      kondisi: 'Meninggal Dunia',
      kondisiKorban: 'Meninggal Dunia',
      statusKonfirmasi: 'Terkonfirmasi',
      tanggalMeninggal,
      jamMeninggal,
      waktuMeninggal: tanggalMeninggal && jamMeninggal ? new Date(`${tanggalMeninggal}T${jamMeninggal}`).toISOString() : new Date().toISOString(),
      hasilPemantauan: catatan || `Korban dinyatakan Meninggal Dunia pada tanggal ${tanggalMeninggal} pukul ${jamMeninggal} WIB.`,
      catatanTambahan: catatan,
      petugasId,
      petugasNama,
      checklistTindakan: ['Verifikasi Berkas Medis Kematian', 'Koordinasi Ahli Waris Korban'],
      statusTindakLanjut: 'Sudah Selesai'
    });
  },

  /**
   * Pembaruan Khusus Tanggal & Jam Meninggal Dunia (MD)
   * Menyimpan tanggal kematian, jam kematian, nama petugas pencatat, dan waktu pencatatan sistem secara permanen.
   */
  updateMeninggalDunia(victimId, { tanggalMeninggal, jamMeninggal, catatan = '', dicatatOleh, petugasId } = {}) {
    if (!victimId) return null;
    const victims = this.getVictims();
    const index = victims.findIndex(
      (v) => String(v.id) === String(victimId) || String(v.caseId) === String(victimId) || v.nomorTiket === victimId
    );
    if (index === -1) return null;

    const vCopy = { ...victims[index] };
    if (tanggalMeninggal) vCopy.tanggalMeninggal = tanggalMeninggal;
    if (jamMeninggal) vCopy.jamMeninggal = jamMeninggal.replace(/\s*WIB/i, '').trim();
    if (vCopy.tanggalMeninggal && vCopy.jamMeninggal) {
      vCopy.waktuMeninggal = `${vCopy.tanggalMeninggal}T${vCopy.jamMeninggal}:00`;
    }
    if (dicatatOleh) vCopy.dicatatOleh = dicatatOleh;
    if (petugasId) vCopy.petugasPencatatId = petugasId;
    vCopy.waktuPencatatanMD = vCopy.waktuPencatatanMD || new Date().toISOString();
    vCopy.kondisiTerakhir = 'Meninggal Dunia';
    vCopy.status_kondisi = 'Meninggal Dunia';
    vCopy.statusPemantauan = MONITORING_STATUS.SELESAI_MD;
    vCopy.status_pemantauan = MONITORING_STATUS.SELESAI_MD;
    vCopy.statusPerawatan = 'Meninggal Dunia';
    vCopy.jadwalPemantauanBerikutnya = null;

    if (Array.isArray(vCopy.riwayatPerawatan)) {
      const mdItem = vCopy.riwayatPerawatan.find((r) => r.jenisPerawatan === 'Meninggal Dunia' || r.status === 'Meninggal Dunia');
      if (mdItem) {
        mdItem.tanggalMeninggal = vCopy.tanggalMeninggal;
        mdItem.jamMeninggal = vCopy.jamMeninggal;
        mdItem.dicatatOleh = vCopy.dicatatOleh;
        if (vCopy.waktuMeninggal) mdItem.tanggal = vCopy.waktuMeninggal;
      }
    }

    victims[index] = vCopy;
    this.saveVictims(victims);
    window.dispatchEvent(new CustomEvent('jr_victims_updated'));
    return vCopy;
  },

  /**
   * Konfirmasi Rawat Lanjutan:
   * Menangani kondisi pasien yang sudah pulang, kemudian menjalani rawat lanjutan
   * di RS yang sama atau di RS berbeda, tanpa membuat duplikasi entri korban.
   */
  confirmRawatLanjutan(victimId, { rumahSakit, tanggalMasuk, catatan, isSameHospital = true } = {}) {
    const victims = this.getVictims();
    const index = victims.findIndex((v) => v.id === victimId);
    if (index === -1) return null;

    const vCopy = { ...victims[index] };
    const nowIso = tanggalMasuk ? new Date(tanggalMasuk).toISOString() : new Date().toISOString();
    const originHospital = vCopy.rumahSakit;
    const targetHospital = (rumahSakit || originHospital).trim();
    const sameHospital = isSameHospital || (targetHospital.toLowerCase() === (originHospital || '').toLowerCase());

    // Cari penugasan petugas untuk rumah sakit tujuan
    const officers = this.getOfficers();
    const matchedOfficer = officers.find(
      (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some(
        (rs) => isHospitalNameMatch(rs, targetHospital)
      )
    );

    const newCareId = `CARE-LANJUT-${Date.now()}`;
    const newCareItem = {
      id: newCareId,
      tanggal: nowIso,
      rumahSakit: targetHospital,
      rumahSakitAsal: sameHospital ? null : originHospital,
      jenisPerawatan: 'Rawat Lanjutan',
      status: 'Masih Dirawat',
      petugasId: matchedOfficer ? matchedOfficer.id : vCopy.petugasId,
      petugasNama: matchedOfficer ? matchedOfficer.nama : vCopy.namaPetugas,
      catatan: catatan || (sameHospital
        ? `Pasien kembali masuk untuk rawat lanjutan di rumah sakit yang sama (${targetHospital}).`
        : `Pasien menjalani rawat lanjutan di ${targetHospital} (sebelumnya di ${originHospital}).`)
    };

    vCopy.riwayatPerawatan = [...(vCopy.riwayatPerawatan || []), newCareItem];

    // Tag seluruh aktivitas sebelumnya dengan episodeNumber agar tidak tercampur ke episode baru
    const prevActs = (vCopy.riwayatAktivitas || []).map((a) => ({
      ...a,
      episodeNumber: a.episodeNumber || 1,
      rumahSakit: a.rumahSakit || originHospital,
      isReadOnly: true
    }));
    const maxPrevTs = prevActs.reduce((mx, a) => {
      const ts = parseDateToTimestamp(a.waktuAktualKunjungan || a.tanggalKunjungan || a.tanggal || 0);
      return ts > mx ? ts : mx;
    }, 0);
    const rawNowTs = parseDateToTimestamp(nowIso);
    const effectiveActIso = (maxPrevTs > 0 && rawNowTs <= maxPrevTs)
      ? new Date(maxPrevTs + 1000).toISOString()
      : nowIso;
    const nextEpNum = prevActs.reduce((mx, a) => Math.max(mx, Number(a.episodeNumber) || 1), 1) + 1;

    // Buat juga entri log aktivasi pemantauan kembali (bukan kunjungan fisik agar tidak memanipulasi KPI/SLA)
    const actId = `ACT-${Date.now().toString().slice(-6)}`;
    const newAct = {
      id: actId,
      victimId,
      episodeNumber: nextEpNum,
      jenisAktivitas: 'Aktivasi Pemantauan Kembali (Rawat Lanjutan)',
      isNonVisitConfirmation: true,
      isReactivationLog: true,
      rumahSakit: targetHospital,
      tanggal: effectiveActIso,
      tanggalKunjungan: effectiveActIso,
      waktuAktualKunjungan: effectiveActIso,
      waktuPencatatanSistem: new Date().toISOString(),
      statusKunjungan: 'Selesai Tepat Waktu',
      status_kunjungan: 'Selesai Tepat Waktu',
      kondisiKorban: 'Rawat Inap',
      statusKonfirmasi: 'Terkonfirmasi',
      sumberInfo: 'Konfirmasi Rumah Sakit / Petugas',
      hasilKomunikasi: newCareItem.catatan,
      hasilPemantauan: newCareItem.catatan,
      tindakLanjut: 'Pemantauan berkala pasien rawat lanjutan',
      catatanTindakLanjut: 'Pemantauan berkala pasien rawat lanjutan',
      petugasId: newCareItem.petugasId,
      petugasNama: newCareItem.petugasNama
    };

    vCopy.riwayatAktivitas = [newAct, ...prevActs];

    if (!sameHospital) {
      vCopy.rumahSakitAsal = originHospital;
      vCopy.rumahSakit = targetHospital;
    }

    if (matchedOfficer) {
      vCopy.petugasId = matchedOfficer.id;
      vCopy.namaPetugas = matchedOfficer.nama;
    }

    if (vCopy.tanggalPulang) {
      vCopy.tanggalPulangSebelumnya = vCopy.tanggalPulang;
    }
    vCopy.isReactivated = true;
    vCopy.isNonVisitConfirmation = false;
    vCopy.kondisiTerakhir = 'Rawat Inap';
    vCopy.status_kondisi = 'Rawat Inap';
    vCopy.statusKonfirmasiKondisi = 'Terkonfirmasi';
    vCopy.statusPerawatan = 'Rawat Lanjutan';
    vCopy.statusPemantauan = MONITORING_STATUS.DALAM_PEMANTAUAN;
    vCopy.status_pemantauan = MONITORING_STATUS.DALAM_PEMANTAUAN;
    vCopy.tanggalPemantauanTerakhir = nowIso;
    vCopy.jadwalPemantauanBerikutnya = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    victims[index] = vCopy;
    this.saveVictims(victims);
    window.dispatchEvent(new CustomEvent('jr_victims_updated'));
    return vCopy;
  },

  /**
   * Konfirmasi Kondisi Akhir Korban Tanpa Kunjungan Fiktif:
   * Digunakan jika korban sudah pulang, meninggal dunia (MD), atau menolak jaminan JR
   * berdasarkan informasi terkonfirmasi dari RS/keluarga tanpa membuat riwayat kunjungan fisik fiktif.
   */
  confirmConditionWithoutVisit(victimId, {
    kondisi,
    tanggalPulang = null,
    tanggalMeninggal = null,
    jamMeninggal = null,
    tanggalPenolakan = null,
    keterangan = '',
    dicatatOleh = 'Petugas Jasa Raharja',
    petugasId = null
  } = {}) {
    if (!victimId) return null;
    const victims = this.getVictims();
    const index = victims.findIndex(
      (v) => String(v.id) === String(victimId) || String(v.caseId) === String(victimId) || v.nomorTiket === victimId
    );
    if (index === -1) return null;

    const vCopy = { ...victims[index] };
    const nowIso = new Date().toISOString();
    const actId = `CONF-${Date.now().toString().slice(-6)}`;

    vCopy.isNonVisitConfirmation = true;
    vCopy.isReactivated = false;
    vCopy.jadwalPemantauanBerikutnya = null;
    vCopy.activePendingVisit = null;
    vCopy.statusTindakLanjut = 'Sudah Selesai';

    let logSummary = '';
    let kondisiLabel = kondisi;

    if (kondisi === 'Meninggal Dunia') {
      vCopy.kondisiTerakhir = 'Meninggal Dunia';
      vCopy.status_kondisi = 'Meninggal Dunia';
      vCopy.statusPemantauan = MONITORING_STATUS.SELESAI_MD;
      vCopy.status_pemantauan = MONITORING_STATUS.SELESAI_MD;
      vCopy.statusPerawatan = 'Meninggal Dunia';
      vCopy.tanggalMeninggal = tanggalMeninggal || nowIso.split('T')[0];
      vCopy.jamMeninggal = (jamMeninggal || '12:00').replace(/\s*WIB/i, '').trim();
      vCopy.waktuMeninggal = `${vCopy.tanggalMeninggal}T${vCopy.jamMeninggal}:00`;
      vCopy.dicatatOleh = dicatatOleh;
      if (petugasId) vCopy.petugasPencatatId = petugasId;
      vCopy.waktuPencatatanMD = nowIso;
      kondisiLabel = 'Meninggal Dunia';
      logSummary = `Konfirmasi tanpa kunjungan: Korban dinyatakan Meninggal Dunia pada ${vCopy.tanggalMeninggal} pukul ${vCopy.jamMeninggal} WIB. ${keterangan || ''}`.trim();
    } else if (kondisi === 'Tidak Bersedia Menggunakan Jaminan Jasa Raharja') {
      vCopy.isPenolakanJaminanJR = true;
      vCopy.tanggalPenolakanJaminan = tanggalPenolakan || nowIso.split('T')[0];
      vCopy.keteranganPenolakanJaminan = keterangan || 'Korban / keluarga menyatakan tidak bersedia menggunakan jaminan Jasa Raharja.';
      vCopy.kondisiTerakhir = 'Tidak Bersedia Menggunakan Jaminan Jasa Raharja';
      vCopy.status_kondisi = 'Tidak Bersedia Menggunakan Jaminan Jasa Raharja';
      vCopy.statusPemantauan = MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA;
      vCopy.status_pemantauan = MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA;
      vCopy.statusPerawatan = 'Tidak Bersedia Jaminan JR';
      kondisiLabel = 'Tidak Bersedia Menggunakan Jaminan Jasa Raharja';
      logSummary = `Konfirmasi tanpa kunjungan: Penolakan Jaminan JR (${vCopy.tanggalPenolakanJaminan}). ${vCopy.keteranganPenolakanJaminan}`.trim();
    } else {
      // Selesai Pulang
      vCopy.kondisiTerakhir = 'Sudah Pulang';
      vCopy.status_kondisi = 'Sudah Pulang';
      vCopy.statusPemantauan = MONITORING_STATUS.SELESAI_PULANG;
      vCopy.status_pemantauan = MONITORING_STATUS.SELESAI_PULANG;
      vCopy.statusPerawatan = 'Pulang';
      vCopy.tanggalPulang = tanggalPulang || nowIso.split('T')[0];
      vCopy.keteranganPulang = keterangan || 'Korban telah diperbolehkan pulang oleh pihak rumah sakit.';
      kondisiLabel = 'Sudah Pulang';
      logSummary = `Konfirmasi tanpa kunjungan: Korban diperbolehkan pulang RS pada ${vCopy.tanggalPulang}. ${keterangan || ''}`.trim();
    }

    const logAct = {
      id: actId,
      victimId: vCopy.id,
      jenisAktivitas: 'Konfirmasi Kondisi Tanpa Kunjungan',
      isNonVisitConfirmation: true,
      tanggal: nowIso,
      waktuPencatatanSistem: nowIso,
      statusKunjungan: 'Konfirmasi Non-Kunjungan',
      kondisiKorban: kondisiLabel,
      statusKonfirmasi: 'Terkonfirmasi',
      sumberInfo: 'Konfirmasi Rumah Sakit / Keluarga',
      hasilKomunikasi: logSummary,
      hasilPemantauan: logSummary,
      tindakLanjut: 'Pemantauan selesai',
      petugasId: petugasId || vCopy.petugasId,
      petugasNama: dicatatOleh || vCopy.namaPetugas
    };

    vCopy.riwayatAktivitas = [logAct, ...(vCopy.riwayatAktivitas || [])];
    vCopy.riwayatPerawatan = [
      ...(vCopy.riwayatPerawatan || []),
      {
        id: `CARE-CONF-${Date.now()}`,
        tanggal: nowIso,
        rumahSakit: vCopy.rumahSakit,
        jenisPerawatan: kondisiLabel,
        status: kondisiLabel,
        petugasId: petugasId || vCopy.petugasId,
        petugasNama: dicatatOleh || vCopy.namaPetugas,
        catatan: logSummary
      }
    ];

    victims[index] = vCopy;
    this.saveVictims(victims);
    window.dispatchEvent(new CustomEvent('jr_victims_updated'));
    return vCopy;
  },

  /**
   * Pencatatan Khusus Korban MD (Meninggal Dunia)
   * Menyimpan tanggal kematian, jam kematian, nama petugas pencatat, dan waktu pencatatan sistem secara permanen.
   */
  async recordMeninggalDunia(victimId, { tanggalMeninggal, jamMeninggal, catatan = '', petugasId, petugasNama } = {}) {
    return this.addMonitoring(victimId, {
      kondisi: 'Meninggal Dunia',
      kondisiKorban: 'Meninggal Dunia',
      statusKonfirmasi: 'Terkonfirmasi',
      tanggalMeninggal,
      jamMeninggal,
      waktuMeninggal: tanggalMeninggal && jamMeninggal ? new Date(`${tanggalMeninggal}T${jamMeninggal}`).toISOString() : new Date().toISOString(),
      hasilPemantauan: catatan || `Korban dinyatakan Meninggal Dunia pada tanggal ${tanggalMeninggal} pukul ${jamMeninggal} WIB.`,
      catatanTambahan: catatan,
      petugasId,
      petugasNama,
      checklistTindakan: ['Verifikasi Berkas Medis Kematian', 'Koordinasi Ahli Waris Korban'],
      statusTindakLanjut: 'Sudah Selesai'
    });
  },

  /**
   * Pembaruan Khusus Tanggal & Jam Meninggal Dunia (MD)
   * Menyimpan tanggal kematian, jam kematian, nama petugas pencatat, dan waktu pencatatan sistem secara permanen.
   */
  updateMeninggalDunia(victimId, { tanggalMeninggal, jamMeninggal, catatan = '', dicatatOleh, petugasId } = {}) {
    if (!victimId) return null;
    const victims = this.getVictims();
    const index = victims.findIndex(
      (v) => String(v.id) === String(victimId) || String(v.caseId) === String(victimId) || v.nomorTiket === victimId
    );
    if (index === -1) return null;

    const vCopy = { ...victims[index] };
    if (tanggalMeninggal) vCopy.tanggalMeninggal = tanggalMeninggal;
    if (jamMeninggal) vCopy.jamMeninggal = jamMeninggal.replace(/\s*WIB/i, '').trim();
    if (vCopy.tanggalMeninggal && vCopy.jamMeninggal) {
      vCopy.waktuMeninggal = `${vCopy.tanggalMeninggal}T${vCopy.jamMeninggal}:00`;
    }
    if (dicatatOleh) vCopy.dicatatOleh = dicatatOleh;
    if (petugasId) vCopy.petugasPencatatId = petugasId;
    vCopy.waktuPencatatanMD = vCopy.waktuPencatatanMD || new Date().toISOString();
    vCopy.kondisiTerakhir = 'Meninggal Dunia';
    vCopy.status_kondisi = 'Meninggal Dunia';
    vCopy.statusPemantauan = MONITORING_STATUS.SELESAI_MD;
    vCopy.status_pemantauan = MONITORING_STATUS.SELESAI_MD;
    vCopy.statusPerawatan = 'Meninggal Dunia';
    vCopy.jadwalPemantauanBerikutnya = null;

    if (Array.isArray(vCopy.riwayatPerawatan)) {
      const mdItem = vCopy.riwayatPerawatan.find((r) => r.jenisPerawatan === 'Meninggal Dunia' || r.status === 'Meninggal Dunia');
      if (mdItem) {
        mdItem.tanggalMeninggal = vCopy.tanggalMeninggal;
        mdItem.jamMeninggal = vCopy.jamMeninggal;
        mdItem.dicatatOleh = vCopy.dicatatOleh;
        if (vCopy.waktuMeninggal) mdItem.tanggal = vCopy.waktuMeninggal;
      }
    }

    victims[index] = vCopy;
    this.saveVictims(victims);
    window.dispatchEvent(new CustomEvent('jr_victims_updated'));
    return vCopy;
  },

  /**
   * Konfirmasi Rujukan:
   * Menangani kondisi pasien yang masih dirawat dan dipindahkan/dirujuk ke RS lain,
   * sekaligus menyinkronkan ke backend POST /api/visits/:visitId/submit agar case_referrals & reminder bot aktif.
   */
  async confirmRujukan(victimId, { rumahSakitTujuan, tanggalRujukan, catatan } = {}) {
    const victims = this.getVictims();
    const index = victims.findIndex((v) => v.id === victimId);
    if (index === -1) return null;

    const vCopy = { ...victims[index] };
    const nowIso = tanggalRujukan ? new Date(tanggalRujukan).toISOString() : new Date().toISOString();
    const originHospital = vCopy.rumahSakit;
    const destHospital = (rumahSakitTujuan || originHospital).trim();
    const noteText = catatan || `Pasien dirujuk dari ${originHospital} ke ${destHospital} untuk fasilitas medis lanjutan.`;

    // Cari penugasan petugas untuk RS tujuan
    const officers = this.getOfficers();
    const matchedOfficer = officers.find(
      (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some(
        (rs) => isHospitalNameMatch(rs, destHospital)
      )
    );

    const newCareId = `CARE-REF-${Date.now()}`;
    const newCareItem = {
      id: newCareId,
      tanggal: nowIso,
      rumahSakit: destHospital,
      rumahSakitAsal: originHospital,
      jenisPerawatan: 'Rujukan',
      status: 'Dirujuk',
      petugasId: matchedOfficer ? matchedOfficer.id : null,
      petugasNama: matchedOfficer ? matchedOfficer.nama : 'Belum Ada Petugas Penanggung Jawab',
      catatan: noteText
    };

    vCopy.riwayatPerawatan = [...(vCopy.riwayatPerawatan || []), newCareItem];

    // Buat entri aktivitas pemantauan rujukan
    const actId = `ACT-${Date.now().toString().slice(-6)}`;
    const newAct = {
      id: actId,
      victimId,
      jenisAktivitas: 'Rujukan ke RS Lain',
      tanggal: nowIso,
      tanggalKunjungan: nowIso,
      waktuAktualKunjungan: nowIso,
      waktuPencatatanSistem: new Date().toISOString(),
      statusKunjungan: 'Selesai Tepat Waktu',
      status_kunjungan: 'Selesai Tepat Waktu',
      kondisiKorban: 'Dirujuk',
      statusKonfirmasi: 'Terkonfirmasi',
      sumberInfo: 'Fasilitas Kesehatan / Bot WhatsApp',
      hasilKomunikasi: newCareItem.catatan,
      hasilPemantauan: newCareItem.catatan,
      tindakLanjut: `Pemantauan dilanjutkan di ${destHospital}`,
      catatanTindakLanjut: `Pemantauan dilanjutkan di ${destHospital}`,
      rumahSakitRujukan: destHospital,
      petugasId: newCareItem.petugasId,
      petugasNama: newCareItem.petugasNama
    };

    vCopy.riwayatAktivitas = [newAct, ...(vCopy.riwayatAktivitas || [])];
    vCopy.rumahSakitAsal = originHospital;
    vCopy.rumahSakitTujuan = destHospital;
    vCopy.rumahSakit = destHospital; // Pasien resmi berpindah faskes aktif ke RS Tujuan rujukan
    vCopy.tanggalRujukan = nowIso;
    vCopy.petugasAsalId = vCopy.petugasId;
    vCopy.petugasAsalNama = vCopy.namaPetugas;

    if (matchedOfficer) {
      vCopy.petugasId = matchedOfficer.id;
      vCopy.namaPetugas = matchedOfficer.nama;
      vCopy.backendOfficerId = matchedOfficer.backendOfficerId || matchedOfficer.backendId || null;
      vCopy.petugasTujuanId = matchedOfficer.id;
      vCopy.petugasTujuanNama = matchedOfficer.nama;
    } else {
      vCopy.petugasId = null;
      vCopy.namaPetugas = 'Belum Ada Petugas Penanggung Jawab';
      vCopy.petugasTujuanId = null;
      vCopy.petugasTujuanNama = 'Belum Ditugaskan';
    }

    const statusDirujukTeks = `Dirujuk ke ${destHospital}`;
    vCopy.kondisiTerakhir = statusDirujukTeks;
    vCopy.statusKonfirmasiKondisi = 'Terkonfirmasi';
    vCopy.statusPerawatan = 'Rujukan';
    vCopy.statusRujukan = statusDirujukTeks;
    vCopy.statusPemantauan = statusDirujukTeks; // Keluar dari pemantauan aktif RS asal!
    vCopy.isRujukanMasuk = true;
    vCopy.rujukanAccepted = false;

    // Catat di riwayat rujukan
    const refItem = {
      id: `REF-${Date.now()}`,
      tanggal: nowIso,
      dariRs: originHospital,
      keRs: destHospital,
      petugasAsalId: vCopy.petugasAsalId,
      petugasAsalNama: vCopy.petugasAsalNama,
      petugasTujuanId: vCopy.petugasTujuanId,
      petugasTujuanNama: vCopy.petugasTujuanNama,
      alasan: catatan || `Pasien dirujuk dari ${originHospital} ke ${destHospital}`,
      status: statusDirujukTeks
    };
    vCopy.riwayatRujukan = [...(vCopy.riwayatRujukan || []), refItem];
    vCopy.tanggalPemantauanTerakhir = nowIso;
    vCopy.jadwalPemantauanBerikutnya = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    // Sinkronkan ke backend Express (POST /api/visits/:visitId/submit) sebelum commit lokal & notifikasi
    const caseId = vCopy.caseId || vCopy.backendCaseId || (Number.isInteger(Number(vCopy.id)) && Number(vCopy.id) > 0 ? Number(vCopy.id) : null);
    let syncedVictim = null;
    if (caseId && api.getAuthToken()) {
      let visitId = vCopy.activeVisitId;
      if (!visitId) {
        const detailRes = await api.getCaseById(caseId).catch(() => null);
        const pendingVisit = (detailRes?.visits || []).find((vis) => vis.status_kunjungan === 'Menunggu');
        visitId = pendingVisit?.id || null;
      }

      const hospitals = await this.getOrFetchHospitals().catch(() => []);
      const destLower = destHospital.toLowerCase();
      const targetHospital =
        hospitals.find((h) => (typeof h === 'string' ? h : (h?.nama_rs || '')).toLowerCase() === destLower) ||
        hospitals.find((h) => isHospitalNameMatch(typeof h === 'string' ? h : (h?.nama_rs || ''), destHospital));

      if (!targetHospital?.id) {
        throw new Error(`Rumah sakit tujuan "${destHospital}" tidak ditemukan di master rumah sakit backend.`);
      }
      if (!visitId) {
        throw new Error('Tidak ada jadwal kunjungan aktif (Menunggu) untuk memproses rujukan ke server.');
      }

      const formData = new FormData();
      formData.append('case_id', String(caseId));
      formData.append('cek_komunikasi_keluarga', 'true');
      formData.append('cek_edukasi_santunan', 'true');
      formData.append('cek_arahan_lp', 'true');
      formData.append('catatan_kondisi', noteText);
      formData.append('status_kondisi_terbaru', 'Dirujuk ke RS Lain');
      formData.append('lat_petugas', String(vCopy.hospital_lat ?? '0.5071'));
      formData.append('lng_petugas', String(vCopy.hospital_lng ?? '101.4478'));
      formData.append('rujukan_hospital_id', String(targetHospital.id));
      formData.append('alasan_rujukan', noteText);
      formData.append('catatan_rujukan', noteText);

      const submitRes = await api.submitVisit(visitId, formData);
      const backendAssignedOfficer = submitRes?.referral?.assigned_officer;
      if (backendAssignedOfficer) {
        vCopy.petugasTujuanNama = backendAssignedOfficer.nama;
        vCopy.namaPetugas = backendAssignedOfficer.nama;
        vCopy.backendOfficerId = backendAssignedOfficer.id;
      }
      syncedVictim = await this.fetchVictimDetail(caseId).catch(() => null);
    }

    // Kirim notifikasi lokal ke petugas penanggung jawab RS Tujuan (RS B)
    this.addNotification({
      type: 'RUJUKAN_MASUK',
      title: 'Rujukan Korban Masuk',
      message: `Korban ${vCopy.nama} telah dirujuk dari ${originHospital} ke ${destHospital}.`,
      victimId: vCopy.id,
      victimName: vCopy.nama,
      victimNik: vCopy.nik,
      rumahSakitAsal: originHospital,
      rumahSakitTujuan: destHospital,
      officerId: vCopy.petugasTujuanId,
      officerName: vCopy.petugasTujuanNama,
      senderOfficerName: vCopy.petugasAsalNama || 'Petugas RS Asal'
    });

    if (syncedVictim) return syncedVictim;

    victims[index] = vCopy;
    this.saveVictims(victims);
    return vCopy;
  },

  /**
   * Menerima rujukan masuk dan memulai pemantauan aktif di rumah sakit tujuan
   */
  acceptRujukan(victimId, officerProfile) {
    const victims = this.getVictims();
    const index = victims.findIndex((v) => v.id === victimId);
    if (index === -1) return null;

    const vCopy = { ...victims[index] };
    const originHospital = vCopy.rumahSakitAsal || (vCopy.rumahSakit !== vCopy.rumahSakitTujuan ? vCopy.rumahSakit : null) || 'RS Asal';

    // Jangan ubah RS asal menjadi RS tujuan
    vCopy.rumahSakitAsal = originHospital;
    if (vCopy.rumahSakitTujuan) {
      vCopy.rumahSakit = vCopy.rumahSakitTujuan;
    }
    vCopy.isRujukanMasuk = false;
    vCopy.rujukanAccepted = true;
    if (officerProfile) {
      vCopy.petugasId = officerProfile.id || vCopy.petugasId;
      vCopy.namaPetugas = officerProfile.nama || vCopy.namaPetugas;
    }
    vCopy.kondisiTerakhir = 'Masih Dirawat';
    vCopy.statusPemantauan = 'Pemantauan Aktif';
    vCopy.statusPerawatan = 'Rujukan Diterima';

    const acceptCareItem = {
      id: `CARE-ACC-${Date.now()}`,
      tanggal: new Date().toISOString(),
      rumahSakit: vCopy.rumahSakit,
      rumahSakitAsal: vCopy.rumahSakitAsal,
      jenisPerawatan: 'Rujukan Diterima',
      status: 'Pemantauan Aktif di RS Rujukan',
      petugasId: vCopy.petugasId,
      petugasNama: vCopy.namaPetugas,
      catatan: `Rujukan diterima oleh ${vCopy.namaPetugas}. Pemantauan pasien aktif dilanjutkan di ${vCopy.rumahSakit} (Dirujuk dari ${vCopy.rumahSakitAsal}).`
    };
    vCopy.riwayatPerawatan = [...(vCopy.riwayatPerawatan || []), acceptCareItem];

    victims[index] = vCopy;
    this.saveVictims(victims);
    return vCopy;
  },

  /**
   * Correct an activity record with audit trail
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

    victims[index] = victim;
    this.saveVictims(victims);
    return victim;
  },

  /**
   * Reset data to initial dataset & sync live from backend
   */
  resetData() {
    safeSetItem(STORAGE_KEY_VICTIMS, JSON.stringify([]));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('jr_victims_updated'));
    }
    this.syncWithBackend(true).catch(() => { });
    return [];
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
   * Get all registered officers (sinkron dari backend API)
   */
  getOfficers() {
    const DUMMY_OFFICER_FILTER = [
      'citra dewi',
      'budi santoso',
      'eko prasetyo',
      'doni setiawan',
      'maya anggraini',
      'hendra pratama',
      'siti nurhaliza',
      'dimas anggara',
      'ahmad fauzi',
      'adi putra',
      'andi pratama',
      'rina kusuma',
      'dedi saputra',
      'sari wulandari',
      'bagus santoso',
      'lestari dewi'
    ];

    try {
      const data = safeGetItem(STORAGE_KEY_OFFICERS);
      if (data !== null) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleanOfficers = parsed.filter((o) => {
            const lowerName = (o.nama || '').toLowerCase().trim();
            if (!lowerName) return false;
            return !DUMMY_OFFICER_FILTER.some((d) => lowerName.includes(d));
          });

          if (cleanOfficers.length !== parsed.length) {
            safeSetItem(STORAGE_KEY_OFFICERS, JSON.stringify(cleanOfficers));
          }
          return cleanOfficers;
        }
      }
    } catch (e) {
      console.error('[storageService] Error parsing officers:', e);
    }

    safeSetItem(STORAGE_KEY_OFFICERS, JSON.stringify(INITIAL_OFFICERS));
    return [...INITIAL_OFFICERS];
  },

  /**
   * Simpan seluruh data petugas ke database lokal dan broadcast event
   */
  saveOfficers(officers) {
    try {
      safeSetItem(STORAGE_KEY_OFFICERS, JSON.stringify(officers));
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('jr_officers_updated'));
      }
      return true;
    } catch (e) {
      console.error('[storageService] Error saving officers:', e);
      return false;
    }
  },

  /**
   * Tambah petugas baru ke database dan broadcast perubahan ke seluruh sistem
   */
  addOfficer(officerData) {
    const currentOfficers = this.getOfficers();

    // Generate ID unik otomatis: PET-02, PET-03, dst
    let maxNum = 0;
    currentOfficers.forEach((o) => {
      const match = (o.id || '').match(/PET-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    const nextId = `PET-${String(maxNum + 1).padStart(2, '0')}`;

    // Buat inisial avatar dari nama
    const nameParts = (officerData.nama || 'Petugas').trim().split(/\s+/);
    const avatar = nameParts.length >= 2
      ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
      : nameParts[0].slice(0, 2).toUpperCase();

    const newOfficer = {
      id: nextId,
      backendId: officerData.backendId || null,
      backendOfficerId: officerData.backendId || null,
      username: officerData.username || null,
      nama: officerData.nama.trim(),
      nip: officerData.nip ? officerData.nip.trim() : '—',
      jabatan: officerData.jabatan ? officerData.jabatan.trim() : 'Mobile Service Officer',
      wilayah: officerData.wilayah ? officerData.wilayah.trim() : 'Pekanbaru Kota',
      telepon: officerData.telepon ? officerData.telepon.trim() : '—',
      email: officerData.email ? officerData.email.trim() : '—',
      avatar,
      status: officerData.status || 'Aktif Lapangan',
      kapasitas: officerData.kapasitas || '0/10 Kasus',
      plottingRs: Array.isArray(officerData.plottingRs)
        ? officerData.plottingRs
        : [],
      bebanKasusPct: 0
    };

    const updated = [...currentOfficers, newOfficer];
    this.saveOfficers(updated);
    return newOfficer;
  },

  /**
   * Ambil data petugas berdasarkan ID
   */
  getOfficerById(id) {
    const officers = this.getOfficers();
    return officers.find((o) => String(o.id) === String(id)) || null;
  },

  /**
   * Update data petugas dan penugasan rumah sakit
   */
  updateOfficer(id, updatedData) {
    const currentOfficers = this.getOfficers();
    const index = currentOfficers.findIndex((o) => String(o.id) === String(id));
    if (index === -1) return null;

    const existing = currentOfficers[index];

    let avatar = existing.avatar;
    if (updatedData.nama && updatedData.nama !== existing.nama) {
      const parts = updatedData.nama.trim().split(/\s+/);
      avatar = parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();
    }

    // Catat riwayat email lama jika email mengalami perubahan
    const prevEmails = Array.isArray(existing.previousEmails) ? [...existing.previousEmails] : [];
    if (existing.email && existing.email !== '—' && updatedData.email && updatedData.email !== '—') {
      const oldEmailLower = existing.email.toLowerCase().trim();
      const newEmailLower = updatedData.email.toLowerCase().trim();
      if (oldEmailLower !== newEmailLower && !prevEmails.includes(oldEmailLower)) {
        prevEmails.push(oldEmailLower);
        try {
          const retired = JSON.parse(safeGetItem('jr_retired_officer_emails') || '[]');
          if (!retired.includes(oldEmailLower)) {
            retired.push(oldEmailLower);
            safeSetItem('jr_retired_officer_emails', JSON.stringify(retired));
          }
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(`jr_officer_email_to_username_${oldEmailLower}`);
          }
        } catch {
          // ignore
        }
      }
    }

    // UPDATE in-place tanpa mengubah ID petugas atau menciptakan akun baru
    const updatedOfficer = {
      ...existing,
      ...updatedData,
      id: existing.id,
      backendId: existing.backendId,
      backendOfficerId: existing.backendOfficerId,
      username: existing.username,
      previousEmails: prevEmails,
      avatar: avatar || existing.avatar,
      status: updatedData.status || existing.status || 'Aktif Lapangan',
      plottingRs: Array.isArray(updatedData.plottingRs)
        ? updatedData.plottingRs
        : existing.plottingRs
    };

    currentOfficers[index] = updatedOfficer;
    this.saveOfficers(currentOfficers);

    // Sinkronkan juga ke profil sesi akun yang sedang aktif jika petugas yang diedit adalah user yang sedang login
    try {
      const currentUser = this.getCurrentUser();
      if (currentUser && currentUser.profile) {
        const p = currentUser.profile;
        const isCurrent =
          String(p.id) === String(id) ||
          (p.backendOfficerId && String(p.backendOfficerId) === String(existing.backendOfficerId || existing.id)) ||
          (p.nama && existing.nama && p.nama.trim().toLowerCase() === existing.nama.trim().toLowerCase()) ||
          (p.username && existing.username && p.username.trim().toLowerCase() === existing.username.trim().toLowerCase());

        if (isCurrent) {
          currentUser.profile = {
            ...p,
            ...updatedData,
            email: (updatedData.email && updatedData.email !== '—') ? updatedData.email : p.email,
            telepon: (updatedData.telepon && updatedData.telepon !== '—') ? updatedData.telepon : p.telepon,
            nama: updatedData.nama || p.nama,
            nip: (updatedData.nip && updatedData.nip !== '—') ? updatedData.nip : p.nip,
            wilayah: updatedData.wilayah || p.wilayah,
            jabatan: updatedData.jabatan || p.jabatan,
            plottingRs: Array.isArray(updatedData.plottingRs) ? updatedData.plottingRs : p.plottingRs
          };
          this.setCurrentUser(currentUser);
        }
      }
    } catch {
      // Abaikan jika tidak ada user aktif di local storage
    }

    // Re-evaluasi penugasan korban berdasarkan relasi rumah sakit terbaru
    const victims = this.getVictims();
    let victimsUpdated = false;
    const nextVictims = victims.map((v) => {
      // Jika korban milik petugas ini dan nama petugas diperbarui
      if (v.petugasId === id && updatedData.nama && v.namaPetugas !== updatedData.nama) {
        victimsUpdated = true;
        return { ...v, namaPetugas: updatedData.nama };
      }
      // Jika petugas dijadikan Nonaktif, lepaskan penugasan korban
      if (v.petugasId === id && updatedOfficer.status === 'Nonaktif') {
        victimsUpdated = true;
        return { ...v, petugasId: null, namaPetugas: 'Belum Ada Petugas Penanggung Jawab' };
      }
      // Jika korban belum ada penugasan atau dilepas, cek apakah RS korban ada di plottingRs petugas aktif ini
      if ((!v.petugasId || v.namaPetugas === 'Belum Ada Petugas Penanggung Jawab' || v.namaPetugas === 'Belum Ditugaskan') && updatedOfficer.status !== 'Nonaktif') {
        const vRs = (v.rumahSakit || '').toLowerCase().trim();
        if (updatedOfficer.plottingRs.some((rs) => rs.toLowerCase().trim() === vRs)) {
          victimsUpdated = true;
          return { ...v, petugasId: updatedOfficer.id, namaPetugas: updatedOfficer.nama };
        }
      }
      return v;
    });

    if (victimsUpdated) {
      this.saveVictims(nextVictims);
    }

    return updatedOfficer;
  },

  /**
   * Hapus petugas dari sistem dan alihkan tanggung jawab korban ke petugas aktif yang tersisa
   */
  deleteOfficer(id) {
    const currentOfficers = this.getOfficers();
    const officerToDelete = currentOfficers.find((o) => String(o.id) === String(id));
    if (!officerToDelete) return false;

    // Filter petugas
    const updatedOfficers = currentOfficers.filter((o) => String(o.id) !== String(id));
    const fallbackOfficer = updatedOfficers[0] || null;

    // Alihkan korban yang sebelumnya dipegang oleh petugas ini ke petugas fallback jika ada
    const victims = this.getVictims();
    let victimsUpdated = false;
    const updatedVictims = victims.map((v) => {
      if (v.petugasId === id || v.namaPetugas === officerToDelete.nama) {
        victimsUpdated = true;
        return {
          ...v,
          petugasId: fallbackOfficer ? fallbackOfficer.id : null,
          namaPetugas: fallbackOfficer ? fallbackOfficer.nama : 'Belum Ada Petugas Penanggung Jawab'
        };
      }
      return v;
    });

    if (victimsUpdated) {
      this.saveVictims(updatedVictims);
    }

    this.saveOfficers(updatedOfficers);
    return true;
  },

  /**
   * Get/Set current user role & session
   */
  getCurrentUser() {
    try {
      const data = safeGetItem(STORAGE_KEY_CURRENT_USER);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed && parsed.role) {
          if (parsed.profile?.password) {
            delete parsed.profile.password;
          }
          return parsed;
        }
      }
    } catch (e) {
      console.error('[storageService] Error parsing current user:', e);
    }

    return null;
  },

  setCurrentUser(user) {
    if (!user) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
      }
      return;
    }
    const safeUser = JSON.parse(JSON.stringify(user));
    if (safeUser.profile && safeUser.profile.password) {
      delete safeUser.profile.password;
    }
    safeSetItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(safeUser));
  },

  /**
   * Notification storage and real-time event dispatching
   */
  getNotifications() {
    try {
      const data = safeGetItem(STORAGE_KEY_NOTIFICATIONS);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('[storageService] Error parsing notifications:', e);
    }
    return [];
  },

  saveNotifications(notifs) {
    safeSetItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify(notifs));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('jr_notifications_updated'));
    }
  },

  addNotification(notif) {
    const notifs = this.getNotifications();
    const newNotif = {
      id: notif.id || `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type: notif.type || 'RUJUKAN_MASUK',
      title: notif.title || 'Rujukan Korban Masuk',
      message: notif.message || '',
      victimId: notif.victimId,
      victimName: notif.victimName || '',
      victimNik: notif.victimNik || '',
      rumahSakitAsal: notif.rumahSakitAsal || '',
      rumahSakitTujuan: notif.rumahSakitTujuan || '',
      officerId: notif.officerId || null,
      officerName: notif.officerName || '',
      senderOfficerName: notif.senderOfficerName || '',
      read: false,
      createdAt: notif.createdAt || new Date().toISOString()
    };
    const updated = [newNotif, ...notifs];
    this.saveNotifications(updated);
    return newNotif;
  },

  markNotificationAsRead(notifId) {
    const notifs = this.getNotifications();
    const updated = notifs.map((n) => (n.id === notifId ? { ...n, read: true } : n));
    this.saveNotifications(updated);
    return updated;
  },

  markAllNotificationsAsRead(officerId = null) {
    const notifs = this.getNotifications();
    const updated = notifs.map((n) => {
      if (!officerId || n.officerId === officerId || !n.officerId) {
        return { ...n, read: true };
      }
      return n;
    });
    this.saveNotifications(updated);
    return updated;
  },

  clearNotifications() {
    this.saveNotifications([]);
  },

  /**
   * Calculate aggregated metrics distinguishing unique victims from activities
   */
  getAggregatedMetrics(officerId = null) {
    const victims = officerId ? this.getVictimsByOfficer(officerId) : this.getVictims();

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

export const isOfficerAssignedToVictim = (officer, victim, allOfficers) =>
  storageService.isOfficerAssignedToVictim(officer, victim, allOfficers);

export const getVictimsByOfficer = (officerIdentifier) =>
  storageService.getVictimsByOfficer(officerIdentifier);

// Listener lintas-tab / window browser untuk menjamin data selalu sinkron antara Petugas dan Kabag
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY_VICTIMS) {
      window.dispatchEvent(new Event('jr_victims_updated'));
    } else if (event.key === STORAGE_KEY_OFFICERS) {
      window.dispatchEvent(new Event('jr_officers_updated'));
    }
  });
}
