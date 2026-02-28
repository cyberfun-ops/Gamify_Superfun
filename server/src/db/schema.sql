-- Run this once against your PostgreSQL database:
--   psql -U postgres -d gamify_auth -f src/db/schema.sql
--
-- To create the database first:
--   psql -U postgres -c "CREATE DATABASE gamify_auth;"

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100),
  phone       VARCHAR(20) UNIQUE NOT NULL,
  is_verified BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── OTPs ──────────────────────────────────────────────────────
-- Each row is one OTP send attempt.
-- otp_hash: bcrypt hash of the 6-digit code.
-- attempts: how many wrong guesses have been made against this row.
-- used: set to true once successfully verified (single-use).
CREATE TABLE IF NOT EXISTS otps (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      VARCHAR(20) NOT NULL,
  otp_hash   VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INT         NOT NULL DEFAULT 0,
  used       BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otps_phone ON otps (phone);
CREATE INDEX IF NOT EXISTS idx_otps_phone_created ON otps (phone, created_at DESC);
