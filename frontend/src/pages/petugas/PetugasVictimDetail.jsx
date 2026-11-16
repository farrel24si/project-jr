import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';
import { useAuth } from '../../context/AuthContext';
import FormPemantauanModal from '../../components/petugas/FormPemantauanModal';
import ModalDetailKunjunganReadOnly from '../../components/petugas/ModalDetailKunjunganReadOnly';
import AuthenticatedImage from '../../components/common/AuthenticatedImage';
import RiwayatPerawatanTimeline, { resolveReferralHospitals } from '../../components/common/RiwayatPerawatanTimeline';
import PatientTransitionModal from '../../components/petugas/PatientTransitionModal';
import { cleanPhoneNumber, cleanSumberInformasi } from '../../services/backendMapper';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Calendar,
  Clock,
  AlertOctagon,
  PlusCircle,
  Activity,
  User,
  Info,
  ShieldAlert,
  Trash2,
  X
} from 'lucide-react';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return (
      d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) +
      ', ' +
      d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) +
      ' WIB'
    );
  } catch {
    return dateStr;
  }
}

function getLastVisitTimestamp(v) {
  if (!v) return null;
  if (Array.isArray(v.riwayatAktivitas) && v.riwayatAktivitas.length > 0) {
    const sorted = [...v.riwayatAktivitas].sort((a, b) => {
      const da = new Date(a.waktuAktualKunjungan || a.tanggalKunjungan || a.tanggal || a.waktuFoto || 0).getTime();
      const db = new Date(b.waktuAktualKunjungan || b.tanggalKunjungan || b.tanggal || b.waktuFoto || 0).getTime();
      return db - da;
    });
    const ts = sorted[0].waktuAktualKunjungan || sorted[0].tanggalKunjungan || sorted[0].tanggal || sorted[0].waktuFoto;
    if (ts) return ts;
  }
  if (Array.isArray(v.riwayatKunjungan) && v.riwayatKunjungan.length > 0) {
    const sorted = [...v.riwayatKunjungan].sort((a, b) => {
      const da = new Date(a.waktuAktualKunjungan || a.tanggalKunjungan || a.tanggal || 0).getTime();
      const db = new Date(b.waktuAktualKunjungan || b.tanggalKunjungan || b.tanggal || 0).getTime();
      return db - da;
    });
    const ts = sorted[0].waktuAktualKunjungan || sorted[0].tanggalKunjungan || sorted[0].tanggal;
    if (ts) return ts;
  }
  return (
    v.tanggalKunjunganTerakhir ||
    v.waktuPemantauanTerakhir ||
    v.kunjunganPertama?.waktuAktualKunjungan ||
    v.kunjunganPertama?.tanggalKunjungan ||
    v.kunjunganPertama?.waktuFoto ||
    null
  );
}

