const crypto = require('crypto');

/**
 * Generate a chain of N server seeds for provably fair gaming.
 * Each seed in the chain is the SHA-256 hash of the next seed.
 * seeds[0] is used for round 1; its hash (seeds[1]) was the "published hash" before round 1.
 *
 * Usage: generate once at startup, store in Redis as a list.
 */
function generateSeedChain(count = 1000) {
  const seeds = [];
  let current = crypto.randomBytes(32).toString('hex');
  for (let i = 0; i < count; i++) {
    seeds.unshift(current); // add to front: seeds[0] is used first
    current = crypto.createHash('sha256').update(current).digest('hex');
  }
  return seeds;
}

/**
 * SHA-256 hash of a seed — this is published BEFORE the round starts.
 */
function hashSeed(seed) {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

// Maximum multiplier the game will ever reach — rounds that would go higher
// are capped here. Verification still works because both sides apply this cap.
const MAX_CRASH_POINT = 100;

/**
 * Calculate the crash point for a round.
 * Uses HMAC-SHA256 with house edge of 1%.
 * Returns a number in [1.00, MAX_CRASH_POINT].
 */
function calculateCrashPoint(serverSeed, clientSeed, nonce) {
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest('hex');

  // Use first 52 bits of entropy
  const h = parseInt(hash.slice(0, 13), 16);
  const houseEdge = 0.01; // 1% house edge
  const e = Math.pow(2, 52);

  // Formula from the design doc — result ranges from 1.00 to theoretically infinite
  const raw =
    Math.max(1.0, Math.floor(((100 * e - h) / (e - h)) / 100 * (1 - houseEdge) * 100) / 100);

  return Math.min(raw, MAX_CRASH_POINT);
}

/**
 * Verify that a claimed crash point matches the seeds.
 * Players call this after a round to confirm the outcome was predetermined.
 */
function verifyCrashPoint(serverSeed, serverSeedHash, clientSeed, nonce, claimedCrashPoint) {
  const computedHash = hashSeed(serverSeed);
  if (computedHash !== serverSeedHash) {
    return { valid: false, reason: 'Server seed does not match published hash.' };
  }
  const expected = calculateCrashPoint(serverSeed, clientSeed, nonce);
  const valid = Math.abs(expected - claimedCrashPoint) < 0.01;
  return { valid, expectedCrashPoint: expected, claimedCrashPoint };
}

module.exports = { generateSeedChain, hashSeed, calculateCrashPoint, verifyCrashPoint };
