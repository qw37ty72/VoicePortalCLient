import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const getApiUrl = () =>
  import.meta.env.VITE_API_URL || localStorage.getItem('vp_api_url') || 'http://localhost:3001';

const AUTH_TIMEOUT_MS = 8000;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Сразу показываем интерфейс (экран входа), проверку авторизации делаем в фоне
  const [loading, setLoading] = useState(false);

  const token = () => localStorage.getItem('vp_token') || localStorage.getItem('vp_user_id');

  const fetchUser = useCallback(async () => {
    const t = token();
    if (!t) return;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
    try {
      const res = await fetch(`${getApiUrl()}/api/me`, {
        headers: {
          Authorization: `Bearer ${t}`,
          'X-User-Id': t,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        localStorage.removeItem('vp_token');
        localStorage.removeItem('vp_user_id');
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback((userId) => {
    localStorage.setItem('vp_user_id', userId);
    localStorage.setItem('vp_token', userId);
    fetch(`${getApiUrl()}/api/me`, {
      headers: { 'X-User-Id': userId, Authorization: `Bearer ${userId}` },
    })
      .then((r) => r.ok && r.json())
      .then((data) => setUser(data))
      .catch(() => setUser(null));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('vp_token');
    localStorage.removeItem('vp_user_id');
    setUser(null);
  }, []);

  const setApiUrl = useCallback((url) => {
    const u = url?.trim() || 'http://localhost:3001';
    try {
      new URL(u);
      localStorage.setItem('vp_api_url', u);
      return true;
    } catch {
      return false;
    }
  }, []);

  const updateProfile = useCallback(async (data) => {
    const t = token();
    if (!t) return null;
    try {
      const res = await fetch(`${getApiUrl()}/api/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${t}`,
          'X-User-Id': t,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) return null;
      const updated = await res.json();
      setUser(updated);
      return updated;
    } catch {
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, token, fetchUser, setApiUrl, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
