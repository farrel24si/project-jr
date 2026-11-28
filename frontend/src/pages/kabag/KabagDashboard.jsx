import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  Download,
  RotateCcw,
  ChevronRight,
  Search,
  TrendingUp,
  Activity,
  Eye,
  Building2,
  Filter,
  UserCheck,
  ShieldCheck,
  Award,
  AlertCircle
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend
} from 'recharts';
import VictimDetailDrawer from '../../components/kabag/VictimDetailDrawer';
import { storageService, isDummyVictim } from '../../services/storageService';
import {
  calculateFirstVisitSla,
  calculateMonitoringSla,
  getVictimDeadline,
  evaluateOfficerKpi
} from '../../services/slaService';
import { isVictimFinished } from '../../utils/monitoringStatus';
import { formatDateTimeIndo as formatDateTime } from '../../utils/dateUtils';

const MONTH_NAMES_INDO = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function KabagDashboard() {
  const navigate = useNavigate();

  // ── 1. STATE DATA & FILTER ──
  const now = new Date();
  const currentYearNum = now.getFullYear();
  const currentMonthIdx = now.getMonth();

  const [victims, setVictims] = useState(() => storageService.getVictims());
  const [selectedYear, setSelectedYear] = useState(() => String(currentYearNum));
  const [filterPeriod, setFilterPeriod] = useState('THIS_YEAR'); // THIS_YEAR, THIS_MONTH, LAST_MONTH, SIX_MONTHS, ALL, CUSTOM
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedOfficerFilter, setSelectedOfficerFilter] = useState('ALL');
  const [actionSearch, setActionSearch] = useState('');

  // Tahun tersedia secara dinamis dari database korban
  const availableYears = useMemo(() => {
    const yearsSet = new Set([
      currentYearNum,
      currentYearNum - 1,
      currentYearNum - 2,
      currentYearNum + 1
    ]);
    victims.forEach((v) => {
      const dates = [
        v.tanggalInformasiDiterima,
        v.tanggalMasukRs,
        v.tanggalKecelakaan,
        ...(v.riwayatAktivitas || []).map((a) => a.tanggalKunjungan || a.tanggal || a.waktuAktualKunjungan || a.waktuSelesai),
        ...(v.riwayatKunjungan || []).map((k) => k.tanggalKunjungan || k.tanggal || k.waktuAktualKunjungan)
      ];
      dates.forEach((dStr) => {
        if (!dStr) return;
        const d = new Date(dStr);
        if (!isNaN(d.getTime())) {
          yearsSet.add(d.getFullYear());
        }
      });
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [victims, currentYearNum]);

  // Drawer Detail Korban
  const [selectedVictimForDrawer, setSelectedVictimForDrawer] = useState(null);

  // Filter petugas riil yang terdaftar (selalu kecualikan data dummy)
  const filterValidOfficers = (list) => {
    const DUMMY_FILTER = ['citra dewi', 'budi santoso', 'eko prasetyo', 'doni setiawan', 'maya anggraini', 'hendra pratama', 'siti nurhaliza', 'dimas anggara', 'ahmad fauzi', 'adi putra', 'andi pratama', 'rina kusuma', 'dedi saputra', 'sari wulandari', 'bagus santoso', 'lestari dewi'];
    return (list || []).filter((o) => {
      const lower = (o.nama || '').toLowerCase();
      return lower && !DUMMY_FILTER.some((d) => lower.includes(d));
    });
  };

  const [officers, setOfficers] = useState(() => filterValidOfficers(storageService.getOfficers()));

  const loadData = () => {
    setVictims((storageService.getVictims() || []).filter((v) => !isDummyVictim(v)));
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

  // ── 2. FILTER DATA KORBAN SECARA REAKTIF ──
  const periodFilteredVictims = useMemo(() => {
    let list = victims;

    if (selectedOfficerFilter !== 'ALL') {
      const selectedOff = officers.find((o) => o.id === selectedOfficerFilter);
      if (selectedOff) {
        list = list.filter((v) => storageService.isOfficerAssignedToVictim(selectedOff, v, officers));
      }
    }

    if (filterPeriod === 'ALL') return list;

    const targetYearNum = Number(selectedYear);
    const nowRef = new Date();

    return list.filter((v) => {
      const datesToCheck = [
        v.tanggalInformasiDiterima,
        v.tanggalMasukRs,
        v.tanggalKecelakaan,
        ...(v.riwayatAktivitas || []).map((a) => a.tanggalKunjungan || a.tanggal || a.waktuAktualKunjungan || a.waktuSelesai),
        ...(v.riwayatKunjungan || []).map((k) => k.tanggalKunjungan || k.tanggal || k.waktuAktualKunjungan)
      ].filter(Boolean);

      if (datesToCheck.length === 0) return false;

      return datesToCheck.some((dateStr) => {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        const year = d.getFullYear();
        const month = d.getMonth();

        if (filterPeriod === 'THIS_YEAR') return year === targetYearNum;
        if (filterPeriod === 'SIX_MONTHS') {
          const target = new Date(year, month, 1);
          const sixMonthsAgo = new Date(nowRef.getFullYear(), nowRef.getMonth() - 5, 1);
          return target >= sixMonthsAgo && target <= nowRef;
        }
        if (filterPeriod === 'THIS_MONTH') {
          return year === targetYearNum && month === nowRef.getMonth();
        }
        if (filterPeriod === 'LAST_MONTH') {
          const lastMonthDate = new Date(nowRef.getFullYear(), nowRef.getMonth() - 1, 1);
          return year === lastMonthDate.getFullYear() && month === lastMonthDate.getMonth();
        }
        if (filterPeriod === 'CUSTOM') {
          if (!customStartDate && !customEndDate) return true;
          const t = d.getTime();
          const start = customStartDate ? new Date(customStartDate).getTime() : 0;
          const end = customEndDate ? new Date(customEndDate).getTime() + 86400000 : Infinity;
          return t >= start && t <= end;
        }
        return true;
      });
    });
  }, [victims, filterPeriod, selectedYear, customStartDate, customEndDate, selectedOfficerFilter, officers]);

  // ── 3. SECTION 1: 4 KARTU UTAMA RINGKASAN DASHBOARD (ANGKA BESAR & MINIMALIS) ──
  // - Total Korban
  // - Total Petugas
  // - Kepatuhan SLA (%) = (Kunjungan Tepat Waktu / Total Kunjungan) * 100% (Sinkron 100% dengan Grafik Tren & KPI Petugas)
  // - Kunjungan Terlambat = Total Riwayat Kunjungan yang Terlambat
  const summaryKpis = useMemo(() => {
    let totalTepat = 0;
    let totalTerlambat = 0;
    const seenVisits = new Set();
    const targetYearNum = Number(selectedYear);
    const nowRef = new Date();

    periodFilteredVictims.forEach((v) => {
      if (v.statusPemantauan === 'Diarsipkan' || v.status_pemantauan === 'Diarsipkan') return;

      const hasFirstDone = Boolean(v.kunjunganPertama && v.kunjunganPertama.statusKunjungan !== 'Menunggu');

      // 1. Kunjungan awal yang sudah selesai dilaksanakan
      if (hasFirstDone) {
        const rawDate = v.kunjunganPertama.tanggalKunjungan || v.kunjunganPertama.waktuAktualKunjungan || v.tanggalKunjunganTerakhir;
        if (rawDate) {
          const d = new Date(rawDate);
          if (!isNaN(d.getTime())) {
            let inPeriod = true;
            if (filterPeriod === 'THIS_YEAR') inPeriod = d.getFullYear() === targetYearNum;
            else if (filterPeriod === 'THIS_MONTH') inPeriod = d.getFullYear() === targetYearNum && d.getMonth() === nowRef.getMonth();
            else if (filterPeriod === 'LAST_MONTH') {
              const lastMonthDate = new Date(nowRef.getFullYear(), nowRef.getMonth() - 1, 1);
              inPeriod = d.getFullYear() === lastMonthDate.getFullYear() && d.getMonth() === lastMonthDate.getMonth();
            }

            if (inPeriod) {
              const kId = v.kunjunganPertama.id || `INIT-${v.id}`;
              if (!seenVisits.has(kId)) {
                seenVisits.add(kId);
                const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama, d);
                if (fSla.wasLate) totalTerlambat++;
                else totalTepat++;
              }
            }
          }
        }
      }

      // 2. Kunjungan berkala / lanjutan yang sudah selesai dilaksanakan
      const allActs = v.riwayatAktivitas?.length
        ? v.riwayatAktivitas
        : [...(v.riwayatKunjungan || []), ...(v.riwayatPemantauan || [])];

      allActs.forEach((act) => {
        if (!act || act.statusKunjungan === 'Menunggu' || act.jenisAktivitas === 'Kunjungan Pertama' || act.id === v.kunjunganPertama?.id) return;
        const rawDate = act.waktuAktualKunjungan || act.tanggalKunjungan || act.tanggal || act.waktuSelesai;
        if (!rawDate) return;
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          let inPeriod = true;
          if (filterPeriod === 'THIS_YEAR') inPeriod = d.getFullYear() === targetYearNum;
          else if (filterPeriod === 'THIS_MONTH') inPeriod = d.getFullYear() === targetYearNum && d.getMonth() === nowRef.getMonth();
          else if (filterPeriod === 'LAST_MONTH') {
            const lastMonthDate = new Date(nowRef.getFullYear(), nowRef.getMonth() - 1, 1);
            inPeriod = d.getFullYear() === lastMonthDate.getFullYear() && d.getMonth() === lastMonthDate.getMonth();
          }

          if (inPeriod) {
            const aId = act.id || `${v.id}-${act.tanggalKunjungan || act.tanggal || ''}-${act.nomorKunjungan || ''}`;
            if (!seenVisits.has(aId)) {
              seenVisits.add(aId);
              if (act.wasLate || act.terlambat || (typeof act.statusKunjungan === 'string' && act.statusKunjungan.toLowerCase().includes('terlambat'))) {
                totalTerlambat++;
              } else {
                totalTepat++;
              }
            }
          }
        }
      });
      // 3. Tugas aktif yang sedang terlambat (belum dikunjungi / lanjutan lewat 72 jam)
      if (!isVictimFinished(v)) {
        const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, hasFirstDone ? v.kunjunganPertama : null, nowRef);
        const mSla = hasFirstDone ? calculateMonitoringSla(v, nowRef) : null;
        const isPendingOverdue =
          (!hasFirstDone && fSla.isOverdue) ||
          (hasFirstDone && mSla?.isOverdue) ||
          Boolean(v.isOverdue) ||
          Boolean(v.activePendingVisit?.isOverdue3Days);
        if (isPendingOverdue) {
          totalTerlambat++;
        }
      }
    });

    const totalEvaluasi = totalTepat + totalTerlambat;
    const kepatuhanSlaPct = totalEvaluasi > 0
      ? Math.round((totalTepat / totalEvaluasi) * 100)
      : null;

    return {
      totalKorban: periodFilteredVictims.length,
      totalPetugas: officers.length,
      kepatuhanSla: kepatuhanSlaPct,
      totalTepat,
      kunjunganTerlambat: totalTerlambat
    };
  }, [periodFilteredVictims, officers, filterPeriod, selectedYear]);

  // ── 4. SECTION 2: GRAFIK PERBANDINGAN KINERJA PETUGAS ──
  const officerComparisonData = useMemo(() => {
    const targetOfficers = selectedOfficerFilter === 'ALL'
      ? officers
      : officers.filter((o) => o.id === selectedOfficerFilter);

    return targetOfficers.map((off) => {
      const victimsToCount = periodFilteredVictims.filter((v) =>
        storageService.isOfficerAssignedToVictim(off, v, officers)
      );
      // Gunakan rumus evaluasi resmi (Aturan 3 hari, Rumus Kunjungan, Rumus Pasien, Skor Rapor)
      const kpi = evaluateOfficerKpi(victimsToCount, new Date(), 90, 30, off);

      const namaSingkat = off.nama ? off.nama.split(',')[0].trim() : `Petugas ${off.id}`;

      return {
        id: off.id,
        nama: off.nama,
        namaSingkat: namaSingkat.length > 16 ? namaSingkat.slice(0, 15) + '..' : namaSingkat,
        totalKunjungan: kpi.totalKunjungan,
        kunjunganTepat: kpi.kunjunganTepat,
        kunjunganTerlambat: kpi.kunjunganTerlambat,
        persentaseSla: kpi.slaKunjungan, // Rumus 1: Nilai SLA Kunjungan (%) (null / N/A jika 0 kunjungan)
        persentaseSlaPasien: kpi.slaPasien, // Rumus 2: Nilai SLA Pasien (%) (null / N/A jika 0 pasien)
        totalPasien: kpi.totalPasien,
        pasienTanpaKeterlambatan: kpi.pasienTanpaKeterlambatan,
        skorAkhir: kpi.skorAkhir, // Skor Akhir Rapor (Poin) (null / N/A jika 0 kunjungan)
        isZeroCase: kpi.isZeroCase
      };
    }).sort((a, b) => {
      // Penilaian kinerja murni difokuskan pada kepatuhan SLA (3 hari) & ketepatan waktu kunjungan
      const valA = a.persentaseSla ?? -1;
      const valB = b.persentaseSla ?? -1;
      if (valB !== valA) return valB - valA;
      return a.kunjunganTerlambat - b.kunjunganTerlambat;
    });
  }, [officers, periodFilteredVictims, selectedOfficerFilter]);

  // ── 4B. DATA GRAFIK PRODUKTIVITAS PETUGAS, KEPATUHAN SLA (DONUT), & DISTRIBUSI BEBAN KERJA (100% AKTUAL) ──
  const productivityData = useMemo(() => {
    const bluePalette = ['#0B4B9C', '#1D5CA8', '#3B72B8', '#5B8AC7', '#78A0D4', '#8FB0DC'];
    const sorted = [...officerComparisonData].sort((a, b) => b.totalKunjungan - a.totalKunjungan);
    const totalKunjungan = sorted.reduce((acc, item) => acc + (item.totalKunjungan || 0), 0);

    const chartRows = sorted.map((item, idx) => {
      const parts = (item.nama || '').trim().split(/\s+/);
      const shortLabel = parts.length >= 2 ? `${parts[0]}\n${parts[1]}` : (item.namaSingkat || item.nama);
      return {
        ...item,
        shortLabel,
        fillColor: bluePalette[Math.min(idx, bluePalette.length - 1)]
      };
    });

    return { rows: chartRows, totalKunjungan };
  }, [officerComparisonData]);

  // Sinkron 100% dengan summaryKpis (Tepat Waktu & Terlambat aktual periode terpilih)
  const slaDonutSummary = useMemo(() => {
    const tepat = summaryKpis.totalTepat || 0;
    const terlambat = summaryKpis.kunjunganTerlambat || 0;
    const total = tepat + terlambat;
    const pctNum = total > 0 ? (tepat / total) * 100 : 100;
    const pctFormatted = total > 0 ? pctNum.toFixed(1).replace('.', ',') : '0,0';

    const pieData = total > 0
      ? [
          { name: 'Tepat Waktu', value: tepat, color: '#0B4B9C' },
          { name: 'Terlambat', value: terlambat, color: '#B45309' }
        ]
      : [{ name: 'Belum Ada Data', value: 1, color: '#E2E8F0' }];

    return { tepat, terlambat, total, pctFormatted, pieData };
  }, [summaryKpis]);

  const workloadDistribution = useMemo(() => {
    let totalSelesai = 0;
    let totalDalamProses = 0;
    let totalTertunda = 0;

    const targetOfficers = selectedOfficerFilter === 'ALL'
      ? officers
      : officers.filter((o) => o.id === selectedOfficerFilter);

    const rows = targetOfficers.map((off) => {
      const filtered = periodFilteredVictims.filter((v) =>
        storageService.isOfficerAssignedToVictim(off, v, officers)
      );

      let selesai = 0;
      let dalamProses = 0;
      let tertunda = 0;

      filtered.forEach((v) => {
        const cond = (v.kondisiTerakhir || '').toLowerCase();
        const st = (v.statusPemantauan || '').toLowerCase();
        const finished =
          isVictimFinished(v) ||
          cond.includes('pulang') ||
          cond.includes('meninggal') ||
          cond.includes('selesai') ||
          st.includes('selesai');

        if (finished) {
          selesai++;
          return;
        }

        const firstSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
        const monSla = calculateMonitoringSla(v);
        const isLate =
          (!v.kunjunganPertama && firstSla.isOverdue) ||
          monSla.isOverdue ||
          Boolean(v.isOverdue) ||
          v.slaStatus === 'TERLAMBAT';

        if (isLate) {
          tertunda++;
        } else {
          dalamProses++;
        }
      });

      totalSelesai += selesai;
      totalDalamProses += dalamProses;
      totalTertunda += tertunda;

      return {
        id: off.id,
        nama: off.nama || `Petugas ${off.id}`,
        selesai,
        dalamProses,
        tertunda,
        totalTugas: selesai + dalamProses + tertunda
      };
    }).sort((a, b) => b.totalTugas - a.totalTugas);

    const maxTugas = rows.reduce((max, r) => Math.max(max, r.totalTugas), 0);

    return {
      rows,
      maxTugas,
      totalSelesai,
      totalDalamProses,
      totalTertunda
    };
  }, [officers, periodFilteredVictims, filterPeriod]);

  // ── 5. SECTION 3: GRAFIK TREN KINERJA BULAN KE BULAN (LINE CHART 100% AKTUAL DARI DATABASE) ──
  const monthlyTrends = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const nowRef = new Date();
    const currentYear = nowRef.getFullYear();
    const currentMonth = nowRef.getMonth();
    const targetYearNum = Number(selectedYear);

    const trendVictims = selectedOfficerFilter === 'ALL'
      ? victims
      : (() => {
          const selectedOff = officers.find((o) => o.id === selectedOfficerFilter);
          return selectedOff
            ? victims.filter((v) => storageService.isOfficerAssignedToVictim(selectedOff, v, officers))
            : victims;
        })();

    return months.map((bulan, mIdx) => {
      // Periode masa depan pada tahun berjalan
      if (targetYearNum === currentYear && mIdx > currentMonth) {
        return { bulan, kepatuhanSla: null, total: 0, tepat: 0, terlambat: 0, isFuture: true };
      }

      let tepat = 0;
      let terlambat = 0;
      const seenVisitIds = new Set();

      trendVictims.forEach((v) => {
        // Kunjungan pertama
        if (v.kunjunganPertama && v.kunjunganPertama.statusKunjungan !== 'Menunggu') {
          const rawDate = v.kunjunganPertama.tanggalKunjungan || v.kunjunganPertama.waktuAktualKunjungan || v.tanggalKunjunganTerakhir;
          if (rawDate) {
            const d = new Date(rawDate);
            if (!isNaN(d.getTime()) && d.getFullYear() === targetYearNum && d.getMonth() === mIdx) {
              const kId = v.kunjunganPertama.id || `INIT-${v.id}`;
              if (!seenVisitIds.has(kId)) {
                seenVisitIds.add(kId);
                const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama, d);
                if (fSla.wasLate) terlambat++;
                else tepat++;
              }
            }
          }
        }

        // Kunjungan berkala / lanjutan
        const acts = v.riwayatAktivitas?.length
          ? v.riwayatAktivitas
          : [...(v.riwayatKunjungan || []), ...(v.riwayatPemantauan || [])];

        acts.forEach((act) => {
          if (!act || act.statusKunjungan === 'Menunggu' || act.jenisAktivitas === 'Kunjungan Pertama' || act.id === v.kunjunganPertama?.id) return;
          const rawDate = act.waktuAktualKunjungan || act.tanggalKunjungan || act.tanggal || act.waktuSelesai;
          if (!rawDate) return;
          const d = new Date(rawDate);
          if (!isNaN(d.getTime()) && d.getFullYear() === targetYearNum && d.getMonth() === mIdx) {
            const aId = act.id || `${v.id}-${act.tanggalKunjungan || act.tanggal || ''}-${act.nomorKunjungan || ''}`;
            if (!seenVisitIds.has(aId)) {
              seenVisitIds.add(aId);
              if (act.wasLate || act.terlambat || (typeof act.statusKunjungan === 'string' && act.statusKunjungan.toLowerCase().includes('terlambat'))) {
                terlambat++;
              } else {
                tepat++;
              }
            }
          }
        });
      });

      const total = tepat + terlambat;
      const kepatuhanSla = total > 0 ? Math.round((tepat / total) * 100) : null;

      return {
        bulan,
        kepatuhanSla,
        total,
        tepat,
        terlambat,
        isFuture: false
      };
    });
  }, [victims, selectedYear, selectedOfficerFilter, officers]);

  // Cek apakah seluruh bulan pada tahun yang dipilih belum memiliki data kunjungan
  const hasAnyYearData = useMemo(() => {
    return monthlyTrends.some((m) => m.total > 0);
  }, [monthlyTrends]);

  // ── 6. SECTION 4: RANKING KINERJA PETUGAS (MURNI BERDASARKAN KEPATUHAN SLA & KETEPATAN WAKTU) ──
  const officerRankings = useMemo(() => {
    return [...officerComparisonData].sort((a, b) => {
      // Petugas dengan kunjungan aktif diprioritaskan jika nilai persentase sama
      if (b.totalKunjungan > 0 && a.totalKunjungan === 0) return 1;
      if (a.totalKunjungan > 0 && b.totalKunjungan === 0) return -1;
      const slaA = a.persentaseSla ?? -1;
      const slaB = b.persentaseSla ?? -1;
      if (slaB !== slaA) return slaB - slaA;
      const skorA = a.skorAkhir ?? -1;
      const skorB = b.skorAkhir ?? -1;
      if (skorB !== skorA) return skorB - skorA;
      // Penilaian kinerja murni memprioritaskan ketepatan waktu & minim keterlambatan (tanpa kuota korban)
      return a.kunjunganTerlambat - b.kunjunganTerlambat;
    });
  }, [officerComparisonData]);

  // ── 7. SECTION 5: DAFTAR KUNJUNGAN YANG MEMERLUKAN TINDAK LANJUT ──
  const actionRequiredList = useMemo(() => {
    const nowRef = new Date();
    const items = [];

    periodFilteredVictims.forEach((v) => {
      const isDischarged = isVictimFinished(v);

      if (isDischarged) return;

      const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama, nowRef);
      const mSla = calculateMonitoringSla(v, nowRef);
      const deadline = getVictimDeadline(v, nowRef);

      let statusSla = 'Tepat Waktu';
      let statusColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
      let priority = 3;

      if (!v.kunjunganPertama) {
        if (fSla.isOverdue) {
          statusSla = 'Terlambat Kunjungan Awal';
          statusColor = 'text-rose-700 bg-rose-50 border-rose-300 font-bold';
          priority = 1; // Prioritas 1: Terlambat / Lewat Tenggat Langsung Paling Atas
        } else if (fSla.isWarning) {
          statusSla = 'Mendekati Batas Kunjungan';
          statusColor = 'text-amber-800 bg-amber-50 border-amber-300 font-bold';
          priority = 2; // Prioritas 2: Mendekati Tenggat
        } else {
          statusSla = 'Menunggu Kunjungan Awal';
          statusColor = 'text-blue-700 bg-blue-50 border-blue-200';
          priority = 3;
        }
      } else {
        if (mSla.isOverdue) {
          statusSla = 'Melewati SLA 3 Hari';
          statusColor = 'text-rose-700 bg-rose-50 border-rose-300 font-bold';
          priority = 1; // Prioritas 1: Terlambat / Lewat Tenggat Langsung Paling Atas
        } else if (mSla.isWarning) {
          statusSla = 'Mendekati Batas 3 Hari';
          statusColor = 'text-amber-800 bg-amber-50 border-amber-300 font-bold';
          priority = 2; // Prioritas 2: Mendekati Tenggat
        } else {
          statusSla = 'SLA 3 Hari Terpenuhi';
          statusColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
          priority = 4;
        }
      }

      let assignedOffName = v.namaPetugas || v.petugasNama;
      if (!assignedOffName || assignedOffName === 'Belum Ada Petugas Penanggung Jawab' || assignedOffName === 'Petugas Lapangan' || assignedOffName === 'Belum Ditugaskan' || assignedOffName === 'Belum ada Petugas') {
        const vRs = (v.rumahSakit || '').toLowerCase().trim();
        const off = officers.find(o => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some(rs => {
          const r1 = (rs || '').toLowerCase().trim();
          return r1 === vRs || (vRs.length >= 4 && (r1.includes(vRs) || vRs.includes(r1)));
        }));
        assignedOffName = off ? off.nama : 'Belum ada Petugas';
      }

      items.push({
        id: v.id,
        victim: v,
        namaKorban: v.nama,
        petugasNama: assignedOffName,
        rumahSakit: v.rumahSakit || '—',
        tanggalBerikutnya: deadline ? formatDateTime(deadline) : 'Sesuai Jadwal',
        deadlineTime: deadline ? new Date(deadline).getTime() : Infinity,
        statusSla,
        statusColor,
        priority
      });
    });

    // Filter pencarian
    let res = items;
    if (actionSearch.trim()) {
      const q = actionSearch.toLowerCase();
      res = res.filter((item) =>
        item.namaKorban.toLowerCase().includes(q) ||
        item.petugasNama.toLowerCase().includes(q) ||
        item.rumahSakit.toLowerCase().includes(q) ||
        item.statusSla.toLowerCase().includes(q)
      );
    }

    // Urutkan: Prioritas 1 (Mendekati Tenggat) paling atas, lalu Terlambat (Priority 2)
    return res.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.deadlineTime - b.deadlineTime;
    });
  }, [periodFilteredVictims, actionSearch]);

  const formattedHeaderDate = useMemo(() => {
    try {
      return new Date().toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).toUpperCase();
    } catch {
      return 'HARI INI';
    }
  }, []);

  return (
    <div className="space-y-6 pb-14">
      {/* ── HEADER UTAMA DASHBOARD ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Dashboard Kepala Bagian
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Monitoring &amp; Evaluasi Kinerja Petugas Jasa Raharja
          </p>
        </div>

        {/* Filter Toolbar Responsive */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Filter Periode */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
              className="bg-transparent text-slate-700 font-semibold focus:outline-none pr-1 cursor-pointer text-xs"
            >
              <option value="THIS_YEAR">Tahun Ini ({selectedYear})</option>
              <option value="THIS_MONTH">Bulan Ini ({MONTH_NAMES_INDO[currentMonthIdx]} {selectedYear})</option>
              <option value="LAST_MONTH">Bulan Lalu</option>
              <option value="SIX_MONTHS">6 Bulan Terakhir</option>
              <option value="ALL">Semua Periode</option>
              <option value="CUSTOM">Rentang Khusus</option>
            </select>
          </div>

          {/* Custom Date Pickers */}
          {filterPeriod === 'CUSTOM' && (
            <div className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-transparent px-2 py-0.5 text-slate-700 text-xs focus:outline-none"
              />
              <span className="text-slate-400">-</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-transparent px-2 py-0.5 text-slate-700 text-xs focus:outline-none"
              />
            </div>
          )}

          {/* Tahun */}
          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl pl-8 pr-7 py-1.5 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#145DA0] shadow-2xs cursor-pointer"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={String(yr)}>
                  {yr}
                </option>
              ))}
            </select>
            <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Tombol Muat Ulang */}
          <button
            type="button"
            onClick={loadData}
            title="Muat Ulang Data"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 shadow-2xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Export Laporan */}
          <button
            type="button"
            onClick={() => alert(`Mengekspor Laporan Evaluasi Kinerja Petugas Kabag (${filterPeriod} ${selectedYear})...`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0A3981] text-white shadow-2xs transition-colors shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* ── 1. RINGKASAN DASHBOARD (4 CARD UTAMA - ANGKA BESAR & MINIMALIS, TERHUBUNG LANGSUNG) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Korban -> Link ke /kabag/korban */}
        <Link
          to="/kabag/korban"
          className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs hover:border-blue-300 transition-all cursor-pointer block group"
          title="Buka Daftar Korban"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-[#145DA0] transition-colors">
              Beban Kasus Korban
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#145DA0] flex items-center justify-center shrink-0 border border-blue-100 group-hover:bg-[#145DA0] group-hover:text-white transition-colors">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 font-mono tracking-tight">
              {summaryKpis.totalKorban}
            </span>
            <span className="text-[10px] text-slate-400 group-hover:text-[#145DA0] font-semibold flex items-center gap-0.5">
              <span>Beban Kasus</span>
              <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </Link>

        {/* Card 2: Total Petugas -> Link ke /kabag/petugas */}
        <Link
          to="/kabag/petugas"
          className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs hover:border-purple-300 transition-all cursor-pointer block group"
          title="Buka Direktori Petugas"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-purple-700 transition-colors">
              Total Petugas
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 font-mono tracking-tight">
              {summaryKpis.totalPetugas}
            </span>
            <span className="text-[10px] text-slate-400 group-hover:text-purple-600 font-semibold flex items-center gap-0.5">
              <span>Direktori</span>
              <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </Link>

        {/* Card 3: Kepatuhan SLA -> Link ke /kabag/kinerja?tab=ringkasan */}
        <Link
          to="/kabag/kinerja?tab=ringkasan"
          className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs hover:border-emerald-300 transition-all cursor-pointer block group"
          title="Buka Ringkasan Kinerja Petugas"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-emerald-700 transition-colors">
              Kepatuhan SLA
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className={`text-3xl font-black font-mono tracking-tight ${
              summaryKpis.kepatuhanSla === null
                ? 'text-slate-400'
                : (summaryKpis.kepatuhanSla >= 90 ? 'text-emerald-600' : (summaryKpis.kepatuhanSla >= 80 ? 'text-amber-600' : 'text-rose-600'))
            }`}>
              {summaryKpis.kepatuhanSla === null ? 'N/A' : `${summaryKpis.kepatuhanSla}%`}
            </span>
            <span className="text-[10px] text-slate-400 group-hover:text-emerald-600 font-semibold flex items-center gap-0.5">
              <span>Evaluasi</span>
              <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </Link>

        {/* Card 4: Kunjungan Terlambat -> Link ke /kabag/monitoring */}
        <Link
          to="/kabag/monitoring"
          className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs hover:border-rose-300 transition-all cursor-pointer block group"
          title="Buka Monitoring Kunjungan"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-rose-700 transition-colors">
              Kunjungan Terlambat
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100 group-hover:bg-rose-600 group-hover:text-white transition-colors">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className={`text-3xl font-black font-mono tracking-tight ${
              summaryKpis.kunjunganTerlambat > 0 ? 'text-rose-600' : 'text-slate-900'
            }`}>
              {summaryKpis.kunjunganTerlambat}
            </span>
            <span className="text-[10px] text-slate-400 group-hover:text-rose-600 font-semibold flex items-center gap-0.5">
              <span>Monitoring</span>
              <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </Link>
      </div>

      {/* ── 2. GRAFIK GARIS: TREN KEPATUHAN SLA PETUGAS (TETAP ADA) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#145DA0]" />
              <span>Tren Kepatuhan SLA Petugas</span>
            </h2>
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200">
              {selectedYear}
            </span>
          </div>

          {/* Line Chart Container */}
          <div className="h-[210px] w-full pt-2 relative">
            {!hasAnyYearData && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/85 backdrop-blur-2xs text-center p-4">
                <Clock className="w-8 h-8 text-slate-300 mb-1.5" />
                <p className="text-xs font-bold text-slate-700">Belum Ada Aktivitas Kunjungan</p>
                <p className="text-[11px] text-slate-400">Tidak ada riwayat kunjungan yang tercatat untuk tahun {selectedYear}</p>
              </div>
            )}
            <ResponsiveContainer width="100%" height={200} minHeight={200} minWidth={0}>
              <LineChart
                data={monthlyTrends}
                margin={{ top: 8, right: 15, left: -18, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                  dataKey="bulan"
                  interval={0}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={{ stroke: '#CBD5E1' }}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  unit="%"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={{ stroke: '#CBD5E1' }}
                />
                <ReferenceLine
                  y={90}
                  stroke="#10B981"
                  strokeDasharray="4 4"
                  label={{ value: 'Target 90%', fill: '#059669', fontSize: 10, position: 'insideTopRight' }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700 min-w-[160px]">
                          <p className="font-bold border-b border-slate-700 pb-1 text-slate-200">
                            Bulan {label} {selectedYear}
                          </p>
                          {d.isFuture ? (
                            <p className="text-[11px] text-slate-400 pt-0.5">Periode belum berjalan</p>
                          ) : d.total > 0 ? (
                            <>
                              <div className="flex items-center justify-between text-[11px] pt-0.5">
                                <span className="text-slate-400">Kepatuhan SLA:</span>
                                <span className="font-bold text-white font-mono">{d.kepatuhanSla}%</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-400">Tepat Waktu:</span>
                                <span className="font-semibold text-emerald-400 font-mono">{d.tepat}</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-400">Terlambat:</span>
                                <span className="font-semibold text-rose-400 font-mono">{d.terlambat}</span>
                              </div>
                            </>
                          ) : (
                            <p className="text-[11px] text-slate-400 pt-0.5">Belum ada aktivitas kunjungan</p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="kepatuhanSla"
                  name="Kepatuhan SLA (%)"
                  stroke="#145DA0"
                  strokeWidth={3}
                  dot={{ r: 4, stroke: '#145DA0', strokeWidth: 2, fill: '#FFFFFF' }}
                  activeDot={{ r: 6, stroke: '#0A3981', strokeWidth: 2.5, fill: '#FFFFFF' }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-2 flex items-center justify-end text-[11px] text-slate-400">
          <span>Standar SLA: Maksimal 3 Hari (72 Jam)</span>
        </div>
      </div>

      {/* ── 3. ROW GRAFIK: PRODUKTIVITAS PETUGAS (KIRI) & KEPATUHAN SLA DONUT (KANAN) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Produktivitas Petugas (Vertical Blue Bar Chart) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                Produktivitas Petugas
              </h2>
              <span className="text-xs font-medium text-slate-500">
                Total: {productivityData.totalKunjungan} kunjungan
              </span>
            </div>

            <div className="h-[225px] w-full pt-2">
              {productivityData.rows.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Belum ada data petugas.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={215} minHeight={215} minWidth={0}>
                  <BarChart
                    data={productivityData.rows}
                    margin={{ top: 20, right: 12, left: -18, bottom: 14 }}
                    barCategoryGap="26%"
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis
                      dataKey="namaSingkat"
                      interval={0}
                      tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                      dy={6}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#94A3B8' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: '#F8FAFC' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700 min-w-[175px]">
                              <p className="font-bold border-b border-slate-700 pb-1 text-slate-200">
                                {data.nama}
                              </p>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-400">Total Kunjungan:</span>
                                <span className="font-bold text-white font-mono">{data.totalKunjungan}</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-400">Tepat Waktu:</span>
                                <span className="font-bold text-emerald-400 font-mono">{data.kunjunganTepat}</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-400">Terlambat:</span>
                                <span className="font-bold text-rose-400 font-mono">{data.kunjunganTerlambat}</span>
                              </div>
                              <p className="text-[10px] text-blue-300 italic pt-0.5">
                                Klik untuk detail petugas
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar
                      dataKey="totalKunjungan"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={42}
                      cursor="pointer"
                      onClick={(data) => {
                        if (data && data.id) navigate(`/kabag/kinerja?tab=detail&officerId=${data.id}`);
                      }}
                    >
                      {productivityData.rows.map((entry) => (
                        <Cell key={entry.id} fill={entry.fillColor} />
                      ))}
                      <LabelList
                        dataKey="totalKunjungan"
                        position="top"
                        style={{ fill: '#0F172A', fontSize: 11, fontWeight: 700 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Kepatuhan SLA (Donut Chart) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 pb-3">
              Kepatuhan SLA
            </h2>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
              {/* Donut Container */}
              <div className="relative w-[170px] h-[170px] shrink-0">
                <ResponsiveContainer width="100%" height={170} minHeight={170} minWidth={0}>
                  <PieChart>
                    <Pie
                      data={slaDonutSummary.pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={74}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      {slaDonutSummary.pieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length && slaDonutSummary.total > 0) {
                          const p = payload[0];
                          return (
                            <div className="bg-slate-900 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-semibold shadow-lg">
                              {p.name}: <span className="font-mono font-bold">{p.value}</span>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Center Percentage */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-extrabold text-slate-900 tracking-tight">
                    {slaDonutSummary.total > 0 ? `${slaDonutSummary.pctFormatted}%` : '—'}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">
                    Tepat Waktu
                  </span>
                </div>
              </div>

              {/* Right Legend Summary */}
              <div className="flex-1 w-full space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-600 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0B4B9C] shrink-0" />
                    <span>Tepat Waktu</span>
                  </span>
                  <span className="font-bold font-mono text-slate-900">
                    {slaDonutSummary.tepat}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-600 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#B45309] shrink-0" />
                    <span>Terlambat</span>
                  </span>
                  <span className="font-bold font-mono text-[#B45309]">
                    {slaDonutSummary.terlambat}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Total Dievaluasi</span>
                  <span className="font-bold font-mono text-slate-900">
                    {slaDonutSummary.total}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-2.5 mt-2 flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">Target minimum 85%</span>
            <Link
              to="/kabag/kinerja"
              className="font-bold text-[#145DA0] hover:text-[#0A3981] inline-flex items-center gap-0.5"
            >
              <span>Detail SLA</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── 4. DISTRIBUSI BEBAN KERJA PETUGAS (HORIZONTAL STACKED BAR) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Distribusi Beban Kerja Petugas
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Komposisi pekerjaan selesai, dalam proses, dan tertunda/overdue per Petugas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-semibold text-slate-700">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0B4B9C]" />
              <span>Selesai ( {workloadDistribution.totalSelesai} )</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#9DB8DF]" />
              <span>Dalam Proses ( {workloadDistribution.totalDalamProses} )</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#B45309]" />
              <span>Tertunda / Overdue ( {workloadDistribution.totalTertunda} )</span>
            </span>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          {workloadDistribution.rows.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Belum ada data beban kerja petugas pada periode ini.
            </div>
          ) : (
            workloadDistribution.rows.map((row) => {
              const denom = workloadDistribution.maxTugas > 0 ? workloadDistribution.maxTugas : 1;
              const selesaiPct = (row.selesai / denom) * 100;
              const prosesPct = (row.dalamProses / denom) * 100;
              const tertundaPct = (row.tertunda / denom) * 100;

              return (
                <div
                  key={row.id}
                  onClick={() => navigate(`/kabag/kinerja?tab=detail&officerId=${row.id}`)}
                  className="flex items-center gap-3 group cursor-pointer"
                  title="Klik untuk membuka detail kinerja petugas"
                >
                  <div className="w-28 sm:w-40 shrink-0 text-xs font-medium text-slate-700 group-hover:text-[#145DA0] truncate transition-colors">
                    {row.nama}
                  </div>

                  <div className="flex-1 flex items-center h-6 bg-slate-50 rounded-md overflow-hidden">
                    {row.totalTugas > 0 ? (
                      <div className="flex h-full w-full items-center">
                        {row.selesai > 0 && (
                          <div
                            style={{ width: `${selesaiPct}%` }}
                            className="h-full bg-[#0B4B9C] text-white text-[11px] font-bold flex items-center justify-center first:rounded-l-md last:rounded-r-md transition-all"
                            title={`Selesai: ${row.selesai}`}
                          >
                            {row.selesai}
                          </div>
                        )}
                        {row.dalamProses > 0 && (
                          <div
                            style={{ width: `${prosesPct}%` }}
                            className="h-full bg-[#9DB8DF] text-slate-800 text-[11px] font-bold flex items-center justify-center first:rounded-l-md last:rounded-r-md transition-all"
                            title={`Dalam Proses: ${row.dalamProses}`}
                          >
                            {row.dalamProses}
                          </div>
                        )}
                        {row.tertunda > 0 && (
                          <div
                            style={{ width: `${tertundaPct}%` }}
                            className="h-full bg-[#B45309] text-white text-[11px] font-bold flex items-center justify-center first:rounded-l-md last:rounded-r-md transition-all"
                            title={`Tertunda / Overdue: ${row.tertunda}`}
                          >
                            {row.tertunda}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 px-2 italic">0 tugas</span>
                    )}
                  </div>

                  <div className="w-16 shrink-0 text-right text-xs font-medium text-slate-500 font-mono">
                    {row.totalTugas} tugas
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── ROW DUA TABEL: RANKING KINERJA & DAFTAR TINDAK LANJUT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* 4. RANKING KINERJA PETUGAS */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Award className="w-4 h-4 text-[#145DA0]" />
                  <span>Ranking Kinerja Petugas</span>
                </h2>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Fokus penilaian: Kepatuhan SLA maks. 3 hari &amp; ketepatan kunjungan (Beban korban = Info beban kerja)
                </p>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-lg border border-slate-200 self-start sm:self-auto">
                {officerRankings.length} Petugas
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3 text-center w-12">Rank</th>
                    <th className="py-2.5 px-3">Nama Petugas</th>
                    <th className="py-2.5 px-3 text-center" title="Informasi beban kerja kasus, bukan target kuota">Beban Korban</th>
                    <th className="py-2.5 px-3 text-center">SLA (%)</th>
                    <th className="py-2.5 px-3 text-center">Skor Rapor</th>
                    <th className="py-2.5 px-3 text-center">Terlambat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {officerRankings.map((off, idx) => (
                    <tr
                      key={off.id}
                      onClick={() => navigate(`/kabag/kinerja?tab=detail&officerId=${off.id}`)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                    >
                      {/* Peringkat */}
                      <td className="py-3 px-3 text-center font-bold">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-black ${
                          idx === 0 ? 'bg-amber-100 text-amber-800' : (idx === 1 ? 'bg-slate-200 text-slate-800' : (idx === 2 ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'text-slate-400 font-mono'))
                        }`}>
                          {idx + 1}
                        </span>
                      </td>

                      {/* Nama Petugas */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-bold text-xs text-slate-900 group-hover:text-[#145DA0] block">
                          {off.nama}
                        </span>
                      </td>

                      {/* Jumlah Korban (Beban Kerja Murni - Bukan Target) */}
                      <td className="py-3 px-3 text-center font-bold text-slate-700 whitespace-nowrap font-mono" title={`${off.totalPasien} korban binaan (beban kerja)`}>
                        {off.totalPasien}
                      </td>

                      {/* Kepatuhan SLA */}
                      <td className="py-3 px-3 text-center font-black whitespace-nowrap font-mono">
                        {off.isZeroCase || off.persentaseSla === null ? (
                          <span className="text-slate-400 font-semibold text-xs" title="Tidak ada kunjungan pada periode ini (N/A)">
                            N/A
                          </span>
                        ) : (
                          <span 
                            className={off.persentaseSla >= 90 ? 'text-emerald-600' : (off.persentaseSla >= 80 ? 'text-amber-600' : 'text-rose-600')}
                          >
                            {off.persentaseSla}%
                          </span>
                        )}
                      </td>

                      {/* Skor Akhir Rapor (Bobot 30 Poin) */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {off.isZeroCase || off.skorAkhir === null ? (
                          <span 
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200"
                            title="Tidak ada kunjungan pada periode ini (N/A)"
                          >
                            N/A
                          </span>
                        ) : (
                          <span 
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold font-mono border ${
                              off.skorAkhir >= 30
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : off.skorAkhir >= 27
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {off.skorAkhir} / 30
                          </span>
                        )}
                      </td>

                      {/* Terlambat */}
                      <td className="py-3 px-3 text-center font-bold whitespace-nowrap font-mono">
                        <span className={off.kunjunganTerlambat > 0 ? 'text-rose-600' : 'text-slate-400'}>
                          {off.kunjunganTerlambat}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400 italic">Pilih baris untuk membuka detail rapor kinerja</span>
            <Link
              to="/kabag/petugas"
              className="font-bold text-[#145DA0] hover:text-[#0A3981] inline-flex items-center gap-1"
            >
              <span>Lihat Semua</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* 5. DAFTAR KUNJUNGAN YANG MEMERLUKAN TINDAK LANJUT */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Kunjungan Perlu Tindak Lanjut</span>
              </h2>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={actionSearch}
                  onChange={(e) => setActionSearch(e.target.value)}
                  placeholder="Cari korban, RS, petugas..."
                  className="pl-8 pr-3 py-1 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#145DA0] bg-white w-full sm:w-52 text-slate-800"
                />
              </div>
            </div>

            <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
                  <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Nama Korban</th>
                    <th className="py-2.5 px-3">Petugas</th>
                    <th className="py-2.5 px-3">Rumah Sakit</th>
                    <th className="py-2.5 px-3">Tenggat Kunjungan</th>
                    <th className="py-2.5 px-3">Status SLA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {actionRequiredList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-1.5" />
                        <p className="font-semibold text-slate-700 text-xs">Seluruh kunjungan selesai terkendali.</p>
                      </td>
                    </tr>
                  ) : (
                    actionRequiredList.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedVictimForDrawer(item.victim)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        {/* Nama Korban */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="font-bold text-xs text-slate-900 group-hover:text-[#145DA0] block">
                            {item.namaKorban}
                          </span>
                        </td>

                        {/* Petugas */}
                        <td className="py-3 px-3 whitespace-nowrap text-slate-700 font-medium">
                          {item.petugasNama === 'Belum ada Petugas' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>Belum ada Petugas</span>
                            </span>
                          ) : (
                            item.petugasNama
                          )}
                        </td>

                        {/* Rumah Sakit */}
                        <td className="py-3 px-3 whitespace-nowrap text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{item.rumahSakit}</span>
                          </div>
                        </td>

                        {/* Tanggal Kunjungan Berikutnya / Tenggat */}
                        <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-700">
                          {item.tanggalBerikutnya}
                        </td>

                        {/* Status SLA */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${item.statusColor}`}>
                            {item.statusSla}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400 italic">Klik baris korban untuk audit detail pemantauan</span>
            <Link
              to="/kabag/monitoring"
              className="font-bold text-[#145DA0] hover:text-[#0A3981] inline-flex items-center gap-1"
            >
              <span>Daftar Monitoring Lengkap</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── DRAWER DETAIL KORBAN UNTUK AUDIT LANGSUNG KABAG ── */}
      {selectedVictimForDrawer && (
        <VictimDetailDrawer
          isOpen={!!selectedVictimForDrawer}
          onClose={() => setSelectedVictimForDrawer(null)}
          victim={selectedVictimForDrawer}
        />
      )}
    </div>
  );
}
