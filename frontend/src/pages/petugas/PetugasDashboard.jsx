import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';
import SlaBadge from '../../components/common/SlaBadge';
import ConditionBadge from '../../components/common/ConditionBadge';
import MonitoringStatusBadge from '../../components/common/MonitoringStatusBadge';
import FormInputKorbanModal from '../../components/petugas/FormInputKorbanModal';
import FormPemantauanModal from '../../components/petugas/FormPemantauanModal';
import {
  Users,
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Building2,
  Eye,
  PlusCircle,
  Activity,
  Search,
  Filter,
  ArrowRight,
  FileText,
  CalendarCheck,
  UserPlus
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

function formatTimeAgo(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return (
      d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) +
      ', ' +
      d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) +
      ' WIB'
    );
  } catch {
    return dateStr;
  }
}

export default function PetugasDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const officerId = currentUser?.profile?.id || 'PET-01';

  const [victims, setVictims] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [monitoringVictim, setMonitoringVictim] = useState(null);

  const loadData = () => {
    const all = storageService.getVictims();
    setVictims(all.filter((v) => v.petugasId === officerId));
  };

  useEffect(() => {
    loadData();
    window.addEventListener('jr_victims_updated', loadData);
    return () => window.removeEventListener('jr_victims_updated', loadData);
  }, [officerId]);

  // Metrik Terpisah Sesuai Ketentuan (1 Korban = 1 Korban)
  const metrics = useMemo(() => {
    return storageService.getAggregatedMetrics(officerId);
  }, [victims, officerId]);

  // Prioritas Tindak Lanjut
  const priorityVictims = useMemo(() => {
    return victims
      .filter((v) => {
        const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
        const mSla = calculateMonitoringSla(v);

        const matchSearch =
          v.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
          v.rumahSakit.toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchSearch) return false;

        if (statusFilter === 'BELUM_KUNJUNG') {
          if (v.statusPemantauan !== 'Belum Dikunjungi') return false;
        } else if (statusFilter === 'TERLAMBAT') {
          if (!fSla.isOverdue && !mSla.isOverdue) return false;
        } else if (statusFilter === 'PERLU_PANTAU') {
          if (v.statusPemantauan !== 'Pemantauan Aktif') return false;
        }

        return (
          v.statusPemantauan === 'Belum Dikunjungi' ||
          v.statusPemantauan === 'Pemantauan Aktif' ||
          v.statusPemantauan === 'Menunggu Konfirmasi Kondisi' ||
          fSla.isOverdue ||
          mSla.isOverdue
        );
      })
      .sort((a, b) => {
        const aFSla = calculateFirstVisitSla(a.tanggalInformasiDiterima, a.kunjunganPertama);
        const bFSla = calculateFirstVisitSla(b.tanggalInformasiDiterima, b.kunjunganPertama);
        if (aFSla.isOverdue && !bFSla.isOverdue) return -1;
        if (!aFSla.isOverdue && bFSla.isOverdue) return 1;
        if (!a.kunjunganPertama && b.kunjunganPertama) return -1;
        if (a.kunjunganPertama && !b.kunjunganPertama) return 1;
        return new Date(b.tanggalInformasiDiterima) - new Date(a.tanggalInformasiDiterima);
      });
  }, [victims, searchTerm, statusFilter]);

  // Aktivitas Terbaru Petugas
  const recentActivities = useMemo(() => {
    const acts = [];
    victims.forEach((v) => {
      (v.riwayatAktivitas || []).forEach((act) => {
        acts.push({
          id: act.id,
          korbanId: v.id,
          namaKorban: v.nama,
          rumahSakit: v.rumahSakit,
          jenis: act.jenisAktivitas,
          waktu: act.tanggal,
          kondisi: act.kondisiKorban,
          catatan: act.hasilKomunikasi || act.hasilKunjungan || act.hasilPemantauan
        });
      });
    });
    acts.sort((a, b) => new Date(b.waktu).getTime() - new Date(a.waktu).getTime());
    return acts.slice(0, 6);
  }, [victims]);

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Dashboard Petugas</h1>
          <p className="text-xs text-slate-500 mt-1">
            Monitoring penugasan korban kecelakaan dan aktivitas pemantauan berkelanjutan.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsInputModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-sm shadow-blue-900/15 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Input Korban Baru</span>
          </button>

          <Link
            to="/petugas/korban"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 shadow-2xs transition-all"
          >
            <Users className="w-4 h-4 text-slate-500" />
            <span>Lihat Semua Korban</span>
          </Link>
        </div>
      </div>

      {/* 6 Kartu Ringkasan Terpisah (Membedakan Korban Unik vs Aktivitas) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Total Korban Unik */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              KORBAN UNIK
            </span>
            <Users className="w-4 h-4 text-[#145DA0]" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900">{metrics.totalKorbanUnik}</span>
            <span className="text-xs text-slate-400 ml-1">orang</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5 border-t border-slate-100 pt-1.5">
            Total pasien ditugaskan
          </p>
        </div>

        {/* 2. Total Kunjungan Pertama */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              KUNJUNGAN PERTAMA
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-emerald-700">{metrics.totalKunjunganPertama}</span>
            <span className="text-xs text-slate-400 ml-1">selesai</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5 border-t border-slate-100 pt-1.5">
            Target SLA 72 jam
          </p>
        </div>

        {/* 3. Total Pemantauan Lanjutan */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              PEMANTAUAN LANJUTAN
            </span>
            <Activity className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-sky-700">{metrics.totalPemantauanLanjutan}</span>
            <span className="text-xs text-slate-400 ml-1">catatan</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5 border-t border-slate-100 pt-1.5">
            Aktivitas berkala
          </p>
        </div>

        {/* 4. Total Seluruh Aktivitas */}
        <div className="bg-white rounded-xl border border-blue-200 p-3.5 shadow-2xs bg-blue-50/20">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#145DA0] uppercase tracking-wider">
              TOTAL AKTIVITAS
            </span>
            <FileText className="w-4 h-4 text-[#145DA0]" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-[#145DA0]">{metrics.totalSeluruhAktivitas}</span>
            <span className="text-xs text-blue-600 ml-1">kegiatan</span>
          </div>
          <p className="text-[10px] text-blue-700 mt-1.5 border-t border-blue-100 pt-1.5">
            Kunjungan + pantau
          </p>
        </div>

        {/* 5. Pemantauan Aktif */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              PEMANTAUAN AKTIF
            </span>
            <Clock className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-sky-800">{metrics.pemantauanAktif}</span>
            <span className="text-xs text-slate-400 ml-1">pasien</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5 border-t border-slate-100 pt-1.5">
            Masih dirawat / dirujuk
          </p>
        </div>

        {/* 6. Perlu Tindak Lanjut */}
        <div className="bg-white rounded-xl border border-amber-200 p-3.5 shadow-2xs bg-amber-50/20">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
              PERLU TINDAK LANJUT
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-amber-800">{metrics.perluTindakLanjut}</span>
            <span className="text-xs text-amber-700 ml-1">kasus</span>
          </div>
          <p className="text-[10px] text-amber-800 mt-1.5 border-t border-amber-100 pt-1.5">
            Perlu kunjungan/pantau
          </p>
        </div>
      </div>

      {/* Bagian Prioritas Tindak Lanjut */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Prioritas Tindak Lanjut
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Daftar korban yang memerlukan kunjungan awal atau pemantauan lanjutan segera.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari nama atau RS..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Prioritas</option>
              <option value="BELUM_KUNJUNG">Belum Dikunjungi</option>
              <option value="TERLAMBAT">Kunjungan Terlambat</option>
              <option value="PERLU_PANTAU">Pemantauan Aktif</option>
            </select>
          </div>
        </div>

        {/* Tabel Prioritas */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3 px-4">Nama Korban</th>
                <th className="py-3 px-4">Rumah Sakit</th>
                <th className="py-3 px-4">Tgl Masuk RS</th>
                <th className="py-3 px-4">Status Pemantauan</th>
                <th className="py-3 px-4">Kondisi Terakhir</th>
                <th className="py-3 px-4">Status SLA</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {priorityVictims.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    Tidak ada korban yang memerlukan prioritas tindak lanjut mendesak.
                  </td>
                </tr>
              ) : (
                priorityVictims.map((v) => {
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
                        <Link to={`/petugas/korban/${v.id}`} className="hover:underline hover:text-[#145DA0]">
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
                        <MonitoringStatusBadge status={v.statusPemantauan} />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <ConditionBadge
                          kondisi={v.kondisiTerakhir}
                          statusKonfirmasi={v.statusKonfirmasiKondisi}
                        />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <SlaBadge slaInfo={activeSla} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setMonitoringVictim(v)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-50 text-[#145DA0] hover:bg-sky-100 border border-sky-200 transition-colors cursor-pointer"
                            title="Lakukan pemantauan"
                          >
                            <Activity className="w-3.5 h-3.5" />
                            <span>+ Pantau</span>
                          </button>
                          <Link
                            to={`/petugas/korban/${v.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
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
      </div>

      {/* Bagian Aktivitas Terbaru Petugas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-[#145DA0]" />
              Aktivitas Terbaru Petugas
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Seluruh riwayat kunjungan dan pemantauan lanjutan yang berhasil dicatat.
            </p>
          </div>
          <Link
            to="/petugas/riwayat"
            className="text-xs font-semibold text-[#145DA0] hover:underline flex items-center gap-1"
          >
            <span>Semua Riwayat</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentActivities.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">
            Belum ada aktivitas kunjungan atau pemantauan yang dicatat.
          </p>
        ) : (
          <div className="space-y-2.5">
            {recentActivities.map((act) => (
              <div
                key={act.id}
                className="flex items-start justify-between gap-3 p-3 rounded-xl bg-slate-50/80 border border-slate-100 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    act.jenis === 'Kunjungan Pertama' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-[#145DA0]'
                  }`}>
                    {act.jenis === 'Kunjungan Pertama' ? <CheckCircle2 className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-slate-800">{act.namaKorban}</span>
                      <span className="text-[10px] bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                        {act.jenis}
                      </span>
                      <span className="text-[10px] text-slate-500">{act.rumahSakit}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-1">{act.catatan}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[11px] text-slate-400 block">{formatTimeAgo(act.waktu)}</span>
                  <Link
                    to={`/petugas/korban/${act.korbanId}`}
                    className="text-[11px] text-[#145DA0] font-semibold hover:underline mt-1 inline-block"
                  >
                    Detail Korban
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Input Korban Baru */}
      <FormInputKorbanModal
        isOpen={isInputModalOpen}
        onClose={() => setIsInputModalOpen(false)}
        onVictimCreated={() => loadData()}
      />

      {/* Modal Pemantauan Cepat */}
      {monitoringVictim && (
        <FormPemantauanModal
          isOpen={!!monitoringVictim}
          onClose={() => setMonitoringVictim(null)}
          victim={monitoringVictim}
          onMonitoringSaved={() => loadData()}
        />
      )}
    </div>
  );
}
