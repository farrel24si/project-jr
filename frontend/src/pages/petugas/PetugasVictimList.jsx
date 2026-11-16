import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';
import FormInputKorbanModal from '../../components/petugas/FormInputKorbanModal';
import FormPemantauanModal from '../../components/petugas/FormPemantauanModal';
import {
  Search,
  Eye,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Users,
  UserPlus,
  Activity,
  HeartPulse,
  UserCheck
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

const PAGE_SIZE = 10;

export default function PetugasVictimList() {
  const { currentUser } = useAuth();
  const officerId = currentUser?.profile?.id || 'PET-01';

  const [victims, setVictims] = useState([]);
  const [search, setSearch] = useState('');
  const [filterHospital, setFilterHospital] = useState('ALL');
  const [filterCondition, setFilterCondition] = useState('ALL');
  const [filterMonitoringStatus, setFilterMonitoringStatus] = useState('ALL');
  const [filterLateness, setFilterLateness] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [selectedVictimForMonitoring, setSelectedVictimForMonitoring] = useState(null);

  const loadData = () => {
    const activeOfficerIdent = officerId || currentUser?.profile?.id || currentUser?.profile?.backendOfficerId || currentUser?.profile?.nama;
    const myVictims = storageService.getVictimsByOfficer(activeOfficerIdent);
    setVictims(myVictims);
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
  }, [officerId, currentUser?.profile?.plottingRs]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    let belumDikunjungi = 0;
    let pemantauanAktif = 0;
    let menungguKonfirmasi = 0;
    let selesaiDipantau = 0;

    victims.forEach((v) => {
      if (v.statusPemantauan === 'Belum Dikunjungi') belumDikunjungi++;
      else if (v.statusPemantauan === 'Pemantauan Aktif') pemantauanAktif++;
      else if (v.statusPemantauan === 'Menunggu Konfirmasi Kondisi') menungguKonfirmasi++;
      else if (v.statusPemantauan === 'Selesai Dipantau') selesaiDipantau++;
    });

    return {
      total: victims.length,
      belumDikunjungi,
      pemantauanAktif,
      menungguKonfirmasi,
      selesaiDipantau
    };
  }, [victims]);

  const hospitals = useMemo(() => {
    return Array.from(new Set(victims.map((v) => v.rumahSakit))).filter(Boolean);
  }, [victims]);

  // Filtered dataset
  const filtered = useMemo(() => {
    return victims.filter((v) => {
      const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
      const mSla = calculateMonitoringSla(v);
      const isVisited = !!v.kunjunganPertama;

      // 1. Search nama korban atau NIK
      const matchSearch =
        v.nama.toLowerCase().includes(search.toLowerCase()) ||
        (v.nik && v.nik.includes(search)) ||
        (v.nomorLaporan && v.nomorLaporan.toLowerCase().includes(search.toLowerCase())) ||
        v.rumahSakit.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;

      // 2. Filter Rumah Sakit
      if (filterHospital !== 'ALL' && v.rumahSakit !== filterHospital) return false;

      // 3. Filter Kondisi Korban
      if (filterCondition !== 'ALL') {
        if (filterCondition === 'Sudah Pulang' && (v.kondisiTerakhir !== 'Sudah Pulang' && v.kondisiTerakhir !== 'Pulang' && v.kondisiTerakhir !== 'Selesai')) return false;
        else if (filterCondition === 'Dirujuk' && (!v.kondisiTerakhir || !v.kondisiTerakhir.startsWith('Dirujuk'))) return false;
        else if (filterCondition !== 'Sudah Pulang' && filterCondition !== 'Dirujuk' && v.kondisiTerakhir !== filterCondition) return false;
      }

      // 4. Filter Status Pemantauan
      if (filterMonitoringStatus !== 'ALL') {
        if (filterMonitoringStatus === 'Dirujuk') {
          if (!v.statusPemantauan || !v.statusPemantauan.startsWith('Dirujuk')) return false;
        } else if (v.statusPemantauan !== filterMonitoringStatus) {
          return false;
        }
      }

      // 5. Filter Keterlambatan
      if (filterLateness !== 'ALL') {
        const activeSla = !isVisited ? fSla : mSla;
        if (filterLateness === 'TERLAMBAT' && !activeSla.isOverdue && activeSla.status !== 'SELESAI_TERLAMBAT') return false;
        if (filterLateness === 'MENDEKATI' && activeSla.status !== 'MENDEKATI_BATAS') return false;
        if (filterLateness === 'TEPAT_WAKTU' && (activeSla.isOverdue || activeSla.status === 'SELESAI_TERLAMBAT')) return false;
      }

      return true;
    });
  }, [victims, search, filterHospital, filterCondition, filterMonitoringStatus, filterLateness]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const resetAllFilters = () => {
    setSearch('');
    setFilterHospital('ALL');
    setFilterCondition('ALL');
    setFilterMonitoringStatus('ALL');
    setFilterLateness('ALL');
    setCurrentPage(1);
  };

  // Helper render badge status tunggal (seragam dengan dashboard)
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
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>Selesai</span>
        </span>
      );
    }

    if (isReferred) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          <span>Dirujuk</span>
        </span>
      );
    }

    if (v.statusPerawatan === 'Rawat Lanjutan' || v.isRawatLanjutan) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
          <span>Rawatan Lanjutan</span>
        </span>
      );
    }

    if (v.kondisiTerakhir === 'Meninggal Dunia') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          <span>Meninggal</span>
        </span>
      );
    }

    if (isNeedAction) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-[#145DA0] border border-blue-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-[#145DA0]"></span>
          <span>Masih Dirawat</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
        <span>Terjadwal</span>
      </span>
    );
  };

  const getInitials = (name) => {
    if (!name) return 'KR';
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* ── 1. PAGE HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Daftar Korban</h1>
          <p className="text-xs text-slate-500 mt-1">
            Data terpadu penanganan korban laka lantas, pemantauan rumah sakit, dan status verifikasi santunan.
          </p>
        </div>

        <div className="w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={() => setIsInputModalOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-2xs transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Tambah Korban Baru</span>
          </button>
        </div>
      </div>

      {/* ── 2. SUMMARY KPI STAT CARDS (BERSIH & ELEGAN) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Total Korban</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#145DA0] flex items-center justify-center border border-blue-100">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 block mt-1">
            {metrics.total}
          </span>
          <span className="text-[11px] text-slate-400 block">Total korban terdaftar</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Belum Dikunjungi</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-amber-600 block mt-1">
            {metrics.belumDikunjungi}
          </span>
          <span className="text-[11px] text-slate-400 block">Menunggu kunjungan awal</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Pemantauan Aktif</span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-[#145DA0] block mt-1">
            {metrics.pemantauanAktif}
          </span>
          <span className="text-[11px] text-slate-400 block">Sedang dirawat di RS</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Selesai Dipantau</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-emerald-600 block mt-1">
            {metrics.selesaiDipantau}
          </span>
          <span className="text-[11px] text-slate-400 block">Pasien pulang / selesai</span>
        </div>
      </div>

      {/* ── 3. FILTER CARD ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-3">
        {/* Top search & reset */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari berdasarkan nama korban, NIK, ID berkas, atau rumah sakit..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0] transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={resetAllFilters}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Filter</span>
          </button>
        </div>

        {/* 4 Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 text-xs">
          {/* 1. Filter RS */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Rumah Sakit
            </label>
            <select
              value={filterHospital}
              onChange={(e) => {
                setFilterHospital(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Rumah Sakit</option>
              {hospitals.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Filter Status Pemantauan */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Status Pemantauan
            </label>
            <select
              value={filterMonitoringStatus}
              onChange={(e) => {
                setFilterMonitoringStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Status Pemantauan</option>
              <option value="Belum Dikunjungi">Belum Dikunjungi</option>
              <option value="Pemantauan Aktif">Pemantauan Aktif</option>
              <option value="Dirujuk">Dirujuk ke RS Lain</option>
              <option value="Menunggu Konfirmasi Kondisi">Menunggu Konfirmasi Kondisi</option>
              <option value="Selesai Dipantau">Selesai Dipantau</option>
            </select>
          </div>

          {/* 3. Filter Kondisi Korban */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Kondisi Korban
            </label>
            <select
              value={filterCondition}
              onChange={(e) => {
                setFilterCondition(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Kondisi</option>
              <option value="Masih Dirawat">Masih Dirawat</option>
              <option value="Sudah Pulang">Sudah Pulang</option>
              <option value="Dirujuk">Dirujuk</option>
              <option value="Meninggal Dunia">Meninggal Dunia</option>
            </select>
          </div>

          {/* 4. Filter Keterlambatan SLA */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Kepatuhan SLA (3 Hari)
            </label>
            <select
              value={filterLateness}
              onChange={(e) => {
                setFilterLateness(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Kategori</option>
              <option value="TERLAMBAT">Terlambat (SLA Terlampaui)</option>
              <option value="MENDEKATI">Mendekati Batas Waktu</option>
              <option value="TEPAT_WAKTU">Tepat Waktu</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── 4. TABEL / KARTU UTAMA DAFTAR KORBAN (DUAL RESPONSIVE) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Tampilan Mobile Card (Khusus Layar HP < 768px) */}
        <div className="md:hidden divide-y divide-slate-100">
          {paginated.length === 0 ? (
            <div className="py-12 text-center text-slate-400 p-4">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-600 text-xs">Tidak ada korban yang sesuai dengan kriteria filter.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Coba ubah kata kunci atau reset filter pencarian di atas.</p>
            </div>
          ) : (
            paginated.map((v, idx) => {
              const number = String((currentPage - 1) * PAGE_SIZE + idx + 1).padStart(2, '0');
              const initials = getInitials(v.nama);
              const isDischarged =
                v.kondisiTerakhir === 'Sudah Pulang' ||
                v.kondisiTerakhir === 'Pulang' ||
                v.kondisiTerakhir === 'Selesai' ||
                v.statusPemantauan === 'Selesai Dipantau';

              return (
                <div key={v.id} className="p-4 space-y-3 hover:bg-slate-50/70 transition-colors">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-50 text-[#145DA0] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <Link
                          to={`/petugas/korban/${v.id}`}
                          className="font-bold text-xs text-slate-900 hover:text-[#145DA0] truncate block"
                        >
                          {v.nama}
                        </Link>
                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5 truncate">
                          {v.nomorLaporan || (v.nik ? `NIK: ${v.nik}` : `ID: ${v.id}`)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {renderStatusBadge(v)}
                    </div>
                  </div>

                  <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-100 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{v.rumahSakit || '—'}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Tgl Kecelakaan:</span>
                        <span className="font-semibold text-slate-700 block">
                          {formatDateShort(v.tanggalKecelakaan)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block text-[10px]">Tgl Masuk RS:</span>
                        <span className="font-semibold text-slate-700 block">
                          {formatDateShort(v.tanggalMasukRs || v.tanggalInformasiDiterima)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-0.5">
                    <Link
                      to={`/petugas/korban/${v.id}`}
                      className="flex-1 py-2 px-3 rounded-xl border border-blue-200 bg-blue-50/70 text-[#145DA0] hover:bg-blue-100 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat Detail</span>
                    </Link>

                    {!isDischarged && (
                      <button
                        type="button"
                        onClick={() => setSelectedVictimForMonitoring(v)}
                        className="flex-1 py-2 px-3 rounded-xl border border-sky-200 bg-sky-50 text-[#145DA0] hover:bg-sky-100 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                      >
                        <Activity className="w-3.5 h-3.5" />
                        <span>Catat Pemantauan</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Tampilan Desktop Table (Layar Tablet & Laptop >= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/90 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4 w-12 text-center">NO.</th>
                <th className="py-3.5 px-4">KORBAN / ID BERKAS</th>
                <th className="py-3.5 px-4">RUMAH SAKIT</th>
                <th className="py-3.5 px-4">TGL KECELAKAAN</th>
                <th className="py-3.5 px-4">TANGGAL MASUK RS</th>
                <th className="py-3.5 px-4">STATUS</th>
                <th className="py-3.5 px-4 text-right">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">Tidak ada korban yang sesuai dengan kriteria filter pencarian.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Coba ubah kata kunci atau reset filter pencarian di atas.</p>
                  </td>
                </tr>
              ) : (
                paginated.map((v, idx) => {
                  const number = String((currentPage - 1) * PAGE_SIZE + idx + 1).padStart(2, '0');
                  const initials = getInitials(v.nama);
                  const isDischarged =
                    v.kondisiTerakhir === 'Sudah Pulang' ||
                    v.kondisiTerakhir === 'Pulang' ||
                    v.kondisiTerakhir === 'Selesai' ||
                    v.statusPemantauan === 'Selesai Dipantau';

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
                            <Link
                              to={`/petugas/korban/${v.id}`}
                              className="font-bold text-slate-900 hover:text-[#145DA0] hover:underline block text-xs"
                            >
                              {v.nama}
                            </Link>
                            <span className="text-[10px] text-slate-400 font-mono font-normal block">
                              {v.nomorLaporan || (v.nik ? `NIK: ${v.nik}` : `ID: ${v.id}`)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* RUMAH SAKIT */}
                      <td className="py-3.5 px-4 text-slate-800 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <div>
                            <span className="block font-semibold">{v.rumahSakit}</span>
                            {v.rumahSakitAsal && v.rumahSakitAsal !== v.rumahSakit && (
                              <span className="text-[10px] text-purple-700 font-medium block">
                                Dirujuk dari {v.rumahSakitAsal}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* TGL KECELAKAAN */}
                      <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap font-medium">
                        <span className="text-slate-800 font-semibold block text-xs">
                          {formatDateShort(v.tanggalKecelakaan)}
                        </span>
                      </td>

                      {/* TANGGAL MASUK RS */}
                      <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap font-medium">
                        <span className="text-slate-800 font-semibold block text-xs">
                          {formatDateShort(v.tanggalMasukRs || v.tanggalInformasiDiterima)}
                        </span>
                      </td>

                      {/* STATUS (Single Dot Pill) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusBadge(v)}
                      </td>

                      {/* AKSI */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isDischarged && (
                            <button
                              type="button"
                              onClick={() => setSelectedVictimForMonitoring(v)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-[#145DA0] hover:bg-sky-100 border border-sky-200 transition-colors cursor-pointer"
                              title="Lakukan pemantauan pada korban ini"
                            >
                              <Activity className="w-3.5 h-3.5" />
                              <span>Catat Pemantauan</span>
                            </button>
                          )}

                          <Link
                            to={`/petugas/korban/${v.id}`}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                            title="Lihat Detail Korban"
                          >
                            <Eye className="w-4 h-4 text-slate-600" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-3.5 border-t border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 bg-slate-50/50">
            <div>
              Menampilkan{' '}
              <span className="font-semibold text-slate-700">
                {(currentPage - 1) * PAGE_SIZE + 1}
              </span>{' '}
              sampai{' '}
              <span className="font-semibold text-slate-700">
                {Math.min(currentPage * PAGE_SIZE, filtered.length)}
              </span>{' '}
              dari <span className="font-semibold text-slate-700">{filtered.length}</span> korban
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg">
                Halaman {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Input Korban Baru */}
      {isInputModalOpen && (
        <FormInputKorbanModal
          isOpen={isInputModalOpen}
          onClose={() => setIsInputModalOpen(false)}
          onSuccess={() => {
            loadData();
            setIsInputModalOpen(false);
          }}
        />
      )}

      {/* Modal Form Pemantauan */}
      {selectedVictimForMonitoring && (
        <FormPemantauanModal
          isOpen={!!selectedVictimForMonitoring}
          onClose={() => setSelectedVictimForMonitoring(null)}
          victim={selectedVictimForMonitoring}
          onMonitoringSaved={() => {
            loadData();
            setSelectedVictimForMonitoring(null);
          }}
        />
      )}
    </div>
  );
}
