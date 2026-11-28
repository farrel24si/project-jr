import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../common/Modal';
import { storageService } from '../../services/storageService';
import { useAuth } from '../../context/AuthContext';
import CameraCapture from './CameraCapture';
import GpsCapture from './GpsCapture';
import PatientTransitionModal from './PatientTransitionModal';
import {
  User,
  Building2,
  AlertCircle,
  CheckCircle2,
  Save,
  MapPin,
  ShieldAlert,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  UserCheck,
  Eye,
  Activity,
  Check,
  Lock,
  FileText
} from 'lucide-react';

const STEPS = [
  { id: 1, title: 'Data Korban & RS', desc: 'Identitas & Kejadian' },
  { id: 2, title: 'Kunjungan Awal', desc: 'Kondisi & Tindakan' },
  { id: 3, title: 'Dokumentasi & GPS', desc: 'Foto & Titik GPS' },
  { id: 4, title: 'Review & Simpan', desc: 'Verifikasi Akhir' }
];

const KONDISI_OPTIONS = [
  { value: 'Rawat Inap', label: 'Rawat Inap', desc: 'Dalam perawatan medis / rawat inap di RS' },
  { value: 'Luka Ringan', label: 'Luka Ringan', desc: 'Penanganan rawat jalan / observasi ringan' },
  { value: 'Luka Berat', label: 'Luka Berat', desc: 'Memerlukan perawatan intensif / tindakan khusus' },
  { value: 'Selesai', label: 'Sudah Pulang', desc: 'Telah sembuh / diizinkan dokter keluar RS' },
  { value: 'Meninggal Dunia', label: 'Meninggal Dunia', desc: 'Dinyatakan meninggal dunia oleh medis' }
];

