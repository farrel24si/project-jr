import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Briefcase, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Search, 
  ChevronRight, 
  ChevronLeft, 
  Calendar, 
  Filter, 
  RotateCcw, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Eye, 
  MapPin, 
  CalendarCheck, 
  TrendingUp,
  FileSpreadsheet
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';

export default function KabagOfficerPerformance() {
  const navigate = useNavigate();

  const [victims, setVictims] = useState([]);
  const [officers, setOfficers] = useState([]);

  // ── FILTER STATE ──
  const [periodFilter, setPeriodFilter] = useState('THIS_YEAR'); // THIS_YEAR, THIS_MONTH, LAST_MONTH, ALL
  const [selectedYear, setSelectedYear] = useState('2026');
  const [officerSearch, setOfficerSearch] = useState('');

  // ── SORTING & PAGINATION STATE ──
  // sortField: 'nama' | 'korban' | 'terlambat' | 'ketepatan'
  const [sortField, setSortField] = useState('ketepatan');
  const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5); // Default 5 agar pagination langsung aktif untuk 6 petugas

  const filterValidOfficers = (list) => {
    const DUMMY_FILTER = ['citra dewi', 'budi santoso', 'eko prasetyo', 'doni setiawan', 'maya anggraini', 'hendra pratama', 'siti nurhaliza', 'dimas anggara', 'ahmad fauzi', 'adi putra'];
    return (list || []).filter((o) => {
      const lower = (o.nama || '').toLowerCase();
      return !DUMMY_FILTER.some((d) => lower.includes(d));
    });
  };

  const loadData = () => {
    setVictims(storageService.getVictims());
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

  // ── 1. FILTER KORBAN & AKTIVITAS SESUAI PERIODE ──
  const periodFilteredVictims = useMemo(() => {
    if (periodFilter === 'ALL') return victims;

    return victims.filter((v) => {
      const datesToCheck = [
        v.tanggalInformasiDiterima,
        v.tanggalKecelakaan,
        ...(v.riwayatAktivitas || []).map((a) => a.tanggalKunjungan || a.tanggal || a.waktuSelesai)
      ].filter(Boolean);

      if (datesToCheck.length === 0) return true;

      return datesToCheck.some((dateStr) => {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        const y = String(d.getFullYear());
        const m = d.getMonth(); // 0 = Jan, 9 = Okt, 10 = Nov

        if (periodFilter === 'THIS_YEAR') {
          return y === selectedYear;
        }
        if (periodFilter === 'SIX_MONTHS') {
          const now = new Date();
          const target = new Date(d.getFullYear(), d.getMonth(), 1);
          const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
          return target >= sixMonthsAgo && target <= now;
        }
        if (periodFilter === 'THIS_MONTH') {
          const now = new Date();
          return y === selectedYear && m === now.getMonth();
        }
        if (periodFilter === 'LAST_MONTH') {
          const now = new Date();
          const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          return d.getFullYear() === lastMonthDate.getFullYear() && m === lastMonthDate.getMonth();
        }
        if (periodFilter === 'LAST_YEAR') {
          const now = new Date();
          return d.getFullYear() === now.getFullYear() - 1;
        }
        return true;
      });
    });
  }, [victims, periodFilter, selectedYear]);

  // ── 2. PERHITUNGAN EVALUASI KINERJA TIAP PETUGAS ──
  // Ketentuan:
  // - Jumlah korban dihitung berdasarkan korban unik, bukan jumlah kunjungan.
  // - Kunjungan awal dan kunjungan lanjutan dihitung sebagai aktivitas yang berbeda.
  // - Tugas tepat waktu dihitung berdasarkan tugas yang diselesaikan sebelum/pada batas waktu.
  // - Tugas yang selesai melewati batas waktu tetap dihitung sebagai terlambat.
  // - Tugas aktif belum lewat batas waktu tidak dihitung gagal.
  const evaluatedOfficers = useMemo(() => {
    const list = officers.map((off) => {
      const allAssigned = storageService.getVictimsByOfficer(off);
      const assignedVictims = periodFilter === 'ALL'
        ? allAssigned
        : allAssigned.filter((v) => periodFilteredVictims.some((pv) => pv.id === v.id));
      const finalAssigned = assignedVictims.length > 0 ? assignedVictims : allAssigned;
      const jumlahKorbanDitangani = finalAssigned.length; // Korban unik

      let kunjunganAwal = 0;
      let kunjunganLanjutan = 0;
      let tugasTepatWaktu = 0;
      let tugasTerlambat = 0;

      finalAssigned.forEach((v) => {
        const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
        const mSla = calculateMonitoringSla(v);

        // Kunjungan awal
        if (v.kunjunganPertama) {
          kunjunganAwal++;
          if (fSla.wasLate) {
            tugasTerlambat++;
          } else {
            tugasTepatWaktu++;
          }
        } else {
          // Jika belum dikunjungi, evaluasi hanya jika sudah melewati batas waktu SLA
          if (fSla.isOverdue) {
            tugasTerlambat++;
          }
        }

        // Kunjungan lanjutan (dari riwayat aktivitas pemantauan)
        const acts = v.riwayatAktivitas || [];
        acts.forEach((a) => {
          if (a.jenisAktivitas !== 'Kunjungan Pertama' && a.kunjunganKe !== 1) {
            kunjunganLanjutan++;
            if (a.terlambat || a.wasLate) {
              tugasTerlambat++;
            } else {
              tugasTepatWaktu++;
            }
          }
        });

        // Pemantauan aktif yang sudah melampaui interval SLA 3 hari
        if (v.kunjunganPertama && v.statusPemantauan !== 'Selesai Dipantau' && mSla.isOverdue) {
          tugasTerlambat++;
        }
      });

      const totalTugasTerevaluasi = tugasTepatWaktu + tugasTerlambat;
      const persentaseKetepatan = totalTugasTerevaluasi > 0
        ? Math.round((tugasTepatWaktu / totalTugasTerevaluasi) * 100)
        : 100;

      return {
        id: off.id,
        nama: off.nama,
        nip: off.nip || '—',
        wilayah: off.wilayah || '—',
        avatar: off.avatar || off.nama?.slice(0, 2).toUpperCase() || 'PT',
        jumlahKorbanDitangani,
        kunjunganAwal,
        kunjunganLanjutan,
        totalKunjungan: kunjunganAwal + kunjunganLanjutan,
        tugasTepatWaktu,
        tugasTerlambat,
        totalTugasTerevaluasi,
        persentaseKetepatan
      };
    });

    return list;
  }, [officers, periodFilteredVictims]);

  // ── 3. RINGKASAN KINERJA AGREGAT (BUKAN PER PETUGAS) ──
  const summaryAggregates = useMemo(() => {
    const totalPetugas = evaluatedOfficers.length;
    // Total korban unik terdaftar pada periode ini
    const totalKorbanDitangani = periodFilteredVictims.length;

    let totalKunjunganAwal = 0;
    let totalKunjunganLanjutan = 0;
    let totalTepatWaktu = 0;
    let totalTerlambat = 0;

    evaluatedOfficers.forEach((o) => {
      totalKunjunganAwal += o.kunjunganAwal;
      totalKunjunganLanjutan += o.kunjunganLanjutan;
      totalTepatWaktu += o.tugasTepatWaktu;
      totalTerlambat += o.tugasTerlambat;
    });

    const totalKunjungan = totalKunjunganAwal + totalKunjunganLanjutan;
    const totalTugas = totalTepatWaktu + totalTerlambat;
    const persentaseKetepatanAgregat = totalTugas > 0
      ? Math.round((totalTepatWaktu / totalTugas) * 100)
      : 100;

    return {
      totalPetugas,
      totalKorbanDitangani,
      totalKunjungan,
      persentaseKetepatanAgregat
    };
  }, [evaluatedOfficers, periodFilteredVictims]);

  // ── 4. FILTER PENCARIAN & PENGURUTAN (SORTING) ──
  const sortedAndFilteredOfficers = useMemo(() => {
    // Filter pencarian berdasarkan nama, NIP, atau wilayah
    const searchResult = evaluatedOfficers.filter((off) =>
      off.nama.toLowerCase().includes(officerSearch.toLowerCase()) ||
      off.nip.toLowerCase().includes(officerSearch.toLowerCase()) ||
      off.wilayah.toLowerCase().includes(officerSearch.toLowerCase())
    );

    // Pengurutan dinamis
    return [...searchResult].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'nama') {
        return sortDirection === 'asc'
          ? a.nama.localeCompare(b.nama)
          : b.nama.localeCompare(a.nama);
      }
      if (sortField === 'korban') {
        valA = a.jumlahKorbanDitangani;
        valB = b.jumlahKorbanDitangani;
      } else if (sortField === 'terlambat') {
        valA = a.tugasTerlambat;
        valB = b.tugasTerlambat;
      } else if (sortField === 'ketepatan') {
        valA = a.persentaseKetepatan;
        valB = b.persentaseKetepatan;
      }

      if (valA === valB) {
        // Fallback tie-breaker: persentase ketepatan atau nama
        return b.persentaseKetepatan - a.persentaseKetepatan;
      }

      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
  }, [evaluatedOfficers, officerSearch, sortField, sortDirection]);

  // Reset page saat pencarian berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [officerSearch, periodFilter, sortField, sortDirection, pageSize]);

  // ── 5. PAGINATION ──
  const totalItems = sortedAndFilteredOfficers.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedOfficers = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedAndFilteredOfficers.slice(startIndex, startIndex + pageSize);
  }, [sortedAndFilteredOfficers, currentPage, pageSize]);

  // Handle Sort Toggle
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'nama' ? 'asc' : 'desc');
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-[#0A3981]" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-[#0A3981]" />
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ── A. HEADER HALAMAN (BENTUK IDENTIK PETUGAS) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Kinerja Petugas
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Rekapitulasi dan evaluasi indikator kinerja petugas lapangan Jasa Raharja, ketepatan waktu kunjungan, dan kepatuhan SLA.
          </p>
        </div>

        {/* Filter Periode & Tahun */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-50/70 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="bg-transparent text-slate-700 font-semibold focus:outline-none pr-2 cursor-pointer text-xs"
            >
              <option value="THIS_YEAR">Tahun Ini ({selectedYear})</option>
              <option value="SIX_MONTHS">6 Bulan Terakhir</option>
              <option value="THIS_MONTH">Bulan Ini</option>
              <option value="LAST_YEAR">Tahun Sebelumnya ({Number(selectedYear) - 1})</option>
              <option value="ALL">Semua Periode</option>
            </select>
          </div>

          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl pl-8 pr-7 py-1.5 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#145DA0] shadow-2xs cursor-pointer"
            >
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
            <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            type="button"
            onClick={loadData}
            title="Muat Ulang Data"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 shadow-2xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── B. RINGKASAN KINERJA AGREGAT (SECTION 3.B) ── */}
      {/* Empat kartu ringkasan agregat, bukan kartu terpisah per petugas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Petugas yang Dievaluasi */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-1 hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              TOTAL PETUGAS DIEVALUASI
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#145DA0] border border-blue-100 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight pt-1">
            {summaryAggregates.totalPetugas}
          </div>
          <p className="text-xs text-slate-500">Petugas Mobile Service lapangan aktif</p>
        </div>

        {/* 2. Total Korban yang Ditangani (Korban Unik) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-1 hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              TOTAL KORBAN DITANGANI
            </span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-700 border border-sky-100 flex items-center justify-center shrink-0">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight pt-1">
            {summaryAggregates.totalKorbanDitangani}
          </div>
          <p className="text-xs text-slate-500">Jumlah korban unik pada periode ini</p>
        </div>

        {/* 3. Total Kunjungan (Kunjungan Awal + Lanjutan) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-1 hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              TOTAL KUNJUNGAN
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
              <CalendarCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight pt-1">
            {summaryAggregates.totalKunjungan}
          </div>
          <p className="text-xs text-slate-500">Kunjungan awal + pemantauan lanjutan</p>
        </div>

        {/* 4. Persentase Penyelesaian Tugas Tepat Waktu */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-1 hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#145DA0] uppercase tracking-wider">
              KETEPATAN WAKTU
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#145DA0] border border-blue-200 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-[#145DA0] tracking-tight pt-1">
            {summaryAggregates.persentaseKetepatanAgregat}%
          </div>
          <p className="text-xs text-slate-500">Standar kepatuhan minimum SLA: 90%</p>
        </div>
      </div>

      {/* ── C. TABEL KINERJA PETUGAS (KOMPONEN UTAMA) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              Evaluasi Detail Kinerja Petugas
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Klik pada judul kolom untuk mengurutkan data secara cepat. Gunakan tombol "Lihat Detail" untuk membuka rekap riwayat lengkap.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap sm:flex-nowrap w-full sm:w-auto">
            {/* Input Pencarian Nama Petugas */}
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={officerSearch}
                onChange={(e) => setOfficerSearch(e.target.value)}
                placeholder="Cari nama atau wilayah..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0] w-full sm:w-56"
              />
            </div>

            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600 shrink-0">
              <span className="text-[11px] text-slate-500">Tampilkan:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value={5}>5 baris</option>
                <option value={10}>10 baris</option>
                <option value={20}>20 baris</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table Content (Dual Responsive) */}
        {/* DESKTOP TABLE VIEW */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-200/90 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4 text-center w-12">NO.</th>
                
                {/* Kolom Nama Petugas dengan Sort */}
                <th 
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  onClick={() => handleSort('nama')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>NAMA PETUGAS</span>
                    {getSortIcon('nama')}
                  </div>
                </th>

                {/* Kolom Jumlah Korban Ditangani dengan Sort */}
                <th 
                  className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  onClick={() => handleSort('korban')}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>JUMLAH KORBAN</span>
                    {getSortIcon('korban')}
                  </div>
                </th>

                {/* Kunjungan Awal */}
                <th className="py-3 px-4 text-center">
                  KUNJUNGAN AWAL
                </th>

                {/* Kunjungan Lanjutan */}
                <th className="py-3 px-4 text-center">
                  KUNJUNGAN LANJUTAN
                </th>

                {/* Tugas Tepat Waktu */}
                <th className="py-3 px-4 text-center">
                  TUGAS TEPAT WAKTU
                </th>

                {/* Tugas Terlambat dengan Sort */}
                <th 
                  className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  onClick={() => handleSort('terlambat')}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>TUGAS TERLAMBAT</span>
                    {getSortIcon('terlambat')}
                  </div>
                </th>

                {/* Persentase Ketepatan Waktu dengan Sort */}
                <th 
                  className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  onClick={() => handleSort('ketepatan')}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>KETEPATAN WAKTU</span>
                    {getSortIcon('ketepatan')}
                  </div>
                </th>

                {/* Kolom Aksi */}
                <th className="py-3 px-4 text-center w-28">
                  AKSI
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedOfficers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-700 text-sm">Data belum cukup untuk evaluasi</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Tidak ada data kinerja petugas yang tercatat pada periode atau kriteria pencarian ini.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedOfficers.map((officer, idx) => {
                  const itemNumber = (currentPage - 1) * pageSize + idx + 1;

                  // Warna teks menandai tingkat ketepatan waktu tanpa badge tambahan
                  let performanceTextColor = 'text-emerald-700';
                  if (officer.persentaseKetepatan < 80) {
                    performanceTextColor = 'text-rose-700';
                  } else if (officer.persentaseKetepatan < 90) {
                    performanceTextColor = 'text-amber-700';
                  }

                  return (
                    <tr key={officer.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* 1. No */}
                      <td className="py-3.5 px-4 text-center font-mono text-slate-400 font-medium">
                        {String(itemNumber).padStart(2, '0')}
                      </td>

                      {/* 2. Nama Petugas */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-[#145DA0] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                            {officer.avatar}
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-900 block text-xs">
                              {officer.nama}
                            </span>
                            <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-2.5 h-2.5 text-slate-400" />
                              <span>{officer.wilayah}</span>
                              <span>•</span>
                              <span>NIP: {officer.nip}</span>
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 3. Jumlah Korban Ditangani (Unik) */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap font-bold text-slate-900">
                        {officer.jumlahKorbanDitangani} Korban
                      </td>

                      {/* 4. Kunjungan Awal */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap font-medium text-slate-700">
                        {officer.kunjunganAwal} Kasus
                      </td>

                      {/* 5. Kunjungan Lanjutan */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap font-medium text-slate-700">
                        {officer.kunjunganLanjutan} Catatan
                      </td>

                      {/* 6. Tugas Tepat Waktu */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap font-semibold text-emerald-700">
                        {officer.tugasTepatWaktu} Tugas
                      </td>

                      {/* 7. Tugas Terlambat */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className={`font-semibold ${officer.tugasTerlambat > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                          {officer.tugasTerlambat} Tugas
                        </span>
                      </td>

                      {/* 8. Persentase Ketepatan Waktu */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className={`text-xs font-black ${performanceTextColor}`}>
                          {officer.persentaseKetepatan}%
                        </span>
                      </td>

                      {/* 9. Aksi: Lihat Detail */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => navigate(`/kabag/kinerja-petugas/${officer.id}`)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50/50 text-[#145DA0] hover:bg-blue-100 font-bold text-xs transition-colors cursor-pointer"
                        >
                          <span>Lihat Detail</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
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
          {paginatedOfficers.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <p className="font-semibold text-slate-600 text-xs">Tidak ada data kinerja petugas.</p>
            </div>
          ) : (
            paginatedOfficers.map((officer, idx) => {
              const itemNumber = (currentPage - 1) * pageSize + idx + 1;
              return (
                <div key={officer.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-50 text-[#145DA0] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                        {officer.avatar}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-slate-400 font-bold">#{itemNumber}</span>
                          <span className="font-extrabold text-slate-900 text-xs truncate block">
                            {officer.nama}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 block">
                          {officer.wilayah} • NIP: {officer.nip}
                        </span>
                      </div>
                    </div>
                    <span className={`text-xs font-black px-2.5 py-1 rounded-full shrink-0 ${
                      officer.persentaseKetepatan < 80
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : officer.persentaseKetepatan < 90
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {officer.persentaseKetepatan}% SLA
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-2.5 text-center text-[10px] border border-slate-100">
                    <div>
                      <span className="text-slate-400 block">Total Pasien</span>
                      <strong className="text-slate-800 text-xs">{officer.jumlahKorbanDitangani}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Tepat Waktu</span>
                      <strong className="text-emerald-700 text-xs">{officer.tugasTepatWaktu}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Terlambat</span>
                      <strong className="text-rose-600 text-xs">{officer.tugasTerlambat}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(`/kabag/kinerja-petugas/${officer.id}`)}
                    className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-[#145DA0] hover:bg-[#0A3981] text-white flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <span>Buka Rapor &amp; Detail Kinerja</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Controls */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Menampilkan data <strong>{totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong> - <strong>{Math.min(currentPage * pageSize, totalItems)}</strong> dari <strong>{totalItems}</strong> total petugas
          </div>

          <div className="flex items-center gap-1 self-center sm:self-auto">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center transition-colors cursor-pointer ${
                  currentPage === page
                    ? 'bg-[#145DA0] text-white shadow-2xs'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs'
                }`}
              >
                {page}
              </button>
            ))}

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
              title="Halaman Selanjutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
