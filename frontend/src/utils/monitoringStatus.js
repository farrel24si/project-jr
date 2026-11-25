/**
 * Standar 4 Kategori Status Pemantauan Pasien Jasa Raharja:
 * 1. Menunggu Kunjungan: Korban sudah masuk ke sistem, tetapi belum dilakukan kunjungan awal.
 * 2. Dalam Pemantauan: Kunjungan awal sudah dilakukan dan korban masih membutuhkan pemantauan.
 * 3. Menunggu Tindak Lanjut: Sudah waktunya melakukan kunjungan berikutnya, tetapi petugas belum melakukan kunjungan.
 * 4. Selesai: Pemantauan berakhir karena korban sudah pulang atau meninggal dunia (MD).
 */

export const MONITORING_STATUS = {
  MENUNGGU_KUNJUNGAN: 'Menunggu Kunjungan',
  DALAM_PEMANTAUAN: 'Dalam Pemantauan',
  MENUNGGU_TINDAK_LANJUT: 'Menunggu Tindak Lanjut',
  SELESAI: 'Selesai'
};

export const ALL_MONITORING_STATUSES = [
  MONITORING_STATUS.MENUNGGU_KUNJUNGAN,
  MONITORING_STATUS.DALAM_PEMANTAUAN,
  MONITORING_STATUS.MENUNGGU_TINDAK_LANJUT,
  MONITORING_STATUS.SELESAI
];

/**
 * Cek apakah pasien telah selesai pemantauannya (Pulang / Meninggal Dunia)
 * Jika korban pulang atau meninggal, status selesai dan tidak dapat dicatat pemantauan lagi.
 */
export function isVictimFinished(v) {
  if (!v) return false;

  const kt = String(v.kondisiTerakhir || '').trim().toLowerCase();
  const sk = String(v.status_kondisi || '').trim().toLowerCase();
  const sp = String(v.statusPemantauan || v.status_pemantauan || '').trim().toLowerCase();
  const spr = String(v.statusPerawatan || '').trim().toLowerCase();

  // 1. Cek indikator kepulangan atau selesai
  if (
    kt === 'sudah pulang' || kt === 'pulang' || kt === 'selesai' || kt.includes('meninggal') ||
    sk === 'sudah pulang' || sk === 'pulang' || sk === 'selesai' || sk.includes('meninggal') ||
    sp === 'selesai' || sp === 'selesai dipantau' || sp.includes('arsip') ||
    spr === 'pulang' || spr.includes('meninggal') ||
    Boolean(v.tanggalMeninggal)
  ) {
    return true;
  }

  // 2. Cek riwayat episode perawatan terakhir
  if (Array.isArray(v.careEpisodes) && v.careEpisodes.length > 0) {
    const lastEp = v.careEpisodes[v.careEpisodes.length - 1];
    const epSt = String(lastEp?.status || lastEp?.kondisiTerakhir || '').trim().toLowerCase();
    if (epSt === 'pulang' || epSt === 'sudah pulang' || epSt === 'selesai' || epSt.includes('meninggal')) {
      return true;
    }
  }

  // 3. Cek riwayat aktivitas terakhir
  if (Array.isArray(v.riwayatAktivitas) && v.riwayatAktivitas.length > 0) {
    const sortedActs = [...v.riwayatAktivitas].filter((a) => a.statusKunjungan !== 'Menunggu');
    if (sortedActs.length > 0) {
      const latestAct = sortedActs[0];
      const actKondisi = String(latestAct.kondisiKorban || latestAct.kondisi || '').trim().toLowerCase();
      if (actKondisi === 'sudah pulang' || actKondisi === 'pulang' || actKondisi === 'selesai' || actKondisi.includes('meninggal')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Evaluasi status pemantauan korban secara otomatis berdasarkan 4 kategori resmi
 */
export function getMonitoringStatus(v) {
  if (!v) return MONITORING_STATUS.MENUNGGU_KUNJUNGAN;

  // 4. Selesai: Pemantauan berakhir karena korban sudah pulang atau meninggal dunia (MD)
  if (isVictimFinished(v)) {
    return MONITORING_STATUS.SELESAI;
  }

  // Cek apakah kunjungan awal sudah pernah dilaksanakan
  const hasFirstVisit = Boolean(
    v.kunjunganPertama ||
    (Array.isArray(v.riwayatKunjungan) && v.riwayatKunjungan.length > 0) ||
    (Array.isArray(v.riwayatAktivitas) && v.riwayatAktivitas.some((a) => a.kunjunganKe === 1 || (a.statusKunjungan && a.statusKunjungan !== 'Menunggu')))
  );

  // 1. Menunggu Kunjungan: Korban sudah masuk ke sistem, tetapi belum dilakukan kunjungan awal
  if (!hasFirstVisit) {
    return MONITORING_STATUS.MENUNGGU_KUNJUNGAN;
  }

  // Jika kunjungan awal sudah pernah dilakukan:
  // Evaluasi apakah sudah waktunya melakukan kunjungan berikutnya
  const now = Date.now();

  const lastVisitDate =
    v.tanggalKunjunganTerakhir ||
    v.waktuPemantauanTerakhir ||
    v.tanggalPemantauanTerakhir ||
    v.kunjunganPertama?.waktuAktualKunjungan ||
    v.kunjunganPertama?.tanggalKunjungan ||
    v.kunjunganPertama?.tanggal;

  let isNextVisitDue = false;

  // Cek 1: Ada tanggal jadwal berikutnya dan sudah tiba / lewat
  if (v.jadwalPemantauanBerikutnya) {
    const nextTime = new Date(v.jadwalPemantauanBerikutnya).getTime();
    if (!isNaN(nextTime) && nextTime <= now) {
      isNextVisitDue = true;
    }
  }

  // Cek 2: Active pending visit sudah tiba jadwalnya atau lewat 3 hari
  if (v.activePendingVisit) {
    if (v.activePendingVisit.isOverdue3Days) {
      isNextVisitDue = true;
    } else if (v.activePendingVisit.jadwalKunjungan) {
      const pendingTime = new Date(v.activePendingVisit.jadwalKunjungan).getTime();
      if (!isNaN(pendingTime) && pendingTime <= now) {
        isNextVisitDue = true;
      }
    }
  }

  // Cek 3: Waktu sejak kunjungan terakhir sudah mencapai / melewati 72 jam (3 hari)
  if (!isNextVisitDue && lastVisitDate) {
    const lastTime = new Date(lastVisitDate).getTime();
    if (!isNaN(lastTime)) {
      const elapsedHours = (now - lastTime) / (1000 * 60 * 60);
      if (elapsedHours >= 72) {
        isNextVisitDue = true;
      }
    }
  }

  // Cek 4: Indikator overdue atau tindak lanjut masih diperlukan
  if (!isNextVisitDue && (Boolean(v.isOverdue) || Boolean(v.is_overdue))) {
    isNextVisitDue = true;
  }

  // 3. Menunggu Tindak Lanjut: Sudah waktunya melakukan kunjungan berikutnya, tetapi petugas belum melakukan kunjungan
  if (isNextVisitDue) {
    return MONITORING_STATUS.MENUNGGU_TINDAK_LANJUT;
  }

  // 2. Dalam Pemantauan: Kunjungan awal sudah dilakukan dan korban masih membutuhkan pemantauan
  return MONITORING_STATUS.DALAM_PEMANTAUAN;
}

/**
 * Helper untuk memeriksa apakah petugas diizinkan mencatat kunjungan/pemantauan
 */
export function canRecordVisit(v) {
  if (!v) return false;
  return !isVictimFinished(v);
}
