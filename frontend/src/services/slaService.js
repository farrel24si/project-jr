/**
 * SLA Service - Shared SLA calculation engine for Petugas & Kepala Bagian
 * 
 * Rules:
 * - Kunjungan Pertama: Max 3 hari (72 jam) dari tanggal informasi diterima.
 * - Pemantauan Lanjutan: Interval 3 hari (72 jam) dari kunjungan terakhir atau pemantauan terakhir.
 * - Status:
 *    - SELESAI: Pekerjaan telah dilakukan (misal sudah dikunjungi / sudah dipantau).
 *    - TERLAMBAT: Melewati batas waktu dan belum dilakukan.
 *    - MENDEKATI_TENGGAT: Sisa waktu <= 24 jam dan belum dilakukan.
 *    - TEPAT_WAKTU: Masih memiliki sisa waktu > 24 jam.
 */

import { isVictimFinished } from '../utils/monitoringStatus';

export const SLA_FIRST_VISIT_HOURS = 72; // 3 hari
export const SLA_MONITORING_INTERVAL_HOURS = 72; // 3 hari
export const SLA_DEADLINE_WARNING_HOURS = 24; // 24 jam sisa waktu untuk warning

/**
 * Format durasi jam ke string mudah dibaca dalam bahasa Indonesia
 */
