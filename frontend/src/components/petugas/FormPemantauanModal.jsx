import { useState, useEffect, useMemo } from 'react';
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
import { isVictimFinished } from '../../utils/monitoringStatus';
import {
  AlertOctagon,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Save,
  User,
  Users,
  Phone,
  ArrowUpRight,
  Activity,
  History,
  ChevronDown,
  ChevronUp,
  MapPin,
  Lock,
  ArrowLeft,
  ArrowRight,
  Edit3,
  Check,
  Sparkles
} from 'lucide-react';

const HUBUNGAN_KELUARGA_OPTIONS = [
  'Istri / Suami',
  'Anak Kandung',
  'Orang Tua (Ayah / Ibu)',
  'Saudara Kandung (Kakak / Adik)',
  'Kerabat / Keluarga Lainnya',
  'Pendamping / Kuasa Pasien'
];

const OPSI_CHECKLIST_TINDAKAN = [
  'Memastikan kondisi terbaru korban',
  'Berkomunikasi dengan korban atau keluarga',
  'Memberikan Edukasi kepada pihak keluarga korban',
  'Mengarahkan keluarga untuk mengurus Laporan Polisi (LP), jika diperlukan',
  'Memastikan perkembangan perawatan korban di rumah sakit',
  'Melakukan koordinasi dengan pihak rumah sakit',
  'Memastikan tindak lanjut atau kelengkapan berkas'
];

const OPSI_KEBUTUHAN_LANJUTAN = [
  'Menunggu informasi perkembangan korban',
  'Menunggu konfirmasi dari rumah sakit',
  'Menunggu kelengkapan berkas',
  'Perlu menghubungi keluarga kembali',
  'Perlu melakukan kunjungan berikutnya'
];

const STEPS = [
  { id: 1, title: 'Informasi Kunjungan', desc: 'Waktu & Faskes' },
  { id: 2, title: 'Hasil Kunjungan', desc: 'Kondisi & Tindakan' },
  { id: 3, title: 'Dokumentasi & GPS', desc: 'Foto & Titik GPS' },
  { id: 4, title: 'Review & Simpan', desc: 'Verifikasi Akhir' }
];

/**
 * Mengambil data pemantauan terakhir korban yang sama secara cerdas
 * Memastikan identitas korban, faskes, kontak keluarga/pendamping, dan data relevan lainnya
 * otomatis terisi kembali dari pemantauan korban yang sama tanpa menimpa data sebelumnya.
 */
function extractPreviousMonitoringDefaults(victim) {
  if (!victim) {
    return {
      namaKeluarga: '',
      hubunganKeluarga: 'Istri / Suami',
      kontakKeluarga: '',
      perkembanganLuka: '',
      biayaPerawatan: '',
      kondisi: 'Masih Dirawat',
      checklistTindakan: [
        'Memastikan kondisi terbaru korban',
        'Berkomunikasi dengan korban atau keluarga',
        'Memberikan Edukasi kepada pihak keluarga korban',
        'Memastikan perkembangan perawatan korban di rumah sakit'
      ],
      hasPreviousFamily: false,
      hasPreviousLuka: false,
      hasPreviousBiaya: false,
      hasAnyPreviousData: false
    };
  }

  const rawActivities = Array.isArray(victim.riwayatAktivitas) && victim.riwayatAktivitas.length > 0
    ? victim.riwayatAktivitas
    : (Array.isArray(victim.riwayatKunjungan) && victim.riwayatKunjungan.length > 0
      ? victim.riwayatKunjungan
      : (Array.isArray(victim.riwayatPemantauan) ? victim.riwayatPemantauan : []));

  const list = [...rawActivities];
  if (victim.kunjunganPertama && !list.some((a) => (a.id && a.id === victim.kunjunganPertama.id) || (a.visitId && a.visitId === victim.kunjunganPertama.visitId))) {
    list.push(victim.kunjunganPertama);
  }

  const completed = list
    .filter((a) => a && a.statusKunjungan !== 'Menunggu')
    .sort((a, b) => new Date(b.waktuAktualKunjungan || b.tanggal || b.created_at || 0) - new Date(a.waktuAktualKunjungan || a.tanggal || a.created_at || 0));

  const lastVisit = completed[0] || null;

  // 1. Ekstrak Kontak Keluarga / Pendamping (Opsional)
  let namaKeluarga = lastVisit?.namaKeluarga || victim?.namaKeluarga || victim?.keluargaNama || '';
  let hubunganKeluarga = lastVisit?.hubunganKeluarga || victim?.hubunganKeluarga || 'Istri / Suami';
  let kontakKeluarga = lastVisit?.kontakKeluarga || victim?.kontakKeluarga || victim?.teleponKeluarga || victim?.noHpKeluarga || '';

  const rawCatatan = lastVisit?.catatan_kondisi || lastVisit?.hasilPemantauan || lastVisit?.hasilKomunikasi || '';
  if (!namaKeluarga && typeof rawCatatan === 'string') {
    const famMatch = rawCatatan.match(/Keluarga ditemui:\s*([^(]+?)\s*\(([^,)]+)(?:,\s*Telp:\s*([^)]+))?\)/i);
    if (famMatch) {
      namaKeluarga = famMatch[1]?.trim() || '';
      hubunganKeluarga = famMatch[2]?.trim() || hubunganKeluarga;
      kontakKeluarga = famMatch[3]?.trim() || kontakKeluarga;
    }
  }

  return {
    namaKeluarga,
    hubunganKeluarga,
    kontakKeluarga,
    hasPreviousFamily: Boolean(namaKeluarga),
    hasAnyPreviousData: Boolean(lastVisit)
  };
}

