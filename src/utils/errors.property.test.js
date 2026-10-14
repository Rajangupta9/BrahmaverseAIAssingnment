/**
 * Property 18: All Error Responses Are JSON with an Error Field
 *
 * For any request to any endpoint that results in a 4xx or 5xx HTTP response,
 * the response body SHALL be valid JSON containing at minimum an "error" field
 * with a human-readable string value.
 *
 * Validates: Requirements 14.1, 14.4
 */

import { describe, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import fc from 'fast-check';
import { AppError, errorHandler } from './errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Express app that:
 *  1. Has a single GET /test route which calls `routeHandler`
 *  2. Has the global `errorHandler` registered as the last middleware
 */
function makeTestApp(routeHandler) {
  const app = express();
  app.use(express.json());
  app.get('/test', routeHandler);
  app.use(errorHandler);
  return app;
}

// Arbitrary: 4xx status codes (400-499)
const clientErrorStatus = fc.integer({ min: 400, max: 499 });

// Arbitrary: 5xx status codes (500-599)
const serverErrorStatus = fc.integer({ min: 500, max: 599 });

// Arbitrary: any 4xx or 5xx status code
const errorStatus = fc.oneof(clientErrorStatus, serverErrorStatus);

// Arbitrary: non-empty string for error messages
const nonEmptyString = fc.string({ minLength: 1, maxLength: 200 });

// ---------------------------------------------------------------------------
// Property 18
// ---------------------------------------------------------------------------

describe('Property 18: All Error Responses Are JSON with an Error Field', () => {
  test(
    'AppError with any 4xx status code produces { error: <non-empty-string> }',
    async () => {
      await fc.assert(
        fc.asyncProperty(clientErrorStatus, nonEmptyString, async (statusCode, message) => {
          const app = makeTestApp((_req, _res, next) => {
            next(new AppError(message, statusCode));
          });

          const response = await request(app).get('/test');

          // Status code matches
          expect(response.status).toBe(statusCode);

          // Content-Type is application/json
          expect(response.headers['content-type']).toMatch(/application\/json/);

          // Body has a non-empty "error" string field
          expect(typeof response.body.error).toBe('string');
          expect(response.body.error.length).toBeGreaterThan(0);
        }),
        { numRuns: 50 },
      );
    },
  );

  test(
    'AppError with any 5xx status code produces { error: <non-empty-string> }',
    async () => {
      await fc.assert(
        fc.asyncProperty(serverErrorStatus, nonEmptyString, async (statusCode, message) => {
          const app = makeTestApp((_req, _res, next) => {
            next(new AppError(message, statusCode));
          });

          const response = await request(app).get('/test');

          expect(response.status).toBe(statusCode);
          expect(response.headers['content-type']).toMatch(/application\/json/);
          expect(typeof response.body.error).toBe('string');
          expect(response.body.error.length).toBeGreaterThan(0);
        }),
        { numRuns: 25 },
      );
    },
  );

  test(
    'Unknown (non-AppError) thrown from any route always produces 500 { error: <non-empty-string> }',
    async () => {
      await fc.assert(
        fc.asyncProperty(nonEmptyString, async (internalMessage) => {
          const app = makeTestApp((_req, _res, _next) => {
            throw new Error(internalMessage);
          });

          const response = await request(app).get('/test');

          // Unknown errors MUST be normalised to 500
          expect(response.status).toBe(500);
          expect(response.headers['content-type']).toMatch(/application\/json/);
          expect(typeof response.body.error).toBe('string');
          expect(response.body.error.length).toBeGreaterThan(0);

          // Internal message must NOT be leaked to the client
          expect(response.body.error).toBe('An unexpected error occurred.');
        }),
        { numRuns: 50 },
      );
    },
  );

  test(
    'Error field is always a non-empty string (combined 4xx/5xx AppError scenarios)',
    async () => {
      await fc.assert(
        fc.asyncProperty(errorStatus, nonEmptyString, async (statusCode, message) => {
          const app = makeTestApp((_req, _res, next) => {
            next(new AppError(message, statusCode));
          });

          const response = await request(app).get('/test');

          // The core property: every error response body must satisfy the shape
          expect(response.body).toMatchObject({
            error: expect.any(String),
          });
          expect(response.body.error.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    },
  );
});
