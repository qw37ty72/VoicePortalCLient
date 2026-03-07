import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { PhoneOff, Mic, MicOff, Headphones, HeadphoneOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { applyNoiseSuppression } from '../hooks/useNoiseGate';
import styles from './DMCall.module.css';

const soundsBase = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : './';
const RINGBACK_URL = `${soundsBase}sounds/Звонок.mp3`;

export default function DMCall({ target, onClose }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [micMuted, setMicMuted] = useState(false);
  const [headphonesMuted, setHeadphonesMuted] = useState(false);
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const rawStreamRef = useRef(null);
  const ringbackRef = useRef(null);

  useEffect(() => {
    if (!socket || !target?.id) return;
    const startCall = async () => {
      try {
        const ringback = new Audio(RINGBACK_URL);
        ringback.loop = true;
        ringback.volume = 0.6;
        ringback.play().catch(() => {});
        ringbackRef.current = ringback;

        const rawStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        rawStreamRef.current = rawStream;
        const stream = await applyNoiseSuppression(rawStream);
        streamRef.current = stream;
        if (localAudioRef.current) localAudioRef.current.srcObject = stream;

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit('webrtc-ice-to-user', { targetUserId: target.id, candidate: e.candidate });
        };
        pc.ontrack = (e) => {
          if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0];
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer-to-user', { targetUserId: target.id, offer, room: 'dm' });
      } catch (err) {
        console.error('Call start error', err);
        if (ringbackRef.current) {
          ringbackRef.current.pause();
          ringbackRef.current = null;
        }
        rawStreamRef.current?.getTracks().forEach((t) => t.stop());
        rawStreamRef.current = null;
      }
    };

    const onAnswer = async ({ from, answer }) => {
      if (ringbackRef.current) {
        ringbackRef.current.pause();
        ringbackRef.current = null;
      }
      if (!pcRef.current) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    };
    const onIce = async ({ from, candidate }) => {
      if (!pcRef.current || !candidate) return;
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    };

    socket.on('webrtc-answer', onAnswer);
    socket.on('webrtc-ice', onIce);

    startCall();
    return () => {
      if (ringbackRef.current) {
        ringbackRef.current.pause();
        ringbackRef.current = null;
      }
      rawStreamRef.current?.getTracks().forEach((t) => t.stop());
      rawStreamRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      pcRef.current?.close();
      socket.off('webrtc-answer', onAnswer);
      socket.off('webrtc-ice', onIce);
    };
  }, [socket, target?.id]);

  useEffect(() => {
    if (!streamRef.current) return;
    const muted = micMuted || headphonesMuted;
    streamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }, [micMuted, headphonesMuted]);

  useEffect(() => {
    if (remoteAudioRef.current) remoteAudioRef.current.muted = headphonesMuted;
  }, [headphonesMuted]);

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className={styles.modal}
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Звонок: {target?.name}</h3>
        <div className={styles.audioWrap}>
          <audio ref={localAudioRef} autoPlay muted />
          <audio ref={remoteAudioRef} autoPlay />
        </div>
        <div className={styles.controls}>
          <button
            className={`${styles.controlBtn} ${micMuted ? styles.muted : ''}`}
            onClick={() => setMicMuted((m) => !m)}
            title="Микрофон"
          >
            {micMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
          <button
            className={`${styles.controlBtn} ${headphonesMuted ? styles.muted : ''}`}
            onClick={() => {
              setHeadphonesMuted((m) => !m);
              if (!headphonesMuted) setMicMuted(true);
              else setMicMuted(false);
            }}
            title="Мут наушников (мутит и микрофон)"
          >
            {headphonesMuted ? <HeadphoneOff size={24} /> : <Headphones size={24} />}
          </button>
          <button className={styles.hangUp} onClick={onClose}>
            <PhoneOff size={24} />
          </button>
        </div>
        <p className={styles.hint}>Шумоподавление включено</p>
      </motion.div>
    </motion.div>
  );
}
