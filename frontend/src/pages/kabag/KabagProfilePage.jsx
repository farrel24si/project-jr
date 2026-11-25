import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ModalConfirmChangePhone from '../../components/common/ModalConfirmChangePhone';
import {
  User,
  ShieldCheck,
  Key,
  CheckCircle2,
  AlertCircle,
  Building2,
  MapPin,
  Mail,
  Phone,
  Eye,
  EyeOff,
  Save,
  Check,
  Award,
  Edit2,
  ArrowLeft
} from 'lucide-react';

export default function KabagProfilePage() {
  const { currentUser, updatePassword, updatePhoneNumber } = useAuth();

  const profile = currentUser?.profile || {};
  const kabagName = profile.nama || 'Kepala Bagian Operasional';
  const kabagJabatan = profile.jabatan || 'Kepala Bagian Operasional';
  const kabagCabang = profile.cabang || 'Cabang Utama Riau';
  const kabagWilayah = profile.wilayah || 'Provinsi Riau';
  const kabagEmail = profile.email || 'kabag@jasaraharja.co.id';
  const kabagPhone = profile.telepon || '0812-7001-9988';
  const username = profile.username || 'kabag';

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
    setPhoneInput(kabagPhone && kabagPhone !== '—' ? kabagPhone : '');
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
    if (clean === kabagPhone) {
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
    <div className="space-y-6 pb-12 animate-fade-in max-w-5xl mx-auto">
      {/* ── BREADCRUMB & HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link to="/kabag" className="hover:text-[#0A3981] transition-colors">
              Kepala Bagian
            </Link>
            <span>/</span>
            <span className="text-slate-800 font-semibold">Profil Saya</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Profil &amp; Akun Saya
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Informasi pejabat kedinasan dan pengaturan keamanan akses akun
          </p>
        </div>

        <Link
          to="/kabag"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs self-start sm:self-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Kembali ke Dashboard</span>
        </Link>
      </div>

      {/* ── KARTU IDENTITAS PROFIL (SIMPEL & ELEGAN, TANPA FOTO/AVATAR) ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {kabagName}
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#0A3981] border border-blue-200">
                <Award className="w-3.5 h-3.5 text-[#0A3981]" />
                <span>Otoritas Pimpinan Wilayah</span>
              </span>
            </div>

            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 pt-0.5">
              <span className="font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200">
                {kabagJabatan}
              </span>
              <span className="text-slate-300">•</span>
              <span className="font-medium text-slate-600 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>{kabagCabang}</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="font-medium text-slate-600 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                <span>{kabagWilayah}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── GRID 2 KOLOM: INFORMASI KEPEGAWAIAN & FORM UBAH KATA SANDI ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── KOLOM 1: INFORMASI KEPEGAWAIAN & AKSES SISTEM (2 KOLOM LEBAR) ── */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#0A3981]" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Informasi Pejabat &amp; Akses Sistem
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                Terverifikasi Kedinasan
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Username Akses */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1 text-[11px] uppercase tracking-wider">
                  Username Sistem
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold text-slate-800">
                  {username}
                </div>
              </div>

              {/* Peran Akun */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1 text-[11px] uppercase tracking-wider">
                  Peran Sistem
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 font-bold text-[#0A3981] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#0A3981]" />
                  <span>Kepala Bagian (Kabag)</span>
                </div>
              </div>

              {/* Nama Pejabat */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1 text-[11px] uppercase tracking-wider">
                  Nama Pejabat
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 font-bold text-slate-900">
                  {kabagName}
                </div>
              </div>

              {/* Jabatan Kedinasan */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1 text-[11px] uppercase tracking-wider">
                  Jabatan Kedinasan
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 font-semibold text-slate-800">
                  {kabagJabatan}
                </div>
              </div>

              {/* Unit Kerja */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1 text-[11px] uppercase tracking-wider">
                  Unit Kerja Cabang
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 font-semibold text-slate-800 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>{kabagCabang}</span>
                </div>
              </div>

              {/* Wilayah Pengawasan */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1 text-[11px] uppercase tracking-wider">
                  Wilayah Pengawasan
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 font-semibold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{kabagWilayah}</span>
                </div>
              </div>

              {/* Email Kedinasan */}
              <div className="sm:col-span-2">
                <label className="block text-slate-400 font-semibold mb-1 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <Mail className="w-3 h-3 text-slate-400" />
                  <span>Email Kedinasan</span>
                </label>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 font-medium text-slate-800">
                  {kabagEmail}
                </div>
              </div>

              {/* Nomor HP / WhatsApp */}
              <div className="sm:col-span-2 pt-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-500 font-bold flex items-center gap-1.5 text-xs">
                    <Phone className="w-3.5 h-3.5 text-[#0A3981]" />
                    <span>Nomor HP / WhatsApp Kedinasan</span>
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
                  <form onSubmit={handleSubmitPhone} className="space-y-2 mt-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={phoneInput}
                        onChange={(e) => {
                          setPhoneInput(e.target.value);
                          if (phoneError) setPhoneError('');
                        }}
                        placeholder="Contoh: 0812-7001-9988"
                        autoFocus
                        className="flex-1 px-3 py-2 text-xs rounded-xl border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-semibold bg-white"
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
                      Gunakan nomor WhatsApp aktif diawali 08/628 dengan minimal 10 digit.
                    </p>
                  </form>
                ) : (
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-800 flex items-center justify-between">
                    <span>{kabagPhone}</span>
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
            </div>
          </div>
        </div>

        {/* ── KOLOM 2: UBAH KATA SANDI / KEAMANAN AKUN (1 KOLOM) ── */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Key className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Keamanan Kata Sandi
                </h3>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Perbarui kata sandi akun pimpinan wilayah secara berkala untuk menjaga keamanan akses sistem.
            </p>

            {passwordSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2 text-xs text-emerald-800 animate-scale-up">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="font-semibold leading-relaxed">{passwordSuccess}</span>
              </div>
            )}

            {passwordError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800 animate-scale-up">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-semibold leading-relaxed">{passwordError}</span>
              </div>
            )}

            <form onSubmit={handleSavePassword} className="space-y-3.5">
              {/* Kolom Sandi Baru */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kata Sandi Baru <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    placeholder="Minimal 6 karakter..."
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-9 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showNewPassword ? 'Sembunyikan' : 'Tampilkan'}
                  >
                    {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Kolom Konfirmasi Sandi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Konfirmasi Kata Sandi Baru <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    placeholder="Ulangi kata sandi baru..."
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`w-full px-3 py-2 pr-9 text-xs rounded-xl border focus:outline-none focus:ring-2 font-mono bg-white ${
                      confirmPassword && confirmPassword !== newPassword
                        ? 'border-rose-300 focus:ring-rose-400 text-rose-800'
                        : 'border-slate-300 focus:ring-blue-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showConfirmPassword ? 'Sembunyikan' : 'Tampilkan'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
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

              <button
                type="submit"
                disabled={isSubmittingPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0A3981] hover:bg-blue-900 text-white shadow-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSubmittingPassword ? 'Menyimpan...' : 'Simpan Kata Sandi'}</span>
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* Modal Konfirmasi Perubahan Nomor HP */}
      <ModalConfirmChangePhone
        isOpen={isConfirmPhoneModalOpen}
        onClose={() => setIsConfirmPhoneModalOpen(false)}
        onConfirm={handleConfirmChangePhone}
        oldPhone={kabagPhone}
        newPhone={phoneInput.trim()}
        isLoading={isSavingPhone}
      />
    </div>
  );
}
