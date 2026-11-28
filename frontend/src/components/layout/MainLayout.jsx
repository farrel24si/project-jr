import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-[#F8FAFC] flex text-slate-800 antialiased font-sans overflow-x-hidden print:block print:min-h-0 print:bg-white print:overflow-visible">
      {/* Full-Height Fixed Left Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-64 print:block print:pl-0">
        <Navbar onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />

        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-24 md:pb-8 max-w-[1600px] w-full mx-auto space-y-5 sm:space-y-6 print:p-0 print:pb-0 print:max-w-none print:space-y-0">
          <Outlet />
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
