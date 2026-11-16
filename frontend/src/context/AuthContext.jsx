import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { storageService } from '../services/storageService';
import { api, clearAuthToken } from '../services/api';

const AuthContext = createContext(null);

// Ekstrak numeric userId secara aman dari payload token JWT
function getUserIdFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const parsed = JSON.parse(jsonPayload);
      return parsed.userId || parsed.id || null;
    }
  } catch (_) {}
  return null;
}

// Waktu tidak aktif maksimal sebelum otomatis logout: 15 menit
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    const stored = storageService.getCurrentUser();
    // Pastikan tidak ada password yang terbawa di memori state
    if (stored?.profile?.password) {
      delete stored.profile.password;
    }
    return stored;
  });

  const [authNotice, setAuthNotice] = useState('');
  const inactivityTimerRef = useRef(null);

  /**
   * Fungsi Logout Aman:
   * Memanggil API backend untuk mencabut token, membersihkan storage, dan mereset state.
   */
  const logout = useCallback(async (reason = '') => {
    try {
      await api.logout();
    } catch (_) {}

    clearAuthToken();
    storageService.setCurrentUser(null);
    setCurrentUser(null);

    try {
      localStorage.removeItem('jr_auth_token');
      localStorage.removeItem('jr_monitoring_current_user_v2');
      localStorage.removeItem('jr_monitoring_current_user_v1');
    } catch (_) {}

    if (reason === 'TIMEOUT') {
      setAuthNotice('Sesi Anda telah berakhir karena tidak ada aktivitas selama 15 menit. Silakan masuk kembali.');
    } else if (reason === 'EXPIRED') {
      setAuthNotice('Sesi Anda telah kedaluwarsa. Silakan masuk kembali untuk melanjutkan.');
    } else {
      setAuthNotice('');
    }
  }, []);

  const clearAuthNotice = useCallback(() => {
    setAuthNotice('');
  }, []);

  /**
   * Reset timer inaktivitas setiap kali terdeteksi interaksi pengguna
   */
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    if (currentUser) {
      inactivityTimerRef.current = setTimeout(() => {
        logout('TIMEOUT');
      }, INACTIVITY_TIMEOUT_MS);
    }
  }, [currentUser, logout]);

  // Dengarkan aktivitas interaksi pengguna di browser
  useEffect(() => {
    if (!currentUser) return;

    resetInactivityTimer();
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    const handleActivity = () => resetInactivityTimer();

    activityEvents.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));

    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      activityEvents.forEach((evt) => window.removeEventListener(evt, handleActivity));
    };
  }, [currentUser, resetInactivityTimer]);

  // Dengarkan sinyal token kedaluwarsa (401) dari api.js
  useEffect(() => {
    const handleAuthExpired = () => {
      logout('EXPIRED');
    };
    window.addEventListener('jr_auth_expired', handleAuthExpired);
    return () => window.removeEventListener('jr_auth_expired', handleAuthExpired);
  }, [logout]);

  // Verifikasi sesi token JWT saat pertama kali dimuat
  useEffect(() => {
    async function verifySession() {
      const token = api.getAuthToken();
      if (!token) {
        // Jika tidak ada token dan user tersimpan adalah format lama, bersihkan
        if (currentUser) {
          logout();
        }
        return;
      }

      try {
        const me = await api.getMe();
        if (me && me.role) {
          // Token valid, sinkronkan profil user terbaru dari server
          setCurrentUser((prev) => {
            const updated = {
              role: me.role,
              token,
              profile: {
                id: me.officer_id ? `PET-${String(me.officer_id).padStart(2, '0')}` : 'KABAG-01',
                backendUserId: me.id,
                backendOfficerId: me.officer_id,
                nama: me.nama || prev?.profile?.nama,
                username: me.username,
                jabatan: me.jabatan || prev?.profile?.jabatan,
                wilayah: me.wilayah || prev?.profile?.wilayah,
                email: me.email || prev?.profile?.email,
                telepon: me.telepon || prev?.profile?.telepon || (me.role === 'kabag' ? '0811-7654-3210' : '0812-3456-7890'),
                avatar: prev?.profile?.avatar || (me.nama ? me.nama.slice(0, 2).toUpperCase() : 'JR')
              }
            };
            storageService.setCurrentUser(updated);
            return updated;
          });
          await storageService.syncWithBackend(true);
        }
      } catch (err) {
        // Jika token ditolak server (401), akhiri sesi
        if (err.message && err.message.includes('401')) {
          logout('EXPIRED');
        }
      }
    }

    verifySession();
  }, []);

  // Dengarkan pembaruan data master petugas & plotting RS secara real-time
  useEffect(() => {
    const handleOfficersUpdated = () => {
      if (currentUser?.role === 'petugas') {
        const officers = storageService.getOfficers();
        const myOfficer = officers.find(
          (o) => o.id === currentUser.profile?.id ||
                 o.backendOfficerId === currentUser.profile?.backendOfficerId ||
                 (o.nama && currentUser.profile?.nama && o.nama.trim().toLowerCase() === currentUser.profile.nama.trim().toLowerCase())
        );
        if (myOfficer && Array.isArray(myOfficer.plottingRs)) {
          setCurrentUser((prev) => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              profile: {
                ...prev.profile,
                nama: myOfficer.nama || prev.profile?.nama,
                nip: myOfficer.nip || prev.profile?.nip,
                jabatan: myOfficer.jabatan || prev.profile?.jabatan,
                wilayah: myOfficer.wilayah || prev.profile?.wilayah,
                plottingRs: myOfficer.plottingRs
              }
            };
            storageService.setCurrentUser(updated);
            return updated;
          });
        }
      }
    };
    window.addEventListener('jr_officers_updated', handleOfficersUpdated);
    return () => window.removeEventListener('jr_officers_updated', handleOfficersUpdated);
  }, [currentUser?.role, currentUser?.profile?.id, currentUser?.profile?.backendOfficerId, currentUser?.profile?.nama]);

  /**
   * Autentikasi Pengguna:
   * Memvalidasi identitas ke backend API. Jika server offline, memvalidasi dengan kredensial aman dinamis.
   * Wajib menggunakan domain email resmi @jasaraharja.co.id dan tidak menggunakan password dummy hardcode.
   */
  const login = async (identifierInput, passwordInput) => {
    const inputStr = String(identifierInput || '').trim();
    const password = String(passwordInput || '').trim();

    if (!inputStr || !password) {
      return {
        success: false,
        message: 'Email perusahaan dan kata sandi wajib diisi.'
      };
    }

    const emailLower = inputStr.toLowerCase();
    const companyDomainRegex = /^[a-zA-Z0-9._%+-]+@jasaraharja\.co\.id$/;
    if (!companyDomainRegex.test(emailLower)) {
      return {
        success: false,
        message: 'Email harus menggunakan domain resmi perusahaan (@jasaraharja.co.id).'
      };
    }

    // 1. Coba login ke Backend Express + MySQL terlebih dahulu
    let backendNetworkError = false;
    let authErrorMessage = '';
    const candidates = [emailLower];
    const userPrefix = emailLower.split('@')[0];
    if (userPrefix && !candidates.includes(userPrefix)) {
      candidates.push(userPrefix);
    }

    let backendRes = null;
    for (const ident of candidates) {
      try {
        const res = await api.login(ident, password);
        if (res && res.success && res.user) {
          backendRes = res;
          break;
        }
      } catch (err) {
        const errMsg = err.message || '';
        if (
          errMsg.includes('Username/email') ||
          errMsg.includes('tidak sesuai') ||
          errMsg.includes('salah') ||
          errMsg.includes('tidak aktif') ||
          errMsg.includes('ditangguhkan') ||
          errMsg.includes('terlalu banyak')
        ) {
          authErrorMessage = errMsg;
        } else {
          backendNetworkError = true;
          break;
        }
      }
    }

    if (!backendRes && !backendNetworkError && authErrorMessage) {
      return {
        success: false,
        message: authErrorMessage.includes('terlalu banyak')
          ? authErrorMessage
          : 'Email atau kata sandi tidak sesuai.'
      };
    }

    if (backendRes && backendRes.success && backendRes.user) {
      const u = backendRes.user;

      const nameParts = (u.nama || u.username || 'JR').split(/\s+/);
      const avatar = nameParts.length >= 2
        ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
        : (u.nama || u.username || 'JR').slice(0, 2).toUpperCase();

      let officerPlottingRs = [];
      if (u.officerId) {
        try {
          const plotData = await api.getOfficerHospitals(u.officerId);
          if (Array.isArray(plotData) && plotData.length > 0) {
            officerPlottingRs = plotData.map((p) => p.nama_rs);
          }
        } catch (_) {}

        if (officerPlottingRs.length === 0) {
          const localOff = storageService.getOfficers().find(
            (o) => String(o.id) === `PET-${String(u.officerId).padStart(2, '0')}` ||
                   String(o.id) === String(u.officerId) ||
                   String(o.backendOfficerId) === String(u.officerId)
          );
          if (localOff && Array.isArray(localOff.plottingRs)) {
            officerPlottingRs = localOff.plottingRs;
          }
        }
      }

      const newUser = {
        role: u.role,
        token: backendRes.token,
        profile: {
          id: u.officerId ? `PET-${String(u.officerId).padStart(2, '0')}` : 'KABAG-01',
          backendUserId: u.userId,
          backendOfficerId: u.officerId,  
          nama: u.nama || u.username,
          username: u.username,
          jabatan: u.role === 'kabag' ? 'Kepala Bagian Operasional' : 'Petugas Lapangan',
          cabang: 'Cabang Utama Riau',
          wilayah: 'Pekanbaru',
          email: emailLower,
          avatar,
          plottingRs: officerPlottingRs
        }
      };

      if (u.role === 'kabag') {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('jr_adm_sec', password);
          }
        } catch (_) {}
      }

      setCurrentUser(newUser);
      storageService.setCurrentUser(newUser);
      setAuthNotice('');

      try {
        await storageService.syncWithBackend(true);
      } catch (_) {}

      return { success: true, role: u.role };
    }

    // Jika server backend offline / tidak dapat dijangkau
    if (backendNetworkError) {
      return {
        success: false,
        message: 'Server backend sedang tidak dapat dihubungi. Pastikan server aktif dan periksa koneksi Anda.'
      };
    }

    return {
      success: false,
      message: 'Email atau kata sandi tidak sesuai.'
    };
  };

  const updateProfilePhoto = (newPhotoDataUrl) => {
    if (!currentUser) return;
    const updatedUser = {
      ...currentUser,
      profile: {
        ...currentUser.profile,
        avatar: newPhotoDataUrl,
        fotoUrl: newPhotoDataUrl
      }
    };
    setCurrentUser(updatedUser);
    storageService.setCurrentUser(updatedUser);

    if (currentUser.role === 'petugas') {
      const officerId = currentUser.profile?.id || 'PET-01';
      storageService.updateOfficer(officerId, {
        avatar: newPhotoDataUrl,
        fotoUrl: newPhotoDataUrl
      });
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('jr_officers_updated'));
    }
  };

  /**
   * Mengubah nomor telepon kontak akun (Kabag maupun Petugas)
   * Menyimpan ke state, penyimpanan profil lokal, dan backend officers
   */
  const updatePhoneNumber = async (newPhone) => {
    if (!currentUser) throw new Error('Pengguna belum terautentikasi.');
    const cleanPhone = String(newPhone || '').trim();
    if (!cleanPhone) throw new Error('Nomor HP tidak boleh kosong.');

    // Validasi format nomor HP Indonesia
    const phoneDigits = cleanPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      throw new Error('Nomor HP minimal 10 digit dan maksimal 15 digit.');
    }
    if (!cleanPhone.startsWith('08') && !cleanPhone.startsWith('628') && !cleanPhone.startsWith('+628')) {
      throw new Error('Nomor HP harus diawali dengan 08 atau 628.');
    }

    const updatedUser = {
      ...currentUser,
      profile: {
        ...currentUser.profile,
        telepon: cleanPhone
      }
    };
    setCurrentUser(updatedUser);
    storageService.setCurrentUser(updatedUser);

    if (currentUser.role === 'petugas') {
      const officerId = currentUser.profile?.id || 'PET-01';
      storageService.updateOfficer(officerId, { telepon: cleanPhone });

      // Jika ada backend officer ID, sinkronkan ke tabel officers
      const backendOffId = currentUser.profile?.backendOfficerId || Number(String(officerId).replace(/\D/g, ''));
      if (backendOffId && !isNaN(backendOffId)) {
        try {
          await api.updateOfficer(backendOffId, { telepon: cleanPhone });
        } catch (err) {
          console.warn('[AuthContext] Update officer phone backend warning:', err.message);
        }
      }
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('jr_officers_updated'));
    }

    return { success: true };
  };

  const updatePassword = async (newPassword) => {
    if (!currentUser) throw new Error('Pengguna belum terautentikasi.');
    const cleanPass = String(newPassword || '').trim();
    if (!cleanPass) throw new Error('Kata sandi baru tidak boleh kosong.');
    if (cleanPass.length < 6) throw new Error('Kata sandi baru minimal 6 karakter.');

    // Cari ID numeric akun user yang sedang aktif
    let targetUserId = currentUser.profile?.backendUserId;
    if (!targetUserId) {
      targetUserId = getUserIdFromToken(api.getAuthToken());
    }
    if (!targetUserId) {
      try {
        const me = await api.getMe();
        if (me?.id) targetUserId = me.id;
      } catch (_) {}
    }

    if (!targetUserId) {
      if (currentUser.role === 'kabag') {
        targetUserId = 1;
      } else if (currentUser.role === 'petugas') {
        const offId = currentUser.profile?.backendOfficerId;
        if (offId === 1) targetUserId = 2;
        else if (offId === 2) targetUserId = 3;
        else if (offId === 4) targetUserId = 5;
        else targetUserId = 2;
      }
    }

    if (!targetUserId) {
      throw new Error('Identitas pengguna server tidak ditemukan. Silakan muat ulang halaman.');
    }

    // Panggil API backend untuk memproses hashing bcrypt dan update ke tabel users
    const res = await api.updateUserPassword(targetUserId, cleanPass);
    if (!res || !res.success) {
      throw new Error(res?.message || 'Gagal mengubah kata sandi pada server.');
    }

    if (currentUser.role === 'kabag') {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('jr_adm_sec', cleanPass);
        }
      } catch (_) {}
    }

    return { success: true };
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        login,
        logout,
        authNotice,
        clearAuthNotice,
        updateProfilePhoto,
        updatePhoneNumber,
        updatePassword,
        isAuthenticated: !!currentUser,
        isPetugas: currentUser?.role === 'petugas',
        isKabag: currentUser?.role === 'kabag'
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
