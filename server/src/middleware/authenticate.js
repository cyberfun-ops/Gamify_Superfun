const jwt = require('jsonwebtoken');

/**
 * Express middleware that validates a Bearer JWT.
 * Attaches the decoded payload to req.user on success.
 *
 * Usage:
 *   const authenticate = require('./middleware/authenticate');
 *   router.get('/protected', authenticate, handler);
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authorization token required.' });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = payload; // { userId, phone, iat, exp }
    next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError' ? 'Session expired. Please sign in again.' :
      'Invalid token.';
    return res.status(401).json({ success: false, message });
  }
}

module.exports = authenticate;
