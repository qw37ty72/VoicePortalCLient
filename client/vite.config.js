import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rnnoiseInClient = path.resolve(__dirname, 'node_modules/@timephy/rnnoise-wasm');
const rnnoiseInRoot = path.resolve(__dirname, '../node_modules/@timephy/rnnoise-wasm');
const rnnoisePath = fs.existsSync(rnnoiseInClient) ? rnnoiseInClient : rnnoiseInRoot;
const workletPath = path.join(rnnoisePath, 'dist/NoiseSuppressorWorklet.js');
const publicDir = path.resolve(__dirname, 'public');
const publicWorklet = path.join(publicDir, 'NoiseSuppressorWorklet.js');

const soundsDir = path.join(__dirname, 'sounds');
const publicSoundsDir = path.join(publicDir, 'sounds');

/** Копирует worklet RNNoise в public/ перед сборкой — в коде URL строится в рантайме */
function rnnoiseCopyWorklet() {
  return {
    name: 'rnnoise-copy-worklet',
    buildStart() {
      if (!fs.existsSync(workletPath)) return;
      if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
      fs.copyFileSync(workletPath, publicWorklet);
      if (fs.existsSync(soundsDir)) {
        if (!fs.existsSync(publicSoundsDir)) fs.mkdirSync(publicSoundsDir, { recursive: true });
        fs.readdirSync(soundsDir).forEach((f) => {
          fs.copyFileSync(path.join(soundsDir, f), path.join(publicSoundsDir, f));
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [rnnoiseCopyWorklet(), react()],
  base: './',
  server: { port: 5173 },
  optimizeDeps: {
    include: ['framer-motion', '@timephy/rnnoise-wasm'],
  },
  resolve: {
    alias: [
      { find: '@timephy/rnnoise-wasm', replacement: rnnoisePath },
    ],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
});
