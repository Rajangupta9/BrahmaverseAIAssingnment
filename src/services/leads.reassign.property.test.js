/**
 * Property 14: Reassign Updates CounselorId and Status
 *
 * For any existing lead and any valid counselorId that corresponds to a
 * registered user, a PATCH /leads/:id/reassign request from an admin SHALL
 * update the lead's counselorId to the provided value and set status to
 * "claimed", returning the updated lead record.
 *
 * Validates: Requirements 10.2, 10.3
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';

const mockLeadFindUnique = jest.fn();
const mockUserFindUnique = jest.fn();
const mockLeadUpdate = jest.fn();

jest.unstable_mockModule('../prisma/client.js', () => ({
  default: {
    lead: {
      findUnique: mockLeadFindUnique,
      update: mockLeadUpdate,
    },
    user: {
      findUnique: mockUserFindUnique,
    },
  },
}));

const { default: app } = await import('../app.js');
const { signAccessToken } = await import('../utils/jwt.js');

const arbLead = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  email: fc.emailAddress(),
  phone: fc.option(fc.string({ minLength: 5, maxLength: 15 }), { nil: null }),
  courseInterest: fc.string({ minLength: 1, maxLength: 50 }),
  source: fc.constantFrom('online', 'counselor'),
  notes: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  status: fc.constantFrom('unclaimed', 'claimed'),
  counselorId: fc.option(fc.uuid(), { nil: null }),
  createdAt: fc.integer({ min: 1577836800000, max: 1893456000000 }).map((ts) => new Date(ts).toISOString()),
});

describe('Property 14: Reassign Updates CounselorId and Status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('PATCH /leads/:id/reassign updates counselorId and status to claimed', async () => {
    await fc.assert(
      fc.asyncProperty(arbLead, fc.uuid(), async (lead, targetCounselorId) => {
        mockLeadFindUnique.mockResolvedValue(lead);
        mockUserFindUnique.mockResolvedValue({
          id: targetCounselorId,
          name: 'Target Counselor',
          role: 'counselor',
        });
        mockLeadUpdate.mockImplementation(async ({ where, data }) => ({
          ...lead,
          counselorId: data.counselorId,
          status: data.status,
        }));

        const adminToken = signAccessToken({ id: crypto.randomUUID(), role: 'admin' });

        const res = await request(app)
          .patch(`/leads/${lead.id}/reassign`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ counselorId: targetCounselorId });

        expect(res.status).toBe(200);
        expect(mockLeadUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: lead.id },
            data: {
              counselorId: targetCounselorId,
              status: 'claimed',
            },
          }),
        );
        expect(res.body.counselorId).toBe(targetCounselorId);
        expect(res.body.status).toBe('claimed');
      }),
      { numRuns: 25 },
    );
  });
});
