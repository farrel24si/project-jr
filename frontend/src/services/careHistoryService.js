/**
 * Care History Service - Episode Perawatan Korban Jasa Raharja
 *
 * Mengelola pengelompokan riwayat perawatan korban berdasarkan Episode Perawatan:
 * 1. Satu identitas korban dapat memiliki beberapa Episode Perawatan.
 * 2. Rujukan antar-RS berada dalam episode yang sama dan nomor kunjungan terus berlanjut.
 * 3. Jika korban pulang (Selesai Pulang) lalu kembali berobat (di RS sama atau berbeda),
 *    sistem membuat Episode Perawatan baru dengan nomor kunjungan dimulai kembali dari ke-1.
 * 4. Seluruh riwayat episode dan kunjungan sebelumnya tetap tersimpan (read-only).
 */

import { parseCatatanKondisi, parseDateToTimestamp } from './backendMapper.js';
import { getCachedPhoto } from './photoService.js';
import { formatDateTimeIndo } from '../utils/dateUtils.js';
import {
  MONITORING_STATUS,
  isActualPhysicalVisit,
  isDeceasedVictim,
  isPenolakanJaminanVictim
} from '../utils/monitoringStatus.js';

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

function isReactivationEvent(act) {
  if (!act) return false;
  if (act.isReactivationLog === true) return true;
  const j = String(act.jenisAktivitas || '').toLowerCase();
  return j.includes('aktivasi pemantauan kembali') || j === 'rawat lanjutan';
}

function isDischargeCondition(cond) {
  const c = String(cond || '').trim().toLowerCase();
  return c === 'sudah pulang' || c === 'pulang' || c === 'selesai' || c === 'selesai pulang';
}

function isDeceasedCondition(cond) {
  const c = String(cond || '').trim().toLowerCase();
  return c.includes('meninggal') || c === 'selesai md' || c === 'md';
}

function isRejectCondition(cond) {
  const c = String(cond || '').trim().toLowerCase();
  return c.includes('tidak bersedia') || c.includes('tolak');
}

/**
 * Menyusun daftar Episode Perawatan korban secara kronologis (Episode 1, 2, dst.).
 * Mengembalikan array terurut dari Episode 1 ke terbaru; pemanggil dapat membalik urutan
 * untuk menampilkan episode terbaru paling atas.
 */
