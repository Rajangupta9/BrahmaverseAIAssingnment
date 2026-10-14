/**
 * Unit tests and property-based tests for authenticate middleware
 * (src/middleware/auth.js)
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import fc from 'fast-check';

// ── mock env before any other imports that pull it transitively ──────────────
jest.unstable_mockModule('../config/env.js', () => ({
  env: {
    jwtAccessSecret: 'test-access-secret',
    jwtRefreshSecret: 'test-refresh-secret',
    jwtAccessExpiry: '15m',
    jwtRefreshExpiry: '7d',
  },
}));

const { authenticate } = await import('./auth.js');
const { signAccessToken } = await import('../utils/jwt.js');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeReq(authHeader) {
  return { headers: authHeader !== undefined ? { authorization: authHeader } : {} };
}

function makeRes() {
  return {};
}

function makeNext() {
  return jest.fn();
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('authenticate middleware', () => {
  describe('Requirement 13.2 — missing Authorization header → 401', () => {
    test('no Authorization header calls next(AppError(401))', () => {
      const req = makeReq(undefined);
      const next = makeNext();
      authenticate(req, makeRes(), next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('Authorization header required.');
    });

    test('empty Authorization header calls next(AppError(401))', () => {
      const req = makeReq('');
      const next = makeNext();
      authenticate(req, makeRes(), next);

      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
    });
  });

  describe('Requirement 13.3 — malformed / expired token → 401', () => {
    test('header without Bearer prefix calls next(AppError(401))', () => {
      const req = makeReq('Token abc123');
      const next = makeNext();
      authenticate(req, makeRes(), next);

      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('Authorization header required.');
    });

    test('malformed token (not a valid JWT) calls next(AppError(401))', () => {
      const req = makeReq('Bearer not.a.valid.jwt');
      const next = makeNext();
      authenticate(req, makeRes(), next);

      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('Invalid or expired access token.');
    });

    test('Bearer with empty token string calls next(AppError(401))', () => {
      const req = makeReq('Bearer ');
      const next = makeNext();
      authenticate(req, makeRes(), next);

      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
    });
  });

  describe('Requirement 13.4 — valid token attaches decoded payload to req.user', () => {
    test('valid access token → req.user populated and next() called without error', () => {
      const payload = { id: 'user-uuid-123', role: 'counselor' };
      const token = signAccessToken(payload);

      const req = makeReq(`Bearer ${token}`);
      const next = makeNext();
      authenticate(req, makeRes(), next);

      expect(next).toHaveBeenCalledWith(); // called with no args → no error
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('user-uuid-123');
      expect(req.user.role).toBe('counselor');
    });

    test('decoded payload includes iat and exp fields', () => {
      const token = signAccessToken({ id: 'abc', role: 'admin' });
      const req = makeReq(`Bearer ${token}`);
      const next = makeNext();
      authenticate(req, makeRes(), next);

      expect(req.user.iat).toBeDefined();
      expect(req.user.exp).toBeDefined();
    });
  });
});

// errorHandler is safe to import here — it has no env dependency.
const { errorHandler } = await import('../utils/errors.js');

// ── Property 17: Protected Endpoints Reject Missing or Invalid Tokens ────────
//
// Validates: Requirements 13.1, 13.2, 13.3
//
// Builds a minimal Express app with `authenticate` protecting a GET /protected
// route and `errorHandler` as the last middleware. Uses fast-check to generate
// arbitrary strings and asserts the middleware always returns 401 without
// executing the handler.

describe('Property 17: Protected Endpoints Reject Missing or Invalid Tokens', () => {
  /** @type {import('express').Express} */
  let app;
  let handlerCalled;

  beforeAll(() => {
    handlerCalled = false;

    // Minimal Express app — no DB, no real router, just the middleware chain.
    app = express();

    app.get('/protected', authenticate, (req, res) => {
      handlerCalled = true;
      res.json({ ok: true });
    });

    // errorHandler must be the last middleware.
    app.use(errorHandler);
  });

  beforeEach(() => {
    handlerCalled = false;
  });

  // ── 13.2 — Missing Authorization header always returns 401 ─────────────────
  test('Req 13.2 — missing Authorization header → 401', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(handlerCalled).toBe(false);
  });

  // ── 13.2 — Arbitrary non-Bearer Authorization values always return 401 ──────
  test('Req 13.2 — arbitrary non-Bearer Authorization values → 401', async () => {
    /**
     * **Validates: Requirements 13.1, 13.2**
     *
     * Property: For any string that does not start with "Bearer ", the
     * middleware must return 401 and must not invoke the route handler.
     */
    await fc.assert(
      fc.asyncProperty(
        // Generate strings that don't start with "Bearer " (or are empty).
        fc.oneof(
          fc.constant(''),
          fc.string({ minLength: 1 }).filter((s) => !s.startsWith('Bearer ')),
        ),
        async (headerValue) => {
          handlerCalled = false;
          const res = await request(app)
            .get('/protected')
            .set('Authorization', headerValue);

          expect(res.status).toBe(401);
          expect(res.body).toHaveProperty('error');
          expect(handlerCalled).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  // ── 13.3 — Arbitrary malformed bearer strings always return 401 ─────────────
  test('Req 13.3 — arbitrary malformed bearer strings → 401', async () => {
    /**
     * **Validates: Requirements 13.1, 13.3**
     *
     * Property: For any string used as the token portion of a
     * "Bearer <token>" header that is NOT a validly signed access token,
     * the middleware must return 401 and must not invoke the route handler.
     */
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary token portions — random strings, empty, near-JWT
        // look-alikes, etc. None will have a valid signature.
        fc.oneof(
          fc.constant(''),
          fc.string(),
          // Near-JWT: three base64url segments joined by dots but wrong signature
          fc.tuple(
            fc.string({ minLength: 1 }),
            fc.string({ minLength: 1 }),
            fc.string({ minLength: 1 }),
          ).map(([a, b, c]) => `${a}.${b}.${c}`),
        ),
        async (tokenPart) => {
          handlerCalled = false;
          const res = await request(app)
            .get('/protected')
            .set('Authorization', `Bearer ${tokenPart}`);

          expect(res.status).toBe(401);
          expect(res.body).toHaveProperty('error');
          expect(handlerCalled).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
