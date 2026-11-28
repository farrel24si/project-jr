import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Clock,
  X
} from 'lucide-react';

export default function LoginPage() {
  const { login, isAuthenticated, currentUser, authNotice, clearAuthNotice } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);

  const checkCapsLock = (e) => {
    if (e && typeof e.getModifierState === 'function') {
      setIsCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  // Jika sudah terautentikasi, alihkan otomatis ke dashboard sesuai role
  useEffect(() => {
    if (isAuthenticated && currentUser?.role) {
      navigate(currentUser.role === 'kabag' ? '/kabag' : '/petugas', { replace: true });
    }
  }, [isAuthenticated, currentUser, navigate]);

  const handleSignIn = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrorMessage('');
    clearAuthNotice();

    const trimmedIdentifier = identifier.trim();
    const trimmedPassword = password.trim();

    if (!trimmedIdentifier) {
      setErrorMessage('Silakan masukkan email perusahaan Anda.');
      return;
    }

    if (/[A-Z]/.test(trimmedIdentifier)) {
      setErrorMessage('Email tidak boleh menggunakan huruf besar (Caps Lock). Harap gunakan huruf kecil.');
      return;
    }

    const emailLower = trimmedIdentifier.toLowerCase();
    const companyDomainRegex = /^[a-z0-9._%+-]+@jasaraharja\.co\.id$/;
    if (!companyDomainRegex.test(emailLower)) {
      setErrorMessage('Email harus menggunakan email resmi perusahaan.');
      return;
    }

    if (!trimmedPassword) {
      setErrorMessage('Silakan masukkan kata sandi.');
      return;
    }

    setIsSubmitting(true);
    const result = await login(emailLower, trimmedPassword);
    setIsSubmitting(false);

    if (result.success) {
      navigate(result.role === 'kabag' ? '/kabag' : '/petugas', { replace: true });
    } else {
      setErrorMessage(result.message || 'Email atau kata sandi tidak sesuai.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row relative">

      {/* ── FLOATING NOTIFICATION TOAST (Zero Layout Shift / Anti-Perpindahan) ── */}
      {(authNotice || errorMessage) && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 sm:top-6 sm:w-96 z-50 animate-in fade-in slide-in-from-top-3 duration-200"
        >
          <div
            className={`p-4 rounded-2xl shadow-xl border flex items-start gap-3 backdrop-blur-md transition-all ${
              authNotice
                ? 'bg-amber-50/95 border-amber-200 text-amber-900 shadow-amber-900/10'
                : 'bg-rose-50/95 border-rose-200 text-rose-900 shadow-rose-900/10'
            }`}
          >
            {authNotice ? (
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-700">
                <Clock className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 text-rose-700">
                <AlertCircle className="w-4 h-4" />
              </div>
            )}

            <div className="flex-1 min-w-0 pt-0.5">
              <p className="font-bold text-xs">
                {authNotice ? 'Informasi Sesi' : 'Gagal Masuk'}
              </p>
              <p className="text-[11px] sm:text-xs text-slate-700 mt-0.5 leading-relaxed">
                {authNotice || errorMessage}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (authNotice) clearAuthNotice();
                if (errorMessage) setErrorMessage('');
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-black/5 transition-colors cursor-pointer shrink-0"
              title="Tutup pemberitahuan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── LEFT PANEL ── */}
      <div className="relative flex-1 bg-[#145DA0] flex flex-col justify-between overflow-hidden px-6 py-8 sm:px-8 sm:py-10 md:px-12 md:py-14 min-h-[200px] md:min-h-screen">

        {/* Decorative circles */}
        <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute top-1/3 -left-24 w-80 h-80 rounded-full bg-white/8 pointer-events-none" />
        <div className="absolute -bottom-20 -right-10 w-72 h-72 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute bottom-10 right-16 w-40 h-40 rounded-full bg-[#0a3d80]/60 pointer-events-none" />

        {/* Top brand badge */}
        <div className="relative z-10">
          <span className="inline-block bg-white/15 border border-white/25 text-white text-[11px] sm:text-xs font-bold px-3 py-1 rounded-full tracking-widest uppercase">
            SIMKORP
          </span>
        </div>

        {/* Main headline */}
        <div className="relative z-10 mt-6 md:mt-0">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-none">
            SELAMAT<br />DATANG
          </h1>
          <p className="text-white font-bold text-sm sm:text-base mt-2.5 tracking-wide">
            SIMKORP
          </p>
          <p className="text-blue-200 text-xs sm:text-sm mt-1.5 leading-relaxed max-w-xs">
            Sistem Monitoring Kinerja Petugas &amp; Pemantauan Korban Kecelakaan PT Jasa Raharja (Persero)
          </p>
        </div>

        {/* Footer */}
        <div className="relative z-10 mt-6 md:mt-0">
          <p className="text-blue-300 text-[11px] sm:text-xs">
            &copy; 2026 &nbsp;&bull;&nbsp; PT Jasa Raharja (Persero) Kantor Wilayah Riau
          </p>
        </div>
      </div>
      
      <div className="flex-1 bg-white flex flex-col justify-center px-6 py-8 sm:px-10 md:px-14 lg:px-20 relative overflow-hidden">

        {/* Decorative circle bottom-right */}
        <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full bg-[#145DA0]/8 pointer-events-none" />
        <div className="absolute -bottom-6 right-10 w-36 h-36 rounded-full bg-[#145DA0]/10 pointer-events-none" />

        <div className="relative z-10 w-full max-w-sm mx-auto">

          {/* Logo SIMKORP */}
          <div className="mb-3">
            <img
              src="/img/logo-SIMKORP.png"
              alt="Logo SIMKORP"
              className="h-20 sm:h-24 w-auto object-contain object-left -my-3"
            />
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Masuk</h2>
            <p className="text-slate-500 text-sm mt-1.5">
              Silakan masukkan email resmi perusahaan dan kata sandi Anda.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSignIn} className="space-y-4">

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Email Perusahaan
                </label>
                {isCapsLockOn && (
                  <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                    Caps Lock Aktif (Otomatis Huruf Kecil)
                  </span>
                )}
              </div>
              <div className="relative">
                <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${
                  errorMessage && (errorMessage.toLowerCase().includes('email') || !identifier)
                    ? 'text-rose-500'
                    : 'text-slate-400'
                }`} />
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={identifier}
                  onKeyDown={checkCapsLock}
                  onKeyUp={checkCapsLock}
                  onChange={(e) => {
                    // Paksa otomatis huruf kecil dan hapus spasi (mencegah capslock / huruf kapital)
                    const sanitized = e.target.value.toLowerCase().replace(/\s+/g, '');
                    setIdentifier(sanitized);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="contoh: nama@gmail.com"
                  className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm lowercase focus:outline-none transition-all ${
                    errorMessage && (errorMessage.toLowerCase().includes('email') || !identifier)
                      ? 'border-rose-400 bg-rose-50/20 text-slate-800 focus:ring-2 focus:ring-rose-200 focus:border-rose-500'
                      : 'border-slate-200 bg-slate-50 text-slate-800 focus:ring-2 focus:ring-[#145DA0]/30 focus:border-[#145DA0] focus:bg-white'
                  }`}
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Kata Sandi
                </label>
                {isCapsLockOn && (
                  <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                    Caps Lock Aktif
                  </span>
                )}
              </div>
              <div className="relative">
                <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${
                  errorMessage && (errorMessage.toLowerCase().includes('sandi') || errorMessage.toLowerCase().includes('sesuai') || !password)
                    ? 'text-rose-500'
                    : 'text-slate-400'
                }`} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onKeyDown={checkCapsLock}
                  onKeyUp={checkCapsLock}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="••••••••"
                  className={`w-full pl-10 pr-12 py-2.5 rounded-lg border text-sm focus:outline-none transition-all ${
                    errorMessage && (errorMessage.toLowerCase().includes('sandi') || errorMessage.toLowerCase().includes('sesuai') || !password)
                      ? 'border-rose-400 bg-rose-50/20 text-slate-800 focus:ring-2 focus:ring-rose-200 focus:border-rose-500'
                      : 'border-slate-200 bg-slate-50 text-slate-800 focus:ring-2 focus:ring-[#145DA0]/30 focus:border-[#145DA0] focus:bg-white'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2 pt-1">
              <input
                id="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#145DA0] focus:ring-[#145DA0] cursor-pointer"
              />
              <label htmlFor="remember" className="text-xs text-slate-600 cursor-pointer select-none">
                Ingat saya di perangkat ini
              </label>
            </div>

            {/* Sign In button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold bg-[#17365D] hover:bg-[#0f2540] text-white shadow-md transition-all active:scale-[0.98] mt-2 cursor-pointer disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Memverifikasi...' : 'Masuk ke Sistem'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
