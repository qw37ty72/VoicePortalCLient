import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getStoredSettings } from '../hooks/useSettingsStorage';

const soundsBase = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : './';
const INCOMING_RING_URL = `${soundsBase}sounds/Звонят.mp3`;

function showDesktopNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch (e) {}
}

export default function NotificationEffect() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const focusRef = useRef(true);

  useEffect(() => {
    const onFocus = () => { focusRef.current = true; };
    const onBlur = () => { focusRef.current = false; };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    if (!socket || !user) return;
    const settings = getStoredSettings();
    if (!settings.desktopNotifications) return;

    const onDmMessage = (msg) => {
      if (document.hasFocus() && focusRef.current) return;
      if (msg.sender_id === user.id) return;
      showDesktopNotification('Voice Portal', `Новое сообщение от ${msg.display_name || 'Пользователь'}`);
    };

    const onChannelMessage = (msg) => {
      if (document.hasFocus() && focusRef.current) return;
      if (msg.sender_id === user.id) return;
      const content = (msg.content || '').toLowerCase();
      const mention = user.display_name?.toLowerCase() || user.username?.toLowerCase();
      if (!mention || !content.includes(`@${mention}`)) return;
      showDesktopNotification('Voice Portal', `${msg.display_name || 'Кто-то'} упомянул вас в канале`);
    };

    const onIncomingCall = (data) => {
      if (data.userId === user.id) return;
      const name = data.user?.display_name || data.user?.username || 'Пользователь';
      if (!(document.hasFocus() && focusRef.current)) {
        showDesktopNotification('Voice Portal', `Входящий звонок от ${name}`);
      }
      if (data.room === 'dm') {
        const incomingRing = new Audio(INCOMING_RING_URL);
        incomingRing.volume = 0.6;
        incomingRing.play().catch(() => {});
      }
    };

    const onFriendRequest = (data) => {
      if (document.hasFocus() && focusRef.current) return;
      if (data.from === user.id) return;
      const name = data.display_name || data.username || 'Пользователь';
      showDesktopNotification('Voice Portal', `${name} отправил(а) заявку в друзья`);
    };

    socket.on('new-dm-message', onDmMessage);
    socket.on('new-message', onChannelMessage);
    socket.on('webrtc-offer', onIncomingCall);
    socket.on('friend-request', onFriendRequest);
    return () => {
      socket.off('new-dm-message', onDmMessage);
      socket.off('new-message', onChannelMessage);
      socket.off('webrtc-offer', onIncomingCall);
      socket.off('friend-request', onFriendRequest);
    };
  }, [socket, user]);

  return null;
}
