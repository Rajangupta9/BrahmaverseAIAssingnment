/**
 * Property 4: Login Returns Both Tokens for Valid Credentials
 *
 * For any registered user, submitting a login request with the correct email
 * and password SHALL return both an `accessToken` (a valid JWT) and a
 * `refreshToken` (a non-empty string), and the refresh token SHALL be stored
 * in the database linked to that user.
 *
 * Validates: Requirements 2.2, 2.4
 *
 * Strategy
 * --------
 * 1. Mock Prisma to simulate a pre-existing user with a bcrypt-hashed password.
 * 2. Mock `prisma.refreshToken.create` to capture the token-creation call.
 * 3. Use fast-check to generate valid (email, password) pairs.
 * 4. Call `authService.login()` with each generated input.
 * 5. Assert the response has both `accessToken` (verify it is a valid JWT via
 *    `verifyAccessToken`) and `refreshToken` (a non-empty string).
 * 6. Assert `prisma.refreshToken.create` was called with the refresh token
 *    linked to the correct userId.
 */

import fc from 'fast-check';
import bcrypt from 'bcrypt';
import { jest } from '@jest/globals';

// ── mock prisma BEFORE importing auth.service ──────────────────────────────
// jest.unstable_mockModule must be called before any dynamic import of the
// module under test so that the mocked version is resolved by the ESM loader.

const mockUserFindUnique = jest.fn();
const mockRefreshTokenCreate = jest.fn();

jest.unstable_mockModule('../prisma/client.js', () => ({
  default: {
    user: {
      findUnique: mockUserFindUnique,
    },
    refreshToken: {
      create: mockRefreshTokenCreate,
    },
  },
}));

// Dynamic imports after mock registration
const { authService } = await import('./auth.service.js');
const { verifyAccessToken } = await import('../utils/jwt.js');

// ── arbitraries ────────────────────────────────────────────────────────────

/** Valid password: at least 8 characters, up to 64 printable ASCII characters */
const arbPassword = fc.string({ minLength: 8, maxLength: 64 });

/** Valid email */
const arbEmail = fc.emailAddress();

/** Valid role */
const arbRole = fc.constantFrom('counselor', 'admin');

/** UUID-shaped user id */
const arbUserId = fc.uuid();

// ── bcrypt salt rounds for testing ────────────────────────────────────────
// Use 1 round in tests to keep hashing fast across many property runs.
// The real service uses 12 rounds; only the round count differs here.
const TEST_SALT_ROUNDS = 1;

// ── timeouts ───────────────────────────────────────────────────────────────
// Property tests hash passwords 50 times; allow enough time for all runs.
const PROPERTY_TIMEOUT_MS = 30_000;

// ── property tests ─────────────────────────────────────────────────────────

describe('Property 4: Login Returns Both Tokens for Valid Credentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: refreshToken.create succeeds and returns a minimal record
    mockRefreshTokenCreate.mockResolvedValue({ id: 'rt-id' });
  });

  test(
    'login returns a valid JWT accessToken and a non-empty refreshToken',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbEmail,
          arbPassword,
          arbUserId,
          arbRole,
          async (email, password, userId, role) => {
            // Bcrypt-hash the password to simulate a pre-existing stored user
            const hashedPassword = await bcrypt.hash(password, TEST_SALT_ROUNDS);

            const fakeUser = {
              id: userId,
              email,
              role,
              password: hashedPassword,
            };

            // Prisma returns this user when we look up by email
            mockUserFindUnique.mockResolvedValue(fakeUser);
            mockRefreshTokenCreate.mockClear();
            mockRefreshTokenCreate.mockResolvedValue({ id: 'rt-id' });

            const result = await authService.login({ email, password });

            // ── accessToken must be a valid JWT ──────────────────────────
            expect(typeof result.accessToken).toBe('string');
            expect(result.accessToken.length).toBeGreaterThan(0);

            // verifyAccessToken throws on invalid tokens; let it propagate
            // if invalid so fast-check can surface a useful counterexample
            const decoded = verifyAccessToken(result.accessToken);
            expect(decoded.id).toBe(userId);
            expect(decoded.role).toBe(role);

            // ── refreshToken must be a non-empty string ──────────────────
            expect(typeof result.refreshToken).toBe('string');
            expect(result.refreshToken.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 50 },
      );
    },
    PROPERTY_TIMEOUT_MS,
  );

  test(
    'prisma.refreshToken.create is called with the refresh token linked to the correct userId',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbEmail,
          arbPassword,
          arbUserId,
          arbRole,
          async (email, password, userId, role) => {
            const hashedPassword = await bcrypt.hash(password, TEST_SALT_ROUNDS);

            mockUserFindUnique.mockResolvedValue({
              id: userId,
              email,
              role,
              password: hashedPassword,
            });

            mockRefreshTokenCreate.mockClear();
            mockRefreshTokenCreate.mockResolvedValue({ id: 'rt-id' });

            const result = await authService.login({ email, password });

            // refreshToken.create must have been called exactly once
            expect(mockRefreshTokenCreate).toHaveBeenCalledTimes(1);

            const createCall = mockRefreshTokenCreate.mock.calls[0][0];

            // The token stored must match the returned refreshToken
            expect(createCall.data.token).toBe(result.refreshToken);

            // The record must be linked to the correct user
            expect(createCall.data.userId).toBe(userId);

            // An expiry date must have been provided
            expect(createCall.data.expiresAt).toBeInstanceOf(Date);
          },
        ),
        { numRuns: 50 },
      );
    },
    PROPERTY_TIMEOUT_MS,
  );

  test(
    'combined: both token properties hold and DB write is correct for all generated inputs',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbEmail,
          arbPassword,
          arbUserId,
          arbRole,
          async (email, password, userId, role) => {
            const hashedPassword = await bcrypt.hash(password, TEST_SALT_ROUNDS);

            mockUserFindUnique.mockResolvedValue({
              id: userId,
              email,
              role,
              password: hashedPassword,
            });

            mockRefreshTokenCreate.mockClear();
            mockRefreshTokenCreate.mockResolvedValue({ id: 'rt-id' });

            const result = await authService.login({ email, password });

            // Token shape
            expect(typeof result.accessToken).toBe('string');
            expect(result.accessToken.length).toBeGreaterThan(0);
            expect(typeof result.refreshToken).toBe('string');
            expect(result.refreshToken.length).toBeGreaterThan(0);

            // JWT validity
            const decoded = verifyAccessToken(result.accessToken);
            expect(decoded.id).toBe(userId);
            expect(decoded.role).toBe(role);

            // DB write
            expect(mockRefreshTokenCreate).toHaveBeenCalledTimes(1);
            const createData = mockRefreshTokenCreate.mock.calls[0][0].data;
            expect(createData.token).toBe(result.refreshToken);
            expect(createData.userId).toBe(userId);
            expect(createData.expiresAt).toBeInstanceOf(Date);
          },
        ),
        { numRuns: 25 },
      );
    },
    PROPERTY_TIMEOUT_MS,
  );
});

