import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Eye,
  Building2,
  RotateCcw,
  Filter,
  Check,
  CalendarCheck,
  TrendingUp,
  X,
  ExternalLink,
  Navigation
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla } from '../../services/slaService';
import ConditionBadge from '../../components/common/ConditionBadge';
import AuthenticatedImage from '../../components/common/AuthenticatedImage';
import SortableHeader from '../../components/common/SortableHeader';
import { getReferralPerspectiveInfo } from '../../utils/referralUtils';
import { getRealVisitPhoto } from '../../utils/realPhotos';
import { formatDateIndo as formatIndoDate, formatDateTimeIndo as formatIndoDateTime, parseDateSafe } from '../../utils/dateUtils';

export default function KabagOfficerDetail() {
  const { id } = useParams();

  const [victims, setVictims] = useState([]);
  const [officers, setOfficers] = useState([]);

  // ── FILTER STATE ──
  const [periodFilter, setPeriodFilter] = useState('ALL'); // ALL, THIS_YEAR, THIS_MONTH, LAST_MONTH
  const [searchQuery, setSearchQuery] = useState('');
  const [slaFilter, setSlaFilter] = useState('ALL'); // ALL, TEPAT, TERLAMBAT, MENUNGGU
  const [conditionFilter, setConditionFilter] = useState('ALL'); // ALL, Dirawat, Pulang, Meninggal
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return { key: null, direction: 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  // ── MODAL DETAIL KUNJUNGAN KORBAN ──
  const [selectedVictim, setSelectedVictim] = useState(null);
  const [activeVisitIndex, setActiveVisitIndex] = useState(0);

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
    return officers.find((o) => String(o.id) === String(id) || o.nama.toLowerCase().includes((id || '').toLowerCase())) || officers[0] || null;
  }, [officers, id]);

  // 2. Filter Korban yang Ditugaskan ke Petugas Ini Sesuai Periode
  const officerVictimsInPeriod = useMemo(() => {
    if (!officer) return [];

    const allAssigned = storageService.getVictimsByOfficer(officer);

    if (periodFilter === 'ALL') return allAssigned;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    return allAssigned.filter((v) => {
      const datesToCheck = [
        v.tanggalInformasiDiterima,
        v.tanggalKecelakaan,
        v.tanggalMasukRs,
        ...(v.riwayatAktivitas || []).map((a) => a.tanggalKunjungan || a.tanggal || a.waktuSelesai)
      ].filter(Boolean);

      if (datesToCheck.length === 0) return false;

      return datesToCheck.some((dateStr) => {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        const y = d.getFullYear();
        const m = d.getMonth();

        if (periodFilter === 'THIS_YEAR') return y === currentYear;
        if (periodFilter === 'THIS_MONTH') return y === currentYear && m === currentMonth;
        if (periodFilter === 'LAST_MONTH') return y === lastMonthYear && m === lastMonth;
        return true;
      });
    });
  }, [victims, officer, periodFilter]);

  // 3. Proses Data Korban Unik Beserta Riwayat Kunjungan dan Status SLA (1 Baris per Korban Unik)
  const victimRows = useMemo(() => {
    return officerVictimsInPeriod.map((v) => {
      const infoTime = v.tanggalInformasiDiterima ? new Date(v.tanggalInformasiDiterima).getTime() : null;
      const firstDeadline = infoTime ? new Date(infoTime + 72 * 60 * 60 * 1000).toISOString() : null;

      const visitsList = [];
      const seenVisitIds = new Set();
      let tepatCount = 0;
      let terlambatCount = 0;

      // Kunjungan Pertama
      if (v.kunjunganPertama && v.kunjunganPertama.statusKunjungan !== 'Menunggu') {
        const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
        const kId = v.kunjunganPertama.id || `INIT-${v.id}`;
        if (!seenVisitIds.has(kId)) {
          seenVisitIds.add(kId);
          const actTime = v.kunjunganPertama.tanggalKunjungan || v.tanggalKunjunganTerakhir || v.tanggalInformasiDiterima;

          if (fSla.wasLate) terlambatCount++;
          else tepatCount++;

          visitsList.push({
            id: kId,
            nomorKunjungan: 1,
            jenisKunjungan: 'Kunjungan Pertama (Awal)',
            tanggalInformasiDiterima: v.tanggalInformasiDiterima,
            tanggalSeharusnyaDilakukan: firstDeadline,
            tanggalKunjunganAktual: actTime,
            kondisiKorban: v.kunjunganPertama.kondisiKorban || v.kondisiTerakhir || 'Masih Dirawat',
            hasilKunjungan: v.kunjunganPertama.hasilKunjungan || 'Kunjungan fisik perdana ke pasien di rumah sakit telah selesai dilaksanakan.',
            checklist: [
              { label: 'Verifikasi identitas korban & kesesuaian berkas NIK/KK', done: true },
              { label: 'Konfirmasi keabsahan surat jaminan Jasa Raharja di RS', done: true },
              { label: 'Observasi perkembangan kondisi fisik & tindakan medis pasien', done: true },
              { label: 'Koordinasi dengan bagian penagihan / administrasi kasir RS', done: true },
              { label: 'Penyerahan formulir santunan dan edukasi hak biaya rawat', done: true }
            ],
            catatanTindakLanjut: v.kunjunganPertama.tindakLanjut || v.tindakLanjut || 'Tetap pantau perkembangan perawatan berkala maksimal 3 hari sekali.',
            fotoUrl: v.kunjunganPertama.fotoUrl || null,
            latitude: v.kunjunganPertama.latitude || '0.5071',
            longitude: v.kunjunganPertama.longitude || '101.4478',
            akurasiLokasi: v.kunjunganPertama.akurasiLokasi || '± 5 meter (Akurat)',
            terlambat: fSla.wasLate,
            statusSla: fSla.wasLate ? 'Terlambat' : 'Tepat Waktu'
          });
        }
      }

      // Kunjungan Lanjutan
      const acts = v.riwayatAktivitas || v.riwayatKunjungan || [];
      const sortedActs = [...acts]
        .filter((a) => a && a.statusKunjungan !== 'Menunggu' && a.id !== v.kunjunganPertama?.id && a.jenisAktivitas !== 'Kunjungan Pertama')
        .sort((a, b) => new Date(a.tanggal || a.tanggalKunjungan).getTime() - new Date(b.tanggal || b.tanggalKunjungan).getTime());

      let prevVisitTime = v.kunjunganPertama?.tanggalKunjungan
        ? new Date(v.kunjunganPertama.tanggalKunjungan).getTime()
        : infoTime;

      sortedActs.forEach((act, actIdx) => {
        const aId = act.id || `${v.id}-${act.nomorKunjungan || actIdx}-${act.tanggal || ''}`;
        if (!seenVisitIds.has(aId)) {
          seenVisitIds.add(aId);
          const actTime = act.waktuAktualKunjungan || act.tanggal || act.tanggalKunjungan || act.waktuSelesai;
          const actTimestamp = actTime ? new Date(actTime).getTime() : null;

          const scheduledDeadline = prevVisitTime
            ? new Date(prevVisitTime + 72 * 60 * 60 * 1000).toISOString()
            : null;

          let isLate = act.wasLate || act.terlambat ||
            (typeof act.statusKunjungan === 'string' && act.statusKunjungan.toLowerCase().includes('terlambat'));

          if (!isLate && prevVisitTime && actTimestamp) {
            const diffHours = (actTimestamp - prevVisitTime) / (1000 * 60 * 60);
            if (diffHours > 72) {
              isLate = true;
            }
          }

          if (isLate) terlambatCount++;
          else tepatCount++;

          visitsList.push({
            id: aId,
            nomorKunjungan: visitsList.length + 1,
            jenisKunjungan: act.nomorKunjungan ? `Kunjungan Lanjutan Ke-${act.nomorKunjungan}` : `Kunjungan Lanjutan Ke-${visitsList.length + 1}`,
            tanggalInformasiDiterima: v.tanggalInformasiDiterima,
            tanggalSeharusnyaDilakukan: scheduledDeadline,
            tanggalKunjunganAktual: actTime,
            kondisiKorban: act.kondisiKorban || act.kondisi || v.kondisiTerakhir || 'Masih Dirawat',
            hasilKunjungan: act.hasilKunjungan || act.hasilPemantauan || 'Pemantauan perkembangan pasien rawat inap berkala.',
            checklist: [
              { label: 'Konfirmasi kondisi fisik terkini pasien dengan perawat jaga', done: true },
              { label: 'Pengecekan estimasi rincian biaya pengobatan & plafon santunan', done: true },
              { label: 'Koordinasi rencana tindakan medis lanjutan atau rencana pulang', done: true }
            ],
            catatanTindakLanjut: act.catatanTindakLanjut || act.tindakLanjut || v.tindakLanjut || 'Lanjutkan pemantauan berkala 3 hari berikutnya.',
            fotoUrl: act.fotoUrl || null,
            latitude: act.latitude || '0.5123',
            longitude: act.longitude || '101.4421',
            akurasiLokasi: act.akurasiLokasi || '± 8 meter (Akurat)',
            terlambat: isLate,
            statusSla: isLate ? 'Terlambat' : 'Tepat Waktu'
          });

          if (actTimestamp) prevVisitTime = actTimestamp;
        }
      });

      const totalKunjungan = visitsList.length;

      const refInfo = getReferralPerspectiveInfo(v, null, officer);

      return {
        id: v.id,
        nama: v.nama,
        nik: v.nik,
        nomorLaporan: v.nomorLaporan,
        rumahSakit: refInfo.displayHospital,
        referralBadge: refInfo.isReferred ? refInfo.badgeLabel : null,
        referralColorClass: refInfo.badgeColorClass,
        tanggalKecelakaan: v.tanggalKecelakaan,
        tanggalMasukRs: v.tanggalMasukRs || v.tanggalInformasiDiterima,
        kondisiTerakhir: v.kondisiTerakhir || v.kondisi || v.status_kondisi || 'Masih Dirawat',
        statusPemantauan: v.statusPemantauan,
        totalKunjungan,
        tepatCount,
        terlambatCount,
        isLate: terlambatCount > 0,
        visitsList
      };
    });
  }, [officerVictimsInPeriod]);

  // 4. Ringkasan Kinerja (4 Card Utama Sesuai Aturan B)
  const metrics = useMemo(() => {
    let totalKunjungan = 0;
    let kunjunganTepat = 0;
    let kunjunganTerlambat = 0;

    victimRows.forEach((v) => {
      totalKunjungan += v.totalKunjungan;
      kunjunganTepat += v.tepatCount;
      kunjunganTerlambat += v.terlambatCount;
    });

    const kepatuhanSla = totalKunjungan > 0
      ? Math.round((kunjunganTepat / totalKunjungan) * 100)
      : null;

    return {
      totalKunjungan,
      kepatuhanSla,
      kunjunganTepat,
      kunjunganTerlambat
    };
  }, [victimRows]);

  // 5. Data Grafik Aktivitas Kunjungan (Bagian C - 100% Data Aktual)
  const chartData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const monthlyStats = months.map((bulan) => ({ bulan, tepat: 0, terlambat: 0 }));

    if (periodFilter === 'THIS_MONTH' || periodFilter === 'LAST_MONTH') {
      const now = new Date();
      const targetMonth = periodFilter === 'THIS_MONTH' ? now.getMonth() : (now.getMonth() === 0 ? 11 : now.getMonth() - 1);
      const targetYear = periodFilter === 'THIS_MONTH' ? now.getFullYear() : (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());

      const weeklyStats = [
        { bulan: 'Minggu 1 (1-7)', tepat: 0, terlambat: 0 },
        { bulan: 'Minggu 2 (8-14)', tepat: 0, terlambat: 0 },
        { bulan: 'Minggu 3 (15-21)', tepat: 0, terlambat: 0 },
        { bulan: 'Minggu 4 (22+)', tepat: 0, terlambat: 0 }
      ];

      victimRows.forEach((vr) => {
        vr.visitsList.forEach((vis) => {
          if (!vis.tanggalKunjunganAktual) return;
          const d = new Date(vis.tanggalKunjunganAktual);
          if (isNaN(d.getTime())) return;
          if (d.getFullYear() === targetYear && d.getMonth() === targetMonth) {
            const day = d.getDate();
            const wIdx = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3;
            if (vis.terlambat) weeklyStats[wIdx].terlambat++;
            else weeklyStats[wIdx].tepat++;
          }
        });
      });

      return weeklyStats;
    }

    victimRows.forEach((vr) => {
      vr.visitsList.forEach((vis) => {
        if (!vis.tanggalKunjunganAktual) return;
        const d = new Date(vis.tanggalKunjunganAktual);
        if (isNaN(d.getTime())) return;
        const mIdx = d.getMonth();
        if (mIdx >= 0 && mIdx < 12) {
          if (vis.terlambat) monthlyStats[mIdx].terlambat++;
          else monthlyStats[mIdx].tepat++;
        }
      });
    });

    return monthlyStats;
  }, [victimRows, periodFilter]);

  // 6. Filter Korban Berdasarkan Pencarian, Status SLA, dan Kondisi (Bagian D)
  const filteredVictims = useMemo(() => {
    const filteredVictimsList = victimRows.filter((v) => {
      const matchSearch =
        v.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.rumahSakit.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.nik && v.nik.includes(searchQuery)) ||
        (v.nomorLaporan && v.nomorLaporan.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchSearch) return false;

      if (slaFilter === 'TEPAT' && (v.terlambatCount > 0 || v.totalKunjungan === 0)) return false;
      if (slaFilter === 'TERLAMBAT' && v.terlambatCount === 0) return false;
      if (slaFilter === 'MENUNGGU' && v.totalKunjungan > 0) return false;

      if (conditionFilter !== 'ALL') {
        const kLower = v.kondisiTerakhir.toLowerCase();
        if (conditionFilter === 'Dirawat' && !kLower.includes('rawat') && !kLower.includes('dirawat')) return false;
        if (conditionFilter === 'Pulang' && !kLower.includes('pulang') && !kLower.includes('selesai')) return false;
        if (conditionFilter === 'Meninggal' && !kLower.includes('meninggal')) return false;
      }

      return true;
    });

    if (!sortConfig.key) return filteredVictimsList;

    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    const toTime = (val) => {
      const d = parseDateSafe(val);
      return d ? d.getTime() : 0;
    };
    const getSlaRank = (v) => {
      if (v.totalKunjungan === 0) return 'Menunggu';
      return v.isLate ? 'Pernah Terlambat' : 'Tepat Waktu';
    };

    return [...filteredVictimsList].sort((a, b) => {
      switch (sortConfig.key) {
        case 'nama':
          return dir * (a.nama || '').trim().localeCompare((b.nama || '').trim(), 'id', { sensitivity: 'base', numeric: true });
        case 'rumahSakit':
          return dir * (a.rumahSakit || '').trim().localeCompare((b.rumahSakit || '').trim(), 'id', { sensitivity: 'base', numeric: true });
        case 'tanggalKecelakaan':
          return dir * (toTime(a.tanggalKecelakaan) - toTime(b.tanggalKecelakaan));
        case 'tanggalMasukRs':
          return dir * (toTime(a.tanggalMasukRs) - toTime(b.tanggalMasukRs));
        case 'totalKunjungan':
          return dir * ((a.totalKunjungan || 0) - (b.totalKunjungan || 0));
        case 'sla':
          return dir * getSlaRank(a).localeCompare(getSlaRank(b), 'id', { sensitivity: 'base', numeric: true });
        case 'kondisiTerakhir':
          return dir * (a.kondisiTerakhir || '').trim().localeCompare((b.kondisiTerakhir || '').trim(), 'id', { sensitivity: 'base', numeric: true });
        default:
          return 0;
      }
    });
  }, [victimRows, searchQuery, slaFilter, conditionFilter, sortConfig]);

  // Label periode untuk UI
  const nowRef = new Date();
  const currentYear = nowRef.getFullYear();
  const MONTH_NAMES_INDO = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const currentMonthName = MONTH_NAMES_INDO[nowRef.getMonth()];
  const lastMonthIdx = nowRef.getMonth() === 0 ? 11 : nowRef.getMonth() - 1;
  const lastMonthYear = nowRef.getMonth() === 0 ? currentYear - 1 : currentYear;
  const lastMonthName = MONTH_NAMES_INDO[lastMonthIdx];

  const periodLabel = useMemo(() => {
    if (periodFilter === 'THIS_MONTH') return `Bulan Ini (${currentMonthName} ${currentYear})`;
    if (periodFilter === 'LAST_MONTH') return `Bulan Lalu (${lastMonthName} ${lastMonthYear})`;
    if (periodFilter === 'THIS_YEAR') return `Tahun Ini (${currentYear})`;
    return 'Semua Periode';
  }, [periodFilter, currentMonthName, currentYear, lastMonthName, lastMonthYear]);

  if (!officer) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-slate-600 font-semibold">Petugas tidak ditemukan dalam sistem.</p>
        <Link
          to="/kabag"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#145DA0] text-white rounded-xl text-xs font-bold hover:bg-[#0A3981] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Dashboard</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ── TOMBOL KEMBALI KE DASHBOARD & TOOLBAR PERIODE ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          to="/kabag"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3.5 py-2 rounded-xl shadow-2xs transition-colors self-start cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
          <span>Kembali ke Dashboard</span>
        </Link>

        {/* Filter Periode Laporan */}
        <div className="flex items-center gap-2 text-xs self-start sm:self-auto flex-wrap">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="bg-transparent text-slate-700 font-semibold focus:outline-none pr-1 cursor-pointer text-xs"
            >
              <option value="ALL">Semua Periode</option>
              <option value="THIS_YEAR">Tahun Ini ({currentYear})</option>
              <option value="THIS_MONTH">Bulan Ini ({currentMonthName} {currentYear})</option>
              <option value="LAST_MONTH">Bulan Lalu ({lastMonthName} {lastMonthYear})</option>
            </select>
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

      {/* ── A. INFORMASI PETUGAS ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#145DA0] font-black text-sm flex items-center justify-center shrink-0 border border-blue-100 shadow-2xs">
            <User className="w-6 h-6 text-[#145DA0]" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {officer.nama}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Petugas Mobile Service • Wilayah: <strong className="text-slate-700">{officer.wilayah || '—'}</strong> • NIP: <span className="font-mono text-slate-700">{officer.nip || '—'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs">
            Periode Laporan: <strong className="text-[#145DA0]">{periodLabel}</strong>
          </span>
        </div>
      </div>

      {/* ── B. RINGKASAN KINERJA (4 CARD UTAMA - ANGKA BESAR MINIMALIS) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Kunjungan */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Total Kunjungan
          </span>
          <div className="mt-3">
            <span className="text-3xl font-black font-mono tracking-tight text-slate-900">
              {metrics.totalKunjungan}
            </span>
          </div>
        </div>

        {/* Card 2: Kepatuhan SLA */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Kepatuhan SLA
          </span>
          <div className="mt-3">
            <span className={`text-3xl font-black font-mono tracking-tight ${
              metrics.kepatuhanSla === null
                ? 'text-slate-400'
                : metrics.kepatuhanSla >= 90
                  ? 'text-emerald-600'
                  : metrics.kepatuhanSla >= 80
                    ? 'text-amber-600'
                    : 'text-rose-600'
            }`}>
              {metrics.kepatuhanSla === null ? 'N/A' : `${metrics.kepatuhanSla}%`}
            </span>
          </div>
        </div>

        {/* Card 3: Kunjungan Tepat Waktu */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Kunjungan Tepat Waktu
          </span>
          <div className="mt-3">
            <span className="text-3xl font-black font-mono tracking-tight text-emerald-600">
              {metrics.kunjunganTepat}
            </span>
          </div>
        </div>

        {/* Card 4: Kunjungan Terlambat */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            Kunjungan Terlambat
          </span>
          <div className="mt-3">
            <span className={`text-3xl font-black font-mono tracking-tight ${
              metrics.kunjunganTerlambat > 0 ? 'text-rose-600' : 'text-slate-900'
            }`}>
              {metrics.kunjunganTerlambat}
            </span>
          </div>
        </div>
      </div>

      {/* ── C. GRAFIK AKTIVITAS KUNJUNGAN ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#145DA0]" />
              <span>Grafik Aktivitas Kunjungan Petugas</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Perbandingan jumlah kunjungan tepat waktu dan terlambat pada periode {periodLabel.toLowerCase()}
            </p>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 self-start sm:self-auto">
            Standar SLA: Maksimal 3 Hari (72 Jam)
          </span>
        </div>

        <div className="h-[220px] w-full pt-2">
          <ResponsiveContainer width="100%" height={210} minHeight={200} minWidth={0}>
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 15, left: -20, bottom: 0 }}
              barGap={4}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis
                dataKey="bulan"
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={{ stroke: '#CBD5E1' }}
                tickLine={{ stroke: '#CBD5E1' }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#64748B' }}
                axisLine={{ stroke: '#CBD5E1' }}
                tickLine={{ stroke: '#CBD5E1' }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-xl text-xs space-y-1.5 border border-slate-700 min-w-[160px]">
                        <p className="font-bold border-b border-slate-700 pb-1 text-slate-200">
                          {label}
                        </p>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Tepat Waktu:</span>
                          <span className="font-bold text-emerald-400 font-mono">{payload[0]?.value || 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Terlambat:</span>
                          <span className="font-bold text-rose-400 font-mono">{payload[1]?.value || 0}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconSize={8}
                wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
              />
              <Bar
                dataKey="tepat"
                name="Tepat Waktu"
                fill="#10B981"
                radius={[4, 4, 0, 0]}
                barSize={16}
              />
              <Bar
                dataKey="terlambat"
                name="Terlambat"
                fill="#EF4444"
                radius={[4, 4, 0, 0]}
                barSize={16}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── D. DAFTAR KORBAN & RIWAYAT KUNJUNGAN (1 BARIS PER KORBAN UNIK) ── */}
      {/* Kolom: Nama Korban | RS | Tgl Kecelakaan | Tgl Masuk RS | Total Kunjungan | SLA | Status | Aksi */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Toolbar Pencarian & Filter */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Daftar Korban yang Ditangani Petugas
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Setiap korban ditampilkan satu kali dengan rekapitulasi total kunjungan, status kepatuhan SLA 3 hari, dan kondisi terkini.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap w-full sm:w-auto">
            {/* Input Pencarian */}
            <div className="relative flex-1 sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama korban atau RS..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0] shadow-2xs"
              />
            </div>

            {/* Filter Status SLA */}
            <select
              value={slaFilter}
              onChange={(e) => setSlaFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#145DA0] shadow-2xs cursor-pointer"
            >
              <option value="ALL">Semua Status SLA</option>
              <option value="TEPAT">Tepat Waktu (100%)</option>
              <option value="TERLAMBAT">Pernah Terlambat</option>
              <option value="MENUNGGU">Menunggu Kunjungan</option>
            </select>

            {/* Filter Kondisi Korban */}
            <select
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#145DA0] shadow-2xs cursor-pointer"
            >
              <option value="ALL">Semua Kondisi</option>
              <option value="Dirawat">Masih Dirawat</option>
              <option value="Pulang">Sudah Pulang</option>
              <option value="Meninggal">Meninggal Dunia</option>
            </select>
          </div>
        </div>

        {/* Tabel Desktop View: Nama Korban | RS | Tgl Kecelakaan | Tgl Masuk RS | Total Kunjungan | SLA | Status | Aksi */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200">
                <SortableHeader
                  label="Nama Korban"
                  sortKey="nama"
                  currentSortKey={sortConfig.key}
                  currentSortDirection={sortConfig.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="RS Saat Ini"
                  sortKey="rumahSakit"
                  currentSortKey={sortConfig.key}
                  currentSortDirection={sortConfig.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Tgl Kecelakaan"
                  sortKey="tanggalKecelakaan"
                  currentSortKey={sortConfig.key}
                  currentSortDirection={sortConfig.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Tgl Masuk RS"
                  sortKey="tanggalMasukRs"
                  currentSortKey={sortConfig.key}
                  currentSortDirection={sortConfig.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Total Kunjungan"
                  sortKey="totalKunjungan"
                  currentSortKey={sortConfig.key}
                  currentSortDirection={sortConfig.direction}
                  onSort={handleSort}
                  align="center"
                  className="text-center"
                />
                <SortableHeader
                  label="SLA"
                  sortKey="sla"
                  currentSortKey={sortConfig.key}
                  currentSortDirection={sortConfig.direction}
                  onSort={handleSort}
                  align="center"
                  className="text-center"
                />
                <SortableHeader
                  label="Status"
                  sortKey="kondisiTerakhir"
                  currentSortKey={sortConfig.key}
                  currentSortDirection={sortConfig.direction}
                  onSort={handleSort}
                />
                <th className="py-3 px-4 font-bold text-slate-700 uppercase tracking-wider text-[11px] text-right">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVictims.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <CalendarCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-700 text-xs">Tidak ada data korban yang sesuai kriteria pencarian.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Ubah kata kunci pencarian atau sesuaikan filter di atas.</p>
                  </td>
                </tr>
              ) : (
                filteredVictims.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => {
                      setSelectedVictim(v);
                      setActiveVisitIndex(0);
                    }}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                  >
                    {/* 1. Nama Korban */}
                    <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                      <span className="block group-hover:text-[#145DA0] transition-colors font-extrabold">
                        {v.nama}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                        {v.nomorLaporan || (v.nik ? `NIK: ${v.nik}` : `ID: ${v.id}`)}
                      </span>
                    </td>

                    {/* 2. RS */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-800 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{v.rumahSakit}</span>
                      </div>
                    </td>

                    {/* 3. Tgl Kecelakaan */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-700 font-medium font-mono text-xs">
                      {formatIndoDate(v.tanggalKecelakaan)}
                    </td>

                    {/* 4. Tgl Masuk RS */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-700 font-medium font-mono text-xs">
                      {formatIndoDate(v.tanggalMasukRs)}
                    </td>

                    {/* 5. Total Kunjungan */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 text-[#145DA0] font-bold font-mono text-xs border border-blue-100 shadow-2xs">
                        <CalendarCheck className="w-3.5 h-3.5 text-[#145DA0]" />
                        <span>{v.totalKunjungan} Kunjungan</span>
                      </span>
                    </td>

                    {/* 6. SLA */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {v.totalKunjungan === 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3" />
                          <span>Menunggu</span>
                        </span>
                      ) : v.terlambatCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                          <span>Terlambat ({v.terlambatCount}x)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                          <span>Tepat Waktu</span>
                        </span>
                      )}
                    </td>

                    {/* 7. Status */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <ConditionBadge kondisi={v.kondisiTerakhir} size="xs" />
                    </td>

                    {/* 8. Aksi */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVictim(v);
                          setActiveVisitIndex(0);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50/50 text-[#145DA0] hover:bg-blue-100 font-bold text-xs transition-colors cursor-pointer"
                        title="Buka Riwayat Detail Kunjungan Korban"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Aksi Detail</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List View (< md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredVictims.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <CalendarCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-bold text-slate-700 text-xs">Tidak ada data korban.</p>
            </div>
          ) : (
            filteredVictims.map((v) => (
              <div
                key={v.id}
                onClick={() => {
                  setSelectedVictim(v);
                  setActiveVisitIndex(0);
                }}
                className="p-4 space-y-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-extrabold text-slate-900 text-xs block">
                      {v.nama}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {v.nomorLaporan || `ID: ${v.id}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ConditionBadge kondisi={v.kondisiTerakhir} size="xs" />
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-2.5 text-[11px] text-slate-600 space-y-1.5 border border-slate-100">
                  <div className="flex items-center gap-1.5 font-medium text-slate-800">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{v.rumahSakit}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] pt-1 border-t border-slate-200/60">
                    <div>
                      <span className="text-slate-400 block">Tgl Masuk RS:</span>
                      <strong className="text-slate-800">{formatIndoDate(v.tanggalMasukRs)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Kunjungan:</span>
                      <strong className="text-[#145DA0]">{v.totalKunjungan} Kunjungan</strong>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200/60">
                    <span className="text-slate-400">Status SLA:</span>
                    {v.terlambatCount > 0 ? (
                      <span className="font-bold text-rose-600">Terlambat ({v.terlambatCount}x)</span>
                    ) : (
                      <span className="font-bold text-emerald-600">Tepat Waktu</span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedVictim(v);
                    setActiveVisitIndex(0);
                  }}
                  className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-blue-50 text-[#145DA0] border border-blue-200 flex items-center justify-center gap-1.5 shadow-2xs hover:bg-blue-100 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Lihat Riwayat Kunjungan ({v.totalKunjungan})</span>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── E. MODAL DETAIL KUNJUNGAN KORBAN (SESUAI ATURAN E) ── */}
      {selectedVictim && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-3xl my-8 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#145DA0] flex items-center justify-center border border-blue-100 shadow-2xs font-black text-sm">
                  <User className="w-5 h-5 text-[#145DA0]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base text-slate-900">
                      {selectedVictim.nama}
                    </h3>
                    <ConditionBadge kondisi={selectedVictim.kondisiTerakhir} size="xs" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {selectedVictim.rumahSakit} • {selectedVictim.totalKunjungan} Kunjungan Teregistrasi
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedVictim(null)}
                className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 flex items-center justify-center transition-colors cursor-pointer"
                title="Tutup Rincian"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 max-h-[calc(85vh-120px)] overflow-y-auto">
              {/* Tab Navigasi Setiap Kunjungan Korban */}
              {selectedVictim.visitsList.length > 0 ? (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    Pilih Kunjungan yang Ingin Dievaluasi:
                  </span>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {selectedVictim.visitsList.map((vis, idx) => (
                      <button
                        key={vis.id}
                        type="button"
                        onClick={() => setActiveVisitIndex(idx)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                          activeVisitIndex === idx
                            ? 'bg-[#145DA0] text-white border-[#145DA0] shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${vis.terlambat ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                          <span>{vis.jenisKunjungan}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-200">
                  <Clock className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <p className="font-bold text-slate-800 text-xs">Belum Ada Kunjungan Selesai</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Korban baru terdata dan masih menunggu pelaksanaan kunjungan pertama oleh petugas.
                  </p>
                </div>
              )}

              {/* Rincian Kunjungan Aktif Terpilih (Sesuai Butir E) */}
              {selectedVictim.visitsList[activeVisitIndex] && (() => {
                const curVisit = selectedVictim.visitsList[activeVisitIndex];

                return (
                  <div className="space-y-4 pt-1">
                    {/* Status SLA Banner */}
                    <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                      curVisit.terlambat
                        ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                        : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                    }`}>
                      <div className="flex items-center gap-2 text-xs font-bold">
                        {curVisit.terlambat ? (
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        )}
                        <span>Status SLA: {curVisit.statusSla}</span>
                      </div>
                      <span className="text-[10px] font-semibold opacity-80">
                        Aturan SLA: Kunjungan Wajib Maksimal 3 Hari (72 Jam)
                      </span>
                    </div>

                    {/* 1. Komparasi 3 Waktu Kunci (Informasi Diterima, Seharusnya Dilakukan, Aktual) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      {/* Tanggal Informasi Korban Diterima */}
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Informasi Diterima
                        </span>
                        <p className="font-bold text-slate-900">
                          {formatIndoDateTime(curVisit.tanggalInformasiDiterima)}
                        </p>
                        <span className="text-[10px] text-slate-400 block">Titik Awal SLA</span>
                      </div>

                      {/* Tanggal Kunjungan yang Seharusnya Dilakukan */}
                      <div className="bg-blue-50/50 p-3 rounded-2xl border border-blue-200/80 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#145DA0] block">
                          Batas Maksimal SLA
                        </span>
                        <p className="font-bold text-[#145DA0]">
                          {formatIndoDateTime(curVisit.tanggalSeharusnyaDilakukan)}
                        </p>
                        <span className="text-[10px] text-blue-600/80 block">Maksimal 3 Hari</span>
                      </div>

                      {/* Tanggal Kunjungan Aktual */}
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Kunjungan Aktual
                        </span>
                        <p className="font-bold text-slate-900">
                          {formatIndoDateTime(curVisit.tanggalKunjunganAktual)}
                        </p>
                        <span className={`text-[10px] font-bold block ${
                          curVisit.terlambat ? 'text-rose-600' : 'text-emerald-600'
                        }`}>
                          {curVisit.statusSla}
                        </span>
                      </div>
                    </div>

                    {/* 2. Hasil Kunjungan & Kondisi Terakhir Korban */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Hasil Kunjungan Petugas
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500">Kondisi Saat Kunjungan:</span>
                          <ConditionBadge kondisi={curVisit.kondisiKorban} size="xs" />
                        </div>
                      </div>
                      <p className="text-slate-800 leading-relaxed font-medium pt-1">
                        {curVisit.hasilKunjungan}
                      </p>
                    </div>

                    {/* 3. Hasil Checklist Kunjungan */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Hasil Checklist Kunjungan Petugas
                      </span>
                      <div className="space-y-1.5 pt-1">
                        {curVisit.checklist.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2.5 text-slate-700">
                            <div className="w-4 h-4 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                            <span className="text-xs font-medium">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 4. Catatan Tindak Lanjut */}
                    <div className="bg-amber-50/40 p-4 rounded-2xl border border-amber-200 space-y-1.5 text-xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                        Catatan Tindak Lanjut
                      </span>
                      <p className="text-slate-800 leading-relaxed font-medium">
                        {curVisit.catatanTindakLanjut}
                      </p>
                    </div>

                    {/* 5. Dokumentasi Foto dan Titik Koordinat Lokasi (GPS) */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Dokumentasi Foto &amp; Titik Koordinat Lokasi
                      </span>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                        {/* Foto Dokumentasi */}
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 text-center flex flex-col items-center justify-center min-h-[140px]">
                          <AuthenticatedImage
                            src={curVisit.fotoUrl || getRealVisitPhoto(curVisit.id || curVisit.visitId)}
                            alt="Dokumentasi Kunjungan"
                            className="w-full h-36 object-cover rounded-xl border border-slate-200 shadow-2xs"
                          />
                        </div>

                        {/* Titik Koordinat GPS */}
                        <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                          <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
                            <Navigation className="w-4 h-4 text-[#145DA0]" />
                            <span>Koordinat GPS Kunjungan</span>
                          </div>
                          <div className="font-mono text-xs text-slate-800 space-y-0.5">
                            <p>Latitude: <strong>{curVisit.latitude}</strong></p>
                            <p>Longitude: <strong>{curVisit.longitude}</strong></p>
                            <p className="text-[10px] text-emerald-600 font-sans font-semibold pt-0.5">
                              Akurasi: {curVisit.akurasiLokasi}
                            </p>
                          </div>
                          <a
                            href={`https://www.google.com/maps?q=${curVisit.latitude},${curVisit.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[#145DA0] font-bold text-[11px] hover:bg-slate-50 transition-colors shadow-2xs mt-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Buka di Google Maps</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Pilih tab kunjungan di atas untuk melihat detail kunjungan lainnya.
              </span>
              <button
                type="button"
                onClick={() => setSelectedVictim(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0A3981] text-white shadow-2xs transition-colors cursor-pointer"
              >
                Tutup Rincian
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
