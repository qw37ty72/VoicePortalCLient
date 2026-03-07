import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { applyStoredThemeAndFont } from './hooks/useSettingsStorage';
import App from './App';
import './index.css';

applyStoredThemeAndFont();

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
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
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
