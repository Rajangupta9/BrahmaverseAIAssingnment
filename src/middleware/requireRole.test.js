/**
 * Unit tests for requireRole middleware (src/middleware/requireRole.js)
 * Requirements: 9.1, 9.3, 10.1, 10.5
 */

import { jest } from '@jest/globals';
import { requireRole } from './requireRole.js';
import { AppError } from '../utils/errors.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeReq(role) {
  return role !== undefined ? { user: { id: 'user-1', role } } : { user: undefined };
}

function makeRes() {
  return {};
}

function makeNext() {
  return jest.fn();
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('requireRole middleware', () => {
  describe('role matches — calls next() without error', () => {
    test('admin user accessing admin route passes through', () => {
      const middleware = requireRole('admin');
      const req = makeReq('admin');
      const next = makeNext();

      middleware(req, makeRes(), next);

      expect(next).toHaveBeenCalledWith();
    });

    test('counselor user accessing counselor route passes through', () => {
      const middleware = requireRole('counselor');
      const req = makeReq('counselor');
      const next = makeNext();

      middleware(req, makeRes(), next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('role does not match — calls next(AppError(403))', () => {
    test('counselor accessing admin route gets 403', () => {
      const middleware = requireRole('admin');
      const req = makeReq('counselor');
      const next = makeNext();

      middleware(req, makeRes(), next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
      expect(err.message).toBe('Forbidden: insufficient permissions.');
    });

    test('admin accessing counselor route gets 403', () => {
      const middleware = requireRole('counselor');
      const req = makeReq('admin');
      const next = makeNext();

      middleware(req, makeRes(), next);

      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
    });

    test('no req.user (unauthenticated) gets 403', () => {
      const middleware = requireRole('admin');
      const req = makeReq(undefined);
      const next = makeNext();

      middleware(req, makeRes(), next);

      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
    });

    test('req.user with no role property gets 403', () => {
      const middleware = requireRole('admin');
      const req = { user: { id: 'user-1' } }; // role is undefined
      const next = makeNext();

      middleware(req, makeRes(), next);

      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
    });
  });

  describe('factory returns a fresh middleware per call', () => {
    test('each requireRole call returns an independent function', () => {
      const m1 = requireRole('admin');
      const m2 = requireRole('counselor');
      expect(m1).not.toBe(m2);
    });
  });
});
