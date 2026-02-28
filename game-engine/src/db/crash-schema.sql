-- ── Crash Game Schema ────────────────────────────────────────────────────────
-- Apply AFTER the auth schema (users table must exist).
-- Run once: psql -U postgres -d gamify_auth -f crash-schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Balances (user wallet) ────────────────────────────────────────────────────
-- Each user starts with 1000 credits when their row is first created.
CREATE TABLE IF NOT EXISTS balances (
  user_id    UUID          PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  amount     DECIMAL(18,8) NOT NULL DEFAULT 1000 CHECK (amount >= 0),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Game Rounds ───────────────────────────────────────────────────────────────
-- server_seed_hash is published BEFORE the round starts (provably fair).
-- server_seed is revealed AFTER the round ends.
CREATE TABLE IF NOT EXISTS game_rounds (
  id               BIGSERIAL     PRIMARY KEY,
  server_seed      VARCHAR(64)   NOT NULL,
  server_seed_hash VARCHAR(64)   NOT NULL,
  nonce            BIGINT        NOT NULL,
  crash_point      DECIMAL(10,2) NOT NULL,
  status           VARCHAR(20)   NOT NULL DEFAULT 'betting',
  started_at       TIMESTAMPTZ,
  crashed_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rounds_status  ON game_rounds(status);
CREATE INDEX IF NOT EXISTS idx_rounds_created ON game_rounds(created_at DESC);

-- ── Bets ──────────────────────────────────────────────────────────────────────
-- One bet per user per round (enforced by UNIQUE constraint).
-- auto_cashout: if set, server auto-cashes out when multiplier reaches this value.
-- cashout_multiplier / profit are filled in when the bet resolves.
CREATE TABLE IF NOT EXISTS bets (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID          NOT NULL REFERENCES users(id),
  round_id           BIGINT        NOT NULL REFERENCES game_rounds(id),
  amount             DECIMAL(18,8) NOT NULL CHECK (amount > 0),
  auto_cashout       DECIMAL(10,2),
  cashout_multiplier DECIMAL(10,2),
  profit             DECIMAL(18,8),
  status             VARCHAR(20)   NOT NULL DEFAULT 'active',
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  cashed_out_at      TIMESTAMPTZ,
  UNIQUE(user_id, round_id)
);

CREATE INDEX IF NOT EXISTS idx_bets_round  ON bets(round_id);
CREATE INDEX IF NOT EXISTS idx_bets_user   ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);

-- ── Transactions (audit trail) ────────────────────────────────────────────────
-- type: bet | win | refund | deposit
-- idempotency_key prevents duplicate processing on network retries.
CREATE TABLE IF NOT EXISTS transactions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES users(id),
  type            VARCHAR(20)   NOT NULL,
  amount          DECIMAL(18,8) NOT NULL,
  balance_before  DECIMAL(18,8) NOT NULL,
  balance_after   DECIMAL(18,8) NOT NULL,
  reference_id    UUID,
  idempotency_key VARCHAR(64)   UNIQUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at DESC);
