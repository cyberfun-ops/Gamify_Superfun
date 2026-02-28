const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { query } = require('../config/db');
const { sendSMS } = require('../config/twilio');

// ── Constants ─────────────────────────────────────────────────
const OTP_LENGTH      = 6;
const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 3;     // wrong guesses before the OTP is locked
const MAX_SENDS_PER_WINDOW = 3; // OTPs sent per phone per 10-minute window
const BCRYPT_ROUNDS   = 10;
const E164_REGEX      = /^\+[1-9]\d{7,14}$/;

// ── Helpers ───────────────────────────────────────────────────

/** Generate a cryptographically random N-digit numeric OTP string */
function generateOtp(length = OTP_LENGTH) {
  const max = Math.pow(10, length);
  const raw = crypto.randomInt(0, max);
  return String(raw).padStart(length, '0');
}

/** Standardised error helper */
function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

// ── Controllers ───────────────────────────────────────────────

/**
 * POST /auth/send-otp
 * Body: { phone: "+911234567890" }
 */
async function sendOtp(req, res) {
  const { phone } = req.body;

  // ── Validate ──
  if (!phone || typeof phone !== 'string') {
    return fail(res, 400, 'phone is required.');
  }
  const normalized = phone.trim();
  if (!E164_REGEX.test(normalized)) {
    return fail(res, 400, 'phone must be in E.164 format, e.g. +911234567890');
  }

  try {
    // ── Rate-limit: count OTPs sent in last 10 min ──
    const windowStart = new Date(Date.now() - OTP_TTL_MINUTES * 60 * 1000);
    const { rows: recent } = await query(
      `SELECT COUNT(*) AS cnt
         FROM otps
        WHERE phone = $1
          AND created_at >= $2`,
      [normalized, windowStart]
    );
    if (parseInt(recent[0].cnt, 10) >= MAX_SENDS_PER_WINDOW) {
      return fail(
        res, 429,
        `Too many OTP requests. Please wait ${OTP_TTL_MINUTES} minutes before trying again.`
      );
    }

    // ── Generate & hash OTP ──
    const otp     = generateOtp();
    const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // ── Persist ──
    await query(
      `INSERT INTO otps (phone, otp_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [normalized, otpHash, expiresAt]
    );

    // ── Send SMS ──
    await sendSMS(
      normalized,
      `Your Gamify verification code is: ${otp}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share it with anyone.`
    );

    return res.json({ success: true, message: 'OTP sent successfully.' });
  } catch (err) {
    console.error('[sendOtp] Error:', err.message);
    return fail(res, 500, 'Failed to send OTP. Please try again.');
  }
}

/**
 * POST /auth/verify-otp
 * Body (sign-in): { phone, otp }
 * Body (sign-up):  { phone, otp, name }
 */
async function verifyOtp(req, res) {
  const { phone, otp, name } = req.body;

  // ── Validate inputs ──
  if (!phone || typeof phone !== 'string') {
    return fail(res, 400, 'phone is required.');
  }
  if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
    return fail(res, 400, 'otp must be a 6-digit number.');
  }

  const normalized = phone.trim();
  if (!E164_REGEX.test(normalized)) {
    return fail(res, 400, 'phone must be in E.164 format, e.g. +911234567890');
  }

  try {
    // ── Fetch latest valid OTP record ──
    const { rows } = await query(
      `SELECT id, otp_hash, expires_at, attempts, used
         FROM otps
        WHERE phone = $1
          AND used = false
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1`,
      [normalized]
    );

    if (rows.length === 0) {
      return fail(res, 400, 'OTP has expired or was not found. Please request a new one.');
    }

    const record = rows[0];

    // ── Check attempt cap ──
    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      // Mark as used so it can't be retried
      await query(`UPDATE otps SET used = true WHERE id = $1`, [record.id]);
      return fail(res, 429, 'Too many incorrect attempts. Please request a new OTP.');
    }

    // ── Increment attempt counter ──
    await query(
      `UPDATE otps SET attempts = attempts + 1 WHERE id = $1`,
      [record.id]
    );

    // ── Verify OTP ──
    const isValid = await bcrypt.compare(otp.trim(), record.otp_hash);
    if (!isValid) {
      const attemptsLeft = MAX_OTP_ATTEMPTS - (record.attempts + 1);
      return fail(
        res, 400,
        attemptsLeft > 0
          ? `Incorrect OTP. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.`
          : 'Incorrect OTP. No attempts remaining — please request a new OTP.'
      );
    }

    // ── Invalidate the OTP (single-use) ──
    await query(`UPDATE otps SET used = true WHERE id = $1`, [record.id]);

    // ── Upsert user ──
    // If sign-up (name provided) → create or update name
    // If sign-in (no name) → just mark verified
    const trimmedName = name && typeof name === 'string' ? name.trim() : null;

    const { rows: userRows } = await query(
      `INSERT INTO users (phone, name, is_verified)
       VALUES ($1, $2, true)
       ON CONFLICT (phone) DO UPDATE
         SET is_verified = true,
             name        = COALESCE(NULLIF(EXCLUDED.name, ''), users.name),
             updated_at  = NOW()
       RETURNING id, name, phone, is_verified, created_at`,
      [normalized, trimmedName]
    );

    const user = userRows[0];

    // ── Issue JWT ──
    const token = jwt.sign(
      { userId: user.id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d', algorithm: 'HS256' }
    );

    return res.json({
      success: true,
      token,
      user: {
        id:    user.id,
        name:  user.name,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error('[verifyOtp] Error:', err.message);
    return fail(res, 500, 'Verification failed. Please try again.');
  }
}

module.exports = { sendOtp, verifyOtp };
