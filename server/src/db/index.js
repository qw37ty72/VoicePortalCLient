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
  getByUsername: { get: (name) => get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [String(name || '').trim()]) },
  update: { run: (username, displayName, avatarUrl, id) => run('UPDATE users SET username = ?, display_name = ?, avatar_url = ? WHERE id = ?', [username, displayName, avatarUrl, id]) },
};

export const friendQueries = {
  add: { run: (userId, friendId, status) => run('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)', [userId, friendId, status]) },
  getRelation: { get: (userId, targetId) => get('SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?) LIMIT 1', [userId, targetId, targetId, userId]) },
  getFriends: { all: (a, b, c) => all('SELECT u.id, u.display_name, u.username, u.avatar_url FROM friends f JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = ?', [a, b, c, 'accepted']) },
  getPending: { all: (id) => all('SELECT u.*, f.created_at FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = ?', [id, 'pending']) },
  getPendingIncoming: { all: (id) => all('SELECT u.id, u.display_name, u.username, u.avatar_url, f.created_at FROM friends f JOIN users u ON u.id = f.user_id WHERE f.friend_id = ? AND f.status = ?', [id, 'pending']) },
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
  getById: { get: (id) => get('SELECT * FROM channels WHERE id = ?', [id]) },
  getByServer: { all: (serverId) => all('SELECT * FROM channels WHERE server_id = ? ORDER BY position, name', [serverId]) },
};

export const messageQueries = {
  create: { run: (id, channelId, dmRoomId, senderId, content) => run('INSERT INTO messages (id, channel_id, dm_room_id, sender_id, content) VALUES (?, ?, ?, ?, ?)', [id, channelId, dmRoomId, senderId, content]) },
  getById: { get: (id) => get('SELECT * FROM messages WHERE id = ?', [id]) },
  getByChannel: { all: (channelId) => all('SELECT m.*, u.display_name, u.avatar_url FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.channel_id = ? ORDER BY m.created_at DESC LIMIT 2000', [channelId]) },
  getByDmRoom: { all: (roomId) => all('SELECT m.*, u.display_name, u.avatar_url FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.dm_room_id = ? ORDER BY m.created_at DESC LIMIT 2000', [roomId]) },
  searchInChannels: { all: (channelIds, like) => (channelIds.length ? all(`SELECT m.id, m.channel_id, m.dm_room_id, m.sender_id, m.content, m.created_at, u.display_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.channel_id IN (${channelIds.map(() => '?').join(',')}) AND m.content LIKE ? ORDER BY m.created_at DESC LIMIT 30`, [...channelIds, like]) : []) },
  searchInDmRooms: { all: (roomIds, like) => (roomIds.length ? all(`SELECT m.id, m.channel_id, m.dm_room_id, m.sender_id, m.content, m.created_at, u.display_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.dm_room_id IN (${roomIds.map(() => '?').join(',')}) AND m.content LIKE ? ORDER BY m.created_at DESC LIMIT 20`, [...roomIds, like]) : []) },
};

export const dmQueries = {
  createRoom: { run: (id) => run('INSERT INTO dm_rooms (id) VALUES (?)', [id]) },
  addMember: { run: (roomId, userId) => run('INSERT INTO dm_room_members (room_id, user_id) VALUES (?, ?)', [roomId, userId]) },
  getRoomByUsers: { get: (a, b) => get('SELECT room_id FROM dm_room_members WHERE user_id IN (?, ?) GROUP BY room_id HAVING COUNT(*) = 2', [a, b]) },
  getRoomMembers: { all: (roomId) => all('SELECT user_id FROM dm_room_members WHERE room_id = ?', [roomId]) },
};

