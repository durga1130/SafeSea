const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'safesea-dev-secret-change-me';

function sign(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, email: user.email },
    SECRET,
    { expiresIn: '7d' }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

function verifyToken(token) {
  try { return jwt.verify(token, SECRET); } catch (e) { return null; }
}

module.exports = { sign, auth, requireAdmin, verifyToken, SECRET };
