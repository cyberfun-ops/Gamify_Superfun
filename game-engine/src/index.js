require('dotenv').config();

const http    = require('http');
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const morgan  = require('morgan');
const { Server } = require('socket.io');

const { pool }        = require('./config/db');
const { initRedis }   = require('./config/redis');
const gameEngine    = require('./services/gameEngine');
const { setupSocket } = require('./socket/index');
const gameRoutes    = require('./routes/game');

// ── Validate required env vars ────────────────────────────────────────────────
const REQUIRED_ENV = [
  'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
  'JWT_SECRET',
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[Startup] Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

// ── Express app ───────────────────────────────────────────────────────────────
const app  = express();
const PORT = Number(process.env.PORT) || 4000;

app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: true,                                       // reflect any Origin header — allows all origins
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '16kb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── REST routes ───────────────────────────────────────────────────────────────
app.use('/api/game', gameRoutes);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// 404 catch-all
app.use((_req, res) => res.status(404).json({ success: false, message: 'Not found.' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[Unhandled]', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ── HTTP + Socket.io server ───────────────────────────────────────────────────
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,                                     // reflect any Origin — allows all origins
    methods: ['GET', 'POST'],
  },
  // Allow connections through Nginx WebSocket proxy
  transports: ['websocket', 'polling'],
});

// ── Boot sequence ─────────────────────────────────────────────────────────────
async function start() {
  // 1. Verify DB
  try {
    await pool.query('SELECT 1');
    console.log('[DB] Connected to PostgreSQL');
  } catch (err) {
    console.error('[DB] Cannot connect:', err.message);
    process.exit(1);
  }

  // 2. Redis (optional — game runs without it)
  await initRedis();

  // 3. Wire Socket.io
  setupSocket(io);

  // 4. Listen first so the HTTP server is ready
  await new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`[Server] Game engine running at http://localhost:${PORT}`);
      console.log(`[Server] NODE_ENV=${process.env.NODE_ENV}`);
      resolve();
    });
  });

  // 5. Start game loop (infinite — must NOT be awaited here)
  gameEngine.init(io);
  gameEngine.start().catch((err) => {
    console.error('[GameLoop] Fatal error:', err);
    process.exit(1);
  });
}

start();
