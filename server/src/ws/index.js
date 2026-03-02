import { v4 as uuid } from 'uuid';
import { userQueries, messageQueries, dmQueries } from '../db/index.js';

const channelConnections = new Map(); // channelId -> Set(socketId)
const socketToChannel = new Map();
const socketToUser = new Map();
const socketToDmRoom = new Map();
const dmRoomConnections = new Map();

export function setupWebSocket(io) {
  io.use((socket, next) => {
    const userId = socket.handshake.auth?.userId;
    if (!userId) return next(new Error('auth required'));
    const user = userQueries.getById.get(userId);
    if (!user) return next(new Error('user not found'));
    socket.userId = userId;
    socket.user = user;
    next();
  });

  io.on('connection', (socket) => {
    socketToUser.set(socket.id, { userId: socket.userId, user: socket.user });

    socket.on('join-channel', (channelId) => {
      leaveCurrentChannel(socket);
      socket.join(`channel:${channelId}`);
      socket.channelId = channelId;
      socketToChannel.set(socket.id, channelId);
      if (!channelConnections.has(channelId)) channelConnections.set(channelId, new Set());
      channelConnections.get(channelId).add(socket.id);
      socket.to(`channel:${channelId}`).emit('user-joined', { userId: socket.userId, user: socket.user });
      socket.emit('channel-joined', channelId);
    });

    socket.on('leave-channel', () => leaveCurrentChannel(socket));

    socket.on('join-dm', (roomId) => {
      if (socket.dmRoomId) {
        socket.leave(`dm:${socket.dmRoomId}`);
        const set = dmRoomConnections.get(socket.dmRoomId);
        if (set) set.delete(socket.id);
      }
      socket.join(`dm:${roomId}`);
      socket.dmRoomId = roomId;
      socketToDmRoom.set(socket.id, roomId);
      if (!dmRoomConnections.has(roomId)) dmRoomConnections.set(roomId, new Set());
      dmRoomConnections.get(roomId).add(socket.id);
      socket.emit('dm-joined', roomId);
    });

    socket.on('leave-dm', () => {
      if (socket.dmRoomId) {
        socket.leave(`dm:${socket.dmRoomId}`);
        const set = dmRoomConnections.get(socket.dmRoomId);
        if (set) set.delete(socket.id);
        socket.dmRoomId = null;
        socketToDmRoom.delete(socket.id);
      }
    });

    socket.on('chat-message', (data) => {
      const { channelId, content } = data;
      if (channelId && content) {
        const msgId = uuid();
        messageQueries.create.run(msgId, channelId, null, socket.userId, content);
        io.to(`channel:${channelId}`).emit('new-message', {
          id: msgId,
          channel_id: channelId,
          sender_id: socket.userId,
          display_name: socket.user.display_name,
          avatar_url: socket.user.avatar_url,
          content,
          created_at: Date.now(),
        });
      }
    });

    socket.on('dm-message', (data) => {
      const { roomId, content } = data;
      if (roomId && content) {
        const msgId = uuid();
        messageQueries.create.run(msgId, null, roomId, socket.userId, content);
        io.to(`dm:${roomId}`).emit('new-dm-message', {
          id: msgId,
          room_id: roomId,
          sender_id: socket.userId,
          display_name: socket.user.display_name,
          avatar_url: socket.user.avatar_url,
          content,
          created_at: Date.now(),
        });
      }
    });

    // WebRTC signaling (to socket id)
    socket.on('webrtc-offer', ({ to, offer, room, channelId }) => {
      io.to(to).emit('webrtc-offer', { from: socket.id, userId: socket.userId, user: socket.user, offer, room, channelId });
    });
    socket.on('webrtc-answer', ({ to, answer }) => {
      io.to(to).emit('webrtc-answer', { from: socket.id, answer });
    });
    socket.on('webrtc-ice', ({ to, candidate }) => {
      io.to(to).emit('webrtc-ice', { from: socket.id, candidate });
    });

    // WebRTC signaling by target userId (for DM calls)
    socket.on('webrtc-offer-to-user', ({ targetUserId, offer, room }) => {
      for (const s of io.sockets.sockets.values()) {
        if (s.userId === targetUserId) {
          s.emit('webrtc-offer', { from: socket.id, userId: socket.userId, user: socket.user, offer, room });
          return;
        }
      }
    });
    socket.on('webrtc-ice-to-user', ({ targetUserId, candidate }) => {
      for (const s of io.sockets.sockets.values()) {
        if (s.userId === targetUserId) {
          s.emit('webrtc-ice', { from: socket.id, candidate });
          return;
        }
      }
    });

    socket.on('disconnect', () => {
      leaveCurrentChannel(socket);
      if (socket.dmRoomId) {
        socket.leave(`dm:${socket.dmRoomId}`);
        const set = dmRoomConnections.get(socket.dmRoomId);
        if (set) set.delete(socket.id);
      }
      socketToUser.delete(socket.id);
      socketToChannel.delete(socket.id);
      socketToDmRoom.delete(socket.id);
    });
  });

  function leaveCurrentChannel(socket) {
    if (socket.channelId) {
      socket.to(`channel:${socket.channelId}`).emit('user-left', { userId: socket.userId });
      const set = channelConnections.get(socket.channelId);
      if (set) set.delete(socket.id);
      socket.leave(`channel:${socket.channelId}`);
      socket.channelId = null;
      socketToChannel.delete(socket.id);
    }
  }
}

export function getSocketsInChannel(channelId) {
  return channelConnections.get(channelId) || new Set();
}

export function getSocketsInDmRoom(roomId) {
  return dmRoomConnections.get(roomId) || new Set();
}
