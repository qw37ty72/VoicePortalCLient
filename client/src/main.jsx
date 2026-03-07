import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { applyStoredThemeAndFont } from './hooks/useSettingsStorage';
import App from './App';
import './index.css';

applyStoredThemeAndFont();

function DelayedApp() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(t);
  }, []);
  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="neon-loader" />
      </div>
    );
  }
  return <App />;
}

class ErrorBoundary extends React.Component {
  state = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    const isTdz = error?.message?.includes?.('before initialization');
    if (isTdz && this.state.retryKey < 2) {
      this.setState({ error: null, retryKey: this.state.retryKey + 1 });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 24,
          background: '#0a0a0f',
          color: '#e8e8f0',
          fontFamily: 'monospace',
          minHeight: '100vh',
          overflow: 'auto',
        }}>
          <h2 style={{ color: '#ff4466' }}>Ошибка загрузки</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {this.state.error?.message}
          </pre>
          {this.state.error?.stack && (
            <pre style={{ fontSize: 12, opacity: 0.8, marginTop: 16 }}>
              {this.state.error.stack}
            </pre>
          )}
        </div>
      );
    }
    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <DelayedApp />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
