require('dotenv').config();

const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const { pool }   = require('./config/db');

// ── Validate required env vars ────────────────────────────────
const REQUIRED_ENV = [
  'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
  'JWT_SECRET',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER',
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[Startup] Missing required env vars: ${missing.join(', ')}`);
  console.error('[Startup] Copy .env.example → .env and fill in the values.');
  process.exit(1);
}

// ── App ───────────────────────────────────────────────────────
const app  = express();
const PORT = Number(process.env.PORT) || 3000;

// Allow one or more comma-separated origins via CLIENT_ORIGIN.
// In production without CLIENT_ORIGIN set: deny all cross-origin (safe default — Nginx serves same origin).
// In development without CLIENT_ORIGIN set: reflect any origin for convenience.
const corsOrigin = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim())
  : process.env.NODE_ENV === 'production' ? false : true;

// Trust the first proxy hop (Nginx).
// Without this, express-rate-limit sees Nginx's internal Docker IP
// for every client — all traffic shares one rate-limit bucket.
// With trust proxy: 1, it reads X-Forwarded-For (set by Nginx)
// to throttle per real client IP.
app.set('trust proxy', 1);

// ── Security & parsing ────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '16kb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Global rate limit (100 req / 15 min per IP) ───────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ── Routes ────────────────────────────────────────────────────
app.use('/auth', authRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// 404
app.use((_req, res) => res.status(404).json({ success: false, message: 'Route not found.' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[Unhandled]', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────────
async function start() {
  // Verify DB connectivity before accepting traffic
  try {
    await pool.query('SELECT 1');
    console.log('[DB] Connected to PostgreSQL');
  } catch (err) {
    console.error('[DB] Cannot connect to PostgreSQL:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[Server] Running at http://localhost:${PORT}`);
    console.log(`[Server] NODE_ENV=${process.env.NODE_ENV}`);
  });
}

start();
