import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AppError, errorHandler } from './errors.js';

// ---------------------------------------------------------------------------
// AppError
// ---------------------------------------------------------------------------

describe('AppError', () => {
  test('is an instance of Error', () => {
    const err = new AppError('Not found', 404);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  test('stores message and statusCode', () => {
    const err = new AppError('Unauthorized', 401);
    expect(err.message).toBe('Unauthorized');
    expect(err.statusCode).toBe(401);
  });

  test('works across a range of status codes', () => {
    const cases = [
      [400, 'Bad request'],
      [401, 'Unauthorized'],
      [403, 'Forbidden'],
      [404, 'Not found'],
      [409, 'Conflict'],
    ];
    for (const [code, msg] of cases) {
      const err = new AppError(msg, code);
      expect(err.statusCode).toBe(code);
      expect(err.message).toBe(msg);
    }
  });
});

// ---------------------------------------------------------------------------
// errorHandler — minimal mock helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock res object that captures the response. */
function makeRes() {
  const res = { _status: null, _body: null };
  res.status = (code) => { res._status = code; return res; };
  res.json = (body) => { res._body = body; return res; };
  return res;
}

const req = {};   // errorHandler doesn't read req
const next = () => {}; // not called by errorHandler

describe('errorHandler — AppError path', () => {
  test('returns the AppError statusCode and message', () => {
    const res = makeRes();
    errorHandler(new AppError('Lead not found.', 404), req, res, next);
    expect(res._status).toBe(404);
    expect(res._body).toEqual({ error: 'Lead not found.' });
  });

  test('returns 401 with the correct message', () => {
    const res = makeRes();
    errorHandler(new AppError('Invalid or expired access token.', 401), req, res, next);
    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: 'Invalid or expired access token.' });
  });

  test('response body never contains a stack trace', () => {
    const res = makeRes();
    errorHandler(new AppError('Forbidden.', 403), req, res, next);
    expect(res._body.stack).toBeUndefined();
  });
});

describe('errorHandler — unknown error path', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('returns 500 with a generic message', () => {
    const res = makeRes();
    errorHandler(new Error('DB exploded'), req, res, next);
    expect(res._status).toBe(500);
    expect(res._body).toEqual({ error: 'An unexpected error occurred.' });
  });

  test('does not expose the original error message to the client', () => {
    const res = makeRes();
    errorHandler(new Error('Sensitive internal detail'), req, res, next);
    expect(JSON.stringify(res._body)).not.toContain('Sensitive internal detail');
  });

  test('logs the error server-side', () => {
    const res = makeRes();
    const err = new Error('some failure');
    errorHandler(err, req, res, next);
    expect(consoleSpy).toHaveBeenCalledWith(err);
  });

  test('plain objects (non-Error) are also caught and return 500', () => {
    const res = makeRes();
    errorHandler({ weird: 'object' }, req, res, next);
    expect(res._status).toBe(500);
    expect(res._body).toEqual({ error: 'An unexpected error occurred.' });
  });
});
