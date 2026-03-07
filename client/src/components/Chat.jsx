import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getChannelMessages, getDmMessages } from '../api';
import FileTransfer from './FileTransfer';
import styles from './Chat.module.css';

const REACTION_EMOJIS = ['👍', '❤️', '😀', '🔥', '👎', '😂', '😮', '😢'];

function normalizeTs(createdAt) {
  return createdAt < 1e12 ? createdAt * 1000 : createdAt;
}

export default function Chat({ channelId, type, dmRoomId, dmReceiverId }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [reactionPickerMsg, setReactionPickerMsg] = useState(null);
  const listRef = useRef(null);
  const prevScrollHeightRef = useRef(0);

  const isChannel = type === 'channel' && channelId;
  const isDm = type === 'dm' && dmRoomId;

  useEffect(() => {
    setMessages([]);
    setHasMore(true);
    if (isChannel) {
      getChannelMessages(channelId).then((list) => {
        setMessages((list || []).reverse());
      }).catch(() => setMessages([]));
    }
    if (isDm) {
      getDmMessages(dmRoomId).then((list) => {
        setMessages((list || []).reverse());
      }).catch(() => setMessages([]));
    }
  }, [channelId, type, dmRoomId]);

  useEffect(() => {
    if (!socket) return;
    const onMsg = (msg) => {
      if (msg.channel_id === channelId) {
        setMessages((prev) => [...prev, { ...msg, reactions: msg.reactions || [] }]);
      }
    };
    const onDmMsg = (msg) => {
      if (msg.room_id === dmRoomId) {
        setMessages((prev) => [...prev, { ...msg, reactions: msg.reactions || [] }]);
      }
    };
    const onReactionAdded = (data) => {
      setMessages((prev) => prev.map((m) => {
        if (m.id !== data.messageId) return m;
        const reactions = m.reactions || [];
        const existing = reactions.find((r) => r.emoji === data.emoji);
        const newUserIds = existing ? (existing.user_ids.includes(data.userId) ? existing.user_ids : [...existing.user_ids, data.userId]) : [data.userId];
        const rest = reactions.filter((r) => r.emoji !== data.emoji);
        const newReactions = [...rest];
        if (existing) {
          newReactions.push({ emoji: data.emoji, user_ids: newUserIds });
        } else {
          newReactions.push({ emoji: data.emoji, user_ids: [data.userId] });
        }
        return { ...m, reactions: newReactions };
      }));
    };
    const onReactionRemoved = (data) => {
      setMessages((prev) => prev.map((m) => {
        if (m.id !== data.messageId) return m;
        const reactions = (m.reactions || []).map((r) => {
          if (r.emoji !== data.emoji) return r;
          const user_ids = r.user_ids.filter((id) => id !== data.userId);
          return user_ids.length ? { ...r, user_ids } : null;
        }).filter(Boolean);
        return { ...m, reactions };
      }));
    };
    socket.on('new-message', onMsg);
    socket.on('new-dm-message', onDmMsg);
    socket.on('reaction-added', onReactionAdded);
    socket.on('reaction-removed', onReactionRemoved);
    return () => {
      socket.off('new-message', onMsg);
      socket.off('new-dm-message', onDmMsg);
      socket.off('reaction-added', onReactionAdded);
      socket.off('reaction-removed', onReactionRemoved);
    };
  }, [socket, channelId, dmRoomId]);

  useEffect(() => {
    if (listRef.current && prevScrollHeightRef.current === 0) {
      listRef.current.scrollTo(0, listRef.current.scrollHeight);
    }
    prevScrollHeightRef.current = listRef.current?.scrollHeight ?? 0;
  }, [messages]);

  const loadMore = () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    const oldest = messages[0];
    const before = typeof oldest.created_at === 'number' ? oldest.created_at : Math.floor(new Date(oldest.created_at).getTime() / 1000);
    setLoadingMore(true);
    const fetcher = isChannel ? getChannelMessages(channelId, before) : getDmMessages(dmRoomId, before);
    fetcher
      .then((list) => {
        const older = (list || []).reverse();
        setHasMore(older.length >= 50);
        setMessages((prev) => [...older, ...prev]);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  };

  const onScroll = () => {
    const el = listRef.current;
    if (!el || loadingMore) return;
    if (el.scrollTop < 80 && hasMore) loadMore();
  };

  const addReaction = (messageId, emoji) => {
    socket?.emit('reaction-add', { messageId, emoji });
    setReactionPickerMsg(null);
  };

  const removeReaction = (messageId, emoji) => {
    socket?.emit('reaction-remove', { messageId, emoji });
  };

  const toggleReaction = (m, emoji) => {
    const r = (m.reactions || []).find((x) => x.emoji === emoji);
    const hasMine = r?.user_ids?.includes(user?.id);
    if (hasMine) removeReaction(m.id, emoji);
    else addReaction(m.id, emoji);
  };

  const send = () => {
    const text = input.trim();
    if (!text || !socket) return;
    if (isChannel) socket.emit('chat-message', { channelId, content: text });
    if (isDm) socket.emit('dm-message', { roomId: dmRoomId, content: text });
    setInput('');
  };

  return (
    <div className={styles.chat}>
      <div className={styles.messages} ref={listRef} onScroll={onScroll}>
        {hasMore && (
          <div className={styles.loadMoreWrap}>
            <button type="button" className={styles.loadMoreBtn} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Загрузка...' : 'Загрузить старые сообщения'}
            </button>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={styles.message}>
            <div className={styles.avatar}>{m.display_name?.[0]?.toUpperCase() || '?'}</div>
            <div className={styles.messageBody}>
              <span className={styles.sender}>{m.display_name}</span>
              <span className={styles.time}>
                {format(new Date(normalizeTs(m.created_at)), 'HH:mm', { locale: ru })}
              </span>
              <p className={styles.content}>{m.content}</p>
              {(m.reactions || []).length > 0 && (
                <div className={styles.reactions}>
                  {(m.reactions || []).map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      className={`${styles.reactionChip} ${r.user_ids?.includes(user?.id) ? styles.reactionChipMine : ''}`}
                      onClick={() => toggleReaction(m, r.emoji)}
                      title={r.user_ids?.length ? `${r.emoji} ${r.user_ids.length}` : r.emoji}
                    >
                      <span>{r.emoji}</span>
                      {r.user_ids?.length > 0 && <span className={styles.reactionCount}>{r.user_ids.length}</span>}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className={styles.addReactionBtn}
                onClick={() => setReactionPickerMsg(reactionPickerMsg === m.id ? null : m.id)}
                title="Добавить реакцию"
              >
                🙂
              </button>
              {reactionPickerMsg === m.id && (
                <>
                  <div className={styles.reactionPickerBackdrop} onClick={() => setReactionPickerMsg(null)} />
                  <div className={styles.reactionPicker}>
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className={styles.reactionPickerEmoji}
                        onClick={() => addReaction(m.id, emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.inputRow}>
        <input
          className={styles.input}
          placeholder={type === 'dm' ? 'Сообщение...' : 'Написать в канал...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
        />
        <FileTransfer receiverId={dmReceiverId} channelId={isChannel ? channelId : undefined} />
        <button className={styles.sendBtn} onClick={send}>
          Отправить
        </button>
      </div>
    </div>
  );
}
