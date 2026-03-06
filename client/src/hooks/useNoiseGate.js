/**
 * Noise gate: пропускает только звук выше порога (режет фон и клавиатуру).
 * В getUserMedia уже включены echoCancellation, noiseSuppression, autoGainControl;
 * для более агрессивного подавления можно подключить RNNoise (например @sapphire-dev/rnnoise-wasm).
 * @param {MediaStream} stream — поток с аудио (микрофон)
 * @param {number} threshold — порог 0..1 (меньше = чувствительнее, режет больше тишины)
 * @returns {Promise<MediaStream>} — поток с обработанным аудио или исходный при ошибке
 */
export function applyNoiseGate(stream, threshold = 0.018) {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) return Promise.resolve(stream);

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return Promise.resolve(stream);

    const ctx = new AudioContextClass();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    source.connect(gainNode);

    const destination = ctx.createMediaStreamDestination();
    gainNode.connect(destination);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let currentGain = 0;
    const attack = 0.03;
    const release = 0.08;

    const update = () => {
      analyser.getByteFrequencyData(data);
      const sum = data.reduce((a, b) => a + b, 0);
      const level = sum / data.length / 255;
      const target = level > threshold ? 1 : 0;
      const speed = target > currentGain ? attack : release;
      currentGain += (target - currentGain) * speed;
      gainNode.gain.value = Math.max(0, Math.min(1, currentGain));
      if (noiseGateActive) requestAnimationFrame(update);
    };
    let noiseGateActive = true;
    requestAnimationFrame(update);

    const outStream = destination.stream;
    if (outStream.getAudioTracks()[0]) {
      outStream.getAudioTracks()[0].onended = () => {
        noiseGateActive = false;
        try { ctx.close(); } catch (_) {}
      };
    }

    return Promise.resolve(outStream);
  } catch (e) {
    console.warn('[NoiseGate]', e);
    return Promise.resolve(stream);
  }
}
