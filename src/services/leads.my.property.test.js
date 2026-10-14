/**
 * Property 11: My Leads Filter Is Exact
 *
 * For any authenticated user with any set of claimed leads, a GET /leads/my
 * request SHALL return exactly and only the leads where counselorId equals
 * the authenticated user's id, with each record containing the required fields.
 *
 * Validates: Requirements 8.2, 8.3
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';

const mockLeadFindMany = jest.fn();

jest.unstable_mockModule('../prisma/client.js', () => ({
  default: {
    lead: {
      findMany: mockLeadFindMany,
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
  status: fc.constant('claimed'),
  counselorId: fc.uuid(),
  createdAt: fc.integer({ min: 1577836800000, max: 1893456000000 }).map((ts) => new Date(ts).toISOString()),
});

const REQUIRED_MY_FIELDS = [
  'id',
  'name',
  'email',
  'phone',
  'courseInterest',
  'source',
  'notes',
  'status',
  'counselorId',
  'createdAt',
];

describe('Property 11: My Leads Filter Is Exact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /leads/my returns exactly and only leads owned by authenticated counselor', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbLead, { minLength: 0, maxLength: 20 }),
        fc.uuid(),
        async (allLeads, requestingUserId) => {
          const userLeads = allLeads.filter((l) => l.counselorId === requestingUserId);

          mockLeadFindMany.mockImplementation(async ({ where }) => {
            expect(where.counselorId).toBe(requestingUserId);
            return userLeads;
          });

          const token = signAccessToken({ id: requestingUserId, role: 'counselor' });

          const res = await request(app)
            .get('/leads/my')
            .set('Authorization', `Bearer ${token}`);

          expect(res.status).toBe(200);
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBe(userLeads.length);

          for (const lead of res.body) {
            expect(lead.counselorId).toBe(requestingUserId);
            for (const field of REQUIRED_MY_FIELDS) {
              expect(lead).toHaveProperty(field);
            }
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});
