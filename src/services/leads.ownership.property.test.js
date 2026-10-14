/**
 * Property 16: Counselor Cannot Modify Leads They Do Not Own
 *
 * For any authenticated counselor and any lead where counselorId does not equal
 * the counselor's id, any attempt by that counselor to update the lead
 * SHALL return 403 Forbidden.
 *
 * Validates: Requirements 12.3
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';

jest.unstable_mockModule('../prisma/client.js', () => ({
  default: {
    lead: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

const { default: app } = await import('../app.js');
const { signAccessToken } = await import('../utils/jwt.js');

describe('Property 16: Counselor Cannot Modify Leads They Do Not Own', () => {
  test('Counselor attempting to reassign/update a lead returns 403 Forbidden', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // counselorId (logged in user)
        fc.uuid(), // other counselorId (owner)
        fc.uuid(), // leadId
        fc.uuid(), // target counselorId
        async (counselorId, ownerId, leadId, targetId) => {
          // Ensure logged-in counselor is NOT the owner
          fc.pre(counselorId !== ownerId);

          const token = signAccessToken({ id: counselorId, role: 'counselor' });

          const res = await request(app)
            .patch(`/leads/${leadId}/reassign`)
            .set('Authorization', `Bearer ${token}`)
            .send({ counselorId: targetId });

          expect(res.status).toBe(403);
          expect(res.body.error).toBe('Forbidden: insufficient permissions.');
        },
      ),
      { numRuns: 30 },
    );
  });
});
