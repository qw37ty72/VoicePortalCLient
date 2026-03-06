import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, Video, VideoOff, Tv, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import styles from './VoiceBar.module.css';

function RemoteAudio({ stream, muted }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline muted={muted} />;
}

export default function VoiceBar({ channelId, channelVoice, onOpenStreamPicker, onLeave, onLocalVideoStreamChange, isStreaming, onStopStream }) {
  const { user } = useAuth();
  const isChannelVoice = !!channelVoice;
  const [micMuted, setMicMuted] = useState(false);
  const [headphonesMuted, setHeadphonesMuted] = useState(false);
  const [webcamOn, setWebcamOn] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const streamingActive = isChannelVoice ? (isStreaming ?? false) : streaming;
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);

  const effectiveMicMuted = isChannelVoice ? channelVoice.micMuted : micMuted;
  const effectiveHeadphonesMuted = isChannelVoice ? channelVoice.headphonesMuted : headphonesMuted;
  const setEffectiveMicMuted = isChannelVoice ? channelVoice.setMicMuted : setMicMuted;
  const setEffectiveHeadphonesMuted = isChannelVoice ? channelVoice.setHeadphonesMuted : setHeadphonesMuted;

  const toggleMic = () => setEffectiveMicMuted((m) => !m);
  const toggleHeadphones = () => setEffectiveHeadphonesMuted((m) => !m);

  const toggleWebcam = async () => {
    if (webcamOn && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      setWebcamOn(false);
      onLocalVideoStreamChange?.(null);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setWebcamOn(true);
      onLocalVideoStreamChange?.(stream);
    } catch (err) {
      console.error('Webcam error', err);
    }
  };

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className={styles.voiceBar}>
      <div className={styles.voiceLeft}>
        {webcamOn && (
          <div className={styles.webcamPreview}>
            <video ref={localVideoRef} autoPlay muted playsInline />
            <button className={styles.webcamClose} onClick={toggleWebcam} title="Выключить камеру">
              <X size={14} />
            </button>
          </div>
        )}
        <span className={styles.channelLabel}>
          {channelId ? `Голосовой канал` : 'Выберите канал'}
        </span>
      </div>
      <div className={styles.voiceControls}>
        {isChannelVoice && channelVoice.remotePeers?.length > 0 && (
          <span className={styles.remoteCount} title="Участников в голосе">
            {channelVoice.remotePeers.length}
          </span>
        )}
        <button
          className={`${styles.controlBtn} ${effectiveMicMuted ? styles.muted : ''}`}
          onClick={toggleMic}
          title={effectiveMicMuted ? 'Включить микрофон' : 'Выключить микрофон'}
        >
          {effectiveMicMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <button
          className={`${styles.controlBtn} ${effectiveHeadphonesMuted ? styles.muted : ''}`}
          onClick={toggleHeadphones}
          title={effectiveHeadphonesMuted ? 'Включить наушники' : 'Выключить наушники (мут)'}
        >
          {effectiveHeadphonesMuted ? <HeadphoneOff size={22} /> : <Headphones size={22} />}
        </button>
        <button
          className={`${styles.controlBtn} ${webcamOn ? styles.active : ''}`}
          onClick={toggleWebcam}
          title="Веб-камера"
        >
          {webcamOn ? <VideoOff size={22} /> : <Video size={22} />}
        </button>
        <button
          className={`${styles.controlBtn} ${streamingActive ? styles.active : ''}`}
          onClick={() => {
            if (isChannelVoice && streamingActive && onStopStream) {
              onStopStream();
              return;
            }
            onOpenStreamPicker();
            setStreaming(true);
          }}
          title={streamingActive ? 'Выключить стрим' : 'Стрим экрана/приложения'}
        >
          <Tv size={22} />
        </button>
        {onLeave && (
          <button className={styles.leaveBtn} onClick={onLeave} title="Отключиться от голосового канала">
            Отключиться
          </button>
        )}
      </div>
      {isChannelVoice && channelVoice.remotePeers?.length > 0 && (
        <div className={styles.remoteAudioWrap} aria-hidden="true">
          {channelVoice.remotePeers.map((peer) => (
            <RemoteAudio key={peer.socketId} stream={peer.stream} muted={effectiveHeadphonesMuted} />
          ))}
        </div>
      )}
    </div>
  );
}
