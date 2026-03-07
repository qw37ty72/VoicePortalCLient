/** Порог гейта в dB по шкале 0–100 (45 dB = только звук выше «половинной» громкости). */
const DEFAULT_GATE_THRESHOLD_DB = 45;

/**
 * Порог в dB (0–100) → линейный 0..1 для гейта.
 */
function gateThresholdDbToLinear(dB) {
  return Math.max(0, Math.min(1, dB / 100));
}

/**
 * Подавление шума: RNNoise (WASM) + шумовой гейт.
 * В getUserMedia уже включены echoCancellation, noiseSuppression, autoGainControl.
 * @param {MediaStream} stream — поток с аудио (микрофон)
 * @param {number} gateThresholdDb — порог гейта в децибелах 0–100 (ниже = режем; 45 = средняя строгость)
 * @returns {Promise<MediaStream>} — поток с обработанным аудио или исходный при ошибке
 */
export async function applyNoiseSuppression(stream, gateThresholdDb = DEFAULT_GATE_THRESHOLD_DB) {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) return stream;

  const gateThreshold = gateThresholdDbToLinear(gateThresholdDb);
  let out = stream;
  try {
    out = await applyRnnoise(out) ?? out;
  } catch (e) {
    console.warn('[NoiseSuppression] RNNoise failed, using gate only', e?.message);
  }
  return applyNoiseGate(out, gateThreshold);
}

/**
 * RNNoise (WASM): нейросетевое подавление шума через AudioWorklet.
 * При ошибке загрузки/инициализации возвращает null — вызывающий использует исходный поток.
 * @param {MediaStream} stream
 * @returns {Promise<MediaStream | null>}
 */
async function applyRnnoise(stream) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  let workletName;
  try {
    const mod = await import('@timephy/rnnoise-wasm');
    workletName = mod.NoiseSuppressorWorklet_Name;
  } catch (e) {
    console.warn('[RNNoise] load failed', e?.message);
    return null;
  }
  // Worklet копируется в public/ при сборке; URL — относительно текущей страницы
  const workletUrl = new URL('NoiseSuppressorWorklet.js', window.location.href).href;

  const ctx = new AudioContextClass();
  const source = ctx.createMediaStreamSource(stream);
  const destination = ctx.createMediaStreamDestination();

  try {
    await ctx.audioWorklet.addModule(workletUrl);
    const node = new AudioWorkletNode(ctx, workletName);
    source.connect(node);
    node.connect(destination);
  } catch (e) {
    try { ctx.close(); } catch (_) {}
    console.warn('[RNNoise] worklet failed', e?.message);
    return null;
  }

  const outStream = destination.stream;
  const track = outStream.getAudioTracks()[0];
  if (track) {
    track.onended = () => {
      try { ctx.close(); } catch (_) {}
    };
  }
  return outStream;
}

/**
 * Noise gate: пропускает только звук выше порога (режет фон и клавиатуру).
 * @param {MediaStream} stream — поток с аудио (микрофон)
 * @param {number} threshold — порог 0..1 (звук ниже не проходит)
 * @returns {Promise<MediaStream>} — поток с обработанным аудио или исходный при ошибке
 */
export function applyNoiseGate(stream, threshold = 0.45) {
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
    const attack = 0.025;
    const release = 0.045;

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
