import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import styles from './VoiceVoteOverlay.module.css';

const SOUND_FADE_START_MS = 16000;
const SOUND_END_MS = 18000;
const VOTE_DURATION_MS = 20000;

export default function VoiceVoteOverlay({ vote, onVote, onEnd }) {
  const [secondsLeft, setSecondsLeft] = useState(20);
  const [result, setResult] = useState(null);
  const audioRef = useRef(null);
  const fadeRef = useRef(null);

  useEffect(() => {
    if (!vote) return;
    setResult(null);
    setSecondsLeft(20);
    const endAt = vote.endAt || Date.now() + VOTE_DURATION_MS;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(interval);
      }
    }, 200);

    const base = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : './';
    const audio = new Audio(`${base}sounds/Голосование.mp3`);
    audioRef.current = audio;
    audio.volume = 0.55;
    audio.play().catch(() => {});

    const fadeStart = SOUND_FADE_START_MS;
    const fadeEnd = SOUND_END_MS;
    fadeRef.current = setInterval(() => {
      const elapsed = Date.now() - (endAt - VOTE_DURATION_MS);
      if (elapsed >= fadeStart && elapsed < fadeEnd && audioRef.current) {
        const t = (elapsed - fadeStart) / (fadeEnd - fadeStart);
        audioRef.current.volume = Math.max(0, 0.55 * (1 - t));
      } else if (elapsed >= fadeEnd && audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    }, 100);

    return () => {
      clearInterval(interval);
      if (fadeRef.current) clearInterval(fadeRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [vote?.voteId]);

  useEffect(() => {
    if (!vote) return;
    if (secondsLeft <= 0 && !result) {
      setResult('counting');
    }
  }, [vote, secondsLeft, result]);

  const handleVote = (choice) => {
    if (!vote || result) return;
    onVote(vote.voteId, choice);
  };

  if (!vote) return null;

  const title = vote.type === 'ban'
    ? `Забанить ${vote.targetDisplayName} на ${vote.durationLabel}?`
    : `Помиловать ${vote.targetDisplayName}?`;

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className={styles.panel}>
        <div className={styles.title}>{title}</div>
        <div className={styles.timer}>{secondsLeft > 0 ? secondsLeft : '—'}</div>
        <div className={styles.voteCounts}>
          <span className={styles.voteCountBan}>За бан: {vote.banVotes ?? 0}</span>
          <span className={styles.voteCountPardon}>Против: {vote.pardonVotes ?? 0}</span>
        </div>
        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.btnBan}
            onClick={() => handleVote('ban')}
            disabled={!!result}
          >
            БАН
          </button>
          <button
            type="button"
            className={styles.btnPardon}
            onClick={() => handleVote('pardon')}
            disabled={!!result}
          >
            ПОМИЛОВАТЬ
          </button>
        </div>
        {result === 'counting' && (
          <div className={styles.counting}>Подсчёт...</div>
        )}
      </div>
    </motion.div>
  );
}
