const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const clientDir = path.join(__dirname, '..');
const url = 'http://localhost:5173';
let launched = false;

function check() {
  if (launched) return;
  const req = http.get(url, () => {
    if (launched) return;
    launched = true;
    spawn('npx', ['electron', '.', '--dev'], {
      stdio: 'inherit',
      shell: true,
      cwd: clientDir,
      env: { ...process.env, NODE_ENV: 'development' },
    });
  });
  req.on('error', () => { if (!launched) setTimeout(check, 500); });
  req.setTimeout(3000, () => {
    req.destroy();
    if (!launched) setTimeout(check, 500);
  });
}

setTimeout(check, 1000);
