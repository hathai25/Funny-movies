import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuthResponse, User } from '@remitano/shared';
import { api, configureApi, extractErrorMessage } from '@/lib/api';

const STORAGE_KEY = 'remitano.auth';

interface PersistedAuth {
  accessToken: string;
  user: User;
}

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readPersisted(): PersistedAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedAuth;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<PersistedAuth | null>(() => readPersisted());

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    configureApi({
      getToken: () => state?.accessToken ?? null,
      onUnauthorized: () => {
        if (state) logout();
      },
    });
  }, [state, logout]);

  const persist = useCallback((auth: AuthResponse) => {
    const payload: PersistedAuth = { accessToken: auth.accessToken, user: auth.user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setState(payload);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const { data } = await api.post<AuthResponse>('/api/auth/login', { email, password });
        persist(data);
      } catch (err) {
        throw new Error(extractErrorMessage(err));
      }
    },
    [persist],
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      try {
        const { data } = await api.post<AuthResponse>('/api/auth/register', {
          email,
          password,
          name,
        });
        persist(data);
      } catch (err) {
        throw new Error(extractErrorMessage(err));
      }
    },
    [persist],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state?.user ?? null,
      accessToken: state?.accessToken ?? null,
      isAuthenticated: !!state,
      login,
      register,
      logout,
    }),
    [state, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
