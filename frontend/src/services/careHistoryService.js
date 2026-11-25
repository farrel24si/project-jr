/**
 * Care History Service - Riwayat Perawatan Pasien Antar Rumah Sakit
 * 
 * Mengelola segmentasi, pengelompokan, dan isolasi periode perawatan pasien 
 * yang berpindah atau kembali dirawat di rumah sakit lain setelah dinyatakan pulang.
 * 
 * Menjamin:
 * 1. Satu pasien memiliki satu identitas utama yang terhubung (berdasarkan NIK/ID).
 * 2. Setiap periode perawatan di rumah sakit berbeda terpisah secara jelas (tidak tercampur).
 * 3. Riwayat perawatan masa lalu bersifat read-only (hanya-baca) dan tidak dapat diubah/dihapus.
 * 4. Perawatan aktif saat ini teridentifikasi dengan penanda visual yang jelas.
 */

import { parseCatatanKondisi, parseDateToTimestamp } from './backendMapper.js';
import { getCachedPhoto } from './photoService.js';
import { formatDateTimeIndo } from '../utils/dateUtils.js';

function toTimestamp(dateStr) {
  return parseDateToTimestamp(dateStr);
}

export function formatCareDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

export function formatCareDateTime(dateStr) {
  if (!dateStr) return '—';
  return formatDateTimeIndo(dateStr);
}

/**
 * Menyusun daftar Periode Perawatan Antar Rumah Sakit (Care Episodes)
 * memisahkan riwayat RS A dan RS B secara terisolasi dan terstruktur.
 */
