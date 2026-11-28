/**
 * Standar 5 Kategori Status Pemantauan Korban Jasa Raharja:
 * 1. Belum Dipantau: Korban baru masuk (WhatsApp Bot / sumber lain) dan belum ada kunjungan atau tindak lanjut.
 * 2. Dalam Pemantauan: Petugas sudah melakukan kunjungan/tindak lanjut dan korban masih menjalani perawatan.
 * 3. Selesai Pulang: Korban diperbolehkan pulang oleh RS dan tidak memerlukan pemantauan lanjutan.
 * 4. Selesai MD: Korban dinyatakan meninggal dunia (mencatat tanggal & jam meninggal).
 * 5. Selesai Tidak Bersedia: Korban / keluarga menyatakan tidak bersedia menggunakan jaminan Jasa Raharja.
 */

export const MONITORING_STATUS = {
  BELUM_DIPANTAU: 'Belum Dipantau',
  DALAM_PEMANTAUAN: 'Dalam Pemantauan',
  SELESAI_PULANG: 'Selesai Pulang',
  SELESAI_MD: 'Selesai MD',
  SELESAI_TIDAK_BERSEDIA: 'Selesai Tidak Bersedia'
};

export const FINISHED_MONITORING_STATUSES = [
  MONITORING_STATUS.SELESAI_PULANG,
  MONITORING_STATUS.SELESAI_MD,
  MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA
];

export const ALL_MONITORING_STATUSES = [
  MONITORING_STATUS.BELUM_DIPANTAU,
  MONITORING_STATUS.DALAM_PEMANTAUAN,
  MONITORING_STATUS.SELESAI_PULANG,
  MONITORING_STATUS.SELESAI_MD,
  MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA
];

const ACTIVE_CARE_CONDITIONS = new Set([
  'rawat inap',
  'masih dirawat',
  'luka ringan',
  'luka berat',
  'rawat lanjutan',
  'dirujuk',
  'dirujuk ke rs lain',
  'belum dapat dikonfirmasi'
]);

export function isFinishedStatus(status) {
  return FINISHED_MONITORING_STATUSES.includes(status);
}

/**
 * Cek apakah aktivitas merupakan kunjungan fisik aktual (bukan konfirmasi tanpa kunjungan / aktivasi ulang)
 */
export function isActualPhysicalVisit(act) {
  if (!act) return false;
  if (act.statusKunjungan === 'Menunggu') return false;
  if (act.isNonVisitConfirmation === true) return false;
  const jenis = String(act.jenisAktivitas || '').toLowerCase();
  if (jenis.includes('tanpa kunjungan') || jenis.includes('aktivasi pemantauan kembali')) return false;
  return true;
}

/**
 * Cek apakah korban sudah pernah memiliki minimal 1 kunjungan fisik aktual pada episode aktif saat ini
 */
export function hasPhysicalVisit(v) {
  if (!v) return false;
  const acts = Array.isArray(v.riwayatAktivitas) ? v.riwayatAktivitas : [];
  const reactLogs = acts.filter((a) => a && (a.isReactivationLog === true || String(a.jenisAktivitas || '').toLowerCase().includes('aktivasi pemantauan kembali')));

  if (reactLogs.length > 0) {
    const latestReact = reactLogs.reduce((best, cur) => {
      const tCur = new Date(cur.waktuAktualKunjungan || cur.tanggalKunjungan || cur.tanggal || 0).getTime() || 0;
      const tBest = new Date(best.waktuAktualKunjungan || best.tanggalKunjungan || best.tanggal || 0).getTime() || 0;
      return tCur >= tBest ? cur : best;
    }, reactLogs[0]);
    const reactEp = Number(latestReact.episodeNumber) || 0;
    const reactTs = new Date(latestReact.waktuAktualKunjungan || latestReact.tanggalKunjungan || latestReact.tanggal || 0).getTime() || 0;

    return acts.some((a) => {
      if (!isActualPhysicalVisit(a)) return false;
      if (reactEp > 0 && a.episodeNumber) {
        return Number(a.episodeNumber) >= reactEp;
      }
      const aTs = new Date(a.waktuAktualKunjungan || a.tanggalKunjungan || a.tanggal || 0).getTime() || 0;
      return aTs > reactTs;
    });
  }

  if (v.kunjunganPertama && isActualPhysicalVisit(v.kunjunganPertama)) return true;
  if (Array.isArray(v.riwayatKunjungan) && v.riwayatKunjungan.some(isActualPhysicalVisit)) return true;
  if (acts.some(isActualPhysicalVisit)) return true;
  return false;
}

