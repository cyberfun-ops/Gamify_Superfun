const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

// ── Webhook secret auth ───────────────────────────────────────────────────────
function authenticateWebhook(req, res, next) {
  const secret = req.headers['x-webhook-secret'];
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ success: false, message: 'Unauthorized.' });
  }
  next();
}

// ── POST /api/txn/webhook/sms ─────────────────────────────────────────────────
// Called by UroPay (or any SMS-reading app) when the bank SMS arrives.
// Body: { utr: string, amount?: number }
//
// Logic:
//  1. Find a pending deposit_request with matching UTR.
//  2. Optionally validate amount (within ±1 rupee tolerance for rounding).
//  3. Credit the user's balance atomically.
//  4. Record in transactions table.
//  5. Mark deposit_request as approved.
router.post('/sms', authenticateWebhook, async (req, res) => {
  const { utr, amount } = req.body;

  if (!utr || typeof utr !== 'string') {
    return res.status(400).json({ success: false, message: 'utr is required.' });
  }

  const cleanUtr   = utr.trim().toUpperCase();
  const smsAmount  = amount != null ? parseFloat(amount) : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock the matching pending deposit request
    const depResult = await client.query(
      `SELECT id, user_id, amount FROM deposit_requests
       WHERE utr = $1 AND status = 'pending'
       FOR UPDATE`,
      [cleanUtr],
    );

    if (!depResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'No pending deposit found for this UTR.' });
    }

    const dep = depResult.rows[0];

    // 2. Optional amount validation — tolerate ±1 unit for rounding
    if (smsAmount !== null && Math.abs(smsAmount - parseFloat(dep.amount)) > 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Amount mismatch: expected ${dep.amount}, got ${smsAmount}.`,
      });
    }

    // 3. Ensure balance row exists, then lock it
    await client.query(
      `INSERT INTO balances (user_id, amount) VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [dep.user_id],
    );
    const balResult = await client.query(
      `SELECT amount FROM balances WHERE user_id = $1 FOR UPDATE`,
      [dep.user_id],
    );
    const balanceBefore = parseFloat(balResult.rows[0].amount);
    const balanceAfter  = balanceBefore + parseFloat(dep.amount);

    // 4. Credit balance
    await client.query(
      `UPDATE balances SET amount = $1, updated_at = NOW() WHERE user_id = $2`,
      [balanceAfter, dep.user_id],
    );

    // 5. Audit transaction record
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_id)
       VALUES ($1, 'deposit', $2, $3, $4, $5)`,
      [dep.user_id, dep.amount, balanceBefore, balanceAfter, dep.id],
    );

    // 6. Mark deposit as approved
    await client.query(
      `UPDATE deposit_requests SET status = 'approved', matched_at = NOW() WHERE id = $1`,
      [dep.id],
    );

    await client.query('COMMIT');

    console.log(`[webhook] UTR ${cleanUtr} matched → user ${dep.user_id} credited ${dep.amount}`);
    res.json({ success: true, message: 'Deposit approved and balance credited.' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[webhook/sms] error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  } finally {
    client.release();
  }
});

module.exports = router;
