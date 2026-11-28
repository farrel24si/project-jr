/**
 * PDF Report Generator Service for Sistem Monitoring Kinerja Petugas Jasa Raharja
 * Produces formal, publication-ready PDF reports for Kepala Bagian (Kabag)
 * Compatible with jsPDF and jspdf-autotable
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateTimeIndo } from '../utils/dateUtils.js';

const runAutoTable = (doc, options) => {
  const fn = typeof autoTable === 'function' ? autoTable : autoTable.default;
  if (typeof fn === 'function') {
    fn(doc, options);
  } else if (typeof doc.autoTable === 'function') {
    doc.autoTable(options);
  } else {
    console.error('[pdfReportService] autoTable function is not available.');
  }
};

/**
 * Format string tanggal lokal Indonesia
 */
function formatIndoDate(dateStr) {
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

function formatIndoDateTime(dateStr) {
  if (!dateStr) return '—';
  return formatDateTimeIndo(dateStr);
}

/**
 * Asynchronously load the official Jasa Raharja logo as a Data URL for jsPDF
 */
async function getLogoBase64() {
  try {
    if (typeof window === 'undefined') return null;
    const res = await fetch('/img/logo-jasa-raharja.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('[pdfReportService] Logo load error:', err);
    return null;
  }
}

/**
 * Main PDF Generation function
 */
export async function generatePerformancePdfReport({
  reportType = 'ALL_OFFICERS', // 'ALL_OFFICERS' | 'INDIVIDUAL_OFFICER'
  selectedOfficer = null,
  periodLabel = 'Bulan November 2026',
  periodCode = 'November_2026',
  summary = {},
  officerRanking = [],
  statusDistribution = [],
  activities = [],
  pendingFollowups = [],
  kabagProfile = {
    nama: '',
    nip: '',
    jabatan: 'Kepala Bagian Operasional',
    cabang: 'Cabang Utama Riau'
  }
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  const now = new Date();
  const generatedAtStr = formatIndoDateTime(now.toISOString());

  // ── AMBIL LOGO PT JASA RAHARJA DARI PUBLIC/IMG ──
  const logoDataUrl = await getLogoBase64();

  // ── 1. KOP SURAT RESMI PT JASA RAHARJA ──
  // Decorative top bar
  doc.setFillColor(10, 57, 129); // #0A3981 Deep Navy
  doc.rect(0, 0, pageWidth, 4, 'F');
  doc.setFillColor(217, 119, 6); // #D97706 Gold accent
  doc.rect(0, 4, pageWidth, 1, 'F');

  let currentY = 10;
  const headerTextX = logoDataUrl ? marginX + 48 : marginX;

  // Cetak Logo Resmi Jasa Raharja di Kiri Kop Surat
  if (logoDataUrl) {
    try {
      const logoW = 44;
      const logoH = logoW / 3.8827; // ~11.33 mm (proporsi asli 3840 x 989)
      doc.addImage(logoDataUrl, 'PNG', marginX, currentY - 0.5, logoW, logoH);
    } catch (e) {
      console.warn('[pdfReportService] Failed to draw logo in PDF:', e);
    }
  }

  // Header Typography Instansi
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(10, 57, 129);
  doc.text('PT JASA RAHARJA (PERSERO)', headerTextX, currentY + 2.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text('CABANG UTAMA RIAU • BAGIAN OPERASIONAL & PELAYANAN', headerTextX, currentY + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('Jl. Jend. Sudirman No. 285, Pekanbaru | Telp: (0761) 33456 | operasional.riau@jasaraharja.co.id', headerTextX, currentY + 10);

  // Garis Pembatas Kop Surat Resmi (Garis Ganda Biru Navy + Aksen Emas)
  currentY = 24;
  doc.setDrawColor(10, 57, 129);
  doc.setLineWidth(0.6);
  doc.line(marginX, currentY, pageWidth - marginX, currentY);
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.2);
  doc.line(marginX, currentY + 0.7, pageWidth - marginX, currentY + 0.7);

  // ── 2. JUDUL & IDENTITAS LAPORAN ──
  currentY += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  const judulLaporan = reportType === 'INDIVIDUAL_OFFICER' && selectedOfficer
    ? `LAPORAN KINERJA INDIVIDU PETUGAS LAPANGAN`
    : `LAPORAN KINERJA & PEMANTAUAN KORBAN KECELAKAAN`;
  doc.text(judulLaporan, marginX, currentY);

  currentY += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);

  const subJudul = reportType === 'INDIVIDUAL_OFFICER' && selectedOfficer
    ? `Nama Petugas: ${selectedOfficer.nama} | NIP: ${selectedOfficer.nip || '—'} | Wilayah: ${selectedOfficer.wilayah || '—'}`
    : `Cakupan: Seluruh Petugas Mobile Service Lapangan (PT Jasa Raharja Cabang Riau)`;
  doc.text(subJudul, marginX, currentY);

  currentY += 4;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Periode Evaluasi : ${periodLabel}    •    Waktu Cetak : ${generatedAtStr}`, marginX, currentY);

  currentY += 4;

  // ── 3. RINGKASAN STATISTIK EKSEKUTIF (TABEL 1) ──
  const summaryBody = [
    [
      { content: 'Jumlah Petugas Evaluasi', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      `${summary.totalPetugas || 0} Orang`,
      { content: 'Total Korban Unik Ditangani', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      `${summary.totalKorbanUnik || 0} Korban`
    ],
    [
      { content: 'Total Seluruh Tugas Selesai', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      `${summary.totalTugasSelesai || 0} Tugas`,
      { content: 'Tugas Selesai Tepat Waktu', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      `${summary.tugasTepatWaktu || 0} Tugas`
    ],
    [
      { content: 'Jumlah Tugas Terlambat', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      `${summary.tugasTerlambat || 0} Tugas`,
      { content: 'Persentase Ketepatan Waktu', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      { content: `${summary.persentaseKetepatan || 0}%`, styles: { fontStyle: 'bold', textColor: [10, 57, 129] } }
    ]
  ];

  runAutoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 41 },
      2: { cellWidth: 50 },
      3: { cellWidth: 41 }
    },
    body: summaryBody
  });

  currentY = doc.lastAutoTable.finalY + 6;

  // ── 4. REKAP STATUS PEMANTAUAN KORBAN (TABEL 2) ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('I. REKAPITULASI STATUS PEMANTAUAN KORBAN (MUTUALLY EXCLUSIVE)', marginX, currentY);

  currentY += 2;

  const statusRows = statusDistribution.map((item) => [
    item.name,
    `${item.value} Orang`,
    `${item.percentage}%`,
    item.desc || '—'
  ]);

  runAutoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    theme: 'striped',
    headStyles: { fillColor: [10, 57, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    styles: { fontSize: 7.5, cellPadding: 1.8, textColor: [30, 41, 59] },
    head: [['Status Pemantauan Terkini', 'Jumlah Korban', 'Persentase', 'Keterangan Kategori Operasional']],
    body: statusRows
  });

  currentY = doc.lastAutoTable.finalY + 6;

  // ── 5. REKAP KINERJA PETUGAS (TABEL 3) ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    reportType === 'INDIVIDUAL_OFFICER'
      ? 'II. DETAIL EVALUASI KINERJA PETUGAS INDIVIDU'
      : 'II. REKAPITULASI EVALUASI KINERJA SELURUH PETUGAS',
    marginX,
    currentY
  );

  currentY += 2;

  if (reportType === 'INDIVIDUAL_OFFICER' && selectedOfficer) {
    const singleOfficerBody = [
      ['Nama Petugas', selectedOfficer.nama, 'Wilayah Tugas', selectedOfficer.wilayah || '—'],
      ['NIP', selectedOfficer.nip || '—', 'Jabatan', selectedOfficer.jabatan || 'Mobile Service'],
      ['Jumlah Korban Ditangani', `${selectedOfficer.totalKorbanUnik || 0} Korban`, 'Kunjungan Awal Selesai', `${selectedOfficer.kunjunganAwal || 0} Kasus`],
      ['Pemantauan Lanjutan', `${selectedOfficer.pemantauanLanjutan || 0} Catatan`, 'Tugas Tepat Waktu', `${selectedOfficer.tugasSelesaiTepatWaktu || 0} Tugas`],
      ['Tugas Terlambat', `${selectedOfficer.tugasTerlambat || 0} Tugas`, 'Tingkat Ketepatan Waktu', `${selectedOfficer.persentaseKetepatan || 0}%`]
    ];

    runAutoTable(doc, {
      startY: currentY,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
      columnStyles: {
        0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 45 },
        1: { cellWidth: 46 },
        2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 45 },
        3: { cellWidth: 46 }
      },
      body: singleOfficerBody
    });
  } else {
    const officerRows = officerRanking.map((off, idx) => [
      String(idx + 1),
      off.nama,
      off.wilayah || '—',
      `${off.totalKorbanUnik} Korban`,
      `${off.kunjunganAwal || off.kunjunganPertamaCount || 0}`,
      `${off.pemantauanLanjutan || off.totalPemantauanLanjutan || 0}`,
      `${off.tugasSelesaiTepatWaktu}`,
      `${off.tugasTerlambat}`,
      `${off.persentaseKetepatan}%`
    ]);

    runAutoTable(doc, {
      startY: currentY,
      margin: { left: marginX, right: marginX },
      theme: 'striped',
      headStyles: { fillColor: [10, 57, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      styles: { fontSize: 7, cellPadding: 1.8, textColor: [30, 41, 59] },
      head: [
        [
          'Rank',
          'Nama Petugas',
          'Wilayah',
          'Korban Unik',
          'Kunj. Awal',
          'Pantau Lanjut',
          'Tepat Waktu',
          'Terlambat',
          'Ketepatan'
        ]
      ],
      body: officerRows.length > 0 ? officerRows : [['—', 'Tidak ada data petugas pada periode ini', '—', '—', '—', '—', '—', '—', '—']]
    });
  }

  currentY = doc.lastAutoTable.finalY + 6;

  // ── 6. RINCIAN RIWAYAT AKTIVITAS AKTUAL (TABEL 4) ──
  // Periksa apakah ruang halaman masih cukup atau buat halaman baru jika mendekati bawah
  if (currentY > pageHeight - 50) {
    doc.addPage();
    currentY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('III. RINCIAN RIWAYAT AKTIVITAS LAPANGAN AKTUAL', marginX, currentY);

  currentY += 2;

  const activityRows = activities.map((act, idx) => {
    return [
      String(idx + 1),
      act.namaKorban,
      act.rumahSakit,
      act.petugasNama ? act.petugasNama.split(',')[0] : '—',
      formatIndoDate(act.tanggalInfo || act.tanggalInformasiDiterima),
      formatIndoDateTime(act.waktuAktivitas),
      act.jenisAktivitas,
      act.kondisiKorban,
      act.statusTindakLanjut,
      act.slaText || (act.terlambat ? 'Terlambat' : 'Tepat Waktu')
    ];
  });

  runAutoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    headStyles: { fillColor: [20, 93, 160], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.8 },
    styles: { fontSize: 6.5, cellPadding: 1.5, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 26 },
      2: { cellWidth: 24 },
      3: { cellWidth: 22 },
      4: { cellWidth: 16 },
      5: { cellWidth: 22 },
      6: { cellWidth: 19 },
      7: { cellWidth: 16 },
      8: { cellWidth: 16 },
      9: { cellWidth: 14, halign: 'center' }
    },
    head: [
      [
        'No',
        'Nama Korban',
        'Rumah Sakit',
        'Petugas',
        'Tgl Info',
        'Waktu Aktual',
        'Jenis Aktivitas',
        'Kondisi',
        'Tindak Lanjut',
        'Status SLA'
      ]
    ],
    body: activityRows.length > 0 ? activityRows : [['—', 'Tidak ada riwayat aktivitas pada periode ini', '—', '—', '—', '—', '—', '—', '—', '—']]
  });

  currentY = doc.lastAutoTable.finalY + 6;

  // ── 7. CATATAN KASUS MEMERLUKAN TINDAK LANJUT (TABEL 5) ──
  if (pendingFollowups.length > 0) {
    if (currentY > pageHeight - 45) {
      doc.addPage();
      currentY = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('IV. DAFTAR KASUS YANG MASIH MEMERLUKAN TINDAK LANJUT', marginX, currentY);

    currentY += 2;

    const followupRows = pendingFollowups.map((item, idx) => [
      String(idx + 1),
      item.namaKorban,
      item.rumahSakit,
      item.petugasNama,
      item.jenisTugas,
      item.batasWaktu,
      item.kondisiDisplay
    ]);

    runAutoTable(doc, {
      startY: currentY,
      margin: { left: marginX, right: marginX },
      theme: 'striped',
      headStyles: { fillColor: [225, 29, 72], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      styles: { fontSize: 6.8, cellPadding: 1.5, textColor: [30, 41, 59] },
      head: [['No', 'Nama Korban', 'Rumah Sakit', 'Petugas', 'Jenis Tindak Lanjut', 'Batas Waktu', 'Kondisi Pasien']],
      body: followupRows
    });

    currentY = doc.lastAutoTable.finalY + 8;
  }

  // ── 8. BLOK TANDA TANGAN PENGESAHAN KABAG ──
  if (currentY > pageHeight - 38) {
    doc.addPage();
    currentY = 20;
  } else {
    currentY += 4;
  }

  const signX = pageWidth - marginX - 70;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  const tglTtd = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Pekanbaru, ${tglTtd}`, signX, currentY);
  currentY += 4;
  doc.text('Mengetahui / Mengesahkan,', signX, currentY);
  currentY += 3.5;
  doc.setFont('helvetica', 'bold');
  doc.text(kabagProfile.jabatan || 'Kepala Bagian Operasional & Pelayanan', signX, currentY);
  currentY += 3.5;
  doc.text('PT Jasa Raharja Cabang Riau', signX, currentY);

  currentY += 18; // Space for signature / stamp
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(kabagProfile.nama || 'Kepala Bagian Operasional', signX, currentY);
  currentY += 3.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(kabagProfile.nip ? `NIP. ${kabagProfile.nip}` : 'NIP. —', signX, currentY);

  // ── 9. HEADER & RUNNING FOOTER DENGAN NOMOR HALAMAN RESMI ──
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Footer line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(marginX, pageHeight - 10, pageWidth - marginX, pageHeight - 10);

    // Footer text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'Sistem Monitoring Kinerja Petugas Jasa Raharja • Dokumen Rahasia & Resmi Kedinasan',
      marginX,
      pageHeight - 6.5
    );
    doc.text(
      `Halaman ${i} dari ${totalPages}`,
      pageWidth - marginX,
      pageHeight - 6.5,
      { align: 'right' }
    );
  }

  // ── 10. PENAMAAN FILE OTOMATIS & DOWNLOAD ──
  const cleanPeriod = (periodCode || 'Periode').replace(/\s+/g, '_');
  let fileName = `Laporan_Kinerja_Seluruh_Petugas_${cleanPeriod}.pdf`;

  if (reportType === 'INDIVIDUAL_OFFICER' && selectedOfficer) {
    const cleanOfficerName = (selectedOfficer.nama || 'Petugas')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/_$/, '');
    fileName = `Laporan_Kinerja_Petugas_${cleanOfficerName}_${cleanPeriod}.pdf`;
  }

  doc.save(fileName);
  return { success: true, fileName };
}

