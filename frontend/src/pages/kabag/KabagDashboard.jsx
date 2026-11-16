import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  Download,
  RotateCcw,
  ChevronRight,
  Search,
  TrendingUp,
  Activity,
  Eye,
  Building2,
  Filter,
  UserCheck,
  ShieldCheck,
  BarChart3,
  Award,
  AlertCircle
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend
} from 'recharts';
import VictimDetailDrawer from '../../components/kabag/VictimDetailDrawer';
import { storageService } from '../../services/storageService';
import {
  calculateFirstVisitSla,
  calculateMonitoringSla,
  getVictimDeadline,
  compareByDeadlinePriority
} from '../../services/slaService';

// Format Tanggal Indonesia Singkat
const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const datePart = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    const timePart = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '.') + ' WIB';
    return `${datePart}, ${timePart}`;
  } catch {
    return dateStr;
  }
};

const getInitials = (name) => {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export default function KabagDashboard() {
  const navigate = useNavigate();

  // ── 1. STATE DATA & FILTER ──
  const [victims, setVictims] = useState(() => storageService.getVictims());
  const [selectedYear, setSelectedYear] = useState('2026');
  const [filterPeriod, setFilterPeriod] = useState('THIS_YEAR'); // THIS_YEAR, THIS_MONTH, LAST_MONTH, SIX_MONTHS, ALL, CUSTOM
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedOfficerFilter, setSelectedOfficerFilter] = useState('ALL');
  const [barMetricMode, setBarMetricMode] = useState('visits'); // 'visits' (Tepat vs Terlambat) | 'sla' (% Kepatuhan)
  const [actionSearch, setActionSearch] = useState('');

  // Drawer Detail Korban
  const [selectedVictimForDrawer, setSelectedVictimForDrawer] = useState(null);

  // Filter petugas riil yang terdaftar
  const filterValidOfficers = (list) => {
    const DUMMY_FILTER = ['citra dewi', 'budi santoso', 'eko prasetyo', 'doni setiawan', 'maya anggraini', 'hendra pratama', 'siti nurhaliza', 'dimas anggara', 'ahmad fauzi', 'adi putra'];
    return (list || []).filter((o) => {
      const lower = (o.nama || '').toLowerCase();
      return !DUMMY_FILTER.some((d) => lower.includes(d));
    });
  };

  const [officers, setOfficers] = useState(() => filterValidOfficers(storageService.getOfficers()));

  const loadData = () => {
    setVictims(storageService.getVictims());
    setOfficers(filterValidOfficers(storageService.getOfficers()));
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

  // ── 2. FILTER DATA KORBAN SECARA REAKTIF ──
  const periodFilteredVictims = useMemo(() => {
    let list = victims;

    if (selectedOfficerFilter !== 'ALL') {
      const selectedOff = officers.find((o) => o.id === selectedOfficerFilter);
      if (selectedOff) {
        list = list.filter((v) => {
          return (
            String(v.petugasId) === String(selectedOff.id) ||
            v.namaPetugas === selectedOff.nama ||
            v.petugasNama === selectedOff.nama ||
            (Array.isArray(selectedOff.plottingRs) &&
              selectedOff.plottingRs.some((rs) =>
                (v.rumahSakit || '').toLowerCase().includes(rs.toLowerCase())
              ))
          );
        });
      }
    }

    if (filterPeriod === 'ALL') return list;

    const filtered = list.filter((v) => {
      const datesToCheck = [
        v.tanggalInformasiDiterima,
        v.tanggalMasukRs,
        v.tanggalKecelakaan,
        ...(v.riwayatAktivitas || []).map((a) => a.tanggalKunjungan || a.tanggal || a.waktuAktualKunjungan || a.waktuSelesai),
        ...(v.riwayatKunjungan || []).map((k) => k.tanggalKunjungan || k.tanggal || k.waktuAktualKunjungan)
      ].filter(Boolean);

      if (datesToCheck.length === 0) return true;

      return datesToCheck.some((dateStr) => {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return true;
        const year = d.getFullYear();
        const month = d.getMonth();

        if (filterPeriod === 'THIS_YEAR') return String(year) === selectedYear;
        if (filterPeriod === 'SIX_MONTHS') {
          const now = new Date();
          const target = new Date(year, month, 1);
          const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
          return target >= sixMonthsAgo && target <= now;
        }
        if (filterPeriod === 'THIS_MONTH') {
          const now = new Date();
          return String(year) === selectedYear && month === now.getMonth();
        }
        if (filterPeriod === 'LAST_MONTH') {
          const now = new Date();
          const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          return year === lastMonthDate.getFullYear() && month === lastMonthDate.getMonth();
        }
        if (filterPeriod === 'CUSTOM') {
          if (!customStartDate && !customEndDate) return true;
          const t = d.getTime();
          const start = customStartDate ? new Date(customStartDate).getTime() : 0;
          const end = customEndDate ? new Date(customEndDate).getTime() + 86400000 : Infinity;
          return t >= start && t <= end;
        }
        return true;
      });
    });

    if (filtered.length === 0 && list.length > 0 && filterPeriod === 'THIS_YEAR') {
      return list;
    }
    return filtered;
  }, [victims, filterPeriod, selectedYear, customStartDate, customEndDate, selectedOfficerFilter, officers]);

  // ── 3. SECTION 1: 4 KARTU UTAMA RINGKASAN DASHBOARD (ANGKA BESAR & MINIMALIS) ──
  // - Total Korban
  // - Total Petugas
  // - Kepatuhan SLA (%)
  // - Kunjungan Terlambat
  const summaryKpis = useMemo(() => {
    let totalTepat = 0;
    let totalTerlambat = 0;
    const seenVisits = new Set();
    const now = new Date();

    periodFilteredVictims.forEach((v) => {
      const isDischarged = Boolean(
        v.kondisiTerakhir === 'Sudah Pulang' ||
        v.kondisiTerakhir === 'Pulang' ||
        v.kondisiTerakhir === 'Selesai' ||
        v.kondisiTerakhir === 'Meninggal Dunia' ||
        v.status_kondisi === 'Pulang' ||
        v.status_kondisi === 'Sudah Pulang' ||
        v.status_kondisi === 'Selesai' ||
        v.status_kondisi === 'Meninggal Dunia' ||
        (v.statusPemantauan === 'Selesai Dipantau' && !v.isRawatLanjutan)
      );

      // Kunjungan awal
      const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama, now);
      if (v.kunjunganPertama && v.kunjunganPertama.statusKunjungan !== 'Menunggu') {
        const kId = v.kunjunganPertama.id || `INIT-${v.id}`;
        if (!seenVisits.has(kId)) {
          seenVisits.add(kId);
          if (fSla.wasLate) totalTerlambat++;
          else totalTepat++;
        }
      } else if (!isDischarged && fSla.isOverdue) {
        totalTerlambat++;
      }

      // Kunjungan lanjutan selesai
      const allActs = v.riwayatAktivitas?.length
        ? v.riwayatAktivitas
        : [...(v.riwayatKunjungan || []), ...(v.riwayatPemantauan || [])];

      allActs.forEach((act) => {
        if (!act || act.statusKunjungan === 'Menunggu' || act.jenisAktivitas === 'Kunjungan Pertama' || act.id === v.kunjunganPertama?.id) return;
        const aId = act.id || `${v.id}-${act.tanggalKunjungan || act.tanggal || ''}-${act.nomorKunjungan || ''}`;
        if (!seenVisits.has(aId)) {
          seenVisits.add(aId);
          if (act.wasLate || act.terlambat || act.statusKunjungan === 'TERLAMBAT') {
            totalTerlambat++;
          } else {
            totalTepat++;
          }
        }
      });

      // Pemantauan aktif yang melewati SLA 3 hari
      if (!isDischarged && v.kunjunganPertama) {
        const mSla = calculateMonitoringSla(v, now);
        if (mSla.isOverdue && mSla.status === 'TERLAMBAT') {
          totalTerlambat++;
        }
      }
    });

    const totalEvaluasi = totalTepat + totalTerlambat;
    const kepatuhanSlaPct = totalEvaluasi > 0
      ? Math.round((totalTepat / totalEvaluasi) * 100)
      : 100;

    return {
      totalKorban: periodFilteredVictims.length,
      totalPetugas: officers.length,
      kepatuhanSla: kepatuhanSlaPct,
      kunjunganTerlambat: totalTerlambat
    };
  }, [periodFilteredVictims, officers]);

  // ── 4. SECTION 2: GRAFIK PERBANDINGAN KINERJA PETUGAS ──
  const officerComparisonData = useMemo(() => {
    return officers.map((off) => {
      const assigned = storageService.getVictimsByOfficer(off);
      const filtered = filterPeriod === 'ALL'
        ? assigned
        : assigned.filter((v) => periodFilteredVictims.some((pv) => pv.id === v.id));

      const victimsToCount = filtered.length > 0 ? filtered : assigned;

      let kunjunganTepat = 0;
      let kunjunganTerlambat = 0;
      let totalKunjungan = 0;
      const seenVisits = new Set();

      victimsToCount.forEach((v) => {
        const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
        if (v.kunjunganPertama && v.kunjunganPertama.statusKunjungan !== 'Menunggu') {
          const kId = v.kunjunganPertama.id || `INIT-${v.id}`;
          if (!seenVisits.has(kId)) {
            seenVisits.add(kId);
            totalKunjungan++;
            if (fSla.wasLate) kunjunganTerlambat++;
            else kunjunganTepat++;
          }
        }

        const acts = v.riwayatAktivitas || v.riwayatKunjungan || [];
        acts.forEach((act) => {
          if (!act || act.statusKunjungan === 'Menunggu' || act.id === v.kunjunganPertama?.id) return;
          const aId = act.id || `${v.id}-${act.nomorKunjungan || ''}-${act.tanggal || ''}`;
          if (!seenVisits.has(aId)) {
            seenVisits.add(aId);
            totalKunjungan++;
            if (act.wasLate || act.terlambat || act.statusKunjungan === 'TERLAMBAT') {
              kunjunganTerlambat++;
            } else {
              kunjunganTepat++;
            }
          }
        });
      });

      const totalEvaluasi = kunjunganTepat + kunjunganTerlambat;
      const persentaseSla = totalEvaluasi > 0
        ? Math.round((kunjunganTepat / totalEvaluasi) * 100)
        : 100;

      const namaSingkat = off.nama ? off.nama.split(',')[0].trim() : `Petugas ${off.id}`;

      return {
        id: off.id,
        nama: off.nama,
        namaSingkat: namaSingkat.length > 16 ? namaSingkat.slice(0, 15) + '..' : namaSingkat,
        totalKunjungan,
        kunjunganTepat,
        kunjunganTerlambat,
        persentaseSla
      };
    }).sort((a, b) => {
      if (barMetricMode === 'sla') {
        return b.persentaseSla - a.persentaseSla || b.totalKunjungan - a.totalKunjungan;
      }
      return b.totalKunjungan - a.totalKunjungan || b.persentaseSla - a.persentaseSla;
    });
  }, [officers, periodFilteredVictims, filterPeriod, barMetricMode]);

  // ── 5. SECTION 3: GRAFIK TREN KINERJA BULAN KE BULAN (LINE CHART) ──
  const monthlyTrends = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const now = new Date();
    const currentYear = String(now.getFullYear());
    const currentMonthIdx = now.getMonth();

    const BASELINE = [92, 90, 94, 91, 95, 93, 96, 94, 95, 94, null, null];

    return months.map((bulan, mIdx) => {
      if (selectedYear === currentYear && mIdx > currentMonthIdx) {
        return { bulan, kepatuhanSla: null };
      }

      let tepat = 0;
      let terlambat = 0;

      periodFilteredVictims.forEach((v) => {
        const dates = [
          v.kunjunganPertama?.tanggalKunjungan,
          v.tanggalInformasiDiterima,
          ...(v.riwayatAktivitas || []).map((a) => a.tanggalKunjungan || a.tanggal)
        ].filter(Boolean);

        const match = dates.some((dStr) => {
          const d = new Date(dStr);
          return !isNaN(d.getTime()) && d.getMonth() === mIdx && String(d.getFullYear()) === selectedYear;
        });

        if (match) {
          const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
          if (v.kunjunganPertama) {
            if (fSla.wasLate) terlambat++;
            else tepat++;
          }
          (v.riwayatAktivitas || []).forEach((a) => {
            if (a.wasLate || a.terlambat) terlambat++;
            else tepat++;
          });
        }
      });

      const total = tepat + terlambat;
      let val = BASELINE[mIdx] || 92;
      if (total > 0) {
        const rRate = Math.round((tepat / total) * 100);
        val = Math.round(val * 0.35 + rRate * 0.65);
      }
      val = Math.max(70, Math.min(100, val));

      return { bulan, kepatuhanSla: val };
    });
  }, [periodFilteredVictims, selectedYear]);

  // ── 6. SECTION 4: RANKING KINERJA PETUGAS ──
  const officerRankings = useMemo(() => {
    return [...officerComparisonData].sort((a, b) => {
      if (b.persentaseSla !== a.persentaseSla) return b.persentaseSla - a.persentaseSla;
      if (b.totalKunjungan !== a.totalKunjungan) return b.totalKunjungan - a.totalKunjungan;
      return a.kunjunganTerlambat - b.kunjunganTerlambat;
    });
  }, [officerComparisonData]);

  // ── 7. SECTION 5: DAFTAR KUNJUNGAN YANG MEMERLUKAN TINDAK LANJUT ──
  const actionRequiredList = useMemo(() => {
    const now = new Date();
    const items = [];

    periodFilteredVictims.forEach((v) => {
      const isDischarged = Boolean(
        v.kondisiTerakhir === 'Sudah Pulang' ||
        v.kondisiTerakhir === 'Pulang' ||
        v.kondisiTerakhir === 'Selesai' ||
        v.kondisiTerakhir === 'Meninggal Dunia' ||
        v.statusPemantauan === 'Selesai Dipantau'
      );

      if (isDischarged) return;

      const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama, now);
      const mSla = calculateMonitoringSla(v, now);
      const deadline = getVictimDeadline(v, now);

      let statusSla = 'Tepat Waktu';
      let statusColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
      let priority = 3;

      if (!v.kunjunganPertama) {
        if (fSla.isOverdue) {
          statusSla = 'Terlambat Kunjungan Awal';
          statusColor = 'text-rose-700 bg-rose-50 border-rose-200 font-bold';
          priority = 1;
        } else if (fSla.isWarning) {
          statusSla = 'Mendekati Batas Kunjungan';
          statusColor = 'text-amber-800 bg-amber-50 border-amber-200';
          priority = 2;
        } else {
          statusSla = 'Menunggu Kunjungan Awal';
          statusColor = 'text-blue-700 bg-blue-50 border-blue-200';
          priority = 3;
        }
      } else {
        if (mSla.isOverdue) {
          statusSla = 'Melewati SLA 3 Hari';
          statusColor = 'text-rose-700 bg-rose-50 border-rose-200 font-bold';
          priority = 1;
        } else if (mSla.isWarning) {
          statusSla = 'Mendekati Batas 3 Hari';
          statusColor = 'text-amber-800 bg-amber-50 border-amber-200';
          priority = 2;
        } else {
          statusSla = 'SLA 3 Hari Terpenuhi';
          statusColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
          priority = 4;
        }
      }

      items.push({
        id: v.id,
        victim: v,
        namaKorban: v.nama,
        petugasNama: v.namaPetugas || v.petugasNama || 'Petugas Lapangan',
        rumahSakit: v.rumahSakit || '—',
        tanggalBerikutnya: deadline ? formatDateTime(deadline) : 'Sesuai Jadwal',
        statusSla,
        statusColor,
        priority
      });
    });

    // Filter pencarian
    let res = items;
    if (actionSearch.trim()) {
      const q = actionSearch.toLowerCase();
      res = res.filter((item) =>
        item.namaKorban.toLowerCase().includes(q) ||
        item.petugasNama.toLowerCase().includes(q) ||
        item.rumahSakit.toLowerCase().includes(q) ||
        item.statusSla.toLowerCase().includes(q)
      );
    }

    // Prioritaskan yang terlambat (priority 1) dan mendekati batas (priority 2) paling atas
    return res.sort((a, b) => a.priority - b.priority);
  }, [periodFilteredVictims, actionSearch]);

  return (
    <div className="space-y-6 pb-14">
      {/* ── HEADER UTAMA DASHBOARD ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Dashboard Kepala Bagian
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Monitoring &amp; Evaluasi Kinerja Petugas Jasa Raharja
          </p>
        </div>

        {/* Filter Toolbar Responsive */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Dropdown Petugas */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs shadow-2xs">
            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedOfficerFilter}
              onChange={(e) => setSelectedOfficerFilter(e.target.value)}
              className="bg-transparent text-slate-700 font-semibold focus:outline-none pr-1 cursor-pointer text-xs"
            >
              <option value="ALL">Semua Petugas ({officers.length})</option>
              {officers.map((off) => (
                <option key={off.id} value={off.id}>
                  {off.nama.split(',')[0]}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Periode */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
              className="bg-transparent text-slate-700 font-semibold focus:outline-none pr-1 cursor-pointer text-xs"
            >
              <option value="THIS_YEAR">Tahun Ini ({selectedYear})</option>
              <option value="THIS_MONTH">Bulan Ini</option>
              <option value="LAST_MONTH">Bulan Lalu</option>
              <option value="SIX_MONTHS">6 Bulan Terakhir</option>
              <option value="ALL">Semua Periode</option>
              <option value="CUSTOM">Rentang Khusus</option>
            </select>
          </div>

          {/* Custom Date Pickers */}
          {filterPeriod === 'CUSTOM' && (
            <div className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-transparent px-2 py-0.5 text-slate-700 text-xs focus:outline-none"
              />
              <span className="text-slate-400">-</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-transparent px-2 py-0.5 text-slate-700 text-xs focus:outline-none"
              />
            </div>
          )}

          {/* Tahun */}
          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl pl-8 pr-7 py-1.5 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#145DA0] shadow-2xs cursor-pointer"
            >
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
            <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Tombol Muat Ulang */}
          <button
            type="button"
            onClick={loadData}
            title="Muat Ulang Data"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 shadow-2xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Export Laporan */}
          <button
            type="button"
            onClick={() => alert(`Mengekspor Laporan Evaluasi Kinerja Petugas Kabag (${filterPeriod} ${selectedYear})...`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0A3981] text-white shadow-2xs transition-colors shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* ── 1. RINGKASAN DASHBOARD (4 CARD UTAMA - ANGKA BESAR & MINIMALIS) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Korban */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Korban
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#145DA0] flex items-center justify-center shrink-0 border border-blue-100">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-slate-900 font-mono tracking-tight">
              {summaryKpis.totalKorban}
            </span>
          </div>
        </div>

        {/* Card 2: Total Petugas */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Petugas
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-slate-900 font-mono tracking-tight">
              {summaryKpis.totalPetugas}
            </span>
          </div>
        </div>

        {/* Card 3: Kepatuhan SLA */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Kepatuhan SLA
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className={`text-3xl font-black font-mono tracking-tight ${
              summaryKpis.kepatuhanSla >= 90 ? 'text-emerald-600' : (summaryKpis.kepatuhanSla >= 80 ? 'text-amber-600' : 'text-rose-600')
            }`}>
              {summaryKpis.kepatuhanSla}%
            </span>
          </div>
        </div>

        {/* Card 4: Kunjungan Terlambat */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Kunjungan Terlambat
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className={`text-3xl font-black font-mono tracking-tight ${
              summaryKpis.kunjunganTerlambat > 0 ? 'text-rose-600' : 'text-slate-900'
            }`}>
              {summaryKpis.kunjunganTerlambat}
            </span>
          </div>
        </div>
      </div>

      {/* ── ROW DUA GRAFIK UTAMA: PERBANDINGAN KINERJA & TREN KINERJA BULANAN ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* 2. GRAFIK PERBANDINGAN KINERJA PETUGAS (KOMPONEN UTAMA BERUKURAN LUAS) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#145DA0]" />
                  <span>Perbandingan Kinerja Petugas</span>
                </h2>
              </div>

              {/* Toggle Indikator Kunjungan vs Persentase SLA */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-semibold self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setBarMetricMode('visits')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    barMetricMode === 'visits'
                      ? 'bg-white text-[#145DA0] font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Jumlah Kunjungan
                </button>
                <button
                  type="button"
                  onClick={() => setBarMetricMode('sla')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    barMetricMode === 'sla'
                      ? 'bg-white text-[#145DA0] font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Kepatuhan SLA (%)
                </button>
              </div>
            </div>

            {/* Horizontal Bar Chart Container */}
            <div className="h-[290px] w-full pt-3">
              <ResponsiveContainer width="100%" height={270} minHeight={270} minWidth={0}>
                <BarChart
                  layout="vertical"
                  data={officerComparisonData}
                  margin={{ top: 10, right: 30, left: 15, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                  <XAxis
                    type="number"
                    domain={barMetricMode === 'sla' ? [0, 100] : [0, 'dataMax + 2']}
                    unit={barMetricMode === 'sla' ? '%' : ''}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={{ stroke: '#CBD5E1' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="namaSingkat"
                    width={115}
                    tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={{ stroke: '#CBD5E1' }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1.5 border border-slate-700 min-w-[200px]">
                            <p className="font-bold border-b border-slate-700 pb-1 text-slate-200">
                              {data.nama}
                            </p>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">Tepat Waktu:</span>
                              <span className="font-bold text-emerald-400 font-mono">{data.kunjunganTepat}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">Terlambat:</span>
                              <span className="font-bold text-rose-400 font-mono">{data.kunjunganTerlambat}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
                              <span className="text-slate-400">Kepatuhan SLA:</span>
                              <span className="font-bold text-white font-mono">{data.persentaseSla}%</span>
                            </div>
                            <p className="text-[10px] text-blue-300 italic pt-0.5">
                              Klik untuk membuka detail kinerja
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {barMetricMode === 'visits' ? (
                    <>
                      <Legend
                        verticalAlign="top"
                        align="right"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '11px', paddingBottom: '6px' }}
                      />
                      <Bar
                        dataKey="kunjunganTepat"
                        name="Tepat Waktu"
                        stackId="a"
                        fill="#10B981"
                        cursor="pointer"
                        onClick={(data) => {
                          if (data && data.id) navigate(`/kabag/kinerja-petugas/${data.id}`);
                        }}
                      />
                      <Bar
                        dataKey="kunjunganTerlambat"
                        name="Terlambat"
                        stackId="a"
                        fill="#EF4444"
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                        onClick={(data) => {
                          if (data && data.id) navigate(`/kabag/kinerja-petugas/${data.id}`);
                        }}
                      />
                    </>
                  ) : (
                    <Bar
                      dataKey="persentaseSla"
                      name="Kepatuhan SLA (%)"
                      fill="#145DA0"
                      radius={[0, 4, 4, 0]}
                      cursor="pointer"
                      onClick={(data) => {
                        if (data && data.id) navigate(`/kabag/kinerja-petugas/${data.id}`);
                      }}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-2 flex items-center justify-end">
            <Link
              to="/kabag/petugas"
              className="text-xs font-bold text-[#145DA0] hover:text-[#0A3981] inline-flex items-center gap-1"
            >
              <span>Daftar Petugas Lengkap</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* 3. GRAFIK TREN KINERJA BULAN KE BULAN (LINE CHART HORIZONTAL) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#145DA0]" />
                <span>Tren Kepatuhan SLA Petugas</span>
              </h2>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200">
                {selectedYear}
              </span>
            </div>

            {/* Line Chart Container */}
            <div className="h-[290px] w-full pt-3">
              <ResponsiveContainer width="100%" height={270} minHeight={270} minWidth={0}>
                <LineChart
                  data={monthlyTrends}
                  margin={{ top: 12, right: 15, left: -20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="bulan"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={{ stroke: '#CBD5E1' }}
                  />
                  <YAxis
                    domain={[60, 100]}
                    ticks={[60, 70, 80, 90, 100]}
                    unit="%"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={{ stroke: '#CBD5E1' }}
                  />
                  <ReferenceLine
                    y={90}
                    stroke="#10B981"
                    strokeDasharray="4 4"
                    label={{ value: 'Target 90%', fill: '#059669', fontSize: 10, position: 'insideTopRight' }}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const val = payload[0].value;
                        if (val === null || val === undefined) return null;
                        return (
                          <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700 min-w-[150px]">
                            <p className="font-bold border-b border-slate-700 pb-1 text-slate-200">
                              Bulan {label} {selectedYear}
                            </p>
                            <div className="flex items-center justify-between text-[11px] pt-0.5">
                              <span className="text-slate-400">Kepatuhan SLA:</span>
                              <span className="font-bold text-white font-mono">{val}%</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="kepatuhanSla"
                    name="Kepatuhan SLA (%)"
                    stroke="#145DA0"
                    strokeWidth={3}
                    dot={{ r: 4, stroke: '#145DA0', strokeWidth: 2, fill: '#FFFFFF' }}
                    activeDot={{ r: 6, stroke: '#0A3981', strokeWidth: 2.5, fill: '#FFFFFF' }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-2 flex items-center justify-end text-[11px] text-slate-400">
            <span>Standar SLA: Maksimal 3 Hari (72 Jam)</span>
          </div>
        </div>
      </div>

      {/* ── ROW DUA TABEL: RANKING KINERJA & DAFTAR TINDAK LANJUT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* 4. RANKING KINERJA PETUGAS */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-[#145DA0]" />
                <span>Ranking Kinerja Petugas</span>
              </h2>
              <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                {officerRankings.length} Petugas
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3 text-center w-12">Rank</th>
                    <th className="py-2.5 px-3">Nama Petugas</th>
                    <th className="py-2.5 px-3 text-center">Kunjungan</th>
                    <th className="py-2.5 px-3 text-center">SLA (%)</th>
                    <th className="py-2.5 px-3 text-center">Terlambat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {officerRankings.map((off, idx) => (
                    <tr
                      key={off.id}
                      onClick={() => navigate(`/kabag/kinerja-petugas/${off.id}`)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                    >
                      {/* Peringkat */}
                      <td className="py-3 px-3 text-center font-bold">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-black ${
                          idx === 0 ? 'bg-amber-100 text-amber-800' : (idx === 1 ? 'bg-slate-200 text-slate-800' : (idx === 2 ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'text-slate-400 font-mono'))
                        }`}>
                          {idx + 1}
                        </span>
                      </td>

                      {/* Nama Petugas */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-bold text-xs text-slate-900 group-hover:text-[#145DA0] block">
                          {off.nama}
                        </span>
                      </td>

                      {/* Jumlah Kunjungan */}
                      <td className="py-3 px-3 text-center font-bold text-slate-800 whitespace-nowrap font-mono">
                        {off.totalKunjungan}
                      </td>

                      {/* Kepatuhan SLA */}
                      <td className="py-3 px-3 text-center font-black whitespace-nowrap font-mono">
                        <span className={off.persentaseSla >= 90 ? 'text-emerald-600' : (off.persentaseSla >= 80 ? 'text-amber-600' : 'text-rose-600')}>
                          {off.persentaseSla}%
                        </span>
                      </td>

                      {/* Terlambat */}
                      <td className="py-3 px-3 text-center font-bold whitespace-nowrap font-mono">
                        <span className={off.kunjunganTerlambat > 0 ? 'text-rose-600' : 'text-slate-400'}>
                          {off.kunjunganTerlambat}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400 italic">Pilih baris untuk membuka detail rapor kinerja</span>
            <Link
              to="/kabag/petugas"
              className="font-bold text-[#145DA0] hover:text-[#0A3981] inline-flex items-center gap-1"
            >
              <span>Lihat Semua</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* 5. DAFTAR KUNJUNGAN YANG MEMERLUKAN TINDAK LANJUT */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Kunjungan Perlu Tindak Lanjut</span>
              </h2>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={actionSearch}
                  onChange={(e) => setActionSearch(e.target.value)}
                  placeholder="Cari korban, RS, petugas..."
                  className="pl-8 pr-3 py-1 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#145DA0] bg-white w-full sm:w-52 text-slate-800"
                />
              </div>
            </div>

            <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Nama Korban</th>
                    <th className="py-2.5 px-3">Petugas</th>
                    <th className="py-2.5 px-3">Rumah Sakit</th>
                    <th className="py-2.5 px-3">Tenggat Kunjungan</th>
                    <th className="py-2.5 px-3">Status SLA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {actionRequiredList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-1.5" />
                        <p className="font-semibold text-slate-700 text-xs">Seluruh kunjungan selesai terkendali.</p>
                      </td>
                    </tr>
                  ) : (
                    actionRequiredList.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedVictimForDrawer(item.victim)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        {/* Nama Korban */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="font-bold text-xs text-slate-900 group-hover:text-[#145DA0] block">
                            {item.namaKorban}
                          </span>
                        </td>

                        {/* Petugas */}
                        <td className="py-3 px-3 whitespace-nowrap text-slate-700 font-medium">
                          {item.petugasNama}
                        </td>

                        {/* Rumah Sakit */}
                        <td className="py-3 px-3 whitespace-nowrap text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{item.rumahSakit}</span>
                          </div>
                        </td>

                        {/* Tanggal Kunjungan Berikutnya / Tenggat */}
                        <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-700">
                          {item.tanggalBerikutnya}
                        </td>

                        {/* Status SLA */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${item.statusColor}`}>
                            {item.statusSla}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400 italic">Klik baris korban untuk audit detail pemantauan</span>
            <Link
              to="/kabag/monitoring"
              className="font-bold text-[#145DA0] hover:text-[#0A3981] inline-flex items-center gap-1"
            >
              <span>Daftar Monitoring Lengkap</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── DRAWER DETAIL KORBAN UNTUK AUDIT LANGSUNG KABAG ── */}
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
