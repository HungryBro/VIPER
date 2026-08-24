import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { apiFetch } from '../lib/http';


export type AuthUser = {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: 'admin' | 'user';
  status: 'active' | 'banned';
  banned_until: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);


async function responseDetail(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return body.detail || `Authentication failed (${response.status})`;
}


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch('/api/auth/me');
      if (response.status === 401) {
        setUser(null);
        setError(null);
        return;
      }
      if (!response.ok) {
        setUser(null);
        setError(await responseDetail(response));
        return;
      }
      setUser(await response.json());
      setError(null);
    } catch {
      setUser(null);
      setError('Cannot connect to the VIPER server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setError('Your session has expired. Please sign in again.');
    };
    window.addEventListener('viper:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('viper:unauthorized', handleUnauthorized);
  }, []);

  const login = useCallback(() => {
    window.location.assign('/api/auth/google/login');
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setError(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, login, logout, refresh }),
    [user, loading, error, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


// Keep the provider and its hook colocated; both are part of the same auth API.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
