/**
 * Property 3: Missing Required Fields Yield 400
 *
 * For any request to a field-validated endpoint where one or more required
 * fields are absent, the system SHALL return a 400 Bad Request response and
 * SHALL NOT create any resource.
 *
 * Validates: Requirements 1.5, 2.6, 5.4, 11.4
 *
 * Strategy
 * --------
 * Rather than importing the real validator files (which don't exist yet), we
 * build the validator chains inline using the same express-validator rules
 * defined in the design document.  This isolates the test to the `validate`
 * middleware behaviour and means the test will continue to pass once the real
 * validator files are wired up (assuming they follow the same rules).
 *
 * For each endpoint we:
 *   1. Define the full set of required fields and a complete valid body.
 *   2. Use fast-check to generate every non-empty subset of required fields
 *      to omit from the body.
 *   3. Assert that each partial body is rejected with HTTP 400.
 *   4. Assert that no handler downstream of validate() is ever invoked
 *      (i.e., no resource creation occurs).
 */

import fc from 'fast-check';
import express from 'express';
import request from 'supertest';
import { body } from 'express-validator';
import { validate } from './validate.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal Express app that:
 *   - Accepts POST /test
 *   - Runs the provided validator chains followed by validate()
 *   - Calls a spy handler that sets res.locals.handlerCalled = true on success
 *
 * Returns { app, wasHandlerCalled } where wasHandlerCalled() tells you whether
 * the spy handler was reached (i.e., validation passed).
 */
function buildApp(validatorChains) {
  const app = express();
  app.use(express.json());

  let handlerCalled = false;

  app.post(
    '/test',
    ...validatorChains,
    validate,
    (req, res) => {
      handlerCalled = true;
      res.status(200).json({ ok: true });
    },
  );

  // Simple error handler so validate's 400 responses reach supertest cleanly
  app.use((err, req, res, _next) => {
    const status = err.statusCode ?? 500;
    res.status(status).json({ error: err.message });
  });

  return {
    app,
    wasHandlerCalled: () => handlerCalled,
    resetHandlerFlag: () => { handlerCalled = false; },
  };
}

/**
 * Generate all non-empty subsets of an array.
 * e.g., ['a','b'] → [['a'], ['b'], ['a','b']]
 */
function nonEmptySubsets(arr) {
  const result = [];
  const total = 1 << arr.length; // 2^n
  for (let mask = 1; mask < total; mask++) {
    const subset = arr.filter((_, i) => mask & (1 << i));
    result.push(subset);
  }
  return result;
}

/**
 * Return a copy of `body` with the given `fields` deleted.
 */
function omitFields(body, fields) {
  const copy = { ...body };
  for (const f of fields) delete copy[f];
  return copy;
}

// ── validator chain definitions (mirrors design.md validation table) ─────────

/**
 * POST /auth/register — required: name, email, password, role
 */
const registerValidators = [
  body('name').notEmpty().withMessage('name is required'),
  body('email').isEmail().withMessage('Must be a valid email'),
  body('password').isLength({ min: 8 }).withMessage('password minLength 8'),
  body('role').isIn(['counselor', 'admin']).withMessage('role must be counselor or admin'),
];

/**
 * POST /auth/login — required: email, password
 */
const loginValidators = [
  body('email').isEmail().withMessage('Must be a valid email'),
  body('password').notEmpty().withMessage('password is required'),
];

/**
 * POST /auth/refresh — required: refreshToken
 */
const refreshValidators = [
  body('refreshToken').notEmpty().withMessage('refreshToken is required'),
];

/**
 * POST /leads/submit — required: name, email, courseInterest
 */
const submitLeadValidators = [
  body('name').notEmpty().withMessage('name is required'),
  body('email').isEmail().withMessage('Must be a valid email'),
  body('courseInterest').notEmpty().withMessage('courseInterest is required'),
];

/**
 * POST /leads (counselor-created lead) — required: name, email, courseInterest
 */
const createLeadValidators = [
  body('name').notEmpty().withMessage('name is required'),
  body('email').isEmail().withMessage('Must be a valid email'),
  body('courseInterest').notEmpty().withMessage('courseInterest is required'),
];

/**
 * PATCH /leads/:id/reassign — required: counselorId (must be a UUID)
 */
const reassignValidators = [
  body('counselorId').isUUID().withMessage('counselorId must be a valid UUID'),
];

// ── endpoint specifications ──────────────────────────────────────────────────

