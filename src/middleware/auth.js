const { verifyToken } = require('../utils/jwt');

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
  }
  const token = header.slice(7);
  try {
    const decoded = verifyToken(token);
    req.user = { id: decoded.sub, email: decoded.email, display_name: decoded.display_name };
    next();
  } catch {
    return res.status(401).json({ success: false, error: { code: 'TOKEN_INVALID' } });
  }
}

module.exports = authMiddleware;
