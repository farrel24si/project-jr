import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  BarChart3,
  Users,
  UserCheck,
  CalendarCheck,
  History,
  LogOut,
  FileText,
  User
} from 'lucide-react';

export default function Sidebar({ isOpen, onClose }) {
  const { isPetugas, isKabag, currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const kabagLinks = [
    {
      to: '/kabag',
      label: 'Dashboard',
      icon: LayoutDashboard,
      end: true
    },
    {
      to: '/kabag/korban',
      label: 'Daftar Korban',
      icon: Users
    },
    {
      to: '/kabag/monitoring',
      label: 'Monitoring Kunjungan',
      icon: CalendarCheck
    },
    {
      to: '/kabag/kinerja',
      label: 'Kinerja Petugas',
      icon: BarChart3
    },
    {
      to: '/kabag/petugas',
      label: 'Data Petugas',
      icon: UserCheck
    },
    {
      to: '/kabag/profil',
      label: 'Akun Saya',
      icon: User
    }
  ];

  const petugasLinks = [
    {
      to: '/petugas',
      label: 'Dashboard Petugas',
      icon: LayoutDashboard,
      end: true
    },
    {
      to: '/petugas/korban',
      label: 'Daftar Korban',
      icon: Users
    },
    {
      to: '/petugas/pemantauan',
      label: 'Pemantauan Berkala',
      icon: CalendarCheck
    },
    {
      to: '/petugas/riwayat',
      label: 'Riwayat Kunjungan',
      icon: History
    },
    {
      to: '/petugas/profil',
      label: 'Akun Saya',
      icon: User
    }
  ];

  const links = isKabag ? kabagLinks : petugasLinks;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden print:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Full-Height Fixed Left Sidebar - Pure White with Interactive Blue Hover & Active States */}
      <aside
        className={`fixed top-0 left-0 z-50 h-dvh w-64 bg-white text-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out shrink-0 border-r border-slate-200/90 shadow-xs overflow-hidden print:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top: Pure Logo Header (No Extra Text) */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="h-16 sm:h-20 px-6 border-b border-slate-100 flex items-center justify-start shrink-0 overflow-hidden">
            <img
              src="/img/logo-SIMKORP.png"
              alt="Logo SIMKORP"
              className="h-20 sm:h-22 w-auto max-w-[180px] object-contain object-left"
            />
          </div>

          {/* Navigation Links */}
          <div className="p-3.5 pt-5 flex-1 overflow-y-auto">
            <nav className="space-y-1.5">
              {links.map((link, idx) => {
                const Icon = link.icon;
                return (
                  <NavLink
                    key={`${link.to}-${idx}`}
                    to={link.to}
                    end={link.end}
                    onClick={() => onClose && onClose()}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                        isActive
                          ? 'bg-[#145DA0] text-white shadow-sm shadow-blue-900/15'
                          : 'text-slate-600 hover:text-[#145DA0] hover:bg-blue-50/80 hover:translate-x-0.5'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            isActive
                              ? 'text-white'
                              : 'text-slate-400 group-hover:text-[#145DA0]'
                          }`}
                        />
                        <span>{link.label}</span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Bottom Logout Button */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200/60 hover:border-red-200 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar dari Akun</span>
          </button>
        </div>
      </aside>
    </>
  );
}
