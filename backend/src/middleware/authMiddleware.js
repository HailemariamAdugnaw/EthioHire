const { verifyToken } = require('../utils/auth');
const { fail } = require('../utils/response');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return fail(res, 401, 'Missing token');

  try {
    req.user = verifyToken(header.replace('Bearer ', ''));
    return next();
  } catch (_error) {
    return fail(res, 401, 'Invalid token');
  }
}

module.exports = { authMiddleware };
