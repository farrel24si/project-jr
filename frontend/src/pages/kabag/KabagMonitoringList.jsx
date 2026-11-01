import React, { useState, useEffect, useMemo } from 'react';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';
import SlaBadge from '../../components/common/SlaBadge';
import ConditionBadge from '../../components/common/ConditionBadge';
import MonitoringStatusBadge from '../../components/common/MonitoringStatusBadge';
import VictimDetailDrawer from '../../components/kabag/VictimDetailDrawer';
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  ChevronLeft, 
  ChevronRight, 
  Building2, 
  User, 
  Calendar, 
  Eye, 
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';

export default function KabagMonitoringList() {
  const [victims, setVictims] = useState([]);
  const [search, setSearch] = useState('');
  const [officerFilter, setOfficerFilter] = useState('ALL');
  const [hospitalFilter, setHospitalFilter] = useState('ALL');
  const [conditionFilter, setConditionFilter] = useState('ALL');
  const [slaFilter, setSlaFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('NEWEST'); // NEWEST, OLDEST, NAME, SLA_URGENT

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const [selectedVictim, setSelectedVictim] = useState(null);

  const loadData = () => {
    const data = storageService.getVictims();
    setVictims(data);
  };

  useEffect(() => {
    loadData();
    window.addEventListener('jr_victims_updated', loadData);
    return () => window.removeEventListener('jr_victims_updated', loadData);
  }, []);

  // Filter lists
  const officers = useMemo(() => storageService.getOfficers(), []);
  const hospitals = useMemo(() => {
    const list = Array.from(new Set(victims.map((v) => v.rumahSakit)));
    return list;
  }, [victims]);

  // Filtered & Sorted Data
  const filteredAndSorted = useMemo(() => {
    let result = victims.filter((v) => {
      const firstVisitSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
      const matchSearch =
        v.nama.toLowerCase().includes(search.toLowerCase()) ||
        (v.id || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.lokasiKejadian || '').toLowerCase().includes(search.toLowerCase()) ||
        v.rumahSakit.toLowerCase().includes(search.toLowerCase()) ||
        v.namaPetugas.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;
      if (officerFilter !== 'ALL' && v.petugasId !== officerFilter) return false;
      if (hospitalFilter !== 'ALL' && v.rumahSakit !== hospitalFilter) return false;
      if (conditionFilter !== 'ALL' && v.kondisiTerakhir !== conditionFilter) return false;

      if (slaFilter !== 'ALL') {
        if (slaFilter === 'OVERDUE' && firstVisitSla.status !== 'TERLAMBAT') return false;
        if (slaFilter === 'WARNING' && firstVisitSla.status !== 'MENDEKATI_TENGGAT') return false;
        if (slaFilter === 'ON_TIME' && firstVisitSla.status !== 'TEPAT_WAKTU') return false;
        if (slaFilter === 'COMPLETED' && !firstVisitSla.isCompleted) return false;
      }

      return true;
    });

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'NEWEST') {
        return new Date(b.tanggalInformasiDiterima).getTime() - new Date(a.tanggalInformasiDiterima).getTime();
      }
      if (sortBy === 'OLDEST') {
        return new Date(a.tanggalInformasiDiterima).getTime() - new Date(b.tanggalInformasiDiterima).getTime();
      }
      if (sortBy === 'NAME') {
        return a.nama.localeCompare(b.nama);
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
  const totalPages = Math.ceil(filteredAndSorted.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  const handleResetFilters = () => {
    setSearch('');
    setOfficerFilter('ALL');
    setHospitalFilter('ALL');
    setConditionFilter('ALL');
    setSlaFilter('ALL');
    setSortBy('NEWEST');
    setCurrentPage(1);
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-5">
      {/* Page Title */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Monitoring Seluruh Korban Kecelakaan
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari nama korban, RS, TKP..."
              className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
            />
          </div>

          {/* Petugas Filter */}
          <div>
            <select
              value={officerFilter}
              onChange={(e) => {
                setOfficerFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option value="ALL">Semua Petugas Penanggung Jawab</option>
              {officers.map((off) => (
                <option key={off.id} value={off.id}>{off.nama}</option>
              ))}
            </select>
          </div>

          {/* Rumah Sakit Filter */}
          <div>
            <select
              value={hospitalFilter}
              onChange={(e) => {
                setHospitalFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option value="ALL">Semua Rumah Sakit</option>
              {hospitals.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          {/* Status SLA */}
          <div>
            <select
              value={slaFilter}
              onChange={(e) => {
                setSlaFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option value="ALL">Semua Status SLA</option>
              <option value="OVERDUE">Terlambat (SLA Breached)</option>
              <option value="WARNING">Mendekati Tenggat (&lt;= 24 Jam)</option>
              <option value="ON_TIME">Tepat Waktu (Aktif)</option>
              <option value="COMPLETED">Selesai Dikunjungi</option>
            </select>
          </div>

          {/* Sorting */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option value="NEWEST">Urutkan: Informasi Terbaru</option>
              <option value="SLA_URGENT">Urutkan: SLA Paling Mendesak</option>
              <option value="OLDEST">Urutkan: Informasi Terlama</option>
              <option value="NAME">Urutkan: Nama Korban (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Filter Summary */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
          <span>
            Menampilkan <strong>{filteredAndSorted.length}</strong> data korban
          </span>
          {(search || officerFilter !== 'ALL' || hospitalFilter !== 'ALL' || conditionFilter !== 'ALL' || slaFilter !== 'ALL' || sortBy !== 'NEWEST') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-[#0A3981] font-semibold hover:underline"
            >
              Reset Semua Filter
            </button>
          )}
        </div>
      </div>

      {/* Main Monitoring Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Nama Korban</th>
                <th className="py-3.5 px-4">Rumah Sakit</th>
                <th className="py-3.5 px-4">Petugas JR</th>
                <th className="py-3.5 px-4">Tanggal Info</th>
                <th className="py-3.5 px-4">Aktivitas Terakhir</th>
                <th className="py-3.5 px-4">Status &amp; Kondisi</th>
                <th className="py-3.5 px-4">Status SLA</th>
                <th className="py-3.5 px-4">Tindak Lanjut</th>
                <th className="py-3.5 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Tidak ada data korban yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                paginatedData.map((victim) => {
                  const firstVisitSla = calculateFirstVisitSla(
                    victim.tanggalInformasiDiterima,
                    victim.kunjunganPertama
                  );

                  return (
                    <tr key={victim.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        {victim.nama}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                        {victim.rumahSakit}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                        {victim.namaPetugas}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-700 font-medium">
                        {formatDateTime(victim.tanggalInformasiDiterima)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {victim.kunjunganPertama ? (
                          <span className="text-emerald-700 font-semibold block">
                            {formatDateTime(victim.waktuPemantauanTerakhir || victim.kunjunganPertama.tanggalKunjungan)}
                          </span>
                        ) : (
                          <span className="text-rose-600 font-semibold">
                            Belum Dikunjungi
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 space-y-1 whitespace-nowrap">
                        <MonitoringStatusBadge status={victim.statusPemantauan} size="xs" />
                        <div>
                          <ConditionBadge
                            kondisi={victim.kondisiTerakhir}
                            statusKonfirmasi={victim.statusKonfirmasiKondisi}
                            size="xs"
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <SlaBadge slaInfo={firstVisitSla} showDescription />
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <span className="text-[11px] text-slate-600 line-clamp-2">
                          {victim.tindakLanjut}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedVictim(victim)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold bg-[#0A3981] text-white hover:bg-blue-900 shadow-xs transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Audit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
          <span>
            Halaman <strong>{currentPage}</strong> dari <strong>{totalPages}</strong>
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium">{currentPage}</span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Drawer */}
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
