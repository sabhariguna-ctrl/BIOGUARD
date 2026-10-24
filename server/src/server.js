import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { app } from './app.js';
import { verifyToken } from './utils/token.js';
import { setIo } from './utils/realtime.js';
import { validateEnv, allowedOrigins } from './config.js';
import { ensureAdmin } from './services/bootstrap.js';

validateEnv();

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: allowedOrigins(), credentials: true } });
setIo(io);

io.use((socket, next) => {
  try { socket.user = verifyToken(socket.handshake.auth?.token); next(); }
  catch { next(new Error('unauthorized')); }
});
io.on('connection', (socket) => {
  if (['admin', 'faculty'].includes(socket.user.role)) socket.join('proctors');
  socket.join(`user:${socket.user.id}`);
});

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bioguard')
  .then(async () => { (await ensureAdmin()).forEach((n) => console.log('[admin]', n)); })
  .then(() => server.listen(PORT, () => console.log(`BioGuard API running on http://localhost:${PORT}`)))
  .catch((e) => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
