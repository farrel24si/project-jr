import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { storageService } from '../../services/storageService';
import {
  calculateFirstVisitSla,
  calculateMonitoringSla,
  getVictimDeadline,
  compareVictimsBySlaPriority
} from '../../services/slaService';
import { isVictimFinished } from '../../utils/monitoringStatus';
import { formatDateIndo, formatDateTimeIndo } from '../../utils/dateUtils';
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
  History,
  CalendarCheck
} from 'lucide-react';

function formatDateShort(dateStr) {
  return formatDateIndo(dateStr);
}

function formatDateTimeShort(dateStr) {
  return formatDateTimeIndo(dateStr);
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
  const [slaFilter, setSlaFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('TENGGAT_PRIORITAS'); // TENGGAT_PRIORITAS (Mendekati tenggat teratas), NEWEST, NAME

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

  // Statistik Monitoring Kunjungan
  const stats = useMemo(() => {
    let terlambat = 0;
    let mendekatiTenggat = 0;
    let tepatWaktu = 0;
    let belumDikunjungi = 0;

    const now = new Date();

    victims.forEach((v) => {
      const isDone = isVictimFinished(v);

      if (isDone) return;

      const firstPending = !v.kunjunganPertama && (!v.riwayatKunjungan || v.riwayatKunjungan.length === 0);

      if (firstPending) {
        belumDikunjungi++;
        const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama, now);
        if (fSla.isOverdue) terlambat++;
        else if (fSla.isWarning) mendekatiTenggat++;
        else tepatWaktu++;
      } else {
        const mSla = calculateMonitoringSla(v, now);
        if (mSla.isOverdue) terlambat++;
        else if (mSla.isWarning) mendekatiTenggat++;
        else tepatWaktu++;
      }
    });

    return { terlambat, mendekatiTenggat, tepatWaktu, belumDikunjungi };
  }, [victims]);

  // Evaluasi Status Kunjungan & SLA per Korban
  const evaluateVictimVisitStatus = (v, now = new Date()) => {
    const isDone = isVictimFinished(v);

    const deadline = getVictimDeadline(v, now);
    const firstPending = !v.kunjunganPertama && (!v.riwayatKunjungan || v.riwayatKunjungan.length === 0);

    let visitState = 'TEPAT_WAKTU';
    let statusLabel = 'Tepat Waktu';
    let badgeClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
    let urgencyScore = 4;
    let sisaWaktuJam = 72;

    if (isDone) {
      return {
        isDone: true,
        visitState: 'SELESAI',
        statusLabel: 'Selesai Dipantau',
        badgeClass: 'text-slate-600 bg-slate-50 border-slate-200',
        deadline: null,
        urgencyScore: 5,
        sisaWaktuJam: Infinity
      };
    }

    if (firstPending) {
      const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama, now);
      if (fSla.isOverdue) {
        visitState = 'TERLAMBAT';
        statusLabel = `Terlambat (${Math.abs(fSla.diffHours)} Jam)`;
        badgeClass = 'text-rose-700 bg-rose-50 border-rose-300 font-bold';
        urgencyScore = 1; // Prioritas 1: TERLAMBAT / LEWAT PALING ATAS!
        sisaWaktuJam = -(Math.abs(fSla.diffHours) || 1);
      } else if (fSla.isWarning) {
        visitState = 'MENDEKATI_TENGGAT';
        statusLabel = `Mendekati Tenggat (Sisa ${fSla.diffHours} Jam)`;
        badgeClass = 'text-amber-800 bg-amber-50 border-amber-300 font-bold';
        urgencyScore = 2; // Prioritas 2: MENDEKATI TENGGAT
        sisaWaktuJam = fSla.diffHours || 1;
      } else {
        visitState = 'MENUNGGU';
        statusLabel = 'Menunggu Kunjungan Awal';
        badgeClass = 'text-blue-700 bg-blue-50 border-blue-200 font-semibold';
        urgencyScore = 3;
        sisaWaktuJam = fSla.diffHours || 72;
      }
    } else {
      const mSla = calculateMonitoringSla(v, now);
      if (mSla.isOverdue) {
        visitState = 'TERLAMBAT';
        statusLabel = `Melewati SLA 3 Hari (${mSla.elapsedHours} Jam)`;
        badgeClass = 'text-rose-700 bg-rose-50 border-rose-300 font-bold';
        urgencyScore = 1; // Prioritas 1: TERLAMBAT / LEWAT PALING ATAS!
        sisaWaktuJam = -(mSla.elapsedHours || 1);
      } else if (mSla.isWarning) {
        visitState = 'MENDEKATI_TENGGAT';
        statusLabel = `Batas SLA 3 Hari (< 24 Jam)`;
        badgeClass = 'text-amber-800 bg-amber-50 border-amber-300 font-bold';
        urgencyScore = 2; // Prioritas 2: MENDEKATI TENGGAT
        sisaWaktuJam = mSla.hoursRemaining || 1;
      } else {
        visitState = 'TEPAT_WAKTU';
        statusLabel = 'Sesuai Standar SLA 3 Hari';
        badgeClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
        urgencyScore = 4;
        sisaWaktuJam = mSla.hoursRemaining || 72;
      }
    }

    return {
      isDone: false,
      visitState,
      statusLabel,
      badgeClass,
      deadline,
      urgencyScore,
      sisaWaktuJam
    };
  };

  // Filter & Sort
  const filteredAndSorted = useMemo(() => {
    const now = new Date();

    let list = victims.map((v) => {
      const evalStatus = evaluateVictimVisitStatus(v, now);
      const visits = [
        ...(v.riwayatAktivitas || []),
        ...(v.riwayatKunjungan || [])
      ];
      const totalKunjungan = v.kunjunganPertama ? Math.max(1, visits.length) : visits.length;

      // Kunjungan terakhir
      const lastVisit = visits[visits.length - 1] || v.kunjunganPertama || null;
      const lastVisitDate = lastVisit?.tanggalKunjungan || lastVisit?.tanggal || lastVisit?.waktuAktualKunjungan || lastVisit?.waktuSelesai || null;

      return {
        ...v,
        evalStatus,
        totalKunjungan,
        lastVisitDate
      };
    });

    // Filtering
    list = list.filter((v) => {
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
        if (!matchesHospitalFilter(v, hospitalFilter)) return false;
      }

      if (slaFilter !== 'ALL') {
        if (slaFilter === 'WARNING' && v.evalStatus.visitState !== 'MENDEKATI_TENGGAT') return false;
        if (slaFilter === 'OVERDUE' && v.evalStatus.visitState !== 'TERLAMBAT') return false;
        if (slaFilter === 'MENUNGGU' && v.evalStatus.visitState !== 'MENUNGGU') return false;
        if (slaFilter === 'ON_TIME' && v.evalStatus.visitState !== 'TEPAT_WAKTU') return false;
        if (slaFilter === 'COMPLETED' && v.evalStatus.visitState !== 'SELESAI') return false;
      }

      return true;
    });

    // PENGURUTAN: Default adalah TENGGAT_PRIORITAS (Terlambat paling atas, lalu Mendekati Tenggat)
    list.sort((a, b) => {
      if (sortBy === 'TENGGAT_PRIORITAS') {
        return compareVictimsBySlaPriority(a, b, now);
      }
      if (sortBy === 'NEWEST') {
        const tA = new Date(a.tanggalMasukRs || a.tanggalInformasiDiterima || 0).getTime();
        const tB = new Date(b.tanggalMasukRs || b.tanggalInformasiDiterima || 0).getTime();
        return tB - tA;
      }
      if (sortBy === 'NAME') {
        return (a.nama || '').localeCompare(b.nama || '');
      }
      return 0;
    });

    return list;
  }, [victims, search, officerFilter, hospitalFilter, slaFilter, sortBy]);

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
    setSlaFilter('ALL');
    setSortBy('TENGGAT_PRIORITAS');
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

  return (
    <div className="space-y-6 pb-14">
      {/* ── 1. HEADER HALAMAN ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Monitoring Kunjungan
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Supervisi jadwal kunjungan pemantauan korban, kepatuhan batas waktu SLA maksimal 3 hari (72 jam), riwayat kunjungan, dan status keterlambatan tugas.
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
        {/* Mendekati Tenggat (Prioritas Utama) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mendekati Batas SLA</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <span className={`text-3xl font-black font-mono tracking-tight block mt-2 ${
            stats.mendekatiTenggat > 0 ? 'text-amber-600' : 'text-slate-900'
          }`}>
            {stats.mendekatiTenggat}
          </span>
        </div>

        {/* Kunjungan Terlambat */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kunjungan Terlambat</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <span className={`text-3xl font-black font-mono tracking-tight block mt-2 ${
            stats.terlambat > 0 ? 'text-rose-600' : 'text-slate-900'
          }`}>
            {stats.terlambat}
          </span>
        </div>

        {/* Belum Dikunjungi (Menunggu) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Menunggu Kunjungan</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#145DA0] border border-blue-100 flex items-center justify-center shrink-0">
              <CalendarCheck className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-blue-700 block mt-2">
            {stats.belumDikunjungi}
          </span>
        </div>

        {/* Tepat Waktu (Sesuai SLA) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sesuai SLA</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-emerald-600 block mt-2">
            {stats.tepatWaktu}
          </span>
        </div>
      </div>

      {/* ── 3. FILTER DAN PENCARIAN ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Pencarian */}
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

          {/* Filter Status SLA */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Status Kunjungan &amp; SLA
            </label>
            <select
              value={slaFilter}
              onChange={(e) => {
                setSlaFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-700 font-semibold focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Status Kunjungan</option>
              <option value="WARNING">Mendekati Batas SLA (&lt; 24 Jam)</option>
              <option value="OVERDUE">Kunjungan Terlambat (&gt; 3 Hari)</option>
              <option value="MENUNGGU">Menunggu Kunjungan Awal</option>
              <option value="ON_TIME">Tepat Waktu (Sesuai SLA)</option>
              <option value="COMPLETED">Selesai Dipantau</option>
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

          {/* Filter RS */}
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

          {/* Urutan */}
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
              <option value="TENGGAT_PRIORITAS">Mendekati Tenggat SLA Teratas</option>
              <option value="NEWEST">Korban Masuk Terbaru</option>
              <option value="NAME">Nama Korban (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Filter Summary & Reset */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
          <span>
            Menampilkan <strong>{filteredAndSorted.length}</strong> data monitoring kunjungan
          </span>
          {(search || officerFilter !== 'ALL' || hospitalFilter !== 'ALL' || slaFilter !== 'ALL' || sortBy !== 'TENGGAT_PRIORITAS') && (
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

      {/* ── 4. TABEL MONITORING KUNJUNGAN ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* DESKTOP TABLE */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/90 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4 w-12 text-center">NO.</th>
                <th className="py-3.5 px-4">KORBAN &amp; RS</th>
                <th className="py-3.5 px-4">PETUGAS JR</th>
                <th className="py-3.5 px-4">BATAS JADWAL / BERIKUTNYA</th>
                <th className="py-3.5 px-4">KUNJUNGAN TERAKHIR</th>
                <th className="py-3.5 px-4 text-center">TOTAL KUNJUNGAN</th>
                <th className="py-3.5 px-4">STATUS KEPATUHAN SLA</th>
                <th className="py-3.5 px-4 text-right">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <CalendarCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">Tidak ada jadwal kunjungan yang sesuai.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Ubah filter pencarian atau segarkan data di atas.</p>
                  </td>
                </tr>
              ) : (
                paginatedData.map((v, idx) => {
                  const number = String((currentPage - 1) * PAGE_SIZE + idx + 1).padStart(2, '0');
                  const initials = getInitials(v.nama);
                  const officerInfo = getOfficerInfo(v);
                  const deadlineStr = v.evalStatus.deadline ? formatDateTimeShort(v.evalStatus.deadline) : '—';
                  const isUrgentApproaching = v.evalStatus.visitState === 'MENDEKATI_TENGGAT';
                  const refInfo = getReferralPerspectiveInfo(v, hospitalFilter);

                  return (
                    <tr
                      key={v.id}
                      className={`transition-colors ${
                        isUrgentApproaching
                          ? 'bg-amber-50/30 hover:bg-amber-50/60'
                          : 'hover:bg-slate-50/70'
                      }`}
                    >
                      {/* NO */}
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-center font-medium">
                        {number}
                      </td>

                      {/* KORBAN & RS */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <div>
                          <button
                            type="button"
                            onClick={() => setSelectedVictim(v)}
                            className="font-bold text-slate-900 hover:text-[#145DA0] hover:underline block text-xs text-left cursor-pointer"
                          >
                            {v.nama}
                          </button>
                          <span className="text-[10px] text-slate-500 font-normal flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            <span>{refInfo.displayHospital}</span>
                          </span>
                        </div>
                      </td>

                      {/* PETUGAS JR -> Clickable Link ke Kinerja Petugas */}
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

                      {/* BATAS JADWAL BERIKUTNYA */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                          <Clock className={`w-3.5 h-3.5 ${
                            isUrgentApproaching ? 'text-amber-600' : 'text-slate-400'
                          }`} />
                          <span className={isUrgentApproaching ? 'text-amber-800 font-bold' : ''}>
                            {deadlineStr}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Standar SLA maks. 3 hari
                        </span>
                      </td>

                      {/* KUNJUNGAN TERAKHIR */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{v.lastVisitDate ? formatDateTimeShort(v.lastVisitDate) : 'Belum Pernah'}</span>
                        </div>
                      </td>

                      {/* TOTAL KUNJUNGAN */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded-lg border border-slate-200">
                          {v.totalKunjungan}x Kunjungan
                        </span>
                      </td>

                      {/* STATUS KEPATUHAN SLA */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border ${v.evalStatus.badgeClass}`}>
                          {isUrgentApproaching && <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>}
                          <span>{v.evalStatus.statusLabel}</span>
                        </span>
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
              <CalendarCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-600 text-xs">Tidak ada data jadwal monitoring.</p>
            </div>
          ) : (
            paginatedData.map((v, idx) => {
              const number = String((currentPage - 1) * PAGE_SIZE + idx + 1).padStart(2, '0');
              const initials = getInitials(v.nama);
              const officerInfo = getOfficerInfo(v);
              const isUrgentApproaching = v.evalStatus.visitState === 'MENDEKATI_TENGGAT';
              const refInfo = getReferralPerspectiveInfo(v, hospitalFilter);

              return (
                <div
                  key={v.id}
                  className={`p-4 space-y-3 transition-colors ${
                    isUrgentApproaching ? 'bg-amber-50/20' : 'hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-mono text-slate-400">#{number}</span>
                      <h4 className="font-bold text-slate-900 text-xs leading-tight">
                        {v.nama}
                      </h4>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span>{refInfo.displayHospital}</span>
                      </span>
                    </div>

                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${v.evalStatus.badgeClass}`}>
                      {v.evalStatus.statusLabel}
                    </span>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-2.5 space-y-1.5 text-[11px] border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Petugas JR:</span>
                      {officerInfo.id ? (
                        <Link
                          to={`/kabag/kinerja?tab=detail&officerId=${officerInfo.id}`}
                          className="font-bold text-[#145DA0] hover:underline"
                        >
                          {officerInfo.name}
                        </Link>
                      ) : (
                        <strong className="text-slate-800">{officerInfo.name}</strong>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Tenggat Jadwal:</span>
                      <span className="font-bold text-slate-700">
                        {v.evalStatus.deadline ? formatDateTimeShort(v.evalStatus.deadline) : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Total Kunjungan:</span>
                      <span className="font-mono font-bold text-slate-800">{v.totalKunjungan}x kunjungan</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedVictim(v)}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#145DA0] bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat Riwayat &amp; Detail Kunjungan</span>
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
            Halaman <strong>{currentPage}</strong> dari <strong>{totalPages}</strong> ({filteredAndSorted.length} data kunjungan)
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
