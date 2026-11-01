import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './pages/LoginPage';

// Petugas Pages
import PetugasDashboard from './pages/petugas/PetugasDashboard';
import PetugasVictimList from './pages/petugas/PetugasVictimList';
import PetugasVictimDetail from './pages/petugas/PetugasVictimDetail';
import PetugasMonitoringList from './pages/petugas/PetugasMonitoringList';
import PetugasVisitFormPage from './pages/petugas/PetugasVisitFormPage';
import PetugasHistoryPage from './pages/petugas/PetugasHistoryPage';

// Kabag Pages
import KabagDashboard from './pages/kabag/KabagDashboard';
import KabagMonitoringList from './pages/kabag/KabagMonitoringList';
import KabagOfficerPerformance from './pages/kabag/KabagOfficerPerformance';
import KabagOfficerDetail from './pages/kabag/KabagOfficerDetail';
import KabagOfficerDirectory from './pages/kabag/KabagOfficerDirectory';

function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, currentUser } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && currentUser?.role !== requiredRole) {
    return <Navigate to={currentUser?.role === 'kabag' ? '/kabag' : '/petugas'} replace />;
  }

  return children;
}

function RoleRootRedirect() {
  const { isAuthenticated, currentUser } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={currentUser?.role === 'kabag' ? '/kabag' : '/petugas'} replace />;
}

export default function App() {
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
              {/* Petugas Routes */}
              <Route path="/petugas" element={<PetugasDashboard />} />
              <Route path="/petugas/korban" element={<PetugasVictimList />} />
              <Route path="/petugas/korban/:id" element={<PetugasVictimDetail />} />
              <Route path="/petugas/pemantauan" element={<PetugasMonitoringList />} />
              <Route path="/petugas/kunjungan/:id" element={<PetugasVisitFormPage />} />
              <Route path="/petugas/riwayat" element={<PetugasHistoryPage />} />

              {/* Kepala Bagian Routes */}
              <Route path="/kabag" element={<KabagDashboard />} />
              <Route path="/kabag/monitoring" element={<KabagMonitoringList />} />
              <Route path="/kabag/kinerja" element={<KabagOfficerPerformance />} />
              <Route path="/kabag/kinerja-petugas/:id" element={<KabagOfficerDetail />} />
              <Route path="/kabag/petugas" element={<KabagOfficerDirectory />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<RoleRootRedirect />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
