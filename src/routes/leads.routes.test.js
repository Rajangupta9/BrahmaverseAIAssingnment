import { jest } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';

const mockLeadCreate = jest.fn();
const mockLeadFindMany = jest.fn();
const mockLeadFindUnique = jest.fn();
const mockLeadUpdate = jest.fn();
const mockUserFindUnique = jest.fn();

jest.unstable_mockModule('../prisma/client.js', () => ({
  default: {
    lead: {
      create: mockLeadCreate,
      findMany: mockLeadFindMany,
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

describe('Leads HTTP Routes', () => {
  const counselorId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const counselorToken = signAccessToken({ id: counselorId, role: 'counselor' });
  const adminToken = signAccessToken({ id: adminId, role: 'admin' });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /leads/submit', () => {
    it('returns 201 with lead id on valid submission', async () => {
      mockLeadCreate.mockResolvedValue({ id: 'new-lead-id' });

      const res = await request(app)
        .post('/leads/submit')
        .send({
          name: 'Bob',
          email: 'bob@example.com',
          courseInterest: 'AI & ML',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('new-lead-id');
      expect(res.body.message).toBe('Lead submitted successfully.');
    });

    it('returns 400 when missing required fields', async () => {
      const res = await request(app)
        .post('/leads/submit')
        .send({
          name: 'Bob',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed.');
    });
  });

  describe('GET /leads/unclaimed', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/leads/unclaimed');
      expect(res.status).toBe(401);
    });

    it('returns 200 with list of unclaimed leads', async () => {
      mockLeadFindMany.mockResolvedValue([
        {
          id: 'lead-1',
          name: 'Lead One',
          email: 'one@example.com',
          courseInterest: 'Data Science',
          source: 'online',
          status: 'unclaimed',
        },
      ]);

      const res = await request(app)
        .get('/leads/unclaimed')
        .set('Authorization', `Bearer ${counselorToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
    });
  });

  describe('PATCH /leads/:id/claim', () => {
    it('returns 404 when lead is not found', async () => {
      mockLeadFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .patch(`/leads/${crypto.randomUUID()}/claim`)
        .set('Authorization', `Bearer ${counselorToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Lead not found.');
    });

    it('returns 409 when lead is already claimed', async () => {
      mockLeadFindUnique.mockResolvedValue({
        id: 'claimed-lead',
        status: 'claimed',
      });

      const res = await request(app)
        .patch('/leads/claimed-lead/claim')
        .set('Authorization', `Bearer ${counselorToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Lead is already claimed.');
    });

    it('returns 200 with updated lead when claimed successfully', async () => {
      const leadId = crypto.randomUUID();
      mockLeadFindUnique.mockResolvedValue({
        id: leadId,
        status: 'unclaimed',
      });
      mockLeadUpdate.mockResolvedValue({
        id: leadId,
        status: 'claimed',
        counselorId,
      });

      const res = await request(app)
        .patch(`/leads/${leadId}/claim`)
        .set('Authorization', `Bearer ${counselorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('claimed');
      expect(res.body.counselorId).toBe(counselorId);
    });
  });

  describe('GET /leads/my', () => {
    it('returns 200 with claimed leads for authenticated user', async () => {
      mockLeadFindMany.mockResolvedValue([
        {
          id: 'lead-mine',
          counselorId,
          status: 'claimed',
        },
      ]);

      const res = await request(app)
        .get('/leads/my')
        .set('Authorization', `Bearer ${counselorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].counselorId).toBe(counselorId);
    });
  });

  describe('POST /leads', () => {
    it('returns 201 with counselor-created lead', async () => {
      mockLeadCreate.mockResolvedValue({
        id: 'new-counselor-lead',
        name: 'Charlie',
        email: 'charlie@example.com',
        courseInterest: 'DevOps',
        source: 'counselor',
        status: 'claimed',
        counselorId,
      });

      const res = await request(app)
        .post('/leads')
        .set('Authorization', `Bearer ${counselorToken}`)
        .send({
          name: 'Charlie',
          email: 'charlie@example.com',
          courseInterest: 'DevOps',
        });

      expect(res.status).toBe(201);
      expect(res.body.source).toBe('counselor');
      expect(res.body.status).toBe('claimed');
      expect(res.body.counselorId).toBe(counselorId);
    });
  });

  describe('GET /leads', () => {
    it('returns 403 for non-admin user', async () => {
      const res = await request(app)
        .get('/leads')
        .set('Authorization', `Bearer ${counselorToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 200 with all leads for admin user', async () => {
      mockLeadFindMany.mockResolvedValue([
        { id: '1', status: 'unclaimed' },
        { id: '2', status: 'claimed' },
      ]);

      const res = await request(app)
        .get('/leads')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });
  });

  describe('PATCH /leads/:id/reassign', () => {
    const leadId = crypto.randomUUID();
    const targetCounselorId = crypto.randomUUID();

    it('returns 403 for non-admin user', async () => {
      const res = await request(app)
        .patch(`/leads/${leadId}/reassign`)
        .set('Authorization', `Bearer ${counselorToken}`)
        .send({ counselorId: targetCounselorId });

      expect(res.status).toBe(403);
    });

    it('returns 404 when lead is not found', async () => {
      mockLeadFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .patch(`/leads/${leadId}/reassign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ counselorId: targetCounselorId });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Lead not found.');
    });

    it('returns 404 when target counselor is not found', async () => {
      mockLeadFindUnique.mockResolvedValue({ id: leadId, status: 'claimed' });
      mockUserFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .patch(`/leads/${leadId}/reassign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ counselorId: targetCounselorId });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Counselor not found.');
    });

    it('returns 200 and reassigns lead when valid', async () => {
      mockLeadFindUnique.mockResolvedValue({ id: leadId, status: 'claimed' });
      mockUserFindUnique.mockResolvedValue({ id: targetCounselorId, role: 'counselor' });
      mockLeadUpdate.mockResolvedValue({
        id: leadId,
        counselorId: targetCounselorId,
        status: 'claimed',
      });

      const res = await request(app)
        .patch(`/leads/${leadId}/reassign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ counselorId: targetCounselorId });

      expect(res.status).toBe(200);
      expect(res.body.counselorId).toBe(targetCounselorId);
      expect(res.body.status).toBe('claimed');
    });
  });
});
