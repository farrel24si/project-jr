import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import FormInputKorbanModal from '../../components/petugas/FormInputKorbanModal';
import FormPemantauanModal from '../../components/petugas/FormPemantauanModal';
import Modal from '../../components/common/Modal';
import MonitoringStatusBadge from '../../components/common/MonitoringStatusBadge';
import SortableHeader from '../../components/common/SortableHeader';
import { isVictimFinished, getMonitoringStatus, MONITORING_STATUS } from '../../utils/monitoringStatus';
import { evaluateOfficerKpi, compareVictimsBySlaPriority } from '../../services/slaService';
import { formatDateIndo, formatTimeIndo, formatDateTimeIndo, parseDateSafe } from '../../utils/dateUtils';
import { getReferralPerspectiveInfo } from '../../utils/referralUtils';
import {
  ListChecks,
  Calendar,
  Clock,
  Building2,
  Eye,
  Edit3,
  Plus,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  FileText,
  CalendarCheck,
  ShieldCheck,
  CheckCircle2,
  Users,
  User
} from 'lucide-react';

function formatDateShort(dateStr) {
  return formatDateIndo(dateStr);
}

function formatTime(dateStr, defaultTime = '') {
  return formatTimeIndo(dateStr, defaultTime);
}

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
];

export default function PetugasDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const officerId = currentUser?.profile?.id || 'PET-01';
  const officerName = currentUser?.profile?.nama || 'Petugas';

  const now = useMemo(() => new Date(), []);
  const currentMonthIdx = now.getMonth();
  const currentYear = now.getFullYear();

  // Header date formatting in uppercase: e.g. "SABTU, 14 NOVEMBER 2026"
  const formattedHeaderDate = useMemo(() => {
    try {
      return now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).toUpperCase();
    } catch {
      return 'HARI INI';
    }
  }, [now]);

  const [victims, setVictims] = useState([]);
  const [chartPeriod, setChartPeriod] = useState('6 Bulan Terakhir'); // '6 Bulan Terakhir' | 'Tahun Ini' | 'Tahun Sebelumnya'
  const [chartAnimationKey, setChartAnimationKey] = useState(0);
  const [hoveredPointIndex, setHoveredPointIndex] = useState(null);
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
  const [monitoringVictim, setMonitoringVictim] = useState(null);
  const [tableSortConfig, setTableSortConfig] = useState({ key: null, direction: 'asc' });

  const handleTableSort = (key) => {
    setTableSortConfig((prev) => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return { key: null, direction: 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const loadData = () => {
    const activeOfficerIdent = officerId || currentUser?.profile?.id || currentUser?.profile?.backendOfficerId || currentUser?.profile?.nama;
    const myVictims = storageService.getVictimsByOfficer(activeOfficerIdent);
    setVictims(myVictims);
  };

  useEffect(() => {
    storageService.syncWithBackend(true).catch(() => { });
    loadData();
    window.addEventListener('jr_victims_updated', loadData);
    window.addEventListener('jr_officers_updated', loadData);
    return () => {
      window.removeEventListener('jr_victims_updated', loadData);
      window.removeEventListener('jr_officers_updated', loadData);
    };
  }, [officerId, officerName, currentUser?.profile?.plottingRs]);

  // Otomatis kembalikan petugas ke modal formulir pemantauan jika browser HP sempat reload saat ambil foto kamera
  useEffect(() => {
    try {
      const activeVicId = sessionStorage.getItem('jr_active_monitoring_victim_id');
      if (activeVicId && victims.length > 0 && !monitoringVictim) {
        const found = victims.find((v) => String(v.id) === String(activeVicId) || String(v.caseId) === String(activeVicId));
        if (found) {
          if (isVictimFinished(found)) {
            sessionStorage.removeItem('jr_active_monitoring_victim_id');
          } else {
            setMonitoringVictim(found);
          }
        }
      }
    } catch (e) { }
  }, [victims, monitoringVictim]);

  // Metrik agregasi
  const metrics = useMemo(() => {
    return storageService.getAggregatedMetrics(officerId);
  }, [victims, officerId]);

  // Helper info tanggal kunjungan terakhir (hanya dari kunjungan yang sudah selesai dilaksanakan)
  const getVictimLastVisitInfo = (v) => {
    const completedActs = Array.isArray(v.riwayatAktivitas)
      ? v.riwayatAktivitas.filter((a) => a.statusKunjungan !== 'Menunggu')
      : [];
    const completedVisits = Array.isArray(v.riwayatKunjungan)
      ? v.riwayatKunjungan.filter((a) => a.statusKunjungan !== 'Menunggu')
      : [];
    const visits = completedActs.length > 0 ? completedActs : completedVisits;
    const hasFirstDone = Boolean(v.kunjunganPertama && v.kunjunganPertama.statusKunjungan !== 'Menunggu');

    let rawDate = null;
    if (visits.length > 0) {
      const getTs = (a) => new Date(a.waktuAktualKunjungan || a.tanggalKunjungan || a.tanggal || a.waktuFoto || 0).getTime();
      const latest = [...visits].sort((a, b) => getTs(b) - getTs(a))[0];
      rawDate = latest.waktuAktualKunjungan || latest.tanggalKunjungan || latest.tanggal || latest.waktuFoto;
    }

    if (!rawDate && (visits.length > 0 || hasFirstDone)) {
      rawDate =
        v.tanggalKunjunganTerakhir ||
        v.waktuPemantauanTerakhir ||
        v.kunjunganPertama?.waktuAktualKunjungan ||
        v.kunjunganPertama?.tanggalKunjungan;
    }

    const d = rawDate ? parseDateSafe(rawDate) : null;
    const isValid = Boolean(d);

    return {
      dateObj: isValid ? d : null,
      rawDate: isValid ? rawDate : null,
      tglHari: isValid ? String(d.getDate()).padStart(2, '0') : '—',
      bulan: isValid ? d.toLocaleDateString('id-ID', { month: 'short' }).toUpperCase() : '—',
      waktu: isValid ? formatTimeIndo(d) : '—',
      fullFormatted: isValid
        ? formatDateTimeIndo(d)
        : 'Belum ada kunjungan'
    };
  };

  // Ekstraksi seluruh riwayat aktivitas nyata di sistem (Tanpa duplikasi & bedakan korban vs kunjungan)
  const allActualActivities = useMemo(() => {
    const list = [];
    const seenVisitIds = new Set();

    victims.forEach((v) => {
      // 1. Kunjungan Pertama
      if (v.kunjunganPertama && v.kunjunganPertama.statusKunjungan !== 'Menunggu') {
        const rawDate =
          v.kunjunganPertama.waktuAktualKunjungan ||
          v.kunjunganPertama.tanggalKunjungan ||
          v.kunjunganPertama.waktuFoto ||
          v.tanggalKunjunganTerakhir;
        if (rawDate) {
          const d = new Date(rawDate);
          if (!isNaN(d.getTime())) {
            const kId = v.kunjunganPertama.id || `${v.id}-kp`;
            if (!seenVisitIds.has(kId)) {
              seenVisitIds.add(kId);
              list.push({
                id: kId,
                date: d,
                victimId: v.id,
                victimName: v.nama,
                hospital: v.rumahSakit,
                jenis: 'Kunjungan Pertama',
                catatan: v.kunjunganPertama.hasilKunjungan || 'Laporan kunjungan disimpan',
                kondisi: v.kunjunganPertama.kondisiKorban || v.kondisiTerakhir
              });
            }
          }
        }
      }

      // 2. Riwayat Aktivitas Kunjungan
      const acts = Array.isArray(v.riwayatAktivitas) ? v.riwayatAktivitas : (v.riwayatKunjungan || []);
      acts.forEach((act, actIdx) => {
        if (!act || act.statusKunjungan === 'Menunggu' || act.jenisAktivitas === 'Kunjungan Pertama' || act.id === v.kunjunganPertama?.id) return;
        const rawDate =
          act.waktuAktualKunjungan || act.tanggalKunjungan || act.tanggal || act.waktuFoto;
        if (rawDate) {
          const d = new Date(rawDate);
          if (!isNaN(d.getTime())) {
            const aId = act.id || `${v.id}-act-${actIdx}-${act.tanggal || ''}`;
            if (!seenVisitIds.has(aId)) {
              seenVisitIds.add(aId);
              list.push({
                id: aId,
                date: d,
                victimId: v.id,
                victimName: v.nama,
                hospital: act.rumahSakit || v.rumahSakit,
                jenis: act.jenisAktivitas || 'Kunjungan Lanjutan',
                catatan: act.catatanTindakLanjut || act.hasilKunjungan || act.hasilPemantauan || 'Laporan kunjungan tersimpan',
                kondisi: act.kondisiKorban || v.kondisiTerakhir
              });
            }
          }
        }
      });
    });

    list.sort((a, b) => b.date.getTime() - a.date.getTime());
    return list;
  }, [victims]);

  // ── 1. STATISTIK 4 KARTU ATAS ──
  const totalKunjunganValue = allActualActivities.length;

  const kunjunganHariIniValue = useMemo(() => {
    const todayStr = now.toDateString();
    return allActualActivities.filter((a) => a.date.toDateString() === todayStr).length;
  }, [allActualActivities, now]);

  const perluTindakLanjutValue = useMemo(() => {
    const fromList = victims.filter((v) => !isVictimFinished(v)).length;
    return Math.max(fromList, metrics.perluTindakLanjut || 0);
  }, [victims, metrics.perluTindakLanjut]);

  // Evaluasi Kinerja Petugas: Fokus Ketepatan Waktu Kunjungan & Kepatuhan SLA Maksimal 3 Hari (Tanpa Target Kuota Korban)
  const petugasKpi = useMemo(() => {
    return evaluateOfficerKpi(victims, now, 90, 30, currentUser?.profile);
  }, [victims, now, currentUser]);

  // ── 2. DATA GRAFIK BULANAN (CURVED SVG CHART) ──
  const chartPoints = useMemo(() => {
    const slots = [];

    if (chartPeriod === '6 Bulan Terakhir') {
      for (let offset = 5; offset >= 0; offset--) {
        let m = currentMonthIdx - offset;
        let y = currentYear;
        while (m < 0) {
          m += 12;
          y -= 1;
        }
        slots.push({ month: MONTH_NAMES_SHORT[m], monthIdx: m, year: y, label: MONTH_NAMES_SHORT[m] });
      }
    } else {
      const targetYear = chartPeriod === 'Tahun Sebelumnya' ? currentYear - 1 : currentYear;
      for (let m = 0; m < 12; m++) {
        slots.push({ month: MONTH_NAMES_SHORT[m], monthIdx: m, year: targetYear, label: MONTH_NAMES_SHORT[m] });
      }
    }

    const rawData = slots.map((slot) => {
      const monthActs = allActualActivities.filter((act) => {
        const d = act.date;
        return d.getFullYear() === slot.year && d.getMonth() === slot.monthIdx;
      });
      return {
        month: slot.label,
        year: slot.year,
        kunjungan: monthActs.length
      };
    });

    const maxVal = Math.max(...rawData.map((d) => d.kunjungan), 0);
    const maxY =
      maxVal <= 5
        ? 10
        : maxVal <= 10
          ? 15
          : maxVal <= 20
            ? 20
            : maxVal <= 30
              ? 30
              : Math.ceil((maxVal + 5) / 10) * 10;

    const leftX = 40;
    const rightX = 460;
    const bottomY = 175;
    const topY = 25;
    const heightSpan = bottomY - topY;
    const stepX = (rightX - leftX) / Math.max(1, rawData.length - 1);

    return rawData.map((d, i) => {
      const yKunjungan = Math.round(bottomY - (d.kunjungan / maxY) * heightSpan);
      const x = Math.round(leftX + i * stepX);
      return {
        month: d.month,
        year: d.year,
        kunjungan: d.kunjungan,
        x,
        yKunjungan,
        maxY
      };
    });
  }, [chartPeriod, allActualActivities, currentMonthIdx, currentYear]);

  const maxYValue = chartPoints[0]?.maxY || 30;
  const yTicks = useMemo(() => {
    return [
      { value: maxYValue, y: 25 },
      { value: Math.round(maxYValue * 0.67), y: 75 },
      { value: Math.round(maxYValue * 0.33), y: 125 },
      { value: 0, y: 175 }
    ];
  }, [maxYValue]);

  // Path kurva halus bezier
  const lineKunjunganPathD = useMemo(() => {
    const pts = chartPoints;
    if (!pts || pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].yKunjungan}`;

    let d = `M ${pts[0].x} ${pts[0].yKunjungan}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const dx = p1.x - p0.x;
      const cx1 = p0.x + dx * 0.45;
      const cy1 = p0.yKunjungan;
      const cx2 = p0.x + dx * 0.55;
      const cy2 = p1.yKunjungan;
      d += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p1.x} ${p1.yKunjungan}`;
    }
    return d;
  }, [chartPoints]);

  const areaKunjunganPathD = useMemo(() => {
    const pts = chartPoints;
    if (!pts || pts.length === 0) return '';
    return `${lineKunjunganPathD} L ${pts[pts.length - 1].x} 175 L ${pts[0].x} 175 Z`;
  }, [lineKunjunganPathD, chartPoints]);

  // ── 3. AGENDA TERDEKAT ──
  const agendaList = useMemo(() => {
    if (!victims || victims.length === 0) return [];

    const activePatients = victims.filter((v) => {
      const st = getMonitoringStatus(v);
      return st === MONITORING_STATUS.BELUM_DIPANTAU || st === MONITORING_STATUS.DALAM_PEMANTAUAN;
    });

    const candidates = activePatients.length > 0 ? activePatients : victims;

    const sorted = [...candidates].sort((a, b) => compareVictimsBySlaPriority(a, b, now));

    return sorted.slice(0, 3).map((p) => {
      const visitInfo = getVictimLastVisitInfo(p);
      return {
        id: p.id,
        tglHari: visitInfo.tglHari,
        bulan: visitInfo.bulan,
        waktu: visitInfo.waktu,
        nama: p.nama,
        rumahSakit: p.rumahSakit || 'Rumah Sakit',
        status: p.kondisiTerakhir || 'Masih Dirawat'
      };
    });
  }, [victims, now]);

  // ── 4. AKTIVITAS TERBARU (PEMBARUAN DARI 7 HARI TERAKHIR) ──
  const recentActivitiesList = useMemo(() => {
    if (allActualActivities.length > 0) {
      return allActualActivities.slice(0, 3).map((act, idx) => {
        let title = 'Laporan kunjungan disimpan';
        let sub = `${act.victimName} · Kunjungan ke-${idx + 1}`;
        let iconType = 'file';

        if (act.kondisi === 'Sudah Pulang' || act.kondisi === 'Pulang' || act.kondisi === 'Selesai') {
          title = 'Kondisi korban diperbarui';
          sub = `${act.victimName} · Sudah pulang`;
          iconType = 'refresh';
        } else if (idx === 2) {
          title = 'Pemantauan dijadwalkan';
          sub = `${act.victimName} · ${formatDateShort(act.date)}`;
          iconType = 'calendar';
        }

        return {
          id: act.id,
          title,
          sub,
          iconType
        };
      });
    }

    if (victims.length > 0) {
      return victims.slice(0, 3).map((v, idx) => ({
        id: v.id,
        title: idx === 0 ? 'Data korban didaftarkan' : idx === 1 ? 'Kondisi korban dipantau' : 'Jadwal kunjungan disiapkan',
        sub: `${v.nama} · ${v.rumahSakit || 'Faskes'}`,
        iconType: idx === 0 ? 'file' : idx === 1 ? 'refresh' : 'calendar'
      }));
    }

    return [];
  }, [allActualActivities, victims]);

  // ── 5. TABEL: STATUS KASUS KORBAN (INTERAKTIF SORTING DENGAN PRIORITAS SLA DEFAULT) ──
  const tableData = useMemo(() => {
    const list = [...victims];
    if (!tableSortConfig.key) {
      return list.sort((a, b) => compareVictimsBySlaPriority(a, b, now)).slice(0, 8);
    }

    return list.sort((a, b) => {
      let valA, valB;
      switch (tableSortConfig.key) {
        case 'index':
          valA = Number(a.id) || 0;
          valB = Number(b.id) || 0;
          break;
        case 'noRegister':
          valA = String(a.nomorTiket || a.nomorLaporan || a.noRegister || a.caseId || a.id).toLowerCase();
          valB = String(b.nomorTiket || b.nomorLaporan || b.noRegister || b.caseId || b.id).toLowerCase();
          break;
        case 'tglRegister':
          valA = new Date(a.tanggalMasukRs || a.tanggalInformasiDiterima || 0).getTime();
          valB = new Date(b.tanggalMasukRs || b.tanggalInformasiDiterima || 0).getTime();
          break;
        case 'rumahSakit':
        case 'asal':
          valA = String(a.rumahSakit || a.rumahSakitTujuan || a.rumahSakitAsal || '').toLowerCase();
          valB = String(b.rumahSakit || b.rumahSakitTujuan || b.rumahSakitAsal || '').toLowerCase();
          break;
        case 'tglLaka':
          valA = new Date(a.tanggalKecelakaan || a.tgl_laka || a.tanggalInformasiDiterima || 0).getTime();
          valB = new Date(b.tanggalKecelakaan || b.tgl_laka || b.tanggalInformasiDiterima || 0).getTime();
          break;
        case 'namaKorban':
          valA = String(a.nama || '').toLowerCase();
          valB = String(b.nama || '').toLowerCase();
          break;
        case 'tlTerakhir': {
          const lastA = getVictimLastVisitInfo(a);
          const lastB = getVictimLastVisitInfo(b);
          valA = new Date(lastA.rawDate || 0).getTime();
          valB = new Date(lastB.rawDate || 0).getTime();
          break;
        }
        case 'status':
          valA = String(getMonitoringStatus(a));
          valB = String(getMonitoringStatus(b));
          break;
        default:
          return 0;
      }

      if (valA < valB) return tableSortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return tableSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    }).slice(0, 8);
  }, [victims, now, tableSortConfig]);

  const renderStatusBadge = (victim) => {
    return <MonitoringStatusBadge victim={victim} size="sm" />;
  };

  return (
    <div className="space-y-5 sm:space-y-6 max-w-full overflow-hidden">
      {/* ── 1. HEADER UTAMA DASHBOARD ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Dashboard Petugas
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Selamat datang, <strong className="text-slate-800 font-semibold">{officerName}</strong>. Pantau beban kasus, kepatuhan batas waktu SLA 3 hari (72 jam), dan agenda pemantauan RS.
          </p>
        </div>

        {/* Tombol + Tambah Kunjungan */}
        <div className="w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={() => setIsQuickAddModalOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-2xs transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Kunjungan</span>
          </button>
        </div>
      </div>

      {/* ── 2. SUMMARY KPI STAT CARDS (SERAGAM DENGAN DASHBOARD KABAG & DAFTAR KORBAN) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Card 1: Beban Kasus Korban */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Beban Kasus Korban
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#145DA0] border border-blue-100 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-slate-900 block mt-2">
            {victims.length}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5 truncate">
            Beban kerja kasus aktif
          </span>
        </div>

        {/* Card 2: Kunjungan Hari Ini */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Kunjungan Hari Ini
            </span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-[#145DA0] border border-sky-100 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-slate-900 block mt-2">
            {kunjunganHariIniValue}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5 truncate">
            {kunjunganHariIniValue > 0 ? `${kunjunganHariIniValue} kunjungan selesai` : '0 kunjungan selesai'}
          </span>
        </div>

        {/* Card 3: Kepatuhan SLA Kunjungan */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Kepatuhan SLA 
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight block mt-2 ${
            petugasKpi.slaKunjungan !== null && petugasKpi.slaKunjungan < 80 ? 'text-rose-600' : 'text-emerald-600'
          }`}>
            {petugasKpi.slaKunjungan !== null ? `${petugasKpi.slaKunjungan}%` : '100%'}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5 truncate">
            Ketepatan waktu maks. 72 jam
          </span>
        </div>

        {/* Card 4: Perlu Tindak Lanjut */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Perlu Tindak Lanjut
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight block mt-2 ${
            perluTindakLanjutValue > 0 ? 'text-amber-600' : 'text-slate-900'
          }`}>
            {perluTindakLanjutValue}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5 truncate">
            Jadwal pemantauan tiba
          </span>
        </div>
      </div>

      {/* ── 3. BARIS TENGAH: 3 WIDGET SEJAJAR (RESPONSIVE 12-COL GRID) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch">
        {/* Kolom 1: Aktivitas Kunjungan Bulanan (Tablet: 2 col, Desktop: 6 / 12) */}
        <div className="col-span-1 md:col-span-2 lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Aktivitas Kunjungan Bulanan</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Jumlah kunjungan Anda selama 6 bulan terakhir
                </p>
              </div>

              <div className="relative self-start sm:self-auto">
                <select
                  value={chartPeriod}
                  onChange={(e) => {
                    setChartPeriod(e.target.value);
                    setChartAnimationKey((prev) => prev + 1);
                    setHoveredPointIndex(null);
                  }}
                  className="appearance-none pl-3 pr-8 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#145DA0] cursor-pointer"
                >
                  <option value="6 Bulan Terakhir">6 Bulan Terakhir</option>
                  <option value="Tahun Ini">Tahun Ini</option>
                  <option value="Tahun Sebelumnya">Tahun Sebelumnya</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Area Line Chart SVG (Touch Responsive) */}
            <div className="pt-4 overflow-hidden">
              <svg
                key={chartAnimationKey}
                viewBox="0 0 500 200"
                className="w-full h-44 sm:h-52 overflow-visible select-none"
              >
                <defs>
                  <linearGradient id="petugasAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.01" />
                  </linearGradient>
                </defs>

                {/* Grid Lines Sumbu Y */}
                {yTicks.map((tick, idx) => (
                  <React.Fragment key={idx}>
                    <line
                      x1="35"
                      y1={tick.y}
                      x2="470"
                      y2={tick.y}
                      stroke={tick.y === 175 ? '#E2E8F0' : '#F1F5F9'}
                      strokeDasharray={tick.y === 175 ? undefined : '3 3'}
                    />
                    <text x="25" y={tick.y + 4} fill="#94A3B8" fontSize="10" textAnchor="end">
                      {tick.value}
                    </text>
                  </React.Fragment>
                ))}

                {/* Area Gradient */}
                <path
                  d={areaKunjunganPathD}
                  fill="url(#petugasAreaGradient)"
                />

                {/* Garis Kurva Biru Halus */}
                <path
                  d={lineKunjunganPathD}
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="2.75"
                  strokeLinecap="round"
                />

                {/* Titik Point Data Bulat */}
                {chartPoints.map((pt, i) => {
                  const isHovered = hoveredPointIndex === i;
                  return (
                    <g
                      key={i}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredPointIndex(i)}
                      onMouseLeave={() => setHoveredPointIndex(null)}
                      onTouchStart={() => setHoveredPointIndex(i)}
                    >
                      {/* Area touch target diperbesar untuk mobile */}
                      <rect
                        x={pt.x - 20}
                        y="15"
                        width="40"
                        height="165"
                        fill="transparent"
                      />

                      <circle
                        cx={pt.x}
                        cy={pt.yKunjungan}
                        r={isHovered ? 6 : 4}
                        fill="#FFFFFF"
                        stroke="#3B82F6"
                        strokeWidth="2.5"
                        className="transition-all"
                      />

                      {/* Tooltip Hover / Touch */}
                      {isHovered && (
                        <g transform={`translate(${pt.x}, ${Math.max(30, pt.yKunjungan - 12)})`}>
                          <rect
                            x="-38"
                            y="-28"
                            width="76"
                            height="24"
                            rx="6"
                            fill="#0F172A"
                          />
                          <polygon points="-3,-4 0,0 3,-4" fill="#0F172A" />
                          <text
                            x="0"
                            y="-12"
                            fill="#FFFFFF"
                            fontSize="9.5"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {pt.kunjungan} Kunjungan
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Sumbu X (Label Bulan) */}
                {chartPoints.map((pt, i) => (
                  <text
                    key={i}
                    x={pt.x}
                    y="194"
                    fill={hoveredPointIndex === i ? '#145DA0' : '#94A3B8'}
                    fontSize="10"
                    fontWeight={hoveredPointIndex === i ? 'bold' : 'normal'}
                    textAnchor="middle"
                  >
                    {pt.month}
                  </text>
                ))}
              </svg>
            </div>
          </div>
        </div>

        {/* Kolom 2: Agenda Terdekat (Tablet: 1 col, Desktop: 3 / 12) */}
        <div className="col-span-1 md:col-span-1 lg:col-span-3 bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Agenda Terdekat</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Kunjungan yang perlu diperhatikan
              </p>
            </div>

            {/* List Agenda dengan Kotak Tanggal di Sisi Kiri */}
            <div className="divide-y divide-slate-100 mt-1">
              {agendaList.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Belum ada agenda kunjungan terdekat.
                </div>
              ) : (
                agendaList.map((item) => (
                  <div key={item.id} className="py-3 sm:py-3.5 flex items-center justify-between gap-2.5 sm:gap-3 group">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      {/* Box Tanggal Bergaris Biru */}
                      <div className="w-11 py-1.5 rounded-xl border border-blue-200 bg-blue-50/50 flex flex-col items-center justify-center shrink-0">
                        <span className="text-sm font-extrabold text-[#145DA0] leading-none">
                          {item.tglHari}
                        </span>
                        <span className="text-[9px] font-bold text-[#145DA0] uppercase tracking-wider mt-0.5">
                          {item.bulan}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{item.waktu}</span>
                        </div>
                        <Link
                          to={`/petugas/korban/${item.id}`}
                          className="font-bold text-xs text-slate-900 hover:text-[#145DA0] truncate block mt-0.5"
                        >
                          {item.nama}
                        </Link>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          {item.rumahSakit}
                        </p>
                      </div>
                    </div>

                    <Link
                      to={`/petugas/korban/${item.id}`}
                      className="text-slate-400 hover:text-slate-600 p-1 shrink-0"
                      title="Lihat Detail Korban"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 text-center">
            <Link
              to="/petugas/pemantauan"
              className="text-xs font-semibold text-[#145DA0] hover:underline inline-flex items-center gap-1"
            >
              <span>Lihat semua agenda</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Kolom 3: Aktivitas Terbaru (Tablet: 1 col, Desktop: 3 / 12) */}
        <div className="col-span-1 md:col-span-1 lg:col-span-3 bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Aktivitas terbaru</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pembaruan dari 7 hari terakhir
                </p>
              </div>
              <Link
                to="/petugas/riwayat"
                className="text-xs font-semibold text-[#145DA0] hover:underline"
              >
                Lihat riwayat
              </Link>
            </div>

            {/* List Aktivitas Timeline */}
            <div className="space-y-3 sm:space-y-3.5 mt-3 sm:mt-3.5">
              {recentActivitiesList.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Belum ada pembaruan aktivitas terbaru.
                </div>
              ) : (
                recentActivitiesList.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#145DA0] flex items-center justify-center shrink-0 border border-blue-100">
                      {item.iconType === 'file' && <FileText className="w-4 h-4" />}
                      {item.iconType === 'refresh' && <RotateCcw className="w-4 h-4" />}
                      {item.iconType === 'calendar' && <CalendarCheck className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <strong className="text-xs font-bold text-slate-900 block leading-tight truncate">
                        {item.title}
                      </strong>
                      <span className="text-[11px] text-slate-400 block mt-0.5 truncate">
                        {item.sub}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 text-center">
            <Link
              to="/petugas/riwayat"
              className="text-xs font-semibold text-[#145DA0] hover:underline inline-flex items-center gap-1"
            >
              <span>Lihat semua aktivitas</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── 4. TABEL / KARTU: KUNJUNGAN TERBARU (DUAL RESPONSIVE) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Kunjungan Terbaru</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Aktivitas kunjungan terakhir yang Anda catat
            </p>
          </div>

          <Link
            to="/petugas/riwayat"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors"
          >
            <span>Lihat Semua Kunjungan</span>
          </Link>
        </div>

        {/* ── TAMPILAN MOBILE: CARD LIST (HP < 768px) ── */}
        <div className="md:hidden divide-y divide-slate-100">
          {tableData.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs">
              Belum ada aktivitas kunjungan terbaru yang dicatat.
            </div>
          ) : (
            tableData.map((v, idx) => {
              const lastVisitInfo = getVictimLastVisitInfo(v);

              return (
                <div key={v.id} className="p-4 space-y-3 hover:bg-slate-50/70 transition-colors">
                  {/* Baris 1: Inisial, Nama, ID & Status Badge */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-50 text-[#145DA0] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                        <User className="w-4 h-4 text-[#145DA0]" />
                      </div>
                      <div className="min-w-0">
                        <Link
                          to={`/petugas/korban/${v.id}`}
                          className="font-bold text-xs text-slate-900 hover:text-[#145DA0] truncate block"
                        >
                          {v.nama}
                        </Link>
                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5 truncate">
                          {v.nomorTiket || v.nomorLaporan || `JR/PKU/${currentYear}/00${800 + idx * 11}`}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {renderStatusBadge(v)}
                    </div>
                  </div>

                  {/* Baris 2: Rumah Sakit & Info Tanggal */}
                  <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-100 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{v.rumahSakit || '—'}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Tgl Kecelakaan:</span>
                        <span className="font-semibold text-slate-700 block">
                          {formatDateShort(v.tanggalKecelakaan || v.tanggalInformasiDiterima)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {formatTime(v.tanggalKecelakaan || v.tanggalInformasiDiterima) || '09.30 WIB'}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-slate-400 block text-[10px]">Tgl Kunjungan:</span>
                        <span className="font-semibold text-slate-700 block">
                          {lastVisitInfo.rawDate ? formatDateShort(lastVisitInfo.rawDate) : 'Belum Ada'}
                        </span>
                        {lastVisitInfo.rawDate && (
                          <span className="text-[10px] text-slate-400 block">
                            {lastVisitInfo.waktu}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Baris 3: Tombol Aksi Mobile (Hanya Lihat Detail & Catat - Tanpa Hapus Sesuai Instruksi) */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <Link
                      to={`/petugas/korban/${v.id}`}
                      className="flex-1 py-2 px-3 rounded-xl border border-blue-200 bg-blue-50/70 text-[#145DA0] hover:bg-blue-100 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat Detail</span>
                    </Link>

                    {!isVictimFinished(v) && (
                      <button
                        type="button"
                        onClick={() => setMonitoringVictim(v)}
                        className="flex-1 py-2 px-3 rounded-xl border border-amber-200 bg-amber-50/70 text-amber-700 hover:bg-amber-100 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Catat Kunjungan</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── TAMPILAN DESKTOP: FULL TABLE (LAYAR TABLET & DESKTOP >= 768px) ── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50/90 border-b border-slate-200/90">
              <tr>
                <SortableHeader
                  label="#"
                  sortKey="index"
                  currentSortKey={tableSortConfig.key}
                  currentSortDirection={tableSortConfig.direction}
                  onSort={handleTableSort}
                  align="center"
                  className="w-12 text-center"
                />
                <SortableHeader
                  label="Nama Korban"
                  sortKey="namaKorban"
                  currentSortKey={tableSortConfig.key}
                  currentSortDirection={tableSortConfig.direction}
                  onSort={handleTableSort}
                />
                <SortableHeader
                  label="Rumah Sakit"
                  sortKey="rumahSakit"
                  currentSortKey={tableSortConfig.key}
                  currentSortDirection={tableSortConfig.direction}
                  onSort={handleTableSort}
                />
                <SortableHeader
                  label="Tgl Kecelakaan"
                  sortKey="tglLaka"
                  currentSortKey={tableSortConfig.key}
                  currentSortDirection={tableSortConfig.direction}
                  onSort={handleTableSort}
                />
                <SortableHeader
                  label="TGL Masuk RS"
                  sortKey="tglRegister"
                  currentSortKey={tableSortConfig.key}
                  currentSortDirection={tableSortConfig.direction}
                  onSort={handleTableSort}
                />
                <SortableHeader
                  label="TL Terakhir"
                  sortKey="tlTerakhir"
                  currentSortKey={tableSortConfig.key}
                  currentSortDirection={tableSortConfig.direction}
                  onSort={handleTableSort}
                />
                <SortableHeader
                  label="Status"
                  sortKey="status"
                  currentSortKey={tableSortConfig.key}
                  currentSortDirection={tableSortConfig.direction}
                  onSort={handleTableSort}
                  align="center"
                  className="text-center"
                />
                <th className="py-3 px-4 font-bold text-slate-700 uppercase tracking-wider text-[11px] text-center w-24">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Belum ada aktivitas kunjungan terbaru yang dicatat.
                  </td>
                </tr>
              ) : (
                tableData.map((v, idx) => {
                  const nomorUrut = String(idx + 1).padStart(2, '0');
                  const lastVisitInfo = getVictimLastVisitInfo(v);
                  const isFinished = isVictimFinished(v);
                  const refInfo = getReferralPerspectiveInfo(v, null, currentUser);

                  return (
                    <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* # (NO.) */}
                      <td className="py-3.5 px-3.5 font-mono text-slate-400 text-center font-medium text-xs">
                        {nomorUrut}
                      </td>

                      {/* Nama Korban */}
                      <td className="py-3.5 px-3.5 font-bold text-slate-900 whitespace-nowrap text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-[#145DA0] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                            <User className="w-4 h-4 text-[#145DA0]" />
                          </div>
                          <div>
                            <Link
                              to={`/petugas/korban/${v.id}`}
                              className="font-bold text-xs text-slate-900 hover:text-[#145DA0] hover:underline block"
                            >
                              {v.nama}
                            </Link>
                            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                              {v.nik ? `NIK: ${v.nik}` : `ID: ${v.id}`}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Rumah Sakit (Sesuai Sudut Pandang Faskes Penangan) */}
                      <td className="py-3.5 px-3.5 text-slate-800 font-medium whitespace-nowrap text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{refInfo.displayHospital}</span>
                        </div>
                        {refInfo.isReferred && refInfo.badgeLabel && (
                          <span className={`text-[10px] ${refInfo.badgeColorClass} px-1.5 py-0.5 rounded border font-semibold inline-block mt-0.5 ml-5 shadow-2xs`}>
                            {refInfo.badgeLabel}
                          </span>
                        )}
                      </td>

                      {/* Tgl Kecelakaan */}
                      <td className="py-3.5 px-3.5 text-slate-700 whitespace-nowrap font-medium text-xs">
                        <span className="text-slate-800 font-medium block">
                          {formatDateIndo(v.tanggalKecelakaan || v.tgl_laka || v.tanggalInformasiDiterima)}
                        </span>
                      </td>

                      {/* TGL Masuk RS */}
                      <td className="py-3.5 px-3.5 text-slate-700 whitespace-nowrap font-medium text-xs">
                        <span className="text-slate-800 font-medium block">
                          {formatDateShort(v.tanggalMasukRs || v.tanggalInformasiDiterima)}
                        </span>
                      </td>

                      {/* TL Terakhir (Tanggal & Keterangan Kunjungan) */}
                      <td className="py-3.5 px-3.5 text-slate-800 whitespace-nowrap text-xs">
                        <span className="text-slate-800 font-medium block">
                          {lastVisitInfo.rawDate ? formatDateIndo(lastVisitInfo.rawDate) : 'Belum Ada'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                        {renderStatusBadge(v)}
                      </td>

                      {/* Aksi: Jika korban Pulang/Selesai, tidak bisa catat pemantauan lagi */}
                      <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Tombol Lihat Detail */}
                          <Link
                            to={`/petugas/korban/${v.id}`}
                            className="w-7 h-7 rounded-lg border border-blue-200 bg-blue-50 text-[#145DA0] hover:bg-blue-100 flex items-center justify-center transition-colors shadow-2xs"
                            title="Lihat Detail Korban"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Link>

                          {/* Tombol Catat / Form Pemantauan */}
                          {!isFinished ? (
                            <button
                              type="button"
                              onClick={() => setMonitoringVictim(v)}
                              className="w-7 h-7 rounded-lg border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                              title="Catat Kunjungan / Pemantauan"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="inline-flex items-center p-1 rounded text-emerald-700 bg-emerald-50 border border-emerald-200" title="Selesai">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </span>
                          )}
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

      {/* ── MODAL PILIH AKSI KUNJUNGAN CEPAT ── */}
      {isQuickAddModalOpen && (
        <Modal
          isOpen={isQuickAddModalOpen}
          onClose={() => setIsQuickAddModalOpen(false)}
          title="Tambah Kunjungan / Pemantauan Pasien"
          subtitle="Pilih opsi untuk mencatat kunjungan pasien atau memasukkan data korban laka baru."
          maxWidth="max-w-md"
        >
          <div className="space-y-3 pt-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setIsQuickAddModalOpen(false);
                navigate('/petugas/korban');
              }}
              className="w-full p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 text-left transition-colors flex items-start gap-3 cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-100 text-[#145DA0] flex items-center justify-center shrink-0 group-hover:bg-[#145DA0] group-hover:text-white transition-colors">
                <ListChecks className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <strong className="text-slate-900 block font-bold text-xs group-hover:text-[#145DA0]">
                  Pilih dari Daftar Pasien Terdaftar
                </strong>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Catat kunjungan atau pemantauan berkala untuk korban laka yang sedang dirawat di rumah sakit.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsQuickAddModalOpen(false);
                setIsInputModalOpen(true);
              }}
              className="w-full p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 text-left transition-colors flex items-start gap-3 cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-100 text-[#145DA0] flex items-center justify-center shrink-0 group-hover:bg-[#145DA0] group-hover:text-white transition-colors">
                <Plus className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <strong className="text-slate-900 block font-bold text-xs group-hover:text-[#145DA0]">
                  Input Data Korban Baru
                </strong>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Tambahkan data korban baru dari IRSMS / laporan faskes ke sistem pemantauan.
                </p>
              </div>
            </button>

            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsQuickAddModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </Modal>
      )}

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
