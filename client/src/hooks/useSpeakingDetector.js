import { useState, useEffect, useRef } from 'react';

const THRESHOLD = 0.02;
const POLL_MS = 100;

export function useSpeakingDetector(stream) {
  const [speaking, setSpeaking] = useState(false);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const dataRef = useRef(null);

  useEffect(() => {
    if (!stream) {
      setSpeaking(false);
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setSpeaking(false);
      return;
    }
    let cancelled = false;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    dataRef.current = data;

    const check = () => {
      if (cancelled) return;
      analyser.getByteFrequencyData(data);
      const sum = data.reduce((a, b) => a + b, 0);
      const avg = sum / data.length / 255;
      setSpeaking(avg > THRESHOLD);
    };

    const id = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      try {
        src.disconnect();
        ctx.close();
      } catch (_) {}
    };
  }, [stream]);

  return speaking;
}
