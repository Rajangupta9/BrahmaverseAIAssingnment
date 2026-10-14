import { jest } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcrypt';

const mockUserFindUnique = jest.fn();
const mockUserCreate = jest.fn();
const mockRefreshTokenCreate = jest.fn();
const mockRefreshTokenFindUnique = jest.fn();
const mockRefreshTokenUpdateMany = jest.fn();

jest.unstable_mockModule('../prisma/client.js', () => ({
  default: {
    user: {
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
    },
    refreshToken: {
      create: mockRefreshTokenCreate,
      findUnique: mockRefreshTokenFindUnique,
      updateMany: mockRefreshTokenUpdateMany,
    },
  },
}));

const { default: app } = await import('../app.js');
const { signAccessToken } = await import('../utils/jwt.js');

describe('Auth HTTP Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    it('returns 201 on successful registration', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({
        id: 'user-uuid-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'counselor',
        createdAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'password123',
          role: 'counselor',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('User registered successfully.');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('jane@example.com');
    });

    it('returns 409 when email is already registered', async () => {
      mockUserFindUnique.mockResolvedValue({ id: 'existing-id' });

      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'existing@example.com',
          password: 'password123',
          role: 'counselor',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Email is already registered.');
    });

    it('returns 400 when missing required fields', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          email: 'jane@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed.');
    });
  });

  describe('POST /auth/login', () => {
    it('returns 200 with accessToken and refreshToken for valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      mockUserFindUnique.mockResolvedValue({
        id: 'user-uuid-1',
        email: 'jane@example.com',
        password: hashedPassword,
        role: 'counselor',
      });
      mockRefreshTokenCreate.mockResolvedValue({});

      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'jane@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it('returns 401 for incorrect password', async () => {
      const hashedPassword = await bcrypt.hash('different-pwd', 10);
      mockUserFindUnique.mockResolvedValue({
        id: 'user-uuid-1',
        email: 'jane@example.com',
        password: hashedPassword,
        role: 'counselor',
      });

      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'jane@example.com',
          password: 'wrongpassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials.');
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns 200 with new accessToken for valid refresh token', async () => {
      mockRefreshTokenFindUnique.mockResolvedValue({
        token: 'valid-token',
        userId: 'user-uuid-1',
        invalidated: false,
        expiresAt: new Date(Date.now() + 1000000),
      });
      mockUserFindUnique.mockResolvedValue({
        id: 'user-uuid-1',
        role: 'counselor',
      });

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'valid-token' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
    });

    it('returns 401 if refresh token is invalidated', async () => {
      mockRefreshTokenFindUnique.mockResolvedValue({
        token: 'invalidated-token',
        userId: 'user-uuid-1',
        invalidated: true,
        expiresAt: new Date(Date.now() + 1000000),
      });

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'invalidated-token' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired refresh token.');
    });
  });

  describe('POST /auth/logout', () => {
    it('returns 200 and invalidates refresh tokens when authenticated', async () => {
      const token = signAccessToken({ id: 'user-uuid-1', role: 'counselor' });
      mockRefreshTokenUpdateMany.mockResolvedValue({ count: 1 });

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out successfully.');
      expect(mockRefreshTokenUpdateMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1', invalidated: false },
        data: { invalidated: true },
      });
    });

    it('returns 401 if Authorization header is missing', async () => {
      const res = await request(app).post('/auth/logout');
      expect(res.status).toBe(401);
    });
  });
});
