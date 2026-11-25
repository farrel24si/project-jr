import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  Home, 
  Calendar, 
  Bell, 
  LogOut, 
  Menu,
  ArrowUpRight,
  CheckCheck,
  AlertTriangle,
  Clock,
  UserCheck,
  CheckCircle2
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { calculateFirstVisitSla, calculateMonitoringSla } from '../../services/slaService';

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
  const { currentUser, isKabag, logout } = useAuth();
  const navigate = useNavigate();

  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'UNREAD' | 'SLA'
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);

  const loadNotifications = () => {
    // 1. Ambil notifikasi persisten dari storage (seperti notifikasi rujukan antar RS)
    const storedNotifs = storageService.getNotifications() || [];

    // 2. Ambil ID notifikasi yang sudah ditandai dibaca dari localStorage
    let readIds = new Set();
    try {
      const storedRead = localStorage.getItem('jr_read_notification_ids');
      if (storedRead) {
        readIds = new Set(JSON.parse(storedRead));
      }
    } catch {
      // ignore
    }

    // 3. Generate notifikasi operasional SLA & Pemantauan secara dinamis dari data korban terkini
    const victims = storageService.getVictims() || [];
    const now = new Date();
    const systemNotifs = [];

    const officerId = currentUser?.profile?.id;
    const officerName = (currentUser?.profile?.nama || '').toLowerCase().trim();
    const plotting = Array.isArray(currentUser?.profile?.plottingRs)
      ? currentUser.profile.plottingRs.map((r) => (r || '').toLowerCase().trim())
      : [];

    victims.forEach((v) => {
      const isDischarged = Boolean(
        v.kondisiTerakhir === 'Sudah Pulang' ||
        v.kondisiTerakhir === 'Pulang' ||
        v.kondisiTerakhir === 'Selesai' ||
        v.kondisiTerakhir === 'Meninggal Dunia' ||
        v.status_kondisi === 'Pulang' ||
        v.status_kondisi === 'Sudah Pulang' ||
        v.status_kondisi === 'Selesai' ||
        v.status_kondisi === 'Meninggal Dunia' ||
        (v.statusPemantauan === 'Selesai Dipantau' && !v.isRawatLanjutan)
      );

      // A. Kunjungan Awal (First Visit SLA)
      const fSla = calculateFirstVisitSla(v.tanggalInformasiDiterima, v.kunjunganPertama, now);
      if (!v.kunjunganPertama || v.kunjunganPertama.statusKunjungan === 'Menunggu') {
        if (fSla.isOverdue) {
          systemNotifs.push({
            id: `SYS-FIRST-OVERDUE-${v.id}`,
            type: 'SLA_TERLAMBAT',
            title: 'Kunjungan Awal Terlambat',
            message: `Kunjungan awal korban ${v.nama} di ${v.rumahSakit} telah melewati batas waktu 3 hari.`,
            victimId: v.id,
            victimName: v.nama,
            rumahSakitTujuan: v.rumahSakit,
            officerId: v.petugasId,
            officerName: v.namaPetugas || 'Petugas RS',
            createdAt: v.tanggalInformasiDiterima || now.toISOString(),
            priority: 1
          });
        } else {
          systemNotifs.push({
            id: `SYS-FIRST-WAITING-${v.id}`,
            type: 'TUGAS_MENUNGGU',
            title: 'Menunggu Kunjungan Pertama',
            message: `Korban baru ${v.nama} di ${v.rumahSakit} sedang menunggu pelaksanaan kunjungan awal.`,
            victimId: v.id,
            victimName: v.nama,
            rumahSakitTujuan: v.rumahSakit,
            officerId: v.petugasId,
            officerName: v.namaPetugas || 'Petugas RS',
            createdAt: v.tanggalInformasiDiterima || now.toISOString(),
            priority: 3
          });
        }
      }

      // B. Pemantauan Lanjutan Berkala (Monitoring SLA 3 Hari)
      if (!isDischarged && v.kunjunganPertama && v.kunjunganPertama.statusKunjungan !== 'Menunggu') {
        const mSla = calculateMonitoringSla(v, now);
        if (mSla.isOverdue && mSla.status === 'TERLAMBAT') {
          systemNotifs.push({
            id: `SYS-MON-OVERDUE-${v.id}`,
            type: 'SLA_TERLAMBAT',
            title: 'Kunjungan Pemantauan Terlambat',
            message: `Pemantauan berkala korban ${v.nama} di ${v.rumahSakit} melewati interval 3 hari (72 Jam).`,
            victimId: v.id,
            victimName: v.nama,
            rumahSakitTujuan: v.rumahSakit,
            officerId: v.petugasId,
            officerName: v.namaPetugas || 'Petugas RS',
            createdAt: v.jadwalKunjunganBerikutnya || v.jadwalPemantauanBerikutnya || now.toISOString(),
            priority: 1
          });
        } else if (mSla.isWarning && mSla.status === 'MENDEKATI_TENGGAT') {
          systemNotifs.push({
            id: `SYS-MON-WARN-${v.id}`,
            type: 'SLA_MENDEKATI_TENGGAT',
            title: 'Mendekati Batas Waktu',
            message: `Jadwal kunjungan ${v.nama} di ${v.rumahSakit} tersisa kurang dari 24 jam.`,
            victimId: v.id,
            victimName: v.nama,
            rumahSakitTujuan: v.rumahSakit,
            officerId: v.petugasId,
            officerName: v.namaPetugas || 'Petugas RS',
            createdAt: v.jadwalKunjunganBerikutnya || v.jadwalPemantauanBerikutnya || now.toISOString(),
            priority: 2
          });
        }
      }
    });

    // Gabungkan notifikasi tersimpan (rujukan antar RS) + notifikasi sistem (SLA & Kunjungan)
    const combined = [...storedNotifs, ...systemNotifs];

    // Filter notifikasi sesuai role pengguna
    let roleFiltered = combined;
    if (!isKabag) {
      roleFiltered = combined.filter((n) => {
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
    }

    // Terapkan status read dari localStorage / storage
    const finalNotifs = roleFiltered.map((n) => ({
      ...n,
      read: Boolean(n.read || readIds.has(n.id))
    })).sort((a, b) => {
      // Prioritaskan yang belum dibaca, lalu tingkat urgensi SLA, kemudian waktu terbaru
      if (a.read !== b.read) return a.read ? 1 : -1;
      if ((a.priority || 4) !== (b.priority || 4)) return (a.priority || 4) - (b.priority || 4);
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    setNotifications(finalNotifs);
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadNotifications();
    window.addEventListener('jr_notifications_updated', loadNotifications);
    window.addEventListener('jr_victims_updated', loadNotifications);
    window.addEventListener('jr_officers_updated', loadNotifications);
    return () => {
      window.removeEventListener('jr_notifications_updated', loadNotifications);
      window.removeEventListener('jr_victims_updated', loadNotifications);
      window.removeEventListener('jr_officers_updated', loadNotifications);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.profile?.id, currentUser?.profile?.nama, isKabag]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'UNREAD') {
      return notifications.filter((n) => !n.read);
    }
    if (activeTab === 'SLA') {
      return notifications.filter((n) => n.type === 'SLA_TERLAMBAT' || n.type === 'SLA_MENDEKATI_TENGGAT');
    }
    return notifications;
  }, [notifications, activeTab]);

  const handleNotificationClick = (notif) => {
    try {
      const storedRead = localStorage.getItem('jr_read_notification_ids');
      const readSet = new Set(storedRead ? JSON.parse(storedRead) : []);
      readSet.add(notif.id);
      localStorage.setItem('jr_read_notification_ids', JSON.stringify([...readSet]));
    } catch {
      // ignore
    }

    if (notif.id && !notif.id.startsWith('SYS-')) {
      storageService.markNotificationAsRead(notif.id);
    }

    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
    );
    setNotifDropdownOpen(false);

    if (notif.victimId) {
      if (isKabag) {
        navigate(`/kabag/monitoring?search=${encodeURIComponent(notif.victimName || notif.victimId)}`);
      } else {
        navigate(`/petugas/korban/${notif.victimId}`);
      }
    } else if (notif.officerId && isKabag) {
      navigate(`/kabag/kinerja-petugas/${notif.officerId}`);
    }
  };

  const handleMarkAllRead = () => {
    try {
      const allIds = notifications.map((n) => n.id);
      localStorage.setItem('jr_read_notification_ids', JSON.stringify(allIds));
    } catch {
      // ignore
    }
    storageService.markAllNotificationsAsRead(isKabag ? null : currentUser?.profile?.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const currentDateFormatted = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 11) return 'Selamat Pagi';
    if (hour >= 11 && hour < 15) return 'Selamat Siang';
    if (hour >= 15 && hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  }, []);

  const userName = currentUser?.profile?.nama || currentUser?.nama || (isKabag ? 'Kabag' : 'Petugas');

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
            className={`p-2 rounded-xl transition-all relative cursor-pointer ${
              notifDropdownOpen
                ? 'bg-[#145DA0] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={currentUser?.role === 'petugas' ? 'Pusat Notifikasi & Batas Waktu' : 'Pusat Notifikasi & Peringatan SLA'}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 ring-2 ring-white shadow-xs animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown Popover */}
          {notifDropdownOpen && (
            <div className="absolute right-0 mt-2 w-[calc(100vw-24px)] max-w-sm sm:w-[420px] bg-white rounded-2xl shadow-2xl border border-slate-200/95 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              {/* Header Popover */}
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 text-xs tracking-tight">
                    {currentUser?.role === 'petugas' ? 'Notifikasi & Batas Waktu' : 'Notifikasi & Peringatan SLA'}
                  </span>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700">
                      {unreadCount} Baru
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-bold text-[#145DA0] hover:text-[#0A3981] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Tandai dibaca</span>
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTab('ALL')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    activeTab === 'ALL'
                      ? 'bg-white text-[#145DA0] shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Semua ({notifications.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('UNREAD')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    activeTab === 'UNREAD'
                      ? 'bg-white text-[#145DA0] shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Belum Dibaca ({unreadCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('SLA')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    activeTab === 'SLA'
                      ? 'bg-white text-rose-600 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {currentUser?.role === 'petugas' ? 'Batas Waktu' : 'Peringatan SLA'}
                </button>
              </div>

              {/* Notif List */}
              <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                {filteredNotifications.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400 px-4">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500 stroke-1" />
                    <p className="font-bold text-slate-700">Semua Terpantau Baik</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {activeTab === 'UNREAD'
                        ? 'Tidak ada notifikasi baru yang belum dibaca.'
                        : currentUser?.role === 'petugas'
                        ? 'Tidak ada peringatan keterlambatan batas waktu pada saat ini.'
                        : 'Tidak ada peringatan keterlambatan SLA pada saat ini.'}
                    </p>
                  </div>
                ) : (
                  filteredNotifications.map((notif) => {
                    const isLate = notif.type === 'SLA_TERLAMBAT';
                    const isWarning = notif.type === 'SLA_MENDEKATI_TENGGAT';
                    const isRujukan = notif.type === 'RUJUKAN_MASUK';

                    let iconBg = 'bg-blue-100 text-blue-700';
                    let IconComponent = UserCheck;
                    let tagText = 'Tugas Baru';
                    let tagStyle = 'bg-blue-50 text-blue-700 border-blue-200';

                    if (isLate) {
                      iconBg = 'bg-rose-100 text-rose-700';
                      IconComponent = AlertTriangle;
                      tagText = currentUser?.role === 'petugas' ? 'Lewat Batas Waktu' : 'SLA Lewat';
                      tagStyle = 'bg-rose-50 text-rose-700 border-rose-200';
                    } else if (isWarning) {
                      iconBg = 'bg-amber-100 text-amber-700';
                      IconComponent = Clock;
                      tagText = 'Mendekati Batas';
                      tagStyle = 'bg-amber-50 text-amber-800 border-amber-200';
                    } else if (isRujukan) {
                      iconBg = 'bg-violet-100 text-violet-700';
                      IconComponent = ArrowUpRight;
                      tagText = 'Rujukan RS';
                      tagStyle = 'bg-violet-50 text-violet-700 border-violet-200';
                    }

                    return (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3 ${
                          !notif.read ? 'bg-blue-50/30' : ''
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-xl ${iconBg} flex items-center justify-center shrink-0 mt-0.5 shadow-2xs`}>
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1.5 mb-1">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {notif.title}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${tagStyle}`}>
                                {tagText}
                              </span>
                              {!notif.read && (
                                <span className="w-2 h-2 rounded-full bg-[#145DA0] shrink-0" />
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 leading-snug">
                            {notif.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400 flex-wrap">
                            {notif.officerName && (
                              <span className="font-semibold text-slate-600">
                                Petugas: {notif.officerName}
                              </span>
                            )}
                            {notif.officerName && <span>•</span>}
                            <span>{formatRelativeTime(notif.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer Popover */}
              <div className="px-4 py-2 border-t border-slate-100 text-center bg-slate-50/70 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  Klik notifikasi untuk membuka rincian korban
                </span>
                {isKabag && (
                  <Link
                    to="/kabag/monitoring"
                    onClick={() => setNotifDropdownOpen(false)}
                    className="text-[10px] font-bold text-[#145DA0] hover:underline"
                  >
                    Buka Monitoring
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Info - Menampilkan Sapaan Waktu & Nama Pengguna */}
        <div className="flex items-center gap-1.5 sm:gap-2 pl-2 border-l border-slate-200">
          <Link
            to={isKabag ? '/kabag/profil' : '/petugas/profil'}
            className="flex items-center px-2 sm:px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer group"
            title="Profil & Pengaturan Akun"
          >
            <span className="text-xs font-bold text-slate-800 group-hover:text-[#0A3981] transition-colors whitespace-nowrap flex items-center">
              <span className="text-slate-500 font-semibold mr-1">{greeting},</span>
              <span className="truncate max-w-[130px] sm:max-w-xs">{userName}</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            title="Keluar"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