export function formatDuration(diffMs) {
  const isNegative = diffMs < 0;
  const absMs = Math.abs(diffMs);

  const totalHours = Math.floor(absMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = Math.floor((absMs % (1000 * 60 * 60)) / (1000 * 60));

  let text;
  if (days > 0) {
    text = `${days} hari ${hours > 0 ? `${hours} jam` : ''}`.trim();
  } else if (totalHours > 0) {
    text = `${totalHours} jam ${minutes > 0 ? `${minutes} mnt` : ''}`.trim();
  } else {
    text = `${minutes} menit`;
  }

  return {
    isNegative,
    text,
    totalHours,
    days,
    hours,
    minutes
  };
}

/**
 * Hitung status SLA untuk Kunjungan Pertama
 * @param {string|Date} tanggalInformasiDiterima - ISO string / date
 * @param {object|null} kunjunganPertama - object kunjungan pertama jika sudah ada
 * @param {Date} [referenceDate] - waktu acuan (default: now)
 */
export function calculateFirstVisitSla(tanggalInformasiDiterima, kunjunganPertama = null, referenceDate = new Date()) {
  if (!tanggalInformasiDiterima) {
    return {
      status: 'TIDAK_DIKETAHUI',
      label: 'Tidak Diketahui',
      colorClass: 'bg-slate-100 text-slate-700 border-slate-300',
      description: 'Tanggal informasi tidak valid',
      isOverdue: false,
      isCompleted: false,
      deadline: null
    };
  }

  const receivedTime = new Date(tanggalInformasiDiterima).getTime();
  const deadlineTime = receivedTime + SLA_FIRST_VISIT_HOURS * 60 * 60 * 1000;
  const deadlineDate = new Date(deadlineTime);

  const visitDateStr = kunjunganPertama && (
    kunjunganPertama.tanggalKunjungan ||
    kunjunganPertama.waktuAktualKunjungan ||
    kunjunganPertama.tanggal ||
    kunjunganPertama.waktuFoto
  );

  // Jika sudah dikunjungi
  if (kunjunganPertama && visitDateStr) {
    const visitTime = new Date(visitDateStr).getTime();
    const wasOverdue = visitTime > deadlineTime;
    const diff = visitTime - deadlineTime;
    const duration = formatDuration(diff);

    if (wasOverdue) {
      return {
        status: 'SELESAI_TERLAMBAT',
        label: 'Selesai (Terlambat)',
        colorClass: 'bg-amber-50 text-amber-800 border-amber-300',
        badgeColor: 'amber',
        description: `Selesai setelah melewati tenggat (${duration.text})`,
        isOverdue: false, // Sudah tidak aktif pending
        wasLate: true,
        isCompleted: true,
        deadline: deadlineDate,
        completedAt: new Date(visitTime)
      };
    } else {
      return {
        status: 'SELESAI_TEPAT_WAKTU',
        label: 'Selesai Tepat Waktu',
        colorClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
        badgeColor: 'emerald',
        description: 'Kunjungan pertama selesai tepat waktu',
        isOverdue: false,
        wasLate: false,
        isCompleted: true,
        deadline: deadlineDate,
        completedAt: new Date(visitTime)
      };
    }
  }

  // Belum dikunjungi (aktif pending)
  const now = referenceDate.getTime();
  const diffFromDeadline = deadlineTime - now;

  if (diffFromDeadline < 0) {
    // Terlambat
    const overdueDuration = formatDuration(Math.abs(diffFromDeadline));
    return {
      status: 'TERLAMBAT',
      label: 'Terlambat',
      colorClass: 'bg-rose-50 text-rose-800 border-rose-300',
      badgeColor: 'rose',
      description: `Melewati tenggat ${overdueDuration.text}`,
      isOverdue: true,
      isCompleted: false,
      wasLate: true,
      deadline: deadlineDate,
      diffHours: Math.round(diffFromDeadline / (1000 * 60 * 60))
    };
  } else {
    const remainingDuration = formatDuration(diffFromDeadline);
    const hoursRemaining = diffFromDeadline / (1000 * 60 * 60);

    if (hoursRemaining <= SLA_DEADLINE_WARNING_HOURS) {
      return {
        status: 'MENDEKATI_TENGGAT',
        label: 'Mendekati Tenggat',
        colorClass: 'bg-orange-50 text-orange-800 border-orange-300',
        badgeColor: 'orange',
        description: `Sisa waktu ${remainingDuration.text}`,
        isOverdue: false,
        isWarning: true,
        isCompleted: false,
        deadline: deadlineDate,
        diffHours: Math.round(hoursRemaining)
      };
    }

    return {
      status: 'TEPAT_WAKTU',
      label: 'Tepat Waktu',
      colorClass: 'bg-blue-50 text-blue-800 border-blue-300',
      badgeColor: 'blue',
      description: `Sisa waktu ${remainingDuration.text}`,
      isOverdue: false,
      isCompleted: false,
      deadline: deadlineDate,
      diffHours: Math.round(hoursRemaining)
    };
  }
}

/**
 * Periksa selang hari antara kunjungan sebelumnya dan kunjungan saat ini
 * Batas standar SLA Jasa Raharja adalah maksimal 3 hari (72 jam).
 * Jika > 3 hari, kembalikan status peringatan.
 */
export function checkVisitInterval(previousDate, currentDate = new Date()) {
  if (!previousDate || !currentDate) {
    return { isOverdue: false, diffHours: 0, diffDays: 0, durationText: '', warningMessage: null };
  }
  const prevMs = new Date(previousDate).getTime();
  const currMs = new Date(currentDate).getTime();
  const diffMs = currMs - prevMs;
  const diffHours = diffMs / (1000 * 60 * 60);
  const isOverdue = diffHours > SLA_MONITORING_INTERVAL_HOURS; // Lewat 72 jam (3 hari)
  const duration = formatDuration(Math.abs(diffMs));

  return {
    isOverdue,
    diffMs,
    diffHours: Math.round(diffHours),
    diffDays: Math.floor(diffHours / 24),
    durationText: duration.text,
    warningMessage: isOverdue
      ? `Peringatan: Jarak waktu kunjungan ini (${duration.text}) melewati batas waktu maksimal 3 hari (72 jam) dari kunjungan sebelumnya.`
      : `Tepat Waktu: Kunjungan dilakukan dalam batas waktu 3 hari (${duration.text} sejak kunjungan sebelumnya).`
  };
}

/**
 * Hitung status SLA untuk Pemantauan Berkala Korban
 * @param {object} victim - data korban lengkap
 * @param {Date} [referenceDate] - waktu acuan
 */
export function calculateMonitoringSla(victim, referenceDate = new Date()) {
  if (!victim) {
    return {
      status: 'TIDAK_DIKETAHUI',
      label: 'Belum Terjadwal',
      colorClass: 'bg-slate-100 text-slate-700 border-slate-300',
      badgeColor: 'slate',
      description: 'Data korban tidak tersedia',
      isOverdue: false,
      isCompleted: false,
      needed: false
    };
  }

  // Jika korban sudah meninggal dunia atau pulang dan tidak perlu pantau
  if (
    victim.kondisiTerakhir === 'Meninggal Dunia' ||
    victim.kondisiTerakhir === 'Pulang' ||
    victim.kondisiTerakhir === 'Sudah Pulang' ||
    victim.kondisiTerakhir === 'Selesai'
  ) {
    return {
      status: 'SELESAI',
      label: 'Pemantauan Ditutup',
      colorClass: 'bg-slate-100 text-slate-700 border-slate-300',
      badgeColor: 'slate',
      description: `Kondisi akhir: ${victim.kondisiTerakhir}`,
      isOverdue: false,
      isCompleted: true,
      needed: false
    };
  }

  // Cari tanggal aktivitas terakhir yang SUDAH SELESAI dari riwayat
  const completedActivityDates = [
    ...(victim.riwayatAktivitas || []),
    ...(victim.riwayatKunjungan || []),
    ...(victim.riwayatPemantauan || [])
  ]
    .filter((a) => a && a.statusKunjungan !== 'Menunggu')
    .map((a) => a.tanggal || a.tanggalKunjungan || a.waktuAktualKunjungan || a.waktuFoto)
    .filter(Boolean);

  const directDates = [
    victim.tanggalKunjunganTerakhir,
    victim.waktuPemantauanTerakhir,
    victim.tanggalPemantauanTerakhir,
    victim.kunjunganPertama?.tanggalKunjungan
  ].filter(Boolean);

  const allPossibleDates = [...completedActivityDates, ...directDates];

  let latestActivityDate;
  if (allPossibleDates.length > 0) {
    // Ambil tanggal dengan timestamp paling baru / mutakhir
    allPossibleDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    latestActivityDate = allPossibleDates[0];
  } else {
    latestActivityDate = victim.tanggalInformasiDiterima;
  }

  if (!latestActivityDate) {
    return {
      status: 'TIDAK_DIKETAHUI',
      label: 'Belum Terjadwal',
      colorClass: 'bg-slate-100 text-slate-700 border-slate-300',
      badgeColor: 'slate',
      description: 'Belum ada riwayat aktivitas',
      isOverdue: false,
      isCompleted: false,
      needed: true
    };
  }

  const baseTime = new Date(latestActivityDate).getTime();
  const nextDueDate = new Date(baseTime + SLA_MONITORING_INTERVAL_HOURS * 60 * 60 * 1000);
  const now = referenceDate.getTime();
  const diffFromDue = nextDueDate.getTime() - now;

  if (diffFromDue < 0) {
    const overdueDuration = formatDuration(Math.abs(diffFromDue));
    return {
      status: 'TERLAMBAT',
      label: 'Melewati Batas 3 Hari',
      colorClass: 'bg-rose-50 text-rose-800 border-rose-300',
      badgeColor: 'rose',
      description: `Peringatan: Kunjungan lanjutan melewati batas 3 hari (${overdueDuration.text})`,
      isOverdue: true,
      isCompleted: false,
      needed: true,
      dueDate: nextDueDate,
      deadline: nextDueDate,
      elapsedHours: Math.round((now - baseTime) / (1000 * 60 * 60))
    };
  } else {
    const remainingDuration = formatDuration(diffFromDue);
    const hoursRemaining = diffFromDue / (1000 * 60 * 60);

    if (hoursRemaining <= SLA_DEADLINE_WARNING_HOURS) {
      return {
        status: 'MENDEKATI_TENGGAT',
        label: 'Tenggat 3 Hari Hampir Habis',
        colorClass: 'bg-orange-50 text-orange-800 border-orange-300',
        badgeColor: 'orange',
        description: `Sisa waktu ${remainingDuration.text} sebelum batas 3 hari`,
        isOverdue: false,
        isWarning: true,
        isCompleted: false,
        needed: true,
        dueDate: nextDueDate,
        deadline: nextDueDate,
        hoursRemaining: Math.round(hoursRemaining)
      };
    }

    return {
      status: 'TEPAT_WAKTU',
      label: 'Dalam Batas 3 Hari',
      colorClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      badgeColor: 'emerald',
      description: `Batas 3 hari: sisa ${remainingDuration.text}`,
      isOverdue: false,
      isCompleted: false,
      needed: true,
      dueDate: nextDueDate,
      deadline: nextDueDate,
      hoursRemaining: Math.round(hoursRemaining)
    };
  }
}

/**
 * Evaluasi status komprehensif korban untuk filtering dan dashboard
 */
export function getVictimOverallSla(victim, referenceDate = new Date()) {
  const firstVisitSla = calculateFirstVisitSla(
    victim.tanggalInformasiDiterima,
    victim.kunjunganPertama,
    referenceDate
  );

  const monitoringSla = calculateMonitoringSla(victim, referenceDate);

  // Kunjungan pertama belum dilakukan dan overdue -> TERLAMBAT
  if (firstVisitSla.isOverdue) {
    return {
      overallStatus: 'TERLAMBAT',
      primaryLabel: 'Kunjungan Terlambat',
      badgeColor: 'rose',
      firstVisitSla,
      monitoringSla,
      actionNeeded: 'Lakukan kunjungan segera'
    };
  }

  // Kunjungan pertama mendekati tenggat
  if (firstVisitSla.status === 'MENDEKATI_TENGGAT') {
    return {
      overallStatus: 'MENDEKATI_TENGGAT',
      primaryLabel: 'Kunjungan Mendekati Tenggat',
      badgeColor: 'orange',
      firstVisitSla,
      monitoringSla,
      actionNeeded: 'Prioritaskan kunjungan hari ini'
    };
  }

  // Jika kunjungan pertama belum selesai tapi masih on time
  if (!firstVisitSla.isCompleted) {
    return {
      overallStatus: 'TEPAT_WAKTU',
      primaryLabel: 'Menunggu Kunjungan',
      badgeColor: 'blue',
      firstVisitSla,
      monitoringSla,
      actionNeeded: 'Jadwalkan kunjungan RS'
    };
  }

  // Kunjungan pertama sudah selesai, periksa pemantauan jika masih rawat
  if (monitoringSla.isOverdue) {
    return {
      overallStatus: 'TERLAMBAT',
      primaryLabel: 'Pemantauan Terlambat',
      badgeColor: 'rose',
      firstVisitSla,
      monitoringSla,
      actionNeeded: 'Update kondisi korban'
    };
  }

  if (monitoringSla.status === 'MENDEKATI_TENGGAT') {
    return {
      overallStatus: 'MENDEKATI_TENGGAT',
      primaryLabel: 'Waktunya Pemantauan',
      badgeColor: 'orange',
      firstVisitSla,
      monitoringSla,
      actionNeeded: 'Konfirmasi perkembangan pasien'
    };
  }

  return {
    overallStatus: 'SELESAI',
    primaryLabel: 'Terkendali',
    badgeColor: 'emerald',
    firstVisitSla,
    monitoringSla,
    actionNeeded: victim.kondisiTerakhir === 'Meninggal Dunia' && !victim.santunanSelesai
      ? 'Tindak lanjut berkas santunan'
      : 'Monitoring rutin'
  };
}

/**
 * Dapatkan tanggal tenggat waktu tindak lanjut (deadline) aktif untuk seorang korban.
 * - Jika kunjungan pertama belum dilakukan: batas waktu SLA kunjungan pertama (72 jam dari info diterima).
 * - Jika sudah dikunjungi dan dalam pemantauan: batas waktu pemantauan berkala (72 jam dari aktivitas terakhir).
 * - Jika selesai / pulang / meninggal: null.
 */
export function getVictimDeadline(victim, referenceDate = new Date()) {
  if (!victim) return null;

  const isDone =
    victim.kondisiTerakhir === 'Sudah Pulang' ||
    victim.kondisiTerakhir === 'Pulang' ||
    victim.kondisiTerakhir === 'Selesai' ||
    victim.kondisiTerakhir === 'Meninggal Dunia' ||
    victim.statusPemantauan === 'Selesai Dipantau' ||
    victim.statusTindakLanjut === 'Sudah Selesai';

  if (isDone) {
    return null;
  }

  const isFirstVisitPending = !victim.kunjunganPertama && (!victim.riwayatKunjungan || victim.riwayatKunjungan.length === 0);
  if (isFirstVisitPending) {
    const fSla = calculateFirstVisitSla(victim.tanggalInformasiDiterima, victim.kunjunganPertama, referenceDate);
    if (fSla.deadline) return new Date(fSla.deadline);
  }

  const mSla = calculateMonitoringSla(victim, referenceDate);
  if (mSla.deadline || mSla.dueDate) {
    return new Date(mSla.deadline || mSla.dueDate);
  }

  if (victim.batasWaktu) return new Date(victim.batasWaktu);
  if (victim.tanggalTenggat) return new Date(victim.tanggalTenggat);

  return null;
}

/**
 * Tentukan prioritas pengurutan berdasarkan tenggat waktu:
 * 1. Prioritas 1: Tanggal tenggat waktu sudah terlewati (Lewat / Terlambat) -> Paling atas!
 * 2. Prioritas 2: Tanggal tenggat waktu mendekati (sisa waktu <= 24 jam) -> Paling atas kedua!
 * 3. Prioritas 3: Tanggal tenggat waktu masih normal (> 24 jam, diurutkan dari terdekat ke terjauh).
 * 5. Prioritas 5: Data tanpa tenggat waktu aktif (selesai/ditutup).
 */
export function getDeadlinePriorityScore(deadline, referenceDate = new Date()) {
  if (!deadline) return { tier: 5, time: Infinity };
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return { tier: 5, time: Infinity };

  const ref = new Date(referenceDate);
  const nowMs = ref.getTime();
  const t = d.getTime();

  if (t < nowMs) {
    // 1. Tanggal tenggat waktu sudah terlewati (Terlambat/Lewat) -> Paling atas
    return { tier: 1, time: t };
  } else if (t <= nowMs + SLA_DEADLINE_WARNING_HOURS * 60 * 60 * 1000) {
    // 2. Tanggal tenggat waktu mendekati tenggat (sisa <= 24 jam) -> Paling atas kedua
    return { tier: 2, time: t };
  } else {
    // 3. Tanggal tenggat waktu masih lebih jauh (diurutkan dari terdekat hingga terjauh)
    return { tier: 3, time: t };
  }
}

/**
 * Comparator function untuk mengurutkan dua deadline berdasarkan prioritas:
 * - Tier 1 (Terlambat) s/d Tier 3 (Tepat Waktu) berurutan.
 * - Korban dengan tenggat paling lama terlewati berada paling atas (timestamp terkecil).
 * - Jika tanggal sama, urutkan berdasarkan waktu paling awal (timestamp terkecil).
 */
export function compareByDeadlinePriority(aDeadline, bDeadline, referenceDate = new Date()) {
  const pA = getDeadlinePriorityScore(aDeadline, referenceDate);
  const pB = getDeadlinePriorityScore(bDeadline, referenceDate);

  if (pA.tier !== pB.tier) {
    return pA.tier - pB.tier;
  }
  return pA.time - pB.time;
}

/**
 * Evaluasi tingkat urgensi SLA korban:
 * Tier 1: TERLAMBAT (Lewat tenggat waktu) -> PALING ATAS MUTLAK!
 * Tier 2: MENDEKATI_TENGGAT (Sisa waktu <= 24 jam) -> Paling atas kedua!
 * Tier 3: TEPAT_WAKTU / AKTIF (Masih memiliki waktu > 24 jam)
 * Tier 5: SELESAI / PULANG / MENINGGAL (Kasus sudah ditutup)
 */
export function getVictimSlaUrgencyTier(victim, referenceDate = new Date()) {
  if (!victim) return { tier: 5, remainingHours: Infinity, status: 'N/A', deadline: null, time: Infinity };

  const isDone =
    isVictimFinished(victim) ||
    victim.kondisiTerakhir === 'Sudah Pulang' ||
    victim.kondisiTerakhir === 'Pulang' ||
    victim.kondisiTerakhir === 'Selesai' ||
    victim.kondisiTerakhir === 'Meninggal Dunia' ||
    victim.statusPemantauan === 'Selesai Dipantau' ||
    victim.statusTindakLanjut === 'Sudah Selesai';

  if (isDone) {
    const closedTime = new Date(
      victim.tanggalKeluarRs ||
      victim.tanggalMeninggal ||
      victim.tanggalKunjunganTerakhir ||
      victim.tanggalInformasiDiterima ||
      0
    ).getTime();
    return { tier: 5, remainingHours: Infinity, status: 'SELESAI', deadline: null, time: closedTime };
  }

  const hasFirstVisit = Boolean(
    victim.kunjunganPertama ||
    (Array.isArray(victim.riwayatKunjungan) && victim.riwayatKunjungan.length > 0) ||
    (Array.isArray(victim.riwayatAktivitas) && victim.riwayatAktivitas.some((a) => a.kunjunganKe === 1 || (a.statusKunjungan && a.statusKunjungan !== 'Menunggu')))
  );

  const fSla = calculateFirstVisitSla(victim.tanggalInformasiDiterima, victim.kunjunganPertama, referenceDate);
  const mSla = calculateMonitoringSla(victim, referenceDate);

  // ── PRIORITAS 1: TERLAMBAT (LEWAT TENGGAT WAKTU) -> PALING ATAS ──
  const isFirstVisitLate = !hasFirstVisit && (fSla.isOverdue || fSla.status === 'TERLAMBAT' || (fSla.diffHours != null && fSla.diffHours < 0));
  const isMonitoringLate = hasFirstVisit && (mSla.isOverdue || mSla.status === 'TERLAMBAT');
  const isFlaggedLate = Boolean(victim.isOverdue || victim.is_overdue || victim.statusSla === 'TERLAMBAT' || victim.slaStatus === 'TERLAMBAT');

  if (isFirstVisitLate || isMonitoringLate || isFlaggedLate) {
    const deadline = (!hasFirstVisit && fSla.deadline) || mSla.deadline || mSla.dueDate || (victim.batasWaktu ? new Date(victim.batasWaktu) : null);
    const deadlineTime = deadline ? new Date(deadline).getTime() : 0;
    const elapsed = Math.abs(
      isFirstVisitLate
        ? (fSla.diffHours || 1)
        : (mSla.elapsedHours || 1)
    );

    return {
      tier: 1, // TERLAMBAT = TIER 1 (PALING ATAS)
      remainingHours: -elapsed,
      status: 'TERLAMBAT',
      deadline,
      time: deadlineTime
    };
  }

  // ── PRIORITAS 2: MENDEKATI TENGGAT (SISA WAKTU <= 24 JAM) ──
  const isFirstVisitWarning = !hasFirstVisit && (fSla.isWarning || fSla.status === 'MENDEKATI_TENGGAT');
  const isMonitoringWarning = hasFirstVisit && (mSla.isWarning || mSla.status === 'MENDEKATI_TENGGAT');
  const isFlaggedWarning = victim.statusSla === 'MENDEKATI_TENGGAT' || victim.slaStatus === 'MENDEKATI_TENGGAT';

  if (isFirstVisitWarning || isMonitoringWarning || isFlaggedWarning) {
    const deadline = (!hasFirstVisit && fSla.deadline) || mSla.deadline || mSla.dueDate || (victim.batasWaktu ? new Date(victim.batasWaktu) : null);
    const deadlineTime = deadline ? new Date(deadline).getTime() : Infinity;
    const remaining = isFirstVisitWarning ? (fSla.diffHours || 1) : (mSla.hoursRemaining || 1);

    return {
      tier: 2, // MENDEKATI TENGGAT = TIER 2
      remainingHours: remaining,
      status: 'MENDEKATI_TENGGAT',
      deadline,
      time: deadlineTime
    };
  }

  // ── PRIORITAS 3: TEPAT WAKTU (MASIH AMAN > 24 JAM) ──
  const deadline = (!hasFirstVisit && fSla.deadline) || mSla.deadline || mSla.dueDate || (victim.batasWaktu ? new Date(victim.batasWaktu) : null);
  const deadlineTime = deadline ? new Date(deadline).getTime() : Infinity;
  const remaining = !hasFirstVisit ? (fSla.diffHours || 72) : (mSla.hoursRemaining || 72);

  return {
    tier: 3, // TEPAT WAKTU = TIER 3
    remainingHours: remaining,
    status: 'TEPAT_WAKTU',
    deadline,
    time: deadlineTime
  };
}

/**
 * Comparator pengurutan korban berdasarkan urgensi tenggat waktu:
 * 1. Korban Terlambat (Lewat tenggat) -> PALING ATAS
 * 2. Korban Mendekati Tenggat (Sisa <= 24 jam) -> LANGSUNG DI BAWAHNYA (PALING ATAS KEDUA)
 * 3. Korban Aktif Tepat Waktu -> Diurutkan dari tenggat terdekat ke terjauh
 * 4. Korban Selesai / Pulang -> Paling bawah
 */
export function compareVictimsBySlaPriority(victimA, victimB, referenceDate = new Date()) {
  const pA = getVictimSlaUrgencyTier(victimA, referenceDate);
  const pB = getVictimSlaUrgencyTier(victimB, referenceDate);

  // 1. TERLAMBAT (Tier 1) SELALU PALING ATAS!
  if (pA.tier !== pB.tier) {
    return pA.tier - pB.tier;
  }

  // 2. Jika sama-sama Terlambat (Tier 1):
  // Yang tenggatnya paling lama terlewati (keterlambatan paling besar) berada paling atas
  if (pA.tier === 1) {
    const timeA = pA.time != null && !isNaN(pA.time) ? pA.time : 0;
    const timeB = pB.time != null && !isNaN(pB.time) ? pB.time : 0;
    if (timeA !== timeB) {
      return timeA - timeB; // timestamp lebih lama/kecil -> lebih terlambat -> lebih atas
    }
    return (pA.remainingHours || 0) - (pB.remainingHours || 0);
  }

  // 3. Jika sama-sama Mendekati Tenggat (Tier 2):
  // Yang sisa waktunya paling sedikit (paling mendesak) berada paling atas
  if (pA.tier === 2) {
    const timeA = pA.time != null && !isNaN(pA.time) ? pA.time : Infinity;
    const timeB = pB.time != null && !isNaN(pB.time) ? pB.time : Infinity;
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    return (pA.remainingHours || 0) - (pB.remainingHours || 0);
  }

  // 4. Jika sama-sama Tepat Waktu (Tier 3):
  // Diurutkan dari tenggat terdekat
  if (pA.tier === 3) {
    const timeA = pA.time != null && !isNaN(pA.time) ? pA.time : Infinity;
    const timeB = pB.time != null && !isNaN(pB.time) ? pB.time : Infinity;
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    return (pA.remainingHours || 0) - (pB.remainingHours || 0);
  }

  // 5. Tier 5 (Selesai): urutkan yang baru selesai di atas
  const timeA = pA.time != null && !isNaN(pA.time) ? pA.time : 0;
  const timeB = pB.time != null && !isNaN(pB.time) ? pB.time : 0;
  return timeB - timeA;
}

/**
 * ── RUMUS 1: PERSENTASE KEPATUHAN SLA BERDASARKAN TOTAL KUNJUNGAN (LEBIH ADIL) ──
 * Nilai SLA (%) = (Jumlah Kunjungan Tepat Waktu / Total Semua Kunjungan) * 100%
 * Digunakan sebagai penilaian utama evaluasi performa lapangan di Jasa Raharja.
 * ATURAN JIKA TIDAK ADA KORBAN (NOL KUNJUNGAN):
 * Jika tidak ada korban/kunjungan pada periode evaluasi, rumus pembagian tidak dapat digunakan (0/0),
 * sehingga kepatuhan bernilai null (ditampilkan sebagai N/A).
 */
export function calculateSlaByTotalVisits(kunjunganTepat = 0, totalKunjungan = 0) {
  if (!totalKunjungan || totalKunjungan <= 0) return null;
  return Math.round((Math.max(0, kunjunganTepat) / totalKunjungan) * 100);
}

/**
 * ── RUMUS 2: PERSENTASE KEPATUHAN SLA BERDASARKAN JUMLAH PASIEN (LEBIH KETAT / ZERO-DEFECT) ──
 * Nilai SLA (%) = (Jumlah Pasien Tanpa Keterlambatan / Total Pasien yang Ditangani) * 100%
 * Pasien dihitung sukses HANYA jika seluruh kunjungannya tepat waktu dari awal hingga pulang.
 * Jika total pasien adalah 0, bernilai null (ditampilkan sebagai N/A).
 */
export function calculateSlaByTotalPatients(pasienTanpaKeterlambatan = 0, totalPasien = 0) {
  if (!totalPasien || totalPasien <= 0) return null;
  return Math.round((Math.max(0, pasienTanpaKeterlambatan) / totalPasien) * 100);
}

/**
 * ── RUMUS SKOR AKHIR RAPOR PETUGAS ──
 * Skor Akhir = (Nilai SLA Petugas / Target SLA Kantor) * Bobot Poin
 * @param {number|null} nilaiSla - Nilai kepatuhan SLA petugas (persentase, misal 90%)
 * @param {number} [targetSla=90] - Target SLA kantor (default 90% atau 95%)
 * @param {number} [bobotPoin=30] - Bobot maksimal poin KPI (default 30 poin)
 * @param {boolean} [capAtMax=true] - Batasi skor maksimal hingga nilai bobotPoin (Skor Penuh)
 * @returns {number|null} Skor akhir dengan pembulatan 1 desimal, atau null jika N/A
 */
export function calculateOfficerFinalScore(nilaiSla = null, targetSla = 90, bobotPoin = 30, capAtMax = true) {
  if (nilaiSla === null || nilaiSla === undefined) return null;
  if (nilaiSla <= 0) return 0;
  if (!targetSla || targetSla <= 0) return 0;
  const rawScore = (nilaiSla / targetSla) * bobotPoin;
  const rounded = Math.round(rawScore * 10) / 10;
  return capAtMax ? Math.min(bobotPoin, rounded) : rounded;
}

/**
 * ── EVALUASI KOMPREHENSIF KINERJA PETUGAS BERDASARKAN ATURAN 3 HARI ──
 * Menghitung otomatis:
 * - Kunjungan Tepat Waktu & Terlambat (Interval <= 3 hari / 72 jam)
 * - Aturan Nol Kunjungan (Tidak Ada Korban) -> Status N/A (Tidak Berlaku / Belum Ada Kasus)
 * - Rumus 1: Nilai SLA Kunjungan (%) -> null (N/A) jika 0 kunjungan
 * - Rumus 2: Nilai SLA Pasien (%) -> null (N/A) jika 0 pasien
 * - Rumus Skor Akhir Rapor (Bobot 30 Poin) -> null (N/A) jika 0 kunjungan
 */
export function evaluateOfficerKpi(victims = [], referenceDate = new Date(), targetSla = 90, bobotPoin = 30, targetOfficer = null) {
  let totalKunjungan = 0;
  let kunjunganTepat = 0;
  let kunjunganTerlambat = 0;
  const totalPasien = victims.length;
  let pasienTanpaKeterlambatan = 0;

  const seenVisits = new Set();

  const officerIdStr = targetOfficer ? String(targetOfficer.id || targetOfficer.backendOfficerId || targetOfficer.backendId || '') : '';
  const officerNameLow = targetOfficer ? (targetOfficer.nama || '').toLowerCase().trim() : '';
  const officerPlots = targetOfficer && Array.isArray(targetOfficer.plottingRs)
    ? targetOfficer.plottingRs.map((r) => (r || '').toLowerCase().trim())
    : [];

  const isVisitByOfficer = (visit, defaultHospital) => {
    if (!targetOfficer) return true;
    if (visit.petugasId && String(visit.petugasId) === officerIdStr) return true;
    if (visit.petugasNama && visit.petugasNama.toLowerCase().trim() === officerNameLow) return true;
    const vHosp = (visit.rumahSakit || defaultHospital || '').toLowerCase().trim();
    if (vHosp && officerPlots.some((p) => p === vHosp || (vHosp.length >= 4 && (p.includes(vHosp) || vHosp.includes(p))))) {
      return true;
    }
    return false;
  };

  let kunjunganLengkap = 0;

  victims.forEach((v) => {
    let patientHasLate = false;
    const isDischarged = Boolean(
      v.kondisiTerakhir === 'Sudah Pulang' ||
      v.kondisiTerakhir === 'Pulang' ||
      v.kondisiTerakhir === 'Selesai' ||
      v.statusPemantauan === 'Selesai Dipantau' ||
      v.status_kondisi === 'Selesai' ||
      v.kondisiTerakhir === 'Meninggal Dunia'
    );

    // 1. Kunjungan Pertama (Awal Pemantauan)
    const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama, referenceDate);
    if (v.kunjunganPertama && v.kunjunganPertama.statusKunjungan !== 'Menunggu') {
      if (isVisitByOfficer(v.kunjunganPertama, v.rumahSakitAsal || v.rumahSakit)) {
        const kId = v.kunjunganPertama.id || `INIT-${v.id}`;
        if (!seenVisits.has(kId)) {
          seenVisits.add(kId);
          totalKunjungan++;
          if (fSla.wasLate) {
            kunjunganTerlambat++;
            patientHasLate = true;
          } else {
            kunjunganTepat++;
          }

          // Cek kelengkapan dokumentasi & laporan
          const hasPhoto = Boolean(v.kunjunganPertama.fotoUrl || v.kunjunganPertama.foto || v.kunjunganPertama.fotoKunjungan);
          const hasNotes = Boolean(v.kunjunganPertama.hasilKunjungan || v.kunjunganPertama.catatan || v.kunjunganPertama.catatanTindakLanjut);
          if (hasPhoto || hasNotes) {
            kunjunganLengkap++;
          }
        }
      }
    }

    // 2. Kunjungan Lanjutan Berkala (Aturan Maksimal 3 Hari / 72 Jam)
    const acts = v.riwayatAktivitas || v.riwayatKunjungan || [];
    const sortedActs = [...acts]
      .filter((a) => a && a.statusKunjungan !== 'Menunggu' && a.id !== v.kunjunganPertama?.id)
      .sort((a, b) => new Date(a.tanggal || a.tanggalKunjungan).getTime() - new Date(b.tanggal || b.tanggalKunjungan).getTime());

    let prevVisitTime = v.kunjunganPertama?.tanggalKunjungan
      ? new Date(v.kunjunganPertama.tanggalKunjungan).getTime()
      : (v.tanggalInformasiDiterima ? new Date(v.tanggalInformasiDiterima).getTime() : null);

    sortedActs.forEach((act) => {
      if (!isVisitByOfficer(act, v.rumahSakit)) return;

      const aId = act.id || `${v.id}-${act.nomorKunjungan || ''}-${act.tanggal || ''}`;
      if (!seenVisits.has(aId)) {
        seenVisits.add(aId);
        totalKunjungan++;

        const actTime = new Date(act.waktuAktualKunjungan || act.tanggal || act.tanggalKunjungan).getTime();
        let isLate = act.wasLate || act.terlambat ||
          (typeof act.statusKunjungan === 'string' && act.statusKunjungan.toLowerCase().includes('terlambat')) ||
          (typeof act.status_kunjungan === 'string' && act.status_kunjungan.toLowerCase().includes('terlambat'));

        // Periksa selisih interval dengan kunjungan sebelumnya (Maksimal 72 jam)
        if (!isLate && prevVisitTime && actTime) {
          const diffHours = (actTime - prevVisitTime) / (1000 * 60 * 60);
          if (diffHours > SLA_MONITORING_INTERVAL_HOURS) {
            isLate = true;
          }
        }

        if (isLate) {
          kunjunganTerlambat++;
          patientHasLate = true;
        } else {
          kunjunganTepat++;
        }

        // Cek kelengkapan dokumentasi & laporan tindak lanjut
        const hasPhoto = Boolean(act.fotoUrl || act.foto || act.fotoKunjungan || act.foto_url);
        const hasNotes = Boolean(act.hasilKomunikasi || act.hasilPemantauan || act.hasilKunjungan || act.catatanTindakLanjut || act.catatan);
        if (hasPhoto || hasNotes) {
          kunjunganLengkap++;
        }

        if (actTime) prevVisitTime = actTime;
      }
    });

    // 3. Evaluasi pemantauan berjalan: jika pasien belum pulang dan pemantauan aktif sudah lewat 3 hari
    if (!isDischarged && v.kunjunganPertama) {
      const mSla = calculateMonitoringSla(v, referenceDate);
      if (mSla.isOverdue && mSla.status === 'TERLAMBAT') {
        patientHasLate = true;
      }
    }

    if (!patientHasLate) {
      pasienTanpaKeterlambatan++;
    }
  });

  const isZeroCase = totalKunjungan === 0;
  // Jika tidak ada korban/kunjungan pada periode ini, nilai kepatuhan & skor akhir berstatus N/A (bukan 100%)
  const slaKunjungan = isZeroCase ? null : calculateSlaByTotalVisits(kunjunganTepat, totalKunjungan);
  const slaPasien = isZeroCase ? null : calculateSlaByTotalPatients(pasienTanpaKeterlambatan, totalPasien);
  const kelengkapanLaporan = isZeroCase ? null : Math.round((kunjunganLengkap / totalKunjungan) * 100);
  const skorAkhir = isZeroCase ? null : calculateOfficerFinalScore(slaKunjungan, targetSla, bobotPoin, true);

  return {
    isZeroCase,
    totalKunjungan,
    kunjunganTepat,
    kunjunganTerlambat,
    kunjunganLengkap,
    kelengkapanLaporan, // % Kelengkapan dokumentasi foto & catatan
    totalPasien,
    bebanKerjaKorban: totalPasien, // Beban kerja (bukan target atau kuota)
    pasienTanpaKeterlambatan,
    pasienDenganKeterlambatan: totalPasien - pasienTanpaKeterlambatan,
    slaKunjungan, // Rumus 1 (Total Kunjungan %) -> null jika 0 kunjungan (N/A)
    slaPasien,    // Rumus 2 (Total Pasien %) -> null jika 0 pasien (N/A)
    skorAkhir,    // Skor Akhir Rapor (Poin) -> null jika 0 kunjungan (N/A)
    statusEvaluasi: isZeroCase ? 'N/A' : 'TEREVALUASI',
    keteranganEvaluasi: isZeroCase
      ? 'Tidak ada korban yang dirawat (N/A)'
      : `${kunjunganTepat} dari ${totalKunjungan} kunjungan tepat waktu (Beban: ${totalPasien} korban)`,
    targetSla,
    bobotPoin
  };
}
