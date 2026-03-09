const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

// POST /api/admin/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required.' });
    }

    const result = await query(
      'SELECT id, username, password_hash FROM admin_users WHERE username = $1',
      [username.trim().toLowerCase()]
    );

    const admin = result.rows[0];
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { adminId: admin.id, username: admin.username, role: 'admin' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      success: true,
      token,
      user: { id: admin.id, username: admin.username },
    });
  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/admin/auth/me  (requires JWT)
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, user: req.admin });
});

module.exports = router;
