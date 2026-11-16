import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  calculateMonitoringSla, 
  getVictimDeadline, 
  compareByDeadlinePriority 
} from '../../services/slaService';
import SlaBadge from '../../components/common/SlaBadge';
import ConditionBadge from '../../components/common/ConditionBadge';
import MonitoringStatusBadge from '../../components/common/MonitoringStatusBadge';
import FormPemantauanModal from '../../components/petugas/FormPemantauanModal';
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
  CheckCircle2
} from 'lucide-react';

function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatDateTimeShort(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return (
      d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) +
      ' WIB'
    );
  } catch {
    return dateStr;
  }
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
  const [conditionFilter, setConditionFilter] = useState('ALL');
  const [careCategoryFilter, setCareCategoryFilter] = useState('ALL');
  const [slaFilter, setSlaFilter] = useState('ALL');

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
    const cleanTarget = targetRs.toLowerCase().trim();
    return officerHospitals.some(
      (h) => h === cleanTarget || (cleanTarget.length >= 4 && (h.includes(cleanTarget) || cleanTarget.includes(h)))
    );
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

  // Update URL param saat tab berubah
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // 1. Tab Pemantauan Aktif (hanya pasien yang masih aktif dirawat di RS petugas dan BELUM dirujuk keluar)
  const activeMonitoringVictims = useMemo(() => {
    return victims.filter((v) => {
      const isReferredOut =
        (typeof v.kondisiTerakhir === 'string' && v.kondisiTerakhir.startsWith('Dirujuk')) ||
        (typeof v.statusPemantauan === 'string' && v.statusPemantauan.startsWith('Dirujuk'));
      const isPendingIncoming = v.isRujukanMasuk === true && !v.rujukanAccepted;
      if (isReferredOut || isPendingIncoming) return false;

      return (
        v.statusPemantauan === 'Pemantauan Aktif' ||
        v.statusPemantauan === 'Menunggu Konfirmasi Kondisi' ||
        v.kondisiTerakhir === 'Masih Dirawat' ||
        v.kondisiTerakhir === 'Rawat Inap'
      );
    });
  }, [victims]);

  // 2. Tab Pasien Rujukan Masuk (korban dari RS lain yang dirujuk ke RS petugas ini)
  const incomingReferralVictims = useMemo(() => {
    const officerName = (currentUser?.profile?.nama || '').toLowerCase();
    return victims.filter((v) => {
      const isTargetOfficer = v.petugasTujuanId === officerId || (officerName && v.petugasTujuanNama?.toLowerCase() === officerName);
      const isTargetHospital = isHospitalMatched(v.rumahSakitTujuan);
      const isDestForMe = isTargetOfficer || isTargetHospital;

      return isDestForMe && (v.isRujukanMasuk === true || (v.statusPerawatan === 'Rujukan' && !v.rujukanAccepted));
    });
  }, [victims, officerId, currentUser, officerHospitals]);

  // 3. Tab Pasien Dirujuk Keluar (korban yang sebelumnya di RS petugas ini dan telah dirujuk ke RS lain)
  const outgoingReferralVictims = useMemo(() => {
    const officerName = (currentUser?.profile?.nama || '').toLowerCase();
    return victims.filter((v) => {
      const isOriginOfficer =
        v.petugasAsalId === officerId ||
        (officerName && v.petugasAsalNama?.toLowerCase() === officerName) ||
        isHospitalMatched(v.rumahSakitAsal);

      const isReferredStatus =
        (typeof v.kondisiTerakhir === 'string' && v.kondisiTerakhir.startsWith('Dirujuk')) ||
        (typeof v.statusPemantauan === 'string' && v.statusPemantauan.startsWith('Dirujuk')) ||
        Boolean(v.rumahSakitTujuan && v.rumahSakitTujuan !== (v.rumahSakitAsal || v.rumahSakit));

      return isOriginOfficer && isReferredStatus;
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

      const matchSearch =
        v.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.rumahSakit.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.rumahSakitTujuan && v.rumahSakitTujuan.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (v.nik && v.nik.includes(searchTerm));
      if (!matchSearch) return false;

      if (hospitalFilter !== 'ALL' && v.rumahSakit !== hospitalFilter && v.rumahSakitTujuan !== hospitalFilter) {
        return false;
      }
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

    // Urutkan data pemantauan otomatis berdasarkan prioritas tenggat waktu
    const now = new Date();
    return list.sort((a, b) => {
      const deadA = getVictimDeadline(a, now);
      const deadB = getVictimDeadline(b, now);
      return compareByDeadlinePriority(deadA, deadB, now);
    });
  }, [tabDataset, searchTerm, hospitalFilter, conditionFilter, careCategoryFilter, slaFilter]);

  const handleOpenMonitoringModal = (victim) => {
    if (victim.isRujukanMasuk && !victim.rujukanAccepted) {
      storageService.acceptRujukan(victim.id, currentUser?.profile);
      const updated = storageService.getVictimById(victim.id);
      setSelectedVictimForMonitoring(updated || victim);
    } else {
      setSelectedVictimForMonitoring(victim);
    }
  };

  // Helper render badge status seragam (titik berwarna tanpa badge bertumpuk)
  const renderStatusBadge = (v) => {
    const isDischarged =
      v.kondisiTerakhir === 'Sudah Pulang' ||
      v.kondisiTerakhir === 'Pulang' ||
      v.kondisiTerakhir === 'Selesai' ||
      v.statusPemantauan === 'Selesai Dipantau';

    const isReferred =
      (typeof v.kondisiTerakhir === 'string' && v.kondisiTerakhir.startsWith('Dirujuk')) ||
      (typeof v.statusPemantauan === 'string' && v.statusPemantauan.startsWith('Dirujuk')) ||
      v.statusPerawatan === 'Rujukan';

    const isNeedAction =
      v.statusTindakLanjut === 'Masih Perlu Ditindaklanjuti' ||
      v.kondisiTerakhir === 'Masih Dirawat' ||
      v.kondisiTerakhir === 'Rawat Inap';

    if (isDischarged) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>Selesai</span>
        </span>
      );
    }

    if (isReferred) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          <span>Dirujuk</span>
        </span>
      );
    }

    if (v.statusPerawatan === 'Rawat Lanjutan' || v.isRawatLanjutan) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
          <span>Rawatan Lanjutan</span>
        </span>
      );
    }

    if (v.kondisiTerakhir === 'Meninggal Dunia' || v.kondisiTerakhir === 'Meninggal') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          <span>Meninggal</span>
        </span>
      );
    }

    if (isNeedAction) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          <span>Masih Dirawat</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
        <span>{v.kondisiTerakhir || 'Observasi'}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Pemantauan Berkala Korban</h1>
          <p className="text-xs text-slate-500 mt-1">
            Monitoring kondisi korban secara berkelanjutan dan penanganan pasien rujukan antar-rumah sakit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-sky-50 text-sky-800 border border-sky-200/80 shadow-2xs">
            {activeMonitoringVictims.length} Pemantauan Aktif
          </span>
          {incomingReferralVictims.length > 0 && (
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-purple-100 text-purple-800 border border-purple-300 animate-pulse shadow-2xs">
              {incomingReferralVictims.length} Rujukan Masuk
            </span>
          )}
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
              ? 'bg-purple-700 text-white shadow-2xs'
              : 'bg-white text-purple-800 hover:bg-purple-50 border border-purple-200/90'
          }`}
        >
          <ArrowUpRight className="w-4 h-4 text-purple-300" />
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
              ? 'bg-slate-800 text-white shadow-2xs'
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
              ? 'bg-slate-700 text-white shadow-2xs'
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
              placeholder="Cari berdasarkan nama korban, NIK, atau rumah sakit..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <select
              value={hospitalFilter}
              onChange={(e) => setHospitalFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-slate-700 flex-1 sm:flex-initial"
            >
              <option value="ALL">Semua Rumah Sakit</option>
              {hospitals.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
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
              <option value="ALL">Semua Status SLA</option>
              <option value="TERLAMBAT">Terlambat</option>
              <option value="MENDEKATI">Mendekati Tenggat</option>
              <option value="TEPAT_WAKTU">Tepat Waktu</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setHospitalFilter('ALL');
                setConditionFilter('ALL');
                setCareCategoryFilter('ALL');
                setSlaFilter('ALL');
              }}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer shrink-0"
              title="Reset Filter"
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
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/90 text-slate-500 font-semibold uppercase text-[11px] tracking-wider">
                <th className="py-3 px-4">Nama Korban</th>
                <th className="py-3 px-4">
                  {activeTab === 'rujukan_keluar' ? 'Faskes Asal & Rujukan Tujuan' : (activeTab === 'rujukan_masuk' ? 'RS Rujukan & RS Asal' : 'Rumah Sakit')}
                </th>
                <th className="py-3 px-4">
                  {activeTab === 'rujukan_keluar' || activeTab === 'rujukan_masuk' ? 'Tanggal Rujukan' : 'Tgl Masuk RS'}
                </th>
                <th className="py-3 px-4">Status Pasien</th>
                <th className="py-3 px-4">SLA Pemantauan</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
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
                filtered.map((v) => {
                  const monSla = calculateMonitoringSla(v);
                  const isIncoming = v.isRujukanMasuk === true;
                  const isReferredOut = typeof v.kondisiTerakhir === 'string' && v.kondisiTerakhir.startsWith('Dirujuk');

                  const initials = (v.nama || 'K')
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Nama & NIK dengan Avatar Circle */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-[#145DA0] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                            {initials}
                          </div>
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
                        </div>
                      </td>

                      {/* Rumah Sakit & Jalur Rujukan */}
                      <td className="py-3.5 px-4 text-slate-800 font-medium whitespace-nowrap">
                        {v.rumahSakitTujuan ? (
                          <div>
                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                              <span>{v.rumahSakitAsal || v.rumahSakit}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span className="text-purple-900">{v.rumahSakitTujuan}</span>
                            </div>
                            {isIncoming ? (
                              <span className="text-[10px] text-purple-700 font-bold block mt-0.5">
                                Menunggu konfirmasi pemantauan di {v.rumahSakitTujuan}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                                Dirujuk ke {v.rumahSakitTujuan}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{v.rumahSakit}</span>
                            {v.rumahSakitAsal && v.rumahSakitAsal !== v.rumahSakit && (
                              <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 font-semibold block">
                                Rujukan dari {v.rumahSakitAsal}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Tanggal Rujukan / Tanggal Masuk */}
                      <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap font-medium">
                        {v.tanggalRujukan ? (
                          <div>
                            <span className="font-bold text-purple-900 block">
                              {formatDateShort(v.tanggalRujukan)}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              Tgl Rujukan
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span>{formatDateShort(v.tanggalMasukRs || v.tanggalInformasiDiterima)}</span>
                          </div>
                        )}
                      </td>

                      {/* Status Pasien (Single Dot Badge Seragam) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusBadge(v)}
                      </td>

                      {/* Status SLA */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <SlaBadge slaInfo={monSla} />
                      </td>

                      {/* Aksi */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isIncoming ? (
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
                              <span>Catat Pemantauan</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic px-2 py-1">
                              Dirujuk Keluar
                            </span>
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
              const isIncoming = v.isRujukanMasuk === true;
              const isReferredOut = typeof v.kondisiTerakhir === 'string' && v.kondisiTerakhir.startsWith('Dirujuk');
              const initials = (v.nama || 'K')
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

              return (
                <div key={v.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-50 text-[#145DA0] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                        {initials}
                      </div>
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
                    </div>
                    <div className="shrink-0">
                      {renderStatusBadge(v)}
                    </div>
                  </div>

                  {/* Faskes & Tanggal */}
                  <div className="bg-slate-50 rounded-xl p-2.5 text-[11px] text-slate-600 space-y-1 border border-slate-100">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {v.rumahSakitTujuan ? (
                        <span className="truncate">
                          {v.rumahSakitAsal || v.rumahSakit} → <strong className="text-purple-900">{v.rumahSakitTujuan}</strong>
                        </span>
                      ) : (
                        <span className="truncate">{v.rumahSakit}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                      <span>{v.tanggalRujukan ? `Tgl Rujukan: ${formatDateShort(v.tanggalRujukan)}` : `Masuk RS: ${formatDateShort(v.tanggalMasukRs || v.tanggalInformasiDiterima)}`}</span>
                      <SlaBadge slaInfo={monSla} />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    {isIncoming ? (
                      <button
                        type="button"
                        onClick={() => handleOpenMonitoringModal(v)}
                        className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Activity className="w-3.5 h-3.5" />
                        <span>Lanjutkan Pemantauan</span>
                      </button>
                    ) : !isReferredOut ? (
                      <button
                        type="button"
                        onClick={() => handleOpenMonitoringModal(v)}
                        className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-sky-50 text-[#145DA0] hover:bg-sky-100 border border-sky-200 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Activity className="w-3.5 h-3.5" />
                        <span>Catat Pemantauan</span>
                      </button>
                    ) : (
                      <span className="flex-1 text-[11px] text-slate-400 italic text-center py-1">
                        Dirujuk Keluar
                      </span>
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
