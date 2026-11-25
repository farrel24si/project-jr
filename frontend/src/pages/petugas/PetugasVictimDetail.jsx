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
import MonitoringStatusBadge from '../../components/common/MonitoringStatusBadge';
import {
  MONITORING_STATUS,
  getMonitoringStatus,
  isVictimFinished as checkVictimFinished,
  canRecordVisit
} from '../../utils/monitoringStatus';
import { cleanPhoneNumber, cleanSumberInformasi } from '../../services/backendMapper';
import { formatDateIndo, formatDateTimeIndo } from '../../utils/dateUtils';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertOctagon,
  PlusCircle,
  Activity,
  User,
  Info,
  ShieldAlert,
  Trash2,
  Lock,
  Edit3,
  X
} from 'lucide-react';

function formatDate(dateStr) {
  return formatDateIndo(dateStr);
}

function formatDateTime(dateStr) {
  return formatDateTimeIndo(dateStr);
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
  const [isEditMdModalOpen, setIsEditMdModalOpen] = useState(false);
  const [editMdDate, setEditMdDate] = useState('');
  const [editMdTime, setEditMdTime] = useState('');
  const [editMdError, setEditMdError] = useState('');

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

  // Otomatis kembalikan petugas ke modal formulir pemantauan jika browser HP sempat reload saat ambil foto kamera
  useEffect(() => {
    try {
      const activeVicId = sessionStorage.getItem('jr_active_monitoring_victim_id');
      if (activeVicId && victim && (String(victim.id) === String(activeVicId) || String(victim.caseId) === String(activeVicId))) {
        const isFin =
          victim.kondisiTerakhir === 'Sudah Pulang' ||
          victim.kondisiTerakhir === 'Pulang' ||
          victim.kondisiTerakhir === 'Selesai' ||
          victim.kondisiTerakhir === 'Meninggal Dunia' ||
          victim.status_kondisi === 'Sudah Pulang' ||
          victim.status_kondisi === 'Pulang' ||
          victim.status_kondisi === 'Selesai' ||
          victim.status_kondisi === 'Meninggal Dunia' ||
          victim.statusPemantauan === 'Selesai Dipantau' ||
          victim.statusPemantauan === 'Selesai' ||
          Boolean(victim.tanggalMeninggal);
        if (isFin) {
          sessionStorage.removeItem('jr_active_monitoring_victim_id');
          setIsMonitoringModalOpen(false);
        } else {
          setIsMonitoringModalOpen(true);
        }
      }
    } catch (e) { }
  }, [victim?.id, victim?.caseId, victim?.statusPemantauan, victim?.kondisiTerakhir, victim?.status_kondisi, victim?.tanggalMeninggal]);

  // Verifikasi Otorisasi: Petugas berhak mengakses korban yang sedang ditangani maupun yang pernah ditangani sebelum rujukan
  const activeOfficerIdent = currentUser?.profile || currentUser?.profile?.id || currentUser?.profile?.backendOfficerId || currentUser?.profile?.nama;
  const officerRole = victim ? storageService.getOfficerVictimRole(activeOfficerIdent, victim) : null;
  const canAccess = (!victim || currentUser?.role !== 'petugas')
    ? true
    : storageService.canOfficerAccessVictim(activeOfficerIdent, victim);
  const isOriginOfficer = officerRole === 'ORIGIN_OFFICER';

  // Sesuai Ketentuan Section 3 & 7: Petugas Asal dibatasi aksesnya hanya sampai waktu rujukan
  // dan tidak dapat melihat catatan pemantauan yang dibuat setelah rujukan ke RS tujuan
  const filteredVictimForView = useMemo(() => {
    if (!victim || !isOriginOfficer) return victim;

    let referralCutoff = 0;
    if (victim.tanggalRujukan) {
      referralCutoff = new Date(victim.tanggalRujukan).getTime();
    } else if (Array.isArray(victim.riwayatRujukan) && victim.riwayatRujukan.length > 0) {
      const dates = victim.riwayatRujukan
        .map((r) => new Date(r.tanggal || r.waktu || 0).getTime())
        .filter((t) => t > 0);
      if (dates.length > 0) referralCutoff = Math.min(...dates);
    }

    if (!referralCutoff || isNaN(referralCutoff)) {
      return victim;
    }

    const vClone = { ...victim };
    // Toleransi 1 jam untuk aktivitas saat proses rujukan berlangsung
    const cutoffThreshold = referralCutoff + 3600000;

    if (Array.isArray(vClone.riwayatAktivitas)) {
      vClone.riwayatAktivitas = vClone.riwayatAktivitas.filter((act) => {
        const t = new Date(act.waktuAktualKunjungan || act.tanggalKunjungan || act.tanggal || act.waktuFoto || 0).getTime();
        return !t || t <= cutoffThreshold;
      });
    }

    if (Array.isArray(vClone.riwayatKunjungan)) {
      vClone.riwayatKunjungan = vClone.riwayatKunjungan.filter((vis) => {
        const t = new Date(vis.waktuAktualKunjungan || vis.tanggalKunjungan || vis.tanggal || 0).getTime();
        return !t || t <= cutoffThreshold;
      });
    }

    return vClone;
  }, [victim, isOriginOfficer]);

  if (!victim) {
    return (
      <div className="py-16 text-center text-xs text-slate-400">
        Memuat data korban...
      </div>
    );
  }

  if (!canAccess) {
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
          Anda tidak memiliki hak otorisasi untuk melihat korban <strong>{victim.nama}</strong> karena faskes korban berada di luar tanggung jawab Anda dan Anda tidak memiliki riwayat penanganan atas korban ini.
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

  const getFamilyInfo = (v) => {
    if (!v) return { nama: null, hubungan: null, kontak: null };
    let nama = v.namaKeluarga || v.keluargaNama || null;
    let hubungan = v.hubunganKeluarga || null;
    let kontak = v.kontakKeluarga || v.teleponKeluarga || v.noHpKeluarga || null;

    if ((!kontak || !nama) && Array.isArray(v.riwayatAktivitas)) {
      for (const act of v.riwayatAktivitas) {
        if (act.kontakKeluarga && !kontak) kontak = act.kontakKeluarga;
        if (act.namaKeluarga && !nama) nama = act.namaKeluarga;
        if (act.hubunganKeluarga && !hubungan) hubungan = act.hubunganKeluarga;
        if (kontak && nama) break;
      }
    }
    return {
      nama: nama && String(nama).trim() ? String(nama).trim() : null,
      hubungan: hubungan && String(hubungan).trim() ? String(hubungan).trim() : null,
      kontak: kontak && String(kontak).trim() ? String(kontak).trim() : null
    };
  };

  const familyInfo = getFamilyInfo(victim);

  const rawVicPhone = victim?.telepon && victim.telepon !== '—' ? victim.telepon : (victim?.telepon_korban || null);
  const cleanVicPhone = cleanPhoneNumber(rawVicPhone);
  const hasVictimPhone = Boolean(cleanVicPhone && cleanVicPhone !== '—');

  const cleanFamPhone = cleanPhoneNumber(familyInfo.kontak);
  const hasFamPhone = Boolean(cleanFamPhone && cleanFamPhone !== '—');
  const isSamePhone = hasVictimPhone && hasFamPhone && cleanVicPhone === cleanFamPhone;

  const activeEpisode = isReferred && Array.isArray(victim.careEpisodes) && victim.careEpisodes.length > 0
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

  const isDeceased = Boolean(
    victim.kondisiTerakhir === 'Meninggal Dunia' ||
    victim.status_kondisi === 'Meninggal Dunia' ||
    victim.tanggalMeninggal
  );

  const isFinished =
    isDischarged ||
    isDeceased ||
    victim.statusPemantauan === 'Selesai Dipantau' ||
    victim.statusPemantauan === 'Selesai' ||
    ['Sudah Pulang', 'Pulang', 'Selesai', 'Meninggal Dunia'].includes(victim.kondisiTerakhir) ||
    ['Sudah Pulang', 'Pulang', 'Selesai', 'Meninggal Dunia'].includes(victim.status_kondisi);

  const isReferredOut = isOriginOfficer;

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

  // Render badge status utama (4 Kategori Resmi)
  const renderPrimaryStatusBadge = (v) => {
    return <MonitoringStatusBadge victim={v} size="md" />;
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

        {/* Action Buttons: Catat Kunjungan / Hapus */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Kondisi 1: Petugas Asal (Mode Arsip Read-Only - Tidak dapat menambah kunjungan/rujukan/hapus) */}
          {isOriginOfficer ? (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
              <Lock className="w-3.5 h-3.5 text-purple-700" />
              <span>Arsip Riwayat Penanganan (Read-Only)</span>
            </div>
          ) : (
            <>
              {/* Jika belum selesai dan bukan dirujuk keluar, tampilkan tombol Catat Kunjungan */}
              {!isFinished && !isReferredOut && (
                <button
                  type="button"
                  onClick={() => setIsMonitoringModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-2xs transition-all cursor-pointer"
                >
                  <Activity className="w-4 h-4" />
                  <span>+ Catat Kunjungan</span>
                </button>
              )}

              {/* Tombol Hapus Data Korban dari Pemantauan */}
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 shadow-2xs transition-all cursor-pointer"
                title="Hapus data korban ini dari pemantauan"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span className="hidden sm:inline">Hapus</span>
              </button>
            </>
          )}
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

          {/* Status Batas Waktu Ringkas */}
          <div className="flex items-center gap-3 text-xs bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5 self-start md:self-auto shrink-0">
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status Batas Waktu Kunjungan</span>
              <span className={`font-bold ${isDeceased ? 'text-red-700' : isDischarged ? 'text-emerald-700' : isOriginOfficer ? 'text-purple-700' : (monitoringSla.isOverdue ? 'text-rose-600' : 'text-emerald-700')}`}>
                {isDeceased
                  ? 'Pemantauan Selesai (Korban Meninggal Dunia)'
                  : isDischarged
                    ? 'Pemantauan Selesai (Pasien Pulang)'
                    : isOriginOfficer
                      ? 'Pemantauan Dialihkan ke RS Rujukan'
                      : (monitoringSla.isOverdue ? 'Melewati Batas Waktu (3 Hari)' : 'Kunjungan Tepat Waktu')}
              </span>
            </div>
          </div>
        </div>

        {/* Banner Alert Khusus Petugas Asal (Arsip Read-Only) */}
        {isOriginOfficer && (
          <div className="bg-purple-50/90 border border-purple-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3.5 text-xs shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 border border-purple-200 mt-0.5">
                <ArrowUpRight className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-purple-900 text-sm">Arsip Riwayat Korban Dirujuk</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-200/80 text-purple-800">Read-Only</span>
                </div>
                <p className="text-purple-700 leading-relaxed">
                  Korban ini telah dirujuk dari <strong>{rsAsal}</strong> ke <strong>{rsTujuan || rsSaatIni}</strong>. Hak kelola pemantauan lanjutan dialihkan kepada petugas rumah sakit tujuan. Riwayat kunjungan dan dokumentasi Anda sebelum rujukan tetap tersimpan sebagai arsip.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* CARD KHUSUS PENCATATAN KORBAN MD (MENINGGAL DUNIA) */}
        {isDeceased && (
          <div className="bg-gradient-to-r from-red-50/90 via-rose-50/60 to-red-50/90 border border-red-200/90 rounded-2xl p-5 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between gap-3 border-b border-red-200/70 pb-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0 border border-red-200">
                  <AlertOctagon className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-800 bg-red-200/80 px-2.5 py-0.5 rounded-full">
                      Status Kondisi: MD (Meninggal Dunia)
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-red-200">
                      Permanen
                    </span>
                  </div>
                  <h3 className="text-sm font-black text-red-950 mt-1">
                    Informasi Korban Meninggal Dunia
                  </h3>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setEditMdDate(victim.tanggalMeninggal || new Date().toISOString().split('T')[0]);
                    setEditMdTime((victim.jamMeninggal || '12:00').replace(/\s*WIB/i, '').trim());
                    setEditMdError('');
                    setIsEditMdModalOpen(true);
                  }}
                  className="text-xs font-bold text-red-700 bg-white hover:bg-red-50 border border-red-300 px-3 py-1 rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{victim.tanggalMeninggal ? 'Ubah Waktu Kematian' : 'Input Tanggal & Jam'}</span>
                </button>
                <span className="text-xs font-bold text-red-700 bg-white border border-red-200 px-3 py-1 rounded-xl">
                  Pemantauan Klinis Berakhir
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-white/80 p-3 rounded-xl border border-red-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Status Kondisi
                </span>
                <span className="font-extrabold text-red-700">
                  MD (Meninggal Dunia)
                </span>
              </div>

              <div className="bg-white/80 p-3 rounded-xl border border-red-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Tanggal Meninggal
                </span>
                <span className="font-extrabold text-slate-900">
                  {formatDate(victim.tanggalMeninggal) || '—'}
                </span>
              </div>

              <div className="bg-white/80 p-3 rounded-xl border border-red-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Jam Meninggal
                </span>
                <span className="font-extrabold text-slate-900">
                  {victim.jamMeninggal ? `${String(victim.jamMeninggal).replace(/\s*WIB/i, '').trim()} WIB` : '—'}
                </span>
              </div>

              <div className="bg-white/80 p-3 rounded-xl border border-red-200/80">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Dicatat oleh
                </span>
                <span className="font-extrabold text-slate-900">
                  {victim.dicatatOleh || victim.namaPetugas || 'Petugas Jasa Raharja'}
                </span>
              </div>
            </div>

            {victim.waktuPencatatanMD && (
              <div className="pt-2 border-t border-red-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-500">
                <span>
                  Waktu Pencatatan Sistem: <strong className="text-slate-700">{formatDateTime(victim.waktuPencatatanMD)}</strong> (Tercatat terpisah dari waktu kematian)
                </span>
                <span className="text-red-700 font-semibold">
                  Kunjungan baru dihentikan permanen
                </span>
              </div>
            )}
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

            <div className="py-2.5 flex items-start justify-between gap-4">
              <span className="text-slate-500 font-medium shrink-0 pt-0.5">Nomor Telepon</span>
              <div className="text-right space-y-1">
                {hasVictimPhone && !isSamePhone && (
                  <div className="text-[#145DA0] font-semibold font-mono text-xs">
                    {cleanVicPhone} <span className="text-slate-500 font-sans font-normal text-[11px]">(Korban)</span>
                  </div>
                )}
                {hasFamPhone && (
                  <div className="text-[#145DA0] font-semibold font-mono text-xs">
                    {cleanFamPhone} <span className="text-slate-500 font-sans font-normal text-[11px]">({familyInfo.hubungan || 'Keluarga'})</span>
                  </div>
                )}
                {hasVictimPhone && isSamePhone && !hasFamPhone && (
                  <div className="text-[#145DA0] font-semibold font-mono text-xs">
                    {cleanVicPhone} <span className="text-slate-500 font-sans font-normal text-[11px]">(Korban)</span>
                  </div>
                )}
                {!hasVictimPhone && !hasFamPhone && (
                  <span className="text-slate-400 font-mono">—</span>
                )}
              </div>
            </div>

            {familyInfo.nama && (
              <div className="py-2.5 flex items-center justify-between gap-4">
                <span className="text-slate-500 font-medium">Keluarga / Pendamping</span>
                <span className="text-slate-800 font-semibold text-right">
                  {familyInfo.nama} {familyInfo.hubungan ? `(${familyInfo.hubungan})` : ''}
                </span>
              </div>
            )}

            <div className="py-2.5 flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4">
              <span className="text-slate-500 font-medium shrink-0">Alamat Domisili</span>
              <span className="text-slate-800 font-semibold text-left sm:text-right leading-relaxed">
                {victim.alamat || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. BAGIAN UTAMA: RIWAYAT PERJALANAN KORBAN (BEAD LINE TIMELINE) ── */}
      <RiwayatPerawatanTimeline
        victim={filteredVictimForView}
        onOpenTransitionModal={isOriginOfficer || isFinished ? null : (type) => {
          setTransitionModalType(type);
          setTransitionModalOpen(true);
        }}
        onSelectVisit={(visit) => setSelectedVisitForDetail(visit)}
        onOpenMonitoringModal={isOriginOfficer || isFinished ? null : () => setIsMonitoringModalOpen(true)}
        monitoringSla={isFinished || isOriginOfficer ? null : monitoringSla}
      />

      {/* Modal Formulir Pemantauan Lanjutan - hanya dimount jika pemantauan belum selesai */}
      {!isFinished && (
        <FormPemantauanModal
          isOpen={isMonitoringModalOpen}
          onClose={() => setIsMonitoringModalOpen(false)}
          victim={victim}
          onMonitoringSaved={(fresh) => {
            if (fresh) setVictim(fresh);
            loadVictim();
          }}
        />
      )}

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

      {/* Modal Pembaruan / Pengisian Tanggal & Jam Meninggal Dunia */}
      {isEditMdModalOpen && victim && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-red-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center font-bold">
                  <AlertOctagon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Waktu Meninggal Dunia</h3>
                  <p className="text-[11px] text-slate-500">Isi tanggal dan jam resmi kematian korban</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditMdModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editMdError && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{editMdError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Tanggal Meninggal Dunia <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={editMdDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => {
                    setEditMdDate(e.target.value);
                    setEditMdError('');
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Jam Meninggal Dunia <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={editMdTime}
                  onChange={(e) => {
                    setEditMdTime(e.target.value);
                    setEditMdError('');
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-xs font-semibold"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Format 24 jam (WIB). Waktu pencatatan sistem akan tetap tersimpan terpisah.
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsEditMdModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!editMdDate) {
                    setEditMdError('Tanggal meninggal dunia wajib diisi.');
                    return;
                  }
                  if (!editMdTime) {
                    setEditMdError('Jam meninggal dunia wajib diisi.');
                    return;
                  }
                  const dt = new Date(`${editMdDate}T${editMdTime}`);
                  if (dt.getTime() > Date.now()) {
                    setEditMdError('Tanggal dan jam meninggal dunia tidak boleh berada di masa depan.');
                    return;
                  }
                  const officerName = currentUser?.profile?.nama || victim.namaPetugas || 'Petugas Jasa Raharja';
                  const officerId = currentUser?.profile?.id || victim.petugasId;
                  const updated = storageService.updateMeninggalDunia(victim.id, {
                    tanggalMeninggal: editMdDate,
                    jamMeninggal: editMdTime,
                    dicatatOleh: officerName,
                    petugasId
                  });
                  if (updated) {
                    setVictim(updated);
                  }
                  setIsEditMdModalOpen(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
              >
                Simpan Waktu Kematian
              </button>
            </div>
          </div>
        </div>
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
