import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla, compareVictimsBySlaPriority } from '../../services/slaService';
import { formatDateIndo as formatDateShort } from '../../utils/dateUtils';
import { getReferralPerspectiveInfo, matchesHospitalFilter } from '../../utils/referralUtils';
import { exportVictimsExcelByHospital } from '../../services/excelReportService';
import FormInputKorbanModal from '../../components/petugas/FormInputKorbanModal';
import FormPemantauanModal from '../../components/petugas/FormPemantauanModal';
import MonitoringStatusBadge from '../../components/common/MonitoringStatusBadge';
import SortableHeader from '../../components/common/SortableHeader';
import {
  MONITORING_STATUS,
  getMonitoringStatus,
  isVictimFinished
} from '../../utils/monitoringStatus';
import {
  Search,
  Eye,
  Building2,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Users,
  UserPlus,
  Activity,
  ArrowUpRight,
  ArrowRight,
  User,
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';

function getTlTerakhir(v) {
  const completedActs = Array.isArray(v.riwayatAktivitas)
    ? v.riwayatAktivitas.filter((a) => a.statusKunjungan !== 'Menunggu')
    : [];
  const hasFirstDone = Boolean(v.kunjunganPertama && v.kunjunganPertama.statusKunjungan !== 'Menunggu');
  const hasCompletedVisit =
    completedActs.length > 0 ||
    (Array.isArray(v.riwayatKunjungan) && v.riwayatKunjungan.length > 0) ||
    hasFirstDone;

  if (!hasCompletedVisit) {
    return 'Belum Ada';
  }

  const lastDate =
    completedActs[0]?.waktuAktualKunjungan ||
    completedActs[0]?.tanggalKunjungan ||
    completedActs[0]?.tanggal ||
    v.tanggalKunjunganTerakhir ||
    v.waktuPemantauanTerakhir ||
    v.tanggalPemantauanTerakhir ||
    v.kunjunganPertama?.waktuAktualKunjungan ||
    v.kunjunganPertama?.tanggalKunjungan ||
    v.kunjunganPertama?.tanggal;

  return lastDate ? formatDateShort(lastDate) : 'Belum Ada';
}

const PAGE_SIZE = 10;

export default function PetugasVictimList() {
  const { currentUser } = useAuth();
  const officerId = currentUser?.profile?.id || 'PET-01';

  const [victims, setVictims] = useState([]);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'Menunggu Kunjungan' | 'Dalam Pemantauan' | 'Menunggu Tindak Lanjut' | 'Selesai'
  const [search, setSearch] = useState('');
  const [filterHospital, setFilterHospital] = useState('ALL');
  const [filterCondition, setFilterCondition] = useState('ALL');
  const [filterMonitoringStatus, setFilterMonitoringStatus] = useState('ALL');
  const [filterLateness, setFilterLateness] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
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

  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [selectedVictimForMonitoring, setSelectedVictimForMonitoring] = useState(null);

  const activeOfficerIdent = useMemo(() => {
    return currentUser?.profile || currentUser?.profile?.id || currentUser?.profile?.backendOfficerId || currentUser?.profile?.nama || officerId;
  }, [currentUser, officerId]);

  const loadData = () => {
    const ident = currentUser?.profile || currentUser?.profile?.id || currentUser?.profile?.backendOfficerId || currentUser?.profile?.nama || officerId;
    const myVictims = storageService.getOfficerVictimsForPortal(ident);
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
  }, [officerId, currentUser?.profile?.plottingRs]);

  // Otomatis kembalikan petugas ke modal formulir pemantauan jika browser HP sempat reload saat ambil foto kamera
  useEffect(() => {
    try {
      const activeVicId = sessionStorage.getItem('jr_active_monitoring_victim_id');
      if (activeVicId && victims.length > 0 && !selectedVictimForMonitoring) {
        const found = victims.find((v) => String(v.id) === String(activeVicId) || String(v.caseId) === String(activeVicId));
        if (found) {
          setSelectedVictimForMonitoring(found);
        }
      }
    } catch (e) { }
  }, [victims, selectedVictimForMonitoring]);

  // Aggregate metrics & tab counters selaras 5 kategori resmi (kecualikan pasien yang sudah dirujuk keluar)
  const metrics = useMemo(() => {
    let belumDipantau = 0;
    let dalamPemantauan = 0;
    let selesaiPulang = 0;
    let selesaiMd = 0;
    let selesaiTidakBersedia = 0;

    victims.forEach((v) => {
      const refInfo = getReferralPerspectiveInfo(v, null, currentUser);
      const isReferredOut = refInfo.isReferred && refInfo.isOriginView;
      const st = getMonitoringStatus(v);

      if (st === MONITORING_STATUS.SELESAI_PULANG) {
        selesaiPulang++;
      } else if (st === MONITORING_STATUS.SELESAI_MD) {
        selesaiMd++;
      } else if (st === MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA) {
        selesaiTidakBersedia++;
      } else if (!isReferredOut) {
        if (st === MONITORING_STATUS.BELUM_DIPANTAU) belumDipantau++;
        else if (st === MONITORING_STATUS.DALAM_PEMANTAUAN) dalamPemantauan++;
      }
    });

    return {
      all: victims.length,
      total: victims.length,
      belumDipantau,
      dalamPemantauan,
      selesaiPulang,
      selesaiMd,
      selesaiTidakBersedia
    };
  }, [victims, currentUser]);
  const tabCounts = metrics;

  const hospitals = useMemo(() => {
    const list = [];
    victims.forEach((v) => {
      if (v.rumahSakit) list.push(v.rumahSakit);
      if (v.rumahSakitAsal) list.push(v.rumahSakitAsal);
    });
    return Array.from(new Set(list)).filter(Boolean);
  }, [victims]);

  // Filtered dataset: otomatis diurutkan agar korban Terlambat (lewat) & Mendekati Tenggat berada paling atas
  const filtered = useMemo(() => {
    const list = victims.filter((v) => {
      const currentStatus = getMonitoringStatus(v);
      const isFinished = isVictimFinished(v);

      // 0. Filter Tab Utama (5 Kategori Status Resmi)
      if (activeTab !== 'all') {
        const refTabInfo = getReferralPerspectiveInfo(v, null, currentUser);
        if (refTabInfo.isReferred && refTabInfo.isOriginView && !isFinished) {
          return false;
        }
        if (currentStatus !== activeTab) return false;
      }

      const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama);
      const mSla = calculateMonitoringSla(v);
      const isVisited = !!v.kunjunganPertama;

      // 1. Search nama korban atau NIK
      const matchSearch =
        v.nama.toLowerCase().includes(search.toLowerCase()) ||
        (v.nik && v.nik.includes(search)) ||
        (v.nomorLaporan && v.nomorLaporan.toLowerCase().includes(search.toLowerCase())) ||
        (v.rumahSakit && v.rumahSakit.toLowerCase().includes(search.toLowerCase())) ||
        (v.rumahSakitAsal && v.rumahSakitAsal.toLowerCase().includes(search.toLowerCase()));
      if (!matchSearch) return false;

      // 2. Filter Rumah Sakit (Mendukung filter sudut pandang RS Asal maupun RS Tujuan)
      if (filterHospital !== 'ALL') {
        if (!matchesHospitalFilter(v, filterHospital)) return false;
      }

      // 3. Filter Kondisi Korban
      if (filterCondition !== 'ALL') {
        if (filterCondition === 'Sudah Pulang' && !isFinished) return false;
        else if (filterCondition !== 'Sudah Pulang' && v.kondisiTerakhir !== filterCondition) return false;
      }

      // 4. Filter Status Pemantauan (4 Kategori)
      if (filterMonitoringStatus !== 'ALL') {
        if (currentStatus !== filterMonitoringStatus) return false;
      }

      // 5. Filter Keterlambatan
      if (filterLateness !== 'ALL') {
        const activeSla = !isVisited ? fSla : mSla;
        if (filterLateness === 'TERLAMBAT' && !activeSla.isOverdue && activeSla.status !== 'SELESAI_TERLAMBAT') return false;
        if (filterLateness === 'MENDEKATI' && activeSla.status !== 'MENDEKATI_BATAS') return false;
        if (filterLateness === 'TEPAT_WAKTU' && (activeSla.isOverdue || activeSla.status === 'SELESAI_TERLAMBAT')) return false;
      }

      return true;
    });

    const now = new Date();
    if (!sortConfig.key) {
      return list.sort((a, b) => compareVictimsBySlaPriority(a, b, now));
    }

    return [...list].sort((a, b) => {
      let valA, valB;
      switch (sortConfig.key) {
        case 'index':
          valA = Number(a.id) || 0;
          valB = Number(b.id) || 0;
          break;
        case 'noRegister':
          valA = String(a.nomorLaporan || a.nomorTiket || a.noRegister || a.caseId || a.id).toLowerCase();
          valB = String(b.nomorLaporan || b.nomorTiket || b.noRegister || b.caseId || b.id).toLowerCase();
          break;
        case 'tglRegister':
          valA = new Date(a.tanggalMasukRs || a.tanggalInformasiDiterima || 0).getTime();
          valB = new Date(b.tanggalMasukRs || b.tanggalInformasiDiterima || 0).getTime();
          break;
        case 'rumahSakit':
        case 'asal':
          valA = String(a.rumahSakit || a.rumahSakitAsal || '').toLowerCase();
          valB = String(b.rumahSakit || b.rumahSakitAsal || '').toLowerCase();
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
          const da = a.tanggalKunjunganTerakhir || a.waktuPemantauanTerakhir || a.kunjunganPertama?.tanggalKunjungan || 0;
          const db = b.tanggalKunjunganTerakhir || b.waktuPemantauanTerakhir || b.kunjunganPertama?.tanggalKunjungan || 0;
          valA = new Date(da).getTime();
          valB = new Date(db).getTime();
          break;
        }
        case 'status':
          valA = String(getMonitoringStatus(a));
          valB = String(getMonitoringStatus(b));
          break;
        default:
          return 0;
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [victims, activeTab, search, filterHospital, filterCondition, filterMonitoringStatus, filterLateness, sortConfig]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const resetAllFilters = () => {
    setSearch('');
    setFilterHospital('ALL');
    setFilterCondition('ALL');
    setFilterMonitoringStatus('ALL');
    setFilterLateness('ALL');
    setActiveTab('all');
    setSortConfig({ key: null, direction: 'asc' });
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* ── 1. PAGE HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Daftar Korban</h1>
          <p className="text-xs text-slate-500 mt-1">
            Data terpadu penanganan korban laka lantas, pemantauan rumah sakit, dan status verifikasi santunan.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={async () => {
              try {
                const prof = currentUser?.profile || currentUser;
                let officerHospitals = [];
                if (Array.isArray(prof?.plottingRs) && prof.plottingRs.length > 0) {
                  officerHospitals = prof.plottingRs;
                } else if (Array.isArray(prof?.hospitals) && prof.hospitals.length > 0) {
                  officerHospitals = prof.hospitals.map((h) => h.nama_rs).filter(Boolean);
                } else {
                  const storedOfficer = storageService.getOfficerById(prof?.id || prof?.backendOfficerId || officerId);
                  if (Array.isArray(storedOfficer?.plottingRs)) {
                    officerHospitals = storedOfficer.plottingRs;
                  }
                }
                await exportVictimsExcelByHospital({
                  victims,
                  officerHospitals,
                  currentUser,
                  fileNamePrefix: 'Laporan_Daftar_Korban'
                });
              } catch (err) {
                console.error('Gagal download Excel:', err);
                alert(err?.message || 'Gagal mengunduh laporan Excel.');
              }
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Download Excel</span>
          </button>

          <button
            type="button"
            onClick={() => setIsInputModalOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-2xs transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Tambah Korban Baru</span>
          </button>
        </div>
      </div>

      {/* ── 2. SUMMARY KPI STAT CARDS (5 KATEGORI) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* 1. Total Korban */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Korban</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#145DA0] flex items-center justify-center border border-blue-100 shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-slate-900 block mt-2">
            {metrics.total}
          </span>
        </div>

        {/* 2. Belum Dipantau */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Belum Dipantau</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-amber-600 block mt-2">
            {metrics.belumDipantau}
          </span>
        </div>

        {/* 3. Dalam Pemantauan */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dalam Pemantauan</span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-[#145DA0] flex items-center justify-center border border-sky-100 shrink-0">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-[#145DA0] block mt-2">
            {metrics.dalamPemantauan}
          </span>
        </div>

        {/* 4. Selesai Pulang */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Selesai Pulang</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-emerald-600 block mt-2">
            {metrics.selesaiPulang}
          </span>
        </div>

        {/* 5. Selesai MD & Tidak Bersedia */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Selesai MD / Tolak JR</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-rose-600 block mt-2">
            {metrics.selesaiMd + metrics.selesaiTidakBersedia}
          </span>
        </div>
      </div>

      {/* ── 2.5 TABS PENGELOMPOKAN DATA KORBAN (4 KATEGORI STATUS) ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-2xs ${activeTab === 'all'
            ? 'bg-[#145DA0] text-white'
            : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/90'
            }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Semua Korban</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
            {tabCounts.all}
          </span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab(MONITORING_STATUS.BELUM_DIPANTAU); setCurrentPage(1); }}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-2xs ${activeTab === MONITORING_STATUS.BELUM_DIPANTAU
            ? 'bg-[#145DA0] text-white'
            : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/90'
            }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Belum Dipantau</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === MONITORING_STATUS.BELUM_DIPANTAU ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>
            {tabCounts.belumDipantau}
          </span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab(MONITORING_STATUS.DALAM_PEMANTAUAN); setCurrentPage(1); }}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-2xs ${activeTab === MONITORING_STATUS.DALAM_PEMANTAUAN
            ? 'bg-[#145DA0] text-white'
            : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/90'
            }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Dalam Pemantauan</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === MONITORING_STATUS.DALAM_PEMANTAUAN ? 'bg-white/20 text-white' : 'bg-sky-50 text-[#145DA0] border border-sky-200'
            }`}>
            {tabCounts.dalamPemantauan}
          </span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab(MONITORING_STATUS.SELESAI_PULANG); setCurrentPage(1); }}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-2xs ${activeTab === MONITORING_STATUS.SELESAI_PULANG
            ? 'bg-[#145DA0] text-white'
            : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/90'
            }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Selesai Pulang</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === MONITORING_STATUS.SELESAI_PULANG ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
            {tabCounts.selesaiPulang}
          </span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab(MONITORING_STATUS.SELESAI_MD); setCurrentPage(1); }}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-2xs ${activeTab === MONITORING_STATUS.SELESAI_MD
            ? 'bg-[#145DA0] text-white'
            : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/90'
            }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Selesai MD</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === MONITORING_STATUS.SELESAI_MD ? 'bg-white/20 text-white' : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
            {tabCounts.selesaiMd}
          </span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab(MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA); setCurrentPage(1); }}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-2xs ${activeTab === MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA
            ? 'bg-[#145DA0] text-white'
            : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/90'
            }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Selesai Tidak Bersedia</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${activeTab === MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-700 border border-stone-200'
            }`}>
            {tabCounts.selesaiTidakBersedia}
          </span>
        </button>
      </div>

      {/* ── 3. FILTER CARD ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-3">
        {/* Top search & reset */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari berdasarkan nama korban, NIK, ID berkas, atau rumah sakit..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0] transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={resetAllFilters}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Filter</span>
          </button>
        </div>

        {/* 4 Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 text-xs">
          {/* 1. Filter RS */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Rumah Sakit
            </label>
            <select
              value={filterHospital}
              onChange={(e) => {
                setFilterHospital(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Rumah Sakit</option>
              {hospitals.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Filter Status Pemantauan (Tepat 4 Kategori Resmi) */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Status Pemantauan
            </label>
            <select
              value={filterMonitoringStatus}
              onChange={(e) => {
                setFilterMonitoringStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Status Pemantauan</option>
              <option value={MONITORING_STATUS.BELUM_DIPANTAU}>Belum Dipantau</option>
              <option value={MONITORING_STATUS.DALAM_PEMANTAUAN}>Dalam Pemantauan</option>
              <option value={MONITORING_STATUS.SELESAI_PULANG}>Selesai Pulang</option>
              <option value={MONITORING_STATUS.SELESAI_MD}>Selesai MD</option>
              <option value={MONITORING_STATUS.SELESAI_TIDAK_BERSEDIA}>Selesai Tidak Bersedia</option>
            </select>
          </div>

          {/* 3. Filter Kondisi Korban */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Kondisi Korban
            </label>
            <select
              value={filterCondition}
              onChange={(e) => {
                setFilterCondition(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Kondisi</option>
              <option value="Masih Dirawat">Masih Dirawat</option>
              <option value="Sudah Pulang">Sudah Pulang</option>
              <option value="Dirujuk">Dirujuk</option>
              <option value="Meninggal Dunia">Meninggal Dunia</option>
            </select>
          </div>

          {/* 4. Filter Keterlambatan Batas Waktu */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Batas Waktu Kunjungan (3 Hari)
            </label>
            <select
              value={filterLateness}
              onChange={(e) => {
                setFilterLateness(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            >
              <option value="ALL">Semua Kategori</option>
              <option value="TERLAMBAT">Terlambat (Lewat Batas Waktu)</option>
              <option value="MENDEKATI">Mendekati Batas Waktu</option>
              <option value="TEPAT_WAKTU">Tepat Waktu</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── 4. TABEL / KARTU UTAMA DAFTAR KORBAN (DUAL RESPONSIVE) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Tampilan Mobile Card (Khusus Layar HP < 768px) */}
        <div className="md:hidden divide-y divide-slate-100">
          {paginated.length === 0 ? (
            <div className="py-12 text-center text-slate-400 p-4">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-600 text-xs">Tidak ada korban yang sesuai dengan kriteria filter.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Coba ubah kata kunci atau reset filter pencarian di atas.</p>
            </div>
          ) : (
            paginated.map((v) => {
              const role = storageService.getOfficerVictimRole(activeOfficerIdent, v);
              const isOrigin = role === 'ORIGIN_OFFICER';
              const isFinished = isVictimFinished(v);
              const refInfo = getReferralPerspectiveInfo(v, filterHospital, currentUser);

              return (
                <div key={v.id} className="p-4 space-y-3 hover:bg-slate-50/70 transition-colors">
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
                          {v.nomorLaporan || (v.nik ? `NIK: ${v.nik}` : `ID: ${v.id}`)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <MonitoringStatusBadge victim={v} size="sm" />
                    </div>
                  </div>

                  <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-100 text-xs space-y-2">
                    <div className="flex items-start gap-1.5 text-slate-700 font-medium">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="block font-semibold text-slate-900">{refInfo.displayHospital}</span>
                        {refInfo.isReferred && refInfo.badgeLabel && (
                          <span className={`text-[10px] ${refInfo.badgeColorClass} px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-1 mt-0.5 shadow-2xs`}>
                            {refInfo.isOriginView ? <ArrowUpRight className="w-3 h-3 shrink-0" /> : <ArrowRight className="w-3 h-3 shrink-0" />}
                            <span>{refInfo.badgeLabel}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Tgl Kecelakaan:</span>
                        <span className="font-semibold text-slate-700 block">
                          {formatDateShort(v.tanggalKecelakaan)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block text-[10px]">Tgl Masuk RS:</span>
                        <span className="font-semibold text-slate-700 block">
                          {formatDateShort(v.tanggalMasukRs || v.tanggalInformasiDiterima)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-0.5">
                    {isOrigin ? (
                      <Link
                        to={`/petugas/korban/${v.id}`}
                        className="w-full py-2 px-3 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Lihat Riwayat (Arsip)</span>
                      </Link>
                    ) : (
                      <>
                        <Link
                          to={`/petugas/korban/${v.id}`}
                          className="flex-1 py-2 px-3 rounded-xl border border-blue-200 bg-blue-50/70 text-[#145DA0] hover:bg-blue-100 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Lihat Detail</span>
                        </Link>

                        {!isFinished && (
                          <button
                            type="button"
                            onClick={() => setSelectedVictimForMonitoring(v)}
                            className="flex-1 py-2 px-3 rounded-xl border border-sky-200 bg-sky-50 text-[#145DA0] hover:bg-sky-100 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                          >
                            <Activity className="w-3.5 h-3.5" />
                            <span>Catat Kunjungan</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Tampilan Desktop Table (Layar Tablet & Laptop >= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50/90 border-b border-slate-200/90">
              <tr>
                <SortableHeader
                  label="#"
                  sortKey="index"
                  currentSortKey={sortConfig.key}
                  currentSortDirection={sortConfig.direction}
                  onSort={handleSort}
                  align="center"
                  className="w-12 text-center"
                />
                <SortableHeader
                  label="Nama Korban"
                  sortKey="namaKorban"
                  currentSortKey={sortConfig.key}
                  currentSortDirection={sortConfig.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Rumah Sakit"
                  sortKey="rumahSakit"
                  currentSortKey={sortConfig.key}
                  currentSortDirection={sortConfig.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Tgl Kecelakaan"
                  sortKey="tglLaka"
                  currentSortKey={sortConfig.key}
                  currentSortDirection={sortConfig.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="TGL Masuk RS"
                  sortKey="tglRegister"
                  currentSortKey={sortConfig.key}
                  currentSortDirection={sortConfig.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="TL Terakhir"
                  sortKey="tlTerakhir"
                  currentSortKey={sortConfig.key}
                  currentSortDirection={sortConfig.direction}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Status"
                  sortKey="status"
                  currentSortKey={sortConfig.key}
                  currentSortDirection={sortConfig.direction}
                  onSort={handleSort}
                  align="center"
                  className="text-center"
                />
                <th className="py-3 px-4 font-bold text-slate-700 uppercase tracking-wider text-[11px] text-right">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">Tidak ada korban yang sesuai dengan kriteria filter pencarian.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Coba ubah kata kunci atau reset filter pencarian di atas.</p>
                  </td>
                </tr>
              ) : (
                paginated.map((v, idx) => {
                  const number = String((currentPage - 1) * PAGE_SIZE + idx + 1).padStart(2, '0');
                  const role = storageService.getOfficerVictimRole(activeOfficerIdent, v);
                  const isOrigin = role === 'ORIGIN_OFFICER';
                  const isFinished = isVictimFinished(v);
                  const tlDateText = getTlTerakhir(v);
                  const refInfo = getReferralPerspectiveInfo(v, filterHospital, currentUser);

                  return (
                    <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* # (NO.) */}
                      <td className="py-3.5 px-3.5 font-mono text-slate-400 text-center font-medium text-xs">
                        {number}
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
                              className="font-bold text-slate-900 hover:text-[#145DA0] hover:underline block text-xs"
                            >
                              {v.nama}
                            </Link>
                            <span className="text-[10px] text-slate-400 font-mono font-normal block">
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
                          {formatDateShort(v.tanggalKecelakaan || v.tgl_laka || v.tanggalInformasiDiterima)}
                        </span>
                      </td>

                      {/* TGL Masuk RS */}
                      <td className="py-3.5 px-3.5 text-slate-700 whitespace-nowrap font-medium text-xs">
                        <span className="text-slate-800 font-medium block">
                          {formatDateShort(v.tanggalMasukRs || v.tanggalInformasiDiterima)}
                        </span>
                      </td>

                      {/* TL Terakhir */}
                      <td className="py-3.5 px-3.5 text-slate-800 whitespace-nowrap text-xs">
                        <span className="text-slate-800 font-medium block">
                          {tlDateText}
                        </span>
                      </td>

                      {/* Status (4 Kategori Resmi: Selesai jika pulang/MD) */}
                      <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                        <MonitoringStatusBadge victim={v} size="sm" />
                      </td>

                      {/* Aksi: Jika korban Pulang/Selesai, tidak bisa catat pemantauan lagi */}
                      <td className="py-3.5 px-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isOrigin ? (
                            <Link
                              to={`/petugas/korban/${v.id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors shadow-2xs"
                              title="Lihat riwayat penanganan hingga rujukan (Arsip)"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Lihat Riwayat</span>
                            </Link>
                          ) : isFinished ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 shadow-2xs">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Selesai</span>
                              </span>
                              <Link
                                to={`/petugas/korban/${v.id}`}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                                title="Lihat Detail Korban"
                              >
                                <Eye className="w-4 h-4 text-slate-600" />
                              </Link>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setSelectedVictimForMonitoring(v)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-[#145DA0] hover:bg-sky-100 border border-sky-200 transition-colors cursor-pointer"
                                title="Lakukan kunjungan/pemantauan pada korban ini"
                              >
                                <Activity className="w-3.5 h-3.5" />
                                <span>Catat Kunjungan</span>
                              </button>

                              <Link
                                to={`/petugas/korban/${v.id}`}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                                title="Lihat Detail Korban"
                              >
                                <Eye className="w-4 h-4 text-slate-600" />
                              </Link>
                            </>
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

        {/* Pagination */}
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
              dari <span className="font-semibold text-slate-700">{filtered.length}</span> korban
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

      {/* Modal Input Korban Baru */}
      {isInputModalOpen && (
        <FormInputKorbanModal
          isOpen={isInputModalOpen}
          onClose={() => setIsInputModalOpen(false)}
          onSuccess={() => {
            loadData();
            setIsInputModalOpen(false);
          }}
        />
      )}

      {/* Modal Form Pemantauan */}
      {selectedVictimForMonitoring && (
        <FormPemantauanModal
          isOpen={!!selectedVictimForMonitoring}
          onClose={() => setSelectedVictimForMonitoring(null)}
          victim={selectedVictimForMonitoring}
          onMonitoringSaved={() => {
            loadData();
            setSelectedVictimForMonitoring(null);
          }}
        />
      )}
    </div>
  );
}
