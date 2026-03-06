import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Monitor, Layout } from 'lucide-react';
import styles from './StreamPicker.module.css';

const RESOLUTIONS = [
  { label: '1280×720 (720p)', width: 1280, height: 720 },
  { label: '1920×1080 (1080p)', width: 1920, height: 1080 },
  { label: '2560×1440', width: 2560, height: 1440 },
  { label: '3840×2160 (4K)', width: 3840, height: 2160 },
];

const FPS_OPTIONS = [30, 60, 90, 120];

export default function StreamPicker({ onClose, onStreamStart }) {
  const [sources, setSources] = useState([]);
  const [selected, setSelected] = useState(null);
  const [resolution, setResolution] = useState(RESOLUTIONS[0]);
  const [fps, setFps] = useState(90);
  const [loading, setLoading] = useState(true);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (window.electronAPI?.getSources) {
      window.electronAPI.getSources({ thumbnailSize: { width: 320, height: 180 } })
        .then(setSources)
        .catch((e) => {
          console.error(e);
          setError('Не удалось загрузить список экранов. Проверьте разрешения приложения.');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
      setSources([]);
    }
  }, []);

  const startStream = async () => {
    setError('');
    setStarting(true);
    try {
      if (window.electronAPI?.setDisplaySource && selected) {
        await window.electronAPI.setDisplaySource(selected.id);
        await new Promise((r) => setTimeout(r, 100));
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: resolution.width },
          height: { ideal: resolution.height },
          frameRate: { ideal: fps, max: fps },
        },
        audio: false,
      });
      setStream(stream);
      onStreamStart?.(stream);
      onClose();
    } catch (err) {
      console.error('Stream start failed', err);
      const msg = err?.message || String(err);
      setError(msg.includes('Permission') || err?.name === 'NotAllowedError'
        ? 'Доступ к экрану отклонён. Разрешите демонстрацию в диалоге системы.'
        : `Не удалось начать демонстрацию: ${msg}`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className={styles.overlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className={styles.modal}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 25 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.header}>
            <h2>Стрим экрана или приложения</h2>
            <button className={styles.closeBtn} onClick={onClose}>
              <X size={22} />
            </button>
          </div>

          <div className={styles.section}>
            <p className={styles.label}>Выберите экран или окно</p>
            {loading ? (
              <p className={styles.hint}>Загрузка...</p>
            ) : (
              <div className={styles.sources}>
                {sources.map((src) => (
                  <button
                    key={src.id}
                    className={`${styles.sourceCard} ${selected?.id === src.id ? styles.selected : ''}`}
                    onClick={() => setSelected(src)}
                  >
                    <img src={src.thumbnail} alt="" className={styles.thumb} />
                    <span className={styles.sourceName}>{src.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className={styles.section}>
              <p className={styles.errorText}>{error}</p>
            </div>
          )}
          <div className={styles.section}>
            <p className={styles.label}>Разрешение и частота кадров</p>
            <div className={styles.qualityRow}>
              <select
                className={styles.select}
                value={RESOLUTIONS.findIndex((r) => r.label === resolution.label)}
                onChange={(e) => setResolution(RESOLUTIONS[Number(e.target.value)])}
              >
                {RESOLUTIONS.map((r, i) => (
                  <option key={r.label} value={i}>{r.label}</option>
                ))}
              </select>
              <select
                className={styles.select}
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
              >
                {FPS_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n} FPS</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.footer}>
            <button className={styles.cancelBtn} onClick={onClose}>
              Отмена
            </button>
            <button
              className={styles.startBtn}
              onClick={startStream}
              disabled={!!(window.electronAPI && !selected) || starting}
            >
              {starting ? 'Запуск...' : 'Начать стрим'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
