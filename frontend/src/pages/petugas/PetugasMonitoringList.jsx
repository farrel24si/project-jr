import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  calculateMonitoringSla, 
  getVictimDeadline, 
  compareByDeadlinePriority,
  compareVictimsBySlaPriority
} from '../../services/slaService';
import { formatDateIndo, formatDateTimeIndo } from '../../utils/dateUtils';
import { getReferralPerspectiveInfo, matchesHospitalFilter, isSameHospital } from '../../utils/referralUtils';
import SlaBadge from '../../components/common/SlaBadge';
import ConditionBadge from '../../components/common/ConditionBadge';
import MonitoringStatusBadge from '../../components/common/MonitoringStatusBadge';
import {
  MONITORING_STATUS,
  getMonitoringStatus,
  isVictimFinished,
  canRecordVisit
} from '../../utils/monitoringStatus';
import FormPemantauanModal from '../../components/petugas/FormPemantauanModal';
import SortableHeader from '../../components/common/SortableHeader';
import {
  CalendarCheck,
  Search,
  Activity,
  Eye,
  RotateCcw,
  ArrowUpRight,
  ArrowRight,
  Building2,
  Calendar,
  Clock,
  UserCheck,
  CheckCircle2,
  Users,
  Filter,
  ArrowUpDown
} from 'lucide-react';

function formatDateShort(dateStr) {
  return formatDateIndo(dateStr);
}

function formatDateTimeShort(dateStr) {
  return formatDateTimeIndo(dateStr);
}

function getTlTerakhir(v) {
  const lastDate =
    v.tanggalKunjunganTerakhir ||
    v.waktuPemantauanTerakhir ||
    v.tanggalPemantauanTerakhir ||
    v.kunjunganPertama?.waktuAktualKunjungan ||
    v.kunjunganPertama?.tanggalKunjungan ||
    v.kunjunganPertama?.tanggal;

  const count = Array.isArray(v.riwayatAktivitas)
    ? v.riwayatAktivitas.filter((a) => a.statusKunjungan !== 'Menunggu').length
    : (v.kunjunganPertama ? 1 : 0);

  if (!lastDate) {
    return {
      dateText: 'Belum Ada',
      subText: 'Menunggu Kunjungan'
    };
  }

  return {
    dateText: formatDateShort(lastDate),
    subText: count > 0 ? `Kunjungan ke-${count}` : 'Kunjungan Awal'
  };
}

