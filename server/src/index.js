import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { initDb, fileQueries } from './db/index.js';
import { setupWebSocket } from './ws/index.js';
import api from './routes/api.js';

await initDb();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Удаление файлов > 10 ГБ старше 2 дней (каждые 6 часов)
function cleanupLargeOldFiles() {
  try {
    const rows = fileQueries.getLargeAndOld.all();
    for (const row of rows) {
      if (row.path && fs.existsSync(row.path)) {
        fs.rmSync(row.path, { recursive: true, force: true });
      }
      fileQueries.deleteById.run(row.id);
    }
    if (rows.length > 0) console.log('[Files] Removed', rows.length, 'large old file(s)');
  } catch (e) {
    console.error('[Files] Cleanup error:', e.message);
  }
}
setInterval(cleanupLargeOldFiles, 6 * 60 * 60 * 1000);
cleanupLargeOldFiles();

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: true }));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

app.use('/api', api);

const io = new Server(httpServer, {
  cors: { origin: true },
  maxHttpBufferSize: 200 * 1024 * 1024, // 200MB for large chunks
});

setupWebSocket(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server http+ws on :${PORT}`);
});
