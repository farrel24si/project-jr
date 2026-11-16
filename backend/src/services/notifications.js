function normalizeWhatsAppNumber(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('62') && digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 14) {
    return `62${digits.slice(1)}`;
  }
  return null;
}

function buildWhatsAppJid(raw) {
  const normalized = normalizeWhatsAppNumber(raw);
  if (!normalized) return null;
  return `${normalized}@s.whatsapp.net`;
}

function formatDateTimeWib(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.toISOString().replace('T', ' ').slice(0, 19)} WIB`;
}

function buildNewAssignmentMessage(data) {
  return (
    `*Pemberitahuan Tugas Baru Jasa Raharja*\n\n` +
    `Yth. Petugas: ${data.officerName || 'Petugas'}\n` +
    `Terdapat laporan korban baru yang perlu diverifikasi:\n\n` +
    `- No Tiket: ${data.ticket}\n` +
    `- Korban: ${data.victimName}\n` +
    `- RS: ${data.hospitalName}\n` +
    `- Kondisi: ${data.condition || 'Rawat Inap'}\n` +
    `- Batas Kunjungan ke-1: 72 Jam\n\n` +
    `Silakan lakukan kunjungan fisik dan submit laporan melalui sistem.`
  );
}

function determineReminderType(now, scheduledAt) {
  const due = new Date(scheduledAt);
  const current = new Date(now);
  if (Number.isNaN(due.getTime()) || Number.isNaN(current.getTime())) return null;

  const hoursRemaining = (due.getTime() - current.getTime()) / (60 * 60 * 1000);
  if (hoursRemaining <= 0 || hoursRemaining > 24) return null;
  if (hoursRemaining <= 3) return 'REMINDER_3H';
  if (hoursRemaining <= 12) return 'REMINDER_12H';
  return 'REMINDER_24H';
}

function buildReminderMessage(data) {
  const jadwal = formatDateTimeWib(data.scheduledAt);
  return (
    `*PENGINGAT BATAS WAKTU KUNJUNGAN*\n\n` +
    `Yth. Petugas: ${data.officerName || 'Petugas'}\n\n` +
    `- No Tiket: ${data.ticket}\n` +
    `- Korban: ${data.victimName}\n` +
    `- RS: ${data.hospitalName}\n` +
    `- Batas Kunjungan: ${jadwal}\n\n` +
    `Segera lakukan kunjungan fisik dan submit laporan melalui sistem.`
  );
}

module.exports = {
  normalizeWhatsAppNumber,
  buildWhatsAppJid,
  formatDateTimeWib,
  buildNewAssignmentMessage,
  determineReminderType,
  buildReminderMessage
};