export function groupCareEpisodes(victim) {
  if (!victim) return [];

  const originHospital = victim.rumahSakitAsal || victim.rumah_sakit_asal || victim.riwayatPerawatan?.[0]?.rumahSakit || victim.rumahSakit || 'Rumah Sakit Awal';
  const currentHospital = victim.rumahSakit || victim.rumah_sakit || originHospital;

  const hasExplicitReferral = Boolean(
    (Array.isArray(victim.riwayatRujukan) && victim.riwayatRujukan.length > 0) ||
    (Array.isArray(victim.referrals) && victim.referrals.length > 0) ||
    victim.statusPerawatan === 'Rujukan' ||
    victim.statusPerawatan === 'Rujukan Diterima' ||
    Boolean(victim.isRujukanMasuk) ||
    (typeof victim.kondisiTerakhir === 'string' && (victim.kondisiTerakhir.startsWith('Dirujuk') || victim.kondisiTerakhir.startsWith('Rujukan'))) ||
    (typeof victim.status_kondisi === 'string' && (victim.status_kondisi.startsWith('Dirujuk') || victim.status_kondisi.startsWith('Rujukan'))) ||
    (typeof victim.statusPemantauan === 'string' && (victim.statusPemantauan.startsWith('Dirujuk') || victim.statusPemantauan.startsWith('Rujukan')))
  );

  // Jika korban sudah memiliki careEpisodes terstruktur dan terisolasi
  if (Array.isArray(victim.careEpisodes) && victim.careEpisodes.length >= 2) {
    if (!hasExplicitReferral) {
      // Jika TIDAK ADA rujukan resmi, pastikan tidak menampilkan multi-RS
      const matchingEp = victim.careEpisodes.find(
        (ep) => (ep.rumahSakit || '').toLowerCase().trim() === currentHospital.toLowerCase().trim()
      );
      if (matchingEp) {
        return [matchingEp];
      }
    } else {
      return victim.careEpisodes;
    }
  }

  const isDifferentHospital = hasExplicitReferral && originHospital && currentHospital &&
    originHospital.toLowerCase().trim() !== currentHospital.toLowerCase().trim();

  const isDischargedPast = Boolean(
    hasExplicitReferral && (
      victim.rawatLanjutanDariPulang ||
      victim.tanggalPulangSebelumnya ||
      victim.isRawatLanjutan ||
      victim.statusPerawatan === 'Rawat Lanjutan' ||
      (Array.isArray(victim.riwayatPerawatan) && victim.riwayatPerawatan.some((c) => c.jenisPerawatan === 'Pulang' || c.status === 'Pulang'))
    )
  );

  const initialDate = victim.tanggalMasukAwal || victim.tanggalMasukRs || victim.tanggalInformasiDiterima || victim.tanggalKecelakaan || new Date().toISOString();
  const readmissionDate = victim.tanggalMasukTerbaru || victim.tanggalMasukRs || initialDate;
  const readmissionTimestamp = toTimestamp(readmissionDate);

  // Kumpulkan seluruh aktivitas kunjungan selesai
  const rawActivities = Array.isArray(victim.riwayatAktivitas) && victim.riwayatAktivitas.length > 0
    ? victim.riwayatAktivitas
    : (Array.isArray(victim.riwayatKunjungan) ? victim.riwayatKunjungan : []);

  const allVisits = rawActivities
    .filter((a) => a && a.statusKunjungan !== 'Menunggu')
    .map((vis) => {
      const parsed = parseCatatanKondisi(vis.catatan_kondisi || vis.hasilKomunikasi || vis.hasilKunjungan || vis.hasilPemantauan);
      const photo = vis.fotoUrl || vis.foto_bukti_url || getCachedPhoto(vis.visitId) || getCachedPhoto(vis.id);
      return {
        ...vis,
        cleanCatatan: parsed.cleanRingkasan || vis.catatanTambahan || vis.hasilKomunikasi || vis.hasilKunjungan || 'Kunjungan telah selesai.',
        tindakanList: (vis.checklistTindakan && vis.checklistTindakan.length > 0) ? vis.checklistTindakan : parsed.tindakanList,
        fotoUrl: photo
      };
    })
    .sort((a, b) => toTimestamp(a.tanggalKunjungan || a.tanggal || a.waktuAktualKunjungan) - toTimestamp(b.tanggalKunjungan || b.tanggal || b.waktuAktualKunjungan));

  // Jika pasien tidak memiliki riwayat multi-faskes (hanya dirawat di 1 RS):
  if (!isDifferentHospital && !isDischargedPast) {
    const isFinished = ['Sudah Pulang', 'Pulang', 'Selesai', 'Meninggal Dunia'].includes(victim.kondisiTerakhir) || victim.statusPemantauan === 'Selesai Dipantau';
    return [
      {
        id: `EPISODE-1-${victim.id}`,
        nomorPeriode: 1,
        rumahSakit: currentHospital,
        labelPeriode: 'Periode 1 (Rawatan Utama)',
        tipePerawatan: 'Rawatan Utama',
        tanggalMulai: initialDate,
        tanggalSelesai: isFinished ? (victim.tanggalKunjunganTerakhir || victim.waktuPemantauanTerakhir || null) : null,
        statusPerawatan: isFinished ? 'Perawatan Selesai' : 'Perawatan Aktif',
        isAktif: !isFinished,
        isReadOnly: isFinished,
        petugasNama: victim.namaPetugas || 'Petugas Jasa Raharja',
        petugasId: victim.petugasId,
        alasanMasuk: victim.lokasiKejadian && victim.lokasiKejadian !== '—'
          ? `Pasien dirawat pasca kecelakaan di ${victim.lokasiKejadian}.`
          : 'Penerimaan awal korban kecelakaan lalu lintas di fasilitas kesehatan.',
        catatanKlinis: victim.kronologi || victim.keteranganTambahan || 'Perawatan pertama korban kecelakaan.',
        kondisiTerakhir: victim.kondisiTerakhir || 'Rawat Inap',
        kunjunganList: allVisits,
        totalKunjungan: allVisits.length
      }
    ];
  }

  // JIKA PASIEN MEMILIKI MULTI-PERIODE RAWAT (RS A -> RS B):
  // Pisahkan kunjungan berdasarkan rumah sakit dan batas tanggal kedatangan di RS B
  const visitsForHospitalA = [];
  const visitsForHospitalB = [];

  allVisits.forEach((vis) => {
    const visTime = toTimestamp(vis.tanggalKunjungan || vis.tanggal || vis.waktuAktualKunjungan);
    const visHospital = (vis.rumahSakit || '').toLowerCase().trim();
    const targetHospitalLower = currentHospital.toLowerCase().trim();
    const originHospitalLower = originHospital.toLowerCase().trim();

    if (visHospital && visHospital === targetHospitalLower) {
      visitsForHospitalB.push(vis);
    } else if (visHospital && visHospital === originHospitalLower) {
      visitsForHospitalA.push(vis);
    } else {
      // Fallback berdasarkan batas waktu kedatangan di RS B
      if (readmissionTimestamp > 0 && visTime >= readmissionTimestamp) {
        visitsForHospitalB.push(vis);
      } else {
        visitsForHospitalA.push(vis);
      }
    }
  });

  const dischargeDateA = victim.tanggalPulangSebelumnya ||
    victim.tanggalPulang ||
    (visitsForHospitalA.length > 0 ? (visitsForHospitalA[visitsForHospitalA.length - 1].tanggalKunjungan || visitsForHospitalA[visitsForHospitalA.length - 1].tanggal) : initialDate);

  // ── EPISODE 1: RS Awal (RS A) - READ-ONLY HISTORIS ──
  const episode1 = {
    id: `EPISODE-1-${victim.id}`,
    nomorPeriode: 1,
    rumahSakit: originHospital,
    labelPeriode: `Periode 1 (Rawat Awal di ${originHospital})`,
    tipePerawatan: 'Rawatan Pertama',
    tanggalMulai: initialDate,
    tanggalSelesai: dischargeDateA,
    statusPerawatan: 'Selesai / Pulang',
    isAktif: false,
    isReadOnly: true, // Petugas RS B hanya dapat membaca riwayat ini
    petugasNama: victim.petugasAsalNama || victim.namaPetugas || 'Petugas RS Asal',
    petugasId: victim.petugasAsalId || victim.petugasId,
    alasanMasuk: victim.lokasiKejadian && victim.lokasiKejadian !== '—'
      ? `Penanganan awal pasca kecelakaan di ${victim.lokasiKejadian}.`
      : `Penerimaan awal korban di ${originHospital}.`,
    catatanKlinis: `Pasien telah selesai menjalani rawat inap awal di ${originHospital} dan dinyatakan pulang sebelum kemudian kembali mendapatkan rawatan lanjutan.`,
    kondisiTerakhir: 'Selesai / Pulang',
    kunjunganList: visitsForHospitalA,
    totalKunjungan: visitsForHospitalA.length
  };

  // ── EPISODE 2: RS Saat Ini (RS B) - PERAWATAN AKTIF ──
  const isFinishedB = ['Sudah Pulang', 'Pulang', 'Selesai', 'Meninggal Dunia'].includes(victim.kondisiTerakhir) && !victim.isRawatLanjutan;
  const episode2 = {
    id: `EPISODE-2-${victim.id}`,
    nomorPeriode: 2,
    rumahSakit: currentHospital,
    labelPeriode: `Periode 2 (Rawat Lanjutan di ${currentHospital})`,
    tipePerawatan: victim.isRujukanMasuk || victim.statusPerawatan === 'Rujukan' ? 'Rujukan Medis Antar RS' : 'Rawatan Lanjutan Antar RS',
    tanggalMulai: readmissionDate,
    tanggalSelesai: isFinishedB ? (victim.tanggalKunjunganTerakhir || victim.waktuPemantauanTerakhir || null) : null,
    statusPerawatan: isFinishedB ? 'Perawatan Selesai' : 'Perawatan Aktif',
    isAktif: !isFinishedB,
    isReadOnly: false, // Perawatan aktif yang menjadi tanggung jawab petugas RS B saat ini
    petugasNama: victim.petugasTujuanNama || victim.namaPetugas || 'Petugas RS B',
    petugasId: victim.petugasTujuanId || victim.petugasId,
    alasanMasuk: victim.catatanRawatLanjutan ||
      `Pasien kembali mendapatkan perawatan medis di ${currentHospital} setelah sebelumnya pulang dari ${originHospital}.`,
    catatanKlinis: victim.kronologi || `Monitoring lanjutan pasien di fasilitas kesehatan ${currentHospital}.`,
    kondisiTerakhir: victim.kondisiTerakhir || 'Rawat Inap',
    kunjunganList: visitsForHospitalB,
    totalKunjungan: visitsForHospitalB.length
  };

  return [episode1, episode2];
}

export default {
  groupCareEpisodes,
  formatCareDate,
  formatCareDateTime
};

