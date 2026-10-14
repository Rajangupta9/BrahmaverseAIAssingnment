import { AppError } from '../utils/errors.js';

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return next(new AppError('Forbidden: insufficient permissions.', 403));
    }
    next();
  };
}
