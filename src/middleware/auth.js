import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from '../utils/errors.js';

/**
 * authenticate — JWT authentication middleware.
 *
 * Validates the `Authorization: Bearer <token>` header, verifies the access
 * token, and attaches the decoded payload ({ id, role, iat, exp }) to
 * `req.user`. Passes an AppError(401) to next() for any of:
 *   - missing or malformed Authorization header
 *   - invalid token signature
 *   - expired token
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authorization header required.', 401));
  }
  const token = authHeader.split(' ')[1];
  try {
    req.user = verifyAccessToken(token); // { id, role, iat, exp }
    next();
  } catch {
    next(new AppError('Invalid or expired access token.', 401));
  }
}
