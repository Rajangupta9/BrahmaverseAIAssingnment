/**
 * AppError — operational error with an associated HTTP status code.
 * Throw this for known, expected error conditions (4xx, known 5xx).
 * The global errorHandler will pass these through with their status intact.
 */
export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Express 4-argument error-handling middleware.
 *
 * - AppError instances are forwarded as-is with their status code.
 * - All other errors are logged server-side and returned as a generic 500;
 *   stack traces are never exposed to clients.
 *
 * Register this as the last middleware in app.js:
 *   app.use(errorHandler);
 */
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  // Unknown / unexpected errors — log internally, never expose details
  console.error(err);
  return res.status(500).json({ error: 'An unexpected error occurred.' });
}
