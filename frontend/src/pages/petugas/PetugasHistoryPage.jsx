import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import ModalDetailKunjunganReadOnly from '../../components/petugas/ModalDetailKunjunganReadOnly';
import { formatDateIndo, formatTimeIndo } from '../../utils/dateUtils';
import {
  History,
  Search,
  Calendar,
  Building2,
  CheckCircle2,
  Activity,
  Eye,
  RotateCcw,
  User,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CheckCheck
} from 'lucide-react';

function formatDateShort(dateStr) {
  return formatDateIndo(dateStr);
}

const PAGE_SIZE = 10;

export default function PetugasHistoryPage() {
  const { currentUser } = useAuth();
  const officerId = currentUser?.profile?.id || 'PET-01';

  const [victims, setVictims] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterCondition, setFilterCondition] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedVisitForDetail, setSelectedVisitForDetail] = useState(null);

  const loadData = () => {
    const activeOfficerIdent = officerId || currentUser?.profile?.id || currentUser?.profile?.backendOfficerId || currentUser?.profile?.nama;
    const myVictims = storageService.getVictimsByOfficer(activeOfficerIdent);
    setVictims(myVictims);
  };

  useEffect(() => {
    storageService.syncWithBackend(true).catch(() => {});
    loadData();
    window.addEventListener('jr_victims_updated', loadData);
    return () => window.removeEventListener('jr_victims_updated', loadData);
  }, [officerId]);

  // Ekstraksi komprehensif seluruh riwayat kunjungan & pemantauan yang telah selesai dilaksanakan
  const allActivities = useMemo(() => {
    const list = [];
    const seen = new Set();

    const pushActivity = (v, item, rawDate, fallbackKey, defaultJenis) => {
      if (!item || item.statusKunjungan === 'Menunggu' || !rawDate) return;
      const uniqueKey = item.id || fallbackKey;
      if (seen.has(uniqueKey)) return;
      seen.add(uniqueKey);
      list.push({
        ...item,
        id: uniqueKey,
        rawDate: new Date(rawDate),
        jenisAktivitas: defaultJenis,
        victimId: v.id,
        korbanNama: v.nama,
        nik: v.nik,
        nomorLaporan: v.nomorLaporan,
        rumahSakit: item.rumahSakit || v.rumahSakit,
        kondisiKorban: item.kondisiKorban || item.kondisi || v.kondisiTerakhir
      });
    };

    victims.forEach((v) => {
      if (v.kunjunganPertama) {
        const kp = v.kunjunganPertama;
        const kpDate = kp.waktuAktualKunjungan || kp.tanggalKunjungan || kp.waktuFoto || v.tanggalKunjunganTerakhir || kp.tanggal;
        pushActivity(v, kp, kpDate, `${v.id}-kp-${kpDate}`, 'Kunjungan Pertama');
      }

      if (Array.isArray(v.riwayatAktivitas)) {
        v.riwayatAktivitas.forEach((act) => {
          const d = act?.waktuAktualKunjungan || act?.tanggalKunjungan || act?.tanggal || act?.waktuFoto;
          pushActivity(v, act, d, `${v.id}-${d}`, act?.jenisAktivitas || 'Kunjungan Pemantauan');
        });
      }

      if (Array.isArray(v.riwayatKunjungan)) {
        v.riwayatKunjungan.forEach((vis, idx) => {
          const d = vis?.waktuAktualKunjungan || vis?.tanggalKunjungan || vis?.tanggal;
          pushActivity(v, vis, d, `${v.id}-vis-${d}`, vis?.jenisAktivitas || (idx === 0 ? 'Kunjungan Pertama' : 'Kunjungan Pemantauan'));
        });
      }

      if (Array.isArray(v.riwayatPemantauan)) {
        v.riwayatPemantauan.forEach((mon) => {
          const d = mon?.waktuAktualKunjungan || mon?.tanggal;
          pushActivity(v, mon, d, `${v.id}-mon-${d}`, mon?.jenisAktivitas || 'Pemantauan Berkala');
        });
      }
    });

    list.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());
    return list;
  }, [victims]);

  // Hitung metrik ringkasan riwayat
  const historyMetrics = useMemo(() => {
    let firstVisits = 0;
    let monitoringVisits = 0;
    let finishedPatients = 0;

    allActivities.forEach((act) => {
      if (act.jenisAktivitas === 'Kunjungan Pertama') firstVisits++;
      else monitoringVisits++;

      const cond = act.kondisiKorban || '';
      if (['Sudah Pulang', 'Pulang', 'Selesai'].includes(cond)) finishedPatients++;
    });

    return {
      total: allActivities.length,
      firstVisits,
      monitoringVisits,
      finishedPatients
    };
  }, [allActivities]);

  const filtered = useMemo(() => {
    return allActivities.filter((act) => {
      const matchSearch =
        act.korbanNama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        act.rumahSakit?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        act.nik?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (act.nomorLaporan && act.nomorLaporan.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (act.hasilKomunikasi && act.hasilKomunikasi.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchSearch) return false;

      if (filterType !== 'ALL') {
        if (filterType === 'Kunjungan Pertama') {
          if (act.jenisAktivitas !== 'Kunjungan Pertama') return false;
        } else if (filterType === 'Pemantauan') {
          if (act.jenisAktivitas === 'Kunjungan Pertama') return false;
        }
      }

      if (filterCondition !== 'ALL') {
        const cond = act.kondisiKorban || '';
        if (filterCondition === 'Selesai' && !['Sudah Pulang', 'Pulang', 'Selesai'].includes(cond)) return false;
        if (filterCondition === 'Masih Dirawat' && !['Masih Dirawat', 'Rawat Inap'].includes(cond)) return false;
        if (filterCondition === 'Dirujuk' && !cond.startsWith('Dirujuk')) return false;
        if (filterCondition === 'Meninggal Dunia' && !cond.includes('Meninggal')) return false;
      }

      return true;
    });
  }, [allActivities, searchTerm, filterType, filterCondition]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const renderConditionPill = (kondisi) => {
    if (kondisi === 'Sudah Pulang' || kondisi === 'Pulang' || kondisi === 'Selesai') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>Selesai</span>
        </span>
      );
    }
    if (typeof kondisi === 'string' && kondisi.startsWith('Dirujuk')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          <span>Dirujuk</span>
        </span>
      );
    }
    if (kondisi === 'Meninggal Dunia' || kondisi === 'Meninggal') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          <span>Meninggal</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-[#145DA0] border border-blue-200/80">
        <span className="w-1.5 h-1.5 rounded-full bg-[#145DA0]"></span>
        <span>{kondisi || 'Masih Dirawat'}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── 1. PAGE HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Riwayat Kunjungan
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Daftar lengkap rekam jejak kunjungan rumah sakit dan pemantauan berkala yang telah Anda laksanakan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3.5 py-1.5 rounded-xl bg-blue-50 text-[#145DA0] border border-blue-200/80 shadow-2xs">
            Total {allActivities.length} Kunjungan Selesai
          </span>
        </div>
      </div>

      {/* ── 2. SUMMARY KPI STAT CARDS (SERAGAM DENGAN DASHBOARD & DAFTAR KORBAN) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Kunjungan</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#145DA0] flex items-center justify-center border border-blue-100 shrink-0">
              <ClipboardCheck className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-slate-900 block mt-2">
            {historyMetrics.total}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">Kunjungan terlaksana</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kunjungan Pertama</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-indigo-600 block mt-2">
            {historyMetrics.firstVisits}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">Kunjungan awal RS</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pemantauan Berkala</span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-[#145DA0] flex items-center justify-center border border-sky-100 shrink-0">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-[#145DA0] block mt-2">
            {historyMetrics.monitoringVisits}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">Kunjungan rutin lanjutan</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pasien Selesai Pulang</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
              <CheckCheck className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-emerald-600 block mt-2">
            {historyMetrics.finishedPatients}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">Perawatan tuntas</span>
        </div>
      </div>

      {/* ── 3. FILTER BAR ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari berdasarkan nama korban, NIK, ID berkas, rumah sakit, atau catatan..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0] transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-slate-700 flex-1 sm:flex-initial"
            >
              <option value="ALL">Semua Jenis Kunjungan</option>
              <option value="Kunjungan Pertama">Kunjungan Pertama</option>
              <option value="Pemantauan">Pemantauan Berkala</option>
            </select>

            <select
              value={filterCondition}
              onChange={(e) => {
                setFilterCondition(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-slate-700 flex-1 sm:flex-initial"
            >
              <option value="ALL">Semua Kondisi</option>
              <option value="Masih Dirawat">Masih Dirawat</option>
              <option value="Selesai">Selesai / Pulang</option>
              <option value="Dirujuk">Dirujuk</option>
              <option value="Meninggal Dunia">Meninggal Dunia</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFilterType('ALL');
                setFilterCondition('ALL');
                setCurrentPage(1);
              }}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer shrink-0"
              title="Reset Filter"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── 4. TABEL UTAMA RIWAYAT KUNJUNGAN (DUAL RESPONSIVE) ──
          Kolom: NO. | KORBAN / ID BERKAS | RUMAH SAKIT | TANGGAL KUNJUNGAN | JENIS KUNJUNGAN | STATUS KORBAN | AKSI */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* DESKTOP TABLE VIEW */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/90 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4 w-12 text-center">NO.</th>
                <th className="py-3.5 px-4">KORBAN / ID BERKAS</th>
                <th className="py-3.5 px-4">RUMAH SAKIT</th>
                <th className="py-3.5 px-4">TANGGAL KUNJUNGAN</th>
                <th className="py-3.5 px-4">JENIS KUNJUNGAN</th>
                <th className="py-3.5 px-4">STATUS KORBAN</th>
                <th className="py-3.5 px-4 text-right">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">Tidak ada riwayat kunjungan yang sesuai dengan filter.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Kunjungan yang telah Anda laksanakan akan otomatis tercatat di sini.</p>
                  </td>
                </tr>
              ) : (
                paginated.map((act, idx) => {
                  const number = String((currentPage - 1) * PAGE_SIZE + idx + 1).padStart(2, '0');
                  const isFirstVisit = act.jenisAktivitas === 'Kunjungan Pertama';

                  return (
                    <tr key={act.id || idx} className="hover:bg-slate-50/70 transition-colors">
                      {/* NO. */}
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-center font-medium">
                        {number}
                      </td>

                      {/* KORBAN / ID BERKAS */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-[#145DA0] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                            <User className="w-4 h-4 text-[#145DA0]" />
                          </div>
                          <div>
                            <Link
                              to={`/petugas/korban/${act.victimId}`}
                              className="font-bold text-slate-900 hover:text-[#145DA0] hover:underline block text-xs"
                            >
                              {act.korbanNama}
                            </Link>
                            <span className="text-[10px] text-slate-400 font-mono font-normal block">
                              {act.nomorLaporan ? act.nomorLaporan : (act.nik ? `NIK: ${act.nik}` : `ID: ${act.victimId}`)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* RUMAH SAKIT */}
                      <td className="py-3.5 px-4 text-slate-800 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{act.rumahSakit}</span>
                        </div>
                      </td>

                      {/* TANGGAL KUNJUNGAN */}
                      <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                        <span className="font-semibold text-slate-800 block text-xs">
                          {formatDateShort(act.waktuAktualKunjungan || act.tanggal || act.rawDate)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium block">
                          {formatTimeIndo(act.waktuAktualKunjungan || act.tanggal || act.rawDate)}
                        </span>
                      </td>

                      {/* JENIS KUNJUNGAN */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            isFirstVisit
                              ? 'bg-blue-50 text-[#145DA0] border-blue-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {isFirstVisit ? <CheckCircle2 className="w-3 h-3 text-[#145DA0]" /> : <Activity className="w-3 h-3 text-slate-500" />}
                          <span>{act.jenisAktivitas || 'Kunjungan'}</span>
                        </span>
                      </td>

                      {/* STATUS KORBAN (Single Dot Pill) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderConditionPill(act.kondisiKorban)}
                      </td>

                      {/* AKSI */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedVisitForDetail(act)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                            title="Lihat Bukti & Detail Kunjungan (Read-Only)"
                          >
                            <Eye className="w-4 h-4 text-slate-600" />
                          </button>

                          <Link
                            to={`/petugas/korban/${act.victimId}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            title="Buka Halaman Detail Korban"
                          >
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

        {/* MOBILE CARD VIEW (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {paginated.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <p className="font-semibold text-slate-600 text-xs">Tidak ada riwayat kunjungan yang sesuai.</p>
            </div>
          ) : (
            paginated.map((act, idx) => {
              const number = String((currentPage - 1) * PAGE_SIZE + idx + 1).padStart(2, '0');
              const isFirstVisit = act.jenisAktivitas === 'Kunjungan Pertama';

              return (
                <div key={act.id || idx} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-50 text-[#145DA0] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                        <User className="w-4 h-4 text-[#145DA0]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-slate-400 font-bold">#{number}</span>
                          <Link
                            to={`/petugas/korban/${act.victimId}`}
                            className="font-bold text-slate-900 text-xs hover:text-[#145DA0] truncate block"
                          >
                            {act.korbanNama}
                          </Link>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {act.nomorLaporan || (act.nik ? `NIK: ${act.nik}` : `ID: ${act.victimId}`)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {renderConditionPill(act.kondisiKorban)}
                    </div>
                  </div>

                  {/* Faskes, Waktu & Jenis */}
                  <div className="bg-slate-50 rounded-xl p-2.5 text-[11px] text-slate-600 space-y-1.5 border border-slate-100">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{act.rumahSakit}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{formatDateShort(act.waktuAktualKunjungan || act.tanggal || act.rawDate)}, {formatTimeIndo(act.waktuAktualKunjungan || act.tanggal || act.rawDate)}</span>
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          isFirstVisit
                            ? 'bg-blue-50 text-[#145DA0] border-blue-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {act.jenisAktivitas || 'Kunjungan'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedVisitForDetail(act)}
                      className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>Bukti Kunjungan</span>
                    </button>
                    <Link
                      to={`/petugas/korban/${act.victimId}`}
                      className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center gap-1"
                    >
                      <span>Detail Korban</span>
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Bar */}
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
              dari <span className="font-semibold text-slate-700">{filtered.length}</span> kunjungan
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

      {/* Modal Detail Kunjungan Read-Only */}
      {selectedVisitForDetail && (
        <ModalDetailKunjunganReadOnly
          isOpen={!!selectedVisitForDetail}
          onClose={() => setSelectedVisitForDetail(null)}
          activity={selectedVisitForDetail}
          victim={victims.find((v) => v.id === selectedVisitForDetail.victimId)}
        />
      )}
    </div>
  );
}
