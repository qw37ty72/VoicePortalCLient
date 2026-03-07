const onlineUsers = new Map(); // userId -> 'online' | 'dnd' | 'away'

export function setOnline(userId, status = 'online') {
  onlineUsers.set(userId, status);
}

export function setOffline(userId) {
  onlineUsers.delete(userId);
}

export function getStatus(userId) {
  return onlineUsers.get(userId) || 'offline';
}

export function getAllStatuses() {
  return Object.fromEntries(onlineUsers);
}
