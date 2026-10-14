/**
 * Property 9: Unclaimed Leads Filter Is Exact
 *
 * For any database state containing a mix of claimed and unclaimed leads,
 * a GET /leads/unclaimed request from any authenticated user SHALL return
 * exactly and only the leads with status = "unclaimed", with each record
 * containing the required fields (id, name, email, phone, courseInterest,
 * source, notes, createdAt).
 *
 * Validates: Requirements 6.2, 6.3
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
  status: fc.constantFrom('unclaimed', 'claimed'),
  createdAt: fc.integer({ min: 1577836800000, max: 1893456000000 }).map((ts) => new Date(ts).toISOString()),
});

const REQUIRED_PUBLIC_FIELDS = [
  'id',
  'name',
  'email',
  'phone',
  'courseInterest',
  'source',
  'notes',
  'createdAt',
];

describe('Property 9: Unclaimed Leads Filter Is Exact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /leads/unclaimed returns exactly and only unclaimed leads with required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbLead, { minLength: 0, maxLength: 20 }),
        fc.constantFrom('counselor', 'admin'),
        async (allLeads, role) => {
          const unclaimedLeads = allLeads
            .filter((l) => l.status === 'unclaimed')
            .map((l) => {
              const projected = {};
              for (const field of REQUIRED_PUBLIC_FIELDS) {
                projected[field] = l[field];
              }
              return projected;
            });

          mockLeadFindMany.mockImplementation(async ({ where }) => {
            expect(where.status).toBe('unclaimed');
            return unclaimedLeads;
          });

          const token = signAccessToken({ id: crypto.randomUUID(), role });

          const res = await request(app)
            .get('/leads/unclaimed')
            .set('Authorization', `Bearer ${token}`);

          expect(res.status).toBe(200);
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBe(unclaimedLeads.length);

          for (const lead of res.body) {
            for (const field of REQUIRED_PUBLIC_FIELDS) {
              expect(lead).toHaveProperty(field);
            }
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});
