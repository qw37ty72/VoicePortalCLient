import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Hash, Loader2 } from 'lucide-react';
import { getServerInviteInfo, joinServer } from '../api';
import styles from './InvitePage.module.css';

export default function InvitePage() {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, server: null, error: null, joining: false });

  useEffect(() => {
    if (!serverId) {
      setState((s) => ({ ...s, loading: false, error: 'Некорректная ссылка' }));
      return;
    }
    getServerInviteInfo(serverId)
      .then((data) => setState({ loading: false, server: data, error: null, joining: false }))
      .catch((err) => setState({ loading: false, server: null, error: err.message, joining: false }));
  }, [serverId]);

  const handleJoin = () => {
    setState((s) => ({ ...s, joining: true }));
    joinServer(serverId)
      .then((server) => navigate('/', { replace: true, state: { selectedServer: server } }))
      .catch((err) => setState((s) => ({ ...s, joining: false, error: err.message })));
  };

  const handleDecline = () => navigate('/', { replace: true });

  if (state.loading) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <Loader2 className={styles.spinner} size={32} />
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (state.error && !state.server) {
    return (
      <div className={styles.wrap}>
        <motion.div className={styles.card} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <p className={styles.error}>{state.error}</p>
          <button type="button" className={styles.btnSecondary} onClick={() => navigate('/', { replace: true })}>
            На главную
          </button>
        </motion.div>
      </div>
    );
  }

  if (state.server?.alreadyMember) {
    return (
      <div className={styles.wrap}>
        <motion.div className={styles.card} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Hash className={styles.icon} size={40} />
          <h1 className={styles.title}>{state.server.name}</h1>
          <p className={styles.hint}>Вы уже на этом сервере</p>
          <button type="button" className={styles.btnPrimary} onClick={() => navigate('/', { replace: true })}>
            Открыть приложение
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <motion.div className={styles.card} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Hash className={styles.icon} size={40} />
        <h1 className={styles.title}>Вас пригласили на сервер</h1>
        <p className={styles.serverName}>{state.server?.name}</p>
        {state.error && <p className={styles.error}>{state.error}</p>}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleJoin}
            disabled={state.joining}
          >
            {state.joining ? 'Вступление...' : 'Вступить'}
          </button>
          <button type="button" className={styles.btnSecondary} onClick={handleDecline} disabled={state.joining}>
            Отклонить
          </button>
        </div>
      </motion.div>
    </div>
  );
}
