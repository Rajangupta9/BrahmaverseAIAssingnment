/**
 * Property 1: Password Is Never Stored in Plaintext
 *
 * For any valid registration input, the password stored in the database SHALL
 * never equal the plaintext password submitted. The stored value SHALL be a
 * valid bcrypt hash (prefixed with `$2b$` or `$2a$`).
 *
 * Validates: Requirements 1.2
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';

// ── mock prisma BEFORE importing auth.service ──────────────────────────────
// jest.unstable_mockModule must be called before any dynamic import of the
// module under test so that the mocked version is resolved by the ESM loader.

const mockFindUnique = jest.fn();
const mockCreate = jest.fn();

jest.unstable_mockModule('../prisma/client.js', () => ({
  default: {
    user: {
      findUnique: mockFindUnique,
      create: mockCreate,
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

// Dynamic import after mock registration
const { authService } = await import('./auth.service.js');

// ── arbitraries ────────────────────────────────────────────────────────────

/** Valid name: 1–80 characters */
const arbName = fc.string({ minLength: 1, maxLength: 80 });

/** Valid email: user@domain.tld */
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

// ── property tests ─────────────────────────────────────────────────────────

describe('Property 1: Password Is Never Stored in Plaintext', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // No existing user → registration proceeds without 409
    mockFindUnique.mockResolvedValue(null);

    // Capture the data argument; return a minimal fake user record
    mockCreate.mockImplementation(async ({ data }) => ({
      id: 'fake-id',
      name: data.name,
      email: data.email,
      role: data.role,
      createdAt: new Date(),
    }));
  });

  // bcrypt with 12 rounds is intentionally slow — keep numRuns low so the test
  // suite remains practical in CI while still sampling multiple generated inputs.
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
        { numRuns: 5, verbose: true },
      );
    },
    30000,
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
        { numRuns: 5, verbose: true },
      );
    },
    30000,
  );

  test(
    'combined: stored value is bcrypt hash AND differs from plaintext (all generated inputs)',
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
        { numRuns: 5, verbose: true },
      );
    },
    30000,
  );
});
