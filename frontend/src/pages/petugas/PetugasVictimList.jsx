import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';
import SlaBadge from '../../components/common/SlaBadge';
import ConditionBadge from '../../components/common/ConditionBadge';
import MonitoringStatusBadge from '../../components/common/MonitoringStatusBadge';
import FormInputKorbanModal from '../../components/petugas/FormInputKorbanModal';
import FormPemantauanModal from '../../components/petugas/FormPemantauanModal';
import {
  Search,
  Eye,
  PlusCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Filter,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Users,
  UserPlus,
  Activity
} from 'lucide-react';

function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
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
    const all = storageService.getVictims();
    setVictims(all.filter((v) => v.petugasId === officerId));
  };

  useEffect(() => {
    loadData();
    window.addEventListener('jr_victims_updated', loadData);
    return () => window.removeEventListener('jr_victims_updated', loadData);
  }, [officerId]);

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
        v.rumahSakit.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;

      // 2. Filter Rumah Sakit
      if (filterHospital !== 'ALL' && v.rumahSakit !== filterHospital) return false;

      // 3. Filter Kondisi Korban
      if (filterCondition !== 'ALL') {
        if (filterCondition === 'Sudah Pulang' && (v.kondisiTerakhir !== 'Sudah Pulang' && v.kondisiTerakhir !== 'Pulang')) return false;
        if (filterCondition !== 'Sudah Pulang' && v.kondisiTerakhir !== filterCondition) return false;
      }

      // 4. Filter Status Pemantauan
      if (filterMonitoringStatus !== 'ALL' && v.statusPemantauan !== filterMonitoringStatus) return false;

      // 5. Filter Keterlambatan
      if (filterLateness !== 'ALL') {
        const activeSla = !isVisited ? fSla : mSla;
        if (filterLateness === 'TERLAMBAT' && !activeSla.isOverdue && activeSla.status !== 'SELESAI_TERLAMBAT') return false;
        if (filterLateness === 'MENDEKATI' && activeSla.status !== 'MENDEKATI_TENGGAT') return false;
        if (filterLateness === 'TEPAT_WAKTU' && (activeSla.isOverdue || activeSla.status === 'SELESAI_TERLAMBAT')) return false;
      }

      return true;
    });
  }, [
    victims,
    search,
    filterHospital,
    filterCondition,
    filterMonitoringStatus,
    filterLateness
  ]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    filterHospital,
    filterCondition,
    filterMonitoringStatus,
    filterLateness
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
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

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Daftar Korban</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Setiap korban memiliki satu data utama tetap. Tambahkan pemantauan lanjutan langsung ke korban yang bersangkutan.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsInputModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-sm shadow-blue-900/15 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Tambah Korban Baru</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Total Korban Unik
          </span>
          <span className="text-xl font-black text-slate-900 mt-1 block">
            {metrics.total} <span className="text-xs font-normal text-slate-400">korban</span>
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Belum Dikunjungi
          </span>
          <span className="text-xl font-black text-amber-700 mt-1 block">
            {metrics.belumDikunjungi} <span className="text-xs font-normal text-slate-400">korban</span>
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block">
            Pemantauan Aktif
          </span>
          <span className="text-xl font-black text-[#145DA0] mt-1 block">
            {metrics.pemantauanAktif} <span className="text-xs font-normal text-slate-400">rawat inap</span>
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
            Selesai Dipantau
          </span>
          <span className="text-xl font-black text-emerald-700 mt-1 block">
            {metrics.selesaiDipantau} <span className="text-xs font-normal text-slate-400">korban</span>
          </span>
        </div>
      </div>

      {/* Filter Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        {/* Top search & reset */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari berdasarkan nama korban, NIK, atau rumah sakit..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0] transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={resetAllFilters}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
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
              onChange={(e) => setFilterHospital(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
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
              onChange={(e) => setFilterMonitoringStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Status Pemantauan</option>
              <option value="Belum Dikunjungi">Belum Dikunjungi</option>
              <option value="Pemantauan Aktif">Pemantauan Aktif</option>
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
              onChange={(e) => setFilterCondition(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Kondisi</option>
              <option value="Masih Dirawat">Masih Dirawat</option>
              <option value="Sudah Pulang">Sudah Pulang</option>
              <option value="Dirujuk">Dirujuk</option>
              <option value="Meninggal Dunia">Meninggal Dunia</option>
              <option value="Belum Dapat Dikonfirmasi">Belum Dapat Dikonfirmasi</option>
            </select>
          </div>

          {/* 4. Filter Keterlambatan */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Keterlambatan (SLA)
            </label>
            <select
              value={filterLateness}
              onChange={(e) => setFilterLateness(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Kategori</option>
              <option value="TERLAMBAT">Terlambat</option>
              <option value="MENDEKATI">Mendekati Tenggat</option>
              <option value="TEPAT_WAKTU">Tepat Waktu</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabel Korban */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3 px-4">Nama Korban</th>
                <th className="py-3 px-4">Rumah Sakit</th>
                <th className="py-3 px-4">Tanggal Laka</th>
                <th className="py-3 px-4">Status Pemantauan</th>
                <th className="py-3 px-4">Kondisi Terakhir</th>
                <th className="py-3 px-4">Status SLA</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Tidak ada korban yang sesuai dengan kriteria filter pencarian.
                  </td>
                </tr>
              ) : (
                paginated.map((v) => {
                  const firstVisitSla = calculateFirstVisitSla(
                    v.tanggalInformasiDiterima,
                    v.kunjunganPertama
                  );
                  const monSla = calculateMonitoringSla(v);
                  const isVisited = !!v.kunjunganPertama;
                  const activeSla = !isVisited ? firstVisitSla : monSla;

                  return (
                    <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <Link
                          to={`/petugas/korban/${v.id}`}
                          className="hover:text-[#145DA0] hover:underline"
                        >
                          {v.nama}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 text-slate-800 font-medium whitespace-nowrap">
                        {v.rumahSakit}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap font-medium">
                        {formatDateShort(v.tanggalKecelakaan)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <MonitoringStatusBadge status={v.statusPemantauan} />
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <ConditionBadge
                          kondisi={v.kondisiTerakhir}
                          statusKonfirmasi={v.statusKonfirmasiKondisi}
                        />
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <SlaBadge slaInfo={activeSla} />
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedVictimForMonitoring(v)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-[#145DA0] hover:bg-sky-100 border border-sky-200 transition-colors cursor-pointer"
                            title="Lakukan pemantauan pada korban ini"
                          >
                            <Activity className="w-3.5 h-3.5" />
                            <span>+ Pantau</span>
                          </button>
                          <Link
                            to={`/petugas/korban/${v.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Detail</span>
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
        <div className="p-3.5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 bg-slate-50/50">
          <div>
            Menampilkan{' '}
            <span className="font-semibold text-slate-700">
              {filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
            </span>{' '}
            sampai{' '}
            <span className="font-semibold text-slate-700">
              {Math.min(currentPage * PAGE_SIZE, filtered.length)}
            </span>{' '}
            dari <span className="font-semibold text-slate-700">{filtered.length}</span> korban
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 text-slate-700 font-semibold">
              Halaman {currentPage} dari {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Input Korban Baru */}
      <FormInputKorbanModal
        isOpen={isInputModalOpen}
        onClose={() => setIsInputModalOpen(false)}
        onVictimCreated={() => loadData()}
      />

      {/* Modal Lakukan Pemantauan Cepat dari Daftar Korban */}
      {selectedVictimForMonitoring && (
        <FormPemantauanModal
          isOpen={!!selectedVictimForMonitoring}
          onClose={() => setSelectedVictimForMonitoring(null)}
          victim={selectedVictimForMonitoring}
          onMonitoringSaved={() => loadData()}
        />
      )}
    </div>
  );
}
