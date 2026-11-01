import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../common/Modal';
import { storageService } from '../../services/storageService';
import { useAuth } from '../../context/AuthContext';
import CameraCapture from './CameraCapture';
import GpsCapture from './GpsCapture';
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
  ArrowRight
} from 'lucide-react';

export default function FormInputKorbanModal({ isOpen, onClose, onVictimCreated }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const officerProfile = currentUser?.profile || {
    id: 'PET-01',
    nama: 'Adi Putra Pratama, S.Tr.Tra'
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
    rumahSakit: 'RSUP Dr. Cipto Mangunkusumo (RSCM)',
    lokasiKejadian: '',
    tanggalKecelakaan: nowString,
    tanggalMasukRs: nowString,
    sumberInformasi: 'IRSMS Korlantas Polri',
    keteranganTambahan: '',
    // Opsi pencatatan kunjungan pertama sekaligus
    catatKunjunganSekaligus: true,
    kondisiAwal: 'Masih Dirawat',
    hasilKunjunganAwal: '',
    komunikasiKeluarga: '',
    penyampaianHak: 'Hak santunan biaya perawatan RS maksimal Rp20.000.000,- telah dijelaskan.',
    tindakLanjutAwal: 'Pemantauan perkembangan medis dan konfirmasi surat jaminan RS'
  });

  const [photoData, setPhotoData] = useState(null);
  const [gpsData, setGpsData] = useState(null);

  // Duplication warning state
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  const [ignoredDuplicateId, setIgnoredDuplicateId] = useState(null);
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');

    // Validasi dasar
    if (!formData.nama.trim()) {
      setValidationError('Nama korban wajib diisi.');
      return;
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

    // Jika catat kunjungan sekaligus, validasi hasil kunjungan
    if (formData.catatKunjunganSekaligus) {
      if (!formData.hasilKunjunganAwal.trim()) {
        setValidationError('Catatan hasil kunjungan pertama wajib diisi jika memilih catat kunjungan.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
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
        petugasId: officerProfile.id,
        namaPetugas: officerProfile.nama,
        kondisiTerakhir: formData.catatKunjunganSekaligus ? formData.kondisiAwal : 'Masih Dirawat',
        statusKonfirmasiKondisi: formData.catatKunjunganSekaligus ? 'Terkonfirmasi' : 'Belum Dikonfirmasi',
        keteranganTambahan: formData.keteranganTambahan
      };

      let initialVisitPayload = null;
      if (formData.catatKunjunganSekaligus) {
        initialVisitPayload = {
          tanggalKunjungan: new Date(formData.tanggalMasukRs).toISOString(),
          kondisiKorban: formData.kondisiAwal,
          hasilKunjungan: formData.hasilKunjunganAwal,
          komunikasiKeluarga: formData.komunikasiKeluarga,
          penyampaianHak: formData.penyampaianHak,
          tindakLanjut: formData.tindakLanjutAwal || 'Pemantauan perkembangan korban',
          fotoUrl: photoData,
          latitude: gpsData?.latitude || null,
          longitude: gpsData?.longitude || null,
          akurasiLokasi: gpsData?.akurasiLokasi || null,
          waktuFoto: gpsData?.waktu || new Date().toISOString(),
          petugasId: officerProfile.id,
          petugasNama: officerProfile.nama
        };
      }

      const createdVictim = storageService.addVictim(victimPayload, initialVisitPayload);

      setIsSubmitting(false);
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

        {/* Duplication Warning Banner */}
        {duplicateMatches.length > 0 && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 space-y-3 shadow-xs">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900 text-xs uppercase tracking-wide">
                  Perhatian: Potensi Data Korban Duplikat Terdeteksi
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Sistem menemukan <strong>{duplicateMatches.length} data korban serupa</strong> yang telah terdaftar.
                  Sesuai ketentuan, satu korban hanya boleh memiliki satu data utama; pemantauan berikutnya harus ditambahkan pada korban yang sama, bukan membuat entri korban baru.
                </p>
              </div>
            </div>

            <div className="space-y-2 bg-white/80 p-3 rounded-lg border border-amber-200">
              {duplicateMatches.map((dup) => (
                <div key={dup.id} className="flex items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{dup.nama}</span>
                    <span className="text-slate-500 text-[11px] block">
                      ID: {dup.id} &bull; NIK: {dup.nik} &bull; {dup.rumahSakit}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenExistingVictim(dup.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#145DA0] text-white hover:bg-[#0f497e] shrink-0"
                  >
                    <span>Buka Data Korban</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-amber-900 font-medium">
                Yakin ini kasus kecelakaan atau korban yang berbeda?
              </span>
              <button
                type="button"
                onClick={() => setIgnoredDuplicateId('CONFIRMED_DIFFERENT')}
                className="text-[11px] font-bold text-amber-900 underline hover:text-amber-950 cursor-pointer"
              >
                Konfirmasi: Lanjutkan Buat Data Baru
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
                <option value="RSUP Dr. Cipto Mangunkusumo (RSCM)">RSUP Dr. Cipto Mangunkusumo (RSCM)</option>
                <option value="RSUD Tarakan Jakarta">RSUD Tarakan Jakarta</option>
                <option value="RSUP Fatmawati">RSUP Fatmawati</option>
                <option value="RS Polri Said Sukanto">RS Polri Said Sukanto</option>
                <option value="RS Columbia Asia Pulomas">RS Columbia Asia Pulomas</option>
                <option value="RS Hermina Kemayoran">RS Hermina Kemayoran</option>
                <option value="RSUD Koja">RSUD Koja</option>
                <option value="RS Sumber Waras">RS Sumber Waras</option>
                <option value="RS Pelni Slipi">RS Pelni Slipi</option>
              </select>
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
                    <option value="Masih Dirawat">Masih Dirawat</option>
                    <option value="Sudah Pulang">Sudah Pulang</option>
                    <option value="Dirujuk">Dirujuk ke RS Lain</option>
                    <option value="Meninggal Dunia">Meninggal Dunia</option>
                    <option value="Belum Dapat Dikonfirmasi">Belum Dapat Dikonfirmasi</option>
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
                    latitude: gpsData?.latitude,
                    longitude: gpsData?.longitude,
                    akurasiLokasi: gpsData?.akurasiLokasi,
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
  );
}

