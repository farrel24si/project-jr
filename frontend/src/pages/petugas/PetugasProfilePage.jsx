import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import ModalConfirmChangePhone from '../../components/common/ModalConfirmChangePhone';
import {
  User,
  ShieldCheck,
  Lock,
  Key,
  Camera,
  CheckCircle2,
  AlertCircle,
  Building2,
  MapPin,
  Mail,
  Phone,
  Eye,
  EyeOff,
  RotateCcw,
  Sparkles,
  Save,
  Check,
  Edit2,
  X
} from 'lucide-react';

export default function PetugasProfilePage() {
  const { currentUser, updateProfilePhoto, updatePassword, updatePhoneNumber } = useAuth();
  const fileInputRef = useRef(null);

  const profile = currentUser?.profile || {};
  const officerId = profile.id || profile.backendOfficerId || 'PET-01';

  // Ambil data personil mutakhir dari storage lokal untuk plotting RS dan detail
  const officerData = storageService.getOfficerById(officerId) ||
    storageService.getOfficers().find((o) => (o.nama && profile.nama && o.nama.trim().toLowerCase() === profile.nama.trim().toLowerCase())) || {};
  const officerName = profile.nama || officerData.nama || 'Petugas Lapangan';
  const officerNip = officerData.nip && officerData.nip !== '—' ? officerData.nip : (profile.nip || '19930512 201902 1 004');
  const officerJabatan = profile.jabatan || officerData.jabatan || 'Mobile Service Officer';
  const officerWilayah = profile.wilayah || officerData.wilayah || 'Pekanbaru Kota';
  const officerEmail = profile.email || officerData.email || 'petugas@jasaraharja.co.id';
  const officerTelepon = profile.telepon || officerData.telepon || '0812-3456-7890';
  const officerPlottingRs = (Array.isArray(officerData.plottingRs) && officerData.plottingRs.length > 0)
    ? officerData.plottingRs
    : (Array.isArray(profile.plottingRs) ? profile.plottingRs : []);
  const username = profile.username || (officerEmail.includes('@') ? officerEmail.split('@')[0] : 'petugas');

  // State untuk Foto Profil
  const [photoPreview, setPhotoPreview] = useState(profile.avatar || null);
  const [photoSuccessToast, setPhotoSuccessToast] = useState('');

  // State untuk Nomor HP & Modal Konfirmasi
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isConfirmPhoneModalOpen, setIsConfirmPhoneModalOpen] = useState(false);
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [phoneSuccessToast, setPhoneSuccessToast] = useState('');

  // State untuk Ubah Kata Sandi
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Handler Edit Nomor HP
  const handleStartEditPhone = () => {
    setPhoneInput(officerTelepon && officerTelepon !== '—' ? officerTelepon : '');
    setPhoneError('');
    setIsEditingPhone(true);
  };

  const handleCancelEditPhone = () => {
    setIsEditingPhone(false);
    setPhoneInput('');
    setPhoneError('');
  };

  const handleSubmitPhone = (e) => {
    e.preventDefault();
    setPhoneError('');
    const clean = phoneInput.trim();
    if (!clean) {
      setPhoneError('Nomor HP tidak boleh kosong.');
      return;
    }
    const digits = clean.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15 || (!clean.startsWith('08') && !clean.startsWith('628') && !clean.startsWith('+628'))) {
      setPhoneError('Format nomor HP tidak valid. Masukkan nomor HP aktif diawali 08 atau 628 dengan minimal 10 digit angka.');
      return;
    }
    if (clean === officerTelepon) {
      setPhoneError('Nomor HP baru sama dengan nomor HP saat ini.');
      return;
    }
    setIsConfirmPhoneModalOpen(true);
  };

  const handleConfirmChangePhone = async () => {
    setIsSavingPhone(true);
    setPhoneError('');
    try {
      const res = await updatePhoneNumber(phoneInput.trim());
      if (res && res.success) {
        setIsConfirmPhoneModalOpen(false);
        setIsEditingPhone(false);
        setPhoneSuccessToast('Nomor HP berhasil diperbarui.');
        setTimeout(() => setPhoneSuccessToast(''), 4000);
      } else {
        setPhoneError(res?.message || 'Gagal memperbarui nomor HP.');
        setIsConfirmPhoneModalOpen(false);
      }
    } catch (err) {
      setPhoneError(err.message || 'Terjadi kesalahan saat memperbarui nomor HP.');
      setIsConfirmPhoneModalOpen(false);
    } finally {
      setIsSavingPhone(false);
    }
  };

  // Inisial jika tidak ada custom foto
  const getInitials = (nama) => {
    if (!nama) return 'PT';
    const parts = nama.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return nama.slice(0, 2).toUpperCase();
  };
  const initials = getInitials(officerName);

  const isCustomPhoto = photoPreview && (photoPreview.startsWith('data:image') || photoPreview.startsWith('http'));

  // Handler Unggah Foto
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Ukuran foto terlalu besar. Maksimal 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        setPhotoPreview(dataUrl);
        updateProfilePhoto(dataUrl);
        setPhotoSuccessToast('Foto profil berhasil diperbarui!');
        setTimeout(() => setPhotoSuccessToast(''), 3500);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handler Reset ke Inisial Nama
  const handleResetToInitials = () => {
    setPhotoPreview(initials);
    updateProfilePhoto(initials);
    setPhotoSuccessToast('Foto profil dikembalikan ke inisial nama.');
    setTimeout(() => setPhotoSuccessToast(''), 3500);
  };

  // Handler Simpan Kata Sandi
  const handleSavePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!newPassword.trim()) {
      setPasswordError('Silakan masukkan kata sandi baru.');
      return;
    }

    if (newPassword.trim().length < 6) {
      setPasswordError('Kata sandi baru minimal 6 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi kata sandi tidak cocok. Pastikan kedua kolom sama.');
      return;
    }

    setIsSubmittingPassword(true);
    try {
      await updatePassword(newPassword.trim());
      setPasswordSuccess('Kata sandi berhasil diubah! Gunakan kata sandi baru untuk login selanjutnya.');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 5000);
    } catch (err) {
      setPasswordError(err.message || 'Gagal mengubah kata sandi. Silakan coba lagi.');
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* ── BREADCRUMB & HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link to="/petugas" className="hover:text-[#0A3981] transition-colors">
              Petugas Lapangan
            </Link>
            <span>/</span>
            <span className="text-slate-800 font-semibold">Akun & Profil Saya</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Profil & Pengaturan Akun
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola foto profil Anda dan perbarui kata sandi untuk akses masuk aplikasi
          </p>
        </div>

        <Link
          to="/petugas"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs self-start sm:self-auto"
        >
          <span>&larr; Kembali ke Dashboard</span>
        </Link>
      </div>

      {/* ── TOAST NOTIFIKASI FOTO SUKSES ── */}
      {photoSuccessToast && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800 shadow-sm animate-scale-up">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{photoSuccessToast}</span>
        </div>
      )}

      {/* ── GRID UTAMA: KOLOM KIRI (FOTO & IDENTITAS) + KOLOM KANAN (DETAIL & UBAH SANDI) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── KOLOM KIRI: KARTU FOTO PROFIL & IDENTITAS ── */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col items-center text-center">
            {/* Foto Avatar Lingkaran */}
            <div className="relative mb-4 group">
              <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-[#0A3981] to-[#145DA0] text-white flex items-center justify-center font-black text-3xl shadow-md border-4 border-white ring-4 ring-blue-50 overflow-hidden">
                {isCustomPhoto ? (
                  <img
                    src={photoPreview}
                    alt={officerName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>

              {/* Tombol Kamera Trigger Upload */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-[#0A3981] text-white flex items-center justify-center shadow-lg hover:bg-blue-900 transition-all border-2 border-white cursor-pointer hover:scale-105"
                title="Ganti Foto Profil"
              >
                <Camera className="w-4 h-4" />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <h3 className="text-base font-bold text-slate-900 leading-tight">
              {officerName}
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              NIP. {officerNip}
            </p>

            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Petugas Aktif Lapangan</span>
            </div>

            {/* Tombol Aksi Foto */}
            <div className="w-full mt-6 pt-5 border-t border-slate-100 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-[#0A3981] hover:bg-blue-900 text-white flex items-center justify-center gap-2 transition-colors shadow-2xs cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Pilih Foto Baru</span>
              </button>

              {isCustomPhoto && (
                <button
                  type="button"
                  onClick={handleResetToInitials}
                  className="w-full py-2 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                >
                  Gunakan Inisial Nama
                </button>
              )}

              <p className="text-[10px] text-slate-400 mt-1">
                Format didukung: JPG, PNG, atau WebP (maks. 2MB).
              </p>
            </div>
          </div>

          {/* Ringkasan Akun */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-[#0A3981]" />
              <span>Akses Masuk Sistem</span>
            </h4>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Username:</span>
                <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {username}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Peran Sistem:</span>
                <span className="font-bold text-[#0A3981]">Petugas Lapangan</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Wilayah:</span>
                <span className="font-medium text-slate-700">{officerWilayah}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── KOLOM KANAN: DETAIL INFORMASI KEPEGAWAIAN & FORM UBAH KATA SANDI ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* 1. KARTU INFORMASI KEPEGAWAIAN (DENGAN EMAIL TERKUNCI KHUSUS KABAG) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#0A3981]" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  1. Informasi Personil & Penugasan
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                Terverifikasi Kedinasan
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  Nama Lengkap
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-800">
                  {officerName}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  NIP / NRP Pegawai
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-800">
                  {officerNip}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  Jabatan Kedinasan
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800">
                  {officerJabatan}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  Wilayah Kerja
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{officerWilayah}</span>
                </div>
              </div>

              {/* ── NOMOR HP / WHATSAPP PETUGAS ── */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-500 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>Nomor HP / WhatsApp Petugas</span>
                  </label>
                  {!isEditingPhone && (
                    <button
                      type="button"
                      onClick={handleStartEditPhone}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0A3981] hover:text-blue-900 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Ubah Nomor</span>
                    </button>
                  )}
                </div>

                {isEditingPhone ? (
                  <form onSubmit={handleSubmitPhone} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={phoneInput}
                        onChange={(e) => {
                          setPhoneInput(e.target.value);
                          if (phoneError) setPhoneError('');
                        }}
                        placeholder="Contoh: 0812-3456-7890"
                        autoFocus
                        className="flex-1 px-3 py-2 text-xs rounded-xl border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-semibold"
                      />
                      <button
                        type="button"
                        onClick={handleCancelEditPhone}
                        className="px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 text-xs font-bold text-white bg-[#0A3981] hover:bg-blue-900 rounded-xl shadow-xs transition-colors cursor-pointer"
                      >
                        Simpan
                      </button>
                    </div>

                    {phoneError && (
                      <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{phoneError}</span>
                      </p>
                    )}

                    <p className="text-[10px] text-slate-400">
                      Nomor ini digunakan untuk penerimaan notifikasi penugasan korban baru dari WhatsApp.
                    </p>
                  </form>
                ) : (
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-800 flex items-center justify-between">
                    <span>{officerTelepon}</span>
                    <span className="text-[10px] text-emerald-700 font-sans font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Tujuan Notifikasi Aktif
                    </span>
                  </div>
                )}

                {phoneSuccessToast && (
                  <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-scale-up">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{phoneSuccessToast}</span>
                  </div>
                )}
              </div>

              {/* ── EMAIL KEDINASAN ── */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>Email Kedinasan Jasa Raharja</span>
                  <span className="text-[10px] text-slate-400 font-normal">(Informasi Akun Tetap)</span>
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800">
                  {officerEmail}
                </div>
              </div>

              {/* ── PLOTTING RUMAH SAKIT TANGGUNG JAWAB ── */}
              <div className="md:col-span-2 pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Rumah Sakit Tanggung Jawab (Plotting RS):</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {officerPlottingRs.length > 0 ? (
                    officerPlottingRs.map((rs, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-[#0A3981] border border-blue-200 shadow-2xs"
                      >
                        <Building2 className="w-3.5 h-3.5 text-blue-500" />
                        <span>{rs}</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">
                      Belum ada rumah sakit yang di-plotting oleh Kabag.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. KARTU UBAH KATA SANDI (PASSWORD) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Key className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  2. Perbarui Kata Sandi (Password)
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                Keamanan Akses Akun
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Anda dapat mengubah kata sandi akses akun petugas Anda sewaktu-waktu. Pastikan kata sandi baru mudah Anda ingat namun sulit ditebak orang lain.
            </p>

            {passwordSuccess && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2 text-xs text-emerald-800 animate-scale-up">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="font-semibold leading-relaxed">{passwordSuccess}</span>
              </div>
            )}

            {passwordError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800 animate-scale-up">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-semibold leading-relaxed">{passwordError}</span>
              </div>
            )}

            <form onSubmit={handleSavePassword} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Kolom Sandi Baru */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Kata Sandi Baru <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      placeholder="Masukkan sandi baru (min 6 char)..."
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 pr-10 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title={showNewPassword ? 'Sembunyikan' : 'Tampilkan'}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Minimal 6 karakter kombinasi huruf atau angka.
                  </p>
                </div>

                {/* Kolom Konfirmasi Sandi */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Konfirmasi Kata Sandi Baru <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder="Ulangi kata sandi baru..."
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full px-3.5 py-2.5 pr-10 text-xs rounded-xl border focus:outline-none focus:ring-2 font-mono ${
                        confirmPassword && confirmPassword !== newPassword
                          ? 'border-rose-300 focus:ring-rose-400 text-rose-800'
                          : 'border-slate-300 focus:ring-blue-500 focus:border-blue-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title={showConfirmPassword ? 'Sembunyikan' : 'Tampilkan'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirmPassword && confirmPassword === newPassword && (
                    <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1 font-semibold">
                      <Check className="w-3 h-3" />
                      <span>Kata sandi cocok</span>
                    </p>
                  )}
                  {confirmPassword && confirmPassword !== newPassword && (
                    <p className="text-[10px] text-rose-500 mt-1">
                      Kata sandi belum sama
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0A3981] hover:bg-blue-900 text-white shadow-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSubmittingPassword ? 'Menyimpan Sandi...' : 'Simpan Kata Sandi Baru'}</span>
                </button>
              </div>
            </form>
          </div>

        </div>

      </div>

      {/* Modal Konfirmasi Perubahan Nomor HP */}
      <ModalConfirmChangePhone
        isOpen={isConfirmPhoneModalOpen}
        onClose={() => setIsConfirmPhoneModalOpen(false)}
        onConfirm={handleConfirmChangePhone}
        oldPhone={officerTelepon}
        newPhone={phoneInput.trim()}
        isLoading={isSavingPhone}
      />
    </div>
  );
}

