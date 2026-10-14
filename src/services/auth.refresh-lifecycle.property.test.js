/**
 * Property 6: Refresh Token Lifecycle — Issue, Use, Invalidate
 *
 * For any authenticated session (login → obtain refresh token → logout):
 *   1. Before logout: presenting the refresh token to authService.refresh()
 *      SHALL return a new access token.
 *   2. After logout: presenting the same refresh token to authService.refresh()
 *      SHALL throw a 401 Unauthorized error.
 *
 * Uses mocked Prisma to avoid a live database, and fast-check to generate
 * varying user IDs and refresh token strings across runs.
 *
 * Validates: Requirements 3.2, 3.3, 4.2, 4.3
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';

// ── mock prisma BEFORE importing auth.service ──────────────────────────────
// jest.unstable_mockModule must be called before any dynamic import of the
// module under test so the mocked version is resolved by the ESM loader.

const mockRefreshFindUnique = jest.fn();
const mockRefreshUpdateMany = jest.fn();
const mockUserFindUnique = jest.fn();

jest.unstable_mockModule('../prisma/client.js', () => ({
  default: {
    refreshToken: {
      findUnique: mockRefreshFindUnique,
      updateMany: mockRefreshUpdateMany,
    },
    user: {
      findUnique: mockUserFindUnique,
    },
  },
}));

// Dynamic import after mock registration
const { authService } = await import('./auth.service.js');

// ── arbitraries ────────────────────────────────────────────────────────────

/** Arbitrary UUID-shaped user ID */
const arbUserId = fc.uuid();

/**
 * Arbitrary refresh token string: simulate the 40-byte hex strings the real
 * service generates (crypto.randomBytes(40).toString('hex') → 80 hex chars).
 * We use stringMatching to produce valid lowercase hex strings of that length.
 */
const arbRefreshToken = fc.stringMatching(/^[0-9a-f]{80}$/);

/** Valid role values matching the Prisma schema */
const arbRole = fc.constantFrom('counselor', 'admin');

/** A future expiry date (7 days out, well within valid range) */
function futureExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Build a valid (non-invalidated, non-expired) refresh token record as
 * Prisma would return it from refreshToken.findUnique.
 */
function makeValidRecord(userId, token) {
  return {
    id: 'record-id-' + Math.random().toString(36).slice(2),
    token,
    userId,
    expiresAt: futureExpiry(),
    invalidated: false,
    createdAt: new Date(),
  };
}

/**
 * Build an invalidated refresh token record (as returned after logout).
 */
function makeInvalidatedRecord(userId, token) {
  return { ...makeValidRecord(userId, token), invalidated: true };
}

/**
 * A minimal user object as Prisma would return from user.findUnique.
 */
function makeUser(userId, role) {
  return {
    id: userId,
    name: 'Test User',
    email: `user-${userId}@example.com`,
    role,
    createdAt: new Date(),
  };
}

// ── property tests ─────────────────────────────────────────────────────────

describe('Property 6: Refresh Token Lifecycle — Issue, Use, Invalidate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test(
    'before logout: refresh() with a valid token returns a new access token',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbUserId, arbRefreshToken, arbRole, async (userId, rawToken, role) => {
          jest.clearAllMocks();

          // Mock: token record exists, is not invalidated, not expired
          mockRefreshFindUnique.mockResolvedValue(makeValidRecord(userId, rawToken));

          // Mock: user lookup succeeds
          mockUserFindUnique.mockResolvedValue(makeUser(userId, role));

          const result = await authService.refresh(rawToken);

          // Property: result must contain a non-empty accessToken string
          expect(result).toHaveProperty('accessToken');
          expect(typeof result.accessToken).toBe('string');
          expect(result.accessToken.length).toBeGreaterThan(0);
        }),
        { numRuns: 50, verbose: true },
      );
    },
  );

  test(
    'after logout: refresh() with an invalidated token throws 401',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbUserId, arbRefreshToken, async (userId, rawToken) => {
          jest.clearAllMocks();

          // Mock: updateMany succeeds (simulates logout having been called)
          mockRefreshUpdateMany.mockResolvedValue({ count: 1 });

          // Simulate logout by calling authService.logout (which calls updateMany)
          await authService.logout(userId);

          // Mock: findUnique now returns the record with invalidated = true,
          // as it would be after logout.updateMany committed.
          mockRefreshFindUnique.mockResolvedValue(makeInvalidatedRecord(userId, rawToken));

          // Property: refresh() must throw an error with statusCode 401
          let caughtError;
          try {
            await authService.refresh(rawToken);
          } catch (err) {
            caughtError = err;
          }

          expect(caughtError).toBeDefined();
          expect(caughtError.statusCode).toBe(401);
        }),
        { numRuns: 50, verbose: true },
      );
    },
  );

  test(
    'full lifecycle: valid → logout → invalidated (combined round-trip)',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbUserId, arbRefreshToken, arbRole, async (userId, rawToken, role) => {
          jest.clearAllMocks();

          // ── Phase 1: Before logout ──────────────────────────────────────
          // Mock a valid, non-invalidated record
          mockRefreshFindUnique.mockResolvedValue(makeValidRecord(userId, rawToken));
          mockUserFindUnique.mockResolvedValue(makeUser(userId, role));

          const preLogoutResult = await authService.refresh(rawToken);

          // Assert: we got a new access token
          expect(preLogoutResult).toHaveProperty('accessToken');
          expect(typeof preLogoutResult.accessToken).toBe('string');
          expect(preLogoutResult.accessToken.length).toBeGreaterThan(0);

          // ── Phase 2: Logout ─────────────────────────────────────────────
          mockRefreshUpdateMany.mockResolvedValue({ count: 1 });
          await authService.logout(userId);

          // Verify updateMany was called with the right userId and invalidation flag
          expect(mockRefreshUpdateMany).toHaveBeenCalledWith({
            where: { userId, invalidated: false },
            data: { invalidated: true },
          });

          // ── Phase 3: After logout ───────────────────────────────────────
          // Now findUnique returns the same token but marked invalidated
          mockRefreshFindUnique.mockResolvedValue(makeInvalidatedRecord(userId, rawToken));

          let postLogoutError;
          try {
            await authService.refresh(rawToken);
          } catch (err) {
            postLogoutError = err;
          }

          // Assert: refresh after logout must throw 401
          expect(postLogoutError).toBeDefined();
          expect(postLogoutError.statusCode).toBe(401);
        }),
        { numRuns: 25, verbose: true },
      );
    },
  );

  test(
    'refresh() with a non-existent token (null record) throws 401',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbRefreshToken, async (rawToken) => {
          jest.clearAllMocks();

          // Mock: token not found in DB
          mockRefreshFindUnique.mockResolvedValue(null);

          let caughtError;
          try {
            await authService.refresh(rawToken);
          } catch (err) {
            caughtError = err;
          }

          // Requirement 3.3: invalid token → 401
          expect(caughtError).toBeDefined();
          expect(caughtError.statusCode).toBe(401);
        }),
        { numRuns: 30, verbose: true },
      );
    },
  );
});
