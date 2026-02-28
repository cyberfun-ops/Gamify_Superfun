const { pool } = require('../config/db');
const { getRedis } = require('../config/redis');
const { generateSeedChain, hashSeed, calculateCrashPoint } = require('./provablyFair');
const { deductBalance, creditBalance } = require('./walletService');

const HOUSE_CLIENT_SEED = 'gamify-superfun-house';
const GROWTH_RATE = 0.07;
const BETTING_DURATION_MS = 10_000;
const STARTING_DURATION_MS = 3_000;
const CRASHED_DURATION_MS = 10_000;
const TICK_INTERVAL_MS = 50;

let io = null;
let nonce = 0;

// In-memory seed chain -- Redis is optional write-through, never a blocker
let seedChainMemory = [];

function ensureSeedChainMemory() {
  if (seedChainMemory.length < 10) {
    console.log('[GameEngine] Generating new seed chain (1000 seeds)...');
    seedChainMemory = generateSeedChain(1000);
    console.log('[GameEngine] Seed chain ready.');
  }
}

function popNextSeed() {
  ensureSeedChainMemory();
  return seedChainMemory.shift();
}

let currentRound = {
  id: null,
  status: 'idle',
  serverSeed: null,
  serverSeedHash: null,
  crashPoint: null,
  startedAt: null,
  multiplier: 1.0,
  bets: new Map(),
};

let tickInterval = null;

function init(socketIoInstance) {
  io = socketIoInstance;
}