export default function FormPemantauanModal({ isOpen, onClose, victim, onMonitoringSaved }) {
  const { currentUser } = useAuth();

  const nowString = () => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const [currentStep, setCurrentStep] = useState(1);

  const [formData, setFormData] = useState({
    waktuPemantauan: nowString(),
    kondisi: '',
    rumahSakitRujukan: '',
    statusKonfirmasi: 'Terkonfirmasi',
    keteranganKonfirmasi: '',
    tanggalMeninggal: '',
    jamMeninggal: '',
    // Kontak Keluarga / Pendamping (Opsional)
    namaKeluarga: '',
    hubunganKeluarga: 'Istri / Suami',
    kontakKeluarga: '',
    // C. Checklist Tindak Lanjut Petugas
    checklistTindakan: [],
    // D. Status Tindak Lanjut
    statusTindakLanjut: '',
    checklistKebutuhanLanjutan: [],
    // E. Catatan Tambahan
    catatanTambahan: ''
  });

  const previousDefaults = useMemo(() => {
    return extractPreviousMonitoringDefaults(victim);
  }, [victim]);

  const [photos, setPhotos] = useState([]);
  const [photoData, setPhotoData] = useState(null);
  const [gpsData, setGpsData] = useState(null);
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedPreviewPhoto, setSelectedPreviewPhoto] = useState(null);
  const [hospitalsList, setHospitalsList] = useState(INITIAL_HOSPITALS);

  // Helper session storage untuk menjamin data tetap utuh saat buka kamera di browser HP
  const getSessionKey = (vicId) => `jr_monitoring_form_${vicId}`;

  const persistFormState = (fData, pPhotos, gData, step = currentStep) => {
    const vicId = victim?.id || victim?.caseId;
    if (!vicId) return;
    try {
      const payload = {
        victimId: String(vicId),
        formData: fData,
        photos: pPhotos,
        gpsData: gData,
        currentStep: step,
        savedAt: fData?.waktuPemantauan || 'current'
      };
      sessionStorage.setItem(getSessionKey(vicId), JSON.stringify(payload));
      sessionStorage.setItem('jr_active_monitoring_victim_id', String(vicId));
    } catch {
      // ignore
    }
  };

  const clearFormSession = (vicId) => {
    if (!vicId) return;
    try {
      sessionStorage.removeItem(getSessionKey(vicId));
      if (sessionStorage.getItem('jr_active_monitoring_victim_id') === String(vicId)) {
        sessionStorage.removeItem('jr_active_monitoring_victim_id');
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    storageService.getOrFetchHospitals().then((res) => {
      if (Array.isArray(res)) {
        setHospitalsList(res.map((h) => typeof h === 'string' ? h : h.nama_rs).filter(Boolean));
      }
    }).catch(() => { });
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

  const isFinishedVictim = isVictimFinished(victim);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen && victim) {
      const vicId = victim.id || victim.caseId;

      // Cek apakah ada data tersimpan sementara dari sesi pengisian sebelumnya (misal kembali dari kamera HP)
      let restored = null;
      try {
        const activeVicId = sessionStorage.getItem('jr_active_monitoring_victim_id');
        if (activeVicId && String(activeVicId) === String(vicId)) {
          const raw = sessionStorage.getItem(getSessionKey(vicId));
          if (raw) {
            const parsed = JSON.parse(raw);
            if (String(parsed.victimId) === String(vicId)) {
              restored = parsed;
            }
          }
        }
      } catch {
        // ignore
      }

      if (restored) {
        if (restored.formData) {
          setFormData(restored.formData);
        }
        if (Array.isArray(restored.photos) && restored.photos.length > 0) {
          setPhotos(restored.photos);
          setPhotoData(restored.photos[0]);
        }
        if (restored.gpsData) {
          setGpsData(restored.gpsData);
        }
        if (restored.currentStep) {
          setCurrentStep(restored.currentStep);
        }
      } else {
        // Form baru dibuka: Muat data otomatis dari riwayat pemantauan sebelumnya korban yang sama
        const defaults = extractPreviousMonitoringDefaults(victim);
        setCurrentStep(1);
        setFormData({
          waktuPemantauan: nowString(),
          kondisi: '',
          rumahSakitRujukan: '',
          statusKonfirmasi: 'Terkonfirmasi',
          keteranganKonfirmasi: '',
          tanggalMeninggal: victim.tanggalMeninggal || '',
          jamMeninggal: victim.jamMeninggal || '',
          namaKeluarga: defaults.namaKeluarga,
          hubunganKeluarga: defaults.hubunganKeluarga,
          kontakKeluarga: defaults.kontakKeluarga,
          checklistTindakan: [],
          statusTindakLanjut: '',
          checklistKebutuhanLanjutan: [],
          catatanTambahan: ''
        });
        setPhotos([]);
        setPhotoData(null);
        setGpsData(null);
        setValidationError('');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, victim?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleClose = () => {
    const vicId = victim?.id || victim?.caseId;
    clearFormSession(vicId);
    setValidationError('');
    setIsSubmitting(false);
    setCurrentStep(1);
    onClose();
  };

  const updateFormField = (field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      persistFormState(next, photos, gpsData, currentStep);
      return next;
    });
    setValidationError('');
  };

  const handleToggleTindakan = (opsi) => {
    setFormData((prev) => {
      const exists = prev.checklistTindakan.includes(opsi);
      const next = {
        ...prev,
        checklistTindakan: exists
          ? prev.checklistTindakan.filter((item) => item !== opsi)
          : [...prev.checklistTindakan, opsi]
      };
      persistFormState(next, photos, gpsData, currentStep);
      return next;
    });
    setValidationError('');
  };

  const isAllTindakanSelected =
    OPSI_CHECKLIST_TINDAKAN.length > 0 &&
    OPSI_CHECKLIST_TINDAKAN.every((item) => formData.checklistTindakan.includes(item));

  const isSomeTindakanSelected =
    formData.checklistTindakan.length > 0 && !isAllTindakanSelected;

  const handleToggleAllTindakan = () => {
    setFormData((prev) => {
      const next = {
        ...prev,
        checklistTindakan: isAllTindakanSelected ? [] : [...OPSI_CHECKLIST_TINDAKAN]
      };
      persistFormState(next, photos, gpsData, currentStep);
      return next;
    });
    setValidationError('');
  };

  const handleToggleKebutuhanLanjutan = (opsi) => {
    setFormData((prev) => {
      const exists = prev.checklistKebutuhanLanjutan.includes(opsi);
      const next = {
        ...prev,
        checklistKebutuhanLanjutan: exists
          ? prev.checklistKebutuhanLanjutan.filter((item) => item !== opsi)
          : [...prev.checklistKebutuhanLanjutan, opsi]
      };
      persistFormState(next, photos, gpsData, currentStep);
      return next;
    });
    setValidationError('');
  };

  const handleLocationCaptured = (loc) => {
    setGpsData(loc);
    persistFormState(formData, photos, loc, currentStep);
    if (validationError && (validationError.includes('GPS') || validationError.includes('maps') || validationError.includes('koordinat'))) {
      setValidationError('');
    }
  };

  const handlePhotosChanged = (newPhotos) => {
    setPhotos(newPhotos);
    const primary = newPhotos[0] || null;
    setPhotoData(primary);
    persistFormState(formData, newPhotos, gpsData, currentStep);
    if (validationError && (validationError.includes('foto') || validationError.includes('upload'))) {
      setValidationError('');
    }
  };

  const handlePhotoCaptured = (singlePhoto) => {
    setPhotoData(singlePhoto);
    if (singlePhoto && photos.length === 0) {
      setPhotos([singlePhoto]);
      persistFormState(formData, [singlePhoto], gpsData, currentStep);
    } else {
      persistFormState(formData, photos, gpsData, currentStep);
    }
    if (validationError && (validationError.includes('foto') || validationError.includes('upload'))) {
      setValidationError('');
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' WIB';
    } catch {
      return dateStr;
    }
  };

  const previousVisitDate =
    victim?.tanggalKunjunganTerakhir ||
    victim?.waktuPemantauanTerakhir ||
    victim?.kunjunganPertama?.tanggalKunjungan ||
    victim?.tanggalInformasiDiterima;

  const intervalCheck = useMemo(() => {
    return checkVisitInterval(previousVisitDate, formData.waktuPemantauan);
  }, [previousVisitDate, formData.waktuPemantauan]);

  const visitNumber = useMemo(() => {
    const existingCount = Array.isArray(victim?.riwayatAktivitas)
      ? victim.riwayatAktivitas.filter((a) => a.statusKunjungan !== 'Menunggu').length
      : (victim?.kunjunganPertama ? 1 : 0);
    return existingCount + 1;
  }, [victim]);

  const previousActivities = useMemo(() => {
    if (!victim || !Array.isArray(victim.riwayatAktivitas)) return [];
    return [...victim.riwayatAktivitas]
      .filter((a) => a.statusKunjungan !== 'Menunggu')
      .sort((a, b) => new Date(b.tanggal || b.created_at || 0) - new Date(a.tanggal || a.created_at || 0));
  }, [victim]);

  // ── VALIDASI PER TAHAPAN STEPPER ──
  const getStepValidation = (stepId) => {
    if (stepId === 1) {
      if (!formData.waktuPemantauan) {
        return { isValid: false, field: 'waktuPemantauan', error: 'Tanggal dan waktu pemantauan aktual wajib terisi pada Tahap 1 (*).' };
      }
      return { isValid: true, error: null };
    }

    if (stepId === 2) {
      if (!formData.kondisi) {
        return { isValid: false, field: 'kondisi', error: 'Pilih kondisi terbaru korban saat ini pada Tahap 2 (*).' };
      }

      if (formData.kondisi === 'Meninggal Dunia') {
        if (!formData.tanggalMeninggal) {
          return { isValid: false, field: 'tanggalMeninggal', error: 'Tanggal meninggal dunia wajib diisi pada Tahap 2 (*).' };
        }
        if (!formData.jamMeninggal) {
          return { isValid: false, field: 'jamMeninggal', error: 'Jam meninggal dunia wajib diisi pada Tahap 2 (*).' };
        }
        const deathDateTime = new Date(`${formData.tanggalMeninggal}T${formData.jamMeninggal}`);
        const maxTime = new Date(formData.waktuPemantauan).getTime();
        if (deathDateTime.getTime() > maxTime) {
          return { isValid: false, field: 'tanggalMeninggal', error: 'Tanggal dan jam meninggal dunia tidak boleh berada di masa depan.' };
        }
        if (!formData.statusKonfirmasi) {
          return { isValid: false, field: 'statusKonfirmasi', error: 'Status keabsahan konfirmasi meninggal dunia wajib dipilih (*).' };
        }
        if (!formData.keteranganKonfirmasi?.trim()) {
          return { isValid: false, field: 'keteranganKonfirmasi', error: 'Keterangan sumber konfirmasi medis meninggal dunia wajib diisi (*).' };
        }
      }

      if (formData.kondisi === 'Dirujuk' && !formData.rumahSakitRujukan?.trim()) {
        return { isValid: false, field: 'rumahSakitRujukan', error: 'Pilih fasilitas kesehatan atau rumah sakit tujuan rujukan (*).' };
      }

      // CATATAN: Informasi keluarga/pendamping, perkembangan luka, dan biaya perawatan adalah OPSIONAL.
      // Petugas dapat melanjutkan pengisian tanpa mengisinya.

      if (!Array.isArray(formData.checklistTindakan) || formData.checklistTindakan.length === 0) {
        return { isValid: false, field: 'checklistTindakan', error: 'Pilih minimal satu tindakan yang telah dilaksanakan pada pemantauan ini (*).' };
      }

      if (!formData.statusTindakLanjut) {
        return { isValid: false, field: 'statusTindakLanjut', error: 'Tentukan status tindak lanjut hasil pemantauan (*).' };
      }

      if (
        formData.statusTindakLanjut === 'Masih Perlu Ditindaklanjuti' &&
        (!Array.isArray(formData.checklistKebutuhanLanjutan) || formData.checklistKebutuhanLanjutan.length === 0) &&
        !formData.catatanTambahan?.trim()
      ) {
        return {
          isValid: false,
          field: 'checklistKebutuhanLanjutan',
          error: 'Pilih minimal satu kebutuhan tindak lanjut atau tuliskan pada catatan tambahan (*).'
        };
      }

      return { isValid: true, error: null };
    }

    if (stepId === 3) {
      const hasValidGps = gpsData &&
        Number.isFinite(Number(gpsData.latitude ?? gpsData.lat_petugas)) &&
        Number.isFinite(Number(gpsData.longitude ?? gpsData.lng_petugas));

      if (!hasValidGps) {
        return { isValid: false, field: 'gps', error: 'Koordinat lokasi GPS lapangan wajib terkunci sebelum melanjutkan (*).' };
      }

      const effectivePhoto = photoData || (Array.isArray(photos) && photos.length > 0 ? photos[0] : null);
      if (!effectivePhoto) {
        return { isValid: false, field: 'photo', error: 'Foto bukti fisik kunjungan lapangan wajib dilampirkan (*).' };
      }

      return { isValid: true, error: null };
    }

    return { isValid: true, error: null };
  };

  const currentStepValidation = getStepValidation(currentStep);
  const isCurrentStepValid = currentStepValidation.isValid;

  const canJumpToStep = (targetStep) => {
    if (targetStep <= currentStep) return true;
    for (let s = 1; s < targetStep; s++) {
      if (!getStepValidation(s).isValid) return false;
    }
    return true;
  };

  const isAllStepsValid = [1, 2, 3].every((s) => getStepValidation(s).isValid);

  const handleNextStep = () => {
    const val = getStepValidation(currentStep);
    if (!val.isValid) {
      setValidationError(val.error);
      return;
    }
    setValidationError('');
    const next = Math.min(4, currentStep + 1);
    setCurrentStep(next);
    persistFormState(formData, photos, gpsData, next);
  };

  const handlePrevStep = () => {
    setValidationError('');
    const prev = Math.max(1, currentStep - 1);
    setCurrentStep(prev);
    persistFormState(formData, photos, gpsData, prev);
  };

  const handleStepClick = (targetStep) => {
    if (targetStep === currentStep) return;
    if (targetStep < currentStep) {
      setValidationError('');
      setCurrentStep(targetStep);
      persistFormState(formData, photos, gpsData, targetStep);
      return;
    }
    // Validasi step-step sebelumnya sebelum melompat maju
    for (let s = 1; s < targetStep; s++) {
      const val = getStepValidation(s);
      if (!val.isValid) {
        setCurrentStep(s);
        setValidationError(val.error);
        persistFormState(formData, photos, gpsData, s);
        return;
      }
    }
    setValidationError('');
    setCurrentStep(targetStep);
    persistFormState(formData, photos, gpsData, targetStep);
  };

  const jumpToField = (stepId, errorMsg) => {
    setCurrentStep(stepId);
    setValidationError(errorMsg);
    persistFormState(formData, photos, gpsData, stepId);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setValidationError('');

    if (isFinishedVictim) {
      setValidationError('Pemantauan korban ini telah berstatus Selesai. Formulir tidak dapat disimpan lagi.');
      return;
    }

    // Validasi Tahap 2 (Hasil Kunjungan)
    const val2 = getStepValidation(2);
    if (!val2.isValid) {
      jumpToField(2, val2.error);
      return;
    }

    // Validasi Tahap 3 (Dokumentasi & GPS)
    const val3 = getStepValidation(3);
    if (!val3.isValid) {
      jumpToField(3, val3.error);
      return;
    }

    const effectivePhoto = photoData || photos[0];
    setIsSubmitting(true);

    try {
      // Susun ringkasan terstruktur dari checklist sehingga riwayat memiliki teks yang jelas
      const ringkasanTindakan = formData.checklistTindakan.join(', ');
      const ringkasanKebutuhan = formData.statusTindakLanjut === 'Sudah Selesai'
        ? 'Status tindak lanjut: Sudah selesai.'
        : `Tindak lanjut masih diperlukan: ${formData.checklistKebutuhanLanjutan.join(', ') || 'Dalam proses'}.`;

      const infoKeluarga = formData.namaKeluarga?.trim()
        ? `Keluarga ditemui: ${formData.namaKeluarga.trim()} (${formData.hubunganKeluarga || 'Keluarga'}${formData.kontakKeluarga?.trim() ? `, Telp: ${formData.kontakKeluarga.trim()}` : ''}).`
        : null;

      const autoSummary = [
        `Kondisi: ${formData.kondisi}.`,
        infoKeluarga,
        `Tindakan petugas: ${ringkasanTindakan}.`,
        ringkasanKebutuhan,
        formData.catatanTambahan ? `Catatan: ${formData.catatanTambahan.trim()}` : null
      ].filter(Boolean).join(' ');

      const tindakLanjutTeks = formData.statusTindakLanjut === 'Sudah Selesai'
        ? 'Tindak lanjut pemantauan selesai'
        : (formData.checklistKebutuhanLanjutan.join(', ') || formData.catatanTambahan.trim() || 'Perlu pemantauan lanjutan');

      const primaryPhoto = effectivePhoto;

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
        tanggalMeninggal: formData.kondisi === 'Meninggal Dunia' ? formData.tanggalMeninggal : null,
        jamMeninggal: formData.kondisi === 'Meninggal Dunia' ? formData.jamMeninggal : null,
        waktuMeninggal: formData.kondisi === 'Meninggal Dunia' ? new Date(`${formData.tanggalMeninggal}T${formData.jamMeninggal}`).toISOString() : null,
        dicatatOleh: currentUser?.profile?.nama || victim.namaPetugas || 'Petugas Jasa Raharja',
        waktuPencatatanMD: formData.kondisi === 'Meninggal Dunia' ? new Date().toISOString() : null,
        rumahSakitRujukan: formData.kondisi === 'Dirujuk' ? formData.rumahSakitRujukan.trim() : null,
        alasanRujukan: formData.kondisi === 'Dirujuk' ? (formData.catatanTambahan.trim() || 'Rujukan perawatan ke rumah sakit lain') : null,
        catatanRujukan: formData.kondisi === 'Dirujuk' ? autoSummary : null,

        // Kontak Keluarga / Pendamping (Opsional)
        namaKeluarga: formData.namaKeluarga?.trim() || null,
        hubunganKeluarga: formData.namaKeluarga?.trim() ? (formData.hubunganKeluarga || 'Kerabat / Keluarga Lainnya') : null,
        kontakKeluarga: formData.kontakKeluarga?.trim() || null,

        // Checklist Tindakan & Status Tindak Lanjut
        checklistTindakan: formData.checklistTindakan,
        statusTindakLanjut: formData.statusTindakLanjut,
        checklistKebutuhanLanjutan: formData.statusTindakLanjut === 'Masih Perlu Ditindaklanjuti' ? formData.checklistKebutuhanLanjutan : [],
        catatanTambahan: formData.catatanTambahan.trim() || null,

        hasilPemantauan: autoSummary,
        hasilKomunikasi: autoSummary,
        tindakLanjut: tindakLanjutTeks,
        catatanTindakLanjut: tindakLanjutTeks,

        // Dokumentasi (Foto Utama & Foto Lampiran)
        fotoUrl: primaryPhoto,
        fotoUrls: photos.length > 0 ? photos : [primaryPhoto],
        latitude: Number(gpsData.latitude ?? gpsData.lat_petugas),
        longitude: Number(gpsData.longitude ?? gpsData.lng_petugas),
        lat_petugas: Number(gpsData.lat_petugas ?? gpsData.latitude),
        lng_petugas: Number(gpsData.lng_petugas ?? gpsData.longitude),
        akurasiLokasi: Number.isFinite(Number(gpsData.akurasiLokasi ?? gpsData.akurasi_lokasi_meter)) ? Number(gpsData.akurasiLokasi ?? gpsData.akurasi_lokasi_meter) : null,
        akurasi_lokasi_meter: Number.isFinite(Number(gpsData.akurasi_lokasi_meter ?? gpsData.akurasiLokasi)) ? Number(gpsData.akurasi_lokasi_meter ?? gpsData.akurasiLokasi) : null,
        sumberKoordinat: gpsData.sumberKoordinat ?? gpsData.sumber_koordinat ?? (gpsData.isSimulated ? 'Koordinat Rumah Sakit' : 'GPS Perangkat'),
        sumber_koordinat: gpsData.sumberKoordinat ?? gpsData.sumber_koordinat ?? (gpsData.isSimulated ? 'Koordinat Rumah Sakit' : 'GPS Perangkat'),
        isSimulated: Boolean(gpsData.isSimulated),
        waktuDokumentasi: gpsData?.waktu || new Date().toISOString()
      };

      // Cache seluruh foto ke IndexedDB & memory
      photos.forEach((p, idx) => {
        cachePhoto(`${victim.id}_mon_${idx}`, p);
      });
      if (primaryPhoto) {
        cachePhoto(victim.id, primaryPhoto);
        if (victim.caseId) {
          cachePhoto(victim.caseId, primaryPhoto);
          cachePhoto(`case_${victim.caseId}`, primaryPhoto);
        }
        if (victim.activeVisitId) {
          cachePhoto(victim.activeVisitId, primaryPhoto);
          cachePhoto(`VISIT-${victim.activeVisitId}`, primaryPhoto);
        }
      }

      const updated = await storageService.addMonitoring(victim.id, monPayload);
      setSuccessMessage(true);

      // Bersihkan sesi form setelah data sukses tersimpan
      const vicId = victim.id || victim.caseId;
      clearFormSession(vicId);

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

  const currentHospital = (victim?.isRujukanMasuk && victim?.rumahSakitTujuan)
    ? victim.rumahSakitTujuan
    : (victim?.rumahSakit || 'Rumah Sakit');
  const activeHospital = currentHospital;

  if (!victim) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeOnBackdrop={false}
      title="Tambah Kunjungan"
      subtitle={`${victim.nama} · ${victim.nomorTiket || victim.caseId || `JR/PKU/2025/${String(victim.id).padStart(5, '0')}`}`}
      maxWidth="max-w-3xl"
    >
      {isFinishedVictim ? (
        <div className="py-12 px-4 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
              Pemantauan Selesai
            </span>
            <h3 className="text-base font-bold text-slate-900">Korban Sudah Pulang / Pemantauan Selesai</h3>
          </div>
          <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
            Korban <strong>{victim.nama}</strong> telah berstatus <strong>Selesai (Sudah Pulang)</strong>. Sesuai ketentuan, pencatatan pemantauan berkala telah berakhir dan tidak dapat mencatat pemantauan lagi.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
            >
              Tutup Formulir
            </button>
          </div>
        </div>
      ) : successMessage ? (
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
        <div className="space-y-4 text-xs">
          {/* ── STEPPER WIZARD BAR (Sesuai Desain Pill Stepper) ── */}
          <div className="bg-slate-50/80 border-b border-slate-200/80 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5">
            {/* Progress bar smooth & modern tanpa teks angka */}
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
                    title={!isAccessible ? `Lengkapi data wajib pada tahap sebelumnya terlebih dahulu` : s.title}
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

          {/* Banner Peringatan jika status pemantauan korban sudah Selesai */}
          {isFinishedVictim && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 flex items-start gap-2.5 shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <p className="font-bold">Status Pemantauan Selesai</p>
                <p className="text-emerald-800 mt-0.5">
                  Status pemantauan korban ini sudah berstatus <strong>Selesai</strong>. Pencatatan pemantauan baru tidak diperkenankan.
                </p>
              </div>
            </div>
          )}

          {/* Error Banner jika ada validasi yang belum lengkap */}
          {validationError && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 flex items-start gap-2.5 shadow-2xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold block text-rose-950">Kelengkapan Data Belum Selesai</span>
                <span className="text-[11px] text-rose-800 leading-snug">{validationError}</span>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAHAP 1: INFORMASI KUNJUNGAN
          ══════════════════════════════════════════════════════ */}
          {currentStep === 1 && (
            <div className="space-y-3.5 animate-fadeIn">
              {/* Notifikasi Otomatisasi Data dari Riwayat Sebelumnya */}
              {previousDefaults.hasAnyPreviousData && (
                <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-start gap-2.5 text-blue-900 shadow-2xs">
                  <Sparkles className="w-4 h-4 text-[#145DA0] shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <strong className="block font-bold text-blue-950">Data Otomatis dari Pemantauan Sebelumnya</strong>
                    Identitas korban, fasilitas kesehatan, serta informasi pendamping dan perkembangan terakhir telah dimuat otomatis dari riwayat korban ini. Anda hanya perlu memperbarui data yang mengalami perubahan.
                  </div>
                </div>
              )}

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
                            {victim.rumahSakitTujuan} (Rujukan dari {victim.rumahSakitAsal || victim.rumahSakit})
                          </span>
                        ) : (
                          activeHospital
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
                    Tanggal dan jam dicatat secara otomatis oleh sistem saat form dibuka (waktu forensik tidak dapat dimanipulasi).
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
                          Berjarak <strong>{intervalCheck.durationText}</strong> dari kunjungan sebelumnya ({formatDateTime(previousVisitDate)}). Batas waktu standar maksimal adalah 72 jam (3 hari).
                        </div>
                      </div>
                    ) : (
                      <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Pemantauan tepat waktu ({intervalCheck.durationText} dari kunjungan sebelumnya).</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Accordion Histori Kunjungan Sebelumnya */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-slate-100/70 transition-colors cursor-pointer"
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
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAHAP 2: HASIL KUNJUNGAN & TINDAKAN
          ══════════════════════════════════════════════════════ */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-fadeIn">
              {/* BAGIAN B: KONDISI KORBAN */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div>
                  <label className="block font-bold text-slate-900 text-xs uppercase tracking-wider mb-0.5">
                    B. Kondisi Korban Saat Ini <span className="text-red-500">*</span>
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2.5">
                    Pilih kondisi terbaru korban berdasarkan pengecekan faktual petugas di faskes.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {[
                    { val: 'Masih Dirawat', label: 'Masih Dirawat', desc: 'Dalam perawatan medis / rawat inap di RS' },
                    { val: 'Sudah Pulang', label: 'Sudah Pulang', desc: 'Telah sembuh / diizinkan dokter keluar RS' },
                    { val: 'Dirujuk', label: 'Rujukan (Dirujuk ke RS Lain)', desc: 'Perawatan dialihkan ke faskes rujukan' },
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
                        className={`p-3 rounded-xl border cursor-pointer select-none transition-all flex flex-col justify-between ${isSelected
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
                            onChange={() => updateFormField('kondisi', opt.val)}
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
                      <span>Pengalihan Rumah Sakit Rujukan</span>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Rumah Sakit Tujuan Rujukan <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.rumahSakitRujukan}
                        onChange={(e) => updateFormField('rumahSakitRujukan', e.target.value)}
                        className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 font-medium"
                      >
                        <option value="">-- Pilih Rumah Sakit Rujukan --</option>
                        {hospitalsList
                          .filter((h) => h !== activeHospital)
                          .map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                      </select>
                    </div>

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
                      <span>Pencatatan Korban Meninggal Dunia (MD)</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white rounded-xl border border-red-200">
                      <div>
                        <label className="block font-semibold text-slate-800 mb-1 text-xs">
                          Tanggal Meninggal Dunia <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          required
                          max={new Date().toISOString().split('T')[0]}
                          value={formData.tanggalMeninggal}
                          onChange={(e) => updateFormField('tanggalMeninggal', e.target.value)}
                          className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:ring-red-500 focus:border-red-500"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-800 mb-1 text-xs">
                          Jam Meninggal Dunia <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="time"
                          required
                          value={formData.jamMeninggal}
                          onChange={(e) => updateFormField('jamMeninggal', e.target.value)}
                          className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:ring-red-500 focus:border-red-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Status Keabsahan Konfirmasi <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={formData.statusKonfirmasi}
                          onChange={(e) => updateFormField('statusKonfirmasi', e.target.value)}
                          className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 font-medium"
                        >
                          <option value="Terkonfirmasi">Terkonfirmasi Medis / Surat Kematian RS</option>
                          <option value="Belum Dikonfirmasi">Belum Dikonfirmasi Resmi (Perlu Verifikasi Lanjutan)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Keterangan Sumber Informasi / Bukti <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.keteranganKonfirmasi}
                          onChange={(e) => updateFormField('keteranganKonfirmasi', e.target.value)}
                          placeholder="Contoh: Dokter Jaga ICU, Surat Keterangan Kematian RS..."
                          className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* BAGIAN OPSIONAL: KONTAK KELUARGA / PENDAMPING */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 text-[#145DA0] flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-900 text-xs uppercase tracking-wider">
                        Keluarga / Pendamping yang Ditemui <span className="text-slate-400 font-normal text-[11px] normal-case">(Opsional)</span>
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Isi jika Anda bertemu atau berkomunikasi langsung dengan pihak keluarga atau pendamping korban di faskes.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {previousDefaults.hasPreviousFamily && formData.namaKeluarga && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        <Sparkles className="w-3 h-3 text-[#145DA0]" />
                        Dimuat otomatis dari pemantauan sebelumnya
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                      Opsional
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 text-xs">
                      Nama Keluarga / Pendamping
                    </label>
                    <input
                      type="text"
                      value={formData.namaKeluarga}
                      onChange={(e) => updateFormField('namaKeluarga', e.target.value)}
                      placeholder="Contoh: Ibu Siti Rahmah"
                      className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 text-xs">
                      Hubungan dengan Korban
                    </label>
                    <select
                      value={formData.hubunganKeluarga}
                      onChange={(e) => updateFormField('hubunganKeluarga', e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
                    >
                      {HUBUNGAN_KELUARGA_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 text-xs">
                      No. HP / WhatsApp
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        value={formData.kontakKeluarga}
                        onChange={(e) => updateFormField('kontakKeluarga', e.target.value)}
                        placeholder="0812xxxxxxx"
                        className="w-full text-xs rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
                      />
                      <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* BAGIAN C: CHECKLIST TINDAKAN */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <label className="block font-bold text-slate-900 text-xs uppercase tracking-wider">
                      C. Tindakan yang Telah Dilakukan (Checklist) <span className="text-red-500">*</span>
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Centang tindakan yang benar-benar Anda laksanakan pada pemantauan ini.
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                    {formData.checklistTindakan.length} dari {OPSI_CHECKLIST_TINDAKAN.length} dipilih
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  {OPSI_CHECKLIST_TINDAKAN.map((item, idx) => {
                    const isChecked = formData.checklistTindakan.includes(item);
                    return (
                      <label
                        key={idx}
                        className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${isChecked
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

              {/* BAGIAN D: STATUS TINDAK LANJUT */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div>
                  <label className="block font-bold text-slate-900 text-xs uppercase tracking-wider mb-0.5">
                    D. Status Tindak Lanjut Hasil Pemantauan <span className="text-red-500">*</span>
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Tentukan apakah kebutuhan pemantauan saat ini sudah tuntas atau memerlukan langkah lanjutan.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${formData.statusTindakLanjut === 'Masih Perlu Ditindaklanjuti'
                      ? 'border-amber-500 bg-amber-50/70 shadow-xs ring-1 ring-amber-500'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/40'
                      }`}
                  >
                    <input
                      type="radio"
                      name="statusTindakLanjut"
                      value="Masih Perlu Ditindaklanjuti"
                      checked={formData.statusTindakLanjut === 'Masih Perlu Ditindaklanjuti'}
                      onChange={(e) => updateFormField('statusTindakLanjut', e.target.value)}
                      className="mt-0.5 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <span className="font-bold text-amber-950 block">Masih Perlu Ditindaklanjuti</span>
                      <span className="text-[11px] text-amber-800 leading-snug block mt-0.5">
                        Terdapat berkas, konfirmasi RS, atau jadwal kunjungan berikutnya yang harus dipantau.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${formData.statusTindakLanjut === 'Sudah Selesai'
                      ? 'border-emerald-500 bg-emerald-50/70 shadow-xs ring-1 ring-emerald-500'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/40'
                      }`}
                  >
                    <input
                      type="radio"
                      name="statusTindakLanjut"
                      value="Sudah Selesai"
                      checked={formData.statusTindakLanjut === 'Sudah Selesai'}
                      onChange={(e) => updateFormField('statusTindakLanjut', e.target.value)}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-bold text-emerald-950 block">Sudah Selesai</span>
                      <span className="text-[11px] text-emerald-800 leading-snug block mt-0.5">
                        Seluruh kewajiban dan tindak lanjut pemantauan pada tahapan ini telah selesai.
                      </span>
                    </div>
                  </label>
                </div>

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
                            className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${isChecked
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
                  </div>
                )}
              </div>

              {/* BAGIAN E: CATATAN TAMBAHAN */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-900 text-xs uppercase tracking-wider">
                    E. Catatan Tambahan (Opsional)
                  </label>
                  <span className="text-[10px] text-slate-400 italic">Boleh dikosongkan</span>
                </div>
                <textarea
                  rows={2}
                  value={formData.catatanTambahan}
                  onChange={(e) => updateFormField('catatanTambahan', e.target.value)}
                  placeholder="Tulis catatan khusus di sini jika ada keterangan tambahan (misal kondisi khusus atau kendala lapangan)..."
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#145DA0] leading-relaxed bg-white"
                />
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAHAP 3: DOKUMENTASI FOTO & VALIDASI GPS
          ══════════════════════════════════════════════════════ */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <label className="block font-bold text-slate-900 text-xs uppercase tracking-wider mb-0.5">
                      Validasi Lokasi GPS Lapangan &amp; Foto Bukti <span className="text-red-500">*</span>
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Pastikan titik koordinat GPS terkunci dan ambil foto kunjungan terstempel resmi.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className={`px-2.5 py-1 rounded-lg font-bold transition-all ${(gpsData?.latitude !== undefined && gpsData?.latitude !== null) ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200 animate-pulse'}`}>
                      {(gpsData?.latitude !== undefined && gpsData?.latitude !== null) ? (
                        <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> GPS Terkunci</span>
                      ) : (
                        <span className="inline-flex items-center gap-1"><AlertCircle className="w-3 h-3" /> GPS Wajib Terkunci</span>
                      )}
                    </span>
                    <span className={`px-2.5 py-1 rounded-lg font-bold transition-all ${(photos.length > 0 || photoData) ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200 animate-pulse'}`}>
                      {(photos.length > 0 || photoData) ? (
                        <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> {photos.length || 1} Foto Terlampir</span>
                      ) : (
                        <span className="inline-flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Foto Bukti Wajib Ada</span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* GPS Google Maps */}
                  <GpsCapture
                    onLocationCaptured={handleLocationCaptured}
                    initialLocation={gpsData}
                    hospitalName={activeHospital}
                    hospitalCoords={
                      victim?.hospital_lat != null && victim?.hospital_lng != null
                        ? { lat: Number(victim.hospital_lat), lng: Number(victim.hospital_lng), radius_meter: Number(victim.hospital_radius || 200) }
                        : null
                    }
                  />

                  {/* Kamera dengan Stempel Watermark Resmi */}
                  <CameraCapture
                    onPhotoCaptured={handlePhotoCaptured}
                    onPhotosChanged={handlePhotosChanged}
                    initialPhoto={photoData}
                    initialPhotos={photos}
                    metadata={{
                      petugasNama: currentUser?.profile?.nama || victim.namaPetugas || 'Petugas Lapangan',
                      rumahSakit: activeHospital,
                      korbanNama: victim.nama,
                      latitude: gpsData?.latitude ?? gpsData?.lat_petugas,
                      longitude: gpsData?.longitude ?? gpsData?.lng_petugas,
                      akurasiLokasi: gpsData?.akurasiLokasi ?? gpsData?.akurasi_lokasi_meter,
                      sumberKoordinat: gpsData?.sumberKoordinat ?? gpsData?.sumber_koordinat,
                      isSimulated: gpsData?.isSimulated,
                      waktu: formData.waktuPemantauan
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAHAP 4: REVIEW & SIMPAN
          ══════════════════════════════════════════════════════ */}
          {currentStep === 4 && (
            <div className="space-y-3.5 animate-fadeIn">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-blue-950 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#145DA0] shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold block">Pemeriksaan Akhir Sebelum Simpan</span>
                  <p className="text-[11px] text-blue-900 mt-0.5">
                    Periksa kembali seluruh data pemantauan korban di bawah ini. Anda dapat menekan tombol <strong>Ubah</strong> pada setiap bagian jika terdapat rincian yang perlu diperbaiki.
                  </p>
                </div>
              </div>

              {/* Status Kelengkapan Cepat */}
              {(() => {
                const s2 = getStepValidation(2);
                const s3 = getStepValidation(3);
                const hasIncomplete = !s2.isValid || !s3.isValid;

                if (!hasIncomplete) return null;

                return (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-amber-900">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Perhatian: Terdapat Bagian yang Belum Lengkap!</span>
                    </div>
                    <div className="space-y-1.5 text-[11px]">
                      {!s2.isValid && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-amber-200">
                          <span className="text-amber-900">Tahap 2 (Hasil Kunjungan): {s2.error}</span>
                          <button
                            type="button"
                            onClick={() => jumpToField(2, s2.error)}
                            className="px-2.5 py-1 rounded bg-[#145DA0] text-white font-bold text-[10px] hover:bg-[#0f497e] cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>Lengkapi Sekarang</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      {!s3.isValid && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-amber-200">
                          <span className="text-amber-900">Tahap 3 (Dokumentasi &amp; GPS): {s3.error}</span>
                          <button
                            type="button"
                            onClick={() => jumpToField(3, s3.error)}
                            className="px-2.5 py-1 rounded bg-[#145DA0] text-white font-bold text-[10px] hover:bg-[#0f497e] cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>Lengkapi Sekarang</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Kartu Ringkasan 1: Informasi Kunjungan */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#145DA0]" />
                    <span>1. Informasi Pasien &amp; Faskes</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#145DA0] hover:underline cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Ubah</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">NAMA PASIEN</span>
                    <strong className="text-slate-900">{victim.nama}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">RUMAH SAKIT</span>
                    <strong className="text-slate-900">{activeHospital}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">WAKTU AKTUAL</span>
                    <strong className="text-slate-900 font-mono text-[11px]">{formatDateTime(formData.waktuPemantauan)}</strong>
                  </div>
                </div>
              </div>

              {/* Kartu Ringkasan 2: Hasil Kunjungan & Tindakan */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#145DA0]" />
                    <span>2. Hasil Kunjungan &amp; Checklist Tindakan</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#145DA0] hover:underline cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Ubah</span>
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-500 text-[11px]">Kondisi Terkini:</span>
                    <span className="px-2.5 py-0.5 rounded-full font-bold text-[11px] bg-blue-100 text-blue-900 border border-blue-200">
                      {formData.kondisi}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-500 text-[11px]">Status Tindak Lanjut:</span>
                    <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${formData.statusTindakLanjut === 'Sudah Selesai' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                      {formData.statusTindakLanjut}
                    </span>
                  </div>

                  {formData.kondisi === 'Meninggal Dunia' && (
                    <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-red-950 text-[11px]">
                      <strong>Meninggal Dunia:</strong> {formData.tanggalMeninggal} jam {formData.jamMeninggal} WIB ({formData.statusKonfirmasi}) - Bukti: {formData.keteranganKonfirmasi}
                    </div>
                  )}

                  {formData.kondisi === 'Dirujuk' && (
                    <div className="p-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-950 text-[11px]">
                      <strong>Rumah Sakit Rujukan:</strong> {formData.rumahSakitRujukan} (Petugas: {assignedOfficerForRujukan?.nama || 'Belum ada'})
                    </div>
                  )}

                  {formData.namaKeluarga?.trim() && (
                    <div className="p-2.5 rounded-lg bg-blue-50/70 border border-blue-200 text-[11px] flex items-start gap-2">
                      <Users className="w-3.5 h-3.5 text-[#145DA0] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-slate-900 block">Keluarga / Pendamping yang Ditemui:</span>
                        <span className="text-slate-800">
                          {formData.namaKeluarga.trim()} ({formData.hubunganKeluarga || 'Keluarga'})
                          {formData.kontakKeluarga?.trim() ? ` • No. HP: ${formData.kontakKeluarga.trim()}` : ''}
                        </span>
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold mb-1">TINDAKAN TERLAKSANA ({formData.checklistTindakan.length}):</span>
                    <div className="flex flex-wrap gap-1">
                      {formData.checklistTindakan.map((t, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[10px] font-medium border border-slate-200">
                          <Check className="w-2.5 h-2.5 text-emerald-600" />
                          <span>{t}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {formData.catatanTambahan && (
                    <div className="pt-1 border-t border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-semibold">CATATAN TAMBAHAN:</span>
                      <p className="text-slate-700 text-[11px] italic">"{formData.catatanTambahan}"</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Kartu Ringkasan 3: Dokumentasi & Lokasi GPS */}
              <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#145DA0]" />
                    <span>3. Dokumentasi &amp; Validasi GPS</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#145DA0] hover:underline cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Ubah</span>
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">KOORDINAT GPS</span>
                      <span className="font-mono font-bold text-slate-900 text-xs">
                        {gpsData ? `${gpsData.latitude ?? gpsData.lat_petugas}, ${gpsData.longitude ?? gpsData.lng_petugas}` : 'Belum Ada'}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">SUMBER KOORDINAT</span>
                      <span className="font-bold text-xs text-slate-900">
                        {gpsData?.sumberKoordinat || (gpsData?.isSimulated ? 'Titik Acuan RS' : (gpsData ? 'GPS Perangkat' : '—'))}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">AKURASI LOKASI</span>
                      <span className="font-bold text-xs text-slate-900">
                        {gpsData?.akurasiLokasi ? `±${gpsData.akurasiLokasi} m` : (gpsData?.isSimulated ? 'N/A (Titik Acuan)' : '—')}
                      </span>
                    </div>
                  </div>

                  {/* Preview Foto Dokumentasi */}
                  {photos.length > 0 && (
                    <div className="pt-2">
                      <span className="text-[10px] text-slate-400 block font-semibold mb-1.5 uppercase">
                        FOTO DOKUMENTASI TERKUNCI WATERMARK ({photos.length} FOTO):
                      </span>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {photos.map((photo, pIdx) => (
                          <div
                            key={pIdx}
                            onClick={() => setSelectedPreviewPhoto(photo)}
                            className="relative w-24 h-20 rounded-lg overflow-hidden border border-slate-300 shadow-2xs shrink-0 cursor-pointer group"
                            title="Klik untuk zoom foto watermark"
                          >
                            <img src={photo} alt={`Bukti ${pIdx + 1}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/30 group-hover:bg-transparent transition-colors flex items-center justify-center">
                              <span className="text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">
                                Foto #{pIdx + 1}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── TOMBOL NAVIGASI BAWAH (FOOTER STEPPER) ── */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2.5">
            <div>
              {currentStep === 1 ? (
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Batal
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Kembali</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {currentStep < 4 ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  {!isCurrentStepValid && (
                    <span className="text-[11px] text-rose-700 bg-rose-50 px-2.5 py-1.5 rounded-xl border border-rose-200 font-semibold flex items-center gap-1.5 animate-fadeIn">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>{currentStepValidation.error}</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleNextStep}
                    disabled={!isCurrentStepValid}
                    className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold transition-all ${
                      isCurrentStepValid
                        ? 'bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-xs cursor-pointer'
                        : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-80'
                    }`}
                    title={!isCurrentStepValid ? currentStepValidation.error : 'Lanjut ke tahap berikutnya'}
                  >
                    <span>
                      {currentStep === 1
                        ? 'Lanjut ke Hasil Kunjungan'
                        : currentStep === 2
                          ? 'Lanjut ke Dokumentasi & GPS'
                          : 'Lanjut ke Review & Simpan'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  {!isAllStepsValid && (
                    <span className="text-[11px] text-rose-700 bg-rose-50 px-2.5 py-1.5 rounded-xl border border-rose-200 font-semibold flex items-center gap-1.5 animate-fadeIn">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>Masih ada data wajib yang belum lengkap</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting || isFinishedVictim || !isAllStepsValid}
                    className={`inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl font-bold shadow-xs transition-colors ${
                      isAllStepsValid && !isSubmitting && !isFinishedVictim
                        ? 'bg-[#145DA0] hover:bg-[#0f497e] text-white cursor-pointer'
                        : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-80'
                    }`}
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Pemantauan'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
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
                className="px-3 py-1 bg-white text-slate-900 font-bold rounded-lg hover:bg-slate-200 cursor-pointer"
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