export function groupCareEpisodes(victim) {
  if (!victim) return [];

  const initialDate =
    victim.tanggalMasukAwal ||
    victim.tanggalMasukRs ||
    victim.tanggalInformasiDiterima ||
    victim.tanggalKecelakaan ||
    new Date().toISOString();

  const rawReferrals = Array.isArray(victim.riwayatRujukan) && victim.riwayatRujukan.length > 0
    ? victim.riwayatRujukan
    : (Array.isArray(victim.referrals) ? victim.referrals : []);

  const originHospital =
    rawReferrals[0]?.dariRs ||
    rawReferrals[0]?.source_hospital_nama ||
    victim.rumahSakitAsal ||
    victim.rumah_sakit_asal ||
    victim.riwayatPerawatan?.[0]?.rumahSakit ||
    victim.rumahSakit ||
    'Rumah Sakit';

  // Kumpulkan seluruh aktivitas unik (kunjungan fisik, konfirmasi non-kunjungan, aktivasi ulang)
  const rawPool = [
    ...(Array.isArray(victim.riwayatAktivitas) ? victim.riwayatAktivitas : []),
    ...(victim.kunjunganPertama ? [victim.kunjunganPertama] : []),
    ...(Array.isArray(victim.riwayatKunjungan) ? victim.riwayatKunjungan : []),
    ...(Array.isArray(victim.riwayatPemantauan) ? victim.riwayatPemantauan : [])
  ];

  const seenActKeys = new Set();
  const uniqueEvents = [];
  rawPool.forEach((act) => {
    if (!act || act.statusKunjungan === 'Menunggu') return;
    const t = act.waktuAktualKunjungan || act.tanggalKunjungan || act.tanggal || act.waktuFoto || '';
    const key = act.id || act.visitId || `${t}-${act.jenisAktivitas || ''}-${act.rumahSakit || ''}`;
    if (!seenActKeys.has(key)) {
      seenActKeys.add(key);
      const parsed = parseCatatanKondisi(act.catatan_kondisi || act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan);
      const photo = act.fotoUrl || act.foto_bukti_url || getCachedPhoto(act.visitId) || getCachedPhoto(act.id);
      uniqueEvents.push({
        ...act,
        cleanCatatan: parsed.cleanRingkasan || act.catatanTambahan || act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan || 'Kunjungan telah selesai.',
        tindakanList: (act.checklistTindakan && act.checklistTindakan.length > 0) ? act.checklistTindakan : parsed.tindakanList,
        fotoUrl: photo,
        _ts: toTimestamp(t)
      });
    }
  });

  // Urutkan kronologis (paling lama -> paling baru), hormati episodeNumber jika ada
  uniqueEvents.sort((a, b) => {
    const epA = Number(a.episodeNumber) || 0;
    const epB = Number(b.episodeNumber) || 0;
    if (epA > 0 && epB > 0 && epA !== epB) return epA - epB;
    if (a._ts !== b._ts) return a._ts - b._ts;
    const rA = isReactivationEvent(a) ? 1 : 0;
    const rB = isReactivationEvent(b) ? 1 : 0;
    if (rA !== rB) return rA - rB;
    return (Number(a.kunjunganKe) || 0) - (Number(b.kunjunganKe) || 0);
  });

  // Bentuk episode-episode perawatan
  const episodes = [];
  const createEpisode = (num, startDate, hospital, officerName, officerId) => ({
    id: `EPISODE-${num}-${victim.id}`,
    nomorPeriode: num,
    rumahSakit: hospital || originHospital,
    rumahSakitList: hospital ? [hospital] : [originHospital],
    labelPeriode: `Episode Perawatan ${num}`,
    tanggalMulai: startDate,
    tanggalSelesai: null,
    jamMeninggal: null,
    keteranganSelesai: null,
    statusEpisode: MONITORING_STATUS.BELUM_DIPANTAU,
    isAktif: true,
    isReadOnly: false,
    petugasNama: officerName || victim.namaPetugas || 'Petugas Jasa Raharja',
    petugasId: officerId || victim.petugasId,
    rujukanList: [],
    kunjunganList: [],
    nonVisitLogs: [],
    totalKunjungan: 0
  });

  let currentEp = createEpisode(
    1,
    initialDate,
    originHospital,
    victim.petugasAsalNama || victim.namaPetugas,
    victim.petugasAsalId || victim.petugasId
  );

  // Sisipkan metadata rujukan yang ada pada episode berjalan
  if (rawReferrals.length > 0) {
    rawReferrals.forEach((ref) => {
      const dari = ref.dariRs || ref.rumahSakitAsal || ref.source_hospital_nama || originHospital;
      const ke = ref.keRs || ref.rumahSakitTujuan || ref.target_hospital_nama || victim.rumahSakit;
      if (ke && !currentEp.rumahSakitList.some((h) => h.toLowerCase() === ke.toLowerCase())) {
        currentEp.rumahSakitList.push(ke);
      }
      currentEp.rujukanList.push({
        dariRs: dari,
        keRs: ke,
        tanggal: ref.tanggal || ref.created_at || victim.tanggalRujukan || initialDate,
        petugasAsalNama: ref.petugasAsalNama || victim.petugasAsalNama,
        petugasTujuanNama: ref.petugasTujuanNama || victim.petugasTujuanNama || victim.namaPetugas,
        catatan: ref.alasan || ref.catatan || `Dirujuk dari ${dari} ke ${ke}`
      });
      if (ke) {
        currentEp.rumahSakit = ke;
      }
      if (ref.petugasTujuanNama || victim.petugasTujuanNama) {
        currentEp.petugasNama = ref.petugasTujuanNama || victim.petugasTujuanNama || currentEp.petugasNama;
      }
    });
  }

  let episodeVisitCounter = 0;

  uniqueEvents.forEach((ev) => {
    // Jika ini adalah log aktivasi ulang / rawat lanjutan setelah episode sebelumnya selesai, buat Episode baru!
    if (isReactivationEvent(ev)) {
      if (!currentEp.tanggalSelesai) {
        currentEp.tanggalSelesai = ev.tanggalKunjungan || ev.tanggal || ev.waktuAktualKunjungan;
      }
      if (currentEp.statusEpisode === MONITORING_STATUS.BELUM_DIPANTAU || currentEp.statusEpisode === MONITORING_STATUS.DALAM_PEMANTAUAN) {
        currentEp.statusEpisode = MONITORING_STATUS.SELESAI_PULANG;
      }
      currentEp.isAktif = false;
      currentEp.isReadOnly = true;
      episodes.push(currentEp);

      const nextNum = episodes.length + 1;
      episodeVisitCounter = 0;
      const nextHospital = ev.rumahSakit || victim.rumahSakit || currentEp.rumahSakit;
      currentEp = createEpisode(
        nextNum,
        ev.waktuAktualKunjungan || ev.tanggalKunjungan || ev.tanggal || new Date().toISOString(),
        nextHospital,
        ev.petugasNama || victim.namaPetugas,
        ev.petugasId || victim.petugasId
      );
      currentEp.statusEpisode = MONITORING_STATUS.BELUM_DIPANTAU;
      currentEp.nonVisitLogs.push(ev);
      return;
    }

    const evCond = ev.kondisiKorban || ev.kondisi || '';
    const isPhysical = isActualPhysicalVisit(ev);

    // Jika episode saat ini sudah Selesai Pulang dan ada kunjungan fisik baru setelahnya,
    // otomatis mulai Episode Perawatan baru (nomor kunjungan reset ke 1)
    if (isPhysical && currentEp.statusEpisode === MONITORING_STATUS.SELESAI_PULANG) {
      currentEp.isAktif = false;
      currentEp.isReadOnly = true;
      episodes.push(currentEp);

      const nextNum = episodes.length + 1;
      episodeVisitCounter = 0;
      currentEp = createEpisode(
        nextNum,
        ev.waktuAktualKunjungan || ev.tanggalKunjungan || ev.tanggal || new Date().toISOString(),
        ev.rumahSakit || victim.rumahSakit || currentEp.rumahSakit,
        ev.petugasNama || victim.namaPetugas,
        ev.petugasId || victim.petugasId
      );
      currentEp.statusEpisode = MONITORING_STATUS.DALAM_PEMANTAUAN;
    }

    if (isPhysical) {
      episodeVisitCounter += 1;
      const numberedVisit = {
        ...ev,
        nomorKunjunganEpisode: episodeVisitCounter,
        visitNumber: episodeVisitCounter
      };
      currentEp.kunjunganList.push(numberedVisit);
      currentEp.totalKunjungan = episodeVisitCounter;
      if (currentEp.statusEpisode === MONITORING_STATUS.BELUM_DIPANTAU) {
        currentEp.statusEpisode = MONITORING_STATUS.DALAM_PEMANTAUAN;
      }
    } else {
      currentEp.nonVisitLogs.push(ev);
    }

    // Jika terjadi rujukan pada event ini (tetap dalam episode yang sama)
    const refTarget = ev.rumahSakitRujukan || (String(evCond).startsWith('Dirujuk ke ') ? String(evCond).replace(/^Dirujuk ke\s+/i, '').trim() : null);
    if (refTarget && refTarget !== 'RS Lain') {
      const prevHosp = currentEp.rumahSakit;
      if (!currentEp.rumahSakitList.some((h) => h.toLowerCase() === refTarget.toLowerCase())) {
        currentEp.rumahSakitList.push(refTarget);
      }
      if (!currentEp.rujukanList.some((r) => r.keRs?.toLowerCase() === refTarget.toLowerCase())) {
        currentEp.rujukanList.push({
          dariRs: prevHosp,
          keRs: refTarget,
          tanggal: ev.waktuAktualKunjungan || ev.tanggalKunjungan || ev.tanggal,
          petugasAsalNama: ev.petugasNama || currentEp.petugasNama,
          petugasTujuanNama: victim.petugasTujuanNama || victim.namaPetugas,
          catatan: ev.alasanRujukan || ev.cleanCatatan || `Dirujuk dari ${prevHosp} ke ${refTarget}`
        });
      }
      currentEp.rumahSakit = refTarget;
    }

    // Update rumah sakit & petugas jika ada info lebih baru pada kunjungan ini
    if (ev.rumahSakit && !currentEp.rumahSakitList.some((h) => h.toLowerCase() === ev.rumahSakit.toLowerCase())) {
      currentEp.rumahSakitList.push(ev.rumahSakit);
      currentEp.rumahSakit = ev.rumahSakit;
    }
    if (ev.petugasNama) {
      currentEp.petugasNama = ev.petugasNama;
    }

    // Cek apakah event ini mengakhiri episode
    const evDate = ev.waktuAktualKunjungan || ev.tanggalKunjungan || ev.tanggal;
    if (isRejectCondition(evCond) || ev.isPenolakanJaminanJR) {
      currentEp.statusEpisode = MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA;
      currentEp.isAktif = false;
      currentEp.isReadOnly = true;
      currentEp.tanggalSelesai = ev.tanggalPenolakan || victim.tanggalPenolakanJaminan || evDate;
      currentEp.keteranganSelesai = ev.keteranganPenolakan || victim.keteranganPenolakanJaminan || ev.cleanCatatan;
    } else if (isDeceasedCondition(evCond)) {
      currentEp.statusEpisode = MONITORING_STATUS.SELESAI_MD;
      currentEp.isAktif = false;
      currentEp.isReadOnly = true;
      currentEp.tanggalSelesai = ev.tanggalMeninggal || victim.tanggalMeninggal || evDate;
      currentEp.jamMeninggal = ev.jamMeninggal || victim.jamMeninggal || null;
      currentEp.keteranganSelesai = ev.cleanCatatan;
    } else if (isDischargeCondition(evCond)) {
      currentEp.statusEpisode = MONITORING_STATUS.SELESAI_PULANG;
      currentEp.isAktif = false;
      currentEp.isReadOnly = true;
      currentEp.tanggalSelesai = ev.tanggalPulang || victim.tanggalPulang || evDate;
      currentEp.keteranganSelesai = ev.cleanCatatan;
    }
  });

  // Sinkronkan status akhir episode terakhir dengan status aktual victim saat ini
  if (victim.isReactivated && !isDeceasedVictim(victim) && !isPenolakanJaminanVictim(victim)) {
    const condLower = String(victim.kondisiTerakhir || '').trim().toLowerCase();
    const isLatestFinished = isDischargeCondition(condLower);
    if (!isLatestFinished) {
      currentEp.statusEpisode = currentEp.totalKunjungan > 0
        ? MONITORING_STATUS.DALAM_PEMANTAUAN
        : MONITORING_STATUS.BELUM_DIPANTAU;
      currentEp.isAktif = true;
      currentEp.isReadOnly = false;
      currentEp.tanggalSelesai = null;
    }
  } else {
    if (isPenolakanJaminanVictim(victim)) {
      currentEp.statusEpisode = MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA;
      currentEp.isAktif = false;
      currentEp.isReadOnly = true;
      currentEp.tanggalSelesai = currentEp.tanggalSelesai || victim.tanggalPenolakanJaminan || victim.tanggalKunjunganTerakhir;
      currentEp.keteranganSelesai = currentEp.keteranganSelesai || victim.keteranganPenolakanJaminan;
    } else if (isDeceasedVictim(victim)) {
      currentEp.statusEpisode = MONITORING_STATUS.SELESAI_MD;
      currentEp.isAktif = false;
      currentEp.isReadOnly = true;
      currentEp.tanggalSelesai = currentEp.tanggalSelesai || victim.tanggalMeninggal || victim.tanggalKunjunganTerakhir;
      currentEp.jamMeninggal = currentEp.jamMeninggal || victim.jamMeninggal;
    } else if (isDischargeCondition(victim.kondisiTerakhir) || isDischargeCondition(victim.status_kondisi)) {
      currentEp.statusEpisode = MONITORING_STATUS.SELESAI_PULANG;
      currentEp.isAktif = false;
      currentEp.isReadOnly = true;
      currentEp.tanggalSelesai = currentEp.tanggalSelesai || victim.tanggalPulang || victim.tanggalKunjunganTerakhir;
    }
  }

  // Pastikan petugas & RS episode aktif selaras dengan penugasan saat ini
  if (currentEp.isAktif) {
    if (victim.rumahSakit) currentEp.rumahSakit = victim.rumahSakit;
    if (victim.namaPetugas) currentEp.petugasNama = victim.namaPetugas;
    if (victim.petugasId) currentEp.petugasId = victim.petugasId;
  }

  episodes.push(currentEp);
  return episodes;
}

/**
 * Menghitung nomor kunjungan berikutnya dalam episode aktif saat ini
 */
export function getNextEpisodeVisitNumber(victim) {
  const episodes = groupCareEpisodes(victim);
  if (episodes.length === 0) return 1;
  const activeEp = episodes[episodes.length - 1];
  return (activeEp.totalKunjungan || 0) + 1;
}

export default {
  groupCareEpisodes,
  getNextEpisodeVisitNumber,
  formatCareDate,
  formatCareDateTime
};
