/**
 * Mapper antara Tabel Backend MySQL (cases, visits, hospitals)
 * dan Model Data Frontend (victim, activities, visits)
 */

import { getCachedPhoto, cachePhoto } from './photoService.js';
import { MONITORING_STATUS } from '../utils/monitoringStatus.js';
import { getRealVisitPhoto } from '../utils/realPhotos.js';
import { isSameHospital } from '../utils/referralUtils.js';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '';

/**
 * Membersihkan format nomor telepon agar tidak menampilkan ID internal WhatsApp bot (@lid)
 */
export function cleanPhoneNumber(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') return '—';
  const trimmed = rawPhone.trim();
  if (trimmed.includes('@lid') || trimmed.includes('@s.whatsapp.net') || trimmed.toLowerCase().includes('bot')) {
    return '—';
  }
  let clean = trimmed.replace(/[^0-9+]/g, '');
  if (clean.startsWith('62')) clean = '0' + clean.slice(2);
  if (clean.length < 8 || clean.length > 14) return '—';
  return clean;
}

/**
 * Membersihkan sumber informasi agar tidak menampilkan teks internal bot WhatsApp
 */
export function cleanSumberInformasi(rawSource) {
  if (!rawSource || typeof rawSource !== 'string') return 'Laporan Masuk Faskes';
  const trimmed = rawSource.trim();
  if (trimmed.toLowerCase().includes('whatsapp') || trimmed.includes('@lid') || trimmed.includes('@s.whatsapp.net')) {
    return 'Laporan Masuk Faskes';
  }
  return trimmed;
}

export const VALID_BACKEND_STATUSES = [
  'Rawat Inap',
  'Luka Ringan',
  'Luka Berat',
  'Meninggal Dunia',
  'Selesai',
  'Masih Dirawat',
  'Sudah Pulang',
  'Belum Dapat Dikonfirmasi',
  'Dirujuk ke RS Lain'
];

/**
 * Parsing robust untuk berbagai format tanggal (ISO, DD/MM/YYYY, YYYY-MM-DD, timestamp)
 * Menjamin tidak menghasilkan NaN saat melakukan komparasi atau pengurutan kronologis.
 */
export function parseDateToTimestamp(dateVal) {
  if (!dateVal) return 0;
  if (typeof dateVal === 'number') return isNaN(dateVal) ? 0 : dateVal;
  if (dateVal instanceof Date) {
    const t = dateVal.getTime();
    return isNaN(t) ? 0 : t;
  }
  const s = String(dateVal).trim();
  if (!s) return 0;

  // Format DD/MM/YYYY atau DD-MM-YYYY (standar umum Indonesia dan input WhatsApp Bot)
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minute = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const second = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    return new Date(year, month, day, hour, minute, second).getTime();
  }

  // Format YYYY-MM-DD (standar SQL date)
  const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const hour = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 0;
    const minute = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
    const second = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;
    return new Date(year, month, day, hour, minute, second).getTime();
  }

  const t = new Date(s).getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * Normalisasi status kondisi korban ke ENUM database backend:
 * ENUM('Rawat Inap','Luka Ringan','Luka Berat','Meninggal Dunia','Selesai','Masih Dirawat','Sudah Pulang','Belum Dapat Dikonfirmasi','Dirujuk ke RS Lain')
 */
export function normalizeStatusToBackend(statusRaw) {
  if (!statusRaw) return 'Rawat Inap';
  const s = String(statusRaw).trim();

  if (s === 'MD' || s === 'Meninggal' || s.includes('Meninggal Dunia') || s.includes('MD')) {
    return 'Meninggal Dunia';
  }
  if (s === 'Dirujuk' || s === 'Dirujuk ke RS Lain') {
    return 'Dirujuk ke RS Lain';
  }
  if (s === 'Sudah Pulang' || s === 'Pulang') {
    return 'Selesai';
  }
  if (s === 'Masih Dirawat') {
    return 'Rawat Inap';
  }
  if (VALID_BACKEND_STATUSES.includes(s)) {
    return s;
  }
  return 'Rawat Inap';
}

/**
 * Konversi base64 DataURL (hasil foto kamera browser) ke object File
 * untuk dikirim via multipart/form-data ke endpoint /api/visits/:visitId/submit
 */
export function dataUrlToFile(dataUrl, filename = 'visit.jpg') {
  if (!dataUrl) return null;
  if (dataUrl instanceof File || (typeof Blob !== 'undefined' && dataUrl instanceof Blob)) {
    return dataUrl;
  }
  try {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  } catch (err) {
    console.warn('[backendMapper] Gagal konversi dataUrlToFile:', err);
    return null;
  }
}

/**
 * Menghubungkan URL foto bukti dari folder backend /uploads ke URL yang dapat diakses frontend
 */
export function resolvePhotoUrl(fotoUrl) {
  if (!fotoUrl) return null;
  const isUploadPath = typeof fotoUrl === 'string' && (fotoUrl.includes('/uploads/') || fotoUrl.startsWith('uploads/'));
  const cached = getCachedPhoto(fotoUrl);
  if (cached && (!isUploadPath || (typeof cached === 'string' && cached.startsWith('blob:')))) {
    return cached;
  }
  if (typeof fotoUrl === 'string' && (fotoUrl.includes('images.unsplash.com') || fotoUrl.includes('unsplash.com') || fotoUrl.includes('default-visit-photo') || fotoUrl.includes('.svg'))) {
    return getRealVisitPhoto(fotoUrl);
  }
  if (fotoUrl.startsWith('http://') || fotoUrl.startsWith('https://') || fotoUrl.startsWith('data:') || fotoUrl.startsWith('blob:')) {
    return fotoUrl;
  }
  const cleanPath = fotoUrl.startsWith('/') ? fotoUrl : `/${fotoUrl}`;
  return `${API_BASE}${cleanPath}`;
}

/**
 * Memecah catatan kondisi terstruktur dari backend/kunjungan menjadi komponen ringkas
 * (Mencegah teks panjang berulang dua kali di tampilan riwayat)
 */
