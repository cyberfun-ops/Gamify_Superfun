const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authorization token required.' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.admin = payload; // { adminId, username, role }
    next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError' ? 'Session expired. Please sign in again.' :
      'Invalid token.';
    return res.status(401).json({ success: false, message });
  }
}

module.exports = authenticate;
