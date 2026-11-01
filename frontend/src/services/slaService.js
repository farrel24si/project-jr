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
 * Hitung status SLA untuk Pemantauan Berkala Korban
 * @param {object} victim - data korban lengkap
 * @param {Date} [referenceDate] - waktu acuan
 */
export function calculateMonitoringSla(victim, referenceDate = new Date()) {
  // Jika korban sudah meninggal dunia atau pulang dan tidak perlu pantau
  if (victim.kondisiTerakhir === 'Meninggal Dunia' || victim.kondisiTerakhir === 'Pulang') {
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

  // Waktu awal pemantauan adalah tanggal kunjungan terakhir atau tanggal informasi diterima
  const latestActivityDate = victim.tanggalKunjunganTerakhir || 
                             victim.tanggalPemantauanTerakhir || 
                             victim.tanggalInformasiDiterima;

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
      label: 'Pemantauan Terlambat',
      colorClass: 'bg-rose-50 text-rose-800 border-rose-300',
      badgeColor: 'rose',
      description: `Terlambat ${overdueDuration.text}`,
      isOverdue: true,
      isCompleted: false,
      needed: true,
      dueDate: nextDueDate
    };
  } else {
    const remainingDuration = formatDuration(diffFromDue);
    const hoursRemaining = diffFromDue / (1000 * 60 * 60);

    if (hoursRemaining <= SLA_DEADLINE_WARNING_HOURS) {
      return {
        status: 'MENDEKATI_TENGGAT',
        label: 'Jadwal Pemantauan Hari Ini',
        colorClass: 'bg-orange-50 text-orange-800 border-orange-300',
        badgeColor: 'orange',
        description: `Sisa waktu ${remainingDuration.text}`,
        isOverdue: false,
        isWarning: true,
        isCompleted: false,
        needed: true,
        dueDate: nextDueDate
      };
    }

    return {
      status: 'TEPAT_WAKTU',
      label: 'Sesuai Jadwal',
      colorClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      badgeColor: 'emerald',
      description: `Jadwal berikutnya ${remainingDuration.text}`,
      isOverdue: false,
      isCompleted: false,
      needed: true,
      dueDate: nextDueDate
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
