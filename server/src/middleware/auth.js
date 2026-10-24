import { verifyToken } from '../utils/token.js';
import { User } from '../models/User.js';
import { httpError, asyncHandler } from '../utils/httpError.js';

export const protect = asyncHandler(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) throw httpError(401, 'Not authenticated');
  let payload;
  try { payload = verifyToken(h.slice(7)); } catch { throw httpError(401, 'Session expired, please log in again'); }
  if (payload.purpose) throw httpError(401, 'Invalid token type');
  const user = await User.findById(payload.id);
  if (!user) throw httpError(401, 'Account no longer exists');
  if ((payload.v || 0) !== (user.tokenVersion || 0)) throw httpError(401, 'You were signed out. Please log in again.');
  req.user = user;
  next();
});

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(httpError(403, 'You do not have access to this area'));