/**
 * Cek apakah korban / keluarga menyatakan tidak bersedia menggunakan jaminan Jasa Raharja
 */
export function isPenolakanJaminanVictim(v) {
  if (!v) return false;
  if (v.isPenolakanJaminanJR === true) return true;

  const fields = [
    v.kondisiTerakhir,
    v.status_kondisi,
    v.statusPemantauan,
    v.status_pemantauan,
    v.statusPerawatan
  ].map((s) => String(s || '').trim().toLowerCase());

  if (fields.some((s) => s.includes('tidak bersedia') || s.includes('tolak_jaminan') || s.includes('menolak jaminan'))) {
    return true;
  }

  if (Array.isArray(v.riwayatAktivitas)) {
    const hasRejectAct = v.riwayatAktivitas.some((a) => {
      const k = String(a?.kondisiKorban || a?.kondisi || '').toLowerCase();
      const c = String(a?.catatan_kondisi || a?.hasilKunjungan || '').toLowerCase();
      return a?.isPenolakanJaminanJR === true || k.includes('tidak bersedia') || c.includes('[tolak_jaminan_jr]') || c.includes('tidak bersedia menggunakan jaminan');
    });
    if (hasRejectAct) return true;
  }

  return false;
}

/**
 * Cek apakah korban dinyatakan Meninggal Dunia (Selesai MD)
 */
export function isDeceasedVictim(v) {
  if (!v) return false;
  if (v.tanggalMeninggal) return true;

  const fields = [
    v.kondisiTerakhir,
    v.status_kondisi,
    v.statusPemantauan,
    v.status_pemantauan,
    v.statusPerawatan
  ].map((s) => String(s || '').trim().toLowerCase());

  if (fields.some((s) => s.includes('meninggal') || s === 'selesai md' || s === 'md')) {
    return true;
  }

  if (Array.isArray(v.riwayatAktivitas)) {
    const latestAct = v.riwayatAktivitas.find((a) => a && a.statusKunjungan !== 'Menunggu');
    const actKondisi = String(latestAct?.kondisiKorban || latestAct?.kondisi || '').trim().toLowerCase();
    if (actKondisi.includes('meninggal') || actKondisi === 'md') {
      return true;
    }
  }

  return false;
}

/**
 * Cek apakah korban telah selesai karena pulang RS (Selesai Pulang).
 * Jika status diaktifkan kembali untuk perawatan lanjutan (kondisi aktif), mengembalikan false.
 */
