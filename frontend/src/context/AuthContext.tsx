import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, clearToken, getToken, setToken } from '../lib/api';
import type { SidebarPrefs } from '../lib/sidebarPrefs';

export type User = {
  id: string;
  email: string;
  username?: string | null;
  firstName: string;
  lastName: string;
  photo?: string | null;
  role: string;
  twoFactorEnabled?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  sidebarPrefs?: SidebarPrefs | null;
};

type LoginResult = { requires2FA: true; pendingToken: string } | { token: string; user: User };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  photoBust: number;
  login: (email: string, password: string) => Promise<LoginResult>;
  verify2FA: (pendingToken: string, code: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<User | null>;
  patchUser: (updates: Partial<User>) => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoBust, setPhotoBust] = useState(0);

  const refreshUser = useCallback(async () => {
    try {
      const u = await api<User>('/auth/me');
      setUser(u);
      return u;
    } catch {
      clearToken();
      setUser(null);
      return null;
    }
  }, []);

  const patchUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
    if (updates.photo) setPhotoBust(Date.now());
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      photoBust,
      async login(email, password) {
        const res = await api<LoginResult>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        if ('requires2FA' in res && res.requires2FA) {
          return res;
        }
        const ok = res as { token: string; user: User };
        setToken(ok.token);
        setUser(ok.user);
        if (ok.user.photo) setPhotoBust(Date.now());
        return ok;
      },
      async verify2FA(pendingToken, code) {
        const res = await api<{ token: string; user: User }>('/auth/2fa/verify', {
          method: 'POST',
          body: JSON.stringify({ pendingToken, code }),
        });
        setToken(res.token);
        setUser(res.user);
        if (res.user.photo) setPhotoBust(Date.now());
      },
      logout() {
        clearToken();
        setUser(null);
        setPhotoBust(0);
      },
      refreshUser,
      patchUser,
    }),
    [user, loading, photoBust, refreshUser, patchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth hors AuthProvider');
  return ctx;
}
