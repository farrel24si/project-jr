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
  LogOut
} from 'lucide-react';

export default function Sidebar({ isOpen, onClose }) {
  const { isPetugas, isKabag, currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const kabagLinks = [
    {
      to: '/kabag',
      label: 'Dashboard Monitoring',
      icon: LayoutDashboard,
      end: true
    },
    {
      to: '/kabag/kinerja',
      label: 'Analisis Kinerja Petugas',
      icon: BarChart3
    },
    {
      to: '/kabag/monitoring',
      label: 'Monitoring Korban',
      icon: Users
    },
    {
      to: '/kabag/petugas',
      label: 'Data Petugas',
      icon: UserCheck
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
    }
  ];

  const links = isKabag ? kabagLinks : petugasLinks;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Full-Height Left Sidebar - Pure White with Interactive Blue Hover & Active States */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen w-64 bg-white text-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out shrink-0 border-r border-slate-200/90 shadow-xs ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top: Pure Logo Header (No Extra Text) */}
        <div>
          <div className="h-20 px-6 border-b border-slate-100 flex items-center justify-start">
            <img
              src="/img/logo-jasa-raharja.png"
              alt="Logo PT Jasa Raharja"
              className="h-10 w-auto max-w-[190px] object-contain"
            />
          </div>

          {/* Navigation Links */}
          <div className="p-3.5 pt-5">
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

        {/* Bottom Profile Widget & Logout Button */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 space-y-2.5">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
            <div className="w-9 h-9 rounded-xl bg-[#145DA0] text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0 ring-2 ring-blue-100">
              {currentUser?.profile?.avatar || (isKabag ? 'KB' : 'PT')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 truncate leading-tight">
                {currentUser?.profile?.nama || (isKabag ? 'Budi Santoso, S.E.' : 'Adi Putra Pratama')}
              </p>
              <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                {isKabag ? 'Kepala Bagian' : 'Petugas Lapangan'}
              </p>
            </div>
          </div>

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
