import dotenv from 'dotenv';
dotenv.config();

const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

export const env = {
  databaseUrl:      process.env.DATABASE_URL,
  jwtAccessSecret:  process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtAccessExpiry:  '15m',
  jwtRefreshExpiry: '7d',
  port:             process.env.PORT || 3000,
  nodeEnv:          process.env.NODE_ENV || 'development',
};
