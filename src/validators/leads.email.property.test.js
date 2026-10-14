/**
 * Property 8: Invalid Email Format Is Rejected
 *
 * For any string that does not conform to a valid email address format,
 * submitting it as the email field in any lead or registration endpoint
 * SHALL result in a 400 Bad Request response.
 *
 * Validates: Requirements 1.2, 5.5
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';
import request from 'supertest';

jest.unstable_mockModule('../prisma/client.js', () => ({
  default: {
    user: { findUnique: jest.fn(), create: jest.fn() },
    lead: { create: jest.fn() },
  },
}));

const { default: app } = await import('../app.js');

/**
 * Arbitrary: strings that are guaranteed NOT to be valid email addresses.
 */
const arbInvalidEmail = fc.oneof(
  // Strings with no '@' at all
  fc.stringMatching(/^[^@]+$/).filter((s) => s.length > 0),
  // Multiple '@' characters
  fc.string().map((s) => `foo@@${s}.com`),
  // Missing domain
  fc.string().map((s) => `${s}@`),
  // Missing local part
  fc.string().map((s) => `@${s}.com`),
  // Contains spaces
  fc.tuple(fc.string({ minLength: 1, maxLength: 5 }), fc.string({ minLength: 1, maxLength: 5 }))
    .map(([a, b]) => `${a} ${b}@example.com`),
).filter((s) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));

describe('Property 8: Invalid Email Format Is Rejected', () => {
  test('Submitting invalid email to /leads/submit yields 400', async () => {
    await fc.assert(
      fc.asyncProperty(arbInvalidEmail, async (invalidEmail) => {
        const res = await request(app)
          .post('/leads/submit')
          .send({
            name: 'Test Lead',
            email: invalidEmail,
            courseInterest: 'Computer Science',
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation failed.');
      }),
      { numRuns: 30 },
    );
  });

  test('Submitting invalid email to /auth/register yields 400', async () => {
    await fc.assert(
      fc.asyncProperty(arbInvalidEmail, async (invalidEmail) => {
        const res = await request(app)
          .post('/auth/register')
          .send({
            name: 'Test User',
            email: invalidEmail,
            password: 'password123',
            role: 'counselor',
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation failed.');
      }),
      { numRuns: 30 },
    );
  });
});
