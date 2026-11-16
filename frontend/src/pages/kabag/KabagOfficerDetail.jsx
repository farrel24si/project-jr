import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  User, 
  MapPin, 
  Phone, 
  Mail, 
  Briefcase, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  Activity, 
  Search, 
  Eye, 
  Building2, 
  RotateCcw,
  Filter,
  Check,
  CalendarCheck,
  TrendingUp,
  ShieldCheck,
  FileText,
  Trash2,
  AlertCircle,
  X
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';
import ConditionBadge from '../../components/common/ConditionBadge';
import VictimDetailDrawer from '../../components/kabag/VictimDetailDrawer';

// Module-level date & time formatting helpers
const formatIndoDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const formatIndoDateTime = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const datePart = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const timePart = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '.') + ' WIB';
    return `${datePart}, ${timePart}`;
  } catch {
    return dateStr;
  }
};

export default function KabagOfficerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [victims, setVictims] = useState([]);
  const [officers, setOfficers] = useState([]);

  // ── FILTER STATE ──
  const [periodFilter, setPeriodFilter] = useState('ALL'); // ALL, THIS_YEAR, THIS_MONTH, LAST_MONTH
  const [selectedYear, setSelectedYear] = useState('2026');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityStatusFilter, setActivityStatusFilter] = useState('ALL'); // ALL, TEPAT, TERLAMBAT

  // Drawer
  const [selectedVictimForDrawer, setSelectedVictimForDrawer] = useState(null);

  // Modal Konfirmasi Hapus Petugas
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

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

  // 1. Ambil Profil Petugas
  const officer = useMemo(() => {
    if (!officers.length) return null;
    return officers.find((o) => o.id === id) || officers[0] || null;
  }, [officers, id]);

  // 2. Filter Korban yang Ditugaskan ke Petugas Ini Sesuai Periode
  const officerVictimsInPeriod = useMemo(() => {
    if (!officer) return [];

    const allAssigned = storageService.getVictimsByOfficer(officer);

    if (periodFilter === 'ALL') return allAssigned;

    const now = new Date();
    const currentYear = String(now.getFullYear());
    const currentMonth = now.getMonth();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? String(now.getFullYear() - 1) : currentYear;

    const filtered = allAssigned.filter((v) => {
      const datesToCheck = [
        v.tanggalInformasiDiterima,
        v.tanggalKecelakaan,
        v.tanggalMasukRs,
        ...(v.riwayatAktivitas || []).map((a) => a.tanggalKunjungan || a.tanggal || a.waktuSelesai)
      ].filter(Boolean);

      if (datesToCheck.length === 0) return true;

      return datesToCheck.some((dateStr) => {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        const y = String(d.getFullYear());
        const m = d.getMonth();

        if (periodFilter === 'THIS_YEAR') return y === selectedYear || y === currentYear;
        if (periodFilter === 'THIS_MONTH') return (y === selectedYear || y === currentYear) && m === currentMonth;
        if (periodFilter === 'LAST_MONTH') return (y === selectedYear || y === lastMonthYear) && m === lastMonth;
        return true;
      });
    });

    return filtered.length > 0 ? filtered : allAssigned;
  }, [victims, officer, periodFilter, selectedYear]);

  // 3. Ringkasan Kinerja Petugas (Section 4)
  // Aturan:
  // - Jumlah korban dihitung berdasarkan korban unik.
  // - Kunjungan awal dan kunjungan lanjutan dihitung berbeda.
  // - Tugas tepat waktu vs terlambat.
  // - Tugas aktif belum lewat batas waktu tidak dihitung gagal.
  // - Titik awal SLA mengikuti waktu informasi diterima (SLA 72 jam kunjungan awal, interval 3 hari kunjungan lanjutan).
  const officerMetrics = useMemo(() => {
    const jumlahKorbanDitangani = officerVictimsInPeriod.length; // Korban unik

    let jumlahKunjunganAwal = 0;
    let jumlahKunjunganLanjutan = 0;
    let jumlahTugasTepatWaktu = 0;
    let jumlahTugasTerlambat = 0;

    officerVictimsInPeriod.forEach((v) => {
      // Titik awal SLA: tanggal informasi diterima Jasa Raharja
      const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
      const mSla = calculateMonitoringSla(v);

      // Kunjungan awal
      if (v.kunjunganPertama) {
        jumlahKunjunganAwal++;
        if (fSla.wasLate) {
          jumlahTugasTerlambat++;
        } else {
          jumlahTugasTepatWaktu++;
        }
      } else {
        if (fSla.isOverdue) {
          jumlahTugasTerlambat++;
        }
      }

      // Kunjungan lanjutan
      const acts = v.riwayatAktivitas || [];
      acts.forEach((a) => {
        if (a.jenisAktivitas !== 'Kunjungan Pertama' && a.kunjunganKe !== 1) {
          jumlahKunjunganLanjutan++;
          if (a.terlambat || a.wasLate) {
            jumlahTugasTerlambat++;
          } else {
            jumlahTugasTepatWaktu++;
          }
        }
      });

      // Pemantauan aktif yang terlambat
      if (v.kunjunganPertama && v.statusPemantauan !== 'Selesai Dipantau' && mSla.isOverdue) {
        jumlahTugasTerlambat++;
      }
    });

    const totalTugasTerevaluasi = jumlahTugasTepatWaktu + jumlahTugasTerlambat;
    const persentaseKetepatanWaktu = totalTugasTerevaluasi > 0
      ? Math.round((jumlahTugasTepatWaktu / totalTugasTerevaluasi) * 100)
      : 100;

    return {
      jumlahKorbanDitangani,
      jumlahKunjunganAwal,
      jumlahKunjunganLanjutan,
      totalKunjungan: jumlahKunjunganAwal + jumlahKunjunganLanjutan,
      jumlahTugasTepatWaktu,
      jumlahTugasTerlambat,
      totalTugasTerevaluasi,
      persentaseKetepatanWaktu
    };
  }, [officerVictimsInPeriod]);

  // 4. Riwayat Aktivitas Petugas (Tabel Aktivitas Lapangan Aktual)
  const officerActivities = useMemo(() => {
    const list = [];

    officerVictimsInPeriod.forEach((v) => {
      const acts = v.riwayatAktivitas || [];

      // Jika ada kunjungan pertama dan belum masuk ke riwayatAktivitas
      if (v.kunjunganPertama && !acts.some((a) => a.jenisAktivitas === 'Kunjungan Pertama')) {
        const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
        list.push({
          id: `INIT-${v.id}`,
          victimId: v.id,
          victimObj: v,
          namaKorban: v.nama,
          rumahSakit: v.rumahSakit,
          tanggalInformasiDiterima: v.tanggalInformasiDiterima,
          tanggalKunjunganAktual: v.kunjunganPertama.tanggalKunjungan || v.tanggalKunjunganTerakhir || v.tanggalInformasiDiterima,
          waktuInputSistem: v.kunjunganPertama.waktuSimpan || v.kunjunganPertama.waktuInput || v.tanggalInformasiDiterima,
          jenisKunjungan: 'Kunjungan Awal',
          kondisiKorban: v.kunjunganPertama.kondisiKorban || v.kondisiTerakhir || 'Masih Dirawat',
          statusTindakLanjut: v.statusTindakLanjut || 'Sudah Selesai',
          terlambat: fSla.wasLate,
          slaStatusText: fSla.wasLate ? 'Terlambat' : 'Tepat Waktu'
        });
      }

      // Seluruh aktivitas pemantauan
      acts.forEach((a) => {
        const isFirst = a.jenisAktivitas === 'Kunjungan Pertama' || a.kunjunganKe === 1;
        const fSla = isFirst ? calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama) : null;
        const wasLate = a.terlambat || a.wasLate || (fSla && fSla.wasLate);

        list.push({
          id: a.id || `${v.id}-${Math.random()}`,
          victimId: v.id,
          victimObj: v,
          namaKorban: v.nama,
          rumahSakit: v.rumahSakit,
          tanggalInformasiDiterima: v.tanggalInformasiDiterima,
          tanggalKunjunganAktual: a.waktuSelesai || a.tanggalKunjungan || a.tanggal || a.waktuInput,
          waktuInputSistem: a.waktuSimpan || a.waktuInput || a.waktuSelesai,
          jenisKunjungan: isFirst ? 'Kunjungan Awal' : 'Kunjungan Lanjutan',
          kondisiKorban: a.kondisiKorban || a.kondisi || v.kondisiTerakhir || 'Masih Dirawat',
          statusTindakLanjut: a.statusTindakLanjut || (a.masihPerluTindakLanjut ? 'Masih Perlu Ditindaklanjuti' : 'Sudah Selesai'),
          terlambat: wasLate,
          slaStatusText: wasLate ? 'Terlambat' : 'Tepat Waktu'
        });
      });
    });

    // Urutkan berdasarkan tanggal kunjungan aktual terbaru
    list.sort((a, b) => {
      const tA = a.tanggalKunjunganAktual ? new Date(a.tanggalKunjunganAktual).getTime() : 0;
      const tB = b.tanggalKunjunganAktual ? new Date(b.tanggalKunjunganAktual).getTime() : 0;
      return tB - tA;
    });

    return list;
  }, [officerVictimsInPeriod]);

  // Filter pencarian dan status di tabel aktivitas
  const filteredActivities = useMemo(() => {
    return officerActivities.filter((act) => {
      const matchSearch =
        act.namaKorban.toLowerCase().includes(activitySearch.toLowerCase()) ||
        act.rumahSakit.toLowerCase().includes(activitySearch.toLowerCase()) ||
        act.jenisKunjungan.toLowerCase().includes(activitySearch.toLowerCase());

      if (!matchSearch) return false;

      if (activityStatusFilter === 'TEPAT' && act.terlambat) return false;
      if (activityStatusFilter === 'TERLAMBAT' && !act.terlambat) return false;

      return true;
    });
  }, [officerActivities, activitySearch, activityStatusFilter]);

  if (!officer) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-slate-600 font-semibold">Petugas tidak ditemukan dalam sistem.</p>
        <Link
          to="/kabag/kinerja"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0A3981] text-white rounded-lg text-xs font-bold hover:bg-[#072B62] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Kinerja Petugas</span>
        </Link>
      </div>
    );
  }

  // Indikator warna badge persentase ketepatan
  let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (officerMetrics.persentaseKetepatanWaktu < 80) {
    badgeColor = 'bg-rose-50 text-rose-700 border-rose-200';
  } else if (officerMetrics.persentaseKetepatanWaktu < 90) {
    badgeColor = 'bg-amber-50 text-amber-800 border-amber-200';
  }

  const handleConfirmDeleteOfficer = () => {
    if (!officer) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      storageService.deleteOfficer(officer.id);
      setIsDeleteDialogOpen(false);
      navigate('/kabag/petugas', {
        state: { toastMessage: `Data petugas ${officer.nama} berhasil dinonaktifkan dari sistem.` }
      });
    } catch (err) {
      setDeleteError(err.message || 'Gagal menghapus data petugas.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ── BREADCRUMB & FILTER PERIODE ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link
          to="/kabag/kinerja"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3.5 py-2 rounded-lg shadow-2xs transition-colors self-start cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
          <span>Kembali ke Kinerja Petugas</span>
        </Link>

        {/* Filter Periode Evaluasi Petugas */}
        <div className="flex items-center gap-2 text-xs self-start sm:self-auto">
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg p-1">
            <Filter className="w-3.5 h-3.5 text-slate-500 ml-1" />
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="bg-transparent text-slate-700 font-semibold focus:outline-none pr-2 cursor-pointer text-xs"
            >
              <option value="THIS_YEAR">Tahun 2026</option>
              <option value="THIS_MONTH">Bulan Ini (November 2026)</option>
              <option value="LAST_MONTH">Bulan Sebelumnya (Oktober 2026)</option>
              <option value="ALL">Semua Periode</option>
            </select>
          </div>

          <button
            type="button"
            onClick={loadData}
            title="Muat Ulang Data"
            className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 shadow-2xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setIsDeleteDialogOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs shadow-2xs transition-colors cursor-pointer"
            title="Hapus Petugas Ini"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Hapus Petugas</span>
          </button>
        </div>
      </div>

      {/* ── 1. INFORMASI PETUGAS (SECTION 4) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          {/* Avatar & Identitas Inti */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-xl text-white shadow-xs shrink-0 bg-[#0A3981]">
              {officer.avatar || officer.nama.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  {officer.nama}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#0A3981] border border-blue-200">
                  {officer.status || 'Mobile Service Lapangan'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setIsDeleteDialogOpen(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3 text-rose-500" />
                  <span>Hapus</span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1 font-medium">
                <span className="font-mono text-slate-700">ID / NIP: {officer.nip || '—'}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>Wilayah Penugasan: <strong className="text-slate-800">{officer.wilayah || '—'}</strong></span>
                </span>
              </div>
            </div>
          </div>

          {/* Plotting Rumah Sakit & Kontak Operasional */}
          <div className="flex flex-col sm:flex-row gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 min-w-[200px]">
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-slate-400" />
                Plotting Rumah Sakit Wilayah
              </span>
              <div className="space-y-1">
                {(officer.plottingRs || ['RS Syafira', 'RS Prima', 'RSUD Arifin Achmad']).map((rs, idx) => (
                  <p key={idx} className="font-semibold text-slate-800 text-[11px] truncate flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0A3981]" />
                    {rs}
                  </p>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 min-w-[170px]">
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1.5">
                Kontak Operasional Petugas
              </span>
              <p className="font-mono text-slate-800 text-[11px] flex items-center gap-1.5">
                <Phone className="w-3 h-3 text-slate-400" /> {officer.telepon || '0812-3456-7890'}
              </p>
              <p className="text-slate-600 text-[11px] truncate flex items-center gap-1.5 mt-1">
                <Mail className="w-3 h-3 text-slate-400" /> {officer.email || 'petugas@jasaraharja.co.id'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. RINGKASAN KINERJA PETUGAS (SECTION 4) ── */}
      {/* 6 Kartu Indikator Sesuai Spesifikasi */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* 1. Jumlah Korban Ditangani (Unik) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            KORBAN DITANGANI
          </span>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-slate-900">
              {officerMetrics.jumlahKorbanDitangani}
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Korban Unik</span>
          </div>
        </div>

        {/* 2. Jumlah Kunjungan Awal */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            KUNJUNGAN AWAL
          </span>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-slate-900">
              {officerMetrics.jumlahKunjunganAwal}
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Target SLA 72 Jam</span>
          </div>
        </div>

        {/* 3. Jumlah Kunjungan Lanjutan */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            KUNJUNGAN LANJUTAN
          </span>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-slate-900">
              {officerMetrics.jumlahKunjunganLanjutan}
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Interval 3 Hari</span>
          </div>
        </div>

        {/* 4. Jumlah Tugas Tepat Waktu */}
        <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-2xs flex flex-col justify-between bg-emerald-50/20">
          <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
            TUGAS TEPAT WAKTU
          </span>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-emerald-700">
              {officerMetrics.jumlahTugasTepatWaktu}
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">Sesuai Batas SLA</span>
          </div>
        </div>

        {/* 5. Jumlah Tugas Terlambat */}
        <div className="bg-white rounded-2xl border border-rose-200 p-4 shadow-2xs flex flex-col justify-between bg-rose-50/20">
          <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">
            TUGAS TERLAMBAT
          </span>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-rose-700">
              {officerMetrics.jumlahTugasTerlambat}
            </div>
            <span className="text-[11px] text-rose-600 font-medium">Melewati Batas SLA</span>
          </div>
        </div>

        {/* 6. Persentase Ketepatan Waktu */}
        <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-2xs flex flex-col justify-between bg-blue-50/30">
          <span className="text-[10px] font-bold text-[#145DA0] uppercase tracking-wider block">
            KETEPATAN WAKTU
          </span>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-[#145DA0]">
              {officerMetrics.persentaseKetepatanWaktu}%
            </div>
            <span className="text-[11px] text-blue-700 font-bold">Standar Target: 90%</span>
          </div>
        </div>
      </div>

      {/* ── 3. RIWAYAT AKTIVITAS PETUGAS (TABEL SECTION 4) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Toolbar Tabel Riwayat */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#0A3981]" />
              <h2 className="text-base font-extrabold text-slate-900">
                Riwayat Aktivitas Kunjungan Petugas
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Menampilkan tanggal informasi diterima, tanggal kunjungan aktual (waktu aktual pencatatan), dan status ketepatan waktu.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto">
            {/* Filter Status SLA */}
            <select
              value={activityStatusFilter}
              onChange={(e) => setActivityStatusFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none flex-1 sm:flex-initial"
            >
              <option value="ALL">Semua Ketepatan</option>
              <option value="TEPAT">Tepat Waktu</option>
              <option value="TERLAMBAT">Terlambat</option>
            </select>

            {/* Input Pencarian */}
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={activitySearch}
                onChange={(e) => setActivitySearch(e.target.value)}
                placeholder="Cari korban atau RS..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white w-full sm:w-52"
              />
            </div>
          </div>
        </div>

        {/* Tabel Riwayat Aktivitas (Dual Responsive) */}
        {/* DESKTOP TABLE VIEW */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200/80 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">NAMA KORBAN</th>
                <th className="py-3 px-4">RUMAH SAKIT</th>
                <th className="py-3 px-4">TGL INFORMASI DITERIMA</th>
                <th className="py-3 px-4">TGL KUNJUNGAN AKTUAL</th>
                <th className="py-3 px-4">JENIS KUNJUNGAN</th>
                <th className="py-3 px-4">KONDISI KORBAN</th>
                <th className="py-3 px-4">STATUS TINDAK LANJUT</th>
                <th className="py-3 px-4 text-center">KETEPATAN WAKTU</th>
                <th className="py-3 px-4 text-center w-24">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredActivities.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-700 text-sm">Data belum cukup untuk evaluasi</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Belum ada catatan riwayat aktivitas kunjungan pada periode yang dipilih.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredActivities.map((act) => (
                  <tr key={act.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Nama Korban */}
                    <td className="py-3.5 px-4 font-extrabold text-slate-900 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedVictimForDrawer(act.victimObj)}
                        className="hover:text-[#0A3981] hover:underline cursor-pointer text-left"
                      >
                        {act.namaKorban}
                      </button>
                    </td>

                    {/* Rumah Sakit */}
                    <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{act.rumahSakit}</span>
                      </span>
                    </td>

                    {/* Tanggal Informasi Diterima (Titik Awal SLA) */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 font-medium">
                      {formatIndoDateTime(act.tanggalInformasiDiterima)}
                    </td>

                    {/* Tanggal Kunjungan Aktual (Waktu Pelaksanaan Lapangan) */}
                    <td className="py-3.5 px-4 whitespace-nowrap font-bold text-slate-800">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formatIndoDateTime(act.tanggalKunjunganAktual)}</span>
                      </span>
                    </td>

                    {/* Jenis Kunjungan */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {act.jenisKunjungan}
                      </span>
                    </td>

                    {/* Kondisi Korban */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <ConditionBadge kondisi={act.kondisiKorban} size="xs" />
                    </td>

                    {/* Status Tindak Lanjut */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                        act.statusTindakLanjut.includes('Masih Perlu')
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {act.statusTindakLanjut}
                      </span>
                    </td>

                    {/* Status Ketepatan Waktu */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold border ${
                        act.terlambat
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {act.slaStatusText}
                      </span>
                    </td>

                    {/* Aksi Detail Drawer */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedVictimForDrawer(act.victimObj)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-600/40 text-[#0A3981] hover:bg-blue-50 font-bold text-xs transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Audit</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARD VIEW (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredActivities.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <p className="font-semibold text-slate-600 text-xs">Belum ada riwayat aktivitas kunjungan.</p>
            </div>
          ) : (
            filteredActivities.map((act) => (
              <div key={act.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <button
                      type="button"
                      onClick={() => setSelectedVictimForDrawer(act.victimObj)}
                      className="font-extrabold text-slate-900 text-xs hover:text-[#0A3981] text-left block"
                    >
                      {act.namaKorban}
                    </button>
                    <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                      {act.jenisKunjungan}
                    </span>
                  </div>
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 ${
                    act.terlambat
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {act.slaStatusText}
                  </span>
                </div>

                <div className="bg-slate-50 rounded-xl p-2.5 text-[11px] text-slate-600 space-y-1.5 border border-slate-100">
                  <div className="flex items-center gap-1.5 font-medium text-slate-800">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{act.rumahSakit}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                    <span>Waktu Kunjungan:</span>
                    <strong className="text-slate-800">{formatIndoDateTime(act.tanggalKunjunganAktual)}</strong>
                  </div>
                  <div className="pt-1 border-t border-slate-200/60 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Kondisi:</span>
                    <ConditionBadge kondisi={act.kondisiKorban} size="xs" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedVictimForDrawer(act.victimObj)}
                  className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-white hover:bg-slate-50 text-[#0A3981] border border-blue-200 flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Audit Detail &amp; GPS Kunjungan</span>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── VICTIM DETAIL DRAWER UNTUK AUDIT FOTO & GPS LAPANGAN ── */}
      {selectedVictimForDrawer && (
        <VictimDetailDrawer
          isOpen={!!selectedVictimForDrawer}
          onClose={() => setSelectedVictimForDrawer(null)}
          victim={selectedVictimForDrawer}
        />
      )}

      {/* ── MODAL KONFIRMASI HAPUS AKUN PETUGAS ── */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-up">
            {/* Modal Header */}
            <div className="p-5 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center border border-rose-200 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Konfirmasi Hapus Akun Petugas
                  </h3>
                  <p className="text-xs text-rose-700 font-medium">
                    Tindakan ini memerlukan persetujuan Kepala Bagian
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isDeleting) setIsDeleteDialogOpen(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-3.5">
              <div className="p-3.5 bg-rose-50/70 border border-rose-100 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs text-slate-800 leading-relaxed font-semibold">
                    Apakah Anda yakin ingin menghapus akun petugas{' '}
                    <span className="text-rose-700 font-bold underline decoration-rose-300">{officer.nama}</span>?
                  </p>
                  <p className="text-[11px] text-slate-600">
                    NIP/ID: <span className="font-mono font-bold text-slate-700">{officer.nip || officer.id}</span>
                    {officer.username ? ` • Username: @${officer.username}` : ''}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Informasi Pengalihan Tanggung Jawab:</span>
                </div>
                <p>
                  Jika petugas ini memiliki korban aktif atau riwayat pemantauan, tanggung jawab pemantauan akan otomatis dialihkan ke petugas aktif lainnya agar tidak ada data korban yang hilang atau terlantar.
                </p>
              </div>

              {deleteError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsDeleteDialogOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteOfficer}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Menghapus...' : 'Ya, Yakin Hapus'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
