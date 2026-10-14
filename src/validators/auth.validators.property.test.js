/**
 * Property 2: Invalid Role Values Are Rejected
 *
 * For any string value submitted as `role` that is not `"counselor"` or
 * `"admin"`, the system SHALL return a `400 Bad Request` response from
 * `POST /auth/register`.
 *
 * Validates: Requirements 1.4
 *
 * Strategy
 * --------
 * Build a minimal Express app that wires `registerValidators` and `validate`
 * in front of a stub handler — no real auth service or database is involved.
 * This isolates the test entirely to the validation layer.
 *
 * 1. Use fast-check to generate arbitrary strings that are not "counselor"
 *    or "admin".
 * 2. Submit each generated string as the `role` field alongside an otherwise
 *    valid register body.
 * 3. Assert the response is always 400 and the stub handler is never reached.
 *
 * Baseline tests confirm that the two valid role values ("counselor" and
 * "admin") do pass validation and reach the stub handler.
 */

import fc from 'fast-check';
import express from 'express';
import request from 'supertest';
import { registerValidators } from './auth.validators.js';
import { validate } from '../middleware/validate.js';
import { errorHandler } from '../utils/errors.js';

// ── Minimal test app ──────────────────────────────────────────────────────────

/**
 * Builds a minimal Express app with:
 *   POST /register → registerValidators → validate → stub handler
 *   errorHandler at the end
 *
 * Returns the app and helpers for inspecting whether the stub handler ran.
 */
function buildApp() {
  const app = express();
  app.use(express.json());

  let handlerCalled = false;

  app.post(
    '/register',
    ...registerValidators,
    validate,
    (_req, res) => {
      handlerCalled = true;
      res.status(200).json({ ok: true });
    },
  );

  app.use(errorHandler);

  return {
    app,
    wasHandlerCalled: () => handlerCalled,
    resetHandlerFlag: () => { handlerCalled = false; },
  };
}

// ── Valid body helper ─────────────────────────────────────────────────────────

/**
 * Returns an otherwise-valid register body with `role` replaced by the
 * provided value.
 */
function bodyWithRole(role) {
  return {
    name: 'Test User',
    email: 'testuser@example.com',
    password: 'validpass123',
    role,
  };
}

// ── Arbitraries ───────────────────────────────────────────────────────────────

/**
 * Generates arbitrary strings that are not "counselor" or "admin".
 * This covers the full space of invalid role values: random words, empty
 * strings (which will also fail the `exists` check), numbers-as-strings,
 * Unicode, etc.
 */
const invalidRole = fc
  .string()
  .filter(s => s !== 'counselor' && s !== 'admin');

// ── Property 2 ────────────────────────────────────────────────────────────────

describe('Property 2: Invalid Role Values Are Rejected', () => {
  const { app, wasHandlerCalled, resetHandlerFlag } = buildApp();

  beforeEach(() => {
    resetHandlerFlag();
  });

  // ── Baselines: valid roles must reach the handler ─────────────────────────

  test('"counselor" role passes validation (baseline)', async () => {
    const res = await request(app)
      .post('/register')
      .send(bodyWithRole('counselor'));

    expect(res.status).toBe(200);
    expect(wasHandlerCalled()).toBe(true);
  });

  test('"admin" role passes validation (baseline)', async () => {
    resetHandlerFlag();
    const res = await request(app)
      .post('/register')
      .send(bodyWithRole('admin'));

    expect(res.status).toBe(200);
    expect(wasHandlerCalled()).toBe(true);
  });

  // ── Property: any non-valid role → 400, handler not reached ──────────────

  /**
   * **Validates: Requirements 1.4**
   *
   * For every string that is not "counselor" or "admin", POST /register MUST
   * return 400 and the downstream handler MUST NOT be called.
   */
  test(
    'any role that is not "counselor" or "admin" → 400, handler never invoked',
    async () => {
      await fc.assert(
        fc.asyncProperty(invalidRole, async (role) => {
          resetHandlerFlag();

          const res = await request(app)
            .post('/register')
            .send(bodyWithRole(role));

          // MUST return 400 Bad Request
          expect(res.status).toBe(400);

          // Response body must be JSON with an error field
          expect(res.body).toHaveProperty('error');
          expect(typeof res.body.error).toBe('string');
          expect(res.body.error.length).toBeGreaterThan(0);

          // Stub handler MUST NOT have been invoked
          expect(wasHandlerCalled()).toBe(false);
        }),
        { numRuns: 100 },
      );
    },
  );

  // ── Specific edge cases verified deterministically ────────────────────────

  test.each([
    ['empty string', ''],
    ['whitespace', '   '],
    ['COUNSELOR (uppercase)', 'COUNSELOR'],
    ['ADMIN (uppercase)', 'ADMIN'],
    ['Counselor (mixed case)', 'Counselor'],
    ['Admin (mixed case)', 'Admin'],
    ['numeric string', '1'],
    ['arbitrary word', 'manager'],
    ['SQL injection attempt', "' OR '1'='1"],
  ])('role = %s → 400', async (_label, role) => {
    resetHandlerFlag();

    const res = await request(app)
      .post('/register')
      .send(bodyWithRole(role));

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(wasHandlerCalled()).toBe(false);
  });
});
