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
  Calendar,
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Save,
  MapPin,
  FileText,
  Phone,
  ShieldAlert,
  ArrowRight,
  ArrowUpRight,
  UserCheck,
  Eye,
  Activity,
  Home
} from 'lucide-react';

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

  // Form Data State
  const [formData, setFormData] = useState({
    nama: '',
    nik: '',
    usia: '30',
    jenisKelamin: 'Laki-laki',
    telepon: '',
    alamat: '',
    rumahSakit: 'RS Syafira',
    lokasiKejadian: '',
    tanggalKecelakaan: nowString,
    tanggalMasukRs: nowString,
    sumberInformasi: 'IRSMS Korlantas Polri',
    keteranganTambahan: '',
    // Opsi pencatatan kunjungan pertama sekaligus
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
  const [transitionTargetVictim, setTransitionTargetVictim] = useState(null);
  const [transitionType, setTransitionType] = useState('RAWAT_LANJUTAN');
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cari petugas JR penanggung jawab secara real-time berdasarkan plotting RS
  const currentAssignedOfficer = useMemo(() => {
    const allOfficers = storageService.getOfficers();
    const caseRs = (formData.rumahSakit || '').trim().toLowerCase();
    return allOfficers.find(
      (o) => o.status !== 'Nonaktif' && Array.isArray(o.plottingRs) && o.plottingRs.some(
        (rs) => {
          const r1 = (rs || '').trim().toLowerCase();
          return r1 === caseRs || (caseRs.length >= 4 && (r1.includes(caseRs) || caseRs.includes(r1)));
        }
      )
    );
  }, [formData.rumahSakit]);

  // Reset formulir & foto setiap kali modal dibuka baru
  useEffect(() => {
    if (isOpen) {
      setFormData({
        nama: '',
        nik: '',
        usia: '30',
        jenisKelamin: 'Laki-laki',
        telepon: '',
        alamat: '',
        rumahSakit: 'RS Syafira',
        lokasiKejadian: '',
        tanggalKecelakaan: nowString,
        tanggalMasukRs: nowString,
        sumberInformasi: 'IRSMS Korlantas Polri',
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

  // Check duplicates in real-time
  useEffect(() => {
    if (!isOpen) {
      setDuplicateMatches([]);
      setIgnoredDuplicateId(null);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    // Validasi dasar
    if (!formData.nama.trim()) {
      setValidationError('Nama korban wajib diisi.');
      return;
    }

    if (formData.nik && formData.nik.trim()) {
      const cleanNik = formData.nik.replace(/\D/g, '');
      if (cleanNik.length !== 16) {
        setValidationError('NIK harus terdiri dari tepat 16 digit angka sesuai standar database.');
        return;
      }
    }

    if (!formData.rumahSakit.trim()) {
      setValidationError('Rumah sakit tempat dirawat wajib dipilih.');
      return;
    }

    if (!formData.lokasiKejadian.trim()) {
      setValidationError('Tempat kecelakaan (TKP) wajib diisi.');
      return;
    }

    // Jika ada potensi duplikat dan belum dikonfirmasi lanjut
    if (duplicateMatches.length > 0 && !ignoredDuplicateId) {
      setValidationError('Periksa potensi data duplikat di atas sebelum melanjutkan pembuatan data.');
      return;
    }

    // Jika catat kunjungan sekaligus, validasi hasil kunjungan, GPS dan Foto
    if (formData.catatKunjunganSekaligus) {
      if (!formData.hasilKunjunganAwal.trim()) {
        setValidationError('Catatan hasil kunjungan pertama wajib diisi jika memilih catat kunjungan.');
        return;
      }
      const hasValidGps = gpsData &&
        Number.isFinite(Number(gpsData.latitude ?? gpsData.lat_petugas)) &&
        Number.isFinite(Number(gpsData.longitude ?? gpsData.lng_petugas));

      if (!hasValidGps) {
        setValidationError('Harap mengunci lokasi koordinat GPS / maps rumah sakit terlebih dahulu.');
        return;
      }
      if (!photoData) {
        setValidationError('Harap mengupload atau mengambil dokumentasi foto kunjungan.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Petugas penanggung jawab otomatis ditentukan berdasarkan penugasan rumah sakit
      const assignedPetugasId = currentAssignedOfficer ? currentAssignedOfficer.id : null;
      const assignedPetugasNama = currentAssignedOfficer ? currentAssignedOfficer.nama : 'Belum Ada Petugas Penanggung Jawab';

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
        sumberInformasi: formData.sumberInformasi,
        petugasId: assignedPetugasId,
        namaPetugas: assignedPetugasNama,
        kondisiTerakhir: formData.catatKunjunganSekaligus ? formData.kondisiAwal : 'Masih Dirawat',
        statusKonfirmasiKondisi: formData.catatKunjunganSekaligus ? 'Terkonfirmasi' : 'Belum Dikonfirmasi',
        keteranganTambahan: formData.keteranganTambahan
      };

      let initialVisitPayload = null;
      if (formData.catatKunjunganSekaligus) {
        const nowActualIso = new Date().toISOString();
        initialVisitPayload = {
          tanggalKunjungan: nowActualIso,
          waktuCatatSistem: nowActualIso,
          kondisiKorban: formData.kondisiAwal,
          cek_komunikasi_keluarga: formData.cekKomunikasiKeluarga,
          cek_edukasi_santunan: formData.cekEdukasiSantunan,
          cek_arahan_lp: formData.cekArahanLp,
          catatan_kondisi: formData.hasilKunjunganAwal,
          hasilKunjungan: formData.hasilKunjunganAwal,
          komunikasiKeluarga: formData.komunikasiKeluarga,
          penyampaianHak: formData.penyampaianHak,
          tindakLanjut: formData.tindakLanjutAwal || 'Pemantauan perkembangan korban',
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

      const createdVictim = await storageService.addVictim(victimPayload, initialVisitPayload);

      setIsSubmitting(false);
      setPhotoData(null);
      setGpsData(null);
      if (onVictimCreated) {
        onVictimCreated(createdVictim);
      }
      onClose();
      // Navigate straight to the new victim's detail
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
      title="Input Data Korban Baru & Kunjungan Pertama"
      subtitle="Satu korban memiliki satu data utama tetap. Jangan buat data duplikat jika korban sudah terdaftar."
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5 text-xs">
        {/* Validation Alert */}
        {validationError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2 shadow-2xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Periksa Kembali Formulir</p>
              <p className="text-[11px] mt-0.5">{validationError}</p>
            </div>
          </div>
        )}

        {/* ── BAGIAN IDENTIFIKASI PASIEN & CEK RIWAYAT KASUS ── */}
        {duplicateMatches.length > 0 && ignoredDuplicateId !== 'CONFIRMED_DIFFERENT' && (
          <div className="p-4 rounded-xl bg-amber-50/90 border-2 border-amber-300 text-amber-950 space-y-4 shadow-sm">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-amber-950 text-xs uppercase tracking-wide">
                    Identifikasi Pasien: Potensi Riwayat Kasus Ditemukan
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                    Menunggu Konfirmasi Petugas
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                  Sistem mendeteksi <strong>{duplicateMatches.length} kasus korban serupa</strong> berdasarkan pencocokan NIK, Nama, dan/atau Kasus Kecelakaan.
                  Periksa ringkasan di bawah sebelum melanjutkan. Korban yang sama harus dihubungkan pada riwayat perawatan berkelanjutan.
                </p>
              </div>
            </div>

            {/* List Matching Cases with Comparative Overview */}
            <div className="space-y-3">
              {duplicateMatches.map((dup) => {
                const isDischarged = dup.isDischarged;
                const isSameHospital = dup.isSameHospital;
                const isReferred = dup.isReferred;

                return (
                  <div key={dup.id} className="bg-white rounded-xl p-3.5 border border-amber-200 shadow-2xs space-y-3">
                    {/* Visual Badges Row */}
                    <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3 text-amber-700" />
                          <span>Pasien Memiliki Riwayat Kasus Sebelumnya</span>
                        </span>

                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                          dup.detectedCondition === 'RAWAT_LANJUTAN_RS_SAMA'
                            ? 'bg-purple-50 text-purple-800 border-purple-200'
                            : dup.detectedCondition === 'RAWAT_LANJUTAN_RS_BEDA'
                            ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                            : dup.detectedCondition === 'KEMUNGKINAN_RUJUKAN'
                            ? 'bg-violet-50 text-violet-800 border-violet-200'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}>
                          <Activity className="w-3 h-3" />
                          <span>{dup.conditionLabel}</span>
                        </span>
                      </div>

                      <span className="text-[10px] font-mono text-slate-500 font-bold">
                        ID: {dup.previousCaseId}
                      </span>
                    </div>

                    {/* Comparative Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200/70">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Nama Korban:</span>
                        <strong className="text-slate-900 font-bold">{dup.nama}</strong>
                        <span className="text-[10px] text-slate-500 block font-mono">NIK: {dup.nik || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">No. LP / Kasus:</span>
                        <strong className="text-slate-800 font-semibold">{dup.previousLp}</strong>
                        <span className="text-[10px] text-slate-500 block">
                          Tgl Laka: {dup.tanggalKecelakaan ? new Date(dup.tanggalKecelakaan).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">RS Sebelumnya:</span>
                        <strong className="text-[#0A3981] font-bold">{dup.previousHospital}</strong>
                        <span className="text-[10px] text-slate-500 block">
                          RS Sekarang: <strong>{formData.rumahSakit || '—'}</strong>
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Status Sebelumnya:</span>
                        <span className={`inline-block font-bold text-[11px] ${isDischarged ? 'text-emerald-700' : 'text-sky-700'}`}>
                          {dup.previousStatus}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          Tgl Masuk: {dup.previousAdmissionDate ? new Date(dup.previousAdmissionDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Adaptive Action Buttons based on Condition */}
                    <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Condition 1 & 2: Rawat Lanjutan */}
                        {isDischarged && (
                          <button
                            type="button"
                            onClick={() => {
                              setTransitionTargetVictim(dup);
                              setTransitionType('RAWAT_LANJUTAN');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0A3981] text-white hover:bg-[#072B62] shadow-2xs transition-all cursor-pointer"
                          >
                            <Activity className="w-3.5 h-3.5" />
                            <span>
                              {isSameHospital
                                ? 'Konfirmasi Rawat Lanjutan (RS Sama)'
                                : 'Konfirmasi Rawat Lanjutan (RS Berbeda)'}
                            </span>
                          </button>
                        )}

                        {/* Condition 3: Rujukan (Pasien Masih Dirawat & RS Berbeda) */}
                        {!isDischarged && !isSameHospital && (
                          <button
                            type="button"
                            onClick={() => {
                              setTransitionTargetVictim(dup);
                              setTransitionType('RUJUKAN');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-700 text-white hover:bg-violet-800 shadow-2xs transition-all cursor-pointer"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>Konfirmasi Rujukan ke RS Ini</span>
                          </button>
                        )}

                        {/* Secondary Button: Lihat Riwayat Sebelumnya */}
                        <button
                          type="button"
                          onClick={() => handleOpenExistingVictim(dup.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                          <span>Lihat Riwayat Kasus Sebelumnya</span>
                        </button>
                      </div>

                      {/* Detail Link */}
                      <button
                        type="button"
                        onClick={() => handleOpenExistingVictim(dup.id)}
                        className="text-[11px] font-bold text-[#145DA0] hover:underline flex items-center gap-1"
                      >
                        <span>Buka Detail Korban</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Different Case Override */}
            <div className="flex items-center justify-between pt-1 border-t border-amber-200/80">
              <span className="text-[11px] text-amber-900 font-medium">
                Kecelakaan terjadi pada korban yang berbeda dan bukan kelanjutan kasus di atas?
              </span>
              <button
                type="button"
                onClick={() => setIgnoredDuplicateId('CONFIRMED_DIFFERENT')}
                className="text-[11px] font-bold text-amber-900 underline hover:text-amber-950 cursor-pointer"
              >
                Tandai sebagai Kasus Berbeda (Buat Baru)
              </button>
            </div>
          </div>
        )}

        {/* ── SEKSI 1: DATA UTAMA KORBAN ── */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/90 space-y-3.5">
          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
            <User className="w-4 h-4 text-[#145DA0]" />
            1. Data Utama Korban
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Nama Korban */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Nama Korban <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="nama"
                required
                value={formData.nama}
                onChange={handleChange}
                placeholder="Contoh: Ahmad Fauzan"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
              />
            </div>

            {/* NIK */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                NIK / No. Identitas Korban
              </label>
              <input
                type="text"
                name="nik"
                value={formData.nik}
                onChange={handleChange}
                placeholder="16 digit NIK KTP (membantu cegah duplikasi)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
              />
            </div>

            {/* Usia & Gender */}
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
                  placeholder="Usia (Thn)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white"
                />
                <select
                  name="jenisKelamin"
                  value={formData.jenisKelamin}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-slate-800 bg-white"
                >
                  <option value="Laki-laki">Laki-laki</option>
                  <option value="Perempuan">Perempuan</option>
                </select>
              </div>
            </div>

            {/* Telepon */}
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white"
              />
            </div>

            {/* Alamat Domisili */}
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white"
              />
            </div>
          </div>
        </div>

        {/* ── SEKSI 2: KASUS & RUMAH SAKIT ── */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/90 space-y-3.5">
          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
            <Building2 className="w-4 h-4 text-[#145DA0]" />
            2. Rumah Sakit &amp; Informasi Kecelakaan
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Rumah Sakit */}
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Rumah Sakit Tempat Dirawat <span className="text-red-500">*</span>
              </label>
              <select
                name="rumahSakit"
                value={formData.rumahSakit}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
              >
                <option value="RS Syafira">RS Syafira (Pekanbaru - Terdaftar)</option>
                <option value="RS Prima">RS Prima (Pekanbaru - Terdaftar)</option>
                <option value="RSUD Arifin Achmad">RSUD Arifin Achmad (Pekanbaru)</option>
                <option value="RS Awal Bros Sudirman">RS Awal Bros Sudirman (Pekanbaru)</option>
                <option value="RS Awal Bros Panam">RS Awal Bros Panam (Pekanbaru)</option>
                <option value="RS Santa Maria Pekanbaru">RS Santa Maria (Pekanbaru)</option>
                <option value="RS Sansani Pekanbaru">RS Sansani (Pekanbaru)</option>
                <option value="RS Tabrani Rab">RS Tabrani Rab (Pekanbaru)</option>
                <option value="RS Bhayangkara Pekanbaru">RS Bhayangkara (Pekanbaru)</option>
                <option value="RSUD Petala Bumi">RSUD Petala Bumi (Pekanbaru)</option>
                <option value="RSUD Kota Dumai">RSUD Kota Dumai</option>
                <option value="RSUD Mandau Duri">RSUD Mandau (Duri, Bengkalis)</option>
                <option value="RSUD Puri Husada Tembilahan">RSUD Puri Husada (Tembilahan, Inhil)</option>
              </select>

              {/* Status Penugasan Petugas JR Penanggung Jawab */}
              <div className="mt-2 p-2.5 rounded-lg bg-blue-50/80 border border-blue-200/90 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-semibold flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-[#0A3981]" />
                  <span>Petugas JR Penanggung Jawab:</span>
                </span>
                {currentAssignedOfficer ? (
                  <span className="font-extrabold text-[#0A3981] bg-white px-2.5 py-1 rounded-md border border-blue-200 shadow-2xs">
                    {currentAssignedOfficer.nama} ({currentAssignedOfficer.id})
                  </span>
                ) : (
                  <span className="font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-300">
                    Belum Ada Petugas Penanggung Jawab
                  </span>
                )}
              </div>
            </div>

            {/* Tempat Kecelakaan */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tempat Kecelakaan (TKP) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="lokasiKejadian"
                required
                value={formData.lokasiKejadian}
                onChange={handleChange}
                placeholder="Contoh: Jl. Daan Mogot KM 12 depan halte"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#145DA0]"
              />
            </div>

            {/* Tanggal Kecelakaan */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tanggal &amp; Waktu Kecelakaan (Tgl Laka) <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                name="tanggalKecelakaan"
                required
                value={formData.tanggalKecelakaan}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white"
              />
            </div>

            {/* Kapan Masuk Rumah Sakit */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Kapan Masuk Rumah Sakit <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                name="tanggalMasukRs"
                required
                value={formData.tanggalMasukRs}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white"
              />
            </div>

            {/* Sumber Informasi */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Sumber Informasi
              </label>
              <select
                name="sumberInformasi"
                value={formData.sumberInformasi}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white"
              >
                <option value="IRSMS Korlantas Polri">IRSMS Korlantas Polri</option>
                <option value="Laporan Petugas IGD RS">Laporan Petugas IGD RS</option>
                <option value="Laporan Langsung Keluarga / Warga">Laporan Langsung Keluarga / Warga</option>
                <option value="Koordinasi Unit Laka Lantas">Koordinasi Unit Laka Lantas</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── SEKSI 3: PENCATATAN KUNJUNGAN PERTAMA SEKALIGUS (OPSIONAL) ── */}
        <div className="bg-white p-4 rounded-xl border border-blue-200 space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                name="catatKunjunganSekaligus"
                checked={formData.catatKunjunganSekaligus}
                onChange={handleChange}
                className="rounded text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer"
              />
              <span className="font-bold text-slate-900 text-xs">
                Catat Kunjungan Pertama Sekaligus Sekarang
              </span>
            </label>
            <span className="text-[11px] text-slate-400">Aktivitas #1</span>
          </div>

          {formData.catatKunjunganSekaligus && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Kondisi Korban Saat Ini <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="kondisiAwal"
                    value={formData.kondisiAwal}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white"
                  >
                    <option value="Rawat Inap">Rawat Inap</option>
                    <option value="Luka Ringan">Luka Ringan</option>
                    <option value="Luka Berat">Luka Berat</option>
                    <option value="Meninggal Dunia">Meninggal Dunia</option>
                    <option value="Selesai">Selesai / Pulang</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Keluarga / Pihak yang Ditemui
                  </label>
                  <input
                    type="text"
                    name="komunikasiKeluarga"
                    value={formData.komunikasiKeluarga}
                    onChange={handleChange}
                    placeholder="Contoh: Istri korban / Perawat IGD"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 bg-white"
                  />
                </div>
              </div>

              {/* Checklist 3 SOP Kunjungan Database */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                <span className="font-semibold text-slate-700 block text-[11px] uppercase tracking-wide">
                  Checklist SOP Kunjungan Pertama
                </span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="cekKomunikasiKeluarga"
                    checked={formData.cekKomunikasiKeluarga}
                    onChange={handleChange}
                    className="rounded text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer"
                  />
                  <span className="text-slate-800 font-medium">1. Komunikasi langsung dengan korban / ahli waris</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="cekEdukasiSantunan"
                    checked={formData.cekEdukasiSantunan}
                    onChange={handleChange}
                    className="rounded text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer"
                  />
                  <span className="text-slate-800 font-medium">2. Edukasi hak dan kepastian santunan Jasa Raharja</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="cekArahanLp"
                    checked={formData.cekArahanLp}
                    onChange={handleChange}
                    className="rounded text-[#145DA0] focus:ring-[#145DA0] w-4 h-4 cursor-pointer"
                  />
                  <span className="text-slate-800 font-medium">3. Arahan pengurusan Laporan Polisi (LP) Laka Lantas</span>
                </label>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Catatan Hasil Kunjungan / Komunikasi <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="hasilKunjunganAwal"
                  rows={2}
                  value={formData.hasilKunjunganAwal}
                  onChange={handleChange}
                  placeholder="Catatan kondisi luka fisik korban, tindakan dokter, atau konfirmasi penjaminan Jasa Raharja..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-slate-800 bg-white"
                />
              </div>

              {/* GPS & Kamera dengan Watermark */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
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
            </div>
          )}
        </div>

        {/* Tombol Simpan */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Batal
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f497e] text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Data Korban & Kunjungan'}</span>
          </button>
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