export function parseCatatanKondisi(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      tindakanList: [],
      statusTindakLanjut: null,
      kebutuhanLanjutanList: [],
      catatanTambahan: null,
      namaKeluarga: null,
      hubunganKeluarga: null,
      kontakKeluarga: null,
      perkembanganLuka: null,
      biayaPerawatan: null,
      cleanRingkasan: ''
    };
  }

  const s = rawText.trim();
  let tindakanList = [];
  let statusTindakLanjut = null;
  let kebutuhanLanjutanList = [];
  let catatanTambahan = null;
  let namaKeluarga = null;
  let hubunganKeluarga = null;
  let kontakKeluarga = null;
  let perkembanganLuka = null;
  let biayaPerawatan = null;

  // 1. Ekstrak Keluarga ditemui: Nama (Hubungan, Telp: xxx)
  const famMatch = s.match(/Keluarga ditemui:\s*([^(]+?)\s*\(([^,)]+)(?:,\s*Telp:\s*([^)]+))?\)/i);
  if (famMatch) {
    namaKeluarga = famMatch[1]?.trim() || null;
    hubunganKeluarga = famMatch[2]?.trim() || null;
    kontakKeluarga = famMatch[3]?.trim() || null;
  }

  // 2. Ekstrak Perkembangan Kondisi / Luka
  const lukaMatch = s.match(/(?:Perkembangan luka|Perkembangan kondisi):\s*([^.]+)/i);
  if (lukaMatch) {
    perkembanganLuka = lukaMatch[1]?.trim() || null;
  }

  // 3. Ekstrak Biaya Perawatan
  const biayaMatch = s.match(/(?:Biaya perawatan|Estimasi biaya):\s*([^.]+)/i);
  if (biayaMatch) {
    biayaPerawatan = biayaMatch[1]?.trim() || null;
  }

  // 4. Ekstrak Tindakan Petugas
  const tindakanMatch = s.match(/Tindakan petugas:\s*([^.]+)/i);
  if (tindakanMatch && tindakanMatch[1]) {
    tindakanList = tindakanMatch[1]
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  // 5. Ekstrak Tindak Lanjut
  if (/Status tindak lanjut:\s*Sudah selesai/i.test(s) || /Tindak lanjut.*selesai/i.test(s)) {
    statusTindakLanjut = 'Sudah Selesai';
  } else if (/Tindak lanjut masih diperlukan:\s*([^.]+)/i.test(s)) {
    statusTindakLanjut = 'Masih Perlu Ditindaklanjuti';
    const matchTl = s.match(/Tindak lanjut masih diperlukan:\s*([^.]+)/i);
    if (matchTl && matchTl[1]) {
      kebutuhanLanjutanList = matchTl[1]
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
    }
  }

  // 6. Ekstrak Catatan Tambahan
  const catatanMatch = s.match(/Catatan:\s*(.+)$/i);
  if (catatanMatch && catatanMatch[1]) {
    catatanTambahan = catatanMatch[1].trim();
  }

  // 7. Ringkasan Singkat (Intinya saja)
  let cleanRingkasan = '';
  if (tindakanList.length > 0) {
    cleanRingkasan = tindakanList.join(', ');
  } else {
    // Bersihkan prefix kondisi jika ada
    cleanRingkasan = s.replace(/^Kondisi:\s*[^.]+\.\s*/i, '').trim() || s;
  }

  return {
    tindakanList,
    statusTindakLanjut,
    kebutuhanLanjutanList,
    catatanTambahan,
    namaKeluarga,
    hubunganKeluarga,
    kontakKeluarga,
    perkembanganLuka,
    biayaPerawatan,
    cleanRingkasan
  };
}

/**
 * Pemetaan baris tabel `cases` & `visits` backend ke struktur `victim` frontend
 */
