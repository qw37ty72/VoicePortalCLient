import { useRef, useEffect } from 'react';
import { useSpeakingDetector } from '../hooks/useSpeakingDetector';
import styles from './VoiceParticipantTile.module.css';

export default function VoiceParticipantTile({ user, stream, isMe, audioStream, socketId, onEnterFullscreen }) {
  const videoRef = useRef(null);
  const displayStream = stream;
  const hasVideo = displayStream?.getVideoTracks?.()?.length > 0;
  const streamForSpeaking = audioStream ?? stream;
  const hasAudio = streamForSpeaking?.getAudioTracks?.()?.length > 0;
  const speaking = useSpeakingDetector(hasAudio ? streamForSpeaking : null);

  useEffect(() => {
    if (!videoRef.current || !displayStream || !hasVideo) return;
    videoRef.current.srcObject = displayStream;
  }, [displayStream, hasVideo]);

  const name = isMe ? 'Вы' : (user?.display_name || user?.username || 'Участник');

  const handleClick = () => {
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
    </div>
  );
}