export function isPulangVictim(v) {
  if (!v) return false;
  if (isDeceasedVictim(v) || isPenolakanJaminanVictim(v)) return false;

  const kt = String(v.kondisiTerakhir || '').trim().toLowerCase();
  const sk = String(v.status_kondisi || '').trim().toLowerCase();
  const sp = String(v.statusPemantauan || v.status_pemantauan || '').trim().toLowerCase();
  const spr = String(v.statusPerawatan || '').trim().toLowerCase();

  // Jika kondisi aktif eksplisit tercatat setelah aktivasi ulang / perawatan lanjutan, jangan anggap selesai
  if (
    v.isReactivated === true &&
    (ACTIVE_CARE_CONDITIONS.has(kt) || sp === 'dalam pemantauan' || sp === 'pemantauan aktif')
  ) {
    return false;
  }

  if (
    kt === 'sudah pulang' || kt === 'pulang' || kt === 'selesai' || kt === 'selesai pulang' ||
    sk === 'sudah pulang' || sk === 'pulang' || sk === 'selesai' || sk === 'selesai pulang' ||
    sp === 'selesai pulang' || sp === 'selesai' || sp === 'selesai dipantau' || sp.includes('arsip') ||
    spr === 'pulang'
  ) {
    return true;
  }

  // Jika kondisi saat ini jelas masih dirawat/aktif, jangan menandai pulang dari riwayat lama
  if (ACTIVE_CARE_CONDITIONS.has(kt) || ACTIVE_CARE_CONDITIONS.has(sk)) {
    return false;
  }

  if (Array.isArray(v.careEpisodes) && v.careEpisodes.length > 0) {
    const lastEp = v.careEpisodes[v.careEpisodes.length - 1];
    const epSt = String(lastEp?.status || lastEp?.kondisiTerakhir || '').trim().toLowerCase();
    if (epSt === 'pulang' || epSt === 'sudah pulang' || epSt === 'selesai' || epSt === 'selesai pulang') {
      return true;
    }
  }

  if (Array.isArray(v.riwayatAktivitas) && v.riwayatAktivitas.length > 0) {
    const sortedActs = [...v.riwayatAktivitas].filter((a) => a.statusKunjungan !== 'Menunggu');
    if (sortedActs.length > 0) {
      const latestAct = sortedActs[0];
      const actKondisi = String(latestAct.kondisiKorban || latestAct.kondisi || '').trim().toLowerCase();
      if (actKondisi === 'sudah pulang' || actKondisi === 'pulang' || actKondisi === 'selesai' || actKondisi === 'selesai pulang') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Cek apakah pemantauan korban sudah berakhir (Selesai Pulang / Selesai MD / Selesai Tidak Bersedia)
 */
export function isVictimFinished(v) {
  if (!v) return false;
  return isPenolakanJaminanVictim(v) || isDeceasedVictim(v) || isPulangVictim(v);
}

/**
 * Cek apakah pemantauan dapat diaktifkan kembali (khusus status Selesai Pulang jika kembali berobat)
 */
export function canReactivateMonitoring(v) {
  if (!v) return false;
  return getMonitoringStatus(v) === MONITORING_STATUS.SELESAI_PULANG;
}

/**
 * Evaluasi status pemantauan korban berdasarkan 5 kategori resmi
 */
export function getMonitoringStatus(v) {
  if (!v) return MONITORING_STATUS.BELUM_DIPANTAU;

  if (isPenolakanJaminanVictim(v)) {
    return MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA;
  }

  if (isDeceasedVictim(v)) {
    return MONITORING_STATUS.SELESAI_MD;
  }

  if (isPulangVictim(v)) {
    return MONITORING_STATUS.SELESAI_PULANG;
  }

  if (!hasPhysicalVisit(v)) {
    return MONITORING_STATUS.BELUM_DIPANTAU;
  }

  return MONITORING_STATUS.DALAM_PEMANTAUAN;
}

/**
 * Ringkasan alasan berakhirnya pemantauan untuk tampilan Kabag & Petugas
 */
export function getCompletionReason(v) {
  if (!v) return null;
  const st = getMonitoringStatus(v);

  if (st === MONITORING_STATUS.SELESAI_MD) {
    const parts = [];
    if (v.tanggalMeninggal) parts.push(`Tgl: ${v.tanggalMeninggal}`);
    if (v.jamMeninggal) parts.push(`${String(v.jamMeninggal).replace(/\s*WIB/i, '').trim()} WIB`);
    return {
      status: st,
      label: 'Meninggal Dunia',
      detail: parts.length > 0 ? parts.join(' • ') : 'Dinyatakan meninggal dunia'
    };
  }

  if (st === MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA) {
    const parts = [];
    if (v.tanggalPenolakanJaminan) parts.push(`Tgl: ${v.tanggalPenolakanJaminan}`);
    if (v.keteranganPenolakanJaminan) parts.push(v.keteranganPenolakanJaminan);
    return {
      status: st,
      label: 'Menolak Jaminan JR',
      detail: parts.length > 0 ? parts.join(' • ') : 'Tidak bersedia menggunakan jaminan Jasa Raharja'
    };
  }

  if (st === MONITORING_STATUS.SELESAI_PULANG) {
    const tglPulang = v.tanggalPulang || v.tanggalSelesai || null;
    return {
      status: st,
      label: 'Pulang RS',
      detail: tglPulang ? `Tgl Pulang: ${String(tglPulang).split('T')[0]}` : 'Diperbolehkan pulang oleh RS'
    };
  }

  return null;
}

/**
 * Helper untuk memeriksa apakah petugas diizinkan mencatat kunjungan/pemantauan
 */
export function canRecordVisit(v) {
  if (!v) return false;
  return !isVictimFinished(v);
}
