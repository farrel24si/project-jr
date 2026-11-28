import ExcelJS from 'exceljs';
import { formatDateIndo, formatDateTimeIndo } from '../utils/dateUtils';
import { MONITORING_STATUS, getMonitoringStatus } from '../utils/monitoringStatus';
import { getReferralPerspectiveInfo, isSameHospital } from '../utils/referralUtils';
import { calculateFirstVisitSla, calculateMonitoringSla } from './slaService';

function sanitizeSheetName(rawName, usedNames) {
  const cleaned = String(rawName || 'Tanpa Nama RS')
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const base = (cleaned || 'Tanpa Nama RS').slice(0, 31).trim();
  let candidate = base;
  let counter = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` (${counter})`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length)).trim()}${suffix}`;
    counter += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function getLastFollowUpText(v) {
  const completedActs = Array.isArray(v.riwayatAktivitas)
    ? v.riwayatAktivitas.filter((a) => a.statusKunjungan !== 'Menunggu')
    : [];
  const hasFirstDone = Boolean(v.kunjunganPertama && v.kunjunganPertama.statusKunjungan !== 'Menunggu');
  const hasCompletedVisit =
    completedActs.length > 0 ||
    (Array.isArray(v.riwayatKunjungan) && v.riwayatKunjungan.length > 0) ||
    hasFirstDone;

  if (!hasCompletedVisit) {
    return 'Belum Ada';
  }

  const lastDate =
    completedActs[0]?.waktuAktualKunjungan ||
    completedActs[0]?.tanggalKunjungan ||
    completedActs[0]?.tanggal ||
    v.tanggalKunjunganTerakhir ||
    v.waktuPemantauanTerakhir ||
    v.tanggalPemantauanTerakhir ||
    v.kunjunganPertama?.waktuAktualKunjungan ||
    v.kunjunganPertama?.tanggalKunjungan ||
    v.kunjunganPertama?.tanggal;

  return lastDate ? formatDateIndo(lastDate) : 'Belum Ada';
}

function getMonitoringStatusLabel(victim) {
  if (victim?.status_pemantauan === 'Diarsipkan' || victim?.statusPemantauan === 'Diarsipkan') {
    return 'Diarsipkan';
  }
  return getMonitoringStatus(victim) || '—';
}

function isOutgoingReferral(victim, refInfo) {
  if (refInfo?.isReferred && refInfo?.isOriginView) return true;
  const kondisi = String(victim?.kondisiTerakhir || '').trim().toLowerCase();
  const statusP = String(victim?.statusPemantauan || '').trim().toLowerCase();
  return kondisi.startsWith('dirujuk ke ') || statusP.startsWith('dirujuk ke ');
}

function resolveVictimHospitalForSheet(victim, refInfo) {
  if (refInfo?.isReferred && refInfo?.displayHospital && refInfo.displayHospital !== '—') {
    return refInfo.displayHospital;
  }
  return victim.rumahSakit || victim.rumah_sakit || 'Tanpa Nama RS';
}

async function fetchLogoBase64() {
  try {
    if (typeof window === 'undefined') return null;
    const res = await fetch('/img/logo-jasa-raharja.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function buildAndDownloadExcelWorkbook({
  groups = [],
  currentUser = null,
  fileNamePrefix = 'Laporan_Daftar_Korban',
  metaLabel = 'Rumah Sakit',
  emptyMessage = 'Belum ada data korban yang tercatat pada rumah sakit ini.'
}) {
  const WorkbookCtor =
    ExcelJS?.Workbook ||
    ExcelJS?.default?.Workbook ||
    (typeof globalThis !== 'undefined' ? globalThis.ExcelJS?.Workbook : null);

  if (!WorkbookCtor) {
    throw new Error('Pustaka ExcelJS gagal dimuat. Silakan muat ulang halaman (Ctrl+F5) atau restart server frontend.');
  }

  const workbook = new WorkbookCtor();
  workbook.creator = 'Sistem Monitoring Jasa Raharja Kanwil Riau';
  workbook.created = new Date();

  const logoBase64 = await fetchLogoBase64();
  let logoImageId = null;
  if (logoBase64) {
    try {
      logoImageId = workbook.addImage({ base64: logoBase64, extension: 'png' });
    } catch {
      logoImageId = null;
    }
  }

  const usedSheetNames = new Set();
  const printedAt = formatDateTimeIndo(new Date());

  const columns = [
    { header: 'No', key: 'no', width: 7 },
    { header: 'Nama Korban', key: 'nama', width: 28 },
    { header: 'Rumah Sakit', key: 'rumahSakit', width: 28 },
    { header: 'Tgl Kecelakaan', key: 'tglLaka', width: 18 },
    { header: 'Tgl Masuk RS', key: 'tglMasuk', width: 18 },
    { header: 'TL Terakhir', key: 'tlTerakhir', width: 18 },
    { header: 'Kondisi Terakhir', key: 'kondisi', width: 20 },
    { header: 'Status Pemantauan', key: 'statusPemantauan', width: 22 }
  ];

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  const kopBottomBorder = {
    bottom: { style: 'medium', color: { argb: 'FF0A3981' } }
  };

  const lastColLetter = 'H';

  groups.forEach((group) => {
    const sheetName = sanitizeSheetName(group.sheetLabel, usedSheetNames);
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 8 }]
    });

    sheet.columns = columns.map((col) => ({ key: col.key, width: col.width }));

    // ── KOP SURAT RESMI (Logo di Kiri + Identitas Instansi di Kanan, sama seperti Laporan Kabag) ──
    sheet.getRow(1).height = 22;
    sheet.getRow(2).height = 18;
    sheet.getRow(3).height = 18;

    sheet.mergeCells('A1:B3');
    if (logoImageId !== null) {
      sheet.addImage(logoImageId, {
        tl: { col: 0.12, row: 0.2 },
        ext: { width: 205, height: 53 }
      });
    }

    sheet.mergeCells(`C1:${lastColLetter}1`);
    const instTitle = sheet.getCell('C1');
    instTitle.value = 'PT JASA RAHARJA (PERSERO)';
    instTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0A3981' } };
    instTitle.alignment = { vertical: 'bottom', horizontal: 'left' };

    sheet.mergeCells(`C2:${lastColLetter}2`);
    const instSub = sheet.getCell('C2');
    instSub.value = 'CABANG UTAMA RIAU • BAGIAN OPERASIONAL & PELAYANAN';
    instSub.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF334155' } };
    instSub.alignment = { vertical: 'middle', horizontal: 'left' };

    sheet.mergeCells(`C3:${lastColLetter}3`);
    const instAddr = sheet.getCell('C3');
    instAddr.value = 'Jl. Jend. Sudirman No. 285, Pekanbaru | Telp: (0761) 33456 | operasional.riau@jasaraharja.co.id';
    instAddr.font = { name: 'Calibri', size: 8.5, color: { argb: 'FF64748B' } };
    instAddr.alignment = { vertical: 'top', horizontal: 'left' };

    for (let c = 1; c <= columns.length; c += 1) {
      sheet.getRow(3).getCell(c).border = kopBottomBorder;
    }

    // Baris 4: Spasi
    sheet.getRow(4).height = 8;

    // Baris 5: Judul Laporan
    sheet.mergeCells(`A5:${lastColLetter}5`);
    const reportTitle = sheet.getCell('A5');
    reportTitle.value = 'LAPORAN DAFTAR KORBAN KECELAKAAN LALU LINTAS';
    reportTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0A3981' } };
    reportTitle.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(5).height = 22;

    // Baris 6: Informasi Grup & Waktu Cetak
    sheet.mergeCells(`A6:${lastColLetter}6`);
    const reportMeta = sheet.getCell('A6');
    reportMeta.value = `${metaLabel}: ${group.sheetLabel}   |   Total Data: ${group.items.length} Korban   |   Dicetak: ${printedAt}`;
    reportMeta.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF475569' } };
    reportMeta.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(6).height = 18;

    // Baris 7: Spasi
    sheet.getRow(7).height = 8;

    // Baris 8: Header Tabel
    const headerRow = sheet.getRow(8);
    headerRow.height = 26;
    columns.forEach((col, colIdx) => {
      const cell = headerRow.getCell(colIdx + 1);
      cell.value = col.header;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A3981' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colIdx === 0 ? 'center' : 'left',
        wrapText: true
      };
      cell.border = thinBorder;
    });

    sheet.autoFilter = {
      from: 'A8',
      to: `${lastColLetter}8`
    };

    if (group.items.length === 0) {
      const emptyRow = sheet.getRow(9);
      emptyRow.height = 24;
      sheet.mergeCells(`A9:${lastColLetter}9`);
      const emptyCell = sheet.getCell('A9');
      emptyCell.value = emptyMessage;
      emptyCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
      emptyCell.alignment = { vertical: 'middle', horizontal: 'center' };
      for (let c = 1; c <= columns.length; c += 1) {
        emptyRow.getCell(c).border = thinBorder;
      }
      return;
    }

    group.items.forEach((victim, idx) => {
      const rowNumber = 9 + idx;
      const row = sheet.getRow(rowNumber);
      row.height = 22;

      const monitoringStatus = getMonitoringStatusLabel(victim);
      const tglLakaRaw = victim.tanggalKecelakaan || victim.tgl_laka || victim.tanggalInformasiDiterima;
      const tglMasukRaw = victim.tanggalMasukRs || victim.tgl_masuk || victim.tanggalInformasiDiterima;
      const rowData = {
        no: idx + 1,
        nama: victim.nama || victim.nama_korban || '—',
        rumahSakit: group.resolveHospital ? group.resolveHospital(victim) : (victim.rumahSakit || victim.rumah_sakit || '—'),
        tglLaka: tglLakaRaw ? formatDateIndo(tglLakaRaw) : '—',
        tglMasuk: tglMasukRaw ? formatDateIndo(tglMasukRaw) : '—',
        tlTerakhir: getLastFollowUpText(victim),
        kondisi: victim.kondisiTerakhir || victim.status_kondisi || 'Rawat Inap',
        statusPemantauan: monitoringStatus || '—'
      };

      const isEven = idx % 2 === 1;
      columns.forEach((col, colIdx) => {
        const cell = row.getCell(colIdx + 1);
        cell.value = rowData[col.key];
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: colIdx === 0 ? 'center' : 'left',
          wrapText: true
        };
        if (isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
        cell.border = thinBorder;
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const dateSlug = new Date().toISOString().slice(0, 10);
  const userSlug = currentUser?.profile?.nama
    ? `_${currentUser.profile.nama.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`
    : '';
  const fileName = `${fileNamePrefix}${userSlug}_${dateSlug}.xlsx`;

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Mengekspor Daftar Korban ke file Excel (.xlsx) dengan 1 sheet per nama Rumah Sakit
 * dan kop surat + logo PT Jasa Raharja sejajar dengan format laporan Kabag.
 */
export async function exportVictimsExcelByHospital({
  victims = [],
  officerHospitals = [],
  currentUser = null,
  fileNamePrefix = 'Laporan_Daftar_Korban'
} = {}) {
  const groups = [];
  const ensureGroup = (hospitalName) => {
    const cleanName = String(hospitalName || '').trim() || 'Tanpa Nama RS';
    let found = groups.find((g) => isSameHospital(g.sheetLabel, cleanName));
    if (!found) {
      found = { sheetLabel: cleanName, items: [], resolveHospital: () => cleanName };
      groups.push(found);
    }
    return found;
  };

  // Pastikan setiap RS yang dipegang petugas tetap punya tab sheet tersendiri
  (officerHospitals || []).forEach((rs) => {
    const rsName = typeof rs === 'string' ? rs : rs?.nama_rs;
    if (rsName) ensureGroup(rsName);
  });

  (victims || []).forEach((victim) => {
    const refInfo = getReferralPerspectiveInfo(victim, null, currentUser);
    // Korban berstatus "Dirujuk ke ..." tidak dimasukkan
    if (isOutgoingReferral(victim, refInfo)) return;

    const hospitalName = resolveVictimHospitalForSheet(victim, refInfo);
    const group = ensureGroup(hospitalName);
    group.items.push(victim);
  });

  if (groups.length === 0) {
    ensureGroup('Daftar Korban');
  }

  await buildAndDownloadExcelWorkbook({
    groups,
    currentUser,
    fileNamePrefix,
    metaLabel: 'Rumah Sakit',
    emptyMessage: 'Belum ada data korban yang tercatat pada rumah sakit ini.'
  });
}

/**
 * Mengekspor Daftar Korban ke file Excel (.xlsx) dengan 1 sheet per nama Petugas
 * (khusus tampilan Kabag Daftar Korban).
 */
export async function exportVictimsExcelByOfficer({
  victims = [],
  officers = [],
  currentUser = null,
  fileNamePrefix = 'Laporan_Daftar_Korban_Kabag'
} = {}) {
  const groups = [];
  const ensureGroup = (officerName) => {
    const cleanName = String(officerName || '').trim() || 'Tanpa Petugas';
    const key = cleanName.toLowerCase();
    let found = groups.find((g) => g.key === key);
    if (!found) {
      found = { key, sheetLabel: cleanName, items: [] };
      groups.push(found);
    }
    return found;
  };

  (officers || []).forEach((officer) => {
    if (officer?.nama) ensureGroup(officer.nama);
  });

  const resolveOfficerName = (victim) => {
    const directName = String(victim?.namaPetugas || victim?.petugasNama || '').trim();
    if (directName && directName !== '—' && directName.toLowerCase() !== 'belum ditentukan') {
      return directName;
    }
    if (victim?.petugasId) {
      const matched = (officers || []).find(
        (o) =>
          String(o.id) === String(victim.petugasId) ||
          (o.backendOfficerId && String(o.backendOfficerId) === String(victim.petugasId))
      );
      if (matched?.nama) return matched.nama;
    }
    return 'Tanpa Petugas';
  };

  (victims || []).forEach((victim) => {
    const officerName = resolveOfficerName(victim);
    const group = ensureGroup(officerName);
    group.items.push(victim);
  });

  if (groups.length === 0) {
    ensureGroup('Daftar Korban');
  }

  await buildAndDownloadExcelWorkbook({
    groups,
    currentUser,
    fileNamePrefix,
    metaLabel: 'Petugas',
    emptyMessage: 'Belum ada data korban yang ditangani petugas ini.'
  });
}
