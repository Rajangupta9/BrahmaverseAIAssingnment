/**
 * Property 13: Non-Admin Cannot Access Admin-Only Endpoints
 *
 * For any counselor-role JWT — regardless of user ID, name, email, or other
 * payload fields — every request to an admin-only endpoint SHALL return 403
 * Forbidden.  The admin-protected routes tested are:
 *   - GET  /leads               (list all leads)
 *   - PATCH /leads/:id/reassign (reassign a lead to a different counselor)
 *
 * Validates: Requirements 9.3, 10.5
 *
 * Strategy
 * --------
 * 1. Build a minimal Express app that wires `authenticate` → `requireRole('admin')`
 *    in front of stub handlers for the two admin routes.
 * 2. Use fast-check to generate arbitrary counselor-role payloads (varying id,
 *    name, email fields).
 * 3. Sign each generated payload as a valid JWT access token using the test
 *    secret from the setup-env.js setupFile.
 * 4. Assert that every counselor JWT receives a 403 response and that the
 *    downstream stub handler is never reached.
 */

import fc from 'fast-check';
import express from 'express';
import request from 'supertest';
import { authenticate } from './auth.js';
import { requireRole } from './requireRole.js';
import { signAccessToken } from '../utils/jwt.js';
import { errorHandler } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Minimal Express app
// ---------------------------------------------------------------------------

/**
 * Builds a minimal Express app exposing two admin-only endpoints:
 *   GET  /leads
 *   PATCH /leads/:id/reassign
 *
 * Both routes are protected by `authenticate` then `requireRole('admin')`.
 * The stub handlers set a flag so tests can verify they were never called.
 */
function buildAdminApp() {
  const app = express();
  app.use(express.json());

  let handlerCallCount = 0;

  const stubHandler = (_req, res) => {
    handlerCallCount++;
    res.status(200).json({ ok: true });
  };

  app.get(
    '/leads',
    authenticate,
    requireRole('admin'),
    stubHandler,
  );

  app.patch(
    '/leads/:id/reassign',
    authenticate,
    requireRole('admin'),
    stubHandler,
  );

  app.use(errorHandler);

  return {
    app,
    getHandlerCallCount: () => handlerCallCount,
    resetHandlerCallCount: () => { handlerCallCount = 0; },
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a counselor-role JWT payload with varied id, name, and email
 * fields to exercise the full space of counselor identities.
 */
const counselorPayload = fc.record({
  id: fc.uuid(),
  role: fc.constant('counselor'),
  name: fc.string({ minLength: 1, maxLength: 80 }),
  email: fc.emailAddress(),
});

/**
 * Generates a UUID-shaped path parameter for /leads/:id/reassign.
 */
const leadId = fc.uuid();

// ---------------------------------------------------------------------------
// Property 13
// ---------------------------------------------------------------------------

describe('Property 13: Non-Admin Cannot Access Admin-Only Endpoints', () => {
  const { app, getHandlerCallCount, resetHandlerCallCount } = buildAdminApp();

  beforeEach(() => {
    resetHandlerCallCount();
  });

  // ── Baseline: admin role reaches the handler ────────────────────────────

  test('admin JWT reaches the handler on GET /leads (baseline)', async () => {
    const adminToken = signAccessToken({ id: 'admin-id', role: 'admin' });
    const res = await request(app)
      .get('/leads')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(getHandlerCallCount()).toBe(1);
  });

  test('admin JWT reaches the handler on PATCH /leads/:id/reassign (baseline)', async () => {
    resetHandlerCallCount();
    const adminToken = signAccessToken({ id: 'admin-id', role: 'admin' });
    const res = await request(app)
      .patch('/leads/some-lead-id/reassign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ counselorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });

    expect(res.status).toBe(200);
    expect(getHandlerCallCount()).toBe(1);
  });

  // ── Property: counselor JWT → 403 on GET /leads ─────────────────────────

  test(
    'any counselor JWT → 403 on GET /leads, handler never invoked',
    async () => {
      await fc.assert(
        fc.asyncProperty(counselorPayload, async (payload) => {
          resetHandlerCallCount();

          const token = signAccessToken(payload);

          const res = await request(app)
            .get('/leads')
            .set('Authorization', `Bearer ${token}`);

          expect(res.status).toBe(403);

          // Response body must be JSON with a non-empty error field
          expect(typeof res.body.error).toBe('string');
          expect(res.body.error.length).toBeGreaterThan(0);

          // Stub handler must NOT have been called
          expect(getHandlerCallCount()).toBe(0);
        }),
        { numRuns: 50 },
      );
    },
  );

  // ── Property: counselor JWT → 403 on PATCH /leads/:id/reassign ──────────

  test(
    'any counselor JWT → 403 on PATCH /leads/:id/reassign, handler never invoked',
    async () => {
      await fc.assert(
        fc.asyncProperty(counselorPayload, leadId, async (payload, id) => {
          resetHandlerCallCount();

          const token = signAccessToken(payload);

          const res = await request(app)
            .patch(`/leads/${id}/reassign`)
            .set('Authorization', `Bearer ${token}`)
            .send({ counselorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });

          expect(res.status).toBe(403);

          expect(typeof res.body.error).toBe('string');
          expect(res.body.error.length).toBeGreaterThan(0);

          expect(getHandlerCallCount()).toBe(0);
        }),
        { numRuns: 50 },
      );
    },
  );

  // ── Combined: counselor JWT → 403 on both endpoints ─────────────────────

  test(
    'any counselor JWT is rejected on both admin endpoints in the same run',
    async () => {
      await fc.assert(
        fc.asyncProperty(counselorPayload, leadId, async (payload, id) => {
          resetHandlerCallCount();
          const token = signAccessToken(payload);

          const [resGet, resPatch] = await Promise.all([
            request(app)
              .get('/leads')
              .set('Authorization', `Bearer ${token}`),
            request(app)
              .patch(`/leads/${id}/reassign`)
              .set('Authorization', `Bearer ${token}`)
              .send({ counselorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }),
          ]);

          expect(resGet.status).toBe(403);
          expect(resPatch.status).toBe(403);

          // Neither stub handler should have been invoked
          expect(getHandlerCallCount()).toBe(0);
        }),
        { numRuns: 50 },
      );
    },
  );

  // ── Role variants: any non-admin role string → 403 ──────────────────────

  test(
    'any non-admin role value → 403 on GET /leads',
    async () => {
      // Generate payloads whose role is any string except "admin"
      const nonAdminPayload = fc.record({
        id: fc.uuid(),
        role: fc.string({ minLength: 1, maxLength: 20 }).filter(r => r !== 'admin'),
      });

      await fc.assert(
        fc.asyncProperty(nonAdminPayload, async (payload) => {
          resetHandlerCallCount();

          const token = signAccessToken(payload);
          const res = await request(app)
            .get('/leads')
            .set('Authorization', `Bearer ${token}`);

          expect(res.status).toBe(403);
          expect(getHandlerCallCount()).toBe(0);
        }),
        { numRuns: 50 },
      );
    },
  );
});
