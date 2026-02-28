const { pool } = require('../config/db');

/**
 * Ensure a balance row exists for a user (created on first login/use).
 * Default balance: 1000 credits.
 */
async function ensureBalance(userId) {
  await pool.query(
    `INSERT INTO balances (user_id, amount)
     VALUES ($1, 1000)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

/**
 * Get current balance for a user (creates row if missing).
 */
async function getBalance(userId) {
  await ensureBalance(userId);
  const result = await pool.query(
    'SELECT amount FROM balances WHERE user_id = $1',
    [userId],
  );
  return parseFloat(result.rows[0].amount);
}

/**
 * Deduct `amount` from user balance atomically.
 * Must be called with an active pg client inside a transaction.
 * Throws 'INSUFFICIENT_BALANCE' if funds are not available.
 */
async function deductBalance(dbClient, userId, amount, idempotencyKey) {
  // Lock the row for this transaction
  const bal = await dbClient.query(
    'SELECT amount FROM balances WHERE user_id = $1 FOR UPDATE',
    [userId],
  );

  if (!bal.rows.length) throw new Error('BALANCE_NOT_FOUND');

  const before = parseFloat(bal.rows[0].amount);
  if (before < amount) throw new Error('INSUFFICIENT_BALANCE');

  const after = parseFloat((before - amount).toFixed(8));

  await dbClient.query(
    'UPDATE balances SET amount = $1, updated_at = NOW() WHERE user_id = $2',
    [after, userId],
  );

  await dbClient.query(
    `INSERT INTO transactions
       (user_id, type, amount, balance_before, balance_after, idempotency_key)
     VALUES ($1, 'bet', $2, $3, $4, $5)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [userId, amount, before, after, idempotencyKey],
  );

  return after;
}

/**
 * Credit `amount` to user balance atomically.
 * Must be called with an active pg client inside a transaction.
 */
async function creditBalance(dbClient, userId, amount, type, referenceId, idempotencyKey) {
  const bal = await dbClient.query(
    'SELECT amount FROM balances WHERE user_id = $1 FOR UPDATE',
    [userId],
  );

  const before = bal.rows.length ? parseFloat(bal.rows[0].amount) : 0;
  const after = parseFloat((before + amount).toFixed(8));

  await dbClient.query(
    'UPDATE balances SET amount = $1, updated_at = NOW() WHERE user_id = $2',
    [after, userId],
  );

  await dbClient.query(
    `INSERT INTO transactions
       (user_id, type, amount, balance_before, balance_after, reference_id, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [userId, type, amount, before, after, referenceId, idempotencyKey],
  );

  return after;
}

module.exports = { ensureBalance, getBalance, deductBalance, creditBalance };
