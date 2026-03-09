require('dotenv').config();

const express  = require('express');
const helmet   = require('helmet');
const cors     = require('cors');
const morgan   = require('morgan');

const { pool }      = require('./config/db');
const depositRoutes = require('./routes/deposits');
const webhookRoutes = require('./routes/webhook');

const REQUIRED_ENV = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'WEBHOOK_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[Startup] Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const app  = express();
const PORT = Number(process.env.PORT) || 5001;

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: true, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Secret'] }));
app.use(express.json({ limit: '16kb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/txn', depositRoutes);
app.use('/api/txn/webhook', webhookRoutes);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use((_req, res) => res.status(404).json({ success: false, message: 'Not found.' }));
app.use((err, _req, res, _next) => {
  console.error('[Unhandled]', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('[DB] Connected to PostgreSQL');
  } catch (err) {
    console.error('[DB] Cannot connect:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[Server] Transaction server running at http://localhost:${PORT}`);
  });
}

start();
