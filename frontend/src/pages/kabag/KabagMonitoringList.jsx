import React, { useState, useEffect, useMemo } from 'react';
import { storageService } from '../../services/storageService';
import { 
  calculateFirstVisitSla, 
  calculateMonitoringSla,
  getVictimDeadline,
  compareByDeadlinePriority 
} from '../../services/slaService';
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
  AlertTriangle
} from 'lucide-react';

function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const PAGE_SIZE = 8;

export default function KabagMonitoringList() {
  const [victims, setVictims] = useState([]);
  const [search, setSearch] = useState('');
  const [officerFilter, setOfficerFilter] = useState('ALL');
  const [hospitalFilter, setHospitalFilter] = useState('ALL');
  const [conditionFilter, setConditionFilter] = useState('ALL');
  const [slaFilter, setSlaFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('TENGGAT_PRIORITAS'); // TENGGAT_PRIORITAS, NEWEST, OLDEST, NAME, SLA_URGENT

  const [currentPage, setCurrentPage] = useState(1);
  const [selectedVictim, setSelectedVictim] = useState(null);

  const filterValidOfficers = (list) => {
    const DUMMY_FILTER = ['citra dewi', 'budi santoso', 'eko prasetyo', 'doni setiawan', 'maya anggraini', 'hendra pratama', 'siti nurhaliza', 'dimas anggara', 'ahmad fauzi', 'adi putra'];
    return (list || []).filter((o) => {
      const lower = (o.nama || '').toLowerCase();
      return !DUMMY_FILTER.some((d) => lower.includes(d));
    });
  };

  const loadData = () => {
    const data = storageService.getVictims();
    setVictims(data);
  };

  useEffect(() => {
    storageService.syncWithBackend(true).catch(() => {});
    loadData();
    window.addEventListener('jr_victims_updated', loadData);
    return () => window.removeEventListener('jr_victims_updated', loadData);
  }, []);

  // Filter lists
  const officers = useMemo(() => filterValidOfficers(storageService.getOfficers()), []);
  const hospitals = useMemo(() => {
    const list = Array.from(new Set(victims.map((v) => v.rumahSakit))).filter(Boolean);
    return list;
  }, [victims]);

  // Top KPI Stats
  const stats = useMemo(() => {
    const total = victims.length;
    let belumDikunjungi = 0;
    let pemantauanAktif = 0;
    let selesai = 0;

    victims.forEach((v) => {
      const isDone =
        v.kondisiTerakhir === 'Sudah Pulang' ||
        v.kondisiTerakhir === 'Pulang' ||
        v.kondisiTerakhir === 'Selesai' ||
        v.statusPemantauan === 'Selesai Dipantau';

      if (isDone) {
        selesai++;
      } else if (!v.kunjunganPertama && (!v.riwayatKunjungan || v.riwayatKunjungan.length === 0)) {
        belumDikunjungi++;
      } else {
        pemantauanAktif++;
      }
    });

    return { total, belumDikunjungi, pemantauanAktif, selesai };
  }, [victims]);

  // Filtered & Sorted Data
  const filteredAndSorted = useMemo(() => {
    let result = victims.filter((v) => {
      const firstVisitSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
      const matchSearch =
        (v.nama || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.id || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.nomorLaporan || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.rumahSakit || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.namaPetugas || '').toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;
      if (officerFilter !== 'ALL') {
        const targetOfficer = officers.find((o) => o.id === officerFilter) || officerFilter;
        if (!storageService.isOfficerAssignedToVictim(targetOfficer, v, officers)) return false;
      }
      if (hospitalFilter !== 'ALL') {
        const hLow = hospitalFilter.toLowerCase().trim();
        const vRsLow = (v.rumahSakit || '').toLowerCase().trim();
        const matchHospital = vRsLow === hLow || (hLow.length >= 4 && (vRsLow.includes(hLow) || hLow.includes(vRsLow)));
        if (!matchHospital) return false;
      }
      
      if (conditionFilter !== 'ALL') {
        if (conditionFilter === 'Pulang' && !(v.kondisiTerakhir === 'Sudah Pulang' || v.kondisiTerakhir === 'Pulang' || v.statusPemantauan === 'Selesai Dipantau')) return false;
        if (conditionFilter === 'Dirawat' && !(v.kondisiTerakhir === 'Masih Dirawat' || v.kondisiTerakhir === 'Rawat Inap')) return false;
        if (conditionFilter === 'Dirujuk' && !((v.kondisiTerakhir || '').startsWith('Dirujuk') || v.statusPerawatan === 'Rujukan')) return false;
        if (conditionFilter === 'Meninggal' && v.kondisiTerakhir !== 'Meninggal Dunia') return false;
      }

      if (slaFilter !== 'ALL') {
        if (slaFilter === 'OVERDUE' && firstVisitSla.status !== 'TERLAMBAT') return false;
        if (slaFilter === 'WARNING' && firstVisitSla.status !== 'MENDEKATI_TENGGAT') return false;
        if (slaFilter === 'ON_TIME' && firstVisitSla.status !== 'TEPAT_WAKTU') return false;
        if (slaFilter === 'COMPLETED' && !firstVisitSla.isCompleted) return false;
      }

      return true;
    });

    // Sort berdasarkan prioritas tenggat waktu secara default
    const now = new Date();
    result.sort((a, b) => {
      if (sortBy === 'TENGGAT_PRIORITAS') {
        const deadA = getVictimDeadline(a, now);
        const deadB = getVictimDeadline(b, now);
        return compareByDeadlinePriority(deadA, deadB, now);
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
      if (sortBy === 'SLA_URGENT') {
        const slaA = calculateFirstVisitSla(a.tanggalInformasiDiterima, a.kunjunganPertama);
        const slaB = calculateFirstVisitSla(b.tanggalInformasiDiterima, b.kunjunganPertama);
        const score = (sla) => {
          if (sla.status === 'TERLAMBAT') return 1;
          if (sla.status === 'MENDEKATI_TENGGAT') return 2;
          if (sla.status === 'TEPAT_WAKTU') return 3;
          return 4;
        };
        return score(slaA) - score(slaB);
      }
      return 0;
    });

    return result;
  }, [victims, search, officerFilter, hospitalFilter, conditionFilter, slaFilter, sortBy]);

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
    setSlaFilter('ALL');
    setSortBy('TENGGAT_PRIORITAS');
    setCurrentPage(1);
  };

  // Tampilan status yang bersih dan minimalis tanpa banyak badge tebal/penuh
  const renderStatusBadge = (v) => {
    const isDischarged =
      v.kondisiTerakhir === 'Sudah Pulang' ||
      v.kondisiTerakhir === 'Pulang' ||
      v.kondisiTerakhir === 'Selesai' ||
      v.statusPemantauan === 'Selesai Dipantau';

    const isReferred =
      (typeof v.kondisiTerakhir === 'string' && v.kondisiTerakhir.startsWith('Dirujuk')) ||
      (typeof v.statusPemantauan === 'string' && v.statusPemantauan.startsWith('Dirujuk')) ||
      v.statusPerawatan === 'Rujukan';

    const isNeedAction =
      v.statusTindakLanjut === 'Masih Perlu Ditindaklanjuti' ||
      v.kondisiTerakhir === 'Masih Dirawat' ||
      v.kondisiTerakhir === 'Rawat Inap';

    if (isDischarged) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>Selesai / Pulang</span>
        </span>
      );
    }

    if (isReferred) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          <span>Dirujuk</span>
        </span>
      );
    }

    if (v.statusPerawatan === 'Rawat Lanjutan' || v.isRawatLanjutan) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
          <span>Rawatan Lanjutan</span>
        </span>
      );
    }

    if (v.kondisiTerakhir === 'Meninggal Dunia') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          <span>Meninggal</span>
        </span>
      );
    }

    if (isNeedAction) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#145DA0]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#145DA0]"></span>
          <span>Masih Dirawat</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
        <span>{v.kondisiTerakhir || v.statusPemantauan || 'Dipantau'}</span>
      </span>
    );
  };

  // Clean SLA text with subtle icon/dot
  const renderSlaBadge = (victim) => {
    const sla = calculateFirstVisitSla(victim.tanggalInformasiDiterima, victim.kunjunganPertama);
    
    if (sla.isCompleted) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Terkunjungi</span>
        </span>
      );
    }

    if (sla.status === 'TERLAMBAT') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span>
          <span>Terlambat</span>
        </span>
      );
    }

    if (sla.status === 'MENDEKATI_TENGGAT') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>&lt; 24 Jam</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
        <span>Tepat Waktu</span>
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ── 1. PAGE HEADER (IDENTIK DENGAN PETUGAS) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Daftar Korban
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Data terpadu pemantauan seluruh korban kecelakaan, evaluasi kepatuhan SLA 3 hari, dan supervisi penugasan petugas lapangan.
          </p>
        </div>

        <div className="flex items-center gap-2">
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

      {/* ── 2. SUMMARY KPI STAT CARDS (BENTUK IDENTIK PETUGAS) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Korban */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Total Korban</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#145DA0] border border-blue-100 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 block mt-1">
            {stats.total}
          </span>
          <span className="text-[11px] text-slate-400 block">Total korban terdaftar</span>
        </div>

        {/* Belum Dikunjungi */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Belum Dikunjungi</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-amber-600 block mt-1">
            {stats.belumDikunjungi}
          </span>
          <span className="text-[11px] text-slate-400 block">Menunggu respon awal</span>
        </div>

        {/* Pemantauan Aktif */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Pemantauan Aktif</span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shrink-0">
              <HeartPulse className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-[#145DA0] block mt-1">
            {stats.pemantauanAktif}
          </span>
          <span className="text-[11px] text-slate-400 block">Sedang dirawat di RS</span>
        </div>

        {/* Selesai Dipantau */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Selesai Dipantau</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-emerald-600 block mt-1">
            {stats.selesai}
          </span>
          <span className="text-[11px] text-slate-400 block">Perawatan selesai / tuntas</span>
        </div>
      </div>

      {/* ── 3. FILTER DAN PENCARIAN MODERN ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* 1. Search */}
          <div className="relative">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Pencarian Korban / Petugas
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
                placeholder="Cari nama, RS, petugas..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
              />
            </div>
          </div>

          {/* 2. Filter Petugas JR */}
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

          {/* 3. Filter Rumah Sakit */}
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

          {/* 4. Filter Kondisi Pasien */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Kondisi Pasien
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
              <option value="Pulang">Sudah Pulang / Selesai</option>
              <option value="Dirujuk">Dirujuk</option>
              <option value="Meninggal">Meninggal Dunia</option>
            </select>
          </div>

          {/* 5. Filter Kepatuhan SLA */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Status Kepatuhan SLA
            </label>
            <select
              value={slaFilter}
              onChange={(e) => {
                setSlaFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Status SLA</option>
              <option value="OVERDUE">Terlambat (&gt; 3 Hari)</option>
              <option value="WARNING">Mendekati Tenggat (&lt;= 24 Jam)</option>
              <option value="ON_TIME">Tepat Waktu (Aktif)</option>
              <option value="COMPLETED">Selesai Dikunjungi</option>
            </select>
          </div>
        </div>

        {/* Filter Summary & Reset */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
          <span>
            Menampilkan <strong>{filteredAndSorted.length}</strong> dari <strong>{victims.length}</strong> data korban
          </span>
          {(search || officerFilter !== 'ALL' || hospitalFilter !== 'ALL' || conditionFilter !== 'ALL' || slaFilter !== 'ALL' || sortBy !== 'NEWEST') && (
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

      {/* ── 4. TABEL UTAMA MONITORING KORBAN (DUAL RESPONSIVE) ──
          Kolom: NO. | KORBAN / ID BERKAS | RUMAH SAKIT | PETUGAS JR | TANGGAL MASUK RS | STATUS PASIEN | KEPATUHAN SLA | AKSI */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* DESKTOP TABLE VIEW */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/90 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4 w-12 text-center">NO.</th>
                <th className="py-3.5 px-4">KORBAN / ID BERKAS</th>
                <th className="py-3.5 px-4">RUMAH SAKIT</th>
                <th className="py-3.5 px-4">PETUGAS JR</th>
                <th className="py-3.5 px-4">TANGGAL MASUK RS</th>
                <th className="py-3.5 px-4">STATUS PASIEN</th>
                <th className="py-3.5 px-4">KEPATUHAN SLA</th>
                <th className="py-3.5 px-4 text-right">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">Tidak ada korban yang sesuai dengan kriteria filter.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Coba ubah kata kunci atau reset filter pencarian di atas.</p>
                  </td>
                </tr>
              ) : (
                paginatedData.map((v, idx) => {
                  const number = String((currentPage - 1) * PAGE_SIZE + idx + 1).padStart(2, '0');
                  const initials = getInitials(v.nama);

                  return (
                    <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* NO. */}
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-center font-medium">
                        {number}
                      </td>

                      {/* KORBAN / ID BERKAS */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-[#145DA0] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                            {initials}
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
                              {v.nomorLaporan || (v.nik ? `NIK: ${v.nik}` : `ID: ${v.id}`)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* RUMAH SAKIT */}
                      <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{v.rumahSakit || '—'}</span>
                        </div>
                        {v.rumahSakitAsal && v.rumahSakitAsal !== v.rumahSakit && (
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Rujukan dari {v.rumahSakitAsal}
                          </span>
                        )}
                      </td>

                      {/* PETUGAS JR (Nama petugas saja) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-semibold text-slate-800 block text-xs">
                          {(() => {
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
                            const candidates = [
                              assignedOfficer?.nama,
                              matchedByPlotting?.nama,
                              v.namaPetugas,
                              v.petugasNama,
                              v.petugas
                            ];
                            for (const c of candidates) {
                              if (c && c !== 'Mobile Service' && c !== 'Petugas Lapangan' && c !== 'Belum Ditugaskan' && c !== 'Belum Ada Petugas Penanggung Jawab') {
                                return c;
                              }
                            }
                            return matchedByPlotting?.nama || (v.petugasId ? `Petugas ${String(v.petugasId).replace(/[^0-9]/g, '') || v.petugasId}` : 'Petugas 1');
                          })()}
                        </span>
                      </td>

                      {/* TANGGAL MASUK RS */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatDateShort(v.tanggalMasukRs || v.tanggalInformasiDiterima)}</span>
                        </div>
                      </td>

                      {/* STATUS PASIEN */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusBadge(v)}
                      </td>

                      {/* KEPATUHAN SLA */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderSlaBadge(v)}
                      </td>

                      {/* AKSI */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedVictim(v)}
                            className="w-8 h-8 rounded-xl bg-blue-50 text-[#145DA0] border border-blue-100 flex items-center justify-center hover:bg-blue-100 transition-colors shadow-2xs cursor-pointer"
                            title="Audit & Detail Korban"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
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
          {paginatedData.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-600 text-xs">Tidak ada korban yang sesuai kriteria filter.</p>
            </div>
          ) : (
            paginatedData.map((v, idx) => {
              const number = String((currentPage - 1) * PAGE_SIZE + idx + 1).padStart(2, '0');
              const initials = getInitials(v.nama);
              const vRs = (v.rumahSakit || '').toLowerCase().trim();
              const matchedByPlotting = officers.find((o) => 
                o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some((rs) => {
                  const r1 = (rs || '').toLowerCase().trim();
                  return r1 === vRs || (vRs.length >= 4 && (r1.includes(vRs) || vRs.includes(r1)));
                })
              );
              const officerName = v.namaPetugas || matchedByPlotting?.nama || 'Petugas 1';

              return (
                <div key={v.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-50 text-[#145DA0] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-slate-400 font-bold">#{number}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedVictim(v)}
                            className="font-bold text-slate-900 text-xs hover:text-[#145DA0] truncate block text-left"
                          >
                            {v.nama}
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {v.nomorLaporan || (v.nik ? `NIK: ${v.nik}` : `ID: ${v.id}`)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {renderStatusBadge(v)}
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-2.5 text-[11px] text-slate-600 space-y-1.5 border border-slate-100">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{v.rumahSakit || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                      <span>Petugas: <strong className="text-slate-800">{officerName}</strong></span>
                      <span>Masuk RS: {formatDateShort(v.tanggalMasukRs || v.tanggalInformasiDiterima)}</span>
                    </div>
                    <div className="pt-1 border-t border-slate-200/60 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">Kepatuhan SLA:</span>
                      {renderSlaBadge(v)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedVictim(v)}
                    className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    <span>Audit Lengkap Pasien</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* ── 5. PAGINATION FOOTER ── */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Menampilkan data <strong>{filteredAndSorted.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0}</strong> - <strong>{Math.min(currentPage * PAGE_SIZE, filteredAndSorted.length)}</strong> dari <strong>{filteredAndSorted.length}</strong> total korban
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs cursor-pointer"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>

            <span className="px-3 py-1 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl shadow-2xs">
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs cursor-pointer"
              title="Halaman Berikutnya"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Drawer Detail Korban */}
      {selectedVictim && (
        <VictimDetailDrawer
          isOpen={!!selectedVictim}
          onClose={() => setSelectedVictim(null)}
          victim={selectedVictim}
        />
      )}
    </div>
  );
}
