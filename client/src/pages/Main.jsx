import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Hash, MessageCircle, Phone, Video } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useAnimations } from '../context/AnimationsContext';
import { getServers, getChannels, getFriends, getFriendInvitations, getOrCreateDmRoom, createServer, joinServer, addFriend, acceptFriend, declineFriend, createChannel, search, getChannelBans } from '../api';
import Chat from '../components/Chat';
import VoiceBar from '../components/VoiceBar';
import VoiceParticipantTile from '../components/VoiceParticipantTile';
import VoiceVoteOverlay from '../components/VoiceVoteOverlay';
import StreamPicker from '../components/StreamPicker';
import DMCall from '../components/DMCall';
import { useSidebarTab, useSettingsCategory, SETTINGS_CATEGORIES, useServers } from '../context/LayoutContext';
import { useSettingsStorage } from '../hooks/useSettingsStorage';
import { useChannelVoice } from '../hooks/useChannelVoice';
import layoutStyles from '../components/Layout.module.css';
import styles from './Main.module.css';

const BAN_DURATIONS = [
  { label: '10 сек', value: 10 },
  { label: '20 сек', value: 20 },
  { label: '30 сек', value: 30 },
  { label: '45 сек', value: 45 },
  { label: '1 мин', value: 60 },
  { label: '2 мин', value: 120 },
  { label: '5 мин', value: 300 },
  { label: '10 мин', value: 600 },
  { label: '15 мин', value: 900 },
  { label: '30 мин', value: 1800 },
];

