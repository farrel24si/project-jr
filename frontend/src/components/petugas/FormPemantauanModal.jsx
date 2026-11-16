import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../common/Modal';
import { storageService } from '../../services/storageService';
import { cachePhoto } from '../../services/photoService';
import { INITIAL_HOSPITALS } from '../../services/initialDataset';
import { useAuth } from '../../context/AuthContext';
import { checkVisitInterval } from '../../services/slaService';
import CameraCapture from './CameraCapture';
import GpsCapture from './GpsCapture';
import ConditionBadge from '../common/ConditionBadge';
import MonitoringStatusBadge from '../common/MonitoringStatusBadge';
import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Save,
  Building2,
  User,
  Clock,
  ArrowUpRight,
  Home,
  HelpCircle,
  History,
  ChevronDown,
  ChevronUp,
  MapPin,
  Calendar,
  ExternalLink,
  CheckSquare,
  Square,
  FileText,
  Info,
  Lock
} from 'lucide-react';

export const OPSI_CHECKLIST_TINDAKAN = [
  'Memastikan kondisi terbaru korban',
  'Berkomunikasi dengan korban atau keluarga',
  'Memberikan Edukasi kepada pihak keluarga korban',
  'Mengarahkan keluarga untuk mengurus Laporan Polisi (LP), jika diperlukan',
  'Memastikan perkembangan perawatan korban di rumah sakit',
  'Melakukan koordinasi dengan pihak rumah sakit',
  'Memastikan tindak lanjut atau kelengkapan berkas'
];

export const OPSI_KEBUTUHAN_LANJUTAN = [
  'Menunggu informasi perkembangan korban',
  'Menunggu konfirmasi dari rumah sakit',
  'Menunggu kelengkapan berkas',
  'Perlu menghubungi keluarga kembali',
  'Perlu melakukan kunjungan berikutnya'
];

