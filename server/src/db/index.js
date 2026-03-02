import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SCHEMA } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/voiceportal.db');

let _db = null;

function save() {
  if (!_db) return;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(_db.export()));
}

function run(sql, params = []) {
  if (!_db) throw new Error('DB not initialized');
  if (params.length) {
    const stmt = _db.prepare(sql);
    try {
      stmt.run(params);
    } finally {
      stmt.free();
    }
  } else {
    _db.run(sql);
  }
  save();
}

function get(sql, params = []) {
  if (!_db) throw new Error('DB not initialized');
  const stmt = _db.prepare(sql);
  try {
    stmt.bind(params);
    return stmt.step() ? stmt.getAsObject() : undefined;
  } finally {
    stmt.free();
  }
}

function all(sql, params = []) {
  if (!_db) throw new Error('DB not initialized');
  const stmt = _db.prepare(sql);
  try {
    const rows = [];
    stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

export const userQueries = {
  create: { run: (id, telegramId, username, displayName, avatarUrl) => run('INSERT INTO users (id, telegram_id, username, display_name, avatar_url) VALUES (?, ?, ?, ?, ?)', [id, telegramId, username, displayName, avatarUrl]) },
  getById: { get: (id) => get('SELECT * FROM users WHERE id = ?', [id]) },
  getByTelegramId: { get: (id) => get('SELECT * FROM users WHERE telegram_id = ?', [id]) },
  update: { run: (username, displayName, avatarUrl, id) => run('UPDATE users SET username = ?, display_name = ?, avatar_url = ? WHERE id = ?', [username, displayName, avatarUrl, id]) },
};

export const friendQueries = {
  add: { run: (userId, friendId, status) => run('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)', [userId, friendId, status]) },
  getFriends: { all: (a, b, c) => all('SELECT u.id, u.display_name, u.username, u.avatar_url FROM friends f JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = ?', [a, b, c, 'accepted']) },
  getPending: { all: (id) => all('SELECT u.*, f.created_at FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = ?', [id, 'pending']) },
  accept: { run: (userId, friendId) => run('UPDATE friends SET status = ? WHERE user_id = ? AND friend_id = ?', ['accepted', userId, friendId]) },
  remove: { run: (a, b, c, d) => run('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', [a, b, c, d]) },
};

export const serverQueries = {
  create: { run: (id, name, ownerId, iconUrl) => run('INSERT INTO servers (id, name, owner_id, icon_url) VALUES (?, ?, ?, ?)', [id, name, ownerId, iconUrl]) },
  getById: { get: (id) => get('SELECT * FROM servers WHERE id = ?', [id]) },
  getForUser: { all: (userId) => all('SELECT s.* FROM servers s JOIN server_members m ON m.server_id = s.id WHERE m.user_id = ? ORDER BY s.name', [userId]) },
  getMember: { get: (serverId, userId) => get('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, userId]) },
  addMember: { run: (serverId, userId, role) => run('INSERT INTO server_members (server_id, user_id, role) VALUES (?, ?, ?)', [serverId, userId, role]) },
  removeMember: { run: (serverId, userId) => run('DELETE FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, userId]) },
};

export const channelQueries = {
  create: { run: (id, serverId, name, type, position) => run('INSERT INTO channels (id, server_id, name, type, position) VALUES (?, ?, ?, ?, ?)', [id, serverId, name, type, position]) },
  getByServer: { all: (serverId) => all('SELECT * FROM channels WHERE server_id = ? ORDER BY position, name', [serverId]) },
};

export const messageQueries = {
  create: { run: (id, channelId, dmRoomId, senderId, content) => run('INSERT INTO messages (id, channel_id, dm_room_id, sender_id, content) VALUES (?, ?, ?, ?, ?)', [id, channelId, dmRoomId, senderId, content]) },
  getByChannel: { all: (channelId) => all('SELECT m.*, u.display_name, u.avatar_url FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.channel_id = ? ORDER BY m.created_at LIMIT 100', [channelId]) },
  getByDmRoom: { all: (roomId) => all('SELECT m.*, u.display_name, u.avatar_url FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.dm_room_id = ? ORDER BY m.created_at LIMIT 100', [roomId]) },
};

export const dmQueries = {
  createRoom: { run: (id) => run('INSERT INTO dm_rooms (id) VALUES (?)', [id]) },
  addMember: { run: (roomId, userId) => run('INSERT INTO dm_room_members (room_id, user_id) VALUES (?, ?)', [roomId, userId]) },
  getRoomByUsers: { get: (a, b) => get('SELECT room_id FROM dm_room_members WHERE user_id IN (?, ?) GROUP BY room_id HAVING COUNT(*) = 2', [a, b]) },
  getRoomMembers: { all: (roomId) => all('SELECT user_id FROM dm_room_members WHERE room_id = ?', [roomId]) },
};

export const fileQueries = {
  create: { run: (id, senderId, receiverId, filename, size, mimeType) => run('INSERT INTO file_transfers (id, sender_id, receiver_id, filename, size, mime_type, status) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, senderId, receiverId, filename, size, mimeType || null, 'pending']) },
  getById: { get: (id) => get('SELECT * FROM file_transfers WHERE id = ?', [id]) },
  setPath: { run: (pathVal, status, id) => run('UPDATE file_transfers SET path = ?, status = ? WHERE id = ?', [pathVal, status, id]) },
  setStatus: { run: (status, id) => run('UPDATE file_transfers SET status = ? WHERE id = ?', [status, id]) },
};

export async function initDb() {
  if (_db) return _db;
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    _db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _db = new SQL.Database();
    _db.exec(SCHEMA);
    save();
  }
  return _db;
}

export default { initDb, userQueries, friendQueries, serverQueries, channelQueries, messageQueries, dmQueries, fileQueries };
