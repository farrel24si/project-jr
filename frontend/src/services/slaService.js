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

  let text = '';
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

  // Jika sudah dikunjungi
  if (kunjunganPertama && kunjunganPertama.tanggalKunjungan) {
    const visitTime = new Date(kunjunganPertama.tanggalKunjungan).getTime();
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
      ? `Peringatan: Jarak waktu kunjungan ini (${duration.text}) melewati batas maksimal SLA 3 hari (72 jam) dari kunjungan sebelumnya.`
      : `Sesuai SLA: Kunjungan dilakukan dalam batas waktu 3 hari (${duration.text} sejak kunjungan sebelumnya).`
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

  let latestActivityDate = null;
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
 * Tentukan prioritas pengurutan berdasarkan tenggat waktu sesuai ketentuan:
 * 1. Prioritas 1: Tanggal tenggat waktu sudah terlewati.
 * 2. Prioritas 2: Tanggal tenggat waktu jatuh pada hari ini.
 * 3. Prioritas 3: Tanggal tenggat waktu paling dekat dengan hari ini (tanggal berikutnya/besok).
 * 4. Prioritas 4: Tanggal tenggat waktu yang masih lebih jauh (diurutkan dari terdekat ke terjauh).
 * 5. Prioritas 5: Data tanpa tenggat waktu aktif (selesai/ditutup).
 */
export function getDeadlinePriorityScore(deadline, referenceDate = new Date()) {
  if (!deadline) return { tier: 5, time: Infinity };
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return { tier: 5, time: Infinity };

  const ref = new Date(referenceDate);
  const todayStart = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0).getTime();
  const todayEnd = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999).getTime();
  const tomorrowEnd = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1, 23, 59, 59, 999).getTime();

  const t = d.getTime();

  if (t < todayStart) {
    // 1. Tanggal tenggat waktu sudah terlewati
    return { tier: 1, time: t };
  } else if (t <= todayEnd) {
    // 2. Tanggal tenggat waktu jatuh pada hari ini
    return { tier: 2, time: t };
  } else if (t <= tomorrowEnd) {
    // 3. Tanggal tenggat waktu paling dekat dengan hari ini (tanggal berikutnya)
    return { tier: 3, time: t };
  } else {
    // 4. Tanggal tenggat waktu masih lebih jauh (diurutkan dari terdekat hingga terjauh)
    return { tier: 4, time: t };
  }
}

/**
 * Comparator function untuk mengurutkan dua deadline berdasarkan prioritas:
 * - Tier 1 s/d Tier 4 berurutan.
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
