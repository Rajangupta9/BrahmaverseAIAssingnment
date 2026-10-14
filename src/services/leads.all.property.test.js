/**
 * Property 12: Admin Sees All Leads
 *
 * For any database state with any number of leads, a GET /leads request
 * from an authenticated admin SHALL return all lead records (complete set,
 * no filtering), each containing id, name, email, phone, courseInterest,
 * source, notes, status, counselorId, and createdAt.
 *
 * Validates: Requirements 9.2
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
  counselorId: fc.option(fc.uuid(), { nil: null }),
  createdAt: fc.integer({ min: 1577836800000, max: 1893456000000 }).map((ts) => new Date(ts).toISOString()),
});

const REQUIRED_ALL_FIELDS = [
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

describe('Property 12: Admin Sees All Leads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /leads from authenticated admin returns all leads with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbLead, { minLength: 0, maxLength: 20 }),
        async (allLeads) => {
          mockLeadFindMany.mockResolvedValue(allLeads);

          const adminToken = signAccessToken({ id: crypto.randomUUID(), role: 'admin' });

          const res = await request(app)
            .get('/leads')
            .set('Authorization', `Bearer ${adminToken}`);

          expect(res.status).toBe(200);
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBe(allLeads.length);

          for (const lead of res.body) {
            for (const field of REQUIRED_ALL_FIELDS) {
              expect(lead).toHaveProperty(field);
            }
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});
