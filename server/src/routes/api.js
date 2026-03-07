import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  userQueries,
  serverQueries,
  channelQueries,
  friendQueries,
  messageQueries,
  reactionQueries,
  banQueries,
  dmQueries,
  fileQueries,
} from '../db/index.js';
import { getStatus } from '../presence.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
const uploadsDir = path.join(__dirname, '../../data/uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB per chunk
});

// Auth middleware: expect header Authorization: Bearer <telegram_id> or x-user-id
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const userId = req.headers['x-user-id'];
  if (userId) {
    req.userId = userId;
    return next();
  }
  if (token) {
    const user = userQueries.getByTelegramId.get(parseInt(token, 10));
    if (user) {
      req.userId = user.id;
      return next();
    }
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// Users
router.get('/me', auth, (req, res) => {
  const user = userQueries.getById.get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

router.patch('/me', auth, (req, res) => {
  const { display_name, username } = req.body;
  const user = userQueries.getById.get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  userQueries.update.run(
    username !== undefined ? String(username).trim() || user.username : user.username,
    display_name !== undefined ? String(display_name).trim() || user.display_name : user.display_name,
    user.avatar_url,
    req.userId
  );
  const updated = userQueries.getById.get(req.userId);
  res.json(updated);
});

// Friends (with online status from presence)
router.get('/friends/invitations', auth, (req, res) => {
  const list = friendQueries.getPendingIncoming.all(req.userId);
  res.json(list);
});

router.get('/friends', auth, (req, res) => {
  const list = friendQueries.getFriends.all(req.userId, req.userId, req.userId);
  const withStatus = list.map((u) => ({ ...u, status: getStatus(u.id) }));
  res.json(withStatus);
});

router.post('/friends/add', auth, (req, res) => {
  let targetId = req.body.friendId;
  const username = req.body.username != null ? String(req.body.username).trim().replace(/^@/, '') : '';
  if (username) {
    const target = userQueries.getByUsername.get(username);
    if (!target) return res.status(404).json({ error: 'Пользователь с таким @username не найден' });
    targetId = target.id;
  }
  if (!targetId) return res.status(400).json({ error: 'Укажите friendId или username' });
  if (targetId === req.userId) return res.status(400).json({ error: 'Нельзя добавить самого себя' });
  try {
    friendQueries.add.run(req.userId, targetId, 'pending');
    friendQueries.add.run(targetId, req.userId, 'pending');
  } catch (e) {
    return res.status(400).json({ error: 'Уже отправлено или неверные данные' });
  }
  res.json({ ok: true });
});

router.post('/friends/accept', auth, (req, res) => {
  const { friendId } = req.body;
  if (!friendId) return res.status(400).json({ error: 'friendId required' });
  friendQueries.accept.run(friendId, req.userId);
  friendQueries.accept.run(req.userId, friendId);
  res.json({ ok: true });
});

router.post('/friends/decline', auth, (req, res) => {
  const { friendId } = req.body;
  if (!friendId) return res.status(400).json({ error: 'friendId required' });
  friendQueries.remove.run(req.userId, friendId, friendId, req.userId);
  res.json({ ok: true });
});

router.delete('/friends/:id', auth, (req, res) => {
  friendQueries.remove.run(req.userId, req.params.id, req.params.id, req.userId);
  res.json({ ok: true });
});

// Servers
router.get('/servers', auth, (req, res) => {
  const servers = serverQueries.getForUser.all(req.userId);
  res.json(servers);
});

router.post('/servers', auth, (req, res) => {
  const id = uuid();
  const { name } = req.body;
  serverQueries.create.run(id, name || 'New Server', req.userId, null);
  serverQueries.addMember.run(id, req.userId, 'owner');
  const generalId = uuid();
  channelQueries.create.run(generalId, id, 'General', 'voice', 0);
  res.json(serverQueries.getById.get(id));
});

router.post('/servers/:id/join', auth, (req, res) => {
  const { id: serverId } = req.params;
  const server = serverQueries.getById.get(serverId);
  if (!server) return res.status(404).json({ error: 'Сервер не найден' });
  if (serverQueries.getMember.get(serverId, req.userId)) return res.status(400).json({ error: 'Вы уже на этом сервере' });
  serverQueries.addMember.run(serverId, req.userId, 'member');
  res.json(serverQueries.getById.get(serverId));
});

router.post('/servers/:id/leave', auth, (req, res) => {
  const { id: serverId } = req.params;
  if (!serverQueries.getMember.get(serverId, req.userId)) return res.status(400).json({ error: 'Вы не на этом сервере' });
  serverQueries.removeMember.run(serverId, req.userId);
  res.json({ ok: true });
});

router.get('/servers/:id/invite-info', auth, (req, res) => {
  const server = serverQueries.getById.get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Сервер не найден' });
  const isMember = serverQueries.getMember.get(server.id, req.userId);
  res.json({ id: server.id, name: server.name, icon_url: server.icon_url, alreadyMember: !!isMember });
});

router.get('/servers/:id/channels', auth, (req, res) => {
  const channels = channelQueries.getByServer.all(req.params.id);
  res.json(channels);
});

router.post('/servers/:id/channels', auth, (req, res) => {
  const channelId = uuid();
  const { name, type } = req.body;
  channelQueries.create.run(channelId, req.params.id, name || 'channel', type || 'voice', 0);
  res.json({ id: channelId, server_id: req.params.id, name: name || 'channel', type: type || 'voice' });
});

// Messages (REST for history; all stored on server, single fetch per channel/DM)
function attachReactions(messages) {
  if (!messages.length) return messages;
  const ids = messages.map((m) => m.id);
  const reactions = reactionQueries.getByMessageIds.all(ids);
  const byMsg = {};
  reactions.forEach((r) => {
    if (!byMsg[r.message_id]) byMsg[r.message_id] = [];
    byMsg[r.message_id].push({ emoji: r.emoji, user_id: r.user_id });
  });
  return messages.map((m) => ({
    ...m,
    reactions: (byMsg[m.id] || []).reduce((acc, { emoji, user_id }) => {
      const existing = acc.find((x) => x.emoji === emoji);
      if (existing) existing.user_ids.push(user_id);
      else acc.push({ emoji, user_ids: [user_id] });
      return acc;
    }, []),
  }));
}

router.get('/channels/:id/bans', auth, (req, res) => {
  const channel = channelQueries.getById.get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });
  const isMember = serverQueries.getMember.get(channel.server_id, req.userId);
  if (!isMember) return res.status(403).json({ error: 'Forbidden' });
  const bans = banQueries.getActiveByChannel.all(req.params.id);
  res.json(bans.map((b) => ({ userId: b.user_id, display_name: b.display_name, username: b.username, expires_at: b.expires_at })));
});

router.get('/channels/:id/messages', auth, (req, res) => {
  const messages = messageQueries.getByChannel.all(req.params.id);
  res.json(attachReactions(messages));
});

router.get('/dm/:roomId/messages', auth, (req, res) => {
  const messages = messageQueries.getByDmRoom.all(req.params.roomId);
  res.json(attachReactions(messages));
});

router.post('/messages/:id/reactions', auth, (req, res) => {
  const { emoji } = req.body;
  if (!emoji || typeof emoji !== 'string') return res.status(400).json({ error: 'emoji required' });
  const msg = messageQueries.getById.get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  reactionQueries.add.run(req.params.id, req.userId, emoji.slice(0, 32));
  const reactions = reactionQueries.getByMessageIds.all([req.params.id]);
  const grouped = reactions.reduce((acc, r) => {
    const ex = acc.find((x) => x.emoji === r.emoji);
    if (ex) ex.user_ids.push(r.user_id);
    else acc.push({ emoji: r.emoji, user_ids: [r.user_id] });
    return acc;
  }, []);
  res.json({ reactions: grouped });
});

router.delete('/messages/:id/reactions/:emoji', auth, (req, res) => {
  reactionQueries.remove.run(req.params.id, req.userId, req.params.emoji);
  res.json({ ok: true });
});

// Search
router.get('/search', auth, (req, res) => {
  const q = (req.query.q || '').trim().replace(/%/g, '');
  if (!q || q.length < 2) return res.json({ messages: [], channels: [], users: [] });
  const like = `%${q}%`;
  const servers = serverQueries.getForUser.all(req.userId);
  const channelIds = [];
  servers.forEach((s) => {
    channelQueries.getByServer.all(s.id).forEach((c) => channelIds.push(c.id));
  });
  const friends = friendQueries.getFriends.all(req.userId, req.userId, req.userId);
  const dmRooms = [];
  friends.forEach((f) => {
    const [a, b] = req.userId < f.id ? [req.userId, f.id] : [f.id, req.userId];
    const room = dmQueries.getRoomByUsers.get(a, b);
    if (room) dmRooms.push(room.room_id);
  });
  const msgInCh = messageQueries.searchInChannels.all(channelIds, like);
  const msgInDm = messageQueries.searchInDmRooms.all(dmRooms, like);
  const users = friends
    .filter(
      (u) =>
        (u.display_name && u.display_name.toLowerCase().includes(q.toLowerCase())) ||
        (u.username && u.username.toLowerCase().includes(q.toLowerCase()))
    )
    .map((u) => ({ ...u, status: getStatus(u.id) }));
  const channels = [];
  servers.forEach((s) => {
    channelQueries.getByServer.all(s.id).forEach((c) => {
      if (c.name.toLowerCase().includes(q.toLowerCase())) channels.push({ ...c, serverName: s.name });
    });
  });
  res.json({
    messages: [...msgInCh, ...msgInDm].slice(0, 40),
    channels: channels.slice(0, 20),
    users,
  });
});

router.post('/dm/get-or-create-room', auth, (req, res) => {
  const { otherUserId } = req.body;
  if (!otherUserId) return res.status(400).json({ error: 'otherUserId required' });
  const ids = [req.userId, otherUserId].sort();
  let roomId = dmQueries.getRoomByUsers.get(ids[0], ids[1])?.room_id;
  if (!roomId) {
    roomId = uuid();
    dmQueries.createRoom.run(roomId);
    dmQueries.addMember.run(roomId, ids[0]);
    dmQueries.addMember.run(roomId, ids[1]);
  }
  res.json({ roomId });
});

// File transfer: max 200 GB; files > 10 GB are deleted from server after 2 days
const MAX_FILE_SIZE = 200 * 1024 * 1024 * 1024; // 200 GB
router.post('/files/init', auth, (req, res) => {
  const { receiverId, filename, size, mimeType } = req.body;
  if (!receiverId || !filename || size == null) return res.status(400).json({ error: 'receiverId, filename, size required' });
  if (size > MAX_FILE_SIZE) return res.status(400).json({ error: 'Файл слишком большой (макс. 200 ГБ)' });
  const id = uuid();
  fileQueries.create.run(id, req.userId, receiverId, filename, size, mimeType || null);
  res.json({ transferId: id });
});

router.post('/files/upload-chunk', auth, upload.single('chunk'), (req, res) => {
  const { transferId, index, total } = req.body;
  if (!req.file || !transferId) return res.status(400).json({ error: 'chunk and transferId required' });
  const dir = path.join(uploadsDir, transferId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const chunkPath = path.join(dir, `chunk_${index}`);
  fs.writeFileSync(chunkPath, req.file.buffer);
  if (parseInt(index, 10) === parseInt(total, 10) - 1) {
    fileQueries.setPath.run(dir, 'completed', transferId);
  }
  res.json({ ok: true, index });
});

router.get('/files/:id', auth, (req, res) => {
  const row = fileQueries.getById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.receiver_id !== req.userId && row.sender_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });
  res.json(row);
});

export default router;
