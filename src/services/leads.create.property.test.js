/**
 * Property 15: Counselor-Created Lead Has Correct Invariants
 *
 * For any authenticated user and any valid lead data submitted to POST /leads,
 * the created lead SHALL have source = "counselor", status = "claimed", and
 * counselorId equal to the requesting user's id, and the response SHALL be 201 Created.
 *
 * Validates: Requirements 11.3, 11.5
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';

const mockLeadCreate = jest.fn();

jest.unstable_mockModule('../prisma/client.js', () => ({
  default: {
    lead: {
      create: mockLeadCreate,
    },
  },
}));

const { default: app } = await import('../app.js');
const { signAccessToken } = await import('../utils/jwt.js');

const arbLeadInput = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  email: fc.emailAddress(),
  courseInterest: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  phone: fc.option(fc.string({ minLength: 5, maxLength: 15 }), { nil: undefined }),
  notes: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
});

describe('Property 15: Counselor-Created Lead Has Correct Invariants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /leads creates lead with source counselor, status claimed, and counselorId = requesting user', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbLeadInput,
        fc.uuid(),
        fc.constantFrom('counselor', 'admin'),
        async (input, userId, role) => {
          const fakeId = crypto.randomUUID();
          mockLeadCreate.mockImplementation(async ({ data }) => {
            return {
              id: fakeId,
              name: data.name,
              email: data.email,
              phone: data.phone,
              courseInterest: data.courseInterest,
              source: data.source,
              notes: data.notes,
              status: data.status,
              counselorId: data.counselorId,
              createdAt: new Date().toISOString(),
            };
          });

          const token = signAccessToken({ id: userId, role });

          const res = await request(app)
            .post('/leads')
            .set('Authorization', `Bearer ${token}`)
            .send(input);

          expect(res.status).toBe(201);
          expect(mockLeadCreate).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({
                source: 'counselor',
                status: 'claimed',
                counselorId: userId,
              }),
            }),
          );
          expect(res.body.source).toBe('counselor');
          expect(res.body.status).toBe('claimed');
          expect(res.body.counselorId).toBe(userId);
        },
      ),
      { numRuns: 25 },
    );
  });
});