/**
 * Each spec describes one validated endpoint:
 *   name        — human-readable label for test output
 *   validators  — express-validator chain array
 *   required    — fields that must be present (omitting any yields 400)
 *   validBody   — a complete, valid body
 */
const ENDPOINT_SPECS = [
  {
    name: 'POST /auth/register',
    validators: registerValidators,
    required: ['name', 'email', 'password', 'role'],
    validBody: {
      name: 'Alice',
      email: 'alice@example.com',
      password: 'password123',
      role: 'counselor',
    },
  },
  {
    name: 'POST /auth/login',
    validators: loginValidators,
    required: ['email', 'password'],
    validBody: { email: 'alice@example.com', password: 'password123' },
  },
  {
    name: 'POST /auth/refresh',
    validators: refreshValidators,
    required: ['refreshToken'],
    validBody: { refreshToken: 'some-opaque-refresh-token' },
  },
  {
    name: 'POST /leads/submit',
    validators: submitLeadValidators,
    required: ['name', 'email', 'courseInterest'],
    validBody: {
      name: 'Bob',
      email: 'bob@example.com',
      courseInterest: 'Data Science',
    },
  },
  {
    name: 'POST /leads (counselor-created)',
    validators: createLeadValidators,
    required: ['name', 'email', 'courseInterest'],
    validBody: {
      name: 'Carol',
      email: 'carol@example.com',
      courseInterest: 'Web Development',
    },
  },
  {
    name: 'PATCH /leads/:id/reassign',
    validators: reassignValidators,
    required: ['counselorId'],
    validBody: { counselorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
  },
];

// ── property tests ───────────────────────────────────────────────────────────

describe('Property 3: Missing Required Fields Yield 400', () => {
  for (const spec of ENDPOINT_SPECS) {
    describe(spec.name, () => {
      const { app, wasHandlerCalled, resetHandlerFlag } = buildApp(spec.validators);

      // Baseline: valid body passes validation and reaches the handler
      test('valid body passes validation (baseline)', async () => {
        resetHandlerFlag();
        const res = await request(app).post('/test').send(spec.validBody);
        expect(res.status).toBe(200);
        expect(wasHandlerCalled()).toBe(true);
      });

      /**
       * Property: for every non-empty subset of required fields that are
       * omitted from an otherwise valid body, the response MUST be 400 and
       * the downstream handler MUST NOT be called.
       *
       * fast-check enumerates a field subset by drawing indexes from
       * fc.subarray, then we omit those fields from the valid body.
       */
      test('any missing required field(s) → 400, no resource created', async () => {
        const subsets = nonEmptySubsets(spec.required);

        // Wrap in fc.assert so fast-check shrinking still applies if needed,
        // but we also deterministically cover every subset to guarantee full
        // coverage (not just sampled).
        await fc.assert(
          fc.asyncProperty(
            // Draw a random subset of required fields to omit; bias toward
            // single-field omissions which are the most likely real-world case
            fc.constantFrom(...subsets),
            async (fieldsToOmit) => {
              resetHandlerFlag();
              const partialBody = omitFields(spec.validBody, fieldsToOmit);
              const res = await request(app).post('/test').send(partialBody);

              // MUST return 400
              expect(res.status).toBe(400);

              // Response MUST be JSON with an error field
              expect(res.body).toHaveProperty('error');

              // Downstream handler MUST NOT have been invoked
              expect(wasHandlerCalled()).toBe(false);
            },
          ),
          { numRuns: subsets.length * 2, verbose: true },
        );
      });

      /**
       * Exhaustive deterministic coverage: run every subset explicitly
       * (outside fast-check) so CI output is clear about which permutations
       * were tested.
       */
      test.each(nonEmptySubsets(spec.required).map(s => [s.join(', '), s]))(
        'omitting [%s] → 400',
        async (_label, fieldsToOmit) => {
          resetHandlerFlag();
          const partialBody = omitFields(spec.validBody, fieldsToOmit);
          const res = await request(app).post('/test').send(partialBody);

          expect(res.status).toBe(400);
          expect(res.body).toHaveProperty('error');
          expect(res.body.error).toBe('Validation failed.');
          // details array must name at least one missing field
          expect(Array.isArray(res.body.details)).toBe(true);
          expect(res.body.details.length).toBeGreaterThan(0);
          expect(wasHandlerCalled()).toBe(false);
        },
      );
    });
  }
});
