import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hash, Users, Settings, LogOut, User, Video, Mic, Bell, Palette, Shield, Keyboard, Plus, LogIn, Pin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAnimations } from '../App';
import { getServers, leaveServer } from '../api';
import styles from './Layout.module.css';

const PINNED_KEY = 'vp_pinned_servers';
const MUTED_KEY = 'vp_muted_servers';

function getPinned() {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function getMuted() {
  try {
    const raw = localStorage.getItem(MUTED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

const ServersContext = createContext(null);
export function useServers() {
  const ctx = useContext(ServersContext);
  return ctx;
}

const SidebarTabContext = createContext('servers');
export function useSidebarTab() {
  return useContext(SidebarTabContext);
}

const SettingsCategoryContext = createContext({ category: 'account', setCategory: () => {} });
export function useSettingsCategory() {
  return useContext(SettingsCategoryContext);
}

export const SETTINGS_CATEGORIES = [
  { id: 'account', label: 'Аккаунт', icon: User },
  { id: 'video', label: 'Видео', icon: Video },
  { id: 'audio', label: 'Аудио', icon: Mic },
  { id: 'notifications', label: 'Уведомления', icon: Bell },
  { id: 'appearance', label: 'Внешний вид', icon: Palette },
  { id: 'privacy', label: 'Приватность', icon: Shield },
  { id: 'keybinds', label: 'Горячие клавиши', icon: Keyboard },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { animations, setAnimations } = useAnimations();
  const [sidebarTab, setSidebarTab] = useState('servers');
  const [settingsCategory, setSettingsCategory] = useState('account');
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [triggerCreateDialog, setTriggerCreateDialog] = useState(null);
  const [triggerJoinDialog, setTriggerJoinDialog] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    getServers().then(setServers).catch(() => setServers([]));
  }, [user?.id]);

  const serversContextValue = {
    servers,
    setServers,
    selectedServer,
    setSelectedServer,
    triggerCreateDialog: useCallback(() => triggerCreateDialog?.(), [triggerCreateDialog]),
    triggerJoinDialog: useCallback(() => triggerJoinDialog?.(), [triggerJoinDialog]),
    setTriggerCreateDialog,
    setTriggerJoinDialog,
  };

  return (
    <SidebarTabContext.Provider value={sidebarTab}>
    <SettingsCategoryContext.Provider value={{ category: settingsCategory, setCategory: setSettingsCategory }}>
    <ServersContext.Provider value={serversContextValue}>
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div className={styles.logo}>VP</div>
          <nav className={styles.nav}>
            <button
              className={`${styles.navBtn} ${sidebarTab === 'servers' ? styles.active : ''}`}
              onClick={() => setSidebarTab('servers')}
              title="Сервера"
            >
              <Hash size={22} />
              <span className={styles.navLabel}>Сервера</span>
            </button>
            <button
              className={`${styles.navBtn} ${sidebarTab === 'friends' ? styles.active : ''}`}
              onClick={() => setSidebarTab('friends')}
              title="Друзья"
            >
              <Users size={22} />
              <span className={styles.navLabel}>Друзья</span>
            </button>
            <button
              className={`${styles.navBtn} ${sidebarTab === 'settings' ? styles.active : ''}`}
              onClick={() => setSidebarTab('settings')}
              title="Настройки"
            >
              <Settings size={22} />
              <span className={styles.navLabel}>Настройки</span>
            </button>
          </nav>
        </div>
        <div className={styles.sidebarContent}>
          <AnimatePresence mode="wait">
            {sidebarTab === 'servers' && (
              <ServersPanel key="servers" />
            )}
            {sidebarTab === 'friends' && (
              <FriendsPanel key="friends" />
            )}
            {sidebarTab === 'settings' && (
              <div key="settings" className={styles.settingsSidebarPlaceholder}>
                <p className={styles.panelHint}>Категории настроек — в основной области</p>
              </div>
            )}
          </AnimatePresence>
        </div>
        <div className={styles.userBar}>
          <div className={styles.userAvatar}>
            {user?.display_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user?.display_name || 'User'}</span>
            {user?.username && (
              <span className={styles.userUsername}>@{user.username}</span>
            )}
          </div>
          <button className={styles.logoutBtn} onClick={logout} title="Выйти">
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <main className={styles.main}>
        {children}
      </main>
    </div>
    </ServersContext.Provider>
    </SettingsCategoryContext.Provider>
    </SidebarTabContext.Provider>
  );
}

function ServersPanel() {
  const { servers, setServers, selectedServer, setSelectedServer, triggerCreateDialog, triggerJoinDialog } = useServers();
  const [contextMenu, setContextMenu] = useState({ x: 0, y: 0, server: null });
  const [inviteModal, setInviteModal] = useState(null);
  const [pinned, setPinnedState] = useState(getPinned);
  const [muted, setMutedState] = useState(getMuted);
  const sortedServers = [...servers].sort((a, b) => {
    const aPin = pinned.indexOf(a.id);
    const bPin = pinned.indexOf(b.id);
    if (aPin !== -1 && bPin !== -1) return aPin - bPin;
    if (aPin !== -1) return -1;
    if (bPin !== -1) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  useEffect(() => {
    const close = () => setContextMenu((c) => (c.server ? { ...c, server: null } : c));
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const togglePin = (serverId) => {
    const next = pinned.includes(serverId) ? pinned.filter((id) => id !== serverId) : [...pinned, serverId];
    localStorage.setItem(PINNED_KEY, JSON.stringify(next));
    setPinnedState(next);
    setContextMenu((c) => (c.server ? { ...c, server: null } : c));
  };
  const toggleMute = (serverId) => {
    const next = muted.includes(serverId) ? muted.filter((id) => id !== serverId) : [...muted, serverId];
    localStorage.setItem(MUTED_KEY, JSON.stringify(next));
    setMutedState(next);
    setContextMenu((c) => (c.server ? { ...c, server: null } : c));
  };

  return (
    <motion.div
      className={styles.panel}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2 }}
    >
      <p className={styles.panelTitle}>Сервера</p>
      <button type="button" className={styles.serverActionBtn} onClick={() => triggerCreateDialog?.()}>
        <Plus size={18} />
        <span>Создать сервер</span>
      </button>
      <button type="button" className={styles.serverActionBtnJoin} onClick={() => triggerJoinDialog?.()}>
        <LogIn size={18} />
        <span>Присоединиться</span>
      </button>
      <div className={styles.serverListSidebar}>
        {sortedServers.map((s) => (
          <div
            key={s.id}
            className={`${styles.serverRow} ${selectedServer?.id === s.id ? styles.serverRowActive : ''}`}
            onClick={() => setSelectedServer(s)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, server: s });
            }}
          >
            <div className={styles.serverRowIcon}>{s.name?.slice(0, 2).toUpperCase() || 'S'}</div>
            {pinned.includes(s.id) && (
              <Pin size={14} className={styles.serverRowPin} title="Закреплён" />
            )}
            <span className={styles.serverRowName}>{s.name || 'Сервер'}</span>
          </div>
        ))}
      </div>
      {contextMenu.server && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={() => { toggleMute(contextMenu.server.id); }}>
            {muted.includes(contextMenu.server.id) ? 'Включить уведомления' : 'Убрать уведомления'}
          </button>
          <button type="button" onClick={() => { togglePin(contextMenu.server.id); }}>
            {pinned.includes(contextMenu.server.id) ? 'Открепить' : 'Закрепить'}
          </button>
          <button type="button" onClick={() => { setInviteModal(contextMenu.server); setContextMenu((c) => ({ ...c, server: null })); }}>
            Пригласить друзей
          </button>
          <div className={styles.contextMenuDivider} />
          <button
            type="button"
            className={styles.contextMenuLeave}
            onClick={async () => {
              const s = contextMenu.server;
              setContextMenu((c) => ({ ...c, server: null }));
              try {
                await leaveServer(s.id);
                const list = await getServers();
                setServers(list);
                if (selectedServer?.id === s.id) setSelectedServer(null);
              } catch (err) {
                console.error(err);
              }
            }}
          >
            Покинуть сервер
          </button>
        </div>
      )}
      {inviteModal && (
        <InviteModal server={inviteModal} onClose={() => setInviteModal(null)} />
      )}
    </motion.div>
  );
}

function InviteModal({ server, onClose }) {
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}#/invite/${server.id}` : '';
  return (
    <div className={styles.inviteOverlay} onClick={onClose}>
      <div className={styles.inviteBox} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.inviteTitle}>Пригласить друзей — {server.name}</h3>
        <p className={styles.inviteLabel}>Ссылка-приглашение:</p>
        <input type="text" readOnly value={inviteUrl} className={styles.inviteInput} />
        <button type="button" className={styles.inviteCopy} onClick={() => { navigator.clipboard?.writeText(inviteUrl); }}>
          Копировать
        </button>
        <button type="button" className={styles.inviteClose} onClick={onClose}>Закрыть</button>
      </div>
    </div>
  );
}

function FriendsPanel() {
  return (
    <motion.div
      className={styles.panel}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2 }}
    >
      <p className={styles.panelTitle}>Друзья</p>
      <p className={styles.panelHint}>Список друзей на главном экране</p>
    </motion.div>
  );
}

