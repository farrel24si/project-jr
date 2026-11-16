import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  Home, 
  Calendar, 
  Bell, 
  RotateCcw, 
  LogOut, 
  Menu,
  ShieldCheck,
  ArrowUpRight,
  CheckCheck
} from 'lucide-react';
import { storageService } from '../../services/storageService';

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Baru saja';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSec < 60) return 'Baru saja';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} mnt lalu`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} jam lalu`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay} hr lalu`;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  } catch {
    return 'Baru saja';
  }
}

export default function Navbar({ onToggleSidebar }) {
  const { currentUser, isPetugas, isKabag, logout } = useAuth();
  const navigate = useNavigate();

  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);

  const loadNotifications = () => {
    const all = storageService.getNotifications();
    if (isKabag) {
      setNotifications(all);
      return;
    }
    const officerId = currentUser?.profile?.id;
    const officerName = (currentUser?.profile?.nama || '').toLowerCase().trim();
    const plotting = Array.isArray(currentUser?.profile?.plottingRs)
      ? currentUser.profile.plottingRs.map((r) => (r || '').toLowerCase().trim())
      : [];

    const filtered = all.filter((n) => {
      if (n.officerId && officerId && String(n.officerId).trim() === String(officerId).trim()) return true;
      if (n.officerName && officerName && n.officerName.toLowerCase().trim() === officerName) return true;
      if (
        n.rumahSakitTujuan &&
        plotting.some((p) => {
          const t = n.rumahSakitTujuan.toLowerCase().trim();
          return p === t || (t.length >= 4 && (p.includes(t) || t.includes(p)));
        })
      ) {
        return true;
      }
      return false;
    });
    setNotifications(filtered);
  };

  useEffect(() => {
    loadNotifications();
    window.addEventListener('jr_notifications_updated', loadNotifications);
    window.addEventListener('jr_officers_updated', loadNotifications);
    return () => {
      window.removeEventListener('jr_notifications_updated', loadNotifications);
      window.removeEventListener('jr_officers_updated', loadNotifications);
    };
  }, [currentUser?.profile?.id, currentUser?.profile?.nama, isKabag]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNotificationClick = (notif) => {
    storageService.markNotificationAsRead(notif.id);
    setNotifDropdownOpen(false);
    if (notif.victimId) {
      navigate(isKabag ? `/kabag/monitoring?search=${encodeURIComponent(notif.victimName || notif.victimId)}` : `/petugas/korban/${notif.victimId}`);
    }
  };

  const handleMarkAllRead = () => {
    storageService.markAllNotificationsAsRead(isKabag ? null : currentUser?.profile?.id);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

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

      {/* Right: Notifications & Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Notification Bell with Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifDropdownOpen((prev) => !prev)}
            className={`p-2 rounded-lg transition-colors relative cursor-pointer ${
              notifDropdownOpen
                ? 'bg-blue-50 text-[#145DA0]'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
            title="Notifikasi Rujukan & Sistem"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 ring-2 ring-white shadow-xs">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown Popover */}
          {notifDropdownOpen && (
            <div className="absolute right-0 mt-2 w-[calc(100vw-24px)] max-w-sm sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-xs">Notifikasi Rujukan</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                      {unreadCount} Baru
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-semibold text-[#145DA0] hover:text-[#0b3c68] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Tandai dibaca</span>
                  </button>
                )}
              </div>

              <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    <Bell className="w-6 h-6 mx-auto mb-1.5 text-slate-300 stroke-1" />
                    <span>Belum ada notifikasi rujukan</span>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3 ${
                        !notif.read ? 'bg-violet-50/40 font-medium' : ''
                      }`}
                    >
                      <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0 mt-0.5">
                        <ArrowUpRight className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-[11px] font-bold text-violet-900 truncate">
                            {notif.title || 'Rujukan Korban Masuk'}
                          </span>
                          {!notif.read && (
                            <span className="w-2 h-2 rounded-full bg-[#145DA0] shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-slate-700 leading-snug">
                          {notif.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 flex-wrap">
                          <span className="font-semibold text-violet-700">
                            Tujuan: {notif.rumahSakitTujuan}
                          </span>
                          <span>•</span>
                          <span>{formatRelativeTime(notif.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="px-4 py-2 border-t border-slate-100 text-center bg-slate-50/50">
                <span className="text-[10px] text-slate-400">
                  Klik notifikasi untuk membuka detail &amp; riwayat korban
                </span>
              </div>
            </div>
          )}
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
          <Link
            to={isKabag ? '/kabag/profil' : '/petugas/profil'}
            className="flex items-center gap-2 hover:opacity-85 transition-opacity cursor-pointer group"
            title="Profil & Pengaturan Akun"
          >
            <div className="w-8 h-8 rounded-full bg-[#0A3981] text-white flex items-center justify-center font-bold text-xs shadow-2xs overflow-hidden ring-1 ring-slate-200">
              {currentUser?.profile?.avatar && (currentUser.profile.avatar.startsWith('data:image') || currentUser.profile.avatar.startsWith('http')) ? (
                <img src={currentUser.profile.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                currentUser?.profile?.avatar || (isKabag ? 'KB' : 'PT')
              )}
            </div>
            <div className="hidden xl:block text-left text-xs leading-tight">
              <span className="font-bold text-slate-800 block truncate max-w-[140px] group-hover:text-[#0A3981] transition-colors">
                {currentUser?.profile?.nama?.split(',')[0] || (isKabag ? 'Kabag' : 'Petugas')}
              </span>
              <span className="text-[10px] text-slate-500 block">
                {isKabag ? 'Kabag Aktif' : 'Petugas Aktif'}
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Keluar"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
