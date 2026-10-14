import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Use process.env directly so `prisma generate` (which doesn't need a DB)
    // doesn't fail when DATABASE_URL is not set in CI/build environments.
    url: process.env.DATABASE_URL ?? '',
  },
});
