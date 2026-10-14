/**
 * Auth Service Property Tests
 *
 * Property 1: Password Is Never Stored in Plaintext
 * Property 5: Invalid Credentials Always Return 401 Without Field Hints
 *
 * Validates: Requirements 1.2, 2.5
 */

import fc from 'fast-check';
import bcrypt from 'bcrypt';
import { jest } from '@jest/globals';

// ── mock prisma BEFORE importing auth.service ──────────────────────────────
// jest.unstable_mockModule must be called before any dynamic import of the
// module under test so that the mocked version is resolved by the ESM loader.

const mockUserFindUnique = jest.fn();
const mockUserCreate = jest.fn();
const mockRefreshTokenCreate = jest.fn();

jest.unstable_mockModule('../prisma/client.js', () => ({
  default: {
    user: {
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
    },
    refreshToken: {
      create: mockRefreshTokenCreate,
    },
  },
}));

// Dynamic import after mock registration
const { authService } = await import('./auth.service.js');

// Alias shims so existing Property 1 test bodies remain unchanged
const mockFindUnique = mockUserFindUnique;
const mockCreate = mockUserCreate;

// ── shared arbitraries ─────────────────────────────────────────────────────

/** Valid name: 1–80 printable ASCII characters (excluding control chars) */
const arbName = fc.stringMatching(/^[\x20-\x7E]{1,80}$/);

/** Valid email address */
const arbEmail = fc.emailAddress();

/** Valid password: at least 8 characters, up to 64 */
const arbPassword = fc.string({ minLength: 8, maxLength: 64 });

/** Valid role */
const arbRole = fc.constantFrom('counselor', 'admin');

/** Complete valid registration payload */
const arbRegistrationInput = fc.record({
  name: arbName,
  email: arbEmail,
  password: arbPassword,
  role: arbRole,
});

// ── helpers ────────────────────────────────────────────────────────────────

/** Bcrypt hash prefixes for $2b$ and $2a$ variants */
const BCRYPT_PREFIXES = ['$2b$', '$2a$'];

function isBcryptHash(value) {
  return (
    typeof value === 'string' &&
    BCRYPT_PREFIXES.some(prefix => value.startsWith(prefix))
  );
}

// ── Property 1: Password Is Never Stored in Plaintext ─────────────────────

describe('Property 1: Password Is Never Stored in Plaintext', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // No existing user → registration proceeds
    mockFindUnique.mockResolvedValue(null);

    // Capture the data argument; return a minimal fake user
    mockCreate.mockImplementation(async ({ data }) => ({
      id: 'fake-id',
      name: data.name,
      email: data.email,
      role: data.role,
      createdAt: new Date(),
    }));

    // refreshToken.create is not exercised by Property 1 but must not throw
    mockRefreshTokenCreate.mockResolvedValue({});
  });

  // bcrypt with 12 salt rounds takes ~100ms per hash; 50 runs ≈ 5s.
  // Increase timeout to 30s to avoid flakiness on slower machines.

  test(
    'stored password field never equals submitted plaintext password',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbRegistrationInput, async ({ name, email, password, role }) => {
          mockCreate.mockClear();
          mockFindUnique.mockResolvedValue(null);

          await authService.register({ name, email, password, role });

          // prisma.user.create must have been called exactly once
          expect(mockCreate).toHaveBeenCalledTimes(1);

          const callArg = mockCreate.mock.calls[0][0];
          const storedPassword = callArg.data.password;

          // Core property: stored password MUST NOT equal plaintext
          expect(storedPassword).not.toBe(password);
        }),
        { numRuns: 10, verbose: true },
      );
    },
    30_000,
  );

  test(
    'stored password is a valid bcrypt hash (starts with $2b$ or $2a$)',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbRegistrationInput, async ({ name, email, password, role }) => {
          mockCreate.mockClear();
          mockFindUnique.mockResolvedValue(null);

          await authService.register({ name, email, password, role });

          expect(mockCreate).toHaveBeenCalledTimes(1);

          const callArg = mockCreate.mock.calls[0][0];
          const storedPassword = callArg.data.password;

          // Stored value must be a recognisable bcrypt hash
          expect(isBcryptHash(storedPassword)).toBe(true);
        }),
        { numRuns: 10, verbose: true },
      );
    },
    30_000,
  );

  test(
    'combined: stored value is bcrypt hash AND differs from plaintext for all generated inputs',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbRegistrationInput, async ({ name, email, password, role }) => {
          mockCreate.mockClear();
          mockFindUnique.mockResolvedValue(null);

          await authService.register({ name, email, password, role });

          expect(mockCreate).toHaveBeenCalledTimes(1);

          const callArg = mockCreate.mock.calls[0][0];
          const storedPassword = callArg.data.password;

          // Both properties must hold simultaneously
          expect(storedPassword).not.toBe(password);
          expect(isBcryptHash(storedPassword)).toBe(true);
        }),
        { numRuns: 10, verbose: true },
      );
    },
    30_000,
  );
});

