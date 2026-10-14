/**
 * Jest setupFiles entry — runs before any test module is evaluated.
 * Sets the minimum environment variables required by src/config/env.js
 * so tests that import JWT utilities (or any module that depends on env.js)
 * do not throw "Missing required env var" errors.
 *
 * Uses a well-known test secret; never use these values outside tests.
 */
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-for-jest';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-jest';
