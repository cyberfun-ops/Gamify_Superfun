const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const gameEngine = require('../services/gameEngine');

/**
 * Set up Socket.io with JWT authentication middleware and game event handlers.
 */
function setupSocket(io) {
  // ── Auth middleware ────────────────────────────────────────────────────────
  // Client must send token in socket.handshake.auth.token
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required.'));

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      // Fetch user info from DB
      const result = await query(
        'SELECT id, name, phone FROM users WHERE id = $1',
        [payload.userId],
      );
      if (!result.rows.length) return next(new Error('User not found.'));

      const user = result.rows[0];
      socket.userId   = user.id;
      socket.username = user.name || user.phone; // fall back to phone if no name
      next();
    } catch {
      next(new Error('Invalid or expired token.'));
    }
  });

  // ── Connection handler ─────────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    console.log(`[Socket] Connected: ${socket.userId} (${socket.username})`);

    // Join a private room so we can notify this user individually (e.g. balance updates)
    socket.join(`user:${socket.userId}`);

    // Send current game state immediately on connection
    socket.emit('game:state', gameEngine.getCurrentState());

    // ── bet:place ──────────────────────────────────────────────────────────
    socket.on('bet:place', async (data, callback) => {
      const cb = typeof callback === 'function' ? callback : () => {};
      const amount = Number(data?.amount);
      const autoCashout = data?.autoCashout ? Number(data.autoCashout) : null;

      if (!amount || amount <= 0) return cb({ success: false, message: 'Invalid bet amount.' });
      if (autoCashout !== null && autoCashout < 1.01) {
        return cb({ success: false, message: 'Auto-cashout must be at least 1.01x.' });
      }

      const result = await gameEngine.placeBet(
        socket.userId,
        socket.username,
        amount,
        autoCashout,
      );

      if (result.success) {
        cb({ success: true, newBalance: result.newBalance });
      } else {
        cb({ success: false, message: result.error || 'Failed to place bet.' });
      }
    });

    // ── bet:cashout ────────────────────────────────────────────────────────
    socket.on('bet:cashout', async (_, callback) => {
      const cb = typeof callback === 'function' ? callback : () => {};
      const result = await gameEngine.cashout(socket.userId);
      if (result.success) {
        cb({
          success:           true,
          cashoutMultiplier: result.multiplier,
          payout:            result.winAmount,
          newBalance:        result.newBalance,
        });
      } else {
        cb({ success: false, message: result.error || 'Failed to cash out.' });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${socket.userId} — ${reason}`);
    });
  });
}

module.exports = { setupSocket };
