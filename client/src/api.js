const API = () => {
  try {
    const url = import.meta.env.VITE_API_URL || localStorage.getItem('vp_api_url') || 'http://localhost:3001';
    return (url || 'http://localhost:3001').trim().replace(/\/+$/, '');
  } catch {
    return 'http://localhost:3001';
  }
};

const headers = () => ({
  'Content-Type': 'application/json',
  'X-User-Id': localStorage.getItem('vp_user_id'),
  Authorization: `Bearer ${localStorage.getItem('vp_token')}`,
});

export async function getServers() {
  const res = await fetch(`${API()}/api/servers`, { headers: headers() });
  if (!res.ok) throw new Error('Не удалось загрузить сервера');
  return res.json();
}

export async function createServer(name) {
  const res = await fetch(`${API()}/api/servers`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: name?.trim() || 'Новый сервер' }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось создать сервер');
  }
  return res.json();
}

export async function getServerInviteInfo(serverId) {
  const res = await fetch(`${API()}/api/servers/${encodeURIComponent(serverId)}/invite-info`, { headers: headers() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Сервер не найден');
  }
  return res.json();
}

export async function joinServer(serverId) {
  const id = String(serverId).trim();
  if (!id) throw new Error('Введите ID сервера');
  const res = await fetch(`${API()}/api/servers/${encodeURIComponent(id)}/join`, {
    method: 'POST',
    headers: headers(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось присоединиться');
  }
  return res.json();
}

export async function leaveServer(serverId) {
  const res = await fetch(`${API()}/api/servers/${encodeURIComponent(serverId)}/leave`, {
    method: 'POST',
    headers: headers(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось покинуть сервер');
  }
  return res.json();
}

export async function getChannels(serverId) {
  const res = await fetch(`${API()}/api/servers/${serverId}/channels`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to fetch channels');
  return res.json();
}

export async function getChannelBans(channelId) {
  const res = await fetch(`${API()}/api/channels/${channelId}/bans`, { headers: headers() });
  if (!res.ok) throw new Error('Failed to fetch bans');
  return res.json();
}

export async function createChannel(serverId, name) {
  const res = await fetch(`${API()}/api/servers/${encodeURIComponent(serverId)}/channels`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: (name || '').trim() || 'channel' }),
  });
  if (!res.ok) throw new Error('Не удалось создать канал');
  return res.json();
}

export async function getFriends() {
  const res = await fetch(`${API()}/api/friends`, { headers: headers() });
  if (!res.ok) throw new Error('Не удалось загрузить друзей');
  return res.json();
}

export async function addFriend(friendId) {
  const id = String(friendId).trim();
  if (!id) throw new Error('Введите ID пользователя');
  const res = await fetch(`${API()}/api/friends/add`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ friendId: id }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось добавить друга');
  }
  return res.json();
}

export async function getChannelMessages(channelId, before) {
  const url = before ? `${API()}/api/channels/${channelId}/messages?before=${before}` : `${API()}/api/channels/${channelId}/messages`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function getOrCreateDmRoom(otherUserId) {
  const res = await fetch(`${API()}/api/dm/get-or-create-room`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ otherUserId }),
  });
  if (!res.ok) throw new Error('Failed to get DM room');
  return res.json();
}

export async function getDmMessages(roomId, before) {
  const url = before ? `${API()}/api/dm/${roomId}/messages?before=${before}` : `${API()}/api/dm/${roomId}/messages`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function addReaction(messageId, emoji) {
  const res = await fetch(`${API()}/api/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ emoji }),
  });
  if (!res.ok) throw new Error('Failed to add reaction');
  return res.json();
}

export async function removeReaction(messageId, emoji) {
  const res = await fetch(`${API()}/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok) throw new Error('Failed to remove reaction');
  return res.json();
}

export async function search(query) {
  const res = await fetch(`${API()}/api/search?q=${encodeURIComponent(query)}`, { headers: headers() });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function initFileTransfer(receiverId, filename, size, mimeType) {
  const res = await fetch(`${API()}/api/files/init`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ receiverId, filename, size, mimeType }),
  });
  if (!res.ok) throw new Error('Failed to init transfer');
  return res.json();
}

export async function uploadChunk(transferId, index, total, blob) {
  const form = new FormData();
  form.append('chunk', blob);
  form.append('transferId', transferId);
  form.append('index', String(index));
  form.append('total', String(total));
  const res = await fetch(`${API()}/api/files/upload-chunk`, {
    method: 'POST',
    headers: { 'X-User-Id': localStorage.getItem('vp_user_id'), Authorization: `Bearer ${localStorage.getItem('vp_token')}` },
    body: form,
  });
  if (!res.ok) throw new Error('Chunk upload failed');
  return res.json();
}
