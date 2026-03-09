const path     = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express  = require('express');
const helmet   = require('helmet');
const cors     = require('cors');

const authRoutes  = require('./routes/auth');
const statsRoutes = require('./routes/stats');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,  // Allow inline scripts in SPA
}));

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*',
  credentials: true,
}));

app.use(express.json({ limit: '16kb' }));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/admin/auth',  authRoutes);
app.use('/api/admin/stats', statsRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Serve React static files (production) ────────────────────────────────────
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path === '/health') {
    return res.status(404).json({ message: 'Not found.' });
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[admin] Server running on port ${PORT}`);
});
