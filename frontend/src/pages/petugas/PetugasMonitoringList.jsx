import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { calculateMonitoringSla } from '../../services/slaService';
import SlaBadge from '../../components/common/SlaBadge';
import ConditionBadge from '../../components/common/ConditionBadge';
import MonitoringStatusBadge from '../../components/common/MonitoringStatusBadge';
import FormPemantauanModal from '../../components/petugas/FormPemantauanModal';
import {
  CalendarCheck,
  Search,
  Activity,
  Eye,
  RotateCcw
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

export default function PetugasMonitoringList() {
  const { currentUser } = useAuth();
  const officerId = currentUser?.profile?.id || 'PET-01';

  const [victims, setVictims] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('ALL');
  const [conditionFilter, setConditionFilter] = useState('ALL');
  const [slaFilter, setSlaFilter] = useState('ALL');

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

  // Korban yang saat ini membutuhkan pemantauan lanjutan
  const victimsNeedingMonitoring = useMemo(() => {
    return victims.filter((v) => {
      return (
        v.statusPemantauan === 'Pemantauan Aktif' ||
        v.statusPemantauan === 'Menunggu Konfirmasi Kondisi' ||
        v.kondisiTerakhir === 'Masih Dirawat' ||
        v.kondisiTerakhir === 'Dirujuk'
      );
    });
  }, [victims]);

  const hospitals = useMemo(() => {
    return Array.from(new Set(victimsNeedingMonitoring.map((v) => v.rumahSakit))).filter(Boolean);
  }, [victimsNeedingMonitoring]);

  const filtered = useMemo(() => {
    return victimsNeedingMonitoring.filter((v) => {
      const monSla = calculateMonitoringSla(v);

      const matchSearch =
        v.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.rumahSakit.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.nik && v.nik.includes(searchTerm));
      if (!matchSearch) return false;

      if (hospitalFilter !== 'ALL' && v.rumahSakit !== hospitalFilter) return false;
      if (conditionFilter !== 'ALL' && v.kondisiTerakhir !== conditionFilter) return false;

      if (slaFilter === 'TERLAMBAT' && monSla.status !== 'TERLAMBAT') return false;
      if (slaFilter === 'MENDEKATI' && monSla.status !== 'MENDEKATI_TENGGAT') return false;
      if (slaFilter === 'TEPAT_WAKTU' && monSla.status !== 'TEPAT_WAKTU') return false;

      return true;
    });
  }, [victimsNeedingMonitoring, searchTerm, hospitalFilter, conditionFilter, slaFilter]);

  const handleOpenMonitoringModal = (victim) => {
    setSelectedVictimForMonitoring(victim);
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Pemantauan Berkala Korban</h1>
          <p className="text-xs text-slate-500 mt-1">
            Daftar korban yang memerlukan pemantauan berkelanjutan. Tambahkan aktivitas baru langsung tanpa membuat entri baru.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-200/80">
            {filtered.length} Korban Memerlukan Pemantauan
          </span>
        </div>
      </div>

      {/* Filter Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari berdasarkan nama korban atau rumah sakit..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <select
              value={hospitalFilter}
              onChange={(e) => setHospitalFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-700"
            >
              <option value="ALL">Semua Rumah Sakit</option>
              {hospitals.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>

            <select
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-700"
            >
              <option value="ALL">Semua Kondisi</option>
              <option value="Masih Dirawat">Masih Dirawat</option>
              <option value="Dirujuk">Dirujuk</option>
              <option value="Belum Dapat Dikonfirmasi">Belum Dapat Dikonfirmasi</option>
            </select>

            <select
              value={slaFilter}
              onChange={(e) => setSlaFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-700"
            >
              <option value="ALL">Semua Status SLA</option>
              <option value="TERLAMBAT">Terlambat</option>
              <option value="MENDEKATI">Mendekati Tenggat</option>
              <option value="TEPAT_WAKTU">Tepat Waktu</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setHospitalFilter('ALL');
                setConditionFilter('ALL');
                setSlaFilter('ALL');
              }}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
              title="Reset Filter"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabel Pemantauan Berkala */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3 px-4">Nama Korban</th>
                <th className="py-3 px-4">Rumah Sakit</th>
                <th className="py-3 px-4">Tgl Masuk RS</th>
                <th className="py-3 px-4">Kondisi Terakhir</th>
                <th className="py-3 px-4">Status Pemantauan</th>
                <th className="py-3 px-4">Status SLA</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Tidak ada korban yang saat ini membutuhkan pemantauan berkala lanjutan.
                  </td>
                </tr>
              ) : (
                filtered.map((v) => {
                  const monSla = calculateMonitoringSla(v);

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
                        {formatDateShort(v.tanggalMasukRs || v.tanggalInformasiDiterima)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <ConditionBadge
                          kondisi={v.kondisiTerakhir}
                          statusKonfirmasi={v.statusKonfirmasiKondisi}
                        />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <MonitoringStatusBadge status={v.statusPemantauan} />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <SlaBadge slaInfo={monSla} showDescription />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenMonitoringModal(v)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-2xs transition-colors cursor-pointer"
                          >
                            <Activity className="w-3.5 h-3.5" />
                            <span>+ Lakukan Pemantauan</span>
                          </button>
                          <Link
                            to={`/petugas/korban/${v.id}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="Lihat Detail Korban"
                          >
                            <Eye className="w-4 h-4" />
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
      </div>

      {/* Modal Form Pemantauan */}
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