// Redis: fire-and-forget, errors silently swallowed
function pushStateToRedis() {
  try {
    getRedis().hset('game:current',
      'id',             String(currentRound.id ?? ''),
      'status',         currentRound.status,
      'multiplier',     String(currentRound.multiplier.toFixed(2)),
      'startedAt',      currentRound.startedAt ? String(currentRound.startedAt.getTime()) : '',
      'serverSeedHash', currentRound.serverSeedHash ?? '',
      'crashPoint',     currentRound.status === 'crashed' ? String(currentRound.crashPoint) : '',
    ).catch(() => {});
  } catch (_) {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function broadcastState() {
  if (!io) return;
  const betsList = Array.from(currentRound.bets.values()).map((b) => ({
    userId:            b.userId,
    username:          b.username,
    amount:            b.amount,
    cashedOut:         b.cashedOut,
    cashoutMultiplier: b.cashoutMultiplier ?? null,
  }));
  io.emit('game:state', {
    id:             currentRound.id,
    status:         currentRound.status,
    multiplier:     parseFloat(currentRound.multiplier.toFixed(2)),
    serverSeedHash: currentRound.serverSeedHash,
    crashPoint:     currentRound.status === 'crashed' ? currentRound.crashPoint : undefined,
    bettingEndsAt:  currentRound.bettingEndsAt ?? undefined,
    bets:           betsList,
  });
}

function broadcastBetsList() {
  if (!io) return;
  const list = Array.from(currentRound.bets.values()).map((b) => ({
    userId:            b.userId,
    username:          b.username,
    amount:            b.amount,
    cashedOut:         b.cashedOut,
    cashoutMultiplier: b.cashoutMultiplier ?? null,
  }));
  io.emit('bets:list', list);
}

// ── Phase: BETTING ─────────────────────────────────────────────────────────────

async function startBettingPhase() {
  const serverSeed   = popNextSeed();
  const serverSeedHash = hashSeed(serverSeed);
  nonce += 1;
  const crashPoint   = calculateCrashPoint(serverSeed, HOUSE_CLIENT_SEED, nonce);

  // Insert round into DB
  const dbClient = await pool.connect();
  let roundId;
  try {
    const result = await dbClient.query(
      `INSERT INTO game_rounds (server_seed, server_seed_hash, nonce, crash_point, status)
       VALUES ($1, $2, $3, $4, 'betting') RETURNING id`,
      [serverSeed, serverSeedHash, nonce, crashPoint]
    );
    roundId = result.rows[0].id;
  } finally {
    dbClient.release();
  }

  currentRound = {
    id:             roundId,
    status:         'betting',
    serverSeed,
    serverSeedHash,
    crashPoint,
    startedAt:      null,
    multiplier:     1.0,
    bets:           new Map(),
    bettingEndsAt:  Date.now() + BETTING_DURATION_MS,
  };

  pushStateToRedis();
  broadcastState();
  console.log(`[GameEngine] Round ${roundId} — BETTING (crash @ ${crashPoint}x)`);

  await sleep(BETTING_DURATION_MS);
  await startStartingPhase();
}

// ── Phase: STARTING ────────────────────────────────────────────────────────────

async function startStartingPhase() {
  currentRound.status = 'starting';
  pushStateToRedis();
  broadcastState();
  console.log(`[GameEngine] Round ${currentRound.id} — STARTING`);

  await sleep(STARTING_DURATION_MS);
  await startRunningPhase();
}

// ── Phase: RUNNING ─────────────────────────────────────────────────────────────

async function startRunningPhase() {
  currentRound.status    = 'running';
  currentRound.startedAt = new Date();
  currentRound.multiplier = 1.0;

  // Update DB
  await pool.query(
    `UPDATE game_rounds SET status = 'running', started_at = $1 WHERE id = $2`,
    [currentRound.startedAt, currentRound.id]
  );

  pushStateToRedis();
  broadcastState();
  console.log(`[GameEngine] Round ${currentRound.id} — RUNNING`);

  return new Promise((resolve) => {
    tickInterval = setInterval(async () => {
      const elapsed = (Date.now() - currentRound.startedAt.getTime()) / 1000;
      currentRound.multiplier = parseFloat(
        Math.pow(Math.E, GROWTH_RATE * elapsed).toFixed(2)
      );

      // Check auto-cashouts
      for (const [userId, bet] of currentRound.bets) {
        if (
          !bet.cashedOut &&
          bet.autoCashout &&
          currentRound.multiplier >= bet.autoCashout
        ) {
          await processCashout(userId, currentRound.multiplier, true).catch(console.error);
        }
      }

      if (io) {
        io.emit('game:tick', {
          multiplier: currentRound.multiplier,
          elapsed:    parseFloat(elapsed.toFixed(2)),
        });
      }

      // Check crash
      if (currentRound.multiplier >= currentRound.crashPoint) {
        clearInterval(tickInterval);
        tickInterval = null;
        await startCrashedPhase();
        resolve();
      }
    }, TICK_INTERVAL_MS);
  });
}

// ── Phase: CRASHED ─────────────────────────────────────────────────────────────

async function startCrashedPhase() {
  currentRound.status    = 'crashed';
  currentRound.multiplier = currentRound.crashPoint;
  const crashedAt         = new Date();

  // Mark all still-active bets as lost
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    for (const [, bet] of currentRound.bets) {
      if (!bet.cashedOut) {
        await dbClient.query(
          `UPDATE bets SET status = 'lost' WHERE id = $1`,
          [bet.betId]
        );
      }
    }

    await dbClient.query(
      `UPDATE game_rounds SET status = 'crashed', crashed_at = $1 WHERE id = $2`,
      [crashedAt, currentRound.id]
    );

    await dbClient.query('COMMIT');
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('[GameEngine] DB error in CRASHED phase:', err.message);
  } finally {
    dbClient.release();
  }

  pushStateToRedis();

  if (io) {
    io.emit('game:crash', {
      crashPoint:  currentRound.crashPoint,
      serverSeed:  currentRound.serverSeed,
      roundId:     currentRound.id,
    });
  }

  console.log(`[GameEngine] Round ${currentRound.id} — CRASHED @ ${currentRound.crashPoint}x`);

  await sleep(CRASHED_DURATION_MS);
}

// ── Cashout logic (shared by manual + auto-cashout) ───────────────────────────

async function processCashout(userId, multiplier, isAuto = false) {
  const bet = currentRound.bets.get(userId);
  if (!bet || bet.cashedOut) return { success: false, error: 'No active bet or already cashed out' };

  bet.cashedOut         = true;
  bet.cashoutMultiplier = multiplier;
  const winAmount       = parseFloat((bet.amount * multiplier).toFixed(8));
  const profit          = parseFloat((winAmount - bet.amount).toFixed(8));

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    // Credit winnings
    const newBalance = await creditBalance(
      dbClient, userId, winAmount, 'win', bet.betId,
      `cashout:${bet.betId}:${multiplier}`
    );

    // Update bet record
    await dbClient.query(
      `UPDATE bets
         SET status = 'won', cashout_multiplier = $1, profit = $2, cashed_out_at = NOW()
       WHERE id = $3`,
      [multiplier, profit, bet.betId]
    );

    await dbClient.query('COMMIT');

    // Notify user of new balance
    if (io) {
      io.to(`user:${userId}`).emit('balance:update', { balance: newBalance });
    }

    broadcastBetsList();

    console.log(
      `[GameEngine] Cashout — user=${userId} mult=${multiplier}x win=${winAmount} ${isAuto ? '(auto)' : ''}`
    );

    return { success: true, multiplier, winAmount, newBalance };
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('[GameEngine] Cashout error:', err.message);
    // Revert in-memory state on failure
    bet.cashedOut         = false;
    bet.cashoutMultiplier = null;
    return { success: false, error: err.message };
  } finally {
    dbClient.release();
  }
}

