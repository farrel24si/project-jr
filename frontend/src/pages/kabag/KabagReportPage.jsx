import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Download, 
  Filter, 
  RotateCcw, 
  Calendar, 
  Users, 
  UserCheck, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  TrendingUp, 
  Search, 
  Building2, 
  MapPin, 
  ShieldCheck, 
  ChevronRight, 
  Eye, 
  Check, 
  Activity,
  Layers,
  FileSpreadsheet
} from 'lucide-react';
import ConditionBadge from '../../components/common/ConditionBadge';
import VictimDetailDrawer from '../../components/kabag/VictimDetailDrawer';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';
import { generatePerformancePdfReport } from '../../services/pdfReportService';

// Module-level date & time formatting helpers
const formatIndoDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const formatIndoDateTime = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const datePart = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const timePart = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '.') + ' WIB';
    return `${datePart}, ${timePart}`;
  } catch {
    return dateStr;
  }
};

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function KabagReportPage() {
  const [victims, setVictims] = useState([]);
  const [officers, setOfficers] = useState([]);

  // ── FILTER CONTROLS STATE ──
  const [reportType, setReportType] = useState('ALL_OFFICERS'); // 'ALL_OFFICERS' | 'INDIVIDUAL_OFFICER'
  const [selectedOfficerId, setSelectedOfficerId] = useState('');
  const [periodType, setPeriodType] = useState('MONTHLY'); // 'MONTHLY' | 'YEARLY' | 'CUSTOM'
  const [selectedMonth, setSelectedMonth] = useState('10'); // Index 10 = November
  const [selectedYear, setSelectedYear] = useState('2026');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Applied Filters State (Triggered on 'Terapkan Filter')
  const [appliedFilters, setAppliedFilters] = useState({
    reportType: 'ALL_OFFICERS',
    selectedOfficerId: '',
    periodType: 'MONTHLY',
    selectedMonth: '10',
    selectedYear: '2026',
    customStartDate: '',
    customEndDate: ''
  });

  // Table Search & Drawer
  const [activitySearch, setActivitySearch] = useState('');
  const [selectedVictimForDrawer, setSelectedVictimForDrawer] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const filterValidOfficers = (list) => {
    const DUMMY_FILTER = ['citra dewi', 'budi santoso', 'eko prasetyo', 'doni setiawan', 'maya anggraini', 'hendra pratama', 'siti nurhaliza', 'dimas anggara', 'ahmad fauzi', 'adi putra'];
    return (list || []).filter((o) => {
      const lower = (o.nama || '').toLowerCase();
      return !DUMMY_FILTER.some((d) => lower.includes(d));
    });
  };

  const loadData = () => {
    const vList = storageService.getVictims();
    const oList = filterValidOfficers(storageService.getOfficers());
    setVictims(vList);
    setOfficers(oList);
    if (oList.length > 0 && !selectedOfficerId) {
      setSelectedOfficerId(oList[0].id);
    }
  };

  useEffect(() => {
    storageService.syncWithBackend(true).catch(() => {});
    loadData();
    window.addEventListener('jr_victims_updated', loadData);
    window.addEventListener('jr_officers_updated', loadData);
    return () => {
      window.removeEventListener('jr_victims_updated', loadData);
      window.removeEventListener('jr_officers_updated', loadData);
    };
  }, []);

  const handleApplyFilters = (e) => {
    if (e) e.preventDefault();
    setAppliedFilters({
      reportType,
      selectedOfficerId,
      periodType,
      selectedMonth,
      selectedYear,
      customStartDate,
      customEndDate
    });
  };

  const handleResetFilters = () => {
    const defaultOfficer = officers.length > 0 ? officers[0].id : '';
    setReportType('ALL_OFFICERS');
    setSelectedOfficerId(defaultOfficer);
    setPeriodType('MONTHLY');
    setSelectedMonth('10');
    setSelectedYear('2026');
    setCustomStartDate('');
    setCustomEndDate('');
    setAppliedFilters({
      reportType: 'ALL_OFFICERS',
      selectedOfficerId: defaultOfficer,
      periodType: 'MONTHLY',
      selectedMonth: '10',
      selectedYear: '2026',
      customStartDate: '',
      customEndDate: ''
    });
  };

  // ── FILTER DATA REAKTIF SESUAI APPLIED FILTERS ──
  const filteredData = useMemo(() => {
    const { reportType, selectedOfficerId, periodType, selectedMonth, selectedYear, customStartDate, customEndDate } = appliedFilters;

    // Helper cek tanggal
    const checkDateMatches = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      const y = String(d.getFullYear());
      const m = String(d.getMonth());

      if (periodType === 'MONTHLY') {
        return y === selectedYear && m === selectedMonth;
      }
      if (periodType === 'YEARLY') {
        return y === selectedYear;
      }
      if (periodType === 'CUSTOM') {
        if (!customStartDate && !customEndDate) return true;
        const time = d.getTime();
        const start = customStartDate ? new Date(customStartDate).getTime() : 0;
        const end = customEndDate ? new Date(customEndDate).getTime() + 86400000 : Infinity;
        return time >= start && time <= end;
      }
      return true;
    };

    // Filter Korban
    const matchingVictims = victims.filter((v) => {
      // 1. Filter Officer jika mode individual
      if (reportType === 'INDIVIDUAL_OFFICER' && selectedOfficerId) {
        if (v.petugasId !== selectedOfficerId) return false;
      }

      // 2. Filter Periode berdasarkan tanggal info diterima, tanggal laka, atau tanggal riwayat aktivitas
      const dates = [
        v.tanggalInformasiDiterima,
        v.tanggalKecelakaan,
        ...(v.riwayatAktivitas || []).map((a) => a.tanggalKunjungan || a.tanggal || a.waktuSelesai)
      ].filter(Boolean);

      if (dates.length === 0) return true;
      return dates.some(checkDateMatches);
    });

    // 3. Filter Aktivitas Lapangan Aktual
    const matchingActivities = [];
    matchingVictims.forEach((v) => {
      const acts = v.riwayatAktivitas || [];
      acts.forEach((a) => {
        const actDate = a.waktuSelesai || a.tanggalKunjungan || a.tanggal || a.waktuInput;
        // Pastikan tanggal aktivitas aktual masuk dalam periode
        if (checkDateMatches(actDate)) {
          const isFirstVisit = a.jenisAktivitas === 'Kunjungan Pertama' || a.kunjunganKe === 1;
          const firstSla = isFirstVisit ? calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama) : null;
          const wasLate = a.terlambat || a.wasLate || (firstSla && firstSla.wasLate);

          matchingActivities.push({
            id: a.id || `${v.id}-${Math.random()}`,
            victimId: v.id,
            victimObj: v,
            namaKorban: v.nama,
            rumahSakit: v.rumahSakit,
            petugasNama: a.petugasNama || v.namaPetugas || 'Petugas Lapangan',
            tanggalInfo: v.tanggalInformasiDiterima,
            waktuAktivitas: actDate,
            jenisAktivitas: isFirstVisit ? 'Kunjungan Pertama' : 'Pemantauan Lanjutan',
            kondisiKorban: a.kondisiKorban || a.kondisi || v.kondisiTerakhir || 'Masih Dirawat',
            statusTindakLanjut: a.statusTindakLanjut || (a.masihPerluTindakLanjut ? 'Masih Perlu Ditindaklanjuti' : 'Sudah Selesai'),
            terlambat: wasLate,
            slaText: wasLate ? 'Terlambat' : 'Tepat Waktu'
          });
        }
      });
    });

    // Urutkan aktivitas aktual terbaru pertama
    matchingActivities.sort((a, b) => {
      const tA = a.waktuAktivitas ? new Date(a.waktuAktivitas).getTime() : 0;
      const tB = b.waktuAktivitas ? new Date(b.waktuAktivitas).getTime() : 0;
      return tB - tA;
    });

    return {
      victims: matchingVictims,
      activities: matchingActivities
    };
  }, [victims, appliedFilters]);

  // ── 5. REKAP STATUS PEMANTAUAN KORBAN (MUTUALLY EXCLUSIVE) ──
  const statusDistribution = useMemo(() => {
    const counts = {
      'Belum Dikunjungi': 0,
      'Dalam Pemantauan': 0,
      'Perlu Tindak Lanjut': 0,
      'Pemantauan Selesai': 0
    };

    filteredData.victims.forEach((v) => {
      // 1. Belum Dikunjungi
      if (!v.kunjunganPertama && (!v.riwayatKunjungan || v.riwayatKunjungan.length === 0)) {
        counts['Belum Dikunjungi']++;
      }
      // 2. Pemantauan Selesai
      else if (
        v.statusPemantauan === 'Selesai Dipantau' ||
        v.kondisiTerakhir === 'Sudah Pulang' ||
        v.kondisiTerakhir === 'Pulang' ||
        v.kondisiTerakhir === 'Meninggal Dunia'
      ) {
        counts['Pemantauan Selesai']++;
      }
      // 3. Perlu Tindak Lanjut
      else if (
        v.statusTindakLanjut === 'Masih Perlu Ditindaklanjuti' ||
        v.statusKonfirmasiKondisi === 'Belum Dikonfirmasi' ||
        v.statusPemantauan === 'Menunggu Konfirmasi Kondisi' ||
        (v.tindakLanjutChecklist && v.tindakLanjutChecklist.length > 0)
      ) {
        counts['Perlu Tindak Lanjut']++;
      }
      // 4. Dalam Pemantauan
      else {
        counts['Dalam Pemantauan']++;
      }
    });

    const total = filteredData.victims.length;

    return [
      {
        name: 'Belum Dikunjungi',
        value: counts['Belum Dikunjungi'],
        color: '#F59E0B',
        percentage: total > 0 ? Math.round((counts['Belum Dikunjungi'] / total) * 100) : 0,
        desc: 'Menunggu kunjungan awal petugas (Target SLA 72 Jam)'
      },
      {
        name: 'Dalam Pemantauan',
        value: counts['Dalam Pemantauan'],
        color: '#145DA0',
        percentage: total > 0 ? Math.round((counts['Dalam Pemantauan'] / total) * 100) : 0,
        desc: 'Pasien rawat inap aktif memerlukan pemantauan berkala'
      },
      {
        name: 'Perlu Tindak Lanjut',
        value: counts['Perlu Tindak Lanjut'],
        color: '#E11D48',
        percentage: total > 0 ? Math.round((counts['Perlu Tindak Lanjut'] / total) * 100) : 0,
        desc: 'Memerlukan kelengkapan berkas, koordinasi RS / LP'
      },
      {
        name: 'Pemantauan Selesai',
        value: counts['Pemantauan Selesai'],
        color: '#10B981',
        percentage: total > 0 ? Math.round((counts['Pemantauan Selesai'] / total) * 100) : 0,
        desc: 'Korban pulang atau proses santunan telah tuntas'
      }
    ];
  }, [filteredData.victims]);

  // ── 4. REKAP EVALUASI KINERJA PETUGAS ──
  const officerEvaluation = useMemo(() => {
    const targetOfficers = appliedFilters.reportType === 'INDIVIDUAL_OFFICER'
      ? officers.filter((o) => o.id === appliedFilters.selectedOfficerId)
      : officers;

    const list = targetOfficers.map((off) => {
      const assignedVictims = filteredData.victims.filter((v) => v.petugasId === off.id);
      const totalKorbanUnik = assignedVictims.length;

      let kunjunganAwal = 0;
      let pemantauanLanjutan = 0;
      let tugasSelesaiTepatWaktu = 0;
      let tugasTerlambat = 0;

      assignedVictims.forEach((v) => {
        const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
        const mSla = calculateMonitoringSla(v);

        if (v.kunjunganPertama) {
          kunjunganAwal++;
          if (fSla.wasLate) {
            tugasTerlambat++;
          } else {
            tugasSelesaiTepatWaktu++;
          }
        } else {
          // Hanya jika lewat batas SLA dihitung terlambat (tugas berjalan tidak gagal)
          if (fSla.isOverdue) {
            tugasTerlambat++;
          }
        }

        const acts = v.riwayatAktivitas || [];
        acts.forEach((a) => {
          if (a.jenisAktivitas !== 'Kunjungan Pertama' && a.kunjunganKe !== 1) {
            pemantauanLanjutan++;
            if (a.terlambat || a.wasLate) {
              tugasTerlambat++;
            } else {
              tugasSelesaiTepatWaktu++;
            }
          }
        });

        // Pemantauan berjalan yang terlambat
        if (v.kunjunganPertama && v.statusPemantauan !== 'Selesai Dipantau' && mSla.isOverdue) {
          tugasTerlambat++;
        }
      });

      const totalTugasTerevaluasi = tugasSelesaiTepatWaktu + tugasTerlambat;
      const persentaseKetepatan = totalTugasTerevaluasi > 0
        ? Math.round((tugasSelesaiTepatWaktu / totalTugasTerevaluasi) * 100)
        : 100;

      return {
        id: off.id,
        nama: off.nama,
        nip: off.nip,
        jabatan: off.jabatan,
        wilayah: off.wilayah,
        avatar: off.avatar || off.nama?.slice(0, 2).toUpperCase(),
        totalKorbanUnik,
        kunjunganAwal,
        pemantauanLanjutan,
        tugasSelesaiTepatWaktu,
        tugasTerlambat,
        totalTugasTerevaluasi,
        persentaseKetepatan
      };
    });

    list.sort((a, b) => b.persentaseKetepatan - a.persentaseKetepatan);
    return list;
  }, [officers, filteredData.victims, appliedFilters]);

  // ── 3. RINGKASAN LAPORAN (6 KPI STAT CARDS) ──
  const summaryReport = useMemo(() => {
    const totalPetugas = officerEvaluation.length;
    const totalKorbanUnik = filteredData.victims.length;
    let tugasSelesaiTepatWaktu = 0;
    let tugasTerlambat = 0;

    officerEvaluation.forEach((off) => {
      tugasSelesaiTepatWaktu += off.tugasSelesaiTepatWaktu;
      tugasTerlambat += off.tugasTerlambat;
    });

    const totalTugasSelesai = tugasSelesaiTepatWaktu + tugasTerlambat;
    const persentaseKetepatan = totalTugasSelesai > 0
      ? Math.round((tugasSelesaiTepatWaktu / totalTugasSelesai) * 100)
      : 100;

    return {
      totalPetugas,
      totalKorbanUnik,
      totalTugasSelesai,
      tugasTepatWaktu: tugasSelesaiTepatWaktu,
      tugasTerlambat,
      persentaseKetepatan
    };
  }, [officerEvaluation, filteredData.victims]);

  // ── 7. CATATAN KASUS MEMERLUKAN TINDAK LANJUT ──
  const pendingFollowups = useMemo(() => {
    const list = [];
    filteredData.victims.forEach((v) => {
      if (
        v.statusTindakLanjut === 'Masih Perlu Ditindaklanjuti' ||
        (v.tindakLanjutChecklist && v.tindakLanjutChecklist.length > 0) ||
        v.statusKonfirmasiKondisi === 'Belum Dikonfirmasi'
      ) {
        const itemTugas = v.tindakLanjutChecklist?.length > 0
          ? v.tindakLanjutChecklist.join(', ')
          : (v.tindakLanjut || 'Kelengkapan berkas santunan & koordinasi RS');

        list.push({
          id: `FOL-${v.id}`,
          namaKorban: v.nama,
          rumahSakit: v.rumahSakit,
          petugasNama: v.namaPetugas || 'Petugas Lapangan',
          jenisTugas: itemTugas,
          batasWaktu: v.waktuPemantauanTerakhir ? `Kunjungan: ${formatIndoDate(v.waktuPemantauanTerakhir)}` : 'Segera',
          kondisiDisplay: v.statusKonfirmasiKondisi === 'Belum Dikonfirmasi' ? 'Belum Dapat Dikonfirmasi' : (v.kondisiTerakhir || 'Belum Dapat Dikonfirmasi')
        });
      }
    });
    return list;
  }, [filteredData.victims]);

  // ── LABEL PERIODE UNTUK TAMPILAN & PDF ──
  const periodLabelText = useMemo(() => {
    const { periodType, selectedMonth, selectedYear, customStartDate, customEndDate } = appliedFilters;
    if (periodType === 'MONTHLY') {
      const mName = MONTH_NAMES[parseInt(selectedMonth, 10)] || 'Bulan';
      return `Bulan ${mName} ${selectedYear}`;
    }
    if (periodType === 'YEARLY') {
      return `Tahun ${selectedYear}`;
    }
    if (periodType === 'CUSTOM') {
      return `Rentang ${formatIndoDate(customStartDate)} s/d ${formatIndoDate(customEndDate)}`;
    }
    return `Tahun ${selectedYear}`;
  }, [appliedFilters]);

  const periodCodeForFilename = useMemo(() => {
    const { periodType, selectedMonth, selectedYear } = appliedFilters;
    if (periodType === 'MONTHLY') {
      const mName = MONTH_NAMES[parseInt(selectedMonth, 10)] || 'Bulan';
      return `${mName}_${selectedYear}`;
    }
    if (periodType === 'YEARLY') {
      return `Tahun_${selectedYear}`;
    }
    return 'Periode_Khusus';
  }, [appliedFilters]);

  // ── DOWNLOAD PDF HANDLER (SECTION 7) ──
  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const selectedOfficer = appliedFilters.reportType === 'INDIVIDUAL_OFFICER'
        ? officers.find((o) => o.id === appliedFilters.selectedOfficerId)
        : null;

      const res = await generatePerformancePdfReport({
        reportType: appliedFilters.reportType,
        selectedOfficer,
        periodLabel: periodLabelText,
        periodCode: periodCodeForFilename,
        summary: summaryReport,
        officerRanking: officerEvaluation,
        statusDistribution,
        activities: filteredData.activities,
        pendingFollowups
      });

      if (res && res.success) {
        setToastMessage(`Laporan PDF "${res.fileName}" berhasil dibuat dan diunduh!`);
        setTimeout(() => setToastMessage(''), 5000);
      }
    } catch (err) {
      console.error('Error generating PDF report:', err);
      alert('Terjadi kendala saat menghasilkan dokumen PDF. Silakan coba kembali.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Filter aktivitas berdasarkan input pencarian
  const searchFilteredActivities = useMemo(() => {
    if (!activitySearch) return filteredData.activities;
    const q = activitySearch.toLowerCase();
    return filteredData.activities.filter((a) =>
      a.namaKorban.toLowerCase().includes(q) ||
      a.rumahSakit.toLowerCase().includes(q) ||
      a.petugasNama.toLowerCase().includes(q) ||
      a.jenisAktivitas.toLowerCase().includes(q)
    );
  }, [filteredData.activities, activitySearch]);

  const activeOfficerProfile = useMemo(() => {
    if (appliedFilters.reportType !== 'INDIVIDUAL_OFFICER') return null;
    return officers.find((o) => o.id === appliedFilters.selectedOfficerId) || null;
  }, [officers, appliedFilters]);

  return (
    <div className="space-y-6 pb-14">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-[#0A3981] text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-semibold animate-bounce border border-blue-400">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── HEADER HALAMAN & DOWNLOAD BUTTON (SECTION 2 & 7) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#0A3981]" />
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Laporan Kinerja Petugas
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Rekapitulasi resmi kinerja pelayanan, kepatuhan batas waktu SLA, pemantauan korban kecelakaan, dan audit riwayat kunjungan petugas lapangan PT Jasa Raharja.
          </p>
        </div>

        {/* Action Button: Download PDF */}
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold bg-[#0A3981] hover:bg-[#072B62] text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{isGeneratingPdf ? 'Membuat PDF...' : 'Download PDF Laporan'}</span>
          </button>
        </div>
      </div>

      {/* ── PANEL FILTER LAPORAN (SECTION 2) ── */}
      <form onSubmit={handleApplyFilters} className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Filter className="w-4 h-4 text-[#0A3981]" />
            <span>Parameter &amp; Filter Laporan</span>
          </div>

          <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
            Periode Aktif: <strong>{periodLabelText}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* 1. Jenis Laporan */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Jenis Laporan</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option value="ALL_OFFICERS">Keseluruhan Petugas</option>
              <option value="INDIVIDUAL_OFFICER">Individu Petugas</option>
            </select>
          </div>

          {/* 2. Pilihan Petugas (Jika Individu) */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Pilihan Petugas {reportType === 'ALL_OFFICERS' && <span className="text-slate-400 font-normal">(Non-aktif)</span>}
            </label>
            <select
              value={selectedOfficerId}
              onChange={(e) => setSelectedOfficerId(e.target.value)}
              disabled={reportType === 'ALL_OFFICERS'}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              {officers.map((off) => (
                <option key={off.id} value={off.id}>
                  {off.nama} ({off.wilayah})
                </option>
              ))}
            </select>
          </div>

          {/* 3. Tipe Periode */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Tipe Periode</label>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option value="MONTHLY">Bulanan</option>
              <option value="YEARLY">Tahunan</option>
              <option value="CUSTOM">Rentang Tanggal Khusus</option>
            </select>
          </div>

          {/* 4. Pilihan Bulan & Tahun / Date Range */}
          {periodType === 'MONTHLY' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Bulan</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx} value={String(idx)}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tahun</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                </select>
              </div>
            </div>
          ) : periodType === 'YEARLY' ? (
            <div>
              <label className="block font-bold text-slate-700 mb-1">Tahun</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Dari</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Sampai</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>
          )}
        </div>

        {/* Buttons Action */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0A3981] hover:bg-blue-900 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Terapkan Filter</span>
          </button>
        </div>
      </form>

      {/* ── PROFIL PETUGAS HIGHLIGHT (JIKA LAPORAN INDIVIDU) ── */}
      {appliedFilters.reportType === 'INDIVIDUAL_OFFICER' && activeOfficerProfile && (
        <div className="bg-white rounded-2xl border border-blue-200 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-blue-50/40 to-white">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-[#0A3981] text-white font-black text-base flex items-center justify-center shrink-0 shadow-xs">
              {activeOfficerProfile.avatar || activeOfficerProfile.nama.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider bg-blue-100/70 px-2 py-0.5 rounded">
                Laporan Kinerja Individu
              </span>
              <h2 className="text-lg font-black text-slate-900 mt-1">
                {activeOfficerProfile.nama}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-0.5">
                <span>NIP: {activeOfficerProfile.nip || '—'}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  <span>Wilayah: {activeOfficerProfile.wilayah}</span>
                </span>
                <span>•</span>
                <span>{activeOfficerProfile.jabatan}</span>
              </div>
            </div>
          </div>

          <div className="text-right sm:border-l sm:border-slate-200 sm:pl-6">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Tingkat Ketepatan</span>
            <div className="text-2xl font-black text-[#0A3981]">
              {summaryReport.persentaseKetepatan}%
            </div>
            <span className="text-[10px] font-semibold text-emerald-700">
              Evaluasi Terpadu
            </span>
          </div>
        </div>
      )}

      {/* ── SECTION 3: RINGKASAN LAPORAN (6 STAT CARDS) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Card 1: Petugas */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            JUMLAH PETUGAS
          </span>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-slate-900">{summaryReport.totalPetugas}</div>
            <span className="text-[11px] text-slate-500 font-medium">Petugas Terdaftar</span>
          </div>
        </div>

        {/* Card 2: Korban Unik */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            KORBAN UNIK
          </span>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-slate-900">{summaryReport.totalKorbanUnik}</div>
            <span className="text-[11px] text-slate-500 font-medium">Orang Ditangani</span>
          </div>
        </div>

        {/* Card 3: Total Tugas Selesai */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            TUGAS SELESAI
          </span>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-slate-900">{summaryReport.totalTugasSelesai}</div>
            <span className="text-[11px] text-slate-500 font-medium">Kunjungan &amp; Pantau</span>
          </div>
        </div>

        {/* Card 4: Tugas Tepat Waktu */}
        <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-2xs flex flex-col justify-between bg-emerald-50/20">
          <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
            TEPAT WAKTU
          </span>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-emerald-700">{summaryReport.tugasTepatWaktu}</div>
            <span className="text-[11px] text-emerald-600 font-medium">Memenuhi SLA</span>
          </div>
        </div>

        {/* Card 5: Tugas Terlambat */}
        <div className="bg-white rounded-2xl border border-rose-200 p-4 shadow-2xs flex flex-col justify-between bg-rose-50/20">
          <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">
            TERLAMBAT
          </span>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-rose-700">{summaryReport.tugasTerlambat}</div>
            <span className="text-[11px] text-rose-600 font-medium">Lewat Tenggat SLA</span>
          </div>
        </div>

        {/* Card 6: Persentase Ketepatan Waktu */}
        <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-2xs flex flex-col justify-between bg-blue-50/30">
          <span className="text-[10px] font-bold text-[#0A3981] uppercase tracking-wider">
            KETEPATAN WAKTU
          </span>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-[#0A3981]">{summaryReport.persentaseKetepatan}%</div>
            <span className="text-[11px] text-blue-700 font-bold">Standar SLA 90%</span>
          </div>
        </div>
      </div>

      {/* ── SECTION 5: REKAP STATUS PEMANTAUAN KORBAN ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5">
        <div className="border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#0A3981]" />
            <h2 className="text-base font-extrabold text-slate-900">
              Rekapitulasi Status Pemantauan Korban
            </h2>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Distribusi kondisi terkini seluruh korban pada periode terpilih (setiap korban dihitung tepat satu kali).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {statusDistribution.map((item) => (
            <div
              key={item.name}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-xs font-bold text-slate-800">{item.name}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{item.desc}</p>
              </div>

              <div className="mt-4 pt-2.5 border-t border-slate-200/80 flex items-baseline justify-between">
                <span className="text-xl font-black text-slate-900">{item.value} Orang</span>
                <span className="text-xs font-bold text-slate-600">{item.percentage}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 4: REKAP KINERJA PETUGAS (TABEL) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#0A3981]" />
              <h2 className="text-base font-extrabold text-slate-900">
                {appliedFilters.reportType === 'INDIVIDUAL_OFFICER'
                  ? 'Rekap Evaluasi Kinerja Petugas Terpilih'
                  : 'Rekapitulasi Kinerja Seluruh Petugas Lapangan'}
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Perhitungan ketepatan waktu berdasarkan perbandingan tugas selesai tepat waktu terhadap seluruh tugas yang dapat dievaluasi.
            </p>
          </div>

          <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700">
            {officerEvaluation.length} Petugas
          </span>
        </div>

        {/* DESKTOP TABLE VIEW */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200/80 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4 text-center w-12">RANK</th>
                <th className="py-3 px-4">NAMA PETUGAS</th>
                <th className="py-3 px-4">WILAYAH TUGAS</th>
                <th className="py-3 px-4 text-center">KORBAN UNIK</th>
                <th className="py-3 px-4 text-center">KUNJUNGAN AWAL</th>
                <th className="py-3 px-4 text-center">PANTAU LANJUTAN</th>
                <th className="py-3 px-4 text-center">TEPAT WAKTU</th>
                <th className="py-3 px-4 text-center">TERLAMBAT</th>
                <th className="py-3 px-4 text-center">KETEPATAN WAKTU</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {officerEvaluation.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Tidak ada data kinerja petugas yang dapat dievaluasi pada periode ini.
                  </td>
                </tr>
              ) : (
                officerEvaluation.map((off, idx) => {
                  return (
                    <tr key={off.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 text-center">
                        <span className="w-6 h-6 rounded-md bg-[#0A3981] text-white font-extrabold text-xs inline-flex items-center justify-center shadow-2xs">
                          {idx + 1}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                        {off.nama}
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{off.wilayah}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800 whitespace-nowrap">
                        {off.totalKorbanUnik} Korban
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-700 whitespace-nowrap">
                        {off.kunjunganAwal} Kasus
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-700 whitespace-nowrap">
                        {off.pemantauanLanjutan} Catatan
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-emerald-700 whitespace-nowrap">
                        {off.tugasSelesaiTepatWaktu} Tugas
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-rose-700 whitespace-nowrap">
                        {off.tugasTerlambat} Tugas
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className={`text-xs font-bold ${
                          off.persentaseKetepatan < 80
                            ? 'text-rose-700'
                            : off.persentaseKetepatan < 90
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}>
                          {off.persentaseKetepatan}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARD VIEW (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {officerEvaluation.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Tidak ada data kinerja petugas yang dapat dievaluasi.
            </div>
          ) : (
            officerEvaluation.map((off, idx) => (
              <div key={off.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-[#0A3981] text-white font-extrabold text-xs inline-flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <span className="font-bold text-slate-900 text-xs block">{off.nama}</span>
                      <span className="text-[10px] text-slate-500 block">{off.wilayah}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    off.persentaseKetepatan < 80
                      ? 'bg-rose-50 text-rose-700'
                      : off.persentaseKetepatan < 90
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {off.persentaseKetepatan}% Tepat
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-2.5 text-center text-[10px] border border-slate-100">
                  <div>
                    <span className="text-slate-400 block">Total Pasien</span>
                    <strong className="text-slate-800 text-xs">{off.totalKorbanUnik}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Tepat Waktu</span>
                    <strong className="text-emerald-700 text-xs">{off.tugasSelesaiTepatWaktu}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Terlambat</span>
                    <strong className="text-rose-600 text-xs">{off.tugasTerlambat}</strong>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── SECTION 6: RINCIAN AKTIVITAS AKTUAL LAPANGAN ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#0A3981]" />
              <h2 className="text-base font-extrabold text-slate-900">
                Rincian Riwayat Aktivitas Aktual Lapangan
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Rekam log kunjungan dan pemantauan berdasarkan tanggal pelaksanaan aktual (bukan tanggal jadwal).
            </p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              placeholder="Cari korban, RS, atau petugas..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white w-60"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200/80 uppercase text-[10px] tracking-wider sticky top-0 z-10">
              <tr>
                <th className="py-3 px-3 text-center w-10">NO</th>
                <th className="py-3 px-3">NAMA KORBAN</th>
                <th className="py-3 px-3">RUMAH SAKIT</th>
                <th className="py-3 px-3">PETUGAS</th>
                <th className="py-3 px-3">TGL INFO DITERIMA</th>
                <th className="py-3 px-3">TGL KUNJUNGAN AKTUAL</th>
                <th className="py-3 px-3">JENIS AKTIVITAS</th>
                <th className="py-3 px-3">KONDISI KORBAN</th>
                <th className="py-3 px-3">STATUS TINDAK LANJUT</th>
                <th className="py-3 px-3 text-center">STATUS SLA</th>
                <th className="py-3 px-3 text-center w-20">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {searchFilteredActivities.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    Tidak ada aktivitas yang sesuai dengan filter pencarian pada periode ini.
                  </td>
                </tr>
              ) : (
                searchFilteredActivities.map((act, idx) => (
                  <tr key={act.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 text-center text-slate-400 font-semibold">{idx + 1}</td>
                    <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedVictimForDrawer(act.victimObj)}
                        className="hover:text-[#0A3981] hover:underline cursor-pointer text-left"
                      >
                        {act.namaKorban}
                      </button>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-800 whitespace-nowrap">{act.rumahSakit}</td>
                    <td className="py-3 px-3 whitespace-nowrap">{act.petugasNama}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-slate-500">{formatIndoDate(act.tanggalInfo)}</td>
                    <td className="py-3 px-3 whitespace-nowrap font-medium text-slate-700">{formatIndoDateTime(act.waktuAktivitas)}</td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="text-[10px] font-medium text-slate-500">
                        {act.jenisAktivitas}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <ConditionBadge kondisi={act.kondisiKorban} size="xs" />
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                        act.statusTindakLanjut.includes('Masih Perlu')
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {act.statusTindakLanjut}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                        act.terlambat
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {act.slaText}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedVictimForDrawer(act.victimObj)}
                        className="px-2.5 py-1 rounded bg-[#0A3981] hover:bg-blue-900 text-white font-bold text-[11px] cursor-pointer"
                      >
                        Audit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARD VIEW (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {officerEvaluation.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Tidak ada data kinerja petugas yang dapat dievaluasi.
            </div>
          ) : (
            officerEvaluation.map((off, idx) => (
              <div key={off.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-[#0A3981] text-white font-extrabold text-xs inline-flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <span className="font-bold text-slate-900 text-xs block">{off.nama}</span>
                      <span className="text-[10px] text-slate-500 block">{off.wilayah}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    off.persentaseKetepatan < 80
                      ? 'bg-rose-50 text-rose-700'
                      : off.persentaseKetepatan < 90
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {off.persentaseKetepatan}% Tepat
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-2.5 text-center text-[10px] border border-slate-100">
                  <div>
                    <span className="text-slate-400 block">Total Pasien</span>
                    <strong className="text-slate-800 text-xs">{off.totalKorbanUnik}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Tepat Waktu</span>
                    <strong className="text-emerald-700 text-xs">{off.tugasSelesaiTepatWaktu}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Terlambat</span>
                    <strong className="text-rose-600 text-xs">{off.tugasTerlambat}</strong>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── SECTION 7: CATATAN KASUS MEMERLUKAN TINDAK LANJUT ── */}
      {pendingFollowups.length > 0 && (
        <div className="bg-white rounded-2xl border border-rose-200 shadow-2xs overflow-hidden">
          <div className="p-4 bg-rose-50/40 border-b border-rose-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-700" />
              <h3 className="text-sm font-extrabold text-rose-900">
                Pekerjaan yang Masih Memerlukan Tindak Lanjut Petugas
              </h3>
            </div>
            <span className="text-xs font-bold text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-200">
              {pendingFollowups.length} Kasus Perlu Diselesaikan
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">NAMA KORBAN</th>
                  <th className="py-2.5 px-3">RUMAH SAKIT</th>
                  <th className="py-2.5 px-3">PETUGAS</th>
                  <th className="py-2.5 px-3">JENIS TINDAK LANJUT</th>
                  <th className="py-2.5 px-3">BATAS WAKTU</th>
                  <th className="py-2.5 px-3">KONDISI PASIEN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingFollowups.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{item.namaKorban}</td>
                    <td className="py-2.5 px-3">{item.rumahSakit}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">{item.petugasNama}</td>
                    <td className="py-2.5 px-3 font-semibold text-rose-700">{item.jenisTugas}</td>
                    <td className="py-2.5 px-3 text-slate-500">{item.batasWaktu}</td>
                    <td className="py-2.5 px-3">
                      <span className="text-[10px] font-medium text-slate-600">
                        {item.kondisiDisplay}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DRAWER DETAIL KORBAN UNTUK AUDIT ── */}
      {selectedVictimForDrawer && (
        <VictimDetailDrawer
          isOpen={!!selectedVictimForDrawer}
          onClose={() => setSelectedVictimForDrawer(null)}
          victim={selectedVictimForDrawer}
        />
      )}
    </div>
  );
}

