import { useMemo, useState, createContext, useContext, useEffect } from 'react';
import { applyStoredThemeAndFont } from './hooks/useSettingsStorage';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Main from './pages/Main';
import InvitePage from './pages/InvitePage';
import { SocketProvider } from './context/SocketContext';
import { AuthProvider, useAuth } from './context/AuthContext';

const AnimationsContext = createContext({ animations: true, setAnimations: () => {} });

export function useAnimations() {
  return useContext(AnimationsContext);
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="fullscreen flex center" style={{ background: 'var(--bg-primary)' }}>
        <div className="neon-loader" />
        <span style={{ marginLeft: 12, color: 'var(--neon-cyan)' }}>Загрузка...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <SocketProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Main />} />
          <Route path="/invite/:serverId" element={<InvitePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </SocketProvider>
  );
}

export default function App() {
  const [animations, setAnimations] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('vp_animations') ?? 'true');
    } catch {
      return true;
    }
  });

  const animationsValue = useMemo(
    () => ({
      animations,
      setAnimations: (v) => {
        const val = typeof v === 'function' ? v(animations) : v;
        setAnimations(val);
        localStorage.setItem('vp_animations', JSON.stringify(val));
      },
    }),
    [animations]
  );

  useEffect(() => {
    applyStoredThemeAndFont();
  }, []);

  return (
    <AuthProvider>
      <AnimationsContext.Provider value={animationsValue}>
        <AppRoutes />
      </AnimationsContext.Provider>
    </AuthProvider>
  );
}
