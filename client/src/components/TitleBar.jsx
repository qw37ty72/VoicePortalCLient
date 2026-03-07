import { useState, useEffect } from 'react';
import { Minus, Square, Maximize2, X } from 'lucide-react';
import styles from './TitleBar.module.css';

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const api = window.electronAPI;

  useEffect(() => {
    if (!api?.windowIsMaximized) return;
    const check = () => api.windowIsMaximized().then(setIsMaximized);
    check();
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, [api]);

  if (!api?.windowMinimize || !api?.windowClose) return null;

  const handleMaximize = () => api.windowToggleMaximize?.();

  return (
    <header className={styles.titleBar}>
      <div className={styles.dragRegion}>
        <span className={styles.appName}>Voice Portal</span>
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => api.windowMinimize()}
          title="Свернуть"
          aria-label="Свернуть"
        >
          <Minus size={9} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={handleMaximize}
          title={isMaximized ? 'Восстановить' : 'Развернуть'}
          aria-label={isMaximized ? 'Восстановить' : 'Развернуть'}
        >
          {isMaximized ? (
            <Maximize2 size={9} strokeWidth={2.5} />
          ) : (
            <Square size={9} strokeWidth={2} />
          )}
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.closeBtn}`}
          onClick={() => api.windowClose()}
          title="Закрыть"
          aria-label="Закрыть"
        >
          <X size={9} strokeWidth={2.5} />
        </button>
      </div>
    </header>
  );
}
