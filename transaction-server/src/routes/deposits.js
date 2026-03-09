const express = require('express');
const jwt     = require('jsonwebtoken');
const { query, pool } = require('../config/db');

const router = express.Router();

// ── User JWT middleware ───────────────────────────────────────────────────────
function authenticateUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

// ── Admin JWT middleware ──────────────────────────────────────────────────────
function authenticateAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (payload.role !== 'admin') return res.status(403).json({ success: false, message: 'Forbidden.' });
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

// ── POST /api/txn/deposit ─────────────────────────────────────────────────────
// User submits their UTR after completing UPI payment.
// Inserts a pending deposit_request. Balance is credited by the webhook
// when the bank SMS arrives and UTR is matched.
router.post('/deposit', authenticateUser, async (req, res) => {
  const { utr, amount } = req.body;
  const userId = req.user.userId;

  if (!utr || typeof utr !== 'string' || utr.trim().length < 6) {
    return res.status(400).json({ success: false, message: 'Invalid UTR number.' });
  }
  const amt = parseFloat(amount);
  if (!amt || amt <= 0 || !isFinite(amt)) {
    return res.status(400).json({ success: false, message: 'Invalid amount.' });
  }

  const cleanUtr = utr.trim().toUpperCase();

  try {
    const result = await query(
      `INSERT INTO deposit_requests (user_id, amount, utr)
       VALUES ($1, $2, $3)
       RETURNING id, utr, amount, status, created_at`,
      [userId, amt, cleanUtr],
    );
    res.json({ success: true, deposit: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      // Unique violation on UTR — already submitted
      return res.status(409).json({ success: false, message: 'This UTR has already been submitted.' });
    }
    console.error('[deposit] error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ── GET /api/txn/deposits ─────────────────────────────────────────────────────
// Admin: list all deposit requests (newest first, limit 100).
router.get('/deposits', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT dr.id, dr.utr, dr.amount, dr.status, dr.created_at, dr.matched_at,
              u.name AS user_name, u.phone AS user_phone
       FROM deposit_requests dr
       JOIN users u ON u.id = dr.user_id
       ORDER BY dr.created_at DESC
       LIMIT 100`,
    );
    res.json({ success: true, deposits: result.rows });
  } catch (err) {
    console.error('[deposits list] error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

module.exports = router;