export default function PetugasMonitoringList() {
  const { currentUser } = useAuth();
  const officerId = currentUser?.profile?.id || 'PET-01';
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get('tab') || 'active';
  const [activeTab, setActiveTab] = useState(initialTab); // 'active' | 'rujukan_masuk' | 'rujukan_keluar' | 'semua'

  const [victims, setVictims] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [conditionFilter, setConditionFilter] = useState('ALL');
  const [careCategoryFilter, setCareCategoryFilter] = useState('ALL');
  const [slaFilter, setSlaFilter] = useState('ALL');
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

  const [selectedVictimForMonitoring, setSelectedVictimForMonitoring] = useState(null);

  // Dapatkan plotting rumah sakit petugas ini jika ada
  const officerHospitals = useMemo(() => {
    const officerName = (currentUser?.profile?.nama || '').toLowerCase();
    const allOfficers = storageService.getOfficers();
    const currentOfficerData = allOfficers.find(
      (o) => o.id === officerId || (o.nama && o.nama.toLowerCase() === officerName)
    );
    const rawPlotting = (Array.isArray(currentOfficerData?.plottingRs) && currentOfficerData.plottingRs.length > 0)
      ? currentOfficerData.plottingRs
      : (Array.isArray(currentUser?.profile?.plottingRs) ? currentUser.profile.plottingRs : []);
    return rawPlotting.map((rs) => (rs || '').toLowerCase().trim());
  }, [officerId, currentUser]);

  const isHospitalMatched = (targetRs) => {
    if (!targetRs) return false;
    return officerHospitals.some((h) => isSameHospital(h, targetRs));
  };

  const loadData = () => {
    const activeOfficerIdent = officerId || currentUser?.profile?.id || currentUser?.profile?.backendOfficerId || currentUser?.profile?.nama;
    const myVictims = storageService.getVictimsByOfficer(activeOfficerIdent);
    setVictims(myVictims);
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
  }, [officerId, officerHospitals]);

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
    } catch (e) {}
  }, [victims, selectedVictimForMonitoring]);

  // Update URL param saat tab berubah
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // 1. Tab Pemantauan Aktif (hanya pasien yang masih aktif dirawat di RS petugas dan BELUM dirujuk keluar)
  const activeMonitoringVictims = useMemo(() => {
    return victims.filter((v) => {
      // Pasien selesai (Pulang / Meninggal Dunia) otomatis keluar dari antrean pemantauan aktif
      if (isVictimFinished(v)) return false;

      const refInfo = getReferralPerspectiveInfo(v, null, currentUser);

      // Pasien yang sudah dirujuk keluar dari RS petugas ini tidak dipantau di RS ini lagi
      if (refInfo.isReferred && refInfo.isOriginView) return false;

      // Pasien rujukan masuk yang belum diterima masuk ke tab rujukan masuk terlebih dahulu
      const isPendingIncoming = v.isRujukanMasuk === true && !v.rujukanAccepted;
      if (isPendingIncoming) return false;

      // Seluruh korban yang masih menjalani rawat inap aktif di faskes petugas ini
      return true;
    });
  }, [victims, currentUser]);

  // 2. Tab Pasien Rujukan Masuk (korban dari RS lain yang dirujuk ke RS petugas ini)
  const incomingReferralVictims = useMemo(() => {
    return victims.filter((v) => {
      if (isVictimFinished(v)) return false;
      const refInfo = getReferralPerspectiveInfo(v, null, currentUser);

      // Terdaftar sebagai rujukan dan faskes petugas ini adalah faskes penerima / tujuan
      if (refInfo.isReferred && refInfo.isDestinationView) return true;

      const isTargetOfficer = v.petugasTujuanId === officerId || (currentUser?.profile?.nama && v.petugasTujuanNama?.toLowerCase() === currentUser.profile.nama.toLowerCase());
      const isTargetHospital = isHospitalMatched(refInfo.rsTujuan || v.rumahSakitTujuan || v.rumahSakit);

      return (isTargetOfficer || isTargetHospital) && (refInfo.isReferred || v.isRujukanMasuk === true || v.statusPerawatan === 'Rujukan');
    });
  }, [victims, officerId, currentUser, officerHospitals]);

  // 3. Tab Pasien Dirujuk Keluar (korban yang sebelumnya di RS petugas ini dan telah dirujuk ke RS lain)
  const outgoingReferralVictims = useMemo(() => {
    return victims.filter((v) => {
      const refInfo = getReferralPerspectiveInfo(v, null, currentUser);

      // Terdaftar sebagai rujukan dan faskes petugas ini adalah faskes pengirim / asal
      if (refInfo.isReferred && refInfo.isOriginView) return true;

      const isOriginOfficer = v.petugasAsalId === officerId || (currentUser?.profile?.nama && v.petugasAsalNama?.toLowerCase() === currentUser.profile.nama.toLowerCase());
      const isOriginHospital = isHospitalMatched(refInfo.rsAsal || v.rumahSakitAsal);

      return (isOriginOfficer || isOriginHospital) && refInfo.isReferred;
    });
  }, [victims, officerId, currentUser, officerHospitals]);

  // Kumpulan korban berdasarkan tab aktif
  const tabDataset = useMemo(() => {
    if (activeTab === 'rujukan_masuk') return incomingReferralVictims;
    if (activeTab === 'rujukan_keluar') return outgoingReferralVictims;
    if (activeTab === 'active') return activeMonitoringVictims;
    return victims;
  }, [activeTab, incomingReferralVictims, outgoingReferralVictims, activeMonitoringVictims, victims]);

  const hospitals = useMemo(() => {
    return Array.from(new Set(tabDataset.map((v) => v.rumahSakit))).filter(Boolean);
  }, [tabDataset]);

  const filtered = useMemo(() => {
    const list = tabDataset.filter((v) => {
      const monSla = calculateMonitoringSla(v);
      const stOfficial = getMonitoringStatus(v);
      const regNo = String(v.nomorLaporan || v.nomorTiket || v.noRegister || v.caseId || '');

      const matchSearch =
        v.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.rumahSakit.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.rumahSakitAsal && v.rumahSakitAsal.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (v.rumahSakitTujuan && v.rumahSakitTujuan.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (v.nik && v.nik.includes(searchTerm)) ||
        regNo.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchSearch) return false;

      if (hospitalFilter !== 'ALL' && !matchesHospitalFilter(v, hospitalFilter)) {
        return false;
      }
      if (statusFilter !== 'ALL' && stOfficial !== statusFilter) return false;
      if (conditionFilter !== 'ALL' && v.kondisiTerakhir !== conditionFilter) return false;
      if (careCategoryFilter !== 'ALL') {
        const cat = v.statusPerawatan || (v.kondisiTerakhir === 'Sudah Pulang' ? 'Pulang' : v.kondisiTerakhir);
        if (cat !== careCategoryFilter) return false;
      }

      if (slaFilter === 'TERLAMBAT' && monSla.status !== 'TERLAMBAT') return false;
      if (slaFilter === 'MENDEKATI' && monSla.status !== 'MENDEKATI_TENGGAT') return false;
      if (slaFilter === 'TEPAT_WAKTU' && monSla.status !== 'TEPAT_WAKTU') return false;

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
  }, [tabDataset, searchTerm, hospitalFilter, statusFilter, conditionFilter, careCategoryFilter, slaFilter, sortConfig]);

  const handleOpenMonitoringModal = (victim) => {
    if (!victim || isVictimFinished(victim)) return;
    if (!victim.isRawatLanjutan && victim.isRujukanMasuk && !victim.rujukanAccepted) {
      storageService.acceptRujukan(victim.id, currentUser?.profile);
      const updated = storageService.getVictimById(victim.id);
      setSelectedVictimForMonitoring(updated || victim);
    } else {
      setSelectedVictimForMonitoring(victim);
    }
  };

  // Helper render badge status (4 Kategori Resmi)
  const renderStatusBadge = (v) => {
    return <MonitoringStatusBadge victim={v} size="sm" />;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Pemantauan Berkala Korban</h1>
          <p className="text-xs text-slate-500 mt-1">
            Monitoring kondisi korban secara berkelanjutan dan penanganan pasien rujukan antar-rumah sakit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-sky-50 text-sky-800 border border-sky-200/80 shadow-2xs">
            {activeMonitoringVictims.length} Pemantauan Aktif
          </span>
          {incomingReferralVictims.length > 0 && (
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 shadow-2xs">
              {incomingReferralVictims.length} Rujukan Masuk
            </span>
          )}
        </div>
      </div>

      {/* 4 Stat Cards Ringkasan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pemantauan Aktif</span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-[#145DA0] border border-sky-100 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-slate-900 block mt-2">
            {activeMonitoringVictims.length}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rujukan Masuk</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-purple-700 block mt-2">
            {incomingReferralVictims.length}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rujukan Keluar</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-slate-900 block mt-2">
            {outgoingReferralVictims.length}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Kasus</span>
            <div className="w-9 h-9 rounded-xl bg-slate-50 text-slate-600 border border-slate-200 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight text-slate-900 block mt-2">
            {victims.length}
          </span>
        </div>
      </div>

      {/* ── TAB PILIHAN MONITORING & RUJUKAN ── */}
      <div className="flex items-center gap-2 border-b border-slate-200/90 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => handleTabChange('active')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'active'
              ? 'bg-[#145DA0] text-white shadow-2xs'
              : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/90'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Pemantauan Aktif RS</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            activeTab === 'active' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {activeMonitoringVictims.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('rujukan_masuk')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'rujukan_masuk'
              ? 'bg-[#145DA0] text-white shadow-2xs'
              : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/90'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>Pasien Rujukan Masuk</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            activeTab === 'rujukan_masuk' ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-800'
          }`}>
            {incomingReferralVictims.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('rujukan_keluar')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'rujukan_keluar'
              ? 'bg-[#145DA0] text-white shadow-2xs'
              : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/90'
          }`}
        >
          <ArrowRight className="w-4 h-4" />
          <span>Pasien Dirujuk Keluar</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            activeTab === 'rujukan_keluar' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {outgoingReferralVictims.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('semua')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'semua'
              ? 'bg-[#145DA0] text-white shadow-2xs'
              : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/90'
          }`}
        >
          <span>Semua Pasien ({victims.length})</span>
        </button>
      </div>

      {/* Filter Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari No Register, nama korban, NIK, atau asal RS..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <select
              value={hospitalFilter}
              onChange={(e) => setHospitalFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-slate-700 flex-1 sm:flex-initial"
            >
              <option value="ALL">Semua Asal / RS</option>
              {hospitals.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-slate-700 flex-1 sm:flex-initial font-medium"
            >
              <option value="ALL">Semua Status</option>
              <option value={MONITORING_STATUS.MENUNGGU_KUNJUNGAN}>Menunggu Kunjungan</option>
              <option value={MONITORING_STATUS.DALAM_PEMANTAUAN}>Dalam Pemantauan</option>
              <option value={MONITORING_STATUS.MENUNGGU_TINDAK_LANJUT}>Menunggu Tindak Lanjut</option>
              <option value={MONITORING_STATUS.SELESAI}>Selesai (Pulang / MD)</option>
            </select>

            <select
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-slate-700 flex-1 sm:flex-initial"
            >
              <option value="ALL">Semua Kondisi</option>
              <option value="Masih Dirawat">Masih Dirawat</option>
              <option value="Dirujuk">Dirujuk</option>
              <option value="Sudah Pulang">Sudah Pulang</option>
              <option value="Meninggal Dunia">Meninggal Dunia</option>
            </select>

            <select
              value={slaFilter}
              onChange={(e) => setSlaFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-slate-700 flex-1 sm:flex-initial"
            >
              <option value="ALL">Semua Batas Waktu</option>
              <option value="TERLAMBAT">Terlambat</option>
              <option value="MENDEKATI">Mendekati Tenggat</option>
              <option value="TEPAT_WAKTU">Tepat Waktu</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setHospitalFilter('ALL');
                setStatusFilter('ALL');
                setConditionFilter('ALL');
                setCareCategoryFilter('ALL');
                setSlaFilter('ALL');
                setSortConfig({ key: null, direction: 'asc' });
              }}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer shrink-0"
              title="Reset Filter & Pengurutan"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── TABEL DATA PEMANTAUAN / RUJUKAN (DUAL RESPONSIVE) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* DESKTOP TABLE VIEW */}
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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    {activeTab === 'rujukan_masuk' ? (
                      <div>
                        <ArrowUpRight className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-semibold text-slate-600">Tidak ada pasien rujukan masuk saat ini.</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Pasien yang dirujuk dari rumah sakit lain ke faskes Anda akan tampil di sini.</p>
                      </div>
                    ) : activeTab === 'rujukan_keluar' ? (
                      <div>
                        <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-semibold text-slate-600">Belum ada pasien yang dirujuk ke rumah sakit lain.</p>
                      </div>
                    ) : (
                      'Tidak ada korban yang saat ini memerlukan pemantauan berkala lanjutan.'
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((v, idx) => {
                  const monSla = calculateMonitoringSla(v);
                  const refInfo = getReferralPerspectiveInfo(v, hospitalFilter, currentUser);
                  const isIncoming = refInfo.isReferred && refInfo.isDestinationView;
                  const isReferredOut = refInfo.isReferred && refInfo.isOriginView;
                  const isFinished = isVictimFinished(v);
                  const tlInfo = getTlTerakhir(v);

                  const initials = (v.nama || 'K')
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* # (Nomor Urut) */}
                      <td className="py-3.5 px-3.5 font-mono text-slate-400 text-center font-medium text-xs">
                        {String(idx + 1).padStart(2, '0')}
                      </td>

                      {/* Nama Korban */}
                      <td className="py-3.5 px-3.5 font-bold text-slate-900 whitespace-nowrap text-xs">
                        <div>
                          <Link
                            to={`/petugas/korban/${v.id}`}
                            className="hover:text-[#145DA0] hover:underline block font-bold text-slate-900 text-xs"
                          >
                            {v.nama}
                          </Link>
                          <span className="text-[10px] text-slate-400 font-mono font-normal block">
                            NIK: {v.nik || '—'}
                          </span>
                        </div>
                      </td>

                      {/* Rumah Sakit (Sesuai Sudut Pandang Faskes Penangan) */}
                      <td className="py-3.5 px-3.5 text-slate-800 font-medium whitespace-nowrap text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{refInfo.displayHospital}</span>
                        </div>
                        {refInfo.isReferred && refInfo.badgeLabel && (
                          <span className={`text-[10px] ${refInfo.badgeColorClass} px-1.5 py-0.5 rounded border font-semibold inline-block mt-0.5 shadow-2xs`}>
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

                      {/* TL Terakhir (Tindak Lanjut / Kunjungan Terakhir) */}
                      <td className="py-3.5 px-3.5 text-slate-800 whitespace-nowrap text-xs">
                        <span className="text-slate-800 font-medium block">
                          {tlInfo.dateText}
                        </span>
                      </td>

                      {/* Status (4 Kategori Resmi: Selesai jika pulang/MD) */}
                      <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                        {renderStatusBadge(v)}
                      </td>

                      {/* Aksi: Jika korban Pulang/Selesai, tidak bisa catat pemantauan lagi */}
                      <td className="py-3.5 px-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isFinished ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 shadow-2xs">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Selesai</span>
                            </span>
                          ) : (
                            isIncoming ? (
                              <button
                                type="button"
                                onClick={() => handleOpenMonitoringModal(v)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white shadow-2xs transition-colors cursor-pointer"
                              >
                                <Activity className="w-3.5 h-3.5" />
                                <span>Lanjutkan Pemantauan</span>
                              </button>
                            ) : !isReferredOut ? (
                              <button
                                type="button"
                                onClick={() => handleOpenMonitoringModal(v)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-[#145DA0] hover:bg-sky-100 border border-sky-200 transition-colors cursor-pointer"
                              >
                                <Activity className="w-3.5 h-3.5" />
                                <span>Catat Kunjungan</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic px-2 py-1">
                                Dirujuk Keluar
                              </span>
                            )
                          )}

                          <Link
                            to={`/petugas/korban/${v.id}`}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                            title="Lihat Detail Korban"
                          >
                            <Eye className="w-4 h-4" />
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
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <p className="font-semibold text-slate-600 text-xs">Tidak ada data pemantauan yang sesuai.</p>
            </div>
          ) : (
            filtered.map((v) => {
              const monSla = calculateMonitoringSla(v);
              const refInfo = getReferralPerspectiveInfo(v, hospitalFilter, currentUser);
              const isIncoming = refInfo.isReferred && refInfo.isDestinationView;
              const isReferredOut = refInfo.isReferred && refInfo.isOriginView;
              const isFinished = isVictimFinished(v);
              const initials = (v.nama || 'K')
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

              return (
                <div key={v.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0">
                      <Link
                        to={`/petugas/korban/${v.id}`}
                        className="font-bold text-slate-900 text-xs hover:text-[#145DA0] truncate block"
                      >
                        {v.nama}
                      </Link>
                      <span className="text-[10px] text-slate-400 font-mono block">
                        NIK: {v.nik || '—'}
                      </span>
                    </div>
                    <div className="shrink-0">
                      {renderStatusBadge(v)}
                    </div>
                  </div>

                  {/* Faskes & Tanggal */}
                  <div className="bg-slate-50 rounded-xl p-2.5 text-[11px] text-slate-600 space-y-1 border border-slate-100">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{refInfo.displayHospital}</span>
                    </div>
                    {refInfo.isReferred && refInfo.badgeLabel && (
                      <span className={`text-[10px] ${refInfo.badgeColorClass} px-1.5 py-0.5 rounded border font-semibold inline-block shadow-2xs`}>
                        {refInfo.badgeLabel}
                      </span>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                      <span>{v.tanggalRujukan ? `Tgl Rujukan: ${formatDateShort(v.tanggalRujukan)}` : `Masuk RS: ${formatDateShort(v.tanggalMasukRs || v.tanggalInformasiDiterima)}`}</span>
                      <SlaBadge slaInfo={monSla} />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    {!isFinished && (
                      isIncoming ? (
                        <button
                          type="button"
                          onClick={() => handleOpenMonitoringModal(v)}
                          className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <Activity className="w-3.5 h-3.5" />
                          <span>Catat Kunjungan RS</span>
                        </button>
                      ) : !isReferredOut ? (
                        <button
                          type="button"
                          onClick={() => handleOpenMonitoringModal(v)}
                          className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-sky-50 text-[#145DA0] hover:bg-sky-100 border border-sky-200 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Activity className="w-3.5 h-3.5" />
                          <span>Catat Kunjungan</span>
                        </button>
                      ) : (
                        <span className="flex-1 text-[11px] text-slate-400 italic text-center py-1">
                          Dirujuk Keluar
                        </span>
                      )
                    )}

                    <Link
                      to={`/petugas/korban/${v.id}`}
                      className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 shrink-0"
                      title="Lihat Detail Korban"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal Form Pemantauan */}
      {selectedVictimForMonitoring && (
        <FormPemantauanModal
          isOpen={!!selectedVictimForMonitoring}
          onClose={() => setSelectedVictimForMonitoring(null)}
          victim={selectedVictimForMonitoring}
          onMonitoringSaved={() => loadData()}
        />
      )}
    </div>
  );
}
