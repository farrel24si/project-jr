import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Home, 
  Calendar, 
  Bell, 
  ArrowLeftRight, 
  RotateCcw, 
  LogOut, 
  Menu,
  ShieldCheck
} from 'lucide-react';
import { storageService } from '../../services/storageService';

export default function Navbar({ onToggleSidebar }) {
  const { currentUser, switchRole, isPetugas, isKabag, logout } = useAuth();

  const handleReset = () => {
    if (window.confirm('Kembalikan seluruh data simulasi ke kondisi awal?')) {
      storageService.resetData();
      window.location.reload();
    }
  };

  const currentDateFormatted = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <header className="bg-white border-b border-slate-200/90 h-16 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          aria-label="Toggle Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 text-xs text-slate-500 flex-wrap">
          <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
            <Home className="w-3.5 h-3.5 text-slate-400" />
            <span>/</span>
            <span>Sistem Monitoring Terpadu</span>
          </div>
          <span className="text-slate-300 hidden sm:inline">•</span>
          <div className="hidden sm:flex items-center gap-1.5 text-slate-500">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentDateFormatted}</span>
          </div>
        </div>
      </div>

      {/* Right: Notifications, Role Switcher, Profile */}
      <div className="flex items-center gap-2 sm:gap-3">

        {/* Quick Role Switcher */}
        <button
          type="button"
          onClick={() => switchRole(isPetugas ? 'kabag' : 'petugas')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-[#0A3981] border border-slate-200 transition-colors"
          title="Beralih peran untuk simulasi"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-blue-700" />
          <span className="hidden sm:inline">Peran:</span>
          <span className="font-bold text-[#0A3981]">
            {isPetugas ? 'Petugas' : 'Kepala Bagian'}
          </span>
        </button>

        {/* Notification Bell */}
        <div className="relative">
          <button
            type="button"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors relative"
            title="Notifikasi Kasus Mendesak"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-600 ring-2 ring-white"></span>
          </button>
        </div>

        {/* Reset Demo Data Button */}
        <button
          type="button"
          onClick={handleReset}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Reset data simulasi ke awal"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* User Chip */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-[#0A3981] text-white flex items-center justify-center font-bold text-xs shadow-2xs">
            {currentUser?.profile?.avatar || 'JK'}
          </div>
          <div className="hidden xl:block text-left text-xs leading-tight">
            <span className="font-bold text-slate-800 block truncate max-w-[140px]">
              {currentUser?.profile?.nama?.split(',')[0]}
            </span>
            <span className="text-[10px] text-slate-500 block">
              {isKabag ? 'Kabag Aktif' : 'Petugas Aktif'}
            </span>
          </div>

          <button
            type="button"
            onClick={logout}
            className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-colors"
            title="Keluar"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