// ── Place bet (called from socket handler) ────────────────────────────────────

async function placeBet(userId, username, amount, autoCashout) {
  if (currentRound.status !== 'betting') {
    return { success: false, error: 'Betting is closed' };
  }
  if (currentRound.bets.has(userId)) {
    return { success: false, error: 'Already placed a bet this round' };
  }
  if (!amount || amount <= 0) {
    return { success: false, error: 'Invalid bet amount' };
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    // Deduct balance atomically
    const idempotencyKey = `bet:${userId}:${currentRound.id}`;
    const newBalance = await deductBalance(dbClient, userId, amount, idempotencyKey);

    // Insert bet row
    const betResult = await dbClient.query(
      `INSERT INTO bets (user_id, round_id, amount, auto_cashout, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
      [userId, currentRound.id, amount, autoCashout || null]
    );
    const betId = betResult.rows[0].id;

    await dbClient.query('COMMIT');

    // Store in-memory
    currentRound.bets.set(userId, {
      betId,
      userId,
      username,
      amount,
      autoCashout:      autoCashout || null,
      cashedOut:        false,
      cashoutMultiplier: null,
    });

    // Redis write-through (fire and forget)
    try {
      getRedis().hset(
        `game:${currentRound.id}:bets`,
        userId,
        JSON.stringify({ amount, username, cashedOut: false })
      ).catch(() => {});
    } catch (_) {}

    broadcastBetsList();

    console.log(`[GameEngine] Bet placed — user=${userId} amount=${amount}`);
    return { success: true, betId, newBalance };
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('[GameEngine] placeBet error:', err.message);
    return { success: false, error: err.message };
  } finally {
    dbClient.release();
  }
}

// ── Cashout (called from socket handler) ──────────────────────────────────────

async function cashout(userId) {
  if (currentRound.status !== 'running') {
    return { success: false, error: 'Game is not running' };
  }
  return processCashout(userId, currentRound.multiplier, false);
}

// ── Get current state (for new connections) ───────────────────────────────────

function getCurrentState() {
  return {
    id:             currentRound.id,
    status:         currentRound.status,
    multiplier:     parseFloat(currentRound.multiplier.toFixed(2)),
    serverSeedHash: currentRound.serverSeedHash,
    crashPoint:     currentRound.status === 'crashed' ? currentRound.crashPoint : undefined,
    bettingEndsAt:  currentRound.bettingEndsAt ?? undefined,
    bets: Array.from(currentRound.bets.values()).map((b) => ({
      userId:            b.userId,
      username:          b.username,
      amount:            b.amount,
      cashedOut:         b.cashedOut,
      cashoutMultiplier: b.cashoutMultiplier ?? null,
    })),
  };
}

function hasBet(userId) {
  return currentRound.bets.has(userId);
}

function getActiveBet(userId) {
  return currentRound.bets.get(userId) ?? null;
}

// ── Main game loop ─────────────────────────────────────────────────────────────

async function start() {
  console.log('[GameEngine] Starting game loop...');
  ensureSeedChainMemory();

  // Recover any stuck round from previous run
  try {
    await pool.query(
      `UPDATE game_rounds SET status = 'crashed', crashed_at = NOW()
       WHERE status IN ('betting', 'starting', 'running')`
    );
  } catch (err) {
    console.warn('[GameEngine] Recovery query failed (non-fatal):', err.message);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await startBettingPhase();
    } catch (err) {
      console.error('[GameEngine] Unhandled error in game loop:', err);
      // Brief pause before retrying to avoid tight error loops
      await sleep(2000);
    }
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  init,
  start,
  placeBet,
  cashout,
  getCurrentState,
  hasBet,
  getActiveBet,
};
