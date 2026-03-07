import { banQueries } from '../db/index.js';

const VOTE_DURATION_MS = 20 * 1000;
const COOLDOWN_MS = 5 * 60 * 1000;
const NON_VOTER_PERCENT = 0.35; // 35% non-voters count as pardon

const activeVotes = new Map(); // voteId -> vote state
const lastVoteStartByUser = new Map(); // userId -> timestamp

let nextVoteId = 1;

function getVoteId() {
  return String(nextVoteId++);
}

export function canStartVote(userId) {
  const last = lastVoteStartByUser.get(userId);
  if (!last) return { allowed: true, remainingMs: 0 };
  const remaining = last + COOLDOWN_MS - Date.now();
  return { allowed: remaining <= 0, remainingMs: Math.max(0, remaining) };
}

export function startVote(io, channelId, startedByUserId, startedByUser, targetUserId, targetUser, type, durationSeconds, onBanApplied) {
  const cooldown = canStartVote(startedByUserId);
  if (!cooldown.allowed) {
    return { ok: false, error: 'cooldown', remainingMs: cooldown.remainingMs };
  }

  const channelSet = getChannelSocketsRef ? getChannelSocketsRef().get(channelId) : null;
  const participantsCount = channelSet ? channelSet.size : 1;

  const voteId = getVoteId();
  const endAt = Date.now() + VOTE_DURATION_MS;
  const vote = {
    voteId,
    channelId,
    type, // 'ban' | 'unban'
    targetUserId,
    targetUser,
    startedByUserId,
    startedByUser,
    durationSeconds: type === 'ban' ? durationSeconds : null,
    participantsCount,
    votes: new Map(), // userId -> 'ban' | 'pardon'
    endAt,
    timer: null,
    onBanApplied: onBanApplied || (() => {}),
  };
  activeVotes.set(voteId, vote);
  lastVoteStartByUser.set(startedByUserId, Date.now());

  const payload = {
    voteId,
    channelId,
    type,
    targetUserId,
    targetDisplayName: targetUser?.display_name || targetUser?.username || 'Участник',
    durationSeconds: vote.durationSeconds,
    durationLabel: type === 'ban' ? formatDuration(durationSeconds) : null,
    endAt,
    participantsCount,
  };

  io.to(`channel:${channelId}`).emit('vote-started', payload);

  vote.timer = setTimeout(() => {
    finishVote(io, voteId, vote.onBanApplied);
  }, VOTE_DURATION_MS);

  return { ok: true, voteId, remainingMs: COOLDOWN_MS };
}

function formatDuration(sec) {
  if (sec < 60) return `${sec} сек`;
  if (sec < 3600) return `${Math.floor(sec / 60)} мин`;
  return `${Math.floor(sec / 3600)} ч`;
}

export function castVote(voteId, userId, choice) {
  const vote = activeVotes.get(voteId);
  if (!vote) return { ok: false, error: 'vote not found' };
  if (choice !== 'ban' && choice !== 'pardon') return { ok: false, error: 'invalid choice' };
  vote.votes.set(userId, choice);
  return { ok: true };
}

export function finishVote(io, voteId, onBanApplied) {
  const vote = activeVotes.get(voteId);
  if (!vote) return;
  if (vote.timer) clearTimeout(vote.timer);
  vote.timer = null;
  activeVotes.delete(voteId);
  const doOnBan = onBanApplied || vote?.onBanApplied;

  const votedCount = vote.votes.size;
  const nonVoterCount = vote.participantsCount - votedCount;
  const nonVoterShare = vote.participantsCount > 0 ? nonVoterCount / vote.participantsCount : 0;

  let banVotes = 0;
  let pardonVotes = 0;
  vote.votes.forEach((choice) => {
    if (choice === 'ban') banVotes++;
    else pardonVotes++;
  });

  if (nonVoterShare >= NON_VOTER_PERCENT) {
    pardonVotes += nonVoterCount;
  }

  const result = banVotes > pardonVotes ? 'ban' : 'pardon';
  const payload = {
    voteId,
    channelId: vote.channelId,
    type: vote.type,
    result,
    banVotes,
    pardonVotes,
    targetUserId: vote.targetUserId,
    targetDisplayName: vote.targetUser?.display_name || vote.targetUser?.username || 'Участник',
  };

  io.to(`channel:${vote.channelId}`).emit('vote-ended', payload);

  if (vote.type === 'ban' && result === 'ban') {
    const expiresAt = Math.floor(Date.now() / 1000) + vote.durationSeconds;
    banQueries.add.run(vote.channelId, vote.targetUserId, expiresAt);
    if (doOnBan) doOnBan(io, vote.channelId, vote.targetUserId);
    io.to(`channel:${vote.channelId}`).emit('user-banned', {
      channelId: vote.channelId,
      userId: vote.targetUserId,
      expiresAt,
      durationLabel: formatDuration(vote.durationSeconds),
    });
    emitToUser(io, vote.targetUserId, 'you-were-banned', {
      channelId: vote.channelId,
      expiresAt,
      durationLabel: formatDuration(vote.durationSeconds),
    });
  } else if (vote.type === 'unban' && result === 'pardon') {
    banQueries.remove.run(vote.channelId, vote.targetUserId);
    io.to(`channel:${vote.channelId}`).emit('user-unbanned', {
      channelId: vote.channelId,
      userId: vote.targetUserId,
    });
    emitToUser(io, vote.targetUserId, 'you-were-unbanned', {
      channelId: vote.channelId,
    });
  }
}

function emitToUser(io, userId, event, data) {
  for (const s of io.sockets.sockets.values()) {
    if (s.userId === userId) s.emit(event, data);
  }
}

export function setChannelConnectionsRef(ref) {
  getChannelSocketsRef = () => ref;
}

let getChannelSocketsRef = () => new Map();

export function getVoteCooldownRemaining(userId) {
  const last = lastVoteStartByUser.get(userId);
  if (!last) return 0;
  return Math.max(0, last + COOLDOWN_MS - Date.now());
}
