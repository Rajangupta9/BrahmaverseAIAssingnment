/**
 * Property 10: Claiming an Unclaimed Lead Assigns It Correctly
 *
 * For any unclaimed lead and any authenticated user, a PATCH /leads/:id/claim
 * request SHALL atomically set the lead's status to "claimed" and counselorId
 * to the requesting user's id, and SHALL return the updated lead record.
 *
 * Validates: Requirements 7.2, 7.3
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';
import request from 'supertest';

const mockLeadFindUnique = jest.fn();
const mockLeadUpdate = jest.fn();

jest.unstable_mockModule('../prisma/client.js', () => ({
  default: {
    lead: {
      findUnique: mockLeadFindUnique,
      update: mockLeadUpdate,
    },
  },
}));

const { default: app } = await import('../app.js');
const { signAccessToken } = await import('../utils/jwt.js');

const arbUnclaimedLead = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  email: fc.emailAddress(),
  phone: fc.option(fc.string({ minLength: 5, maxLength: 15 }), { nil: null }),
  courseInterest: fc.string({ minLength: 1, maxLength: 50 }),
  source: fc.constantFrom('online', 'counselor'),
  notes: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  status: fc.constant('unclaimed'),
  counselorId: fc.constant(null),
  createdAt: fc.integer({ min: 1577836800000, max: 1893456000000 }).map((ts) => new Date(ts).toISOString()),
});

describe('Property 10: Claiming an Unclaimed Lead Assigns It Correctly', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('PATCH /leads/:id/claim sets status to claimed and counselorId to requesting user', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUnclaimedLead,
        fc.uuid(),
        fc.constantFrom('counselor', 'admin'),
        async (lead, userId, role) => {
          mockLeadFindUnique.mockResolvedValue(lead);
          mockLeadUpdate.mockImplementation(async ({ where, data }) => {
            return {
              ...lead,
              status: data.status,
              counselorId: data.counselorId,
            };
          });

          const token = signAccessToken({ id: userId, role });

          const res = await request(app)
            .patch(`/leads/${lead.id}/claim`)
            .set('Authorization', `Bearer ${token}`);

          expect(res.status).toBe(200);
          expect(mockLeadUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
              where: { id: lead.id },
              data: {
                status: 'claimed',
                counselorId: userId,
              },
            }),
          );
          expect(res.body.status).toBe('claimed');
          expect(res.body.counselorId).toBe(userId);
        },
      ),
      { numRuns: 25 },
    );
  });
});
