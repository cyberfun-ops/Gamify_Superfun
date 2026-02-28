const express = require('express');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { verifyCrashPoint } = require('../services/provablyFair');
const { getBalance } = require('../services/walletService');

const router = express.Router();

// ── JWT auth middleware (stateless, for REST endpoints) ───────────────────────
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

// ── GET /api/game/history ─────────────────────────────────────────────────────
// Returns last 20 finished rounds (no auth required — public data)
router.get('/history', async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, server_seed_hash, crash_point, status, started_at, crashed_at, created_at
       FROM game_rounds
       WHERE status = 'crashed'
       ORDER BY created_at DESC
       LIMIT 20`,
    );
    res.json({ success: true, rounds: result.rows });
  } catch (err) {
    console.error('[Routes] /history error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ── GET /api/game/balance ─────────────────────────────────────────────────────
// Returns the authenticated user's current balance
router.get('/balance', authenticate, async (req, res) => {
  try {
    const balance = await getBalance(req.user.userId);
    res.json({ success: true, balance });
  } catch (err) {
    console.error('[Routes] /balance error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ── GET /api/game/round/:id ───────────────────────────────────────────────────
// Returns full round detail for provably fair verification (public)
router.get('/round/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const roundResult = await query(
      `SELECT id, server_seed, server_seed_hash, nonce, crash_point, status, created_at, crashed_at
       FROM game_rounds WHERE id = $1`,
      [id],
    );
    if (!roundResult.rows.length) {
      return res.status(404).json({ success: false, message: 'Round not found.' });
    }
    const round = roundResult.rows[0];

    // Only reveal server_seed if crashed
    if (round.status !== 'crashed') delete round.server_seed;

    const betsResult = await query(
      `SELECT u.name, u.phone, b.amount, b.cashout_multiplier, b.profit, b.status
       FROM bets b JOIN users u ON b.user_id = u.id
       WHERE b.round_id = $1 ORDER BY b.created_at`,
      [id],
    );

    res.json({ success: true, round, bets: betsResult.rows });
  } catch (err) {
    console.error('[Routes] /round/:id error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ── POST /api/game/verify ─────────────────────────────────────────────────────
// Provably fair verification — players can verify any past round
// Body: { serverSeed, serverSeedHash, clientSeed, nonce, claimedCrashPoint }
router.post('/verify', (req, res) => {
  const { serverSeed, serverSeedHash, clientSeed, nonce, claimedCrashPoint } = req.body;
  if (!serverSeed || !serverSeedHash || !clientSeed || nonce == null || claimedCrashPoint == null) {
    return res.status(400).json({ success: false, message: 'Missing required fields.' });
  }
  const result = verifyCrashPoint(
    serverSeed,
    serverSeedHash,
    clientSeed,
    Number(nonce),
    Number(claimedCrashPoint),
  );
  res.json({ success: true, ...result });
});

module.exports = router;
