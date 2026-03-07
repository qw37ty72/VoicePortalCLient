import { v4 as uuid } from 'uuid';
import { userQueries, messageQueries, dmQueries, reactionQueries, banQueries } from '../db/index.js';
import * as presence from '../presence.js';
import * as votes from './votes.js';

const channelConnections = new Map(); // channelId -> Set(socketId)
const socketToChannel = new Map();
const socketToUser = new Map();
const socketToDmRoom = new Map();
const dmRoomConnections = new Map();

export function emitToUser(io, userId, event, data) {
  for (const s of io.sockets.sockets.values()) {
    if (s.userId === userId) s.emit(event, data);
  }
}

export function setupWebSocket(io) {
  votes.setChannelConnectionsRef(channelConnections);

  setInterval(() => {
    const expired = banQueries.getExpired.all();
    expired.forEach((row) => {
      emitToUser(io, row.user_id, 'ban-expired', { channelId: row.channel_id });
      banQueries.deleteExpired.run(row.channel_id, row.user_id);
    });
  }, 25000);

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
    presence.setOnline(socket.userId, 'online');

    socket.on('join-channel', (channelId) => {
      const ban = banQueries.getActive.get(channelId, socket.userId);
      if (ban) {
        socket.emit('channel-join-banned', { channelId, expiresAt: ban.expires_at });
        return;
      }
      leaveCurrentChannel(socket);
      socket.join(`channel:${channelId}`);
      socket.channelId = channelId;
      socketToChannel.set(socket.id, channelId);
      if (!channelConnections.has(channelId)) channelConnections.set(channelId, new Set());
      const channelSet = channelConnections.get(channelId);
      channelSet.add(socket.id);
      socket.to(`channel:${channelId}`).emit('user-joined', { userId: socket.userId, user: socket.user, socketId: socket.id });
      const members = [];
      channelSet.forEach((sid) => {
        if (sid !== socket.id) {
          const data = socketToUser.get(sid);
          if (data) members.push({ socketId: sid, userId: data.userId, user: data.user });
        }
      });
      socket.emit('channel-joined', { channelId, members });
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
        const row = messageQueries.getById.get(msgId);
        io.to(`channel:${channelId}`).emit('new-message', {
          id: msgId,
          channel_id: channelId,
          sender_id: socket.userId,
          display_name: socket.user.display_name,
          avatar_url: socket.user.avatar_url,
          content,
          created_at: row?.created_at ?? Math.floor(Date.now() / 1000),
        });
      }
    });

    socket.on('dm-message', (data) => {
      const { roomId, content } = data;
      if (roomId && content) {
        const msgId = uuid();
        messageQueries.create.run(msgId, null, roomId, socket.userId, content);
        const row = messageQueries.getById.get(msgId);
        io.to(`dm:${roomId}`).emit('new-dm-message', {
          id: msgId,
          room_id: roomId,
          sender_id: socket.userId,
          display_name: socket.user.display_name,
          avatar_url: socket.user.avatar_url,
          content,
          created_at: row?.created_at ?? Math.floor(Date.now() / 1000),
        });
      }
    });

    socket.on('set-status', (data) => {
      const status = data?.status;
      if (status === 'online' || status === 'dnd' || status === 'away') {
        presence.setOnline(socket.userId, status);
      }
    });

    socket.on('reaction-add', (data) => {
      const { messageId, emoji } = data;
      if (!messageId || !emoji || typeof emoji !== 'string') return;
      const msg = messageQueries.getById.get(messageId);
      if (!msg) return;
      reactionQueries.add.run(messageId, socket.userId, emoji.slice(0, 32));
      const payload = { messageId, userId: socket.userId, emoji: emoji.slice(0, 32) };
      if (msg.channel_id) io.to(`channel:${msg.channel_id}`).emit('reaction-added', payload);
      else if (msg.dm_room_id) io.to(`dm:${msg.dm_room_id}`).emit('reaction-added', payload);
    });

    socket.on('reaction-remove', (data) => {
      const { messageId, emoji } = data;
      if (!messageId || !emoji) return;
      const msg = messageQueries.getById.get(messageId);
      if (!msg) return;
      reactionQueries.remove.run(messageId, socket.userId, emoji);
      const payload = { messageId, userId: socket.userId, emoji };
      if (msg.channel_id) io.to(`channel:${msg.channel_id}`).emit('reaction-removed', payload);
      else if (msg.dm_room_id) io.to(`dm:${msg.dm_room_id}`).emit('reaction-removed', payload);
    });

    socket.on('start-ban-vote', (data) => {
      const { channelId, targetUserId, durationSeconds } = data;
      if (!channelId || !targetUserId || !durationSeconds) return;
      if (socket.channelId !== channelId) return;
      const targetUser = userQueries.getById.get(targetUserId);
      if (!targetUser) return;
      const channelSet = channelConnections.get(channelId);
      const targetInChannel = channelSet && [...channelSet].some((sid) => socketToUser.get(sid)?.userId === targetUserId);
      if (!targetInChannel) return;
      const result = votes.startVote(io, channelId, socket.userId, socket.user, targetUserId, targetUser, 'ban', durationSeconds, kickUserFromChannel);
      if (!result.ok) {
        socket.emit('vote-error', { error: result.error, remainingMs: result.remainingMs });
        return;
      }
      socket.emit('vote-cooldown', { remainingMs: result.remainingMs });
    });

    socket.on('start-unban-vote', (data) => {
      const { channelId, targetUserId } = data;
      if (!channelId || !targetUserId) return;
      if (socket.channelId !== channelId) return;
      const targetUser = userQueries.getById.get(targetUserId);
      if (!targetUser) return;
      const ban = banQueries.getActive.get(channelId, targetUserId);
      if (!ban) return;
      const result = votes.startVote(io, channelId, socket.userId, socket.user, targetUserId, targetUser, 'unban', null, null);
      if (!result.ok) {
        socket.emit('vote-error', { error: result.error, remainingMs: result.remainingMs });
        return;
      }
      socket.emit('vote-cooldown', { remainingMs: result.remainingMs });
    });

    socket.on('vote', (data) => {
      const { voteId, choice } = data;
      const result = votes.castVote(voteId, socket.userId, choice);
      if (!result.ok) socket.emit('vote-error', { error: result.error });
    });

    socket.on('vote-cooldown-request', () => {
      const remaining = votes.getVoteCooldownRemaining(socket.userId);
      socket.emit('vote-cooldown', { remainingMs: remaining });
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
      presence.setOffline(socket.userId);
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
      socket.to(`channel:${socket.channelId}`).emit('user-left', { userId: socket.userId, socketId: socket.id });
      const set = channelConnections.get(socket.channelId);
      if (set) set.delete(socket.id);
      socket.leave(`channel:${socket.channelId}`);
      socket.channelId = null;
      socketToChannel.delete(socket.id);
    }
  }

  function kickUserFromChannel(io, channelId, userId) {
    for (const s of io.sockets.sockets.values()) {
      if (s.userId === userId && s.channelId === channelId) {
        leaveCurrentChannel(s);
        s.emit('kicked-from-channel', { channelId });
        break;
      }
    }
  }
}

function getSocketsInChannel(channelId) {
  return channelConnections.get(channelId) || new Set();
}

function getSocketsInDmRoom(roomId) {
  return dmRoomConnections.get(roomId) || new Set();
}
