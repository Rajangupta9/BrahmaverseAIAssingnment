/**
 * Property 7: Public Lead Submission Creates Unclaimed Online Lead
 *
 * For any valid lead submission to POST /leads/submit (with at minimum
 * name, email, courseInterest), the created lead record SHALL have
 * source = "online" and status = "unclaimed", and the response SHALL be
 * 201 Created with the lead's id.
 *
 * Validates: Requirements 5.3, 5.6
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

const arbValidLead = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  email: fc.emailAddress(),
  courseInterest: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  phone: fc.option(fc.string({ minLength: 5, maxLength: 15 }), { nil: undefined }),
  notes: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
});

describe('Property 7: Public Lead Submission Creates Unclaimed Online Lead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /leads/submit creates unclaimed online lead and returns 201 with id', async () => {
    await fc.assert(
      fc.asyncProperty(arbValidLead, async (leadInput) => {
        const fakeId = crypto.randomUUID();
        mockLeadCreate.mockImplementation(async ({ data, select }) => {
          expect(data.source).toBe('online');
          expect(data.status).toBe('unclaimed');
          expect(data.name).toBe(leadInput.name);
          expect(data.courseInterest).toBe(leadInput.courseInterest);
          return { id: fakeId };
        });

        const res = await request(app)
          .post('/leads/submit')
          .send(leadInput);

        expect(res.status).toBe(201);
        expect(res.body.id).toBe(fakeId);
        expect(res.body.message).toBe('Lead submitted successfully.');
      }),
      { numRuns: 25 },
    );
  });
});