/**
 * Generate Minimalist & Professional Official Kabag Report PDF
 * Strictly matching Jasa Raharja document standard:
 * - Official logo header
 * - Title: Laporan Monitoring dan Kinerja Petugas
 * - PT Jasa Raharja Kantor Wilayah Riau
 * - Period & Generation Date
 * - Summary Table (Total Korban, Total Kunjungan, Perlu Ditindaklanjuti, Selesai)
 * - Table 1: Daftar Korban yang Perlu Ditindaklanjuti (No, Nama, Petugas, RS, Tgl Laka, Tgl Masuk, Status, Keterangan Keterlambatan)
 * - Table 2: Peringkat Kinerja Petugas (Peringkat, Nama, Korban Ditangani, Kunjungan, Ketepatan, % SLA)
 * - Formal Signatures
 */
export async function generateOfficialKabagReportPdf({
  periodMonthName = 'November',
  periodYear = '2026',
  createdDateStr = '',
  summary = {
    totalKorban: 0,
    totalKunjungan: 0,
    perluTindakLanjut: 0,
    selesai: 0
  },
  overdueVictims = [],
  officerRankings = [],
  kabagProfile = {
    nama: '',
    nip: '',
    jabatan: 'Kepala Bagian Operasional',
    wilayah: 'Kantor Wilayah Riau'
  }
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  const now = new Date();
  const generatedAt = createdDateStr || formatDateTimeIndo(now.toISOString());

  // Logo Jasa Raharja
  const logoDataUrl = await getLogoBase64();
  let currentY = 12;

  if (logoDataUrl) {
    try {
      const logoW = 48;
      const logoH = logoW / 3.8827; // ~12.36mm
      doc.addImage(logoDataUrl, 'PNG', marginX, currentY, logoW, logoH);
      currentY += logoH + 6;
    } catch (e) {
      console.warn('[pdfReportService] Failed to draw logo:', e);
      currentY += 4;
    }
  }

  // 1. Judul Laporan
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('Laporan Monitoring dan Kinerja Petugas', marginX, currentY);

  currentY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85); // slate-700
  doc.text('PT Jasa Raharja Kantor Wilayah Riau', marginX, currentY);

  currentY += 4.5;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`Periode: ${periodMonthName} ${periodYear}   |   Tanggal Pembuatan Laporan: ${generatedAt}`, marginX, currentY);

  // Garis Pemisah Minimalis
  currentY += 3;
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setLineWidth(0.4);
  doc.line(marginX, currentY, pageWidth - marginX, currentY);

  currentY += 5;

  // 2. Ringkasan Laporan (Tabel 4 Kolom)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('RINGKASAN LAPORAN', marginX, currentY);

  currentY += 2;
  const summaryBody = [
    [
      { content: 'Total Korban Dipantau', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      `${summary.totalKorban || 0} Korban`,
      { content: 'Total Kunjungan Dilakukan', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      `${summary.totalKunjungan || 0} Kunjungan`
    ],
    [
      { content: 'Perlu Ditindaklanjuti', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      `${summary.perluTindakLanjut || 0} Korban`,
      { content: 'Pemantauan Selesai', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      `${summary.selesai || 0} Korban`
    ]
  ];

  runAutoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 41 },
      2: { cellWidth: 50 },
      3: { cellWidth: 41 }
    },
    body: summaryBody
  });

  currentY = doc.lastAutoTable.finalY + 6;

  // 2.5 Grafik Batang Perbandingan Kinerja Petugas (Tepat Waktu vs Terlambat)
  if (Array.isArray(officerRankings) && officerRankings.length > 0) {
    if (currentY > pageHeight - 62) {
      doc.addPage();
      currentY = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('PERBANDINGAN KINERJA PETUGAS', marginX, currentY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Jumlah kunjungan tepat waktu vs terlambat per petugas (${periodYear})`, marginX, currentY + 3.5);

    // Legenda kanan
    const legX = pageWidth - marginX - 48;
    doc.setFillColor(5, 150, 105);
    doc.rect(legX, currentY - 2, 3, 3, 'F');
    doc.setTextColor(5, 150, 105);
    doc.text('Tepat Waktu', legX + 4.5, currentY + 0.5);

    doc.setFillColor(239, 68, 68);
    doc.rect(legX + 25, currentY - 2, 3, 3, 'F');
    doc.setTextColor(239, 68, 68);
    doc.text('Terlambat', legX + 29.5, currentY + 0.5);

    currentY += 6;

    const chartData = [...officerRankings].sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
    const maxVal = Math.max(4, ...chartData.map((o) => Math.max(o.tepatWaktu || 0, o.terlambat || 0)));
    const chartLeft = marginX + 8;
    const chartWidth = pageWidth - marginX - chartLeft;
    const chartHeight = 32;
    const baseLineY = currentY + chartHeight;

    // Grid horizontal & angka Y
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    for (let step = 0; step <= 4; step += 1) {
      const yPos = baseLineY - (chartHeight * step) / 4;
      doc.line(chartLeft, yPos, chartLeft + chartWidth, yPos);
      const tickVal = Math.round((maxVal * step) / 4);
      doc.text(String(tickVal), marginX + 4, yPos + 1, { align: 'right' });
    }
    doc.setDrawColor(203, 213, 225);
    doc.line(chartLeft, baseLineY, chartLeft + chartWidth, baseLineY);

    const slotWidth = chartWidth / chartData.length;
    const barW = Math.min(7, slotWidth * 0.25);

    chartData.forEach((o, i) => {
      const centerX = chartLeft + slotWidth * i + slotWidth / 2;
      const tw = o.tepatWaktu || 0;
      const tl = o.terlambat || 0;

      // Bar Tepat Waktu
      const twH = (tw / maxVal) * chartHeight;
      if (tw > 0) {
        doc.setFillColor(5, 150, 105);
        doc.rect(centerX - barW - 0.8, baseLineY - twH, barW, twH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(6, 95, 70);
        doc.text(String(tw), centerX - barW / 2 - 0.8, baseLineY - twH - 1.2, { align: 'center' });
      }

      // Bar Terlambat
      const tlH = (tl / maxVal) * chartHeight;
      if (tl > 0) {
        doc.setFillColor(239, 68, 68);
        doc.rect(centerX + 0.8, baseLineY - tlH, barW, tlH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(185, 28, 28);
        doc.text(String(tl), centerX + barW / 2 + 0.8, baseLineY - tlH - 1.2, { align: 'center' });
      }

      // Nama singkat petugas
      const shortName = (o.nama || '').split(' ')[0] || o.nama || '-';
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      doc.text(shortName, centerX, baseLineY + 4, { align: 'center' });
    });

    currentY = baseLineY + 10;
  }

  // 3. Daftar Korban yang Perlu Ditindaklanjuti
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('DAFTAR KORBAN YANG PERLU DITINDAKLANJUTI', marginX, currentY);

  currentY += 1.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Daftar korban yang mengalami keterlambatan kunjungan atau belum melakukan tindak lanjut sesuai SLA (Tidak termasuk korban selesai).', marginX, currentY);

  currentY += 2;

  const overdueRows = (overdueVictims || []).map((v, idx) => [
    String(idx + 1),
    v.nama || '—',
    v.namaPetugas || '—',
    v.rumahSakit || '—',
    v.tanggalKecelakaanFormatted || formatIndoDate(v.tanggalKecelakaan),
    v.tanggalMasukFormatted || formatIndoDate(v.tanggalMasukRs),
    v.kondisiTerakhir || v.statusPemantauan || 'Masih Dirawat',
    v.keteranganKeterlambatan || v._overdueReason || 'Perlu pemantauan lanjutan'
  ]);

  runAutoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7, lineColor: [203, 213, 225], lineWidth: 0.2 },
    styles: { fontSize: 6.8, cellPadding: 1.8, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 28 },
      2: { cellWidth: 26 },
      3: { cellWidth: 28 },
      4: { cellWidth: 18 },
      5: { cellWidth: 18 },
      6: { cellWidth: 22 },
      7: { cellWidth: 35 }
    },
    head: [[
      'No',
      'Nama Korban',
      'Nama Petugas',
      'Rumah Sakit',
      'Tgl Kecelakaan',
      'Tgl Masuk',
      'Status Terakhir',
      'Keterangan Keterlambatan'
    ]],
    body: overdueRows.length > 0 ? overdueRows : [[
      { content: 'Tidak ada korban yang perlu ditindaklanjuti pada periode ini.', colSpan: 8, styles: { halign: 'center', fontStyle: 'italic', textColor: [100, 116, 139] } }
    ]]
  });

  currentY = doc.lastAutoTable.finalY + 6;

  // 4. Peringkat Kinerja Petugas
  if (currentY > pageHeight - 55) {
    doc.addPage();
    currentY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('PERINGKAT KINERJA PETUGAS', marginX, currentY);

  currentY += 1.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Peringkat diurutkan berdasarkan hasil penilaian KPI dan kepatuhan SLA aktual. Jumlah korban hanya sebagai informasi beban kerja.', marginX, currentY);

  currentY += 2;

  const rankingRows = (officerRankings || []).map((o, idx) => [
    String(o.peringkat ?? (o.jumlahKorbanDitangani > 0 ? idx + 1 : '-')),
    o.nama || '—',
    `${o.jumlahKorbanDitangani || 0} Korban`,
    `${o.jumlahKunjungan || 0} Kunjungan`,
    o.ketepatanWaktuKunjungan || `${o.tepatWaktu || 0} Tepat`,
    o.persentaseSla !== null && o.persentaseSla !== undefined ? `${o.persentaseSla}%` : 'N/A'
  ]);

  runAutoTable(doc, {
    startY: currentY,
    margin: { left: marginX, right: marginX },
    theme: 'grid',
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7, lineColor: [203, 213, 225], lineWidth: 0.2 },
    styles: { fontSize: 7, cellPadding: 2, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 46 },
      2: { cellWidth: 30, halign: 'center' },
      3: { cellWidth: 30, halign: 'center' },
      4: { cellWidth: 38, halign: 'center' },
      5: { cellWidth: 24, halign: 'center', fontStyle: 'bold' }
    },
    head: [[
      'Peringkat',
      'Nama Petugas',
      'Korban Ditangani',
      'Jumlah Kunjungan',
      'Ketepatan Waktu Kunjungan',
      'Pencapaian SLA'
    ]],
    body: rankingRows.length > 0 ? rankingRows : [[
      { content: 'Tidak ada data kinerja petugas pada periode ini.', colSpan: 6, styles: { halign: 'center', fontStyle: 'italic', textColor: [100, 116, 139] } }
    ]]
  });

  currentY = doc.lastAutoTable.finalY + 8;

  // 5. Lembar Pengesahan Tanda Tangan
  if (currentY > pageHeight - 40) {
    doc.addPage();
    currentY = 20;
  }

  const signX = pageWidth - marginX - 70;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  const tglTtd = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Pekanbaru, ${tglTtd}`, signX, currentY);
  currentY += 4;
  doc.text('Mengetahui / Mengesahkan,', signX, currentY);
  currentY += 3.5;
  doc.setFont('helvetica', 'bold');
  doc.text(kabagProfile.jabatan || 'Kepala Bagian Operasional', signX, currentY);
  currentY += 3.5;
  doc.text('PT Jasa Raharja Kantor Wilayah Riau', signX, currentY);

  currentY += 18; // ruang tanda tangan
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(kabagProfile.nama || 'Kepala Bagian Operasional', signX, currentY);
  currentY += 3.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(kabagProfile.nip ? `NIP. ${kabagProfile.nip}` : 'NIP. —', signX, currentY);

  // Footer di semua halaman
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX, pageHeight - 9, pageWidth - marginX, pageHeight - 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'Laporan Monitoring dan Kinerja Petugas • PT Jasa Raharja Kantor Wilayah Riau',
      marginX,
      pageHeight - 5.5
    );
    doc.text(
      `Halaman ${i} dari ${totalPages}`,
      pageWidth - marginX,
      pageHeight - 5.5,
      { align: 'right' }
    );
  }

  const fileName = `Laporan_Monitoring_Kinerja_Petugas_${periodMonthName}_${periodYear}.pdf`;
  doc.save(fileName);
  return { success: true, fileName };
}
