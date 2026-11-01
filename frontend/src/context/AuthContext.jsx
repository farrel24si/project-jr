import React, { createContext, useContext, useState, useEffect } from 'react';
import { storageService } from '../services/storageService';
import { INITIAL_OFFICERS, INITIAL_KABAG } from '../data/mockData';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => storageService.getCurrentUser());

  const switchRole = (newRole) => {
    let newUser;
    if (newRole === 'kabag') {
      newUser = {
        role: 'kabag',
        profile: INITIAL_KABAG
      };
    } else {
      newUser = {
        role: 'petugas',
        profile: INITIAL_OFFICERS[0]
      };
    }
    setCurrentUser(newUser);
    storageService.setCurrentUser(newUser);
  };

  const loginAsOfficer = (officerId) => {
    const officers = storageService.getOfficers();
    const officer = officers.find((o) => o.id === officerId) || officers[0];
    const newUser = {
      role: 'petugas',
      profile: officer
    };
    setCurrentUser(newUser);
    storageService.setCurrentUser(newUser);
  };

  const loginAsKabag = () => {
    const newUser = {
      role: 'kabag',
      profile: INITIAL_KABAG
    };
    setCurrentUser(newUser);
    storageService.setCurrentUser(newUser);
  };

  const logout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem('jr_monitoring_current_user_v2');
      localStorage.removeItem('jr_monitoring_current_user_v1');
    } catch (_) {}
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        switchRole,
        loginAsOfficer,
        loginAsKabag,
        logout,
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
