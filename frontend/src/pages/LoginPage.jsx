import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { INITIAL_OFFICERS, INITIAL_KABAG } from '../data/mockData';
import {
  ArrowRight,
  Mail,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';

export default function LoginPage() {
  const { loginAsOfficer, loginAsKabag } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleSignIn = (e) => {
    if (e && e.preventDefault) e.preventDefault();

    const trimmed = email.trim().toLowerCase();

    // Check if logging in as Kabag (by email, username, or keyword 'kabag')
    if (
      trimmed.includes('kabag') ||
      trimmed === INITIAL_KABAG.email.toLowerCase() ||
      trimmed.includes('kepala')
    ) {
      loginAsKabag();
      navigate('/kabag');
      return;
    }

    // Check if matching specific officer
    const matchedOfficer = INITIAL_OFFICERS.find(
      (o) =>
        o.email.toLowerCase() === trimmed ||
        o.nama.toLowerCase().includes(trimmed) ||
        o.id.toLowerCase() === trimmed
    );

    if (matchedOfficer) {
      loginAsOfficer(matchedOfficer.id);
      navigate('/petugas');
      return;
    }

    // Default: login as default officer (Hendra / Adi Putra)
    loginAsOfficer(INITIAL_OFFICERS[0].id);
    navigate('/petugas');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">

      {/* ── LEFT PANEL ── */}
      <div className="relative flex-1 bg-[#145DA0] flex flex-col justify-between overflow-hidden px-8 py-10 md:px-12 md:py-14 min-h-[220px] md:min-h-screen">

        {/* Decorative circles */}
        <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute top-1/3 -left-24 w-80 h-80 rounded-full bg-white/8 pointer-events-none" />
        <div className="absolute -bottom-20 -right-10 w-72 h-72 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute bottom-10 right-16 w-40 h-40 rounded-full bg-[#0a3d80]/60 pointer-events-none" />

        {/* Top brand badge */}
        <div className="relative z-10">
          <span className="inline-block bg-white/15 border border-white/25 text-white text-xs font-bold px-3 py-1 rounded-full tracking-widest uppercase">
            JR-MONITORING
          </span>
        </div>

        {/* Main headline */}
        <div className="relative z-10 mt-8 md:mt-0">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-none">
            SELAMAT<br />DATANG
          </h1>
          <p className="text-white font-bold text-base mt-3 tracking-wide">
            JR-MONITORING
          </p>
          <p className="text-blue-200 text-sm mt-2 leading-relaxed max-w-xs">
            Sistem Monitoring Kinerja Petugas &amp; Pemantauan Korban Kecelakaan PT Jasa Raharja (Persero)
          </p>
        </div>

        {/* Footer */}
        <div className="relative z-10 mt-8 md:mt-0">
          <p className="text-blue-300 text-xs">
            © 2026 JR-MONITORING &nbsp;•&nbsp; PT Jasa Raharja (Persero)
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 bg-white flex flex-col justify-center px-8 py-10 sm:px-12 md:px-16 lg:px-20 relative overflow-hidden">

        {/* Decorative circle bottom-right */}
        <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full bg-[#145DA0]/8 pointer-events-none" />
        <div className="absolute -bottom-6 right-10 w-36 h-36 rounded-full bg-[#145DA0]/10 pointer-events-none" />

        <div className="relative z-10 w-full max-w-sm mx-auto">

          {/* Logo Jasa Raharja */}
          <div className="mb-6">
            <img
              src="/img/logo-jasa-raharja.png"
              alt="Logo PT Jasa Raharja"
              className="h-11 w-auto object-contain"
            />
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Masuk</h2>
            <p className="text-slate-500 text-sm mt-1.5">
              Silakan masukkan email dan kata sandi Anda untuk mengakses akun.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSignIn} className="space-y-4">

            {/* Email field */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email / ID Pengguna
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contoh: petugas@jasaraharja.co.id"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#145DA0]/30 focus:border-[#145DA0] focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Kata Sandi
                </label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-12 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#145DA0]/30 focus:border-[#145DA0] focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
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
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold bg-[#17365D] hover:bg-[#0f2540] text-white shadow-md transition-all active:scale-[0.98] mt-2 cursor-pointer"
            >
              <span>Masuk ke Sistem</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Footer note */}
          <p className="text-[11px] text-slate-400 text-center mt-8 leading-relaxed">
            Sistem ini hanya dapat diakses oleh pegawai PT Jasa Raharja (Persero) yang telah mendapat otorisasi.<br />
            Prototipe Internal © 2026
          </p>
        </div>
      </div>
    </div>
  );
}
