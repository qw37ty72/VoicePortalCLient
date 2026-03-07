import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAnimations } from '../context/AnimationsContext';
import styles from './Login.module.css';

export default function Login() {
  const [userId, setUserId] = useState(localStorage.getItem('vp_user_id') || '');
  const [apiUrl, setApiUrl] = useState(localStorage.getItem('vp_api_url') || 'http://localhost:3001');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { animations } = useAnimations();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!userId.trim()) {
      setError('Введите ID пользователя (получите в Telegram боте: /register)');
      return;
    }
    setLoading(true);
    try {
      const base = apiUrl.trim() || 'http://localhost:3001';
      const res = await fetch(`${base}/api/me`, {
        headers: { 'X-User-Id': userId.trim(), Authorization: `Bearer ${userId.trim()}` },
      });
      if (res.ok) {
        localStorage.setItem('vp_api_url', base);
        localStorage.setItem('vp_user_id', userId.trim());
        localStorage.setItem('vp_token', userId.trim());
        window.location.reload();
      } else {
        setError('Неверный ID или сервер недоступен. Зарегистрируйтесь в Telegram: /register');
      }
    } catch (err) {
      setError('Сервер недоступен. Проверьте адрес API.');
    } finally {
      setLoading(false);
    }
  };

  const Wrapper = animations ? motion.div : 'div';
  const wrapProps = animations ? { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4 } } : {};

  return (
    <div className={styles.page}>
      <div className={styles.glow} />
      <Wrapper className={styles.card} {...wrapProps}>
        <h1 className={styles.title}>VOICE PORTAL</h1>
        <p className={styles.subtitle}>Войдите по ID из Telegram бота</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="text"
            placeholder="User ID (из /register в боте)"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className={styles.input}
            autoComplete="off"
          />
          <input
            type="text"
            placeholder="URL сервера"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            className={styles.input}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
        <p className={styles.hint}>
          Нет аккаунта? Напишите боту в Telegram и выполните команду /register
        </p>
        <p className={styles.hint}>
          Сначала запустите сервер в отдельном терминале: <code>npm run server</code>
        </p>
      </Wrapper>
    </div>
  );
}
