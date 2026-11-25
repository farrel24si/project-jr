import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
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
  FileSpreadsheet,
  FileText,
  Download,
  Building2,
  BarChart3,
  Award,
  Layers,
  Activity,
  Check,
  X,
  ShieldCheck,
  ExternalLink,
  Navigation,
  User
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { storageService } from '../../services/storageService';
import {
  calculateFirstVisitSla,
  calculateMonitoringSla,
  calculateOfficerFinalScore,
  calculateSlaByTotalVisits,
  calculateSlaByTotalPatients,
  evaluateOfficerKpi
} from '../../services/slaService';
import { generatePerformancePdfReport } from '../../services/pdfReportService';
import AuthenticatedImage from '../../components/common/AuthenticatedImage';
import KabagReportPage from './KabagReportPage';
import { getReferralPerspectiveInfo } from '../../utils/referralUtils';
import { getRealVisitPhoto } from '../../utils/realPhotos';
import { formatDateIndo, formatDateTimeIndo } from '../../utils/dateUtils';

// Format Helpers
const formatDate = (dateStr) => {
  return formatDateIndo(dateStr);
};

const formatDateTime = (dateStr) => {
  return formatDateTimeIndo(dateStr);
};

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function KabagOfficerPerformance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // ── TAB STATE ('ringkasan' | 'detail' | 'laporan') ──
  const activeTab = searchParams.get('tab') || 'ringkasan';
  const paramOfficerId = searchParams.get('officerId');

  const setTab = (newTab, extraParams = {}) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', newTab);
    Object.entries(extraParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    setSearchParams(params);
  };

  // ── SHARED DATA ──
  const [victims, setVictims] = useState([]);
  const [officers, setOfficers] = useState([]);

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

  // ══════════════════════════════════════════════════════════════════════════
  // TAB 1: RINGKASAN KINERJA (KPI, SLA, RANKING, GRAFIK PERBANDINGAN)
  // ══════════════════════════════════════════════════════════════════════════
  const currentYearNum = new Date().getFullYear();
  const currentMonthNum = new Date().getMonth();

  const [periodFilter, setPeriodFilter] = useState('THIS_YEAR');
  const [selectedYear, setSelectedYear] = useState(() => String(currentYearNum));
  const [officerSearch, setOfficerSearch] = useState('');
  const [sortField, setSortField] = useState('ketepatan');
  const [sortDirection, setSortDirection] = useState('desc');
  const [rankingPage, setRankingPage] = useState(1);
  const rankingPageSize = 5;

  const availableYears = useMemo(() => {
    const yearsSet = new Set([currentYearNum, currentYearNum - 1, currentYearNum - 2, currentYearNum + 1]);
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
        const m = d.getMonth();

        if (periodFilter === 'THIS_YEAR') return y === selectedYear;
        if (periodFilter === 'THIS_MONTH') {
          const now = new Date();
          return y === selectedYear && m === now.getMonth();
        }
        if (periodFilter === 'LAST_MONTH') {
          const now = new Date();
          const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          return d.getFullYear() === lastMonthDate.getFullYear() && m === lastMonthDate.getMonth();
        }
        return true;
      });
    });
  }, [victims, periodFilter, selectedYear]);

  // Evaluasi kinerja tiap petugas
  const evaluatedOfficers = useMemo(() => {
    return officers.map((officer) => {
      const assignedVictims = periodFilteredVictims.filter((v) => {
        const isCurrent =
          String(v.petugasId) === String(officer.id) ||
          v.namaPetugas === officer.nama ||
          v.petugasNama === officer.nama ||
          (Array.isArray(officer.plottingRs) &&
            officer.plottingRs.some((rs) =>
              (v.rumahSakit || '').toLowerCase().includes(rs.toLowerCase())
            ));

        const isOrigin =
          (v.petugasAsalId && String(v.petugasAsalId) === String(officer.id)) ||
          (v.petugasAsalNama && v.petugasAsalNama.toLowerCase() === (officer.nama || '').toLowerCase()) ||
          (Array.isArray(officer.plottingRs) && v.rumahSakitAsal &&
            officer.plottingRs.some((rs) =>
              (v.rumahSakitAsal || '').toLowerCase().includes(rs.toLowerCase())
            ));

        const hasOfficerVisit = Array.isArray(v.riwayatAktivitas) && v.riwayatAktivitas.some(
          (a) => (a.petugasId && String(a.petugasId) === String(officer.id)) ||
                 (a.petugasNama && a.petugasNama.toLowerCase() === (officer.nama || '').toLowerCase())
        );

        return isCurrent || isOrigin || hasOfficerVisit;
      });

      const kpi = evaluateOfficerKpi(assignedVictims, new Date(), 90, 30, officer);

      return {
        ...officer,
        jumlahKorbanDitangani: assignedVictims.length,
        totalAktivitas: kpi.totalKunjungan,
        tepatWaktu: kpi.kunjunganTepat,
        terlambat: kpi.kunjunganTerlambat,
        isZeroCase: kpi.isZeroCase,
        persentaseKetepatan: kpi.slaKunjungan,
        persentaseSlaPasien: kpi.slaPasien,
        skorAkhir: kpi.skorAkhir,
        skorAkhirLabel: kpi.skorAkhir !== null ? `${kpi.skorAkhir} Poin` : 'N/A'
      };
    });
  }, [officers, periodFilteredVictims]);

  // Ringkasan KPI Tab 1
  const tab1Summary = useMemo(() => {
    const totalKorban = periodFilteredVictims.length;
    let totalKunjungan = 0;
    let totalTepat = 0;
    let totalTerlambat = 0;

    evaluatedOfficers.forEach((o) => {
      totalKunjungan += o.totalAktivitas;
      totalTepat += o.tepatWaktu;
      totalTerlambat += o.terlambat;
    });

    const validPctList = evaluatedOfficers
      .map((o) => o.persentaseKetepatan)
      .filter((p) => p !== null && !isNaN(p));
    const avgSla = validPctList.length > 0
      ? Math.round(validPctList.reduce((acc, curr) => acc + curr, 0) / validPctList.length)
      : null;

    return { totalKorban, totalKunjungan, totalTepat, totalTerlambat, avgSla };
  }, [periodFilteredVictims, evaluatedOfficers]);

  // Ranking & Sorting Tab 1
  const rankedOfficers = useMemo(() => {
    let list = [...evaluatedOfficers];

    if (officerSearch.trim()) {
      const q = officerSearch.toLowerCase();
      list = list.filter((o) =>
        (o.nama || '').toLowerCase().includes(q) ||
        (o.nip || '').toLowerCase().includes(q) ||
        (o.wilayah || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let valA, valB;
      if (sortField === 'nama') {
        valA = a.nama.toLowerCase();
        valB = b.nama.toLowerCase();
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (sortField === 'korban') {
        valA = a.jumlahKorbanDitangani;
        valB = b.jumlahKorbanDitangani;
      } else if (sortField === 'terlambat') {
        valA = a.terlambat;
        valB = b.terlambat;
      } else {
        // 'ketepatan' (Prioritaskan kepatuhan SLA, minim keterlambatan, dan ketepatan kunjungan)
        valA = a.persentaseKetepatan === null ? -1 : a.persentaseKetepatan;
        valB = b.persentaseKetepatan === null ? -1 : b.persentaseKetepatan;
        if (valA === valB) {
          if (a.terlambat !== b.terlambat) {
            return sortDirection === 'asc' ? b.terlambat - a.terlambat : a.terlambat - b.terlambat;
          }
          return sortDirection === 'asc' ? a.tepatWaktu - b.tepatWaktu : b.tepatWaktu - a.tepatWaktu;
        }
      }
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });

    return list;
  }, [evaluatedOfficers, officerSearch, sortField, sortDirection]);

  // Pagination Tab 1
  const paginatedRanking = useMemo(() => {
    const start = (rankingPage - 1) * rankingPageSize;
    return rankedOfficers.slice(start, start + rankingPageSize);
  }, [rankedOfficers, rankingPage]);
  const totalRankingPages = Math.ceil(rankedOfficers.length / rankingPageSize) || 1;

  // Data Perbandingan Grafik Tab 1
  const comparisonChartData = useMemo(() => {
    return evaluatedOfficers.map((o) => ({
      nama: o.nama.split(' ')[0],
      fullName: o.nama,
      tepat: o.tepatWaktu,
      terlambat: o.terlambat,
      sla: o.persentaseKetepatan || 0
    }));
  }, [evaluatedOfficers]);

  // ══════════════════════════════════════════════════════════════════════════
  // TAB 2: DETAIL KINERJA (PILIH PETUGAS, 4 CARDS, GRAFIK BULANAN, TABEL KORBAN UNIK, MODAL)
  // ══════════════════════════════════════════════════════════════════════════
  const [selectedDetailOfficerId, setSelectedDetailOfficerId] = useState(() => {
    return paramOfficerId || (officers[0]?.id || '');
  });

  // Sinkronkan jika paramOfficerId berubah di URL
  useEffect(() => {
    if (paramOfficerId) {
      setSelectedDetailOfficerId(paramOfficerId);
    } else if (!selectedDetailOfficerId && officers.length > 0) {
      setSelectedDetailOfficerId(officers[0].id);
    }
  }, [paramOfficerId, officers]);

  const activeOfficer = useMemo(() => {
    return officers.find((o) => String(o.id) === String(selectedDetailOfficerId)) || officers[0] || null;
  }, [officers, selectedDetailOfficerId]);

  // Filter Korban milik Petugas Aktif
  const activeOfficerVictims = useMemo(() => {
    if (!activeOfficer) return [];
    return periodFilteredVictims.filter((v) => {
      const isCurrent =
        String(v.petugasId) === String(activeOfficer.id) ||
        v.namaPetugas === activeOfficer.nama ||
        v.petugasNama === activeOfficer.nama ||
        (Array.isArray(activeOfficer.plottingRs) &&
          activeOfficer.plottingRs.some((rs) =>
            (v.rumahSakit || '').toLowerCase().includes(rs.toLowerCase())
          ));

      const isOrigin =
        (v.petugasAsalId && String(v.petugasAsalId) === String(activeOfficer.id)) ||
        (v.petugasAsalNama && v.petugasAsalNama.toLowerCase() === (activeOfficer.nama || '').toLowerCase()) ||
        (Array.isArray(activeOfficer.plottingRs) && v.rumahSakitAsal &&
          activeOfficer.plottingRs.some((rs) =>
            (v.rumahSakitAsal || '').toLowerCase().includes(rs.toLowerCase())
          ));

      const hasOfficerVisit = Array.isArray(v.riwayatAktivitas) && v.riwayatAktivitas.some(
        (a) => (a.petugasId && String(a.petugasId) === String(activeOfficer.id)) ||
               (a.petugasNama && a.petugasNama.toLowerCase() === (activeOfficer.nama || '').toLowerCase())
      );

      return isCurrent || isOrigin || hasOfficerVisit;
    });
  }, [activeOfficer, periodFilteredVictims]);

  // 4 Cards KPI Petugas Aktif (Sinkron 100% dengan Tab 1 & Dashboard)
  const activeOfficerMetrics = useMemo(() => {
    if (!activeOfficer) return { totalKunjungan: 0, kunjunganTepat: 0, kunjunganTerlambat: 0, kepatuhanSla: null };
    const found = evaluatedOfficers.find((o) => String(o.id) === String(activeOfficer.id));
    if (found) {
      return {
        totalKunjungan: found.totalAktivitas,
        kunjunganTepat: found.tepatWaktu,
        kunjunganTerlambat: found.terlambat,
        kepatuhanSla: found.persentaseKetepatan
      };
    }
    const kpi = evaluateOfficerKpi(activeOfficerVictims, new Date(), 90, 30);
    return {
      totalKunjungan: kpi.totalKunjungan,
      kunjunganTepat: kpi.kunjunganTepat,
      kunjunganTerlambat: kpi.kunjunganTerlambat,
      kepatuhanSla: kpi.slaKunjungan
    };
  }, [activeOfficer, evaluatedOfficers, activeOfficerVictims]);

  // Grafik Kunjungan Bulanan Petugas Aktif
  const activeOfficerChartData = useMemo(() => {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
    ];
    const data = months.map((m) => ({ bulan: m, tepat: 0, terlambat: 0 }));

    const officerIdStr = activeOfficer ? String(activeOfficer.id || activeOfficer.backendOfficerId || activeOfficer.backendId || '') : '';
    const officerNameLow = activeOfficer ? (activeOfficer.nama || '').toLowerCase().trim() : '';
    const officerPlots = activeOfficer && Array.isArray(activeOfficer.plottingRs)
      ? activeOfficer.plottingRs.map((r) => (r || '').toLowerCase().trim())
      : [];

    const isVisitByActiveOfficer = (visit, defaultHospital) => {
      if (!activeOfficer) return true;
      if (visit.petugasId && String(visit.petugasId) === officerIdStr) return true;
      if (visit.petugasNama && visit.petugasNama.toLowerCase().trim() === officerNameLow) return true;
      const vHosp = (visit.rumahSakit || defaultHospital || '').toLowerCase().trim();
      if (vHosp && officerPlots.some((p) => p === vHosp || (vHosp.length >= 4 && (p.includes(vHosp) || vHosp.includes(p))))) {
        return true;
      }
      return false;
    };

    activeOfficerVictims.forEach((v) => {
      const allVisits = [
        ...(v.kunjunganPertama ? [v.kunjunganPertama] : []),
        ...(v.riwayatAktivitas || []).filter(
          (a) => a.jenisAktivitas === 'Pemantauan Lanjutan' || a.kunjunganKe > 1
        )
      ];

      allVisits.forEach((visit) => {
        if (!isVisitByActiveOfficer(visit, v.rumahSakit)) return;

        const visitDateStr = visit.tanggalKunjungan || visit.tanggal || visit.waktuSelesai || visit.waktuInput;
        if (!visitDateStr) return;
        const d = new Date(visitDateStr);
        if (isNaN(d.getTime())) return;
        const monthIdx = d.getMonth();
        if (monthIdx >= 0 && monthIdx < 12) {
          const wasLate = visit.terlambat || visit.wasLate;
          if (wasLate) data[monthIdx].terlambat += 1;
          else data[monthIdx].tepat += 1;
        }
      });
    });

    return data;
  }, [activeOfficerVictims, activeOfficer]);

  // Tabel Korban Unik Tab 2:
  // Kolom: Nama Korban | RS | Tgl Kecelakaan | Tgl Masuk RS | Total Kunjungan | SLA | Status | Aksi
  const [detailVictimSearch, setDetailVictimSearch] = useState('');
  const [detailSlaFilter, setDetailSlaFilter] = useState('ALL');
  const [detailConditionFilter, setDetailConditionFilter] = useState('ALL');
  const [selectedVisitModalData, setSelectedVisitModalData] = useState(null);
  const [activeVisitModalTab, setActiveVisitModalTab] = useState(0);

  const uniqueVictimRows = useMemo(() => {
    const officerIdStr = activeOfficer ? String(activeOfficer.id || activeOfficer.backendOfficerId || activeOfficer.backendId || '') : '';
    const officerNameLow = activeOfficer ? (activeOfficer.nama || '').toLowerCase().trim() : '';
    const officerPlots = activeOfficer && Array.isArray(activeOfficer.plottingRs)
      ? activeOfficer.plottingRs.map((r) => (r || '').toLowerCase().trim())
      : [];

    const isVisitByActiveOfficer = (visit, defaultHospital) => {
      if (!activeOfficer) return true;
      if (visit.petugasId && String(visit.petugasId) === officerIdStr) return true;
      if (visit.petugasNama && visit.petugasNama.toLowerCase().trim() === officerNameLow) return true;
      const vHosp = (visit.rumahSakit || defaultHospital || '').toLowerCase().trim();
      if (vHosp && officerPlots.some((p) => p === vHosp || (vHosp.length >= 4 && (p.includes(vHosp) || vHosp.includes(p))))) {
        return true;
      }
      return false;
    };

    return activeOfficerVictims.map((v) => {
      const visitsList = [];

      if (v.kunjunganPertama && isVisitByActiveOfficer(v.kunjunganPertama, v.rumahSakitAsal || v.rumahSakit)) {
        const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
        const deadlineDate = v.tanggalInformasiDiterima
          ? new Date(new Date(v.tanggalInformasiDiterima).getTime() + 72 * 60 * 60 * 1000)
          : null;

        visitsList.push({
          ke: 1,
          label: 'Kunjungan Pertama (Awal)',
          infoReceivedDate: v.tanggalInformasiDiterima,
          scheduledDeadline: deadlineDate ? deadlineDate.toISOString() : null,
          actualDate: v.kunjunganPertama.tanggalKunjungan || v.kunjunganPertama.tanggal || v.kunjunganPertama.waktuInput,
          hasilKunjungan: v.kunjunganPertama.catatan || v.kunjunganPertama.hasilKunjungan || 'Pasien telah dikunjungi di ruang perawatan',
          kondisiKorban: v.kunjunganPertama.kondisiKorban || v.kondisiTerakhir || 'Masih Dirawat',
          checklist: v.kunjunganPertama.checklist || [
            { item: 'Verifikasi Identitas Korban & KTP/KK', checked: true },
            { item: 'Pemeriksaan Ruang & Nomor Kamar RS', checked: true },
            { item: 'Pengecekan Surat Jaminan (Guarantee Letter)', checked: true },
            { item: 'Konfirmasi Kondisi Medis dengan Dokter/Perawat', checked: true }
          ],
          catatanTindakLanjut: v.kunjunganPertama.catatanTindakLanjut || 'Lakukan pemantauan berkala maksimal 3 hari kemudian.',
          fotoDokumentasi: v.kunjunganPertama.foto || v.kunjunganPertama.fotoKunjungan || null,
          koordinat: v.kunjunganPertama.koordinat || v.kunjunganPertama.gps || { lat: -0.9471, lng: 100.4172, address: v.rumahSakit },
          isLate: Boolean(fSla.wasLate),
          slaStatus: fSla.wasLate ? 'Terlambat' : 'Tepat Waktu'
        });
      }

      const riwayat = (v.riwayatAktivitas || []).filter(
        (a) => (a.jenisAktivitas === 'Pemantauan Lanjutan' || a.kunjunganKe > 1) && isVisitByActiveOfficer(a, v.rumahSakit)
      );

      riwayat.forEach((a, idx) => {
        const prevVisit = idx === 0 ? v.kunjunganPertama : riwayat[idx - 1];
        const prevDate = prevVisit?.tanggalKunjungan || prevVisit?.tanggal || prevVisit?.waktuInput;
        const scheduledDeadline = prevDate
          ? new Date(new Date(prevDate).getTime() + 72 * 60 * 60 * 1000).toISOString()
          : null;

        visitsList.push({
          ke: idx + 2,
          label: `Kunjungan Lanjutan Ke-${idx + 2}`,
          infoReceivedDate: v.tanggalInformasiDiterima,
          scheduledDeadline,
          actualDate: a.tanggalKunjungan || a.tanggal || a.waktuSelesai || a.waktuInput,
          hasilKunjungan: a.catatan || a.keterangan || 'Pemantauan perkembangan medis dan pembiayaan',
          kondisiKorban: a.kondisiKorban || a.kondisi || v.kondisiTerakhir || 'Masih Dirawat',
          checklist: a.checklist || [
            { item: 'Pembaruan Biaya Pengobatan Sementara', checked: true },
            { item: 'Konfirmasi Rencana Tindakan / Operasi', checked: true },
            { item: 'Pengecekan Estimasi Tanggal Keluar RS', checked: true }
          ],
          catatanTindakLanjut: a.catatanTindakLanjut || a.tindakLanjut || 'Monitoring rutin sesuai jadwal.',
          fotoDokumentasi: a.foto || a.fotoDokumentasi || null,
          koordinat: a.koordinat || a.gps || { lat: -0.9471, lng: 100.4172, address: v.rumahSakit },
          isLate: Boolean(a.terlambat || a.wasLate),
          slaStatus: (a.terlambat || a.wasLate) ? 'Terlambat' : 'Tepat Waktu'
        });
      });

      const totalKunjungan = visitsList.length;
      const terlambatCount = visitsList.filter((vis) => vis.isLate).length;
      const tepatCount = totalKunjungan - terlambatCount;
      const hasLate = terlambatCount > 0;

      let slaSummary = 'Tepat Waktu';
      let slaBadgeColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
      if (totalKunjungan === 0) {
        slaSummary = 'Belum Ada Kunjungan';
        slaBadgeColor = 'text-blue-700 bg-blue-50 border-blue-200';
      } else if (hasLate) {
        slaSummary = `Pernah Terlambat (${terlambatCount}x)`;
        slaBadgeColor = 'text-rose-700 bg-rose-50 border-rose-200 font-bold';
      }

      const refInfo = getReferralPerspectiveInfo(v, null, activeOfficer);

      return {
        victimId: v.id,
        namaKorban: v.nama,
        rumahSakit: refInfo.displayHospital,
        referralBadge: refInfo.isReferred ? refInfo.badgeLabel : null,
        referralColorClass: refInfo.badgeColorClass,
        tanggalKecelakaan: v.tanggalKecelakaan || v.tanggalKejadian || null,
        tanggalMasukRs: v.tanggalMasukRs || v.tanggalInformasiDiterima || null,
        totalKunjungan,
        tepatCount,
        terlambatCount,
        slaSummary,
        slaBadgeColor,
        kondisiTerakhir: v.kondisiTerakhir || 'Masih Dirawat',
        rawVictim: v,
        visitsList
      };
    });
  }, [activeOfficerVictims, activeOfficer]);

  const filteredUniqueVictimRows = useMemo(() => {
    return uniqueVictimRows.filter((row) => {
      if (detailVictimSearch.trim()) {
        const q = detailVictimSearch.toLowerCase();
        const matchName = row.namaKorban.toLowerCase().includes(q);
        const matchRs = row.rumahSakit.toLowerCase().includes(q);
        if (!matchName && !matchRs) return false;
      }
      if (detailSlaFilter === 'TEPAT' && row.terlambatCount > 0) return false;
      if (detailSlaFilter === 'TERLAMBAT' && row.terlambatCount === 0) return false;
      if (detailSlaFilter === 'MENUNGGU' && row.totalKunjungan > 0) return false;

      if (detailConditionFilter !== 'ALL') {
        const k = row.kondisiTerakhir.toLowerCase();
        if (detailConditionFilter === 'Dirawat' && !k.includes('dirawat') && !k.includes('rawat')) return false;
        if (detailConditionFilter === 'Pulang' && !k.includes('pulang')) return false;
        if (detailConditionFilter === 'Meninggal' && !k.includes('meninggal')) return false;
      }
      return true;
    });
  }, [uniqueVictimRows, detailVictimSearch, detailSlaFilter, detailConditionFilter]);

  // ══════════════════════════════════════════════════════════════════════════
  // TAB 3: LAPORAN (FILTER, KPI, TABEL REKAPITULASI, EXPORT PDF & CSV)
  // ══════════════════════════════════════════════════════════════════════════
  const [reportType, setReportType] = useState('ALL_OFFICERS');
  const [reportOfficerId, setReportOfficerId] = useState('');
  const [reportPeriodType, setReportPeriodType] = useState('MONTHLY');
  const [reportMonth, setReportMonth] = useState(() => String(currentMonthNum));
  const [reportYear, setReportYear] = useState(() => String(currentYearNum));
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const reportFilteredData = useMemo(() => {
    const checkDateMatches = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      const y = String(d.getFullYear());
      const m = String(d.getMonth());

      if (reportPeriodType === 'MONTHLY') return y === reportYear && m === reportMonth;
      if (reportPeriodType === 'YEARLY') return y === reportYear;
      if (reportPeriodType === 'CUSTOM') {
        if (!reportStartDate && !reportEndDate) return true;
        const time = d.getTime();
        const start = reportStartDate ? new Date(reportStartDate).getTime() : 0;
        const end = reportEndDate ? new Date(reportEndDate).getTime() + 86400000 : Infinity;
        return time >= start && time <= end;
      }
      return true;
    };

    const matchingVictims = victims.filter((v) => {
      if (reportType === 'INDIVIDUAL_OFFICER' && reportOfficerId) {
        if (v.petugasId !== reportOfficerId) return false;
      }
      const dates = [
        v.tanggalInformasiDiterima,
        v.tanggalKecelakaan,
        ...(v.riwayatAktivitas || []).map((a) => a.tanggalKunjungan || a.tanggal || a.waktuSelesai)
      ].filter(Boolean);
      if (dates.length === 0) return true;
      return dates.some(checkDateMatches);
    });

    const matchingActivities = [];
    matchingVictims.forEach((v) => {
      const acts = v.riwayatAktivitas || [];
      acts.forEach((a) => {
        const actDate = a.waktuSelesai || a.tanggalKunjungan || a.tanggal || a.waktuInput;
        if (checkDateMatches(actDate)) {
          const isFirstVisit = a.jenisAktivitas === 'Kunjungan Pertama' || a.kunjunganKe === 1;
          const wasLate = a.terlambat || a.wasLate;

          matchingActivities.push({
            id: a.id || `${v.id}-${Math.random()}`,
            namaKorban: v.nama,
            rumahSakit: v.rumahSakit,
            petugasNama: a.petugasNama || v.namaPetugas || 'Petugas Lapangan',
            waktuAktivitas: actDate,
            jenisAktivitas: isFirstVisit ? 'Kunjungan Pertama' : 'Pemantauan Lanjutan',
            kondisiKorban: a.kondisiKorban || v.kondisiTerakhir || 'Masih Dirawat',
            terlambat: wasLate,
            slaText: wasLate ? 'Terlambat' : 'Tepat Waktu'
          });
        }
      });
    });

    return { victims: matchingVictims, activities: matchingActivities };
  }, [victims, reportType, reportOfficerId, reportPeriodType, reportMonth, reportYear, reportStartDate, reportEndDate]);

  const reportSummary = useMemo(() => {
    const totalPasien = reportFilteredData.victims.length;
    let totalTepat = 0;
    let totalTerlambat = 0;

    reportFilteredData.activities.forEach((a) => {
      if (a.terlambat) totalTerlambat++;
      else totalTepat++;
    });

    const totalKunjungan = totalTepat + totalTerlambat;
    const slaPersen = totalKunjungan > 0 ? Math.round((totalTepat / totalKunjungan) * 100) : null;

    return { totalPasien, totalKunjungan, totalTepat, totalTerlambat, slaPersen };
  }, [reportFilteredData]);

  // Export PDF Laporan
  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    setToastMessage('Menyiapkan dokumen PDF Laporan Kinerja...');
    try {
      const periodLabel = reportPeriodType === 'MONTHLY'
        ? `${MONTH_NAMES[Number(reportMonth)]} ${reportYear}`
        : reportPeriodType === 'YEARLY'
          ? `Tahun ${reportYear}`
          : `${reportStartDate || 'Awal'} s/d ${reportEndDate || 'Sekarang'}`;

      const officerObj = reportType === 'INDIVIDUAL_OFFICER'
        ? officers.find((o) => o.id === reportOfficerId)
        : null;

      const doc = await generatePerformancePdfReport({
        officers: reportType === 'INDIVIDUAL_OFFICER' && officerObj ? [officerObj] : officers,
        evaluatedOfficers,
        victims: reportFilteredData.victims,
        activities: reportFilteredData.activities,
        periodLabel,
        kpiSummary: reportSummary
      });

      doc.save(`Laporan_Kinerja_Petugas_JR_${reportYear}.pdf`);
      setToastMessage('Laporan PDF berhasil diunduh!');
    } catch (err) {
      console.error(err);
      setToastMessage('Gagal membuat PDF.');
    } finally {
      setIsGeneratingPdf(false);
      setTimeout(() => setToastMessage(''), 3000);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['No', 'Petugas', 'NIP', 'Wilayah', 'Total Korban', 'Tepat Waktu', 'Terlambat', 'Kepatuhan SLA (%)'];
    const rows = evaluatedOfficers.map((o, idx) => [
      idx + 1,
      `"${o.nama}"`,
      `"${o.nip || '-'}"`,
      `"${o.wilayah || '-'}"`,
      o.jumlahKorbanDitangani,
      o.tepatWaktu,
      o.terlambat,
      o.persentaseKetepatan === null ? 'N/A' : `${o.persentaseKetepatan}%`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Rekapitulasi_Kinerja_Petugas_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* ── HEADER UTAMA HALAMAN ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Kinerja Petugas
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Evaluasi kepatuhan SLA maksimal 3 hari, analisis ranking petugas, rekam riwayat kunjungan korban, dan rekapitulasi laporan resmi.
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

      {/* ── NAVIGASI 3 TAB UTAMA ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setTab('ringkasan')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'ringkasan'
              ? 'bg-[#145DA0] text-white shadow-2xs'
              : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Ringkasan Kinerja</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('detail')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'detail'
              ? 'bg-[#145DA0] text-white shadow-2xs'
              : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Detail Kinerja</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('laporan')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'laporan'
              ? 'bg-[#145DA0] text-white shadow-2xs'
              : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Laporan</span>
        </button>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          KONTEN TAB 1: RINGKASAN KINERJA
         ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ringkasan' && (
        <div className="space-y-6">
          {/* 4 Card KPI Ringkasan */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Rata-rata Kepatuhan SLA
                </span>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  tab1Summary.avgSla >= 90
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    : 'bg-amber-50 text-amber-600 border-amber-100'
                }`}>
                  <ShieldCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className={`text-3xl font-black font-mono tracking-tight ${
                  tab1Summary.avgSla === null
                    ? 'text-slate-400'
                    : tab1Summary.avgSla >= 90
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                }`}>
                  {tab1Summary.avgSla === null ? 'N/A' : `${tab1Summary.avgSla}%`}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5">Target kepatuhan SLA &ge; 90%</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Beban Kerja Korban
                </span>
                <div className="w-9 h-9 rounded-xl bg-sky-50 text-[#145DA0] border border-sky-100 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono tracking-tight text-slate-900">
                  {tab1Summary.totalKorban}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">kasus</span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5">Total korban terdistribusi</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Kunjungan Tepat Waktu
                </span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-3xl font-black font-mono tracking-tight text-emerald-600">
                  {tab1Summary.totalTepat}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5">&le; 3 hari kalender</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Kunjungan Terlambat
                </span>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  tab1Summary.totalTerlambat > 0
                    ? 'bg-rose-50 text-rose-600 border-rose-100'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}>
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className={`text-3xl font-black font-mono tracking-tight ${
                  tab1Summary.totalTerlambat > 0 ? 'text-rose-600' : 'text-slate-900'
                }`}>
                  {tab1Summary.totalTerlambat}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5">&gt; 3 hari kalender</span>
            </div>
          </div>

          {/* Grafik Perbandingan Kinerja Petugas */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#145DA0]" />
                  <span>Perbandingan Kinerja Petugas</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Jumlah kunjungan tepat waktu vs terlambat untuk seluruh petugas lapangan ({selectedYear})
                </p>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 self-start sm:self-auto">
                Standar SLA: Maksimal 3 Hari (72 Jam)
              </span>
            </div>

            <div className="h-[230px] w-full pt-2">
              <ResponsiveContainer width="100%" height={220} minHeight={200} minWidth={0}>
                <BarChart data={comparisonChartData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="nama" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#CBD5E1' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#CBD5E1' }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-2.5 rounded-xl text-xs space-y-1">
                            <p className="font-bold border-b border-slate-700 pb-1">{d.fullName}</p>
                            <div className="flex justify-between gap-4 text-emerald-400">
                              <span>Tepat Waktu:</span>
                              <strong>{d.tepat}</strong>
                            </div>
                            <div className="flex justify-between gap-4 text-rose-400">
                              <span>Terlambat:</span>
                              <strong>{d.terlambat}</strong>
                            </div>
                            <div className="flex justify-between gap-4 text-slate-200 pt-1 border-t border-slate-800">
                              <span>Kepatuhan SLA:</span>
                              <strong>{d.sla}%</strong>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend verticalAlign="top" align="right" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }} />
                  <Bar dataKey="tepat" name="Tepat Waktu" fill="#10B981" radius={[4, 4, 0, 0]} barSize={16} />
                  <Bar dataKey="terlambat" name="Terlambat" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabel Ranking Kinerja Petugas */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Ranking Kinerja Petugas Lapangan
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Diurutkan berdasarkan kepatuhan SLA interval maksimal 3 hari, ketepatan waktu kunjungan, dan kelengkapan laporan ({selectedYear}). Jumlah korban adalah informasi beban kerja, bukan target capaian atau penentu ranking.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={officerSearch}
                    onChange={(e) => {
                      setOfficerSearch(e.target.value);
                      setRankingPage(1);
                    }}
                    placeholder="Cari nama petugas..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/90 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-4 w-12 text-center">RANK</th>
                    <th className="py-3.5 px-4">PETUGAS</th>
                    <th className="py-3.5 px-4">WILAYAH &amp; NIP</th>
                    <th className="py-3.5 px-4 text-center" title="Informasi beban kerja kasus aktif/terdistribusi, bukan target kuota">BEBAN KORBAN</th>
                    <th className="py-3.5 px-4 text-center">TEPAT WAKTU</th>
                    <th className="py-3.5 px-4 text-center">TERLAMBAT</th>
                    <th className="py-3.5 px-4 text-center">KEPATUHAN SLA</th>
                    <th className="py-3.5 px-4 text-right">AKSI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRanking.map((officer, idx) => {
                    const rankNum = (rankingPage - 1) * rankingPageSize + idx + 1;
                    return (
                      <tr key={officer.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-400">
                          #{rankNum}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                          {officer.nama}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          {officer.wilayah || '—'} • NIP: <span className="font-mono">{officer.nip || '—'}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-800">
                          {officer.jumlahKorbanDitangani}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-emerald-600">
                          {officer.tepatWaktu}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-rose-600">
                          {officer.terlambat}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className={`inline-flex px-2.5 py-1 rounded-full font-mono font-bold text-xs ${
                            officer.persentaseKetepatan === null
                              ? 'bg-slate-100 text-slate-500'
                              : officer.persentaseKetepatan >= 90
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : officer.persentaseKetepatan >= 80
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {officer.persentaseKetepatan === null ? 'N/A' : `${officer.persentaseKetepatan}% SLA`}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDetailOfficerId(officer.id);
                              setTab('detail', { officerId: officer.id });
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#145DA0] bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
                          >
                            <span>Lihat Detail Kinerja</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Ranking */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50/50">
              <span className="text-slate-500 text-[11px]">
                Menampilkan <strong>{paginatedRanking.length}</strong> dari <strong>{rankedOfficers.length}</strong> petugas
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={rankingPage <= 1}
                  onClick={() => setRankingPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-600" />
                </button>
                <span className="px-3 font-mono font-bold text-slate-700">{rankingPage} / {totalRankingPages}</span>
                <button
                  type="button"
                  disabled={rankingPage >= totalRankingPages}
                  onClick={() => setRankingPage((p) => Math.min(totalRankingPages, p + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          KONTEN TAB 2: DETAIL KINERJA
         ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'detail' && (
        <div className="space-y-6">
          {/* Selector Petugas & Info */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Pilih Petugas yang Ditinjau:
                </label>
                <select
                  value={selectedDetailOfficerId}
                  onChange={(e) => {
                    setSelectedDetailOfficerId(e.target.value);
                    setTab('detail', { officerId: e.target.value });
                  }}
                  className="bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#145DA0] cursor-pointer"
                >
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nama} ({o.wilayah || 'Wilayah —'})
                    </option>
                  ))}
                </select>
              </div>

              {activeOfficer && (
                <div className="flex items-center gap-3 bg-blue-50/60 p-3 rounded-xl border border-blue-100 text-xs">
                  <div className="w-9 h-9 rounded-full bg-[#145DA0] text-white font-bold flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <strong className="text-slate-900 block">{activeOfficer.nama}</strong>
                    <span className="text-slate-500 block text-[11px]">
                      NIP: <span className="font-mono">{activeOfficer.nip || '—'}</span> • Wilayah: {activeOfficer.wilayah || '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4 Card Ringkasan Kinerja Petugas */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Total Kunjungan
                </span>
                <div className="w-9 h-9 rounded-xl bg-sky-50 text-[#145DA0] border border-sky-100 flex items-center justify-center shrink-0">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-3xl font-black font-mono tracking-tight text-slate-900">
                  {activeOfficerMetrics.totalKunjungan}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5">Total kunjungan terlaksana</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Kepatuhan SLA
                </span>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  activeOfficerMetrics.kepatuhanSla >= 90
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    : 'bg-amber-50 text-amber-600 border-amber-100'
                }`}>
                  <ShieldCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className={`text-3xl font-black font-mono tracking-tight ${
                  activeOfficerMetrics.kepatuhanSla === null
                    ? 'text-slate-400'
                    : activeOfficerMetrics.kepatuhanSla >= 90
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                }`}>
                  {activeOfficerMetrics.kepatuhanSla === null ? 'N/A' : `${activeOfficerMetrics.kepatuhanSla}%`}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5">Persentase tepat waktu</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Kunjungan Tepat Waktu
                </span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-3xl font-black font-mono tracking-tight text-emerald-600">
                  {activeOfficerMetrics.kunjunganTepat}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5">&le; 3 hari kalender</span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Kunjungan Terlambat
                </span>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  activeOfficerMetrics.kunjunganTerlambat > 0
                    ? 'bg-rose-50 text-rose-600 border-rose-100'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}>
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className={`text-3xl font-black font-mono tracking-tight ${
                  activeOfficerMetrics.kunjunganTerlambat > 0 ? 'text-rose-600' : 'text-slate-900'
                }`}>
                  {activeOfficerMetrics.kunjunganTerlambat}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5">&gt; 3 hari kalender</span>
            </div>
          </div>

          {/* Grafik Aktivitas Kunjungan Petugas */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#145DA0]" />
                  <span>Grafik Aktivitas Kunjungan {activeOfficer?.nama}</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Perbandingan kunjungan tepat waktu vs terlambat per bulan (Maksimal 3 Hari)
                </p>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 self-start sm:self-auto">
                Standar SLA: Maksimal 3 Hari (72 Jam)
              </span>
            </div>

            <div className="h-[210px] w-full pt-2">
              <ResponsiveContainer width="100%" height={200} minHeight={200} minWidth={0}>
                <BarChart data={activeOfficerChartData} margin={{ top: 8, right: 15, left: -20, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="bulan" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#CBD5E1' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#CBD5E1' }} />
                  <Tooltip />
                  <Legend verticalAlign="top" align="right" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }} />
                  <Bar dataKey="tepat" name="Tepat Waktu" fill="#10B981" radius={[4, 4, 0, 0]} barSize={16} />
                  <Bar dataKey="terlambat" name="Terlambat" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabel Korban Unik: Nama Korban | RS | Tgl Kecelakaan | Tgl Masuk RS | Total Kunjungan | SLA | Status | Aksi */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Daftar Korban yang Ditangani {activeOfficer?.nama}
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Setiap korban ditampilkan satu kali dengan rekapitulasi total kunjungan dan status kepatuhan SLA 3 hari.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={detailVictimSearch}
                    onChange={(e) => setDetailVictimSearch(e.target.value)}
                    placeholder="Cari korban / RS..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none"
                  />
                </div>

                <select
                  value={detailSlaFilter}
                  onChange={(e) => setDetailSlaFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  <option value="ALL">Semua SLA</option>
                  <option value="TEPAT">Tepat Waktu</option>
                  <option value="TERLAMBAT">Pernah Terlambat</option>
                  <option value="MENUNGGU">Menunggu</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Nama Korban</th>
                    <th className="py-3 px-4">RS</th>
                    <th className="py-3 px-4">Tgl Kecelakaan</th>
                    <th className="py-3 px-4">Tgl Masuk RS</th>
                    <th className="py-3 px-4 text-center">Total Kunjungan</th>
                    <th className="py-3 px-4 text-center">SLA</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUniqueVictimRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Tidak ada riwayat korban untuk petugas ini.
                      </td>
                    </tr>
                  ) : (
                    filteredUniqueVictimRows.map((row) => (
                      <tr key={row.victimId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                          {row.namaKorban}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-700 whitespace-nowrap">
                          <span className="block">{row.rumahSakit}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          {formatDate(row.tanggalKecelakaan)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          {formatDate(row.tanggalMasukRs)}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                            {row.totalKunjungan}x Kunjungan
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] border ${row.slaBadgeColor}`}>
                            {row.slaSummary}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-semibold text-slate-700 text-xs">
                            {row.kondisiTerakhir}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVisitModalData(row);
                              setActiveVisitModalTab(0);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#145DA0] bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Lihat</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          KONTEN TAB 3: LAPORAN
         ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'laporan' && (
        <KabagReportPage embedded={true} />
      )}


      {/* ════════════════════════════════════════════════════════════════════
          MODAL INTERAKTIF DETAIL KUNJUNGAN (8 POIN AUDIT & KOORDINAT GPS)
         ════════════════════════════════════════════════════════════════════ */}
      {selectedVisitModalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl my-8 overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-[#145DA0] to-[#0A3981] text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">
                  Audit Kunjungan Pemantauan Korban
                </span>
                <h3 className="text-lg font-black tracking-tight mt-0.5">
                  {selectedVisitModalData.namaKorban}
                </h3>
                <p className="text-xs text-blue-100 flex items-center gap-1 mt-0.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-200" />
                  <span>{selectedVisitModalData.rumahSakit}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedVisitModalData(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Visit Tabs */}
            {selectedVisitModalData.visitsList.length > 0 && (
              <div className="flex items-center gap-2 px-5 pt-4 border-b border-slate-100 overflow-x-auto bg-slate-50/50">
                {selectedVisitModalData.visitsList.map((vis, idx) => (
                  <button
                    key={vis.ke}
                    type="button"
                    onClick={() => setActiveVisitModalTab(idx)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-t-xl transition-all border-b-2 cursor-pointer ${
                      activeVisitModalTab === idx
                        ? 'border-[#145DA0] text-[#145DA0] bg-white shadow-2xs'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>{vis.label}</span>
                    <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full ${
                      vis.isLate ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {vis.slaStatus}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Modal Body */}
            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-5">
              {(() => {
                const curVisit = selectedVisitModalData.visitsList[activeVisitModalTab] || selectedVisitModalData.visitsList[0];
                if (!curVisit) {
                  return (
                    <div className="py-12 text-center text-slate-400">
                      Belum ada data kunjungan yang tercatat untuk korban ini.
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {/* 3 Tanggal Utama Evaluasi SLA */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          1. Tanggal Info Diterima
                        </span>
                        <strong className="text-xs font-bold text-slate-800 block mt-1">
                          {formatDateTime(curVisit.infoReceivedDate)}
                        </strong>
                      </div>

                      <div className="bg-blue-50/60 rounded-xl p-3 border border-blue-200/80">
                        <span className="text-[10px] font-bold text-[#145DA0] uppercase tracking-wider block">
                          2. Batas Kunjungan Seharusnya
                        </span>
                        <strong className="text-xs font-bold text-slate-900 block mt-1">
                          {curVisit.scheduledDeadline ? formatDateTime(curVisit.scheduledDeadline) : 'Standar 3 Hari'}
                        </strong>
                        <span className="text-[9px] text-blue-700 block mt-0.5">Maksimal 3 Hari (72 Jam)</span>
                      </div>

                      <div className={`rounded-xl p-3 border ${
                        curVisit.isLate
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      }`}>
                        <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">
                          3. Tanggal Kunjungan Aktual
                        </span>
                        <strong className="text-xs font-bold block mt-1">
                          {formatDateTime(curVisit.actualDate)}
                        </strong>
                        <span className="text-[9px] font-bold block mt-0.5">
                          Status: {curVisit.slaStatus}
                        </span>
                      </div>
                    </div>

                    {/* Hasil Kunjungan & Kondisi Terakhir */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs space-y-1">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                          4. Hasil Kunjungan
                        </span>
                        <p className="text-xs text-slate-800 leading-relaxed font-medium">
                          {curVisit.hasilKunjungan}
                        </p>
                      </div>

                      <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs space-y-1">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                          5. Kondisi Terakhir Korban
                        </span>
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#145DA0] border border-blue-200 mt-1">
                          {curVisit.kondisiKorban}
                        </span>
                      </div>
                    </div>

                    {/* Checklist Kunjungan */}
                    <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs space-y-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        6. Hasil Checklist Kunjungan
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {curVisit.checklist.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>{c.item || c}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Catatan Tindak Lanjut */}
                    <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        7. Catatan Tindak Lanjut
                      </span>
                      <p className="text-xs text-slate-800 leading-relaxed font-medium">
                        {curVisit.catatanTindakLanjut}
                      </p>
                    </div>

                    {/* 8. Dokumentasi Foto & Koordinat Lokasi GPS */}
                    <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs space-y-3">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        8. Dokumentasi Foto &amp; Titik Koordinat Lokasi
                      </span>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                        {/* Foto */}
                        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 text-center">
                          <AuthenticatedImage
                            src={curVisit.fotoDokumentasi || curVisit.fotoUrl || getRealVisitPhoto(curVisit.id || curVisit.visitId)}
                            alt="Dokumentasi Kunjungan"
                            className="w-full h-44 object-cover rounded-lg border border-slate-200 shadow-2xs"
                          />
                        </div>

                        {/* GPS Coordinates */}
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-2 text-xs">
                          <div className="flex items-center gap-2 text-slate-700">
                            <MapPin className="w-4 h-4 text-[#145DA0] shrink-0" />
                            <strong className="text-slate-900">Titik Koordinat GPS Terverifikasi</strong>
                          </div>

                          <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1 font-mono text-[11px] text-slate-600">
                            <div>Latitude: <strong className="text-slate-800">{curVisit.koordinat?.lat || '-0.9471'}</strong></div>
                            <div>Longitude: <strong className="text-slate-800">{curVisit.koordinat?.lng || '100.4172'}</strong></div>
                            <div className="font-sans text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                              Lokasi: {curVisit.koordinat?.address || selectedVisitModalData.rumahSakit}
                            </div>
                          </div>

                          <a
                            href={`https://www.google.com/maps?q=${curVisit.koordinat?.lat || -0.9471},${curVisit.koordinat?.lng || 100.4172}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-xl text-xs font-bold bg-[#145DA0] text-white hover:bg-[#0A3981] transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
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
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedVisitModalData(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
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

export { KabagOfficerPerformance };