// ── Property 5: Invalid Credentials Always Return 401 Without Field Hints ──
//
// For any (email, password) pair where the email is not registered OR the
// password does not match the stored hash, authService.login() SHALL throw an
// AppError with statusCode 401 whose message does NOT name the incorrect field
// (i.e., must not contain "email" or "password" as the failed field indicator).
//
// Two scenarios are covered:
//   A. Unregistered email   — prisma.user.findUnique returns null
//   B. Wrong password       — prisma.user.findUnique returns a user whose
//                             stored hash will never match the generated password
//
// Validates: Requirements 2.5

import { AppError } from '../utils/errors.js';

/**
 * A bcrypt hash of a fixed sentinel string, generated at cost factor 4
 * (the minimum) to keep comparison fast in tests. The key property is that
 * it will never match any fast-check-generated password.
 */
const SENTINEL_WRONG_HASH = await bcrypt.hash('__sentinel_wrong_pw__', 4);

/**
 * Assert that calling fn() rejects with an AppError(401) whose message is the
 * generic "Invalid credentials." string and does not name the incorrect field.
 */
async function assertInvalidCredentials401(fn) {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    threw = true;

    // Must be an AppError
    expect(err).toBeInstanceOf(AppError);

    // Must be 401
    expect(err.statusCode).toBe(401);

    // Message must be the exact generic string from the design
    expect(err.message).toBe('Invalid credentials.');

    // Message must NOT hint at which field is wrong (case-insensitive check)
    const lower = err.message.toLowerCase();
    expect(lower).not.toMatch(/\bemail\b.*not.*found|no.*\bemail\b|unknown.*\bemail\b/);
    expect(lower).not.toMatch(/\bpassword\b.*incorrect|wrong.*\bpassword\b|bad.*\bpassword\b/);
  }

  // Must have thrown — if login succeeded, that is a test failure
  expect(threw).toBe(true);
}

describe('Property 5: Invalid Credentials Always Return 401 Without Field Hints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // refreshToken.create is not reached in the failure paths but must not throw
    mockRefreshTokenCreate.mockResolvedValue({});
  });

  // ── Scenario A: Unregistered email ──────────────────────────────────────
  //
  // When prisma.user.findUnique returns null the service has no user record to
  // compare against and must immediately return 401 with a generic message.
  // No bcrypt is involved, so the default timeout is sufficient.

  test(
    'Scenario A — unregistered email always produces generic 401',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbEmail, arbPassword, async (email, password) => {
          // findUnique returns null → email not registered
          mockUserFindUnique.mockResolvedValue(null);
          mockUserCreate.mockClear();

          await assertInvalidCredentials401(() =>
            authService.login({ email, password }),
          );

          // login must NOT attempt to create any record on failure
          expect(mockUserCreate).not.toHaveBeenCalled();
        }),
        { numRuns: 50, verbose: true },
      );
    },
  );

  // ── Scenario B: Registered email, wrong password ─────────────────────────
  //
  // When findUnique returns a real-looking user record but the stored hash was
  // derived from a sentinel string that differs from the generated password,
  // bcrypt.compare always returns false and the service must return 401.
  //
  // Each bcrypt.compare with a real hash still takes ~10-50ms (cost 4), so we
  // use a longer timeout and fewer runs to stay within CI budgets.

  test(
    'Scenario B — wrong password always produces generic 401',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbEmail, arbPassword, async (email, password) => {
          // findUnique returns a user whose hash will never match `password`
          mockUserFindUnique.mockResolvedValue({
            id: 'user-id-123',
            email,
            role: 'counselor',
            password: SENTINEL_WRONG_HASH,
          });
          mockUserCreate.mockClear();

          await assertInvalidCredentials401(() =>
            authService.login({ email, password }),
          );

          // login must NOT attempt to create any record on failure
          expect(mockUserCreate).not.toHaveBeenCalled();
        }),
        { numRuns: 25, verbose: true },
      );
    },
    30_000,
  );

  // ── Same generic message for both scenarios ───────────────────────────────
  //
  // The spec requires that both failure modes produce the same message so that
  // callers cannot distinguish between "wrong email" and "wrong password"
  // (prevents user enumeration).
  //
  // Each iteration runs bcrypt.compare once (Scenario B), so we increase the
  // timeout and reduce numRuns for reliability.

  test(
    'Both scenarios return the identical error message (no field discrimination)',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbEmail, arbPassword, async (email, password) => {
          // Scenario A: unregistered email
          mockUserFindUnique.mockResolvedValue(null);
          let msgA;
          try {
            await authService.login({ email, password });
          } catch (err) {
            msgA = err.message;
          }

          // Scenario B: wrong password
          mockUserFindUnique.mockResolvedValue({
            id: 'user-id-456',
            email,
            role: 'counselor',
            password: SENTINEL_WRONG_HASH,
          });
          let msgB;
          try {
            await authService.login({ email, password });
          } catch (err) {
            msgB = err.message;
          }

          // Both messages must be identical — no field hint in either case
          expect(msgA).toBeDefined();
          expect(msgB).toBeDefined();
          expect(msgA).toBe(msgB);
          expect(msgA).toBe('Invalid credentials.');
        }),
        { numRuns: 25, verbose: true },
      );
    },
    30_000,
  );
});