export default function FormInputKorbanModal({ isOpen, onClose, onVictimCreated }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const officerProfile = currentUser?.profile || {
    id: 'PET-01',
    nama: 'Petugas'
  };

  const nowString = useMemo(() => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  }, []);

  const [currentStep, setCurrentStep] = useState(1);

  // Cari data petugas yang sedang login dari database/storage secara dinamis
  const loggedInOfficer = useMemo(() => {
    const allOfficers = storageService.getOfficers() || [];
    const p = currentUser?.profile || {};
    return (
      allOfficers.find(
        (o) =>
          (p.id && o.id === p.id) ||
          (p.backendOfficerId && String(o.backendOfficerId) === String(p.backendOfficerId)) ||
          (p.nama && o.nama && o.nama.trim().toLowerCase() === p.nama.trim().toLowerCase())
      ) || null
    );
  }, [currentUser, isOpen]);

  // Pilihan Rumah Sakit khusus yang menjadi tanggung jawab petugas yang sedang login
  const availableHospitals = useMemo(() => {
    if (currentUser?.role === 'petugas') {
      const plotting =
        Array.isArray(loggedInOfficer?.plottingRs) && loggedInOfficer.plottingRs.length > 0
          ? loggedInOfficer.plottingRs
          : Array.isArray(currentUser?.profile?.plottingRs)
            ? currentUser.profile.plottingRs
            : [];
      if (plotting.length > 0) {
        return Array.from(new Set(plotting.filter(Boolean)));
      }
    }
    const storedHospitals = typeof storageService.getHospitals === 'function' ? storageService.getHospitals() : [];
    return storedHospitals.map((h) => (typeof h === 'string' ? h : h.nama_rs || h.nama)).filter(Boolean);
  }, [loggedInOfficer, currentUser, isOpen]);

  // Form Data State
  const [formData, setFormData] = useState({
    nama: '',
    nik: '',
    usia: '30',
    jenisKelamin: 'Laki-laki',
    telepon: '',
    alamat: '',
    rumahSakit: availableHospitals[0] || '',
    lokasiKejadian: '',
    tanggalKecelakaan: nowString,
    tanggalMasukRs: nowString,
    keteranganTambahan: '',
    catatKunjunganSekaligus: true,
    kondisiAwal: 'Rawat Inap',
    hasilKunjunganAwal: '',
    komunikasiKeluarga: '',
    cekKomunikasiKeluarga: true,
    cekEdukasiSantunan: true,
    cekArahanLp: true,
    penyampaianHak: 'Hak santunan biaya perawatan RS maksimal Rp20.000.000,- telah dijelaskan.',
    tindakLanjutAwal: 'Pemantauan perkembangan medis dan konfirmasi surat jaminan RS'
  });

  const [photoData, setPhotoData] = useState(null);
  const [gpsData, setGpsData] = useState(null);

  // Duplication warning state
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  const [ignoredDuplicateId, setIgnoredDuplicateId] = useState(null);
  const [isCheckingNik, setIsCheckingNik] = useState(false);
  const [nikCheckStatus, setNikCheckStatus] = useState(null); // null | 'NOT_FOUND' | 'FOUND'
  const [autoFilledVictimId, setAutoFilledVictimId] = useState(null);
  const [transitionTargetVictim, setTransitionTargetVictim] = useState(null);
  const [transitionType, setTransitionType] = useState('RAWAT_LANJUTAN');
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Petugas penanggung jawab sesuai user yang login (jika petugas) atau hasil plotting RS (jika kabag)
  const currentAssignedOfficer = useMemo(() => {
    if (currentUser?.role === 'petugas') {
      return loggedInOfficer || officerProfile;
    }
    const allOfficers = storageService.getOfficers();
    const caseRs = (formData.rumahSakit || '').trim().toLowerCase();
    return allOfficers.find(
      (o) =>
        o.status !== 'Nonaktif' &&
        Array.isArray(o.plottingRs) &&
        o.plottingRs.some((rs) => {
          const r1 = (rs || '').trim().toLowerCase();
          return r1 === caseRs || (caseRs.length >= 4 && (r1.includes(caseRs) || caseRs.includes(r1)));
        })
    );
  }, [formData.rumahSakit, currentUser, loggedInOfficer, officerProfile]);

  // Reset formulir & foto setiap kali modal dibuka baru
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setFormData({
        nama: '',
        nik: '',
        usia: '30',
        jenisKelamin: 'Laki-laki',
        telepon: '',
        alamat: '',
        rumahSakit: availableHospitals[0] || '',
        lokasiKejadian: '',
        tanggalKecelakaan: nowString,
        tanggalMasukRs: nowString,
        keteranganTambahan: '',
        catatKunjunganSekaligus: true,
        kondisiAwal: 'Rawat Inap',
        hasilKunjunganAwal: '',
        komunikasiKeluarga: '',
        cekKomunikasiKeluarga: true,
        cekEdukasiSantunan: true,
        cekArahanLp: true,
        penyampaianHak: 'Hak santunan biaya perawatan RS maksimal Rp20.000.000,- telah dijelaskan.',
        tindakLanjutAwal: 'Pemantauan perkembangan medis dan konfirmasi surat jaminan RS'
      });
      setPhotoData(null);
      setGpsData(null);
      setDuplicateMatches([]);
      setIgnoredDuplicateId(null);
      setValidationError('');
    }
  }, [isOpen, nowString]);

  const applyExistingVictimDefaults = (match) => {
    if (!match || String(autoFilledVictimId) === String(match.id)) return;
    setAutoFilledVictimId(match.id);
    const toLocalInput = (dStr) => {
      if (!dStr) return '';
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return '';
      const tz = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - tz).toISOString().slice(0, 16);
    };
    setFormData((prev) => ({
      ...prev,
      nama: match.nama || prev.nama,
      usia: match.usia ? String(match.usia) : prev.usia,
      jenisKelamin: match.jenisKelamin || prev.jenisKelamin,
      telepon: (match.telepon && match.telepon !== '—') ? match.telepon : prev.telepon,
      alamat: (match.alamat && match.alamat !== '—') ? match.alamat : prev.alamat,
      lokasiKejadian: (match.lokasiKejadian && match.lokasiKejadian !== '—') ? match.lokasiKejadian : prev.lokasiKejadian,
      tanggalKecelakaan: toLocalInput(match.tanggalKecelakaan) || prev.tanggalKecelakaan
    }));
  };

  // Check duplicates in real-time
  useEffect(() => {
    if (!isOpen) {
      setDuplicateMatches([]);
      setIgnoredDuplicateId(null);
      setAutoFilledVictimId(null);
      setValidationError('');
      return;
    }

    if ((formData.nik && formData.nik.trim().length >= 6) || (formData.nama && formData.nama.trim().length >= 3)) {
      const matches = storageService.checkPotentialDuplicates({
        nik: formData.nik,
        nama: formData.nama,
        rumahSakit: formData.rumahSakit,
        tanggalKecelakaan: formData.tanggalKecelakaan
      });
      setDuplicateMatches(matches);
      const exactMatch = matches.find((m) => m.exactNikMatch);
      if (exactMatch) {
        applyExistingVictimDefaults(exactMatch);
      }
    } else {
      setDuplicateMatches([]);
    }
  }, [formData.nik, formData.nama, formData.rumahSakit, formData.tanggalKecelakaan, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    setValidationError('');
  };

  const handleOpenExistingVictim = (existingVictimId) => {
    onClose();
    navigate(`/petugas/korban/${existingVictimId}`);
  };

  const handleCheckNikDatabase = async () => {
    const cleanNik = (formData.nik || '').replace(/\D/g, '');
    if (cleanNik.length !== 16) {
      setValidationError('Masukkan 16 digit NIK yang valid terlebih dahulu untuk memeriksa database.');
      return;
    }
    setValidationError('');
    setIsCheckingNik(true);
    setNikCheckStatus(null);
    try {
      await storageService.syncWithBackend(true).catch(() => {});
      const matches = storageService.checkPotentialDuplicates({
        nik: cleanNik,
        nama: formData.nama,
        rumahSakit: formData.rumahSakit,
        tanggalKecelakaan: formData.tanggalKecelakaan
      });
      setDuplicateMatches(matches);
      if (matches.length > 0) {
        setIgnoredDuplicateId(null);
        setNikCheckStatus('FOUND');
        const exactMatch = matches.find((m) => m.exactNikMatch) || matches[0];
        applyExistingVictimDefaults(exactMatch);
      } else {
        setNikCheckStatus('NOT_FOUND');
      }
    } finally {
      setIsCheckingNik(false);
    }
  };

  // Validasi per tahap (disamakan dengan pola FormPemantauanModal)
  const getStepValidation = (step) => {
    if (step === 1) {
      if (!formData.nama.trim()) {
        return { isValid: false, message: 'Nama korban wajib diisi.' };
      }
      if (formData.nik && formData.nik.trim()) {
        const cleanNik = formData.nik.replace(/\D/g, '');
        if (cleanNik.length !== 16) {
          return { isValid: false, message: 'NIK harus terdiri dari tepat 16 digit angka.' };
        }
      }
      if (!formData.rumahSakit.trim()) {
        return { isValid: false, message: 'Rumah sakit tempat dirawat wajib dipilih.' };
      }
      if (!formData.lokasiKejadian.trim()) {
        return { isValid: false, message: 'Tempat kecelakaan (TKP) wajib diisi.' };
      }
      if (!formData.tanggalKecelakaan) {
        return { isValid: false, message: 'Tanggal & waktu kecelakaan wajib diisi.' };
      }
      if (!formData.tanggalMasukRs) {
        return { isValid: false, message: 'Tanggal & waktu masuk rumah sakit wajib diisi.' };
      }
      return { isValid: true, message: '' };
    }

    if (step === 2) {
      if (!formData.catatKunjunganSekaligus) {
        return { isValid: true, message: '' };
      }
      if (!formData.kondisiAwal) {
        return { isValid: false, message: 'Kondisi korban saat ini wajib dipilih.' };
      }
      if (!formData.hasilKunjunganAwal.trim()) {
        return { isValid: false, message: 'Catatan hasil kunjungan / komunikasi wajib diisi.' };
      }
      return { isValid: true, message: '' };
    }

    if (step === 3) {
      if (!formData.catatKunjunganSekaligus) {
        return { isValid: true, message: '' };
      }
      const hasValidGps =
        gpsData &&
        Number.isFinite(Number(gpsData.latitude ?? gpsData.lat_petugas)) &&
        Number.isFinite(Number(gpsData.longitude ?? gpsData.lng_petugas));

      if (!hasValidGps) {
        return { isValid: false, message: 'Harap deteksi titik koordinat GPS perangkat terlebih dahulu.' };
      }
      if (!photoData) {
        return { isValid: false, message: 'Harap ambil dokumentasi foto kunjungan terlebih dahulu.' };
      }
      return { isValid: true, message: '' };
    }

    return { isValid: true, message: '' };
  };

  const canJumpToStep = (targetStep) => {
    if (targetStep <= currentStep) return true;
    for (let s = 1; s < targetStep; s++) {
      if (!getStepValidation(s).isValid) return false;
    }
    return true;
  };

  const handleStepClick = (targetStep) => {
    if (targetStep === currentStep) return;
    if (targetStep < currentStep) {
      setValidationError('');
      setCurrentStep(targetStep);
      return;
    }
    for (let s = 1; s < targetStep; s++) {
      const check = getStepValidation(s);
      if (!check.isValid) {
        setValidationError(check.message);
        return;
      }
    }
    setValidationError('');
    setCurrentStep(targetStep);
  };

  const handleNextStep = () => {
    const check = getStepValidation(currentStep);
    if (!check.isValid) {
      setValidationError(check.message);
      return;
    }
    setValidationError('');
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const handlePrevStep = () => {
    setValidationError('');
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    for (let s = 1; s <= 3; s++) {
      const check = getStepValidation(s);
      if (!check.isValid) {
        setValidationError(check.message);
        setCurrentStep(s);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Pengecekan ulang NIK langsung ke database sebelum menyimpan
      const cleanNikSubmit = (formData.nik || '').replace(/\D/g, '');
      if (cleanNikSubmit.length === 16) {
        await storageService.syncWithBackend(true).catch(() => {});
      }
      const freshMatches = storageService.checkPotentialDuplicates({
        nik: cleanNikSubmit || formData.nik,
        nama: formData.nama,
        rumahSakit: formData.rumahSakit,
        tanggalKecelakaan: formData.tanggalKecelakaan
      });
      const existingTarget = freshMatches.find((m) => m.exactNikMatch) ||
        (ignoredDuplicateId !== 'CONFIRMED_DIFFERENT' ? freshMatches[0] : null);

      const assignedPetugasId = currentAssignedOfficer ? currentAssignedOfficer.id : null;
      const assignedPetugasNama = currentAssignedOfficer ? currentAssignedOfficer.nama : 'Belum Ada Petugas Penanggung Jawab';

      let initialVisitPayload = null;
      if (formData.catatKunjunganSekaligus) {
        const nowActualIso = new Date().toISOString();
        initialVisitPayload = {
          tanggalKunjungan: nowActualIso,
          waktuAktualKunjungan: nowActualIso,
          waktuCatatSistem: nowActualIso,
          kondisi: formData.kondisiAwal,
          kondisiKorban: formData.kondisiAwal,
          cek_komunikasi_keluarga: formData.cekKomunikasiKeluarga,
          cek_edukasi_santunan: formData.cekEdukasiSantunan,
          cek_arahan_lp: formData.cekArahanLp,
          checklistTindakan: [
            formData.cekKomunikasiKeluarga ? 'Berkomunikasi dengan korban atau keluarga' : null,
            formData.cekEdukasiSantunan ? 'Memberikan Edukasi kepada pihak keluarga korban' : null,
            formData.cekArahanLp ? 'Mengarahkan keluarga untuk mengurus Laporan Polisi (LP), jika diperlukan' : null
          ].filter(Boolean),
          catatan_kondisi: formData.hasilKunjunganAwal,
          hasilPemantauan: formData.hasilKunjunganAwal,
          hasilKunjungan: formData.hasilKunjunganAwal,
          komunikasiKeluarga: formData.komunikasiKeluarga,
          penyampaianHak: formData.penyampaianHak,
          tindakLanjut: formData.tindakLanjutAwal || 'Pemantauan perkembangan korban',
          statusTindakLanjut: ['Sudah Pulang', 'Pulang', 'Selesai', 'Meninggal Dunia'].includes(formData.kondisiAwal)
            ? 'Sudah Selesai'
            : 'Masih Perlu Ditindaklanjuti',
          fotoUrl: photoData,
          latitude: Number(gpsData.latitude ?? gpsData.lat_petugas),
          longitude: Number(gpsData.longitude ?? gpsData.lng_petugas),
          lat_petugas: Number(gpsData.lat_petugas ?? gpsData.latitude),
          lng_petugas: Number(gpsData.lng_petugas ?? gpsData.longitude),
          akurasiLokasi: Number.isFinite(Number(gpsData.akurasiLokasi ?? gpsData.akurasi_lokasi_meter)) ? Number(gpsData.akurasiLokasi ?? gpsData.akurasi_lokasi_meter) : null,
          akurasi_lokasi_meter: Number.isFinite(Number(gpsData.akurasi_lokasi_meter ?? gpsData.akurasiLokasi)) ? Number(gpsData.akurasi_lokasi_meter ?? gpsData.akurasiLokasi) : null,
          sumberKoordinat: gpsData.sumberKoordinat ?? gpsData.sumber_koordinat ?? (gpsData.isSimulated ? 'Koordinat Rumah Sakit' : 'GPS Perangkat'),
          sumber_koordinat: gpsData.sumberKoordinat ?? gpsData.sumber_koordinat ?? (gpsData.isSimulated ? 'Koordinat Rumah Sakit' : 'GPS Perangkat'),
          isSimulated: Boolean(gpsData.isSimulated),
          waktuFoto: gpsData?.waktu || new Date().toISOString(),
          petugasId: officerProfile.id,
          petugasNama: officerProfile.nama
        };
      }

      // Jika korban sudah terdaftar (berdasarkan NIK atau konfirmasi), masukkan ke data korban yang sama sebagai Episode Perawatan baru / lanjutan!
      if (existingTarget) {
        if (existingTarget.kondisiTerakhir === 'Meninggal Dunia' || existingTarget.tanggalMeninggal) {
          setValidationError(`Korban ${existingTarget.nama} (NIK: ${existingTarget.nik}) sudah tercatat berstatus Selesai MD (Meninggal Dunia).`);
          setIsSubmitting(false);
          return;
        }

        const targetRs = formData.rumahSakit.trim();
        const isSameHosp = targetRs.toLowerCase() === String(existingTarget.rumahSakit || '').trim().toLowerCase();
        let updatedVictim = existingTarget;

        // Jika berpindah RS tanpa proses rujukan atau kembali berobat setelah pulang, buat Episode Perawatan baru (BUKAN rujukan)
        if (existingTarget.isDischarged || !isSameHosp) {
          updatedVictim = storageService.confirmRawatLanjutan(existingTarget.id, {
            rumahSakit: targetRs,
            tanggalMasuk: formData.tanggalMasukRs,
            catatan: formData.keteranganTambahan?.trim() || (isSameHosp
              ? `Pasien kembali berobat di ${targetRs}.`
              : `Pasien menjalani perawatan baru di ${targetRs} (sebelumnya dirawat di ${existingTarget.rumahSakit}).`),
            isSameHospital: isSameHosp
          }) || updatedVictim;
        }

        if (initialVisitPayload) {
          updatedVictim = await storageService.addMonitoring(existingTarget.id, initialVisitPayload) || updatedVictim;
        }

        setIsSubmitting(false);
        setPhotoData(null);
        setGpsData(null);
        if (onVictimCreated) {
          onVictimCreated(updatedVictim);
        }
        onClose();
        navigate(`/petugas/korban/${existingTarget.id}`);
        return;
      }

      const victimPayload = {
        nama: formData.nama.trim(),
        nik: formData.nik.trim() || '—',
        usia: Number(formData.usia) || 30,
        jenisKelamin: formData.jenisKelamin,
        telepon: formData.telepon.trim() || '—',
        alamat: formData.alamat.trim() || '—',
        rumahSakit: formData.rumahSakit.trim(),
        lokasiKejadian: formData.lokasiKejadian.trim(),
        tanggalKecelakaan: new Date(formData.tanggalKecelakaan).toISOString(),
        tanggalMasukRs: new Date(formData.tanggalMasukRs).toISOString(),
        tanggalInformasiDiterima: new Date().toISOString(),
        sumberInformasi: 'Input Langsung Petugas',
        petugasId: assignedPetugasId,
        namaPetugas: assignedPetugasNama,
        kondisiTerakhir: formData.catatKunjunganSekaligus ? formData.kondisiAwal : 'Masih Dirawat',
        statusKonfirmasiKondisi: formData.catatKunjunganSekaligus ? 'Terkonfirmasi' : 'Belum Dikonfirmasi',
        keteranganTambahan: formData.keteranganTambahan
      };

      const createdVictim = await storageService.addVictim(victimPayload, initialVisitPayload);

      setIsSubmitting(false);
      setPhotoData(null);
      setGpsData(null);
      if (onVictimCreated) {
        onVictimCreated(createdVictim);
      }
      onClose();
      navigate(`/petugas/korban/${createdVictim.id}`);
    } catch (err) {
      console.error(err);
      setValidationError('Terjadi kesalahan saat menyimpan data korban.');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        closeOnBackdrop={false}
        title="Tambah Korban"
        subtitle="Satu korban memiliki satu data utama tetap. Lengkapi setiap tahap dengan akurat."
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* ── STEPPER WIZARD BAR (Identik dengan Form Pemantauan Kunjungan) ── */}
          <div className="bg-slate-50/80 border-b border-slate-200/80 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5">
            <div className="w-full bg-slate-200/80 h-1.5 rounded-full overflow-hidden mb-2.5 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-[#145DA0] via-blue-500 to-emerald-500 rounded-full transition-all duration-500 ease-out"
                style={{
                  width: currentStep === 1 ? '25%' : currentStep === 2 ? '50%' : currentStep === 3 ? '75%' : '100%'
                }}
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {STEPS.map((s) => {
                const isActive = currentStep === s.id;
                const isPassed = s.id < currentStep;
                const isStepValid = getStepValidation(s.id).isValid;
                const isAccessible = canJumpToStep(s.id);

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleStepClick(s.id)}
                    disabled={!isAccessible}
                    title={!isAccessible ? 'Lengkapi data wajib pada tahap sebelumnya terlebih dahulu' : s.title}
                    className={`flex items-center gap-2 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-blue-50 text-[#145DA0] border border-blue-200 shadow-2xs ring-1 ring-blue-300 cursor-default'
                        : isPassed && isStepValid
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100/60 cursor-pointer'
                          : isAccessible
                            ? 'bg-slate-100 text-slate-700 border border-slate-200/70 hover:bg-slate-200/60 cursor-pointer'
                            : 'bg-slate-100/60 text-slate-400 border border-slate-200/50 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                        isActive
                          ? 'bg-[#145DA0] text-white'
                          : isPassed && isStepValid
                            ? 'bg-emerald-600 text-white'
                            : isAccessible
                              ? 'bg-slate-300 text-slate-700'
                              : 'bg-slate-200 text-slate-400'
                      }`}
                    >
                      {isPassed && isStepValid && !isActive ? (
                        <Check className="w-2.5 h-2.5" />
                      ) : !isAccessible ? (
                        <Lock className="w-2.5 h-2.5" />
                      ) : (
                        s.id
                      )}
                    </span>
                    <span className="truncate">{s.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Validation Alert */}
          {validationError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 flex items-start gap-2.5 shadow-2xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-rose-950">Kelengkapan Data Belum Selesai</p>
                <p className="text-[11px] text-rose-800 mt-0.5">{validationError}</p>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAHAP 1: DATA UTAMA KORBAN & RUMAH SAKIT
          ══════════════════════════════════════════════════════ */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-fadeIn">
              {/* Info Korban Terdaftar (Tetap Bisa Lanjut Mengisi Form — Otomatis Masuk ke Korban yang Sama) */}
              {duplicateMatches.length > 0 && ignoredDuplicateId !== 'CONFIRMED_DIFFERENT' && (
                <div className="p-3.5 rounded-xl bg-sky-50/90 border border-sky-200 text-sky-950 space-y-2.5 shadow-2xs">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-start gap-2">
                      <Activity className="w-4 h-4 text-[#145DA0] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-slate-900 text-xs block">
                          Korban Sudah Terdaftar ({duplicateMatches[0].nama} · NIK: {duplicateMatches[0].nik || '—'})
                        </span>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Anda tetap dapat melanjutkan pengisian formulir ini. Saat disimpan, data akan otomatis masuk ke riwayat korban tersebut sebagai episode/pemantauan baru (tanpa membuat data duplikat).
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenExistingVictim(duplicateMatches[0].id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-50 text-[#145DA0] border border-sky-200 cursor-pointer shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat Riwayat</span>
                    </button>
                  </div>
                  {!duplicateMatches.some((d) => d.exactNikMatch) && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setIgnoredDuplicateId('CONFIRMED_DIFFERENT')}
                        className="text-[11px] font-semibold text-slate-600 underline hover:text-slate-900 cursor-pointer"
                      >
                        Ini korban berbeda (buat data baru)
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* A. DATA UTAMA KORBAN */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3.5">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <User className="w-4 h-4 text-[#145DA0]" />
                  <span>A. Data Utama Korban</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Nama Korban <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="nama"
                      value={formData.nama}
                      onChange={handleChange}
                      placeholder="Masukkan nama lengkap korban"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#145DA0]/20 focus:border-[#145DA0]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      NIK / No. Identitas Korban
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="nik"
                        value={formData.nik}
                        onChange={(e) => {
                          setNikCheckStatus(null);
                          handleChange(e);
                        }}
                        placeholder="16 digit NIK KTP"
                        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#145DA0]/20 focus:border-[#145DA0]"
                      />
                      <button
                        type="button"
                        onClick={handleCheckNikDatabase}
                        disabled={isCheckingNik}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        {isCheckingNik ? 'Mengecek...' : 'Cek NIK'}
                      </button>
                    </div>
                    {nikCheckStatus === 'NOT_FOUND' && (
                      <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                        NIK belum terdaftar di database. Anda dapat melanjutkan input sebagai data korban baru.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Usia &amp; Jenis Kelamin
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        name="usia"
                        value={formData.usia}
                        onChange={handleChange}
                        placeholder="Usia"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 bg-white"
                      />
                      <select
                        name="jenisKelamin"
                        value={formData.jenisKelamin}
                        onChange={handleChange}
                        className="w-full rounded-xl border border-slate-200 px-2.5 py-2 text-slate-800 bg-white"
                      >
                        <option value="Laki-laki">Laki-laki</option>
                        <option value="Perempuan">Perempuan</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Nomor Telepon Korban / Keluarga
                    </label>
                    <input
                      type="text"
                      name="telepon"
                      value={formData.telepon}
                      onChange={handleChange}
                      placeholder="Contoh: 0812-3456-7890"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 bg-white"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Alamat Domisili Korban
                    </label>
                    <input
                      type="text"
                      name="alamat"
                      value={formData.alamat}
                      onChange={handleChange}
                      placeholder="Alamat tempat tinggal korban"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* B. RUMAH SAKIT & INFORMASI KECELAKAAN */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3.5">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <Building2 className="w-4 h-4 text-[#145DA0]" />
                  <span>B. Rumah Sakit &amp; Informasi Kecelakaan</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Rumah Sakit Tempat Dirawat <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="rumahSakit"
                      value={formData.rumahSakit}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#145DA0]/20 focus:border-[#145DA0]"
                    >
                      {availableHospitals.length > 0 ? (
                        availableHospitals.map((rs) => (
                          <option key={rs} value={rs}>
                            {rs}
                          </option>
                        ))
                      ) : (
                        <option value="">Belum ada rumah sakit yang di-plotting</option>
                      )}
                    </select>

                    <div className="mt-2 p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/80 flex items-center justify-between text-xs gap-2 flex-wrap">
                      <span className="text-slate-600 font-semibold flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-[#0A3981]" />
                        <span>Petugas Penanggung Jawab:</span>
                      </span>
                      {currentAssignedOfficer?.nama ? (
                        <span className="font-bold text-[#0A3981] bg-white px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs">
                          {currentAssignedOfficer.nama}
                        </span>
                      ) : (
                        <span className="font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300">
                          Belum Ada Petugas Penanggung Jawab
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Tempat Kecelakaan (TKP) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="lokasiKejadian"
                      value={formData.lokasiKejadian}
                      onChange={handleChange}
                      placeholder="Contoh: Jl. Sudirman Pekanbaru"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#145DA0]/20 focus:border-[#145DA0]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Tanggal &amp; Waktu Kecelakaan <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      name="tanggalKecelakaan"
                      value={formData.tanggalKecelakaan}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Tanggal &amp; Waktu Masuk RS <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      name="tanggalMasukRs"
                      value={formData.tanggalMasukRs}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAHAP 2: KUNJUNGAN PERTAMA (KONDISI & TINDAKAN)
          ══════════════════════════════════════════════════════ */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="catatKunjunganSekaligus"
                    checked={formData.catatKunjunganSekaligus}
                    onChange={handleChange}
                    className="rounded text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-900 text-xs block">
                      Catat Kunjungan Pertama Sekaligus Sekarang
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Centang jika Anda langsung melakukan kunjungan ke rumah sakit hari ini.
                    </span>
                  </div>
                </label>
              </div>

              {formData.catatKunjunganSekaligus ? (
                <>
                  {/* Kondisi Korban (Card Radio Buttons seperti FormPemantauanModal) */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                        Kondisi Korban Saat Ini <span className="text-red-500">*</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Pilih kondisi terbaru korban berdasarkan pengecekan faktual petugas di faskes.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {KONDISI_OPTIONS.map((opt) => {
                        const selected = formData.kondisiAwal === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setFormData((prev) => ({ ...prev, kondisiAwal: opt.value }));
                              setValidationError('');
                            }}
                            className={`text-left p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                              selected
                                ? 'bg-blue-50/70 border-[#145DA0] ring-1 ring-[#145DA0]'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                                selected ? 'border-[#145DA0] bg-[#145DA0]' : 'border-slate-300 bg-white'
                              }`}
                            >
                              {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                            <div>
                              <span className="font-bold text-slate-900 block text-xs">{opt.label}</span>
                              <span className="text-[10px] text-slate-500 leading-snug block mt-0.5">{opt.desc}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Keluarga / Pendamping (Opsional) */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                        Keluarga / Pendamping yang Ditemui <span className="text-slate-400 font-normal">(Opsional)</span>
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">Opsional</span>
                    </div>
                    <input
                      type="text"
                      name="komunikasiKeluarga"
                      value={formData.komunikasiKeluarga}
                      onChange={handleChange}
                      placeholder="Contoh: Ibu Siti (Istri korban) / Perawat IGD"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 bg-white"
                    />
                  </div>

                  {/* Checklist SOP & Catatan Hasil Kunjungan */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                    <span className="font-bold text-slate-800 block text-xs uppercase tracking-wider">
                      Checklist Tindakan &amp; Catatan Kunjungan
                    </span>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          name="cekKomunikasiKeluarga"
                          checked={formData.cekKomunikasiKeluarga}
                          onChange={handleChange}
                          className="rounded text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer"
                        />
                        <span className="text-slate-800 font-medium">Komunikasi langsung dengan korban / keluarga</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          name="cekEdukasiSantunan"
                          checked={formData.cekEdukasiSantunan}
                          onChange={handleChange}
                          className="rounded text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer"
                        />
                        <span className="text-slate-800 font-medium">Edukasi hak dan kepastian santunan Jasa Raharja</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          name="cekArahanLp"
                          checked={formData.cekArahanLp}
                          onChange={handleChange}
                          className="rounded text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer"
                        />
                        <span className="text-slate-800 font-medium">Arahan pengurusan Laporan Polisi (LP) Laka Lantas</span>
                      </label>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Catatan Hasil Kunjungan / Komunikasi <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        name="hasilKunjunganAwal"
                        rows={3}
                        value={formData.hasilKunjunganAwal}
                        onChange={handleChange}
                        placeholder="Catatan kondisi luka fisik korban, tindakan medis, atau konfirmasi penjaminan Jasa Raharja..."
                        className="w-full rounded-xl border border-slate-200 p-3 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#145DA0]/20 focus:border-[#145DA0]"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-2">
                  <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="font-bold text-slate-800 text-xs">
                    Hanya Mendaftarkan Data Korban (Tanpa Kunjungan Awal)
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                    Korban akan masuk ke daftar tunggu kunjungan awal dengan batas waktu SLA 3 hari (72 jam). Anda dapat langsung melanjutkan ke tahap berikutnya.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAHAP 3: DOKUMENTASI & GPS
          ══════════════════════════════════════════════════════ */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-fadeIn">
              {formData.catatKunjunganSekaligus ? (
                <div className="space-y-4">
                  <GpsCapture
                    onLocationCaptured={setGpsData}
                    initialLocation={gpsData}
                    hospitalName={formData.rumahSakit}
                  />

                  <CameraCapture
                    onPhotoCaptured={setPhotoData}
                    initialPhoto={photoData}
                    metadata={{
                      petugasNama: currentUser?.profile?.nama || 'Petugas Jasa Raharja',
                      rumahSakit: formData.rumahSakit,
                      korbanNama: formData.nama,
                      latitude: gpsData?.latitude ?? gpsData?.lat_petugas,
                      longitude: gpsData?.longitude ?? gpsData?.lng_petugas,
                      akurasiLokasi: gpsData?.akurasiLokasi ?? gpsData?.akurasi_lokasi_meter,
                      sumberKoordinat: gpsData?.sumberKoordinat ?? gpsData?.sumber_koordinat,
                      isSimulated: gpsData?.isSimulated,
                      waktu: formData.tanggalMasukRs || new Date().toISOString()
                    }}
                  />
                </div>
              ) : (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-2">
                  <MapPin className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="font-bold text-slate-800 text-xs">
                    Dokumentasi &amp; GPS Dilewati
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                    Karena opsi pencatatan kunjungan pertama tidak dicentang, dokumentasi foto dan GPS akan dilengkapi saat petugas mengunjungi rumah sakit.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAHAP 4: REVIEW & SIMPAN
          ══════════════════════════════════════════════════════ */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider border-b border-slate-200 pb-2">
                  Ringkasan Data Korban Baru
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Nama Korban</span>
                    <strong className="text-slate-900">{formData.nama}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">NIK / Identitas</span>
                    <strong className="text-slate-800 font-mono">{formData.nik || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Rumah Sakit</span>
                    <strong className="text-[#145DA0]">{formData.rumahSakit}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Petugas Penanggung Jawab</span>
                    <strong className="text-slate-800">{currentAssignedOfficer?.nama || 'Belum Ditentukan'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Lokasi Kecelakaan (TKP)</span>
                    <strong className="text-slate-800">{formData.lokasiKejadian}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">No. Telepon</span>
                    <strong className="text-slate-800">{formData.telepon || '—'}</strong>
                  </div>
                </div>

                {formData.catatKunjunganSekaligus && (
                  <div className="pt-3 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Kunjungan Pertama</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-[#145DA0]">
                        {formData.kondisiAwal}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200">
                      {formData.hasilKunjunganAwal}
                    </p>
                    <div className="flex items-center gap-4 text-[11px] text-slate-600">
                      <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        GPS Terkunci ({Number(gpsData?.latitude ?? gpsData?.lat_petugas).toFixed(4)}, {Number(gpsData?.longitude ?? gpsData?.lng_petugas).toFixed(4)})
                      </span>
                      <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Foto Dokumentasi Siap
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── NAVIGATION FOOTER BUTTONS ── */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2.5">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Sebelumnya</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Batal
              </button>
            )}

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-sm transition-all cursor-pointer"
              >
                <span>Lanjutkan</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Data Korban'}</span>
              </button>
            )}
          </div>
        </form>
      </Modal>

      {/* Dialog Konfirmasi Transisi Perawatan / Rujukan */}
      {transitionTargetVictim && (
        <PatientTransitionModal
          isOpen={Boolean(transitionTargetVictim)}
          onClose={() => setTransitionTargetVictim(null)}
          victim={transitionTargetVictim}
          transitionType={transitionType}
          targetHospitalDefault={formData.rumahSakit || transitionTargetVictim.rumahSakit}
          onConfirmed={(updated) => {
            setTransitionTargetVictim(null);
            onClose();
            if (onVictimCreated) {
              onVictimCreated(updated);
            }
            navigate(`/petugas/korban/${updated.id}`);
          }}
        />
      )}
    </>
  );
}
