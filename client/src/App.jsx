import { useEffect } from 'react';
import { applyStoredThemeAndFont } from './hooks/useSettingsStorage';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Main from './pages/Main';
import InvitePage from './pages/InvitePage';
import { SocketProvider } from './context/SocketContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AnimationsProvider } from './context/AnimationsContext';

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
  useEffect(() => {
    applyStoredThemeAndFont();
  }, []);

  return (
    <AuthProvider>
      <AnimationsProvider>
        <AppRoutes />
      </AnimationsProvider>
    </AuthProvider>
  );
}