export const reactionQueries = {
  add: { run: (messageId, userId, emoji) => run('INSERT OR IGNORE INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)', [messageId, userId, emoji]) },
  remove: { run: (messageId, userId, emoji) => run('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [messageId, userId, emoji]) },
  removeAllByMessageAndUser: { run: (messageId, userId) => run('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?', [messageId, userId]) },
  getByMessageAndUser: { all: (messageId, userId) => all('SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?', [messageId, userId]) },
  getByMessageIds: { all: (messageIds) => (messageIds.length ? all(`SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN (${messageIds.map(() => '?').join(',')})`, messageIds) : []) },
};

export const banQueries = {
  add: { run: (channelId, userId, expiresAt) => run('INSERT OR REPLACE INTO channel_bans (channel_id, user_id, expires_at) VALUES (?, ?, ?)', [channelId, userId, expiresAt]) },
  remove: { run: (channelId, userId) => run('DELETE FROM channel_bans WHERE channel_id = ? AND user_id = ?', [channelId, userId]) },
  getActive: { get: (channelId, userId) => get('SELECT * FROM channel_bans WHERE channel_id = ? AND user_id = ? AND expires_at > ?', [channelId, userId, Math.floor(Date.now() / 1000)]) },
  getActiveByChannel: { all: (channelId) => all('SELECT b.*, u.display_name, u.username FROM channel_bans b JOIN users u ON u.id = b.user_id WHERE b.channel_id = ? AND b.expires_at > ?', [channelId, Math.floor(Date.now() / 1000)]) },
  getExpired: { all: () => all('SELECT channel_id, user_id FROM channel_bans WHERE expires_at <= ?', [Math.floor(Date.now() / 1000)]) },
  deleteExpired: { run: (channelId, userId) => run('DELETE FROM channel_bans WHERE channel_id = ? AND user_id = ?', [channelId, userId]) },
};

const TEN_GB = 10 * 1024 * 1024 * 1024;
const TWO_DAYS_SEC = 2 * 24 * 3600;

export const fileQueries = {
  create: { run: (id, senderId, receiverId, filename, size, mimeType, channelId = null) => run('INSERT INTO file_transfers (id, sender_id, receiver_id, filename, size, mime_type, status, channel_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, senderId, receiverId, filename, size, mimeType || null, 'pending', channelId]) },
  getById: { get: (id) => get('SELECT * FROM file_transfers WHERE id = ?', [id]) },
  setPath: { run: (pathVal, status, id) => run('UPDATE file_transfers SET path = ?, status = ? WHERE id = ?', [pathVal, status, id]) },
  setStatus: { run: (status, id) => run('UPDATE file_transfers SET status = ? WHERE id = ?', [status, id]) },
  getLargeAndOld: { all: () => all('SELECT id, path FROM file_transfers WHERE size > ? AND created_at < ? AND path IS NOT NULL', [TEN_GB, Math.floor(Date.now() / 1000) - TWO_DAYS_SEC]) },
  deleteById: { run: (id) => run('DELETE FROM file_transfers WHERE id = ?', [id]) },
};

function migrate(db) {
  let hasStatus = false;
  try {
    const stmt = db.prepare('PRAGMA table_info(users)');
    while (stmt.step()) {
      if (stmt.getAsObject().name === 'status') hasStatus = true;
    }
    stmt.free();
  } catch (e) { /* ignore */ }
  if (!hasStatus) {
    try { db.run('ALTER TABLE users ADD COLUMN status TEXT DEFAULT \'offline\''); } catch (e) { /* ignore */ }
  }
  try {
    db.run(`CREATE TABLE IF NOT EXISTS channel_bans (
      channel_id TEXT NOT NULL, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (channel_id, user_id),
      FOREIGN KEY (channel_id) REFERENCES channels(id), FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    db.run('CREATE INDEX IF NOT EXISTS idx_channel_bans_expires ON channel_bans(expires_at)');
  } catch (e) { /* ignore */ }
  try {
    db.run(`CREATE TABLE IF NOT EXISTS message_reactions (
      message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (message_id, user_id, emoji),
      FOREIGN KEY (message_id) REFERENCES messages(id), FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    db.run('CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id)');
  } catch (e) { /* ignore */ }
  try {
    const ftInfo = db.prepare('PRAGMA table_info(file_transfers)');
    let hasChannelId = false;
    while (ftInfo.step()) {
      if (ftInfo.getAsObject().name === 'channel_id') hasChannelId = true;
    }
    ftInfo.free();
    if (!hasChannelId) db.run('ALTER TABLE file_transfers ADD COLUMN channel_id TEXT REFERENCES channels(id)');
  } catch (e) { /* ignore */ }
}

export async function initDb() {
  if (_db) return _db;
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    _db = new SQL.Database(fs.readFileSync(dbPath));
    migrate(_db);
    save();
  } else {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _db = new SQL.Database();
    _db.exec(SCHEMA);
    migrate(_db);
    save();
  }
  return _db;
}

export default { initDb, userQueries, friendQueries, serverQueries, channelQueries, messageQueries, reactionQueries, banQueries, dmQueries, fileQueries };
