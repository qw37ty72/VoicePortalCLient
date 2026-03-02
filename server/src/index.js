import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { initDb } from './db/index.js';
import { setupWebSocket } from './ws/index.js';
import api from './routes/api.js';

await initDb();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

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
