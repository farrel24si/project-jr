import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import ConditionBadge from '../../components/common/ConditionBadge';
import {
  History,
  Search,
  Calendar,
  Building2,
  CheckCircle2,
  Activity,
  Eye,
  Camera,
  Navigation,
  Filter,
  RotateCcw
} from 'lucide-react';

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return (
      d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ', ' +
      d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) +
      ' WIB'
    );
  } catch {
    return dateStr;
  }
}

export default function PetugasHistoryPage() {
  const { currentUser } = useAuth();
  const officerId = currentUser?.profile?.id || 'PET-01';

  const [victims, setVictims] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterCondition, setFilterCondition] = useState('ALL');

  const loadData = () => {
    const all = storageService.getVictims();
    setVictims(all.filter((v) => v.petugasId === officerId));
  };

  useEffect(() => {
    loadData();
    window.addEventListener('jr_victims_updated', loadData);
    return () => window.removeEventListener('jr_victims_updated', loadData);
  }, [officerId]);

  // Flatten all activities
  const allActivities = useMemo(() => {
    const list = [];
    victims.forEach((v) => {
      (v.riwayatAktivitas || []).forEach((act) => {
        list.push({
          ...act,
          victimId: v.id,
          korbanNama: v.nama,
          nik: v.nik,
          rumahSakit: v.rumahSakit
        });
      });
    });

    list.sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
    return list;
  }, [victims]);

  const filtered = useMemo(() => {
    return allActivities.filter((act) => {
      const matchSearch =
        act.korbanNama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        act.rumahSakit.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (act.hasilKomunikasi && act.hasilKomunikasi.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchSearch) return false;

      if (filterType !== 'ALL' && act.jenisAktivitas !== filterType) return false;
      if (filterCondition !== 'ALL' && act.kondisiKorban !== filterCondition) return false;

      return true;
    });
  }, [allActivities, searchTerm, filterType, filterCondition]);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Riwayat Aktivitas Petugas</h1>
          <p className="text-xs text-slate-500 mt-1">
            Rekam jejak seluruh kunjungan rumah sakit dan pemantauan berkala yang telah Anda lakukan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-[#145DA0] border border-blue-200/80">
            Total {filtered.length} Aktivitas Tercatat
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama korban, RS, atau catatan aktivitas..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-700"
            >
              <option value="ALL">Semua Jenis Aktivitas</option>
              <option value="Kunjungan Pertama">Kunjungan Pertama</option>
              <option value="Pemantauan Lanjutan">Pemantauan Lanjutan</option>
            </select>

            <select
              value={filterCondition}
              onChange={(e) => setFilterCondition(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-700"
            >
              <option value="ALL">Semua Kondisi</option>
              <option value="Masih Dirawat">Masih Dirawat</option>
              <option value="Sudah Pulang">Sudah Pulang</option>
              <option value="Dirujuk">Dirujuk</option>
              <option value="Meninggal Dunia">Meninggal Dunia</option>
              <option value="Belum Dapat Dikonfirmasi">Belum Dapat Dikonfirmasi</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFilterType('ALL');
                setFilterCondition('ALL');
              }}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
              title="Reset Filter"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Activity List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            Tidak ada riwayat aktivitas yang sesuai dengan filter pencarian.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((act) => {
              const isFirstVisit = act.jenisAktivitas === 'Kunjungan Pertama';
              const hasil = act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan;
              const tl = act.catatanTindakLanjut || act.tindakLanjut;

              return (
                <div key={act.id} className="p-4 sm:p-5 hover:bg-slate-50/70 transition-colors space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isFirstVisit ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
                      }`}>
                        {isFirstVisit ? <CheckCircle2 className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                      </div>
                      <span className="font-bold text-slate-900 text-sm">{act.korbanNama}</span>
                      <span className="text-xs bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                        {act.jenisAktivitas}
                      </span>
                      <ConditionBadge kondisi={act.kondisiKorban} size="xs" />
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 font-mono">
                        {formatDateTime(act.tanggal)}
                      </span>
                      <Link
                        to={`/petugas/korban/${act.victimId}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-[#145DA0] hover:bg-blue-100 border border-blue-200/80 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Detail Korban</span>
                      </Link>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1 pl-9">
                    <p className="font-medium text-slate-700">
                      Rumah Sakit: <strong className="text-slate-900">{act.rumahSakit}</strong>
                    </p>
                    <p>
                      <strong>Hasil:</strong> {hasil || '—'}
                    </p>
                    {tl && (
                      <p className="text-slate-500">
                        <strong>Tindak Lanjut:</strong> {tl}
                      </p>
                    )}
                    {act.isEdited && (
                      <span className="inline-block text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Diedit pada {formatDateTime(act.editedAt)} oleh {act.editedBy}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

