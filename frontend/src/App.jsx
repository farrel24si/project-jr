import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { storageService } from './services/storageService';
import ErrorBoundary from './components/common/ErrorBoundary';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './pages/LoginPage';
import AccessDeniedPage from './pages/common/AccessDeniedPage';

// Petugas Pages
import PetugasDashboard from './pages/petugas/PetugasDashboard';
import PetugasVictimList from './pages/petugas/PetugasVictimList';
import PetugasVictimDetail from './pages/petugas/PetugasVictimDetail';
import PetugasMonitoringList from './pages/petugas/PetugasMonitoringList';
import PetugasVisitFormPage from './pages/petugas/PetugasVisitFormPage';
import PetugasHistoryPage from './pages/petugas/PetugasHistoryPage';
import PetugasProfilePage from './pages/petugas/PetugasProfilePage';

// Kabag Pages
import KabagDashboard from './pages/kabag/KabagDashboard';
import KabagVictimList from './pages/kabag/KabagVictimList';
import KabagMonitoringList from './pages/kabag/KabagMonitoringList';
import KabagOfficerPerformance from './pages/kabag/KabagOfficerPerformance';
import KabagOfficerDetail from './pages/kabag/KabagOfficerDetail';
import KabagOfficerDirectory from './pages/kabag/KabagOfficerDirectory';
import KabagReportPage from './pages/kabag/KabagReportPage';
import KabagProfilePage from './pages/kabag/KabagProfilePage';


function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, currentUser } = useAuth();

  // 1. Jika belum login, selalu arahkan ke /login dan cegah tombol back browser
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // 2. Jika login tetapi tidak memiliki hak akses role, tampilkan Halaman Akses Ditolak (403)
  if (requiredRole && currentUser?.role !== requiredRole) {
    return <AccessDeniedPage requiredRole={requiredRole} />;
  }

  return children;
}

function RoleRootRedirect() {
  const { isAuthenticated, currentUser } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={currentUser?.role === 'kabag' ? '/kabag' : '/petugas'} replace />;
}

export default function App() {
  useEffect(() => {
    // Sinkronisasi awal saat web dibuka
    storageService.syncWithBackend(true).catch(() => {});

    const handleSync = () => {
      storageService.syncWithBackend(true).catch(() => {});
    };

    // Auto-poll setiap 4 detik agar laporan baru dari WhatsApp langsung muncul otomatis
    const interval = setInterval(handleSync, 4000);

    // Sinkronisasi instan saat tab browser dibuka / kembali dari WhatsApp
    window.addEventListener('focus', handleSync);
    document.addEventListener('visibilitychange', handleSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleSync);
    };
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            {/* Root redirect */}
            <Route path="/" element={<RoleRootRedirect />} />

            {/* Protected Main Layout */}
            <Route
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              {/* Petugas Routes (Hanya dapat diakses role petugas) */}
              <Route
                path="/petugas"
                element={
                  <ProtectedRoute requiredRole="petugas">
                    <PetugasDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/petugas/korban"
                element={
                  <ProtectedRoute requiredRole="petugas">
                    <PetugasVictimList />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/petugas/korban/:id"
                element={
                  <ProtectedRoute requiredRole="petugas">
                    <PetugasVictimDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/petugas/pemantauan"
                element={
                  <ProtectedRoute requiredRole="petugas">
                    <PetugasMonitoringList />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/petugas/kunjungan/:id"
                element={
                  <ProtectedRoute requiredRole="petugas">
                    <PetugasVisitFormPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/petugas/riwayat"
                element={
                  <ProtectedRoute requiredRole="petugas">
                    <PetugasHistoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/petugas/profil"
                element={
                  <ProtectedRoute requiredRole="petugas">
                    <PetugasProfilePage />
                  </ProtectedRoute>
                }
              />

              {/* Kepala Bagian Routes (Hanya dapat diakses role kabag) */}
              <Route
                path="/kabag"
                element={
                  <ProtectedRoute requiredRole="kabag">
                    <KabagDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/kabag/korban"
                element={
                  <ProtectedRoute requiredRole="kabag">
                    <KabagVictimList />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/kabag/monitoring"
                element={
                  <ProtectedRoute requiredRole="kabag">
                    <KabagMonitoringList />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/kabag/kinerja"
                element={
                  <ProtectedRoute requiredRole="kabag">
                    <KabagOfficerPerformance />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/kabag/kinerja-petugas/:id"
                element={
                  <ProtectedRoute requiredRole="kabag">
                    <KabagOfficerDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/kabag/petugas"
                element={
                  <ProtectedRoute requiredRole="kabag">
                    <KabagOfficerDirectory />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/kabag/laporan"
                element={<Navigate to="/kabag/kinerja?tab=laporan" replace />}
              />
              <Route
                path="/kabag/profil"
                element={
                  <ProtectedRoute requiredRole="kabag">
                    <KabagProfilePage />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<RoleRootRedirect />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}