export default function PetugasVictimDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [victim, setVictim] = useState(null);
  const [isMonitoringModalOpen, setIsMonitoringModalOpen] = useState(false);
  const [selectedImagePreview, setSelectedImagePreview] = useState(null);
  const [selectedVisitForDetail, setSelectedVisitForDetail] = useState(null);
  const [transitionModalOpen, setTransitionModalOpen] = useState(false);
  const [transitionModalType, setTransitionModalType] = useState('RAWAT_LANJUTAN');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleDeleteVictim = () => {
    if (!victim) return;
    storageService.deleteVictim(victim.id || id, victim);
    navigate('/petugas/korban', { replace: true });
  };

  const isFetchingRef = useRef(false);

  const loadVictim = async (fromEvent = false) => {
    const data = storageService.getVictimById(id);
    if (data) {
      setVictim(data);
    }
    
    // Jika dipanggil dari event update lokal, cukup perbarui dari cache storage agar tidak terjadi loop fetch ke backend
    if (fromEvent) return;

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const fresh = await storageService.fetchVictimDetail(id);
      if (fresh) {
        setVictim(fresh);
      } else if (!data) {
        navigate('/petugas/korban');
      }
    } catch (err) {
      console.warn('[PetugasVictimDetail] Error loadVictim:', err.message);
    } finally {
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    loadVictim(false);
    const handleStorageUpdate = () => loadVictim(true);
    window.addEventListener('jr_victims_updated', handleStorageUpdate);
    return () => window.removeEventListener('jr_victims_updated', handleStorageUpdate);
  }, [id]);

  if (!victim) {
    return (
      <div className="py-16 text-center text-xs text-slate-400">
        Memuat data korban...
      </div>
    );
  }

  // Verifikasi Otorisasi: Petugas hanya dapat melihat korban yang menjadi tanggung jawabnya
  const allOfficers = storageService.getOfficers();
  const isAssigned = currentUser?.role === 'petugas'
    ? storageService.isOfficerAssignedToVictim(currentUser?.profile || currentUser?.profile?.id || currentUser?.profile?.nama, victim, allOfficers)
    : true;

  if (!isAssigned) {
    return (
      <div className="max-w-md mx-auto my-16 p-6 bg-white rounded-3xl border border-rose-200 shadow-xl text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full">
            Akses Korban Ditolak
          </span>
          <h2 className="text-lg font-black text-slate-900">Bukan Tanggung Jawab Anda</h2>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Anda tidak memiliki hak otorisasi untuk melihat atau memproses korban <strong>{victim.nama}</strong> karena faskes atau penugasan korban berada di luar tanggung jawab Anda.
        </p>
        <button
          type="button"
          onClick={() => navigate('/petugas/korban')}
          className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-[#145DA0] text-white hover:bg-[#0f4980] transition-colors cursor-pointer"
        >
          Kembali ke Daftar Korban Saya
        </button>
      </div>
    );
  }

  const { isReferred, rsAsal, rsTujuan, rsSaatIni } = resolveReferralHospitals(victim);

  const activeEpisode = Array.isArray(victim.careEpisodes) && victim.careEpisodes.length > 0
    ? victim.careEpisodes[victim.careEpisodes.length - 1]
    : null;

  const isDischarged = activeEpisode
    ? Boolean(
        activeEpisode.status === 'Pulang' ||
        activeEpisode.kondisiTerakhir === 'Pulang' ||
        activeEpisode.kondisiTerakhir === 'Sudah Pulang'
      )
    : Boolean(
        victim.kondisiTerakhir === 'Sudah Pulang' ||
        victim.kondisiTerakhir === 'Pulang' ||
        victim.kondisiTerakhir === 'Selesai' ||
        victim.status_kondisi === 'Selesai' ||
        victim.status_kondisi === 'Sudah Pulang' ||
        victim.status_kondisi === 'Pulang' ||
        victim.statusPemantauan === 'Selesai Dipantau' ||
        victim.statusPerawatan === 'Pulang'
      );

  const isReferredOut =
    (typeof victim.kondisiTerakhir === 'string' && victim.kondisiTerakhir.startsWith('Dirujuk')) ||
    (typeof victim.statusPemantauan === 'string' && victim.statusPemantauan.startsWith('Dirujuk')) ||
    (victim.statusPerawatan === 'Rujukan' && !victim.rujukanAccepted);

  const isIncomingReferral = victim.isRujukanMasuk && !victim.rujukanAccepted;

  const firstVisitSla = calculateFirstVisitSla(victim.tanggalInformasiDiterima, victim.kunjunganPertama);
  const monitoringSla = calculateMonitoringSla(victim);

  const handleOpenReferralModal = () => {
    setTransitionModalType('RUJUKAN');
    setTransitionModalOpen(true);
  };

  const handleOpenReadmitModal = () => {
    setTransitionModalType('RAWAT_LANJUTAN');
    setTransitionModalOpen(true);
  };

  const handleAcceptIncomingReferral = () => {
    storageService.acceptRujukan(victim.id, currentUser?.profile);
    loadVictim();
    setIsMonitoringModalOpen(true);
  };

  // Render badge status utama tunggal dan jelas (menghindari penumpukan badge berlebihan)
  const renderPrimaryStatusBadge = (v) => {
    if (isDischarged) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Selesai / Sudah Pulang</span>
        </span>
      );
    }

    if (isReferredOut) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
          <span>Dirujuk ke {rsTujuan || rsSaatIni}</span>
        </span>
      );
    }

    if (isIncomingReferral) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200">
          <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse"></span>
          <span>Rujukan Masuk (dari {rsAsal})</span>
        </span>
      );
    }

    if (v.statusPerawatan === 'Rawat Lanjutan' || v.isRawatLanjutan) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
          <span className="w-2 h-2 rounded-full bg-sky-500"></span>
          <span>Rawatan Lanjutan</span>
        </span>
      );
    }

    if (v.kondisiTerakhir === 'Meninggal Dunia') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          <span>Meninggal Dunia</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#145DA0] border border-blue-200">
        <span className="w-2 h-2 rounded-full bg-[#145DA0]"></span>
        <span>Masih Dirawat (Pemantauan Aktif)</span>
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ── 1. TOP HEADER: NAVIGASI & TOMBOL AKSI UTAMA ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <Link
          to="/petugas/korban"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3.5 py-2 rounded-xl border border-slate-200/90 shadow-2xs transition-colors self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Daftar Korban</span>
        </Link>

        {/* Action Buttons: Rujukan, Catat Pemantauan */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* Kondisi 2: Pasien Rujukan Masuk yang belum diterima */}
          {isIncomingReferral && (
            <button
              type="button"
              onClick={handleAcceptIncomingReferral}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-violet-700 hover:bg-violet-800 text-white shadow-2xs transition-all cursor-pointer"
            >
              <Activity className="w-4 h-4" />
              <span>Terima &amp; Lanjutkan Pemantauan</span>
            </button>
          )}

          {/* Kondisi 3: Pasien Masih Dalam Perawatan Aktif */}
          {!isDischarged && !isReferredOut && (
            <>
              <button
                type="button"
                onClick={handleOpenReferralModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 shadow-2xs transition-all cursor-pointer"
                title="Rujuk pasien ini ke rumah sakit rujukan lain"
              >
                <ArrowUpRight className="w-4 h-4 text-purple-600" />
                <span>Dirujuk ke RS Lain</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMonitoringModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-2xs transition-all cursor-pointer"
              >
                <Activity className="w-4 h-4" />
                <span>+ Catat Pemantauan</span>
              </button>
            </>
          )}

          {/* Tombol Hapus Data Korban dari Pemantauan (Hanya di dalam detail sesuai instruksi) */}
          <button
            type="button"
            onClick={() => setIsDeleteModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 shadow-2xs transition-all cursor-pointer"
            title="Hapus data korban ini dari pemantauan"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span className="hidden sm:inline">Hapus</span>
          </button>
        </div>
      </div>

      {/* ── 2. CARD IDENTITAS KORBAN (BERSIH, TANPA BADGE MENUMPUK) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{victim.nama}</h1>
              {/* STATUS UTAMA TUNGGAL & JELAS */}
              {renderPrimaryStatusBadge(victim)}
            </div>

            <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-2 flex-wrap">
              <span>ID Korban: <strong className="text-slate-700 font-mono">{victim.id}</strong></span>
              <span className="text-slate-300">•</span>
              <span>NIK: <strong className="text-slate-700 font-mono">{victim.nik || '—'}</strong></span>
              <span className="text-slate-300">•</span>
              <span>Faskes: <strong className="text-slate-700">{victim.rumahSakit}</strong></span>
              {victim.namaPetugas && (
                <>
                  <span className="text-slate-300">•</span>
                  <span>Petugas: <strong className="text-slate-700">{victim.namaPetugas}</strong></span>
                </>
              )}
            </p>
          </div>

          {/* Status SLA Ringkas Tanpa Badge Berlebihan */}
          <div className="flex items-center gap-3 text-xs bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5 self-start md:self-auto shrink-0">
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status Pemantauan &amp; SLA</span>
              <span className={`font-bold ${isDischarged ? 'text-emerald-700' : (monitoringSla.isOverdue ? 'text-rose-600' : 'text-emerald-700')}`}>
                {isDischarged
                  ? 'Pemantauan Selesai (Pasien Pulang)'
                  : (monitoringSla.isOverdue ? 'Melewati Batas SLA 3 Hari' : 'SLA Kunjungan Terpenuhi')}
              </span>
            </div>
          </div>
        </div>

        {/* Banner Alert Khusus Rujukan */}
        {isIncomingReferral && (
          <div className="bg-purple-50/90 border border-purple-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-purple-900 font-medium">
              <ArrowRight className="w-4 h-4 text-purple-600 shrink-0" />
              <span>
                <strong>Rujukan Masuk:</strong> Pasien dialihkan dari <strong>{rsAsal}</strong> ke <strong>{rsSaatIni}</strong>. Data identitas dan riwayat terhubung otomatis.
              </span>
            </div>
            <button
              type="button"
              onClick={handleAcceptIncomingReferral}
              className="px-3.5 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shrink-0 cursor-pointer self-start sm:self-auto"
            >
              Terima Rujukan
            </button>
          </div>
        )}


        {victim.kondisiTerakhir === 'Meninggal Dunia' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2.5 text-xs text-red-900">
            <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
            <span>
              <strong>Perhatian: Korban Meninggal Dunia.</strong> Segera koordinasikan jemput bola dokumen santunan ahli waris.
            </span>
          </div>
        )}
      </div>

      {/* ── 3. DATA INFORMASI KEJADIAN & KORBAN (BERSIH, ELEGAN, TANPA KOTAK ABU-ABU) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Kolom Kiri: Informasi Kejadian & Fasilitas Kesehatan */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#145DA0]" />
              <span>Informasi Kejadian &amp; Faskes</span>
            </h3>
            <span className="text-[11px] font-semibold text-slate-400">Kasus Laka Lantas</span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            <div className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500 font-medium">Rumah Sakit Dirawat</span>
              <span className="text-[#145DA0] font-bold text-right flex items-center gap-1.5 justify-end">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>{victim.rumahSakit || rsSaatIni || rsAsal}</span>
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500 font-medium">Tanggal Kecelakaan (Laka)</span>
              <span className="text-slate-800 font-semibold text-right">{formatDate(victim.tanggalKecelakaan)}</span>
            </div>

            <div className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500 font-medium">Tanggal Masuk Rumah Sakit</span>
              <span className="text-slate-800 font-semibold text-right">
                {formatDate(victim.tanggalMasukRs || victim.tanggalInformasiDiterima)}
              </span>
            </div>

            <div className="py-2.5 flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4">
              <span className="text-slate-500 font-medium shrink-0">Tempat Kejadian (TKP)</span>
              <span className="text-slate-800 font-semibold text-left sm:text-right leading-relaxed">
                {victim.lokasiKejadian || '—'}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500 font-medium">Sumber Informasi</span>
              <span className="text-slate-800 font-semibold text-right">
                {cleanSumberInformasi(victim.sumberInformasi)}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500 font-medium">Waktu Info Diterima</span>
              <span className="text-slate-800 font-semibold text-right font-mono">
                {formatDateTime(victim.tanggalInformasiDiterima)}
              </span>
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Data Pasien & Kontak */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <User className="w-4 h-4 text-[#145DA0]" />
              <span>Data Pasien &amp; Kontak</span>
            </h3>
            <span className="text-[11px] font-semibold text-slate-400">Identitas Korban</span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            <div className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500 font-medium">Petugas Penanggung Jawab</span>
              <span className="text-slate-900 font-bold text-right">
                {victim.namaPetugas || 'Petugas Jasa Raharja'}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500 font-medium">Kunjungan Terakhir</span>
              <span className="text-slate-800 font-semibold text-right">
                {formatDateTime(getLastVisitTimestamp(victim)) || 'Belum Ada Kunjungan'}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500 font-medium">Usia &amp; Jenis Kelamin</span>
              <span className="text-slate-800 font-semibold text-right">
                {victim.usia ? `${victim.usia} Tahun` : '—'} / {victim.jenisKelamin || '—'}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between gap-4">
              <span className="text-slate-500 font-medium">Nomor Telepon</span>
              <span className="text-[#145DA0] font-semibold text-right font-mono">
                {cleanPhoneNumber(victim.telepon)}
              </span>
            </div>

            <div className="py-2.5 flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4">
              <span className="text-slate-500 font-medium shrink-0">Alamat Domisili</span>
              <span className="text-slate-800 font-semibold text-left sm:text-right leading-relaxed">
                {victim.alamat || '—'}
              </span>
            </div>

            {victim.tindakLanjut && (
              <div className="py-2.5 flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4">
                <span className="text-slate-500 font-medium shrink-0">Rencana Tindak Lanjut</span>
                <span className="text-slate-800 font-semibold text-left sm:text-right leading-relaxed">
                  {victim.tindakLanjut}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. BAGIAN UTAMA: RIWAYAT PERJALANAN KORBAN (BEAD LINE TIMELINE) ── */}
      <RiwayatPerawatanTimeline
        victim={victim}
        onOpenTransitionModal={(type) => {
          setTransitionModalType(type);
          setTransitionModalOpen(true);
        }}
        onSelectVisit={(visit) => setSelectedVisitForDetail(visit)}
        onOpenMonitoringModal={() => setIsMonitoringModalOpen(true)}
        monitoringSla={isDischarged ? null : monitoringSla}
      />

      {/* Modal Formulir Pemantauan Lanjutan */}
      <FormPemantauanModal
        isOpen={isMonitoringModalOpen}
        onClose={() => setIsMonitoringModalOpen(false)}
        victim={victim}
        onMonitoringSaved={(fresh) => {
          if (fresh) setVictim(fresh);
          loadVictim();
        }}
      />

      {/* Modal Detail Kunjungan Pasien (Read-Only - Sesuai Ketentuan Section 7) */}
      {selectedVisitForDetail && (
        <ModalDetailKunjunganReadOnly
          isOpen={!!selectedVisitForDetail}
          onClose={() => setSelectedVisitForDetail(null)}
          activity={selectedVisitForDetail}
          victim={victim}
        />
      )}

      {/* Modal Preview Gambar / Foto Dokumentasi */}
      {selectedImagePreview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setSelectedImagePreview(null)}
        >
          <div className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Foto Bukti Aktivitas Petugas</span>
              <button
                type="button"
                onClick={() => setSelectedImagePreview(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-slate-900 flex items-center justify-center min-h-[250px]">
              <AuthenticatedImage
                src={selectedImagePreview}
                alt="Pratinjau Bukti"
                className="max-h-[70vh] w-auto object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Transisi Pasien (Rawat Lanjutan / Rujukan) */}
      {transitionModalOpen && victim && (
        <PatientTransitionModal
          isOpen={transitionModalOpen}
          onClose={() => setTransitionModalOpen(false)}
          victim={victim}
          transitionType={transitionModalType}
          onConfirmed={(updated) => {
            setVictim(updated);
            loadVictim();
          }}
        />
      )}

      {/* Modal Konfirmasi Hapus Data Korban */}
      {isDeleteModalOpen && victim && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">Hapus Data Korban</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Apakah Anda yakin ingin menghapus data korban <strong className="text-slate-800">{victim.nama}</strong> dari sistem pemantauan? Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteVictim}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