export default function FormPemantauanModal({ isOpen, onClose, victim, onMonitoringSaved }) {
  const { currentUser } = useAuth();

  const nowString = () => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const [formData, setFormData] = useState({
    waktuPemantauan: nowString(),
    kondisi: 'Masih Dirawat',
    rumahSakitRujukan: '',
    statusKonfirmasi: 'Terkonfirmasi',
    keteranganKonfirmasi: '',
    // C. Checklist Tindak Lanjut Petugas
    checklistTindakan: [],
    // D. Status Tindak Lanjut
    statusTindakLanjut: 'Masih Perlu Ditindaklanjuti',
    checklistKebutuhanLanjutan: [],
    // E. Catatan Tambahan
    catatanTambahan: ''
  });

  const [photoData, setPhotoData] = useState(null);
  const [gpsData, setGpsData] = useState(null);
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedPreviewPhoto, setSelectedPreviewPhoto] = useState(null);
  const [hospitalsList, setHospitalsList] = useState(INITIAL_HOSPITALS);

  useEffect(() => {
    storageService.getOrFetchHospitals().then((res) => {
      if (Array.isArray(res)) {
        setHospitalsList(res.map((h) => typeof h === 'string' ? h : h.nama_rs).filter(Boolean));
      }
    }).catch(() => {});
  }, []);

  // Cari petugas JR penanggung jawab RS tujuan rujukan secara dinamis
  const assignedOfficerForRujukan = useMemo(() => {
    const rsName = (formData.rumahSakitRujukan || '').trim().toLowerCase();
    if (!rsName) return null;
    const allOfficers = storageService.getOfficers();
    return allOfficers.find(
      (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some(
        (rs) => {
          const r1 = (rs || '').trim().toLowerCase();
          return r1 === rsName || (rsName.length >= 4 && (r1.includes(rsName) || rsName.includes(r1)));
        }
      )
    );
  }, [formData.rumahSakitRujukan]);

  const isPreviouslyDischarged = victim?.kondisiTerakhir === 'Sudah Pulang' || victim?.kondisiTerakhir === 'Pulang' || victim?.kondisiTerakhir === 'Selesai';

  useEffect(() => {
    if (isOpen && victim) {
      let initialKondisi = 'Masih Dirawat';
      if (victim.kondisiTerakhir === 'Sudah Pulang' || victim.kondisiTerakhir === 'Pulang' || victim.kondisiTerakhir === 'Selesai') {
        initialKondisi = 'Sudah Pulang';
      } else if (victim.kondisiTerakhir === 'Dirujuk') {
        initialKondisi = 'Dirujuk';
      } else if (victim.kondisiTerakhir === 'Meninggal Dunia') {
        initialKondisi = 'Meninggal Dunia';
      } else if (victim.kondisiTerakhir === 'Belum Dapat Dikonfirmasi') {
        initialKondisi = 'Belum Dapat Dikonfirmasi';
      } else {
        initialKondisi = 'Masih Dirawat';
      }

      setFormData({
        waktuPemantauan: nowString(),
        kondisi: initialKondisi,
        rumahSakitRujukan: '',
        statusKonfirmasi: 'Terkonfirmasi',
        keteranganKonfirmasi: '',
        checklistTindakan: [],
        statusTindakLanjut: 'Masih Perlu Ditindaklanjuti',
        checklistKebutuhanLanjutan: [],
        catatanTambahan: ''
      });
      setPhotoData(null);
      setGpsData(null);
      setValidationError('');
      setSuccessMessage(false);
    }
  }, [isOpen, victim?.id]);

  if (!victim) return null;

  // Hanya ambil aktivitas yang SUDAH SELESAI (bukan jadwal menunggu)
  const previousActivities = (victim.riwayatAktivitas && victim.riwayatAktivitas.length > 0)
    ? victim.riwayatAktivitas.filter((a) => a.statusKunjungan !== 'Menunggu')
    : [
        ...(victim.riwayatKunjungan || []),
        ...(victim.riwayatPemantauan || [])
      ].filter((a) => a.statusKunjungan !== 'Menunggu')
       .sort((a, b) => new Date(b.tanggal || b.tanggalKunjungan).getTime() - new Date(a.tanggal || a.tanggalKunjungan).getTime());

  const visitNumber = (previousActivities.length || 0) + 1;

  // Kunjungan terakhir yang telah dilakukan sebagai acuan SLA interval 3 hari
  const previousVisitDate = victim.tanggalKunjunganTerakhir || 
                            victim.waktuPemantauanTerakhir || 
                            victim.kunjunganPertama?.tanggalKunjungan || 
                            victim.tanggalInformasiDiterima;

  const intervalCheck = useMemo(() => {
    return checkVisitInterval(previousVisitDate, formData.waktuPemantauan);
  }, [previousVisitDate, formData.waktuPemantauan]);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
    } catch {
      return dateStr;
    }
  };

  const handleToggleTindakan = (opsi) => {
    setFormData((prev) => {
      const exists = prev.checklistTindakan.includes(opsi);
      return {
        ...prev,
        checklistTindakan: exists
          ? prev.checklistTindakan.filter((item) => item !== opsi)
          : [...prev.checklistTindakan, opsi]
      };
    });
    setValidationError('');
  };

  const isAllTindakanSelected =
    OPSI_CHECKLIST_TINDAKAN.length > 0 &&
    OPSI_CHECKLIST_TINDAKAN.every((item) => formData.checklistTindakan.includes(item));

  const isSomeTindakanSelected =
    formData.checklistTindakan.length > 0 && !isAllTindakanSelected;

  const handleToggleAllTindakan = () => {
    setFormData((prev) => ({
      ...prev,
      checklistTindakan: isAllTindakanSelected ? [] : [...OPSI_CHECKLIST_TINDAKAN]
    }));
    setValidationError('');
  };

  const handleToggleKebutuhanLanjutan = (opsi) => {
    setFormData((prev) => {
      const exists = prev.checklistKebutuhanLanjutan.includes(opsi);
      return {
        ...prev,
        checklistKebutuhanLanjutan: exists
          ? prev.checklistKebutuhanLanjutan.filter((item) => item !== opsi)
          : [...prev.checklistKebutuhanLanjutan, opsi]
      };
    });
    setValidationError('');
  };

  const handleLocationCaptured = (loc) => {
    setGpsData(loc);
    if (validationError && (validationError.includes('GPS') || validationError.includes('maps') || validationError.includes('koordinat'))) {
      setValidationError('');
    }
  };

  const handlePhotoCaptured = (photo) => {
    setPhotoData(photo);
    if (validationError && (validationError.includes('foto') || validationError.includes('dokumentasi') || validationError.includes('mengupload'))) {
      setValidationError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    if (new Date(formData.waktuPemantauan) > new Date(Date.now() + 5 * 60000)) {
      setValidationError('Waktu pemantauan aktual tidak boleh di masa mendatang. Harap masukkan waktu saat pemantauan benar-benar dilaksanakan.');
      return;
    }

    if (formData.kondisi === 'Dirujuk' && !formData.rumahSakitRujukan.trim()) {
      setValidationError('Nama rumah sakit tujuan rujukan wajib diisi.');
      return;
    }

    if (formData.kondisi === 'Meninggal Dunia' && !formData.keteranganKonfirmasi.trim()) {
      setValidationError('Keterangan konfirmasi atau sumber informasi kematian korban wajib diisi.');
      return;
    }

    // Checklist tindakan minimal 1 harus dicentang
    if (formData.checklistTindakan.length === 0) {
      setValidationError('Pilih minimal satu tindakan yang telah Anda laksanakan pada pemantauan ini.');
      return;
    }

    // Jika masih perlu ditindaklanjuti, harus ada checklist atau catatan
    if (
      formData.statusTindakLanjut === 'Masih Perlu Ditindaklanjuti' &&
      formData.checklistKebutuhanLanjutan.length === 0 &&
      !formData.catatanTambahan.trim()
    ) {
      setValidationError('Pilih minimal satu kebutuhan tindak lanjut atau tuliskan pada catatan jika status masih perlu ditindaklanjuti.');
      return;
    }

    // Validasi Koordinat GPS / Maps (Wajib)
    if (!gpsData || !gpsData.latitude || !gpsData.longitude) {
      setValidationError('Harap mengunci lokasi koordinat GPS / maps rumah sakit terlebih dahulu.');
      return;
    }

    // Validasi Dokumentasi Foto (Wajib)
    if (!photoData) {
      setValidationError('Harap mengupload atau mengambil dokumentasi foto kunjungan.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Susun ringkasan terstruktur dari checklist sehingga riwayat memiliki teks yang jelas
      const ringkasanTindakan = formData.checklistTindakan.join(', ');
      const ringkasanKebutuhan = formData.statusTindakLanjut === 'Sudah Selesai'
        ? 'Status tindak lanjut: Sudah selesai.'
        : `Tindak lanjut masih diperlukan: ${formData.checklistKebutuhanLanjutan.join(', ') || 'Dalam proses'}.`;

      const autoSummary = [
        `Kondisi: ${formData.kondisi}.`,
        `Tindakan petugas: ${ringkasanTindakan}.`,
        ringkasanKebutuhan,
        formData.catatanTambahan ? `Catatan: ${formData.catatanTambahan.trim()}` : null
      ].filter(Boolean).join(' ');

      const tindakLanjutTeks = formData.statusTindakLanjut === 'Sudah Selesai'
        ? 'Tindak lanjut pemantauan selesai'
        : (formData.checklistKebutuhanLanjutan.join(', ') || formData.catatanTambahan.trim() || 'Perlu pemantauan lanjutan');

      const monPayload = {
        tanggal: new Date(formData.waktuPemantauan).toISOString(),
        waktuAktualKunjungan: new Date(formData.waktuPemantauan).toISOString(),
        waktuPencatatanSistem: new Date().toISOString(),
        petugasId: currentUser?.profile?.id || victim.petugasId,
        petugasNama: currentUser?.profile?.nama || victim.namaPetugas,
        nomorKunjungan: visitNumber,
        kunjunganKe: visitNumber,
        jenisAktivitas: 'Kunjungan Selanjutnya',
        rumahSakit: (victim.isRujukanMasuk && victim.rumahSakitTujuan) ? victim.rumahSakitTujuan : victim.rumahSakit,
        kondisi: formData.kondisi,
        kondisiKorban: formData.kondisi,
        statusKonfirmasi: formData.kondisi === 'Meninggal Dunia' ? formData.statusKonfirmasi : 'Terkonfirmasi',
        keteranganKonfirmasi: formData.keteranganKonfirmasi.trim() || null,
        rumahSakitRujukan: formData.kondisi === 'Dirujuk' ? formData.rumahSakitRujukan.trim() : null,
        alasanRujukan: formData.kondisi === 'Dirujuk' ? (formData.catatanTambahan.trim() || 'Rujukan perawatan ke rumah sakit lain') : null,
        catatanRujukan: formData.kondisi === 'Dirujuk' ? autoSummary : null,
        
        // Checklist Tindakan & Status Tindak Lanjut
        checklistTindakan: formData.checklistTindakan,
        statusTindakLanjut: formData.statusTindakLanjut,
        checklistKebutuhanLanjutan: formData.statusTindakLanjut === 'Masih Perlu Ditindaklanjuti' ? formData.checklistKebutuhanLanjutan : [],
        catatanTambahan: formData.catatanTambahan.trim() || null,

        hasilPemantauan: autoSummary,
        hasilKomunikasi: autoSummary,
        tindakLanjut: tindakLanjutTeks,
        catatanTindakLanjut: tindakLanjutTeks,

        // Dokumentasi
        fotoUrl: photoData,
        latitude: gpsData?.latitude || null,
        longitude: gpsData?.longitude || null,
        akurasiLokasi: gpsData?.akurasiLokasi || null,
        waktuDokumentasi: gpsData?.waktu || new Date().toISOString()
      };

      if (photoData) {
        cachePhoto(victim.id, photoData);
        if (victim.caseId) {
          cachePhoto(victim.caseId, photoData);
          cachePhoto(`case_${victim.caseId}`, photoData);
        }
        if (victim.activeVisitId) {
          cachePhoto(victim.activeVisitId, photoData);
          cachePhoto(`VISIT-${victim.activeVisitId}`, photoData);
        }
      }

      const updated = await storageService.addMonitoring(victim.id, monPayload);
      setSuccessMessage(true);

      setTimeout(() => {
        setIsSubmitting(false);
        setSuccessMessage(false);
        if (onMonitoringSaved) {
          onMonitoringSaved(updated);
        }
        onClose();
      }, 700);
    } catch (err) {
      console.error(err);
      setValidationError(err.message || 'Terjadi kendala saat menyimpan aktivitas pemantauan.');
      setIsSubmitting(false);
    }
  };

  // Rumah sakit saat pemantauan ini berlangsung (tetap RS saat ini / lokasi aktual kunjungan)
  const currentHospital = (victim.isRujukanMasuk && victim.rumahSakitTujuan)
    ? victim.rumahSakitTujuan
    : victim.rumahSakit;
  const activeHospital = currentHospital;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Formulir Catat Pemantauan"
      subtitle="Pencatatan pemantauan perkembangan korban di rumah sakit menggunakan checklist terstruktur."
      maxWidth="max-w-3xl"
    >
      {successMessage ? (
        <div className="py-12 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <h4 className="text-lg font-bold text-slate-900">Hasil Pemantauan Berhasil Disimpan!</h4>
          <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
            Aktivitas baru telah dicatat ke riwayat data korban <strong>{victim.nama}</strong>. Data korban tetap satu dan tidak diduplikasi.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Error Banner */}
          {validationError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 flex items-start gap-2 shadow-2xs">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs font-semibold">{validationError}</div>
            </div>
          )}

          {/* ── BAGIAN A: INFORMASI PEMANTAUAN ── */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  INFORMASI PASIEN (ID: {victim.id})
                </span>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-base font-black text-slate-900">{victim.nama}</span>
                  <span className="text-slate-400">•</span>
                  <span className="font-semibold text-slate-700">
                    {victim.isRujukanMasuk && victim.rumahSakitTujuan ? (
                      <span className="text-violet-900 font-bold">
                        {victim.rumahSakitTujuan} (Rujukan Masuk dari {victim.rumahSakitAsal || victim.rumahSakit})
                      </span>
                    ) : (
                      victim.rumahSakit
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#145DA0] text-white">
                  Kunjungan ke-{visitNumber}
                </span>
                <MonitoringStatusBadge status={victim.statusPemantauan} size="xs" />
                <ConditionBadge kondisi={victim.kondisiTerakhir} statusKonfirmasi={victim.statusKonfirmasiKondisi} size="xs" />
              </div>
            </div>

            {/* Input Tanggal & Waktu Aktual (Otomatis & Terkunci Sistem) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700">
                  Tanggal &amp; Waktu Pemantauan Aktual <span className="text-red-500">*</span>
                </label>
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 font-semibold bg-slate-200/80 px-2 py-0.5 rounded">
                  <Lock className="w-3 h-3 text-slate-500" />
                  Terkunci Sistem
                </span>
              </div>
              <input
                type="datetime-local"
                readOnly
                disabled
                value={formData.waktuPemantauan}
                className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-600 bg-slate-100 font-medium cursor-not-allowed select-none"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Tanggal dan jam tercatat otomatis oleh sistem sesuai waktu aktual saat ini (terkunci / tidak dapat diubah).
              </p>
            </div>

            {/* Banner Peringatan Interval SLA 3 Hari */}
            {previousVisitDate && (
              <div>
                {intervalCheck.isOverdue ? (
                  <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-lg flex items-start gap-2 text-rose-900 shadow-2xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5 animate-pulse" />
                    <div className="text-[11px] leading-relaxed">
                      <strong className="block font-bold text-rose-950">PERINGATAN: Kunjungan Melewati Batas Waktu 3 Hari!</strong>
                      Berjarak <strong>{intervalCheck.durationText}</strong> dari kunjungan sebelumnya ({formatDateTime(previousVisitDate)}). Standar maksimal SLA interval adalah 72 jam.
                    </div>
                  </div>
                ) : (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Interval pemantauan sesuai jadwal SLA ({intervalCheck.durationText} dari kunjungan sebelumnya).</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Accordion Histori Kunjungan Sebelumnya (Opsional untuk referensi petugas) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="w-full px-3.5 py-2 flex items-center justify-between text-left hover:bg-slate-100/70 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-[#145DA0]" />
                <span className="font-semibold text-slate-700 text-xs">
                  Lihat Riwayat Pemantauan Sebelumnya ({previousActivities.length} aktivitas tercatat)
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-bold text-[#145DA0]">
                <span>{showHistory ? 'Tutup' : 'Buka'}</span>
                {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
            </button>

            {showHistory && (
              <div className="p-3 border-t border-slate-200 max-h-48 overflow-y-auto space-y-2 bg-white">
                {previousActivities.length === 0 ? (
                  <div className="text-center text-slate-400 py-3 italic">
                    Belum ada riwayat kunjungan sebelumnya.
                  </div>
                ) : (
                  previousActivities.map((act, idx) => (
                    <div key={act.id || idx} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold text-slate-800">
                        <span>{act.jenisAktivitas}</span>
                        <span className="font-mono text-[10px] text-slate-400">{formatDateTime(act.tanggal)}</span>
                      </div>
                      <p className="text-slate-600 line-clamp-2">{act.hasilKomunikasi || act.hasilPemantauan || act.tindakLanjut}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── BAGIAN B: KONDISI KORBAN ── */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div>
              <label className="block font-bold text-slate-900 text-xs uppercase tracking-wider mb-0.5">
                B. Kondisi Korban Saat Ini <span className="text-red-500">*</span>
              </label>
              <p className="text-[11px] text-slate-500 mb-2.5">
                Pilih salah satu kondisi terbaru korban berdasarkan verifikasi faktual di lapangan.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {[
                { val: 'Masih Dirawat', label: 'Masih Dirawat', desc: 'Dalam perawatan medis / rawat inap di RS' },
                { val: 'Sudah Pulang', label: 'Sudah Pulang', desc: 'Telah sembuh / diizinkan dokter keluar RS' },
                { val: 'Dirujuk', label: 'Rujukan (Dirujuk ke RS Lain)', desc: 'Perawatan aktif dialihkan ke fasilitas rujukan lain' },
                ...(isPreviouslyDischarged ? [
                  { val: 'Rawat Lanjutan', label: 'Rawat Lanjutan', desc: 'Kembali masuk untuk rawat lanjutan / kontrol' }
                ] : []),
                { val: 'Meninggal Dunia', label: 'Meninggal Dunia', desc: 'Dinyatakan meninggal dunia oleh medis' },
                { val: 'Belum Dapat Dikonfirmasi', label: 'Belum Dapat Dikonfirmasi', desc: 'Kondisi belum dapat dipastikan' }
              ].map((opt) => {
                const isSelected = formData.kondisi === opt.val;
                return (
                  <label
                    key={opt.val}
                    className={`p-3 rounded-xl border cursor-pointer select-none transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-[#145DA0] bg-blue-50/70 shadow-xs ring-1 ring-[#145DA0]'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/40'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name="kondisiKorban"
                        value={opt.val}
                        checked={isSelected}
                        onChange={() => {
                          setFormData((prev) => ({ ...prev, kondisi: opt.val }));
                          setValidationError('');
                        }}
                        className="mt-0.5 text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer shrink-0"
                      />
                      <div>
                        <span className="font-bold text-slate-900 block leading-tight">{opt.label}</span>
                        <span className="text-[10px] text-slate-500 block mt-0.5 leading-snug">{opt.desc}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Kolom Khusus: Jika Dirujuk */}
            {formData.kondisi === 'Dirujuk' && (
              <div className="p-3.5 rounded-xl bg-violet-50 border border-violet-200 space-y-2.5 mt-2">
                <div className="flex items-center gap-1.5 font-bold text-violet-900">
                  <ArrowUpRight className="w-4 h-4 text-violet-700" />
                  <span>Informasi Rujukan Fasilitas Kesehatan</span>
                </div>
                <div>
                  <label className="block font-semibold text-violet-950 mb-1">
                    Pilih Rumah Sakit Tujuan Rujukan <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.rumahSakitRujukan}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, rumahSakitRujukan: e.target.value }));
                      setValidationError('');
                    }}
                    className="w-full text-xs rounded-lg border border-violet-300 bg-white px-3 py-2 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-violet-600 cursor-pointer"
                  >
                    <option value="">— Pilih Rumah Sakit Tujuan Rujukan —</option>
                    {hospitalsList
                      .filter((h) => (h || '').trim().toLowerCase() !== (currentHospital || '').trim().toLowerCase())
                      .map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Info Petugas RS Tujuan Rujukan */}
                {formData.rumahSakitRujukan && (
                  <div className="p-2.5 rounded-lg bg-white border border-violet-200 flex items-center justify-between gap-2 shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Petugas JR di RS Tujuan:</span>
                        <strong className="text-slate-900 font-bold text-xs">
                          {assignedOfficerForRujukan ? assignedOfficerForRujukan.nama : 'Belum Ditugaskan'}
                        </strong>
                        {assignedOfficerForRujukan?.wilayah && (
                          <span className="text-[10px] text-slate-400 block">
                            Wilayah: {assignedOfficerForRujukan.wilayah}
                          </span>
                        )}
                      </div>
                    </div>
                    {assignedOfficerForRujukan && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-800 border border-violet-200">
                        Penerima Rujukan
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Kolom Khusus: Jika Meninggal Dunia */}
            {formData.kondisi === 'Meninggal Dunia' && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-3 mt-2">
                <div className="flex items-center gap-1.5 font-bold text-red-950">
                  <AlertOctagon className="w-4 h-4 text-red-600" />
                  <span>Konfirmasi Kematian Korban</span>
                </div>
                <p className="text-[11px] text-red-800 leading-relaxed">
                  <strong>Penting:</strong> Jangan langsung menganggap informasi kematian valid tanpa konfirmasi resmi medis atau dokumen sah.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Status Keabsahan Konfirmasi <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.statusKonfirmasi}
                      onChange={(e) => setFormData((prev) => ({ ...prev, statusKonfirmasi: e.target.value }))}
                      className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 font-medium"
                    >
                      <option value="Terkonfirmasi">Terkonfirmasi Medis / Surat Kematian RS</option>
                      <option value="Belum Dikonfirmasi">Belum Dikonfirmasi Resmi (Perlu Verifikasi Lanjutan)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Keterangan Sumber Informasi / Bukti Konfirmasi <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.keteranganKonfirmasi}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, keteranganKonfirmasi: e.target.value }));
                        setValidationError('');
                      }}
                      placeholder="Contoh: Surat Kematian No. 12/SK/RS atau DPJP dr. Faisal"
                      className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
                    />
                  </div>
                </div>

                <div className="p-2.5 bg-white rounded-lg border border-red-200 text-[11px] text-red-900 leading-relaxed">
                  Jika terkonfirmasi meninggal dunia, pemantauan klinis rutin dihentikan, namun tindak lanjut administrasi berkas santunan ahli waris tetap dilanjutkan.
                </div>
              </div>
            )}

            {/* Kolom Khusus: Jika Belum Dapat Dikonfirmasi */}
            {formData.kondisi === 'Belum Dapat Dikonfirmasi' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 space-y-1 mt-2">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <HelpCircle className="w-4 h-4 text-amber-600" />
                  <span>Kondisi Belum Dapat Dipastikan</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Sistem tidak akan menutup status pemantauan. Status korban akan ditandai sebagai <strong>Menunggu Konfirmasi Kondisi</strong> dan petugas tetap berkewajiban melakukan verifikasi lanjutan.
                </p>
              </div>
            )}
          </div>

          {/* ── BAGIAN C: CHECKLIST TINDAK LANJUT PETUGAS ── */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <label className="block font-bold text-slate-900 text-xs uppercase tracking-wider">
                  C. Tindakan yang Telah Dilakukan (Checklist) <span className="text-red-500">*</span>
                </label>
                <p className="text-[11px] text-slate-500">
                  Centang tindakan yang benar-benar Anda laksanakan pada pemantauan ini (pilihan dapat lebih dari satu).
                </p>
              </div>
              <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                {formData.checklistTindakan.length} dari {OPSI_CHECKLIST_TINDAKAN.length} dipilih
              </span>
            </div>

            {/* Daftar Butir Tindakan */}
            <div className="space-y-2 pt-1">
              {OPSI_CHECKLIST_TINDAKAN.map((item, idx) => {
                const isChecked = formData.checklistTindakan.includes(item);
                return (
                  <label
                    key={idx}
                    className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-[#145DA0] bg-blue-50/60 text-slate-900 font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleTindakan(item)}
                      className="mt-0.5 rounded text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer shrink-0"
                    />
                    <span className="text-xs leading-relaxed select-none">{item}</span>
                  </label>
                );
              })}
            </div>

            {/* Opsi Centang Semua (Diletakkan di Bagian Bawah) */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100/70 rounded-xl border border-slate-200 transition-colors mt-2">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllTindakanSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isSomeTindakanSelected;
                  }}
                  onChange={handleToggleAllTindakan}
                  className="rounded text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-800">
                  {isAllTindakanSelected ? 'Batalkan Centang Semua' : 'Centang Semua'}
                </span>
              </label>

              <button
                type="button"
                onClick={handleToggleAllTindakan}
                className="text-xs font-semibold text-[#145DA0] hover:text-[#0b3c68] hover:underline cursor-pointer"
              >
                {isAllTindakanSelected ? 'Batalkan Semua' : 'Pilih Semua'}
              </button>
            </div>
          </div>

          {/* ── BAGIAN D: STATUS TINDAK LANJUT ── */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div>
              <label className="block font-bold text-slate-900 text-xs uppercase tracking-wider mb-0.5">
                D. Status Tindak Lanjut Hasil Pemantauan <span className="text-red-500">*</span>
              </label>
              <p className="text-[11px] text-slate-500 mb-2">
                Tentukan apakah seluruh kebutuhan pemantauan korban saat ini sudah tuntas atau masih memerlukan langkah lanjutan.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                  formData.statusTindakLanjut === 'Masih Perlu Ditindaklanjuti'
                    ? 'border-amber-500 bg-amber-50/70 shadow-xs ring-1 ring-amber-500'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/40'
                }`}
              >
                <input
                  type="radio"
                  name="statusTindakLanjut"
                  value="Masih Perlu Ditindaklanjuti"
                  checked={formData.statusTindakLanjut === 'Masih Perlu Ditindaklanjuti'}
                  onChange={(e) => setFormData((prev) => ({ ...prev, statusTindakLanjut: e.target.value }))}
                  className="mt-0.5 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="font-bold text-amber-950 block">Masih Perlu Ditindaklanjuti</span>
                  <span className="text-[11px] text-amber-800 leading-snug block mt-0.5">
                    Terdapat berkas, konfirmasi RS, atau jadwal kunjungan berikutnya yang masih harus dipantau.
                  </span>
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                  formData.statusTindakLanjut === 'Sudah Selesai'
                    ? 'border-emerald-500 bg-emerald-50/70 shadow-xs ring-1 ring-emerald-500'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/40'
                }`}
              >
                <input
                  type="radio"
                  name="statusTindakLanjut"
                  value="Sudah Selesai"
                  checked={formData.statusTindakLanjut === 'Sudah Selesai'}
                  onChange={(e) => setFormData((prev) => ({ ...prev, statusTindakLanjut: e.target.value }))}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="font-bold text-emerald-950 block">Sudah Selesai</span>
                  <span className="text-[11px] text-emerald-800 leading-snug block mt-0.5">
                    Seluruh kewajiban dan tindak lanjut pemantauan pada tahapan ini telah selesai seluruhnya.
                  </span>
                </div>
              </label>
            </div>

            {/* Checklist Kebutuhan Tindak Lanjut jika Masih Perlu Ditindaklanjuti */}
            {formData.statusTindakLanjut === 'Masih Perlu Ditindaklanjuti' && (
              <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200 space-y-2.5 mt-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-950 text-xs">
                    Pilih Kebutuhan Tindak Lanjut yang Masih Diperlukan:
                  </span>
                  <span className="text-[10px] text-amber-800 font-semibold">
                    {formData.checklistKebutuhanLanjutan.length} dipilih
                  </span>
                </div>

                <div className="space-y-1.5">
                  {OPSI_KEBUTUHAN_LANJUTAN.map((item, idx) => {
                    const isChecked = formData.checklistKebutuhanLanjutan.includes(item);
                    return (
                      <label
                        key={idx}
                        className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                          isChecked
                            ? 'border-amber-400 bg-white font-semibold text-amber-950 shadow-2xs'
                            : 'border-amber-200/80 hover:bg-white/80 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleKebutuhanLanjutan(item)}
                          className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer shrink-0"
                        />
                        <span className="text-[11px] leading-relaxed select-none">{item}</span>
                      </label>
                    );
                  })}
                </div>

                <p className="text-[10px] text-amber-800 italic">
                  *Catatan: Menyimpan formulir ini tidak otomatis menganggap seluruh tindak lanjut selesai. Rencana tindak lanjut akan tetap dicatat dalam sistem.
                </p>
              </div>
            )}
          </div>

          {/* ── BAGIAN E: CATATAN TAMBAHAN (OPSIONAL) ── */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-slate-900 text-xs uppercase tracking-wider">
                E. Catatan Tambahan (Opsional)
              </label>
              <span className="text-[10px] text-slate-400 italic">Boleh dikosongkan</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Gunakan kolom ini hanya jika ada informasi khusus yang belum terwakili oleh checklist (misal: keterangan keluarga, kendala lapangan, atau catatan dokter).
            </p>
            <textarea
              rows={2}
              value={formData.catatanTambahan}
              onChange={(e) => setFormData((prev) => ({ ...prev, catatanTambahan: e.target.value }))}
              placeholder="Tulis catatan opsional di sini jika ada keterangan tambahan..."
              className="w-full text-xs rounded-lg border border-slate-300 p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#145DA0] leading-relaxed bg-white"
            />
          </div>

          {/* ── BAGIAN F: DOKUMENTASI KUNJUNGAN & LOKASI GPS (WAJIB) ── */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <label className="block font-bold text-slate-900 text-xs uppercase tracking-wider mb-0.5">
                  F. Dokumentasi Kunjungan Lapangan &amp; Lokasi GPS <span className="text-red-500">*</span>
                </label>
                <p className="text-[11px] text-slate-500">
                  Ambil foto dokumentasi kunjungan dan pastikan titik koordinat GPS terdeteksi secara aktual (Wajib).
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className={`px-2 py-0.5 rounded font-semibold ${gpsData?.latitude ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  {gpsData?.latitude ? '✓ GPS Terkunci' : '✗ GPS Belum Ada'}
                </span>
                <span className={`px-2 py-0.5 rounded font-semibold ${photoData ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  {photoData ? '✓ Foto Terlampir' : '✗ Foto Belum Ada'}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {/* GPS Google Maps */}
              <GpsCapture
                onLocationCaptured={handleLocationCaptured}
                initialLocation={gpsData}
                hospitalName={activeHospital}
              />

              {/* Kamera dengan Stempel Watermark Resmi */}
              <CameraCapture
                onPhotoCaptured={handlePhotoCaptured}
                initialPhoto={photoData}
                metadata={{
                  petugasNama: currentUser?.profile?.nama || victim.namaPetugas || 'Petugas Lapangan',
                  rumahSakit: activeHospital,
                  korbanNama: victim.nama,
                  latitude: gpsData?.latitude,
                  longitude: gpsData?.longitude,
                  akurasiLokasi: gpsData?.akurasiLokasi,
                  waktu: formData.waktuPemantauan
                }}
              />
            </div>
          </div>

          {/* Pesan Validasi Error (Bagian Bawah) */}
          {validationError && (
            <div className="p-3 bg-red-50 border border-red-300 rounded-xl flex items-start gap-2.5 text-red-800 shadow-2xs">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs font-semibold">{validationError}</div>
            </div>
          )}

          {/* Tombol Simpan & Batal */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Pemantauan'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Modal Zoom Foto Watermark */}
      {selectedPreviewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedPreviewPhoto(null)}
        >
          <div className="relative max-w-2xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700">
            <img
              src={selectedPreviewPhoto}
              alt="Foto Watermark Dokumentasi"
              className="w-full max-h-[80vh] object-contain"
            />
            <div className="p-3 bg-slate-950 flex items-center justify-between text-xs text-white">
              <span className="font-semibold text-blue-300">
                Dokumentasi Lapangan Terstempel Watermark Resmi
              </span>
              <button
                type="button"
                onClick={() => setSelectedPreviewPhoto(null)}
                className="px-3 py-1 bg-white text-slate-900 font-bold rounded-lg hover:bg-slate-200"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
