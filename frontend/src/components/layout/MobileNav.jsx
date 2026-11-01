import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LayoutDashboard, Users, CalendarCheck, History, FileText, BarChart3 } from 'lucide-react';

export default function MobileNav() {
  const { isPetugas, isKabag } = useAuth();

  const petugasTabs = [
    { to: '/petugas', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/petugas/korban', label: 'Korban', icon: Users },
    { to: '/petugas/pemantauan', label: 'Pemantauan', icon: CalendarCheck },
    { to: '/petugas/riwayat', label: 'Riwayat', icon: History }
  ];

  const kabagTabs = [
    { to: '/kabag', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/kabag/monitoring', label: 'Monitoring', icon: FileText },
    { to: '/kabag/kinerja', label: 'Kinerja', icon: BarChart3 }
  ];

  const tabs = isKabag ? kabagTabs : petugasTabs;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-lg">
      <div className={`grid ${tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} max-w-md mx-auto`}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-2 text-[10px] font-semibold transition-colors ${
                  isActive
                    ? 'text-[#145DA0] font-bold bg-blue-50/70 border-t-2 border-[#145DA0]'
                    : 'text-slate-500 hover:text-slate-900'
                }`
              }
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
