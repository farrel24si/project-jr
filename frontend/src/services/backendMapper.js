/**
 * Mapper antara Tabel Backend MySQL (cases, visits, hospitals)
 * dan Model Data Frontend (victim, activities, visits)
 */

import { getCachedPhoto, cachePhoto } from './photoService.js';

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
  const cached = getCachedPhoto(fotoUrl);
  if (cached) return cached;
  if (typeof fotoUrl === 'string' && (fotoUrl.includes('images.unsplash.com') || fotoUrl.includes('unsplash.com'))) {
    return '/img/default-visit-photo.svg';
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
      cleanRingkasan: ''
    };
  }

  const s = rawText.trim();
  let tindakanList = [];
  let statusTindakLanjut = null;
  let kebutuhanLanjutanList = [];
  let catatanTambahan = null;

  // 1. Ekstrak Tindakan Petugas
  const tindakanMatch = s.match(/Tindakan petugas:\s*([^.]+)/i);
  if (tindakanMatch && tindakanMatch[1]) {
    tindakanList = tindakanMatch[1]
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  // 2. Ekstrak Tindak Lanjut
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

  // 3. Ekstrak Catatan Tambahan
  const catatanMatch = s.match(/Catatan:\s*(.+)$/i);
  if (catatanMatch && catatanMatch[1]) {
    catatanTambahan = catatanMatch[1].trim();
  }

  // 4. Ringkasan Singkat (Intinya saja)
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

  // 2. Jika belum ada ID atau nama, cari berdasarkan plotting rumah sakit (misal 'RS Prima' -> 'Petugas' / 'PET-01')
  if ((!petugasId || !namaPetugas || namaPetugas === 'Belum Ada Petugas Penanggung Jawab') && Array.isArray(registeredOfficers) && registeredOfficers.length > 0) {
    const caseRs = (caseData.rumah_sakit || '').toLowerCase().trim();
    const matched = registeredOfficers.find(
      (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some(
        (rs) => {
          const r1 = (rs || '').toLowerCase().trim();
          return r1 === caseRs || (caseRs.length >= 4 && (r1.includes(caseRs) || caseRs.includes(r1)));
        }
      )
    );
    if (matched) {
      if (!petugasId) petugasId = matched.id;
      if (!namaPetugas) namaPetugas = matched.nama;
    }
  }

  if (!namaPetugas) {
    namaPetugas = 'Belum Ada Petugas Penanggung Jawab';
  }

  const rawVisits = Array.isArray(visitsData) ? visitsData : (caseData.visits || []);
  const sortedVisits = [...rawVisits].sort((a, b) => (a.kunjungan_ke || 0) - (b.kunjungan_ke || 0));

  // Mapping baris tabel `visits` ke aktivitas riwayat
  const mappedActivities = sortedVisits.map((vis) => {
    const isCompleted = vis.status_kunjungan !== 'Menunggu';
    const visitDate = vis.waktu_aktual_kunjungan || vis.jadwal_kunjungan;
    const cachedPhoto = getCachedPhoto(vis.id) ||
      getCachedPhoto(`VISIT-${vis.id}`) ||
      getCachedPhoto(vis.foto_bukti_url) ||
      (caseData?.id ? getCachedPhoto(`case_${caseData.id}`) : null) ||
      (caseData?.id ? getCachedPhoto(caseData.id) : null);

    const fullPhotoUrl = cachedPhoto || resolvePhotoUrl(vis.foto_bukti_url);
    if (fullPhotoUrl && vis.foto_bukti_url && fullPhotoUrl.startsWith('data:')) {
      cachePhoto(vis.foto_bukti_url, fullPhotoUrl);
      cachePhoto(vis.id, fullPhotoUrl);
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
      jarakDariRsMeter: vis.jarak_dari_rs_meter,
      jarak_dari_rs_meter: vis.jarak_dari_rs_meter,
      statusKunjungan: vis.status_kunjungan,
      status_kunjungan: vis.status_kunjungan,
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

  // Status Pemantauan diselaraskan dengan status_pemantauan, status_kondisi, dan visits
  let statusPemantauan = 'Belum Dikunjungi';
  if (caseData.status_pemantauan === 'Diarsipkan') {
    statusPemantauan = 'Diarsipkan';
  } else if (
    caseData.status_kondisi === 'Selesai' ||
    caseData.status_kondisi === 'Sudah Pulang' ||
    caseData.status_kondisi === 'Meninggal Dunia' ||
    caseData.status_pemantauan === 'Selesai Dipantau'
  ) {
    statusPemantauan = 'Selesai Dipantau';
  } else if (completedVisits.length > 0) {
    statusPemantauan = 'Pemantauan Aktif';
  } else {
    statusPemantauan = 'Belum Dikunjungi';
  }

  // Kategori Perawatan (Rawat Pertama, Rawat Lanjutan, Rujukan, Pulang, Monitoring Berjalan)
  let statusPerawatan = 'Rawat Pertama';
  if (caseData.status_kondisi === 'Selesai') {
    statusPerawatan = 'Pulang';
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

  // Jika status_kondisi bertuliskan rujukan tujuan, misal "Dirujuk ke RS Tabrani Rab"
  if (!targetHospitalFromReferral && typeof caseData.status_kondisi === 'string' && caseData.status_kondisi.startsWith('Dirujuk ke ')) {
    const parsedTarget = caseData.status_kondisi.replace(/^Dirujuk ke\s+/i, '').trim();
    if (parsedTarget && parsedTarget !== 'RS Lain') {
      targetHospitalFromReferral = parsedTarget;
    }
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
    if (targetHospitalFromReferral && caseData.rumah_sakit !== targetHospitalFromReferral) {
      originalHospitalName = caseData.rumah_sakit;
    } else if (caseData.source_hospital_nama && caseData.source_hospital_nama !== targetHospitalFromReferral) {
      originalHospitalName = caseData.source_hospital_nama;
    } else if (caseData.rumahSakitAsal && caseData.rumahSakitAsal !== targetHospitalFromReferral) {
      originalHospitalName = caseData.rumahSakitAsal;
    } else {
      originalHospitalName = caseData.rumah_sakit;
    }
  }

  // Resolusi RS Asal dan RS Tujuan
  const resolvedRumahSakitAsal = sourceHospitalFromReferral ||
    (targetHospitalFromReferral && targetHospitalFromReferral !== originalHospitalName ? originalHospitalName : (caseData.rumahSakitAsal || null));

  const resolvedRumahSakitTujuan = targetHospitalFromReferral ||
    (resolvedRumahSakitAsal && resolvedRumahSakitAsal !== caseData.rumah_sakit ? caseData.rumah_sakit : (caseData.rumahSakitTujuan || null));

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

  const riwayatRujukan = rawReferrals.map((ref) => ({
    id: `REF-${ref.id}`,
    tanggal: ref.created_at,
    dariRs: ref.source_hospital_nama || resolvedRumahSakitAsal || originalHospitalName,
    keRs: ref.target_hospital_nama || resolvedRumahSakitTujuan || 'RS Rujukan',
    alasan: ref.alasan_rujukan || ref.reason || '',
    petugasAsalId: ref.previous_officer_id || ref.referred_by_officer_id,
    petugasAsalNama: ref.previous_officer_nama || ref.referred_by_officer_nama,
    petugasTujuanId: ref.new_officer_id,
    petugasTujuanNama: ref.new_officer_nama,
    status: `Dirujuk ke ${ref.target_hospital_nama || resolvedRumahSakitTujuan || 'RS Rujukan'}`
  }));

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
    nomorTiket: caseData.nomor_tiket,
    nomorLaporan: caseData.nomor_tiket,
    nama: caseData.nama_korban,
    nama_korban: caseData.nama_korban,
    nik: caseData.nik,
    usia: caseData.umur !== null && caseData.umur !== undefined ? caseData.umur : '—',
    umur: caseData.umur,
    jenisKelamin: caseData.jenis_kelamin || '—',
    alamat: caseData.alamat || '—',
    telepon: cleanPhoneNumber(caseData.no_pelapor_wa || caseData.telepon_korban || caseData.telepon),
    no_pelapor_wa: caseData.no_pelapor_wa,
    rumahSakit: caseData.rumah_sakit,
    rumah_sakit: caseData.rumah_sakit,
    rumahSakitAsal: resolvedRumahSakitAsal,
    rumahSakitTujuan: resolvedRumahSakitTujuan,
    riwayatRujukan: riwayatRujukan.length > 0 ? riwayatRujukan : (caseData.riwayatRujukan || []),
    hospital_id: hospitalId,
    hospital_lat: hospitalLat,
    hospital_lng: hospitalLng,
    hospital_radius: hospitalRadius,
    assigned_officer_id: caseData.assigned_officer_id || null,
    assigned_officer_nama: caseData.assigned_officer_nama || null,
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
    tanggalKecelakaan: caseData.tgl_laka || caseData.waktu_lapor_wa,
    tanggalMasukRs: caseData.tgl_masuk || caseData.waktu_lapor_wa,
    tanggalInformasiDiterima: caseData.waktu_lapor_wa,
    waktu_lapor_wa: caseData.waktu_lapor_wa,
    sumberInformasi: cleanSumberInformasi(caseData.sumber_informasi || caseData.sumberInformasi || 'Laporan Masuk Faskes'),
    petugasId: petugasId,
    namaPetugas: namaPetugas,
    kondisiTerakhir: caseData.status_kondisi || 'Rawat Inap',
    status_kondisi: caseData.status_kondisi || 'Rawat Inap',
    statusKonfirmasiKondisi: 'Terkonfirmasi',
    statusPemantauan,
    statusPerawatan,
    jadwalPemantauanBerikutnya: caseData.jadwal_berikutnya || (activePendingVisit ? activePendingVisit.jadwalKunjungan : null),
    tugasMenunggu: caseData.tugas_menunggu !== undefined ? Number(caseData.tugas_menunggu) : pendingVisits.length,
    activePendingVisit,
    activeVisitId: activePendingVisit ? activePendingVisit.visitId : null,
    kunjunganPertama: firstCompleted,
    tanggalKunjunganTerakhir: latestCompleted ? latestCompleted.tanggalKunjungan : null,
    waktuPemantauanTerakhir: latestCompleted ? latestCompleted.tanggalKunjungan : null,
    tanggalPemantauanTerakhir: latestCompleted ? latestCompleted.tanggalKunjungan : null,
    riwayatKunjungan: completedVisits,
    riwayatPemantauan: completedVisits.filter((v) => v.kunjunganKe > 1),
    riwayatAktivitas,
    riwayatPerawatan: initialCareHistory,
    statusTindakLanjut: (caseData.tugas_menunggu > 0 || pendingVisits.length > 0)
      ? 'Masih Perlu Ditindaklanjuti'
      : 'Sudah Selesai',
    tindakLanjut: (caseData.tugas_menunggu > 0 || pendingVisits.length > 0)
      ? 'Kunjungan verifikasi menunggu pelaksanaan'
      : 'Seluruh kunjungan pemantauan selesai',
    santunanSelesai: ['Selesai', 'Meninggal Dunia'].includes(caseData.status_kondisi),
    keteranganTambahan: caseData.kronologi || '',
    isFromBackend: true,
    rawCase: caseData,
    rawVisits: sortedVisits
  };
}