export default function Main() {
  const { user } = useAuth();
  const location = useLocation();
  const { socket, connected } = useSocket();
  const { animations } = useAnimations();
  const { servers, setServers, selectedServer, setSelectedServer, setTriggerCreateDialog, setTriggerJoinDialog } = useServers();
  const sidebarTab = useSidebarTab();
  const { category: settingsCategory } = useSettingsCategory();
  const [channels, setChannels] = useState([]);
  const [friends, setFriends] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [selectedDm, setSelectedDm] = useState(null);
  const [dmRoomId, setDmRoomId] = useState(null);
  const [streamPickerOpen, setStreamPickerOpen] = useState(false);
  const [localVideoStream, setLocalVideoStream] = useState(null);
  const [fullscreenPeer, setFullscreenPeer] = useState(null);
  const fullscreenVideoRef = useRef(null);
  const [dmCallTarget, setDmCallTarget] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [dialog, setDialog] = useState({ type: null, value: '', error: '', loading: false });
  const [inVoiceChannel, setInVoiceChannel] = useState(false);
  const [channelDialog, setChannelDialog] = useState({ open: false, name: '', error: '', loading: false });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ messages: [], channels: [], users: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeVote, setActiveVote] = useState(null);
  const [voteCooldownMs, setVoteCooldownMs] = useState(0);
  const [channelBans, setChannelBans] = useState([]);
  const [banMessage, setBanMessage] = useState(null);
  const [voteBanTarget, setVoteBanTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const [friendsTab, setFriendsTab] = useState('list');
  const [invitations, setInvitations] = useState([]);
  const [channelMembersByChannel, setChannelMembersByChannel] = useState({});
  const [peerVolumes, setPeerVolumes] = useState({});
  const [peerMuteState, setPeerMuteState] = useState({});

  const soundsBase = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : './';
  const SOUND_JOIN_CHANNEL = `${soundsBase}sounds/Звук на присоединение к каналу ъех.mp3`;

  useEffect(() => {
    if (!socket) return;
    const onChannelJoined = (data) => {
      const chId = typeof data === 'object' ? data.channelId : data;
      const members = Array.isArray(data?.members) ? data.members : [];
      setChannelMembersByChannel((prev) => ({ ...prev, [chId]: members }));
    };
    const onUserJoined = (data) => {
      const chId = data?.channelId;
      if (!chId || !data?.userId || !data?.user) return;
      setChannelMembersByChannel((prev) => {
        const list = prev[chId] || [];
        if (list.some((m) => m.userId === data.userId)) return prev;
        return { ...prev, [chId]: [...list, { socketId: data.socketId, userId: data.userId, user: data.user }] };
      });
    };
    const onUserLeft = (data) => {
      const chId = data?.channelId;
      if (!chId) return;
      if (data?.socketId) setPeerMuteState((prev) => { const next = { ...prev }; delete next[data.socketId]; return next; });
      setChannelMembersByChannel((prev) => {
        const list = (prev[chId] || []).filter((m) => m.socketId !== data.socketId && m.userId !== data.userId);
        return { ...prev, [chId]: list };
      });
    };
    const onVoiceMuteState = (data) => {
      if (!data?.socketId) return;
      setPeerMuteState((prev) => ({ ...prev, [data.socketId]: { micMuted: !!data.micMuted, headphonesMuted: !!data.headphonesMuted } }));
    };
    socket.on('channel-joined', onChannelJoined);
    socket.on('voice-mute-state', onVoiceMuteState);
    socket.on('user-joined', onUserJoined);
    socket.on('user-left', onUserLeft);
    return () => {
      socket.off('channel-joined', onChannelJoined);
      socket.off('user-joined', onUserJoined);
      socket.off('user-left', onUserLeft);
      socket.off('voice-mute-state', onVoiceMuteState);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket || !user?.id) return;
    const onUserJoinedVoice = (data) => {
      if (!data?.channelId || !data?.userId || data.userId === user.id) return;
      if (data.channelId !== selectedChannel?.id || !inVoiceChannel) return;
      const audio = new Audio(SOUND_JOIN_CHANNEL);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    };
    socket.on('user-joined', onUserJoinedVoice);
    return () => socket.off('user-joined', onUserJoinedVoice);
  }, [socket, user?.id, selectedChannel?.id, inVoiceChannel]);

  useEffect(() => {
    const server = location.state?.selectedServer;
    if (server && setSelectedServer) setSelectedServer(server);
  }, [location.state, setSelectedServer]);

  useEffect(() => {
    if (!user?.id) return;
    getFriends().then(setFriends).catch(() => setFriends([]));
  }, [user?.id]);

  useEffect(() => {
    if (!socket) return;
    const onFriendAccepted = () => getFriends().then(setFriends).catch(() => {});
    const onFriendRequest = (data) => {
      getFriendInvitations().then(setInvitations).catch(() => {});
      const name = data?.display_name || data?.username || 'Кто-то';
      setToast({ text: `${name} отправил(а) заявку в друзья` });
    };
    socket.on('friend-accepted', onFriendAccepted);
    socket.on('friend-request', onFriendRequest);
    return () => {
      socket.off('friend-accepted', onFriendAccepted);
      socket.off('friend-request', onFriendRequest);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket || !user?.id) return;
    const onWebrtcOffer = (data) => {
      if (data?.room !== 'dm' || data?.userId === user.id) return;
      setIncomingCall({ from: data.from, userId: data.userId, user: data.user, offer: data.offer });
    };
    socket.on('webrtc-offer', onWebrtcOffer);
    return () => socket.off('webrtc-offer', onWebrtcOffer);
  }, [socket, user?.id]);

  useEffect(() => {
    if (!user?.id || sidebarTab !== 'friends') return;
    getFriendInvitations().then(setInvitations).catch(() => setInvitations([]));
  }, [user?.id, sidebarTab]);

  useEffect(() => {
    setTriggerCreateDialog?.(() => () => setDialog({ type: 'createServer', value: 'Мой сервер', error: '', loading: false }));
    setTriggerJoinDialog?.(() => () => setDialog({ type: 'joinServer', value: '', error: '', loading: false }));
    return () => {
      setTriggerCreateDialog?.(null);
      setTriggerJoinDialog?.(null);
    };
  }, [setTriggerCreateDialog, setTriggerJoinDialog]);

  useEffect(() => {
    if (!selectedServer?.id) {
      setChannels([]);
      setSelectedChannel(null);
      return;
    }
    getChannels(selectedServer.id).then(setChannels).catch(() => setChannels([]));
    setSelectedChannel(null);
  }, [selectedServer?.id]);

  useEffect(() => {
    if (!socket || !selectedChannel?.id) return;
    setBanMessage((prev) => (prev?.channelId === selectedChannel.id ? null : prev));
    socket.emit('join-channel', selectedChannel.id);
    const onJoined = (data) => {
      const chId = typeof data === 'object' ? data.channelId : data;
      if (chId === selectedChannel?.id) setBanMessage((prev) => (prev?.channelId === chId ? null : prev));
    };
    const onJoinBanned = (data) => {
      if (data.channelId === selectedChannel?.id) {
        setBanMessage({ channelId: data.channelId, expiresAt: data.expiresAt });
        setInVoiceChannel(false);
      }
    };
    socket.on('channel-joined', onJoined);
    socket.on('channel-join-banned', onJoinBanned);
    return () => {
      socket.off('channel-joined', onJoined);
      socket.off('channel-join-banned', onJoinBanned);
      socket.emit('leave-channel');
      setChannelMembersByChannel((prev) => {
        const next = { ...prev };
        delete next[selectedChannel?.id];
        return next;
      });
    };
  }, [socket, selectedChannel?.id]);

  useEffect(() => {
    setInVoiceChannel(false);
  }, [selectedChannel?.id]);

  useEffect(() => {
    if (!socket) return;
    const onVoteStarted = (data) => setActiveVote(data);
    const onVoteEnded = () => setActiveVote(null);
    const onVoteError = (data) => {
      if (data.error === 'cooldown' && data.remainingMs) setVoteCooldownMs(data.remainingMs);
      if (data.error) {
        const msg = data.remainingMs
          ? 'Голосование доступно через ' + Math.ceil(data.remainingMs / 60000) + ' мин'
          : 'Голосование недоступно';
        setToast({ text: msg, type: 'hint' });
      }
    };
    const onVoteCooldown = (data) => setVoteCooldownMs(data.remainingMs || 0);
    const onKicked = (data) => {
      if (data.channelId === selectedChannel?.id) {
        setInVoiceChannel(false);
        setToast({ text: 'Вас исключили из канала по результатам голосования', type: 'warn' });
      }
    };
    const onYouWereBanned = (data) => {
      setToast({ text: `Вы забанены в канале на ${data.durationLabel}`, type: 'warn' });
    };
    const onYouWereUnbanned = () => setToast({ text: 'Вас помиловали', type: 'ok' });
    const onBanExpired = (data) => {
      setToast({ text: 'Бан закончился, вы можете вернуться в канал', type: 'ok' });
      setBanMessage((prev) => (prev?.channelId === data.channelId ? null : prev));
    };
    const onVoteUpdate = (data) => {
      setActiveVote((prev) => (prev && prev.voteId === data.voteId ? { ...prev, banVotes: data.banVotes, pardonVotes: data.pardonVotes } : prev));
    };
    socket.on('vote-started', onVoteStarted);
    socket.on('vote-update', onVoteUpdate);
    socket.on('vote-ended', onVoteEnded);
    socket.on('vote-error', onVoteError);
    socket.on('vote-cooldown', onVoteCooldown);
    socket.on('kicked-from-channel', onKicked);
    socket.on('you-were-banned', onYouWereBanned);
    socket.on('you-were-unbanned', onYouWereUnbanned);
    socket.on('ban-expired', onBanExpired);
    return () => {
      socket.off('vote-started', onVoteStarted);
      socket.off('vote-update', onVoteUpdate);
      socket.off('vote-ended', onVoteEnded);
      socket.off('vote-error', onVoteError);
      socket.off('vote-cooldown', onVoteCooldown);
      socket.off('kicked-from-channel', onKicked);
      socket.off('you-were-banned', onYouWereBanned);
      socket.off('you-were-unbanned', onYouWereUnbanned);
      socket.off('ban-expired', onBanExpired);
    };
  }, [socket, selectedChannel?.id]);

  useEffect(() => {
    if (voteCooldownMs <= 0) return;
    const t = setInterval(() => {
      setVoteCooldownMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [voteCooldownMs]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (inVoiceChannel && selectedChannel?.id) {
      getChannelBans(selectedChannel.id).then(setChannelBans).catch(() => setChannelBans([]));
      socket?.emit('vote-cooldown-request');
    } else {
      setChannelBans([]);
    }
  }, [inVoiceChannel, selectedChannel?.id, socket]);

  useEffect(() => {
    if (!searchOpen) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults({ messages: [], channels: [], users: [] });
      return;
    }
    const t = setTimeout(() => {
      setSearchLoading(true);
      search(q)
        .then(setSearchResults)
        .catch(() => setSearchResults({ messages: [], channels: [], users: [] }))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchOpen, searchQuery]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!selectedDm?.id || !socket) {
      if (socket && !selectedDm) socket.emit('leave-dm');
      setDmRoomId(null);
      return;
    }
    getOrCreateDmRoom(selectedDm.id).then(({ roomId }) => {
      setDmRoomId(roomId);
      socket.emit('join-dm', roomId);
    }).catch(() => setDmRoomId(null));
    return () => socket.emit('leave-dm');
  }, [selectedDm?.id, socket]);

  useEffect(() => {
    if (!fullscreenPeer?.stream) return;
    const el = fullscreenVideoRef.current;
    if (el) el.srcObject = fullscreenPeer.stream;
    return () => {
      if (el) el.srcObject = null;
    };
  }, [fullscreenPeer]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setFullscreenPeer(null);
    };
    if (fullscreenPeer) {
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [fullscreenPeer]);

  const channelMembers = selectedChannel?.id ? (channelMembersByChannel[selectedChannel.id] || []) : [];
  const channelVoice = useChannelVoice(
    socket,
    selectedChannel?.id,
    !!(inVoiceChannel && selectedChannel?.id),
    channelMembers,
    localVideoStream
  );

  const Wrapper = animations ? motion.div : 'div';
  const wrapProps = animations ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.3 } } : {};

  if (sidebarTab === 'settings') {
    return (
      <div className={styles.main}>
        <SettingsWindow category={settingsCategory} />
      </div>
    );
  }

  return (
    <div className={styles.main}>
      <div className={styles.mainContentRow}>
      <aside className={styles.left}>
        {sidebarTab === 'servers' && selectedServer && (
          <div className={styles.channelList}>
            <h2 className={styles.channelListTitle}>{selectedServer.name}</h2>
            <button
              type="button"
              className={styles.addChannelBtn}
              onClick={() => setChannelDialog({ open: true, name: '', error: '', loading: false })}
            >
              + Создать канал
            </button>
            {channels.map((ch) => (
              <button
                key={ch.id}
                className={`${styles.channelItem} ${selectedChannel?.id === ch.id ? styles.active : ''}`}
                onClick={() => {
                  setSelectedChannel(ch);
                  setSelectedDm(null);
                }}
              >
                <Hash size={18} />
                <span>{ch.name}</span>
              </button>
            ))}
          </div>
        )}

        {channelDialog.open && selectedServer && (
          <div className={styles.dialogOverlay} onClick={() => !channelDialog.loading && setChannelDialog((d) => ({ ...d, open: false }))}>
            <div className={styles.dialogBox} onClick={(e) => e.stopPropagation()}>
              <h3 className={styles.dialogTitle}>Создать канал</h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = channelDialog.name?.trim();
                  if (!name) {
                    setChannelDialog((d) => ({ ...d, error: 'Введите название' }));
                    return;
                  }
                  setChannelDialog((d) => ({ ...d, error: '', loading: true }));
                  try {
                    await createChannel(selectedServer.id, name);
                    const list = await getChannels(selectedServer.id);
                    setChannels(list);
                    setChannelDialog({ open: false, name: '', error: '', loading: false });
                  } catch (err) {
                    setChannelDialog((d) => ({ ...d, error: err.message || 'Ошибка', loading: false }));
                  }
                }}
              >
                <label className={layoutStyles.settingsLabel}>
                  Название канала
                  <input
                    type="text"
                    className={layoutStyles.settingsInput}
                    placeholder="например: общий"
                    value={channelDialog.name}
                    onChange={(e) => setChannelDialog((d) => ({ ...d, name: e.target.value, error: '' }))}
                    disabled={channelDialog.loading}
                  />
                </label>
                {channelDialog.error && <p className={styles.dialogError}>{channelDialog.error}</p>}
                <div className={styles.dialogActions}>
                  <button type="button" className={styles.dialogCancel} onClick={() => setChannelDialog({ open: false, name: '', error: '', loading: false })} disabled={channelDialog.loading}>
                    Отмена
                  </button>
                  <button type="submit" className={layoutStyles.settingsSaveBtn} disabled={channelDialog.loading}>
                    {channelDialog.loading ? '...' : 'Создать'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {sidebarTab === 'friends' && (
        <div className={styles.friendsSection}>
          <div className={styles.friendsTabs}>
            <button
              type="button"
              className={`${styles.friendsTab} ${friendsTab === 'list' ? styles.friendsTabActive : ''}`}
              onClick={() => setFriendsTab('list')}
            >
              Друзья
            </button>
            <button
              type="button"
              className={`${styles.friendsTab} ${friendsTab === 'invitations' ? styles.friendsTabActive : ''}`}
              onClick={() => {
                setFriendsTab('invitations');
                getFriendInvitations().then(setInvitations).catch(() => setInvitations([]));
              }}
            >
              Приглашения
              {invitations.length > 0 && (
                <span className={styles.friendsTabBadge}>{invitations.length}</span>
              )}
            </button>
          </div>
          <div className={styles.addFriendRow}>
            <button
              type="button"
              className={styles.addFriendBtn}
              onClick={() => setDialog({ type: 'addFriend', value: '', error: '', loading: false })}
              style={{ width: '100%' }}
            >
              + Добавить друга
            </button>
          </div>
          {friendsTab === 'list' && (
            <>
              {friends.length === 0 ? (
                <p className={styles.friendsEmpty}>
                  Нет друзей. Нажмите «+ Добавить друга»
                </p>
              ) : (
                friends.map((f) => (
                  <div key={f.id} className={styles.friendRow}>
                    <span className={`${styles.friendStatusDot} ${styles[`status_${f.status || 'offline'}`]}`} title={f.status === 'online' ? 'В сети' : f.status === 'dnd' ? 'Не беспокоить' : f.status === 'away' ? 'Отошёл' : 'Не в сети'} />
                    <span className={styles.friendName}>{f.display_name || f.username}</span>
                    <div className={styles.friendActions}>
                      <button
                        className={styles.iconBtn}
                        title="Написать"
                        onClick={() => {
                          setSelectedDm({ id: f.id, name: f.display_name || f.username });
                          setSelectedChannel(null);
                        }}
                      >
                        <MessageCircle size={16} />
                      </button>
                      <button
                        className={styles.iconBtn}
                        title="Позвонить"
                        onClick={() => setDmCallTarget({ id: f.id, name: f.display_name || f.username })}
                      >
                        <Phone size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
          {friendsTab === 'invitations' && (
            <>
              {invitations.length === 0 ? (
                <p className={styles.friendsEmpty}>Нет входящих приглашений</p>
              ) : (
                invitations.map((inv) => (
                  <div key={inv.id} className={styles.friendRow}>
                    <span className={styles.friendName}>{inv.display_name || inv.username || 'User'}</span>
                    {inv.username && <span className={styles.friendUsername}>@{inv.username}</span>}
                    <div className={styles.friendActions} style={{ marginLeft: 'auto' }}>
                      <button
                        type="button"
                        className={styles.inviteAcceptBtn}
                        onClick={async () => {
                          try {
                            await acceptFriend(inv.id);
                            const [list, invList] = await Promise.all([getFriends(), getFriendInvitations()]);
                            setFriends(list);
                            setInvitations(invList);
                            setToast({ text: 'Приглашение принято', type: 'hint' });
                          } catch (err) {
                            setToast({ text: err.message || 'Ошибка', type: 'error' });
                          }
                        }}
                      >
                        Принять
                      </button>
                      <button
                        type="button"
                        className={styles.inviteDeclineBtn}
                        onClick={async () => {
                          try {
                            await declineFriend(inv.id);
                            setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
                            setToast({ text: 'Приглашение отклонено', type: 'hint' });
                          } catch (err) {
                            setToast({ text: err.message || 'Ошибка', type: 'error' });
                          }
                        }}
                      >
                        Отклонить
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
        )}
      </aside>

      <section className={styles.center}>
        {selectedChannel && (
          <>
            {banMessage?.channelId === selectedChannel.id ? (
              <div className={styles.banMessageBlock}>
                <p className={styles.banMessageTitle}>Вы забанены в этом канале</p>
                <p className={styles.banMessageUntil}>
                  До: {new Date((banMessage.expiresAt || 0) * 1000).toLocaleString('ru-RU')}
                </p>
                <p className={styles.banMessageHint}>После окончания бана вы сможете снова зайти в канал</p>
              </div>
            ) : (
              <>
                <header className={styles.chatHeader}>
                  <Hash size={20} />
                  <span>{selectedChannel.name}</span>
                  {inVoiceChannel ? (
                    <>
                      <span className={styles.connectionStatus} data-connected={connected}>
                        {connected ? 'Подключено' : 'Нет связи'}
                      </span>
                      {voteCooldownMs > 0 && (
                        <span className={styles.voteCooldown}>
                          Голосование через {Math.ceil(voteCooldownMs / 60000)} мин
                        </span>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.joinVoiceBtn}
                      onClick={() => setInVoiceChannel(true)}
                    >
                      Подключиться к голосовому каналу
                    </button>
                  )}
                </header>
                {inVoiceChannel && (
                  <div className={styles.voiceParticipants}>
                    <span className={styles.voiceParticipantsLabel}>В голосе:</span>
                    <div className={styles.voiceParticipantsGrid}>
                      <VoiceParticipantTile
                        key="me"
                        user={user}
                        stream={localVideoStream}
                        audioStream={channelVoice?.localStream}
                        isMe
                        micMuted={channelVoice?.micMuted}
                        headphonesMuted={channelVoice?.headphonesMuted}
                        onEnterFullscreen={setFullscreenPeer}
                      />
                      {(channelVoice?.remotePeers ?? []).map((peer) => (
                        <VoiceParticipantTile
                          key={peer.socketId}
                          user={peer.user}
                          stream={peer.stream}
                          isMe={false}
                          socketId={peer.socketId}
                          volume={peerVolumes[peer.socketId] ?? 100}
                          onVolumeChange={(v) => setPeerVolumes((prev) => ({ ...prev, [peer.socketId]: v }))}
                          micMuted={peerMuteState[peer.socketId]?.micMuted}
                          headphonesMuted={peerMuteState[peer.socketId]?.headphonesMuted}
                          onEnterFullscreen={setFullscreenPeer}
                          onBanClick={() => setVoteBanTarget(peer)}
                        />
                      ))}
                    </div>
                    {channelBans.length > 0 && (
                      <div className={styles.bannedSection}>
                        <span className={styles.voiceParticipantsLabel}>Забаненные:</span>
                        <div className={styles.bannedList}>
                          {channelBans.map((b) => (
                            <div key={b.userId} className={styles.bannedRow}>
                              <span>{b.display_name || b.username || b.userId}</span>
                              <button
                                type="button"
                                className={styles.unbanVoteBtn}
                                onClick={() => {
                                  socket?.emit('start-unban-vote', { channelId: selectedChannel.id, targetUserId: b.userId });
                                  setVoteBanTarget(null);
                                }}
                                disabled={voteCooldownMs > 0}
                              >
                                Голос за помилование
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <Chat channelId={selectedChannel.id} type="channel" />
              </>
            )}
          </>
        )}
        {selectedDm && !selectedChannel && (
          <>
            <header className={styles.chatHeader}>
              <MessageCircle size={20} />
              <span>{selectedDm.name}</span>
            </header>
            <Chat type="dm" dmRoomId={dmRoomId} dmReceiverId={selectedDm.id} />
          </>
        )}
        {!selectedChannel && !selectedDm && (
          <div className={styles.welcome}>
            <p>Выберите канал или диалог</p>
          </div>
        )}
      </section>
      </div>

      <AnimatePresence>
        {activeVote && (
          <VoiceVoteOverlay
            vote={activeVote}
            onVote={(voteId, choice) => socket?.emit('vote', { voteId: String(voteId), choice })}
          />
        )}
      </AnimatePresence>

      {voteBanTarget && (
        <div className={styles.modalBackdrop} onClick={() => setVoteBanTarget(null)}>
          <motion.div className={styles.voteDurationModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.voteDurationTitle}>
              Забанить {voteBanTarget.user?.display_name || voteBanTarget.user?.username || 'участника'} на:
            </h3>
            <div className={styles.voteDurationGrid}>
              {BAN_DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={styles.voteDurationBtn}
                  onClick={() => {
                    socket?.emit('start-ban-vote', {
                      channelId: selectedChannel?.id,
                      targetUserId: voteBanTarget.userId,
                      durationSeconds: d.value,
                    });
                    setVoteBanTarget(null);
                  }}
                  disabled={voteCooldownMs > 0}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {voteCooldownMs > 0 && (
              <p className={styles.voteCooldownHint}>Голосование доступно через {Math.ceil(voteCooldownMs / 60000)} мин</p>
            )}
            <button type="button" className={styles.voteDurationCancel} onClick={() => setVoteBanTarget(null)}>
              Отмена
            </button>
          </motion.div>
        </div>
      )}

      {toast && (
        <div className={`${styles.toast} ${styles[`toast_${toast.type}`]}`}>
          {toast.text}
        </div>
      )}

      {(dmCallTarget || (selectedChannel && inVoiceChannel)) && (
        <VoiceBar
          channelId={selectedChannel?.id}
          channelVoice={selectedChannel && inVoiceChannel ? channelVoice : null}
          peerVolumes={peerVolumes}
          onOpenStreamPicker={() => setStreamPickerOpen(true)}
          onLeave={() => {
            setInVoiceChannel(false);
            setLocalVideoStream(null);
          }}
          onLocalVideoStreamChange={setLocalVideoStream}
          isStreaming={!!localVideoStream}
          onStopStream={() => {
            localVideoStream?.getTracks?.().forEach((t) => t.stop());
            setLocalVideoStream(null);
          }}
        />
      )}

      <AnimatePresence>
        {searchOpen && (
          <div className={styles.searchOverlay} onClick={() => setSearchOpen(false)}>
            <motion.div
              className={styles.searchModal}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Поиск сообщений, каналов, друзей..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchLoading && <p className={styles.searchHint}>Загрузка...</p>}
              {!searchLoading && searchQuery.trim().length >= 2 && (
                <div className={styles.searchResults}>
                  {searchResults.users?.length > 0 && (
                    <div className={styles.searchSection}>
                      <span className={styles.searchSectionTitle}>Друзья</span>
                      {searchResults.users.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          className={styles.searchRow}
                          onClick={() => {
                            setSelectedDm({ id: u.id, name: u.display_name || u.username });
                            setSelectedChannel(null);
                            setSearchOpen(false);
                            getOrCreateDmRoom(u.id).then(({ roomId }) => setDmRoomId(roomId));
                          }}
                        >
                          <span className={`${styles.friendStatusDot} ${styles[`status_${u.status || 'offline'}`]}`} />
                          {u.display_name || u.username}
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.channels?.length > 0 && (
                    <div className={styles.searchSection}>
                      <span className={styles.searchSectionTitle}>Каналы</span>
                      {searchResults.channels.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={styles.searchRow}
                          onClick={() => {
                            const server = servers?.find((s) => s.id === c.server_id);
                            if (server) setSelectedServer(server);
                            setSelectedChannel(c);
                            setSelectedDm(null);
                            setSearchOpen(false);
                          }}
                        >
                          <Hash size={16} />
                          {c.serverName && <span className={styles.searchChannelServer}>{c.serverName}</span>} #{c.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.messages?.length > 0 && (
                    <div className={styles.searchSection}>
                      <span className={styles.searchSectionTitle}>Сообщения</span>
                      {searchResults.messages.slice(0, 15).map((msg) => (
                        <div key={msg.id} className={styles.searchMessageRow}>
                          <span className={styles.searchMessageSender}>{msg.display_name}</span>
                          <span className={styles.searchMessageContent}>{msg.content?.slice(0, 60)}{(msg.content?.length || 0) > 60 ? '…' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!searchLoading && searchQuery.trim().length >= 2 && searchResults.messages?.length === 0 && searchResults.channels?.length === 0 && searchResults.users?.length === 0 && (
                    <p className={styles.searchHint}>Ничего не найдено</p>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {fullscreenPeer && (
          <div
            className={styles.fullscreenOverlay}
            onDoubleClick={() => setFullscreenPeer(null)}
            role="presentation"
          >
            <div className={styles.fullscreenVideoWrap}>
              <video
                ref={fullscreenVideoRef}
                autoPlay
                playsInline
                muted={fullscreenPeer.isMe}
                className={styles.fullscreenVideo}
              />
              <p className={styles.fullscreenHint}>Двойной клик или ESC для выхода</p>
            </div>
            <div className={styles.fullscreenControls}>
              <VoiceBar
                channelId={selectedChannel?.id}
                channelVoice={channelVoice}
                onOpenStreamPicker={() => setStreamPickerOpen(true)}
                onLeave={() => {
                  setInVoiceChannel(false);
                  setLocalVideoStream(null);
                  setFullscreenPeer(null);
                }}
                onLocalVideoStreamChange={setLocalVideoStream}
                isStreaming={!!localVideoStream}
                onStopStream={() => {
                  localVideoStream?.getTracks?.().forEach((t) => t.stop());
                  setLocalVideoStream(null);
                }}
              />
            </div>
          </div>
        )}
        {streamPickerOpen && (
          <StreamPicker
            onClose={() => setStreamPickerOpen(false)}
            onStreamStart={(stream) => {
              setLocalVideoStream(stream);
              setStreamPickerOpen(false);
              stream?.getVideoTracks?.().forEach((t) => {
                t.onended = () => setLocalVideoStream((cur) => (cur === stream ? null : cur));
              });
            }}
          />
        )}
        {incomingCall && (
          <motion.div
            key="incoming-call"
            className={styles.incomingCallOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIncomingCall(null)}
          >
            <motion.div
              className={styles.incomingCallModal}
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Входящий звонок</h3>
              <p className={styles.incomingCallFrom}>
                {incomingCall.user?.display_name || incomingCall.user?.username || 'Пользователь'}
              </p>
              <div className={styles.incomingCallActions}>
                <button
                  type="button"
                  className={styles.incomingCallAccept}
                  onClick={() => {
                    setDmCallTarget({
                      id: incomingCall.userId,
                      name: incomingCall.user?.display_name || incomingCall.user?.username,
                      from: incomingCall.from,
                      offer: incomingCall.offer,
                      isCallee: true,
                    });
                    setIncomingCall(null);
                  }}
                >
                  Принять
                </button>
                <button
                  type="button"
                  className={styles.incomingCallDecline}
                  onClick={() => {
                    socket?.emit('call-declined', { to: incomingCall.from });
                    setIncomingCall(null);
                  }}
                >
                  Отклонить
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {dmCallTarget && (
          <DMCall
            target={dmCallTarget}
            onClose={() => setDmCallTarget(null)}
          />
        )}
      </AnimatePresence>

      {dialog.type && (
        <ActionDialog
          dialog={dialog}
          setDialog={setDialog}
          setSelectedServer={setSelectedServer}
          onSuccessCreateServer={(s) => {
            setServers((prev) => [...prev, s]);
            setSelectedServer(s);
          }}
          onSuccessJoinServer={setServers}
          onSuccessAddFriend={setFriends}
          createServer={createServer}
          joinServer={joinServer}
          addFriend={addFriend}
          getServers={getServers}
          getFriends={getFriends}
        />
      )}
    </div>
  );
}

const DIALOG_CONFIG = {
  createServer: { title: 'Создать сервер', placeholder: 'Название сервера', submitLabel: 'Создать' },
  joinServer: { title: 'Присоединиться к серверу', placeholder: 'ID сервера', submitLabel: 'Присоединиться' },
  addFriend: { title: 'Добавить друга', placeholder: 'ID или @username', submitLabel: 'Добавить' },
};

function ActionDialog({
  dialog,
  setDialog,
  setSelectedServer,
  onSuccessCreateServer,
  onSuccessJoinServer,
  onSuccessAddFriend,
  createServer,
  joinServer,
  addFriend,
  getServers,
  getFriends,
}) {
  const config = DIALOG_CONFIG[dialog.type];
  if (!config) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const value = dialog.value?.trim() || '';
    if (dialog.type === 'createServer' && !value) return;
    if ((dialog.type === 'joinServer' || dialog.type === 'addFriend') && !value) {
      setDialog((d) => ({ ...d, error: 'Введите значение' }));
      return;
    }
    setDialog((d) => ({ ...d, error: '', loading: true }));
    try {
      if (dialog.type === 'createServer') {
        const s = await createServer(value);
        onSuccessCreateServer(s);
      } else if (dialog.type === 'joinServer') {
        await joinServer(value);
        const list = await getServers();
        onSuccessJoinServer(list);
        const joined = list.find((s) => s.id === value);
        if (joined) setSelectedServer(joined);
      } else if (dialog.type === 'addFriend') {
        await addFriend(value);
        const list = await getFriends();
        onSuccessAddFriend(list);
      }
      setDialog({ type: null, value: '', error: '', loading: false });
    } catch (e) {
      setDialog((d) => ({ ...d, error: e.message || 'Ошибка', loading: false }));
    }
  };

  return (
    <div className={styles.dialogOverlay} onClick={() => !dialog.loading && setDialog({ type: null, value: '', error: '', loading: false })}>
      <div className={styles.dialogBox} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.dialogTitle}>{config.title}</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            className={layoutStyles.settingsInput}
            placeholder={config.placeholder}
            value={dialog.value}
            onChange={(e) => setDialog((d) => ({ ...d, value: e.target.value, error: '' }))}
            autoFocus
            disabled={dialog.loading}
          />
          {dialog.error && <p className={styles.dialogError}>{dialog.error}</p>}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.dialogCancel} onClick={() => setDialog({ type: null, value: '', error: '', loading: false })} disabled={dialog.loading}>
              Отмена
            </button>
            <button type="submit" className={layoutStyles.settingsSaveBtn} disabled={dialog.loading}>
              {dialog.loading ? '...' : config.submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const TITLES = {
  account: 'Аккаунт',
  video: 'Видео',
  audio: 'Аудио',
  notifications: 'Уведомления',
  appearance: 'Внешний вид',
  privacy: 'Приватность',
  keybinds: 'Горячие клавиши',
};

function SettingsWindow({ category }) {
  const { setCategory } = useSettingsCategory();
  return (
    <div className={styles.settingsWindow}>
      <div className={styles.settingsCategoriesColumn}>
        {SETTINGS_CATEGORIES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`${styles.settingsCategoryBtn} ${category === id ? styles.settingsCategoryBtnActive : ''}`}
            onClick={() => setCategory(id)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className={styles.settingsContentColumn}>
        <h1 className={styles.settingsWindowTitle}>{TITLES[category]}</h1>
        {category === 'account' && <AccountSettings />}
        {category === 'video' && <VideoSettings />}
        {category === 'audio' && <AudioSettings />}
        {category === 'notifications' && <NotificationsSettings />}
        {category === 'appearance' && <AppearanceSettings />}
        {category === 'privacy' && <PrivacySettings />}
        {category === 'keybinds' && <KeybindsSettings />}
      </div>
    </div>
  );
}

function AccountSettings() {
  const { user, updateProfile, setApiUrl } = useAuth();
  const { animations, setAnimations } = useAnimations();
  const [nick, setNick] = useState(user?.display_name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [apiUrl, setApiUrlLocal] = useState(() => localStorage.getItem('vp_api_url') || 'http://localhost:3001');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setNick(user?.display_name ?? '');
    setUsername(user?.username ?? '');
  }, [user?.display_name, user?.username]);

  const handleSave = async (e) => {
    e.preventDefault();
    const ok = await updateProfile({ display_name: nick.trim(), username: username.trim() });
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleSaveApiUrl = (e) => {
    e.preventDefault();
    if (setApiUrl(apiUrl.trim() || 'http://localhost:3001')) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      window.location.reload();
    }
  };

  return (
    <>
      <form onSubmit={handleSave} className={layoutStyles.settingsForm}>
        <label className={layoutStyles.settingsLabel}>
          Ник (отображаемое имя)
          <input
            type="text"
            className={layoutStyles.settingsInput}
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="Имя"
          />
        </label>
        <label className={layoutStyles.settingsLabel}>
          Юзернейм (@username)
          <input
            type="text"
            className={layoutStyles.settingsInput}
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
            placeholder="username"
          />
        </label>
        <button type="submit" className={layoutStyles.settingsSaveBtn}>
          {saved ? 'Сохранено' : 'Сохранить'}
        </button>
      </form>
      <form onSubmit={handleSaveApiUrl} className={layoutStyles.settingsForm} style={{ marginTop: 24 }}>
        <label className={layoutStyles.settingsLabel}>
          Адрес сервера (API)
          <input
            type="text"
            className={layoutStyles.settingsInput}
            value={apiUrl}
            onChange={(e) => setApiUrlLocal(e.target.value)}
            placeholder="http://localhost:3001"
          />
        </label>
        <button type="submit" className={layoutStyles.settingsSaveBtn}>
          Сохранить и переподключиться
        </button>
      </form>
      <label className={layoutStyles.checkLabel}>
        <input
          type="checkbox"
          checked={animations}
          onChange={(e) => setAnimations(e.target.checked)}
        />
        <span>Включить анимации</span>
      </label>
    </>
  );
}

const VIDEO_RESOLUTIONS = [
  { value: '640x480', label: '480p (640×480)' },
  { value: '1280x720', label: '720p (1280×720)' },
  { value: '1920x1080', label: '1080p (1920×1080)' },
];

function VideoSettings() {
  const [settings, update] = useSettingsStorage();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    navigator.mediaDevices
      .enumerateDevices()
      .then((list) => {
        if (cancelled) return;
        setDevices(list.filter((d) => d.kind === 'videoinput'));
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  return (
    <div className={layoutStyles.settingsForm}>
      <label className={layoutStyles.settingsLabel}>
        Камера
        <select
          className={layoutStyles.settingsInput}
          value={settings.videoDeviceId}
          onChange={(e) => update({ videoDeviceId: e.target.value })}
          disabled={loading}
        >
          <option value="">По умолчанию</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Камера ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
      </label>
      <label className={layoutStyles.settingsLabel}>
        Разрешение
        <select
          className={layoutStyles.settingsInput}
          value={settings.videoResolution}
          onChange={(e) => update({ videoResolution: e.target.value })}
        >
          {VIDEO_RESOLUTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function AudioSettings() {
  const [settings, update] = useSettingsStorage();
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    navigator.mediaDevices
      .enumerateDevices()
      .then((list) => {
        if (cancelled) return;
        setInputDevices(list.filter((d) => d.kind === 'audioinput'));
        setOutputDevices(list.filter((d) => d.kind === 'audiooutput'));
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  return (
    <div className={layoutStyles.settingsForm}>
      <label className={layoutStyles.settingsLabel}>
        Микрофон
        <select
          className={layoutStyles.settingsInput}
          value={settings.audioInputId}
          onChange={(e) => update({ audioInputId: e.target.value })}
          disabled={loading}
        >
          <option value="">По умолчанию</option>
          {inputDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Микрофон ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
      </label>
      <label className={layoutStyles.settingsLabel}>
        Динамики
        <select
          className={layoutStyles.settingsInput}
          value={settings.audioOutputId}
          onChange={(e) => update({ audioOutputId: e.target.value })}
          disabled={loading}
        >
          <option value="">По умолчанию</option>
          {outputDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Динамики ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
      </label>
      <label className={layoutStyles.settingsLabel}>
        Громкость микрофона: {settings.inputVolume}%
        <input
          type="range"
          min="0"
          max="100"
          value={settings.inputVolume}
          onChange={(e) => update({ inputVolume: Number(e.target.value) })}
          className={styles.settingsRange}
        />
      </label>
      <label className={layoutStyles.settingsLabel}>
        Громкость динамиков: {settings.outputVolume}%
        <input
          type="range"
          min="0"
          max="100"
          value={settings.outputVolume}
          onChange={(e) => update({ outputVolume: Number(e.target.value) })}
          className={styles.settingsRange}
        />
      </label>
    </div>
  );
}

function NotificationsSettings() {
  const [settings, update] = useSettingsStorage();
  const [testResult, setTestResult] = useState(null);

  const handleTestNotification = () => {
    if (!('Notification' in window)) {
      setTestResult('Не поддерживается');
      return;
    }
    if (Notification.permission === 'granted') {
      new Notification('Voice Portal', { body: 'Тестовое уведомление' });
      setTestResult('Отправлено');
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((p) => {
        if (p === 'granted') {
          new Notification('Voice Portal', { body: 'Тестовое уведомление' });
          setTestResult('Отправлено');
        } else setTestResult('Доступ запрещён');
      });
    } else setTestResult('Сначала разрешите уведомления в браузере');
    setTimeout(() => setTestResult(null), 3000);
  };

  return (
    <div className={layoutStyles.settingsForm}>
      <label className={layoutStyles.checkLabel}>
        <input
          type="checkbox"
          checked={settings.messageSound}
          onChange={(e) => update({ messageSound: e.target.checked })}
        />
        <span>Звук входящих сообщений</span>
      </label>
      <label className={layoutStyles.checkLabel}>
        <input
          type="checkbox"
          checked={settings.desktopNotifications}
          onChange={(e) => update({ desktopNotifications: e.target.checked })}
        />
        <span>Уведомления на рабочем столе</span>
      </label>
      <div className={styles.settingsRow}>
        <button type="button" className={layoutStyles.settingsSaveBtn} onClick={handleTestNotification}>
          Проверить уведомление
        </button>
        {testResult && <span className={styles.settingsHint}>{testResult}</span>}
      </div>
    </div>
  );
}

function AppearanceSettings() {
  const [settings, update] = useSettingsStorage();

  return (
    <div className={layoutStyles.settingsForm}>
      <label className={layoutStyles.settingsLabel}>
        Тема
        <select
          className={layoutStyles.settingsInput}
          value={settings.theme}
          onChange={(e) => update({ theme: e.target.value })}
        >
          <option value="dark">Тёмная</option>
          <option value="light">Светлая</option>
        </select>
      </label>
      <label className={layoutStyles.settingsLabel}>
        Размер шрифта
        <select
          className={layoutStyles.settingsInput}
          value={settings.fontSize}
          onChange={(e) => update({ fontSize: e.target.value })}
        >
          <option value="small">Маленький</option>
          <option value="medium">Средний</option>
          <option value="large">Большой</option>
        </select>
      </label>
    </div>
  );
}

function PrivacySettings() {
  const [settings, update] = useSettingsStorage();

  return (
    <div className={layoutStyles.settingsForm}>
      <label className={layoutStyles.checkLabel}>
        <input
          type="checkbox"
          checked={settings.showOnlineStatus}
          onChange={(e) => update({ showOnlineStatus: e.target.checked })}
        />
        <span>Показывать статус «В сети»</span>
      </label>
      <label className={layoutStyles.checkLabel}>
        <input
          type="checkbox"
          checked={settings.allowDmFromAll}
          onChange={(e) => update({ allowDmFromAll: e.target.checked })}
        />
        <span>Принимать личные сообщения от всех</span>
      </label>
    </div>
  );
}

function KeybindsSettings() {
  const [settings, update] = useSettingsStorage();
  const [capturing, setCapturing] = useState(false);
  const [hint, setHint] = useState(null);

  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (e) => {
      e.preventDefault();
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      update({ pushToTalkKey: key });
      setCapturing(false);
      setHint(`Задано: ${key}`);
      setTimeout(() => setHint(null), 2000);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [capturing, update]);

  return (
    <div className={layoutStyles.settingsForm}>
      <label className={layoutStyles.settingsLabel}>
        Клавиша «Push to Talk»
        <div className={styles.settingsRow}>
          <span className={styles.keyDisplay}>{settings.pushToTalkKey}</span>
          <button
            type="button"
            className={capturing ? styles.keyCaptureActive : styles.keyCaptureBtn}
            onClick={() => setCapturing(true)}
          >
            {capturing ? 'Нажмите любую клавишу...' : 'Изменить'}
          </button>
        </div>
      </label>
      {hint && <p className={styles.settingsHint}>{hint}</p>}
    </div>
  );
}
