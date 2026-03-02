import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getChannelMessages, getDmMessages } from '../api';
import FileTransfer from './FileTransfer';
import styles from './Chat.module.css';

const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB per chunk, 150GB max = 3000 chunks
const API = () => import.meta.env.VITE_API_URL || localStorage.getItem('vp_api_url') || 'http://localhost:3001';

export default function Chat({ channelId, type, dmRoomId, dmReceiverId }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (type === 'channel' && channelId) {
      getChannelMessages(channelId).then(setMessages).catch(() => setMessages([]));
    }
    if (type === 'dm' && dmRoomId) {
      getDmMessages(dmRoomId).then(setMessages).catch(() => setMessages([]));
    }
  }, [channelId, type, dmRoomId]);

  useEffect(() => {
    if (!socket) return;
    const onMsg = (msg) => {
      if (msg.channel_id === channelId) setMessages((prev) => [...prev, msg]);
    };
    const onDmMsg = (msg) => {
      if (msg.room_id === dmRoomId) setMessages((prev) => [...prev, msg]);
    };
    socket.on('new-message', onMsg);
    socket.on('new-dm-message', onDmMsg);
    return () => {
      socket.off('new-message', onMsg);
      socket.off('new-dm-message', onDmMsg);
    };
  }, [socket, channelId, dmRoomId]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || !socket) return;
    if (type === 'channel' && channelId) {
      socket.emit('chat-message', { channelId, content: text });
    }
    if (type === 'dm' && dmRoomId) {
      socket.emit('dm-message', { roomId: dmRoomId, content: text });
    }
    setInput('');
  };

  return (
    <div className={styles.chat}>
      <div className={styles.messages} ref={listRef}>
        {messages.map((m) => (
          <div key={m.id} className={styles.message}>
            <div className={styles.avatar}>{m.display_name?.[0]?.toUpperCase() || '?'}</div>
            <div className={styles.messageBody}>
              <span className={styles.sender}>{m.display_name}</span>
              <span className={styles.time}>
                {format(new Date(m.created_at < 1e12 ? m.created_at * 1000 : m.created_at), 'HH:mm', { locale: ru })}
              </span>
              <p className={styles.content}>{m.content}</p>
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
        <FileTransfer receiverId={dmReceiverId} channelId={type === 'channel' ? channelId : undefined} />
        <button className={styles.sendBtn} onClick={send}>
          Отправить
        </button>
      </div>
    </div>
  );
}
