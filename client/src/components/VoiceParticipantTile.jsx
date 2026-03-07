import { useRef, useEffect, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { useSpeakingDetector } from '../hooks/useSpeakingDetector';
import styles from './VoiceParticipantTile.module.css';

export default function VoiceParticipantTile({ user, stream, isMe, audioStream, socketId, volume = 100, onVolumeChange, onEnterFullscreen, onBanClick }) {
  const videoRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const displayStream = stream;
  const hasVideo = displayStream?.getVideoTracks?.()?.length > 0;
  const streamForSpeaking = audioStream ?? stream;
  const hasAudio = streamForSpeaking?.getAudioTracks?.()?.length > 0;
  const speaking = useSpeakingDetector(hasAudio ? streamForSpeaking : null);

  useEffect(() => {
    if (!videoRef.current || !displayStream || !hasVideo) return;
    videoRef.current.srcObject = displayStream;
  }, [displayStream, hasVideo]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpen]);

  const name = isMe ? 'Вы' : (user?.display_name || user?.username || 'Участник');

  const handleClick = (e) => {
    if (e.target.closest(`.${styles.menuWrap}`)) return;
    if (hasVideo && onEnterFullscreen) {
      onEnterFullscreen({ stream: displayStream, user, isMe, socketId: socketId ?? null });
    }
  };

  return (
    <div
      className={`${styles.tile} ${speaking ? styles.speaking : ''} ${hasVideo ? styles.hasVideo : ''}`}
      title={hasVideo ? `${name} — клик: на весь экран` : name}
      onClick={handleClick}
      role={hasVideo ? 'button' : undefined}
    >
      <div className={styles.mediaWrap}>
        {hasVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isMe}
            className={styles.video}
          />
        ) : (
          <>
            {user?.avatar_url ? (
              <img className={styles.avatarImg} src={user.avatar_url} alt="" />
            ) : (
              <span className={styles.avatarLetter}>
                {(user?.display_name?.[0] || user?.username?.[0] || '?').toUpperCase()}
              </span>
            )}
          </>
        )}
      </div>
      <span className={styles.name}>{name}</span>
      {!isMe && onVolumeChange && (
        <div className={styles.volumeWrap} onClick={(e) => e.stopPropagation()}>
          <input
            type="range"
            min={0}
            max={200}
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className={styles.volumeSlider}
            title={`Громкость ${volume}%`}
          />
          <span className={styles.volumeLabel}>{volume}%</span>
        </div>
      )}
      {!isMe && onBanClick && (
        <div className={styles.menuWrap}>
          <button
            type="button"
            className={styles.menuBtn}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
            title="Действия"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className={styles.menuDropdown}>
              <button type="button" className={styles.menuItem} onClick={() => { onBanClick(); setMenuOpen(false); }}>
                Забанить
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
