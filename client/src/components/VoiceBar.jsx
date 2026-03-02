import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, Video, VideoOff, Tv, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import styles from './VoiceBar.module.css';

export default function VoiceBar({ channelId, onOpenStreamPicker, onLeave }) {
  const { user } = useAuth();
  const [micMuted, setMicMuted] = useState(false);
  const [headphonesMuted, setHeadphonesMuted] = useState(false);
  const [webcamOn, setWebcamOn] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);

  const toggleMic = () => setMicMuted((m) => !m);
  const toggleHeadphones = () => setHeadphonesMuted((m) => !m);

  const toggleWebcam = async () => {
    if (webcamOn && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      setWebcamOn(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setWebcamOn(true);
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
        <button
          className={`${styles.controlBtn} ${micMuted ? styles.muted : ''}`}
          onClick={toggleMic}
          title={micMuted ? 'Включить микрофон' : 'Выключить микрофон'}
        >
          {micMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <button
          className={`${styles.controlBtn} ${headphonesMuted ? styles.muted : ''}`}
          onClick={toggleHeadphones}
          title={headphonesMuted ? 'Включить наушники' : 'Выключить наушники (мут)'}
        >
          {headphonesMuted ? <HeadphoneOff size={22} /> : <Headphones size={22} />}
        </button>
        <button
          className={`${styles.controlBtn} ${webcamOn ? styles.active : ''}`}
          onClick={toggleWebcam}
          title="Веб-камера"
        >
          {webcamOn ? <VideoOff size={22} /> : <Video size={22} />}
        </button>
        <button
          className={`${styles.controlBtn} ${streaming ? styles.active : ''}`}
          onClick={() => {
            onOpenStreamPicker();
            setStreaming(true);
          }}
          title="Стрим экрана/приложения"
        >
          <Tv size={22} />
        </button>
        {onLeave && (
          <button className={styles.leaveBtn} onClick={onLeave} title="Отключиться от голосового канала">
            Отключиться
          </button>
        )}
      </div>
    </div>
  );
}
