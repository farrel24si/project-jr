import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, ArrowLeft, LogOut, Lock } from 'lucide-react';

export default function AccessDeniedPage({ requiredRole }) {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();

  const userRole = currentUser?.role || 'tidak terdefinisi';
  const roleNameMap = {
    kabag: 'Kepala Bagian Operasional (Kabag)',
    petugas: 'Petugas Lapangan',
    pic_rs: 'PIC Fasilitas Kesehatan / RS'
  };

  const currentRoleName = roleNameMap[userRole] || userRole;
  const targetRoleName = roleNameMap[requiredRole] || requiredRole;

  const handleReturnToDashboard = () => {
    if (userRole === 'kabag') {
      navigate('/kabag', { replace: true });
    } else if (userRole === 'petugas') {
      navigate('/petugas', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  };

  const handleLogoutAndSwitch = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200/90 shadow-xl p-6 sm:p-8 text-center space-y-6">
        
        {/* Icon Header */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs">
          <ShieldAlert className="w-8 h-8" />
        </div>

        {/* Text Details */}
        <div className="space-y-2">
          <span className="inline-block px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest bg-rose-100 text-rose-800 border border-rose-200">
            Akses Ditolak (403 Forbidden)
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Izin Akses Tidak Memadai
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            Halaman internal ini diproteksi oleh kebijakan keamanan otorisasi bertingkat PT Jasa Raharja dan hanya dapat diakses oleh peran yang berwenang.
          </p>
        </div>

        {/* Role Comparison Badge */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 text-left text-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Akun Masuk Saat Ini:</span>
            <span className="font-bold text-slate-800">{currentUser?.profile?.nama || currentUser?.profile?.username || 'Pengguna'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Peran Anda:</span>
            <span className="font-bold text-slate-900 bg-slate-200/70 px-2 py-0.5 rounded">{currentRoleName}</span>
          </div>
          {requiredRole && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
              <span className="text-rose-600 font-medium">Peran yang Dibutuhkan:</span>
              <span className="font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">{targetRoleName}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2.5 pt-2">
          <button
            type="button"
            onClick={handleReturnToDashboard}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-[#145DA0] hover:bg-[#0f4980] text-white shadow-md transition-all cursor-pointer active:scale-[0.98]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Dashboard Saya</span>
          </button>

          <button
            type="button"
            onClick={handleLogoutAndSwitch}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar &amp; Gunakan Akun Lain</span>
          </button>
        </div>

        <p className="text-[10px] text-slate-400">
          Sistem Monitoring Terintegrasi &bull; PT Jasa Raharja (Persero)
        </p>
      </div>
    </div>
  );
}

