const express    = require('express');
const rateLimit  = require('express-rate-limit');
const { sendOtp, verifyOtp } = require('../controllers/authController');

const router = express.Router();

// ── Per-endpoint rate limiters ────────────────────────────────

/** 5 OTP requests per IP per 10 minutes */
const sendOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP requests from this IP. Try again later.' },
});

/** 10 verify attempts per IP per 10 minutes */
const verifyOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verify attempts from this IP. Try again later.' },
});

// ── Routes ────────────────────────────────────────────────────
router.post('/send-otp',   sendOtpLimiter,   sendOtp);
router.post('/verify-otp', verifyOtpLimiter, verifyOtp);

module.exports = router;