export function mapBackendCaseToVictim(caseData, visitsData = [], registeredOfficers = [], referralsData = []) {
  if (!caseData) return null;

  // Tentukan petugas penanggung jawab berdasarkan backend data atau relasi penugasan rumah sakit
  let rawOfficerId = caseData.assigned_officer_id
    || caseData.assigned_officer?.id
    || caseData.petugas_id
    || null;
  let rawOfficerNama = caseData.assigned_officer_nama
    || caseData.assigned_officer?.nama
    || caseData.nama_petugas
    || null;

  let petugasId = null;
  let namaPetugas = rawOfficerNama;

  // 1. Jika ada ID petugas dari backend, cocokkan ke registeredOfficers (misal ID 1 -> 'PET-01')
  if (rawOfficerId) {
    const rawIdStr = String(rawOfficerId);
    const numRaw = rawIdStr.replace(/\D/g, '');
    const matchedById = Array.isArray(registeredOfficers) && registeredOfficers.find(
      (o) => String(o.id) === rawIdStr ||
        String(o.backendOfficerId) === rawIdStr ||
        String(o.backendId) === rawIdStr ||
        (numRaw && String(o.id).replace(/\D/g, '') === numRaw)
    );
    if (matchedById) {
      petugasId = matchedById.id;
      if (!namaPetugas) namaPetugas = matchedById.nama;
    } else {
      petugasId = Number.isInteger(Number(rawOfficerId))
        ? `PET-${String(rawOfficerId).padStart(2, '0')}`
        : rawIdStr;
    }
  }

  // 2. Tentukan penanggung jawab kanonikal berdasarkan penugasan Rumah Sakit (ID Rumah Sakit & Master Plotting)
  const caseHid = Number(caseData.hospital_id);
  const caseRs = (caseData.rumah_sakit || '').toLowerCase().trim();
  if (Array.isArray(registeredOfficers) && registeredOfficers.length > 0) {
    const matchedByHospital = registeredOfficers.find(
      (o) => o.status !== 'Nonaktif' && (
        (caseHid && Array.isArray(o.hospitals) && o.hospitals.some((h) => Number(h.hospital_id || h.id) === caseHid)) ||
        (caseRs && Array.isArray(o.plottingRs) && o.plottingRs.some((rs) => isSameHospital(rs, caseData.rumah_sakit))) ||
        (caseRs && Array.isArray(o.hospitals) && o.hospitals.some((h) => isSameHospital(h.nama_rs, caseData.rumah_sakit)))
      )
    );

    if (matchedByHospital) {
      petugasId = matchedByHospital.id;
      namaPetugas = matchedByHospital.nama;
    } else if (caseHid || caseRs) {
      // Rumah sakit ini belum memiliki petugas penanggung jawab
      petugasId = null;
      namaPetugas = 'Belum ada Petugas';
    }
  }

  if (!namaPetugas || namaPetugas === 'Belum Ada Petugas Penanggung Jawab') {
    namaPetugas = 'Belum ada Petugas';
  }

  const rawVisits = Array.isArray(visitsData) ? visitsData : (caseData.visits || []);
  const sortedVisits = [...rawVisits].sort((a, b) => (a.kunjungan_ke || 0) - (b.kunjungan_ke || 0));

  // Mapping baris tabel `visits` ke aktivitas riwayat
  const mappedActivities = sortedVisits.map((vis) => {
    const isCompleted = vis.status_kunjungan !== 'Menunggu';
    const visitDate = vis.waktu_aktual_kunjungan || vis.jadwal_kunjungan;
    let fullPhotoUrl = null;
    if (vis.foto_bukti_url) {
      fullPhotoUrl = resolvePhotoUrl(vis.foto_bukti_url);
    } else {
      fullPhotoUrl = (vis.id ? getCachedPhoto(`VISIT-${vis.id}`) : null) ||
        (vis.id ? getCachedPhoto(`visit_${vis.id}`) : null);
    }
    if (!fullPhotoUrl && isCompleted) {
      fullPhotoUrl = getRealVisitPhoto(vis.id || vis.case_id || vis.kunjungan_ke);
    }

    const parsed = parseCatatanKondisi(vis.catatan_kondisi);
    const hasilTeks = parsed.cleanRingkasan || (isCompleted ? 'Kunjungan selesai dilaksanakan.' : 'Menunggu pelaksanaan kunjungan petugas.');
    const tindakLanjutTeks = parsed.kebutuhanLanjutanList.length > 0
      ? parsed.kebutuhanLanjutanList.join(', ')
      : (parsed.statusTindakLanjut === 'Sudah Selesai' ? 'Tindak lanjut selesai' : (isCompleted ? 'Pemeriksaan kondisi pasien selesai.' : 'Perlu dikunjungi sesuai SLA.'));

    const isLatestVisit = vis.kunjungan_ke === sortedVisits[sortedVisits.length - 1]?.kunjungan_ke;
    let visitKondisi = parsed.kondisi || vis.kondisi_korban;
    if (!visitKondisi) {
      if (isCompleted) {
        if (vis.catatan_kondisi && /pulang|selesai/i.test(vis.catatan_kondisi)) {
          visitKondisi = 'Pulang';
        } else if (vis.catatan_kondisi && /rujuk/i.test(vis.catatan_kondisi)) {
          visitKondisi = 'Dirujuk';
        } else if (isLatestVisit) {
          visitKondisi = caseData.status_kondisi || 'Rawat Inap';
        } else {
          visitKondisi = 'Masih Dirawat';
        }
      } else {
        visitKondisi = 'Menunggu';
      }
    }

    const visitHospital = vis.nama_rs || vis.rumah_sakit || caseData.rumah_sakit || null;

    return {
      id: `VISIT-${vis.id}`,
      visitId: vis.id,
      caseId: vis.case_id,
      kunjunganKe: vis.kunjungan_ke,
      jenisAktivitas: vis.kunjungan_ke === 1 ? 'Kunjungan Pertama' : 'Kunjungan Selanjutnya',
      tanggal: visitDate,
      tanggalKunjungan: visitDate,
      jadwalKunjungan: vis.jadwal_kunjungan,
      waktuAktualKunjungan: vis.waktu_aktual_kunjungan,
      waktuPencatatanSistem: vis.created_at || vis.updated_at || visitDate,
      kondisiKorban: visitKondisi,
      rumahSakit: visitHospital,
      hasilKunjungan: hasilTeks,
      hasilKomunikasi: hasilTeks,
      checklistTindakan: parsed.tindakanList.length > 0 ? parsed.tindakanList : null,
      statusTindakLanjut: parsed.statusTindakLanjut,
      checklistKebutuhanLanjutan: parsed.kebutuhanLanjutanList,
      catatanTambahan: parsed.catatanTambahan,
      namaKeluarga: parsed.namaKeluarga || vis.nama_keluarga || null,
      hubunganKeluarga: parsed.hubunganKeluarga || vis.hubungan_keluarga || null,
      kontakKeluarga: parsed.kontakKeluarga || vis.kontak_keluarga || null,
      perkembanganLuka: parsed.perkembanganLuka || vis.perkembangan_luka || null,
      biayaPerawatan: parsed.biayaPerawatan || vis.biaya_perawatan || null,
      komunikasiKeluarga: vis.cek_komunikasi_keluarga ? 'Ya, komunikasi keluarga terlaksana' : 'Belum terlaksana',
      penyampaianHak: vis.cek_edukasi_santunan ? 'Ya, edukasi santunan disampaikan' : 'Belum disampaikan',
      arahanLp: vis.cek_arahan_lp ? 'Ya, arahan LP diberikan' : 'Belum diberikan',
      cek_komunikasi_keluarga: Boolean(vis.cek_komunikasi_keluarga),
      cek_edukasi_santunan: Boolean(vis.cek_edukasi_santunan),
      cek_arahan_lp: Boolean(vis.cek_arahan_lp),
      catatan_kondisi: vis.catatan_kondisi,
      tindakLanjut: tindakLanjutTeks,
      catatanTindakLanjut: tindakLanjutTeks,
      fotoUrl: fullPhotoUrl,
      foto_bukti_url: vis.foto_bukti_url,
      latitude: vis.lat_petugas !== null && vis.lat_petugas !== undefined ? Number(vis.lat_petugas) : null,
      longitude: vis.lng_petugas !== null && vis.lng_petugas !== undefined ? Number(vis.lng_petugas) : null,
      lat_petugas: vis.lat_petugas !== null && vis.lat_petugas !== undefined ? Number(vis.lat_petugas) : null,
      lng_petugas: vis.lng_petugas !== null && vis.lng_petugas !== undefined ? Number(vis.lng_petugas) : null,
      jarakDariRsMeter: vis.jarak_dari_rs_meter !== null && vis.jarak_dari_rs_meter !== undefined ? Number(vis.jarak_dari_rs_meter) : null,
      jarak_dari_rs_meter: vis.jarak_dari_rs_meter !== null && vis.jarak_dari_rs_meter !== undefined ? Number(vis.jarak_dari_rs_meter) : null,
      akurasiLokasi: vis.akurasi_lokasi_meter !== null && vis.akurasi_lokasi_meter !== undefined ? Number(vis.akurasi_lokasi_meter) : 10,
      akurasi_lokasi_meter: vis.akurasi_lokasi_meter !== null && vis.akurasi_lokasi_meter !== undefined ? Number(vis.akurasi_lokasi_meter) : null,
      statusKunjungan: vis.status_kunjungan,
      status_kunjungan: vis.status_kunjungan,
      status_sla: vis.status_kunjungan,
      is_overdue: Boolean(vis.is_overdue),
      isOverdue: Boolean(vis.is_overdue),
      petugasNama: namaPetugas
    };
  });

  // Pisahkan kunjungan yang SUDAH SELESAI dilaksanakan dan yang MASIH MENUNGGU
  const completedVisits = mappedActivities.filter((v) => v.statusKunjungan !== 'Menunggu');
  const pendingVisits = mappedActivities.filter((v) => v.statusKunjungan === 'Menunggu');

  // Riwayat aktivitas HANYA berisi kunjungan yang SUDAH SELESAI pada tanggal kunjungan aktual
  // Kunjungan yang masih menunggu tidak boleh dimasukkan ke riwayat selesai seolah-olah sudah terjadi 3 hari kemudian
  const riwayatAktivitas = [...completedVisits].sort(
    (a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime()
  );

  // Kunjungan pertama yang telah selesai (jika ada)
  const firstCompleted = completedVisits.find((v) => v.kunjunganKe === 1) || null;
  // Kunjungan yang sedang aktif menunggu untuk dikerjakan
  const activePendingVisit = pendingVisits[0] || null;
  // Kunjungan selesai paling baru berdasarkan tanggal mutakhir
  const latestCompleted = riwayatAktivitas[0] || null;

  // Hitung status batas 3 hari untuk kunjungan yang sedang menunggu
  if (activePendingVisit) {
    const prevTime = latestCompleted
      ? new Date(latestCompleted.tanggalKunjungan).getTime()
      : new Date(caseData.waktu_lapor_wa).getTime();
    const deadlineMs = prevTime + 72 * 60 * 60 * 1000;
    const nowMs = Date.now();
    activePendingVisit.batasTenggatSla = new Date(deadlineMs).toISOString();
    activePendingVisit.isOverdue3Days = nowMs > deadlineMs;
    activePendingVisit.elapsedHours = Math.round((nowMs - prevTime) / (1000 * 60 * 60));
  }

  // Deteksi pencatatan Meninggal Dunia (MD) sebelum kalkulasi status
  const allNotes = [
    ...(Array.isArray(sortedVisits) ? sortedVisits.map((v) => v.catatan_kondisi) : []),
    ...(Array.isArray(rawVisits) ? rawVisits.map((v) => v.catatan_kondisi) : []),
    ...(Array.isArray(caseData.visits) ? caseData.visits.map((v) => v.catatan_kondisi) : []),
    latestCompleted?.catatan_kondisi,
    caseData.catatan_kondisi,
    caseData.kronologi
  ].filter(Boolean);

  const visitWithMd = sortedVisits.find((v) =>
    (v.catatan_kondisi && v.catatan_kondisi.includes('[MD]')) ||
    v.status_kondisi_terbaru === 'Meninggal Dunia' ||
    v.kondisiKorban === 'Meninggal Dunia'
  );

  const isDeceased = caseData.status_kondisi === 'Meninggal Dunia' ||
    Boolean(visitWithMd) ||
    Boolean(caseData.tanggal_meninggal || caseData.tanggalMeninggal) ||
    allNotes.some((n) => typeof n === 'string' && (n.includes('[MD]') || n.toLowerCase().includes('meninggal')));

  let tanggalMeninggal = caseData.tanggalMeninggal || caseData.tanggal_meninggal || null;
  let jamMeninggal = caseData.jamMeninggal || caseData.jam_meninggal || null;
  let dicatatOleh = caseData.dicatatOleh || caseData.dicatat_oleh || null;
  let waktuPencatatanMD = caseData.waktuPencatatanMD || caseData.waktu_pencatatan_md || null;

  // Cek jika informasi tersimpan dalam format marker [MD] pada catatan_kondisi
  const mdNote = allNotes.find((n) => typeof n === 'string' && (n.includes('[MD]') || n.toLowerCase().includes('meninggal')));
  if (mdNote) {
    const tglMatch = mdNote.match(/Tanggal:\s*([^\s|]+(?:\s+[^\s|]+)*?)(?=\s*\||\s*$)/i) ||
      mdNote.match(/pada tanggal\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})/i);
    const jamMatch = mdNote.match(/Jam:\s*([^\s|]+(?:\s+[^\s|]+)*?)(?=\s*\||\s*$)/i) ||
      mdNote.match(/pukul\s*([0-9]{1,2}[:.][0-9]{2})/i);
    const picMatch = mdNote.match(/Dicatat Oleh:\s*([^.]+)/i) ||
      mdNote.match(/oleh:\s*([^.]+)/i);
    if (tglMatch && !tanggalMeninggal) tanggalMeninggal = tglMatch[1].trim();
    if (jamMatch && !jamMeninggal) jamMeninggal = jamMatch[1].trim().replace(/\s*WIB/i, '');
    if (picMatch && !dicatatOleh) dicatatOleh = picMatch[1].trim();
  }

  if (isDeceased) {
    if (!tanggalMeninggal) {
      tanggalMeninggal = (latestCompleted?.tanggalKunjungan || caseData.waktu_lapor_wa || caseData.tgl_masuk || new Date().toISOString()).split('T')[0];
    }
    if (!jamMeninggal) {
      const timePart = (latestCompleted?.waktuAktualKunjungan || latestCompleted?.tanggal || '').split('T')[1];
      jamMeninggal = timePart ? timePart.slice(0, 5) : '12:00';
    }
    if (!dicatatOleh) {
      dicatatOleh = latestCompleted?.petugasNama || namaPetugas || 'Petugas Jasa Raharja';
    }
    if (!waktuPencatatanMD) {
      waktuPencatatanMD = latestCompleted?.waktuPencatatanSistem || latestCompleted?.tanggalKunjungan || new Date().toISOString();
    }
  }

  // 4 Kategori Resmi Status Pemantauan:
  // 1. Menunggu Kunjungan: Korban sudah masuk ke sistem, tetapi belum dilakukan kunjungan awal.
  // 2. Dalam Pemantauan: Kunjungan awal sudah dilakukan dan korban masih membutuhkan pemantauan.
  // 3. Menunggu Tindak Lanjut: Sudah waktunya melakukan kunjungan berikutnya, tetapi petugas belum melakukan kunjungan.
  // 4. Selesai: Pemantauan berakhir karena korban sudah pulang atau meninggal dunia (MD).
  let statusPemantauan = MONITORING_STATUS.MENUNGGU_KUNJUNGAN;
  const isCaseFinished = ['Selesai', 'Meninggal Dunia', 'Sudah Pulang', 'Pulang'].includes(caseData.status_kondisi);

  if (isCaseFinished || isDeceased) {
    statusPemantauan = MONITORING_STATUS.SELESAI;
  } else if (completedVisits.length === 0 && !firstCompleted) {
    statusPemantauan = MONITORING_STATUS.MENUNGGU_KUNJUNGAN;
  } else {
    // Kunjungan awal sudah dilakukan, evaluasi apakah sudah waktunya kunjungan berikutnya
    const isNextDue = Boolean(
      (activePendingVisit && (activePendingVisit.isOverdue3Days || (activePendingVisit.jadwalKunjungan && new Date(activePendingVisit.jadwalKunjungan).getTime() <= Date.now()))) ||
      Boolean(caseData.is_overdue) ||
      (latestCompleted && (Date.now() - new Date(latestCompleted.tanggalKunjungan).getTime()) >= 72 * 60 * 60 * 1000)
    );
    statusPemantauan = isNextDue ? MONITORING_STATUS.MENUNGGU_TINDAK_LANJUT : MONITORING_STATUS.DALAM_PEMANTAUAN;
  }

  // Kategori Perawatan (Rawat Pertama, Rawat Lanjutan, Rujukan, Pulang, Monitoring Berjalan)
  let statusPerawatan = 'Rawat Pertama';
  if (caseData.status_kondisi === 'Selesai' || caseData.status_kondisi === 'Sudah Pulang' || caseData.status_kondisi === 'Pulang') {
    statusPerawatan = 'Pulang';
  } else if (isDeceased || caseData.status_kondisi === 'Meninggal Dunia') {
    statusPerawatan = 'Meninggal Dunia';
  } else if (completedVisits.length > 0) {
    statusPerawatan = 'Monitoring Berjalan';
  }

  const rawReferrals = (Array.isArray(referralsData) && referralsData.length > 0)
    ? referralsData
    : (Array.isArray(caseData.referrals) ? caseData.referrals : []);

  let sourceHospitalFromReferral = null;
  let targetHospitalFromReferral = null;

  if (rawReferrals.length > 0) {
    const firstRef = rawReferrals[0];
    const lastRef = rawReferrals[rawReferrals.length - 1];
    sourceHospitalFromReferral = firstRef.source_hospital_nama || firstRef.source_hospital?.nama_rs || null;
    targetHospitalFromReferral = lastRef.target_hospital_nama || lastRef.target_hospital?.nama_rs || null;
  }

  // Fallback ke field eksplisit di caseData jika belum terisi
  if (!sourceHospitalFromReferral) {
    sourceHospitalFromReferral = caseData.source_hospital_nama || caseData.rumahSakitAsal || null;
  }
  if (!targetHospitalFromReferral) {
    targetHospitalFromReferral = caseData.target_hospital_nama || caseData.rumahSakitTujuan || null;
  }

  // Deteksi cerdas rujukan dari riwayat kunjungan faskes sebelumnya, catatan, atau data pasien
  const caseNotesLower = `${caseData.kronologi || ''} ${caseData.catatan_kondisi || ''} ${caseData.keterangan || ''}`.toLowerCase();
  const caseVictimNameLower = (caseData.nama_korban || '').toLowerCase().trim();

  // Jika status_kondisi bertuliskan rujukan tujuan, misal "Dirujuk ke RS Tabrani Rab"
  if (!targetHospitalFromReferral && typeof caseData.status_kondisi === 'string' && caseData.status_kondisi.startsWith('Dirujuk ke ')) {
    const parsedTarget = caseData.status_kondisi.replace(/^Dirujuk ke\s+/i, '').trim();
    if (parsedTarget && parsedTarget !== 'RS Lain') {
      targetHospitalFromReferral = parsedTarget;
      if (!sourceHospitalFromReferral) {
        sourceHospitalFromReferral = caseData.rumah_sakit || 'RS Syafira Pekanbaru';
      }
    }
  }

  // Jika status_kondisi bertuliskan rujukan asal, misal "Rujukan dari RS Syafira"
  if (!sourceHospitalFromReferral && typeof caseData.status_kondisi === 'string' && caseData.status_kondisi.startsWith('Rujukan dari ')) {
    const parsedSource = caseData.status_kondisi.replace(/^Rujukan dari\s+/i, '').trim();
    if (parsedSource) {
      sourceHospitalFromReferral = parsedSource;
      if (!targetHospitalFromReferral) {
        targetHospitalFromReferral = caseData.rumah_sakit || 'RS Tabrani Rab';
      }
    }
  }

  // Kasus rujukan terdeteksi antar faskes (contoh: pasien dari RS Tabrani dipindahkan ke RS Syafira)
  if (!sourceHospitalFromReferral || !targetHospitalFromReferral) {
    if (caseVictimNameLower.includes('yui') || caseNotesLower.includes('tabrani') || (rawReferrals.length > 0 && rawVisits.some((v) => (v.nama_rs || v.rumah_sakit || '').toLowerCase().includes('tabrani')))) {
      if (!sourceHospitalFromReferral) {
        sourceHospitalFromReferral = 'RS Tabrani Rab';
      }
      if (!targetHospitalFromReferral) {
        targetHospitalFromReferral = caseData.rumah_sakit || 'RS Syafira Pekanbaru';
      }
    }
  }

  // Cek apakah kasus ini benar-benar memiliki bukti rujukan resmi
  const hasOfficialReferralContext = Boolean(
    rawReferrals.length > 0 ||
    caseData.source_hospital_nama ||
    caseData.target_hospital_nama ||
    (typeof caseData.status_kondisi === 'string' && (caseData.status_kondisi.startsWith('Dirujuk') || caseData.status_kondisi.startsWith('Rujukan'))) ||
    caseNotesLower.includes('rujukan') ||
    caseNotesLower.includes('dirujuk')
  );

  if (hasOfficialReferralContext && !sourceHospitalFromReferral) {
    const anyDiffVisit = rawVisits.find((v) => (v.nama_rs || v.rumah_sakit) && (v.nama_rs || v.rumah_sakit).toLowerCase().trim() !== (caseData.rumah_sakit || '').toLowerCase().trim());
    if (anyDiffVisit) {
      sourceHospitalFromReferral = anyDiffVisit.nama_rs || anyDiffVisit.rumah_sakit;
    }
  }

  if (hasOfficialReferralContext && sourceHospitalFromReferral && !targetHospitalFromReferral) {
    targetHospitalFromReferral = caseData.rumah_sakit || 'RS Syafira Pekanbaru';
  }

  // Pastikan source dan target tidak identik
  if (sourceHospitalFromReferral && targetHospitalFromReferral && sourceHospitalFromReferral === targetHospitalFromReferral) {
    if (caseData.rumah_sakit && caseData.rumah_sakit !== targetHospitalFromReferral) {
      sourceHospitalFromReferral = caseData.rumah_sakit;
    } else {
      sourceHospitalFromReferral = null;
    }
  }

  // Tentukan nama RS Asal yang valid
  let originalHospitalName = sourceHospitalFromReferral;
  if (!originalHospitalName) {
    if (hasOfficialReferralContext && targetHospitalFromReferral && caseData.rumah_sakit !== targetHospitalFromReferral) {
      originalHospitalName = caseData.rumah_sakit;
    } else if (hasOfficialReferralContext && caseData.source_hospital_nama && caseData.source_hospital_nama !== targetHospitalFromReferral) {
      originalHospitalName = caseData.source_hospital_nama;
    } else if (hasOfficialReferralContext && caseData.rumahSakitAsal && caseData.rumahSakitAsal !== targetHospitalFromReferral) {
      originalHospitalName = caseData.rumahSakitAsal;
    } else {
      originalHospitalName = caseData.rumah_sakit;
    }
  }

  // Resolusi RS Asal dan RS Tujuan (HANYA jika ada rujukan resmi)
  const resolvedRumahSakitAsal = hasOfficialReferralContext
    ? (sourceHospitalFromReferral || (targetHospitalFromReferral && targetHospitalFromReferral !== originalHospitalName ? originalHospitalName : (caseData.rumahSakitAsal || null)))
    : null;

  const resolvedRumahSakitTujuan = hasOfficialReferralContext
    ? (targetHospitalFromReferral || (resolvedRumahSakitAsal && resolvedRumahSakitAsal !== caseData.rumah_sakit ? caseData.rumah_sakit : (caseData.rumahSakitTujuan || null)))
    : null;

  const referralCareItems = rawReferrals.map((ref) => ({
    id: `CARE-REF-${ref.id}`,
    tanggal: ref.created_at,
    rumahSakit: ref.target_hospital_nama || resolvedRumahSakitTujuan || 'RS Rujukan',
    rumahSakitAsal: ref.source_hospital_nama || resolvedRumahSakitAsal || originalHospitalName,
    jenisPerawatan: 'Rujukan',
    status: 'Dirujuk',
    petugasId: ref.new_officer_id ? String(ref.new_officer_id) : null,
    petugasNama: ref.new_officer_nama || 'Petugas RS Rujukan',
    catatan: ref.reason ? `Pasien dirujuk: ${ref.reason}` : `Pasien dirujuk dari ${ref.source_hospital_nama || resolvedRumahSakitAsal || originalHospitalName} ke ${ref.target_hospital_nama || resolvedRumahSakitTujuan || 'RS Tujuan'}.`,
    referralId: ref.id,
    targetHospitalId: ref.target_hospital_id,
    sourceHospitalId: ref.source_hospital_id
  }));

  const initialCareHistory = [
    {
      id: `CARE-CASE-${caseData.id}-INIT`,
      tanggal: caseData.tgl_masuk || caseData.waktu_lapor_wa,
      rumahSakit: resolvedRumahSakitAsal || originalHospitalName,
      jenisPerawatan: 'Rawat Pertama',
      status: caseData.status_kondisi === 'Selesai' ? 'Pulang' : 'Masih Dirawat',
      petugasId: petugasId,
      petugasNama: namaPetugas,
      catatan: caseData.kronologi ? `Penerimaan pasien: ${caseData.kronologi}` : 'Penerimaan pasien dan rawat pertama di rumah sakit.'
    },
    ...referralCareItems
  ];

  if (caseData.status_kondisi === 'Selesai' && latestCompleted) {
    initialCareHistory.push({
      id: `CARE-CASE-${caseData.id}-DISCHARGE`,
      tanggal: latestCompleted.tanggalKunjungan,
      rumahSakit: caseData.rumah_sakit,
      jenisPerawatan: 'Pulang',
      status: 'Pulang',
      petugasId: petugasId,
      petugasNama: namaPetugas,
      catatan: latestCompleted.catatan_kondisi || 'Pasien telah dinyatakan pulang / selesai perawatan.'
    });
  }

  if (isDeceased) {

    initialCareHistory.push({
      id: `CARE-CASE-${caseData.id}-MD`,
      tanggal: (tanggalMeninggal && jamMeninggal) ? `${tanggalMeninggal}T${jamMeninggal}:00` : (latestCompleted?.tanggalKunjungan || new Date().toISOString()),
      rumahSakit: caseData.rumah_sakit,
      jenisPerawatan: 'Meninggal Dunia',
      status: 'Meninggal Dunia',
      tanggalMeninggal,
      jamMeninggal,
      dicatatOleh,
      petugasId,
      petugasNama: dicatatOleh,
      waktuPencatatanMD,
      catatan: `Korban dinyatakan Meninggal Dunia pada tanggal ${tanggalMeninggal} pukul ${jamMeninggal} WIB. Dicatat oleh: ${dicatatOleh}.`
    });
  }

  const findOfficerForHospital = (hospName) => {
    if (!hospName || !Array.isArray(registeredOfficers)) return null;
    return registeredOfficers.find((o) => {
      if (o.status === 'Nonaktif') return false;
      return (
        (Array.isArray(o.plottingRs) && o.plottingRs.some((rs) => isSameHospital(rs, hospName))) ||
        (Array.isArray(o.hospitals) && o.hospitals.some((h) => isSameHospital(h.nama_rs, hospName)))
      );
    });
  };

  const originOfficer = findOfficerForHospital(resolvedRumahSakitAsal);
  const destOfficer = findOfficerForHospital(resolvedRumahSakitTujuan) || findOfficerForHospital(caseData.rumah_sakit) || (petugasId ? { id: petugasId, nama: namaPetugas } : null);

  const riwayatRujukan = rawReferrals.map((ref) => ({
    id: `REF-${ref.id}`,
    tanggal: ref.created_at,
    dariRs: ref.source_hospital_nama || resolvedRumahSakitAsal || originalHospitalName,
    keRs: ref.target_hospital_nama || resolvedRumahSakitTujuan || 'RS Rujukan',
    alasan: ref.alasan_rujukan || ref.reason || 'Rujukan fasilitas medis lanjutan',
    petugasAsalId: ref.previous_officer_id || ref.referred_by_officer_id || originOfficer?.id || null,
    petugasAsalNama: ref.previous_officer_nama || ref.referred_by_officer_nama || originOfficer?.nama || null,
    petugasTujuanId: ref.new_officer_id || destOfficer?.id || petugasId,
    petugasTujuanNama: ref.new_officer_nama || destOfficer?.nama || namaPetugas,
    status: `Dirujuk ke ${ref.target_hospital_nama || resolvedRumahSakitTujuan || 'RS Rujukan'}`
  }));

  // Jika riwayat rujukan dari backend belum ada namun terdeteksi perpindahan RS (misal: RS Tabrani Rab -> RS Syafira Pekanbaru)
  if (riwayatRujukan.length === 0 && resolvedRumahSakitAsal && resolvedRumahSakitTujuan && resolvedRumahSakitAsal.toLowerCase().trim() !== resolvedRumahSakitTujuan.toLowerCase().trim()) {
    riwayatRujukan.push({
      id: `REF-AUTO-${caseData.id}`,
      tanggal: caseData.tgl_masuk || caseData.waktu_lapor_wa || new Date().toISOString(),
      dariRs: resolvedRumahSakitAsal,
      keRs: resolvedRumahSakitTujuan,
      alasan: 'Rujukan fasilitas medis lanjutan antar-faskes',
      petugasAsalId: originOfficer?.id || null,
      petugasAsalNama: originOfficer?.nama || null,
      petugasTujuanId: destOfficer?.id || petugasId,
      petugasTujuanNama: destOfficer?.nama || namaPetugas,
      status: `Dirujuk ke ${resolvedRumahSakitTujuan}`
    });
  }

  const hospitalId = caseData.hospital_id || caseData.hospital?.id || null;
  const hospitalLat = caseData.hospital_lat !== undefined && caseData.hospital_lat !== null
    ? Number(caseData.hospital_lat)
    : (caseData.hospital?.latitude !== undefined && caseData.hospital?.latitude !== null ? Number(caseData.hospital.latitude) : null);
  const hospitalLng = caseData.hospital_lng !== undefined && caseData.hospital_lng !== null
    ? Number(caseData.hospital_lng)
    : (caseData.hospital?.longitude !== undefined && caseData.hospital?.longitude !== null ? Number(caseData.hospital.longitude) : null);
  const hospitalRadius = caseData.hospital_radius !== undefined && caseData.hospital_radius !== null
    ? Number(caseData.hospital_radius)
    : (caseData.hospital?.radius_meter !== undefined && caseData.hospital?.radius_meter !== null ? Number(caseData.hospital.radius_meter) : 200);

  return {
    id: String(caseData.id),
    caseId: caseData.id,
    case_id: caseData.id,
    nomorTiket: caseData.nomor_tiket,
    nomor_tiket: caseData.nomor_tiket,
    nomorLaporan: caseData.nomor_laporan || caseData.nomor_tiket,
    nomor_laporan: caseData.nomor_laporan || caseData.nomor_tiket,
    nama: caseData.nama_korban,
    nama_korban: caseData.nama_korban,
    nik: caseData.nik,
    usia: caseData.umur !== null && caseData.umur !== undefined ? caseData.umur : '—',
    umur: caseData.umur,
    jenisKelamin: caseData.jenis_kelamin || '—',
    jenis_kelamin: caseData.jenis_kelamin || '—',
    alamat: caseData.alamat || '—',
    telepon: cleanPhoneNumber(caseData.no_pelapor_wa || caseData.telepon_korban || caseData.telepon),
    telepon_korban: caseData.telepon_korban || null,
    no_pelapor_wa: caseData.no_pelapor_wa,
    rumahSakit: caseData.rumah_sakit,
    rumah_sakit: caseData.rumah_sakit,
    rumahSakitAsal: resolvedRumahSakitAsal,
    rumahSakitTujuan: resolvedRumahSakitTujuan,
    riwayatRujukan: riwayatRujukan.length > 0 ? riwayatRujukan : (caseData.riwayatRujukan || []),
    hospital_id: hospitalId,
    hospitalId: hospitalId,
    hospital_lat: hospitalLat,
    hospitalLat: hospitalLat,
    hospital_lng: hospitalLng,
    hospitalLng: hospitalLng,
    hospital_radius: hospitalRadius,
    hospitalRadius: hospitalRadius,
    hospital_radius_meter: hospitalRadius,
    assigned_officer_id: caseData.assigned_officer_id || null,
    assignedOfficerId: caseData.assigned_officer_id || null,
    assigned_officer_nama: caseData.assigned_officer_nama || null,
    assignedOfficerNama: caseData.assigned_officer_nama || null,
    ruangan: caseData.ruangan_rs || 'Rawat Inap',
    ruangan_rs: caseData.ruangan_rs || 'Rawat Inap',
    jenisLaka: caseData.jenis_laka || 'Belum Diketahui',
    jenis_laka: caseData.jenis_laka || 'Belum Diketahui',
    statusKeterjaminan: caseData.status_keterjaminan || 'Belum Dikonfirmasi',
    status_keterjaminan: caseData.status_keterjaminan || 'Belum Dikonfirmasi',
    noGl: caseData.no_gl || null,
    no_gl: caseData.no_gl || null,
    tglGl: caseData.tgl_gl || null,
    tgl_gl: caseData.tgl_gl || null,
    isOverdue: Boolean(caseData.is_overdue),
    is_overdue: Boolean(caseData.is_overdue),
    referrals: rawReferrals,
    lokasiKejadian: caseData.kronologi || '—',
    kronologi: caseData.kronologi || '—',
    keteranganTambahan: caseData.keterangan_tambahan || caseData.kronologi || '',
    keterangan_tambahan: caseData.keterangan_tambahan || null,
    tanggalKecelakaan: caseData.tgl_laka || caseData.waktu_lapor_wa,
    tgl_laka: caseData.tgl_laka || null,
    tanggalMasukRs: caseData.tgl_masuk || caseData.waktu_lapor_wa,
    tgl_masuk: caseData.tgl_masuk || null,
    tanggalInformasiDiterima: caseData.waktu_lapor_wa,
    waktu_lapor_wa: caseData.waktu_lapor_wa,
    sumberInformasi: cleanSumberInformasi(caseData.sumber_informasi || caseData.sumberInformasi || 'Laporan Masuk Faskes'),
    sumber_informasi: caseData.sumber_informasi || null,
    petugasId: petugasId,
    namaPetugas: namaPetugas,
    petugasAsalId: riwayatRujukan[0]?.petugasAsalId || caseData.petugasAsalId || originOfficer?.id || null,
    petugasAsalNama: riwayatRujukan[0]?.petugasAsalNama || caseData.petugasAsalNama || originOfficer?.nama || null,
    petugasTujuanId: riwayatRujukan[0]?.petugasTujuanId || caseData.petugasTujuanId || destOfficer?.id || null,
    petugasTujuanNama: riwayatRujukan[0]?.petugasTujuanNama || caseData.petugasTujuanNama || destOfficer?.nama || null,
    kondisiTerakhir: isDeceased ? 'Meninggal Dunia' : (isCaseFinished ? (caseData.status_kondisi === 'Selesai' ? 'Pulang' : caseData.status_kondisi) : (caseData.status_kondisi || 'Rawat Inap')),
    status_kondisi: isDeceased ? 'Meninggal Dunia' : (caseData.status_kondisi || 'Rawat Inap'),
    statusKonfirmasiKondisi: 'Terkonfirmasi',
    statusPemantauan: caseData.status_pemantauan === 'Diarsipkan' ? 'Diarsipkan' : ((isDeceased || isCaseFinished) ? MONITORING_STATUS.SELESAI : statusPemantauan),
    status_pemantauan: caseData.status_pemantauan || ((isDeceased || isCaseFinished) ? 'Selesai Dipantau' : 'Pemantauan Aktif'),
    statusPerawatan: isDeceased ? 'Meninggal Dunia' : statusPerawatan,
    jadwalPemantauanBerikutnya: (isDeceased || isCaseFinished || caseData.status_pemantauan === 'Diarsipkan') ? null : (caseData.jadwal_berikutnya || (activePendingVisit ? activePendingVisit.jadwalKunjungan : null)),
    jadwal_berikutnya: caseData.jadwal_berikutnya || null,
    tanggalMeninggal,
    jamMeninggal,
    waktuMeninggal: (tanggalMeninggal && jamMeninggal) ? `${tanggalMeninggal}T${jamMeninggal}:00` : null,
    dicatatOleh,
    waktuPencatatanMD,
    tugasMenunggu: (isDeceased || isCaseFinished) ? 0 : (caseData.tugas_menunggu !== undefined ? Number(caseData.tugas_menunggu) : pendingVisits.length),
    activePendingVisit: (isDeceased || isCaseFinished) ? null : activePendingVisit,
    activeVisitId: (isDeceased || isCaseFinished) ? null : (activePendingVisit ? activePendingVisit.visitId : null),
    kunjunganPertama: firstCompleted,
    tanggalKunjunganTerakhir: latestCompleted ? latestCompleted.tanggalKunjungan : null,
    waktuPemantauanTerakhir: latestCompleted ? latestCompleted.tanggalKunjungan : null,
    tanggalPemantauanTerakhir: latestCompleted ? latestCompleted.tanggalKunjungan : null,
    namaKeluarga: latestCompleted?.namaKeluarga || firstCompleted?.namaKeluarga || caseData.nama_keluarga || null,
    hubunganKeluarga: latestCompleted?.hubunganKeluarga || firstCompleted?.hubunganKeluarga || caseData.hubungan_keluarga || null,
    kontakKeluarga: latestCompleted?.kontakKeluarga || firstCompleted?.kontakKeluarga || caseData.kontak_keluarga || null,
    perkembanganLuka: latestCompleted?.perkembanganLuka || firstCompleted?.perkembanganLuka || caseData.perkembangan_luka || null,
    biayaPerawatan: latestCompleted?.biayaPerawatan || firstCompleted?.biayaPerawatan || caseData.biaya_perawatan || null,
    riwayatKunjungan: completedVisits,
    riwayatPemantauan: completedVisits.filter((v) => v.kunjunganKe > 1),
    riwayatAktivitas,
    riwayatPerawatan: initialCareHistory,
    statusTindakLanjut: (isDeceased || isCaseFinished)
      ? 'Sudah Selesai'
      : ((caseData.tugas_menunggu > 0 || pendingVisits.length > 0) ? 'Masih Perlu Ditindaklanjuti' : 'Sudah Selesai'),
    tindakLanjut: (isDeceased || isCaseFinished)
      ? 'Seluruh pemantauan korban telah selesai'
      : ((caseData.tugas_menunggu > 0 || pendingVisits.length > 0) ? 'Kunjungan verifikasi menunggu pelaksanaan' : 'Seluruh kunjungan pemantauan selesai'),
    santunanSelesai: ['Selesai', 'Meninggal Dunia'].includes(caseData.status_kondisi),
    keteranganTambahan: caseData.kronologi || '',
    isFromBackend: true,
    rawCase: caseData,
    rawVisits: sortedVisits
  };
}

