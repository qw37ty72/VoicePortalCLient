/**
 * Копирует звуки из client/sounds в client/public/sounds.
 * Вызывается перед сборкой — так звуки попадают в dist/ и в установщик приложения.
 * При обновлении приложения пользователь получает актуальные звуки вместе с обновой.
 */
const fs = require('fs');
const path = require('path');

const clientDir = path.join(__dirname, '..');
const soundsDir = path.join(clientDir, 'sounds');
const publicSoundsDir = path.join(clientDir, 'public', 'sounds');

if (!fs.existsSync(soundsDir)) {
  console.warn('[copy-sounds] Папка sounds/ не найдена, пропуск.');
  process.exit(0);
}

if (!fs.existsSync(publicSoundsDir)) {
  fs.mkdirSync(publicSoundsDir, { recursive: true });
}

const files = fs.readdirSync(soundsDir).filter((f) => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.ogg'));
files.forEach((f) => {
  const src = path.join(soundsDir, f);
  const dest = path.join(publicSoundsDir, f);
  fs.copyFileSync(src, dest);
  console.log('[copy-sounds]', f);
});

process.exit(0);
