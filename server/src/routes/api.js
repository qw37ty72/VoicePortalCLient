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
  dmQueries,
  fileQueries,
} from '../db/index.js';

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

// Friends
router.get('/friends', auth, (req, res) => {
  const list = friendQueries.getFriends.all(req.userId, req.userId, req.userId);
  res.json(list);
});

router.post('/friends/add', auth, (req, res) => {
  const { friendId } = req.body;
  if (!friendId) return res.status(400).json({ error: 'friendId required' });
  try {
    friendQueries.add.run(req.userId, friendId, 'pending');
    friendQueries.add.run(friendId, req.userId, 'pending');
  } catch (e) {
    return res.status(400).json({ error: 'Already sent or invalid' });
  }
  res.json({ ok: true });
});

router.post('/friends/accept', auth, (req, res) => {
  const { friendId } = req.body;
  friendQueries.accept.run(friendId, req.userId);
  friendQueries.accept.run(req.userId, friendId);
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

// Messages (REST for history)
router.get('/channels/:id/messages', auth, (req, res) => {
  const messages = messageQueries.getByChannel.all(req.params.id);
  res.json(messages);
});

router.get('/dm/:roomId/messages', auth, (req, res) => {
  const messages = messageQueries.getByDmRoom.all(req.params.roomId);
  res.json(messages);
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

// File transfer init (150GB max)
const MAX_FILE_SIZE = 150 * 1024 * 1024 * 1024; // 150 GB
router.post('/files/init', auth, (req, res) => {
  const { receiverId, filename, size, mimeType } = req.body;
  if (!receiverId || !filename || size == null) return res.status(400).json({ error: 'receiverId, filename, size required' });
  if (size > MAX_FILE_SIZE) return res.status(400).json({ error: 'File too large (max 150 GB)' });
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
