import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { storageService } from '../../services/storageService';
import {
  calculateFirstVisitSla,
  calculateMonitoringSla,
  getVictimDeadline,
  compareVictimsBySlaPriority
} from '../../services/slaService';
import { isVictimFinished } from '../../utils/monitoringStatus';
import { formatDateIndo } from '../../utils/dateUtils';
import { getReferralPerspectiveInfo, matchesHospitalFilter } from '../../utils/referralUtils';
import VictimDetailDrawer from '../../components/kabag/VictimDetailDrawer';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Building2,
  Calendar,
  Eye,
  RotateCcw,
  Users,
  Clock,
  HeartPulse,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  User,
  ArrowUpDown
} from 'lucide-react';

function formatDateShort(dateStr) {
  return formatDateIndo(dateStr);
}

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const PAGE_SIZE = 8;

export default function KabagVictimList() {
  const [victims, setVictims] = useState([]);
  const [search, setSearch] = useState('');
  const [officerFilter, setOfficerFilter] = useState('ALL');
  const [hospitalFilter, setHospitalFilter] = useState('ALL');
  const [conditionFilter, setConditionFilter] = useState('ALL');
  const [monitoringStatusFilter, setMonitoringStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('SLA_PRIORITY'); // SLA_PRIORITY, NEWEST, OLDEST, NAME

  const [currentPage, setCurrentPage] = useState(1);
  const [selectedVictim, setSelectedVictim] = useState(null);

  const filterValidOfficers = (list) => {
    const DUMMY_FILTER = ['citra dewi', 'budi santoso', 'eko prasetyo', 'doni setiawan', 'maya anggraini', 'hendra pratama', 'siti nurhaliza', 'dimas anggara', 'ahmad fauzi', 'adi putra'];
    return (list || []).filter((o) => {
      const lower = (o.nama || '').toLowerCase();
      return !DUMMY_FILTER.some((d) => lower.includes(d));
    });
  };

  const [officers, setOfficers] = useState(() => filterValidOfficers(storageService.getOfficers()));

  const loadData = () => {
    const data = storageService.getVictims();
    setVictims(data);
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
  const hospitals = useMemo(() => {
    return Array.from(new Set(victims.map((v) => v.rumahSakit))).filter(Boolean);
  }, [victims]);

  // Statistik Ringkasan Korban
  const stats = useMemo(() => {
    const total = victims.length;
    let masihDirawat = 0;
    let selesaiPulang = 0;
    let rujukan = 0;
    let meninggal = 0;

    victims.forEach((v) => {
      const isDone = isVictimFinished(v);

      const isReferred =
        !v.isRawatLanjutan &&
        !v.rawatLanjutanDariPulang &&
        v.statusPerawatan !== 'Rawat Lanjutan' &&
        ((typeof v.kondisiTerakhir === 'string' && v.kondisiTerakhir.startsWith('Dirujuk')) ||
         (typeof v.statusPemantauan === 'string' && v.statusPemantauan.startsWith('Dirujuk')) ||
         v.statusPerawatan === 'Rujukan' ||
         (Array.isArray(v.riwayatRujukan) && v.riwayatRujukan.length > 0));

      if (v.kondisiTerakhir === 'Meninggal Dunia' || Boolean(v.tanggalMeninggal)) {
        meninggal++;
      } else if (isDone) {
        selesaiPulang++;
      } else if (isReferred) {
        rujukan++;
      } else {
        masihDirawat++;
      }
    });

    return { total, masihDirawat, selesaiPulang, rujukan, meninggal };
  }, [victims]);

  // Helper evaluasi urgensi SLA: Terlambat = Tier 1 (Paling Atas), Mendekati = Tier 2
  const getSlaUrgencyTier = (v, now = new Date()) => {
    const isDone = isVictimFinished(v);

    if (isDone) return { tier: 5, hoursRemaining: Infinity };

    const firstVisitPending = !v.kunjunganPertama && (!v.riwayatKunjungan || v.riwayatKunjungan.length === 0);
    if (firstVisitPending) {
      const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama, now);
      if (fSla.isOverdue) {
        return { tier: 1, hoursRemaining: -(Math.abs(fSla.diffHours) || 1) }; // Terlambat -> Tier 1 (PALING ATAS)
      }
      if (fSla.isWarning) {
        return { tier: 2, hoursRemaining: fSla.diffHours || 1 }; // Mendekati tenggat -> Tier 2
      }
      return { tier: 3, hoursRemaining: fSla.diffHours || 72 };
    }

    const mSla = calculateMonitoringSla(v, now);
    if (mSla.isOverdue) {
      return { tier: 1, hoursRemaining: -(mSla.elapsedHours || 1) }; // Terlambat -> Tier 1 (PALING ATAS)
    }
    if (mSla.isWarning) {
      return { tier: 2, hoursRemaining: mSla.hoursRemaining || 1 }; // Mendekati tenggat -> Tier 2
    }
    return { tier: 4, hoursRemaining: mSla.hoursRemaining || 72 };
  };

  // Filtered & Sorted
  const filteredAndSorted = useMemo(() => {
    const now = new Date();

    let result = victims.filter((v) => {
      const matchSearch =
        (v.nama || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.id || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.nik || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.nomorLaporan || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.rumahSakit || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.namaPetugas || '').toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;

      if (officerFilter !== 'ALL') {
        const targetOfficer = officers.find((o) => o.id === officerFilter) || officerFilter;
        if (!storageService.isOfficerAssignedToVictim(targetOfficer, v, officers)) return false;
      }

      if (hospitalFilter !== 'ALL') {
        if (!matchesHospitalFilter(v, hospitalFilter)) return false;
      }

      if (conditionFilter !== 'ALL') {
        if (conditionFilter === 'Dirawat' && !(v.kondisiTerakhir === 'Masih Dirawat' || v.kondisiTerakhir === 'Rawat Inap')) return false;
        if (conditionFilter === 'Pulang' && !(v.kondisiTerakhir === 'Sudah Pulang' || v.kondisiTerakhir === 'Pulang' || v.statusPemantauan === 'Selesai Dipantau')) return false;
        if (conditionFilter === 'Dirujuk' && !((v.kondisiTerakhir || '').startsWith('Dirujuk') || v.statusPerawatan === 'Rujukan')) return false;
        if (conditionFilter === 'Meninggal' && v.kondisiTerakhir !== 'Meninggal Dunia') return false;
      }

      if (monitoringStatusFilter !== 'ALL') {
        const isDone =
          v.kondisiTerakhir === 'Sudah Pulang' ||
          v.kondisiTerakhir === 'Pulang' ||
          v.kondisiTerakhir === 'Selesai' ||
          v.statusPemantauan === 'Selesai Dipantau';
        const isPending = !v.kunjunganPertama && (!v.riwayatKunjungan || v.riwayatKunjungan.length === 0);

        if (monitoringStatusFilter === 'SELESAI' && !isDone) return false;
        if (monitoringStatusFilter === 'BELUM' && !isPending) return false;
        if (monitoringStatusFilter === 'AKTIF' && (isDone || isPending)) return false;
      }

      return true;
    });

    // PENGURUTAN: Default adalah SLA_PRIORITY (Terlambat & Mendekati Tenggat langsung teratas)
    result.sort((a, b) => {
      if (sortBy === 'SLA_PRIORITY') {
        return compareVictimsBySlaPriority(a, b, now);
      }
      if (sortBy === 'NEWEST') {
        const tA = new Date(a.tanggalMasukRs || a.tanggalInformasiDiterima || 0).getTime();
        const tB = new Date(b.tanggalMasukRs || b.tanggalInformasiDiterima || 0).getTime();
        return tB - tA;
      }
      if (sortBy === 'OLDEST') {
        const tA = new Date(a.tanggalMasukRs || a.tanggalInformasiDiterima || 0).getTime();
        const tB = new Date(b.tanggalMasukRs || b.tanggalInformasiDiterima || 0).getTime();
        return tA - tB;
      }
      if (sortBy === 'NAME') {
        return (a.nama || '').localeCompare(b.nama || '');
      }
      return 0;
    });

    return result;
  }, [victims, search, officerFilter, hospitalFilter, conditionFilter, monitoringStatusFilter, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSorted.length / PAGE_SIZE) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAndSorted.slice(start, start + PAGE_SIZE);
  }, [filteredAndSorted, currentPage]);

  const handleResetFilters = () => {
    setSearch('');
    setOfficerFilter('ALL');
    setHospitalFilter('ALL');
    setConditionFilter('ALL');
    setMonitoringStatusFilter('ALL');
    setSortBy('SLA_PRIORITY');
    setCurrentPage(1);
  };

  const getOfficerInfo = (v) => {
    const vRs = (v.rumahSakit || '').toLowerCase().trim();
    const matchedByPlotting = officers.find((o) =>
      o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some((rs) => {
        const r1 = (rs || '').toLowerCase().trim();
        return r1 === vRs || (vRs.length >= 4 && (r1.includes(vRs) || vRs.includes(r1)));
      })
    );
    const assignedOfficer = officers.find((o) =>
      String(o.id) === String(v.petugasId) ||
      (o.nama && (o.nama === v.namaPetugas || o.nama === v.petugasNama || o.nama === v.petugas))
    );
    const officerObj = assignedOfficer || matchedByPlotting;
    const candidates = [
      assignedOfficer?.nama,
      matchedByPlotting?.nama,
      v.namaPetugas,
      v.petugasNama,
      v.petugas
    ];
    let name = 'Belum ada Petugas';
    for (const c of candidates) {
      if (c && c !== 'Mobile Service' && c !== 'Petugas Lapangan' && c !== 'Belum Ditugaskan' && c !== 'Belum Ada Petugas Penanggung Jawab' && c !== 'Belum ada Petugas') {
        name = c;
        break;
      }
    }
    return { name, id: officerObj?.id || (name !== 'Belum ada Petugas' ? v.petugasId : null) };
  };

  const renderStatusBadge = (v) => {
    const isDischarged =
      v.kondisiTerakhir === 'Sudah Pulang' ||
      v.kondisiTerakhir === 'Pulang' ||
      v.kondisiTerakhir === 'Selesai' ||
      v.statusPemantauan === 'Selesai Dipantau';

    const isReferred =
      !v.isRawatLanjutan &&
      !v.rawatLanjutanDariPulang &&
      v.statusPerawatan !== 'Rawat Lanjutan' &&
      ((typeof v.kondisiTerakhir === 'string' && v.kondisiTerakhir.startsWith('Dirujuk')) ||
       (typeof v.statusPemantauan === 'string' && v.statusPemantauan.startsWith('Dirujuk')) ||
       v.statusPerawatan === 'Rujukan' ||
       (Array.isArray(v.riwayatRujukan) && v.riwayatRujukan.length > 0));

    if (v.kondisiTerakhir === 'Meninggal Dunia' || Boolean(v.tanggalMeninggal)) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          <span>MD (Meninggal Dunia)</span>
        </span>
      );
    }

    if (isDischarged) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>Sudah Pulang</span>
        </span>
      );
    }

    if (isReferred) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          <span>Dirujuk</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#145DA0] bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
        <span className="w-1.5 h-1.5 rounded-full bg-[#145DA0]"></span>
        <span>Masih Dirawat</span>
      </span>
    );
  };

  const renderMonitoringStatus = (v) => {
    const isDone =
      v.kondisiTerakhir === 'Sudah Pulang' ||
      v.kondisiTerakhir === 'Pulang' ||
      v.kondisiTerakhir === 'Selesai' ||
      v.kondisiTerakhir === 'Meninggal Dunia' ||
      v.statusPemantauan === 'Selesai Dipantau';
    const isPending = !v.kunjunganPertama && (!v.riwayatKunjungan || v.riwayatKunjungan.length === 0);

    const now = new Date();
    const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama, now);
    const mSla = calculateMonitoringSla(v, now);

    if (isDone) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
          <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
          <span>Selesai Dipantau</span>
        </span>
      );
    }

    if (fSla.isWarning || mSla.isWarning) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
          <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
          <span>Mendekati Tenggat SLA</span>
        </span>
      );
    }

    if (fSla.isOverdue || mSla.isOverdue) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
          <span>Melewati Batas SLA</span>
        </span>
      );
    }

    if (isPending) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700">
          <Clock className="w-3.5 h-3.5 text-blue-500" />
          <span>Menunggu Kunjungan Awal</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
        <HeartPulse className="w-3.5 h-3.5 text-emerald-600" />
        <span>Pemantauan Rutin Aktif</span>
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-14">
      {/* ── 1. HEADER HALAMAN ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Daftar Korban
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Menampilkan seluruh data korban kecelakaan, rumah sakit perawatan, petugas penanggung jawab, kondisi terakhir, dan status pemantauan.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* ── 2. SUMMARY KPI STAT CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Korban */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Korban</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#145DA0] border border-blue-100 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-slate-900 block mt-2">
            {stats.total}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">Semua data korban tercatat</span>
        </div>

        {/* Masih Dirawat */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Masih Dirawat</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#145DA0] border border-blue-100 flex items-center justify-center shrink-0">
              <HeartPulse className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-[#145DA0] block mt-2">
            {stats.masihDirawat}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">Rawat inap di rumah sakit</span>
        </div>

        {/* Selesai / Pulang */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sudah Pulang</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-emerald-600 block mt-2">
            {stats.selesaiPulang}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">Pemantauan selesai</span>
        </div>

        {/* Dirujuk / Lanjutan */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dirujuk / Lanjutan</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-purple-600 block mt-2">
            {stats.rujukan}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">Rujukan fasilitas kesehatan</span>
        </div>
      </div>

      {/* ── 3. FILTER DAN PENCARIAN ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Pencarian */}
          <div className="relative">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Pencarian Korban
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Cari nama, RS, NIK..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
              />
            </div>
          </div>

          {/* Filter Rumah Sakit */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Rumah Sakit
            </label>
            <select
              value={hospitalFilter}
              onChange={(e) => {
                setHospitalFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Rumah Sakit</option>
              {hospitals.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          {/* Filter Petugas */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Petugas Penanggung Jawab
            </label>
            <select
              value={officerFilter}
              onChange={(e) => {
                setOfficerFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Petugas Lapangan</option>
              {officers.map((off) => (
                <option key={off.id} value={off.id}>{off.nama}</option>
              ))}
            </select>
          </div>

          {/* Filter Kondisi Pasien */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Kondisi Terakhir
            </label>
            <select
              value={conditionFilter}
              onChange={(e) => {
                setConditionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Kondisi</option>
              <option value="Dirawat">Masih Dirawat</option>
              <option value="Pulang">Sudah Pulang</option>
              <option value="Dirujuk">Dirujuk</option>
              <option value="Meninggal">Meninggal Dunia</option>
            </select>
          </div>

          {/* Urutkan */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Urutan Prioritas
            </label>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-700 font-semibold focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="SLA_PRIORITY">Mendekati Tenggat SLA Teratas</option>
              <option value="NEWEST">Tanggal Masuk Terbaru</option>
              <option value="OLDEST">Tanggal Masuk Terlama</option>
              <option value="NAME">Nama Korban (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Filter Summary & Reset */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
          <span>
            Menampilkan <strong>{filteredAndSorted.length}</strong> dari <strong>{victims.length}</strong> data korban
          </span>
          {(search || officerFilter !== 'ALL' || hospitalFilter !== 'ALL' || conditionFilter !== 'ALL' || monitoringStatusFilter !== 'ALL' || sortBy !== 'SLA_PRIORITY') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-[#145DA0] font-semibold hover:underline cursor-pointer"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* ── 4. TABEL DAFTAR KORBAN ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* DESKTOP TABLE */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/90 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4 w-12 text-center">NO.</th>
                <th className="py-3.5 px-4">KORBAN & IDENTITAS</th>
                <th className="py-3.5 px-4">RUMAH SAKIT</th>
                <th className="py-3.5 px-4">PETUGAS PENANGGUNG JAWAB</th>
                <th className="py-3.5 px-4">TANGGAL MASUK RS</th>
                <th className="py-3.5 px-4">KONDISI TERAKHIR</th>
                <th className="py-3.5 px-4">STATUS PEMANTAUAN</th>
                <th className="py-3.5 px-4 text-right">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">Tidak ada data korban yang sesuai.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Ubah kata kunci atau reset filter pencarian di atas.</p>
                  </td>
                </tr>
              ) : (
                paginatedData.map((v, idx) => {
                  const number = String((currentPage - 1) * PAGE_SIZE + idx + 1).padStart(2, '0');
                  const initials = getInitials(v.nama);
                  const officerInfo = getOfficerInfo(v);
                  const refInfo = getReferralPerspectiveInfo(v, hospitalFilter);

                  return (
                    <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* NO */}
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-center font-medium">
                        {number}
                      </td>

                      {/* KORBAN & IDENTITAS */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-[#145DA0] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                            <User className="w-4 h-4 text-[#145DA0]" />
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => setSelectedVictim(v)}
                              className="font-bold text-slate-900 hover:text-[#145DA0] hover:underline block text-xs text-left cursor-pointer"
                            >
                              {v.nama}
                            </button>
                            <span className="text-[10px] text-slate-400 font-mono font-normal block">
                              {v.nik ? `NIK: ${v.nik}` : (v.nomorLaporan || `ID: ${v.id}`)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* RUMAH SAKIT (Sesuai Sudut Pandang Penangan) */}
                      <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{refInfo.displayHospital}</span>
                        </div>
                        {v.alamatRs && (
                          <span className="text-[10px] text-slate-400 block truncate max-w-[180px] mt-0.5">
                            {v.alamatRs}
                          </span>
                        )}
                      </td>

                      {/* PETUGAS -> Clickable Link ke Detail Kinerja Petugas */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {officerInfo.name === 'Belum ada Petugas' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>Belum ada Petugas</span>
                          </span>
                        ) : officerInfo.id ? (
                          <Link
                            to={`/kabag/kinerja?tab=detail&officerId=${officerInfo.id}`}
                            className="font-semibold text-slate-800 hover:text-[#145DA0] hover:underline block text-xs"
                            title="Buka Evaluasi Kinerja Petugas Ini"
                          >
                            {officerInfo.name}
                          </Link>
                        ) : (
                          <span className="font-semibold text-slate-800 block text-xs">
                            {officerInfo.name}
                          </span>
                        )}
                        {officerInfo.name !== 'Belum ada Petugas' && (
                          <span className="text-[10px] text-slate-400 block">
                            Petugas Lapangan
                          </span>
                        )}
                      </td>

                      {/* TANGGAL MASUK */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatDateShort(v.tanggalMasukRs || v.tanggalInformasiDiterima)}</span>
                        </div>
                      </td>

                      {/* KONDISI */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusBadge(v)}
                      </td>

                      {/* STATUS PEMANTAUAN */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderMonitoringStatus(v)}
                      </td>

                      {/* AKSI */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedVictim(v)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#145DA0] bg-blue-50/80 hover:bg-blue-100 hover:text-[#0A3981] transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Detail</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARD VIEW */}
        <div className="md:hidden divide-y divide-slate-100">
          {paginatedData.length === 0 ? (
            <div className="py-12 text-center text-slate-400 px-4">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-600 text-xs">Tidak ada korban yang sesuai.</p>
            </div>
          ) : (
            paginatedData.map((v, idx) => {
              const number = String((currentPage - 1) * PAGE_SIZE + idx + 1).padStart(2, '0');
              const initials = getInitials(v.nama);
              const officerInfo = getOfficerInfo(v);
              const refInfo = getReferralPerspectiveInfo(v, hospitalFilter);

              return (
                <div key={v.id} className="p-4 space-y-3 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-blue-50 text-[#145DA0] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                        <User className="w-4 h-4 text-[#145DA0]" />
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-slate-400">#{number}</span>
                        <h4 className="font-bold text-slate-900 text-xs leading-tight">
                          {v.nama}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {v.nik ? `NIK: ${v.nik}` : (v.nomorLaporan || v.id)}
                        </span>
                      </div>
                    </div>
                    {renderStatusBadge(v)}
                  </div>

                  <div className="bg-slate-50 rounded-xl p-2.5 space-y-1.5 text-[11px] border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Rumah Sakit:</span>
                      <div className="text-right">
                        <strong className="text-slate-800 truncate block max-w-[170px]">{refInfo.displayHospital}</strong>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Petugas Penanggung Jawab:</span>
                      {officerInfo.id ? (
                        <Link
                          to={`/kabag/kinerja?tab=detail&officerId=${officerInfo.id}`}
                          className="font-semibold text-[#145DA0] hover:underline"
                        >
                          {officerInfo.name}
                        </Link>
                      ) : (
                        <span className="font-semibold text-slate-700">{officerInfo.name}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Tgl Masuk RS:</span>
                      <span className="text-slate-600">{formatDateShort(v.tanggalMasukRs || v.tanggalInformasiDiterima)}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                      <span className="text-slate-400">Status Pemantauan:</span>
                      <div>{renderMonitoringStatus(v)}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedVictim(v)}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#145DA0] bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat Detail Korban</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* PAGINATION */}
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-slate-50/50">
          <span className="text-slate-500 text-[11px]">
            Halaman <strong>{currentPage}</strong> dari <strong>{totalPages}</strong> ({filteredAndSorted.length} total korban)
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 font-mono font-bold text-slate-700 text-xs">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
              title="Halaman Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── 5. DRAWER DETAIL KORBAN ── */}
      {selectedVictim && (
        <VictimDetailDrawer
          victim={selectedVictim}
          isOpen={Boolean(selectedVictim)}
          onClose={() => setSelectedVictim(null)}
          onUpdate={loadData}
        />
      )}
    </div>
  );
}
