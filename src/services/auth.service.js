import bcrypt from 'bcrypt';
import { addDays } from 'date-fns';
import crypto from 'crypto';
import prisma from '../prisma/client.js';
import { signAccessToken } from '../utils/jwt.js';
import { AppError } from '../utils/errors.js';

const SALT_ROUNDS = 12;

async function register({ name, email, password, role }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError('Email is already registered.', 409);

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { name, email, password: hashedPassword, role },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  return user;
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError('Invalid credentials.', 401);

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new AppError('Invalid credentials.', 401);

  const tokenPayload = { id: user.id, role: user.role };
  const accessToken = signAccessToken(tokenPayload);
  const rawRefreshToken = crypto.randomBytes(40).toString('hex');
  const expiresAt = addDays(new Date(), 7);

  await prisma.refreshToken.create({
    data: { token: rawRefreshToken, userId: user.id, expiresAt },
  });

  return { accessToken, refreshToken: rawRefreshToken };
}

async function refresh(rawToken) {
  const record = await prisma.refreshToken.findUnique({ where: { token: rawToken } });
  if (!record || record.invalidated || record.expiresAt < new Date()) {
    throw new AppError('Invalid or expired refresh token.', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  const accessToken = signAccessToken({ id: user.id, role: user.role });
  return { accessToken };
}

async function logout(userId) {
  await prisma.refreshToken.updateMany({
    where: { userId, invalidated: false },
    data: { invalidated: true },
  });
}

export const authService = { register, login, refresh, logout };
